// ---------------------------------------------------------------------------
// COMMUNICATION — the small pieces the page is assembled from.
//
// Split out of `CommunicationPage.tsx` so the page reads as a layout rather
// than as a layout with four chart implementations wedged into it. Everything
// here is inline SVG or Tailwind on `--cs-*` tokens; no chart library, same
// argument as `features/admin/charts.tsx`.
//
// ── The empty-state rule these implement
//
// Anmol, 2026-09-07: *"don't shrink this thing... the container size should be
// same, doesn't matter if there is data, one data, ten data, or completely
// filling it."* So a panel's height is fixed by the page, and what changes is
// what fills it:
//
//   0 rows   → `BigEmpty`: the art at full size, carrying the well, with one
//              fact and one next action under it.
//   1–3 rows → the rows, plus `FillArt` — the SAME drawing, low opacity,
//              behind them, so the leftover space reads as designed rather
//              than as a list that stopped early.
//   many     → the rows, scrolling inside the panel.
//
// The middle case is the one that is usually missed and the one that reads as
// unfinished; it is the `.prac-fill-art` pattern from Practice, reused rather
// than reinvented (design-dna/empty-states.md).
// ---------------------------------------------------------------------------

import { useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Send } from "lucide-react";

// ── Art ────────────────────────────────────────────────────────────────────

/**
 * Two bubbles mid-exchange with a read receipt on the front one.
 *
 * Deliberately the same subject as `PlaceholderArt.tsx`'s `CommunicationArt`
 * and deliberately a separate drawing: that one is a 96px mark for a page with
 * nothing on it, this one scales to fill a 300px well and needs a different
 * line weight to survive it. WhatsApp green, which is this page's one licensed
 * exception to "never a new hue" — the page is about a specific integration
 * and the colour says so faster than a caption.
 */
export function ConversationArt({ size = 168, className }: { size?: number; className?: string }) {
    return (
        <svg
            width={size} height={size * 0.86} viewBox="0 0 200 172" fill="none"
            aria-hidden="true" className={className}
        >
            <path
                d="M34 22h86a20 20 0 0 1 20 20v34a20 20 0 0 1-20 20H80l-19 17V96H34a20 20 0 0 1-20-20V42a20 20 0 0 1 20-20z"
                fill="#eafcf1" stroke="#bfe8cf" strokeWidth="2.4" strokeLinejoin="round"
            />
            <path d="M46 48h62M46 62h40" stroke="#9dd9b6" strokeWidth="3" strokeLinecap="round" />
            <path
                d="M74 74h92a20 20 0 0 1 20 20v32a20 20 0 0 1-20 20h-38l-18 18v-18H74a20 20 0 0 1-20-20V94a20 20 0 0 1 20-20z"
                fill="#dff7e8" stroke="#8fd4ab" strokeWidth="2.6" strokeLinejoin="round"
            />
            <path d="M88 98h62M88 112h44M88 126h30" stroke="#5fbb82" strokeWidth="3" strokeLinecap="round" />
            <g transform="translate(150 32)">
                <circle cx="14" cy="14" r="14" fill="#25d366" />
                <path d="M7 14.4l4 4 8-8.6" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            </g>
            <path d="M22 128l1.4 3.4 3.4 1.4-3.4 1.4L22 137.6l-1.4-3.4-3.4-1.4 3.4-1.4z" fill="#bfe8cf" />
            <path d="M186 16l1.1 2.7 2.7 1.1-2.7 1.1-1.1 2.7-1.1-2.7-2.7-1.1 2.7-1.1z" fill="#a7e0bb" />
        </svg>
    );
}

/** The same drawing, watermarked behind a short list. Absolutely positioned
 *  and inert, so it never intercepts a click meant for a row. */
export function FillArt({ children }: { children: ReactNode }) {
    return (
        <div className="pointer-events-none absolute bottom-[6px] right-[6px] select-none opacity-[0.13]" aria-hidden="true">
            {children}
        </div>
    );
}

/**
 * The zero state. Fills whatever the panel gives it, art first.
 *
 * `flex-1` + centring rather than a fixed height: the panel above decides how
 * tall this is, and the art is sized to carry it. A small drawing floating in
 * a large well is the failure this shape avoids (ui-doctrine §5).
 */
export function BigEmpty({
    art, fact, next, action,
}: { art: ReactNode; fact: string; next: string; action?: ReactNode }) {
    return (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-[8px] px-[22px] py-[12px] text-center">
            <div className="mb-[6px]">{art}</div>
            <strong className="text-[16px] font-bold text-[var(--cs-ink)]">{fact}</strong>
            <span className="max-w-[40ch] text-[13px] font-normal leading-[1.55] text-[var(--cs-muted)]">{next}</span>
            {action}
        </div>
    );
}

// ── Credit ring ────────────────────────────────────────────────────────────

/**
 * The balance as an arc of what is left of what was granted.
 *
 * Not `admin/charts.tsx`'s `Ring`: that one renders its own percentage in the
 * middle, and the number a doctor wants here is the COUNT ("4,327 remaining"),
 * not the share. The arc carries the proportion; the text carries the fact.
 */
export function CreditRing({
    balance, granted, size = 104,
}: { balance: number; granted: number; size?: number }) {
    const pct = granted > 0 ? Math.min(Math.max(balance / granted, 0), 1) : 0;
    const stroke = 9;
    const r = (size - stroke) / 2;
    const c = 2 * Math.PI * r;

    // The same three-step ladder the rest of the page uses for credit health,
    // and the same thresholds as `messaging_credit_balances`'s CASE — so the
    // ring turns amber at exactly the moment the copy starts warning.
    const tone = balance <= 0
        ? "var(--cs-red)"
        : balance < 100 ? "var(--cs-amber)" : "var(--cs-violet)";

    return (
        <svg width={size} height={size} role="img" aria-label={`${balance} credits remaining of ${granted}`} className="flex-none">
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#eef0f5" strokeWidth={stroke} />
            <circle
                cx={size / 2} cy={size / 2} r={r} fill="none" stroke={tone} strokeWidth={stroke}
                strokeLinecap="round"
                strokeDasharray={`${pct * c} ${c}`}
                transform={`rotate(-90 ${size / 2} ${size / 2})`}
                // Animates on load and on every recharge, which is the one
                // moment this number changes in a way worth noticing.
                style={{ transition: "stroke-dasharray 600ms cubic-bezier(.22,1,.36,1)" }}
            />
            <text
                x="50%" y="50%" textAnchor="middle" dy="-0.1em"
                className="fill-[var(--cs-ink)] text-[19px] font-bold tabular-nums"
            >
                {new Intl.NumberFormat("en-IN").format(Math.max(0, balance))}
            </text>
            <text
                x="50%" y="50%" textAnchor="middle" dy="1.35em"
                className="fill-[var(--cs-faint)] text-[9px] font-semibold uppercase tracking-[0.08em]"
            >
                remaining
            </text>
        </svg>
    );
}

// ── Usage bars ─────────────────────────────────────────────────────────────

/** Container width in real pixels — same measuring approach as admin/charts,
 *  and for the same reason: `preserveAspectRatio="none"` distorts everything
 *  it stretches. 0 means "don't draw yet" rather than draw at a guess. */
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

export interface UsagePoint { date: string; credits: number }

/**
 * Credits spent per day.
 *
 * A zero day draws a 2px stub rather than nothing: a gap in the row reads as
 * missing data, and "we sent nothing on Sunday" is a fact, not a hole. The
 * busiest day is tinted so the shape has an anchor without a legend.
 */
export function UsageBars({
    points, height = 92, onHover,
}: {
    points: UsagePoint[];
    height?: number;
    onHover?: (point: UsagePoint | null) => void;
}) {
    const wrapRef = useRef<HTMLDivElement>(null);
    const width = useWidth(wrapRef);
    const [hover, setHover] = useState<number | null>(null);

    const max = Math.max(...points.map((p) => p.credits), 1);
    const gap = 4;
    const barW = points.length > 0 ? Math.max((width - gap * (points.length - 1)) / points.length, 2) : 0;
    const peak = points.reduce((a, b) => (b.credits > a.credits ? b : a), points[0]);

    return (
        <div ref={wrapRef} className="relative w-full" style={{ height }}>
            {width > 0 && (
                <svg width={width} height={height} role="img" aria-label={`Credits used per day: ${points.map((p) => p.credits).join(", ")}`}>
                    {points.map((p, i) => {
                        const h = Math.max((p.credits / max) * (height - 4), p.credits > 0 ? 4 : 2);
                        const isPeak = peak && p.credits > 0 && p.credits === peak.credits;
                        return (
                            <rect
                                key={p.date}
                                x={i * (barW + gap)}
                                y={height - h}
                                width={barW}
                                height={h}
                                rx={Math.min(3, barW / 2)}
                                fill={hover === i || isPeak ? "var(--cs-violet)" : "#ddd6fe"}
                                onMouseEnter={() => { setHover(i); onHover?.(p); }}
                                onMouseLeave={() => { setHover(null); onHover?.(null); }}
                            />
                        );
                    })}
                </svg>
            )}
        </div>
    );
}

/** "26 Aug" — the axis labels under the bars. Only the ends and the middle
 *  get one; fourteen dates in a 300px card is a smear. */
export function dayLabel(ymd: string): string {
    const [y, m, d] = ymd.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-IN", {
        day: "numeric", month: "short", timeZone: "UTC",
    });
}

// ── Section shell ──────────────────────────────────────────────────────────

/**
 * A card on this page.
 *
 * Not `clinic/ui.tsx`'s `Card`: that one owns its own header layout (glyph
 * tile, uppercase title, subtitle line) which is right for a settings-shaped
 * page and too heavy for a dashboard tile that is mostly one number. This is
 * the same border, radius, shadow and tokens with the header left to the
 * caller, so a tile can put a value where a title would go.
 */
export function Panel({
    className = "", children, onClick, label,
}: {
    className?: string;
    children: ReactNode;
    onClick?: () => void;
    label?: string;
}) {
    const base =
        "flex min-w-0 flex-col rounded-[var(--cs-radius)] border border-[var(--cs-line)] " +
        "bg-[var(--cs-card)] shadow-[var(--cs-shadow)] " + className;

    if (!onClick) return <section className={base} aria-label={label}>{children}</section>;

    return (
        <section
            role="button"
            tabIndex={0}
            aria-label={label}
            onClick={onClick}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } }}
            className={
                base +
                " cursor-pointer text-left outline-none transition-[box-shadow,border-color] duration-[160ms] " +
                "hover:border-[var(--cs-violet)] hover:shadow-[0_6px_20px_rgba(124,58,237,0.10),0_1px_2px_rgba(16,28,46,0.06)] " +
                "focus-visible:border-[var(--cs-violet)]"
            }
        >
            {children}
        </section>
    );
}

/**
 * One real sent WhatsApp template, in the conversation thread, in WhatsApp's
 * own bubble shape — header, body, button. Rewritten 2026-09-08: this used
 * to be a static mockup pinned in its own standalone card above the feed,
 * with placeholder names ("Patient Name", "Doctor Name") — Anmol: *"it was
 * way better before... the chat preview... should be the exact replica of
 * what message has been sent."* It now renders IN the thread, in place of
 * the plain-text bubble, with the real values that message actually carried
 * and a live button rather than a disabled one.
 */
export function WhatsAppTemplatePreview({
    header, body, button, onButtonClick,
}: {
    /** The template's HEADER line — bold, top of the bubble. */
    header: string;
    /** The template's BODY — the bulk of the message, with real values
     *  already substituted by the caller (patient/doctor/clinic name). */
    body: ReactNode;
    /** The template's button label, rendered as WhatsApp itself draws a
     *  template button: a full-width row below a divider, not part of the
     *  bubble's own rounded shape. */
    button: string;
    /** What the button actually does — omit to render it inert (no
     *  document to open yet, or none on file). */
    onButtonClick?: () => void;
}) {
    return (
        <div className="overflow-hidden rounded-[12px] border border-[#d9fdd3] bg-[#d9fdd3] shadow-[0_1px_1px_rgba(16,28,46,0.06)]">
            <div className="flex flex-col gap-[4px] px-[11px] pb-[8px] pt-[9px] text-[12px] leading-[1.45] text-[#111b21]">
                <span className="font-bold">{header}</span>
                <span>{body}</span>
            </div>
            <button
                type="button"
                disabled={!onButtonClick}
                onClick={onButtonClick}
                className="flex w-full cursor-pointer items-center justify-center gap-[6px] border-t border-[rgba(0,0,0,0.08)] bg-[#d9fdd3] py-[7px] text-[12px] font-semibold text-[#00a5f4] outline-none transition-colors hover:bg-[#cdf4c4] disabled:cursor-default disabled:opacity-60 disabled:hover:bg-[#d9fdd3]"
            >
                <Send size={12} /> {button}
            </button>
        </div>
    );
}

/** The small uppercase label above a tile's value. */
export function PanelHead({
    icon, title, right,
}: { icon?: ReactNode; title: string; right?: ReactNode }) {
    return (
        <div className="flex flex-none items-center gap-[8px] px-[16px] pt-[14px]">
            {icon && (
                <span className="grid h-[26px] w-[26px] flex-none place-items-center rounded-[7px] bg-[var(--cs-violet-soft)] text-[var(--cs-violet)]">
                    {icon}
                </span>
            )}
            <span className="text-[13.5px] font-bold text-[var(--cs-ink)]">{title}</span>
            {right && <span className="ml-auto flex flex-none items-center gap-[6px]">{right}</span>}
        </div>
    );
}
