// ---------------------------------------------------------------------------
// EXERCISE PROGRESSION CHECK — does the badge tell the truth?
//
// `features/consult/exercisePlan.ts` prints a word next to every exercise on a
// physiotherapy plan: Progressed, Same, Added, Eased. A physiotherapist opening
// session 9 reads that word to decide whether to make the programme harder.
//
// Every failure mode here is silent and confident. A left knee collapsing into
// a right knee shows one badge for two prescriptions. A missing dose compared
// against a present one reads as "eased" when nothing was eased. Reps and holds
// added together make a wall sit look like it tripled. None of that is visible
// on screen — the word is short, plausible and wrong.
//
// Run: node scripts/exercise-progression.mjs   (or npm run check:exercise)
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

const {
    volumeOf, progressionOf, comparePlans, identityOf,
    formatDose, formatLine, doseFor, DEFAULT_DOSE,
} = await load("../src/features/consult/exercisePlan.ts", "expl");

let passed = 0;
const errors = [];
const ok = (label, cond) => { if (cond) passed++; else errors.push(label); };
const eq = (label, actual, expected) =>
    ok(`${label} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`, actual === expected);

const dose = (sets, reps, holdSeconds = null, perDay = 1) => ({ sets, reps, holdSeconds, perDay });
const line = (id, label, d, extra = {}) => ({
    id, intentId: id, label, side: null, notes: "", sortOrder: 0, ...d, ...extra,
});

// ── 1. The four verdicts ────────────────────────────────────────────────────

eq("nothing last session is 'added'", progressionOf(dose(3, 10), undefined), "added");
eq("more reps is 'progressed'", progressionOf(dose(3, 12), dose(3, 10)), "progressed");
eq("more sets is 'progressed'", progressionOf(dose(4, 10), dose(3, 10)), "progressed");
eq("identical is 'same'", progressionOf(dose(3, 10), dose(3, 10)), "same");
eq("fewer reps is 'eased'", progressionOf(dose(3, 8), dose(3, 10)), "eased");

// Easing is a real clinical decision — a flare-up means backing off — so it
// must not be reported as deterioration or hidden.
eq("halving the sets is 'eased'", progressionOf(dose(2, 10), dose(4, 10)), "eased");

// ── 2. Holds are the other unit, and must not be added to reps ──────────────

eq("a longer hold is 'progressed'", progressionOf(dose(3, null, 30), dose(3, null, 20)), "progressed");
eq("the same hold is 'same'", progressionOf(dose(3, null, 30), dose(3, null, 30)), "same");
// 3 x 30 sec has a bigger raw number than 3 x 12 reps, but they are never
// compared: identity is per exercise, and one exercise is dosed one way.
eq("a hold at the same volume as reps still compares within itself",
    progressionOf(dose(3, null, 12), dose(3, null, 12)), "same");
// If both are somehow filled in, reps wins — see volumeOf's note.
eq("reps win when a line carries both", volumeOf(dose(3, 10, 30, 1)), 30);

// ── The unit switch. Found in the BROWSER rather than here, which is why the
// assertions exist now: 3 x 12 reps and 3 x 10 sec have volumes of 36 and 30,
// so a naive comparison confidently reported "eased" — repetitions against
// seconds.
eq("reps today, a hold last time, cannot be compared",
    progressionOf(dose(3, 12), dose(3, null, 10)), "unknown");
eq("a hold today, reps last time, cannot be compared either",
    progressionOf(dose(3, null, 10), dose(3, 12)), "unknown");
eq("...even when the raw numbers would say 'progressed'",
    progressionOf(dose(3, null, 60), dose(3, 12)), "unknown");
// The guard must not swallow the cases either side of it.
eq("a unit against no unit at all is still unknown",
    progressionOf(dose(3, 12), dose(3, null, null, 1)), "unknown");
eq("the same unit still compares normally after the guard",
    progressionOf(dose(3, null, 30), dose(3, null, 20)), "progressed");
eq("reps against reps still compares normally",
    progressionOf(dose(3, 15), dose(3, 12)), "progressed");

// ── 3. Times per day is part of the load ────────────────────────────────────

eq("twice daily is more than once daily",
    progressionOf(dose(3, 10, null, 2), dose(3, 10, null, 1)), "progressed");
eq("...and the volume reflects it", volumeOf(dose(3, 10, null, 2)), 60);

// ── 4. Missing numbers, which is the case that invents a wrong badge ────────

eq("no numbers on either side is 'same'",
    progressionOf(dose(null, null, null, null), dose(null, null, null, null)), "same");
eq("numbers today, none last time, is 'unknown' — not 'progressed'",
    progressionOf(dose(3, 10), dose(null, null, null, null)), "unknown");
eq("numbers last time, none today, is 'unknown' — not 'eased'",
    progressionOf(dose(null, null, null, null), dose(3, 10)), "unknown");
eq("an undosed line has no volume at all", volumeOf(dose(null, null, null, null)), null);

// ── 5. Identity: left and right are two prescriptions ───────────────────────

{
    const left = { intentId: 21, label: "Straight leg raise", side: "left" };
    const right = { intentId: 21, label: "Straight leg raise", side: "right" };
    ok("the same exercise on two sides has two identities", identityOf(left) !== identityOf(right));
    ok("the same exercise on the same side has one identity",
        identityOf(left) === identityOf({ ...left, label: "different text" }));

    // A free-typed exercise has no intent id and falls back to its label.
    const typedA = { intentId: null, label: "Scapular setting", side: null };
    const typedB = { intentId: null, label: "  scapular setting  ", side: null };
    ok("a typed exercise identifies by label, case- and space-insensitively",
        identityOf(typedA) === identityOf(typedB));
    ok("a typed exercise never collides with a catalogue one",
        identityOf(typedA) !== identityOf({ intentId: 21, label: "Scapular setting", side: null }));
}

// ── 6. A whole plan, session over session ───────────────────────────────────

{
    const lastSession = [
        line(21, "Quadriceps isometrics", dose(3, null, 10)),
        line(22, "Terminal knee extension", dose(3, 12)),
        line(23, "Straight leg raise", dose(3, 12)),
    ];
    const thisSession = [
        line(21, "Quadriceps isometrics", dose(3, null, 20)),  // longer hold
        line(22, "Terminal knee extension", dose(3, 12)),      // unchanged
        line(24, "Wall sit", dose(3, null, 30)),               // new
    ];

    const cmp = comparePlans(thisSession, lastSession);
    eq("the progressed one", cmp.byIdentity.get(identityOf(thisSession[0])), "progressed");
    eq("the held one", cmp.byIdentity.get(identityOf(thisSession[1])), "same");
    eq("the new one", cmp.byIdentity.get(identityOf(thisSession[2])), "added");
    eq("one exercise was dropped", cmp.dropped.length, 1);
    eq("...and it is the right one", cmp.dropped[0].label, "Straight leg raise");
    eq("there was a previous plan", cmp.hasPrevious, true);
}

// ── 7. A first-ever plan ────────────────────────────────────────────────────

{
    const cmp = comparePlans([line(21, "Quadriceps isometrics", dose(3, 10))], []);
    eq("every line on a first plan reads 'added'",
        cmp.byIdentity.get(identityOf(line(21, "Quadriceps isometrics", dose(3, 10)))), "added");
    eq("nothing was dropped", cmp.dropped.length, 0);
    // The card uses this to decide whether to print badges at all — "Added" on
    // every row of a first plan is noise, not information.
    eq("and it knows there was no previous plan", cmp.hasPrevious, false);
}

// ── 8. Sided lines progress independently ───────────────────────────────────

{
    const last = [
        line(21, "Straight leg raise", dose(3, 10), { side: "left" }),
        line(21, "Straight leg raise", dose(3, 10), { side: "right" }),
    ];
    const today = [
        line(21, "Straight leg raise", dose(3, 15), { side: "left" }),   // operated side
        line(21, "Straight leg raise", dose(3, 10), { side: "right" }),  // held
    ];
    const cmp = comparePlans(today, last);
    eq("the operated side progressed", cmp.byIdentity.get(identityOf(today[0])), "progressed");
    eq("the other side held", cmp.byIdentity.get(identityOf(today[1])), "same");
    eq("neither counts as dropped", cmp.dropped.length, 0);
}

// ── 9. How it prints ────────────────────────────────────────────────────────

eq("reps", formatDose(dose(3, 12)), "3 × 12");
eq("holds carry their unit", formatDose(dose(3, null, 30)), "3 × 30 sec");
eq("once daily is not worth saying", formatDose(dose(3, 12, null, 1)), "3 × 12");
eq("twice daily is", formatDose(dose(3, 12, null, 2)), "3 × 12 · 2× daily");
eq("an undosed line prints nothing", formatDose(dose(null, null, null, null)), "");
eq("sets alone still read", formatDose(dose(3, null, null, null)), "3 sets");

eq("a full line",
    formatLine(line(21, "Straight leg raise", dose(3, 12), { side: "right" })),
    "Straight leg raise (R) — 3 × 12");
eq("an undosed line is just its name",
    formatLine(line(21, "Scapular setting", dose(null, null, null, null))),
    "Scapular setting");
eq("notes come through",
    formatLine(line(21, "Wall sit", dose(3, null, 30), { notes: "pain-free range only" })),
    "Wall sit — 3 × 30 sec · pain-free range only");

// ── 10. Starting dose ───────────────────────────────────────────────────────

eq("a counted exercise starts on reps", doseFor("Terminal knee extension").reps, DEFAULT_DOSE.reps);
eq("...and no hold", doseFor("Terminal knee extension").holdSeconds, null);
eq("an isometric starts on a hold", doseFor("Quadriceps isometrics — 10 sec hold").holdSeconds, 10);
eq("...and no reps", doseFor("Quadriceps isometrics — 10 sec hold").reps, null);
eq("a wall sit is a hold", doseFor("Wall Sit").holdSeconds, 10);
eq("a plank is a hold", doseFor("Plank").holdSeconds, 10);
ok("the default is never zero volume", volumeOf(DEFAULT_DOSE) > 0);

// ── Report ──────────────────────────────────────────────────────────────────

console.log(`\nExercise progression — ${passed + errors.length} assertions`);
if (errors.length) {
    console.error(`\n✗ ${errors.length} failed:\n`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exitCode = 1;
} else {
    console.log(
        "\n✓ the four verdicts, holds vs reps kept apart, times-per-day counted,\n" +
        "  missing doses refusing to invent a badge, left and right progressing\n" +
        "  independently, drops detected, and the printed forms\n"
    );
}
