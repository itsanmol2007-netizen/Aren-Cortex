// ---------------------------------------------------------------------------
// RECEPTION MEASUREMENTS — a quiet way for the front desk to put the numbers
// on the visit before the doctor opens it.
//
// It reuses Cortex's field catalogue verbatim (`features/consult/measures.ts`)
// so a BP or an LMP entered here is the same measure key, unit and warning band
// the consult would have used — but scoped to a RECEPTION SET: vitals, weight/
// height, a basic glucose panel, pain, and the obstetric pair. No goniometry,
// no disability indices; those are the doctor's to take.
//
// Which fields show is the same three-way union Cortex's MeasurementsCard uses,
// minus the specialty profile: a small always-on default, plus anything the
// entered symptoms/history made relevant (the RELEVANT_FIELDS map, keyed on the
// engine signals each chip carries), plus anything already holding a value.
// The rest are one search away — never a catalogue dump.
//
// Size rule: the field grid scrolls inside a fixed-height box and the "add a
// measurement" list is capped, so the modal is the same size with two fields
// or twelve.
// ---------------------------------------------------------------------------

import { useMemo, useRef, useState } from "react";
import { Activity, Plus, Search } from "lucide-react";
import { MEASURE_FIELDS, type MeasureField, type MeasureFieldKey } from "@/features/consult/measures";
import { useT } from "../i18n/i18n";
import { ModalShell } from "./ModalShell";

/** The reception subset, in catalogue order. Everything else in MEASURE_FIELDS
 *  (per-joint ROM, LEFS/ODI/QuickDASH) is a clinician measurement. */
const RECEPTION_KEYS: MeasureFieldKey[] = [
    "bp", "pulse", "respRate", "spo2", "temp",
    "weight", "height", "bloodGroup",
    "glucoseFasting", "glucoseRandom", "hba1c",
    "painVas", "lmp", "gpla",
];

/** Always on — the numbers a desk takes for everyone. */
const DEFAULT_KEYS: MeasureFieldKey[] = ["bp", "pulse", "temp", "spo2", "weight"];

const RECEPTION_FIELDS = MEASURE_FIELDS.filter((f) => RECEPTION_KEYS.includes(f.key));

/** Rows shown in "add a measurement" with nothing typed. */
const DEFAULT_VISIBLE = 6;

type Values = Partial<Record<MeasureFieldKey, string>>;

type Props = {
    values: Values;
    onCommit: (next: Values) => void;
    onClose: () => void;
    relevantKeys: Set<MeasureFieldKey>;
    relevantBecause: Map<MeasureFieldKey, string>;
};

export function MeasurementsModal({ values, onCommit, onClose, relevantKeys, relevantBecause }: Props) {
    const t = useT();
    const [draft, setDraft] = useState<Values>(values);
    const [added, setAdded] = useState<Set<MeasureFieldKey>>(new Set());

    const has = (k: MeasureFieldKey) => (draft[k] ?? "").trim().length > 0;

    const shown = useMemo(() => {
        const keys = new Set<MeasureFieldKey>(DEFAULT_KEYS);
        for (const k of relevantKeys) if (RECEPTION_KEYS.includes(k)) keys.add(k);
        for (const k of added) keys.add(k);
        for (const f of RECEPTION_FIELDS) if (has(f.key)) keys.add(f.key);
        return RECEPTION_FIELDS.filter((f) => keys.has(f.key));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [relevantKeys, added, draft]);

    const hidden = useMemo(
        () => RECEPTION_FIELDS.filter((f) => !shown.some((s) => s.key === f.key)),
        [shown]
    );

    const set = (k: MeasureFieldKey, v: string) => setDraft((d) => ({ ...d, [k]: v }));

    const commit = () => {
        // Drop empties so a cleared field doesn't persist as "".
        const clean: Values = {};
        for (const [k, v] of Object.entries(draft)) {
            if ((v ?? "").trim()) clean[k as MeasureFieldKey] = v;
        }
        onCommit(clean);
        onClose();
    };

    const filledCount = shown.filter((f) => has(f.key)).length;

    return (
        <ModalShell
            eyebrow={t("measEyebrow")}
            title={t("measTitle")}
            icon={<Activity size={19} strokeWidth={2.2} />}
            onClose={onClose}
            footer={
                <>
                    <button
                        onClick={onClose}
                        className="h-10 rounded-[10px] border-[1.5px] border-[#e6e3f1] bg-white px-[18px] text-[13.5px] font-bold text-[#5a6472] transition-colors hover:border-[#d5cfec] hover:bg-[#f8f7fd]"
                    >
                        {t("cancel")}
                    </button>
                    <button
                        onClick={commit}
                        className="flex h-10 items-center gap-[7px] rounded-[10px] bg-[#2f6bed] px-5 text-[13.5px] font-bold text-white shadow-[0_3px_12px_rgba(47,107,237,0.4),0_0_16px_rgba(47,107,237,0.28)] transition-[background-color,box-shadow] duration-100 hover:bg-[#1d51c9]"
                    >
                        {filledCount > 0 ? t("measDoneN", { n: filledCount }) : t("measDone")}
                    </button>
                </>
            }
        >
            {/* Fixed-height scroll box — the grid never changes the modal size. */}
            <div className="h-[300px] overflow-y-auto pr-[2px]">
                <div className="grid grid-cols-2 gap-x-[10px] gap-y-[9px]">
                    {shown.map((f) => (
                        <Cell
                            key={f.key}
                            field={f}
                            value={draft[f.key] ?? ""}
                            onChange={(v) => set(f.key, v)}
                            relevant={relevantKeys.has(f.key) && !has(f.key)}
                            because={relevantBecause.get(f.key) ?? null}
                        />
                    ))}
                </div>
            </div>

            {/* Always present, fixed internal heights — the modal is the same
                size whether there are ten fields to add or none left. */}
            <AddMeasurement
                fields={hidden}
                onPick={(k) => setAdded((s) => new Set(s).add(k))}
            />
        </ModalShell>
    );
}

// ── one field ──────────────────────────────────────────────────────────────
function Cell({
    field, value, onChange, relevant, because,
}: {
    field: MeasureField;
    value: string;
    onChange: (v: string) => void;
    relevant: boolean;
    because: string | null;
}) {
    const wide = field.kind === "bp" || field.kind === "gpla";
    const filled = value.trim().length > 0;
    const warn = filled && field.warn ? field.warn(value) : false;
    const title = warn
        ? field.warnText
        : relevant && because
            ? `Relevant to ${because}`
            : undefined;

    const label = (
        <span className="mb-[4px] flex items-center gap-[5px] text-[11.5px] font-bold text-[#3b4453]">
            {field.label}
            {relevant && <span aria-hidden className="h-[4px] w-[4px] shrink-0 rounded-full bg-[#a855f7] opacity-60" />}
        </span>
    );

    const ring = warn
        ? "border-[#d9822b] bg-[#fffaf3]"
        : "border-[#e9e7f4] bg-[#f8f8fd] focus-within:border-[#7c5cf0] focus-within:bg-white focus-within:shadow-[0_0_0_3px_rgba(99,102,241,0.22)]";

    if (field.kind === "bp") {
        const [s = "", d = ""] = value.split("/");
        const setBp = (ns: string, nd: string) =>
            onChange(!ns.trim() && !nd.trim() ? "" : `${ns.trim()}/${nd.trim()}`);
        return (
            <div className={wide ? "col-span-2" : ""} title={title}>
                {label}
                <div className={`flex h-[36px] items-center gap-[6px] rounded-[10px] border-[1.5px] px-3 transition-[border-color,box-shadow,background-color] duration-150 ${ring}`}>
                    <input value={s.trim()} onChange={(e) => setBp(e.target.value, d)} placeholder="120" inputMode="numeric" aria-label="Systolic" className="fd-bare w-[46px] tabular-nums" />
                    <span aria-hidden className="text-[#a8aeba]">/</span>
                    <input value={d.trim()} onChange={(e) => setBp(s, e.target.value)} placeholder="80" inputMode="numeric" aria-label="Diastolic" className="fd-bare w-[46px] tabular-nums" />
                </div>
            </div>
        );
    }

    if (field.kind === "gpla") {
        const parts = value.split("/");
        const at = (i: number) => (parts[i] ?? "").trim();
        const setAt = (i: number, next: string) => {
            const four = [at(0), at(1), at(2), at(3)];
            four[i] = next.trim();
            onChange(four.every((p) => !p) ? "" : four.join("/"));
        };
        return (
            <div className="col-span-2" title={title}>
                {label}
                <div className={`flex h-[36px] items-center gap-[10px] rounded-[10px] border-[1.5px] px-3 transition-[border-color,box-shadow,background-color] duration-150 ${ring}`}>
                    {["G", "P", "L", "A"].map((letter, i) => (
                        <span key={letter} className="flex items-center gap-[4px]">
                            <i className="text-[11px] font-bold not-italic text-[#8a91a0]">{letter}</i>
                            <input value={at(i)} onChange={(e) => setAt(i, e.target.value)} placeholder="0" inputMode="numeric" aria-label={["Gravida", "Para", "Living", "Abortions"][i]} className="fd-bare w-[28px] tabular-nums" />
                        </span>
                    ))}
                </div>
            </div>
        );
    }

    if (field.kind === "select") {
        return (
            <div title={title}>
                {label}
                <select value={value} onChange={(e) => onChange(e.target.value)} className="fd-field" aria-label={field.shortLabel}>
                    <option value="">—</option>
                    {(field.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
            </div>
        );
    }

    if (field.kind === "date") {
        return (
            <div title={title}>
                {label}
                <input type="date" value={value} onChange={(e) => onChange(e.target.value)} className="fd-field" aria-label={field.shortLabel} />
            </div>
        );
    }

    return (
        <div title={title}>
            {label}
            <input
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={field.placeholder}
                inputMode="decimal"
                aria-label={field.label}
                className={`fd-field ${warn ? "border-[#d9822b] bg-[#fffaf3]" : ""}`}
            />
        </div>
    );
}

// ── add a measurement — a search box, not a menu of everything ──────────────
function AddMeasurement({
    fields, onPick,
}: {
    fields: MeasureField[];
    onPick: (k: MeasureFieldKey) => void;
}) {
    const t = useT();
    const [query, setQuery] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);

    const q = query.trim().toLowerCase();
    const matches = q ? fields.filter((f) => f.label.toLowerCase().includes(q)) : fields.slice(0, DEFAULT_VISIBLE);
    const rest = q ? 0 : Math.max(0, fields.length - matches.length);
    const done = fields.length === 0;

    return (
        <div className="mt-[12px] border-t border-[#eeebf7] pt-[10px]">
            <div className={`flex h-[34px] items-center gap-[7px] rounded-[9px] border-[1.5px] px-3 ${done ? "border-[#eef0f5] bg-[#f5f6f9] opacity-60" : "border-[#e9e7f4] bg-[#f8f8fd] focus-within:border-[#7c5cf0] focus-within:bg-white focus-within:shadow-[0_0_0_3px_rgba(99,102,241,0.22)]"}`}>
                <Search size={13} className="shrink-0 text-[#a8aeba]" />
                <input
                    ref={inputRef}
                    value={query}
                    disabled={done}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={t("measSearchPh")}
                    aria-label={t("measSearchPh")}
                    className="fd-bare text-[13px]"
                />
            </div>
            {/* Fixed height + own scroll: chip count never reaches the modal. */}
            <div className="mt-[7px] flex h-[62px] flex-wrap content-start gap-[6px] overflow-y-auto">
                {done ? (
                    <p className="m-0 px-[2px] py-[4px] text-[12.5px] text-[#a8aeba]">{t("measAllAdded")}</p>
                ) : matches.length === 0 ? (
                    <p className="m-0 px-[2px] py-[4px] text-[12.5px] text-[#a8aeba]">{t("measNoMatch", { q: query.trim() })}</p>
                ) : (
                    matches.map((f) => (
                        <button
                            key={f.key}
                            type="button"
                            onClick={() => { onPick(f.key); setQuery(""); inputRef.current?.focus(); }}
                            className="flex h-[28px] items-center gap-[5px] self-start rounded-[8px] border border-[#e4e7ee] bg-[#f7f8fb] pl-[8px] pr-[10px] text-[12.5px] font-medium text-[#374151] transition-colors hover:border-[#c9bdf5] hover:bg-white hover:text-[#161d29]"
                        >
                            <Plus size={12} className="text-[#a8aeba]" />
                            {f.label}
                        </button>
                    ))
                )}
                {rest > 0 && (
                    <p className="m-0 basis-full px-[2px] pt-[2px] text-[11.5px] text-[#a8aeba]">{t("pickerMore", { n: rest })}</p>
                )}
            </div>
        </div>
    );
}
