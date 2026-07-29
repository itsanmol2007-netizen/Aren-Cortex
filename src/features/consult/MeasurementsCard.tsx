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
// ---------------------------------------------------------------------------

import { useRef } from "react";
import { Activity, Move } from "lucide-react";
import type { Vitals } from "../../types";

/**
 * `unit` is printed on the card rather than left to the doctor to type. That is
 * cosmetic for weight and load-bearing for temperature: the rule base is
 * Celsius, this field is Fahrenheit, and the two are reconciled downstream by a
 * magnitude heuristic. Printing °F is the cheapest way to stop someone entering
 * 38 and meaning it.
 *
 * `warnText` exists because an amber card that will not say why is a card the
 * doctor learns to ignore.
 */
interface Field {
    key: keyof Vitals;
    label: string;
    placeholder: string;
    warn?: (v: string) => boolean;
    warnText?: string;
}

const FIELDS: Field[] = [
    {
        key: "pulse", label: "Pulse (bpm)", placeholder: "72",
        warn: (v) => { const n = parseInt(v, 10); return !isNaN(n) && (n > 100 || n < 50); },
        warnText: "Outside 50–100 bpm",
    },
    {
        key: "spo2", label: "SpO₂ (%)", placeholder: "98",
        warn: (v) => { const n = parseInt(v, 10); return !isNaN(n) && n < 95; },
        warnText: "Below 95%",
    },
    {
        key: "temp", label: "Temp (°F)", placeholder: "98.6",
        warn: (v) => { const n = parseFloat(v); return !isNaN(n) && (n > 99.5 || n < 96); },
        warnText: "Outside 96–99.5 °F",
    },
    { key: "weight", label: "Weight (kg)", placeholder: "—" },
];

interface Props {
    vitals: Vitals;
    onChange: (v: Vitals) => void;
    disabled?: boolean;
}

export function MeasurementsCard({ vitals, onChange, disabled = false }: Props) {
    // Enter walks the row, so five measurements are one hand on the number row
    // rather than five clicks.
    const refs = useRef<(HTMLInputElement | null)[]>([]);
    const focusNext = (i: number) => refs.current[i + 1]?.focus();

    // BP is STORED as one "120/80" string because that is what the engine
    // splits and what the prescription prints. It is ENTERED as two boxes
    // because that is how it is measured, and because a single box invites
    // "120 80", "120-80" and every other spelling of a slash.
    const [sysRaw = "", diaRaw = ""] = String(vitals.bp ?? "").split("/");
    const sys = sysRaw.trim();
    const dia = diaRaw.trim();

    const setBp = (nextSys: string, nextDia: string) => {
        const s = nextSys.trim();
        const d = nextDia.trim();
        onChange({ ...vitals, bp: !s && !d ? "" : `${s}/${d}` });
    };

    const bpSys = parseInt(sys, 10);
    const bpWarn = !isNaN(bpSys) && (bpSys > 140 || bpSys < 90);
    const bpFilled = sys.length > 0 || dia.length > 0;

    return (
        <section className="cs-card" aria-label="Measurements">
            <div className="cs-card-head">
                <h2 className="cs-card-title">
                    <span className="cs-glyph is-slate"><Activity size={12} /></span>
                    Measurements
                </h2>
            </div>

            <div className="cs-meas-grid">
                <div
                    className={`cs-meas${bpFilled ? " is-filled" : ""}${bpWarn ? " is-warn" : ""}`}
                    title={bpWarn ? "Systolic outside 90–140 mmHg" : undefined}
                >
                    <span className="cs-meas-label">BP (mmHg)</span>
                    <div className="cs-meas-value">
                        <input
                            ref={(el) => { refs.current[0] = el; }}
                            value={sys}
                            placeholder="120"
                            inputMode="numeric"
                            disabled={disabled}
                            onChange={(e) => setBp(e.target.value, dia)}
                            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); refs.current[1]?.focus(); } }}
                            aria-label="Systolic blood pressure in mmHg"
                        />
                        <span className="cs-meas-slash" aria-hidden="true">/</span>
                        <input
                            ref={(el) => { refs.current[1] = el; }}
                            value={dia}
                            placeholder="80"
                            inputMode="numeric"
                            disabled={disabled}
                            onChange={(e) => setBp(sys, e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); focusNext(1); } }}
                            aria-label="Diastolic blood pressure in mmHg"
                        />
                    </div>
                </div>

                {FIELDS.map((f, i) => {
                    const val = vitals[f.key];
                    const filled = val.trim().length > 0;
                    const isWarn = filled && f.warn ? f.warn(val) : false;
                    const idx = i + 2; // 0 and 1 are the two BP boxes

                    return (
                        <div
                            key={f.key}
                            className={`cs-meas${filled ? " is-filled" : ""}${isWarn ? " is-warn" : ""}`}
                            title={isWarn ? f.warnText : undefined}
                        >
                            <span className="cs-meas-label">{f.label}</span>
                            <div className="cs-meas-value">
                                <input
                                    ref={(el) => { refs.current[idx] = el; }}
                                    value={val}
                                    placeholder={f.placeholder}
                                    inputMode="decimal"
                                    disabled={disabled}
                                    onChange={(e) => onChange({ ...vitals, [f.key]: e.target.value })}
                                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); focusNext(idx); } }}
                                    aria-label={f.label}
                                />
                            </div>
                        </div>
                    );
                })}

                {/* The placeholder the mock reserves for specialty-specific
                    measurements — a physiotherapy profile adds range-of-motion
                    here, without a new layout. Inert until a profile declares
                    one, and visibly so. */}
                <div className="cs-meas is-add" aria-hidden="true">
                    <Move size={14} />
                    <span className="cs-meas-label">Add Measurement</span>
                </div>
            </div>
        </section>
    );
}
