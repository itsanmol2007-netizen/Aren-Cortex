// ---------------------------------------------------------------------------
// CARE PLANS — the trajectory that spans visits, rather than today's plan.
//
// `cortex-longitudinal-spec.md` §3.3: "A single visit's plan is a snapshot of
// today. A care plan is a trajectory that spans visits and gets adjusted
// rather than re-derived each time." Physiotherapy's twelve-session protocol,
// cardiology's beta-blocker titration, dentistry's root canal across three
// appointments.
//
// ── The table already existed
//
// `care_plans` and `visits.care_plan_id` were found in the live database on
// 2026-08-16, correctly shaped and completely unused — no code in `master`
// referenced either. They were almost certainly left by the session on the
// abandoned `claude/aren-cortex-prescription-flow-adsyky` branch. The columns
// match what the spec asks for, so they are adopted rather than replaced.
//
// ⚠ RLS: the table shipped with row level security ENABLED AND ZERO POLICIES,
// which in Postgres means every read and write is denied — silently, as an
// empty result rather than an error, for reads. A policy matching
// `patient_conditions`' posture is required before any of this works. See the
// atlas entry for this session.
//
// ── Why status is only 'active' | 'closed'
//
// The database's own CHECK constraint says so, and this file states the two
// literals in one place for the same reason `DB_SOURCE` exists in synapse.ts:
// §14.21 lost an entire feature's worth of writes to a CHECK constraint
// rejecting a value the UI had invented, silently, because the write was
// fire-and-forget. Nothing here is fire-and-forget, and nothing here invents a
// status.
//
// "Abandoned" is deliberately NOT a third status. The spec's §6 asks that a
// plan be "editable and closable without leaving a stale 'session 4 of 12'
// showing forever" — closing covers both the finished course and the
// abandoned one, and the difference between them is what `notes` is for. A
// status the doctor has to choose between is a decision the software made them
// make for its own benefit.
// ---------------------------------------------------------------------------

import { supabase } from "../supabase";

export type CarePlanStatus = "active" | "closed";

export type CarePlan = {
    id: string;
    patient_id: string;
    doctor_id: string;
    hospital_id: string | null;
    /** what this course is for, in the doctor's words — "Restore knee function" */
    goal: string;
    /** optional clinical anchor — "Post ACL reconstruction (R)" */
    diagnosis: string | null;
    notes: string | null;
    /** the "of 12" in "session 4 of 12". Null for an open-ended plan. */
    target_visit_count: number | null;
    /** an end DATE instead of a count, for plans measured in time */
    target_date: string | null;
    status: CarePlanStatus;
    created_at: string;
    updated_at: string;
    closed_at: string | null;
};

/**
 * The patient's current plan, or null.
 *
 * One active plan per patient is the assumption, and it is deliberate rather
 * than enforced: the spec asks for "a small persistent object attached to the
 * patient", singular, and a doctor juggling two concurrent courses for one
 * patient is a case worth seeing in the wild before designing for. If two
 * somehow exist, the most recent wins and the older one is left untouched
 * rather than quietly closed.
 */
export async function fetchActiveCarePlan(patientId: string): Promise<CarePlan | null> {
    const { data, error } = await supabase
        .from("care_plans")
        .select("*")
        .eq("patient_id", patientId)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
    if (error) throw new Error(`fetchActiveCarePlan: ${error.message}`);
    return (data as CarePlan | null) ?? null;
}

export async function createCarePlan(args: {
    patientId: string;
    doctorId: string;
    hospitalId: string | null;
    goal: string;
    diagnosis?: string | null;
    targetVisitCount?: number | null;
    targetDate?: string | null;
    notes?: string | null;
}): Promise<CarePlan> {
    const { data, error } = await supabase
        .from("care_plans")
        .insert({
            patient_id: args.patientId,
            doctor_id: args.doctorId,
            // Set even though the RLS policy isolates through `patients`, so
            // the row carries its own tenancy for anything that later wants to
            // read it hospital-first. Nullable in the schema; §14.13's
            // prescriptions bug was the opposite case — a NOT NULL-ish policy
            // check against a column nobody set — so this is set on purpose.
            hospital_id: args.hospitalId,
            goal: args.goal,
            diagnosis: args.diagnosis ?? null,
            target_visit_count: args.targetVisitCount ?? null,
            target_date: args.targetDate ?? null,
            notes: args.notes ?? null,
            status: "active",
        })
        .select("*")
        .single();
    if (error) throw new Error(`createCarePlan: ${error.message}`);
    return data as CarePlan;
}

export async function updateCarePlan(
    id: string,
    patch: Partial<Pick<CarePlan, "goal" | "diagnosis" | "notes" | "target_visit_count" | "target_date">>,
): Promise<CarePlan> {
    const { data, error } = await supabase
        .from("care_plans")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select("*")
        .single();
    if (error) throw new Error(`updateCarePlan: ${error.message}`);
    return data as CarePlan;
}

/**
 * Close a plan. This is the whole answer to the spec's "care plan drift" case
 * — a doctor may abandon or change a plan mid-course, and a stale "session 4
 * of 12" showing forever is worse than no plan at all.
 */
export async function closeCarePlan(id: string): Promise<void> {
    const now = new Date().toISOString();
    const { error } = await supabase
        .from("care_plans")
        .update({ status: "closed", closed_at: now, updated_at: now })
        .eq("id", id);
    if (error) throw new Error(`closeCarePlan: ${error.message}`);
}

/**
 * Attach a visit to the plan it belongs to. Called once, when a consult is
 * saved, so that "session 4" counts the visits that were actually part of the
 * course rather than every visit the patient has ever made — a physiotherapy
 * patient who comes in with a fever mid-course has had a visit, not a session.
 *
 * Fire-and-forget at the call site is NOT acceptable here for the reason the
 * atlas's trap list gives: this write sits behind a foreign key, and a failure
 * that nobody surfaces means a session that silently never counted.
 */
export async function linkVisitToCarePlan(visitId: string, carePlanId: string): Promise<void> {
    const { error } = await supabase
        .from("visits")
        .update({ care_plan_id: carePlanId })
        .eq("id", visitId);
    if (error) throw new Error(`linkVisitToCarePlan: ${error.message}`);
}

/**
 * Which of this patient's visits belong to a given plan, oldest first.
 *
 * This is what turns a plan into "session 4 of 12" and what numbers the chips
 * in the header. Reading the visits rather than keeping a counter on the plan
 * is deliberate: a counter is a second copy of a fact the visits already hold,
 * and it goes wrong the first time a visit is deleted or reassigned.
 */
export async function fetchCarePlanVisitIds(carePlanId: string): Promise<string[]> {
    const { data, error } = await supabase
        .from("visits")
        .select("id, created_at")
        .eq("care_plan_id", carePlanId)
        .eq("status", "completed")
        .order("created_at", { ascending: true });
    if (error) throw new Error(`fetchCarePlanVisitIds: ${error.message}`);
    return (data ?? []).map((v: { id: string }) => v.id);
}
