// ---------------------------------------------------------------------------
// ONE DOCTOR'S WORKSPACE, AND IT IS CALLED CORTEX.
//
// 2026-09-11 — Anmol, closing a question that had been open for months: the
// Cortex/Consult split is retired. There is no second product. Everything a
// doctor stands in is AREN Cortex; the front desk is Front Desk; the admin
// suite is Parallax. Three names for three genuinely different jobs, instead
// of four for three.
//
// ── Why the split had to go ────────────────────────────────────────────────
// "Consult" was never a different product, only a different STARTING POINT:
// a clinic with reception hands the doctor a prepared patient, a solo doctor
// types the patient in themselves. But the screen, the engine, the plan, the
// prescription, the save path — all identical. The difference was already
// handled where it actually lives, and handled well:
//
//   - Somebody waiting → the doctor gets the queue.
//   - Nobody waiting → the doctor gets the patient registration form.
//
// That is the SAME rule for every clinic. A solo practice just never has
// anyone in its queue, so it only ever sees the second half — which is not a
// different product, it is the same product with an empty queue. Carrying a
// second product name for that cost two headers, two taglines, a brand
// lookup table and a recurring class of bug where one surface said "Cortex"
// while the surface two inches above it said "Consult".
//
// ── What replaced it ───────────────────────────────────────────────────────
// The clinic fact is still read, still derived, still never chosen by a
// doctor — `hospitals.clinic_mode` (`'solo' | 'solo_reception' |
// 'multi_doctor'`, see docs/Login Screen Implementation.md and
// admin-panel/ADMIN-PANEL-INTEGRATION.md §4a). It just answers a smaller,
// honest question now: **does somebody else do intake here?** That single
// boolean gates a queue, a "Complete & Next" button and a handful of
// Overview tiles. It does not name a product, because there is only one.
//
// The safe default is unchanged and still deliberate: anything unrecognised
// — a null column, a `clinic_mode` value added after this build — answers
// "no front desk", the shape that needs nothing else to exist. Showing a
// queue to a clinic with no receptionist would give a doctor an empty room
// and no way to start.
// ---------------------------------------------------------------------------

/**
 * The clinic shapes that mean "somebody else does intake".
 *
 * `solo_reception` — one doctor, one receptionist.
 * `multi_doctor`   — several doctors behind one front desk.
 *
 * Both hand the doctor a prepared patient. They differ in how the QUEUE is
 * filtered (see `useConsultQueue`), not in what the doctor is running.
 */
const FRONT_DESK_SHAPES = new Set(["solo_reception", "multi_doctor"]);

/** True when somebody other than the doctor does patient intake here. */
export function hasFrontDesk(clinicMode: string | null | undefined): boolean {
    return Boolean(clinicMode && FRONT_DESK_SHAPES.has(clinicMode));
}

/** True when the clinic runs more than one doctor behind the same front desk. */
export function isMultiDoctor(clinicMode: string | null | undefined): boolean {
    return clinicMode === "multi_doctor";
}

export interface Brand {
    /** the word after "AREN" in every header */
    product: string;
    /** the line under it — what this workspace IS, in three or four words */
    tagline: string;
    /** the workspace identity subtitle beside a page title */
    context: string;
}

/**
 * The doctor's workspace, named once.
 *
 * This used to be a `Record<WorkspaceMode, Brand>` with a second entry for
 * Consult. It is a plain object now precisely because there is nothing left
 * to look up — and that is the point: a constant cannot disagree with the
 * header two inches above it the way the lookup repeatedly did.
 */
export const CORTEX_BRAND: Brand = {
    product: "Cortex",
    tagline: "Clinical workspace",
    context: "Consultation workspace",
};

// ── The admin workspace ────────────────────────────────────────────────────
//
// Named here and NOWHERE else. Anmol, 2026-09-04: "just don't hardcode it in
// code, so that it can be editable later, from just one single source of
// truth." Renaming the product is this object and nothing else — no string
// search, no missed header, no stale page title.
//
// "Parallax": measuring something by comparing the same subject from two
// viewpoints. That is exactly what the admin surface does — this period
// against the one before it, this bench against that one — so the name
// describes the product rather than decorating it. (Alternate on record if
// this is ever changed: "Azimuth".)
export const ADMIN_BRAND: Brand = {
    product: "Parallax",
    tagline: "Clinic administration",
    context: "Practice management",
};

// ── Clinic shape labels ────────────────────────────────────────────────────
//
// Display only. `hospitals.clinic_mode` keeps its stored values (`solo`,
// `solo_reception`, `multi_doctor`) — renaming a live enum would be a
// migration plus every read site for no user-visible gain, so the human words
// live here instead. Anmol, 2026-09-04: these are internal vocabulary, NOT a
// subscription ladder. The plans are their own thing: **AREN Polaris** for a
// single-doctor clinic and **AREN Constellation** for a multi-doctor one
// (`plans.code`, never a label — see lib/db/subscriptions.ts).
export const SHAPE_LABEL: Record<string, string> = {
    solo: "Solo practice",
    solo_reception: "Single bench, front desk",
    multi_doctor: "Multi-bench clinic",
    managed: "Managed clinic",
};

/**
 * `managed` is not a stored shape at all. It is DERIVED — a clinic with at
 * least one admin/owner user — which is why it cannot be a row in the same
 * enum: the same `multi_doctor` clinic is "managed" the day it hires an
 * office manager and "unmanaged" the day that person leaves, with no
 * migration in between. See `adminAccess.ts`.
 */
export function shapeLabel(clinicMode: string | null | undefined, hasDedicatedAdmin: boolean): string {
    if (hasDedicatedAdmin) return SHAPE_LABEL.managed;
    return (clinicMode && SHAPE_LABEL[clinicMode]) || "Clinic";
}
