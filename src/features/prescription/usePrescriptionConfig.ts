// ---------------------------------------------------------------------------
// The read side of the prescription's configuration.
//
// The Prescription Editor (features/clinic/) OWNS this data — it loads it into
// its own form state and writes it back. This hook is for everything that only
// ever reads it: the one review/print surface (`ReviewModal`), which is the
// single door Consult, Patient Record and Print RX all go through.
//
// Loading it here rather than plumbing a prop down from three separate callers
// is deliberate: those three call sites have nothing else to say about how a
// prescription is configured, and a prop they all have to remember to pass is a
// prop one of them eventually forgets — which on this surface means a clinic's
// customised prescription silently reverting to defaults on one path only.
//
// Failure is non-fatal by design: a config that doesn't load leaves
// `DEFAULT_PRESCRIPTION_CONFIG` in place, which renders the document exactly as
// it did before this config existed. A prescription must still print when the
// network is having a bad day.
// ---------------------------------------------------------------------------

import { useEffect, useState } from "react";
import {
    DEFAULT_PRESCRIPTION_CONFIG,
    fetchPrescriptionConfig,
    type PrescriptionConfig,
} from "../../lib/db/clinic";

export function usePrescriptionConfig(hospitalId: string | null | undefined): PrescriptionConfig {
    const [config, setConfig] = useState<PrescriptionConfig>(DEFAULT_PRESCRIPTION_CONFIG);

    useEffect(() => {
        if (!hospitalId) return;
        let alive = true;
        fetchPrescriptionConfig(hospitalId)
            .then((c) => { if (alive) setConfig(c); })
            .catch((e) => console.error("usePrescriptionConfig:", e));
        return () => { alive = false; };
    }, [hospitalId]);

    return config;
}
