// ---------------------------------------------------------------------------
// Offline replica of lib/db/medicines.ts's exact-name lookups
// (resolveProductByName/fetchProductsByNames) — the "doctor typed or
// searched a specific brand name directly" path, distinct from
// offlineBrands.ts's ranked-by-composition path. Mirrors that file's own
// `hydrate()` field-for-field, including its one deliberate quirk:
// `strengthMg` is always null here too, because `medicine_composition_map`
// never carried that column online either — the catalogue puts strength in
// the product NAME instead (see hydrate()'s own comment). Diverging from
// that here would mean a product's card looks different depending on
// whether the device happened to be online when it was resolved.
// ---------------------------------------------------------------------------

import { localDB } from "./db";
import type { ResolvedProduct } from "../db/medicines";

async function offlineHydrate(
    medIds: number[],
    names: Map<number, string>,
    primaryOf: Map<number, number>
): Promise<ResolvedProduct[]> {
    if (medIds.length === 0) return [];

    const mapRowsPerMedicine = await Promise.all(
        medIds.map((id) => localDB.medicineCompositionMap.where("medicineId").equals(id).toArray())
    );

    const out: ResolvedProduct[] = [];
    for (let i = 0; i < medIds.length; i++) {
        const medId = medIds[i];
        const mine = mapRowsPerMedicine[i];
        // Same rule as the online hydrate(): a medicine with no composition
        // rows is a catalogue defect, not something to render.
        if (mine.length === 0) continue;

        const compositionIds = [...new Set(mine.map((r) => r.compositionId))].sort((a, b) => a - b);
        const primary = primaryOf.get(medId) ?? compositionIds[0];

        const compositions = await localDB.compositionsCatalogue.bulkGet(compositionIds);
        const compNameById = new Map<number, string>();
        compositions.forEach((c, idx) => {
            if (c) compNameById.set(compositionIds[idx], c.name);
        });

        out.push({
            id: medId,
            compositionId: primary,
            compositionIds,
            compositionLabels: compositionIds.map((id) => compNameById.get(id) ?? `#${id}`),
            name: names.get(medId) ?? `#${medId}`,
            form: mine.find((r) => r.route)?.route ?? null,
            strengthMg: null,
            prescriptionCount: 0,
            isClinicDefault: false,
        });
    }
    return out;
}

/** Offline counterpart to `resolveProductByName` — same exact-match rule
 *  (shortest name wins a tie), just against the local mirror's `name` index
 *  instead of a live `.eq()`. */
export async function offlineResolveProductByName(name: string): Promise<ResolvedProduct | null> {
    const q = name.trim();
    if (!q) return null;

    const rows = await localDB.medicinesCatalogue.where("name").equals(q).toArray();
    if (rows.length === 0) return null;

    rows.sort((a, b) => a.name.length - b.name.length || a.name.localeCompare(b.name));
    const pick = rows[0];

    const products = await offlineHydrate([pick.id], new Map([[pick.id, pick.name]]), new Map());
    return products[0] ?? null;
}

/** Offline counterpart to `fetchProductsByNames`. */
export async function offlineFetchProductsByNames(names: string[]): Promise<Map<string, ResolvedProduct>> {
    const out = new Map<string, ResolvedProduct>();
    const wanted = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
    if (wanted.length === 0) return out;

    const rows = await localDB.medicinesCatalogue.where("name").anyOf(wanted).toArray();
    if (rows.length === 0) return out;

    const namesById = new Map<number, string>(rows.map((r) => [r.id, r.name]));
    const products = await offlineHydrate([...namesById.keys()], namesById, new Map());
    for (const p of products) out.set(p.name, p);
    return out;
}
