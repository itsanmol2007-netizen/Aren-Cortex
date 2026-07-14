import { useCallback, useEffect, useRef, useState } from "react";
import { fetchPatientHistory, type PatientHistoryVisit } from "@/lib/db";

// Loads the selected patient's full operational visit history (dates, status,
// doctor — no clinical payload). Re-runs when the selection changes; a
// stale-response guard makes fast patient-to-patient clicking safe.
export function usePatientHistory(patientId: string | null) {
    const [visits, setVisits] = useState<PatientHistoryVisit[]>([]);
    const [loading, setLoading] = useState(false);
    const requestSeq = useRef(0);

    const load = useCallback(async (id: string, silent: boolean) => {
        const seq = ++requestSeq.current;
        if (!silent) setLoading(true);
        try {
            const data = await fetchPatientHistory(id);
            if (seq === requestSeq.current) setVisits(data);
        } catch (err) {
            console.warn("usePatientHistory load failed (non-fatal):", err);
        } finally {
            if (seq === requestSeq.current) setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!patientId) {
            requestSeq.current++;
            setVisits([]);
            setLoading(false);
            return;
        }
        setVisits([]);
        load(patientId, false);
    }, [patientId, load]);

    return {
        visits,
        loading,
        refetch: () => { if (patientId) load(patientId, true); },
    };
}
