// ---------------------------------------------------------------------------
// Proactively backs up a doctor's own recent patient history into the local
// Dexie mirror. The fix for the second failure
// docs/offline-architecture-failure-dump.md names: "the concept of caching
// the past 3 months of patient data locally into the device is not
// working."
//
// Everything in localMirror.ts is opportunistic — network-first, cache
// whatever a doctor happened to actually open. That is real and correct for
// a patient already viewed this session, but a patient NEVER opened stays
// inaccessible offline, because nothing has fetched them yet to cache. This
// closes that gap: walk this doctor's own patients seen in the last 3
// months and call the SAME already-wired read functions
// (fetchPatientById/fetchPatientVisits) the app already uses — every write
// lands under the exact cache key those functions already read from
// (localMirror.ts's readThrough), so there is no second cache format to
// keep in sync, and every existing offline read benefits automatically.
//
// Trigger: useSynapse.ts, doctor-only (front desk has its own, older,
// separate cache — see localMirror.ts's own header on why the two never
// share a table), the same fire-and-forget spot `syncCatalogue` already
// uses. Never blocks the ruleset or anything else; runs at most once per
// `PREFETCH_INTERVAL_MS` per doctor, so a doctor who reloads a dozen times
// a day doesn't re-walk their whole recent history a dozen times.
// ---------------------------------------------------------------------------

import { supabase } from "../supabase";
import { localDB } from "./db";
import { fetchPatientById, fetchPatientVisits } from "../db/patients";

const WINDOW_DAYS = 90;
const PREFETCH_INTERVAL_MS = 6 * 60 * 60 * 1000;
// Chrome caps concurrent requests per origin at ~6 (see cortex-gotchas.md).
// 4 alone already leaves only 2 free for everything else sharing that pool
// at the same moment (the ruleset load, catalogue sync, and — critically —
// whatever page the doctor is actually looking at) — measured live,
// 2026-09-19, starving the Patients page's own fetch for 80+ seconds on an
// account with real patient volume. 2 leaves real headroom; this walk has
// no deadline, so trading some of its own speed for that is the right
// trade. See `useSynapse.ts`'s start-delay for the other half of the fix —
// concurrency alone doesn't help if this is still mid-walk exactly when a
// doctor's first click needs the same pool.
const CONCURRENCY = 2;
/** How long after identity resolves this walk waits before firing — see
 *  `useSynapse.ts`'s own comment on why. Exported so that's the one place
 *  both the initial-load and reconnect triggers read the same number from. */
export const PREFETCH_START_DELAY_MS = 8000;

const metaKey = (doctorId: string) => `patientPrefetchAt:${doctorId}`;

async function mapWithConcurrency<T>(
    items: T[],
    limit: number,
    fn: (item: T) => Promise<void>
): Promise<void> {
    let next = 0;
    const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
        for (;;) {
            const i = next++;
            if (i >= items.length) return;
            // One patient's failure (a deleted row, a transient hiccup) must
            // never stop the rest of the walk — this is a background backup,
            // not a page load anything is waiting on.
            await fn(items[i]).catch(() => {});
        }
    });
    await Promise.all(workers);
}

let inFlight: Promise<void> | null = null;

/**
 * The one entry point. Safe to call repeatedly (e.g. every `useSynapse`
 * load, every reconnect) — a run already in flight is reused rather than
 * duplicated, and a doctor prefetched within the last
 * `PREFETCH_INTERVAL_MS` resolves near-instantly (one small `meta` read).
 */
export function prefetchRecentPatients(hospitalId: string, doctorId: string): Promise<void> {
    if (inFlight) return inFlight;
    inFlight = run(hospitalId, doctorId).finally(() => {
        inFlight = null;
    });
    return inFlight;
}

async function run(hospitalId: string, doctorId: string): Promise<void> {
    if (typeof navigator !== "undefined" && !navigator.onLine) return;

    const lastRun = await localDB.meta.get(metaKey(doctorId));
    const last = typeof lastRun?.value === "number" ? lastRun.value : 0;
    if (Date.now() - last < PREFETCH_INTERVAL_MS) return;

    const windowStart = new Date(Date.now() - WINDOW_DAYS * 86400000).toISOString();

    // This doctor's own patients seen in the last 3 months — the same scope
    // the offline Overview/Patients screens actually need. Deliberately not
    // the whole hospital's directory: that is a much larger, all-time read
    // (fetchPatientDirectory), already cached opportunistically whenever the
    // Patients page is opened online, and pulling it in full on a background
    // timer would cost far more than the "3 months" this is actually meant
    // to guarantee.
    const { data, error } = await supabase
        .from("visits")
        .select("patient_id")
        .eq("hospital_id", hospitalId)
        .eq("assigned_doctor_id", doctorId)
        .gte("created_at", windowStart);
    if (error) throw new Error(`prefetchRecentPatients: ${error.message}`);

    const patientIds = [...new Set(
        (data ?? []).map((v) => v.patient_id).filter((id): id is string => !!id)
    )];

    await mapWithConcurrency(patientIds, CONCURRENCY, async (patientId) => {
        // Both already write into the correct mirror table under the
        // correct key via localMirror.ts's readThrough — nothing here
        // touches Dexie directly, so there is no cache-shape drift risk.
        await fetchPatientById(patientId);
        await fetchPatientVisits(patientId);
    });

    await localDB.meta.put({ key: metaKey(doctorId), value: Date.now() });
}
