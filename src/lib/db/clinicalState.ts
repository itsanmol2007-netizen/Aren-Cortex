// ---------------------------------------------------------------------------
// CLINICAL STATE — record what an earlier assessment or plan is doing now.
//
// Append-only (`clinical_state_events`, migration 20260926): marking a
// fracture "Clinically united" or deferring a check X-ray adds an event and
// never edits the visit that recorded it. The latest event per target is its
// state. Vocabulary: docs/clinical-state-vocabulary.md.
// ---------------------------------------------------------------------------

import { supabase } from "../supabase";

export type ConditionStatus =
    | "active" | "healing" | "improving" | "clinically_united" | "radiologically_united"
    | "resolved" | "remission" | "recurred";

export type PlanStatus = "deferred" | "cancelled";

/** How each state reads on screen. */
export const STATUS_LABEL: Record<ConditionStatus | PlanStatus, string> = {
    active: "Active",
    healing: "Healing",
    improving: "Improving",
    clinically_united: "Clinically united",
    radiologically_united: "Radiologically united",
    resolved: "Resolved",
    remission: "In remission",
    recurred: "Recurred",
    deferred: "Deferred",
    cancelled: "Cancelled",
};

/** States that close a condition: it leaves Ongoing Care. */
export const CLOSED_STATUSES = new Set<ConditionStatus>(["resolved", "radiologically_united", "remission"]);

export async function recordStateEvent(e: {
    patientId: string;
    visitId: string | null;
    assessmentId?: string;
    interventionId?: string;
    status: ConditionStatus | PlanStatus;
    dueDate?: string | null;
}): Promise<void> {
    const { error } = await supabase.from("clinical_state_events").insert({
        patient_id: e.patientId,
        visit_id: e.visitId,
        assessment_id: e.assessmentId ?? null,
        intervention_id: e.interventionId ?? null,
        status: e.status,
        due_date: e.dueDate ?? null,
    });
    if (error) throw new Error(`clinical_state_events: ${error.message}`);
}

export interface StateEvent {
    status: ConditionStatus | PlanStatus;
    dueDate: string | null;
    at: string;
}

/** The latest event per assessment and per intervention, for the given ids. */
export async function latestStates(assessmentIds: string[], interventionIds: string[]): Promise<{
    byAssessment: Map<string, StateEvent>;
    byIntervention: Map<string, StateEvent>;
}> {
    const byAssessment = new Map<string, StateEvent>();
    const byIntervention = new Map<string, StateEvent>();
    const [a, i] = await Promise.all([
        assessmentIds.length
            ? supabase.from("clinical_state_events").select("assessment_id, status, due_date, created_at").in("assessment_id", assessmentIds).order("created_at", { ascending: true })
            : Promise.resolve({ data: [] as any[] }),
        interventionIds.length
            ? supabase.from("clinical_state_events").select("intervention_id, status, due_date, created_at").in("intervention_id", interventionIds).order("created_at", { ascending: true })
            : Promise.resolve({ data: [] as any[] }),
    ]);
    // Ascending, so the last write per id is the latest.
    for (const r of (a.data ?? []) as any[]) byAssessment.set(r.assessment_id, { status: r.status, dueDate: r.due_date, at: r.created_at });
    for (const r of (i.data ?? []) as any[]) byIntervention.set(r.intervention_id, { status: r.status, dueDate: r.due_date, at: r.created_at });
    return { byAssessment, byIntervention };
}

/**
 * An investigation's result, recorded ON its order ("X-ray right wrist:
 * displaced distal radius fracture…") from the visit that read it. The order
 * belongs to an earlier visit; the result and the reading visit go on the
 * same row, so the order and its outcome are never two records.
 */
export async function recordInvestigationResult(orderId: string, text: string, visitId: string | null): Promise<void> {
    const { error } = await supabase
        .from("diagnostic_orders")
        .update({ result_text: text, result_at: new Date().toISOString(), result_visit_id: visitId, status: "completed" })
        .eq("id", orderId);
    if (error) throw new Error(`diagnostic_orders result: ${error.message}`);
}
