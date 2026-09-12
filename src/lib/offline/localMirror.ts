// ---------------------------------------------------------------------------
// The offline READ side. Referenced but never implemented by db.ts until now
// — see docs/context/offline-security.md: "nothing reads from the local
// mirror yet." This is that.
//
// ── The contract ────────────────────────────────────────────────────────
// Network first, local fallback, refresh on reconnect:
//   1. Always attempt the real fetch first. Online means fresh, same as
//      `referenceCache.ts`'s cache-first-but-always-refreshing doctors/
//      symptoms lists — this is the same idea, just backed by Dexie instead
//      of localStorage, because patient/visit/prescription data is bigger
//      and per-doctor rather than a handful of small shared lists.
//   2. On success, the result is written into the mirror before it is
//      returned — so the NEXT offline attempt has something to fall back
//      to, not just the next one after that.
//   3. On failure (offline, timeout, a real error), fall back to whatever
//      was last cached under this exact key. Nothing to fall back to means
//      the original error surfaces — this never invents data.
// "Refresh on reconnect" falls out of (1) automatically for anything that
// re-fetches on its own when connectivity returns (a mount, a manual
// refresh) — this module does not itself schedule polling; see `useOnline`
// for the hook-level trigger, used the same way `referenceCache.ts` already
// does for its own reads.
//
// ── Why this lives at the `lib/db/*.ts` function level, not the caller's ──
// Every screen in Cortex already calls a plain async function like
// `fetchPatientVisits(patientId)` — wrapping the FUNCTION rather than each
// of its callers means every existing call site (useConsultSession,
// PatientRecord, VisitDetailModal, ...) gets the read-through cache for
// free, with no component changes and no new prop plumbing. The trade-off:
// a function that already receives the id it needs (patientId, visitId,
// prescriptionId — always a UUID, unique regardless of who's asking) uses
// that id as the cache key directly and needs nothing else. A function with
// NO id parameter at all (`fetchPatientDirectory` — the whole hospital's
// list) needs the caller's hospital to scope the key, which is what
// `resolveMirrorIdentity` below is for.
//
// ── What this deliberately does NOT do yet ─────────────────────────────
// No eviction on logout/PIN-lock. A shared machine that signs one doctor
// out and another in will not read the first doctor's cached rows (every
// key embeds a doctorId/patientId/hospitalId that scopes it correctly —
// see MirrorRow's own doc comment in db.ts), but old rows also aren't
// actively wiped, so they sit in this browser profile's IndexedDB until
// something clears it. Same class of gap the write queue's encryption
// already exists for (real PII at rest) — worth closing, not yet done.
// ---------------------------------------------------------------------------

import { supabase } from "../supabase";
import { readCachedIdentity } from "../auth";
import { localDB, type MirrorRow } from "./db";

export type MirrorKind = "patients" | "visits" | "prescriptions";

function tableFor(kind: MirrorKind) {
    switch (kind) {
        case "patients": return localDB.patientsMirror;
        case "visits": return localDB.visitsMirror;
        case "prescriptions": return localDB.prescriptionsMirror;
    }
}

export interface MirrorIdentity {
    /** null for a front-desk read — hospital-scoped, not any one doctor's. */
    doctorId: string | null;
    hospitalId: string;
}

/**
 * Best-effort "who is this, without a network round trip" — reads the
 * already-cached identity `AuthProvider` stashes on every successful gate
 * check (`lib/auth.ts`'s `cacheIdentity`), the same cache the login gate
 * itself trusts to survive an offline refresh. `getSession()` is normally
 * local-only; it can still touch the network if the token is due for a
 * refresh, so this can fail even while signed in. That failure is handled
 * by the caller choosing NOT to cache (see `readThrough`'s `scopeKey`
 * comment) rather than guessing — a read that can't be scoped correctly is
 * not stored, never stored under a wrong or shared key.
 */
export async function resolveMirrorIdentity(): Promise<MirrorIdentity | null> {
    try {
        const { data } = await supabase.auth.getSession();
        const userId = data.session?.user?.id;
        if (!userId) return null;
        const identity = readCachedIdentity(userId);
        if (!identity) return null;
        return { doctorId: identity.doctor?.id ?? null, hospitalId: identity.hospital.id };
    } catch {
        return null;
    }
}

export interface ReadThroughResult<T> {
    data: T;
    /** true when this came from the local mirror, not a live fetch. */
    fromCache: boolean;
    /** when the cached copy was last confirmed against the network — null
     *  for a live result (it IS the confirmation) or when nothing was cached. */
    cachedAt: number | null;
}

export interface ReadThroughOpts<T> {
    kind: MirrorKind;
    /** Stable cache key for this read. Always embed the id that scopes it
     *  (a patientId/visitId/prescriptionId, or `"recent:${doctorId}"` /
     *  `"directory:${hospitalId}"` for a list read with no id of its own) —
     *  this is what actually prevents one account's data from surfacing
     *  under another's read, not the `doctorId`/`hospitalId` fields below. */
    key: string;
    /** Metadata only (see MirrorRow's doc comment) — pass what you already
     *  have in scope. Use `resolveMirrorIdentity()` when the function has
     *  no id parameter to derive it from. */
    doctorId: string | null;
    hospitalId: string;
    fetcher: () => Promise<T>;
}

/**
 * Network first, local fallback. See this file's header for the full
 * contract. Every `lib/db/*.ts` fetch wrapped in this keeps its existing
 * signature and return type — callers never know the difference except
 * that a call made while offline now returns the last-known-good answer
 * instead of throwing.
 */
export async function readThrough<T>(opts: ReadThroughOpts<T>): Promise<ReadThroughResult<T>> {
    const table = tableFor(opts.kind);
    try {
        const data = await opts.fetcher();
        const row: MirrorRow = {
            id: opts.key,
            doctorId: opts.doctorId,
            hospitalId: opts.hospitalId,
            updatedAt: Date.now(),
            data,
        };
        // Never let a mirror write failure (IndexedDB full, private-mode
        // browser, ...) turn a SUCCESSFUL network read into a thrown error —
        // the doctor got their real answer; the cache is a bonus for next
        // time, exactly the rule `referenceCache.ts`'s writeCache already
        // follows for the smaller lists it caches.
        try {
            await table.put(row);
        } catch (cacheErr) {
            console.warn(`localMirror: failed to cache ${opts.kind}:${opts.key}`, cacheErr);
        }
        return { data, fromCache: false, cachedAt: null };
    } catch (err) {
        const cached = await table.get(opts.key).catch(() => undefined);
        if (cached) {
            return { data: cached.data as T, fromCache: true, cachedAt: cached.updatedAt };
        }
        throw err;
    }
}

/** Convenience for the common case: callers that don't need `fromCache`/
 *  `cachedAt` and just want the same return shape the un-cached function
 *  always had. */
export async function readThroughValue<T>(opts: ReadThroughOpts<T>): Promise<T> {
    return (await readThrough(opts)).data;
}
