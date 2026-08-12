// ---------------------------------------------------------------------------
// BRAND FAMILY CHECK — does one brand read as one brand?
//
// The catalogue stores every strength and form of a product as its own row, so
// `Aceto` is six rows under paracetamol and the worst brand reaches twelve.
// Measured across the catalogue, 49,860 of 115,541 offerable rows (43%) are a
// strength/form variant of a brand already in the list. Rendered flat that is
// not a choice between brands — it is one name repeated until it fills the
// card, pushing real alternatives out of view.
//
// `groupBrandFamilies` collapses them. This checks that it still does, against
// the LIVE catalogue rather than fixtures, because the thing that breaks it is
// a product naming convention nobody anticipated.
//
// It imports the real `lib/synapse/brands.ts` through esbuild rather than
// re-implementing the regexes, so the check cannot silently drift from the
// code it is checking.
//
// Two ways to fail, and they are not symmetric:
//   OVER-MERGING  hides a prescription — two genuinely different products
//                 collapsed into one row. Treated as an error.
//   UNDER-MERGING shows one extra row. Reported, never fatal.
//
// Run: node scripts/brand-families.mjs   (or npm run check:brands)
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { build } from "esbuild";

function loadEnv() {
    const out = {};
    for (const line of readFileSync(new URL("../.env", import.meta.url), "utf8").split("\n")) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
    return out;
}

const env = loadEnv();
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

// Load the real module — no second copy of the grouping rules.
const TMP = new URL("../.brand-families.tmp.mjs", import.meta.url);
await build({
    entryPoints: [fileURLToPath(new URL("../src/lib/synapse/brands.ts", import.meta.url))],
    bundle: true,
    format: "esm",
    platform: "neutral",
    outfile: fileURLToPath(TMP),
    logLevel: "silent",
});
const { groupBrandFamilies, brandFamilyLabel, brandVariantLabel } = await import(TMP.href);
unlinkSync(TMP);

// The compositions worth checking: the highest-volume generics, which is where
// the brand explosion actually lives (the number is single-molecule products in
// the catalogue).
//
// Pinned by id rather than looked up by name on purpose — `compositions` and
// `intents` are RLS-protected with no anon policy, and `mv_composition_brand`
// plus the `composition_brands` RPC are the only doors this key has. Ids are
// primary keys and do not move.
const comps = [
    { id: 8, name: "azithromycin" },  // 4,526 single-molecule products
    { id: 15, name: "pantoprazole" }, // 2,680
    { id: 2, name: "paracetamol" },   // 1,790
    { id: 6, name: "amoxicillin" },   // 1,518
    { id: 21, name: "aceclofenac" },  // 804
    { id: 9, name: "metformin" },     // 711
    { id: 7, name: "cetirizine" },    // 655
    { id: 29, name: "montelukast" },  // 188
    // added 2026-08-08 alongside the other 19 essential-OPD compositions;
    // small brand counts (7 and 6) by design, real market size, not padding
    { id: 285, name: "oral rehydration salts" },
    { id: 292, name: "nitrofurantoin" },
];

let errors = 0;
let totalProducts = 0;
let totalFamilies = 0;

console.log("BRAND FAMILY CHECK\n");

for (const c of comps.sort((a, b) => a.name.localeCompare(b.name))) {
    // Mirror what the app fetches: single-molecule products only, the same
    // ordering the RPC applies, the same window size.
    // `p_hospital_id` is passed explicitly even though it is null here.
    // Two overloads of composition_brands exist in the live database — the
    // original four-argument one and a five-argument hospital-scoped one —
    // and a four-argument call matches BOTH, so PostgREST refuses it with
    // "could not choose the best candidate function". The app was never
    // affected (it always passes all five), but this script was, and it
    // failed at the first composition. Null means "global catalogue only",
    // which is what a catalogue-wide check wants.
    const { data, error } = await supabase.rpc("composition_brands", {
        p_composition_ids: [c.id],
        p_limit: 30,
        p_pediatric: false,
        p_keep_medicine_ids: [],
        p_hospital_id: null,
    });
    if (error) throw new Error(`${c.name}: ${error.message}`);

    const products = (data ?? [])
        .filter((r) => r.medicine_id != null)
        .map((r) => ({
            id: r.medicine_id,
            compositionId: r.composition_id,
            name: r.name ?? `#${r.medicine_id}`,
            form: r.route,
            strengthMg: r.strength_mg,
            prescriptionCount: 0,
            isClinicDefault: false,
        }));

    const families = groupBrandFamilies(products);
    totalProducts += products.length;
    totalFamilies += families.length;

    const biggest = [...families].sort((a, b) => b.variants.length - a.variants.length)[0];
    const saved = products.length - families.length;
    console.log(
        `${c.name.padEnd(14)} ${String(products.length).padStart(3)} products -> ` +
        `${String(families.length).padStart(3)} brands` +
        (saved > 0 ? `  (-${saved})` : "") +
        (biggest && biggest.variants.length > 1
            ? `   biggest: ${biggest.label} x${biggest.variants.length}`
            : "")
    );

    // --- invariant 1: nothing is lost ------------------------------------
    const regrouped = families.reduce((n, f) => n + f.variants.length, 0);
    if (regrouped !== products.length) {
        console.log(`   ERROR  ${products.length} products in, ${regrouped} out — grouping dropped rows`);
        errors++;
    }

    // --- invariant 2: the lead is the best-ranked member ------------------
    // Grouping must inherit the resolved order, never recompute it: the
    // doctor's learned brand has to keep leading its family.
    for (const f of families) {
        if (f.variants[0] !== f.lead) {
            console.log(`   ERROR  ${f.label}: lead is not the first-ranked variant`);
            errors++;
        }
    }

    // --- invariant 3: no over-merge --------------------------------------
    // Two products may only share a family if they differ by strength/form.
    // If their variant labels are identical, we merged two distinct products
    // and one of them is now unreachable in the sheet.
    for (const f of families) {
        if (f.variants.length < 2) continue;
        const labels = f.variants.map((m) => `${brandVariantLabel(m)}|${m.form ?? ""}`.toLowerCase());
        const dupes = labels.filter((l, i) => labels.indexOf(l) !== i);
        if (dupes.length > 0) {
            const names = f.variants.map((m) => m.name).join(" / ");
            console.log(`   ERROR  ${f.label}: indistinguishable variants -> ${names}`);
            errors++;
        }
    }

    // --- report 4: under-merge (not fatal) -------------------------------
    // A family label that still carries a digit usually means a strength we
    // failed to strip. Worth seeing; never a reason to fail the run.
    for (const f of families) {
        if (/\d/.test(f.label)) {
            console.log(`   note   family label still has a number: "${f.label}"`);
        }
    }

    // --- report 5: duplicate products in the catalogue (not fatal) --------
    // Two variants that differ only in how the strength was typed ("1000" vs
    // "1000mg") are the SAME product entered twice. Grouping is behaving
    // correctly by keeping both — this is a data problem, not a code one, and
    // it is exactly the kind of row the import should have deduplicated.
    for (const f of families) {
        if (f.variants.length < 2) continue;
        const seen = new Map();
        for (const m of f.variants) {
            const norm = brandVariantLabel(m)
                .toLowerCase()
                .replace(/\s*mg\b/g, "")
                .replace(/[^a-z0-9]+/g, "");
            if (seen.has(norm)) {
                console.log(`   note   catalogue duplicate: "${seen.get(norm)}" and "${m.name}"`);
            } else seen.set(norm, m.name);
        }
    }
}

console.log(
    `\n${totalProducts} products -> ${totalFamilies} brands ` +
    `(${totalProducts - totalFamilies} duplicate rows removed from the picker)`
);

// A label must never come back empty — an empty brand row is unclickable.
for (const probe of ["Dolo 650 Tablet", "Aceto 125mg/5ml Syrup", "650mg", "500"]) {
    if (!brandFamilyLabel(probe).trim()) {
        console.log(`ERROR  empty family label for "${probe}"`);
        errors++;
    }
}

console.log(errors === 0 ? "\nPASS" : `\nFAIL — ${errors} error${errors === 1 ? "" : "s"}`);
process.exit(errors === 0 ? 0 : 1);
