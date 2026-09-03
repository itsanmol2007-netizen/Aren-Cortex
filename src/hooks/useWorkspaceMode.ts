// Which workspace this signed-in doctor is being served — see
// `lib/workspace/mode.ts` for what the two modes mean and why the answer is
// derived from the clinic rather than chosen.
//
// Safe to call from anywhere under <AuthProvider>, which is everything behind
// the route gate. While the identity is still resolving it answers "cortex" —
// the mode that needs nothing else to exist — so nothing renders a queue for a
// clinic we cannot yet confirm has one.

import { useMemo } from "react";
import { useAuth } from "../features/auth/AuthProvider";
import { isMultiDoctor, modeForClinic, MODE_BRAND, type ModeBrand, type WorkspaceMode } from "../lib/workspace/mode";

export interface WorkspaceModeInfo {
    mode: WorkspaceMode;
    isConsult: boolean;
    /** several doctors behind one front desk — changes how the queue filters */
    multiDoctor: boolean;
    brand: ModeBrand;
    /** false while the auth identity is still resolving */
    ready: boolean;
}

export function useWorkspaceMode(): WorkspaceModeInfo {
    const auth = useAuth();
    return useMemo(() => {
        const clinicMode = auth.status === "authed" ? auth.identity.hospital.clinic_mode : null;
        const mode = modeForClinic(clinicMode);
        return {
            mode,
            isConsult: mode === "consult",
            multiDoctor: isMultiDoctor(clinicMode),
            brand: MODE_BRAND[mode],
            ready: auth.status === "authed",
        };
    }, [auth]);
}
