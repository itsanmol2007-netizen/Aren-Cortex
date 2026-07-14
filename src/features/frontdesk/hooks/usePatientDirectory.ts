import { useCallback, useEffect, useRef, useState } from "react";
import { fetchPatientDirectory, type PatientDirectoryEntry } from "@/lib/db";

// Owns the Patients page's directory: every patient with their operational
// aggregates (visit count, first/last visit, primary doctor). Loaded once on
// mount, refreshed on demand (after a new visit or a demographic edit) —
// unlike the queue there is nothing live here, so no polling.
export function usePatientDirectory() {
    const [entries, setEntries] = useState<PatientDirectoryEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [failed, setFailed] = useState(false);
    const mounted = useRef(true);

    const load = useCallback(async (isFirstLoad: boolean) => {
        if (isFirstLoad) { setLoading(true); setFailed(false); }
        try {
            const data = await fetchPatientDirectory();
            if (mounted.current) { setEntries(data); setFailed(false); }
        } catch (err) {
            console.warn("usePatientDirectory load failed:", err);
            if (mounted.current && isFirstLoad) setFailed(true);
        } finally {
            if (isFirstLoad && mounted.current) setLoading(false);
        }
    }, []);

    useEffect(() => {
        mounted.current = true;
        load(true);
        return () => { mounted.current = false; };
    }, [load]);

    // Patch one patient's demographics in place (after Edit Details) without
    // a round-trip — the aggregates don't change, only identity fields.
    const patchEntry = useCallback((id: string, fields: Partial<PatientDirectoryEntry>) => {
        setEntries((es) => es.map((e) => (e.id === id ? { ...e, ...fields } : e)));
    }, []);

    return {
        entries,
        loading,
        failed,
        retry: () => load(true),
        refetch: () => load(false),
        patchEntry,
    };
}
