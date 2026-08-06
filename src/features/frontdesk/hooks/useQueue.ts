import { useCallback, useEffect, useRef, useState } from "react";
import { fetchTodayVisits } from "@/lib/db";
import type { TodayVisit } from "../types/frontdesk";

const REFRESH_INTERVAL_MS = 25000;

// `hospitalId` is null only while the auth identity is still resolving. We hold
// the queue empty rather than falling back to a constant clinic — see
// hooks/useHospitalId.ts.
export function useQueue(hospitalId: string | null) {
    const [visits, setVisits] = useState<TodayVisit[]>([]);
    const [loading, setLoading] = useState(true);
    const mounted = useRef(true);

    const load = useCallback(async (isFirstLoad: boolean) => {
        if (!hospitalId) {
            if (mounted.current) setVisits([]);
            return;
        }
        try {
            const data = await fetchTodayVisits(hospitalId);
            if (mounted.current) setVisits(data);
        } catch (err) {
            console.warn("useQueue refresh failed (non-fatal):", err);
        } finally {
            if (isFirstLoad && mounted.current) setLoading(false);
        }
    }, [hospitalId]);

    useEffect(() => {
        mounted.current = true;
        load(true);
        const timer = setInterval(() => load(false), REFRESH_INTERVAL_MS);
        return () => {
            mounted.current = false;
            clearInterval(timer);
        };
    }, [load]);

    return { visits, setVisits, loading, refetch: () => load(false) };
}
