// ---------------------------------------------------------------------------
// POSSIBLE CONDITIONS — the engine's reading of the chart.
//
// This was called "Possible Finding" and lived inside Clinical Suggestions,
// between investigations and advice. Two things were wrong with that:
//
//  * THE NAME. Cortex already has a panel called Findings, and it means
//    something else entirely — what the doctor saw on examination. One is an
//    input the doctor records, the other is an output the engine proposes.
//    Sharing a word between them is how a doctor comes to believe the system
//    examined the patient. They are kept separate and named separately: the
//    examination panel keeps "Findings", this one is "Possible Conditions".
//
//  * THE PLACE. A reading of the chart belongs beside the chart, not four
//    sections down a list of things to order. It sits in the entry band now
//    and re-ranks in the same frame a chip lands, so the doctor sees their own
//    reasoning move as they type.
//
// ── What the heading has to say, and why ──────────────────────────────────
// It reads from SYMPTOMS, EXAMINATION FINDINGS AND MEASUREMENTS alike — the
// engine receives one flat set of observations plus a set of numbers and cannot
// tell which surface any of them came from. A doctor who believed this panel
// only reflected the symptom chips would read a list that silently included
// their blood-pressure reading and wonder why it disagreed with them. The
// subtitle says so in as many words.
//
// The plural is load-bearing too. Ranking IS the safety property here (handoff
// §1): a named condition shown at rank 1 alongside three alternatives is
// honest, and the same label shown alone reads as a verdict. Nothing in this
// panel is ever presented as the cause.
// ---------------------------------------------------------------------------

import { useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Check, ChevronDown, ShieldAlert, Stethoscope, X } from "lucide-react";
import type { ActiveSignal, Ruleset } from "../../lib/synapse/engine";
import type { PersonalizedIntent } from "../../lib/synapse/personalize";
import { GuardReason, RELEVANCE_TEXT, ThinkingRing, rankFillOf, relevanceOf } from "./parts";
import { WhyButton } from "./ContributionSheet";
import {
    IntentSearchField, IntentSearchResults, useIntentSearch,
} from "./IntentSearch";
import type { AcceptPayload } from "./types";
import { BlankSelectedArt } from "./BlankArt";
import { useRovingList } from "../../hooks/useRovingList";
import { firedChord, matches } from "../../lib/keyboard/keymap";

/** Rows shown before the panel asks. */
const CAP = 4;

/**
 * One collapsed row, measured rather than guessed, so the animated height
 * lands on a row edge instead of slicing the fifth one in half.
 *
 * Re-measured in the browser 2026-08-13: a row is 52.9px, not 46. At 46 the
 * collapsed box came to 184px against 212px of rows, so the FOURTH row was
 * being sliced a quarter of the way through and the panel looked broken
 * rather than bounded — the exact failure the comment above was written to
 * prevent. Rounded up to 53 so four rows end on an edge.
 */
const ROW_H = 53;

interface Props {
    /** the ranked `finding` intents, in engine order */
    intents: PersonalizedIntent[];
    /** the strongest score among them — the relevance denominator */
    topScore: number;
    /** "Synapse is thinking" cue — see ThinkingRing in parts.tsx */
    thinkingKey: string;
    acceptedIntentIds: Set<number>;
    acknowledged: Set<number>;
    onAcknowledge: (intentId: number, ack: boolean) => void;
    onAccept: (payload: AcceptPayload) => void;
    /** opens the contribution sheet for one row */
    onExplain: (intent: PersonalizedIntent, anchor: DOMRect) => void;
    /** for the guard verdict on a searched, never-ranked condition */
    ruleset: Ruleset | null;
    activeSignals: ActiveSignal[];
    hasChart: boolean;
    /** the doctor's confirmed assessment, in confirmation order */
    diagnoses: string[];
    onRemoveDiagnosis: (label: string) => void;
    disabled?: boolean;
    /** the Assessment Tab stop — see STOPS in useConsultKeyboard.ts */
    searchRef?: React.RefObject<HTMLInputElement>;
}

export function ConditionsCard({
    intents, topScore, thinkingKey, acceptedIntentIds, acknowledged, onAcknowledge, onAccept,
    onExplain, ruleset, activeSignals, hasChart,
    diagnoses, onRemoveDiagnosis, disabled = false, searchRef,
}: Props) {
    const [expanded, setExpanded] = useState(false);
    const reduce = useReducedMotion();
    const search = useIntentSearch(["finding"]);

    /**
     * This card is the second Tab stop, so its search field is where a doctor
     * arrives with their hands already on the keyboard — it needs the same
     * walk-and-take the medicines panel has. See `useRovingList` for why the
     * cursor is in the DOM rather than in state here: this list re-ranks in the
     * same frame a chip lands on the case sheet above it.
     */
    const listRef = useRef<HTMLDivElement>(null);
    const roving = useRovingList({
        containerRef: listRef,
        rowSelector: ".cs-sug",
        actionSelector: "button.cs-act",
        enabled: !disabled,
    });

    const onSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        const move = firedChord(e, "conditionMove");
        if (move) {
            e.preventDefault();
            e.stopPropagation();
            roving.move(move.key === "ArrowUp" ? -1 : 1);
            return;
        }
        if (matches(e, "conditionTake")) {
            e.preventDefault();
            e.stopPropagation();
            roving.activate();
        }
    };

    const shown = expanded
        ? intents
        : [
            ...intents.slice(0, CAP),
            // Anything already confirmed stays visible regardless of the cap.
            ...intents.slice(CAP).filter((i) => acceptedIntentIds.has(i.intentId)),
        ];
    const hidden = intents.length - shown.length;

    const rankedIds = useMemo(
        () => new Set(intents.map((i) => i.intentId)),
        [intents]
    );

    const body = () => {
        if (search.isSearching) {
            return (
                <IntentSearchResults
                    state={search}
                    verbOf={() => "Confirm"}
                    ruleset={ruleset}
                    activeSignals={activeSignals}
                    rankedIntentIds={rankedIds}
                    acceptedIntentIds={acceptedIntentIds}
                    acknowledged={acknowledged}
                    onAcknowledge={onAcknowledge}
                    onAccept={onAccept}
                />
            );
        }

        if (!hasChart) {
            return (
                <div className="cs-empty">
                    <strong>Nothing to read yet</strong>
                    <span>
                        Conditions appear as you enter symptoms, findings and
                        measurements — and re-order as you go.
                    </span>
                </div>
            );
        }

        if (intents.length === 0) {
            return (
                <div className="cs-empty">
                    <strong>No condition ranks for this chart</strong>
                    <span>Search above to record one directly.</span>
                </div>
            );
        }

        return shown.map((intent, i) => (
            <ConditionRow
                key={intent.intentId}
                intent={intent}
                rank={i + 1}
                // A list of one has no other side to the comparison, and the
                // word could only ever read "High relevance" however weakly the
                // engine scored it.
                relevance={
                    intents.length > 1
                        ? RELEVANCE_TEXT[relevanceOf(rankFillOf(intent, topScore))]
                        : null
                }
                confirmed={acceptedIntentIds.has(intent.intentId)}
                acknowledged={acknowledged.has(intent.intentId)}
                onAcknowledge={(v) => onAcknowledge(intent.intentId, v)}
                onExplain={(rect) => onExplain(intent, rect)}
                onAccept={() =>
                    onAccept({
                        intentId: intent.intentId,
                        type: intent.type,
                        label: intent.label,
                        refTable: intent.refTable,
                        refId: intent.refId,
                        medicine: null,
                        viaSearch: false,
                        overridden: intent.status === "warn_hard",
                    })
                }
            />
        ));
    };

    // The doctor's own assessment, in the order they confirmed it. First is
    // PRIMARY, the rest are SECONDARY — a convention, not a derivation: the
    // engine never decides which diagnosis is primary, because that is the one
    // judgement in this workspace that is entirely the doctor's.
    const [primaryDx, ...secondaryDx] = diagnoses;

    return (
        <section
            aria-label="Assessment"
            // `cs-assess` carries the one piece of hierarchy this card needs
            // and Tailwind should not own: it is the pivot of the screen —
            // everything above feeds it, everything below reads from it — and
            // it was rendering as one more white card in a stack of five. A
            // stronger edge and one more degree of lift, in consult.css beside
            // the tokens it depends on.
            className="cs-assess flex min-w-0 flex-col rounded-[var(--cs-radius)] border border-[var(--cs-line)] bg-[var(--cs-card)] pb-4 shadow-[var(--cs-shadow)]"
        >
            <div className="flex items-center gap-2 px-4 pt-3.5">
                {/* `cs-glyph-live` is the one plain-CSS class on an otherwise
                    Tailwind icon — it only supplies `position: relative` for
                    ThinkingRing to anchor to; see consult.css. */}
                <span className="cs-glyph-live grid size-[26px] flex-none place-items-center rounded-lg bg-[linear-gradient(180deg,#f7f2ff_0%,#ede2fe_100%)] text-[#6d28d9] shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
                    <ThinkingRing pulseKey={thinkingKey} />
                    <Stethoscope size={14} />
                </span>
                <h2 className="m-0 text-[13.5px] font-bold uppercase tracking-[0.045em] text-[var(--cs-ink)]">
                    Assessment
                </h2>
            </div>

            <div className="mt-3 px-4">
                <IntentSearchField
                    state={search}
                    placeholder="Search diagnosis / condition…"
                    disabled={disabled}
                    inputRef={searchRef}
                    onKeyDown={onSearchKeyDown}
                />
            </div>

            {/* ── TWO COLUMNS ──────────────────────────────────────────────
                What the engine offers, beside what the doctor has taken.

                This was one column, top to bottom, on the reasoning that
                sequence carries the distinction better than adjacency. In the
                browser it does not: the ranked list and the confirmed
                diagnoses ended up a screen apart, so confirming something felt
                like it went nowhere. Side by side, the click has a visible
                destination two inches away.

                The two halves stay visually unlike each other on purpose. Left
                is a ranked list with badges and a verb; right is a set of
                chips with neither. Ranking is a safety property, never a
                verdict, and the moment a possibility and a decision look alike
                is the moment rank 1 starts reading as a diagnosis. */}
            {search.isSearching ? (
                /* Same ref on both branches: only one of them is mounted at a
                   time, so the cursor walks whichever list the card is
                   currently showing — ranked conditions, or search hits. */
                <div className="mt-3 px-4" ref={listRef}>{body()}</div>
            ) : (
                <div className="mt-3.5 grid gap-4 px-4 md:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)]">
                    {/* left: what is ranked */}
                    <div className="min-w-0">
                        <div className="flex items-baseline gap-2 border-b border-[var(--cs-line)] pb-1.5">
                            <span className="text-[10.5px] font-bold uppercase tracking-[0.09em] text-[var(--cs-label)]">
                                Ranked conditions
                            </span>
                            {intents.length > 0 && (
                                <span className="ml-auto text-[11.5px] font-medium tabular-nums text-[var(--cs-faint)]">
                                    {shown.length} of {intents.length}
                                </span>
                            )}
                            {/* At the TOP, beside the count it modifies, not at
                                the bottom of a list you have to reach the end
                                of before you learn there is more. */}
                            {hidden > 0 && !expanded && (
                                <button
                                    type="button"
                                    onClick={() => setExpanded(true)}
                                    className="flex-none rounded-md border-0 bg-transparent px-1 py-0 text-[11.5px] font-semibold text-[var(--cs-blue)] hover:underline"
                                >
                                    Show more
                                </button>
                            )}
                            {expanded && intents.length > CAP && (
                                <button
                                    type="button"
                                    onClick={() => setExpanded(false)}
                                    className="flex-none rounded-md border-0 bg-transparent px-1 py-0 text-[11.5px] font-semibold text-[var(--cs-faint)] hover:text-[var(--cs-blue)] hover:underline"
                                >
                                    Show less
                                </button>
                            )}
                        </div>
                        {/* The honesty line, and it is content rather than
                            ornament: a doctor who assumes this column reads
                            only from the symptom chips is reading a list that
                            silently includes their BP. It belongs at reading
                            contrast. */}
                        <p className="mt-1.5 text-[12px] font-[460] leading-snug text-[var(--cs-muted)]">
                            Ranked from symptoms, findings and measurements. You decide.
                        </p>
                        {/* ── SCROLL IS OFF UNTIL ASKED FOR ────────────────
                            Collapsed, the list shows CAP rows and simply ends:
                            no inner scrollbar, because a scroll region the
                            doctor did not ask for steals the page's wheel and
                            hides its own contents behind an edge they have no
                            reason to look at.

                            "Show more" is what unlocks it. Expanded, the list
                            scrolls INSIDE a bounded box rather than growing,
                            so a chart with fifteen conditions cannot push the
                            prescription off the screen. Anmol, 2026-08-13:
                            "keep the nested scrolling off by default, but when
                            you click show more, more will be shown there ...
                            it should not grow endlessly." */}
                        {/* The collapse-to-scroll transition is animated on
                            max-height rather than switched, so the panel grows
                            into its scroll box instead of snapping and shoving
                            everything below it down a screen. */}
                        <motion.div
                            initial={false}
                            // Expanded stops on a HALF row on purpose: this one
                            // is a scroll box, and a clean edge there would say
                            // the list ends where it does not.
                            animate={{ maxHeight: expanded ? 4.5 * ROW_H : CAP * ROW_H }}
                            transition={
                                reduce
                                    ? { duration: 0 }
                                    : { type: "spring", stiffness: 260, damping: 32 }
                            }
                            className={
                                "mt-1.5 flex flex-col " +
                                (expanded ? "overflow-y-auto pr-1" : "overflow-hidden")
                            }
                            ref={listRef}
                        >
                            {body()}
                        </motion.div>
                    </div>

                    {/* right: what has been taken */}
                    {/* A flex column so the blank state can take the space the
                        ranked list decides. This column is as tall as its
                        neighbour by grid, and with the blank pinned under the
                        heading a four-row chart left ~230px of white below one
                        line of text — the largest single void left on a
                        WORKING screen rather than an empty one. */}
                    <div className="flex min-w-0 flex-col">
                        <div className="flex items-baseline gap-2 border-b border-[var(--cs-line)] pb-1.5">
                            <span className="text-[10.5px] font-bold uppercase tracking-[0.09em] text-[var(--cs-label)]">
                                Selected / confirmed
                            </span>
                            {diagnoses.length > 0 && (
                                <span className="ml-auto rounded-[6px] bg-[var(--cs-blue-soft)] px-1.5 py-[2px] text-[11px] font-semibold text-[var(--cs-blue)]">
                                    {diagnoses.length} selected
                                </span>
                            )}
                        </div>

                        {diagnoses.length === 0 ? (
                            /* py-7 was 56px of padding around one line, in a
                               column whose neighbour is already short. */
                            <div className="flex flex-1 flex-col items-center justify-center gap-1.5 py-4 text-center">
                                <BlankSelectedArt />
                                <span className="text-[12.5px] font-[460] text-[var(--cs-muted)]">
                                    Confirm a condition from the ranked list
                                </span>
                            </div>
                        ) : (
                            <div className="mt-2 flex flex-col gap-1.5">
                                {/* First confirmed is PRIMARY, the rest are
                                    secondary. A convention, never a derivation:
                                    the engine does not decide which diagnosis
                                    is primary, because that is the one
                                    judgement here that is entirely the
                                    doctor's. */}
                                {primaryDx && (
                                    <DxChip
                                        label={primaryDx}
                                        tone="primary"
                                        onRemove={() => onRemoveDiagnosis(primaryDx)}
                                    />
                                )}
                                {secondaryDx.map((dx) => (
                                    <DxChip
                                        key={dx}
                                        label={dx}
                                        tone="secondary"
                                        onRemove={() => onRemoveDiagnosis(dx)}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </section>
    );
}

function ConditionRow({
    intent, rank, relevance, confirmed, acknowledged, onAcknowledge, onExplain, onAccept,
}: {
    intent: PersonalizedIntent;
    /** position in the list, 1-based, for the badge */
    rank: number;
    relevance: string | null;
    confirmed: boolean;
    acknowledged: boolean;
    onAcknowledge: (v: boolean) => void;
    onExplain: (anchor: DOMRect) => void;
    onAccept: () => void;
}) {
    const rowRef = useRef<HTMLDivElement>(null);
    const isHard = intent.status === "warn_hard";
    const isWarn = intent.status === "warn";
    const locked = isHard && !acknowledged;

    return (
        <div
            ref={rowRef}
            // The second way in. The info button is the discoverable one and
            // the only one a keyboard reaches; double-click is the shortcut for
            // a doctor who already knows it is there.
            onDoubleClick={() => {
                const r = rowRef.current?.getBoundingClientRect();
                if (r) onExplain(r);
            }}
            className={
                "flex items-center gap-2.5 rounded-lg border px-2.5 py-2 transition-colors duration-150 " +
                (confirmed
                    ? "border-[#b6e6cd] bg-[linear-gradient(180deg,#f4fdf8_0%,#e6f8ef_100%)] "
                    : isHard
                        ? "border-[#f4cfcb] bg-[#fef6f5] "
                        : "border-transparent hover:border-[var(--cs-line)] hover:bg-[#fafbfd] ")
            }
        >
            {/* The rank, as a number. It was a stethoscope glyph repeated down
                the column, which said the same thing on every row and so said
                nothing. A ranked list should be numbered: the position IS the
                content. Green once taken, so the state is legible from the
                badge alone. */}
            <span
                aria-hidden="true"
                className={
                    "grid size-[22px] flex-none place-items-center rounded-full text-[11.5px] font-bold tabular-nums " +
                    (confirmed
                        ? "bg-[linear-gradient(180deg,#22a565_0%,#16924f_100%)] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.3)]"
                        : "bg-[linear-gradient(180deg,#1e293b_0%,#0f172a_100%)] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]")
                }
            >
                {rank}
            </span>

            <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[13.5px] font-semibold leading-tight text-[var(--cs-ink)]">
                        {intent.label}
                    </span>
                    {intent.isSafetyCritical && (
                        <span className="cs-flag is-safety"><ShieldAlert size={10} /> Safety</span>
                    )}
                    {isWarn && <span className="cs-flag is-warn">Caution</span>}
                    {isHard && <span className="cs-flag is-hard">Check</span>}
                    <WhyButton label={intent.label} onOpen={onExplain} />
                </div>
                {relevance && (
                    <span className="mt-[1px] block text-[11.5px] font-semibold text-[var(--cs-label)]">
                        {relevance}
                    </span>
                )}
            </div>

            {confirmed ? (
                <span
                    aria-label="Confirmed"
                    className="grid size-[22px] flex-none place-items-center rounded-full bg-[#dcf5e8] text-[#15803d]"
                >
                    <Check size={14} />
                </span>
            ) : locked ? (
                <span className="w-[62px] flex-none" aria-hidden="true" />
            ) : (
                <button
                    type="button"
                    onClick={onAccept}
                    className="flex-none rounded-md border border-[var(--cs-line-strong)] bg-white px-2.5 py-[5px] text-[12px] font-semibold text-[var(--cs-muted)] transition-colors duration-150 hover:border-[rgba(18,104,232,0.5)] hover:bg-[var(--cs-blue-soft)] hover:text-[var(--cs-blue)]"
                >
                    Select
                </button>
            )}

            {(isWarn || isHard) && intent.guardReasons.length > 0 && (
                <div className="basis-full">
                    <GuardReason
                        hard={isHard}
                        reasons={intent.guardReasons}
                        acknowledged={acknowledged}
                        onAcknowledge={onAcknowledge}
                    />
                </div>
            )}
        </div>
    );
}

/**
 * One confirmed diagnosis, as a chip.
 *
 * Deliberately a different object from the suggestion rows beside it: those
 * carry a relevance bar and a "Confirm" verb, this carries neither. A chip is
 * a decision that has been made; a row is one that has not. Making them look
 * alike is precisely how a ranked possibility gets read as a diagnosis.
 */
function DxChip({
    label, tone, onRemove,
}: {
    label: string;
    tone: "primary" | "secondary";
    onRemove: () => void;
}) {
    return (
        <span
            className={
                "flex items-center gap-2 rounded-lg border px-3 py-2 " +
                (tone === "primary"
                    ? "border-[#d9c9fb] bg-[linear-gradient(180deg,#faf7ff_0%,#efe7fe_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]"
                    : "border-[#e6ddfb] bg-[#faf8ff]")
            }
        >
            <span
                className={
                    "min-w-0 flex-1 truncate text-[13.5px] leading-tight text-[#5b21b6] " +
                    (tone === "primary" ? "font-bold" : "font-semibold")
                }
            >
                {label}
            </span>
            <button
                type="button"
                onClick={onRemove}
                aria-label={`Remove ${label}`}
                className="grid size-[18px] flex-none place-items-center rounded border-0 bg-transparent p-0 text-[#7c5bd0] opacity-60 transition hover:bg-black/5 hover:opacity-100"
            >
                <X size={13} />
            </button>
        </span>
    );
}
