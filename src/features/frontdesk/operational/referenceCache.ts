import { useCallback, useEffect, useRef, useState } from "react";
import { fetchDoctorsByHospital, type DBDoctor } from "@/lib/db";
import { fetchIntakeChips, type IntakeChip } from "@/lib/db/synapse";
import { useOnline } from "./useOnline";

// Cache-fresh reference data (doctors, symptoms). These lists change rarely —
// weeks to months in production — yet everything downstream (the intake
// dropdowns, the symptom picker) fetches them live, so a two-minute Wi-Fi drop
// leaves the receptionist with empty dropdowns and no way to register anyone.
//
// The strategy is "cache-first, always-fresh": on mount we hand back the last
// copy saved on THIS computer instantly (works offline), then — whenever we're
// online, including the moment connectivity returns — we quietly re-fetch and
// overwrite the cache. No long expiry to reason about: online means fresh,
// offline means the last-known-good list keeps the clinic running.

type Cached<T> = { at: string; data: T };

function readCache<T>(key: string): Cached<T> | null {
    try {
        const raw = localStorage.getItem(key);
        return raw ? (JSON.parse(raw) as Cached<T>) : null;
    } catch {
        return null;
    }
}

function writeCache<T>(key: string, data: T): void {
    try {
        localStorage.setItem(key, JSON.stringify({ at: new Date().toISOString(), data }));
    } catch {
        /* storage unavailable — the cache is a bonus, never required */
    }
}

export type CachedResource<T> = {
    data: T;
    cachedAt: string | null; // ISO of the last successful fetch, or null if never
    refreshing: boolean; // a background refresh is in flight
    fromCache: boolean; // current data came from the cache, not a live fetch
    refresh: () => void;
};

function useCachedResource<T>(
    key: string,
    fetcher: () => Promise<T>,
    empty: T,
    options?: { refreshMs?: number }
): CachedResource<T> {
    const online = useOnline();
    const refreshMs = options?.refreshMs;
    const [snap, setSnap] = useState(() => {
        const c = readCache<T>(key);
        return { data: c?.data ?? empty, cachedAt: c?.at ?? null, fromCache: !!c };
    });
    const [refreshing, setRefreshing] = useState(false);
    const mounted = useRef(true);
    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
        };
    }, []);

    const refresh = useCallback(() => {
        setRefreshing(true);
        fetcher()
            .then((fresh) => {
                if (!mounted.current) return;
                writeCache(key, fresh);
                setSnap({ data: fresh, cachedAt: new Date().toISOString(), fromCache: false });
            })
            .catch(() => {
                /* offline or error — keep the cached copy, never clear it */
            })
            .finally(() => {
                if (mounted.current) setRefreshing(false);
            });
    }, [key, fetcher]);

    // Refresh on mount and every time we (re)gain connectivity.
    useEffect(() => {
        if (online) refresh();
    }, [online, refresh]);

    // Optional periodic refresh — used for doctors so presence (last_seen)
    // stays live enough to catch a doctor coming online, not just going stale.
    useEffect(() => {
        if (!online || !refreshMs) return;
        const id = setInterval(() => refresh(), refreshMs);
        return () => clearInterval(id);
    }, [online, refreshMs, refresh]);

    return { ...snap, refreshing, refresh };
}

// v2: the cached shape changed from the 51-row v1 symptom list to the full
// observable catalogue with its regional aliases. A new key rather than a
// migration — the old blob is a different type, and a stale copy of it would
// silently give the receptionist the small catalogue back.
const INTAKE_KEY = "aren.cache.intakechips.v2";

export function useCachedIntakeChips(): CachedResource<IntakeChip[]> {
    return useCachedResource<IntakeChip[]>(INTAKE_KEY, fetchIntakeChips, []);
}

export function useCachedDoctors(hospitalId: string): CachedResource<DBDoctor[]> {
    const fetcher = useCallback(() => fetchDoctorsByHospital(hospitalId), [hospitalId]);
    // 45s periodic refresh keeps `last_seen` presence current for reception.
    return useCachedResource<DBDoctor[]>(`aren.cache.doctors.${hospitalId}.v1`, fetcher, [], { refreshMs: 45_000 });
}
