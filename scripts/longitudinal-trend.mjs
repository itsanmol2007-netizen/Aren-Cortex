// ---------------------------------------------------------------------------
// LONGITUDINAL TREND CHECK — does the band tell the truth?
//
// `features/consult/trend.ts` draws a conclusion about whether a patient is
// getting better. Every failure mode it has produces a CONFIDENT WRONG ANSWER
// rather than a crash or a blank: an arrow pointing the wrong way, a movement
// invented out of a rounding wobble, a year-old reading presented as if it
// were last week's. None of those is visible in a screenshot, because a
// screenshot of a wrong trend looks exactly like a screenshot of a right one.
//
// So the maths is a pure module with no React and no fetch, and this script is
// what proves it. Every case below is one of the edge cases in
// `docs/Cortex Specialties/cortex-longitudinal-spec.md` §6, plus the direction
// cases that section exists because of.
//
// Run: node scripts/longitudinal-trend.mjs   (or npm run check:trend)
// ---------------------------------------------------------------------------

import { unlinkSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

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

const trend = await load("../src/features/consult/trend.ts", "trend");
const { buildTrendSummary, buildSeries, readValue, lastReadingOf, verdictFor, LONG_ABSENCE_DAYS, MAX_SERIES } = trend;
const { FIELD_BY_KEY } = await load("../src/features/consult/measures.ts", "measures2");
const { PROFILES, profileFor } = await load("../src/features/synapse/specialtyProfile.ts", "profiles");

let passed = 0;
const errors = [];

function ok(label, cond) {
    if (cond) passed++;
    else errors.push(label);
}
function eq(label, actual, expected) {
    ok(`${label} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`, actual === expected);
}

// A fixed "now" so nothing here depends on the day it runs.
const NOW = Date.parse("2026-08-16T10:00:00+05:30");
const daysAgo = (n) => new Date(NOW - n * 86_400_000).toISOString();

const visit = (id, days, vitals) => ({ id, created_at: daysAgo(days), vitals });

// ── 1. Direction: the failure the whole feature turns on ────────────────────
// "Each measurement needs to know which direction counts as improvement
// before we render any up/down indicator, or we will show a patient improving
// when they are deteriorating." (spec §6)

{
    // Pain 7 → 4. Lower is better, so this is improvement.
    const s = buildSeries(
        { key: "painVas" },
        [visit("a", 21, { painVas: "7" }), visit("b", 7, { painVas: "4" })],
        null, NOW,
    );
    eq("pain 7 → 4 is improving", s.verdict, "improving");
    eq("pain 7 → 4 delta", s.delta, -3);

    // The same numbers on a field where higher is better must read the other
    // way. This is the pairing that catches a global "down = good" assumption.
    const rom = buildSeries(
        { key: "kneeFlexR" },
        [visit("a", 21, { kneeFlexR: "82" }), visit("b", 7, { kneeFlexR: "108" })],
        null, NOW,
    );
    eq("knee flexion 82 → 108 is improving", rom.verdict, "improving");

    const romDown = buildSeries(
        { key: "kneeFlexR" },
        [visit("a", 21, { kneeFlexR: "108" }), visit("b", 7, { kneeFlexR: "82" })],
        null, NOW,
    );
    eq("knee flexion 108 → 82 is worsening", romDown.verdict, "worsening");

    // Extension lag is the trap inside physiotherapy: it is a range field
    // where the goal is ZERO, so it must not inherit "more degrees is better".
    const lag = buildSeries(
        { key: "kneeExtLagR" },
        [visit("a", 21, { kneeExtLagR: "12" }), visit("b", 7, { kneeExtLagR: "5" })],
        null, NOW,
    );
    eq("knee extension lag 12 → 5 is improving", lag.verdict, "improving");
}

// ── 2. The same field, opposite verdicts, by specialty ──────────────────────
// Weight rising is growth in a child and fluid in heart failure. This is why
// the field itself declares no direction and the specialty overrides it.

{
    const visits = [visit("a", 60, { weight: "70" }), visit("b", 7, { weight: "74" })];

    const neutral = buildSeries({ key: "weight" }, visits, null, NOW);
    eq("weight with no specialty opinion is neutral", neutral.verdict, "neutral");
    eq("...but still reports the change", neutral.delta, 4);

    const cardio = buildSeries({ key: "weight", betterWhen: "lower" }, visits, null, NOW);
    eq("cardiology: +4 kg is worsening (fluid)", cardio.verdict, "worsening");

    const paeds = buildSeries({ key: "weight", betterWhen: "higher" }, visits, null, NOW);
    eq("paediatrics: +4 kg is improving (growth)", paeds.verdict, "improving");

    // And the profiles really do carry those overrides.
    const cardioEntry = PROFILES.cardiology.trend.find((t) => t.key === "weight");
    const paedsEntry = PROFILES.pediatrics.trend.find((t) => t.key === "weight");
    eq("CARDIOLOGY overrides weight to lower", cardioEntry?.betterWhen, "lower");
    eq("PEDIATRICS overrides weight to higher", paedsEntry?.betterWhen, "higher");
}

// ── 3. Band fields: distance from normal, read off the field's own warn() ───

{
    // A fever settling: 103 °F to 98.6 °F. Out of band to in band.
    const fever = buildSeries(
        { key: "temp" },
        [visit("a", 5, { temp: "103" }), visit("b", 1, { temp: "98.6" })],
        null, NOW,
    );
    eq("temp 103 → 98.6 is improving", fever.verdict, "improving");

    // Two normal readings are STEADY, not "improving because it went down".
    const normal = buildSeries(
        { key: "pulse" },
        [visit("a", 30, { pulse: "72" }), visit("b", 2, { pulse: "68" })],
        null, NOW,
    );
    eq("pulse 72 → 68, both normal, is steady", normal.verdict, "steady");

    // Systolic climbing further out of range.
    const bp = buildSeries(
        { key: "bp" },
        [visit("a", 90, { bp: "150/90" }), visit("b", 5, { bp: "170/100" })],
        null, NOW,
    );
    eq("BP 150 → 170 systolic is worsening", bp.verdict, "worsening");
    eq("BP trends the systolic", bp.first, 150);
}

// ── 4. Noise: a rounding wobble is not a clinical change ────────────────────

{
    const s = buildSeries(
        { key: "weight", betterWhen: "lower" },
        [visit("a", 30, { weight: "70.0" }), visit("b", 2, { weight: "70.2" })],
        null, NOW,
    );
    eq("70.0 → 70.2 kg is steady, not worsening", s.verdict, "steady");

    const real = buildSeries(
        { key: "weight", betterWhen: "lower" },
        [visit("a", 30, { weight: "70.0" }), visit("b", 2, { weight: "72.0" })],
        null, NOW,
    );
    eq("70.0 → 72.0 kg clears the noise floor", real.verdict, "worsening");
}

// ── 5. Sparse readings: gaps are gaps, never interpolated ───────────────────
// "Show gaps honestly; do not interpolate or invent a value between two real
// ones." (spec §6)

{
    const s = buildSeries(
        { key: "painVas" },
        [
            visit("a", 28, { painVas: "8" }),
            visit("b", 21, { bp: "120/80" }),          // no pain recorded
            visit("c", 14, {}),                         // nothing recorded
            visit("d", 7, { painVas: "" }),             // recorded blank
            visit("e", 2, { painVas: "5" }),
        ],
        null, NOW,
    );
    eq("five visits, two pain readings → two points", s.points.length, 2);
    eq("...and the series says two sessions, not five", s.sessions, 2);
    eq("...spanning the real dates", s.spanDays, 26);
}

// ── 6. One reading is not a trend ───────────────────────────────────────────

{
    const s = buildSeries({ key: "painVas" }, [visit("a", 7, { painVas: "6" })], null, NOW);
    eq("a single reading yields no series at all", s, null);
}

// ── 7. Same-day repeat visits must not create a second point ────────────────

{
    const s = buildSeries(
        { key: "painVas" },
        [
            visit("a", 14, { painVas: "8" }),
            // Two visits on the same calendar day — front desk re-registered
            // the patient after a test. The later reading is the real one.
            { id: "b", created_at: new Date(NOW - 3 * 86_400_000).toISOString(), vitals: { painVas: "6" } },
            { id: "c", created_at: new Date(NOW - 3 * 86_400_000 + 4 * 3_600_000).toISOString(), vitals: { painVas: "5" } },
        ],
        null, NOW,
    );
    eq("two visits in one day collapse to one point", s.points.length, 2);
    eq("...keeping the later reading", s.last, 5);
}

// ── 8. Today's unsaved reading is the newest point ──────────────────────────

{
    const s = buildSeries(
        { key: "painVas" },
        [visit("a", 21, { painVas: "7" }), visit("b", 7, { painVas: "5" })],
        { painVas: "4" }, NOW,
    );
    eq("the number on screen joins the series", s.points.length, 3);
    eq("...as the last point", s.last, 4);
    ok("...marked as today", s.points[2].isToday === true);
}

// ── 9. Long absence is reported, not hidden ─────────────────────────────────

{
    const recent = buildTrendSummary({
        trend: PROFILES.physiotherapy.trend,
        visits: [visit("a", 21, { painVas: "7" }), visit("b", 4, { painVas: "5" })],
        todayVitals: null,
        now: NOW,
    });
    eq("a patient seen last week is not a long absence", recent.isLongAbsence, false);
    eq("...and the gap is reported anyway", recent.daysSinceLastVisit, 4);

    const lapsed = buildTrendSummary({
        trend: PROFILES.physiotherapy.trend,
        visits: [visit("a", 500, { painVas: "7" }), visit("b", 400, { painVas: "5" })],
        todayVitals: null,
        now: NOW,
    });
    eq("a patient back after 400 days is a long absence", lapsed.isLongAbsence, true);
    eq("...with the real number of days", lapsed.daysSinceLastVisit, 400);
    ok(
        "the threshold sits past every routine follow-up interval",
        LONG_ABSENCE_DAYS >= 90 && LONG_ABSENCE_DAYS <= 365,
    );
}

// ── 10. A first visit renders nothing at all ────────────────────────────────
// "The trend header must degrade gracefully to something useful or disappear
// cleanly. It must never render an empty or broken frame on a new patient."

{
    const s = buildTrendSummary({
        trend: PROFILES.physiotherapy.trend,
        visits: [],
        todayVitals: { painVas: "7", kneeFlexR: "82" },
        now: NOW,
    });
    eq("no history → no series", s.series.length, 0);
    eq("no history → no visit count", s.visitCount, 0);
    eq("no history → no last visit", s.lastVisitAt, null);
    eq("no history → not a long absence", s.isLongAbsence, false);
}

// ── 11. The priority list picks the joint this patient actually has ─────────
// One physiotherapy configuration, a knee patient and a shoulder patient, no
// per-patient setup.

{
    const knee = buildTrendSummary({
        trend: PROFILES.physiotherapy.trend,
        visits: [
            visit("a", 28, { painVas: "7", kneeFlexR: "82", kneeExtLagR: "12" }),
            visit("b", 7, { painVas: "4", kneeFlexR: "108", kneeExtLagR: "5" }),
        ],
        todayVitals: null,
        now: NOW,
    });
    const kneeKeys = knee.series.map((s) => s.key);
    ok(`knee patient trends pain first — got ${kneeKeys.join(", ")}`, kneeKeys[0] === "painVas");
    ok("knee patient trends the knee", kneeKeys.includes("kneeFlexR"));
    ok("knee patient does not trend a shoulder", !kneeKeys.some((k) => k.startsWith("shoulder")));

    const shoulder = buildTrendSummary({
        trend: PROFILES.physiotherapy.trend,
        visits: [
            visit("a", 28, { painVas: "6", shoulderAbdL: "70" }),
            visit("b", 7, { painVas: "5", shoulderAbdL: "95" }),
        ],
        todayVitals: null,
        now: NOW,
    });
    const shoulderKeys = shoulder.series.map((s) => s.key);
    ok("shoulder patient trends the shoulder", shoulderKeys.includes("shoulderAbdL"));
    ok("shoulder patient does not trend a knee", !shoulderKeys.some((k) => k.startsWith("knee")));
}

// ── 12. The band stays a glance ─────────────────────────────────────────────

{
    const everything = {};
    for (const t of PROFILES.physiotherapy.trend) everything[t.key] = "40";
    const later = {};
    for (const t of PROFILES.physiotherapy.trend) later[t.key] = "60";
    const s = buildTrendSummary({
        trend: PROFILES.physiotherapy.trend,
        visits: [visit("a", 28, everything), visit("b", 7, later)],
        todayVitals: null,
        now: NOW,
    });
    ok(`a patient with every field recorded still shows at most ${MAX_SERIES}`, s.series.length <= MAX_SERIES);
    eq("...and it shows exactly that many", s.series.length, MAX_SERIES);
}

// ── 13. Specialties that deliberately have no numeric trend ─────────────────

{
    for (const id of ["dentistry", "dermatology"]) {
        const s = buildTrendSummary({
            trend: PROFILES[id].trend,
            visits: [visit("a", 28, { weight: "70", bp: "120/80" }), visit("b", 7, { weight: "74", bp: "130/85" })],
            todayVitals: null,
            now: NOW,
        });
        eq(`${id} draws no band even with readings available`, s.series.length, 0);
    }
}

// ── 14. Every profile has a trend list, and every key in it is real ─────────
// A misspelt key here is not a crash — it is a card that silently never
// appears, which is the same class of failure as RELEVANT_FIELDS naming a
// signal that does not exist (see check:measures).

{
    for (const [id, profile] of Object.entries(PROFILES)) {
        ok(`${id} declares a trend list`, Array.isArray(profile.trend));
        for (const entry of profile.trend ?? []) {
            const field = FIELD_BY_KEY.get(entry.key);
            ok(`${id} trends "${entry.key}", which is a real field`, !!field);
            if (field) {
                ok(
                    `${id} trends "${entry.key}", which is numeric`,
                    field.kind === "number" || field.kind === "bp",
                );
            }
        }
        const keys = (profile.trend ?? []).map((t) => t.key);
        eq(`${id} lists no key twice`, new Set(keys).size, keys.length);
    }
    // A facility with no profile set falls back to General OPD, which must
    // itself be trendable rather than crashing the band.
    ok("an unknown profile id falls back to a profile with a trend list", Array.isArray(profileFor(null).trend));
}

// ── 15. Reading the stored blob: everything that is not a number ────────────

{
    const painField = FIELD_BY_KEY.get("painVas");
    eq("absent key reads null", readValue(painField, {}), null);
    eq("null vitals reads null", readValue(painField, null), null);
    eq("empty string reads null", readValue(painField, { painVas: "" }), null);
    eq("whitespace reads null", readValue(painField, { painVas: "   " }), null);
    eq("non-numeric text reads null", readValue(painField, { painVas: "moderate" }), null);
    eq("a number typed as a number still reads", readValue(painField, { painVas: 6 }), 6);

    // Non-numeric fields can never be trended, whatever is in them.
    eq("blood group is not trendable", readValue(FIELD_BY_KEY.get("bloodGroup"), { bloodGroup: "O+" }), null);
    eq("G-P-L-A is not trendable", readValue(FIELD_BY_KEY.get("gpla"), { gpla: "2/1/1/0" }), null);

    // Temperature: the one place a doctor can enter two different units, and
    // the one place a fake trend could come from a real pair of readings.
    const tempField = FIELD_BY_KEY.get("temp");
    eq("98.6 °F reads as itself", readValue(tempField, { temp: "98.6" }), 98.6);
    ok("38 (meaning °C) is normalised to °F", Math.abs(readValue(tempField, { temp: "38" }) - 100.4) < 0.01);
    const mixed = buildSeries(
        { key: "temp" },
        [visit("a", 3, { temp: "38" }), visit("b", 1, { temp: "98.6" })],
        null, NOW,
    );
    ok("a °C reading beside a °F one does not fake a 60-degree drop", Math.abs(mixed.delta) < 3);
}

// ── 16. "vs last" reads the most recent visit that actually has the field ───

{
    const visits = [
        visit("a", 28, { painVas: "8" }),
        visit("b", 14, { painVas: "6" }),
        visit("c", 3, { bp: "120/80" }),   // newest visit, no pain recorded
    ];
    const last = lastReadingOf("painVas", visits);
    eq("vs-last skips visits that did not record the field", last.value, 6);
    eq("no prior reading returns null", lastReadingOf("hba1c", visits), null);
}

// ── MCID: a real change that is not a MEANINGFUL change (Phase 6) ──────────
// The failure this guards is specific and silent: an instrument moving four
// points and one moving twenty both drawing the same confident arrow. The
// number moved; the patient did not get better.
{
    const odi = FIELD_BY_KEY.get("odi");
    const qd = FIELD_BY_KEY.get("quickdash");
    const lefs = FIELD_BY_KEY.get("lefs");
    const pain = FIELD_BY_KEY.get("painVas");

    ok("ODI declares an MCID", odi && odi.mcid === 10);
    ok("QuickDASH declares an MCID", qd && qd.mcid === 16);

    // ODI is a DISABILITY score, so lower is better — the opposite of LEFS.
    eq("ODI 48 -> 44 is below MCID, so steady",
        verdictFor(odi, "lower", 48, 44), "steady");
    eq("ODI 48 -> 30 clears MCID, so improving",
        verdictFor(odi, "lower", 48, 30), "improving");
    eq("ODI 30 -> 48 clears MCID the wrong way, so worsening",
        verdictFor(odi, "lower", 30, 48), "worsening");

    // THE BOUNDARY, stated deliberately because it is easy to get backwards
    // and this assertion caught me getting it backwards first: the MCID is
    // the smallest change that DOES matter, so a change of exactly the MCID
    // clears the bar rather than falling short of it. That matches
    // `trendNoise`'s existing `< threshold` semantics exactly, which is why
    // one comparison serves both.
    eq("ODI moving exactly its MCID counts",
        verdictFor(odi, "lower", 40, 30), "improving");
    eq("ODI moving one short of its MCID does not",
        verdictFor(odi, "lower", 40, 30.5), "steady");

    eq("QuickDASH 60 -> 50 is real but below its MCID of 16",
        verdictFor(qd, "lower", 60, 50), "steady");
    eq("QuickDASH 60 -> 40 clears it",
        verdictFor(qd, "lower", 60, 40), "improving");

    // LEFS is a FUNCTION score — higher is better, opposite direction.
    eq("LEFS 40 -> 45 is below its MCID of 9",
        verdictFor(lefs, "higher", 40, 45), "steady");
    eq("LEFS 40 -> 55 clears it",
        verdictFor(lefs, "higher", 40, 55), "improving");

    // Pain: 1 point is noise-and-not-meaningful, 3 clears the 2-point MCID.
    eq("pain 7 -> 6 is not a meaningful change", verdictFor(pain, "lower", 7, 6), "steady");
    eq("pain 7 -> 4 is", verdictFor(pain, "lower", 7, 4), "improving");

    // A field with NO mcid must behave exactly as it did before Phase 6 —
    // this is the backward-compatibility assertion.
    const knee = FIELD_BY_KEY.get("kneeFlexR");
    ok("knee flexion declares no MCID", knee && knee.mcid === undefined);
    eq("a field without an MCID still moves on trendNoise alone",
        verdictFor(knee, "higher", 90, 100), "improving");
}

// ── Report ──────────────────────────────────────────────────────────────────

console.log(`\nLongitudinal trend — ${passed + errors.length} assertions`);

if (errors.length) {
    console.error(`\n✗ ${errors.length} failed:\n`);
    for (const e of errors) console.error(`  - ${e}`);
    console.error("");
    process.exitCode = 1;
} else {
    console.log(
        "\n✓ direction per field and per specialty, band verdicts read off warn(), " +
        "noise floor, sparse gaps uninterpolated, same-day collapse, today's unsaved\n" +
        "  reading, long absence, first visit, per-patient joint selection, and every\n" +
        "  profile's list checked against the catalogue\n"
    );
}
