import { useEffect, useRef, useState } from "react";
import { ArrowRight, Cake, Calendar, Paperclip, Phone, Stethoscope, Thermometer, UserPlus, UserRound, UserCheck, Users } from "lucide-react";
import { fetchPatientVisitStats, searchPatients, type DBDoctor, type DBPatient } from "@/lib/db";
import type { IntakeChip } from "@/lib/db/synapse";
import type { AttachmentType } from "@/lib/attachments/types";
import type { Vitals } from "@/types";
import { initials } from "../utils";
import { useT } from "../i18n/i18n";
import { ModalShell } from "./ModalShell";
import { ObservablePicker } from "./ObservablePicker";
import { AgeInput, Field, PhoneInput, SectionLabel } from "./fields";
import { AttachDocumentField } from "./AttachDocumentField";
import type { StagedAttachment } from "./IntakeAttachmentsField";
import { PaymentRail, INITIAL_FEE_STATE, type FeeState } from "./PaymentRail";
import { useGatewaySessions } from "./gateway/GatewaySessionsProvider";
import { ageInYears, dobMattersFor, todayIso } from "@/lib/growth/age";
import { useHospitalId } from "../hooks/useHospitalId";
import {
    computeFee, defaultVisitType, fetchFeeContext, resolveFee,
    type FeeContext, type PaymentMethod, type VisitType,
} from "@/lib/db/payments";

// ---------------------------------------------------------------------------
// REGISTER PATIENT — the front door, rebuilt 2026-09-05.
//
// ── What this modal is for
//
// Getting a patient into today's queue with the least possible friction.
// Information → Visit → Payment → queue entry, and nothing else.
//
// ── The two corrections that shaped this version
//
// 1. IT WAS A COCKPIT. Every payment control — paid, unpaid, all four methods,
//    discount type, discount value — was on screen at once, inline, under the
//    doctor field. Anmol: "the receptionist is going to be completely
//    hallucinated by what the fuck this is... this is not airplane cockpit."
//    Money now lives in its own rail and reveals one decision at a time; see
//    `PaymentRail`.
//
// 2. IT WAS ONE TALL COLUMN. Stacked, the total ends up below the fold while
//    the form is being filled. Two columns keep the left short and the money
//    permanently visible, which is why the payment panel is a RAIL and not
//    another section.
//
// ── What was removed, deliberately
//
// MEASUREMENTS. Registration is not the moment for BP and weight — the patient
// is standing at the counter and the queue is waiting. They are taken after
// the visit exists, from the queue row, by clinics whose workflow wants them.
// Every field that only sometimes matters was costing every registration.
//
// The "Existing patient? Search by name or number" link is gone too. It asked
// the receptionist to do work the form already does: typing a name or number
// searches as they type, and a match arrives as a dropdown under the field.
// ---------------------------------------------------------------------------

type Props = {
    existingPatient: DBPatient | null;
    prefillName: string;
    doctors: DBDoctor[];
    defaultDoctorId: string;
    onClose: () => void;
    // Switches this open modal into existing-patient mode (used by duplicate
    // detection); picked symptoms/doctor survive because the component stays
    // mounted — only the identity half of the form changes.
    onUseExisting: (patient: DBPatient) => void;
    // Fire-and-forget (2026-08-24) — Save closes this modal instantly rather
    // than waiting on the network; useVisitActions.createNewVisit does the
    // real work (patient lookup/create, visit create, attachments, payment) in
    // the background and reconciles the queue itself. Nothing here awaits it.
    onCreate: (opts: {
        existingPatient: DBPatient | null;
        name: string;
        phone: string;
        age: string;
        dateOfBirth: string;
        gender: string;
        observableIds: number[];
        symptomNames: string[];
        /** observableId -> days, for the complaints reception asked about */
        observableDurations?: Map<number, number>;
        vitals: Partial<Vitals>;
        doctorId: string;
        doctorName: string;
        attachments: { file: File; attachmentType: AttachmentType }[];
        /**
         * What the desk charged, or null when this clinic has no fee set for
         * the assigned doctor. Written after the visit lands, best-effort —
         * same contract as observations and attachments: a fee that fails to
         * write must never fail the visit that is already committed.
         */
        payment: {
            visitType: VisitType;
            base: number;
            discount: number;
            gstAmount: number;
            total: number;
            discountKind: "none" | "percent" | "amount";
            discountPercent: number | null;
            gstPercent: number;
            status: "paid" | "pending";
            method: PaymentMethod | null;
        } | null;
        // Not used by the normal Save flow (createNewVisit's own fire-and-
        // forget close makes anyone awaiting it pointless there) — only by
        // "Upload from phone", which needs the REAL visit id the instant it
        // exists to open the QR modal against. See handleUploadFromPhone.
        onSuccess?: (result: { patientName: string; patientId: string; visitId: string }) => void;
    }) => void;
};

export function CreateVisitModal({ existingPatient, prefillName, doctors, defaultDoctorId, onClose, onUseExisting, onCreate }: Props) {
    const t = useT();
    const existing = !!existingPatient;

    const [name, setName] = useState(prefillName);
    const [phone, setPhone] = useState("");
    const [age, setAge] = useState("");
    const [dateOfBirth, setDateOfBirth] = useState("");
    const [gender, setGender] = useState("");
    // One list over BOTH kinds — symptoms and volunteered history share a
    // single search field, the way Cortex's picker works. Split by `kind` only
    // at save / validation time.
    const [picked, setPicked] = useState<IntakeChip[]>([]);
    /**
     * observableId -> days. Reception hears "since Monday" and "about three
     * weeks" more often than the doctor does, so the question is asked where
     * the answer is actually given.
     */
    const [durations, setDurations] = useState<Map<number, number>>(new Map());
    const symptomCount = picked.filter((c) => c.kind === "symptom").length;
    const [doctorId, setDoctorId] = useState(defaultDoctorId);
    // Staged only — no visit_id exists yet to attach these to. Uploaded right
    // after Save actually creates the visit; see handleSave.
    const [stagedAttachments, setStagedAttachments] = useState<StagedAttachment[]>([]);

    // The doctor <select> has no placeholder option, so a value that is not in
    // `doctors` renders as the first option while still SUBMITTING the unlisted
    // id — a silent mis-assignment. Keep the state and the list in agreement.
    useEffect(() => {
        if (!doctors.length) return;
        if (doctors.some((d) => d.id === doctorId)) return;
        setDoctorId(doctors[0].id);
    }, [doctors, doctorId]);

    const [errors, setErrors] = useState<Record<string, boolean>>({});
    const [visitStats, setVisitStats] = useState<{ visit_count: number; last_visit_at: string | null } | null>(null);

    // ── Money ──────────────────────────────────────────────────────────────
    // Loaded once when the modal opens, not per doctor-change: a clinic has a
    // handful of doctors and the desk may switch between them twice before
    // saving, which should not be two more round trips mid-form.
    const hospitalId = useHospitalId();
    const [feeCtx, setFeeCtx] = useState<FeeContext | null>(null);
    const [fee, setFee] = useState<FeeState>(INITIAL_FEE_STATE);
    useEffect(() => {
        if (!hospitalId) return;
        let alive = true;
        fetchFeeContext(hospitalId)
            .then((ctx) => { if (alive) setFeeCtx(ctx); })
            // Non-fatal: a clinic must still be able to register a patient when
            // the fee read fails. The rail simply shows no money controls.
            .catch((err) => console.warn("fetchFeeContext failed (non-fatal):", err));
        return () => { alive = false; };
    }, [hospitalId]);

    // Keyboard flow (receptionists live on the keyboard): Enter advances
    // through this field order; once every required field is complete, Enter
    // triggers Save from anywhere in the form.
    const nameRef = useRef<HTMLInputElement>(null);
    const ageRef = useRef<HTMLInputElement>(null);
    const genderRef = useRef<HTMLSelectElement>(null);
    const phoneRef = useRef<HTMLInputElement>(null);
    const symptomRef = useRef<HTMLInputElement>(null);
    const doctorRef = useRef<HTMLSelectElement>(null);
    const fieldOrder: React.RefObject<HTMLElement | null>[] = existing
        ? [doctorRef, symptomRef]
        : [nameRef, phoneRef, ageRef, genderRef, doctorRef, symptomRef];

    useEffect(() => {
        // Land the cursor where typing starts: the first empty field.
        const first = existing ? symptomRef : (prefillName ? phoneRef : nameRef);
        first.current?.focus();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (!existingPatient) { setVisitStats(null); return; }
        let cancelled = false;
        fetchPatientVisitStats([existingPatient.id])
            .then((map) => { if (!cancelled) setVisitStats(map.get(existingPatient.id) ?? { visit_count: 0, last_visit_at: null }); })
            .catch((err) => console.warn("fetchPatientVisitStats failed (non-fatal):", err));
        return () => { cancelled = true; };
    }, [existingPatient]);

    // ── Duplicate watch ────────────────────────────────────────────────────
    // Silent: while the receptionist types a name or number, the DB is searched
    // in the background. The match arrives as a DROPDOWN under the identity
    // row rather than a banner that grows the form — Anmol, 2026-09-05:
    // "a drop-down which can simply cover age and gender... instead of
    // extending the height of this whole thing randomly."
    const [dup, setDup] = useState<DBPatient | null>(null);
    const [dupDismissed, setDupDismissed] = useState(false);
    const identityRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (existing) { setDup(null); return; }
        const nm = name.trim();
        if (phone.length < 4 && nm.length < 3) { setDup(null); return; }
        let cancelled = false;
        const timer = setTimeout(async () => {
            try {
                let match: DBPatient | null = null;
                if (phone.length >= 4) {
                    const rows = await searchPatients(phone);
                    match = rows.find((r) => r.phone === phone) ?? rows.find((r) => r.phone?.startsWith(phone)) ?? null;
                }
                if (!match && nm.length >= 3) {
                    const rows = await searchPatients(nm);
                    match = rows.find((r) => r.name.trim().toLowerCase() === nm.toLowerCase()) ?? null;
                }
                if (!cancelled) {
                    setDup(match);
                    // A NEW match is worth showing again even if the last one
                    // was waved away — dismissal is per-suggestion, not a mute.
                    if (match) setDupDismissed(false);
                }
            } catch { /* silent — dedupe is best-effort */ }
        }, 350);
        return () => { cancelled = true; clearTimeout(timer); };
    }, [name, phone, existing]);

    // Clicking anywhere outside the identity block closes the suggestion, the
    // way any dropdown does. Escape is left to ModalShell (it closes the modal)
    // so there is exactly one meaning for that key on this surface.
    const dupOpen = !!dup && !dupDismissed && !existing;
    useEffect(() => {
        if (!dupOpen) return;
        const onDown = (e: MouseEvent) => {
            if (!identityRef.current?.contains(e.target as Node)) setDupDismissed(true);
        };
        document.addEventListener("mousedown", onDown);
        return () => document.removeEventListener("mousedown", onDown);
    }, [dupOpen]);

    // ── Fee, derived ───────────────────────────────────────────────────────
    const doctorCard = feeCtx?.feesByDoctor.get(doctorId);
    const baseFee = feeCtx ? resolveFee(doctorCard, fee.visitType) : null;
    const breakdown = feeCtx && baseFee !== null
        ? computeFee({
            base: baseFee,
            discountKind: fee.discountKind,
            discountValue: Number(fee.discountValue) || 0,
            gstEnabled: feeCtx.policy.gstEnabled,
            gstPercent: feeCtx.policy.gstPercent,
        })
        : null;

    // Seeds the visit type from the last visit once the stats land — a
    // DEFAULT, never a decision. Guarded by a ref so it fires exactly once:
    // without it, a receptionist who deliberately flipped Follow-up back to
    // New would have it flipped again under them on the next render.
    const feeSeeded = useRef(false);
    useEffect(() => {
        if (feeSeeded.current || !visitStats) return;
        feeSeeded.current = true;
        const next = defaultVisitType(visitStats.last_visit_at);
        if (next !== INITIAL_FEE_STATE.visitType) setFee((f) => ({ ...f, visitType: next }));
    }, [visitStats]);

    const phoneOk = /^\d{10}$/.test(phone);
    const dupPhoneHit = !existing && !!dup && dup.phone === phone && phoneOk;
    const dupExact = dupPhoneHit && dup!.name.trim().toLowerCase() === name.trim().toLowerCase();
    const formComplete = existing
        ? symptomCount > 0
        : !!name.trim() && !!age.trim() && !!gender && phoneOk && symptomCount > 0;

    // Anything typed / picked yet? While true, ModalShell ignores a stray
    // backdrop click so a half-filled registration can't be lost to one.
    const dirty = existing
        ? picked.length > 0 || stagedAttachments.length > 0
        : !!name.trim() || !!phone || !!age.trim() || !!gender || !!dateOfBirth ||
          picked.length > 0 || stagedAttachments.length > 0;

    const validate = () => {
        const nextErrors: Record<string, boolean> = {};
        if (!existing) {
            if (!name.trim()) nextErrors.name = true;
            if (!age.trim()) nextErrors.age = true;
            if (!gender) nextErrors.gender = true;
            if (!phoneOk) nextErrors.phone = true;
        }
        if (!symptomCount) nextErrors.symptoms = true;
        setErrors(nextErrors);
        return Object.keys(nextErrors).length === 0;
    };

    // The QR modal a click here opens lives above this modal entirely (see
    // GatewaySessionsProvider, mounted by WorkspaceShell).
    const gateway = useGatewaySessions();

    // Shared by both Save and "Upload from phone": same validation, same
    // duplicate guard. Returns undefined (and has already set the right error
    // state) when the form isn't ready to submit.
    const resolveExisting = (): DBPatient | null | undefined => {
        if (!validate()) return undefined;
        // Duplicate guard: same phone + same name = that IS this patient —
        // create the visit for them instead of minting a twin record. Same
        // phone under a different name is ambiguous, so block and let the
        // dropdown resolve it explicitly.
        if (dupExact) return dup;
        if (dupPhoneHit) {
            setErrors((e) => ({ ...e, phone: true }));
            setDupDismissed(false);
            return undefined;
        }
        return existingPatient;
    };

    const buildCreateOpts = (
        asExisting: DBPatient | null,
        onSuccess?: (r: { patientName: string; patientId: string; visitId: string }) => void
    ) => ({
        existingPatient: asExisting,
        name,
        phone,
        age,
        dateOfBirth,
        gender,
        // Symptoms and volunteered history both land in `visit_observations`;
        // only symptoms carry into the queue's "Symptoms" column.
        observableIds: picked.map((s) => s.observableId),
        symptomNames: picked.filter((c) => c.kind === "symptom").map((c) => c.label),
        observableDurations: new Map(
            [...durations].filter(([id]) => picked.some((c) => c.observableId === id))
        ),
        // Measurements left registration entirely (see the file header) — the
        // contract keeps the field so the queue-side flow that will take them
        // needs no signature change.
        vitals: {} as Partial<Vitals>,
        doctorId,
        doctorName: doctors.find((d) => d.id === doctorId)?.name ?? "",
        attachments: stagedAttachments.map((sa) => ({ file: sa.file, attachmentType: sa.attachmentType })),
        // null when this clinic has no fee for the assigned doctor — nothing
        // is written and the rail showed no money controls.
        payment: breakdown
            ? {
                visitType: fee.visitType,
                base: breakdown.base,
                discount: breakdown.discount,
                gstAmount: breakdown.gstAmount,
                total: breakdown.total,
                discountKind: fee.discountKind,
                discountPercent: fee.discountKind === "percent" ? Number(fee.discountValue) || 0 : null,
                gstPercent: feeCtx?.policy.gstPercent ?? 0,
                // "Undecided" saves as pending: the visit is registered either
                // way, and an unanswered question must never be recorded as
                // money collected.
                status: fee.status === "paid" ? ("paid" as const) : ("pending" as const),
                method: fee.status === "paid" ? fee.method : null,
            }
            : null,
        onSuccess,
    });

    // Synchronous and instant on purpose (2026-08-24): registering used to
    // block on 2-3 sequential network round trips with the modal sitting open
    // the whole time — reported as "very slow".
    const handleSave = () => {
        const asExisting = resolveExisting();
        if (asExisting === undefined) return;
        onCreate(buildCreateOpts(asExisting));
        onClose();
    };

    // "Upload from phone" is the one case that CANNOT be fire-and-forget the
    // way Save is: a visit_gateways row needs a real visit_id, and none exists
    // until the background create lands. So this closes the form immediately
    // and opens the QR modal in its own loading state, swapping it for the
    // real QR once `onSuccess` fires.
    const handleUploadFromPhone = () => {
        const asExisting = resolveExisting();
        if (asExisting === undefined) return;
        const patientLabel = asExisting?.name ?? name.trim();
        gateway.beginCreatingVisit(patientLabel);
        onCreate(
            buildCreateOpts(asExisting, ({ patientId, visitId }) => {
                gateway.openForVisit({ visitId, patientId, patientLabel, visitLabel: "" });
            })
        );
        onClose();
    };

    const fieldIndexOf = (target: HTMLElement) =>
        fieldOrder.findIndex((r) => r.current && (r.current === target || r.current.contains(target)));

    const isIncomplete = (orderIdx: number) => {
        const ref = fieldOrder[orderIdx];
        if (ref === nameRef) return !name.trim();
        if (ref === ageRef) return !age.trim();
        if (ref === genderRef) return !gender;
        if (ref === phoneRef) return !phoneOk;
        if (ref === symptomRef) return symptomCount === 0;
        return false;
    };

    const advanceFrom = (target: HTMLElement) => {
        const idx = fieldIndexOf(target);
        const next = idx >= 0 && idx < fieldOrder.length - 1
            ? fieldOrder[idx + 1]
            : fieldOrder.find((r, i) => i !== idx && isIncomplete(i));
        next?.current?.focus();
    };

    const retreatFrom = (target: HTMLElement) => {
        const idx = fieldIndexOf(target);
        if (idx > 0) fieldOrder[idx - 1]?.current?.focus();
    };

    // Keyboard nav across the form:
    //  · Enter  → save when every required field is filled, else walk forward.
    //  · ↓ / ↑  → walk forward / back one field.
    // The widgets that give their own vertical arrows a meaning — AgeInput,
    // the <select>s, the date input and ObservablePicker — all call
    // preventDefault first, so `e.defaultPrevented` hands the arrows straight
    // back to them.
    const handleFormKeyDown = (e: React.KeyboardEvent) => {
        if (e.defaultPrevented) return;
        const target = e.target as HTMLElement;

        if (e.key === "Enter") {
            e.preventDefault();
            if (formComplete) { handleSave(); return; }
            advanceFrom(target);
            return;
        }

        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            if (e.key === "ArrowDown") advanceFrom(target); else retreatFrom(target);
        }
    };

    // fd-field lives in FrontDeskStyles: unlayered so it beats Cortex's global
    // input/select element rules, which Tailwind utilities (layered) cannot.
    const fieldClass = (err?: boolean) => `fd-field ${err ? "fd-field-error" : ""}`;

    return (
        <ModalShell
            eyebrow=""
            title={existing ? t("newVisit") : t("registerVisit")}
            subtitle="Add patient details and create today's visit"
            icon={<UserPlus size={19} strokeWidth={2.2} />}
            onClose={onClose}
            dirtyGuard={dirty}
            maxWidth={936}
            flushBody
            footer={
                <>
                    <button
                        onClick={onClose}
                        className="h-10 rounded-[10px] border-[1.5px] border-[#e6e3f1] bg-white px-[18px] text-[13.5px] font-bold text-[#5a6472] transition-colors hover:border-[#d5cfec] hover:bg-[#f8f7fd]"
                    >
                        {t("cancel")}
                    </button>
                    <button
                        onClick={handleSave}
                        className="flex h-10 items-center gap-[7px] rounded-[10px] bg-[#5b4fe9] px-5 text-[13.5px] font-bold text-white shadow-[0_3px_12px_rgba(91,79,233,0.4),0_0_16px_rgba(91,79,233,0.24)] transition-[background-color,box-shadow] duration-100 hover:bg-[#4a3fd4] hover:shadow-[0_3px_16px_rgba(91,79,233,0.55)]"
                    >
                        Save &amp; Create Visit
                        <ArrowRight size={15} strokeWidth={2.4} />
                    </button>
                </>
            }
        >
            {/* Two columns on desktop, one on anything narrow. The rail is a
                fixed 320 rather than a fraction so the form never squeezes
                below a comfortable reading width on a 1280 screen. */}
            <div
                onKeyDown={handleFormKeyDown}
                className="grid grid-cols-[minmax(0,1fr)_292px] items-start gap-0 max-[900px]:grid-cols-1"
            >
                {/* ── Left: the form ─────────────────────────────────────── */}
                <div className="min-w-0 px-[19px] pb-[15px] pt-[14px]">

                    {existing && existingPatient ? (
                        <div className="mb-[14px] flex items-center gap-3 rounded-[12px] border border-[#e5ddfa] bg-[linear-gradient(135deg,rgba(124,92,240,0.08),rgba(124,92,240,0.02))] px-3 py-[10px]">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px] bg-[#efeafd] text-[14px] font-bold text-[#6d28d9]">
                                {initials(existingPatient.name)}
                            </div>
                            <div className="min-w-0">
                                <div className="truncate text-[14px] font-bold text-[#161d29]">{existingPatient.name}</div>
                                <div className="mt-[1px] text-[12px] text-[#5a6472]">
                                    {existingPatient.phone}
                                    {visitStats && visitStats.visit_count > 0 && (
                                        <>
                                            <span className="mx-[6px] text-[#a8aeba]">·</span>
                                            {t("prefillFrom", { n: visitStats.visit_count })}
                                        </>
                                    )}
                                </div>
                            </div>
                            <UserCheck size={17} className="ml-auto shrink-0 text-[#8b6ff2]" />
                        </div>
                    ) : (
                        <>
                            <SectionHead icon={<UserRound size={15} />} text="Patient Details" />

                            {/* `relative` anchors the duplicate dropdown, which
                                overlays the rows beneath instead of pushing
                                them down. */}
                            <div ref={identityRef} className="relative">
                                <div className="grid grid-cols-2 gap-x-[14px] gap-y-[11px]">
                                    <Field icon={<UserRound size={13} />} label="Full name" required error={errors.name ? t("errRequired") : undefined}>
                                        <input
                                            ref={nameRef}
                                            value={name}
                                            onChange={(e) => setName(e.target.value)}
                                            placeholder={t("phName")}
                                            className={fieldClass(errors.name)}
                                        />
                                    </Field>

                                    <Field
                                        icon={<Phone size={13} />}
                                        label="Phone number"
                                        required
                                        error={errors.phone ? (dupPhoneHit && !dupExact ? t("dupPhone", { name: dup!.name }) : t("errPhone10")) : undefined}
                                    >
                                        <PhoneInput
                                            inputRef={phoneRef}
                                            value={phone}
                                            onChange={(digits) => {
                                                setPhone(digits);
                                                if (/^\d{10}$/.test(digits)) setErrors((er) => ({ ...er, phone: false }));
                                            }}
                                            error={!!errors.phone}
                                            placeholder={t("phPhone")}
                                        />
                                    </Field>

                                    {/* Age is primary; the calendar is the way
                                        in for someone who knows the date but not
                                        the number. Same row, one decision. */}
                                    <Field icon={<Cake size={13} />} label="Age" required error={errors.age ? t("errRequired") : undefined}>
                                        <div className="flex items-center gap-[8px]">
                                            <div className="min-w-0 flex-1">
                                                <AgeInput
                                                    inputRef={ageRef}
                                                    value={age}
                                                    onChange={(v) => { setAge(v); if (v) setErrors((er) => ({ ...er, age: false })); }}
                                                    error={!!errors.age}
                                                    placeholder={t("phAge")}
                                                />
                                            </div>
                                            <span className="shrink-0 text-[12px] font-medium text-[#a8aeba]">or</span>
                                            <input
                                                type="date"
                                                className="fd-field w-[152px] shrink-0 px-[9px] text-[12.5px]"
                                                max={todayIso()}
                                                value={dateOfBirth}
                                                aria-label={t("fldDob")}
                                                title={dobMattersFor(Number.parseInt(age, 10)) ? t("fldDobNeeded") : t("fldDob")}
                                                onChange={(e) => {
                                                    const dob = e.target.value;
                                                    setDateOfBirth(dob);
                                                    // The date is the harder fact; age follows it
                                                    // rather than being asked twice and allowed
                                                    // to drift.
                                                    const derived = ageInYears(dob);
                                                    if (derived !== null) {
                                                        setAge(String(derived));
                                                        setErrors((er) => ({ ...er, age: false }));
                                                    }
                                                }}
                                            />
                                        </div>
                                    </Field>

                                    <Field icon={<Users size={13} />} label="Gender" required error={errors.gender ? t("errRequired") : undefined}>
                                        <select
                                            ref={genderRef}
                                            value={gender}
                                            onChange={(e) => { setGender(e.target.value); setErrors((er) => ({ ...er, gender: false })); }}
                                            className={fieldClass(errors.gender)}
                                        >
                                            <option value="" disabled>{t("selectGender")}</option>
                                            <option value="Male">{t("male")}</option>
                                            <option value="Female">{t("female")}</option>
                                            <option value="Other">{t("other")}</option>
                                        </select>
                                    </Field>
                                </div>

                                {/* ── The duplicate suggestion ────────────
                                    Floats over the rows below rather than
                                    growing the form. One tap adopts the
                                    patient; a click anywhere else dismisses. */}
                                {dupOpen && dup && (
                                    <div className="absolute inset-x-0 top-[74px] z-40 overflow-hidden rounded-[12px] border border-[#d9d1f8] bg-white shadow-[0_16px_40px_rgba(13,18,38,0.18)]">
                                        <div className="border-b border-[#f0edfa] bg-[#faf8ff] px-[12px] py-[7px] text-[11px] font-bold uppercase tracking-[0.07em] text-[#7c5cf0]">
                                            {dupPhoneHit && !dupExact ? "This number is already registered" : "This patient already exists"}
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => { setDupDismissed(true); onUseExisting(dup); }}
                                            className="flex w-full cursor-pointer items-center gap-[11px] border-0 bg-transparent px-[12px] py-[10px] text-left transition-colors hover:bg-[#f7f5ff]"
                                        >
                                            <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[11px] bg-[#efeafd] text-[13px] font-bold text-[#6d28d9]">
                                                {initials(dup.name)}
                                            </span>
                                            <span className="min-w-0 flex-1">
                                                <span className="block truncate text-[13.5px] font-bold text-[#161d29]">{dup.name}</span>
                                                <span className="block text-[12px] tabular-nums text-[#6b7280]">
                                                    {dup.phone}
                                                    {dup.age ? <span className="ml-[8px] text-[#a8aeba]">{dup.age}y</span> : null}
                                                    {dup.gender ? <span className="ml-[6px] text-[#a8aeba]">{dup.gender}</span> : null}
                                                </span>
                                            </span>
                                            <span className="flex h-[32px] shrink-0 items-center gap-[6px] rounded-[9px] bg-[#5b4fe9] px-[12px] text-[12.5px] font-bold text-white">
                                                <UserCheck size={14} />
                                                Use this patient
                                            </span>
                                        </button>
                                    </div>
                                )}
                            </div>

                            <div className="my-[16px] h-px bg-[#eeebf7]" />
                        </>
                    )}

                    <SectionHead icon={<Calendar size={15} />} text="Today's Visit" className={existing ? "" : ""} />

                    <Field icon={<Stethoscope size={13} />} label="Assign to doctor" required>
                        <select ref={doctorRef} value={doctorId} onChange={(e) => setDoctorId(e.target.value)} className={fieldClass()}>
                            {doctors.map((d) => (
                                <option key={d.id} value={d.id}>{d.name}</option>
                            ))}
                        </select>
                    </Field>

                    {/* ONE field for today's complaints AND volunteered history
                        — the same catalogue, one search, exactly like Cortex.
                        It GROWS as chips wrap rather than scrolling a fixed
                        slot. Structured observables, never free text: the
                        engine and the doctor's chart both read these ids. */}
                    <Field className="mt-[11px]" icon={<Thermometer size={13} />} label="Symptoms &amp; history" required error={errors.symptoms ? t("errSymptom") : undefined}>
                        <ObservablePicker
                            kinds={["symptom", "history"]}
                            inputRef={symptomRef}
                            selected={picked}
                            onChange={(next) => {
                                setPicked(next);
                                if (next.some((c) => c.kind === "symptom")) setErrors((e) => ({ ...e, symptoms: false }));
                            }}
                            error={!!errors.symptoms}
                            placeholder={t("phComplaints")}
                            catalogLabel={t("bothCatalog")}
                            noMatchLabel={t("noSymptomMatch")}
                            durations={durations}
                            onDurationChange={(id, days) =>
                                setDurations((curr) => {
                                    const next = new Map(curr);
                                    if (days === null) next.delete(id); else next.set(id, days);
                                    return next;
                                })
                            }
                        />
                    </Field>

                    <div className="my-[16px] h-px bg-[#eeebf7]" />

                    <Field icon={<Paperclip size={13} />} label="Attachment" optional>
                        <AttachDocumentField
                            files={stagedAttachments}
                            onChange={setStagedAttachments}
                            onUploadFromPhone={handleUploadFromPhone}
                        />
                    </Field>
                </div>

                {/* ── Right: the payment rail ────────────────────────────── */}
                <div className="min-w-0 border-l border-[#eeebf7] bg-[#fbfaff] px-[14px] pb-[15px] pt-[14px] max-[900px]:border-l-0 max-[900px]:border-t">
                    <PaymentRail
                        state={fee}
                        onChange={setFee}
                        policy={feeCtx?.policy ?? { currency: "INR", gstEnabled: false, gstPercent: 18, allowDiscount: true }}
                        baseFee={baseFee}
                        breakdown={breakdown}
                        doctorName={doctors.find((d) => d.id === doctorId)?.name ?? ""}
                    />
                </div>
            </div>
        </ModalShell>
    );
}

/** A section heading: violet glyph, dark bold label. Bigger than the old
 *  uppercase micro-label because this modal now has room for a real
 *  hierarchy, and two sections do not need shouting to be told apart. */
function SectionHead({ icon, text, className = "" }: { icon: React.ReactNode; text: string; className?: string }) {
    return (
        <div className={`mb-[11px] flex items-center gap-[8px] ${className}`}>
            <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[8px] bg-[#eeecfe] text-[#5b4fe9]">
                {icon}
            </span>
            <span className="text-[15.5px] font-extrabold tracking-[-0.01em] text-[#161d29]">{text}</span>
        </div>
    );
}

// SectionLabel / Field / AgeInput / PhoneInput live in ./fields — the shared
// Bhor form primitives (also used by the Patients page's Edit Details modal).
void SectionLabel;
