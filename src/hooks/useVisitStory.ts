// ---------------------------------------------------------------------------
// THE VISIT STORY — physiotherapy's Subjective half, as state.
//
// Layer-1 "facts" hook, same tier as `useConsultChart` / `useConsultSession`
// in the table `SESSION-HANDOFF.md` keeps (see there for why the consult's
// state is three layers and which hook a new piece of state belongs in).
// This one owns `Story` (one visit) and `PatientGoal[]` (spans visits, same
// shape `useLongitudinalRecord` gives `patient_conditions`) — reads nothing
// from the engine, mutates nothing outside its own tables.
//
// ── Why goal scores are kept as "today's, in progress" separately from history
//
// A goal is re-scored every visit (`docs/Cortex Specialties/
// physiotherapy-phase-1-plan.md` §4 — "this is what makes a goal a TREND").
// The score being typed right now is not yet a `visit_goal_scores` row —
// same distinction `trend.ts` already draws between a saved reading and
// "today's unsaved one". `todayScores` is local state; `save()` is what
// turns it into rows.
//
// ── `reset()` is wired from the start
//
// `useConsultPlan.ts`'s own header documents `stagedMedicine` /
// `pendingMedicine` NOT being cleared by `plan.reset()` as an open bug — an
// add sheet left open across a patient switch can commit onto a blank
// consult. This hook does not repeat that: `reset()` clears `story`,
// `goals` and `todayScores` together, and `App.tsx` calls it on every
// patient switch and cancel, same as every other layer-1 hook.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useState } from "react";
import {
    fetchVisitStory, saveVisitStory, fetchActivePatientGoals, addPatientGoal,
    retirePatientGoal, fetchGoalScoreHistory, saveGoalScore,
} from "../lib/db/story";
import type { PatientGoal, GoalScore, GoalStatus } from "../lib/db/story";
import { emptyStory, isStoryEmpty } from "../features/consult/story";
import type { Story } from "../features/consult/story";

export interface VisitStoryHook {
    story: Story;
    setStory: (s: Story) => void;
    loading: boolean;
    error: string | null;

    goals: PatientGoal[];
    /** goalId -> most recent SAVED score, from before this visit */
    lastScores: Map<number, number>;
    /** goalId -> the score being entered THIS visit, not yet saved */
    todayScores: Map<number, number>;
    setTodayScore: (goalId: number, score: number) => void;
    addGoal: (activity: string, baselineScore: number | null) => Promise<void>;
    retireGoal: (goalId: number, status: Exclude<GoalStatus, "active">) => Promise<void>;

    /** Persists story (if not empty) and every entered today-score. Awaited,
     *  never fire-and-forget — see `useConsultLifecycle` for why it must
     *  catch rather than throw once the visit is already committed. */
    save: (visitId: string, doctorId: string | null) => Promise<void>;
    reset: () => void;
}

export function useVisitStory(visitId: string | null, patientId: string | null): VisitStoryHook {
    const [story, setStory] = useState<Story>(emptyStory());
    const [goals, setGoals] = useState<PatientGoal[]>([]);
    const [scoreHistory, setScoreHistory] = useState<GoalScore[]>([]);
    const [todayScores, setTodayScores] = useState<Map<number, number>>(new Map());
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!visitId && !patientId) return;
        let cancelled = false;
        setLoading(true);
        setError(null);
        Promise.all([
            visitId ? fetchVisitStory(visitId) : Promise.resolve(null),
            patientId ? fetchActivePatientGoals(patientId) : Promise.resolve([]),
            patientId ? fetchGoalScoreHistory(patientId) : Promise.resolve([]),
        ])
            .then(([s, g, h]) => {
                if (cancelled) return;
                setStory(s ?? emptyStory());
                setGoals(g);
                setScoreHistory(h);
            })
            .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [visitId, patientId]);

    // Most recent score per goal, strictly BEFORE today's visit — the same
    // "last real reading" idea trend.ts uses, computed here rather than in
    // the component because it is a property of the loaded history, not of
    // how a card chooses to draw it.
    const lastScores = new Map<number, number>();
    {
        const byGoal = new Map<number, GoalScore[]>();
        for (const s of scoreHistory) {
            if (visitId && s.visitId === visitId) continue; // this visit's own score, if reloaded, is not "last"
            if (!byGoal.has(s.goalId)) byGoal.set(s.goalId, []);
            byGoal.get(s.goalId)!.push(s);
        }
        for (const [goalId, rows] of byGoal) {
            lastScores.set(goalId, rows[rows.length - 1].score); // fetchGoalScoreHistory is oldest-first
        }
    }

    const setTodayScore = useCallback((goalId: number, score: number) => {
        setTodayScores((curr) => new Map(curr).set(goalId, score));
    }, []);

    const addGoal = useCallback(async (activity: string, baselineScore: number | null) => {
        if (!patientId) return;
        const goal = await addPatientGoal({ patientId, activity, baselineScore, createdVisitId: visitId });
        setGoals((curr) => [...curr, goal]);
        if (baselineScore !== null) setTodayScore(goal.id, baselineScore);
    }, [patientId, visitId, setTodayScore]);

    const retireGoal = useCallback(async (goalId: number, status: Exclude<GoalStatus, "active">) => {
        await retirePatientGoal(goalId, status);
        setGoals((curr) => curr.filter((g) => g.id !== goalId));
    }, []);

    const save = useCallback(async (vId: string, doctorId: string | null) => {
        if (!isStoryEmpty(story)) await saveVisitStory(vId, doctorId, story);
        for (const [goalId, score] of todayScores) {
            await saveGoalScore(vId, goalId, score);
        }
    }, [story, todayScores]);

    const reset = useCallback(() => {
        setStory(emptyStory());
        setGoals([]);
        setScoreHistory([]);
        setTodayScores(new Map());
        setError(null);
    }, []);

    return { story, setStory, loading, error, goals, lastScores, todayScores, setTodayScore, addGoal, retireGoal, save, reset };
}
