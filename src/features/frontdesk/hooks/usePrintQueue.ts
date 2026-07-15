import { useCallback, useEffect, useRef, useState } from "react";
import { fetchPrintQueue, type PrintQueueRx } from "@/lib/db";

const REFRESH_MS = 25000;

// Owns the Print RX queue. Prescriptions "appear automatically as doctors
// finalize them" — same silent 25s cadence as the Front Desk queue: failures
// after the first load are non-fatal warnings, `loading` only flips once.
export function usePrintQueue() {
    const [entries, setEntries] = useState<PrintQueueRx[]>([]);
    const [loading, setLoading] = useState(true);
    const [failed, setFailed] = useState(false);
    const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
    const mounted = useRef(true);

    const load = useCallback(async (isFirstLoad: boolean) => {
        if (isFirstLoad) { setLoading(true); setFailed(false); }
        try {
            const data = await fetchPrintQueue();
            if (mounted.current) {
                setEntries(data);
                setFailed(false);
                setUpdatedAt(new Date());
            }
        } catch (err) {
            console.warn("usePrintQueue load failed:", err);
            if (mounted.current && isFirstLoad) setFailed(true);
        } finally {
            if (isFirstLoad && mounted.current) setLoading(false);
        }
    }, []);

    useEffect(() => {
        mounted.current = true;
        load(true);
        const t = setInterval(() => load(false), REFRESH_MS);
        return () => {
            mounted.current = false;
            clearInterval(t);
        };
    }, [load]);

    return {
        entries,
        loading,
        failed,
        updatedAt,
        retry: () => load(true),
        refetch: () => load(false),
    };
}
