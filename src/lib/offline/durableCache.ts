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
