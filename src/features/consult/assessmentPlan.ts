// ---------------------------------------------------------------------------
// ASSESSMENT LINES — an assessment at a site, with its details.
//
// Sits BESIDE the visit's plain `diagnoses: string[]`, never instead of it.
// Each line's `text` is also a member of `diagnoses`, so print, review, the
// saved diagnosis column and every older build keep reading one list of
// strings exactly as before. The line is the structure behind that string:
// which catalogue assessment, where, and what was added about it — what
// lets "Fracture — Left knee" and "Fracture — Right wrist" be two separate,
// editable entries under one ranked "Fracture".
// ---------------------------------------------------------------------------

import type { SiteRef } from "../../lib/body/clinicalSite";
import type { AssessmentDetails } from "./assessmentFamilies";

export interface AssessmentLine {
    id: string;
    intentId: number | null;
    /** the catalogue name — "Fracture" */
    label: string;
    family: string;
    site: SiteRef | null;
    details: AssessmentDetails;
    /** the composed line — "Fracture — Left knee, open, displaced" */
    text: string;
}
