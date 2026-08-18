// ---------------------------------------------------------------------------
// STORY + GOALS — the Supabase boundary for physiotherapy's Subjective half.
//
// Same shape as `lib/db/bodySites.ts` and `lib/db/carePlans.ts`: plain
// RLS-scoped table access, nothing here touches a storage secret. See
// `docs/Cortex Specialties/physiotherapy-phase-1-plan.md` §4 for the schema
// and the reasoning behind the three-table split — `visit_story` is one row
// per visit, `patient_goals` outlives the visit that created it (same shape
// as `care_plans`), `visit_goal_scores` is what turns a goal into a trend.
//
// Nothing here is fire-and-forget (§14.21's lesson: a CHECK-constraint
// rejection on a fire-and-forget write is a silent data outage). Every
// function throws on error; the caller (`useConsultLifecycle`) decides
// whether that throw is allowed to reach the doctor — see that file for why
// it is caught rather than propagated once the visit is already committed.
// ---------------------------------------------------------------------------

import { supabase } from "../supabase";
import type { Story, StoryDuration, StoryOnsetMode, StoryIrritability, StorySettling } from "../../features/consult/story";
import { emptyStory } from "../../features/consult/story";

// ── visit_story ──────────────────────────────────────────────────────────

interface VisitStoryRow {
    visit_id: string;
    duration: string | null;
    onset_mode: string | null;
    mechanism: string | null;
    irritability: string | null;
    settling: string | null;
    aggravating: string[];
    easing: string[];
    pattern: string[];
    tolerance: string | null;
    note: string | null;
}

function fromRow(r: VisitStoryRow): Story {
    return {
        duration: r.duration as StoryDuration | null,
        onsetMode: r.onset_mode as StoryOnsetMode | null,
        mechanism: r.mechanism ?? "",
        irritability: r.irritability as StoryIrritability | null,
        settling: r.settling as StorySettling | null,
        aggravating: r.aggravating ?? [],
        easing: r.easing ?? [],
        pattern: r.pattern ?? [],
        tolerance: r.tolerance ?? "",
        note: r.note ?? "",
    };
}

/** `null` for a visit with no story recorded yet — the common case on open. */
export async function fetchVisitStory(visitId: string): Promise<Story | null> {
    const { data, error } = await supabase
        .from("visit_story")
        .select("*")
        .eq("visit_id", visitId)
        .maybeSingle();
    if (error) throw new Error(`fetchVisitStory: ${error.message}`);
    return data ? fromRow(data as VisitStoryRow) : null;
}

/**
 * One upsert, called on save. `isStoryEmpty` is the caller's job (see
 * `useConsultLifecycle`) — an untouched Story is not written at all, so a
 * general OPD visit or a physiotherapy visit where nothing was entered
 * leaves no row, same as `visit_body_sites` leaves no row for an unmarked
 * site.
 */
export async function saveVisitStory(
    visitId: string, doctorId: string | null, story: Story
): Promise<void> {
    const { error } = await supabase.from("visit_story").upsert({
        visit_id: visitId,
        duration: story.duration,
        onset_mode: story.onsetMode,
        mechanism: story.mechanism.trim() || null,
        irritability: story.irritability,
        settling: story.settling,
        aggravating: story.aggravating,
        easing: story.easing,
        pattern: story.pattern,
        tolerance: story.tolerance.trim() || null,
        note: story.note.trim() || null,
        created_by_doctor_id: doctorId,
        updated_at: new Date().toISOString(),
    }, { onConflict: "visit_id" });
    if (error) throw new Error(`saveVisitStory: ${error.message}`);
}

// ── patient_goals + visit_goal_scores ───────────────────────────────────────

export type GoalStatus = "active" | "achieved" | "abandoned";

export interface PatientGoal {
    id: number;
    patientId: string;
    /** the patient's own words */
    activity: string;
    baselineScore: number | null;
    status: GoalStatus;
    createdVisitId: string | null;
    createdAt: string;
    closedAt: string | null;
}

function goalFromRow(r: {
    id: number; patient_id: string; activity: string; baseline_score: number | null;
    status: string; created_visit_id: string | null; created_at: string; closed_at: string | null;
}): PatientGoal {
    return {
        id: r.id, patientId: r.patient_id, activity: r.activity,
        baselineScore: r.baseline_score, status: r.status as GoalStatus,
        createdVisitId: r.created_visit_id, createdAt: r.created_at, closedAt: r.closed_at,
    };
}

/** Active goals only — same "active filters, retired is history" shape as `patient_conditions`. */
export async function fetchActivePatientGoals(patientId: string): Promise<PatientGoal[]> {
    const { data, error } = await supabase
        .from("patient_goals")
        .select("*")
        .eq("patient_id", patientId)
        .eq("status", "active")
        .order("created_at", { ascending: true });
    if (error) throw new Error(`fetchActivePatientGoals: ${error.message}`);
    return (data ?? []).map(goalFromRow);
}

export async function addPatientGoal(args: {
    patientId: string; activity: string; baselineScore: number | null; createdVisitId: string | null;
}): Promise<PatientGoal> {
    const { data, error } = await supabase
        .from("patient_goals")
        .insert({
            patient_id: args.patientId, activity: args.activity,
            baseline_score: args.baselineScore, created_visit_id: args.createdVisitId,
        })
        .select("*")
        .single();
    if (error) throw new Error(`addPatientGoal: ${error.message}`);
    return goalFromRow(data);
}

/**
 * Not a delete — same reasoning as `retirePatientCondition` (§14.26). A goal
 * marked achieved or abandoned is a fact about the patient's course, kept
 * as history rather than destroyed; it just stops being offered for
 * re-scoring on the next visit.
 */
export async function retirePatientGoal(goalId: number, status: "achieved" | "abandoned"): Promise<void> {
    const { error } = await supabase
        .from("patient_goals")
        .update({ status, closed_at: new Date().toISOString() })
        .eq("id", goalId)
        .eq("status", "active");
    if (error) throw new Error(`retirePatientGoal: ${error.message}`);
}

export interface GoalScore {
    goalId: number;
    visitId: string;
    score: number;
    createdAt: string;
}

/**
 * Every score, every visit, for every active-or-not goal this patient has —
 * oldest first, mirroring `fetchPatientVisits`. The caller derives "latest
 * before today" per goal rather than this function pre-aggregating, same
 * division of labour `trend.ts` already draws with raw visit rows.
 */
export async function fetchGoalScoreHistory(patientId: string): Promise<GoalScore[]> {
    const { data, error } = await supabase
        .from("visit_goal_scores")
        .select("goal_id, visit_id, score, created_at, patient_goals!inner(patient_id)")
        .eq("patient_goals.patient_id", patientId)
        .order("created_at", { ascending: true });
    if (error) throw new Error(`fetchGoalScoreHistory: ${error.message}`);
    return (data ?? []).map((r: { goal_id: number; visit_id: string; score: number; created_at: string }) => ({
        goalId: r.goal_id, visitId: r.visit_id, score: r.score, createdAt: r.created_at,
    }));
}

export async function saveGoalScore(visitId: string, goalId: number, score: number): Promise<void> {
    const { error } = await supabase
        .from("visit_goal_scores")
        .upsert({ visit_id: visitId, goal_id: goalId, score }, { onConflict: "visit_id,goal_id" });
    if (error) throw new Error(`saveGoalScore: ${error.message}`);
}

export { emptyStory };
