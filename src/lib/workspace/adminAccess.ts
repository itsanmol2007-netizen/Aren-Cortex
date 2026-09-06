// ---------------------------------------------------------------------------
// WHO GETS THE ADMIN SURFACE, AND IN WHICH SHAPE.
//
// Anmol, 2026-09-04: "if there is just one doctor and admin = 0, show the
// admin panel to doctor, with just single doctor config. If admin is not equal
// to zero then we will have admin page."
//
// Extended 2026-09-06 for "a doctor who is ALSO a clinic admin" (Alpha,
// Beta, Charlie — any number of whom can carry the flag at once): a second
// input, `isClinicAdminDoctor`, reads `doctors.is_clinic_admin` for the
// SIGNED-IN doctor specifically. It is additive to `dedicatedAdminCount`,
// never a replacement for it — a multi-doctor clinic with a real office
// manager (dedicatedAdminCount > 0) can still have one or more doctors
// individually flagged as admins; either fact alone is enough to earn
// "embedded".
//
// So this is not a permission flag anyone sets on THEMSELVES. It is DERIVED
// from facts the database already holds — the signed-in person's role,
// whether the clinic employs anybody whose job is administration, and
// whether THIS doctor personally carries admin authority — exactly the way
// `modeForClinic` derives Cortex vs Consult from `clinic_mode` rather than
// offering it as a switch. Rule 19: when two things must agree, make one read
// the other.
//
// ── The three answers, and why "embedded" exists
//
//   dedicated — the person IS a non-doctor admin/owner. Parallax is their
//               home — full multi-page suite, at sign-in, no `doctors` row.
//   embedded  — a DOCTOR with clinic-admin authority, whether because nobody
//               else does that job (dedicatedAdminCount === 0 — the de-facto
//               owner) or because they are individually flagged
//               `is_clinic_admin`. They stay in their own clinical workspace
//               — Overview grows a bench-management layer instead of
//               handing them a second, separate admin page. Anmol,
//               2026-09-06: "do not create a separate Parallax for them...
//               keep them on the same Overview page, but make the Overview
//               richer" — so, unlike the pre-2026-09-06 shape of this file,
//               "embedded" carries NO door into Parallax any more; whatever
//               Parallax capability a doctor-admin needs (medicines, plan,
//               permissions) stays Parallax-only and un-duplicated, per the
//               same brief.
//   none      — everyone else. A doctor with no admin authority of their own
//               at a clinic that HAS one (a dedicated admin, or another
//               doctor carrying the flag) does not get it: that job belongs
//               to someone else, and duplicating it into every doctor's
//               sidebar is what made the first attempt wrong.
//
// This file is pure — no React, no Supabase — so the rule can be reasoned
// about and tested without mounting anything. `useAdminAccess` supplies the
// inputs.
// ---------------------------------------------------------------------------

export type AdminAccess = "none" | "embedded" | "dedicated";

/** Roles whose job is running the clinic rather than consulting in it. */
const ADMIN_ROLES = new Set(["admin", "owner"]);

export function isAdminRole(role: string | null | undefined): boolean {
    return !!role && ADMIN_ROLES.has(role);
}

/**
 * @param role                  the signed-in user's `users.role`
 * @param dedicatedAdminCount   how many admin/owner users this clinic has
 * @param isClinicAdminDoctor   `doctors.is_clinic_admin` for THIS signed-in
 *                              doctor — irrelevant for any other role.
 */
export function resolveAdminAccess(
    role: string | null | undefined,
    dedicatedAdminCount: number,
    isClinicAdminDoctor = false
): AdminAccess {
    if (isAdminRole(role)) return "dedicated";

    // A doctor gets the richer Overview when either nobody else is doing the
    // admin job (the de-facto owner — flips to "none" on its own the moment a
    // clinic hires an office manager, no setting to remember to turn off) OR
    // this specific doctor has been individually flagged as a clinic admin,
    // which survives the clinic hiring a dedicated admin or having several
    // other doctors.
    if (role === "doctor" && (dedicatedAdminCount === 0 || isClinicAdminDoctor)) return "embedded";

    return "none";
}

/**
 * Whether this access level's home IS the full multi-page Parallax suite.
 *
 * Only `dedicated` (a non-doctor admin/owner) any more — 2026-09-06: an
 * `embedded` doctor-admin's home stays their own Overview, richer but never
 * a door into a second, separate admin page (see this file's header). Kept
 * as a named predicate rather than an inline `=== "dedicated"` at call
 * sites, since "which access levels open the full suite" is exactly the
 * kind of fact that should have one place to change again.
 */
export function canOpenFullSuite(access: AdminAccess): boolean {
    return access === "dedicated";
}
