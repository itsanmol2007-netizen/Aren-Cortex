// ---------------------------------------------------------------------------
// WHO GETS THE ADMIN SURFACE, AND IN WHICH SHAPE.
//
// Anmol, 2026-09-04: "if there is just one doctor and admin = 0, show the
// admin panel to doctor, with just single doctor config. If admin is not equal
// to zero then we will have admin page."
//
// So this is not a permission flag anyone sets. It is DERIVED from two facts
// the database already holds — the signed-in person's role, and whether the
// clinic employs anybody whose job is administration — exactly the way
// `modeForClinic` derives Cortex vs Consult from `clinic_mode` rather than
// offering it as a switch. Rule 19: when two things must agree, make one read
// the other.
//
// ── The three answers, and why "embedded" exists
//
//   dedicated — the person IS an admin. They get the full multi-page suite.
//   embedded  — a doctor at a clinic with NO admin on staff. They are the
//               de-facto owner, so they get a summarised version inside their
//               clinical sidebar, plus a door into the full suite on the same
//               session. No second login, no role change.
//   none      — everyone else. A doctor at a clinic that HAS an admin does not
//               get it: that job belongs to someone, and duplicating it into
//               the consult sidebar is what made the first attempt wrong.
//
// This file is pure — no React, no Supabase — so the rule can be reasoned
// about and tested without mounting anything. `useAdminAccess` supplies the
// two inputs.
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
 */
export function resolveAdminAccess(
    role: string | null | undefined,
    dedicatedAdminCount: number
): AdminAccess {
    if (isAdminRole(role)) return "dedicated";

    // A doctor is the owner only when nobody else is doing the job. The
    // moment a clinic hires an office manager this flips to "none" on its
    // own — no setting to remember to turn off, and no window where two
    // people both think the clinic dashboard is theirs.
    if (role === "doctor" && dedicatedAdminCount === 0) return "embedded";

    return "none";
}

/** Whether this access level may open the full multi-page suite at all.
 *  Both a real admin and an owner-doctor can; the doctor arrives through a
 *  door on their summarised page rather than at sign-in. */
export function canOpenFullSuite(access: AdminAccess): boolean {
    return access === "dedicated" || access === "embedded";
}
