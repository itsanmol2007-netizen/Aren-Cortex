import { supabase } from "../supabase";

// ═══════════════════════════════════════════════════════════════════════════
//  CARE PLANS — architecture layer
//
//  General OPD is a light consumer of this: a follow-up date and some advice
//  notes (both already captured on every prescription) covers most walk-in
//  visits. This exists so specialty tracks that actually need multi-visit
//  structure — physio session counts, chronic-disease review cadences — have
//  real schema and a working read/write path to build on, instead of a
//  rebuild later. Two generic progress shapes are supported and neither is
//  assumed: target_visit_count ("session 4 of 12") and target_date ("review
//  by <date>"). A plan can use either, both, or neither.
// ═══════════════════════════════════════════════════════════════════════════

export type CarePlanStatus = "active" | "closed";

export type CarePlan = {
    id: string;
    patient_id: string;
    doctor_id: string;
    hospital_id: string | null;
    goal: string;
    diagnosis: string | null;
    notes: string | null;
    target_visit_count: number | null;
    target_date: string | null;
    status: CarePlanStatus;
    created_at: string;
    updated_at: string;
    closed_at: string | null;
};

export type CarePlanWithProgress = CarePlan & {
    /** Completed visits linked to this plan so far. */
    linked_visit_count: number;
};

/** The patient's current plan, if any, with progress computed from linked visits. */
export async function fetchActiveCarePlan(patientId: string): Promise<CarePlanWithProgress | null> {
    const { data: plan, error } = await supabase
        .from("care_plans")
        .select("*")
        .eq("patient_id", patientId)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
    if (error) throw new Error(`fetchActiveCarePlan: ${error.message}`);
    if (!plan) return null;

    const { count, error: countErr } = await supabase
        .from("visits")
        .select("id", { count: "exact", head: true })
        .eq("care_plan_id", plan.id)
        .eq("status", "completed");
    if (countErr) throw new Error(`fetchActiveCarePlan (progress count): ${countErr.message}`);

    return { ...plan, linked_visit_count: count ?? 0 };
}

/** Full plan history for the patient (active + closed), newest first. */
export async function fetchCarePlanHistory(patientId: string): Promise<CarePlan[]> {
    const { data, error } = await supabase
        .from("care_plans")
        .select("*")
        .eq("patient_id", patientId)
        .order("created_at", { ascending: false });
    if (error) throw new Error(`fetchCarePlanHistory: ${error.message}`);
    return data ?? [];
}

export async function createCarePlan(opts: {
    patientId: string;
    doctorId: string;
    hospitalId?: string | null;
    goal: string;
    diagnosis?: string | null;
    notes?: string | null;
    targetVisitCount?: number | null;
    targetDate?: string | null;
}): Promise<CarePlan> {
    const { data, error } = await supabase
        .from("care_plans")
        .insert({
            patient_id: opts.patientId,
            doctor_id: opts.doctorId,
            hospital_id: opts.hospitalId ?? null,
            goal: opts.goal,
            diagnosis: opts.diagnosis ?? null,
            notes: opts.notes ?? null,
            target_visit_count: opts.targetVisitCount ?? null,
            target_date: opts.targetDate ?? null,
        })
        .select("*")
        .single();
    if (error) throw new Error(`createCarePlan: ${error.message}`);
    return data;
}

export async function closeCarePlan(planId: string): Promise<void> {
    const { error } = await supabase
        .from("care_plans")
        .update({ status: "closed", closed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", planId);
    if (error) throw new Error(`closeCarePlan: ${error.message}`);
}

/**
 * Stamps a newly-created visit onto the patient's active plan, if one
 * exists, so it counts toward progress without the doctor doing anything
 * extra. Best-effort by design (mirrors runLearningLoop / logVisitMeasurements)
 * — a doctor starting a consult must never be blocked by this.
 */
export async function linkVisitToActivePlan(visitId: string, patientId: string): Promise<void> {
    const { data: plan, error: planErr } = await supabase
        .from("care_plans")
        .select("id")
        .eq("patient_id", patientId)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
    if (planErr) throw new Error(`linkVisitToActivePlan (lookup): ${planErr.message}`);
    if (!plan) return;

    const { error } = await supabase.from("visits").update({ care_plan_id: plan.id }).eq("id", visitId);
    if (error) throw new Error(`linkVisitToActivePlan: ${error.message}`);
}
