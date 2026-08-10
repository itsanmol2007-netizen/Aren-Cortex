// ---------------------------------------------------------------------------
// OBSTETRIC MEASURES CHECK — does an LMP date become something the engine can
// actually reason about?
//
// The LMP is the one field in the catalogue where what the doctor types and
// what the engine scores are different things. A date means nothing to a rule;
// `measurement_rules` keys on LMP_DAYS, an interval. That derivation is the
// whole point of the field, it is invisible in the UI, and if it silently
// stopped happening the chart would still look completely normal — the LMP box
// would fill in, the record would be right, and amenorrhoea would just quietly
// never fire again.
//
// Same for G-P-L-A: it is one control storing "G/P/L/A" and four separate
// numbers downstream, exactly as bp is one control and two. A split that drops
// a component loses obstetric history without any visible symptom.
//
// Runs against the real vitalsToMeasurements through esbuild, so it cannot
// drift from the code it checks.
//
// Run: node scripts/obstetric-measures.mjs   (or npm run check:obstetric)
// ---------------------------------------------------------------------------

import { unlinkSync } from "node:fs";
import { build } from "esbuild";

const TMP = new URL("../.obstetric.tmp.mjs", import.meta.url);
await build({
    entryPoints: [new URL("../src/lib/synapse/consultInput.ts", import.meta.url).pathname],
    bundle: true,
    format: "esm",
    platform: "neutral",
    outfile: TMP.pathname,
    logLevel: "silent",
});
const { vitalsToMeasurements } = await import(TMP.href);
unlinkSync(TMP);

const errors = [];
const iso = (daysAgo) => new Date(Date.now() - daysAgo * 86_400_000).toISOString().slice(0, 10);
const rows = (vitals) => vitalsToMeasurements({ bp: "", pulse: "", temp: "", spo2: "", weight: "", ...vitals });
const find = (rs, key) => rs.find((r) => r.measureKey === key);

// --- LMP becomes an interval ------------------------------------------------

{
    const r = rows({ lmp: iso(60) });
    const days = find(r, "LMP_DAYS");
    const text = find(r, "LMP");
    if (!days) errors.push("a 60-day-old LMP produced no LMP_DAYS — the amenorrhoea rule can never fire");
    else if (Math.abs(days.value - 60) > 1) errors.push(`LMP_DAYS was ${days.value}, expected ~60`);
    if (!text || text.text !== iso(60)) errors.push("the LMP date itself is not carried for the record");
    // The rule's window is 35..400 days; these two bracket it.
    const below = find(rows({ lmp: iso(20) }), "LMP_DAYS");
    if (!below || below.value >= 35) errors.push("a 20-day-old LMP should sit below the amenorrhoea threshold");
}

// A future date is a typo. It must still be recorded, but never scored —
// otherwise a mistyped year runs the interval backwards.
{
    const r = rows({ lmp: iso(-30) });
    if (find(r, "LMP_DAYS")) errors.push("a future LMP produced LMP_DAYS — a typo would score as an interval");
    if (!find(r, "LMP")) errors.push("a future LMP was dropped entirely rather than recorded");
}

// --- G-P-L-A splits into four -----------------------------------------------

{
    const r = rows({ gpla: "3/2/2/1" });
    const want = { GRAVIDA: 3, PARA: 2, LIVING: 2, ABORTIONS: 1 };
    for (const [key, value] of Object.entries(want)) {
        const got = find(r, key);
        if (!got) errors.push(`G-P-L-A did not emit ${key}`);
        else if (got.value !== value) errors.push(`${key} was ${got.value}, expected ${value}`);
    }
}

// A partly-filled history is normal — a first pregnancy is "1///" — and the
// blanks must not become zeroes, which would assert a fact nobody entered.
{
    const r = rows({ gpla: "1///" });
    if (!find(r, "GRAVIDA")) errors.push("G alone did not emit GRAVIDA");
    for (const key of ["PARA", "LIVING", "ABORTIONS"]) {
        if (find(r, key)) errors.push(`${key} was emitted from a blank — an unentered value became a number`);
    }
}

// --- nothing entered, nothing emitted ---------------------------------------

{
    const r = rows({});
    for (const key of ["LMP", "LMP_DAYS", "GRAVIDA", "PARA", "LIVING", "ABORTIONS"]) {
        if (find(r, key)) errors.push(`${key} was emitted for an empty chart`);
    }
}

if (errors.length) {
    console.error(`\nFAIL — ${errors.length} problem(s):`);
    for (const e of errors) console.error(`  ${e}`);
    process.exit(1);
}
console.log("OK — LMP derives an interval, future dates are recorded but not scored, G-P-L-A splits into four and blanks stay blank.");
