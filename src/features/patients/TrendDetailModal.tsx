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
// hands off to the one shared `PastVisitCard` (via `onOpenVisit`), in its
// light tone, layered over this modal so closing it steps back to the graph.
//
// ── The chart is colour-matched to the card that opened it
//
// The line, the dots, the area fill and the verdict badge all take ONE colour
// from `series.verdict`, and it is the same green/amber/slate the mini-card's
// own sparkline already uses (`.prec-trend-card.is-improving .cs-lt-spark` et
// al, patients-detail.css). A blue line under a green "Improving" badge — the
// first cut of this file — made the expanded graph look like a different
// measurement from the card that opened it. No new colours: rule 4.
//
// ── Hovering is the interaction, and it goes both ways
//
// "The doctor should be able to understand how the graph is made and interact
// with the graph." One `hoverIndex` drives both halves: pointing at a dot
// lifts its reading row, pointing at a row lifts its dot and shows the value
// above it. That is what ties "the line bends here" to "this visit, this
// number" without a second click or a tooltip library.
// ---------------------------------------------------------------------------

import { useState } from "react";
import { ArrowDown, ArrowRight, ArrowUp, TrendingUp } from "lucide-react";
import { ChartSurface } from "../consult/ChartSurface";
import { formatDelta, formatValue, type TrendSeries, type TrendVerdict } from "../consult/trend";
import { formatSpan } from "../consult/LongitudinalBand";
import type { RealVisit } from "../../lib/db";
import { formatVisitDate } from "../../components/PastVisitCard";

const VERDICT_LABEL: Record<TrendVerdict, (rising: boolean, delta: number) => string> = {
    improving: () => "Improving",
    worsening: () => "Worse",
    steady: () => "Steady",
    neutral: (rising, delta) => (rising ? "Up" : delta < 0 ? "Down" : "Steady"),
};

/** The one colour per verdict — same values the mini-card sparklines use. */
const VERDICT_INK: Record<TrendVerdict, string> = {
    improving: "#16a34a",
    worsening: "#a16207",
    steady: "#94a3b8",
    neutral: "#94a3b8",
};

const VERDICT_TONE: Record<TrendVerdict, string> = {
    improving: "bg-[#eafaf0] text-[#16a34a]",
    worsening: "bg-[#fffbeb] text-[#a16207]",
    steady: "bg-[#eef2f9] text-[#475569]",
    neutral: "bg-[#eef2f9] text-[#475569]",
};

function VerdictIcon({ verdict, rising }: { verdict: TrendVerdict; rising: boolean }) {
    if (verdict === "steady") return <ArrowRight size={13} aria-hidden="true" />;
    return rising ? <ArrowUp size={13} aria-hidden="true" /> : <ArrowDown size={13} aria-hidden="true" />;
}

/**
 * The plotted line — same real-time-axis math as `Sparkline`
 * (`LongitudinalBand.tsx`: x is TIME, so a long gap between visits LOOKS
 * long), at a size a doctor can read a date and a value off, and with the
 * scale actually stated: the first cut drew a decorative midline at a fixed
 * H/2 that meant nothing, so 78 → 110 had no frame of reference at all. The
 * two gridlines here are the series' real low and high, labelled.
 */
function TrendChart({
    series, colour, hoverIndex, onHover, onPointClick,
}: {
    series: TrendSeries;
    colour: string;
    hoverIndex: number | null;
    onHover: (i: number | null) => void;
    onPointClick: (visitId: string) => void;
}) {
    const W = 580;
    const H = 186;
    const PAD_L = 40;
    const PAD_R = 16;
    const PAD_T = 26;
    const PAD_B = 30;

    const pts = series.points;
    const times = pts.map((p) => +new Date(p.at));
    const t0 = times[0];
    const tN = times[times.length - 1];
    const span = tN - t0;
    const values = pts.map((p) => p.value);
    const lo = Math.min(...values);
    const hi = Math.max(...values);
    const range = hi - lo;

    const plotTop = PAD_T;
    const plotBottom = H - PAD_B;
    const plotH = plotBottom - plotTop;

    const xy = pts.map((p, i) => {
        // Even spacing only if every reading somehow shares one instant —
        // `collapseSameDay` prevents it, but dividing by zero is worse.
        const x = span > 0
            ? PAD_L + ((times[i] - t0) / span) * (W - PAD_L - PAD_R)
            : PAD_L + (i / Math.max(1, pts.length - 1)) * (W - PAD_L - PAD_R);
        // A flat series sits on the middle line rather than the floor.
        const y = range > 0
            ? plotBottom - ((p.value - lo) / range) * plotH
            : plotTop + plotH / 2;
        return { x, y, p };
    });

    const line = xy.map((d, i) => `${i === 0 ? "M" : "L"}${d.x.toFixed(1)},${d.y.toFixed(1)}`).join(" ");
    // Closed back down to the floor — the fill is what stops a 2px line
    // floating in a large empty box.
    const area = `${line} L${xy[xy.length - 1].x.toFixed(1)},${plotBottom} L${xy[0].x.toFixed(1)},${plotBottom} Z`;
    const gradientId = `trend-fill-${series.key}`;

    const hovered = hoverIndex !== null ? xy[hoverIndex] : null;
    const hoverText = hovered ? `${formatValue(hovered.p.value)}${series.unit ? ` ${series.unit}` : ""}` : "";
    const hoverBoxW = Math.max(34, hoverText.length * 6.2 + 14);
    const hoverBoxX = hovered
        ? Math.min(Math.max(hovered.x - hoverBoxW / 2, 4), W - hoverBoxW - 4)
        : 0;

    return (
        <svg
            viewBox={`0 0 ${W} ${H}`}
            width="100%"
            height={H}
            role="img"
            aria-label={`${series.label} across ${series.sessions} readings, ${formatValue(series.first)} to ${formatValue(series.last)}`}
            onMouseLeave={() => onHover(null)}
        >
            <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={colour} stopOpacity="0.18" />
                    <stop offset="100%" stopColor={colour} stopOpacity="0" />
                </linearGradient>
            </defs>

            {/* The scale, stated — high and low of this series, labelled. A
                flat series gets one line, since its high and low are equal. */}
            {(range > 0 ? [{ v: hi, y: plotTop }, { v: lo, y: plotBottom }] : [{ v: lo, y: plotTop + plotH / 2 }]).map((g) => (
                <g key={g.v}>
                    <line
                        x1={PAD_L} y1={g.y} x2={W - PAD_R} y2={g.y}
                        stroke="#e8edf5" strokeWidth={1} strokeDasharray="3 4"
                    />
                    <text x={PAD_L - 8} y={g.y + 3} textAnchor="end" fontSize="9" fill="#94a3b8">
                        {formatValue(g.v)}
                    </text>
                </g>
            ))}

            <path d={area} fill={`url(#${gradientId})`} />
            <path d={line} fill="none" stroke={colour} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />

            {xy.map((d, i) => {
                const isLast = i === xy.length - 1;
                const isHot = hoverIndex === i;
                return (
                    <g key={`${d.p.at}-${i}`}>
                        <circle
                            cx={d.x} cy={d.y} r={isHot ? 11 : 0}
                            fill={colour} opacity={isHot ? 0.14 : 0}
                            className="transition-opacity duration-150 motion-reduce:transition-none"
                        />
                        <circle
                            cx={d.x} cy={d.y}
                            r={isHot ? 5.5 : isLast ? 5 : 3.5}
                            fill={isLast || isHot ? colour : "#fff"}
                            stroke={colour}
                            strokeWidth={2}
                        />
                        {/* A 3.5px dot is not a click target. This invisible
                            disc is — same centre, finger-sized. */}
                        <circle
                            cx={d.x} cy={d.y} r={14} fill="transparent"
                            style={{ cursor: d.p.visitId ? "pointer" : "default" }}
                            onMouseEnter={() => onHover(i)}
                            onClick={() => d.p.visitId && onPointClick(d.p.visitId)}
                        />
                        <text x={d.x} y={H - 8} textAnchor="middle" fontSize="9" fill={isHot ? "#475569" : "#94a3b8"}>
                            {new Date(d.p.at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                        </text>
                    </g>
                );
            })}

            {/* The hovered reading's own value, above its dot — the number the
                doctor is pointing at, without a click. */}
            {hovered && (
                <g pointerEvents="none">
                    <rect
                        x={hoverBoxX} y={Math.max(hovered.y - 30, 2)}
                        width={hoverBoxW} height={19} rx={6}
                        fill="#0f172a" opacity={0.92}
                    />
                    <text
                        x={hoverBoxX + hoverBoxW / 2} y={Math.max(hovered.y - 30, 2) + 13}
                        textAnchor="middle" fontSize="10.5" fontWeight="700" fill="#fff"
                    >
                        {hoverText}
                    </text>
                </g>
            )}
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
    /** chart index (oldest = 0) shared by the graph and the rows below it */
    const [hoverIndex, setHoverIndex] = useState<number | null>(null);

    const rising = series.delta > 0;
    const label = VERDICT_LABEL[series.verdict](rising, series.delta);
    const colour = VERDICT_INK[series.verdict];
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
            <div className="flex flex-col gap-[14px] px-[2px] pb-[2px]">
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

                <div className="rounded-[10px] border border-[#e2e8f5] bg-white px-[6px] pt-[6px] pb-[2px]">
                    <TrendChart
                        series={series}
                        colour={colour}
                        hoverIndex={hoverIndex}
                        onHover={setHoverIndex}
                        onPointClick={openPoint}
                    />
                    <p className="pb-[6px] text-center text-[11px] font-medium text-[#94a3b8]">
                        {series.sessions} readings across {formatSpan(series.spanDays)} · point a reading to trace it, click to open that visit
                    </p>
                </div>

                <div className="flex flex-col gap-[5px]">
                    <p className="px-[2px] text-[10.5px] font-bold uppercase tracking-[0.06em] text-[#94a3b8]">
                        Every reading
                    </p>
                    {[...series.points].reverse().map((p, rowIdx, arr) => {
                        // Rows run newest-first; the chart runs oldest-first.
                        const chartIdx = series.points.length - 1 - rowIdx;
                        const prev = arr[rowIdx + 1];
                        const delta = prev ? p.value - prev.value : null;
                        const visit = p.visitId ? findVisit(p.visitId) : null;
                        const isHot = hoverIndex === chartIdx;
                        return (
                            <button
                                key={`${p.at}-${rowIdx}`}
                                type="button"
                                disabled={!visit}
                                onClick={() => visit && onOpenVisit(visit)}
                                onMouseEnter={() => setHoverIndex(chartIdx)}
                                onMouseLeave={() => setHoverIndex(null)}
                                onFocus={() => setHoverIndex(chartIdx)}
                                onBlur={() => setHoverIndex(null)}
                                style={isHot ? { borderColor: colour } : undefined}
                                className={`flex items-center gap-[10px] rounded-[9px] border px-[12px] py-[8px] text-left transition-colors duration-150 enabled:cursor-pointer motion-reduce:transition-none ${
                                    isHot ? "bg-[#f7f9fc]" : "border-[#e2e8f5] bg-white"
                                } disabled:cursor-default`}
                            >
                                {/* The row's own dot, in the series' colour —
                                    the same mark it has on the line above. */}
                                <span
                                    className="h-[7px] w-[7px] shrink-0 rounded-full"
                                    style={{ background: colour, opacity: isHot ? 1 : 0.45 }}
                                />
                                <span className="flex-1 text-[12.5px] font-semibold text-[#0f172a]">
                                    {formatVisitDate(p.at)}
                                    {p.isToday && <span className="ml-[6px] text-[10.5px] font-bold uppercase tracking-[0.04em] text-[#1268e8]">Today</span>}
                                </span>
                                <span className="flex items-center gap-[8px]">
                                    <span className="text-[13.5px] font-bold text-[#0f172a]">
                                        {formatValue(p.value)}
                                        {series.unit && <span className="ml-[3px] text-[11px] font-medium text-[#94a3b8]">{series.unit}</span>}
                                    </span>
                                    {delta !== null && delta !== 0 && (
                                        <span className="w-[30px] text-right text-[11px] font-semibold text-[#94a3b8]">{formatDelta(delta)}</span>
                                    )}
                                    {(delta === null || delta === 0) && <span className="w-[30px]" aria-hidden="true" />}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>
        </ChartSurface>
    );
}
