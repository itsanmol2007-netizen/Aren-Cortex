import { Search, UserCheck, User, Phone, MapPin, Sparkles, Loader2, CalendarDays, Wallet } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { searchPatients, findPatientByPhone, fetchPatientVisitStats, type DBPatient } from "../lib/db";
import type { Gender, Patient } from "../types";
import { ageInYears, dobMattersFor, todayIso } from "../lib/growth/age";
import { useRovingList } from "../hooks/useRovingList";
import { matches } from "../lib/keyboard/keymap";
import {
  computeFee, defaultVisitType, fetchFeeContext, getCachedFeeContext, getFeeSetupStatus, resolveFee,
  type ConfirmedPayment, type FeeContext, type PaymentMethod, type VisitType,
} from "../lib/db/payments";
import { PatientPaymentRail, INITIAL_FEE_STATE, type FeeState } from "./PatientPaymentRail";

type PatientModalProps = {
  onClose: () => void;
  /** `payment` is `undefined`/`null` when this clinic has no fee for the
   *  doctor, or when the modal ran with no `billing` prop at all. */
  onConfirm: (patient: Patient, payment?: ConfirmedPayment | null) => void;
  /**
   * Always passed today (App.tsx) — a solo Cortex practitioner has no front
   * desk to collect money, so THIS modal is where the fee gets decided, same
   * moment the front desk's `CreateVisitModal` decides it for its own intake.
   * The front-desk flow's own manual-register escape hatch (`registerRequested`) is the
   * exact same situation — the doctor doing their own intake, front desk out
   * of the loop by construction whenever this modal is the one open — so it
   * gets the identical rail, not a separate decision. Optional (rather than
   * required) only so a future caller that genuinely has no billing context
   * to offer degrades safely: the wrapper collapses to `display:contents`
   * and every field above behaves exactly as it did before this rail existed.
   */
  billing?: { hospitalId: string; doctorId: string; doctorName: string };
  /**
   * Take the doctor to where a consultation fee is set (the Overview page's
   * fee control). Shown as the "set up your fee" link on the one-line notice
   * that replaces the payment rail when `billing` is present but no fee is
   * configured for this doctor. Omitted → the notice shows without a link.
   */
  onSetupFee?: () => void;
};

const emptyDraft: Patient = { name: "", age: "", gender: "", phone: "", address: "", dateOfBirth: "" };

function dbToUiPatient(p: DBPatient): Patient {
  return { id: p.id, name: p.name, age: String(p.age), gender: p.gender as Gender, phone: p.phone, dateOfBirth: p.date_of_birth ?? "" };
}

export function PatientModal({ onClose, onConfirm, billing, onSetupFee }: PatientModalProps) {
  const [draft, setDraft] = useState<Patient>(emptyDraft);
  const [matchedPatient, setMatchedPatient] = useState<DBPatient | null>(null);
  const [mode, setMode] = useState<"search" | "create">("search");
  // Search mode, fee wired: a result-row click SELECTS the patient (lights up
  // the payment rail) instead of starting the visit outright — the rail's
  // Paid / Not paid buttons are the only way in, so a visit can never be
  // created without that decision. Null in every no-fee flow, where a row
  // click still confirms in one tap.
  const [selectedPatient, setSelectedPatient] = useState<DBPatient | null>(null);

  // ── Fee capture (pure Cortex only — see `billing`'s own doc comment) ────
  //
  // Kept to primitives in dependency arrays throughout this block: `billing`
  // is a fresh object literal every App.tsx render, and depending on it
  // directly would refetch on every keystroke elsewhere in the app.
  const hospitalId = billing?.hospitalId;
  const feeDoctorId = billing?.doctorId;

  const initialFeeCtx = hospitalId ? getCachedFeeContext(hospitalId) : null;
  const initialFeeSetup = (hospitalId && feeDoctorId) ? getFeeSetupStatus(hospitalId, feeDoctorId) : null;

  const [feeCtx, setFeeCtx] = useState<FeeContext | null>(initialFeeCtx);
  // Whether the fee read has finished (resolved OR failed). Synchronously initialized
  // from local cache when available so no-fee doctors land in compact mode on frame 1.
  const [feeCtxSettled, setFeeCtxSettled] = useState<boolean>(() => {
    if (!hospitalId) return true;
    if (initialFeeCtx !== null) return true;
    if (initialFeeSetup === false) return true;
    return false;
  });
  useEffect(() => {
    if (!hospitalId) { setFeeCtxSettled(true); return; }
    let alive = true;
    fetchFeeContext(hospitalId)
      .then((ctx) => { if (alive) setFeeCtx(ctx); })
      // Non-fatal: a doctor must still be able to start a consult when the
      // fee read fails. The rail simply shows no money controls.
      .catch((err) => console.warn("[PatientModal] fetchFeeContext failed (non-fatal):", err))
      .finally(() => { if (alive) setFeeCtxSettled(true); });
    return () => { alive = false; };
  }, [hospitalId]);

  const [fee, setFee] = useState<FeeState>(INITIAL_FEE_STATE);
  // Once the doctor has touched the visit-type toggle themselves, that
  // decision wins over any patient-history default computed below.
  const [feeTouched, setFeeTouched] = useState(false);
  // Surfaced on the rail itself (not a silent block) the moment a doctor
  // tries to confirm a NEW patient with a real fee on the table but neither
  // Collect nor Mark as unpaid pressed yet — "just simply create a patient
  // without asking... confirm if it is paid or not". Existing-patient rows
  // in Search mode stay the one-click flow they always were; this only
  // guards the two actions that are already their own deliberate button
  // (Start consult, Use this patient), not an instant list tap.
  const [paymentError, setPaymentError] = useState(false);
  const handleFeeChange = (next: FeeState) => {
    if (next.visitType !== fee.visitType) setFeeTouched(true);
    if (next.status !== "undecided") setPaymentError(false);
    setFee(next);
  };
  /** `false` (and the rail highlighted) only when there's a real fee on the
   *  table and neither Collect nor Mark as unpaid has been chosen yet. */
  const paymentDecided = () => {
    if (!billing || baseFee === null) return true;
    if (fee.status === "undecided") { setPaymentError(true); return false; }
    return true;
  };

  // Which patients has this modal already looked up visit history for —
  // additive, never cleared, so a patient looked up once (e.g. surfaced by
  // an earlier, narrower search) still has an answer if they reappear.
  const [statsById, setStatsById] = useState<Map<string, { last_visit_at: string | null }>>(new Map());

  const doctorCard = feeCtx?.feesByDoctor.get(feeDoctorId ?? "");
  const baseFee = feeCtx && feeDoctorId ? resolveFee(doctorCard, fee.visitType) : null;
  const breakdown = feeCtx && baseFee !== null
    ? computeFee({
        base: baseFee,
        discountKind: fee.discountKind,
        discountValue: Number(fee.discountValue) || 0,
        gstEnabled: feeCtx.policy.gstEnabled,
        gstPercent: feeCtx.policy.gstPercent,
      })
    : null;

  /**
   * The visit type this modal will actually CHARGE for `patientId`, worked
   * out once at the moment of confirming — never shown speculatively while
   * several search candidates are still on screen (there is no single
   * patient yet to look a default up for). A brand-new patient (`undefined`)
   * or one this modal hasn't fetched history for yet always reads as "new",
   * same as `defaultVisitType`'s own fallback.
   */
  const effectiveVisitType = (patientId: string | undefined): VisitType =>
    feeTouched ? fee.visitType : defaultVisitType(patientId ? statsById.get(patientId)?.last_visit_at : null);

  const buildPayment = (
    patientId: string | undefined,
    /** The Paid / Not-paid decision, passed explicitly from the rail so it
     *  does not depend on `fee.status` having flushed through React state
     *  yet. Omitted → read from `fee.status` (the pre-rail-as-submit path). */
    decision?: { status: "paid" | "unpaid"; method: PaymentMethod | null },
  ): ConfirmedPayment | null => {
    if (!billing || !feeCtx) return null;
    const visitType = effectiveVisitType(patientId);
    const base = resolveFee(doctorCard, visitType);
    if (base === null) return null;
    const finalBreakdown = computeFee({
      base,
      discountKind: fee.discountKind,
      discountValue: Number(fee.discountValue) || 0,
      gstEnabled: feeCtx.policy.gstEnabled,
      gstPercent: feeCtx.policy.gstPercent,
    });
    const status = decision ? decision.status : fee.status;
    const method = decision ? decision.method : fee.method;
    return {
      visitType,
      breakdown: finalBreakdown,
      discountKind: fee.discountKind,
      discountPercent: fee.discountKind === "percent" ? Number(fee.discountValue) || 0 : null,
      gstPercent: feeCtx.policy.gstPercent,
      // "Undecided" saves as pending — the visit starts either way, and an
      // unanswered money question must never be recorded as money collected.
      status: status === "paid" ? "paid" : "pending",
      method: status === "paid" ? method : null,
    };
  };

  /** True when this doctor has a real consultation fee on the table — the
   *  payment rail is shown and its Paid / Not-paid buttons ARE the submit.
   *  False → no rail at all, just the "set up your fee" notice, and the
   *  flow is the plain one-tap confirm it always was. */
  const feeWired = !!billing && feeCtxSettled && baseFee !== null;
  /** `billing` given, fee read still in flight — keep the wide two-column
   *  shell so it doesn't flash narrow then jump wide when the fee resolves. */
  const feeResolving = !!billing && !feeCtxSettled;
  /** The wide layout is live for a real fee AND while we're still finding out. */
  const wideShell = feeWired || feeResolving;

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittingInfo, setSubmittingInfo] = useState<{ title: string; subtitle: string } | null>(null);

  const triggerConfirm = async (patient: Patient, payment?: ConfirmedPayment | null, customTitle?: string) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setSubmittingInfo({
      title: customTitle ?? `Starting visit for ${patient.name || "patient"}...`,
      subtitle: "Registering details & preparing consultation workspace...",
    });
    try {
      await onConfirm(patient, payment);
    } catch (e) {
      setIsSubmitting(false);
    }
  };

  /**
   * The one place a fee-wired visit is actually started: the rail's
   * Collect / Mark-as-unpaid buttons call this with their decision. Resolves
   * whichever patient is in play (a selected search result, the phone-
   * duplicate match, or a valid new-patient draft) and confirms.
   */
  const commitWithPayment = (decision: { status: "paid" | "unpaid"; method: PaymentMethod | null }) => {
    if (isSubmitting) return;
    const existing = selectedPatient ?? matchedPatient;
    if (existing) {
      triggerConfirm(
        dbToUiPatient(existing),
        buildPayment(existing.id, decision),
        `Starting visit for ${existing.name}...`
      );
      return;
    }
    if (mode === "create" && isFormValid && !matchedPatient) {
      const trimmedName = draft.name.trim();
      triggerConfirm(
        { ...draft, name: trimmedName, phone: draft.phone.trim() },
        buildPayment(undefined, decision),
        `Creating patient record for ${trimmedName}...`
      );
    }
  };

  // Search mode state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<DBPatient[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");

  // Phone duplicate check state
  const [phoneCheckLoading, setPhoneCheckLoading] = useState(false);

  // ── The keyboard path through intake ────────────────────────────────────
  //
  // This modal opens on every consult and is the first thing between the
  // doctor and the patient in front of them, so it is the one surface where a
  // mouse reach costs the most. The flow Anmol described is exactly the one
  // wired below: type a name, the matches appear, walk them, press Enter.
  //
  // The result rows ARE buttons, so the roving cursor's row selector and its
  // action selector are the same element — `activate()` clicks the row itself
  // and the existing onClick starts the consult. No new handler, no second
  // path to keep in step with the mouse one.
  const listRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLDivElement>(null);
  const roving = useRovingList({
    containerRef: listRef,
    rowSelector: ".pm-match-row",
    actionSelector: ".pm-match-row",
    enabled: mode === "search",
  });

  // A fresh query is a fresh list; leaving the cursor on row 3 of the previous
  // one would put Enter on a patient who is no longer on screen. Same reason to
  // drop a `selectedPatient` that a narrowed search no longer contains.
  useEffect(() => {
    roving.clear();
    setSelectedPatient((s) => (s && searchResults.some((r) => r.id === s.id) ? s : null));
  }, [searchResults, roving]);

  // Switching tabs abandons a half-made pick.
  useEffect(() => { setSelectedPatient(null); }, [mode]);

  // A row picked while the fee read was still in flight, which then came back
  // "no fee": there is no rail to press, so the pick IS the confirm.
  useEffect(() => {
    if (feeCtxSettled && !feeWired && selectedPatient) {
      onConfirm(dbToUiPatient(selectedPatient), null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feeCtxSettled, feeWired, selectedPatient]);

  // Focus follows the mode, both ways. Switching to the form with Alt+N and
  // landing on nothing would make the shortcut feel broken even though it
  // worked; `autoFocus` only fires on the first mount, so it cannot do this.
  useEffect(() => {
    const t = window.setTimeout(() => {
      if (mode === "search") searchInputRef.current?.focus();
      else formRef.current?.querySelector<HTMLElement>("input, select")?.focus();
    }, 0);
    return () => window.clearTimeout(t);
  }, [mode]);

  /**
   * Enter walks the form.
   *
   * Seven fields is seven Tabs, and a doctor who has just typed a name expects
   * Enter to mean "next" — in every paper form and every till in the country
   * it does. On the last field, or as soon as the form is valid and the
   * remaining fields are optional, it submits instead.
   *
   * Deliberately NOT a `<form onSubmit>`: this modal renders inside the app
   * shell rather than a form element, and turning it into one would put a
   * native submit (and a full page reload on any stray button without
   * `type="button"`) between the doctor and the consult.
   */
  const advance = (e: React.KeyboardEvent<HTMLElement>) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const fields = Array.from(
      formRef.current?.querySelectorAll<HTMLElement>("input, select") ?? []
    );
    const i = fields.indexOf(e.currentTarget as HTMLElement);
    const next = fields[i + 1];
    if (next) { next.focus(); return; }
    // Off the end of the form. When the phone matched somebody the form has
    // ALREADY collapsed to the duplicate card — address is unmounted, so the
    // phone field is the last one — and the primary action on that card is
    // "Use this patient", not "create a second record with the same number".
    // Falling through to handleConfirm here would quietly mint the duplicate
    // the card exists to prevent.
    if (matchedPatient) {
      if (!paymentDecided()) return;
      onConfirm(dbToUiPatient(matchedPatient), buildPayment(matchedPatient.id));
      return;
    }
    handleConfirm();
  };

  // Alt+N / Alt+F switch modes, and Escape leaves. Bound on the card rather
  // than the window so the sheet cannot swallow keys once it has closed.
  const onCardKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (matches(e, "patientNew")) {
      e.preventDefault();
      setMode("create");
      return;
    }
    if (matches(e, "patientSearch")) {
      e.preventDefault();
      setMode("search");
      return;
    }
    if (e.key === "Escape") {
      // `onClose` is a no-op while there is no patient yet — intake is
      // mandatory, not dismissable — so this is safe to call unconditionally.
      e.preventDefault();
      onClose();
    }
  };

  // Live search — 300ms debounce
  useEffect(() => {
    if (searchQuery.trim().length < 2) {
      setSearchResults([]);
      setSearchError("");
      return;
    }
    setSearchLoading(true);
    setSearchError("");
    const timer = setTimeout(async () => {
      try {
        const results = await searchPatients(searchQuery.trim());
        setSearchResults(results);
      } catch (err: any) {
        setSearchError("Search failed. Check connection.");
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Batched visit-history lookup for whatever the search box is currently
  // showing — so confirming ANY one of these rows already knows whether to
  // default to "New visit" or "Follow-up" the instant it's clicked, with no
  // second round trip in between. Skipped entirely outside pure Cortex
  // (`hospitalId` undefined) — no billing, nothing to default.
  useEffect(() => {
    if (!hospitalId || searchResults.length === 0) return;
    let cancelled = false;
    fetchPatientVisitStats(searchResults.map((r) => r.id))
      .then((m) => { if (!cancelled) setStatsById((prev) => new Map([...prev, ...m])); })
      .catch(() => { /* best-effort default only — a miss just means "new" */ });
    return () => { cancelled = true; };
  }, [hospitalId, searchResults]);

  // Phone change — strip non-digits, check duplicate at 10 digits
  const handlePhoneChange = async (raw: string) => {
    const digits = raw.replace(/\D/g, "").slice(0, 10);
    setDraft((d) => ({ ...d, phone: digits }));
    setMatchedPatient(null);
    if (digits.length === 10) {
      setPhoneCheckLoading(true);
      try {
        const existing = await findPatientByPhone(digits);
        if (existing) {
          setMatchedPatient(existing);
          // Same default-lookup as the search list, for the one specific
          // patient this duplicate check just identified.
          if (hospitalId) {
            fetchPatientVisitStats([existing.id])
              .then((m) => setStatsById((prev) => new Map([...prev, ...m])))
              .catch(() => {});
          }
        }
      } catch {
        // non-fatal — just skip duplicate check
      } finally {
        setPhoneCheckLoading(false);
      }
    }
  };

  const handleConfirm = () => {
    if (isSubmitting) return;
    const name = draft.name.trim();
    const phone = draft.phone.trim();
    if (!name || !phone || !draft.gender) return;
    // Fee wired (or still finding out): there is no "create" button — the
    // rail's Paid / Not paid buttons are the only way in. An Enter off the
    // end of the form nudges that rather than slipping a visit through
    // undecided.
    if (feeWired) { setPaymentError(true); return; }
    if (feeResolving) return;
    if (!paymentDecided()) return;
    // Only reachable with no `matchedPatient` (that branch has its own "Use
    // this patient" action) — always a genuinely new patient, so there is no
    // history to default a visit type from.
    triggerConfirm(
      { ...draft, name, phone },
      buildPayment(undefined),
      `Creating patient record for ${name}...`
    );
  };

  const isFormValid = draft.name.trim() && draft.phone.length === 10 && draft.gender;

  // What PatientPaymentRail locks on — no real patient to attach a fee
  // decision to yet. 2026-09-08, from Anmol's screenshot of "Search
  // existing" with nothing typed and the rail already showing a confirmed-
  // looking "Will collect ₹472": *"why the fuck is this still possible?"*
  // A patient becomes real here either by being matched (the phone-duplicate
  // card) or by the new-patient form's own required fields being filled —
  // exactly `isFormValid`'s definition, not a second one. Plain search mode
  // has no such context at all: a result row confirms in one click and was
  // never gated on this rail (see `paymentError`'s own doc comment above),
  // so there is nothing here to unlock it for.
  const railMissing: string[] = [];
  if (mode === "search") {
    // Unlocked once a result row is picked — the rail's buttons then start
    // the visit for that patient.
    if (!selectedPatient) railMissing.push("a patient");
  } else if (!matchedPatient) {
    if (!draft.name.trim()) railMissing.push("name");
    if (draft.phone.length !== 10) railMissing.push("phone number");
    if (!draft.gender) railMissing.push("sex");
  }
  const railLockReason = railMissing.length === 0
    ? undefined
    : mode === "search"
      ? "Pick a patient from the results to continue."
      : `Add the patient's ${railMissing.join(", ")} to continue.`;

  return (
    <div className="pm-overlay" role="dialog" aria-modal="true" aria-label="Patient intake">
      <button className="pm-backdrop" type="button" onClick={onClose} aria-label="Close" />

      {/* ONE card, always — never two. `billing` only widens this SAME card
          and adds a second column inside it (see PatientPaymentRail's own
          header comment for the version that got this wrong: an independent
          floating card that read as unrelated to this one, wrapped below the
          modal on anything less than a very wide window, and silently ate
          clicks wherever the two happened to overlap). The inline `style`
          below is deliberate, not a Tailwind class: `.pm-card` is legacy,
          UNLAYERED CSS (`components-modals.css`) that beats any Tailwind
          utility regardless of source order — an inline style is the one
          thing guaranteed to win over it. */}
      <div
        className="pm-card"
        onKeyDown={onCardKeyDown}
        style={wideShell ? { width: "min(760px, 96vw)", height: "min(576px, 90vh)", display: "flex", flexDirection: "column", overflow: "hidden" } : undefined}
      >
        <div className="pm-top-stripe" />

        {/* Header — no close button: patient intake is mandatory, not dismissable */}
        <div className="pm-header shrink-0">
          <div className="pm-header-left">
            <div className="pm-header-icon"><Sparkles size={14} /></div>
            <div>
              <p className="pm-eyebrow">Patient intake</p>
              <h3 className="pm-title">Find or create patient</h3>
            </div>
          </div>
        </div>

        {/* `contents` when there's no billing: both children below fall
            back to being direct children of `.pm-card`, exactly as before
            this rail existed. A real two-column grid only exists once
            there's a second column to divide from the first. */}
        <div className={wideShell
          ? "grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_252px] overflow-hidden max-[680px]:grid-cols-1"
          : "contents"}
        >
        <div className={wideShell ? "flex min-h-0 flex-col overflow-hidden" : "contents"}>
        {/* Mode toggle — pinned at the top so it never scrolls out of view */}
        <div className="pm-toggle shrink-0">
          <button type="button" className={`pm-toggle-btn ${mode === "search" ? "active" : ""}`} onClick={() => setMode("search")}>
            Search existing
          </button>
          <button type="button" className={`pm-toggle-btn ${mode === "create" ? "active" : ""}`} onClick={() => setMode("create")}>
            New patient
          </button>
        </div>

        <div className={wideShell ? "flex flex-1 min-h-0 flex-col overflow-y-auto pb-[14px]" : "contents"}>

        {/* Fee wired for this clinic but not for this doctor: no payment
            controls at all, just a nudge to set one up. The visit still
            starts normally (the RPC writes nothing when there is no fee).
            Waits for the fee read to settle so it never flashes at a doctor
            who does have a fee. */}
        {!!billing && feeCtxSettled && baseFee === null && (
          <div className="mx-[20px] mt-[12px] flex items-start gap-[8px] rounded-[10px] bg-black/[0.03] px-[11px] py-[9px] text-[12px] leading-[1.45] text-[#64748b]">
            <Wallet size={14} className="mt-[1px] shrink-0 text-[#94a3b8]" />
            <span>
              No consultation fee set for you yet.{" "}
              {onSetupFee
                ? <button type="button" onClick={onSetupFee} className="cursor-pointer border-0 bg-transparent p-0 font-semibold text-[#a855f7] underline underline-offset-2 hover:text-[#7c3aed]">Set up your fee →</button>
                : <span className="text-[#94a3b8]">Ask your clinic admin to add one.</span>}
            </span>
          </div>
        )}

        {/* ── SEARCH MODE ── */}
        {/* `flex-1 min-h-0` alongside the legacy class (no property clash —
            `.pm-section` never declares its own `flex-grow`) so the idle
            illustration below can actually center in the space "New
            patient"'s form fills naturally, instead of sitting flush under
            the search box with a dead gap under IT. */}
        {mode === "search" && (
          <div key="search" className="pm-section flex-1 min-h-0 pm-tab-content">
            <div className="pm-search-box">
              {searchLoading
                ? <Loader2 size={14} className="pm-search-icon pm-spin" />
                : <Search size={14} className="pm-search-icon" />
              }
              <input
                ref={searchInputRef}
                autoFocus
                value={searchQuery}
                placeholder="Search by name or phone number…"
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pm-search-input"
                // ↓/↑ and Enter never leave the field. The doctor keeps
                // typing to narrow, walks the matches, and takes one —
                // all without the caret going anywhere, so a name that
                // matched three patients can be refined without a click.
                //
                // Tab does the same as ↓ here, and only here: Anmol's own
                // description of this flow was "write the name, the patient
                // appears, click tab and that patient is selected, then
                // enter". Tab into a result list is not how the rest of the
                // app moves, but it is what this modal was described as
                // doing, and it costs nothing — there is no other focusable
                // thing between this field and the list.
                onKeyDown={(e) => {
                  if (matches(e, "patientMove") || (e.key === "Tab" && !e.shiftKey && searchResults.length > 0)) {
                    e.preventDefault();
                    e.stopPropagation();
                    roving.move(e.key === "ArrowUp" ? -1 : 1);
                    return;
                  }
                  if (matches(e, "patientPick")) {
                    e.preventDefault();
                    e.stopPropagation();
                    // Enter with nothing highlighted takes the top match,
                    // which is what a doctor who typed a full phone number
                    // and stopped means by it.
                    if (!roving.activate()) {
                      roving.rows()[0]?.click();
                    }
                  }
                }}
              />
            </div>

            {searchError && (
              <p className="pm-no-results" style={{ color: "#f87171" }}>{searchError}</p>
            )}

            {/* The idle state — nothing typed yet. Search mode used to leave
                this genuinely blank (a tall white gap under the box, most
                noticeable beside "New patient"'s form filling the same
                card), which read as unfinished rather than as "type to
                search". Tailwind, not a new `.pm-*` class — new surface. */}
            {!searchError && searchQuery.trim().length < 2 && (
              <div className="flex flex-1 flex-col items-center justify-center gap-[10px] px-[24px] py-[28px] text-center">
                <div className="grid h-[72px] w-[72px] shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#fce7f3] to-[#ede9fe]">
                  <Search size={28} className="text-[#a855f7]" strokeWidth={1.75} />
                </div>
                <strong className="text-[14px] font-bold text-[#0f172a]">Find a patient</strong>
                <span className="max-w-[30ch] text-[12.5px] leading-[1.55] text-[#64748b]">
                  Type a name or phone number above to search your records.
                </span>
              </div>
            )}

            {!searchLoading && searchQuery.length >= 2 && searchResults.length === 0 && !searchError && (
              <p className="pm-no-results">
                No patient found.{" "}
                <button type="button" className="pm-link-btn" onClick={() => setMode("create")}>
                  Create new patient →
                </button>
              </p>
            )}

            {searchResults.length > 0 && (
              <div className="pm-match-list" ref={listRef}>
                {searchResults.map((p) => {
                  const picked = feeWired && selectedPatient?.id === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      className="pm-match-row"
                      aria-pressed={feeWired ? picked : undefined}
                      style={picked ? { borderColor: "#a855f7", background: "#faf5ff" } : undefined}
                      onClick={() => {
                        if (isSubmitting) return;
                        // Fee wired → pick the patient and let the rail's
                        // Paid / Not paid buttons start the visit. No fee →
                        // nothing to decide, confirm in one tap as before.
                        // Still resolving the fee → treat as "pick", the rail
                        // (or its absence) sorts itself out a beat later.
                        if (feeWired || feeResolving) setSelectedPatient(p);
                        else triggerConfirm(dbToUiPatient(p), buildPayment(p.id), `Starting visit for ${p.name}...`);
                      }}
                    >
                      <div className="pm-avatar">
                        {p.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                      </div>
                      <div className="pm-match-info">
                        <strong>{p.name}</strong>
                        <span>{p.age}y · {p.gender} · +91 {p.phone}</span>
                      </div>
                      <UserCheck size={14} className="pm-match-check" />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── CREATE MODE ── */}
        {mode === "create" && (
          <div key="create" className="pm-section pm-tab-content" ref={formRef}>

            <div className="pm-field">
              <label className="pm-label">
                <User size={12} className="pm-label-icon" />
                Full name <span className="pm-required">*</span>
              </label>
              <input
                autoFocus
                className="pm-input"
                value={draft.name}
                placeholder="Patient's full name"
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                onKeyDown={advance}
              />
            </div>

            <div className="pm-row-two">
              <div className="pm-field">
                <label className="pm-label">Age <span className="pm-required">*</span></label>
                <input
                  className="pm-input"
                  inputMode="numeric"
                  maxLength={3}
                  value={draft.age}
                  placeholder="e.g. 34"
                  onChange={(e) => setDraft((d) => ({ ...d, age: e.target.value.replace(/\D/g, "") }))}
                  onKeyDown={advance}
                />
              </div>
              <div className="pm-field">
                <label className="pm-label">Sex <span className="pm-required">*</span></label>
                <select
                  className="pm-input pm-select"
                  value={draft.gender}
                  onChange={(e) => setDraft((d) => ({ ...d, gender: e.target.value as Gender }))}
                  // A native select already owns ↑↓ and Space to open, so
                  // Enter is the only key left to mean "next" — which is
                  // also the only thing a doctor tries after typing "M".
                  onKeyDown={advance}
                >
                  <option value="">Select</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>

            {/* Date of birth — optional for everyone, and marked as NEEDED
                once the age entered says this is a child. WHO's growth
                standards are indexed per month, so for an under-five the
                integer age above is not precise enough to place them on a
                growth curve at all; above five it changes nothing and the
                field stays quiet. A prompt that fires on every adult is one
                receptionists stop reading. */}
            <div className="pm-field">
              <label className="pm-label">
                <CalendarDays size={12} className="pm-label-icon" />
                Date of birth{" "}
                {dobMattersFor(Number.parseInt(draft.age, 10))
                  ? <span className="pm-dob-needed">needed for growth charts</span>
                  : <span className="pm-optional">OPTIONAL</span>}
              </label>
              <input
                className={`pm-input${dobMattersFor(Number.parseInt(draft.age, 10)) && !draft.dateOfBirth ? " pm-input-wanted" : ""}`}
                type="date"
                max={todayIso()}
                value={draft.dateOfBirth ?? ""}
                onChange={(e) => {
                  const dob = e.target.value;
                  // The date is the harder fact, so the age field FOLLOWS it
                  // rather than being asked for twice and allowed to drift.
                  const derived = ageInYears(dob);
                  setDraft((d) => ({
                    ...d,
                    dateOfBirth: dob,
                    age: derived === null ? d.age : String(derived),
                  }));
                }}
                onKeyDown={advance}
              />
            </div>

            <div className="pm-field">
              <label className="pm-label">
                <Phone size={12} className="pm-label-icon" />
                Phone number <span className="pm-required">*</span>
              </label>
              <div className="pm-phone-row">
                <span className="pm-phone-prefix">+91</span>
                <input
                  className="pm-input pm-phone-input"
                  inputMode="tel"
                  maxLength={10}
                  value={draft.phone}
                  placeholder="10-digit mobile"
                  onChange={(e) => handlePhoneChange(e.target.value)}
                  onKeyDown={advance}
                />
                {phoneCheckLoading && <Loader2 size={13} className="pm-spin" style={{ color: "#6b7280", marginLeft: 6 }} />}
              </div>
            </div>

            {/* Duplicate warning */}
            {matchedPatient && (
              <div className="pm-duplicate-card">
                <p className="pm-duplicate-label">⚠ Patient already exists</p>
                <div className="pm-duplicate-row">
                  <div className="pm-avatar pm-avatar-warn">
                    {matchedPatient.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                  </div>
                  <div className="pm-match-info">
                    <strong>{matchedPatient.name}</strong>
                    <span>{matchedPatient.age}y · {matchedPatient.gender} · +91 {matchedPatient.phone}</span>
                  </div>
                </div>
                <div className="pm-duplicate-actions">
                  {feeWired ? (
                    // The rail's Paid / Not paid buttons start the visit for
                    // this matched patient — no separate confirm to slip past.
                    <span className="text-[11.5px] font-medium leading-[1.4] text-[#64748b]">
                      Mark this visit paid or unpaid on the right to continue with them.
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="pm-btn-primary"
                      onClick={() => {
                        if (isSubmitting) return;
                        if (!paymentDecided()) return;
                        triggerConfirm(
                          dbToUiPatient(matchedPatient),
                          buildPayment(matchedPatient.id),
                          `Starting visit for ${matchedPatient.name}...`
                        );
                      }}
                    >
                      Use this patient
                    </button>
                  )}
                  <button type="button" className="pm-btn-ghost" onClick={() => setMatchedPatient(null)}>
                    Create new anyway
                  </button>
                </div>
              </div>
            )}

            {!matchedPatient && (
              <>
                <div className="pm-field">
                  <label className="pm-label">
                    <MapPin size={12} className="pm-label-icon" />
                    Address <span className="pm-optional">optional</span>
                  </label>
                  <input
                    className="pm-input"
                    value={draft.address ?? ""}
                    placeholder="Street, locality, city"
                    onChange={(e) => setDraft((d) => ({ ...d, address: e.target.value }))}
                    onKeyDown={advance}
                  />
                </div>
                {!feeWired && (
                  <div className="pm-actions">
                    <button type="button" className="pm-btn-ghost" onClick={onClose}>Cancel</button>
                    <button type="button" className="pm-btn-primary" disabled={!isFormValid || isSubmitting} onClick={handleConfirm}>
                      Start consult →
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}
        </div>
        </div>

        {wideShell && billing && (
          <div className="flex min-h-0 flex-col overflow-y-auto border-l border-black/10 bg-[#fbfaff] p-[14px] max-[680px]:border-l-0 max-[680px]:border-t">
            {feeWired ? (
              <PatientPaymentRail
                state={fee}
                onChange={handleFeeChange}
                onCommit={commitWithPayment}
                policy={feeCtx?.policy ?? { currency: "INR", gstEnabled: false, gstPercent: 18, allowDiscount: true }}
                baseFee={baseFee}
                breakdown={breakdown}
                doctorName={billing.doctorName}
                needsDecision={paymentError}
                lockReason={railLockReason}
                isSubmitting={isSubmitting}
              />
            ) : (
              // Fee read still in flight — full skeleton loader matching rail structure to avoid sizing jump.
              <div className="flex flex-1 flex-col gap-[12px] pt-[2px]">
                <div className="mb-[4px] flex items-center gap-[9px]">
                  <div className="h-[30px] w-[30px] animate-pulse rounded-[9px] bg-black/[0.06]" />
                  <div className="h-[18px] w-[90px] animate-pulse rounded-[6px] bg-black/[0.06]" />
                </div>
                <div className="grid grid-cols-2 gap-[6px]">
                  <div className="h-[36px] animate-pulse rounded-[10px] bg-black/[0.05]" />
                  <div className="h-[36px] animate-pulse rounded-[10px] bg-black/[0.05]" />
                </div>
                <div className="my-[6px] flex flex-col gap-[8px]">
                  <div className="flex justify-between">
                    <div className="h-[14px] w-[100px] animate-pulse rounded bg-black/[0.04]" />
                    <div className="h-[14px] w-[50px] animate-pulse rounded bg-black/[0.04]" />
                  </div>
                  <div className="flex justify-between">
                    <div className="h-[14px] w-[80px] animate-pulse rounded bg-black/[0.04]" />
                    <div className="h-[14px] w-[40px] animate-pulse rounded bg-black/[0.04]" />
                  </div>
                </div>
                <div className="h-px bg-black/[0.06]" />
                <div className="my-[2px] flex items-baseline justify-between">
                  <div className="h-[16px] w-[50px] animate-pulse rounded bg-black/[0.06]" />
                  <div className="h-[24px] w-[70px] animate-pulse rounded bg-black/[0.06]" />
                </div>
                <div className="mt-[4px] h-[32px] animate-pulse rounded-[9px] bg-black/[0.04]" />
                <div className="mt-[6px] h-[44px] animate-pulse rounded-[12px] bg-black/[0.07]" />
                <div className="h-[40px] animate-pulse rounded-[12px] bg-black/[0.04]" />
              </div>
            )}
          </div>
        )}

        {isSubmitting && (
          <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-3 rounded-[20px] bg-white/94 backdrop-blur-md transition-opacity duration-200">
            <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-tr from-[#f472b6] to-[#a855f7] p-0.5 shadow-lg shadow-purple-500/20">
              <div className="flex h-full w-full items-center justify-center rounded-[14px] bg-white">
                <Loader2 size={24} className="animate-spin text-[#a855f7]" />
              </div>
            </div>
            <div className="flex flex-col items-center gap-1 text-center px-6">
              <h4 className="m-0 text-[16px] font-extrabold text-[#0f172a] tracking-tight">
                {submittingInfo?.title ?? "Creating visit..."}
              </h4>
              <p className="m-0 text-[12.5px] font-medium text-[#64748b]">
                {submittingInfo?.subtitle ?? "Finalizing patient record and starting consult..."}
              </p>
            </div>
          </div>
        )}
        </div>
      </div>
    </div>
  );
}