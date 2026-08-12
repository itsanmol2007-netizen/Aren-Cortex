// ---------------------------------------------------------------------------
// GROWTH STANDARDS CHECK — does a weight become the right z-score?
//
// This is the check the paediatric work cannot ship without, for the same
// reason check:dental exists: THE FAILURE IS INVISIBLE. A growth calculation
// that has drifted still fills the box, still saves, still prints, and still
// shows a confident percentile. It just shows the wrong one — and a wrong
// percentile on a real child is not a cosmetic bug, it is a clinical assertion
// nobody made. "Underweight" and "normal" are two different consultations.
//
// The fixtures below are WHO's OWN PUBLISHED SD VALUES, lifted straight out of
// the same expanded tables the L/M/S coefficients came from (the SD2neg, SD0
// and SD2 columns, which this codebase deliberately does not ship). So the
// check is genuinely independent of the data it validates: a child weighing
// exactly WHO's published −2 SD weight must come back at z = −2.00. If the
// LMS maths, the interpolation, or the tables themselves are wrong, these
// cannot all pass by coincidence.
//
// Confirmed non-vacuous by flipping the sign of L in the z formula (24 of 24
// failed) and by disabling the ±3 SD tail correction (the extreme cases
// failed while the ordinary ones passed, which is exactly the signature that
// correction exists for).
//
// Run: node scripts/growth-standards.mjs   (or npm run check:growth)
// ---------------------------------------------------------------------------

import { unlinkSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const TMP = new URL("../.growth.tmp.mjs", import.meta.url);
await build({
    entryPoints: [fileURLToPath(new URL("../src/lib/growth/growth.ts", import.meta.url))],
    bundle: true,
    format: "esm",
    platform: "neutral",
    outfile: fileURLToPath(TMP),
    logLevel: "silent",
});
const { growthZ, classify } = await import(TMP.href);
unlinkSync(TMP);

// WHO Child Growth Standards, expanded z-score tables, retrieved 2026-08-11.
// [metric, sex, months, value at −2 SD, value at median, value at +2 SD]
const WHO_PUBLISHED = [
    ["weight-for-age", "male", 0, 2.459, 3.346, 4.419],
    ["weight-for-age", "male", 6, 6.357, 7.939, 9.855],
    ["weight-for-age", "male", 12, 7.741, 9.646, 11.983],
    ["weight-for-age", "male", 24, 9.675, 12.155, 15.281],
    ["weight-for-age", "male", 36, 11.28, 14.344, 18.315],
    ["weight-for-age", "male", 60, 14.067, 18.335, 24.163],
    ["weight-for-age", "female", 0, 2.395, 3.232, 4.23],
    ["weight-for-age", "female", 6, 5.733, 7.302, 9.341],
    ["weight-for-age", "female", 12, 7.041, 8.946, 11.506],
    ["weight-for-age", "female", 24, 9.039, 11.481, 14.85],
    ["weight-for-age", "female", 36, 10.806, 13.852, 18.14],
    ["weight-for-age", "female", 60, 13.742, 18.218, 24.914],
    ["height-for-age", "male", 0, 46.098, 49.884, 53.67],
    ["height-for-age", "male", 6, 63.362, 67.644, 71.925],
    ["height-for-age", "male", 12, 70.987, 75.739, 80.491],
    ["height-for-age", "male", 24, 81.017, 87.13, 93.243],
    ["height-for-age", "male", 36, 88.675, 96.089, 103.503],
    ["height-for-age", "male", 60, 100.692, 109.959, 119.227],
    ["height-for-age", "female", 0, 45.422, 49.148, 52.873],
    ["height-for-age", "female", 6, 61.217, 65.751, 70.285],
    ["height-for-age", "female", 12, 68.856, 74.005, 79.154],
    ["height-for-age", "female", 24, 79.276, 85.73, 92.184],
    ["height-for-age", "female", 36, 87.439, 95.057, 102.675],
    ["height-for-age", "female", 60, 99.908, 109.419, 118.93],
];

const errors = [];
// The tables ship 6 significant figures and are sampled monthly, so a
// published SD value should round-trip to within a hundredth of an SD.
const TOL = 0.02;

for (const [metric, sex, months, vLow, vMid, vHigh] of WHO_PUBLISHED) {
    for (const [expected, value] of [[-2, vLow], [0, vMid], [2, vHigh]]) {
        const r = growthZ(metric, value, months, sex);
        if (!r) {
            errors.push(`${metric} ${sex} ${months}mo ${value}: returned null`);
            continue;
        }
        if (Math.abs(r.z - expected) > TOL) {
            errors.push(
                `${metric} ${sex} ${months}mo ${value} -> z ${r.z}, expected ${expected} ` +
                `(off by ${(r.z - expected).toFixed(3)})`
            );
        }
    }
}

// ── Refusing is a feature, not a gap ────────────────────────────────────────
// Every one of these must come back null. A number here would be a confident
// answer from a curve that was never fitted to it.
const MUST_REFUSE = [
    ["above five years", ["weight-for-age", 20, 61, "male"]],
    ["negative age", ["weight-for-age", 10, -1, "male"]],
    ["zero weight", ["weight-for-age", 0, 12, "male"]],
    ["negative weight", ["weight-for-age", -5, 12, "male"]],
    ["NaN value", ["weight-for-age", NaN, 12, "male"]],
    ["NaN age", ["weight-for-age", 10, NaN, "male"]],
];
for (const [name, [metric, v, m, s]] of MUST_REFUSE) {
    if (growthZ(metric, v, m, s) !== null) errors.push(`should have refused: ${name}`);
}

// Boundary: exactly 60 months is inside the standards, 60.01 is not.
if (!growthZ("weight-for-age", 18.3, 60, "male")) errors.push("60 months should be accepted — it is the last month WHO publishes");
if (growthZ("weight-for-age", 18.3, 60.01, "male")) errors.push("60.01 months should be refused");

// ── The tail correction actually engages ────────────────────────────────────
{
    const severe = growthZ("weight-for-age", 5.5, 24, "male"); // far below −3 SD
    if (!severe) errors.push("a severely underweight 2-year-old returned null");
    else {
        if (!severe.tailCorrected) errors.push("the ±3 SD tail correction did not engage on a severely underweight child");
        if (classify(severe) !== "severely-underweight") errors.push(`5.5kg at 24mo classified as "${classify(severe)}"`);
    }

    // The DEFINING property of WHO's correction is that the tail is rescaled
    // LINEARLY — equal steps in weight give equal steps in z. Asserting some
    // arbitrary magnitude instead (an earlier draft of this check demanded
    // z > −6) tests the author's guess rather than the algorithm: 5.5 kg at
    // two years really is about −6 SD, and the check failed on correct code.
    const step = (a, b) =>
        growthZ("weight-for-age", a, 24, "male").z - growthZ("weight-for-age", b, 24, "male").z;
    const s1 = step(6.0, 5.5);
    const s2 = step(5.5, 5.0);
    if (Math.abs(s1 - s2) > 1e-6) {
        errors.push(`the corrected tail is not linear: equal 0.5kg steps gave ${s1.toFixed(4)} and ${s2.toFixed(4)} SD`);
    }

    // ...and that it joins the uncorrected curve at −3 without a jump.
    const atSd3 = growthZ("weight-for-age", 8.63, 24, "male");
    if (Math.abs(atSd3.z + 3) > 0.05) {
        errors.push(`z near the −3 SD weight was ${atSd3.z}, expected ≈ −3 — the correction is discontinuous there`);
    }
    // Height-for-age must NOT be tail-corrected — WHO does not do it there.
    const short = growthZ("height-for-age", 70, 24, "male");
    if (short?.tailCorrected) errors.push("height-for-age must not be tail-corrected");
}

// ── Classification boundaries ───────────────────────────────────────────────
{
    // Published −2 SD weight for a 24-month boy is 9.675 kg: just under is
    // underweight, just over is normal.
    const under = growthZ("weight-for-age", 9.6, 24, "male");
    const ok = growthZ("weight-for-age", 9.8, 24, "male");
    if (classify(under) !== "underweight") errors.push(`9.6kg at 24mo -> "${classify(under)}", expected underweight`);
    if (classify(ok) !== "normal") errors.push(`9.8kg at 24mo -> "${classify(ok)}", expected normal`);
    // Percentile sanity: the median must be the 50th.
    const mid = growthZ("weight-for-age", 12.155, 24, "male");
    if (Math.abs(mid.percentile - 50) > 1) errors.push(`median weight gave percentile ${mid.percentile}, expected ~50`);
}

// ── Interpolation is monotonic between published months ─────────────────────
// A child of a fixed weight must not get a HIGHER z as they age.
{
    let prev = Infinity;
    for (let m = 0; m <= 60; m += 0.5) {
        const r = growthZ("weight-for-age", 10, m, "male");
        if (!r) { errors.push(`interpolation returned null at ${m} months`); break; }
        if (r.z > prev + 1e-9) { errors.push(`z rose with age at ${m} months (${prev} -> ${r.z})`); break; }
        prev = r.z;
    }
}

console.log(`\nGrowth standards — ${WHO_PUBLISHED.length * 3} WHO published points, plus refusal, tail and boundary cases`);

if (errors.length) {
    console.error(`\n✗ ${errors.length} problem${errors.length === 1 ? "" : "s"}:\n`);
    for (const e of errors) console.error(`  - ${e}`);
    console.error("");
    process.exitCode = 1;
} else {
    console.log("\n✓ every published WHO SD value round-trips to its own z; refusals hold; the tail correction engages only where WHO applies it\n");
}
