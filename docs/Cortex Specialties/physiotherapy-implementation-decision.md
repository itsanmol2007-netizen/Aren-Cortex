# Physiotherapy — the implementation decision

**Status:** architecture decision, 2026-08-17, written in response to
`AREN_Cortex_Physiotherapy_Clinical_Gap_Report.md`. That report is
deliberately silent on implementation; this is the answer to it.

**The governing principle, in Anmol's words:**

> "We don't want a physiotherapist or a doctor to fit inside Synapse. We
> want Synapse to fit inside their consultation."

Everything below follows from taking that literally.

---

## 1. The decision, up front

**Do not rewrite the engine. Do not touch the ranker at all.**

Synapse is a weighted `signal → intent` recommender. It does not know or
care that its intents are medicines rather than exercises — that was already
proven when `modality` became the seventh intent type in §14.24 and cost a
union member plus two exhaustive maps that `tsc` found by itself.

The gap report lists eighteen missing capabilities. I classified all
eighteen against what they'd actually require:

| Requires | Count | Which |
|---|---|---|
| **Record** — a fact we cannot currently store | 13 | symptom behaviour, irritability, agg/easing, 24-hour pattern, functional limitation, patient goals, AROM/PROM, MMT, special-test semantics, within-session re-test, treatment response, adherence, dose rationale |
| **Screen shape** — the order and grouping of the consultation | 1 | structured physiotherapy examination |
| **Engine CONTENT** — new rows, no new code | 2 | outcome instruments, red-flag/referral (`intent_guards` already exists) |
| **Engine TYPE** — one new intent type, precedent exists | 1 | impairments as a ranked thing |
| **Pure logic** — one module | 1 | MCID (`trend.ts`) |
| **Engine REWRITE** | **0** | — |

Zero of eighteen need the ranker rewritten. That is the answer to "do we
need to change the engine entirely?" — no, and the reason is that **every
gap in the report is a gap in the RECORD, not in the RANKING.** Cortex has
a rich engine and a thin record. Physiotherapy needs the same engine and a
much richer record.

---

## 2. Why "Synapse fits inside their consultation" is a screen decision

Today the consult screen is organised around **Synapse's pipeline**:

```
Case Sheet (feeds engine) → Assessment (engine output) → Plan (engine picks)
```

Every section exists because the engine needs it or produces it. A
physiotherapist walking in has to translate their reasoning into that
pipeline. That is the physiotherapist fitting inside Synapse, and it is
exactly what "rigged" meant.

The inversion: organise the screen around **the physiotherapist's
reasoning**, and let Synapse appear *inside* sections as an offer.

```
Story ──────────── (Synapse: nothing. Just record what they said.)
  ↓
Examination ────── (Synapse: suggests what to test — this cascade EXISTS)
  ↓
Impression ─────── (Synapse: ranks impairments alongside conditions)
  ↓
Intervention ───── (Synapse: ranks therapy + exercise — this already works)
  ↓
Response ───────── (Synapse: nothing. Record what happened.)
```

Two of those five sections have **no Synapse involvement at all**, and that
is the point. A screen where the software is silent for two of five steps
is a screen the clinician owns.

Note gap-report §14 is right that the hypothesis-driven half already partly
exists: `RELEVANT_FIELDS` surfacing measurements from active signals, and
`examSuggestions` (the "what to examine for" cascade wired in §14.15). That
machinery is the correct direction and needs *widening past measurements*,
not reinventing.

---

## 3. The record spine — the one genuinely structural change

This is the only place real architecture changes, and the change is smaller
than it looks because **the right table already exists and is already being
written.**

`visit_measurements` — 154 rows today — is row-per-measurement with
`measure_key`, `value_num`, `value_text`, `unit`. It is upserted on every
save (`lib/db/synapse.ts:962`) and **read by nothing**: `trend.ts`,
`MeasurementsCard`, both print surfaces and `fetchPatientVisits` all read
the `visits.vitals` JSON blob instead. Two homes for one fact, one of them
write-only.

### Why the blob cannot carry physiotherapy

Qualification is currently encoded by exploding the key. Laterality already
did this once: `kneeFlex` became `kneeFlexL` + `kneeFlexR`. Now add the
qualifications the report requires:

| Add | Keys per movement |
|---|---|
| today (side only) | 2 |
| + AROM / PROM | 4 |
| + pre / post re-test | 8 |

Seventeen physiotherapy fields become roughly sixty-eight catalogue
entries, each needing its own label, warn range, trend direction and print
label. That is not a slippery slope — it is the *same doubling that already
happened once*, run twice more.

### The change

Give `visit_measurements` the columns the key was encoding, and make it the
**read** path:

- `side` — left / right / null
- `method` — active / passive / mmt / girth / null
- `context` — baseline / post_intervention / null  ← the within-session re-test
- `qualifier` — free slot for pain-at-end-range, end-feel, etc.

`measure_key` then names the *movement* (`kneeFlex`), not the movement-plus-
its-qualifications. `vitals` stays exactly as it is for General OPD and
every other profile — nothing about those screens changes — and becomes a
derived convenience rather than the source of truth.

**This single change unlocks AROM/PROM, MMT, the within-session re-test and
per-side outcome tracking simultaneously**, because all four are the same
problem: a measurement needs to carry what kind of measurement it was.

⚠ **It also forces a `trend.ts` decision.** `collapseSameDay` deliberately
keeps only the last reading of a day — correct for a longitudinal band,
and it is precisely what destroys a baseline→post-intervention pair. With
`context` on the row, the fix is available: the band trends `baseline`
readings only, and the re-test pair is a separate, within-visit view. That
resolves the conflict rather than trading one bug for another.

---

## 4. What each capability area actually costs

Mapping the gap report's A–J onto real work:

| Area | Mechanism | New code? |
|---|---|---|
| A Patient story | new columns/table on the visit; free text + small enums | Screen + storage. No engine. |
| B Anatomy | **done** — `JointMapCard` + `visit_body_sites` | — |
| C Function | new object: activity + limitation + tolerance | Storage + screen |
| D Patient goals | new object, patient-authored, re-scored per visit (PSFS shape) | Storage + screen |
| E Examination | measurement spine (§3) + special-test rows + observable content | Mostly §3 |
| F Measurement | **§3 is exactly this** | The spine |
| G Clinical reasoning | one new intent type `impairment` + content rows | 1 union member (precedent: `modality`) |
| H Intervention + response | `prescription_exercises` exists; add response/rationale columns | Small |
| I Progression | `exercisePlan.ts` exists; add adherence + rationale | Small |
| J Outcomes | instrument definitions + scores + MCID in `trend.ts` | Content + one module |

**Nothing in that table is a rewrite.** The largest single item is §3, and
§3 is adding four columns to a table that already exists and switching a
read path.

---

## 5. Sequencing — and why the invisible work is NOT first

Anmol's standing instruction is one piece at a time, reviewed. Six phases,
each independently shippable and independently reviewable.

**Phase 1 — The Story section.** Aggravating / easing / 24-hour pattern /
irritability / onset / activity tolerance, in a physiotherapy-shaped
Subjective block. `PhysioInputs.tsx` is born here — the copy of
`GeneralOpdInputs.tsx` the doctrine has always sanctioned "the day a profile
earns its own layout."

*Why first, ahead of the record spine:* it is the front of the clinical
chain, it answers questions 1–6 of the gap report's twenty-question test on
its own, it is **immediately visible** rather than invisible plumbing, and
critically it has **no dependency on §3** — none of these are measurements.
There is no rework risk in doing it first.

**Phase 2 — The record spine (§3).** Invisible, structural, unblocks
everything in Phase 3. Also repays the existing write-only-table debt.

**Phase 3 — The Examination section.** AROM/PROM, MMT, special tests with
real result semantics. This is where Phase 2 pays for itself.

**Phase 4 — Impression.** Functional limitations, impairments as a ranked
intent type, patient-nominated goals.

**Phase 5 — Response.** Within-session re-test, treatment response,
adherence, dose rationale.

**Phase 6 — Outcomes.** Instruments (start with two, not seven) and MCID.

The order is deliberately: **clinician-visible → structural → clinical
depth**, so review can happen against something on screen at every step
except one.

---

## 6. The honest risks

1. **The biggest unknown is still clinical, not technical** — how much of
   this a clinic doing thirty sessions a day will actually fill in. Phase 1
   is the cheapest possible test of that, which is a second argument for it
   going first. If the Story block goes unfilled in real use, Phases 3–6
   should be re-scoped before they are built, not after.
2. **`PhysioInputs.tsx` breaks the doctrine's "no per-specialty branch"
   law**, knowingly. That law should be amended rather than quietly
   violated — it is correct for dentistry and dermatology and wrong here,
   and the doctrine should say so explicitly so the next specialty gets a
   real decision rather than an inherited assumption.
3. **Every phase widens what a physiotherapist must type.** Each one needs
   the doctrine's own test applied: does an empty consultation get shorter,
   and is the doctor ever made to answer something the software could
   have inferred or left alone?
4. **Phase 2 touches the read path of a working feature.** `trend.ts` has
   148 assertions over it; they are the safety net, and they must all still
   pass with the source of truth swapped.

---

## 7. What I need agreed before writing code

- Phase 1 scope: which story fields are **enums** (fast, rankable later)
  versus **free text** (honest, invisible to the engine forever). My
  instinct: irritability and 24-hour pattern as small enums because they
  gate dosing and will eventually want to be signals; aggravating/easing as
  text with chip *suggestions*, because the vocabulary is unbounded.
- Whether `PhysioInputs.tsx` is agreed as the direction, since it is a
  deliberate departure from a written law.
