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

import { useMemo, useState } from "react";
import { ArrowDown, ArrowRight, ArrowUp, CalendarClock, ChevronDown, Pencil, Plus } from "lucide-react";
import type { RealVisit, CarePlan } from "../../lib/db";
import { formatVisitDate } from "../../components/PastVisitCard";
import { doctorName } from "../../lib/format";
import { formatDelta, formatValue, type TrendSeries, type TrendSummary, type TrendVerdict } from "./trend";

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
 * Clickable since 2026-08-17 — Anmol: "it should open when you click on that
 * box." The spec's own line is what shapes WHAT opens: "click to expand into
 * the existing per-visit detail view we already have. Do not build a second
 * detail view." So a click opens `PastVisitCard` (via `onOpen`) for the visit
 * that produced the card's newest REAL reading — not today's in-progress one,
 * which has no saved visit to open yet — same component `LastVisitCard` and
 * the timeline already open. `visitForLastReading` picks it; `onOpen` is
 * omitted (and the card renders as a plain div) when no saved visit carries
 * this reading, which only happens if every point is today's.
 */
function TrendCard({
    series, visit, onOpen,
}: {
    series: TrendSeries;
    /** the visit that produced the newest SAVED point in this series, if any */
    visit: RealVisit | null;
    onOpen: (visit: RealVisit, x: number) => void;
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
            <p className="cs-lt-card-label">
                {series.label}
                {series.unit && <span className="cs-lt-card-unit"> {series.unit}</span>}
            </p>

            <p className="cs-lt-card-values">
                <span className="cs-lt-from">{formatValue(series.first)}</span>
                <ArrowRight size={13} className="cs-lt-to-arrow" aria-hidden="true" />
                <span className="cs-lt-now">{formatValue(series.last)}</span>
            </p>

            <p className="cs-lt-card-delta">
                <VerdictArrow verdict={series.verdict} rising={rising} />
                <span>{formatDelta(series.delta)}</span>
                <span className="cs-lt-verdict">{label[series.verdict]}</span>
            </p>

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
            <p className="cs-lt-card-foot">
                {series.sessions} readings · {formatSpan(series.spanDays)}
            </p>
        </>
    );

    if (!visit) {
        return <div className={`cs-lt-card is-${series.verdict}`}>{body}</div>;
    }

    return (
        <button
            type="button"
            className={`cs-lt-card is-${series.verdict} cs-lt-card-open`}
            onClick={(e) => {
                const r = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                onOpen(visit, r.left + r.width / 2);
            }}
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
                <p className="cs-lt-card-label">Care plan</p>
                <button type="button" className="cs-lt-plan-edit" onClick={onEdit} title="Edit or close this plan">
                    <Pencil size={11} aria-hidden="true" />
                    <span>Edit</span>
                </button>
            </div>

            <p className="cs-lt-plan-goal">{plan.goal}</p>
            {plan.diagnosis && <p className="cs-lt-plan-dx">{plan.diagnosis}</p>}

            {target ? (
                <>
                    <p className="cs-lt-plan-pos">
                        Session <strong>{sessionNumber}</strong> of {target}
                    </p>
                    <div className="cs-lt-plan-bar" role="presentation">
                        <span style={{ width: `${pct}%` }} />
                    </div>
                </>
            ) : (
                <p className="cs-lt-plan-pos">
                    Session <strong>{sessionNumber}</strong>
                    <span className="cs-lt-plan-open"> · open-ended</span>
                </p>
            )}

            {plan.target_date && (
                <p className="cs-lt-card-foot">
                    Target {formatVisitDate(plan.target_date)}
                </p>
            )}
        </div>
    );
}

/**
 * The last visit, in the plainest possible terms.
 *
 * ⚠ WHAT THIS DELIBERATELY DOES NOT SHOW. Anmol's mockup has this card
 * carrying "Exercise progressed: Yes", "Focus: Strength + ROM" and "Next step:
 * Increase load". None of those is recorded anywhere in the product today —
 * an exercise is prescribed per visit and nothing stores whether it was
 * progressed, held or added relative to last time. Inventing a placeholder for
 * them is exactly what the doctrine forbids, so this card shows what genuinely
 * exists (when, what was prescribed, what was recorded) and gets the rest when
 * the physiotherapy screen lands.
 */
function LastVisitCard({ visit, onOpen }: { visit: RealVisit; onOpen: (x: number) => void }) {
    const meds = visit.medicines.length;
    return (
        <div className="cs-lt-card is-last">
            <p className="cs-lt-card-label">
                Last visit
                <span className="cs-lt-card-unit"> {formatVisitDate(visit.created_at)}</span>
            </p>

            <dl className="cs-lt-last-list">
                {visit.symptoms.length > 0 && (
                    <div>
                        <dt>Recorded</dt>
                        <dd>{visit.symptoms.slice(0, 2).join(", ")}{visit.symptoms.length > 2 ? ` +${visit.symptoms.length - 2}` : ""}</dd>
                    </div>
                )}
                <div>
                    <dt>Prescribed</dt>
                    <dd>{meds === 0 ? "Nothing" : meds === 1 ? visit.medicines[0].name : `${meds} medicines`}</dd>
                </div>
                {visit.doctor_name && (
                    <div>
                        <dt>Seen by</dt>
                        <dd>{doctorName(visit.doctor_name)}</dd>
                    </div>
                )}
            </dl>

            <button
                type="button"
                className="cs-lt-last-open"
                onClick={(e) => {
                    const r = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                    onOpen(r.left + r.width / 2);
                }}
            >
                Open that visit
            </button>
        </div>
    );
}

export function LongitudinalBand({
    summary, pastVisits, carePlan, sessionNumbers,
    onOpenVisit, onEditCarePlan, onStartCarePlan,
}: {
    summary: TrendSummary;
    /** newest first, as `fetchPatientVisits` returns them */
    pastVisits: RealVisit[];
    carePlan: CarePlan | null;
    /** visit id → session number within the active care plan */
    sessionNumbers: Map<string, number>;
    onOpenVisit: (visit: RealVisit, x: number) => void;
    onEditCarePlan: () => void;
    onStartCarePlan: () => void;
}) {
    const [timelineOpen, setTimelineOpen] = useState(false);
    // Open by default — the spec's "before typing anything" promise means the
    // doctor must see this on first paint — but collapsible, so it costs
    // nothing once read. See the file header for why this exists.
    const [collapsed, setCollapsed] = useState(false);

    // The whole component, gone, for a patient with no history. See the header.
    if (pastVisits.length === 0) return null;

    const lastVisit = pastVisits[0];
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

    return (
        <section className={`cs-lt${collapsed ? " is-collapsed" : ""}`} aria-label="Longitudinal summary">
            <header className="cs-lt-head">
                {/* The whole collapse control. A button wrapping the title
                    rather than a separate icon: the title IS what you click,
                    same convention as `.cs-lt-expand` below it. */}
                <button
                    type="button"
                    className="cs-lt-collapse"
                    onClick={() => setCollapsed((v) => !v)}
                    aria-expanded={!collapsed}
                    title={collapsed ? "Show the longitudinal summary" : "Hide the longitudinal summary"}
                >
                    <ChevronDown size={13} className={collapsed ? "" : "is-open"} aria-hidden="true" />
                    <h2 className="cs-lt-title">Longitudinal summary</h2>
                </button>

                <span className="cs-lt-sub">
                    {summary.visitCount} previous visit{summary.visitCount === 1 ? "" : "s"}
                </span>

                {/* The spec's "long absence" case, said out loud rather than
                    left for the doctor to work out from the dates. Old numbers
                    presented beside today's read as recent unless something
                    says otherwise. */}
                {summary.isLongAbsence && gapText && (
                    <span className="cs-lt-gap">
                        <CalendarClock size={12} aria-hidden="true" />
                        {gapText}
                    </span>
                )}

                <div className="cs-lt-head-spacer" />

                {!carePlan && (
                    <button type="button" className="cs-lt-plan-start" onClick={onStartCarePlan}>
                        <Plus size={12} aria-hidden="true" />
                        Care plan
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
                        {summary.series.map((s) => (
                            <TrendCard
                                key={s.key}
                                series={s}
                                visit={visitForLastReading(s, pastVisits)}
                                onOpen={onOpenVisit}
                            />
                        ))}

                        {carePlan && (
                            <CarePlanCard plan={carePlan} sessionNumber={currentSession} onEdit={onEditCarePlan} />
                        )}

                        <LastVisitCard visit={lastVisit} onOpen={(x) => onOpenVisit(lastVisit, x)} />

                        {/* A returning patient with nothing trendable yet. Says so
                            rather than leaving a row of cards that does not explain
                            its own emptiness — and says the useful half of why, which
                            is that one reading is not a trend. */}
                        {summary.series.length === 0 && (
                            <p className="cs-lt-none">
                                No measurement has been recorded twice yet — a trend needs two visits with
                                the same reading.
                            </p>
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
                        {timelineOpen ? "Hide" : "View full"} visit timeline
                        <ChevronDown size={13} className={timelineOpen ? "is-open" : ""} aria-hidden="true" />
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
                                            <span className="cs-lt-tl-date">{formatVisitDate(v.created_at)}</span>
                                            {n !== undefined && <span className="cs-lt-tl-session">Session {n}</span>}
                                            <span className="cs-lt-tl-what">
                                                {v.medicines.length > 0
                                                    ? v.medicines.map((m) => m.name).slice(0, 2).join(", ")
                                                    : v.symptoms.slice(0, 2).join(", ") || "No detail recorded"}
                                            </span>
                                            {v.doctor_name && <span className="cs-lt-tl-doc">{doctorName(v.doctor_name)}</span>}
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
