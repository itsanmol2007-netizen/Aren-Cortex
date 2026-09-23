// ---------------------------------------------------------------------------
// INTERVENTIONS — the Supabase boundary.
//
// `prescription_interventions` is the sibling of `prescription_exercises`:
// one row per intervention performed, with site/side as columns rather than
// prose. No `fetchLast*` counterpart — unlike an exercise dose, an
// intervention is never compared against last visit's, so nothing reads this
// table back yet. It exists so the record of what was actually DONE to the
// patient (which fracture, which side, cast or splint) survives as
// structured data rather than living only in `therapy_notes` prose — see
// features/consult/interventionPlan.ts for why that string was never enough.
// ---------------------------------------------------------------------------

import { supabase } from "../supabase";
import type { InterventionLine, InterventionSide } from "../../features/consult/interventionPlan";

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
        side: l.side,
        notes: l.notes.trim() || null,
        sort_order: i,
    }));
    const { error } = await supabase.from("prescription_interventions").insert(rows);
    if (error) throw new Error(`saveInterventionPlan: ${error.message}`);
}
