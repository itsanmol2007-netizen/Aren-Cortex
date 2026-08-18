// ---------------------------------------------------------------------------
// EXAMINATION CATALOGUE CHECK — Phase 3's equivalent of check:story.
//
// The failure this guards is the same one `measure-wiring.mjs` was written
// for, one catalogue over: a duplicate or malformed key is silent. Two
// movements sharing a key would have one silently overwrite the other's
// reading in `visit_measurements`, since the key IS the storage address.
//
// Confirmed non-vacuous by hand: duplicate a movement key, watch it fail,
// restore it.
//
// Run: node scripts/examination-catalogue.mjs   (or npm run check:examination)
// ---------------------------------------------------------------------------

import { unlinkSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

async function load(rel, tmpName) {
    const TMP = new URL(`../.${tmpName}.tmp.mjs`, import.meta.url);
    await build({
        entryPoints: [fileURLToPath(new URL(rel, import.meta.url))],
        bundle: true, format: "esm", platform: "neutral",
        outfile: fileURLToPath(TMP), logLevel: "silent",
    });
    const mod = await import(TMP.href);
    unlinkSync(TMP);
    return mod;
}

const ex = await load("../src/features/consult/examination.ts", "exam");
const {
    EXAM_REGIONS, REGION_BY_KEY, MMT_LABEL,
    rangeMeasureKey, mmtMeasureKey, testMeasureKey,
    activePassiveGap, outsideExpected,
} = ex;

const errors = [];
const assert = (c, m) => { if (!c) errors.push(m); };

console.log("\nExamination catalogue\n");

// ── 1. Every storage key is globally unique ────────────────────────────────
// The key is the storage address. A collision silently overwrites a reading.
const seen = new Map();
let movements = 0, muscles = 0, tests = 0;
for (const r of EXAM_REGIONS) {
    for (const m of r.movements) {
        movements++;
        const k = rangeMeasureKey(m.key);
        assert(!seen.has(k), `range key "${k}" is used by both ${seen.get(k)} and ${r.key}/${m.key}`);
        seen.set(k, `${r.key}/${m.key}`);
    }
    for (const mu of r.muscles) {
        muscles++;
        const k = mmtMeasureKey(mu.key);
        assert(!seen.has(k), `MMT key "${k}" is used by both ${seen.get(k)} and ${r.key}/${mu.key}`);
        seen.set(k, `${r.key}/${mu.key}`);
    }
    for (const t of r.tests) {
        tests++;
        const k = testMeasureKey(t.key);
        assert(!seen.has(k), `test key "${k}" is used by both ${seen.get(k)} and ${r.key}/${t.key}`);
        seen.set(k, `${r.key}/${t.key}`);
    }
}

// ── 2. The three namespaces cannot collide with each other ────────────────
for (const [k] of seen) {
    const ns = k.split("_")[0];
    assert(["EXAM", "MMT", "TEST"].includes(ns), `key "${k}" is in no known namespace`);
}

// ── 3. Region keys unique, and every region has content ───────────────────
const regionKeys = new Set();
for (const r of EXAM_REGIONS) {
    assert(!regionKeys.has(r.key), `duplicate region key "${r.key}"`);
    regionKeys.add(r.key);
    assert(r.movements.length > 0, `region "${r.key}" has no movements — the card would render an empty grid`);
    assert(r.tests.length > 0, `region "${r.key}" has no special tests`);
    assert(REGION_BY_KEY.get(r.key) === r, `REGION_BY_KEY is out of step for "${r.key}"`);
}

// ── 4. Every MMT grade 0-5 has a label ────────────────────────────────────
for (const g of [0, 1, 2, 3, 4, 5]) {
    assert(typeof MMT_LABEL[g] === "string" && MMT_LABEL[g].length > 0,
        `MMT grade ${g} has no label — the doctor would see a bare number with no meaning`);
}

// ── 5. The gap refuses to invent a value ──────────────────────────────────
assert(activePassiveGap(95, 110) === 15, "gap 95/110 should be 15");
assert(activePassiveGap(null, 110) === null, "gap with no active reading must be null, not a number");
assert(activePassiveGap(95, null) === null, "gap with no passive reading must be null, not a number");
// Negative is returned rather than clamped — it means a mis-entry, and
// hiding it helps nobody.
assert(activePassiveGap(110, 95) === -15, "an impossible gap must be reported, not clamped to 0");

// ── 6. `outsideExpected` handles extension, whose normal is ZERO ──────────
// The trap: every other movement is "less than normal is restricted", but
// knee extension's goal is 0 and any positive value is a lag. Getting this
// backwards flags every healthy knee and no stiff one.
const knee = REGION_BY_KEY.get("knee");
const flex = knee.movements.find((m) => m.key === "knee_flex");
const ext = knee.movements.find((m) => m.key === "knee_ext");
assert(outsideExpected(flex, 90) === true, "knee flexion 90 (normal 135) should read as restricted");
assert(outsideExpected(flex, 135) === false, "knee flexion at normal should not flag");
assert(outsideExpected(ext, 5) === true, "a 5 degree extension LAG should flag");
assert(outsideExpected(ext, 0) === false, "full extension (0) must not flag");
assert(outsideExpected(flex, null) === false, "an empty field must never flag");

console.log(`  ${EXAM_REGIONS.length} regions · ${movements} movements · ${muscles} muscle groups · ${tests} special tests`);
console.log(`  ${seen.size} unique storage keys`);

if (errors.length) {
    console.log(`\n✗ ${errors.length} problem(s)\n`);
    for (const e of errors) console.log(`  - ${e}`);
    process.exit(1);
}
console.log("\n✓ keys unique across all three namespaces, gap refuses to invent, extension's zero-normal handled\n");
