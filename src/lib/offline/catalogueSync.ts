// ---------------------------------------------------------------------------
// Syncs the medicine catalogue mirror (medicinesCatalogue/compositionsCatalogue/
// medicineCompositionMap in db.ts) from Supabase + the S3/CloudFront
// snapshot. Doctor-role only — see docs/context/offline-security.md's
// role-scoping rule: front desk never imports or calls anything here.
//
// Trigger: called from useSynapse.ts on every real-doctor load, fire-and-
// forget (never blocks the ruleset load). The agreed UX: automatic,
// background, invisible — except a one-time visible step on this device's
// very first sync, when there's a real multi-second download happening.
// `subscribeCatalogueSync`/`getCatalogueSyncState` are what a status
// indicator (Settings' System Health row) reads; nothing here renders
// anything itself.
//
// ── Cold start (nothing locally yet) ───────────────────────────────────
// Download the full snapshot (3 gzip files, URLs from catalogue_meta) and
// bulk-insert. Then a small delta closes the gap between the version the
// snapshot was baked at and whatever changed since — normally nothing.
//
// ── Warm sync (already have SOME version) ──────────────────────────────
// A direct delta query (`version > local`), paginated at PostgREST's real
// page cap (1000 — see catalogue-snapshot-build's own comment on the exact
// same number). Falls back to redownloading the whole snapshot only when
// the device is SO far behind that the delta itself would be huge —
// catalogue changes are infrequent and admin-driven, so this is rare.
// ---------------------------------------------------------------------------

import { supabase } from "../supabase";
import { localDB, type MedicineRow, type CompositionRow, type MedicineCompositionMapRow } from "./db";

const META_KEY = "catalogueVersion";
const PAGE_SIZE = 1000;
// A delta this large is cheaper fetched as one compressed snapshot file
// than as dozens of sequential paginated requests.
const FALLBACK_TO_SNAPSHOT_ROWS = 20000;

export type CatalogueSyncPhase = "idle" | "checking" | "downloading-snapshot" | "delta" | "done" | "error";

export interface CatalogueSyncState {
    phase: CatalogueSyncPhase;
    /** 0-1, only meaningful during "downloading-snapshot" */
    progress: number;
    error: string | null;
    localVersion: number;
    lastSyncedAt: number | null;
}

let state: CatalogueSyncState = {
    phase: "idle", progress: 0, error: null, localVersion: 0, lastSyncedAt: null,
};
const listeners = new Set<() => void>();

function setState(patch: Partial<CatalogueSyncState>): void {
    state = { ...state, ...patch };
    for (const l of listeners) l();
}

export function getCatalogueSyncState(): CatalogueSyncState {
    return state;
}

export function subscribeCatalogueSync(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

async function getLocalVersion(): Promise<number> {
    const row = await localDB.meta.get(META_KEY);
    return typeof row?.value === "number" ? row.value : 0;
}

async function setLocalVersion(v: number): Promise<void> {
    await localDB.meta.put({ key: META_KEY, value: v });
}

interface RemoteMeta {
    currentVersion: number;
    snapshotVersion: number | null;
    urls: { medicines: string | null; compositions: string | null; map: string | null };
}

async function fetchRemoteMeta(): Promise<RemoteMeta> {
    const { data, error } = await supabase
        .from("catalogue_meta")
        .select("current_version, snapshot_version, snapshot_medicines_url, snapshot_compositions_url, snapshot_map_url")
        .eq("id", true)
        .single();
    if (error) throw new Error(`catalogue_meta: ${error.message}`);
    return {
        currentVersion: data.current_version,
        snapshotVersion: data.snapshot_version,
        urls: {
            medicines: data.snapshot_medicines_url,
            compositions: data.snapshot_compositions_url,
            map: data.snapshot_map_url,
        },
    };
}

interface SnapshotFile {
    version: number;
    columns: string[];
    rows: unknown[][];
}

async function downloadSnapshotFile(url: string): Promise<SnapshotFile> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`snapshot fetch ${url}: HTTP ${res.status}`);
    const buf = await res.arrayBuffer();
    let text: string;
    try {
        // The object is stored gzip-compressed with Content-Encoding: gzip
        // (see catalogue-snapshot-build) — but whether fetch() already
        // transparently decoded that before handing back the buffer depends
        // on the server/CDN, not something to assume either way. Try
        // decompressing explicitly first.
        const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream("gzip"));
        text = await new Response(stream).text();
    } catch {
        // Already plain JSON — the browser decoded the gzip transparently.
        text = new TextDecoder().decode(buf);
    }
    return JSON.parse(text) as SnapshotFile;
}

function rowsToMedicines(columns: string[], rows: unknown[][]): MedicineRow[] {
    const idIdx = columns.indexOf("id");
    const nameIdx = columns.indexOf("name");
    const manuIdx = columns.indexOf("manufacturer");
    const strengthIdx = columns.indexOf("strength_mg");
    return rows.map((r) => ({
        id: Number(r[idIdx]),
        name: String(r[nameIdx]),
        manufacturer: r[manuIdx] == null ? null : String(r[manuIdx]),
        strengthMg: strengthIdx === -1 || r[strengthIdx] == null ? null : Number(r[strengthIdx]),
        hospitalId: null,
    }));
}

function rowsToCompositions(columns: string[], rows: unknown[][]): CompositionRow[] {
    const idIdx = columns.indexOf("id");
    const nameIdx = columns.indexOf("name");
    const scopeIdx = columns.indexOf("specialization_scope");
    return rows.map((r) => ({
        id: Number(r[idIdx]),
        name: String(r[nameIdx]),
        specializationScope: (r[scopeIdx] as string[] | null) ?? [],
    }));
}

function rowsToMap(columns: string[], rows: unknown[][]): MedicineCompositionMapRow[] {
    const medIdx = columns.indexOf("medicine_id");
    const compIdx = columns.indexOf("composition_id");
    const primIdx = columns.indexOf("is_primary");
    const routeIdx = columns.indexOf("route");
    return rows.map((r) => {
        const medicineId = Number(r[medIdx]);
        const compositionId = Number(r[compIdx]);
        return {
            id: `${medicineId}:${compositionId}`,
            medicineId,
            compositionId,
            isPrimary: !!r[primIdx],
            route: r[routeIdx] == null ? null : String(r[routeIdx]),
        };
    });
}

async function installSnapshot(urls: RemoteMeta["urls"], onProgress: (p: number) => void): Promise<void> {
    const steps: { url: string | null; apply: (f: SnapshotFile) => Promise<unknown> }[] = [
        { url: urls.compositions, apply: (f) => localDB.compositionsCatalogue.bulkPut(rowsToCompositions(f.columns, f.rows)) },
        { url: urls.medicines, apply: (f) => localDB.medicinesCatalogue.bulkPut(rowsToMedicines(f.columns, f.rows)) },
        { url: urls.map, apply: (f) => localDB.medicineCompositionMap.bulkPut(rowsToMap(f.columns, f.rows)) },
    ];
    for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        // A table whose snapshot hasn't been built yet is skipped, not
        // failed — the delta query that follows still fills it in from
        // scratch (slower, correct) rather than blocking the other two.
        if (step.url) {
            const file = await downloadSnapshotFile(step.url);
            await step.apply(file);
        }
        onProgress((i + 1) / steps.length);
    }
}

/**
 * Direct delta from Postgres, paginated at PostgREST's real page cap.
 * Returns false (caller should fall back to a full snapshot redownload)
 * once the delta exceeds `maxRows` — pass `Infinity` when there is no
 * snapshot to fall back to (nothing built yet), so the delta is the only
 * path and must run to completion regardless of size.
 */
async function applyDelta(sinceVersion: number, maxRows: number): Promise<boolean> {
    let total = 0;

    let offset = 0;
    for (;;) {
        const { data, error } = await supabase
            .from("compositions")
            .select("id, name, specialization_scope, version")
            .gt("version", sinceVersion)
            .order("version", { ascending: true })
            .range(offset, offset + PAGE_SIZE - 1);
        if (error) throw new Error(`compositions delta: ${error.message}`);
        if (!data || data.length === 0) break;
        total += data.length;
        if (total > maxRows) return false;
        await localDB.compositionsCatalogue.bulkPut(
            data.map((r: any) => ({ id: Number(r.id), name: r.name, specializationScope: r.specialization_scope ?? [] }))
        );
        if (data.length < PAGE_SIZE) break;
        offset += PAGE_SIZE;
    }

    offset = 0;
    for (;;) {
        // Global rows only — the same `hospital_id IS NULL` scope the
        // snapshot itself uses. A hospital's own pending additions are
        // handled separately by `syncHospitalMedicines`, always live.
        const { data, error } = await supabase
            .from("medicines")
            .select("id, name, manufacturer, strength_mg, version")
            .is("hospital_id", null)
            .gt("version", sinceVersion)
            .order("version", { ascending: true })
            .range(offset, offset + PAGE_SIZE - 1);
        if (error) throw new Error(`medicines delta: ${error.message}`);
        if (!data || data.length === 0) break;
        total += data.length;
        if (total > maxRows) return false;
        await localDB.medicinesCatalogue.bulkPut(
            data.map((r: any) => ({
                id: Number(r.id), name: r.name, manufacturer: r.manufacturer ?? null,
                strengthMg: r.strength_mg == null ? null : Number(r.strength_mg), hospitalId: null,
            }))
        );
        if (data.length < PAGE_SIZE) break;
        offset += PAGE_SIZE;
    }

    offset = 0;
    for (;;) {
        const { data, error } = await supabase
            .from("medicine_composition_map")
            .select("medicine_id, composition_id, is_primary, route, version")
            .gt("version", sinceVersion)
            .order("version", { ascending: true })
            .range(offset, offset + PAGE_SIZE - 1);
        if (error) throw new Error(`medicine_composition_map delta: ${error.message}`);
        if (!data || data.length === 0) break;
        total += data.length;
        if (total > maxRows) return false;
        await localDB.medicineCompositionMap.bulkPut(
            data.map((r: any) => ({
                id: `${r.medicine_id}:${r.composition_id}`,
                medicineId: Number(r.medicine_id),
                compositionId: Number(r.composition_id),
                isPrimary: !!r.is_primary,
                route: r.route ?? null,
            }))
        );
        if (data.length < PAGE_SIZE) break;
        offset += PAGE_SIZE;
    }

    return true;
}

/**
 * This hospital's own pending doctor-added medicines (`addMedicine` in
 * lib/db/synapse.ts) — small, always fetched live, never part of the
 * shared snapshot (see catalogue-snapshot-build's own comment on why: a
 * global, CDN-cached file has no business holding one clinic's unapproved
 * additions). Re-run every sync regardless of version, since these rows
 * carry no version number of their own to delta against.
 */
async function syncHospitalMedicines(hospitalId: string): Promise<void> {
    const { data, error } = await supabase
        .from("medicines")
        .select("id, name, manufacturer, strength_mg")
        .eq("hospital_id", hospitalId);
    if (error) throw new Error(`hospital medicines: ${error.message}`);
    if (!data || data.length === 0) return;
    await localDB.medicinesCatalogue.bulkPut(
        data.map((r: any) => ({
            id: Number(r.id), name: r.name, manufacturer: r.manufacturer ?? null,
            strengthMg: r.strength_mg == null ? null : Number(r.strength_mg), hospitalId,
        }))
    );
}

let inFlight: Promise<void> | null = null;

/**
 * The one entry point. Safe to call repeatedly (e.g. once per useSynapse
 * load) — a sync already in flight is reused rather than duplicated, and a
 * device already at the current version resolves almost instantly (one
 * small read, nothing more).
 */
export function syncCatalogue(hospitalId: string): Promise<void> {
    if (inFlight) return inFlight;
    inFlight = runSync(hospitalId).finally(() => {
        inFlight = null;
    });
    return inFlight;
}

async function runSync(hospitalId: string): Promise<void> {
    setState({ phase: "checking", error: null });
    try {
        const [local, remote] = await Promise.all([getLocalVersion(), fetchRemoteMeta()]);
        setState({ localVersion: local });

        if (local >= remote.currentVersion) {
            await syncHospitalMedicines(hospitalId).catch(() => { /* best-effort, never blocks "done" */ });
            setState({ phase: "done", lastSyncedAt: Date.now() });
            return;
        }

        let version = local;

        // Cold start, and a snapshot exists to seed from — the common case.
        if (version === 0 && remote.snapshotVersion != null) {
            setState({ phase: "downloading-snapshot", progress: 0 });
            await installSnapshot(remote.urls, (progress) => setState({ progress }));
            version = remote.snapshotVersion;
            await setLocalVersion(version);
            setState({ localVersion: version });
        }

        if (version < remote.currentVersion) {
            setState({ phase: "delta" });
            // No snapshot to fall back to means the delta IS the only path
            // (a device syncing before any snapshot has ever been built) —
            // let it run to completion regardless of size in that case.
            const hasSnapshotFallback = remote.snapshotVersion != null;
            const ok = await applyDelta(version, hasSnapshotFallback ? FALLBACK_TO_SNAPSHOT_ROWS : Infinity);
            if (ok) {
                version = remote.currentVersion;
                await setLocalVersion(version);
            } else {
                setState({ phase: "downloading-snapshot", progress: 0 });
                const fresh = await fetchRemoteMeta();
                await installSnapshot(fresh.urls, (progress) => setState({ progress }));
                version = fresh.snapshotVersion ?? version;
                await setLocalVersion(version);
                // Any gap between this snapshot's version and fresh.currentVersion
                // (whatever changed in the seconds this took) closes itself
                // on the NEXT sync — never large enough to be worth a second
                // delta pass here.
            }
        }

        await syncHospitalMedicines(hospitalId).catch(() => { /* best-effort */ });
        setState({ phase: "done", localVersion: version, lastSyncedAt: Date.now() });
    } catch (e) {
        setState({ phase: "error", error: e instanceof Error ? e.message : String(e) });
        throw e;
    }
}
