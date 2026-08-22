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
