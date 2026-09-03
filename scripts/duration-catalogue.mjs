// ---------------------------------------------------------------------------
// DURATION CATALOGUE CHECK — the third of this family, after
// `measure-wiring.mjs` (signal -> measurement key) and `story-catalogue.mjs`
// (story item -> signal). Same class of invisible failure, one layer over:
// `duration.ts` names OBSERVABLE SLUGS, by hand, and a slug that does not
// exist fails silently — the duration is still asked, still stored, and the
// escalation it was supposed to offer simply never appears.
//
// Standing rule 19: when two things must agree, make one read the other. This
// script is how `ASKS_DURATION` / `DURATION_ESCALATIONS` keep reading the
// catalogue instead of remembering it.
//
// Confirmed non-vacuous the standing way: break one of the checks below by
// hand, watch it fail, restore it.
//
// Run: node scripts/duration-catalogue.mjs   (or npm run check:duration)
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
    // Real credentials belong in the environment, never in `.env` — that file
    // is committed on purpose (standing rule 21) and holds only the public
    // anon key. `AREN_CHECK_EMAIL=… AREN_CHECK_PASSWORD=… npm run
    // check:duration` is how the database half of this script actually runs.
    return { ...out, ...process.env };
}
const env = loadEnv();
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

// Same RLS trap the other two scripts document: a bare anon key returns ZERO
// ROWS AND NO ERROR on these tables, which would pass this check vacuously.
// Sign in if creds are provided; skip the database half loudly otherwise.
let dbReadable = false;
if (env.AREN_CHECK_EMAIL && env.AREN_CHECK_PASSWORD) {
    const { error } = await supabase.auth.signInWithPassword({
        email: env.AREN_CHECK_EMAIL, password: env.AREN_CHECK_PASSWORD,
    });
    dbReadable = !error;
    if (error) console.log(`  (could not sign in: ${error.message} — DB checks will skip)`);
}

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

const {
    ASKS_DURATION, DURATION_ESCALATIONS, escalationFor,
    parseDurationDays, durationChoicesFor, formatDuration, shortDuration, bareNumber,
} = await load("../src/features/consult/duration.ts", "duration");

const errors = [];
const notes = [];
const assert = (cond, msg) => { if (!cond) errors.push(msg); };

console.log("\nDuration catalogue\n");

// ── 1. Parsing — every unit, and the ambiguity that must stay ambiguous ────
assert(parseDurationDays("3 days") === 3, "'3 days' did not parse to 3");
assert(parseDurationDays("3d") === 3, "'3d' did not parse to 3");
assert(parseDurationDays("3 weeks") === 21, "'3 weeks' did not parse to 21");
assert(parseDurationDays("2 months") === 60, "'2 months' did not parse to 60");
assert(parseDurationDays("1 year") === 365, "'1 year' did not parse to 365");
assert(parseDurationDays("3") === null, "a bare '3' parsed to a duration — it is ambiguous by design");
assert(parseDurationDays("") === null, "empty string parsed to a duration");
assert(parseDurationDays("0 days") === null, "'0 days' parsed — zero is not a duration anyone says");

// ── 2. The complaint that started this work: ANY number is enterable ───────
// Physiotherapy's DURATION_TERMS is eighteen hard-coded strings, so "4 days"
// and "37 days" had no option to pick. Nothing may be hard-coded here.
for (const n of [4, 5, 6, 7, 11, 17, 30, 37, 123]) {
    const choices = durationChoicesFor(String(n));
    assert(choices.length === 3, `a bare "${n}" did not offer days/weeks/months`);
    assert(choices[0].days === n, `a bare "${n}" did not offer ${n} days`);
    const exact = durationChoicesFor(`${n} days`);
    assert(exact.length === 1 && exact[0].days === n, `"${n} days" did not resolve to exactly ${n} days`);
}

// ── 3. Formatting round-trips through the words a clinician says ──────────
assert(formatDuration(1) === "1 day", "1 day formatted wrong");
assert(formatDuration(5) === "5 days", "5 days formatted wrong");
assert(formatDuration(21) === "3 weeks", "21 days did not read as 3 weeks");
assert(formatDuration(90) === "3 months", "90 days did not read as 3 months");
assert(shortDuration(5) === "5d" && shortDuration(21) === "3w" && shortDuration(90) === "3mo",
    "the chip's short form is wrong for one of 5d / 3w / 3mo");
assert(bareNumber("12") === 12 && bareNumber("12 days") === null,
    "bareNumber does not distinguish a bare number from a qualified one");

// ── 4. Escalations fire at the threshold and not before ───────────────────
{
    assert(escalationFor("fever", 13) === null, "fever escalated below the 2-week threshold");
    assert(escalationFor("fever", 14)?.toSlug === "fever_prolonged", "fever did not escalate at 14 days");
    assert(escalationFor("cough", 20) === null, "cough escalated below the 3-week threshold");
    assert(escalationFor("cough", 21)?.toSlug === "cough_chronic", "cough did not escalate at 21 days");
    assert(escalationFor("runny_nose", 400) === null, "a symptom with no escalation rule produced one");
}

// ── 5. Every slug named here is a real, live, symptom-kind observable ──────
// The whole point of the script. An escalation `toSlug` that does not exist
// renders a suggestion the doctor can click and that does nothing.
const asked = [...ASKS_DURATION];
const escalateTo = Object.values(DURATION_ESCALATIONS).flat().map((e) => e.toSlug);
const escalateFrom = Object.keys(DURATION_ESCALATIONS);
const allSlugs = [...new Set([...asked, ...escalateTo, ...escalateFrom])];

for (const from of escalateFrom) {
    assert(ASKS_DURATION.has(from),
        `"${from}" has an escalation rule but is never ASKED for a duration — the rule is unreachable`);
}

if (!dbReadable) {
    notes.push("slug validity — skipped, no AREN_CHECK_EMAIL / AREN_CHECK_PASSWORD");
} else {
    const { data: rows, error } = await supabase
        .from("observables").select("slug, kind, is_active").in("slug", allSlugs);
    if (error) {
        errors.push(`could not read observables: ${error.message}`);
    } else if (!rows?.length) {
        errors.push("observables came back empty — refusing to pass this check vacuously");
    } else {
        const byslug = new Map(rows.map((o) => [o.slug, o]));
        for (const slug of allSlugs) {
            const hit = byslug.get(slug);
            assert(hit, `duration.ts names observable "${slug}", which does not exist`);
            if (!hit) continue;
            assert(hit.is_active, `duration.ts names "${slug}", which is inactive`);
            assert(hit.kind === "symptom",
                `duration.ts names "${slug}", which is kind "${hit.kind}" — a duration qualifies a symptom, not a ${hit.kind}`);
        }
        notes.push(`${allSlugs.length} slug references checked against the live catalogue`);
    }
}

console.log(`  ${asked.length} symptoms asked for a duration, ${escalateFrom.length} of them with a threshold escalation`);
for (const n of notes) console.log(`  · ${n}`);

if (errors.length > 0) {
    console.log(`\n✗ ${errors.length} problem(s)\n`);
    for (const e of errors) console.log(`  - ${e}`);
    process.exit(1);
} else {
    console.log("\n✓ every slug real and active, parsing accepts any number, escalations fire only at threshold\n");
}
