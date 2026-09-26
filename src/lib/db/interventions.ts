// ---------------------------------------------------------------------------
// INTERVENTIONS — the Supabase boundary.
//
// `prescription_interventions` is the sibling of `prescription_exercises`:
// one row per intervention performed, with site/side as columns rather than
// prose. Read back only by `fetchEarlierInterventions`, so a removal can point
// at the cast or sutures it removes. It exists so the record of what was actually DONE to the
// patient (which fracture, which side, cast or splint) survives as
// structured data rather than living only in `therapy_notes` prose — see
// features/consult/interventionPlan.ts for why that string was never enough.
// ---------------------------------------------------------------------------

import { supabase } from "../supabase";
import type { InterventionLine, InterventionSide } from "../../features/consult/interventionPlan";
import type { AssessmentDetails } from "../../features/consult/assessmentFamilies";
import { normalizeSite, type SiteRef } from "../body/clinicalSite";

export type DBInterventionRow = {
    intent_id: number | null;
    label: string;
    site: string | null;
    side: InterventionSide | null;
    notes: string | null;
    sort_order: number | null;
};

/**
 * Write this visit's interventions. Called once, from the consult save —
 * same non-fire-and-forget rule as `saveExercisePlan`: a silently-failed
 * write is a procedure the record does not show was ever done.
 */
export async function saveInterventionPlan(
    prescriptionId: string,
    lines: InterventionLine[],
): Promise<void> {
    if (lines.length === 0) return;
    const rows = lines.map((l, i) => ({
        prescription_id: prescriptionId,
        intent_id: l.intentId,
        label: l.label,
        site: l.site.trim() || null,
        side: l.side ?? (l.siteRef?.side ?? null),
        notes: l.notes.trim() || null,
        sort_order: i,
        family: l.family ?? null,
        region: l.siteRef?.region ?? null,
        aspect: l.siteRef?.aspect ?? null,
        details: l.details ?? {},
        text: l.text ?? null,
        status: l.status ?? "performed",
        due_date: l.dueDate ?? null,
        assessment_text: l.assessmentText ?? null,
        removes_id: l.removesId ?? null,
        fulfils_id: l.fulfilsId ?? null,
    }));
    const { error } = await supabase.from("prescription_interventions").insert(rows);
    if (error) throw new Error(`saveInterventionPlan: ${error.message}`);
}

/** One earlier intervention a removal or change can point back at. */
export interface EarlierIntervention {
    id: string;
    family: string;
    text: string;
    siteRef: SiteRef | null;
    details: AssessmentDetails;
    /** when it was done — "12 Aug" */
    when: string;
    createdAt: string;
}

/**
 * This patient's earlier configured interventions that nothing has removed
 * yet — what "Cast removal" or "Dressing change" offers to pick. A failed
 * read returns [] (offline, say): the removal still works, just unlinked.
 */
export async function fetchEarlierInterventions(patientId: string): Promise<EarlierIntervention[]> {
    const { data, error } = await supabase
        .from("prescription_interventions")
        .select("id, family, label, text, site, region, side, aspect, details, created_at, removes_id, prescriptions!inner(visits!inner(patient_id))")
        .eq("prescriptions.visits.patient_id", patientId)
        .eq("status", "performed")
        .not("family", "is", null)
        .order("created_at", { ascending: false })
        .limit(60);
    if (error || !data) {
        if (error) console.warn("fetchEarlierInterventions:", error.message);
        return [];
    }
    const removed = new Set(data.map((r: any) => r.removes_id).filter(Boolean));
    return data
        .filter((r: any) => !removed.has(r.id))
        .map((r: any) => ({
            id: r.id,
            family: r.family,
            text: r.text ?? r.label,
            siteRef: r.region ? normalizeSite({ region: r.region, side: r.side === "left" || r.side === "right" || r.side === "both" ? r.side : null, aspect: r.aspect ?? "front" }) : null,
            details: r.details ?? {},
            when: new Date(r.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
            createdAt: r.created_at,
        }));
}

/** A planned intervention from an earlier visit, not yet performed. */
export interface PlannedIntervention extends EarlierIntervention {
    intentId: number | null;
    label: string;
    dueDate: string | null;
}

/**
 * What an earlier visit planned for this patient and nobody has performed
 * yet — "Suture removal, due 3 Oct" — so this visit can mark it done in
 * one click. Offline or on error: [] (nothing is lost, it just waits).
 */
export async function fetchPlannedInterventions(patientId: string): Promise<PlannedIntervention[]> {
    const { data, error } = await supabase
        .from("prescription_interventions")
        .select("id, intent_id, family, label, text, region, side, aspect, details, created_at, due_date, status, prescriptions!inner(visits!inner(patient_id))")
        .eq("prescriptions.visits.patient_id", patientId)
        .eq("status", "planned")
        .order("due_date", { ascending: true })
        .limit(40);
    if (error || !data) {
        if (error) console.warn("fetchPlannedInterventions:", error.message);
        return [];
    }
    const ids = data.map((r: any) => r.id);
    if (ids.length === 0) return [];
    const { data: done } = await supabase
        .from("prescription_interventions")
        .select("fulfils_id")
        .in("fulfils_id", ids);
    const fulfilled = new Set((done ?? []).map((r: any) => r.fulfils_id));
    return data
        .filter((r: any) => !fulfilled.has(r.id))
        .map((r: any) => ({
            id: r.id,
            intentId: r.intent_id,
            label: r.label,
            family: r.family,
            text: r.text ?? r.label,
            siteRef: r.region ? normalizeSite({ region: r.region, side: r.side === "left" || r.side === "right" || r.side === "both" ? r.side : null, aspect: r.aspect ?? "front" }) : null,
            details: r.details ?? {},
            when: new Date(r.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
            createdAt: r.created_at,
            dueDate: r.due_date,
        }));
}
