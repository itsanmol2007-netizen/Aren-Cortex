// ---------------------------------------------------------------------------
// MEASUREMENTS — the single source of truth for this visit's numbers.
//
// The strip that used to sit under the header is gone. Not "in addition to":
// the review found BP, Pulse, SpO2, Temp and Weight rendered twice on one
// screen — read-only pills above, editable cards here — and two renderings of
// one number is how a consultation ends up with two different numbers.
//
// The contract with App is unchanged: this writes the same `Vitals` object the
// strip wrote, so `consultInput.ts`, the save and the print see exactly what
// they saw before. The engine re-ranks in the same frame a value lands.
//
// ── Which fields appear ───────────────────────────────────────────────────
// Three sources, unioned, and the order they are listed in is the order of
// authority:
//
//   1. the facility's specialty profile — what this clinic records by default;
//   2. the chart — a field the entered symptoms have made relevant (ticking
//      "Fever" surfaces Temperature), marked quietly and never announced;
//   3. the doctor — anything added by hand from "Add Measurement", plus
//      anything that already holds a value, which can never disappear.
//
// Nothing is ever removed by any of the three. A field that has been filled in
// stays visible even if the chart changes underneath it, because a measurement
// the doctor took must not vanish from the screen that took it.
// ---------------------------------------------------------------------------

import { useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Activity, ChevronDown, Plus } from "lucide-react";
import { ChartSurface } from "./ChartSurface";
import { useDismiss } from "./useDismiss";
import type { Vitals } from "../../types";
import {
    FIELD_BY_KEY, MEASURE_FIELDS, type MeasureField, type MeasureFieldKey,
} from "./measures";

/**
 * A specialty chart offered from this card — the odontogram, the body map,
 * the growth curve.
 *
 * These render as PEERS OF THE NUMERIC FIELDS rather than as their own cards
 * down the page. A dentist records teeth the way they record a temperature:
 * it belongs in the row of things this facility measures, not in a permanent
 * full-width panel that every other consultation has to scroll past. Which
 * ones appear is the specialty profile's `charts` field, exactly as
 * `defaultKeys` is its `measurements` field — one config, two axes.
 */
export interface ChartTool {
    key: string;
    label: string;
    icon: ReactNode;
    /** the chart already holds findings for this visit — mirrors `is-filled` */
    filled?: boolean;
}

const valueOf = (vitals: Vitals, key: MeasureFieldKey): string =>
    String(vitals[key] ?? "");

interface Props {
    vitals: Vitals;
    onChange: (v: Vitals) => void;
    /** the facility's default set — from the specialty profile */
    defaultKeys: MeasureFieldKey[];
    /** fields the chart has just made worth filling in */
    relevantKeys: Set<MeasureFieldKey>;
    /** field -> the signal label that asked for it, for the tooltip */
    relevantBecause: Map<MeasureFieldKey, string>;
    /** specialty charts offered as launchers in this grid — see ChartTool */
    charts?: ChartTool[];
    onOpenChart?: (key: string) => void;
    disabled?: boolean;
    /**
     * How many cells fit on the card before the rest move behind "More".
     *
     * The card sits in a fixed-height row (see `.cs-rowone-right`), so it must
     * not grow: a chart that raises four extra fields would otherwise push the
     * Assessment off the screen. Six is two rows of three, which is what the
     * 40% column fits without the readout wrapping into a pile.
     *
     * Nothing is hidden by this. Overflow opens in a modal with every field,
     * and a field HOLDING A VALUE is never in the overflow, because a
     * measurement the doctor took must stay on the screen that took it.
     */
    maxInline?: number;
}

export function MeasurementsCard({
    vitals, onChange, defaultKeys, relevantKeys, relevantBecause,
    charts = [], onOpenChart, disabled = false, maxInline,
}: Props) {
    /** the full field set, opened over the page rather than expanded in place */
    const [showAll, setShowAll] = useState(false);
    // Enter walks the row, so the whole card is one hand on the number row
    // rather than one click per field.
    const refs = useRef<Record<string, HTMLElement | null>>({});

    /** Fields the doctor asked for by name. Never shrinks during a consult. */
    const [added, setAdded] = useState<Set<MeasureFieldKey>>(new Set());
    const [pickerOpen, setPickerOpen] = useState(false);
    const headRef = useRef<HTMLDivElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    useDismiss(pickerOpen, () => setPickerOpen(false), [headRef, menuRef]);

    const shown = useMemo(() => {
        const keys = new Set<MeasureFieldKey>(defaultKeys);
        for (const k of relevantKeys) keys.add(k);
        for (const k of added) keys.add(k);
        // A field holding a value is always visible, whatever anything else
        // says. Hiding a recorded measurement would leave it in the save and
        // out of the doctor's sight, which is the worst of both.
        for (const f of MEASURE_FIELDS) if (valueOf(vitals, f.key).trim()) keys.add(f.key);
        // Catalogue order, always — the layout does not move between
        // facilities or between consultations.
        return MEASURE_FIELDS.filter((f) => keys.has(f.key));
    }, [defaultKeys, relevantKeys, added, vitals]);

    const hidden = useMemo(
        () => MEASURE_FIELDS.filter((f) => !shown.some((s) => s.key === f.key)),
        [shown]
    );

    const order = shown.map((f) => f.key);
    const focusNext = (key: MeasureFieldKey) => {
        const next = order[order.indexOf(key) + 1];
        if (next) refs.current[next]?.focus();
    };

    const set = (key: MeasureFieldKey, value: string) =>
        onChange({ ...vitals, [key]: value });

    /**
     * What fits on the card. A field holding a value is never dropped, so the
     * cap trims from the unfilled end and a recorded measurement can never be
     * pushed behind "More".
     */
    const inline = useMemo(() => {
        if (maxInline == null || shown.length <= maxInline) return shown;
        const filled = shown.filter((f) => valueOf(vitals, f.key).trim());
        const empty = shown.filter((f) => !valueOf(vitals, f.key).trim());
        const keep = new Set([...filled, ...empty].slice(0, maxInline).map((f) => f.key));
        return shown.filter((f) => keep.has(f.key));
    }, [shown, maxInline, vitals]);

    const overflow = shown.length - inline.length;

    const grid = (fields: MeasureField[]) => (
        <div className="cs-meas-grid">
            {fields.map((field) => (
                <MeasureCell
                    key={field.key}
                    field={field}
                    value={valueOf(vitals, field.key)}
                    onChange={(v) => set(field.key, v)}
                    onEnter={() => focusNext(field.key)}
                    registerRef={(el) => { refs.current[field.key] = el; }}
                    suggested={
                        relevantKeys.has(field.key) && !valueOf(vitals, field.key).trim()
                    }
                    because={relevantBecause.get(field.key) ?? null}
                    disabled={disabled}
                />
            ))}
        </div>
    );

    return (
        <section className="cs-card cs-meas-card" aria-label="Measurements">
            {/* The heading carries the add control, on the same line, so the
                field picker costs no row of its own. Pressing anywhere on it
                opens the list. */}
            <div className="cs-card-head is-trigger" ref={headRef}>
                <button
                    type="button"
                    className="cs-head-action"
                    disabled={disabled || hidden.length === 0}
                    aria-expanded={pickerOpen}
                    aria-haspopup="menu"
                    onClick={() => setPickerOpen((v) => !v)}
                >
                    <span className="cs-glyph is-slate"><Activity size={14} /></span>
                    <span className="cs-card-title">Measurements</span>
                    {hidden.length > 0 && <Plus size={15} className="cs-head-plus" />}
                </button>

                {pickerOpen && (
                    <div className="cs-meas-menu" role="menu" ref={menuRef}>
                        {hidden.map((f) => (
                            <button
                                key={f.key}
                                type="button"
                                role="menuitem"
                                onClick={() => {
                                    setAdded((curr) => new Set(curr).add(f.key));
                                    setPickerOpen(false);
                                    window.setTimeout(() => refs.current[f.key]?.focus(), 0);
                                }}
                            >{f.label}</button>
                        ))}
                    </div>
                )}
            </div>

            <div className="cs-meas-grid">
                {inline.map((field) => (
                    <MeasureCell
                        key={field.key}
                        field={field}
                        value={valueOf(vitals, field.key)}
                        onChange={(v) => set(field.key, v)}
                        onEnter={() => focusNext(field.key)}
                        registerRef={(el) => { refs.current[field.key] = el; }}
                        // The quiet treatment: a hairline ring and a "+" mark on
                        // a field the chart has asked for and the doctor has not
                        // filled in. It stops the moment there is a value —
                        // a highlight that outlives its own question is noise.
                        suggested={
                            relevantKeys.has(field.key) &&
                            !valueOf(vitals, field.key).trim()
                        }
                        because={relevantBecause.get(field.key) ?? null}
                        disabled={disabled}
                    />
                ))}

                {/* Charts sit AFTER the numbers and BEFORE "Add Measurement":
                    they are things this facility records (so they belong with
                    the fields, not after the way-in), but they are never the
                    first thing typed, so they do not lead the row. */}
                {charts.map((tool) => (
                    <button
                        key={tool.key}
                        type="button"
                        className={`cs-meas-tool${tool.filled ? " is-filled" : ""}`}
                        disabled={disabled}
                        onClick={() => onOpenChart?.(tool.key)}
                        title={`Open the ${tool.label.toLowerCase()}`}
                    >
                        <span className="cs-meas-tool-icon">{tool.icon}</span>
                        <span className="cs-meas-tool-label">{tool.label}</span>
                    </button>
                ))}

            </div>

            {/* The count, then the way to the rest. States plainly how much of
                the readout is on screen, so a capped card never silently
                implies it is showing everything. */}
            {maxInline != null && (
                <div className="cs-card-foot">
                    <span className="cs-card-foot-count">
                        {inline.length} / {shown.length} shown
                    </span>
                    <button
                        type="button"
                        className="cs-card-foot-more"
                        onClick={() => setShowAll(true)}
                    >
                        More
                        <ChevronDown size={13} />
                    </button>
                </div>
            )}

            {showAll && (
                <ChartSurface title="Measurements" expanded onClose={() => setShowAll(false)}>
                    {grid(shown)}
                    {hidden.length > 0 && (
                        <div className="cs-meas-menu is-inline" role="menu">
                            {hidden.map((f) => (
                                <button
                                    key={f.key}
                                    type="button"
                                    role="menuitem"
                                    onClick={() => {
                                        setAdded((curr) => new Set(curr).add(f.key));
                                        window.setTimeout(() => refs.current[f.key]?.focus(), 0);
                                    }}
                                >{f.label}</button>
                            ))}
                        </div>
                    )}
                </ChartSurface>
            )}
        </section>
    );
}

/**
 * One measurement. Three input kinds, one cell — blood pressure is two boxes
 * around a slash, blood group is a list, everything else is a number.
 */
function MeasureCell({
    field, value, onChange, onEnter, registerRef, suggested, because, disabled,
}: {
    field: MeasureField;
    value: string;
    onChange: (v: string) => void;
    onEnter: () => void;
    registerRef: (el: HTMLElement | null) => void;
    suggested: boolean;
    because: string | null;
    disabled: boolean;
}) {
    const diaRef = useRef<HTMLInputElement>(null);
    const filled = value.trim().length > 0;
    const warn = filled && field.warn ? field.warn(value) : false;

    // Two-input fields (blood pressure's sys/dia, the four G-P-L-A boxes) take
    // two grid cells — at one cell they clip their own digits.
    const wide = field.kind === "bp" || field.kind === "gpla";

    const className =
        `cs-meas${filled ? " is-filled" : ""}${warn ? " is-warn" : ""}` +
        `${suggested ? " is-suggested" : ""}${wide ? " is-wide" : ""}`;

    // One title, chosen by what the doctor most needs to know right now: a
    // value that is out of range beats an explanation of why the field is here.
    const title = warn
        ? field.warnText
        : suggested && because
            ? `Relevant to ${because}`
            : undefined;

    const onKey = (e: React.KeyboardEvent) => {
        if (e.key === "Enter") { e.preventDefault(); onEnter(); }
    };

    if (field.kind === "bp") {
        // BP is STORED as one "120/80" string because that is what the engine
        // splits and what the prescription prints. It is ENTERED as two boxes
        // because that is how it is measured, and because a single box invites
        // "120 80", "120-80" and every other spelling of a slash.
        const [sysRaw = "", diaRaw = ""] = value.split("/");
        const sys = sysRaw.trim();
        const dia = diaRaw.trim();
        const setBp = (s: string, d: string) =>
            onChange(!s.trim() && !d.trim() ? "" : `${s.trim()}/${d.trim()}`);

        return (
            <div className={className} title={title}>
                <span className="cs-meas-label">
                    {field.label}
                    {suggested && <i className="cs-meas-mark" aria-hidden="true">+</i>}
                </span>
                <div className="cs-meas-value">
                    <input
                        ref={registerRef as React.Ref<HTMLInputElement>}
                        value={sys}
                        placeholder="120"
                        inputMode="numeric"
                        disabled={disabled}
                        onChange={(e) => setBp(e.target.value, dia)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") { e.preventDefault(); diaRef.current?.focus(); }
                        }}
                        aria-label="Systolic blood pressure in mmHg"
                    />
                    <span className="cs-meas-slash" aria-hidden="true">/</span>
                    <input
                        ref={diaRef}
                        value={dia}
                        placeholder="80"
                        inputMode="numeric"
                        disabled={disabled}
                        onChange={(e) => setBp(sys, e.target.value)}
                        onKeyDown={onKey}
                        aria-label="Diastolic blood pressure in mmHg"
                    />
                </div>
            </div>
        );
    }

    if (field.kind === "date") {
        // A native date input, because a doctor typing "12/6" means one thing
        // in India and another to Date.parse, and the LMP feeds an interval
        // calculation where that ambiguity would be a real error.
        return (
            <div className={className} title={title}>
                <span className="cs-meas-label">
                    {field.label}
                    {suggested && <i className="cs-meas-mark" aria-hidden="true">+</i>}
                </span>
                <div className="cs-meas-value">
                    <input
                        ref={registerRef as React.Ref<HTMLInputElement>}
                        type="date"
                        className="cs-meas-date"
                        value={value}
                        disabled={disabled}
                        onChange={(e) => onChange(e.target.value)}
                        onKeyDown={onKey}
                        aria-label={field.shortLabel}
                    />
                </div>
            </div>
        );
    }

    if (field.kind === "gpla") {
        // Four boxes, one value — the bp pattern. Stored "G/P/L/A" so the
        // split downstream is the same trivial one bp already uses.
        const parts = value.split("/");
        const at = (i: number) => (parts[i] ?? "").trim();
        const setAt = (i: number, next: string) => {
            const four = [at(0), at(1), at(2), at(3)];
            four[i] = next.trim();
            onChange(four.every((p) => !p) ? "" : four.join("/"));
        };
        const LETTERS = ["G", "P", "L", "A"];
        return (
            <div className={className} title={title}>
                <span className="cs-meas-label">
                    {field.label}
                    {suggested && <i className="cs-meas-mark" aria-hidden="true">+</i>}
                </span>
                <div className="cs-meas-value cs-meas-gpla">
                    {LETTERS.map((letter, i) => (
                        <span className="cs-meas-gpla-cell" key={letter}>
                            <i className="cs-meas-gpla-letter">{letter}</i>
                            <input
                                ref={i === 0 ? (registerRef as React.Ref<HTMLInputElement>) : undefined}
                                value={at(i)}
                                placeholder="0"
                                inputMode="numeric"
                                disabled={disabled}
                                onChange={(e) => setAt(i, e.target.value)}
                                onKeyDown={onKey}
                                aria-label={`${field.shortLabel} — ${
                                    ["Gravida", "Para", "Living", "Abortions"][i]
                                }`}
                            />
                        </span>
                    ))}
                </div>
            </div>
        );
    }

    if (field.kind === "select") {
        return (
            <div className={className} title={title}>
                <span className="cs-meas-label">
                    {field.label}
                    {suggested && <i className="cs-meas-mark" aria-hidden="true">+</i>}
                </span>
                <div className="cs-meas-value">
                    <select
                        ref={registerRef as React.Ref<HTMLSelectElement>}
                        className="cs-meas-select"
                        value={value}
                        disabled={disabled}
                        onChange={(e) => onChange(e.target.value)}
                        onKeyDown={onKey}
                        aria-label={field.shortLabel}
                    >
                        <option value="">—</option>
                        {(field.options ?? []).map((o) => (
                            <option key={o} value={o}>{o}</option>
                        ))}
                    </select>
                </div>
            </div>
        );
    }

    return (
        <div className={className} title={title}>
            <span className="cs-meas-label">
                {field.label}
                {suggested && <i className="cs-meas-mark" aria-hidden="true">+</i>}
            </span>
            <div className="cs-meas-value">
                <input
                    ref={registerRef as React.Ref<HTMLInputElement>}
                    value={value}
                    placeholder={field.placeholder}
                    inputMode="decimal"
                    disabled={disabled}
                    onChange={(e) => onChange(e.target.value)}
                    onKeyDown={onKey}
                    aria-label={field.label}
                />
            </div>
        </div>
    );
}
