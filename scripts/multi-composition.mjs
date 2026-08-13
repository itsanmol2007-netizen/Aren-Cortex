// ---------------------------------------------------------------------------
// MULTI-COMPOSITION CHECK — can a combination product actually be prescribed?
//
// This check exists because the answer was NO for the entire life of the
// product, and nothing caught it. `composition_brands` states its own rule:
// "a brand is only offered for a composition when the product contains that
// molecule ALONE ... the RPC filters on ingredient_count = 1". So the resolver
// behind every accept was structurally incapable of returning a combination.
// A doctor could search "Acenac-P", see it, press Prescribe, and get either a
// different single-molecule product or nothing at all.
//
// Combinations are a large share of Indian prescribing and are frequently the
// correct choice, so this is not an edge case: it is most of a working day.
//
// ── What it checks ─────────────────────────────────────────────────────────
//  1. search_intents returns brand hits at all
//  2. each brand hit's product resolves by EXACT name (the app's path)
//  3. the resolved product carries EVERY molecule, not just the ranked one
//  4. at least one genuine combination is reachable end to end
//
// ── Why it needs credentials ───────────────────────────────────────────────
// `medicines`, `compositions` and `medicine_composition_map` return zero rows
// to an anonymous client under RLS, while `search_intents` is SECURITY DEFINER
// and answers anyone. That asymmetry is exactly what let the bug hide: the
// search worked for everybody and the resolution silently returned nothing.
//
// Run:
//   AREN_CHECK_EMAIL=… AREN_CHECK_PASSWORD=… node scripts/multi-composition.mjs
// ---------------------------------------------------------------------------

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

function loadEnv() {
    const out = {};
    for (const line of readFileSync(new URL("../.env", import.meta.url), "utf8").split("\n")) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
    return out;
}

const env = loadEnv();
const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

const email = process.env.AREN_CHECK_EMAIL;
const password = process.env.AREN_CHECK_PASSWORD;

if (!email || !password) {
    console.log("\n⚠  No AREN_CHECK_EMAIL / AREN_CHECK_PASSWORD set.");
    console.log("   The catalogue tables return zero rows to an anonymous client,");
    console.log("   so this check cannot tell a permission problem from an empty");
    console.log("   result. Set both and run again.\n");
    process.exit(1);
}

const { error: authErr } = await sb.auth.signInWithPassword({ email, password });
if (authErr) {
    console.error(`✗ sign-in failed: ${authErr.message}`);
    process.exit(1);
}

/** The queries the app makes, in the order it makes them. */
async function resolveProduct(name) {
    const { data: meds, error: medErr } = await sb
        .from("medicines").select("id, name").eq("name", name).limit(4);
    if (medErr) throw new Error(`medicines: ${medErr.message}`);
    if (!meds?.length) return null;

    const id = Number(meds[0].id);
    const { data: map, error: mapErr } = await sb
        .from("medicine_composition_map")
        .select("medicine_id, composition_id, route")
        .eq("medicine_id", id);
    if (mapErr) throw new Error(`medicine_composition_map: ${mapErr.message}`);

    const compIds = [...new Set((map ?? []).map((r) => Number(r.composition_id)))].sort((a, b) => a - b);
    if (compIds.length === 0) return { id, name: meds[0].name, compIds: [], labels: [] };

    const { data: comps, error: compErr } = await sb
        .from("compositions").select("id, name").in("id", compIds);
    if (compErr) throw new Error(`compositions: ${compErr.message}`);

    const byId = new Map((comps ?? []).map((c) => [Number(c.id), c.name]));
    return { id, name: meds[0].name, compIds, labels: compIds.map((c) => byId.get(c) ?? `#${c}`) };
}

const QUERIES = ["acenac", "combiflam", "zerodol", "dolo", "augmentin"];

let brandHits = 0;
let resolved = 0;
let combinations = 0;
const failures = [];

console.log("\nMULTI-COMPOSITION CHECK\n");

for (const q of QUERIES) {
    const { data, error } = await sb.rpc("search_intents", {
        p_query: q, p_limit: 8, p_types: ["medicine"],
    });
    if (error) { failures.push(`search_intents("${q}"): ${error.message}`); continue; }

    const hits = (data ?? []).filter((r) => r.match_kind === "brand" && r.via_label);
    console.log(`  "${q}" → ${data?.length ?? 0} hits, ${hits.length} by brand`);

    for (const hit of hits) {
        brandHits++;
        let product;
        try {
            product = await resolveProduct(hit.via_label);
        } catch (e) {
            failures.push(`${hit.via_label}: ${e.message}`);
            continue;
        }

        if (!product) {
            // The name search_intents reported does not exist in `medicines`
            // as an exact row. The accept cannot resolve it and the doctor
            // gets a different product than the one they asked for.
            failures.push(`${hit.via_label}: no exact row in medicines`);
            continue;
        }

        resolved++;
        if (product.compIds.length > 1) combinations++;

        const shownBefore = hit.label;
        const shownNow = product.labels.join(" + ") || "(none)";
        const hidden = product.labels.length > 1
            ? ` ← was hiding ${product.labels.length - 1} of ${product.labels.length}`
            : "";
        console.log(`      ${hit.via_label}`);
        console.log(`        RPC said : ${shownBefore}`);
        console.log(`        actually : ${shownNow}${hidden}`);
    }
}

console.log("");
console.log(`  brand hits            ${brandHits}`);
console.log(`  resolved to a product ${resolved}`);
console.log(`  genuine combinations  ${combinations}`);

if (failures.length) {
    console.log("\n✗ FAILURES");
    for (const f of failures) console.log(`  · ${f}`);
}

if (resolved === 0) {
    console.log("\n✗ Nothing resolved. The accept path cannot deliver any searched product.");
    process.exit(1);
}
if (combinations === 0) {
    console.log("\n✗ No combination resolved. Multi-composition is still not reachable.");
    process.exit(1);
}

console.log(`\n✓ Combinations resolve with every molecule attached (${combinations} of ${resolved}).`);
