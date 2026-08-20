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
// opens a compact 0-10 picker when pressed. `lastScores` / `todayScores`
// still come from `useVisitStory`, and this component still only renders and
// emits events — same read/write split every other card in this consult uses.
// ---------------------------------------------------------------------------

import { useEffect, useRef, useState } from "react";
import { Check, Plus, Search, Target } from "lucide-react";
import type { PatientGoal, GoalStatus } from "../../lib/db/story";

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

/** The 0-10 picker, opened from a chip. Segmented rather than a range input:
 *  PSFS is an ordinal grade the patient states, so it is picked, not dragged
 *  — the same reasoning `ExaminationCard`'s 0-5 strength segment already
 *  applies to MMT. */
function ScorePicker({
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
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const away = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) onClose();
        };
        const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        document.addEventListener("mousedown", away);
        document.addEventListener("keydown", esc);
        return () => {
            document.removeEventListener("mousedown", away);
            document.removeEventListener("keydown", esc);
        };
    }, [onClose]);

    return (
        <div className="cs-goal-pop" ref={ref} role="dialog" aria-label={`Score for ${goal.activity}`}>
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
                        onClick={() => { onScoreChange(n); onClose(); }}
                    >
                        {n}
                    </button>
                ))}
            </div>
            <div className="cs-goal-pop-foot">
                <span>0 = can't do it · 10 = back to normal</span>
                <span className="cs-goal-pop-actions">
                    <button type="button" onClick={() => { onRetire("achieved"); onClose(); }}>
                        Achieved
                    </button>
                    <button type="button" onClick={() => { onRetire("abandoned"); onClose(); }}>
                        Remove
                    </button>
                </span>
            </div>
        </div>
    );
}

export function GoalsCard({
    goals, lastScores, todayScores, onScoreChange, onAdd, onRetire, disabled = false,
}: Props) {
    const [query, setQuery] = useState("");
    const [active, setActive] = useState(0);
    const [openGoal, setOpenGoal] = useState<number | null>(null);
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

    return (
        <section className="cs-card cs-goals" aria-label="Goals">
            <div className="cs-card-head">
                <span className="cs-card-num" aria-hidden="true">2</span>
                <span className="cs-card-title">
                    Goals
                    <em>What does the patient want to achieve?</em>
                </span>
                <button
                    type="button"
                    className="cs-goal-headbtn"
                    disabled={disabled}
                    onClick={() => inputRef.current?.focus()}
                >
                    <Plus size={13} aria-hidden="true" />
                    Goal
                </button>
            </div>

            <div className="cs-goals-body">
                <div className="cs-story-searchwrap">
                    <div className="cs-story-search">
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
                    </div>

                    {open && (
                        <div className="cs-story-results" role="listbox">
                            {options.map((label, i) => (
                                <button
                                    key={label}
                                    type="button"
                                    role="option"
                                    aria-selected={i === active}
                                    className={`cs-story-result${i === active ? " is-active" : ""}`}
                                    onMouseEnter={() => setActive(i)}
                                    onClick={() => take(label)}
                                >
                                    <span className="cs-story-result-label">{label}</span>
                                    {!matches.includes(label) && (
                                        <span className="cs-story-result-dim">New goal</span>
                                    )}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {goals.length > 0 && (
                    <div className="cs-story-chips">
                        {goals.map((g, i) => {
                            // First visit for this goal: nothing to compare against
                            // yet, so the baseline itself is the "before".
                            const before = lastScores.get(g.id) ?? g.baselineScore;
                            const today = todayScores.get(g.id);
                            const scored = today ?? before ?? undefined;
                            return (
                                <span key={g.id} className="cs-goal-chipwrap">
                                    <button
                                        type="button"
                                        className={`cs-story-chip is-press${openGoal === g.id ? " is-open" : ""}`}
                                        disabled={disabled}
                                        aria-haspopup="dialog"
                                        aria-expanded={openGoal === g.id}
                                        onClick={() => setOpenGoal((cur) => (cur === g.id ? null : g.id))}
                                    >
                                        {today !== undefined
                                            ? <Check size={13} className="cs-story-chip-tick" aria-hidden="true" />
                                            : <Target size={13} className="cs-story-chip-aim" aria-hidden="true" />}
                                        <span className="cs-story-chip-text">
                                            <b>{g.activity}</b>
                                            <em>
                                                {scored !== undefined
                                                    ? `${scored}/10${today === undefined ? " · last visit" : ""}`
                                                    : i === 0 ? "Primary" : "Not scored yet"}
                                            </em>
                                        </span>
                                    </button>
                                    {openGoal === g.id && (
                                        <ScorePicker
                                            goal={g}
                                            before={before}
                                            shown={today}
                                            onScoreChange={(score) => onScoreChange(g.id, score)}
                                            onRetire={(status) => onRetire(g.id, status)}
                                            onClose={() => setOpenGoal(null)}
                                            disabled={disabled}
                                        />
                                    )}
                                </span>
                            );
                        })}
                        <button
                            type="button"
                            className="cs-story-more"
                            disabled={disabled}
                            onClick={() => inputRef.current?.focus()}
                        >
                            <Plus size={13} aria-hidden="true" />
                            Add another goal
                        </button>
                    </div>
                )}
            </div>
        </section>
    );
}
