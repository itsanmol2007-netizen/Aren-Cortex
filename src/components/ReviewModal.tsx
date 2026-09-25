import { useEffect, useMemo, useRef, useState } from "react";
import { useReactToPrint } from "react-to-print";
import {
  X, Edit2, Printer, MessageCircle, CheckCircle, Loader2,
  AlertCircle, IndianRupee, Plus, Check,
} from "lucide-react";
import { freqLabelToSlot, freqSlotToLabel } from "../lib/db";
import type { DBHospital, DBFinding } from "../lib/db";
import type { PrescriptionMedicine, Vitals } from "../types";
import { fetchVisitPayment, type VisitPaymentSoFar } from "../lib/db/payments";
import { fetchMedicineBillingPolicy, type MedicineBillingPolicy } from "../lib/db/medicinePricing";
import {
  fetchAdditionalChargesCatalog, saveAdditionalChargeToCatalog,
  type AdditionalChargeCatalogEntry, type AdditionalChargeLine, type ReviewBillingResult,
} from "../lib/db/additionalCharges";
import PrescriptionDocument, { type PrescriptionBillingSummary } from "../features/prescription/PrescriptionDocument";
import { ScaledPrescriptionSheet } from "../features/prescription/ScaledPrescriptionSheet";
import PrintFormatSelector from "../features/prescription/PrintFormatSelector";
import { usePrintFormat } from "../features/prescription/usePrintFormat";
import { matches } from "../lib/keyboard/keymap";
import { useOverlayFocus } from "../hooks/useOverlayFocus";
import { usePrescriptionConfig } from "../features/prescription/usePrescriptionConfig";
import { rxLabels, hiName, RX_LANGUAGE_OPTIONS, type RxLanguage } from "../lib/i18n/prescriptionLabels";

// ─── Types ────────────────────────────────────────────────────────────────────

interface DoctorShape {
  name: string;
  /** Devanagari name, confirmed once — see lib/i18n/prescriptionLabels.ts's `hiName()`. */
  name_hi?: string | null;
  specialization: string | null;
  qualification: string | null;
  registration_number: string | null;
  signature_image_url: string | null;
  avatar_url: string | null;
}

interface ReviewModalProps {
  onClose: () => void;
  // Consult review flow (mode "review", the default). Optional so that
  // Print RX can open this same surface without wiring consult actions.
  onEdit?: () => void;
  /**
   * `billing` is whatever the Billing section below (additional charges +
   * a discount on the final total) resolved to — `undefined` for the vast
   * majority of consults that touch neither, in which case the caller's
   * own `saveConsult` sees no `reviewBilling` at all and this rides the
   * existing save with zero new writes. Handed back through this callback
   * rather than a new prop because it is only ever needed at the MOMENT of
   * saving, never before — the same reason a form submits its own state
   * rather than lifting every keystroke to its parent.
   */
  onSave?: (billing?: ReviewBillingResult) => void;
  /**
   * The dedicated "WhatsApp" action (2026-09-08) — saves the consultation
   * the same way `onSave` does, but ALSO sends the prescription to the
   * patient. Plain "Confirm & Save" no longer sends WhatsApp on its own;
   * this is the one explicit door for that, per Anmol: "there is a
   * dedicated message for whatsapp, it should not be automatic." Optional
   * so Print RX's reprint surface (`mode="print"`, no button for this at
   * all) needs no change.
   */
  onSendWhatsApp?: (language: RxLanguage, billing?: ReviewBillingResult) => void;
  // "review": the consult screen's edit/confirm flow (default, unchanged).
  // "print":  Print RX's read-only reprint surface — no Edit, no Save; the
  //           primary action is printing. One rendering pipeline, two doors.
  mode?: "review" | "print";
  // Document date — defaults to today. Reprints of an old prescription must
  // carry the original prescription date, not the day of reprinting.
  date?: Date;
  // Fire the print flow as soon as the document is ready (Print RX's
  // one-click "Print Prescription" path).
  autoPrint?: boolean;
  // Called after the OS print dialog closes (react-to-print onAfterPrint).
  onPrinted?: () => void;
  patient: {
    id?: string;
    name: string;
    age: string | number;
    gender: string;
    phone?: string;
  };
  visitId?: string;
  prescriptionRef?: string;
  symptoms?: string[];
  findings?: string[];
  allFindings?: DBFinding[];
  prescription?: PrescriptionMedicine[];
  tests?: string[];
  followUpDays?: number | null;
  adviceNotes?: string;
  /** what was delivered in the clinic today — see IntentType in engine.ts */
  therapyNotes?: string;
  /** the home programme, one formatted line each */
  exerciseLines?: string[];
  /** how the symptom behaves — pre-formatted lines, physiotherapy Phase 1.
   *  Doctor-facing review only, per plan §5 — never printed on the Rx. */
  storySummary?: string[];
  /** "activity: before -> today", one per active goal. Doctor-facing only. */
  goalSummary?: string[];
  doctor?: DoctorShape | null;
  hospital?: DBHospital | null;
  vitals?: Vitals;
  isSaving?: boolean;
  /**
   * What the primary action is called. Consult passes "Complete & Next",
   * because in a clinic with a front desk saving IS the handover to the next
   * patient and the button should say what happens (2026-09-03).
   *
   * A prop rather than a fork: standing rule 6 is that there is one review
   * surface and it does not get copied. The behaviour is identical either
   * way — `onSave` is the same call — only the word changes.
   */
  saveLabel?: string;
  /**
   * Set once "WhatsApp" has saved the consult and left this modal open on
   * purpose. The prescription is committed and the message is sending; Edit
   * and re-save are gone, the WhatsApp button becomes a passive "Sent"
   * marker, and the primary button is now just "Complete & Next".
   */
  sent?: boolean;
  /** Live state of the WhatsApp push, for the button's label / lock / retry. */
  whatsappPhase?: "idle" | "sending" | "sent" | "error";
  /** Doctor-readable failure line, shown above the action bar when the push
   *  errored. */
  whatsappError?: string;
  /**
   * Charges this consult already brings to the bill — today's performed
   * interventions that the clinic has priced (lib/db/interventionPricing.ts).
   * Pre-filled into the additional-charges lines when Review opens, where
   * they can be changed or removed like any other charge.
   */
  seedCharges?: AdditionalChargeLine[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isSlotString(s: string): boolean {
  return /^[01]-[01]-[01]-[01]$/.test(s);
}
function parseSlot(slot: string): [boolean, boolean, boolean, boolean] {
  return slot.split("-").map((p) => p === "1") as [boolean, boolean, boolean, boolean];
}
function resolveSlot(frequency: string): [boolean, boolean, boolean, boolean] {
  const slot = isSlotString(frequency) ? frequency : freqLabelToSlot(frequency);
  return parseSlot(slot);
}
function resolveLabel(frequency: string): string {
  return isSlotString(frequency) ? freqSlotToLabel(frequency) : frequency;
}
function formatDate(d = new Date()): string {
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
}
// `INSTRUCTION_GROUPS`/`pickInstructions` used to live here: four lines of
// canned text, pseudo-randomly selected from a fixed pool by hashing
// `visitId`. They never printed — `PrescriptionDocument` has no equivalent
// and never called them — so a doctor reviewing a prescription on screen saw
// four sentences that were never going to reach the patient, while their
// ACTUAL standing advice (`prescriptionConfig.defaultAdvice`, configured in
// the Prescription Editor) appeared only on the print they hadn't seen yet.
// Removed in favour of reading the same config the print output reads —
// see the "Instructions" block below.

// ─── Sub-components ───────────────────────────────────────────────────────────

function DosageDot({ active }: { active: boolean }) {
  return (
    <div className={`w-6 h-6 rounded-full border-2 transition-all flex-shrink-0 ${active
      ? "bg-blue-600 border-blue-600 shadow-[0_0_0_2px_rgba(37,99,235,0.2)]"
      : "bg-white border-gray-200"
      }`} />
  );
}

function SlotHeader({ icon: Icon, label, sub }: { icon: React.ElementType; label: string; sub: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <Icon className="w-3 h-3 text-gray-500" />
      <span className="text-[9px] font-bold text-gray-600 leading-none">{label}</span>
      <span className="text-[8px] text-gray-500 leading-none">({sub})</span>
    </div>
  );
}

function SectionTitle({ icon: Icon, title, accent = "blue" }: { icon: React.ElementType; title: string; accent?: "blue" | "purple" | "green" }) {
  const color = accent === "purple" ? "text-purple-600" : accent === "green" ? "text-emerald-600" : "text-blue-600";
  const bg = accent === "purple" ? "bg-purple-50" : accent === "green" ? "bg-emerald-50" : "bg-blue-50/80";
  return (
    <div className={`flex items-center gap-2 ${color}`}>
      <div className={`p-1.5 rounded-lg ${bg}`}><Icon className="w-3.5 h-3.5" /></div>
      <h3 className="text-[12px] font-black tracking-widest uppercase">{title}</h3>
    </div>
  );
}

function PatientField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-[8px] font-black tracking-[0.12em] text-gray-500 uppercase leading-none mb-1">{label}</p>
      <p className={`text-gray-800 font-bold leading-tight ${mono ? "font-mono text-[11px] tracking-wider" : "text-[13px]"}`}>{value}</p>
    </div>
  );
}

function VitalChip({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="flex items-baseline gap-1">
      <span className="text-[9px] font-black text-blue-500 uppercase tracking-wider">{label}</span>
      <span className="text-[13px] font-bold text-gray-800">{value}</span>
      <span className="text-[9px] text-gray-500">{unit}</span>
    </div>
  );
}

function RxIcon() {
  return <span className="text-[13px] font-black italic text-blue-600 leading-none">Rx</span>;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ReviewModal({
  onClose, onEdit, onSave, onSendWhatsApp,
  patient, visitId, prescriptionRef,
  symptoms = [], findings = [], allFindings = [],
  prescription = [], tests = [],
  followUpDays, adviceNotes, therapyNotes, exerciseLines = [],
  storySummary = [], goalSummary = [],
  doctor, hospital, vitals, isSaving, saveLabel, sent = false,
  whatsappPhase = "idle", whatsappError, seedCharges,
  mode = "review", date, autoPrint, onPrinted,
}: ReviewModalProps) {

  const printRef = useRef<HTMLDivElement>(null);
  /**
   * Takes focus on the scrollable body, not the card — see
   * `useOverlayFocus.ts`. The body specifically, because with focus behind
   * the scrim Page Down and the arrows scrolled the WORKSPACE instead of the
   * prescription being read, which on a long Rx reads as the scroll being
   * broken.
   */
  const bodyRef = useRef<HTMLDivElement>(null);
  useOverlayFocus(bodyRef);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [showFormatPicker, setShowFormatPicker] = useState(false);
  /** Which language the DOCUMENT (this preview, the print/PDF, the WhatsApp
   *  send) renders in. English until the doctor picks otherwise, every time —
   *  this is a per-prescription choice, not a saved preference, so a Hindi
   *  send to one patient never leaks into the next patient's default. */
  const [language, setLanguage] = useState<RxLanguage>("en");
  const t = rxLabels(language);

  const { format, remembered, choose } = usePrintFormat();
  /**
   * The clinic's own prescription configuration, loaded here rather than
   * passed in — this modal is the ONE door Consult, Patient Record and Print
   * RX all print through (standing rule 6), so loading it once here is what
   * makes "customise your prescription" reach every one of them without three
   * separate call sites remembering to plumb a prop. Until it resolves it is
   * `DEFAULT_PRESCRIPTION_CONFIG`, which is this document's pre-existing
   * behaviour exactly; printing is always a later, explicit click.
   */
  const prescriptionConfig = usePrescriptionConfig(hospital?.id);
  const isPrintMode = mode === "print";

  // ── Billing (opt-in — see the Billing section's own JSX further down) ──
  // Self-contained, same shape `prescriptionConfig` above already is: this
  // is the one modal every consult passes through, so it fetches its own
  // billing context rather than needing three call sites to remember to
  // thread it in. `visitPaymentSoFar` is what front desk already recorded
  // at intake (fee, its own discount, GST) — the fixed base this section
  // adds medicine + additional charges + a discount ON TOP of; `null` means
  // no payment row at all (no fee configured), in which case the whole
  // section stays hidden unless the clinic ALSO happens to price medicine
  // or keep an additional-charges catalog — see `showBilling` below.
  const [visitPaymentSoFar, setVisitPaymentSoFar] = useState<VisitPaymentSoFar | null>(null);
  const [medicineBillingPolicy, setMedicineBillingPolicy] = useState<MedicineBillingPolicy>({
    enabled: false, gstEnabled: false, gstPercent: 18,
  });
  const [chargeCatalog, setChargeCatalog] = useState<AdditionalChargeCatalogEntry[]>([]);
  useEffect(() => {
    if (isPrintMode || !hospital?.id) return;
    fetchMedicineBillingPolicy(hospital.id).then(setMedicineBillingPolicy).catch(console.error);
    fetchAdditionalChargesCatalog(hospital.id).then(setChargeCatalog).catch(console.error);
  }, [isPrintMode, hospital?.id]);
  useEffect(() => {
    // Fetched in BOTH modes now — `mode="print"` (a reprint: Print RX,
    // Communication's "View Prescription", Overview's prescription list)
    // needs this too, to print the SAME billing block a fresh save shows,
    // just read back from what was actually saved rather than computed live
    // (see `medicineTotal`/`discountPercent`/`finalTotal` below, each of
    // which prefers this saved row once `isPrintMode` is true).
    if (!visitId) { setVisitPaymentSoFar(null); return; }
    fetchVisitPayment(visitId).then(setVisitPaymentSoFar).catch(console.error);
  }, [visitId]);

  // What was actually dispensed with a price on it this consult — live from
  // `prescription`, never read back from the database: at review time
  // nothing has been saved yet, so the DB's own `visit_payments.medicine_total`
  // is still last visit's stale number (or zero). Same arithmetic
  // `saveConsult` itself will run a moment later, kept in lockstep on
  // purpose so this preview never disagrees with what actually gets billed.
  //
  // A REPRINT (`isPrintMode`) is the opposite case — nothing is live here,
  // the visit already saved, and `prescription` (from
  // `fetchPrescriptionRenderData`) may not even carry `quantityDispensed`/
  // `unitPrice`. Prefer the saved figure whenever one exists.
  const liveMedicineTotal = useMemo(
    () => Math.round(
      prescription.reduce((sum, m) => (
        m.quantityDispensed != null && m.unitPrice != null
          ? sum + m.quantityDispensed * m.unitPrice
          : sum
      ), 0) * 100
    ) / 100,
    [prescription]
  );
  // The per-medicine breakdown this rail shows when it has one — same
  // "which medicines actually carried a price" filter `liveMedicineTotal`
  // sums over, kept separate so the rail can show name + qty × rate per
  // line instead of only the combined figure (Anmol, 2026-09-20 again:
  // "don't just write medicine charges... show what medicine charges").
  const pricedMedicines = useMemo(
    () => prescription.filter((m) => m.quantityDispensed != null && m.unitPrice != null),
    [prescription]
  );
  const medicineTotal = isPrintMode && visitPaymentSoFar ? visitPaymentSoFar.medicineTotal : liveMedicineTotal;
  const medicineGstAmount = isPrintMode && visitPaymentSoFar
    ? visitPaymentSoFar.medicineGstAmount
    : medicineBillingPolicy.gstEnabled
      ? Math.round((medicineTotal * medicineBillingPolicy.gstPercent) / 100)
      : 0;

  // Review opens already carrying today's priced interventions; a reprint
  // starts empty and is seeded from what was actually saved, below.
  const [charges, setCharges] = useState<AdditionalChargeLine[]>(() => (isPrintMode ? [] : seedCharges ?? []));
  // A reprint has no interactive "+ Add charge" — seed straight from what
  // was actually billed and saved, the same source `medicineTotal` above
  // reads for the same reason.
  useEffect(() => {
    if (isPrintMode && visitPaymentSoFar) setCharges(visitPaymentSoFar.additionalCharges);
  }, [isPrintMode, visitPaymentSoFar]);
  const [chargeLabel, setChargeLabel] = useState("");
  const [chargeAmount, setChargeAmount] = useState("");
  const [saveChargeToCatalog, setSaveChargeToCatalog] = useState(true);
  // Collapsed by default — the rail's "+ Add charge" button reveals this
  // form rather than always showing two loose inputs (Anmol, 2026-09-20:
  // the always-open form read as "ambiguous").
  const [addingCharge, setAddingCharge] = useState(false);
  const chargesTotal = useMemo(
    () => Math.round(charges.reduce((sum, c) => sum + c.amount, 0) * 100) / 100,
    [charges]
  );

  const addCharge = () => {
    const label = chargeLabel.trim();
    const amount = Number(chargeAmount);
    if (!label || !Number.isFinite(amount) || amount <= 0) return;
    setCharges((cur) => [...cur, { label, amount }]);
    if (saveChargeToCatalog && hospital?.id) {
      const hid = hospital.id;
      saveAdditionalChargeToCatalog({ hospitalId: hid, label, defaultAmount: amount })
        .then((entry) => setChargeCatalog((cur) => [entry, ...cur.filter((c) => c.id !== entry.id)]))
        .catch(console.error);
    }
    setChargeLabel("");
    setChargeAmount("");
  };
  const removeCharge = (i: number) => setCharges((cur) => cur.filter((_, j) => j !== i));

  /** 5%, 10%, or a custom rupee amount — the final total's own discount,
   *  separate from front desk's intake-time one on the fee alone
   *  (visitPaymentSoFar.discount, already fixed by the time this modal
   *  opens). "none" | "5" | "10" | "custom-percent" | "custom-amount". */
  const [discountMode, setDiscountMode] = useState<"none" | "5" | "10" | "custom-percent" | "custom-amount">("none");
  const [discountInput, setDiscountInput] = useState("");

  const subtotal = (visitPaymentSoFar
    ? visitPaymentSoFar.fee - visitPaymentSoFar.discount + visitPaymentSoFar.gstAmount
    : 0) + medicineTotal + medicineGstAmount + chargesTotal;

  const { discountPercent, discountAmount } = (() => {
    // Reprint: the discount was already resolved and saved — read it back
    // rather than re-deriving from `discountMode`/`discountInput`, which
    // stay at their untouched defaults ("none"/"") since nothing here is
    // interactive in print mode.
    if (isPrintMode && visitPaymentSoFar) {
      return { discountPercent: visitPaymentSoFar.reviewDiscountPercent, discountAmount: visitPaymentSoFar.reviewDiscountAmount };
    }
    if (discountMode === "none") return { discountPercent: null as number | null, discountAmount: 0 };
    if (discountMode === "5" || discountMode === "10") {
      const pct = Number(discountMode);
      return { discountPercent: pct, discountAmount: Math.round((subtotal * pct) / 100) };
    }
    const n = Number(discountInput);
    if (!Number.isFinite(n) || n <= 0) return { discountPercent: null as number | null, discountAmount: 0 };
    return discountMode === "custom-percent"
      ? { discountPercent: n, discountAmount: Math.round((subtotal * n) / 100) }
      : { discountPercent: null as number | null, discountAmount: Math.round(n * 100) / 100 };
  })();
  // Reprint: the resolved total was already saved — read it back rather
  // than recomputing from `subtotal`, the authoritative number rather than
  // one this component re-derives.
  const finalTotal = isPrintMode && visitPaymentSoFar
    ? visitPaymentSoFar.total
    : Math.max(0, Math.round((subtotal - discountAmount) * 100) / 100);

  /** The printed twin of the rail below — same figures, handed to
   *  `PrescriptionDocument` so the actual printed/reprinted page carries
   *  them too (Anmol, 2026-09-20: "there is no receipt into the printed
   *  documents"). Independent of `showBilling` (which excludes
   *  `isPrintMode` — the ON-SCREEN rail is review-only) since the PRINT
   *  OUTPUT itself needs to show billing in both modes: live, about-to-be-
   *  saved figures during review, and the already-saved figures on a
   *  reprint (both threaded through the same `medicineTotal`/`charges`/
   *  `discountPercent`/`finalTotal` above). */
  const printBilling: PrescriptionBillingSummary | undefined =
    visitPaymentSoFar != null || medicineTotal > 0 || charges.length > 0
      ? {
        consultationFee: visitPaymentSoFar ? visitPaymentSoFar.fee - visitPaymentSoFar.discount : null,
        feeGstAmount: visitPaymentSoFar?.gstAmount ?? 0,
        medicineTotal, medicineGstAmount, additionalCharges: charges,
        discountPercent, discountAmount, total: finalTotal,
      }
      : undefined;

  /** Nothing here unless there is genuinely something billing-related to
   *  show — a fee recorded at intake, medicine actually priced this
   *  consult, or a clinic that keeps an additional-charges catalog at all.
   *  A clinic using none of these sees Review exactly as it always was. */
  const showBilling = !isPrintMode && (visitPaymentSoFar != null || medicineTotal > 0 || chargeCatalog.length > 0 || charges.length > 0);

  const reviewBilling: ReviewBillingResult | undefined =
    charges.length > 0 || discountAmount > 0
      ? { additionalCharges: charges, discountPercent, discountAmount }
      : undefined;
  // The keyboard shortcut below closes over whatever `reviewBilling` was at
  // the LAST time its own effect re-ran (it deliberately does not list every
  // value it reads — see that effect's own eslint-disable), so a ref is what
  // keeps Ctrl+Enter honest about a charge or discount typed a moment ago
  // without widening that effect's dependency list.
  const reviewBillingRef = useRef(reviewBilling);
  reviewBillingRef.current = reviewBilling;
  /**
   * The one clinic accent, for every clinic — no longer `hospital.accent_color`.
   * A clinic could pick white and the whole letterhead border/watermark would
   * vanish into the white page (Anmol, 2026-09-11: "a useless complexity").
   * One fixed, tested-legible blue removes both the picker and the failure
   * mode; `PrescriptionDocument` made the same change.
   */
  const accentColor = "#1268e8";
  /**
   * The accent as a usable ramp. `ink` is contrast-clamped against white:
   * legible on a document that gets printed regardless of the base hue. See
   * lib/brand/accent.ts. `accentPalette()` with no argument already resolves
   * to this same fixed colour — its own fallback.
   */
  const today = formatDate(date);

  // Devanagari names, confirmed once (Clinic page) and stored on
  // doctors.name_hi / hospitals.name_hi — never guessed at render time. Both
  // still needed here: `doctorName` for the WhatsApp send caption below,
  // `clinicName` for that same caption. The rest of what this section used
  // to compute (address/phone/email/website, logo vs. doctor-photo choice,
  // identity-mode flags) was ONLY for the hand-styled preview this component
  // no longer renders — see `ScaledPrescriptionSheet`'s call below, which
  // reads `hospital`/`doctor`/`prescriptionConfig` directly instead.
  const doctorName = hiName(language, doctor?.name ?? "Dr. —", doctor?.name_hi);
  const clinicName = hiName(language, hospital?.name ?? "Clinic", hospital?.name_hi);

  // QR generation
  useEffect(() => {
    async function generateQr() {
      try {
        const QRCode = await import("qrcode");
        const lines = [
          "AREN Healthcare",
          `${doctorName} — ${clinicName}`,
          `Patient: ${patient.name}, ${patient.age}y/${patient.gender}`,
          `Date: ${today}  Ref: ${prescriptionRef ?? visitId?.slice(0, 8) ?? ""}`,
          "---",
          symptoms.length ? `Complaints: ${symptoms.join(", ")}` : "",
          findings.length ? `Findings: ${findings.join(", ")}` : "",
          "---",
          "Rx:",
          ...prescription.map((m, i) => `${i + 1}. ${m.name} - ${resolveLabel(m.frequency)} - ${m.duration}`),
          tests.length ? `Investigations: ${tests.join(", ")}` : "",
          followUpDays ? `Follow up: ${followUpDays} days` : "",
        ].filter(Boolean).join("\n");
        const url = await QRCode.toDataURL(lines, { width: 96, margin: 1 });
        setQrDataUrl(url);
      } catch { /* skip */ }
    }
    generateQr();
  }, [visitId, prescriptionRef]);

  // Print handler
  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `${patient.name}_${prescriptionRef ?? visitId?.slice(0, 8) ?? "prescription"}`,
    onAfterPrint: () => onPrinted?.(),
    pageStyle: format === "thermal"
      ? `@page { size: 80mm auto; margin: 0; } body { margin: 0; }`
      : format === "a5"
        ? `@page { size: A5 portrait; margin: 0; } body { margin: 0; }`
        : `@page { size: A4 portrait; margin: 0; } body { margin: 0; }`,
  });

  function handlePrintClick() {
    if (remembered) {
      handlePrint();
    } else {
      setShowFormatPicker(true);
    }
  }

  // One-click printing from Print RX: fire the normal print flow once the
  // hidden document has had a moment to settle (QR arrives async — wait for
  // it briefly, but never hold the receptionist hostage to it).
  const autoPrintFired = useRef(false);
  useEffect(() => {
    if (!autoPrint || autoPrintFired.current) return;
    const delay = qrDataUrl ? 80 : 900;
    const t = setTimeout(() => {
      if (autoPrintFired.current) return;
      autoPrintFired.current = true;
      handlePrintClick();
    }, delay);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPrint, qrDataUrl]);

  function handleFormatConfirm(f: Parameters<typeof choose>[0], remember: boolean) {
    choose(f, remember);
    setShowFormatPicker(false);
    // Small delay so format state updates before print fires
    setTimeout(() => handlePrint(), 100);
  }

  /**
   * ── The last three keys of a consult ────────────────────────────────────
   *
   * This is the end of the keyboard path that starts at patient intake, and
   * until now it was where that path stopped: the doctor arrived here with
   * Ctrl+Enter and then had to reach for the mouse to press the button two
   * inches away. Worse, the global handler was catching Ctrl+Enter over this
   * modal and re-opening the review it was already showing, so the obvious
   * key did visibly nothing. `useConsultKeyboard` now stands down while an
   * overlay is up, which is what makes these three bindings reachable at all.
   *
   * Ctrl+P is claimed rather than left to the browser deliberately. The
   * browser's own print would render the MODAL — scrim, buttons and all —
   * instead of `PrescriptionDocument`, which is a wrong prescription on real
   * paper, so cancelling that default is a correctness fix and not a
   * convenience.
   *
   * Escape means "back to editing" rather than "discard": nothing here is
   * saved yet, `onEdit` returns the doctor to the workspace with the plan
   * intact, and in print mode there is no edit to go back to so it closes.
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // The format picker is a modal ON this modal and owns its own keys.
      if (showFormatPicker) return;

      if (matches(e, "reviewPrint")) {
        e.preventDefault();
        e.stopPropagation();
        handlePrintClick();
        return;
      }
      if (matches(e, "reviewSave")) {
        e.preventDefault();
        e.stopPropagation();
        // Print mode is a reprint of something already saved — there is no
        // `onSave` wired, and inventing one would write a second consult.
        if (!isPrintMode && onSave && !isSaving) onSave(reviewBillingRef.current);
        return;
      }
      if (matches(e, "reviewBack")) {
        e.preventDefault();
        e.stopPropagation();
        // Once saved-and-sending, "back" is the same as the close control:
        // it advances (Complete & Next), it does not drop to an editable chart.
        if (!isPrintMode && onEdit && !sent) onEdit(); else onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showFormatPicker, isPrintMode, isSaving, onSave, onEdit, onClose, remembered, format, sent]);

  return (
    <>
      {/* ── Print Format Picker ── */}
      {showFormatPicker && (
        <PrintFormatSelector
          current={format}
          remembered={remembered}
          onConfirm={handleFormatConfirm}
          onClose={() => setShowFormatPicker(false)}
        />
      )}

      {/* ── Hidden print document ── */}
      <div style={{ position: "absolute", left: "-9999px", top: 0, pointerEvents: "none" }}>
        <div ref={printRef}>
          <PrescriptionDocument
            patient={patient}
            visitId={visitId}
            prescriptionRef={prescriptionRef}
            symptoms={symptoms}
            findings={findings}
            prescription={prescription}
            tests={tests}
            followUpDays={followUpDays}
            adviceNotes={adviceNotes}
            therapyNotes={therapyNotes}
            exerciseLines={exerciseLines}
            doctor={doctor}
            hospital={hospital}
            vitals={vitals}
            format={format}
            date={date}
            language={language}
            config={prescriptionConfig}
            billing={printBilling}
          />
        </div>
      </div>

      {/* ── Modal overlay ──
          Scaled ~12% from the original (max-w-3xl/768px -> 680px, m-4 ->
          m-3) — Anmol: "a lot of empty white space... focus to be on actual
          content instead of header and footer." The letterhead/footer bands
          below are trimmed MORE than the content sections for the same
          reason: this is a document a doctor reviews, not a cover page. */}
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4">
        <div className={`relative w-full max-h-[95vh] flex flex-col rounded-2xl overflow-hidden shadow-2xl bg-white transition-[max-width] ${showBilling ? "max-w-[988px]" : "max-w-[680px]"}`}>

          {/* Top bar */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-white shrink-0">
            {isPrintMode ? (
              <div className="w-14" aria-hidden />
            ) : (
              <button onClick={onEdit}
                className="flex items-center gap-1.5 text-sm font-semibold text-gray-500 hover:text-blue-600 transition-colors">
                <Edit2 className="w-3.5 h-3.5" /> Edit
              </button>
            )}
            <h2 className="text-[15px] font-black text-gray-900 tracking-tight">
              {isPrintMode ? "Print Prescription" : "Review Prescription"}
            </h2>
            <button onClick={onClose}
              className="p-1.5 rounded-full hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* ── Document language ── picks the language of the DOCUMENT
              itself — this preview, the print/PDF, and (via onSendWhatsApp)
              which approved WhatsApp template gets used. English by default,
              every time; never saved as a preference (see the `language`
              state comment). The doctor's own words — advice, therapy notes,
              patient/medicine names — are never touched, in any language. */}
          <div className="flex items-center gap-2 px-5 py-2 border-b border-gray-100 bg-white shrink-0">
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
              Language
            </span>
            <div className="flex items-center gap-1">
              {RX_LANGUAGE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setLanguage(opt.value)}
                  className={`px-2.5 py-1 rounded-full text-[12px] font-semibold transition-colors ${language === opt.value
                    ? "text-white"
                    : "text-gray-600 hover:bg-gray-100"
                    }`}
                  style={language === opt.value ? { background: accentColor } : undefined}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {/* The clinic/doctor NAME only switches to Devanagari once one is
                confirmed on the Clinic page (name_hi) — never guessed. Say so
                here rather than leaving a doctor wondering why the letterhead
                is still in Latin script right after picking Hindi. */}
            {language === "hi" && !doctor?.name_hi?.trim() && !hospital?.name_hi?.trim() && (
              <span className="text-[10.5px] text-amber-600">
                Clinic/doctor name isn't set in Hindi yet — add it on the Clinic page.
              </span>
            )}
          </div>

          {/* Scrollable body. `tabIndex={-1}` is programmatic focus only —
              never a Tab stop. The focus ring IS shown, deliberately — see
              `.cx-kbd-surface` in consult.css for why an overlay's landing
              pad must stay visible rather than being suppressed. This
              component is Tailwind end to end, so the equivalent ring is
              built from utilities here instead of that shared class
              (doctrine rule 7 — don't mix styling vocabularies in one file). */}
          <div
            ref={bodyRef}
            tabIndex={-1}
            className="overflow-y-auto flex-1 bg-gray-50/80 outline-none focus:ring-[3px] focus:ring-blue-100 focus:ring-inset focus:shadow-[inset_0_0_0_1px_#1268e8]"
          >
            <div className="flex items-start gap-4 m-3">
            <div className="flex-1 min-w-0">
              {/* ══ The prescription itself ══ — mounts the REAL
                  `PrescriptionDocument` at true paper size, scaled to fit
                  this column, through the same `ScaledPrescriptionSheet`
                  shell the Clinic page's own preview uses (standing rule 6,
                  "one prescription renderer"). This used to be a second,
                  hand-styled reimplementation of the document that never
                  matched what actually printed — every field mirrored by
                  hand, every drift a silent lie about what a patient would
                  receive (Anmol, 2026-09-20: "prescription preview... so
                  much cramped up and terrible... that file [the real
                  document] already solved all those visual problems").
                  Same props as the hidden print/PDF instance above, so the
                  two can never show two different prescriptions. */}
              <ScaledPrescriptionSheet format={format}>
                <PrescriptionDocument
                  patient={patient}
                  visitId={visitId}
                  prescriptionRef={prescriptionRef}
                  symptoms={symptoms}
                  findings={findings}
                  prescription={prescription}
                  tests={tests}
                  followUpDays={followUpDays}
                  adviceNotes={adviceNotes}
                  therapyNotes={therapyNotes}
                  exerciseLines={exerciseLines}
                  doctor={doctor}
                  hospital={hospital}
                  vitals={vitals}
                  format={format}
                  date={date}
                  language={language}
                  config={prescriptionConfig}
                  billing={printBilling}
                />
              </ScaledPrescriptionSheet>
            </div>

            {/* ══ Billing rail ══ — screen-only, beside the Rx preview rather
                than inside it (Anmol, 2026-09-20: "prescription sheet is
                entirely different than receipt"). Deliberately NOT the Rx
                document's own white/blue palette — warm paper tones, a
                dashed "tear" rule, monospace amounts — so it reads as a
                second, unrelated slip sitting next to the prescription, the
                same way a receipt clips to a chart rather than printing on
                it. Never rendered in `isPrintMode` (`showBilling` already
                excludes it) and never reaches `PrescriptionDocument` itself —
                what actually prints/sends is a separate, still-open piece of
                work (appended at the BOTTOM there, since a printed page or a
                WhatsApp message can't sit two documents side by side). */}
            {showBilling && (
              <div className="w-[280px] shrink-0 sticky top-0 self-start rounded-2xl overflow-hidden shadow-lg border border-[#e2d6ae] bg-[#fefcf5]">
                <div className="px-4 py-3 border-b border-dashed border-[#d9c896] bg-[#faf3dd] flex items-center gap-2">
                  <IndianRupee className="w-3.5 h-3.5 text-[#8a6d1f] shrink-0" />
                  <span className="text-[10px] font-black uppercase tracking-[0.12em] text-[#8a6d1f]">
                    Billing — not part of the Rx
                  </span>
                </div>

                <div className="px-4 py-3.5 flex flex-col gap-1.5 text-[12.5px] font-mono">
                  {visitPaymentSoFar && (
                    <div className="flex items-center justify-between text-[#5c4d22]">
                      <span className="font-sans">Consultation fee</span>
                      <span className="tabular-nums font-semibold">
                        ₹{(visitPaymentSoFar.fee - visitPaymentSoFar.discount).toFixed(2)}
                      </span>
                    </div>
                  )}
                  {visitPaymentSoFar && visitPaymentSoFar.gstAmount > 0 && (
                    <div className="flex items-center justify-between text-[#8a7a4d]">
                      <span className="font-sans">GST on fee</span>
                      <span className="tabular-nums">₹{visitPaymentSoFar.gstAmount.toFixed(2)}</span>
                    </div>
                  )}
                  {medicineTotal > 0 && (
                    pricedMedicines.length > 0 ? (
                      pricedMedicines.map((m, i) => (
                        <div key={`${m.id}-${i}`} className="flex flex-col">
                          <div className="flex items-center justify-between gap-2 text-[#5c4d22]">
                            <span className="font-sans truncate">{m.name}</span>
                            <span className="tabular-nums font-semibold shrink-0">
                              ₹{(m.quantityDispensed! * m.unitPrice!).toFixed(2)}
                            </span>
                          </div>
                          <span className="font-sans text-[10.5px] text-[#a3915f]">
                            {m.quantityDispensed} × ₹{m.unitPrice!.toFixed(2)}
                          </span>
                        </div>
                      ))
                    ) : (
                      // A reprint (`isPrintMode`) never reaches this rail at
                      // all (`showBilling` excludes it) — this fallback is
                      // only theoretical insurance, not a real path today.
                      <div className="flex items-center justify-between text-[#5c4d22]">
                        <span className="font-sans">Medicine dispensed</span>
                        <span className="tabular-nums font-semibold">₹{medicineTotal.toFixed(2)}</span>
                      </div>
                    )
                  )}
                  {medicineGstAmount > 0 && (
                    <div className="flex items-center justify-between text-[#8a7a4d]">
                      <span className="font-sans">GST on medicine</span>
                      <span className="tabular-nums">₹{medicineGstAmount.toFixed(2)}</span>
                    </div>
                  )}
                  {charges.length === 0 && !visitPaymentSoFar && medicineTotal === 0 && (
                    <p className="font-sans text-[11.5px] text-[#a3915f]">Nothing billed yet.</p>
                  )}
                  {charges.map((c, i) => (
                    <div key={`${c.label}-${i}`} className="flex items-center justify-between text-[#5c4d22]">
                      <span className="font-sans flex items-center gap-1 min-w-0">
                        <span className="truncate">{c.label}</span>
                        <button
                          type="button" onClick={() => removeCharge(i)}
                          aria-label={`Remove ${c.label}`}
                          className="text-[#c4b078] hover:text-red-500 shrink-0"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                      <span className="tabular-nums font-semibold shrink-0">₹{c.amount.toFixed(2)}</span>
                    </div>
                  ))}
                </div>

                {/* Add an additional service charge — collapsed behind a
                    single button; typing starts only once that's clicked, so
                    the rail's resting state is never two loose inputs. */}
                <div className="px-4 pb-3 border-b border-dashed border-[#d9c896]">
                  {chargeCatalog.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-2">
                      {chargeCatalog.slice(0, 4).map((entry) => (
                        <button
                          key={entry.id} type="button"
                          onClick={() => setCharges((cur) => [...cur, { label: entry.label, amount: entry.defaultAmount }])}
                          className="px-2 py-0.5 rounded-full text-[10.5px] font-semibold bg-white border border-[#e2d6ae] text-[#8a6d1f] hover:bg-[#faf3dd]"
                        >
                          + {entry.label}
                        </button>
                      ))}
                    </div>
                  )}
                  {addingCharge ? (
                    <div className="flex flex-col gap-1.5">
                      <input
                        type="text" value={chargeLabel} placeholder="Service, e.g. Dressing" autoFocus
                        onChange={(e) => setChargeLabel(e.target.value)}
                        className="w-full rounded-lg border border-[#e2d6ae] bg-white px-2 py-1.5 text-[12px] font-sans outline-none focus:border-[#b89a4a]"
                      />
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text" inputMode="decimal" value={chargeAmount} placeholder="₹"
                          onChange={(e) => setChargeAmount(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCharge(); setAddingCharge(false); } }}
                          className="w-16 rounded-lg border border-[#e2d6ae] bg-white px-2 py-1.5 text-[12px] font-sans outline-none focus:border-[#b89a4a]"
                        />
                        <button
                          type="button"
                          onClick={() => { addCharge(); setAddingCharge(false); }}
                          disabled={!chargeLabel.trim() || !chargeAmount.trim()}
                          className="flex-1 rounded-lg bg-[#8a6d1f] px-2 py-1.5 text-[11.5px] font-bold text-white disabled:opacity-40"
                        >
                          Add
                        </button>
                        <button
                          type="button"
                          onClick={() => { setAddingCharge(false); setChargeLabel(""); setChargeAmount(""); }}
                          className="rounded-lg border border-[#e2d6ae] px-1.5 py-1.5 text-[#8a7a4d] hover:bg-[#faf3dd]"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <button
                        type="button" onClick={() => setSaveChargeToCatalog((v) => !v)}
                        className={`self-start flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-semibold font-sans border transition-colors ${
                          saveChargeToCatalog
                            ? "bg-[#8a6d1f] border-[#8a6d1f] text-white"
                            : "bg-white border-[#e2d6ae] text-[#8a7a4d]"
                        }`}
                      >
                        {saveChargeToCatalog && <Check className="w-2.5 h-2.5" />} Save for next time
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button" onClick={() => setAddingCharge(true)}
                      className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-[#d9c896] py-1.5 text-[11.5px] font-semibold font-sans text-[#8a6d1f] hover:bg-[#faf3dd]"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add charge
                    </button>
                  )}
                </div>

                {/* Discount on the final total — separate from front desk's
                    own intake-time discount on the fee alone, already folded
                    into "Consultation fee" above. */}
                <div className="px-4 py-3 border-b border-dashed border-[#d9c896] flex flex-col gap-1.5">
                  <span className="text-[10px] font-black uppercase tracking-[0.1em] text-[#8a7a4d] font-sans">
                    Discount
                  </span>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {(["none", "5", "10"] as const).map((m) => (
                      <button
                        key={m} type="button"
                        onClick={() => { setDiscountMode(m); setDiscountInput(""); }}
                        className={`px-2.5 py-1 rounded-full text-[11px] font-semibold font-sans border transition-colors ${
                          discountMode === m
                            ? "bg-[#8a6d1f] border-[#8a6d1f] text-white"
                            : "bg-white border-[#e2d6ae] text-[#8a7a4d] hover:bg-[#faf3dd]"
                        }`}
                      >
                        {m === "none" ? "None" : `${m}%`}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setDiscountMode((m) => (m === "custom-percent" || m === "custom-amount" ? "none" : "custom-percent"))}
                      className={`px-2.5 py-1 rounded-full text-[11px] font-semibold font-sans border transition-colors ${
                        discountMode === "custom-percent" || discountMode === "custom-amount"
                          ? "bg-[#8a6d1f] border-[#8a6d1f] text-white"
                          : "bg-white border-[#e2d6ae] text-[#8a7a4d] hover:bg-[#faf3dd]"
                      }`}
                    >
                      Custom
                    </button>
                  </div>
                  {(discountMode === "custom-percent" || discountMode === "custom-amount") && (
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text" inputMode="decimal" value={discountInput} placeholder="0"
                        onChange={(e) => setDiscountInput(e.target.value)}
                        className="w-16 rounded-lg border border-[#e2d6ae] bg-white px-2 py-1 text-[12px] outline-none focus:border-[#b89a4a]"
                      />
                      <div className="flex rounded-lg border border-[#e2d6ae] overflow-hidden">
                        <button
                          type="button" onClick={() => setDiscountMode("custom-percent")}
                          className={`px-2 py-1 text-[11px] font-semibold ${discountMode === "custom-percent" ? "bg-[#faf3dd] text-[#8a6d1f]" : "text-[#8a7a4d]"}`}
                        >%</button>
                        <button
                          type="button" onClick={() => setDiscountMode("custom-amount")}
                          className={`px-2 py-1 text-[11px] font-semibold ${discountMode === "custom-amount" ? "bg-[#faf3dd] text-[#8a6d1f]" : "text-[#8a7a4d]"}`}
                        >₹</button>
                      </div>
                    </div>
                  )}
                  {discountAmount > 0 && (
                    <div className="flex items-center justify-between text-[12px] text-red-600">
                      <span className="font-sans">Discount{discountPercent != null ? ` (${discountPercent}%)` : ""}</span>
                      <span className="font-semibold tabular-nums font-mono">−₹{discountAmount.toFixed(2)}</span>
                    </div>
                  )}
                </div>

                <div className="px-4 py-3.5 flex items-center justify-between bg-[#faf3dd]">
                  <span className="text-[11.5px] font-black uppercase tracking-[0.08em] text-[#5c4d22] font-sans">
                    Total
                  </span>
                  <span className="text-[19px] font-black tabular-nums font-mono text-[#5c4d22]">
                    ₹{finalTotal.toFixed(2)}
                  </span>
                </div>
              </div>
            )}
            </div>
          </div>

          {/* ── Bottom action bar ── */}
          {isPrintMode ? (
            <div className="shrink-0 px-5 py-3 border-t border-gray-100 bg-white flex items-center gap-3">
              <p className="text-[11.5px] text-gray-500 leading-snug max-w-[320px]">
                The standard print window handles printer, paper size (A4, A5, Thermal) and copies.
              </p>
              <div className="flex-1" />

              <button onClick={onClose}
                className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors">
                Close
              </button>

              <button onClick={handlePrintClick}
                className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-bold text-white shadow-sm hover:opacity-90 active:scale-95 transition-all"
                style={{ background: "linear-gradient(135deg, #1268e8, #7c3aed)" }}>
                <Printer className="w-4 h-4" /> Print Prescription
              </button>
            </div>
          ) : (
            <div className="shrink-0 border-t border-gray-100 bg-white">
              {whatsappPhase === "error" && whatsappError && (
                <div className="flex items-start gap-2 px-5 pt-2.5 text-[12.5px] leading-snug text-red-600">
                  <AlertCircle className="mt-[1px] w-3.5 h-3.5 shrink-0" />
                  <span>{whatsappError}</span>
                </div>
              )}
              {/* One row, no wrapping — every control keeps its full label,
                  the paddings and the keycaps are what give. */}
              <div className="flex items-center gap-2 px-4 py-2.5 whitespace-nowrap">
                {sent ? (
                  <span className="flex items-center gap-1.5 text-[13px] font-semibold text-green-600">
                    <CheckCircle className="w-4 h-4" /> Saved
                  </span>
                ) : (
                  <button onClick={onEdit}
                    className="flex items-center gap-1.5 text-[13px] font-semibold text-gray-500 hover:text-blue-600 transition-colors">
                    <Edit2 className="w-3.5 h-3.5" /> Edit
                  </button>
                )}
                <div className="flex-1" />

                <button onClick={handlePrintClick}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 text-[13px] font-semibold text-gray-700 hover:bg-gray-50 transition-colors">
                  <Printer className="w-4 h-4" /> Print / PDF
                  <kbd className="hidden lg:inline rounded border border-gray-200 bg-gray-50 px-1 text-[10.5px] font-semibold not-italic leading-4 text-gray-500">Ctrl P</kbd>
                </button>

                {onSendWhatsApp && (() => {
                  const label =
                    whatsappPhase === "sending" ? "Sending…"
                    : whatsappPhase === "sent" ? "Sent"
                    : whatsappPhase === "error" ? "Retry WhatsApp"
                    : "Send on WhatsApp";
                  const locked = isSaving || whatsappPhase === "sending" || whatsappPhase === "sent";
                  return (
                    <button onClick={() => onSendWhatsApp(language, reviewBilling)} disabled={locked}
                      title="Save and send the prescription to the patient on WhatsApp. Review stays open — you check it, then Complete & Next."
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-green-200 bg-green-50 text-[13px] font-semibold text-green-700 hover:bg-green-100 transition-colors disabled:opacity-60 disabled:cursor-not-allowed">
                      {whatsappPhase === "sending"
                        ? <Loader2 className="w-4 h-4 animate-spin" />
                        : whatsappPhase === "sent"
                          ? <CheckCircle className="w-4 h-4" />
                          : <MessageCircle className="w-4 h-4" />}
                      {label}
                    </button>
                  );
                })()}

                <button onClick={() => onSave?.(reviewBilling)} disabled={isSaving}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[13px] font-bold text-white shadow-sm hover:opacity-90 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ background: "linear-gradient(135deg, #1268e8, #7c3aed)" }}>
                  <CheckCircle className="w-4 h-4" />
                  {isSaving ? "Saving…" : (saveLabel ?? "Confirm & Save")}
                  <kbd className="hidden lg:inline rounded border border-white/25 bg-white/15 px-1 text-[10.5px] font-semibold not-italic leading-4 text-white/80">Ctrl ⏎</kbd>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}