// ---------------------------------------------------------------------------
// PROFILE CACHE — the doctor row and the hospital row, read once per session.
//
// These two rows are the most re-read things in the app and the least likely
// to change during a sitting: the doctor's name/photo and the clinic's
// name/logo are wanted by the sidebar, the Clinic page, the Settings page,
// every prescription render and every letterhead preview. Before this,
// each of those did its own `fetchDoctor`/`fetchHospital` on mount, so
// merely opening the sidebar, or bouncing between Clinic and Practice,
// re-hit the database for rows that had not changed — Anmol, 2026-08-31:
// "cache this thing into local storage or IndexedDB... so that opening a
// sidebar doesn't call the database again and again. Same thing for the
// clinic page also."
//
// ── What is cached, and what is NOT
//
// The ROW is cached, which is what carries `logo_url` / `avatar_url`. The
// image BYTES are not cached here and must not be: both URLs come from
// `getPublicUrl` (lib/db/clinic.ts), so they are stable public URLs with no
// expiry, and the browser's own HTTP cache is already the right place for
// the pixels. Caching a data-URI copy in localStorage would duplicate that
// for no gain and put megabytes into a 5MB store.
//
// Deliberately NOT cached anywhere else: anything clinical. This is
// configuration and identity only — a visit, a prescription or a chart entry
// is always read live. A stale patient record is a safety problem; a stale
// clinic logo is a cosmetic one that the TTL and the explicit invalidations
// below already bound.
//
// ── Freshness
//
// Two layers, both cheap: an in-memory map (survives navigation, dies with
// the tab) in front of `localStorage` (survives a reload). Both are bounded
// by TTL_MS, and both are dropped explicitly by `invalidate*` the moment
// this app writes to either row — so a doctor who edits the clinic name and
// navigates away never sees the old one come back. A write made by SOMEONE
// ELSE, in another session, is picked up on the next TTL expiry; that is the
// deliberate trade, and the reason the TTL is minutes rather than days.
// ---------------------------------------------------------------------------

import { fetchDoctor, fetchHospital, type DBDoctor, type DBHospital } from "./patients";

/** How long a cached row stays usable. Long enough to cover navigating
 *  around the app, short enough that another session's edit lands soon. */
const TTL_MS = 10 * 60 * 1000;

const KEY_PREFIX = "aren.cache.v1.";

interface Entry<T> {
    at: number;
    value: T;
}

const memory = new Map<string, Entry<unknown>>();

function isFresh(entry: Entry<unknown> | undefined): boolean {
    return !!entry && Date.now() - entry.at < TTL_MS;
}

/** localStorage throws in private mode and when the quota is full; a cache
 *  that cannot be read or written is a cache miss, never an error. */
function readStored<T>(key: string): Entry<T> | undefined {
    try {
        const raw = localStorage.getItem(KEY_PREFIX + key);
        if (!raw) return undefined;
        const parsed = JSON.parse(raw) as Entry<T>;
        return typeof parsed?.at === "number" ? parsed : undefined;
    } catch {
        return undefined;
    }
}

function writeStored<T>(key: string, entry: Entry<T>): void {
    try {
        localStorage.setItem(KEY_PREFIX + key, JSON.stringify(entry));
    } catch {
        /* full or unavailable — the in-memory layer still works */
    }
}

function drop(key: string): void {
    memory.delete(key);
    try {
        localStorage.removeItem(KEY_PREFIX + key);
    } catch {
        /* nothing to do */
    }
}

/**
 * The shared read path: memory → localStorage → network, writing back into
 * both on the way out.
 *
 * In-flight reads are shared too (`pending`), so three components mounting
 * in the same frame — which is exactly what a page navigation looks like —
 * produce ONE request rather than three.
 */
const pending = new Map<string, Promise<unknown>>();

async function cachedRead<T>(key: string, load: () => Promise<T>): Promise<T> {
    const inMemory = memory.get(key);
    if (isFresh(inMemory)) return inMemory!.value as T;

    const stored = readStored<T>(key);
    if (isFresh(stored)) {
        memory.set(key, stored!);
        return stored!.value;
    }

    const alreadyLoading = pending.get(key);
    if (alreadyLoading) return alreadyLoading as Promise<T>;

    const request = load()
        .then((value) => {
            const entry: Entry<T> = { at: Date.now(), value };
            memory.set(key, entry);
            writeStored(key, entry);
            return value;
        })
        .finally(() => {
            pending.delete(key);
        });

    pending.set(key, request);
    return request;
}

/** `fetchDoctor`, but at most once per TTL per doctor. */
export function fetchDoctorCached(doctorId: string): Promise<DBDoctor | null> {
    return cachedRead(`doctor.${doctorId}`, () => fetchDoctor(doctorId));
}

/** `fetchHospital`, but at most once per TTL per hospital. */
export function fetchHospitalCached(hospitalId: string): Promise<DBHospital | null> {
    return cachedRead(`hospital.${hospitalId}`, () => fetchHospital(hospitalId));
}

/** Call after ANY write to this doctor's row (photo, name, signature). */
export function invalidateDoctor(doctorId: string): void {
    drop(`doctor.${doctorId}`);
}

/** Call after ANY write to this hospital's row (logo, name, specialty…). */
export function invalidateHospital(hospitalId: string): void {
    drop(`hospital.${hospitalId}`);
}

/** Everything, e.g. on logout — the next session must not inherit this one's
 *  clinic identity from a shared machine's localStorage. */
export function clearProfileCache(): void {
    memory.clear();
    pending.clear();
    try {
        for (const key of Object.keys(localStorage)) {
            if (key.startsWith(KEY_PREFIX)) localStorage.removeItem(key);
        }
    } catch {
        /* nothing to do */
    }
}
