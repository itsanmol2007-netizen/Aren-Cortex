// ---------------------------------------------------------------------------
// TREND DETAIL MODAL — one Progress Trend graph, expanded.
//
// Patient Record, 2026-08-31. Clicking a trend mini-card used to open
// `PastVisitCard` for the single visit that produced its newest reading — the
// wrong answer to what was actually asked. A doctor clicking a graph wants to
// know about the GRAPH: where the readings came from, how the number moved
// visit to visit, why the sparkline bends where it bends. That is a different
// question from "what happened at one visit", and this modal answers it —
// with the real plotted line (`TrendChart` below, the same time-axis math as
// `LongitudinalBand.tsx`'s `Sparkline`, just at a size a date is readable on)
// and a list of every reading that built it.
//
// It does NOT become a second per-visit detail view. `cortex-longitudinal-
// spec.md` §3.1 is explicit that one must never exist — but that rule is
// about visits, and this is about a series. Clicking a point or a row here
// hands off to the one shared `PastVisitCard` (via `onOpenVisit`), same as
// every other place in the app that opens a visit.
// ---------------------------------------------------------------------------

import { ArrowDown, ArrowRight, ArrowUp, TrendingUp } from "lucide-react";
import { ChartSurface } from "../consult/ChartSurface";
import { formatDelta, formatValue, formatSpan, type TrendSeries, type TrendVerdict } from "../consult/trend";
import type { RealVisit } from "../../lib/db";
import { formatVisitDate } from "../../components/PastVisitCard";

const VERDICT_LABEL: Record<TrendVerdict, (rising: boolean, delta: number) => string> = {
    improving: () => "Improving",
    worsening: () => "Worse",
    steady: () => "Steady",
    neutral: (rising, delta) => (rising ? "Up" : delta < 0 ? "Down" : "Steady"),
};

const VERDICT_TONE: Record<TrendVerdict, string> = {
    improving: "bg-[#eafaf0] text-[#1c8a4d]",
    worsening: "bg-[#fdf2f2] text-[#b3372f]",
    steady: "bg-[#eef2f9] text-[#475569]",
    neutral: "bg-[#eef2f9] text-[#475569]",
};

function VerdictIcon({ verdict, rising }: { verdict: TrendVerdict; rising: boolean }) {
    if (verdict === "steady") return <ArrowRight size={13} aria-hidden="true" />;
    return rising ? <ArrowUp size={13} aria-hidden="true" /> : <ArrowDown size={13} aria-hidden="true" />;
}

/**
 * The big plotted line — same real-time-axis math as `Sparkline`
 * (`LongitudinalBand.tsx`), at a size a doctor can actually read a date and
 * a value off. Every point is its own click target back to the visit that
 * recorded it, same as every row in the list below it.
 */
function TrendChart({ series, onPointClick }: { series: TrendSeries; onPointClick: (visitId: string) => void }) {
    const W = 580;
    const H = 168;
    const PAD_X = 26;
    const PAD_Y = 22;

    const pts = series.points;
    const times = pts.map((p) => +new Date(p.at));
    const t0 = times[0];
    const tN = times[times.length - 1];
    const span = tN - t0;
    const values = pts.map((p) => p.value);
    const lo = Math.min(...values);
    const hi = Math.max(...values);
    const range = hi - lo;

    const xy = pts.map((p, i) => {
        const x = span > 0
            ? PAD_X + ((times[i] - t0) / span) * (W - PAD_X * 2)
            : PAD_X + (i / Math.max(1, pts.length - 1)) * (W - PAD_X * 2);
        const y = range > 0
            ? PAD_Y + (H - PAD_Y * 2) - ((p.value - lo) / range) * (H - PAD_Y * 2)
            : H / 2;
        return { x, y, p };
    });
    const path = xy.map((d, i) => `${i === 0 ? "M" : "L"}${d.x.toFixed(1)},${d.y.toFixed(1)}`).join(" ");

    return (
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label={`${series.label} across ${series.sessions} visits`}>
            {/* Midline — orientation, not a real gridline system; this is a
                glance chart, not a plotting tool. */}
            <line x1={PAD_X} y1={H / 2} x2={W - PAD_X} y2={H / 2} stroke="#eef1f6" strokeWidth={1} />
            <path d={path} fill="none" stroke="#1268e8" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            {xy.map((d, i) => (
                <g key={i}>
                    <circle
                        cx={d.x}
                        cy={d.y}
                        r={i === xy.length - 1 ? 5 : 3.5}
                        fill="#fff"
                        stroke="#1268e8"
                        strokeWidth={2}
                        style={d.p.visitId ? { cursor: "pointer" } : undefined}
                        onClick={() => d.p.visitId && onPointClick(d.p.visitId)}
                    />
                    <text x={d.x} y={H - 4} textAnchor="middle" fontSize="9" fill="#94a3b8">
                        {new Date(d.p.at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                    </text>
                </g>
            ))}
        </svg>
    );
}

export function TrendDetailModal({
    series, visits, onClose, onOpenVisit,
}: {
    series: TrendSeries;
    /** completed visits, any order — used to resolve a point's `visitId` */
    visits: RealVisit[];
    onClose: () => void;
    onOpenVisit: (visit: RealVisit) => void;
}) {
    const rising = series.delta > 0;
    const label = VERDICT_LABEL[series.verdict](rising, series.delta);
    const findVisit = (id: string) => visits.find((v) => v.id === id) ?? null;
    const openPoint = (visitId: string) => {
        const v = findVisit(visitId);
        if (v) onOpenVisit(v);
    };

    return (
        <ChartSurface
            title={series.unit ? `${series.label} (${series.unit})` : series.label}
            eyebrow="Progress Trend"
            icon={<TrendingUp size={15} />}
            expanded
            onClose={onClose}
            maxWidth={640}
        >
            <div className="flex flex-col gap-[16px] px-[2px] pb-[2px]">
                <div className="flex items-center justify-between gap-3 rounded-[10px] border border-[#e2e8f5] bg-[#f7f9fc] px-4 py-3">
                    <div className="flex items-baseline gap-2">
                        <span className="text-[13px] font-semibold text-[#64748b]">{formatValue(series.first)}</span>
                        <ArrowRight size={13} className="text-[#94a3b8]" aria-hidden="true" />
                        <span className="text-[19px] font-extrabold text-[#0f172a]">{formatValue(series.last)}</span>
                        {series.unit && <span className="text-[12px] font-medium text-[#94a3b8]">{series.unit}</span>}
                    </div>
                    <div className={`flex items-center gap-[6px] rounded-[7px] px-[10px] py-[5px] text-[12px] font-bold ${VERDICT_TONE[series.verdict]}`}>
                        <VerdictIcon verdict={series.verdict} rising={rising} />
                        {formatDelta(series.delta)} · {label}
                    </div>
                </div>

                <div>
                    <TrendChart series={series} onPointClick={openPoint} />
                    <p className="mt-[2px] text-center text-[11px] font-medium text-[#94a3b8]">
                        {series.sessions} readings across {formatSpan(series.spanDays)}
                    </p>
                </div>

                <div className="flex flex-col gap-[6px]">
                    <p className="px-[2px] text-[10.5px] font-bold uppercase tracking-[0.06em] text-[#94a3b8]">
                        Every reading
                    </p>
                    {[...series.points].reverse().map((p, i, arr) => {
                        const prev = arr[i + 1];
                        const delta = prev ? p.value - prev.value : null;
                        const visit = p.visitId ? findVisit(p.visitId) : null;
                        return (
                            <button
                                key={`${p.at}-${i}`}
                                type="button"
                                disabled={!visit}
                                onClick={() => visit && onOpenVisit(visit)}
                                className="flex items-center justify-between gap-3 rounded-[9px] border border-[#e2e8f5] bg-white px-[13px] py-[9px] text-left transition-colors enabled:cursor-pointer enabled:hover:border-[#b8c8f0] enabled:hover:bg-[#f7f9fc] disabled:cursor-default"
                            >
                                <span className="text-[12.5px] font-semibold text-[#0f172a]">
                                    {formatVisitDate(p.at)}
                                    {p.isToday && <span className="ml-[6px] text-[10.5px] font-bold uppercase tracking-[0.04em] text-[#1268e8]">Today</span>}
                                </span>
                                <span className="flex items-center gap-[8px]">
                                    <span className="text-[13.5px] font-bold text-[#0f172a]">
                                        {formatValue(p.value)}
                                        {series.unit && <span className="ml-[3px] text-[11px] font-medium text-[#94a3b8]">{series.unit}</span>}
                                    </span>
                                    {delta !== null && delta !== 0 && (
                                        <span className="text-[11px] font-semibold text-[#94a3b8]">{formatDelta(delta)}</span>
                                    )}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>
        </ChartSurface>
    );
}
