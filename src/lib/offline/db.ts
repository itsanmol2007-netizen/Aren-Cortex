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
     *  instance, a File, or a function. */
    payload: unknown;
    hospitalId: string;
    doctorId: string | null;
    createdAt: number;
    attempts: number;
    lastError: string | null;
    lastAttemptAt: number | null;
    status: WriteQueueStatus;
}

/** A doctor's own patient/visit/prescription row, cached for offline reads.
 *  Deliberately loose (`Record<string, unknown>` for the payload) — this is a
 *  cache of whatever the last successful fetch returned, not a second schema
 *  to keep in lockstep with Postgres migrations. */
export interface MirrorRow {
    id: string;
    doctorId: string;
    hospitalId: string;
    updatedAt: number;
    data: Record<string, unknown>;
}

export interface MetaRow {
    key: string;
    value: unknown;
}

class ArenLocalDB extends Dexie {
    writeQueue!: EntityTable<WriteQueueRow, "id">;
    patientsMirror!: EntityTable<MirrorRow, "id">;
    visitsMirror!: EntityTable<MirrorRow, "id">;
    prescriptionsMirror!: EntityTable<MirrorRow, "id">;
    meta!: EntityTable<MetaRow, "key">;

    constructor() {
        super("aren-cortex-local");
        this.version(1).stores({
            writeQueue: "++id, kind, status, createdAt, doctorId",
            patientsMirror: "id, doctorId, updatedAt",
            visitsMirror: "id, doctorId, updatedAt",
            prescriptionsMirror: "id, doctorId, updatedAt",
            meta: "key",
        });
    }
}

// A single instance for the whole tab — Dexie already pools connections
// internally, and every module below imports this rather than constructing
// its own.
export const localDB = new ArenLocalDB();
