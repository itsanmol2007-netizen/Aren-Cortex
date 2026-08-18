// ---------------------------------------------------------------------------
// STORY CATALOGUE CHECK — the same class of invisible failure
// `measure-wiring.mjs` exists to catch, one layer over: `story.ts` for
// physiotherapy's Subjective half instead of `measures.ts`.
//
// A `signalId` naming a signal that does not exist fails silently — the chip
// still renders, still saves, and the intended rank simply never fires. See
// `docs/Cortex Specialties/physiotherapy-phase-1-plan.md` §14 for why most of
// `story.ts`'s clinically-real items are deliberately `signalId: null` today.
// This script is what keeps that true rather than assumed.
//
// Confirmed non-vacuous the standing way: break one of the checks below by
// hand, watch it fail, restore it.
//
// Run: node scripts/story-catalogue.mjs   (or npm run check:story)
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

// Same RLS trap as measure-wiring.mjs: `signals` is a Synapse reference
// table behind `auth.uid() IS NOT NULL`. Sign in if creds are provided;
// skip the database half loudly otherwise rather than pass it on zero rows.
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

const story = await load("../src/features/consult/story.ts", "story");
const {
    STORY_FACTORS, STORY_PATTERNS, DURATION_SIGNAL,
    emptyStory, isStoryEmpty, showMechanism, showSettling, suggestIrritability,
} = story;

const errors = [];
const notes = [];
const assert = (cond, msg) => { if (!cond) errors.push(msg); };

console.log("\nStory catalogue\n");

// ── 1. No duplicate keys ────────────────────────────────────────────────────
for (const [name, list] of [["STORY_FACTORS", STORY_FACTORS], ["STORY_PATTERNS", STORY_PATTERNS]]) {
    const seen = new Set();
    for (const item of list) {
        assert(!seen.has(item.key), `${name}: duplicate key "${item.key}"`);
        seen.add(item.key);
    }
}

// ── 2. emptyStory / isStoryEmpty round-trip ─────────────────────────────────
assert(isStoryEmpty(emptyStory()), "emptyStory() is not reported empty by isStoryEmpty()");
assert(!isStoryEmpty({ ...emptyStory(), duration: "under_2wk" }), "setting duration did not un-empty the story");
assert(!isStoryEmpty({ ...emptyStory(), aggravating: ["stairs_down"] }), "setting a chip did not un-empty the story");
assert(!isStoryEmpty({ ...emptyStory(), note: "x" }), "setting free text did not un-empty the story");

// ── 3. Reveal predicates are reachable both ways — a field that can never
//    appear, or is never hideable, is a bug the same way a dead code path is.
{
    const shown = { ...emptyStory(), onsetMode: "post_traumatic" };
    const hidden = { ...emptyStory(), onsetMode: "sudden" };
    assert(showMechanism(shown), "showMechanism never returns true — mechanism can never appear");
    assert(!showMechanism(hidden), "showMechanism never returns false — mechanism is core-in-disguise");
}
{
    const shown = { ...emptyStory(), irritability: "high" };
    const hidden = { ...emptyStory(), irritability: "low" };
    assert(showSettling(shown), "showSettling never returns true — settling can never appear");
    assert(!showSettling(hidden), "showSettling never returns false — settling is core-in-disguise");
}

// ── 4. suggestIrritability never overrides an answer already given ─────────
{
    const answered = { ...emptyStory(), irritability: "low", pattern: ["night_pain"] };
    assert(suggestIrritability(answered) === null,
        "suggestIrritability returned a suggestion over an existing answer — this would silently override the doctor");
    const unanswered = { ...emptyStory(), pattern: ["night_pain"] };
    const s = suggestIrritability(unanswered);
    assert(s && s.value === "high", "suggestIrritability did not suggest High for night pain");
    assert(suggestIrritability(emptyStory()) === null,
        "suggestIrritability suggested something with no pattern at all — should stay quiet");
}

// ── 5. Every signalId — in STORY_FACTORS, STORY_PATTERNS and
//    DURATION_SIGNAL — names a real, live signal. This is the check the
//    file's own header exists to have: a hand-typed signalId can be wrong
//    exactly the way a copy-pasted RELEVANT_FIELDS key can.
const allSignalIds = [
    ...STORY_FACTORS.map((f) => f.signalId),
    ...STORY_PATTERNS.map((p) => p.signalId),
    ...Object.values(DURATION_SIGNAL),
].filter((id) => id !== null && id !== undefined);

if (!dbReadable) {
    notes.push("signal-id validity — skipped, no AREN_CHECK_EMAIL / AREN_CHECK_PASSWORD");
} else {
    const { data: signals, error } = await supabase.from("signals").select("id");
    if (error) {
        errors.push(`could not read signals: ${error.message}`);
    } else {
        const known = new Set((signals ?? []).map((s) => s.id));
        for (const id of allSignalIds) {
            assert(known.has(id), `story.ts names signal "${id}", which does not exist in the signals table`);
        }
        notes.push(`${allSignalIds.length} signal references checked against ${known.size} real signals`);
    }
}

// ── Report ───────────────────────────────────────────────────────────────
console.log(`  ${STORY_FACTORS.length} factors (${STORY_FACTORS.filter(f=>f.direction==="aggravating").length} aggravating, ${STORY_FACTORS.filter(f=>f.direction==="easing").length} easing), ${STORY_PATTERNS.length} pattern items`);
console.log(`  ${allSignalIds.length} of them wired to a real signal, ${STORY_FACTORS.length + STORY_PATTERNS.length - allSignalIds.length} record-only`);
for (const n of notes) console.log(`  · ${n}`);

if (errors.length > 0) {
    console.log(`\n✗ ${errors.length} problem(s)\n`);
    for (const e of errors) console.log(`  - ${e}`);
    process.exit(1);
} else {
    console.log("\n✓ catalogue consistent, reveal predicates reachable both ways, no silent override\n");
}
