// ---------------------------------------------------------------------------
// Whether the two background-sync jobs — the medicine catalogue mirror
// (catalogueSync.ts, ~525k rows) and the 3-month patient prefetch
// (patientPrefetch.ts) — are allowed to run at all.
//
// On by default, matching what both already did before this existed. The
// Settings toggle (SettingsPage.tsx, "Background sync") is an escape hatch
// for a doctor who wants to hold off on the egress right now, not a new
// default: "I don't need them all for right now, it just counts as an
// egress in database" (Anmol, 2026-09-19).
//
// Per-doctor, per-device — the same Dexie `meta` table
// `patientPrefetchAt:<doctorId>` already uses, and the same scope: this is a
// preference about what THIS BROWSER downloads for THIS DOCTOR, not a
// clinic-wide policy, so it lives in the local mirror rather than a synced
// row in Postgres.
// ---------------------------------------------------------------------------

import { localDB } from "./db";

const prefKey = (doctorId: string) => `backgroundSyncEnabled:${doctorId}`;

export async function isBackgroundSyncEnabled(doctorId: string | null): Promise<boolean> {
    if (!doctorId) return true;
    const row = await localDB.meta.get(prefKey(doctorId));
    // Absent means never turned off — the pre-existing, always-on behaviour.
    return row?.value !== false;
}

export async function setBackgroundSyncEnabled(doctorId: string, enabled: boolean): Promise<void> {
    await localDB.meta.put({ key: prefKey(doctorId), value: enabled });
}
