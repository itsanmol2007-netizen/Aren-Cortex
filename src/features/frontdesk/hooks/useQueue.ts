import { useCallback, useEffect, useRef, useState } from "react";
import { fetchTodayVisits } from "@/lib/db";
import type { TodayVisit } from "../types/frontdesk";

const REFRESH_INTERVAL_MS = 25000;

export function useQueue(hospitalId: string) {
    const [visits, setVisits] = useState<TodayVisit[]>([]);
    const [loading, setLoading] = useState(true);
    const mounted = useRef(true);

    const load = useCallback(async (isFirstLoad: boolean) => {
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
