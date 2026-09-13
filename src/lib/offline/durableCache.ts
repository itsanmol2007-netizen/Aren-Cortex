// ---------------------------------------------------------------------------
// A durable, NEVER-EXPIRING local cache for clinic-wide "small, rarely
// changing" data — a consultation fee, the credit balance as of the last
// successful check, a preferred lab list, clinic hours, the prescription
// letterhead config.
//
// Synchronous and localStorage-backed, deliberately — several callers read
// this inside a `useState(() => getDurableCache(...))` initializer for
// instant paint on frame 1 (see PatientModal.tsx's own comment on exactly
// this), which an async/IndexedDB read cannot serve. Same mechanism
// `features/frontdesk/operational/referenceCache.ts` already proved for
// doctors/symptoms; this is that same TTL-less shape, just living
// somewhere Cortex-side code can import it too instead of reaching into a
// frontdesk-scoped file.
//
// Why not features/overview/overviewCache.ts (already used by
// lib/db/payments.ts's fee cache until this file existed): that one has a
// 15-MINUTE TTL, deliberately — it exists to avoid a redundant re-fetch on
// a fast page nav, not to survive a real offline stretch. Reusing it for
// offline durability was the actual bug behind "I can't see the fee when
// offline" resurfacing after 15 minutes even with a cache read wired in —
// the cached value was still there, `overviewCache` just refused to hand it
// back once it aged out. Nothing here expires on its own; a fresher value
// simply overwrites an older one the next time a live fetch succeeds.
// ---------------------------------------------------------------------------

const PREFIX = "aren.durable.v1.";

export interface DurableEntry<T> {
    /** ISO timestamp of the last successful live fetch — for a UI that
     *  wants to say "as of 9:40 AM" rather than just showing stale data
     *  silently as if it were live. */
    at: string;
    value: T;
}

export function getDurableCache<T>(key: string): DurableEntry<T> | null {
    try {
        const raw = localStorage.getItem(PREFIX + key);
        return raw ? (JSON.parse(raw) as DurableEntry<T>) : null;
    } catch {
        return null;
    }
}

export function setDurableCache<T>(key: string, value: T): void {
    try {
        localStorage.setItem(PREFIX + key, JSON.stringify({ at: new Date().toISOString(), value }));
    } catch {
        /* storage unavailable (quota, private mode) — the cache is a bonus,
         * never a precondition for the live read that just succeeded. */
    }
}

/**
 * Try a live read; fall back to the durable cache on failure, or skip the
 * live attempt outright when this device already knows it is offline.
 *
 * The skip is the point. Every one of the "durable cache" reads across
 * `lib/db/*` used to try the network first regardless, so a genuinely
 * offline Practice page still sat through however long the browser takes
 * to give up on a request that can never succeed — 5-10 seconds is exactly
 * what that looks like — before the `catch` ever got a turn to hand back
 * the cached answer. Anmol, 2026-09-13: "if you better know system is
 * offline so why even load for 5-10 sec, just show the offline data."
 *
 * `navigator.onLine` is a fast-path, not a guarantee — it can read `true`
 * on a captive portal or a dead VPN adapter with no real path out. That is
 * exactly why this only ever SKIPS the attempt when it says `false`; it
 * never skips the fallback logic that runs when the browser says `true`
 * and the request fails anyway, which is unchanged and still the thing
 * that catches those cases.
 */
export async function readThroughDurableCache<T>(
    key: string,
    fetchLive: () => Promise<T>
): Promise<T> {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
        const cached = getDurableCache<T>(key);
        if (cached) return cached.value;
        // Offline AND nothing cached yet — still worth a real attempt; there
        // is nothing to lose by trying, and `navigator.onLine` is occasionally
        // wrong in the other direction too (some captive-portal setups).
    }
    try {
        const fresh = await fetchLive();
        setDurableCache(key, fresh);
        return fresh;
    } catch (err) {
        const cached = getDurableCache<T>(key);
        if (cached) return cached.value;
        throw err;
    }
}
