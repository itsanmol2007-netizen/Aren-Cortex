// ---------------------------------------------------------------------------
// THE LONGITUDINAL BAND — "is this working?", answered before anyone types.
//
// `cortex-longitudinal-spec.md` §3.1, the highest-priority piece of this
// phase. The existing past-visit strip answers HOW MANY TIMES a patient has
// been here. For a returning patient in a specialty that runs courses rather
// than episodes, that is not the question — the question is whether the
// treatment is working, and the answer is a direction and a delta.
//
// ── One component, configured. Never one per specialty.
//
// The spec closes with this and it is the rule that governs the file:
//
//     "Build the trend header ONCE, as a generic component driven by the
//      specialty configuration. Do not build a General OPD version and then a
//      physiotherapy version."
//
// So there is nothing specialty-shaped in here. Which measurements to trend,
// in what priority, and which direction counts as improvement all arrive as
// `TrendSummary` — computed by `trend.ts` from `SpecialtyProfile.trend`. A new
// specialty adds a list to that file and this component renders it. If you
// find yourself about to write `if (profile === ...)` here, the answer is a
// new field in the configuration instead.
//
// ── Where it sits, and why not in the dark header
//
// The first sketch put a one-line trend inside the topbar. Anmol's mockup put
// it in a band directly below, and that is right for two reasons that only
// show up once you try it: the topbar is already carrying brand, patient,
// visit chips and four buttons, and four numbers with sparklines are not a
// strip. The band is still what the spec calls the "collapsed summary" — it is
// readable at a glance without interaction, and "View full visit timeline"
// is the expand.
//
// ── It scrolls with the work now, and it can collapse to one line (2026-08-17)
//
// Originally pinned above `.cs-page`, permanently out of the locked shell's
// height budget — the doctrine's own §14.23 Open note already named the cost:
// "~200px out of a locked-height shell... real pressure on the Assessment on
// a short laptop." Anmol hit exactly that on a 14" screen and asked for both
// fixes at once: let it scroll past like everything else in `.cs-work`
// (App.tsx now mounts it as `.cs-work`'s first child, not above `.cs-page`),
// and let the doctor collapse the row of cards down to the title line, open
// by default so the "before typing anything" promise in the spec still
// holds on first paint. `collapsed` below is that second half; it never
// hides the header itself (title, visit count, long-absence flag, the "Care
// plan" starter), only the cards row and the timeline expand beneath it.
//
// ── It does not exist for a new patient
//
// Not empty, not a placeholder frame — absent. `pastVisits.length === 0`
// renders null, so the consult screen for a first visit is exactly what it was
// before this file existed. That is both the spec's §6 first case and the
// doctrine's standing test ("does an empty consultation get shorter?").
// ---------------------------------------------------------------------------

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
    Activity,
    ArrowDown,
    Bandage,
    ArrowRight,
    ArrowUp,
    ArrowUpRight,
    Calendar,
    CalendarClock,
    Check,
    CornerDownRight,
    Dumbbell,
    FlaskConical,
    ChevronDown,
    Clock,
    History,
    Pencil,
    Pill,
    Plus,
    Stethoscope,
    Target,
    TrendingUp,
    User,
    Wrench,
} from "lucide-react";
import type { RealVisit, CarePlan } from "../../lib/db";
import { formatVisitDate } from "../../components/PastVisitCard";
import { formatDelta, formatValue, type TrendSeries, type TrendSummary, type TrendVerdict } from "./trend";
import {
    conditionOptions, ongoingFrom, EMPTY_LOCAL, type OngoingAction, type OngoingItem, type OngoingLocal,
} from "./ongoing";
import { STATUS_LABEL } from "../../lib/db/clinicalState";
import { dashText } from "../../lib/clinicalText";
import { agoText, visitGist } from "./visitGist";

const ONGOING_ICON = { "in-place": Bandage, due: CalendarClock, awaiting: FlaskConical, condition: Stethoscope } as const;

/**
 * A short list opened from one small button — the Ongoing Care card's
 * actions. Portalled and fixed: the band folds with `overflow: hidden`, which
 * would crop anything drawn inside it.
 */
function OngoingMenu({ anchor, title, options, onPick, onClose }: {
    anchor: HTMLElement;
    title: string;
    options: { key: string; label: string; on?: boolean; danger?: boolean }[];
    onPick: (key: string) => void;
    onClose: () => void;
}) {
    const ref = useRef<HTMLDivElement>(null);
    const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
    const [active, setActive] = useState(0);

    useLayoutEffect(() => {
        const r = anchor.getBoundingClientRect();
        const w = 220;
        const h = ref.current?.offsetHeight ?? 200;
        const below = r.bottom + 6;
        setPos({
            top: below + h > window.innerHeight - 8 ? Math.max(8, r.top - 6 - h) : below,
            left: Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8)),
        });
    }, [anchor]);

    useEffect(() => {
        ref.current?.focus();
        const away = (e: MouseEvent) => {
            const t = e.target as Node;
            if (ref.current?.contains(t) || anchor.contains(t)) return;
            onClose();
        };
        document.addEventListener("mousedown", away);
        return () => document.removeEventListener("mousedown", away);
    }, [anchor, onClose]);

    return createPortal(
        <div
            ref={ref}
            className="cs-lt-menu"
            role="menu"
            tabIndex={-1}
            aria-label={title}
            style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}
            onKeyDown={(e) => {
                if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); }
                else if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(i + 1, options.length - 1)); }
                else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
                else if (e.key === "Enter") { e.preventDefault(); onPick(options[active].key); }
            }}
        >
            <p className="cs-lt-menu-head">{title}</p>
            {options.map((o, i) => (
                <button
                    key={o.key}
                    type="button"
                    role="menuitemradio"
                    aria-checked={!!o.on}
                    className={`cs-lt-menu-item${i === active ? " is-active" : ""}${o.on ? " is-on" : ""}${o.danger ? " is-danger" : ""}`}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => onPick(o.key)}
                >
                    <span className="cs-lt-menu-check" aria-hidden="true">{o.on && <Check size={12} strokeWidth={2.6} />}</span>
                    {o.label}
                </button>
            ))}
        </div>,
        document.body,
    );
}

/**
 * "What did it show?" — the result of an investigation ordered at an earlier
 * visit, recorded on that order from this one. A short line, the way a report
 * is summarised on a chart ("displaced distal radius fracture, dorsal
 * angulation, ulnar styloid fracture"); the image itself goes through
 * Attachments as before.
 */
function ResultPrompt({ anchor, name, onSave, onClose }: {
    anchor: HTMLElement;
    name: string;
    onSave: (text: string) => void;
    onClose: () => void;
}) {
    const ref = useRef<HTMLDivElement>(null);
    const areaRef = useRef<HTMLTextAreaElement>(null);
    const [text, setText] = useState("");
    const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
    const W = 320;

    useLayoutEffect(() => {
        const r = anchor.getBoundingClientRect();
        const h = ref.current?.offsetHeight ?? 180;
        const below = r.bottom + 6;
        setPos({
            top: below + h > window.innerHeight - 8 ? Math.max(8, r.top - 6 - h) : below,
            left: Math.max(8, Math.min(r.right - W, window.innerWidth - W - 8)),
        });
    }, [anchor]);

    useEffect(() => {
        areaRef.current?.focus();
        const away = (e: MouseEvent) => {
            const t = e.target as Node;
            if (ref.current?.contains(t) || anchor.contains(t)) return;
            onClose();
        };
        document.addEventListener("mousedown", away);
        return () => document.removeEventListener("mousedown", away);
    }, [anchor, onClose]);

    const save = () => { const t = text.trim(); if (t) onSave(t); };

    return createPortal(
        <div
            ref={ref}
            className="cs-lt-result"
            role="dialog"
            aria-label={`Result of ${name}`}
            style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, width: W }}
            onKeyDown={(e) => {
                if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); }
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); save(); }
            }}
        >
            <p className="cs-lt-menu-head">Result · {name}</p>
            <textarea
                ref={areaRef}
                className="cs-lt-result-input"
                rows={3}
                value={text}
                placeholder="What did it show? e.g. displaced distal radius fracture, dorsal angulation"
                onChange={(e) => setText(e.target.value)}
            />
            <div className="cs-lt-result-foot">
                <button type="button" className="cs-lt-result-cancel" onClick={onClose}>Cancel</button>
                <button type="button" className="cs-lt-result-save" disabled={!text.trim()} onClick={save}>Save result</button>
            </div>
        </div>,
        document.body,
    );
}

/**
 * ONGOING CARE — what is still true from earlier visits: the cast still on,
 * the X-ray whose result is awaited, the removal that is due, the fracture it
 * is all for. It is the "now" of the band, so it LOOKS like now: a tinted
 * surface, a live accent edge and an "Active now" eyebrow, where the Last
 * Visit card beside it is a plain white record of the past. The two must
 * never be mistaken for each other at a glance. See `ongoing.ts`.
 *
 * Each item carries the one control its lifecycle needs, never a row of
 * option chips: a cast has "Remove"; a result awaited has "Add result"; a
 * condition has "Status"; a planned item has "Plan".
 */
function OngoingCard({ items, onOpen, onAction }: {
    items: OngoingItem[];
    onOpen: (item: OngoingItem, x: number) => void;
    onAction?: (item: OngoingItem, action: OngoingAction) => void;
}) {
    const [menu, setMenu] = useState<{ item: OngoingItem; anchor: HTMLElement } | null>(null);
    const [resultFor, setResultFor] = useState<{ item: OngoingItem; anchor: HTMLElement } | null>(null);

    const menuFor = (it: OngoingItem) => {
        if (it.kind === "condition") {
            return {
                title: `${it.title}${it.site ? ` · ${it.site}` : ""}`,
                options: conditionOptions(it.family).map((st) => ({
                    key: st, label: STATUS_LABEL[st], on: it.state === st,
                })),
            };
        }
        const changed = it.today && !it.status.startsWith("In today");
        return {
            title: `${it.title}${it.site ? ` · ${it.site}` : ""}`,
            options: [
                { key: "do", label: "Do it today" },
                { key: "defer7", label: "Defer 1 week" },
                { key: "defer14", label: "Defer 2 weeks" },
                ...(changed ? [{ key: "restore", label: "Undo change" }] : [{ key: "cancel", label: "Cancel this plan", danger: true }]),
            ],
        };
    };

    const pick = (it: OngoingItem, key: string) => {
        setMenu(null);
        if (!onAction) return;
        if (it.kind === "condition") { onAction(it, { type: "status", status: key as never }); return; }
        if (key === "do") onAction(it, { type: "do" });
        else if (key === "defer7") onAction(it, { type: "defer", days: 7 });
        else if (key === "defer14") onAction(it, { type: "defer", days: 14 });
        else if (key === "cancel") onAction(it, { type: "cancel" });
        else if (key === "restore") onAction(it, { type: "restore" });
    };

    const action = (it: OngoingItem) => {
        if (!onAction) return null;
        if (it.kind === "in-place") {
            return it.today ? null : (
                <button
                    type="button"
                    className="cs-lt-og-act"
                    onClick={() => onAction(it, { type: "remove" })}
                    title={`Add the removal of this ${it.title.toLowerCase()} to today's plan`}
                >
                    Remove
                </button>
            );
        }
        if (it.kind === "awaiting") {
            return it.today ? null : (
                <button
                    type="button"
                    className="cs-lt-og-act is-primary"
                    aria-haspopup="dialog"
                    aria-expanded={resultFor?.item.key === it.key}
                    onClick={(e) => {
                        const el = e.currentTarget;
                        setResultFor((m) => (m?.item.key === it.key ? null : { item: it, anchor: el }));
                    }}
                >
                    Add result
                </button>
            );
        }
        return (
            <button
                type="button"
                className="cs-lt-og-act has-menu"
                aria-haspopup="menu"
                aria-expanded={menu?.item.key === it.key}
                onClick={(e) => {
                    const el = e.currentTarget;
                    setMenu((m) => (m?.item.key === it.key ? null : { item: it, anchor: el }));
                }}
            >
                {it.kind === "condition" ? "Status" : "Plan"}
                <ChevronDown size={11} aria-hidden="true" />
            </button>
        );
    };

    return (
        <div className="cs-lt-card is-ongoing">
            <div className="cs-lt-og-head">
                <span className="cs-lt-og-eyebrow">
                    <span className="cs-lt-og-live" aria-hidden="true" />
                    Active now
                </span>
                <span className="cs-lt-og-heading">Ongoing care</span>
                <span className="cs-lt-og-count">{items.length}</span>
            </div>
            <ul className="cs-lt-og-list">
                {items.slice(0, 4).map((it) => {
                    const Icon = ONGOING_ICON[it.kind];
                    return (
                        <li key={it.key} className={`cs-lt-og-row${it.today ? " is-today" : ""}`}>
                            <button
                                type="button"
                                className={`cs-lt-og-item is-${it.kind}${it.urgent ? " is-urgent" : ""}`}
                                title={`${it.text} (open the visit)`}
                                onClick={(e) => {
                                    const r = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                                    onOpen(it, r.left + r.width / 2);
                                }}
                            >
                                <span className="cs-lt-og-mark"><Icon size={12} aria-hidden="true" /></span>
                                <span className="cs-lt-og-text">
                                    <span className="cs-lt-og-title">
                                        {it.title}
                                        {it.site && <span className="cs-lt-og-site"> · {it.site}</span>}
                                    </span>
                                    <span className="cs-lt-og-status">{it.status}</span>
                                </span>
                            </button>
                            {action(it)}
                        </li>
                    );
                })}
            </ul>
            {items.length > 4 && <p className="cs-lt-og-more">+{items.length - 4} more in the visit timeline</p>}
            {menu && (() => {
                const m = menuFor(menu.item);
                return (
                    <OngoingMenu
                        anchor={menu.anchor}
                        title={m.title}
                        options={m.options}
                        onPick={(k) => pick(menu.item, k)}
                        onClose={() => setMenu(null)}
                    />
                );
            })()}
            {resultFor && onAction && (
                <ResultPrompt
                    anchor={resultFor.anchor}
                    name={resultFor.item.title}
                    onClose={() => setResultFor(null)}
                    onSave={(text) => { onAction(resultFor.item, { type: "result", text }); setResultFor(null); }}
                />
            )}
        </div>
    );
}

/**
 * The sparkline.
 *
 * The x axis is TIME, not the index of the reading, and that is the only
 * interesting decision in it. Index spacing would draw four readings taken
 * across a year identically to four taken across a fortnight, and it would
 * quietly hide the very gaps the spec says to show honestly. With a real time
 * axis a sparse series looks sparse — a long flat run between two points IS
 * the eight weeks the patient did not come in.
 *
 * Nothing is interpolated: the line joins real readings and there is a dot on
 * each one, so what is a measurement and what is just the line between two of
 * them stays distinguishable.
 */
// Exported for the Patient Detail page (`features/patients/PatientRecord.tsx`),
// which reuses this SAME sparkline math/SVG rather than forking it for a
// second visual context — only the surrounding CSS differs (see
// `patients-detail.css`'s `.prec-trend-card .cs-lt-spark` rules, which
// restyle this same `<svg class="cs-lt-spark">` under a different ancestor
// class instead of duplicating `Sparkline` itself).
export function Sparkline({ series }: { series: TrendSeries }) {
    const W = 104;
    const H = 26;
    const PAD = 3;

    const { path, dots } = useMemo(() => {
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
            // A zero time span can only happen if every reading collapsed onto
            // one instant, which `collapseSameDay` prevents — but falling back
            // to even spacing costs one line and beats dividing by zero.
            const x = span > 0
                ? PAD + ((times[i] - t0) / span) * (W - PAD * 2)
                : PAD + (i / Math.max(1, pts.length - 1)) * (W - PAD * 2);
            // A flat series sits on the middle line rather than the floor.
            const y = range > 0
                ? H - PAD - ((p.value - lo) / range) * (H - PAD * 2)
                : H / 2;
            return { x, y };
        });

        return {
            path: xy.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" "),
            dots: xy,
        };
    }, [series]);

    return (
        <svg className="cs-lt-spark" viewBox={`0 0 ${W} ${H}`} width={W} height={H} aria-hidden="true">
            <path d={path} fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            {dots.map((d, i) => (
                <circle key={i} cx={d.x} cy={d.y} r={i === dots.length - 1 ? 2.4 : 1.6} />
            ))}
        </svg>
    );
}

/**
 * Which visit to open for a TrendCard's click — the newest point that was
 * actually SAVED, walking back from the end so today's in-progress reading
 * (`visitId: null`) never blocks a click from reaching the last real visit
 * behind it. `null` only when nothing in the series was ever saved, which the
 * caller reads as "not clickable".
 */
// Exported alongside Sparkline — see that export's note. Same reasoning:
// the Patient Detail page's trend cards need to open the same visit a click
// here would, and re-deriving "walk back to the newest SAVED point" would be
// a second copy of a rule that is easy to get subtly wrong (skipping today's
// unsaved reading correctly).
export function visitForLastReading(series: TrendSeries, pastVisits: RealVisit[]): RealVisit | null {
    for (let i = series.points.length - 1; i >= 0; i--) {
        const id = series.points[i].visitId;
        if (id) return pastVisits.find((v) => v.id === id) ?? null;
    }
    return null;
}

/** How long a series covers, in the unit a doctor would say it in. */
export function formatSpan(days: number): string {
    if (days < 1) return "today";
    if (days < 14) return `${days} days`;
    if (days < 70) return `${Math.round(days / 7)} weeks`;
    if (days < 730) return `${Math.round(days / 30)} months`;
    return `${Math.round((days / 365) * 10) / 10} years`;
}

function VerdictArrow({ verdict, rising }: { verdict: TrendVerdict; rising: boolean }) {
    if (verdict === "steady") return <ArrowRight size={13} aria-hidden="true" />;
    return rising ? <ArrowUp size={13} aria-hidden="true" /> : <ArrowDown size={13} aria-hidden="true" />;
}

/**
 * One measurement's card: where it started, where it is now, and what that
 * means.
 *
 * The wording is deliberately a reading rather than a verdict — "Improving",
 * not "Good"; the numbers are always present so the doctor can disagree with
 * the word. Doctrine §5: ranking is a safety property, never a verdict, and
 * the standing principle at the top of the spec is blunter still — nothing the
 * software surfaces should read as an instruction.
 *
 * ── What a click opens changed on 2026-09-02
 *
 * Clickable since 2026-08-17, but that first cut opened `PastVisitCard`
 * (the dark per-visit view) directly, for the visit behind the card's
 * newest reading — reading its own click as "show me that visit". Anmol,
 * 2026-09-02: "clicking on any graph opens that dark theme past visit
 * modal, no it should not... same [as Patient Record] should be here too."
 * The Patient Record page had already answered the right question for a
 * graph click — not "what happened at one visit" but "how did this READING
 * move" — with `TrendDetailModal` (light, the real plotted line, every
 * point in the series, `PastVisitCard` reachable per-point from inside it).
 * A click here now opens that same modal via `onOpen`, keyed by series
 * rather than by visit; `PastVisitCard` is still exactly one click further
 * in, same component, same tone, just no longer the FIRST thing a graph
 * click reaches.
 *
 * `visit` stays the gate on whether the card is clickable at all —
 * `visitForLastReading` returns `null` when every point in the series is
 * today's still-unsaved reading, and a series with nothing saved behind it
 * yet has nothing for the modal to show either.
 */
function TrendCard({
    series, visit, onOpen,
}: {
    series: TrendSeries;
    /** the visit that produced the newest SAVED point in this series, if any
     *  — read only to decide whether this card is clickable at all */
    visit: RealVisit | null;
    onOpen: (series: TrendSeries) => void;
}) {
    const rising = series.delta > 0;
    const label: Record<TrendVerdict, string> = {
        improving: "Improving",
        worsening: "Worse",
        steady: "Steady",
        // A neutral series has a real change to report and no opinion about
        // whether it is good news. It says what moved and stops there.
        neutral: rising ? "Up" : series.delta < 0 ? "Down" : "Steady",
    };

    const body = (
        <>
            <div className="cs-lt-card-top">
                <span className="cs-lt-card-label">
                    {series.label}
                    {series.unit && <span className="cs-lt-card-unit"> ({series.unit})</span>}
                </span>
                <span className={`cs-lt-verdict-badge is-${series.verdict}`}>
                    <VerdictArrow verdict={series.verdict} rising={rising} />
                    <span>{label[series.verdict]}</span>
                </span>
            </div>

            <div className="cs-lt-card-metric-row">
                <div className="cs-lt-card-values">
                    <span className="cs-lt-from" title="Baseline reading">{formatValue(series.first)}</span>
                    <ArrowRight size={11} className="cs-lt-to-arrow" aria-hidden="true" />
                    <span className="cs-lt-now" title="Latest reading">{formatValue(series.last)}</span>
                </div>
                <span className="cs-lt-card-delta-badge">
                    {formatDelta(series.delta)}
                </span>
            </div>

            <Sparkline series={series} />

            {/* "readings", not "visits", and the two are genuinely different:
                the newest point is usually the number being typed right now,
                at a visit that has not been saved yet, and a card claiming
                "across 5 visits" beside a header saying "4 previous visits"
                is a contradiction the doctor has to resolve.

                The span is here for cardiology, whose spec note asks that the
                trend "span months, not just the last few visits" — four
                readings means something different across three weeks and
                across two years, and only one of those is on the card
                otherwise. */}
            <div className="cs-lt-card-foot">
                <Clock size={10} aria-hidden="true" />
                <span>{series.sessions} readings · {formatSpan(series.spanDays)}</span>
            </div>
        </>
    );

    if (!visit) {
        return <div className={`cs-lt-card is-trend is-${series.verdict}`}>{body}</div>;
    }

    return (
        <button
            type="button"
            className={`cs-lt-card is-trend is-${series.verdict} cs-lt-card-open`}
            onClick={() => onOpen(series)}
            title="Click to view detailed trajectory"
        >
            {body}
        </button>
    );
}

/**
 * The care plan slot — spec §3.3's "small persistent object attached to the
 * patient... visible in the header alongside the trend".
 *
 * Shows position in the course when there is a target to be a position within,
 * and just the goal when the plan is open-ended. Both the edit and the close
 * route through the caller: this component displays, it does not write.
 */
function CarePlanCard({
    plan, sessionNumber, onEdit,
}: {
    plan: CarePlan;
    /** which session of this course the CURRENT consult is */
    sessionNumber: number;
    onEdit: () => void;
}) {
    const target = plan.target_visit_count;
    const pct = target ? Math.min(100, Math.round((sessionNumber / target) * 100)) : 0;

    return (
        <div className="cs-lt-card is-plan">
            <div className="cs-lt-plan-head">
                <div className="cs-lt-plan-badge">
                    <Target size={12} className="cs-lt-plan-icon" aria-hidden="true" />
                    <span>Care Plan</span>
                </div>
                <button type="button" className="cs-lt-plan-edit" onClick={onEdit} title="Edit or close this plan">
                    <Pencil size={11} aria-hidden="true" />
                    <span>Edit</span>
                </button>
            </div>

            <p className="cs-lt-plan-goal">{plan.goal}</p>
            {plan.diagnosis && (
                <div className="cs-lt-plan-dx-wrap">
                    <span className="cs-lt-plan-dx">{plan.diagnosis}</span>
                </div>
            )}

            <div className="cs-lt-plan-progress-section">
                {target ? (
                    <>
                        <div className="cs-lt-plan-pos-row">
                            <span className="cs-lt-plan-pos">
                                Session <strong>{sessionNumber}</strong> of {target}
                            </span>
                            <span className="cs-lt-plan-pct">{pct}%</span>
                        </div>
                        <div className="cs-lt-plan-bar" role="presentation">
                            <span style={{ width: `${pct}%` }} />
                        </div>
                    </>
                ) : (
                    <p className="cs-lt-plan-pos">
                        Session <strong>{sessionNumber}</strong>
                        <span className="cs-lt-plan-open"> · Open-ended</span>
                    </p>
                )}
            </div>

            {plan.target_date && (
                <div className="cs-lt-card-foot cs-lt-plan-foot">
                    <Calendar size={10} aria-hidden="true" />
                    <span>Target {formatVisitDate(plan.target_date)}</span>
                </div>
            )}
        </div>
    );
}

const OUTCOME_ICON = {
    awaited: FlaskConical, result: FlaskConical, done: Wrench, planned: CalendarClock, rx: Pill, exercise: Dumbbell,
} as const;

/**
 * THE LAST VISIT — a record of the past, read at a glance (2026-09-26).
 *
 * Built from `visitGist`: a headline that says what the visit was ABOUT
 * ("Wrist / hand pain - Right wrist"), one line of context (1 day · pain 7/10
 * · fell on hand), what was found, and what came of it, with the state of
 * each outcome on its right: "X-ray Right wrist · Result awaited" is the line
 * a returning patient's visit turns on. A single complaint reads as a whole
 * statement; nothing is padded with "No medicines".
 *
 * Plain white, a history glyph and the date: the past, where Ongoing Care
 * beside it is the tinted "now".
 */
function LastVisitCard({ visit, onOpen }: { visit: RealVisit; onOpen: (x: number) => void }) {
    const g = visitGist(visit);
    return (
        <div className="cs-lt-card is-last">
            <div className="cs-lt-lv-head">
                <span className="cs-lt-lv-eyebrow">
                    <History size={11} aria-hidden="true" />
                    Last visit
                </span>
                <span className="cs-lt-lv-when">
                    {formatVisitDate(visit.created_at)} · {agoText(visit.created_at)}
                </span>
            </div>

            <p className="cs-lt-lv-headline" title={g.headline}>{g.headline}</p>
            {g.context.length > 0 && <p className="cs-lt-lv-context">{g.context.join(" · ")}</p>}
            {g.found.length > 0 && (
                <p className="cs-lt-lv-found">
                    <span>Found</span> {g.found.slice(0, 3).join(" · ")}{g.found.length > 3 ? ` +${g.found.length - 3}` : ""}
                </p>
            )}

            {g.outcomes.length > 0 && (
                <ul className="cs-lt-lv-outcomes">
                    {g.outcomes.slice(0, 4).map((o, i) => {
                        const Icon = OUTCOME_ICON[o.kind];
                        return (
                            <li key={i} className={`is-${o.kind}`} title={o.title ?? o.text}>
                                <Icon size={12} aria-hidden="true" />
                                <span className="cs-lt-lv-otext">{o.text}</span>
                                {o.status && <em>{o.status}</em>}
                            </li>
                        );
                    })}
                </ul>
            )}

            <div className="cs-lt-lv-foot">
                {visit.doctor_name && (
                    <span className="cs-lt-lv-doc">
                        <User size={11} aria-hidden="true" />
                        {visit.doctor_name}
                    </span>
                )}
                <button
                    type="button"
                    className="cs-lt-lv-open"
                    onClick={(e) => {
                        const r = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                        onOpen(r.left + r.width / 2);
                    }}
                >
                    Open visit
                    <ArrowUpRight size={12} aria-hidden="true" />
                </button>
            </div>
        </div>
    );
}

/**
 * Reserves this band's rough shape while `fetchPatientVisits` is still in
 * flight — message-3 follow-up, 2026-08-25: "the longitudinal record
 * surfaces on the top... it randomly pulls, shifts everything down" because
 * this component rendered NOTHING (see the header's "does not exist for a
 * new patient" rule) until the fetch resolved, so a patient WITH history got
 * a silent pop-in that shoved `.cs-page` down a couple of seconds into the
 * consult.
 *
 * Shaped to match the band's actual DEFAULT state now, not its expanded one.
 * This used to render the full open row of three card skeletons — correct
 * back when the band opened by default, wrong since `collapsed` started
 * defaulting to `true` (2026-08-25, same day, see that comment on
 * `LongitudinalBand`): a patient with history would flash the whole
 * three-card row open and then have it visibly SNAP SHUT the instant real
 * data arrived, which read as a bug of its own — Anmol, later: "I still see
 * a skeleton loading screen and then it automatically closes... remove this
 * automatic open." Header-only now, exactly what the loaded band shows
 * collapsed, so there is nothing left to snap shut.
 */
export function LongitudinalBand({
    summary, pastVisits, loading, carePlan, sessionNumbers,
    onOpenVisit, onOpenTrend, onEditCarePlan, onStartCarePlan, ongoingLocal = EMPTY_LOCAL, onOngoingAction,
    onContinue, continued = false,
}: {
    summary: TrendSummary;
    /** newest first, as `fetchPatientVisits` returns them */
    pastVisits: RealVisit[];
    /** `pastVisitsLoading` from `useConsultSession` — see `LongitudinalSkeleton` */
    loading?: boolean;
    carePlan: CarePlan | null;
    /** visit id → session number within the active care plan */
    sessionNumbers: Map<string, number>;
    /** Opens `PastVisitCard` directly — the Last Visit card and the visit
     *  timeline rows below still answer "what happened at one visit", so
     *  they stay wired to this. A trend mini-card's own click does NOT use
     *  this any more — see `onOpenTrend`. */
    onOpenVisit: (visit: RealVisit, x: number) => void;
    /** A trend mini-card's click — opens the series' own detail modal
     *  (`TrendDetailModal`, same one Patient Record uses), not a visit
     *  directly. See `TrendCard`'s 2026-09-02 comment for why. */
    onOpenTrend: (series: TrendSeries) => void;
    onEditCarePlan: () => void;
    onStartCarePlan: () => void;
    /** what this visit has already done about ongoing items — see ongoing.ts */
    ongoingLocal?: OngoingLocal;
    /** remove a cast, update a fracture's status, do / defer / cancel a plan */
    onOngoingAction?: (item: OngoingItem, action: OngoingAction) => void;
    /** follow-up: bring the last visit's complaints and findings (with their
     *  places) onto today's sheet, marked as carried */
    onContinue?: () => void;
    /** whether that has been done this visit — the button then says so */
    continued?: boolean;
}) {
    const [timelineOpen, setTimelineOpen] = useState(false);
    // Was open by default — the spec's "before typing anything" promise meant
    // the doctor had to see this on first paint. Anmol, 2026-08-25: keep it
    // off by default — the band still exists and is one click away, it just
    // no longer claims the top of the screen on every consult before the
    // doctor has asked for it.
    const [collapsed, setCollapsed] = useState(true);
    const ongoing = useMemo(() => ongoingFrom(pastVisits, ongoingLocal), [pastVisits, ongoingLocal]);

    // Nothing while unknown — a skeleton that then collapses to nothing for a
    // first-visit patient is a DOM resize with no payoff.
    if (loading) return null;

    // The whole component, gone, for a patient with no history. See the header.
    if (pastVisits.length === 0) return null;

    // A result recorded during this consult is part of the last visit's
    // story at once — its order no longer reads "Result awaited".
    const lastVisit: RealVisit = ongoingLocal.results.size && pastVisits[0].orders?.length
        ? {
            ...pastVisits[0],
            orders: pastVisits[0].orders.map((o) => {
                const r = ongoingLocal.results.get(o.id);
                return r ? { ...o, resultText: r, resultAt: new Date().toISOString() } : o;
            }),
        }
        : pastVisits[0];
    // The consult in progress is the next session of the course.
    const currentSession = sessionNumbers.size + 1;

    // Long absence is stated in the unit a doctor thinks in. "Back after 14
    // months" is a clinical fact; "428 days" is a number they have to divide.
    const gap = summary.daysSinceLastVisit;
    let gapText: string | null = null;
    if (gap !== null && gap >= 365) {
        const years = Math.round((gap / 365) * 10) / 10;
        // Only an exact 1 is singular. The first cut pluralised on the raw day
        // count and printed "First visit in 1.2 year".
        gapText = `First visit in ${years} ${years === 1 ? "year" : "years"}`;
    } else if (gap !== null && gap >= 60) {
        const months = Math.round(gap / 30);
        gapText = `First visit in ${months} ${months === 1 ? "month" : "months"}`;
    }

    // ── A follow-up, not a new visit ─────────────────────────────────────
    // Back within a month with something still open — a result awaited, a
    // cast on, a plan due, an assessment in progress: in a doctor's mind this
    // is the SAME story continuing, whatever the database calls it. The band
    // says so in its title and takes on its own accent, so the doctor knows
    // before reading a word that they are picking up a thread.
    const followUp = gap !== null && gap <= 30 && ongoing.length > 0;
    const thread = ongoing.find((o) => o.kind === "condition");
    const episode = thread ? `${thread.title}${thread.site ? ` - ${thread.site}` : ""}` : visitGist(lastVisit).headline;

    return (
        <section className={`cs-lt${collapsed ? " is-collapsed" : ""}${followUp ? " is-followup" : ""}`} aria-label="Longitudinal summary">
            <header className="cs-lt-head">
                {/* The whole collapse control. A button wrapping the title
                    rather than a separate icon: the title IS what you click,
                    same convention as `.cs-lt-expand` below it. */}
                <button
                    type="button"
                    className="cs-lt-collapse"
                    onClick={() => setCollapsed((v) => !v)}
                    aria-expanded={!collapsed}
                    title={collapsed ? "Show longitudinal summary" : "Hide longitudinal summary"}
                >
                    <span className="cs-lt-collapse-chevron-wrap">
                        <ChevronDown size={13} className={collapsed ? "" : "is-open"} aria-hidden="true" />
                    </span>
                    <span className="cs-lt-title-wrap">
                        {followUp
                            ? <CornerDownRight size={14} className="cs-lt-title-icon" aria-hidden="true" />
                            : <Activity size={14} className="cs-lt-title-icon" aria-hidden="true" />}
                        <h2 className="cs-lt-title">{followUp ? "Follow-up" : "Longitudinal Summary"}</h2>
                    </span>
                </button>

                {followUp && (
                    <span className="cs-lt-fu-episode" title={episode}>
                        <span className="cs-lt-fu-name">{episode}</span>
                        <span className="cs-lt-fu-from">from {formatVisitDate(lastVisit.created_at)} · {agoText(lastVisit.created_at)}</span>
                    </span>
                )}

                {!followUp && <span className="cs-lt-badge cs-lt-badge-visits">
                    <Clock size={11} aria-hidden="true" />
                    <span>{summary.visitCount} previous visit{summary.visitCount === 1 ? "" : "s"}</span>
                </span>}

                {/* The spec's "long absence" case, said out loud rather than
                    left for the doctor to work out from the dates. Old numbers
                    presented beside today's read as recent unless something
                    says otherwise. */}
                {summary.isLongAbsence && gapText && (
                    <span className="cs-lt-gap">
                        <CalendarClock size={12} aria-hidden="true" />
                        <span>{gapText}</span>
                    </span>
                )}

                {/* The one thing a returning patient most needs said before
                    anything is opened: what is still on them or due. The top
                    item, on the header line itself, so it shows collapsed;
                    it opens the band to the full Ongoing Care card. */}
                {ongoing.length > 0 && (() => {
                    const top = ongoing[0];
                    const Icon = ONGOING_ICON[top.kind];
                    return (
                        <button
                            type="button"
                            className={`cs-lt-ongoing is-${top.kind}${top.urgent ? " is-urgent" : ""}`}
                            onClick={() => setCollapsed(false)}
                            title={ongoing.map((o) => `${o.text}: ${o.status}`).join("\n")}
                        >
                            <Icon size={12} aria-hidden="true" />
                            <span className="cs-lt-ongoing-title">{top.title}{top.site ? ` · ${top.site}` : ""}</span>
                            <span className="cs-lt-ongoing-status">{top.status}</span>
                            {ongoing.length > 1 && <span className="cs-lt-ongoing-more">+{ongoing.length - 1}</span>}
                        </button>
                    );
                })()}

                <div className="cs-lt-head-spacer" />

                {followUp && onContinue && (
                    <button
                        type="button"
                        className={`cs-lt-fu-continue${continued ? " is-done" : ""}`}
                        onClick={onContinue}
                        disabled={continued}
                        title="Bring the last visit's complaints and findings, with their places, onto today's case sheet"
                    >
                        {continued ? <Check size={12} aria-hidden="true" /> : <CornerDownRight size={12} aria-hidden="true" />}
                        <span>{continued ? "Carried forward" : "Continue"}</span>
                    </button>
                )}

                {!carePlan && (
                    <button type="button" className="cs-lt-plan-start" onClick={onStartCarePlan}>
                        <Plus size={12} aria-hidden="true" />
                        <span>Care plan</span>
                    </button>
                )}
            </header>

            {/* Everything below the header is what collapses. The header
                itself — title, visit count, long-absence flag, the care-plan
                starter — stays put either way, so "collapsed" still answers
                "has this patient been here before, and is anything overdue?"
                at a glance.

                Wrapped in `.cs-lt-fold` (a 0fr/1fr grid, see consult.css) so
                the space is animated back to the consultation rather than
                vanishing in one frame. The contents stay MOUNTED while
                collapsed — `overflow: hidden` on the inner div is what hides
                them — because unmounting mid-transition collapses the row to
                nothing instantly and there is no animation left to see. */}
            <div className="cs-lt-fold" aria-hidden={collapsed}>
                <div>
                    <div className="cs-lt-row">
                        {ongoing.length > 0 && (
                            <OngoingCard
                                items={ongoing}
                                onAction={onOngoingAction}
                                onOpen={(it, x) => {
                                    const v = pastVisits.find((pv) => pv.id === it.visitId);
                                    if (v) onOpenVisit(v, x);
                                }}
                            />
                        )}

                        {summary.series.map((s) => (
                            <TrendCard
                                key={s.key}
                                series={s}
                                visit={visitForLastReading(s, pastVisits)}
                                onOpen={onOpenTrend}
                            />
                        ))}

                        {carePlan && (
                            <CarePlanCard plan={carePlan} sessionNumber={currentSession} onEdit={onEditCarePlan} />
                        )}

                        <LastVisitCard visit={lastVisit} onOpen={(x) => onOpenVisit(lastVisit, x)} />

                        {/* A returning patient with nothing trendable yet. Rendered as a
                            deliberate, clean clinical placeholder card rather than an
                            unformatted floating line of text. */}
                        {summary.series.length === 0 && ongoing.length === 0 && (
                            <div className="cs-lt-card is-empty-trend">
                                <div className="cs-lt-empty-trend-icon">
                                    <TrendingUp size={16} aria-hidden="true" />
                                </div>
                                <div className="cs-lt-empty-trend-content">
                                    <h4 className="cs-lt-empty-trend-title">Longitudinal Trends</h4>
                                    <p className="cs-lt-empty-trend-desc">
                                        Record vitals or clinical measurements across 2 visits to generate trend trajectories.
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>

                    <button
                        type="button"
                        className="cs-lt-expand"
                        onClick={() => setTimelineOpen((v) => !v)}
                        aria-expanded={timelineOpen}
                        // Not reachable by keyboard while the band is folded
                        // shut: it is still in the DOM (see above), and a tab
                        // stop inside a zero-height region is a focus trap
                        // the user cannot see.
                        tabIndex={collapsed ? -1 : undefined}
                    >
                        <History size={12} aria-hidden="true" />
                        <span>{timelineOpen ? "Hide" : "View full"} visit timeline</span>
                        <ChevronDown size={12} className={timelineOpen ? "is-open" : ""} aria-hidden="true" />
                    </button>

                    {/* The expand. Every visit, newest first, each one opening the
                        SAME `PastVisitCard` the header's chips open — the spec's "do
                        not build a second detail view" is why this is a list of rows
                        and not a second detail panel. */}
                    {timelineOpen && (
                        <ol className="cs-lt-timeline">
                            {pastVisits.map((v) => {
                                const n = sessionNumbers.get(v.id);
                                return (
                                    <li key={v.id}>
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                const r = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                                                onOpenVisit(v, r.left + r.width / 2);
                                            }}
                                        >
                                            <span className="cs-lt-tl-date">
                                                <Calendar size={11} aria-hidden="true" />
                                                <span>{formatVisitDate(v.created_at)}</span>
                                            </span>
                                            {n !== undefined && <span className="cs-lt-tl-session">Session {n}</span>}
                                            <span className="cs-lt-tl-what">
                                                {v.assessments?.length
                                                    ? [v.assessments[0].short, ...(v.procedures ?? []).filter((p) => p.status === "performed").slice(0, 1).map((p) => dashText(p.text).split(",")[0])].join(" · ")
                                                    : v.medicines.length > 0
                                                        ? v.medicines.map((m) => m.name).slice(0, 2).join(", ")
                                                        : v.symptoms.slice(0, 2).join(", ") || "No detail recorded"}
                                            </span>
                                            {v.doctor_name && (
                                                <span className="cs-lt-tl-doc">
                                                    <User size={10} aria-hidden="true" />
                                                    <span>{v.doctor_name}</span>
                                                </span>
                                            )}
                                            <ArrowUpRight size={11} className="cs-lt-tl-arrow" aria-hidden="true" />
                                        </button>
                                    </li>
                                );
                            })}
                        </ol>
                    )}
                </div>
            </div>
        </section>
    );
}
