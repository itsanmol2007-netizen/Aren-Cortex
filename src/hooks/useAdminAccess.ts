// Which admin surface the signed-in person gets — see
// `lib/workspace/adminAccess.ts` for the rule itself and why it is derived
// rather than configured.
//
// Safe to call anywhere under <AuthProvider>. While the identity or the admin
// count is still resolving it answers "none", so no surface flashes into
// existence and then disappears; `ready` says which of the two states you are
// looking at.

import { useEffect, useState } from "react";
import { useAuth } from "../features/auth/AuthProvider";
import { countDedicatedAdmins } from "../lib/db/admin";
import {
    canOpenFullSuite, resolveAdminAccess, type AdminAccess,
} from "../lib/workspace/adminAccess";
import { shapeLabel } from "../lib/workspace/mode";

export interface AdminAccessInfo {
    access: AdminAccess;
    /** The full multi-page suite is reachable — as a home, or through a door. */
    canOpenSuite: boolean;
    /** A clinic that employs someone to administer it. */
    hasDedicatedAdmin: boolean;
    /** "Multi-bench clinic" / "Managed clinic" — display only. */
    shape: string;
    /** False while auth or the admin count is still resolving. */
    ready: boolean;
}

export function useAdminAccess(): AdminAccessInfo {
    const auth = useAuth();
    const hospitalId = auth.status === "authed" ? auth.identity.user.hospital_id : null;
    const role = auth.status === "authed" ? auth.identity.user.role : null;
    const clinicMode = auth.status === "authed" ? auth.identity.hospital.clinic_mode : null;

    const [adminCount, setAdminCount] = useState<number | null>(null);

    useEffect(() => {
        if (!hospitalId) { setAdminCount(null); return; }
        let alive = true;
        countDedicatedAdmins(hospitalId).then((n) => { if (alive) setAdminCount(n); });
        // Guards against a slow response landing after the user has switched
        // clinics (or signed out), which would otherwise resolve access
        // against a hospital nobody is looking at any more.
        return () => { alive = false; };
    }, [hospitalId]);

    const ready = auth.status === "authed" && adminCount !== null;
    const access = ready ? resolveAdminAccess(role, adminCount) : "none";

    return {
        access,
        canOpenSuite: canOpenFullSuite(access),
        hasDedicatedAdmin: (adminCount ?? 0) > 0,
        shape: shapeLabel(clinicMode, (adminCount ?? 0) > 0),
        ready,
    };
}
