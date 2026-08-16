// ---------------------------------------------------------------------------
// THE EXERCISE PLAN — the elevated slot for a physiotherapy facility.
//
// Built 2026-08-16, the last piece of the physiotherapy screen and the one
// Anmol deferred while the rest landed. It replaces the plain ranked list that
// `SuggestionsCard` was giving the `exercise` type, for one reason: an
// exercise prescription has a DOSE, and the dose is the clinical content.
// "Straight leg raise" is not a prescription; "Straight leg raise, 3 × 12,
// right" is.
//
// ── What makes this card different from every other ranked panel
//
// Everywhere else in this workspace, ranking offers and the plan rail records.
// Here the two are ONE LIST, deliberately. A physiotherapist progressing a
// programme is not choosing from suggestions — they are editing last week's
// programme, and the ranked suggestions are a source of new lines rather than
// the subject. So a line already on the plan sits at the top with its dose
// editable in place, and the ranked exercises follow underneath as things to
// add.
//
// ── The badge, and what it is not
//
// Each prescribed line carries Progressed / Same / Eased / Added against the
// same exercise last session. That word is a REMINDER, never an assessment:
// the numbers are always on the row beside it, last session's dose is printed
// under today's, and the physiotherapist can disagree at a glance. The
// longitudinal spec's standing principle governs this whole card — nothing the
// software surfaces reads as an instruction, and the doctor already knows what
// to do.
//
// Badges are suppressed entirely on a patient's first programme. "Added" on
// every row of a first plan is noise, and `comparePlans` reports
// `hasPrevious` precisely so this card can tell the difference between "this
// is new" and "there is nothing to compare with".
//
// ── Reachability
//
// Physiotherapy's `sections` list does not include `exercise` — it is the
// elevated type, so it has no row in Clinical Suggestions. That makes THIS
// card the only way to an exercise, and the search box is therefore not a
// convenience but the thing that keeps the doctrine's rule true: ranking
// decides what is OFFERED, never what is REACHABLE.
// ---------------------------------------------------------------------------

import { useMemo, useRef } from "react";
import { Activity, Check, Plus, X } from "lucide-react";
import { useRovingList } from "../../hooks/useRovingList";
import {
    IntentSearchField, IntentSearchResults, useIntentSearch,
} from "./IntentSearch";
import { RELEVANCE_TEXT, ThinkingRing, rankFillOf, relevanceOf } from "./parts";
import {
    comparePlans, formatDose, formatSide, identityOf,
    type ExerciseLine, type ExerciseSide, type Progression,
} from "./exercisePlan";
import type { AcceptPayload } from "./types";
import type { ActiveSignal, Ruleset } from "../../lib/synapse/engine";
import type { PersonalizedIntent } from "../../lib/synapse/personalize";

/** How many ranked suggestions are offered before "Show more". */
const RANKED_CAP = 5;

const BADGE_TEXT: Record<Progression, string> = {
    progressed: "Progressed",
    eased: "Eased",
    same: "Same",
    added: "Added",
    // Rendered as nothing — see `progressionOf`. One prescription carried
    // numbers and the other did not, so any word here would be invented.
    unknown: "",
};

function Badge({ verdict }: { verdict: Progression }) {
    const text = BADGE_TEXT[verdict];
    if (!text) return null;
    return <span className={`cs-ex-badge is-${verdict}`}>{text}</span>;
}

/**
 * One number on a row. Bare, borderless until focused — a row carrying four
 * boxed inputs reads as a form, and this is a list the doctor scans.
 */
function DoseBox({
    value, onChange, width = 30, label, suffix,
}: {
    value: number | null;
    onChange: (v: number | null) => void;
    width?: number;
    label: string;
    suffix?: string;
}) {
    return (
        <span className="cs-ex-dosebox">
            <input
                type="text"
                inputMode="numeric"
                aria-label={label}
                value={value ?? ""}
                style={{ width }}
                onChange={(e) => {
                    const raw = e.target.value.replace(/[^\d]/g, "");
                    onChange(raw === "" ? null : Number(raw));
                }}
            />
            {suffix && <i>{suffix}</i>}
        </span>
    );
}

function PrescribedRow({
    line, verdict, previous, showBadges, disabled,
    onUpdate, onRemove, onSide,
}: {
    line: ExerciseLine;
    verdict: Progression;
    /** the same exercise's dose last session, printed under today's */
    previous: ExerciseLine | undefined;
    showBadges: boolean;
    disabled: boolean;
    onUpdate: (patch: Partial<ExerciseLine>) => void;
    onRemove: () => void;
    onSide: (side: ExerciseSide) => void;
}) {
    const side = formatSide(line.side);
    // Reps and holds are alternatives, not additions. Whichever the line
    // already carries is the one it offers; a line with neither starts on
    // reps, which is what `doseFor` gives everything that is not an isometric.
    const isHold = line.holdSeconds != null && line.reps == null;

    return (
        <div className={`cs-ex-row is-on${line.side ? " has-side" : ""}${disabled ? " is-disabled" : ""}`}>
            <span className="cs-ex-tick" aria-hidden="true"><Check size={13} /></span>

            <div className="cs-ex-main">
                <div className="cs-ex-head">
                    <span className="cs-ex-label">{line.label}</span>
                    {side && <span className="cs-ex-side">{side}</span>}
                    {showBadges && <Badge verdict={verdict} />}
                </div>

                {/* ── The dose ──────────────────────────────────────────
                    At rest this reads as a sentence: "3 × 10 reps · was 3 ×
                    12". The numbers are live inputs that only look like
                    inputs once the caret is in them, and everything ELSE —
                    the reps/hold switch, the times-per-day box when it is
                    the usual once, and the side buttons when no side is set
                    — is held quiet until the row is hovered or focused.

                    Anmol, seeing the first version: "the exercise plan
                    section is looking cluttered." It was: twelve controls per
                    row over three lines, eight of which a physiotherapist
                    touches on a minority of rows. The controls did not go
                    away — a hidden control is worse than a busy one — they
                    stopped competing with the two numbers that matter.

                    `:focus-within` sits beside `:hover` in the CSS so the
                    keyboard reveals exactly what the mouse does, and the
                    space is reserved either way so nothing jumps. */}
                <div className="cs-ex-dose">
                    <DoseBox
                        value={line.sets}
                        onChange={(v) => onUpdate({ sets: v })}
                        label={`Sets of ${line.label}`}
                    />
                    <span className="cs-ex-x">×</span>
                    {isHold ? (
                        <DoseBox
                            value={line.holdSeconds}
                            onChange={(v) => onUpdate({ holdSeconds: v })}
                            width={34}
                            suffix="sec"
                            label={`Hold seconds for ${line.label}`}
                        />
                    ) : (
                        <DoseBox
                            value={line.reps}
                            onChange={(v) => onUpdate({ reps: v })}
                            width={34}
                            suffix="reps"
                            label={`Reps of ${line.label}`}
                        />
                    )}

                    {/* Last session, inline. It was its own line under the
                        row and cost a third of the card's height to say six
                        characters. */}
                    {previous && (
                        <span className="cs-ex-was">
                            · was {formatDose(previous) || "no dose recorded"}
                        </span>
                    )}

                    {/* Once a day is the overwhelming default and saying so
                        on every row is noise. Anything else is real
                        information and stays. */}
                    <span className={`cs-ex-perday${line.perDay != null && line.perDay !== 1 ? " is-set" : ""}`}>
                        <span className="cs-ex-sep" aria-hidden="true">·</span>
                        <DoseBox
                            value={line.perDay}
                            onChange={(v) => onUpdate({ perDay: v })}
                            suffix="× daily"
                            label={`Times per day for ${line.label}`}
                        />
                    </span>

                    <span className="cs-ex-quiet">
                        <button
                            type="button"
                            className="cs-ex-unit"
                            disabled={disabled}
                            title={isHold ? "Switch to repetitions" : "Switch to a timed hold"}
                            onClick={() =>
                                isHold
                                    ? onUpdate({ holdSeconds: null, reps: 10 })
                                    : onUpdate({ reps: null, holdSeconds: 10 })
                            }
                        >
                            {isHold ? "→ reps" : "→ hold"}
                        </button>

                        {/* Side is a separate prescription, not a note — see
                            `identityOf`. Both sides of one exercise are two
                            lines that progress independently. */}
                        <span className="cs-ex-sides">
                            {(["left", "right", "both"] as ExerciseSide[]).map((s) => (
                                <button
                                    key={s}
                                    type="button"
                                    className={line.side === s ? "is-on" : ""}
                                    disabled={disabled}
                                    title={line.side === s ? "" : `Prescribe for the ${s} side`}
                                    onClick={() => (line.side === s ? onUpdate({ side: null }) : onSide(s))}
                                >
                                    {s === "both" ? "B" : s === "left" ? "L" : "R"}
                                </button>
                            ))}
                        </span>
                    </span>
                </div>
            </div>

            <button
                type="button"
                className="cs-ex-remove"
                aria-label={`Remove ${line.label}`}
                disabled={disabled}
                onClick={onRemove}
            >
                <X size={14} />
            </button>
        </div>
    );
}

export function ExercisePlanCard({
    title, intents, topScore, thinkingKey, plan, previousPlan, previousAt,
    ruleset, activeSignals, hasChart, disabled = false,
    onAccept, onUpdate, onRemove, onDuplicateForSide,
    searchRef, className = "",
}: {
    /** the facility's own word for this slot — "Exercise Plans" */
    title: string;
    /** ranked `exercise` intents, in engine order */
    intents: PersonalizedIntent[];
    topScore: number;
    thinkingKey: string;
    plan: ExerciseLine[];
    /** the programme this patient was last actually given */
    previousPlan: ExerciseLine[];
    /** when that was, for the header note */
    previousAt: string | null;
    ruleset: Ruleset | null;
    activeSignals: ActiveSignal[];
    hasChart: boolean;
    disabled?: boolean;
    onAccept: (payload: AcceptPayload) => void;
    onUpdate: (id: string, patch: Partial<ExerciseLine>) => void;
    onRemove: (id: string) => void;
    onDuplicateForSide: (id: string, side: ExerciseSide) => void;
    searchRef?: React.RefObject<HTMLInputElement>;
    className?: string;
}) {
    const listRef = useRef<HTMLDivElement>(null);
    const search = useIntentSearch(["exercise"]);

    const comparison = useMemo(() => comparePlans(plan, previousPlan), [plan, previousPlan]);
    const previousByIdentity = useMemo(
        () => new Map(previousPlan.map((l) => [identityOf(l), l])),
        [previousPlan]
    );

    // Ranked exercises that are not already prescribed. A line on the plan is
    // shown once, at the top, with its dose — offering it again below as
    // something to "add" would be the same exercise in two states on one
    // screen.
    const onPlanIntentIds = useMemo(
        () => new Set(plan.map((l) => l.intentId).filter((i): i is number => i != null)),
        [plan]
    );
    const offered = useMemo(
        () => intents.filter((i) => !onPlanIntentIds.has(i.intentId)).slice(0, RANKED_CAP),
        [intents, onPlanIntentIds]
    );

    // The same walk-and-take every ranked panel has. `.cs-ex-offer` is the
    // offered rows and `.cs-sug` is what the search results render, so one
    // cursor covers both without either knowing about the other — the same
    // arrangement §14.22 describes for the medicine card.
    const roving = useRovingList({
        containerRef: listRef,
        rowSelector: ".cs-ex-offer, .cs-sug",
        actionSelector: ".cs-ex-add, .cs-act",
    });

    const onSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            roving.move(e.key === "ArrowUp" ? -1 : 1);
        } else if (e.key === "Enter") {
            e.preventDefault();
            roving.activate();
        }
    };

    const previousDate = previousAt
        ? new Date(previousAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })
        : null;

    return (
        <section className={`cs-card cs-ex-card ${className}`} aria-label={title}>
            <div className="cs-card-head">
                <h2 className="cs-card-title">
                    <span className="cs-glyph is-blue"><Activity size={16} /></span>
                    {title}
                    <ThinkingRing pulseKey={thinkingKey} />
                </h2>
                <span className="cs-card-count">
                    {plan.length > 0
                        ? `${plan.length} prescribed`
                        : `${intents.length} suggested`}
                </span>
            </div>

            {/* Not a convenience — the only way to an exercise. See the header. */}
            <IntentSearchField
                state={search}
                placeholder="Search exercises…"
                inputRef={searchRef}
                disabled={disabled}
                onKeyDown={onSearchKeyDown}
            />

            <div className="cs-list cs-ex-list" ref={listRef}>
                {/* Gated on `isSearching`, not on the query being non-empty:
                    the results block renders its own "nothing matches" empty
                    state, which on an idle card is a clipped sentence under
                    the search box answering a question nobody asked. Same
                    gate `SuggestionsCard` uses. Found in the browser. */}
                {search.isSearching && (
                <IntentSearchResults
                    state={search}
                    verbOf={() => "Add"}
                    ruleset={ruleset}
                    activeSignals={activeSignals}
                    rankedIntentIds={new Set(intents.map((i) => i.intentId))}
                    acceptedIntentIds={onPlanIntentIds}
                    acknowledged={new Set()}
                    onAcknowledge={() => { }}
                    onAccept={onAccept}
                />
                )}

                {!search.isSearching && (
                    <>
                        {/* ── The programme ─────────────────────────────── */}
                        {plan.length > 0 && (
                            <div className="cs-ex-group">
                                <p className="cs-ex-grouphead">
                                    This session's programme
                                    {comparison.hasPrevious && previousDate && (
                                        <span> · compared with {previousDate}</span>
                                    )}
                                </p>
                                {plan.map((line) => (
                                    <PrescribedRow
                                        key={line.id}
                                        line={line}
                                        verdict={comparison.byIdentity.get(identityOf(line)) ?? "added"}
                                        previous={previousByIdentity.get(identityOf(line))}
                                        showBadges={comparison.hasPrevious}
                                        disabled={disabled}
                                        onUpdate={(patch) => onUpdate(line.id, patch)}
                                        onRemove={() => onRemove(line.id)}
                                        onSide={(s) =>
                                            line.side === null
                                                ? onUpdate(line.id, { side: s })
                                                : onDuplicateForSide(line.id, s)
                                        }
                                    />
                                ))}

                                {/* A dropped exercise is a decision too, and
                                    today's list cannot show a line that is not
                                    on it. Counted rather than re-listed — a
                                    prompt, not a checklist. */}
                                {comparison.dropped.length > 0 && (
                                    <p className="cs-ex-dropped">
                                        {comparison.dropped.length} from last session not carried forward
                                        {": "}
                                        <span>{comparison.dropped.map((l) => l.label).join(", ")}</span>
                                    </p>
                                )}
                            </div>
                        )}

                        {/* ── What the chart suggests adding ────────────── */}
                        {offered.length > 0 && (
                            <div className="cs-ex-group">
                                <p className="cs-ex-grouphead">
                                    {plan.length > 0 ? "Also suggested" : "Suggested for this chart"}
                                </p>
                                {offered.map((intent) => {
                                    const relevance = relevanceOf(rankFillOf(intent, topScore));
                                    return (
                                        <div key={intent.intentId} className="cs-ex-row cs-ex-offer">
                                            <div className="cs-ex-main">
                                                <div className="cs-ex-head">
                                                    <span className="cs-ex-label">{intent.label}</span>
                                                </div>
                                                {relevance && (
                                                    <p className="cs-ex-rel">{RELEVANCE_TEXT[relevance]}</p>
                                                )}
                                            </div>
                                            <button
                                                type="button"
                                                className="cs-ex-add"
                                                disabled={disabled}
                                                onClick={() =>
                                                    onAccept({
                                                        intentId: intent.intentId,
                                                        type: "exercise",
                                                        label: intent.label,
                                                        refTable: intent.refTable,
                                                        refId: intent.refId,
                                                        medicine: null,
                                                        viaSearch: false,
                                                        overridden: false,
                                                    })
                                                }
                                            >
                                                <Plus size={13} />
                                                Add
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {plan.length === 0 && offered.length === 0 && (
                            <p className="cs-ex-empty">
                                {hasChart
                                    ? "No exercise ranked for this chart — search above to add one."
                                    : "Record the complaint first, or search above."}
                            </p>
                        )}
                    </>
                )}
            </div>
        </section>
    );
}
