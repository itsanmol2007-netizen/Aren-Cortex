// ---------------------------------------------------------------------------
// MEASURE WIRING CHECK — is every measurement actually connected end to end?
//
// A measurement has to survive four separate hops before it does anything:
//
//     MEASURE_FIELDS  ->  Vitals key  ->  vitalsToMeasurements  ->  measure key
//                                                                       |
//                                              measurement_rules keyed on it
//                                                                       |
//                                                     and printed on the Rx
//
// EVERY ONE OF THOSE HOPS FAILS SILENTLY. Nothing throws, nothing logs, the
// box still accepts a number and the record still saves. The only symptom is a
// ranking that quietly never fires, which is indistinguishable from "the engine
// had nothing to say".
//
// This is not hypothetical. All three of these were live on 2026-08-11:
//
//   * GLUCOSE_FASTING / GLUCOSE_RANDOM / HBA1C had authored measurement_rules
//     and no field emitting them, so HIGH_BLOOD_GLUCOSE and LOW_BLOOD_GLUCOSE —
//     which carry no chips and can ONLY be raised by a number — were
//     unreachable, taking the entire diabetes pathway with them: 11 medicines,
//     T2DM and DKA, Endocrinology, four tests, and the hypoglycaemia ->
//     emergency-transfer route.
//   * RELEVANT_FIELDS had a `KNOWN_DIABETES` key. No such signal exists; the
//     signal is `DIABETIC`. The row had never once fired.
//   * `lmp` and `gpla` were added to the catalogue and reached neither print
//     surface — the same defect §10.6 had already found and fixed once for
//     height / blood group / pain / ROM.
//
// So this script exists for the same reason check:dental and check:obstetric
// do: the failure is invisible, and a screenshot proves nothing.
//
// Confirmed non-vacuous by deliberately removing the GLUCOSE_FASTING emission
// (caught, "no field emits it"), by renaming DIABETIC back to KNOWN_DIABETES
// (caught, "not a signal"), and by deleting the lmp line from
// PrescriptionDocument (caught, "recorded but never printed").
//
// Run: node scripts/measure-wiring.mjs   (or npm run check:measures)
// ---------------------------------------------------------------------------

import { readFileSync, unlinkSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { build } from "esbuild";

function loadEnv() {
    const out = {};
    for (const line of readFileSync(new URL("../.env", import.meta.url), "utf8").split("\n")) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (m) out[m[1]] = m[2].trim();
    }
    return out;
}
const env = loadEnv();
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

// ── The RLS trap this script nearly walked into ─────────────────────────────
// Every Synapse reference table carries `synapse_read_all` USING
// (auth.uid() IS NOT NULL). A bare anon key is not signed in, so those reads
// return ZERO ROWS AND NO ERROR. The first version of this script treated that
// as "nothing matched" and cheerfully reported every relevance row as broken
// while the rule check passed by examining nothing at all — a check that is
// worse than no check, because it looks like coverage.
//
// So: sign in if credentials are provided, and if we cannot, SKIP the two
// database checks loudly rather than pass them silently. The two local checks
// (a field emits a key; a field reaches both print surfaces) need no session
// and always run — between them they catch most of this class anyway.
//
// To enable the database half:
//   AREN_CHECK_EMAIL=you@clinic.com AREN_CHECK_PASSWORD=... npm run check:measures
const CRED = {
    email: process.env.AREN_CHECK_EMAIL ?? env.AREN_CHECK_EMAIL,
    password: process.env.AREN_CHECK_PASSWORD ?? env.AREN_CHECK_PASSWORD,
};
let dbReadable = false;
let dbSkipReason = "no AREN_CHECK_EMAIL / AREN_CHECK_PASSWORD set";
if (CRED.email && CRED.password) {
    const { error } = await supabase.auth.signInWithPassword({
        email: CRED.email,
        password: CRED.password,
    });
    if (error) dbSkipReason = `sign-in failed: ${error.message}`;
}
{
    // Prove the session actually reads, rather than trusting that it does.
    const { data, error } = await supabase.from("signals").select("id").limit(1);
    if (error) dbSkipReason = `signals read failed: ${error.message}`;
    else if ((data ?? []).length === 0) {
        dbSkipReason = CRED.email
            ? "signed in, but `signals` still returned nothing — check the account"
            : `${dbSkipReason} (RLS returns zero rows to an anonymous client)`;
    } else dbReadable = true;
}

// Import the REAL modules through esbuild so this cannot drift from the code
// it is checking — same technique as check:obstetric and check:brands.
async function load(rel, tmpName) {
    const TMP = new URL(`../.${tmpName}.tmp.mjs`, import.meta.url);
    await build({
        entryPoints: [fileURLToPath(new URL(rel, import.meta.url))],
        bundle: true,
        format: "esm",
        platform: "neutral",
        outfile: fileURLToPath(TMP),
        logLevel: "silent",
    });
    const mod = await import(TMP.href);
    unlinkSync(TMP);
    return mod;
}

const { MEASURE_FIELDS, RELEVANT_FIELDS } = await load("../src/features/consult/measures.ts", "measures");
const { vitalsToMeasurements } = await load("../src/lib/synapse/consultInput.ts", "cinput");

const errors = [];
const notes = [];
const skipped = [];

// Keys the engine receives without any field behind them — injected from the
// patient record or derived from another field rather than typed.
const DERIVED_OR_INJECTED = new Set([
    "AGE",         // from patient.age, every run
    "BP_SYS", "BP_DIA",                        // one bp field, two keys
    "LMP_DAYS",                                // derived from the lmp date
    "GRAVIDA", "PARA", "LIVING", "ABORTIONS",  // one gpla field, four keys
    // Growth z-scores. Derived in buildEngineInput from weight/height PLUS the
    // patient's date of birth and sex, so they have no field of their own and
    // vitalsToMeasurements alone can never produce them — which is exactly why
    // check:growth exists separately to verify the maths behind them.
    "WAZ", "HAZ",
]);

// Rules that are KNOWINGLY unfed, with a decision behind each. This is a
// baseline, not an excuse: anything not listed here is a regression and fails
// the check. Shrink this list; never grow it without a reason written down.
const KNOWN_UNFED = new Map([
    ["MMT", "Manual muscle testing, 0–5. Belongs with the physiotherapy rebuild — MMT is graded per muscle group, so a single box would be the same mistake as ROM_PCT. Feeds MUSCLE_WEAKNESS / MUSCLE_ATROPHY / WEAKNESS_FOCAL."],
    ["GRIP_KG", "Grip dynamometry, kg. Same rebuild; most Indian OPDs have no dynamometer, so this is low priority. Feeds GRIP_WEAKNESS."],
    // RR was here until 2026-08-11 and is now a real field. The staleness
    // check below is what forces this list to be maintained rather than
    // quietly accumulating: leaving RR listed would now be an error.
]);

// ── 1. Every field in the catalogue emits a measure key ─────────────────────
// A field that reaches vitalsToMeasurements and produces nothing is a box the
// doctor fills in that lands nowhere at all.

const sampleFor = (f) => {
    switch (f.kind) {
        case "bp": return "120/80";
        case "date": return new Date(Date.now() - 60 * 86_400_000).toISOString().slice(0, 10);
        case "gpla": return "2/1/1/0";
        case "select": return f.options?.[0] ?? "x";
        default: return "42";
    }
};

const emittedByField = new Map();
for (const f of MEASURE_FIELDS) {
    const base = { bp: "", pulse: "", temp: "", spo2: "", weight: "" };
    const rows = vitalsToMeasurements({ ...base, [f.key]: sampleFor(f) });
    // Compare against a run with nothing set, so shared/always-on keys don't
    // get miscredited to whichever field happened to be tested.
    const baseline = new Set(vitalsToMeasurements(base).map((r) => r.measureKey));
    const keys = rows.map((r) => r.measureKey).filter((k) => !baseline.has(k));
    if (keys.length === 0) {
        errors.push(`field "${f.key}" (${f.label}) emits no measure key — it is recorded nowhere the engine or the record can see`);
    }
    emittedByField.set(f.key, keys);
}

const allEmitted = new Set([...emittedByField.values()].flat());
for (const k of DERIVED_OR_INJECTED) allEmitted.add(k);

// ── 2. Every measurement rule has something that can feed it ────────────────
// This is the check that would have caught the glucose gap on the day the
// rules were authored.

const { data: rules, error: rulesErr } = dbReadable
    ? await supabase.from("measurement_rules").select("measure_key, signal_id, is_active")
    : { data: null, error: null };
if (rulesErr) {
    errors.push(`could not read measurement_rules: ${rulesErr.message}`);
} else if (!dbReadable) {
    skipped.push("rule coverage — every live measurement_rule has a field feeding it");
} else {
    const live = (rules ?? []).filter((r) => r.is_active);
    const dead = new Map();
    for (const r of live) {
        if (KNOWN_UNFED.has(r.measure_key)) continue;
        if (!allEmitted.has(r.measure_key)) {
            if (!dead.has(r.measure_key)) dead.set(r.measure_key, new Set());
            dead.get(r.measure_key).add(r.signal_id);
        }
    }
    for (const [key, signals] of dead) {
        errors.push(
            `measurement_rules key "${key}" has no field emitting it — ` +
            `${[...signals].join(", ")} can never be raised by a measurement`
        );
    }
    notes.push(`${live.length} live measurement rules across ${new Set(live.map((r) => r.measure_key)).size} keys`);
    const stillUnfed = [...KNOWN_UNFED.keys()].filter((k) => live.some((r) => r.measure_key === k));
    if (stillUnfed.length) {
        notes.push(`${stillUnfed.length} key(s) knowingly unfed and allowlisted: ${stillUnfed.join(", ")}`);
    }
    // An allowlist entry that no longer has any live rule is stale — either the
    // rule was retired or a field now feeds it. Either way, stop claiming it.
    for (const k of KNOWN_UNFED.keys()) {
        if (allEmitted.has(k)) {
            errors.push(`KNOWN_UNFED lists "${k}" but a field now emits it — remove it from the allowlist`);
        } else if (!live.some((r) => r.measure_key === k)) {
            errors.push(`KNOWN_UNFED lists "${k}" but no live rule uses it — the allowlist is stale`);
        }
    }
}

// ── 3. Every RELEVANT_FIELDS key is a real signal ───────────────────────────
// A misspelt signal id is not a crash, it is a row that never fires.

// The field half of this needs no database and always runs; only the
// "is this a real signal id" half depends on a session.
const fieldKeys = new Set(MEASURE_FIELDS.map((f) => f.key));
for (const [signalId, fields] of Object.entries(RELEVANT_FIELDS)) {
    for (const f of fields) {
        if (!fieldKeys.has(f)) {
            errors.push(`RELEVANT_FIELDS["${signalId}"] surfaces "${f}", which is not a field in MEASURE_FIELDS`);
        }
    }
}

const { data: signals, error: sigErr } = dbReadable
    ? await supabase.from("signals").select("id")
    : { data: null, error: null };
if (sigErr) {
    errors.push(`could not read signals: ${sigErr.message}`);
} else if (!dbReadable) {
    skipped.push("signal-id validity — every RELEVANT_FIELDS key names a real signal");
} else {
    const known = new Set((signals ?? []).map((s) => s.id));
    for (const signalId of Object.keys(RELEVANT_FIELDS)) {
        if (!known.has(signalId)) {
            errors.push(`RELEVANT_FIELDS key "${signalId}" is not a signal — this row has never fired and never will`);
        }
    }
    notes.push(`${Object.keys(RELEVANT_FIELDS).length} relevance rows checked against ${known.size} signals`);
}

// ── 4. Every field reaches both print surfaces ──────────────────────────────
// A measurement recorded and never shown is one the doctor cannot verify and
// the patient never receives. Textual check on purpose: these two files are
// hand-maintained lists, which is exactly why they fall behind.

const SURFACES = [
    ["src/components/ReviewModal.tsx", "ReviewModal"],
    ["src/features/prescription/PrescriptionDocument.tsx", "PrescriptionDocument"],
];
for (const [path, name] of SURFACES) {
    const src = readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
    for (const f of MEASURE_FIELDS) {
        if (!src.includes(`vitals.${f.key}`)) {
            errors.push(`"${f.key}" (${f.label}) is never rendered in ${name} — recorded, but the doctor and patient never see it`);
        }
    }
}

// ── Report ──────────────────────────────────────────────────────────────────

console.log(`\nMeasure wiring — ${MEASURE_FIELDS.length} fields`);
for (const n of notes) console.log(`  · ${n}`);

if (skipped.length) {
    console.warn(`\n⚠ ${skipped.length} check${skipped.length === 1 ? "" : "s"} SKIPPED — ${dbSkipReason}`);
    for (const s of skipped) console.warn(`  ~ ${s}`);
    console.warn("  These are the checks that catch an authored rule with nothing feeding it.");
    console.warn("  Enable: AREN_CHECK_EMAIL=… AREN_CHECK_PASSWORD=… npm run check:measures");
}

if (errors.length) {
    console.error(`\n✗ ${errors.length} problem${errors.length === 1 ? "" : "s"}:\n`);
    for (const e of errors) console.error(`  - ${e}`);
    console.error("");
    // exitCode rather than exit(): esbuild keeps a worker alive, and killing
    // the process out from under it trips a libuv assertion on Windows that
    // looks like a crash in the check itself.
    process.exitCode = 1;
}

console.log(
    skipped.length
        ? "\n✓ every field emits a key and reaches both print surfaces (database checks skipped — see above)\n"
        : "\n✓ every field emits a key, every live rule has a source, every relevance row names a real signal, and every field prints\n"
);
