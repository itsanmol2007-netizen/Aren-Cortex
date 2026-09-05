// ---------------------------------------------------------------------------
// ADMIN CHARTS — inline SVG, no charting library.
//
// A dependency was the obvious move here and it is the wrong one. Every chart
// library ships its own visual language — its own type scale, its own default
// palette, its own tooltip chrome — and this codebase has exactly seven
// semantic colours and one type scale it has already paid to keep consistent
// (`docs/cortex-design-dna/colour.md`: "there is no eighth colour"). Importing
// recharts would mean fighting its defaults on every surface forever, plus
// ~90KB on a bundle already flagged at 1.75MB. Four small SVG components read
// the same `--cs-*` tokens every other card does, and a token change reaches
// them for free.
//
// ── Why these measure instead of scaling
//
// `preserveAspectRatio="none"` is the cheap way to make an SVG responsive and
// it distorts every stroke and circle in the drawing. So each chart measures
// its own container (one ResizeObserver) and renders at real pixel
// dimensions — round dots stay round, 1px hairlines stay 1px, and text is
// never stretched.
// ---------------------------------------------------------------------------

import { useLayoutEffect, useRef, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import type { DayPoint, Metric } from "../../lib/db/admin";
import { formatDayShort, formatMoneyShort } from "../../lib/db/admin";

// ── Measuring ──────────────────────────────────────────────────────────────

/** Container width in real pixels. Returns 0 until first measure, which every
 *  chart below treats as "don't draw yet" rather than drawing at a guessed
 *  width and snapping on the next frame. */
function useWidth<T extends HTMLElement>(ref: React.RefObject<T | null>): number {
    const [w, setW] = useState(0);
    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;
        setW(el.clientWidth);
        const ro = new ResizeObserver(([entry]) => setW(entry.contentRect.width));
        ro.observe(el);
        return () => ro.disconnect();
    }, [ref]);
    return w;
}

// ── Delta chip ─────────────────────────────────────────────────────────────

/**
 * "+18% vs previous 7 days". The comparison is the whole point of the chip —
 * a bare arrow with a percentage next to a number tells a manager nothing
 * about what it is being compared WITH, which is the question they ask first.
 *
 * `changePct === null` means the previous period was zero. That renders as
 * "no prior data", never as "+100%" — a rise from nothing has no percentage,
 * and inventing one is how a dashboard loses its reader's trust.
 */
export function Delta({
    metric, invert = false, compareLabel,
}: {
    metric: Metric;
    /** True where DOWN is good (cancellations, no-shows). */
    invert?: boolean;
    compareLabel: string;
}) {
    const pct = metric.changePct;

    if (pct === null) {
        return (
            <span className="inline-flex items-center gap-[3px] text-[10.5px] font-medium text-[var(--cs-faint)]">
                <Minus size={10} /> No {compareLabel} data
            </span>
        );
    }

    const flat = Math.abs(pct) < 0.5;
    const good = invert ? pct < 0 : pct > 0;
    const tone = flat
        ? "text-[var(--cs-faint)]"
        : good ? "text-[var(--cs-green)]" : "text-[var(--cs-red)]";
    const Icon = flat ? Minus : pct > 0 ? ArrowUpRight : ArrowDownRight;

    return (
        <span className={`inline-flex items-center gap-[2px] text-[10.5px] font-bold tabular-nums ${tone}`}>
            <Icon size={11} />
            {flat ? "Flat" : `${pct > 0 ? "+" : ""}${pct.toFixed(0)}%`}
            <span className="font-medium text-[var(--cs-faint)]">vs {compareLabel}</span>
        </span>
    );
}

// ── Trend chart ────────────────────────────────────────────────────────────

const PAD = { top: 10, right: 6, bottom: 18, left: 6 };

/**
 * The daily line. One metric at a time, chosen by the card above it — two
 * series on one axis would need two axes (patients are counts, money is
 * rupees), and a dual-axis chart is the classic way to imply a correlation
 * that isn't there.
 *
 * A single-day range draws a dot rather than a line, because a line between
 * one point and itself is a horizontal rule that reads as "flat" when it
 * actually means "there is nothing to compare".
 */
export function TrendChart({
    points, metricKey, height = 132,
}: {
    points: DayPoint[];
    metricKey: "visits" | "revenue";
    height?: number;
}) {
    const wrapRef = useRef<HTMLDivElement>(null);
    const width = useWidth(wrapRef);
    const [hover, setHover] = useState<number | null>(null);

    const money = metricKey === "revenue";
    const stroke = money ? "var(--cs-violet)" : "var(--cs-blue)";
    const gradId = money ? "adm-grad-rev" : "adm-grad-vis";

    const values = points.map((p) => (money ? p.revenue : p.visits));
    // A flat-zero series still needs a scale, or every y collapses onto the
    // baseline and the chart looks broken rather than empty.
    const max = Math.max(...values, 1);
    const innerW = Math.max(width - PAD.left - PAD.right, 1);
    const innerH = height - PAD.top - PAD.bottom;

    const xAt = (i: number) =>
        PAD.left + (points.length <= 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
    const yAt = (v: number) => PAD.top + innerH - (v / max) * innerH;

    const linePath = points.map((_, i) => `${i === 0 ? "M" : "L"}${xAt(i)},${yAt(values[i])}`).join(" ");
    const areaPath = points.length > 1
        ? `${linePath} L${xAt(points.length - 1)},${PAD.top + innerH} L${xAt(0)},${PAD.top + innerH} Z`
        : "";

    const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
        if (points.length === 0) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left - PAD.left;
        const i = points.length <= 1 ? 0 : Math.round((x / innerW) * (points.length - 1));
        setHover(Math.min(Math.max(i, 0), points.length - 1));
    };

    const hovered = hover !== null ? points[hover] : null;

    return (
        <div ref={wrapRef} className="relative w-full">
            {width > 0 && (
                <svg
                    width={width}
                    height={height}
                    onMouseMove={onMove}
                    onMouseLeave={() => setHover(null)}
                    role="img"
                    aria-label={money ? "Collections per day" : "Patients per day"}
                >
                    <defs>
                        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={stroke} stopOpacity="0.20" />
                            <stop offset="100%" stopColor={stroke} stopOpacity="0.01" />
                        </linearGradient>
                    </defs>

                    {/* Three hairlines, not a full grid — the grid is reference,
                        never the subject (colour.md: structure stays quiet). */}
                    {[0, 0.5, 1].map((t) => (
                        <line
                            key={t}
                            x1={PAD.left} x2={width - PAD.right}
                            y1={PAD.top + innerH * t} y2={PAD.top + innerH * t}
                            stroke="var(--cs-line)" strokeWidth={1}
                        />
                    ))}

                    {areaPath && <path d={areaPath} fill={`url(#${gradId})`} />}
                    {points.length > 1 && (
                        <path
                            d={linePath} fill="none" stroke={stroke}
                            strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round"
                        />
                    )}
                    {points.length === 1 && (
                        <circle cx={xAt(0)} cy={yAt(values[0])} r={3.5} fill={stroke} />
                    )}

                    {hovered && (
                        <>
                            <line
                                x1={xAt(hover!)} x2={xAt(hover!)}
                                y1={PAD.top} y2={PAD.top + innerH}
                                stroke={stroke} strokeWidth={1} strokeDasharray="3 3" opacity={0.5}
                            />
                            <circle
                                cx={xAt(hover!)} cy={yAt(values[hover!])} r={3.5}
                                fill="var(--cs-card)" stroke={stroke} strokeWidth={2}
                            />
                        </>
                    )}
                </svg>
            )}

            {/* Axis labels live in HTML, not SVG text: they inherit the page's
                font stack and stay crisp at any zoom. */}
            <div className="flex justify-between px-[6px] pt-[1px] text-[9.5px] font-medium text-[var(--cs-faint)]">
                <span>{points.length ? formatDayShort(points[0].date) : ""}</span>
                <span className="tabular-nums">
                    peak {money ? formatMoneyShort(max) : max}
                </span>
                <span>{points.length ? formatDayShort(points[points.length - 1].date) : ""}</span>
            </div>

            {hovered && (
                <div
                    className="pointer-events-none absolute top-[2px] z-10 -translate-x-1/2 whitespace-nowrap rounded-[7px] border border-[var(--cs-line-strong)] bg-[var(--cs-card)] px-[8px] py-[4px] text-[10.5px] shadow-[0_4px_14px_rgba(16,28,46,0.13)]"
                    style={{ left: Math.min(Math.max(xAt(hover!), 48), Math.max(width - 48, 48)) }}
                >
                    <strong className="font-bold tabular-nums text-[var(--cs-ink)]">
                        {money ? formatMoneyShort(hovered.revenue) : hovered.visits}
                    </strong>{" "}
                    <span className="text-[var(--cs-faint)]">
                        {money ? "collected" : hovered.visits === 1 ? "patient" : "patients"} · {formatDayShort(hovered.date)}
                    </span>
                </div>
            )}
        </div>
    );
}

// ── Busiest hours ──────────────────────────────────────────────────────────

/**
 * Twenty-four bars would be mostly empty — a clinic is shut for half of them.
 * This renders only the span that actually saw a patient, which turns a
 * sparse strip into a readable shape and answers the real question ("when
 * should I put the second doctor on") instead of drawing a lot of zeros.
 */
export function HourBars({ byHour }: { byHour: number[] }) {
    const active = byHour.map((n, h) => ({ n, h })).filter((b) => b.n > 0);
    if (active.length === 0) {
        return (
            <p className="m-0 py-[10px] text-center text-[11.5px] text-[var(--cs-faint)]">
                No visits in this period.
            </p>
        );
    }

    const first = Math.max(active[0].h - 1, 0);
    const last = Math.min(active[active.length - 1].h + 1, 23);
    const span = byHour.slice(first, last + 1).map((n, i) => ({ n, h: first + i }));
    const max = Math.max(...span.map((b) => b.n), 1);
    const busiest = active.reduce((a, b) => (b.n > a.n ? b : a));

    const label = (h: number) => `${((h + 11) % 12) + 1}${h < 12 ? "am" : "pm"}`;

    return (
        <div className="flex flex-col gap-[5px]">
            <div className="flex h-[64px] items-end gap-[3px]">
                {span.map((b) => (
                    <div key={b.h} className="group relative flex flex-1 flex-col justify-end" title={`${b.n} at ${label(b.h)}`}>
                        <div
                            className={
                                "w-full rounded-t-[3px] transition-colors " +
                                (b.h === busiest.h ? "bg-[var(--cs-violet)]" : "bg-[var(--cs-blue-soft)] group-hover:bg-[var(--cs-blue)]")
                            }
                            style={{ height: `${Math.max((b.n / max) * 100, b.n > 0 ? 6 : 2)}%` }}
                        />
                    </div>
                ))}
            </div>
            <div className="flex justify-between text-[9.5px] font-medium text-[var(--cs-faint)]">
                <span>{label(first)}</span>
                <span className="font-semibold text-[var(--cs-violet)]">
                    Busiest {label(busiest.h)}
                </span>
                <span>{label(last)}</span>
            </div>
        </div>
    );
}

// ── Bench comparison bar ───────────────────────────────────────────────────

/** One doctor's share of the clinic's work, as a bar behind their row. The
 *  bar is the comparison; the number beside it is the fact. */
export function ShareBar({ share, tone = "blue" }: { share: number; tone?: "blue" | "violet" | "teal" }) {
    const FILL = {
        blue: "bg-[var(--cs-blue)]",
        violet: "bg-[var(--cs-violet)]",
        teal: "bg-[var(--cs-teal)]",
    } as const;
    return (
        <div className="h-[5px] w-full overflow-hidden rounded-full bg-[#eef0f5]">
            <div
                className={`h-full rounded-full transition-[width] duration-500 ease-out ${FILL[tone]}`}
                style={{ width: `${Math.max(share * 100, share > 0 ? 3 : 0)}%` }}
            />
        </div>
    );
}

/** A ring showing one percentage — used for completion rate, where a bar
 *  would imply a comparison against other bars that do not exist. */
export function Ring({ pct, size = 52 }: { pct: number; size?: number }) {
    const r = (size - 6) / 2;
    const c = 2 * Math.PI * r;
    const clamped = Math.min(Math.max(pct, 0), 100);
    // Green only once the clinic is actually closing most of its visits;
    // amber below that. A ring that is green at 40% teaches nothing.
    const stroke = clamped >= 80 ? "var(--cs-green)" : clamped >= 50 ? "var(--cs-amber)" : "var(--cs-red)";

    return (
        <svg width={size} height={size} role="img" aria-label={`${Math.round(clamped)} percent completed`}>
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#eef0f5" strokeWidth={5} />
            <circle
                cx={size / 2} cy={size / 2} r={r} fill="none" stroke={stroke} strokeWidth={5}
                strokeLinecap="round"
                strokeDasharray={`${(clamped / 100) * c} ${c}`}
                transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
            <text
                x="50%" y="50%" textAnchor="middle" dominantBaseline="central"
                className="fill-[var(--cs-ink)] text-[13px] font-bold tabular-nums"
            >
                {Math.round(clamped)}%
            </text>
        </svg>
    );
}

