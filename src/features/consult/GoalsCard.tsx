// ---------------------------------------------------------------------------
// GOALS — what the patient wants back, in their own words, re-scored every
// visit. First patient-authored content anywhere in the schema.
//
// Moved into Phase 1 ahead of Phase 4 on Anmol's direction: the goal changes
// what the examination should look at, so collecting it after the exam means
// the exam was never shaped by it (plan §1). PSFS-shaped — activity + 0-10,
// re-scored per visit, which is what makes a goal a TREND rather than a note.
//
// ── Search-first, sliders behind the chip (2026-08-20)
//
// The card previously rendered one full-width ROW per goal, each carrying a
// live 0-10 range slider. Against the UX brief that is the same failure the
// Story card had: a permanent control for a dimension that is not always
// being edited. Brief §5 wants goals recorded early and connected to
// progress; it does not ask for three sliders sitting in the consultation
// from the moment the goals are named.
//
// So goals are now confirmation chips, entered through one search field —
// the same interaction Story uses one card above, which is the point: two
// adjacent cards should not teach two different ways to add a fact.
//
// THE SCORE IS NOT GONE. Deleting it would delete the trend, and the trend is
// the entire reason a goal is a schema object rather than a note. It moved
// one click in: the chip shows the current score when there is one, and
// opens a picker when pressed. `lastScores` / `todayScores` still come from
// `useVisitStory`, and this component still only renders and emits events —
// same read/write split every other card in this consult uses.
//
// ── A modal, not a popover (2026-09-23)
//
// The chip used to open `ScorePicker` inline, anchored under the chip. Anmol,
// looking at the card: "how much fucked up this section is looking?" — a
// full-width card whose content ended right after the search box, and a
// popover as the only way into a goal's detail, was the two complaints
// together. Both come from the same fix: goals get the rest of this card's
// designed shell, like everything else in the consult — a real modal on
// click (`.cs-addmed-*`'s shape, rose as the accent: colour.md's own meaning
// for rose is "reported (by the patient)", and a goal is the one thing in
// this whole schema the patient reports in their own words) and a reserved
// row of chip space so the card never reads as cut off short.
// ---------------------------------------------------------------------------

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search, Target, X } from "lucide-react";
import type { PatientGoal, GoalStatus } from "../../lib/db/story";
import { useOverlayFocus } from "../../hooks/useOverlayFocus";

interface Props {
    goals: PatientGoal[];
    lastScores: Map<number, number>;
    todayScores: Map<number, number>;
    onScoreChange: (goalId: number, score: number) => void;
    onAdd: (activity: string, baselineScore: number | null) => void;
    onRetire: (goalId: number, status: Exclude<GoalStatus, "active">) => void;
    disabled?: boolean;
}

/**
 * Starting points, not a catalogue. Brief §5's own examples, verbatim — a
 * patient goal is patient-authored by definition, so this list exists to
 * save typing on the common ones, never to constrain what can be entered.
 * Anything typed that does not match becomes a new goal as written.
 */
const GOAL_SUGGESTIONS = [
    "Return to running",
    "Return to sport",
    "Climb stairs without pain",
    "Sit on the floor",
    "Walk to work",
    "Squat without discomfort",
    "Sleep through the night",
    "Lift and carry at work",
    "Drive comfortably",
    "Get up from a chair unaided",
];

/** Chips beyond this many are behind "+N more" — Anmol: "I don't think
 *  someone have like 14 goals... a simple more option." */
const VISIBLE_CAP = 4;

/**
 * The 0-10 picker, now a real modal (`.cs-addmed-*`'s shape) rather than a
 * popover anchored to the chip. Segmented rather than a range input: PSFS is
 * an ordinal grade the patient states, so it is picked, not dragged — the
 * same reasoning `ExaminationCard`'s 0-5 strength segment already applies to
 * MMT.
 */
function GoalDetailModal({
    goal, before, shown, onScoreChange, onRetire, onClose, disabled,
}: {
    goal: PatientGoal;
    before: number | null | undefined;
    shown: number | undefined;
    onScoreChange: (score: number) => void;
    onRetire: (status: Exclude<GoalStatus, "active">) => void;
    onClose: () => void;
    disabled?: boolean;
}) {
    const panelRef = useRef<HTMLDivElement>(null);
    useOverlayFocus(panelRef, true);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") { e.preventDefault(); onClose(); }
        };
        window.addEventListener("keydown", onKey, true);
        return () => window.removeEventListener("keydown", onKey, true);
    }, [onClose]);

    return (
        <div className="cs-addmed" role="dialog" aria-modal="true" aria-label={`Score for ${goal.activity}`}>
            <button className="cs-addmed-scrim" type="button" onClick={onClose} aria-label="Close" />
            <div className="cs-addmed-panel cs-goal-modal" ref={panelRef} tabIndex={-1}>
                <div className="cs-addmed-topstripe cs-goal-modal-stripe" />

                <div className="cs-addmed-head">
                    <span className="cs-glyph is-rose"><Target size={16} /></span>
                    <div className="cs-addmed-title">
                        <span className="cs-addmed-eyebrow cs-goal-modal-eyebrow">Patient goal</span>
                        <strong>{goal.activity}</strong>
                    </div>
                    <button className="cs-addmed-x" type="button" onClick={onClose} aria-label="Close">
                        <X size={16} />
                    </button>
                </div>

                <div className="cs-addmed-body">
                    <section className="cs-addmed-sec">
                        <p className="cs-goal-pop-q">
                            How well can they do this today?
                            {before !== null && before !== undefined && (
                                <span className="cs-goal-pop-was">was {before}/10</span>
                            )}
                        </p>
                        <div className="cs-goal-scale" role="group" aria-label="0 to 10">
                            {Array.from({ length: 11 }, (_, n) => (
                                <button
                                    key={n}
                                    type="button"
                                    disabled={disabled}
                                    className={`cs-goal-tick${shown === n ? " is-on" : ""}`}
                                    aria-pressed={shown === n}
                                    onClick={() => onScoreChange(n)}
                                >
                                    {n}
                                </button>
                            ))}
                        </div>
                        <div className="cs-goal-pop-foot">
                            <span>0 = can't do it · 10 = back to normal</span>
                        </div>
                    </section>
                </div>

                <div className="cs-addmed-foot">
                    <button className="cs-addmed-cancel" type="button" onClick={() => onRetire("abandoned")}>
                        Remove
                    </button>
                    <button className="cs-addmed-confirm cs-goal-modal-confirm" type="button" onClick={() => onRetire("achieved")}>
                        <Check size={15} />
                        Mark achieved
                    </button>
                </div>
            </div>
        </div>
    );
}

export function GoalsCard({
    goals, lastScores, todayScores, onScoreChange, onAdd, onRetire, disabled = false,
}: Props) {
    const [query, setQuery] = useState("");
    const [active, setActive] = useState(0);
    const [openGoalId, setOpenGoalId] = useState<number | null>(null);
    const [showAll, setShowAll] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    const q = query.trim();
    const open = q.length > 0;
    const taken = new Set(goals.map((g) => g.activity.toLowerCase()));
    const matches = open
        ? GOAL_SUGGESTIONS.filter(
            (s) => s.toLowerCase().includes(q.toLowerCase()) && !taken.has(s.toLowerCase()),
        ).slice(0, 6)
        : [];
    // "Use what I typed" is always offered unless it duplicates an existing
    // goal or exactly matches a suggestion already in the list above.
    const exact = matches.some((m) => m.toLowerCase() === q.toLowerCase()) || taken.has(q.toLowerCase());
    const options = exact ? matches : [...matches, q];

    useEffect(() => { setActive(0); }, [query]);

    const take = (activity: string) => {
        // Baseline stays null: the score is what the PATIENT reports, and
        // inventing a 5 at entry would write a measurement nobody made. The
        // chip asks for it on the next click instead.
        onAdd(activity, null);
        setQuery("");
        inputRef.current?.focus();
    };

    const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (!open) return;
        if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((i) => Math.min(i + 1, options.length - 1));
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
        } else if (e.key === "Enter") {
            e.preventDefault();
            const pick = options[active];
            if (pick) take(pick);
        } else if (e.key === "Escape") {
            e.preventDefault();
            setQuery("");
        }
    };

    const openGoal = useMemo(() => goals.find((g) => g.id === openGoalId) ?? null, [goals, openGoalId]);
    const visibleGoals = showAll ? goals : goals.slice(0, VISIBLE_CAP);
    const hiddenCount = goals.length - visibleGoals.length;

    return (
        <section className="cs-card cs-goals" aria-label="Goals">
            {/* Title and search share ONE row — Anmol: "the simple heading
                just beside the search bar... literally just beside it". No
                explanatory subtitle (a doctor knows what a goal is) and no
                separate "+ Goal" button — the search field IS the add. */}
            <div className="cs-goals-top">
                <h2 className="cs-card-title cs-goals-title">
                    <span className="cs-glyph is-rose"><Target size={14} /></span>
                    Goals
                </h2>
                <div className="cs-goalx-searchwrap">
                    <div className="cs-goalx-search">
                        <Search size={15} aria-hidden="true" />
                        <input
                            ref={inputRef}
                            value={query}
                            disabled={disabled}
                            onChange={(e) => setQuery(e.target.value)}
                            onKeyDown={onKey}
                            placeholder="Search or add goal…"
                            aria-label="Search or add goal"
                            role="combobox"
                            aria-expanded={open}
                        />
                        {Boolean(query) && !disabled && (
                            <button
                                type="button"
                                className="cs-field-clear"
                                onClick={() => {
                                    setQuery("");
                                    inputRef.current?.focus();
                                }}
                                onMouseDown={(e) => e.preventDefault()}
                                aria-label="Clear goal search"
                                title="Clear search"
                                tabIndex={-1}
                            >
                                <X size={14} />
                            </button>
                        )}
                    </div>

                    {open && (
                        <div className="cs-goalx-results" role="listbox">
                            {options.map((label, i) => (
                                <button
                                    key={label}
                                    type="button"
                                    role="option"
                                    aria-selected={i === active}
                                    className={`cs-goalx-result${i === active ? " is-active" : ""}`}
                                    onMouseEnter={() => setActive(i)}
                                    onClick={() => take(label)}
                                >
                                    <span className="cs-goalx-result-label">{label}</span>
                                    {!matches.includes(label) && (
                                        <span className="cs-goalx-result-dim">New goal</span>
                                    )}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* One slim reserved row for the goal buttons — present even when
                empty, so the card keeps its height; "+N more" past four. */}
            <div className="cs-goalx-chips">
                    {goals.length === 0 ? (
                        <p className="cs-goalx-empty">No goals yet</p>
                    ) : (
                        <>
                            {visibleGoals.map((g, i) => {
                                // First visit for this goal: nothing to compare against
                                // yet, so the baseline itself is the "before".
                                const before = lastScores.get(g.id) ?? g.baselineScore;
                                const today = todayScores.get(g.id);
                                const scored = today ?? before ?? undefined;
                                return (
                                    <button
                                        key={g.id}
                                        type="button"
                                        className="cs-goalx-chip is-press"
                                        disabled={disabled}
                                        aria-haspopup="dialog"
                                        onClick={() => setOpenGoalId(g.id)}
                                    >
                                        {today !== undefined
                                            ? <Check size={12} className="cs-goalx-chip-tick" aria-hidden="true" />
                                            : <Target size={12} className="cs-goalx-chip-aim" aria-hidden="true" />}
                                        <b>{g.activity}</b>
                                        <em>
                                            {scored !== undefined
                                                ? `${scored}/10`
                                                : i === 0 ? "Primary" : "—"}
                                        </em>
                                    </button>
                                );
                            })}
                            {hiddenCount > 0 && (
                                <button type="button" className="cs-goalx-showmore" onClick={() => setShowAll(true)}>
                                    <ChevronDown size={12} aria-hidden="true" />
                                    {hiddenCount} more
                                </button>
                            )}
                        </>
                    )}
            </div>

            {openGoal && (
                <GoalDetailModal
                    goal={openGoal}
                    before={lastScores.get(openGoal.id) ?? openGoal.baselineScore}
                    shown={todayScores.get(openGoal.id)}
                    onScoreChange={(score) => onScoreChange(openGoal.id, score)}
                    onRetire={(status) => { onRetire(openGoal.id, status); setOpenGoalId(null); }}
                    onClose={() => setOpenGoalId(null)}
                    disabled={disabled}
                />
            )}
        </section>
    );
}
