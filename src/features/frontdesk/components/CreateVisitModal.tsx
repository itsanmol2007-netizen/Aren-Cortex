import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Cake, Phone, Plus, Search, Sparkles, Stethoscope, Thermometer, UserRound, Users, X } from "lucide-react";
import { fetchPatientVisitStats, fetchSymptoms, type DBDoctor, type DBPatient, type DBSymptom } from "@/lib/db";
import { initials } from "../utils";
import { useT } from "../i18n/i18n";
import { ModalShell } from "./ModalShell";

type Props = {
    existingPatient: DBPatient | null;
    prefillName: string;
    doctors: DBDoctor[];
    defaultDoctorId: string;
    onClose: () => void;
    onCreate: (opts: {
        existingPatient: DBPatient | null;
        name: string;
        phone: string;
        age: string;
        gender: string;
        symptomIds: number[];
        doctorId: string;
    }) => Promise<{ patientName: string } | null>;
};

export function CreateVisitModal({ existingPatient, prefillName, doctors, defaultDoctorId, onClose, onCreate }: Props) {
    const t = useT();
    const existing = !!existingPatient;

    const [name, setName] = useState(prefillName);
    const [phone, setPhone] = useState("");
    const [age, setAge] = useState("");
    const [gender, setGender] = useState("");
    const [selectedSymptoms, setSelectedSymptoms] = useState<DBSymptom[]>([]);
    const [doctorId, setDoctorId] = useState(defaultDoctorId);
    const [errors, setErrors] = useState<Record<string, boolean>>({});
    const [saving, setSaving] = useState(false);
    const [visitStats, setVisitStats] = useState<{ visit_count: number; last_visit_at: string | null } | null>(null);

    useEffect(() => {
        if (!existingPatient) { setVisitStats(null); return; }
        let cancelled = false;
        fetchPatientVisitStats([existingPatient.id])
            .then((map) => { if (!cancelled) setVisitStats(map.get(existingPatient.id) ?? { visit_count: 0, last_visit_at: null }); })
            .catch((err) => console.warn("fetchPatientVisitStats failed (non-fatal):", err));
        return () => { cancelled = true; };
    }, [existingPatient]);

    const handleSave = async () => {
        const nextErrors: Record<string, boolean> = {};
        if (!existing) {
            if (!name.trim()) nextErrors.name = true;
            if (!phone.trim()) nextErrors.phone = true;
        }
        if (!selectedSymptoms.length) nextErrors.symptoms = true;
        setErrors(nextErrors);
        if (Object.keys(nextErrors).length) return;

        setSaving(true);
        const result = await onCreate({
            existingPatient,
            name,
            phone,
            age,
            gender,
            symptomIds: selectedSymptoms.map((s) => s.id),
            doctorId,
        });
        setSaving(false);
        if (result) onClose();
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
                        className="h-11 rounded-[10px] border-[1.5px] border-[#e4e7ee] bg-white px-5 text-[14px] font-bold text-[#5a6472] transition-colors hover:border-[#d5dae4] hover:bg-[#f5f6f9]"
                    >
                        {t("cancel")}
                    </button>
                    {/* Registration is a front door, not a status change — it wears
                        the brand gradient like the header mark and the launcher +. */}
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="flex h-11 items-center gap-[7px] rounded-[10px] bg-[linear-gradient(155deg,#7c5cf0,#2f6bed)] px-[22px] text-[14px] font-bold text-white shadow-[0_3px_12px_rgba(124,92,240,0.32)] transition-[filter,box-shadow] duration-100 hover:brightness-110 hover:shadow-[0_3px_16px_rgba(124,92,240,0.45)] disabled:opacity-50 disabled:hover:brightness-100"
                    >
                        {saving ? t("saving") : t("save")}
                        <ArrowRight size={15} strokeWidth={2.4} />
                    </button>
                </>
            }
        >
            {existing && existingPatient ? (
                <div className="mb-5 flex items-center gap-3 rounded-[12px] border border-[#e3ecfd] bg-[linear-gradient(135deg,rgba(47,107,237,0.07),rgba(47,107,237,0.02))] px-[14px] py-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px] bg-[#e9f0fe] text-[13.5px] font-bold text-[#1d51c9]">
                        {initials(existingPatient.name)}
                    </div>
                    <div>
                        <div className="text-[14px] font-bold text-[#161d29]">{existingPatient.name}</div>
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
                </div>
            ) : (
                <>
                    <SectionLabel text={t("secPatient")} />
                    <div className="grid grid-cols-2 gap-x-[14px] gap-y-4">
                        <Field className="col-span-2" icon={<UserRound size={13} />} label={t("fldName")} required error={errors.name ? t("errRequired") : undefined}>
                            <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("phName")} className={fieldClass(errors.name)} />
                        </Field>
                        <Field icon={<Cake size={13} />} label={t("fldAge")} optional>
                            <input value={age} onChange={(e) => setAge(e.target.value)} placeholder={t("phAge")} inputMode="numeric" className={fieldClass()} />
                        </Field>
                        <Field icon={<Users size={13} />} label={t("fldGender")} optional>
                            <select value={gender} onChange={(e) => setGender(e.target.value)} className={fieldClass()}>
                                <option value="">{t("selectGender")}</option>
                                <option value="Male">{t("male")}</option>
                                <option value="Female">{t("female")}</option>
                                <option value="Other">{t("other")}</option>
                            </select>
                        </Field>
                        <Field className="col-span-2" icon={<Phone size={13} />} label={t("fldPhone")} required error={errors.phone ? t("errRequired") : undefined}>
                            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={t("phPhone")} inputMode="numeric" className={fieldClass(errors.phone)} />
                        </Field>
                    </div>
                </>
            )}

            <SectionLabel text={t("secVisit")} className={existing ? "" : "mt-[22px]"} />
            <Field icon={<Thermometer size={13} />} label={t("fldSymptoms")} required error={errors.symptoms ? t("errSymptom") : undefined}>
                <SymptomPicker
                    selected={selectedSymptoms}
                    onChange={(next) => {
                        setSelectedSymptoms(next);
                        if (next.length) setErrors((e) => ({ ...e, symptoms: false }));
                    }}
                    error={!!errors.symptoms}
                />
            </Field>
            <Field className="mt-4" icon={<Stethoscope size={13} />} label={t("fldDoctor")}>
                <select value={doctorId} onChange={(e) => setDoctorId(e.target.value)} className={fieldClass()}>
                    {doctors.map((d) => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                </select>
            </Field>
        </ModalShell>
    );
}

// Structured symptom selection: symptoms are entities in the `symptoms` table
// (they feed Cortex, medicine ranking, and specialty logic), never free text.
// Since s36 the picker is a catalog, not a search box: focusing the field
// immediately opens the full symptom list as chips; typing filters it with
// typo tolerance ("feber" still surfaces fever); Enter adds the highlighted
// top match. The panel renders in-flow (no overlay → nothing clips).
function SymptomPicker({
    selected,
    onChange,
    error,
}: {
    selected: DBSymptom[];
    onChange: (next: DBSymptom[]) => void;
    error?: boolean;
}) {
    const t = useT();
    const [catalog, setCatalog] = useState<DBSymptom[]>([]);
    const [query, setQuery] = useState("");
    const [open, setOpen] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const rootRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        let cancelled = false;
        fetchSymptoms()
            .then((rows) => { if (!cancelled) setCatalog(rows); })
            .catch((err) => console.warn("fetchSymptoms failed (non-fatal):", err));
        return () => { cancelled = true; };
    }, []);

    // Click anywhere outside the picker closes the catalog.
    useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent) => {
            if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
                setOpen(false);
                setQuery("");
            }
        };
        document.addEventListener("mousedown", onDown);
        return () => document.removeEventListener("mousedown", onDown);
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

    const filtered = useMemo(() => {
        const chosen = new Set(selected.map((s) => s.id));
        const available = catalog.filter((s) => !chosen.has(s.id));
        const q = query.trim().toLowerCase();
        if (!q) return available;
        return available
            .map((s) => ({ s, score: matchScore(s.name, q) }))
            .filter((x): x is { s: DBSymptom; score: number } => x.score !== null)
            .sort((a, b) => a.score - b.score || a.s.name.localeCompare(b.s.name))
            .map((x) => x.s);
    }, [catalog, query, selected]);

    const pick = (s: DBSymptom) => {
        onChange([...selected, s]);
        setQuery("");
        inputRef.current?.focus();
    };

    const remove = (id: number) => onChange(selected.filter((s) => s.id !== id));

    return (
        <div ref={rootRef}>
            {/* The well: selected chips live inside the field, input inline after
                them. A div, so Tailwind works here (the layer trap only bites on
                input/select/label elements). */}
            <div
                onClick={() => { inputRef.current?.focus(); setOpen(true); }}
                className={`flex min-h-[46px] cursor-text flex-wrap items-center gap-[6px] rounded-[11px] border-[1.5px] px-3 py-[7px] transition-[border-color,box-shadow,background-color] duration-150 ${
                    error
                        ? "border-[#d23b34] bg-[#fffafa]"
                        : open
                            ? "border-[#7c5cf0] bg-white shadow-[0_0_0_3px_rgba(99,102,241,0.22)]"
                            : "border-[#e9ebf2] bg-[#f7f8fb] hover:border-[#dde1ea]"
                }`}
            >
                {selected.map((s) => (
                    <span
                        key={s.id}
                        className="flex items-center gap-[5px] rounded-[8px] border border-[#e2e5ee] bg-white py-[4px] pl-[9px] pr-[5px] text-[12.5px] font-medium text-[#374151] shadow-[0_1px_2px_rgba(20,30,50,0.05)]"
                    >
                        {s.name}
                        <button
                            type="button"
                            onClick={() => remove(s.id)}
                            aria-label={`${t("cancel")} ${s.name}`}
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
                                e.preventDefault();
                                if (query.trim() && filtered.length) pick(filtered[0]);
                            } else if (e.key === "Backspace" && !query && selected.length) {
                                remove(selected[selected.length - 1].id);
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
                                return (
                                    <button
                                        key={s.id}
                                        type="button"
                                        onClick={() => pick(s)}
                                        className={`flex items-center gap-[5px] rounded-[8px] border py-[5px] pl-[8px] pr-[10px] text-[12.5px] font-medium transition-colors ${
                                            isTop
                                                ? "border-[#7c5cf0] bg-white text-[#161d29] shadow-[0_0_0_3px_rgba(99,102,241,0.18)]"
                                                : "border-[#e4e7ee] bg-[#f7f8fb] text-[#374151] hover:border-[#c9bdf5] hover:bg-white hover:text-[#161d29]"
                                        }`}
                                    >
                                        <Plus size={12} className={isTop ? "text-[#7c5cf0]" : "text-[#a8aeba]"} />
                                        {s.name}
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

// Violet micro-label + fading hairline: the section grouping device shared
// with VisitDetailModal (§4 micro-label system).
function SectionLabel({ text, className = "" }: { text: string; className?: string }) {
    return (
        <div className={`mb-[13px] flex items-center gap-2 ${className}`}>
            <span className="text-[10.5px] font-extrabold uppercase tracking-[0.08em] text-[#837bb2]">{text}</span>
            <span aria-hidden className="h-px flex-1 bg-[linear-gradient(90deg,#e9e6f5,transparent)]" />
        </div>
    );
}

function Field({
    icon,
    label,
    children,
    className = "",
    error,
    required,
    optional,
}: {
    icon?: React.ReactNode;
    label: string;
    children: React.ReactNode;
    className?: string;
    error?: string;
    required?: boolean;
    optional?: boolean;
}) {
    const t = useT();
    return (
        <div className={className}>
            {/* fd-ico / fd-tag are unlayered classes (FrontDeskStyles): the legacy
                `label span` rules would override Tailwind utilities here. */}
            <label className="fd-label mb-[7px] text-[12.5px] font-bold text-[#3b4453]">
                {icon && <span className="fd-ico">{icon}</span>}
                {label}
                {/* Required mark (§10.2): structural violet, known upfront — not
                    an error color discovered on a failed save. */}
                {required && <span aria-hidden className="h-[4px] w-[4px] shrink-0 rounded-full bg-[#a855f7] opacity-50" />}
                {optional && <span className="fd-tag">{t("optional")}</span>}
            </label>
            {children}
            {error && <p className="m-0 mt-[6px] text-[12px] font-medium text-[#d23b34]">{error}</p>}
        </div>
    );
}
