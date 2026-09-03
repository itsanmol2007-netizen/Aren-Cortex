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

export type Cached<T> = { at: string; data: T };

// Exported — useQueue reuses this exact cache-first mechanism for the live
// visit queue (2026-08-24), not just the reference lists below. Same
// localStorage-shaped snapshot, same "never throw, cache is a bonus" rule.
export function readCache<T>(key: string): Cached<T> | null {
    try {
        const raw = localStorage.getItem(key);
        return raw ? (JSON.parse(raw) as Cached<T>) : null;
    } catch {
        return null;
    }
}

export function writeCache<T>(key: string, data: T): void {
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
// v3 (2026-09-03): each chip now carries `signalIds`, used to rank which
// measurements the intake surface offers. A v2 blob has no such field.
// v4 (2026-09-03): `IntakeChip` gained `slug`, so a v3 entry is a cache of
// chips with no slug on them — the duration question would silently never fire
// for anyone still holding one. Bumping the key is how this file has always
// handled a shape change; nothing reads the old entry, it simply ages out.
const INTAKE_KEY = "aren.cache.intakechips.v4";

export function useCachedIntakeChips(): CachedResource<IntakeChip[]> {
    return useCachedResource<IntakeChip[]>(INTAKE_KEY, fetchIntakeChips, []);
}

// The cache key is per-hospital, so two clinics on one shared reception
// computer never read each other's doctor list. `hospitalId` is null only while
// the auth identity resolves; we fetch nothing rather than falling back to a
// constant clinic (see hooks/useHospitalId.ts).
export function useCachedDoctors(hospitalId: string | null): CachedResource<DBDoctor[]> {
    const fetcher = useCallback(
        () => (hospitalId ? fetchDoctorsByHospital(hospitalId) : Promise.resolve([])),
        [hospitalId]
    );
    // 45s periodic refresh keeps `last_seen` presence current for reception.
    return useCachedResource<DBDoctor[]>(`aren.cache.doctors.${hospitalId ?? "none"}.v1`, fetcher, [], { refreshMs: 45_000 });
}
