// ---------------------------------------------------------------------------
// Offline replica of `composition_brands()` — the Postgres RPC that ranks
// which medicine brands to show for a composition. This has to reproduce
// its exact SQL, not approximate it: the ordering IS the clinical decision
// (a doctor's own habit outranking the catalogue default, a paediatric form
// surfacing ahead of an adult one), so a "close enough" reimplementation
// would quietly change what gets prescribed depending on whether the
// device happens to be online.
//
// The real function's source (pulled directly from the live database
// before writing this — see docs/context/offline-security.md):
//
//   with visible as (
//     select b.* from mv_composition_brand b
//     where b.composition_id = any(p_composition_ids)
//       and (b.hospital_id is null or p_hospital_id is null or b.hospital_id = p_hospital_id)
//   ),
//   totals as (
//     select v.composition_id,
//       count(*) filter (where v.ingredient_count = 1) as single_total,
//       count(*) filter (where v.ingredient_count > 1) as combination_total
//     from visible v group by v.composition_id
//   ),
//   ranked as (
//     select v.*, row_number() over (
//       partition by v.composition_id
//       order by
//         (v.medicine_id = any(p_keep_medicine_ids)) desc,
//         (p_pediatric and v.route in ('syrup', 'drops')) desc,
//         v.is_primary desc,
//         v.name
//     ) as rn
//     from visible v where v.ingredient_count = 1
//   )
//   select t.composition_id, r.medicine_id, r.name, r.manufacturer, r.strength_mg,
//          r.route, r.is_primary, r.ingredient_count, t.single_total, t.combination_total
//   from totals t left join ranked r on r.composition_id = t.composition_id and r.rn <= greatest(p_limit, 1)
//   order by t.composition_id, r.rn;
//
// `mv_composition_brand` itself is `medicine_composition_map` joined to
// `medicines`, with `ingredient_count` computed as "how many rows does this
// medicine_id have in medicine_composition_map total" (NOT scoped to the
// composition being asked about — a medicine's ingredient count is the same
// number no matter which of its molecules you looked it up through). That's
// exactly `ingredientCountOf` below.
//
// A composition with NO visible row at all (nothing in `totals`) produces NO
// output row — `fetchCompositionBrands`'s own downstream code already
// defaults an absent composition to empty candidates/zero totals, so
// omitting it here is equivalent, not a shortcut. A composition with visible
// rows but zero SINGLE-molecule ones still needs ONE output row (medicine
// fields null) purely to carry `single_total`/`combination_total` through —
// see `fetchCompositionBrands`'s own comment on why that row exists.
// ---------------------------------------------------------------------------

import { localDB, type MedicineCompositionMapRow, type MedicineRow } from "./db";
import type { BrandRow } from "../db/synapse";

export interface OfflineBrandsOpts {
    compositionIds: number[];
    /** BRAND_CANDIDATES online — same constant, passed by the caller so this
     *  file doesn't have to import a value that lives in lib/db/synapse.ts
     *  purely for consult-tuning reasons unrelated to this replica. */
    limit: number;
    /** null when the signed-in account has no verified hospital yet — matches
     *  `p_hospital_id default null`, under which EVERY hospital's pending
     *  additions become visible (the RPC's own three-way OR), not just none. */
    hospitalId: string | null;
    pediatric: boolean;
    /** doctor's own history + the clinic's declared default — see
     *  `fetchCompositionBrands`'s own `keep` computation, unchanged, shared
     *  by both the online and offline path. */
    keepMedicineIds: number[];
}

/** A composition is visible to this hospital under the SAME three-way OR the
 *  real RPC uses: global, or the caller has no hospital context at all, or
 *  it's this exact hospital's own addition. */
function isVisible(medicine: MedicineRow, hospitalId: string | null): boolean {
    return medicine.hospitalId == null || hospitalId == null || medicine.hospitalId === hospitalId;
}

export async function offlineCompositionBrands(opts: OfflineBrandsOpts): Promise<BrandRow[]> {
    if (opts.compositionIds.length === 0) return [];

    const mapRows = await localDB.medicineCompositionMap
        .where("compositionId")
        .anyOf(opts.compositionIds)
        .toArray();
    if (mapRows.length === 0) return [];

    const medicineIds = [...new Set(mapRows.map((r) => r.medicineId))];
    const medicineRows = await localDB.medicinesCatalogue.bulkGet(medicineIds);
    const medicineById = new Map<number, MedicineRow>();
    medicineRows.forEach((m, i) => {
        if (m) medicineById.set(medicineIds[i], m);
    });

    // ingredient_count per medicine — a count over ALL of that medicine's map
    // rows, not just the ones touching a composition we were asked about (a
    // combination's OTHER molecule may not be in `opts.compositionIds` at
    // all). Indexed on medicineId, so each of these is a cheap lookup, run
    // in parallel rather than one at a time.
    const ingredientCounts = new Map<number, number>();
    await Promise.all(
        medicineIds.map(async (medId) => {
            const count = await localDB.medicineCompositionMap.where("medicineId").equals(medId).count();
            ingredientCounts.set(medId, count);
        })
    );

    const keep = new Set(opts.keepMedicineIds);
    const byComposition = new Map<number, MedicineCompositionMapRow[]>();
    for (const r of mapRows) {
        if (!opts.compositionIds.includes(r.compositionId)) continue;
        const medicine = medicineById.get(r.medicineId);
        // A map row whose medicine never resolves is a catalogue defect (or
        // simply hasn't synced yet) — same rule `hydrate()` in
        // lib/db/medicines.ts already uses: skip it, don't render a gap.
        if (!medicine) continue;
        if (!isVisible(medicine, opts.hospitalId)) continue;
        const list = byComposition.get(r.compositionId);
        if (list) list.push(r);
        else byComposition.set(r.compositionId, [r]);
    }

    const out: BrandRow[] = [];
    for (const compositionId of opts.compositionIds) {
        const rows = byComposition.get(compositionId);
        // No visible row at all — the real RPC's `totals` CTE has nothing to
        // group here either, so it emits nothing for this composition.
        if (!rows || rows.length === 0) continue;

        let singleTotal = 0;
        let combinationTotal = 0;
        const singleRows: { row: MedicineCompositionMapRow; medicine: MedicineRow; ingredientCount: number }[] = [];
        for (const row of rows) {
            const medicine = medicineById.get(row.medicineId)!;
            const ingredientCount = ingredientCounts.get(row.medicineId) ?? 1;
            if (ingredientCount === 1) {
                singleTotal++;
                singleRows.push({ row, medicine, ingredientCount });
            } else {
                combinationTotal++;
            }
        }

        // Same ORDER BY as the SQL, in the same priority order: doctor's own
        // history/clinic default first, then a paediatric-appropriate form,
        // then the catalogue's own "primary" flag, then alphabetical.
        singleRows.sort((a, b) => {
            const aKeep = keep.has(a.row.medicineId) ? 1 : 0;
            const bKeep = keep.has(b.row.medicineId) ? 1 : 0;
            if (aKeep !== bKeep) return bKeep - aKeep;

            const aPed = opts.pediatric && (a.row.route === "syrup" || a.row.route === "drops") ? 1 : 0;
            const bPed = opts.pediatric && (b.row.route === "syrup" || b.row.route === "drops") ? 1 : 0;
            if (aPed !== bPed) return bPed - aPed;

            if (a.row.isPrimary !== b.row.isPrimary) return a.row.isPrimary ? -1 : 1;

            return a.medicine.name.localeCompare(b.medicine.name);
        });

        const top = singleRows.slice(0, Math.max(opts.limit, 1));

        if (top.length === 0) {
            // Combination-only coverage — one placeholder row purely to carry
            // the totals through, exactly like the RPC's unmatched LEFT JOIN.
            out.push({
                composition_id: compositionId,
                medicine_id: null,
                name: null,
                manufacturer: null,
                strength_mg: null,
                route: null,
                is_primary: false,
                ingredient_count: 0,
                single_total: singleTotal,
                combination_total: combinationTotal,
            });
            continue;
        }

        for (const { row, medicine, ingredientCount } of top) {
            out.push({
                composition_id: compositionId,
                medicine_id: row.medicineId,
                name: medicine.name,
                manufacturer: medicine.manufacturer,
                strength_mg: medicine.strengthMg,
                route: row.route,
                is_primary: row.isPrimary,
                ingredient_count: ingredientCount,
                single_total: singleTotal,
                combination_total: combinationTotal,
            });
        }
    }

    return out;
}
