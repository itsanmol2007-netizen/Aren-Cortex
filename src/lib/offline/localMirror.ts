// ---------------------------------------------------------------------------
// The offline READ side. Referenced but never implemented by db.ts until now
// — see docs/context/offline-security.md: "nothing reads from the local
// mirror yet." This is that.
//
// ── The contract ────────────────────────────────────────────────────────
// Cache first, always; network refreshes it in the background — a doctor
// re-opening something they've already seen this session should never wait
// on a round trip for an answer already sitting on the device:
//   1. A cached copy answers IMMEDIATELY, online or offline. The real fetch
//      still runs, unattended, purely to keep the cache warm for the NEXT
//      call — same idea `referenceCache.ts`'s doctors/symptoms lists already
//      use (cache-first-but-always-refreshing), just backed by Dexie instead
//      of localStorage, because patient/visit/prescription data is bigger
//      and per-doctor rather than a handful of small shared lists.
//   2. Only a key with NOTHING cached yet waits on the network — there is
//      nothing else to show. Even then, a browser that already knows it's
//      offline skips the attempt rather than running it to a doomed failure.
//   3. Every successful fetch (foreground or background) is written into
//      the mirror before anything happens with it — so the NEXT call, cached
//      or not, has the freshest available answer to work from.
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

export type MirrorKind = "patients" | "visits" | "prescriptions" | "admin";

function tableFor(kind: MirrorKind) {
    switch (kind) {
        case "patients": return localDB.patientsMirror;
        case "visits": return localDB.visitsMirror;
        case "prescriptions": return localDB.prescriptionsMirror;
        case "admin": return localDB.adminMirror;
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

// ── Cache-first, always — not "network first, race a clock" ────────────────
//
// The previous version of this function still raced the network against a
// 2.5s clock on EVERY call, cache or no cache — so a doctor re-opening a
// patient they had already opened five minutes ago still waited on that
// clock (or a fast network reply) before anything appeared, even though the
// exact answer was already sitting in IndexedDB. Anmol, 2026-09-19: "every
// single time you click on the patient page it load for three seconds...
// cache the data and... load that thing in background and update it." And
// separately: "if the browser itself is saying you're offline... why even
// wait... just directly fetch the local data" — the old version still ran
// the full 2.5s race even when `navigator.onLine` already said there was no
// point trying.
//
// So: a cached copy now answers INSTANTLY, unconditionally, online or not —
// zero wait, not a capped one. The network still runs (never cancelled), to
// silently refresh the cache for the NEXT call; this one just doesn't wait
// on it. Only a key with NOTHING cached yet — genuinely nothing to show —
// ever waits on the network at all, and even then, if the browser already
// knows it is offline, that attempt is skipped rather than run to fail.
export async function readThrough<T>(opts: ReadThroughOpts<T>): Promise<ReadThroughResult<T>> {
    const table = tableFor(opts.kind);
    const cacheRow = () => table.get(opts.key).catch(() => undefined);
    const cacheData = (data: T) => {
        const row: MirrorRow = { id: opts.key, doctorId: opts.doctorId, hospitalId: opts.hospitalId, updatedAt: Date.now(), data };
        // Never let a mirror write failure (IndexedDB full, private-mode
        // browser, ...) turn a SUCCESSFUL network read into a thrown error —
        // the doctor got their real answer; the cache is a bonus for next
        // time, exactly the rule `referenceCache.ts`'s writeCache already
        // follows for the smaller lists it caches.
        return table.put(row).catch((cacheErr) => {
            console.warn(`localMirror: failed to cache ${opts.kind}:${opts.key}`, cacheErr);
        });
    };

    const cached = await cacheRow();

    if (cached) {
        // Answer THIS call immediately with what's already on the device.
        // The network fetch still runs, unattended, purely to keep the
        // cache warm for the call after this one — a slow-but-working
        // connection loses nothing except making this particular call wait
        // for it, which it no longer needs to.
        opts.fetcher().then(cacheData).catch((err) => {
            console.warn(`localMirror: background refresh failed for ${opts.kind}:${opts.key}`, err);
        });
        return { data: cached.data as T, fromCache: true, cachedAt: cached.updatedAt };
    }

    // Nothing cached at all — genuinely nothing to show without the network.
    // If the browser already knows there is no connection, don't spend time
    // finding that out the hard way; fail straight to the caller's own
    // existing empty/error handling instead of waiting out a doomed request.
    if (typeof navigator !== "undefined" && !navigator.onLine) {
        throw new Error(`Offline, and nothing cached yet for ${opts.kind}:${opts.key}`);
    }

    const data = await opts.fetcher();
    await cacheData(data);
    return { data, fromCache: false, cachedAt: null };
}

/** Convenience for the common case: callers that don't need `fromCache`/
 *  `cachedAt` and just want the same return shape the un-cached function
 *  always had. */
export async function readThroughValue<T>(opts: ReadThroughOpts<T>): Promise<T> {
    return (await readThrough(opts)).data;
}
