// ---------------------------------------------------------------------------
// Whether the two background-sync jobs — the medicine catalogue mirror
// (catalogueSync.ts, ~525k rows) and the 3-month patient prefetch
// (patientPrefetch.ts) — are allowed to run at all.
//
// On by default, matching what both already did before this existed. The
// Settings toggle (SettingsPage.tsx, "Data & Sync") is an escape hatch
// for a doctor who wants to hold off on the egress right now, not a new
// default: "I don't need them all for right now, it just counts as an
// egress in database" (Anmol, 2026-09-19).
//
// TWO separate flags, not one (2026-09-20 correction) — the first version
// had a single switch for both, on the reasoning that a doctor asking to
// hold off on one job is asking to hold off on both. Anmol's follow-up:
// "there should also be option of turning off the medicine downloading
// thing into your browser" — the catalogue mirror (525k rows, the bigger
// of the two by far) is worth holding off on independently of the 3-month
// patient backup, which is much smaller per doctor. Same shape, same
// default, just two keys instead of one.
//
// Per-doctor, per-device — the same Dexie `meta` table already used for
// `patientPrefetchAt:<doctorId>`, and the same scope: this is a preference
// about what THIS BROWSER downloads for THIS DOCTOR, not a clinic-wide
// policy, so it lives in the local mirror rather than a synced row in
// Postgres.
// ---------------------------------------------------------------------------

import { localDB } from "./db";

const catalogueKey = (doctorId: string) => `catalogueSyncEnabled:${doctorId}`;
const prefetchKey = (doctorId: string) => `patientPrefetchEnabled:${doctorId}`;

async function readFlag(doctorId: string | null, key: (id: string) => string): Promise<boolean> {
    if (!doctorId) return true;
    const row = await localDB.meta.get(key(doctorId));
    // Absent means never turned off — the pre-existing, always-on behaviour.
    return row?.value !== false;
}

export async function isCatalogueSyncEnabled(doctorId: string | null): Promise<boolean> {
    return readFlag(doctorId, catalogueKey);
}

export async function setCatalogueSyncEnabled(doctorId: string, enabled: boolean): Promise<void> {
    await localDB.meta.put({ key: catalogueKey(doctorId), value: enabled });
}

export async function isPatientPrefetchEnabled(doctorId: string | null): Promise<boolean> {
    return readFlag(doctorId, prefetchKey);
}

export async function setPatientPrefetchEnabled(doctorId: string, enabled: boolean): Promise<void> {
    await localDB.meta.put({ key: prefetchKey(doctorId), value: enabled });
}
