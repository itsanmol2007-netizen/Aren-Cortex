// The shape of the clinic this doctor is signed in to — see
// `lib/workspace/clinicShape.ts` for what the answer gates and why it is
// derived from the clinic row rather than chosen.
//
// Replaced `useWorkspaceMode` on 2026-09-11, when the Cortex split
// was retired. Same read, same source, smaller question: not "which product
// is this doctor being served" (there is only one) but "does somebody else
// do intake here".
//
// Safe to call from anywhere under <AuthProvider>, which is everything behind
// the route gate. While the identity is still resolving it answers "no front
// desk" — the shape that needs nothing else to exist — so nothing renders a
// queue for a clinic we cannot yet confirm has one.

import { useMemo } from "react";
import { useAuth } from "../features/auth/AuthProvider";
import { CORTEX_BRAND, hasFrontDesk, isMultiDoctor, type Brand } from "../lib/workspace/clinicShape";

export interface ClinicShape {
    /** somebody other than the doctor does intake — there is a queue to receive */
    frontDesk: boolean;
    /** several doctors behind one front desk — changes how the queue filters */
    multiDoctor: boolean;
    /** always AREN Cortex; kept as an object so headers read one source */
    brand: Brand;
    /** false while the auth identity is still resolving */
    ready: boolean;
}

export function useClinicShape(): ClinicShape {
    const auth = useAuth();
    return useMemo(() => {
        const clinicMode = auth.status === "authed" ? auth.identity.hospital.clinic_mode : null;
        return {
            frontDesk: hasFrontDesk(clinicMode),
            multiDoctor: isMultiDoctor(clinicMode),
            brand: CORTEX_BRAND,
            ready: auth.status === "authed",
        };
    }, [auth]);
}
