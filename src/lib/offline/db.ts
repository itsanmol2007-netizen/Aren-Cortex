// ---------------------------------------------------------------------------
// The local mirror. IndexedDB, via Dexie, scoped to the SIGNED-IN DOCTOR's own
// data — not the whole clinic. Front desk and the doctor's own app are not
// trying to sync with each other while offline (an explicit, accepted scope
// boundary, not a gap); each side only ever needs to survive on its own
// already-seen data plus whatever it writes itself.
//
// Three kinds of table live here:
//   - `writeQueue`   durable, reload-surviving outbox for writes made while
//                    offline (or that simply haven't confirmed yet). See
//                    writeQueue.ts, which is the only module that touches it.
//   - the *Mirror tables  a read cache of this doctor's own patients, visits
//                    and prescriptions, refreshed opportunistically whenever
//                    the network already answered a query for other reasons
//                    (see localMirror.ts) — never the sole source of truth,
//                    always a "last known good" to read from when offline.
//   - `meta`         small key/value store: lastConfirmedOnlineAt, the
//                    catalogue version installed, per-doctor housekeeping.
//
// One database per browser profile, not per clinic or doctor — every table
// that holds patient data carries its own `doctorId`/`hospitalId` columns and
// every query filters by them, the same discipline Postgres RLS enforces
// server-side. A shared machine that signs out one doctor and signs in
// another still only ever surfaces rows for the doctor asking.
// ---------------------------------------------------------------------------

import Dexie, { type EntityTable } from "dexie";

export type WriteQueueStatus = "pending" | "sending" | "failed";

export interface WriteQueueRow {
    /** Auto-incrementing local id — never sent anywhere, purely a queue key. */
    id?: number;
    /** Registered handler name — see writeQueue.ts's `registerWriteHandler`. */
    kind: string;
    /** Whatever the handler needs to replay this write. Must be plain JSON:
     *  Dexie/IndexedDB can store more, but this queue survives app upgrades
     *  and handler rewrites better if the payload never carries a class
     *  instance, a File, or a function.
     *
     *  When `encrypted` is true this is a `Ciphertext` (see
     *  lib/security/crypto.ts) instead of the plain payload — real patient
     *  PII (a new patient's name/phone/DOB) sitting in IndexedDB is exactly
     *  the "laptop stolen overnight" scenario the PIN lock exists for, so a
     *  queued write is encrypted under the signed-in doctor's DEK whenever
     *  one is available at enqueue time. See writeQueue.ts. */
    payload: unknown;
    encrypted: boolean;
    hospitalId: string;
    doctorId: string | null;
    createdAt: number;
    attempts: number;
    lastError: string | null;
    lastAttemptAt: number | null;
    status: WriteQueueStatus;
}

/** A doctor's own patient/visit/prescription row, cached for offline reads.
 *  Deliberately loose (`unknown` for the payload) — this is a cache of
 *  whatever the last successful fetch returned (an object, an array, a
 *  primitive), not a second schema to keep in lockstep with Postgres
 *  migrations. `id` is not always a database row id — see localMirror.ts's
 *  `readThrough`, which also caches LIST reads under a synthetic key such
 *  as `"recent:${doctorId}"`. `doctorId` is null for a front-desk read
 *  (hospital-scoped, not any one doctor's) — both fields are best-effort
 *  bookkeeping for a future "wipe this doctor's/hospital's rows on
 *  logout" (not built yet, see localMirror.ts), not what keeps one
 *  account's data from leaking into another's: that guarantee comes from
 *  `id` itself always embedding the scoping id the read actually needs. */
export interface MirrorRow {
    id: string;
    doctorId: string | null;
    hospitalId: string;
    updatedAt: number;
    data: unknown;
}

export interface MetaRow {
    key: string;
    value: unknown;
}

/**
 * The medicine catalogue's local mirror — see catalogueSync.ts. Unlike the
 * *Mirror tables above, this is NOT per-doctor: the global catalogue is the
 * same rows for every doctor on this device, so there is exactly one copy
 * of each, not one per signed-in doctor. `hospitalId` is null for a global
 * (catalogue snapshot) row and set for a hospital's own pending doctor-added
 * medicine (see `addMedicine` in lib/db/synapse.ts) — the small live-fetched
 * addendum catalogueSync.ts layers on top of the shared snapshot.
 */
export interface MedicineRow {
    id: number;
    name: string;
    manufacturer: string | null;
    /** null = global catalogue; set = this hospital's own pending addition */
    hospitalId: string | null;
}

export interface CompositionRow {
    id: number;
    name: string;
    specializationScope: string[];
}

/** No natural single-column key — `id` is synthetic (`${medicineId}:${compositionId}`),
 *  never sent anywhere, purely a Dexie primary key. */
export interface MedicineCompositionMapRow {
    id: string;
    medicineId: number;
    compositionId: number;
    isPrimary: boolean;
    route: string | null;
}

class ArenLocalDB extends Dexie {
    writeQueue!: EntityTable<WriteQueueRow, "id">;
    patientsMirror!: EntityTable<MirrorRow, "id">;
    visitsMirror!: EntityTable<MirrorRow, "id">;
    prescriptionsMirror!: EntityTable<MirrorRow, "id">;
    meta!: EntityTable<MetaRow, "key">;
    medicinesCatalogue!: EntityTable<MedicineRow, "id">;
    compositionsCatalogue!: EntityTable<CompositionRow, "id">;
    medicineCompositionMap!: EntityTable<MedicineCompositionMapRow, "id">;

    constructor() {
        super("aren-cortex-local");
        this.version(1).stores({
            writeQueue: "++id, kind, status, createdAt, doctorId",
            patientsMirror: "id, doctorId, updatedAt",
            visitsMirror: "id, doctorId, updatedAt",
            prescriptionsMirror: "id, doctorId, updatedAt",
            meta: "key",
        });
        // v2: the medicine catalogue mirror (see catalogueSync.ts) — doctor
        // role only, front desk never populates or reads these. Every store
        // from v1 must be restated here even though none of them change;
        // Dexie's versioning always wants the FULL schema at each version,
        // not just the diff.
        this.version(2).stores({
            writeQueue: "++id, kind, status, createdAt, doctorId",
            patientsMirror: "id, doctorId, updatedAt",
            visitsMirror: "id, doctorId, updatedAt",
            prescriptionsMirror: "id, doctorId, updatedAt",
            meta: "key",
            medicinesCatalogue: "id, name, hospitalId",
            compositionsCatalogue: "id, name",
            // `compositionId` indexed — the hot lookup direction is "which
            // medicines contain this molecule" (composition -> medicines),
            // the same direction `medicine_composition_map`'s own read
            // pattern favours server-side.
            medicineCompositionMap: "id, medicineId, compositionId",
        });
    }
}

// A single instance for the whole tab — Dexie already pools connections
// internally, and every module below imports this rather than constructing
// its own.
export const localDB = new ArenLocalDB();
