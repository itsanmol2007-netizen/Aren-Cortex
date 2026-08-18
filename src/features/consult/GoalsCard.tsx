// ---------------------------------------------------------------------------
// GOALS — what the patient wants back, in their own words, re-scored every
// visit. First patient-authored content anywhere in the schema.
//
// Moved into Phase 1 ahead of Phase 4 on Anmol's direction: the goal
// changes what the examination should look at, so collecting it after the
// exam means the exam was never shaped by it (plan §1). PSFS-shaped —
// activity + 0-10, re-scored per visit, which is what makes a goal a TREND
// rather than a note.
//
// `lastScores` / `todayScores` come from `useVisitStory` — this component
// only renders and emits events, same read/write split every other card in
// this consult uses.
// ---------------------------------------------------------------------------

import { useState } from "react";
import { ArrowRight, Plus, Target, X } from "lucide-react";
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

function GoalRow({
    goal, lastScore, todayScore, onScoreChange, onRetire, disabled,
}: {
    goal: PatientGoal;
    lastScore: number | undefined;
    todayScore: number | undefined;
    onScoreChange: (score: number) => void;
    onRetire: (status: Exclude<GoalStatus, "active">) => void;
    disabled?: boolean;
}) {
    const [menuOpen, setMenuOpen] = useState(false);
    // First visit for this goal: nothing to compare against yet, so the
    // baseline itself is what's shown rather than a "before" that doesn't exist.
    const before = lastScore ?? goal.baselineScore;
    const shown = todayScore ?? before ?? 0;

    return (
        <div className="cs-goal-row">
            <span className="cs-goal-activity">{goal.activity}</span>

            <div className="cs-goal-score">
                {before !== null && before !== undefined && (
                    <>
                        <span className="cs-goal-before">{before}</span>
                        <ArrowRight size={11} aria-hidden="true" />
                    </>
                )}
                <input
                    type="range"
                    min={0}
                    max={10}
                    value={shown}
                    disabled={disabled}
                    onChange={(e) => onScoreChange(Number(e.target.value))}
                    aria-label={`Score for ${goal.activity}, out of 10`}
                />
                <span className="cs-goal-now">{shown}/10</span>
            </div>

            <div className="cs-goal-menu-wrap">
                <button
                    type="button"
                    className="cs-goal-retire"
                    aria-label="Close this goal"
                    onClick={() => setMenuOpen((v) => !v)}
                >
                    <X size={12} />
                </button>
                {menuOpen && (
                    <div className="cs-goal-menu" role="menu">
                        <button type="button" onClick={() => { onRetire("achieved"); setMenuOpen(false); }}>
                            Achieved
                        </button>
                        <button type="button" onClick={() => { onRetire("abandoned"); setMenuOpen(false); }}>
                            No longer a goal
                        </button>
                        <button type="button" onClick={() => setMenuOpen(false)}>Cancel</button>
                    </div>
                )}
            </div>
        </div>
    );
}

export function GoalsCard({
    goals, lastScores, todayScores, onScoreChange, onAdd, onRetire, disabled = false,
}: Props) {
    const [draft, setDraft] = useState("");
    const [draftScore, setDraftScore] = useState(5);
    const [adding, setAdding] = useState(false);

    const submit = () => {
        const activity = draft.trim();
        if (!activity) return;
        onAdd(activity, draftScore);
        setDraft("");
        setDraftScore(5);
        setAdding(false);
    };

    return (
        <section className="cs-card cs-goals" aria-label="Goals">
            <div className="cs-card-head">
                <span className="cs-card-title">
                    <span className="cs-glyph is-slate"><Target size={14} /></span>
                    Goals
                </span>
            </div>

            <div className="cs-goals-body">
                {goals.map((g) => (
                    <GoalRow
                        key={g.id}
                        goal={g}
                        lastScore={lastScores.get(g.id)}
                        todayScore={todayScores.get(g.id)}
                        onScoreChange={(score) => onScoreChange(g.id, score)}
                        onRetire={(status) => onRetire(g.id, status)}
                        disabled={disabled}
                    />
                ))}

                {adding ? (
                    <div className="cs-goal-add-row">
                        <input
                            className="cs-attach-region-input"
                            placeholder="What do they want to get back to?"
                            value={draft}
                            autoFocus
                            disabled={disabled}
                            onChange={(e) => setDraft(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") submit(); if (e.key === "Escape") setAdding(false); }}
                        />
                        <input
                            type="number" min={0} max={10}
                            className="cs-goal-baseline-input"
                            value={draftScore}
                            disabled={disabled}
                            onChange={(e) => setDraftScore(Number(e.target.value))}
                        />
                        <button type="button" className="cs-attach-tagsave" onClick={submit}>Add</button>
                    </div>
                ) : (
                    <button type="button" className="cs-goal-add-btn" disabled={disabled} onClick={() => setAdding(true)}>
                        <Plus size={13} aria-hidden="true" />
                        Add what they want to get back to
                    </button>
                )}
            </div>
        </section>
    );
}
