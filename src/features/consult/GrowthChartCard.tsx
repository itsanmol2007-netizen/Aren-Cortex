// ---------------------------------------------------------------------------
// GROWTH CHART — the paediatrician's instrument, not another number box.
//
// Same argument as the dental chart and the body map (§14.7): the question is
// never "does this specialty change the ranking", it is "what does this doctor
// actually reach for". A paediatrician reaches for a growth chart. They do not
// read "11.4 kg"; they read where that dot sits against the curves, and — far
// more importantly — which way the dots are heading.
//
// What makes this one different from the other two specialty tools: THIS card
// is read by the engine. The dental chart and body map are presentation only,
// but a weight-for-age z-score is a `measurement_rules` input (WAZ -> below -2
// raises GROWTH_FALTERING at 0.8, below -3 at 1.0), so what is drawn here and
// what ranks below are the same number. See lib/synapse/consultInput.ts.
//
// It renders nothing at all without a date of birth. That is deliberate and is
// the whole reason `patients.date_of_birth` exists: WHO's standards are
// indexed per month, and `patients.age` is an integer of years — a 3-month-old
// and an 11-month-old are both "0", across a span where the median weight runs
// 3.35kg to 9.4kg. Guessing there would put a healthy infant on the wrong
// curve, so the card says what it needs instead.
// ---------------------------------------------------------------------------

import { useMemo, useState } from "react";
import { TrendingUp, Maximize2, Info } from "lucide-react";
import { ChartSurface } from "./ChartSurface";
import { growthZ, classify, CLASS_LABEL, type GrowthMetric, type Sex } from "../../lib/growth/growth";
import { WHO_MAX_MONTH } from "../../lib/growth/whoStandards";

interface Props {
    /** exact age in months from the date of birth — null when none is recorded */
    ageMonths: number | null;
    sex: Sex | null;
    weightKg: string;
    heightCm: string;
    /** see DentalChartCard — "modal" means launcher-driven, nothing inline */
    presentation?: "card" | "modal";
    open?: boolean;
    onClose?: () => void;
    disabled?: boolean;
}

const METRICS: { key: GrowthMetric; label: string; unit: string }[] = [
    { key: "weight-for-age", label: "Weight for age", unit: "kg" },
    { key: "height-for-age", label: "Height for age", unit: "cm" },
];

// The curves a printed WHO chart shows. −2 and +2 are the ones that carry a
// classification; the rest are there so a dot has context to sit in.
const BANDS = [-3, -2, 0, 2, 3];

const BAND_STYLE: Record<string, { stroke: string; width: number; dash?: string }> = {
    "-3": { stroke: "#b42318", width: 1.2 },
    "-2": { stroke: "#b45309", width: 1.2 },
    "0": { stroke: "#64748b", width: 1.6 },
    "2": { stroke: "#b45309", width: 1.2, dash: "3 3" },
    "3": { stroke: "#b42318", width: 1.2, dash: "3 3" },
};

// Plot box, in SVG units.
const W = 460, H = 240, PAD_L = 34, PAD_B = 24, PAD_T = 10, PAD_R = 8;

export function GrowthChartCard({
    ageMonths, sex, weightKg, heightCm,
    presentation = "card", open = false, onClose, disabled = false,
}: Props) {
    const [metric, setMetric] = useState<GrowthMetric>("weight-for-age");
    const [expanded, setExpanded] = useState(false);

    const value = metric === "weight-for-age"
        ? Number.parseFloat(weightKg)
        : Number.parseFloat(heightCm);

    const reading = useMemo(() => {
        if (ageMonths === null || !sex || !Number.isFinite(value)) return null;
        return growthZ(metric, value, ageMonths, sex);
    }, [metric, value, ageMonths, sex]);

    // The reference curves, sampled monthly across the whole 0–60 window. Each
    // is the value at that many SD, which is exactly what a printed WHO chart
    // draws — so the shape a doctor recognises is the shape they get.
    const curves = useMemo(() => {
        if (!sex) return null;
        const months = Array.from({ length: WHO_MAX_MONTH + 1 }, (_, i) => i);
        const series = BANDS.map((sd) => ({
            sd,
            points: months.map((m) => {
                // Invert the z: find the value whose z is `sd` at this age, by
                // asking growthZ for the median and scaling. Cheaper and exact:
                // reuse the same LMS the reading itself came from.
                const probe = valueAtSd(metric, m, sex, sd);
                return { m, v: probe };
            }).filter((p) => p.v !== null) as { m: number; v: number }[],
        }));
        const all = series.flatMap((s) => s.points.map((p) => p.v));
        return { series, min: Math.min(...all), max: Math.max(...all) };
    }, [metric, sex]);

    const x = (m: number) => PAD_L + (m / WHO_MAX_MONTH) * (W - PAD_L - PAD_R);
    const y = (v: number) => {
        if (!curves) return 0;
        const span = curves.max - curves.min || 1;
        return H - PAD_B - ((v - curves.min) / span) * (H - PAD_B - PAD_T);
    };

    const outOfRange = ageMonths !== null && ageMonths > WHO_MAX_MONTH;

    const chart = curves && (
        <svg viewBox={`0 0 ${W} ${H}`} className="cs-growth-svg" role="img"
            aria-label={`${METRICS.find((m) => m.key === metric)?.label} reference curves`}>
            {/* axes */}
            <line x1={PAD_L} y1={H - PAD_B} x2={W - PAD_R} y2={H - PAD_B} stroke="#cbd5e1" strokeWidth="1" />
            <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={H - PAD_B} stroke="#cbd5e1" strokeWidth="1" />
            {[0, 12, 24, 36, 48, 60].map((m) => (
                <g key={m}>
                    <line x1={x(m)} y1={H - PAD_B} x2={x(m)} y2={H - PAD_B + 3} stroke="#cbd5e1" />
                    <text x={x(m)} y={H - PAD_B + 14} textAnchor="middle" className="cs-growth-tick">
                        {m === 0 ? "birth" : `${m / 12}y`}
                    </text>
                </g>
            ))}
            {curves.series.map(({ sd, points }) => {
                const s = BAND_STYLE[String(sd)];
                return (
                    <g key={sd}>
                        <path
                            d={points.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.m)},${y(p.v)}`).join(" ")}
                            fill="none" stroke={s.stroke} strokeWidth={s.width} strokeDasharray={s.dash}
                            opacity={sd === 0 ? 0.9 : 0.55}
                        />
                        <text x={W - PAD_R + 1} y={y(points[points.length - 1].v) + 3}
                            className="cs-growth-band-label" fill={s.stroke}>
                            {sd > 0 ? `+${sd}` : sd}
                        </text>
                    </g>
                );
            })}
            {/* this visit */}
            {reading && ageMonths !== null && Number.isFinite(value) && (
                <g>
                    <line x1={x(ageMonths)} y1={PAD_T} x2={x(ageMonths)} y2={H - PAD_B}
                        stroke="#1268e8" strokeWidth="1" strokeDasharray="2 3" opacity="0.5" />
                    <circle cx={x(ageMonths)} cy={y(value)} r="5" fill="#1268e8" stroke="#fff" strokeWidth="2" />
                </g>
            )}
        </svg>
    );

    // The metric switch. Shared by both presentations, because which curve you
    // are reading is part of the chart, not part of the card that framed it.
    const metricToggle = (
        <div className="cs-growth-toggle" role="tablist">
            {METRICS.map((m) => (
                <button
                    key={m.key}
                    type="button"
                    role="tab"
                    aria-selected={metric === m.key}
                    className={`cs-growth-tab${metric === m.key ? " is-on" : ""}`}
                    onClick={() => setMetric(m.key)}
                    disabled={disabled}
                >
                    {m.label}
                </button>
            ))}
        </div>
    );

    /* Every reason this card cannot draw, said in words rather than left as an
       empty box. Each one is a different fix. `large` only decides the plot
       size, so the modal and the card can never disagree about WHAT they say —
       there is one body, rendered at two scales. */
    const renderBody = (large: boolean) =>
        ageMonths === null ? (
            <p className="cs-growth-note">
                <Info size={14} />
                Add this patient’s <strong>date of birth</strong> to plot growth. Age in years is not
                precise enough — WHO’s standards are indexed by month.
            </p>
        ) : outOfRange ? (
            <p className="cs-growth-note">
                <Info size={14} />
                WHO growth standards cover birth to 5 years. This patient is older, so no percentile
                is shown rather than one read off a curve that does not apply.
            </p>
        ) : !sex ? (
            <p className="cs-growth-note">
                <Info size={14} />
                Growth standards are published separately for boys and girls. Record the patient’s sex
                to plot this.
            </p>
        ) : (
            <>
                <div className={`cs-growth-plot${large ? " is-large" : ""}`}>{chart}</div>

                {reading ? (
                    <div className={`cs-growth-readout is-${classify(reading)}`}>
                        <span className="cs-growth-z">
                            {reading.z > 0 ? "+" : ""}{reading.z} SD
                        </span>
                        <span className="cs-growth-pct">{reading.percentile}th centile</span>
                        <span className="cs-growth-class">{CLASS_LABEL[classify(reading)]}</span>
                        {reading.tailCorrected && (
                            <span className="cs-growth-tail" title="Beyond ±3 SD, WHO rescales the tail rather than reading the raw curve">
                                tail-corrected
                            </span>
                        )}
                    </div>
                ) : (
                    <p className="cs-growth-note">
                        <Info size={14} />
                        Enter {metric === "weight-for-age" ? "a weight" : "a height"} in Measurements to
                        place this visit on the chart.
                    </p>
                )}

                {/* One visit is a dot. Faltering is a direction, and this
                    card cannot yet show one — said plainly rather than
                    letting a single point imply a trend. */}
                <p className="cs-growth-foot">
                    This visit only. Growth faltering is a <em>trajectory</em> — plotting past visits
                    is not built yet.
                </p>
            </>
        );

    if (presentation === "modal") {
        if (!open) return null;
        return (
            <ChartSurface title="Growth" eyebrow="Paediatrics" icon={<TrendingUp size={15} />} expanded onClose={onClose ?? (() => {})}>
                <div className="cs-growth-modal">
                    {metricToggle}
                    {renderBody(true)}
                </div>
            </ChartSurface>
        );
    }

    return (
        <section className="cs-card" aria-label="Growth chart">
            <div className="cs-card-head">
                <h2 className="cs-card-title">
                    <span className="cs-glyph is-slate"><TrendingUp size={16} /></span>
                    Growth
                </h2>
                <div className="cs-growth-head-right">
                    {metricToggle}
                    {curves && (
                        <button type="button" className="cs-chart-expand" onClick={() => setExpanded(true)}
                            aria-label="Open growth chart larger">
                            <Maximize2 size={16} />
                        </button>
                    )}
                </div>
            </div>

            {renderBody(false)}

            <ChartSurface title="Growth" eyebrow="Paediatrics" icon={<TrendingUp size={15} />} expanded={expanded} onClose={() => setExpanded(false)}>
                <div className="cs-growth-plot is-large">{chart}</div>
            </ChartSurface>
        </section>
    );
}

// ── Reference curve values ──────────────────────────────────────────────────
// The value at `sd` standard deviations for a given age and sex. Uses the same
// LMS coefficients the z-score does, so the curve a dot is judged against and
// the number beside it can never disagree.
//
// Deliberately NOT a second copy of the LMS maths: it binary-searches the
// existing `growthZ`, which is the one place the formula (and WHO's tail
// correction) lives. Slower and completely irrelevant at this scale — 61
// points per curve, five curves, recomputed only when the metric or sex
// changes — and it means there is no second implementation to drift.
function valueAtSd(metric: GrowthMetric, months: number, sex: Sex, sd: number): number | null {
    let lo = 0.1;
    let hi = metric === "weight-for-age" ? 60 : 200;
    for (let i = 0; i < 40; i++) {
        const mid = (lo + hi) / 2;
        const r = growthZ(metric, mid, months, sex);
        if (!r) return null;
        if (r.z < sd) lo = mid; else hi = mid;
    }
    return Math.round(((lo + hi) / 2) * 100) / 100;
}
