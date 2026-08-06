// ---------------------------------------------------------------------------
// Which clinic is this receptionist working in.
//
// Every reception page used to read the `HOSPITAL_ID` constant from
// `lib/db/reference.ts`. That constant is one specific clinic, so a second
// clinic signing in saw the FIRST clinic's queue, doctor list and stats —
// while the header beside it read the real clinic's name off the auth
// identity. There are twelve hospitals in the database; the constant is only
// ever correct for one of them.
//
// The signed-in hospital is already verified and in memory before any of these
// pages render: `AuthProvider` loads the `hospitals` row during the gate check
// (and fails closed if it is missing or inactive), and every reception route
// sits behind `RequireAuth` + `RequireRole allow={["reception"]}`.
//
// So this hook is a read, never a fetch, and deliberately has NO fallback to
// the constant. A tenancy id that guesses is worse than one that is absent:
// null makes the callers skip their queries and show an empty queue, which is
// visibly wrong, where the constant silently showed another clinic's patients.
// ---------------------------------------------------------------------------

import { useAuth } from "../../auth/AuthProvider";

/** The signed-in clinic's id, or null when nobody is authed yet. */
export function useHospitalId(): string | null {
    const auth = useAuth();
    return auth.status === "authed" ? auth.identity.hospital.id : null;
}
