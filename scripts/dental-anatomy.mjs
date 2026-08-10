// ---------------------------------------------------------------------------
// ODONTOGRAM GEOMETRY CHECK — is the chart anatomically correct?
//
// The dental chart is generated maths, not hand-placed shapes: arch curves,
// arc-length spacing, per-tooth rotation, and which of the four axial
// trapezoids is mesial. All of that is easy to get subtly wrong and very hard
// to eyeball — a mesial/distal swap on one quadrant looks fine in a screenshot
// and silently records "36 D" when the dentist charted "36 M". A caries
// charted on the wrong surface is a wrong medical record.
//
// So the geometry is checked numerically, against the real anatomy.ts through
// esbuild rather than a second copy of the maths:
//
//   1. 32 teeth, each with all five surfaces.
//   2. Adjacent crowns touch without overlapping — the point of arc-length
//      placement.
//   3. Mesial genuinely faces the midline: the mesial trapezoid must sit
//      nearer the next tooth toward the front of the mouth than the distal
//      one does. This is the check that catches a quadrant mirrored wrong.
//   4. Buccal faces out of the arch, lingual faces in.
//
// Run: node scripts/dental-anatomy.mjs   (or npm run check:dental)
// ---------------------------------------------------------------------------

import { unlinkSync } from "node:fs";
import { build } from "esbuild";

const TMP = new URL("../.dental-anatomy.tmp.mjs", import.meta.url);
await build({
    entryPoints: [new URL("../src/lib/dental/anatomy.ts", import.meta.url).pathname],
    bundle: true,
    format: "esm",
    platform: "neutral",
    outfile: TMP.pathname,
    logLevel: "silent",
});
const { ALL_TEETH, TOOTH_BY_CODE, SURFACES } = await import(TMP.href);
unlinkSync(TMP);

const MIDLINE_X = 230;
const errors = [];
const warnings = [];

const toScreen = (t, px, py) => {
    const a = (t.rotate * Math.PI) / 180;
    return {
        x: t.x + px * Math.cos(a) - py * Math.sin(a),
        y: t.y + px * Math.sin(a) + py * Math.cos(a),
    };
};

const centroid = (t, zone) => {
    const pts = zone.points.split(" ").map((p) => p.split(",").map(Number));
    const local = pts.reduce((acc, [x, y]) => ({ x: acc.x + x / pts.length, y: acc.y + y / pts.length }), { x: 0, y: 0 });
    return toScreen(t, local.x, local.y);
};

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// --- 1. completeness --------------------------------------------------------

if (ALL_TEETH.length !== 32) errors.push(`expected 32 teeth, got ${ALL_TEETH.length}`);

for (const t of ALL_TEETH) {
    const got = t.zones.map((z) => z.surface).sort();
    const want = [...SURFACES].sort();
    if (got.join() !== want.join()) errors.push(`${t.code}: surfaces ${got.join("/")} != ${want.join("/")}`);
    if (!/^[1-4][1-8]$/.test(t.code)) errors.push(`${t.code}: not a valid FDI code`);
}

// --- 2. adjacent crowns touch, and do not overlap ---------------------------

for (const q of [1, 2, 3, 4]) {
    for (let p = 1; p < 8; p++) {
        const a = TOOTH_BY_CODE[`${q}${p}`];
        const b = TOOTH_BY_CODE[`${q}${p + 1}`];
        const gap = dist(a, b) - (a.w + b.w) / 2;
        if (gap < -0.5) errors.push(`${a.code}/${b.code}: crowns overlap by ${(-gap).toFixed(1)}px`);
        if (gap > 6) warnings.push(`${a.code}/${b.code}: gap of ${gap.toFixed(1)}px reads as a missing tooth`);
    }
}

// --- 3. mesial faces the midline -------------------------------------------
//
// For every tooth except the central incisor, the tooth one position forward
// (toward the midline) is the reference: the mesial trapezoid must be closer
// to it than the distal trapezoid is.

for (const q of [1, 2, 3, 4]) {
    for (let p = 2; p <= 8; p++) {
        const t = TOOTH_BY_CODE[`${q}${p}`];
        const forward = TOOTH_BY_CODE[`${q}${p - 1}`];
        const m = centroid(t, t.zones.find((z) => z.surface === "mesial"));
        const d = centroid(t, t.zones.find((z) => z.surface === "distal"));
        if (dist(m, forward) >= dist(d, forward)) {
            errors.push(
                `${t.code}: mesial/distal are swapped — mesial sits ${dist(m, forward).toFixed(1)}px ` +
                `from ${forward.code} but distal sits ${dist(d, forward).toFixed(1)}px`
            );
        }
    }
}

// The central incisors have no tooth in front of them, so they are checked
// against the midline directly.
for (const q of [1, 2, 3, 4]) {
    const t = TOOTH_BY_CODE[`${q}1`];
    const m = centroid(t, t.zones.find((z) => z.surface === "mesial"));
    const d = centroid(t, t.zones.find((z) => z.surface === "distal"));
    if (Math.abs(m.x - MIDLINE_X) >= Math.abs(d.x - MIDLINE_X)) {
        errors.push(`${t.code}: mesial should face the midline, but distal is closer to it`);
    }
}

// --- 4. buccal faces out of the arch ---------------------------------------
//
// "Out" means away from the centre of curvature, which is below the upper arch
// and above the lower one. So on the upper arch the buccal centroid must sit
// higher (smaller y) than the lingual one, and lower on the mandible.

for (const t of ALL_TEETH) {
    const b = centroid(t, t.zones.find((z) => z.surface === "buccal"));
    const l = centroid(t, t.zones.find((z) => z.surface === "lingual"));
    const outward = t.arch === "upper" ? l.y - b.y : b.y - l.y;
    if (outward <= 0) {
        errors.push(`${t.code} (${t.arch}): buccal and lingual are inverted — buccal must face the cheek`);
    }
}

// --- report -----------------------------------------------------------------

for (const w of warnings) console.log(`  warn  ${w}`);
if (errors.length) {
    console.error(`\nFAIL — ${errors.length} geometry error(s):`);
    for (const e of errors) console.error(`  ${e}`);
    process.exit(1);
}
console.log(`OK — 32 teeth, ${ALL_TEETH.length * 5} surfaces; spacing, mesial/distal and buccal/lingual all correct.`);
