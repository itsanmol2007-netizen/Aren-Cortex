import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Cake, Phone, Plus, Search, Sparkles, Stethoscope, Thermometer, UserRound, UserCheck, Users, X } from "lucide-react";
import { fetchPatientVisitStats, searchPatients, type DBDoctor, type DBPatient } from "@/lib/db";
import type { IntakeChip } from "@/lib/db/synapse";
import { initials } from "../utils";
import { useT } from "../i18n/i18n";
import { useCachedIntakeChips } from "../operational/referenceCache";
import { ModalShell } from "./ModalShell";
import { AgeInput, Field, GenderControl, PhoneInput, SectionLabel } from "./fields";

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
    onCreate: (opts: {
        existingPatient: DBPatient | null;
        name: string;
        phone: string;
        age: string;
        gender: string;
        observableIds: number[];
        doctorId: string;
    }) => Promise<{ patientName: string } | null>;
};

export function CreateVisitModal({ existingPatient, prefillName, doctors, defaultDoctorId, onClose, onUseExisting, onCreate }: Props) {
    const t = useT();
    const existing = !!existingPatient;

    const [name, setName] = useState(prefillName);
    const [phone, setPhone] = useState("");
    const [age, setAge] = useState("");
    const [gender, setGender] = useState("");
    const [selectedSymptoms, setSelectedSymptoms] = useState<IntakeChip[]>([]);
    const [doctorId, setDoctorId] = useState(defaultDoctorId);
    const [errors, setErrors] = useState<Record<string, boolean>>({});
    const [saving, setSaving] = useState(false);
    const [visitStats, setVisitStats] = useState<{ visit_count: number; last_visit_at: string | null } | null>(null);

    // Keyboard flow (receptionists live on the keyboard): Enter advances
    // through this field order; once every required field is complete, Enter
    // triggers Save from anywhere in the form.
    const nameRef = useRef<HTMLInputElement>(null);
    const ageRef = useRef<HTMLInputElement>(null);
    const genderRef = useRef<HTMLDivElement>(null);
    const phoneRef = useRef<HTMLInputElement>(null);
    const symptomRef = useRef<HTMLInputElement>(null);
    const doctorRef = useRef<HTMLSelectElement>(null);
    // Phone sits directly under the name so an existing patient surfaces the
    // instant both are typed — before age/gender are even asked.
    const fieldOrder: React.RefObject<HTMLElement | null>[] = existing
        ? [symptomRef, doctorRef]
        : [nameRef, phoneRef, ageRef, genderRef, symptomRef, doctorRef];

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
        ? selectedSymptoms.length > 0
        : !!name.trim() && !!age.trim() && !!gender && phoneOk && selectedSymptoms.length > 0;

    const validate = () => {
        const nextErrors: Record<string, boolean> = {};
        if (!existing) {
            if (!name.trim()) nextErrors.name = true;
            if (!age.trim()) nextErrors.age = true;
            if (!gender) nextErrors.gender = true;
            if (!phoneOk) nextErrors.phone = true;
        }
        if (!selectedSymptoms.length) nextErrors.symptoms = true;
        setErrors(nextErrors);
        return Object.keys(nextErrors).length === 0;
    };

    const handleSave = async () => {
        if (saving) return;
        if (!validate()) return;
        // Duplicate guard: same phone + same name = that IS this patient —
        // create the visit for them instead of minting a twin record. Same
        // phone under a different name is ambiguous, so block and let the
        // banner's button resolve it explicitly.
        let asExisting = existingPatient;
        if (dupExact) {
            asExisting = dup;
        } else if (dupPhoneHit) {
            setErrors((e) => ({ ...e, phone: true }));
            return;
        }
        setSaving(true);
        const result = await onCreate({
            existingPatient: asExisting,
            name,
            phone,
            age,
            gender,
            observableIds: selectedSymptoms.map((s) => s.observableId),
            doctorId,
        });
        setSaving(false);
        if (result) onClose();
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
        if (ref === symptomRef) return selectedSymptoms.length === 0;
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
                        the brand gradient like the header mark and the launcher +. */}
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="flex h-10 items-center gap-[7px] rounded-[10px] bg-[linear-gradient(155deg,#7c5cf0,#2f6bed)] px-5 text-[13.5px] font-bold text-white shadow-[0_3px_12px_rgba(124,92,240,0.32)] transition-[filter,box-shadow] duration-100 hover:brightness-110 hover:shadow-[0_3px_16px_rgba(124,92,240,0.45)] disabled:opacity-50 disabled:hover:brightness-100"
                    >
                        {saving ? t("saving") : t("save")}
                        <ArrowRight size={15} strokeWidth={2.4} />
                    </button>
                </>
            }
        >
            <div onKeyDown={handleFormKeyDown}>
                {existing && existingPatient ? (
                    <div className="mb-4 flex items-center gap-3 rounded-[11px] border border-[#e5ddfa] bg-[linear-gradient(135deg,rgba(124,92,240,0.08),rgba(124,92,240,0.02))] px-3 py-[10px]">
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
                        <div className="grid grid-cols-[120px_1fr] gap-x-3 gap-y-3">
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
                                className="col-span-2"
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
                            {/* Age is a tiny number — it gets a tiny box (fixed 120px
                                column), gender fills the rest of the row. */}
                            <Field icon={<Cake size={13} />} label={t("fldAge")} required error={errors.age ? t("errRequired") : undefined}>
                                <AgeInput
                                    inputRef={ageRef}
                                    value={age}
                                    onChange={(v) => { setAge(v); if (v) setErrors((er) => ({ ...er, age: false })); }}
                                    error={!!errors.age}
                                    placeholder={t("phAge")}
                                />
                            </Field>
                            <Field icon={<Users size={13} />} label={t("fldGender")} required error={errors.gender ? t("errRequired") : undefined}>
                                <GenderControl
                                    groupRef={genderRef}
                                    value={gender}
                                    onChange={(v) => { setGender(v); setErrors((er) => ({ ...er, gender: false })); }}
                                    error={!!errors.gender}
                                />
                            </Field>
                        </div>

                        {/* Duplicate-patient banner: appears silently as they type;
                            one click turns "register" into "new visit for them". */}
                        {dup && (
                            <div className="mt-3 flex items-center gap-[10px] rounded-[11px] border border-[#e2d9fb] bg-[linear-gradient(135deg,rgba(124,92,240,0.09),rgba(124,92,240,0.02))] px-3 py-[9px]">
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

                <SectionLabel text={t("secVisit")} className={existing ? "" : "mt-[18px]"} />
                <Field icon={<Thermometer size={13} />} label={t("fldSymptoms")} required error={errors.symptoms ? t("errSymptom") : undefined}>
                    <SymptomPicker
                        inputRef={symptomRef}
                        selected={selectedSymptoms}
                        onChange={(next) => {
                            setSelectedSymptoms(next);
                            if (next.length) setErrors((e) => ({ ...e, symptoms: false }));
                        }}
                        error={!!errors.symptoms}
                    />
                </Field>
                <Field className="mt-3" icon={<Stethoscope size={13} />} label={t("fldDoctor")}>
                    <select ref={doctorRef} value={doctorId} onChange={(e) => setDoctorId(e.target.value)} className={fieldClass()}>
                        {doctors.map((d) => (
                            <option key={d.id} value={d.id}>{d.name}</option>
                        ))}
                    </select>
                </Field>
            </div>
        </ModalShell>
    );
}

// Structured symptom selection: symptoms are entities in the `symptoms` table
// (they feed Cortex, medicine ranking, and specialty logic), never free text.
// Focusing the field opens the full catalog immediately; typing filters it
// with typo tolerance ("feber" still surfaces fever); Enter adds the
// highlighted top match.
//
// The catalog renders in-flow and is dismissed on outside CLICK — never on
// mousedown. Closing on mousedown collapsed the modal layout between a
// mousedown and its mouseup, so the click landed on the backdrop and
// silently destroyed the whole intake (the "existing patient visits fail"
// regression). With click-based dismissal the layout is stable for the full
// duration of any press: a first click on Save both saves and closes.
function SymptomPicker({
    inputRef,
    selected,
    onChange,
    error,
}: {
    inputRef: React.RefObject<HTMLInputElement | null>;
    selected: IntakeChip[];
    onChange: (next: IntakeChip[]) => void;
    error?: boolean;
}) {
    const t = useT();
    // Cache-fresh: the catalog is served instantly from this computer's last
    // copy (so the picker works offline) and quietly refreshed while online.
    const catalog = useCachedIntakeChips().data;
    const [query, setQuery] = useState("");
    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);

    // A completed click anywhere outside the picker closes the catalog.
    // Deliberately `click`, not `mousedown` — see the component comment.
    // Registration is deferred a tick: when the catalog opens as a side
    // effect of a click (selecting a patient in the launcher auto-focuses
    // this field), that same click would otherwise reach this listener while
    // still bubbling and close the catalog in the same breath.
    useEffect(() => {
        if (!open) return;
        const onClick = (e: MouseEvent) => {
            const target = e.target as Node;
            // Picking a chip unmounts it before the click finishes bubbling —
            // a detached target is an inside click, not an outside one.
            if (!target.isConnected) return;
            if (rootRef.current && !rootRef.current.contains(target)) {
                setOpen(false);
                setQuery("");
            }
        };
        const timer = setTimeout(() => document.addEventListener("click", onClick), 0);
        return () => {
            clearTimeout(timer);
            document.removeEventListener("click", onClick);
        };
    }, [open]);

    // While the catalog is open, Escape closes it — not the modal. Capture
    // phase on document runs before (and stops) ModalShell's bubble listener.
    useEffect(() => {
        if (!open) return;
        const onEsc = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                e.stopPropagation();
                setOpen(false);
                setQuery("");
            }
        };
        document.addEventListener("keydown", onEsc, true);
        return () => document.removeEventListener("keydown", onEsc, true);
    }, [open]);

    // The catalogue is the doctor's full 374 — a receptionist must be able to
    // enter whatever the patient reported, and a shorter list only moves the
    // transcription problem onto them. What makes that usable is that the chip
    // is reachable in the language it was spoken: every term (English label,
    // colloquial text, Devanagari and romanised alias) is matched with the same
    // typo tolerance, and the CANONICAL label is what gets picked.
    //
    // With no query the catalogue opens on the everyday complaints rather than
    // 374 chips — same feel as the 51-row list it replaces.
    const filtered = useMemo(() => {
        const chosen = new Set(selected.map((s) => s.observableId));
        const available = catalog.filter((s) => !chosen.has(s.observableId));
        const q = query.trim().toLowerCase();
        if (!q) return available.filter((s) => s.system === "general" && s.kind === "symptom");
        return available
            .map((s) => {
                // best-scoring term wins; a Devanagari alias and the English
                // label are equally good ways to have found the same chip
                let best: number | null = null;
                for (const term of s.terms) {
                    const sc = matchScore(term, q);
                    if (sc !== null && (best === null || sc < best)) best = sc;
                }
                return { s, score: best };
            })
            .filter((x): x is { s: IntakeChip; score: number } => x.score !== null)
            .sort((a, b) => a.score - b.score || a.s.label.localeCompare(b.s.label))
            .map((x) => x.s);
    }, [catalog, query, selected]);

    /** The alias that explains why this chip matched, if it was not the label. */
    const matchedAlias = (s: IntakeChip): string | null => {
        const q = query.trim().toLowerCase();
        if (!q || s.label.toLowerCase().includes(q)) return null;
        const hit = s.aliases.find((a) => matchScore(a.term.toLowerCase(), q) !== null);
        return hit?.term ?? null;
    };

    const pick = (s: IntakeChip) => {
        onChange([...selected, s]);
        setQuery("");
        inputRef.current?.focus();
    };

    const remove = (id: number) => onChange(selected.filter((s) => s.observableId !== id));

    return (
        <div ref={rootRef}>
            {/* The well: selected chips live inside the field, input inline after
                them. A div, so Tailwind works here (the layer trap only bites on
                input/select/label elements). */}
            <div
                onClick={() => { inputRef.current?.focus(); setOpen(true); }}
                className={`flex min-h-[42px] cursor-text flex-wrap items-center gap-[6px] rounded-[10px] border-[1.5px] px-3 py-[5px] transition-[border-color,box-shadow,background-color] duration-150 ${
                    error
                        ? "border-[#d23b34] bg-[#fffafa]"
                        : open
                            ? "border-[#7c5cf0] bg-white shadow-[0_0_0_3px_rgba(99,102,241,0.22)]"
                            : "border-[#e9e7f4] bg-[#f8f8fd] hover:border-[#d9d3ee]"
                }`}
            >
                {selected.map((s) => (
                    <span
                        key={s.observableId}
                        className="flex items-center gap-[5px] rounded-[8px] border border-[#e2e5ee] bg-white py-[4px] pl-[9px] pr-[5px] text-[12.5px] font-medium text-[#374151] shadow-[0_1px_2px_rgba(20,30,50,0.05)]"
                    >
                        {s.label}
                        <button
                            type="button"
                            onClick={() => remove(s.observableId)}
                            aria-label={`${t("cancel")} ${s.label}`}
                            className="flex h-[18px] w-[18px] items-center justify-center rounded-[5px] text-[#a8aeba] transition-colors hover:bg-[#eef0f5] hover:text-[#5a6472]"
                        >
                            <X size={12} />
                        </button>
                    </span>
                ))}
                <div className="flex h-[26px] min-w-[130px] flex-1 items-center gap-[7px]">
                    <Search size={14} className="shrink-0 text-[#a8aeba]" />
                    <input
                        ref={inputRef}
                        value={query}
                        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
                        onFocus={() => setOpen(true)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") {
                                // Consume Enter only while picking; with nothing to
                                // pick it bubbles up to the form's advance/save flow
                                // and takes the catalog down with it.
                                if (query.trim() && filtered.length) {
                                    e.preventDefault();
                                    pick(filtered[0]);
                                } else {
                                    setOpen(false);
                                    setQuery("");
                                }
                            } else if (e.key === "Tab") {
                                setOpen(false);
                                setQuery("");
                            } else if (e.key === "Backspace" && !query && selected.length) {
                                remove(selected[selected.length - 1].observableId);
                            }
                        }}
                        placeholder={selected.length ? "" : t("phSymp")}
                        className="fd-bare"
                    />
                </div>
            </div>

            {open && (
                <div className="mt-2 rounded-[11px] border border-[#e9ebf2] bg-white p-3 shadow-[0_10px_30px_rgba(20,30,50,0.08)]">
                    <div className="mb-[9px] flex items-center justify-between">
                        <span className="text-[10.5px] font-extrabold uppercase tracking-[0.08em] text-[#837bb2]">{t("symCatalog")}</span>
                        <span className="text-[11px] font-semibold tabular-nums text-[#a8aeba]">{filtered.length}</span>
                    </div>
                    {filtered.length ? (
                        <div className="flex max-h-[168px] flex-wrap content-start gap-[7px] overflow-y-auto pr-[2px]">
                            {filtered.map((s, i) => {
                                // The top match is what Enter will pick — it wears the
                                // focus ring (structural affordance, not data color).
                                const isTop = i === 0 && query.trim().length > 0;
                                const via = matchedAlias(s);
                                return (
                                    <button
                                        key={s.observableId}
                                        type="button"
                                        onClick={() => pick(s)}
                                        className={`flex items-center gap-[5px] rounded-[8px] border py-[5px] pl-[8px] pr-[10px] text-[12.5px] font-medium transition-colors ${
                                            isTop
                                                ? "border-[#7c5cf0] bg-white text-[#161d29] shadow-[0_0_0_3px_rgba(99,102,241,0.18)]"
                                                : "border-[#e4e7ee] bg-[#f7f8fb] text-[#374151] hover:border-[#c9bdf5] hover:bg-white hover:text-[#161d29]"
                                        }`}
                                    >
                                        <Plus size={12} className={isTop ? "text-[#7c5cf0]" : "text-[#a8aeba]"} />
                                        {s.label}
                                        {/* Why this matched, when it was not the English
                                            label — so the receptionist can see their own
                                            word was understood, and that the chip going
                                            into the record is the clinical one. */}
                                        {via && (
                                            <span className="text-[11.5px] font-normal text-[#8b93a3]">
                                                · {via}
                                            </span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="py-[10px] text-center text-[12.5px] text-[#a8aeba]">{t("noSymptomMatch")}</div>
                    )}
                </div>
            )}
        </div>
    );
}

// Tolerant matching for fast receptionist typing: prefix beats substring beats
// small-typo matches. Distance is classic Levenshtein against each word of the
// symptom name (and its prefix, so partial typing stays fuzzy too); names and
// queries are short, so the DP cost is negligible.
function matchScore(name: string, q: string): number | null {
    const n = name.toLowerCase();
    if (n.startsWith(q)) return 0;
    if (n.includes(q)) return 1;
    if (q.length < 3) return null;
    const budget = q.length <= 5 ? 1 : 2;
    let best = Infinity;
    for (const w of n.split(/[^a-z0-9]+/)) {
        if (!w) continue;
        best = Math.min(best, editDistance(q, w), editDistance(q, w.slice(0, q.length)));
    }
    return best <= budget ? 2 + best : null;
}

function editDistance(a: string, b: string): number {
    const row = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
        let prev = row[0];
        row[0] = i;
        for (let j = 1; j <= b.length; j++) {
            const tmp = row[j];
            row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
            prev = tmp;
        }
    }
    return row[b.length];
}

// SectionLabel / Field / AgeInput / GenderControl / PhoneInput live in
// ./fields — the shared Bhor form primitives (also used by the Patients
// page's Edit Details modal).
