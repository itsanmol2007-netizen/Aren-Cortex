import { useCallback, useEffect, useRef, useState } from "react";
import { fetchTodayVisits } from "@/lib/db";
import type { TodayVisit } from "../types/frontdesk";
import { readCache, writeCache } from "../operational/referenceCache";

const REFRESH_INTERVAL_MS = 25000;

// Cache-first, same rule as useCachedDoctors/useCachedIntakeChips: leaving
// the Front Desk page and coming back used to blank the queue and show the
// skeleton every single time, even though nothing had actually changed —
// this was a real, reported "feels slow" complaint. The last-seen queue for
// THIS hospital renders instantly from localStorage; a live refresh still
// starts immediately underneath it and overwrites both the state and the
// cache the moment it lands, so this is never a substitute for fresh data,
// only for the blank flash while fetching it.
function cacheKey(hospitalId: string | null): string {
    return `aren.cache.queue.${hospitalId ?? "none"}.v1`;
}

// `hospitalId` is null only while the auth identity is still resolving. We hold
// the queue empty rather than falling back to a constant clinic — see
// hooks/useHospitalId.ts.
export function useQueue(hospitalId: string | null) {
    const [visits, setVisits] = useState<TodayVisit[]>(() => readCache<TodayVisit[]>(cacheKey(hospitalId))?.data ?? []);
    const [loading, setLoading] = useState(() => !readCache<TodayVisit[]>(cacheKey(hospitalId)));
    const mounted = useRef(true);

    const load = useCallback(async (isFirstLoad: boolean) => {
        if (!hospitalId) {
            if (mounted.current) setVisits([]);
            return;
        }
        try {
            const data = await fetchTodayVisits(hospitalId);
            if (mounted.current) {
                setVisits(data);
                writeCache(cacheKey(hospitalId), data);
            }
        } catch (err) {
            console.warn("useQueue refresh failed (non-fatal):", err);
        } finally {
            if (isFirstLoad && mounted.current) setLoading(false);
        }
    }, [hospitalId]);

    useEffect(() => {
        mounted.current = true;
        // Re-seed from this hospital's own cache the moment we know which
        // hospital it is (covers the identity-resolving -> resolved
        // transition, where hospitalId flips from null to a real id after
        // this hook's first render already ran with the wrong cache key).
        const cached = readCache<TodayVisit[]>(cacheKey(hospitalId));
        if (cached) {
            setVisits(cached.data);
            setLoading(false);
        }
        load(true);
        const timer = setInterval(() => load(false), REFRESH_INTERVAL_MS);
        return () => {
            mounted.current = false;
            clearInterval(timer);
        };
    }, [load, hospitalId]);

    return { visits, setVisits, loading, refetch: () => load(false) };
}
