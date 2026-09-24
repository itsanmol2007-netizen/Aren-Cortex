// ---------------------------------------------------------------------------
// ASSESSMENTS — the Supabase boundary for structured assessment lines.
//
// `prescription_assessments` holds one row per assessment-at-a-site. The
// same composed text is also saved in the prescription's plain diagnosis
// list (see features/consult/assessmentPlan.ts), so this table is additive:
// nothing that reads diagnoses today depends on it.
// ---------------------------------------------------------------------------

import { supabase } from "../supabase";
import { clinicalSiteLabel } from "../body/clinicalSite";
import type { AssessmentLine } from "../../features/consult/assessmentPlan";

/** Write this visit's structured assessments. Called once, from the consult save. */
export async function saveAssessmentPlan(prescriptionId: string, lines: AssessmentLine[]): Promise<void> {
    if (lines.length === 0) return;
    const rows = lines.map((l, i) => ({
        prescription_id: prescriptionId,
        intent_id: l.intentId,
        label: l.label,
        family: l.family,
        region: l.site?.region ?? null,
        side: l.site?.side ?? null,
        aspect: l.site?.aspect ?? null,
        site_label: l.site ? clinicalSiteLabel(l.site) : null,
        details: l.details,
        text: l.text,
        sort_order: i,
    }));
    const { error } = await supabase.from("prescription_assessments").insert(rows);
    if (error) throw new Error(`saveAssessmentPlan: ${error.message}`);
}
