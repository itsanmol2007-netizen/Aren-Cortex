// ---------------------------------------------------------------------------
// Who is prescribing, and where.
//
// Everything Synapse learns is keyed on these two ids, so they have to be the
// real signed-in ones. The sandbox these modules came from had no auth and
// minted a random UUID into localStorage; Cortex historically used the two
// hardcoded constants in `lib/db/reference.ts`. Both are wrong the moment a
// second doctor exists, and the learning loop is exactly the feature that
// makes that wrongness permanent — bias rows written under the wrong doctor
// cannot be untangled afterwards.
//
// So this is the single resolver. It reads the auth identity and falls back to
// the MVP constants only when the signed-in user has no `doctors` row yet,
// reporting which happened so the caller can decide whether to trust it.
// ---------------------------------------------------------------------------

import { useMemo } from "react";
import { useAuth } from "../features/auth/AuthProvider";
import { DOCTOR_ID, DOCTOR_NAME, DOCTOR_SPECIALIZATION, HOSPITAL_ID } from "../lib/db/reference";

export interface ClinicalIdentity {
    doctorId: string;
    hospitalId: string;
    doctorName: string;
    specialization: string;
    /**
     * True when both ids came from the signed-in session. False means the MVP
     * constants are standing in — fine for a single-doctor clinic, and the
     * reason the learning loop must not be trusted across doctors until every
     * user has a `doctors` row.
     */
    isReal: boolean;
    /** identity is still resolving, or nobody is signed in */
    ready: boolean;
}

export function useClinicalIdentity(): ClinicalIdentity {
    const auth = useAuth();

    return useMemo(() => {
        if (auth.status !== "authed") {
            return {
                doctorId: DOCTOR_ID,
                hospitalId: HOSPITAL_ID,
                doctorName: DOCTOR_NAME,
                specialization: DOCTOR_SPECIALIZATION,
                isReal: false,
                ready: false,
            };
        }

        const { identity } = auth;
        const doctorId = identity.doctor?.id ?? DOCTOR_ID;
        const hospitalId = identity.user.hospital_id ?? HOSPITAL_ID;

        return {
            doctorId,
            hospitalId,
            doctorName: identity.doctor?.name ?? identity.user.full_name ?? DOCTOR_NAME,
            specialization: identity.doctor?.specialization ?? DOCTOR_SPECIALIZATION,
            isReal: !!identity.doctor?.id && !!identity.user.hospital_id,
            ready: true,
        };
    }, [auth]);
}
