# Physiotherapy Phase 1 — implementation plan (for review, revision 2)

**Status:** proposed, not built. Nothing applied to the database, no code
written. 2026-08-17.

**Revision 2** folds in Anmol's final implementation direction: patient goals
move into Phase 1, progressive disclosure becomes a core requirement rather
than a nicety, and every field must now pass a stated test. Running that test
against revision 1's own field list cut two controls and demoted two more —
see §3.

---

## 0. The governing law, from here on

> **Cortex should know a lot, but show little.**

And the test every new clinical field must pass:

> **Does this change clinical reasoning, treatment/dosing, or meaningful
> progress/outcome?**
> If not, it does not occupy the default consultation surface.

This is not advice about Phase 1. It governs Phases 1–6, and it belongs in
the doctrine (§8) so the next specialty inherits it as a law rather than as
a preference.

The objective is **not to collect more physiotherapy data.** It is to make
the consultation able to represent physiotherapy reasoning without becoming
an assessment form.

---

## 1. What Phase 1 delivers

The Subjective half becomes physiotherapy's: how the symptom behaves, how
hard the patient can be pushed today, and **what they are trying to get back
to.**

Against the gap report's §27 test:

| # | Question | Answered by |
|---|---|---|
| 1 | Why did the patient come? | onset + duration |
| 3 | How do the symptoms behave? | 24-hour pattern |
| 4 | What activities provoke them? | aggravating chips |
| 5 | What activities are limited? | activity tolerance |
| **6** | **What does the patient want to get back to?** | **goals — moved here from Phase 4** |
| — | How hard can I push today? | **irritability** |

**Why goals moved earlier** (Anmol's direction, and it is right): the goal
changes what matters during examination. A patient whose goal is "climb
stairs at work" makes loaded knee flexion the thing worth measuring; a
patient whose goal is "sleep through the night" makes night pain the
outcome. Collecting the goal *after* the examination means the examination
was never shaped by it.

---

## 2. Progressive disclosure — the mechanism, not the intention

"Show little" fails if it is left to per-field judgement. It needs to be a
declared property with one implementation.

Cortex already has this pattern and it is proven: `RELEVANT_FIELDS` maps a
signal to measurement keys, and `MeasurementsCard` renders an inline set
plus a "More" surface holding everything else. Phase 1 uses the identical
shape for story fields, so there is one idea in the codebase, not two.

Each story field declares:

```ts
interface StoryField {
    key: string;
    label: string;
    /** on the default surface, always */
    core: boolean;
    /** revealed when the consultation makes it relevant */
    revealWhen?: (s: Story, signals: Set<string>) => boolean;
    // everything not core and not revealed is still reachable under "More"
}
```

Three tiers, and **nothing is ever unreachable**:

| Tier | Rule | Example |
|---|---|---|
| **Core** | passes the hard rule for essentially every physiotherapy patient | irritability, aggravating, goal |
| **Revealed** | passes the rule only in a context, and the context is detectable | mechanism — only when onset is traumatic or post-surgical |
| **Discoverable** | passes the rule rarely; never hidden, never default | free-text note |

This is the doctrine's existing distinction between what is **offered** and
what is **reachable**, applied to the Subjective half.

**Across time, too:** on a follow-up visit the Story block renders collapsed
to a one-line summary of last visit's story, with the goal scores as the
only live controls. The story is usually already known; what changed is not.

---

## 3. The hard rule applied to revision 1 — what it cut

Running Anmol's test honestly against my own previous field list:

| Field | Verdict |
|---|---|
| Irritability | **Core.** Changes dosing directly. The single most load-bearing field in Phase 1. |
| Aggravating factors | **Core.** Changes reasoning and what to avoid. |
| Patient goal | **Core.** Defines what "better" means and directs examination. |
| 24-hour pattern | **Core.** Morning stiffness >30 min and night pain both change reasoning. |
| Activity tolerance | **Core.** Dosing baseline, and it is itself a progress measure. |
| Onset | **Core, reshaped.** See below. |
| Easing factors | **Core**, but paired into one control with aggravating rather than given its own row. |
| ~~Constancy~~ | **CUT as its own control.** "Constant" folds into the 24-hour pattern chips. It was a separate control asking a question the pattern set already answers. |
| ~~Mechanism~~ | **Demoted to Revealed** — appears only when onset is traumatic or post-surgical. Otherwise it is a free-text box that changes nothing. |
| ~~Onset date~~ | **Replaced by duration chips** (<2wk / 2–6wk / 6wk–3mo / >3mo). What changes management is acute-vs-subacute-vs-chronic, not the calendar date. Faster to fill and encodes the clinically meaningful thing directly. |
| Settling time | **New, but Revealed** — appears only when irritability is moderate or high, which is exactly when dosing precision matters. |
| Free-text note | **Discoverable.** Always last, never default. |

Net effect: the default surface is **six controls**, not eleven. That is the
rule doing real work rather than being quoted.

---

## 4. Schema — three tables, and the vocabulary is code

Revision 1 proposed a `story_factors` table plus a link table. **Dropped
both**, in favour of the pattern this codebase already uses for exactly this
problem: `MEASURE_FIELDS` is a TypeScript catalogue, and the atlas records
as a virtue that adding a measurement field "costs no database work."

The factor vocabulary therefore lives in `src/features/consult/story.ts`
beside `measures.ts`, and the visit stores the picked keys. Adding a factor
becomes a reviewed code change, not a migration.

```sql
-- 1. One row per visit.
create table visit_story (
    visit_id     uuid primary key references visits(id) on delete cascade,
    duration     text check (duration in ('under_2wk','2_6wk','6wk_3mo','over_3mo')),
    onset_mode   text check (onset_mode in
                   ('sudden','gradual','post_surgical','post_traumatic','unknown')),
    mechanism    text,
    irritability text check (irritability in ('low','moderate','high')),
    settling     text check (settling in ('immediate','under_5min','5_30min','over_30min','hours')),
    -- catalogue keys from story.ts; closed sets, never joined on
    aggravating  text[] not null default '{}',
    easing       text[] not null default '{}',
    pattern      text[] not null default '{}',
    tolerance    text,
    note         text,
    created_by_doctor_id uuid references doctors(id) on delete set null,
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now()
);

-- 2. A goal belongs to the PATIENT and outlives the visit that created it.
--    Same shape as patient_conditions, deliberately.
create table patient_goals (
    id            bigserial primary key,
    patient_id    uuid not null references patients(id) on delete cascade,
    /** the patient's own words — this is patient-authored content */
    activity      text not null,
    baseline_score int check (baseline_score between 0 and 10),
    status        text not null default 'active'
                    check (status in ('active','achieved','abandoned')),
    created_visit_id uuid references visits(id) on delete set null,
    created_at    timestamptz not null default now(),
    closed_at     timestamptz
);

-- 3. Re-scored each visit. This is what makes a goal a TREND.
create table visit_goal_scores (
    visit_id   uuid   not null references visits(id) on delete cascade,
    goal_id    bigint not null references patient_goals(id) on delete cascade,
    score      int    not null check (score between 0 and 10),
    created_at timestamptz not null default now(),
    primary key (visit_id, goal_id)
);
```

RLS on all three: isolation through `patients` / `visits`, **never** through
a nullable `hospital_id` (§14.13's bug in reverse), and **policies created
in the same migration as the tables**, because RLS-on-with-zero-policies is
a silent empty set that returns no error (trap 2, and how `care_plans`
shipped inert).

**The `signal_id` seam moves into code**: each catalogue entry in `story.ts`
carries an optional `signalId`, null for now. Chips record; they do not yet
rank. Filling those in blind would repeat the "rules against signals nothing
feeds" mistake — it waits for real usage.

---

## 5. Files

**New**

| File | Purpose |
|---|---|
| `src/features/consult/story.ts` | The catalogue: factors, patterns, enums, `core`/`revealWhen` per field. Pure data + predicates, no React — testable from node like `trend.ts`. |
| `src/features/consult/StoryCard.tsx` | The block. Renders core, evaluates `revealWhen`, holds "More". |
| `src/features/consult/GoalsCard.tsx` | Goals: add in the patient's words, score 0–10, re-score on later visits. |
| `src/features/consult/PhysioInputs.tsx` | The physiotherapy input surface. |
| `src/hooks/useVisitStory.ts` | Story + goals state, layer-1 "facts" slot per the hook table. |
| `src/lib/db/story.ts` | Supabase boundary. |
| `scripts/story-catalogue.mjs` | `npm run check:story`. |

**Changed**

| File | Change |
|---|---|
| `specialtyProfile.ts` | `inputLayout` gains `"physio"`. `tsc` finds every exhaustive switch. |
| `App.tsx` | One branch. |
| `useConsultLifecycle.ts` | Persist story + goal scores on save — **catching, not throwing**, after the visit is committed (§14.25's ordering fix). |
| `ReviewModal.tsx` | Story + goals in the doctor's own review. Not on the patient prescription. |
| `aren-cortex-ui-doctrine.md` | Two amendments — §8. |

---

## 6. The screen

First visit, default state — six controls:

```
┌─ STORY ───────────────────────────────────────────────┐
│  How long   (<2wk)(2-6wk)(6wk-3mo)(>3mo)              │
│  Onset      (sudden)(gradual)(post-op)(injury)        │
│                                                       │
│  Worse with  [stairs ×][squatting ×]        + add     │
│  Better with [rest ×]                       + add     │
│  Pattern     (morning >30min)(night pain)(constant)   │
│                                                       │
│  Irritability  ( Low )( Moderate )( High )       ⓘ    │
│  Tolerance     10 min walking → 6/10                  │
│                                              More ⌄   │
└───────────────────────────────────────────────────────┘
┌─ GOALS ───────────────────────────────────────────────┐
│  "Climb two flights at work"          3/10  [ ─── ]   │
│  + add what they want to get back to                  │
└───────────────────────────────────────────────────────┘
```

Pick "injury" and a mechanism field appears. Set irritability to High and
settling time appears. Neither is there otherwise.

Follow-up visit, default state:

```
┌─ STORY  6wk-3mo · injury · worse on stairs · high irritability   ⌄ ┐
└────────────────────────────────────────────────────────────────────┘
┌─ GOALS ───────────────────────────────────────────────┐
│  "Climb two flights at work"    3 → 6/10  [ ─── ]  ↑  │
└───────────────────────────────────────────────────────┘
```

The story collapses to one line; the goal score is the live control, because
re-scoring it is the point of a follow-up.

**An empty Story block is one collapsed line.** Doctrine's own test — does
an empty consultation get shorter — is satisfied by construction.

---

## 7. Verification

1. `npm run check:story` — every catalogue key valid against the CHECK
   constraints, every `revealWhen` predicate reachable (a field that can
   never appear is a bug), no orphan `signalId`. **Proven non-vacuous** by
   breaking a row, per standing practice.
2. **Chromium harness** on the real components: six controls by default;
   mechanism appears on traumatic onset **and not otherwise**; settling
   appears on high irritability; "More" reaches every non-core field;
   collapsed follow-up renders the summary line; a goal re-scores and the
   delta shows.
3. **Verified in Postgres, not on screen** (trap 1) — query `visit_story`,
   `patient_goals` and `visit_goal_scores` after a real save.
4. `tsc -b`, `vite build`, every existing `check:*`. Phase 1 must be a
   provable no-op for General OPD and the six `SoapInputs` profiles.
5. RLS proven by reading `pg_policy`.

---

## 8. Doctrine amendments

Two, both stated rather than quietly assumed:

**(a) On per-specialty branches.** The law holds where a specialty needs a
different *instrument* inside the same consultation shape — dentistry,
dermatology, paediatrics. It does not hold where the clinical reasoning is
itself a different shape. The test is not "does the input half look
different?" but **"does this clinician reason in a different order?"**

**(b) On surface, new standing law.** *Cortex should know a lot and show
little.* Every clinical field must pass: does it change reasoning, dosing,
or meaningful outcome? If not, it is reachable but never default. A field
that is merely true does not earn space.

---

## 9. Phases 2–6 — direction confirmed

Order unchanged: **Story → Measurement foundation → Examination → Impression
→ Response → Outcomes.**

- **2 — Measurement foundation.** `visit_measurements` gains `side` /
  `method` / `context` / `qualifier`, becomes the read path, `trend.ts`
  trends `baseline` only.
- **3 — Examination.** AROM/PROM, MMT, special tests. Progressive disclosure
  is load-bearing here: the full set is deep, the default must be shaped by
  the story and the goal.
- **4 — Impression.** Impairments and functional limitations ranked **by the
  existing engine, unchanged** — Synapse already scores combinations of
  active signals and ranks intents by relevance, so this is content plus at
  most one type value, not architecture.
- **5 — Response. The differentiator.** Preserve the loop —
  **baseline → intervention → immediate re-test → response** — rather than
  storing every measurement as an isolated value. This is the phase that
  makes Cortex a physiotherapy record rather than a form, and Phase 2's
  `context` column exists to make it possible.
- **6 — Outcomes. Deliberately small.** Instruments that are routine in
  ordinary physiotherapy practice, not niche ones that merely exist or are
  well-known. More instruments only on evidence of real use.

---

## 10. Risk

- **Rollback is clean.** Three tables, one input file, one branch. Reverting
  `inputLayout` restores today's behaviour exactly; the tables go inert.
- **The real risk stays clinical**: that a clinic doing thirty sessions a
  day fills none of this in. Six core controls is the cheapest honest test.
  **If it goes unfilled, Phases 3–6 get re-scoped before they are built.**
- **One edit to a working save path** (`useConsultLifecycle`), with §14.25's
  ordering lesson already applied.

---

## 11. What I need from review

1. **The six core controls** — right set? This is the part only a clinician
   settles.
2. **Goals as PSFS-shaped** (patient's words + 0–10, re-scored per visit):
   agreed?
3. **The `story.ts` vocabulary** goes up for line-by-line review before
   anything is applied.
4. **Doctrine amendments (a) and (b)**: agreed as worded?
5. **Authorisation** for the three-table migration.
