// ---------------------------------------------------------------------------
// VISIT STATUS — one categorisation, shared everywhere the Patients page
// reads a raw `visits.status` string. Added 2026-08-23.
//
// Real values seen in production (`visits.status`, no DB constraint,
// verified live against Ekanki's data): serving, completed, discarded,
// waiting, draft. Before this file, "Today's Patients"/"All Patients" only
// ever tested for the active set and fell everything else through to
// "Completed" — which is wrong for `waiting`/`draft`, a patient who has not
// been seen yet is not done. Rule 19 (aren-cortex-context.md): a category
// this many components each re-derive independently is a category that goes
// out of sync the first time one of them is edited and the others aren't.
// ---------------------------------------------------------------------------

export type VisitStatusKind = "active" | "waiting" | "done" | "inactive";

export function visitStatusKind(status: string): VisitStatusKind {
    if (status === "serving" || status === "active" || status === "in_progress") return "active";
    if (status === "waiting" || status === "draft") return "waiting";
    if (status === "inactive" || status === "cancelled" || status === "discarded") return "inactive";
    // "completed", and anything unrecognised — defaulting to "done" rather
    // than silently miscategorising a status this file doesn't know about
    // yet is the same choice the code already made before this file existed.
    return "done";
}

export const VISIT_STATUS_LABEL: Record<VisitStatusKind, string> = {
    active: "Active",
    waiting: "Waiting",
    done: "Completed",
    inactive: "Inactive",
};

/**
 * "Prescription" / "Exercise Plan" / "Examination" / "Consultation" — the
 * visit-type badge shown on the Visit Timeline and in Compare Visits.
 * Was PatientRecord.tsx's own inline `hasMeds ? "Prescription" : hasFindings
 * ? "Examination" : "Consultation"`, duplicated a second time verbatim in
 * CompareVisitsModal — pulled out per rule 19 rather than let the two drift.
 * Structural type, not `RealVisit`, so this file (imported by lib/db/patients.ts)
 * doesn't import back from it.
 *
 * Exercises are checked before findings/added 2026-08-23 alongside the
 * `exercise_names` wiring itself: a physio visit with exercises prescribed
 * but no formal "finding" recorded was reading as generic "Consultation",
 * exactly the kind of visit the physio account has the most of.
 */
export function visitTypeLabel(v: {
    medicines: unknown[];
    exercise_names: string[];
    findings: unknown[];
}): string {
    if (v.medicines.length > 0) return "Prescription";
    if (v.exercise_names.length > 0) return "Exercise Plan";
    if (v.findings.length > 0) return "Examination";
    return "Consultation";
}
