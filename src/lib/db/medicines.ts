// ---------------------------------------------------------------------------
// PRODUCTS, as products.
//
// ── The bug this module exists to end ──────────────────────────────────────
// Every other path to a medicine in this codebase goes through
// `composition_brands`, which states its own rule at synapse.ts:448:
//
//   "A brand is only offered for a composition when the product contains that
//    molecule ALONE. The RPC filters on ingredient_count = 1."
//
// So the resolver was STRUCTURALLY INCAPABLE of returning a combination. A
// doctor could search "Acenac-P", see it in the results, press Prescribe, and
// get either a different single-molecule product or, when the molecule had no
// single-molecule product at all, nothing: `resolveBrandFor` returned null,
// the confirm sheet opened with no brand, and `commitAccept` deleted the
// intent again on confirm. The medicine simply never arrived.
//
// That is not an edge case. Combinations are a large share of Indian
// prescribing and are frequently the CORRECT choice: aceclofenac with
// paracetamol answers pain and fever in one product, and refusing to reach it
// forces two lines where the doctor wanted one.
//
// ── The rule ───────────────────────────────────────────────────────────────
// Ranking may prefer whatever it likes. REACHABILITY IS ABSOLUTE. Nothing in
// this system may prevent a doctor from prescribing a real product, and a
// product the search can find must be a product the accept can deliver.
//
// ── Why this is a direct table read and not an RPC ─────────────────────────
// `composition_brands` cannot be widened from this repo (no migrations here),
// and its single-molecule filter is load-bearing for the RANKED list, where
// the engine scored one molecule and offering a combination silently would be
// a different prescription. So this sits beside it rather than replacing it:
// the ranked list keeps its filter, and every product the doctor names
// directly is resolved here, whole, with all of its compositions attached.
//
// `medicines` and `compositions` are already read directly elsewhere
// (lib/db/prescriptions.ts, lib/db/patients.ts), so the read policy is
// established. `medicine_composition_map.route` is the dosage form, per the
// note on `Form` in lib/synapse/brands.ts.
// ---------------------------------------------------------------------------

import { supabase } from "../supabase";
import type { Medicine } from "../synapse/brands";

/** A product with every molecule it actually contains. */
export interface ResolvedProduct extends Medicine {
    /** every composition in this product, ascending. Never empty. */
    compositionIds: number[];
    /** their display names, in the same order, for the "what is in this" line */
    compositionLabels: string[];
}

/**
 * The real column set, probed against the live database 2026-08-12.
 *
 * `medicine_composition_map` has medicine_id, composition_id and route. It has
 * NO strength_mg: that column lives on the `composition_brands` RPC's output,
 * which composes it from elsewhere. An earlier version of this file selected
 * it and every call threw.
 */
interface MapRow {
    medicine_id: number;
    composition_id: number;
    route: string | null;
}

/**
 * Attach the full composition list to a set of medicine ids.
 *
 * Two reads rather than a join, because the join column set differs between
 * the two tables and a nested select would return the composition name once
 * per map row.
 */
async function hydrate(
    medIds: number[],
    names: Map<number, string>,
    /** the composition the caller resolved through, used as `compositionId` */
    primaryOf: Map<number, number>
): Promise<ResolvedProduct[]> {
    if (medIds.length === 0) return [];

    const { data: mapRows, error: mapErr } = await supabase
        .from("medicine_composition_map")
        .select("medicine_id, composition_id, route")
        .in("medicine_id", medIds);
    if (mapErr) throw new Error(`medicine_composition_map: ${mapErr.message}`);

    const rows = (mapRows ?? []) as MapRow[];

    const byMedicine = new Map<number, MapRow[]>();
    for (const r of rows) {
        const list = byMedicine.get(r.medicine_id);
        if (list) list.push(r);
        else byMedicine.set(r.medicine_id, [r]);
    }

    const allCompIds = [...new Set(rows.map((r) => r.composition_id))];
    const compNames = new Map<number, string>();
    if (allCompIds.length > 0) {
        const { data: comps, error: compErr } = await supabase
            .from("compositions")
            .select("id, name")
            .in("id", allCompIds);
        if (compErr) throw new Error(`compositions: ${compErr.message}`);
        for (const c of (comps ?? []) as { id: number; name: string }[]) {
            compNames.set(Number(c.id), c.name);
        }
    }

    const out: ResolvedProduct[] = [];
    for (const medId of medIds) {
        const mine = byMedicine.get(medId);
        // A medicine with no composition rows is a catalogue defect, not
        // something to render. Skipping it is correct: there is nothing to
        // guard and nothing to print.
        if (!mine || mine.length === 0) continue;

        const compositionIds = [...new Set(mine.map((r) => r.composition_id))].sort((a, b) => a - b);
        // The molecule the caller came in through stays `compositionId`,
        // because that is what the preference model and the decision log are
        // keyed on. When the caller had no opinion, the first is as good as
        // any and is at least stable.
        const primary = primaryOf.get(medId) ?? compositionIds[0];

        out.push({
            id: medId,
            compositionId: primary,
            compositionIds,
            compositionLabels: compositionIds.map((id) => compNames.get(id) ?? `#${id}`),
            name: names.get(medId) ?? `#${medId}`,
            // Form is a property of the product, so any row carries it.
            form: mine.find((r) => r.route)?.route ?? null,
            // Not on this table. The catalogue records strength in the product
            // NAME for these rows ("Acenac S 100 mg/15 mg Tablet"), which the
            // sheet already displays, so nothing is lost by leaving it null.
            strengthMg: null,
            // Unknown from this path. Both are evidence the ranked list owns,
            // and inventing a number here would let a directly-named product
            // outrank one with real history behind it.
            prescriptionCount: 0,
            isClinicDefault: false,
        });
    }
    return out;
}

/**
 * The product the doctor actually named, resolved whole.
 *
 * Used when a search hit matched BY BRAND: the doctor typed "Acenac-P" and
 * that exact product is what must reach the prescription, combination or not.
 * Exact match first, then a prefix match, so "Acenac-P" cannot silently
 * resolve to "Acenac-P Plus" while an exact row exists.
 */
export async function resolveProductByName(name: string): Promise<ResolvedProduct | null> {
    const q = name.trim();
    if (!q) return null;

    // ── EXACT MATCH ONLY, and that is not a limitation ────────────────────
    // The caller passes `search_intents`' own `via_label`, which IS the row's
    // name, so equality is the right test rather than a compromise.
    //
    // It is also the only test that finishes. Measured against the live
    // catalogue 2026-08-12: `.eq("name", ...)` returns in ~730ms, while
    // `.ilike("name", "acenac%")` is CANCELLED BY THE STATEMENT TIMEOUT.
    // `medicines` holds 213,145 rows with no index supporting a prefix scan,
    // so the wildcard fallback this function used to carry could never
    // succeed: it failed on every call and the catch below turned that into
    // silence.
    const { data, error } = await supabase
        .from("medicines")
        .select("id, name")
        .eq("name", q)
        .limit(4);
    if (error) throw new Error(`medicines: ${error.message}`);

    const rows = (data ?? []) as { id: number; name: string }[];
    if (rows.length === 0) return null;

    // Shortest name wins a tie, on the rare duplicate-name row.
    rows.sort((a, b) => a.name.length - b.name.length || a.name.localeCompare(b.name));
    const pick = rows[0];

    const products = await hydrate(
        [Number(pick.id)],
        new Map([[Number(pick.id), pick.name]]),
        new Map()
    );
    return products[0] ?? null;
}

/**
 * Several products at once, by exact name.
 *
 * For the search RESULTS list, which has to show what each brand actually
 * contains BEFORE the doctor commits to it. `search_intents` returns exactly
 * one composition per hit, chosen by rarity, and rarity picks the MINOR
 * ingredient far more often than the major one. Measured on the live
 * catalogue: "Acenac-MR Tablet" comes back as thiocolchicoside, "Acenac-N
 * Tablet PR" as pregabalin, "Acenac S" as serratiopeptidase. In every case
 * the aceclofenac the doctor was actually looking for is the half that is not
 * shown.
 *
 * Batched into three round trips for the whole result set rather than three
 * per row, and keyed on the name so the caller can look a hit up directly.
 */
export async function fetchProductsByNames(
    names: string[]
): Promise<Map<string, ResolvedProduct>> {
    const out = new Map<string, ResolvedProduct>();
    const wanted = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
    if (wanted.length === 0) return out;

    const { data, error } = await supabase
        .from("medicines")
        .select("id, name")
        // Equality set, not a pattern. See the timeout note in
        // `resolveProductByName`: anything wildcard-shaped does not return.
        .in("name", wanted)
        .limit(wanted.length * 2);
    if (error) throw new Error(`medicines: ${error.message}`);

    const rows = (data ?? []) as { id: number; name: string }[];
    if (rows.length === 0) return out;

    const names_ = new Map<number, string>(rows.map((r) => [Number(r.id), r.name]));
    const products = await hydrate([...names_.keys()], names_, new Map());
    for (const p of products) out.set(p.name, p);
    return out;
}

/**
 * Combination products that contain one of these molecules.
 *
 * The counterpart to `composition_brands`, which returns only the
 * single-molecule half. Ordered by how FEW extra molecules a product carries,
 * so a two-ingredient product is offered ahead of a five-ingredient one: every
 * additional molecule is something the doctor did not ask for and has to
 * justify.
 *
 * Capped hard. A common molecule such as paracetamol appears in tens of
 * thousands of products and an uncapped read would be a denial of service on
 * the doctor's own screen.
 */
export async function fetchCombinationProducts(opts: {
    compositionIds: number[];
    /** products per composition, after ordering */
    perComposition?: number;
}): Promise<Map<number, ResolvedProduct[]>> {
    const result = new Map<number, ResolvedProduct[]>();
    if (opts.compositionIds.length === 0) return result;

    const perComposition = opts.perComposition ?? 8;

    const { data, error } = await supabase
        .from("medicine_composition_map")
        .select("medicine_id, composition_id")
        .in("composition_id", opts.compositionIds)
        // Enough to have combinations among them after the single-molecule
        // products are set aside, without reading a whole molecule's catalogue.
        .limit(600);
    if (error) throw new Error(`medicine_composition_map: ${error.message}`);

    const rows = (data ?? []) as { medicine_id: number; composition_id: number }[];
    if (rows.length === 0) return result;

    /** which composition each candidate was reached through */
    const primaryOf = new Map<number, number>();
    for (const r of rows) {
        if (!primaryOf.has(r.medicine_id)) primaryOf.set(r.medicine_id, r.composition_id);
    }

    const medIds = [...primaryOf.keys()];
    const { data: meds, error: medErr } = await supabase
        .from("medicines")
        .select("id, name")
        .in("id", medIds);
    if (medErr) throw new Error(`medicines: ${medErr.message}`);

    const names = new Map<number, string>(
        ((meds ?? []) as { id: number; name: string }[]).map((m) => [Number(m.id), m.name])
    );

    const products = await hydrate(medIds, names, primaryOf);

    for (const compId of opts.compositionIds) {
        const mine = products
            .filter((p) => p.compositionIds.includes(compId) && p.compositionIds.length > 1)
            .sort(
                (a, b) =>
                    a.compositionIds.length - b.compositionIds.length ||
                    a.name.localeCompare(b.name)
            )
            .slice(0, perComposition);
        if (mine.length > 0) result.set(compId, mine);
    }

    return result;
}
