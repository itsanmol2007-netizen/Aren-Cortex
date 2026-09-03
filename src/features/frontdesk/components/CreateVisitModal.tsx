import { useEffect, useMemo, useRef, useState } from "react";
import { Activity, ArrowRight, Cake, Calendar, Paperclip, Phone, Sparkles, Stethoscope, Thermometer, UserRound, UserCheck, Users } from "lucide-react";
import { fetchPatientVisitStats, searchPatients, type DBDoctor, type DBPatient } from "@/lib/db";
import type { IntakeChip } from "@/lib/db/synapse";
import type { AttachmentType } from "@/lib/attachments/types";
import { RELEVANT_FIELDS, FIELD_BY_KEY, type MeasureFieldKey } from "@/features/consult/measures";
import type { Vitals } from "@/types";
import { initials } from "../utils";
import { useT } from "../i18n/i18n";
import { ModalShell } from "./ModalShell";
import { ObservablePicker } from "./ObservablePicker";
import { MeasurementsModal } from "./MeasurementsModal";
import { AgeInput, Field, PhoneInput, SectionLabel } from "./fields";
import { IntakeAttachmentsField, type StagedAttachment } from "./IntakeAttachmentsField";
import { useGatewaySessions } from "./gateway/GatewaySessionsProvider";
import { ageInYears, dobMattersFor, todayIso } from "@/lib/growth/age";

type MeasureValues = Partial<Record<MeasureFieldKey, string>>;

// Which measurements the entered symptoms/history make worth taking — the same
// RELEVANT_FIELDS map Cortex's MeasurementsCard reads, keyed on the engine
// signals each chip carries (fetchIntakeChips attaches `signalIds`). A
// PREGNANCY chip asks for LMP + G-P-L-A, FEVER for temperature, and so on. No
// engine run, just the static map.
function relevantFromChips(chips: IntakeChip[]): {
    keys: Set<MeasureFieldKey>;
    because: Map<MeasureFieldKey, string>;
} {
    const keys = new Set<MeasureFieldKey>();
    const because = new Map<MeasureFieldKey, string>();
    for (const c of chips) {
        for (const sig of c.signalIds) {
            for (const k of RELEVANT_FIELDS[sig] ?? []) {
                keys.add(k);
                if (!because.has(k)) because.set(k, c.label);
            }
        }
    }
    return { keys, because };
}

/** "BP 120/80 · Weight 68 · +1" — the one-line résumé on the collapsed row. */
function measureSummary(values: MeasureValues): string {
    const parts: string[] = [];
    for (const [k, v] of Object.entries(values)) {
        if (!v || !String(v).trim()) continue;
        const f = FIELD_BY_KEY.get(k as MeasureFieldKey);
        parts.push(`${f?.printLabel ?? k} ${v}`);
    }
    if (parts.length <= 2) return parts.join("  ·  ");
    return `${parts.slice(0, 2).join("  ·  ")}  ·  +${parts.length - 2}`;
}

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
    // real work (patient lookup/create, visit create, attachments) in the
    // background and reconciles the queue itself. Nothing here awaits it.
    onCreate: (opts: {
        existingPatient: DBPatient | null;
        name: string;
        phone: string;
        age: string;
        dateOfBirth: string;
        gender: string;
        observableIds: number[];
        symptomNames: string[];
        vitals: Partial<Vitals>;
        doctorId: string;
        doctorName: string;
        attachments: { file: File; attachmentType: AttachmentType }[];
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
    const symptomCount = picked.filter((c) => c.kind === "symptom").length;
    const [measures, setMeasures] = useState<MeasureValues>({});
    const [measuresOpen, setMeasuresOpen] = useState(false);
    const [doctorId, setDoctorId] = useState(defaultDoctorId);

    // Which measurements the entered complaints/history make relevant, for the
    // measurements sub-modal to surface first.
    const relevant = useMemo(() => relevantFromChips(picked), [picked]);
    const measureSummaryText = measureSummary(measures);
    // Staged only — no visit_id exists yet to attach these to. Uploaded (same
    // pipeline as everywhere else attachments happen) right after Save
    // actually creates the visit; see handleSave.
    const [stagedAttachments, setStagedAttachments] = useState<StagedAttachment[]>([]);

    // The doctor <select> has no placeholder option, so a value that is not in
    // `doctors` renders as the first option while still SUBMITTING the unlisted
    // id — a silent mis-assignment. Two ordinary cases produce exactly that:
    // the cached doctor list is still empty on first paint, and a patient whose
    // stored primary doctor no longer practises at this clinic. Keep the state
    // and the list in agreement so what is shown is what is saved.
    useEffect(() => {
        if (!doctors.length) return;
        if (doctors.some((d) => d.id === doctorId)) return;
        setDoctorId(doctors[0].id);
    }, [doctors, doctorId]);
    const [errors, setErrors] = useState<Record<string, boolean>>({});
    const [visitStats, setVisitStats] = useState<{ visit_count: number; last_visit_at: string | null } | null>(null);

    // Keyboard flow (receptionists live on the keyboard): Enter advances
    // through this field order; once every required field is complete, Enter
    // triggers Save from anywhere in the form.
    const nameRef = useRef<HTMLInputElement>(null);
    const ageRef = useRef<HTMLInputElement>(null);
    const genderRef = useRef<HTMLSelectElement>(null);
    const phoneRef = useRef<HTMLInputElement>(null);
    const symptomRef = useRef<HTMLInputElement>(null);
    const doctorRef = useRef<HTMLSelectElement>(null);
    // Phone sits directly under the name so an existing patient surfaces the
    // instant both are typed — before age/gender are even asked. Reading
    // order otherwise follows the visual layout: Phone+Gender share a row,
    // then Age+DOB share the next one (see the reference-matched grid below).
    const fieldOrder: React.RefObject<HTMLElement | null>[] = existing
        ? [symptomRef, doctorRef]
        : [nameRef, phoneRef, genderRef, ageRef, symptomRef, doctorRef];

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

    // Silent duplicate watch: while the receptionist types a name or number,
    // the DB is searched in the background. A phone hit is authoritative; a
    // full-name hit is a softer suggestion. The banner below the fields lets
    // them convert to "new visit for that patient" in one click — the form
    // never creates a second patient with the same name + number.
    const [dup, setDup] = useState<DBPatient | null>(null);
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
                if (!cancelled) setDup(match);
            } catch { /* silent — dedupe is best-effort */ }
        }, 350);
        return () => { cancelled = true; clearTimeout(timer); };
    }, [name, phone, existing]);

    const phoneOk = /^\d{10}$/.test(phone);
    const dupPhoneHit = !existing && !!dup && dup.phone === phone && phoneOk;
    const dupExact = dupPhoneHit && dup!.name.trim().toLowerCase() === name.trim().toLowerCase();
    const formComplete = existing
        ? symptomCount > 0
        : !!name.trim() && !!age.trim() && !!gender && phoneOk && symptomCount > 0;

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
    // GatewaySessionsProvider, mounted by WorkspaceShell) — this component
    // only ever tells it to start, never renders any of it.
    const gateway = useGatewaySessions();

    // Shared by both Save and "Upload from phone": same validation, same
    // duplicate guard. Returns null (and has already set the right error
    // state / banner) when the form isn't ready to submit — neither caller
    // proceeds past that.
    const resolveExisting = (): DBPatient | null | undefined => {
        if (!validate()) return undefined;
        // Duplicate guard: same phone + same name = that IS this patient —
        // create the visit for them instead of minting a twin record. Same
        // phone under a different name is ambiguous, so block and let the
        // banner's button resolve it explicitly.
        if (dupExact) return dup;
        if (dupPhoneHit) {
            setErrors((e) => ({ ...e, phone: true }));
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
        // only symptoms carry into the queue's "Symptoms" column (symptomNames).
        observableIds: picked.map((s) => s.observableId),
        symptomNames: picked.filter((c) => c.kind === "symptom").map((c) => c.label),
        vitals: measures as Partial<Vitals>,
        doctorId,
        doctorName: doctors.find((d) => d.id === doctorId)?.name ?? "",
        attachments: stagedAttachments.map((sa) => ({ file: sa.file, attachmentType: sa.attachmentType })),
        onSuccess,
    });

    // Synchronous and instant on purpose (2026-08-24): registering used to
    // block on 2-3 sequential network round trips (find/create patient,
    // create visit) with the modal sitting open the whole time — reported as
    // "very slow". Validation still runs first (bad data shouldn't create a
    // phantom queue row), but the moment it passes, this closes immediately
    // and hands everything to onCreate, which inserts an optimistic row and
    // does the real work in the background — see useVisitActions.createNewVisit.
    const handleSave = () => {
        const asExisting = resolveExisting();
        if (asExisting === undefined) return;
        onCreate(buildCreateOpts(asExisting));
        onClose();
    };

    // "Upload from phone" during intake is the one case that CANNOT be
    // fire-and-forget the way Save is: a visit_gateways row needs a real
    // visit_id, and none exists until the background create actually lands.
    // So this closes the intake form immediately (same as Save) but opens
    // the QR modal in its own "creating the visit" loading state right away
    // — `gateway.beginCreatingVisit` — and only swaps that for the real QR
    // once `onSuccess` fires with the visit createNewVisit just made. The
    // validation and duplicate-guard rules are IDENTICAL to Save's; this
    // never skips a required field just because the door out is a QR
    // code instead of a toast.
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

    // Enter anywhere in the form: save when complete, otherwise walk to the
    // next field (the SymptomPicker preventDefaults its own Enter when it is
    // consuming the keystroke to pick a match).
    const handleFormKeyDown = (e: React.KeyboardEvent) => {
        if (e.key !== "Enter" || e.defaultPrevented) return;
        e.preventDefault();
        if (formComplete) { handleSave(); return; }
        const target = e.target as HTMLElement;
        const idx = fieldOrder.findIndex((r) => r.current && (r.current === target || r.current.contains(target)));
        const next = idx >= 0 && idx < fieldOrder.length - 1
            ? fieldOrder[idx + 1]
            : fieldOrder.find((r, i) => i !== idx && isIncomplete(i));
        next?.current?.focus();
    };

    const isIncomplete = (orderIdx: number) => {
        const ref = fieldOrder[orderIdx];
        if (ref === nameRef) return !name.trim();
        if (ref === ageRef) return !age.trim();
        if (ref === genderRef) return !gender;
        if (ref === phoneRef) return !phoneOk;
        if (ref === symptomRef) return symptomCount === 0;
        return false;
    };

    // fd-field lives in FrontDeskStyles: unlayered so it beats Cortex's global
    // input/select element rules, which Tailwind utilities (layered) cannot.
    const fieldClass = (err?: boolean) => `fd-field ${err ? "fd-field-error" : ""}`;

    return (
        <ModalShell
            eyebrow={t("intakeEyebrow")}
            title={existing ? t("newVisit") : t("registerVisit")}
            icon={<Sparkles size={19} strokeWidth={2.2} />}
            onClose={onClose}
            footer={
                <>
                    <button
                        onClick={onClose}
                        className="h-10 rounded-[10px] border-[1.5px] border-[#e6e3f1] bg-white px-[18px] text-[13.5px] font-bold text-[#5a6472] transition-colors hover:border-[#d5cfec] hover:bg-[#f8f7fd]"
                    >
                        {t("cancel")}
                    </button>
                    {/* Registration is a front door, not a status change — it wears
                        the loud brand treatment like the header mark and the launcher
                        +. Was the purple→blue brand gradient; flattened to solid
                        brand blue (#2f6bed) with a glow instead of a hue shift —
                        session 2026-08-23, Anmol's call: the gradient "looked
                        terrible". Every other front-door button (New Visit, Print,
                        Retry) carries the identical treatment — see §7.7. */}
                    <button
                        onClick={handleSave}
                        className="flex h-10 items-center gap-[7px] rounded-[10px] bg-[#2f6bed] px-5 text-[13.5px] font-bold text-white shadow-[0_3px_12px_rgba(47,107,237,0.4),0_0_16px_rgba(47,107,237,0.28)] transition-[background-color,box-shadow] duration-100 hover:bg-[#1d51c9] hover:shadow-[0_3px_16px_rgba(47,107,237,0.55),0_0_22px_rgba(47,107,237,0.38)]"
                    >
                        {t("save")}
                        <ArrowRight size={15} strokeWidth={2.4} />
                    </button>
                </>
            }
        >
            <div onKeyDown={handleFormKeyDown}>
                {existing && existingPatient ? (
                    <div className="mb-3 flex items-center gap-3 rounded-[11px] border border-[#e5ddfa] bg-[linear-gradient(135deg,rgba(124,92,240,0.08),rgba(124,92,240,0.02))] px-3 py-[8px]">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[#efeafd] text-[13px] font-bold text-[#6d28d9]">
                            {initials(existingPatient.name)}
                        </div>
                        <div className="min-w-0">
                            <div className="truncate text-[13.5px] font-bold text-[#161d29]">{existingPatient.name}</div>
                            <div className="mt-[1px] text-[11.5px] text-[#5a6472]">
                                {existingPatient.phone}
                                {visitStats && visitStats.visit_count > 0 && (
                                    <>
                                        <span className="mx-[6px] text-[#a8aeba]">·</span>
                                        {t("prefillFrom", { n: visitStats.visit_count })}
                                    </>
                                )}
                            </div>
                        </div>
                        <UserCheck size={16} className="ml-auto shrink-0 text-[#8b6ff2]" />
                    </div>
                ) : (
                    <>
                        <SectionLabel text={t("secPatient")} />
                        {/* Two equal columns, not the old fixed-120px/1fr split —
                            matches the reference layout exactly: Name full width,
                            then Phone+Gender share a row, then Age+DOB share one. */}
                        <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                            <Field className="col-span-2" icon={<UserRound size={13} />} label={t("fldName")} required error={errors.name ? t("errRequired") : undefined}>
                                <input
                                    ref={nameRef}
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder={t("phName")}
                                    className={fieldClass(errors.name)}
                                />
                            </Field>
                            {/* Phone right under the name: the moment both are typed,
                                the duplicate banner surfaces an existing patient —
                                no need to fill age/gender first. */}
                            <Field
                                icon={<Phone size={13} />}
                                label={t("fldPhone")}
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
                            {/* Plain dropdown, not the segmented M/F/O control — matches
                                the reference exactly; a native select still gets
                                type-to-jump and arrow-key cycling for free. */}
                            <Field icon={<Users size={13} />} label={t("fldGender")} required error={errors.gender ? t("errRequired") : undefined}>
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
                            <Field icon={<Cake size={13} />} label={t("fldAge")} required error={errors.age ? t("errRequired") : undefined}>
                                <AgeInput
                                    inputRef={ageRef}
                                    value={age}
                                    onChange={(v) => { setAge(v); if (v) setErrors((er) => ({ ...er, age: false })); }}
                                    error={!!errors.age}
                                    placeholder={t("phAge")}
                                />
                            </Field>
                            {/* Date of birth — optional always, flagged as needed
                                once the age typed says this is an under-five.
                                WHO growth standards are indexed per month, so
                                for a small child the integer age beside it
                                cannot place them on a curve at all. Reception is
                                where this is genuinely known, which is why the
                                field is here and not only in Cortex. */}
                            <Field
                                icon={<Calendar size={13} />}
                                label={
                                    dobMattersFor(Number.parseInt(age, 10))
                                        ? `${t("fldDob")} — ${t("fldDobNeeded")}`
                                        : t("fldDob")
                                }
                            >
                                <input
                                    type="date"
                                    className="fd-field"
                                    max={todayIso()}
                                    value={dateOfBirth}
                                    onChange={(e) => {
                                        const dob = e.target.value;
                                        setDateOfBirth(dob);
                                        // The date is the harder fact; the age
                                        // field follows it rather than being
                                        // asked twice and allowed to drift.
                                        const derived = ageInYears(dob);
                                        if (derived !== null) {
                                            setAge(String(derived));
                                            setErrors((er) => ({ ...er, age: false }));
                                        }
                                    }}
                                />
                            </Field>
                        </div>

                        {/* Duplicate-patient banner: appears silently as they type;
                            one click turns "register" into "new visit for them". */}
                        {dup && (
                            <div className="mt-[10px] flex items-center gap-[10px] rounded-[11px] border border-[#e2d9fb] bg-[linear-gradient(135deg,rgba(124,92,240,0.09),rgba(124,92,240,0.02))] px-3 py-[8px]">
                                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[#efeafd] text-[12.5px] font-bold text-[#6d28d9]">
                                    {initials(dup.name)}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="truncate text-[12.5px] font-bold text-[#161d29]">
                                        {dup.name}
                                        <span className="ml-[6px] font-medium text-[#8a91a0] tabular-nums">{dup.phone}</span>
                                    </div>
                                    <div className="mt-[1px] text-[11px] font-semibold text-[#7c5cf0]">
                                        {dupPhoneHit && !dupExact ? t("dupPhone", { name: dup.name }) : t("dupExists")}
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => onUseExisting(dup)}
                                    className="flex h-8 shrink-0 items-center gap-[5px] rounded-[8px] bg-[#7c5cf0] px-[11px] text-[11.5px] font-bold text-white shadow-[0_2px_8px_rgba(124,92,240,0.3)] transition-[filter] hover:brightness-110"
                                >
                                    <UserCheck size={13} />
                                    {t("dupUse")}
                                </button>
                            </div>
                        )}
                    </>
                )}

                <SectionLabel text={t("secVisit")} className={existing ? "" : "mt-[14px]"} />

                {/* ONE field for today's complaints AND volunteered history —
                    the same catalogue, one search, exactly like Cortex. Each
                    result row says which it is; history chips wear a violet
                    tint. At least one symptom is required; history is a bonus
                    the doctor gets for free. Split back apart on save. */}
                <Field icon={<Thermometer size={13} />} label={t("fldComplaints")} required error={errors.symptoms ? t("errSymptom") : undefined}>
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
                    />
                </Field>

                <Field className="mt-[10px]" icon={<Stethoscope size={13} />} label={t("fldDoctor")}>
                    <select ref={doctorRef} value={doctorId} onChange={(e) => setDoctorId(e.target.value)} className={fieldClass()}>
                        {doctors.map((d) => (
                            <option key={d.id} value={d.id}>{d.name}</option>
                        ))}
                    </select>
                </Field>

                {/* Measurements — a quiet optional row (like Attachments below).
                    Clicking opens a stacked modal; whatever the desk records
                    there is written to the visit as real measurements so the
                    doctor's vitals card is not empty. */}
                <Field className="mt-[10px]" icon={<Activity size={13} />} label={t("measAddRow")} optional>
                    <button
                        type="button"
                        onClick={() => setMeasuresOpen(true)}
                        className="flex h-[38px] w-full items-center gap-[8px] rounded-[10px] border-[1.5px] border-dashed border-[#d9d3ee] bg-[#f8f8fd] px-3 text-left text-[13px] font-medium text-[#5a6472] transition-colors hover:border-[#7c5cf0] hover:bg-white hover:text-[#161d29]"
                    >
                        <Activity size={14} className="shrink-0 text-[#8b5cf6]" />
                        {measureSummaryText
                            ? <span className="truncate text-[#161d29]">{measureSummaryText}</span>
                            : <span>{t("measAdd")}</span>}
                    </button>
                </Field>

                {/* A field, not a new section — matches the reference exactly
                    (same label weight as Symptoms/Doctor above it, "(Optional)"
                    tag, no section hairline). */}
                <Field className="mt-[10px]" icon={<Paperclip size={13} />} label={t("attachAdd")} optional>
                    <IntakeAttachmentsField
                        files={stagedAttachments}
                        onChange={setStagedAttachments}
                        onUploadFromPhone={handleUploadFromPhone}
                    />
                </Field>
            </div>

            {measuresOpen && (
                <MeasurementsModal
                    values={measures}
                    onCommit={setMeasures}
                    onClose={() => setMeasuresOpen(false)}
                    relevantKeys={relevant.keys}
                    relevantBecause={relevant.because}
                />
            )}
        </ModalShell>
    );
}

// SectionLabel / Field / AgeInput / GenderControl / PhoneInput live in
// ./fields — the shared Bhor form primitives (also used by the Patients
// page's Edit Details modal).
