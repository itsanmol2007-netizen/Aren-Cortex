# Physiotherapy Phase 1 — implementation plan (for review)

**Status:** proposed, not built. Nothing in here has been written to the
database or the codebase. 2026-08-17.

Follows `physiotherapy-implementation-decision.md`, which set the six-phase
order and put **the Story section first** — ahead of the record spine —
because it answers questions 1–6 of the gap report's twenty-question test on
its own, is immediately visible, and has no dependency on the measurement
work.

---

## 1. What Phase 1 delivers

A physiotherapist opens a consult and the Subjective half of the screen is
**theirs**, not a General OPD case sheet. It records how the symptom
behaves, not just that it exists.

Against the gap report's §27 test, Phase 1 moves these from "cannot answer"
to "answerable from the record":

| # | Question | How |
|---|---|---|
| 1 | Why did the patient come? | onset + mechanism |
| 3 | How do the symptoms behave? | 24-hour pattern + constancy |
| 4 | What activities provoke them? | aggravating factors (chips) |
| 5 | What activities are limited? | activity tolerance |
| — | How hard can I push today? | **irritability** |

Question 2 (where) is already answered by `JointMapCard`. Questions 6
(patient goals) and 7–20 belong to later phases.

**The clinically important one is irritability**, because it is the only
field here that changes what the therapist *does* in the session rather than
what they know. It is the physiotherapy dosing gate.

---

## 2. The two open decisions, answered

I said these needed agreement before code. Here are the positions I am
taking — **override either in review and I will rebuild the plan, not
argue.**

### 2.1 Chips, not free text — and this is a reversal of my own earlier note

My decision note leaned "aggravating/easing as free text with chip
suggestions, because the vocabulary is unbounded." **That was wrong, and it
repeats the exact criticism you made of the body map.** Free text is
invisible to Synapse forever; "manual comments should be the last option"
applies here identically.

So: **aggravating and easing factors are a curated chip vocabulary** (~28
seeded items), with a free-text field remaining as the last resort for what
no chip covers — the same shape `JointMapCard` now uses.

The vocabulary is genuinely bounded in practice for MSK: stairs, walking,
prolonged sitting, standing, driving, bending, lifting, squatting, overhead
reach, lying on the affected side, rising from a chair, running, twisting,
coughing/sneezing; and for easing: rest, gentle movement, heat, ice,
analgesia, position change, support/brace, stretching.

### 2.2 Enums where it will become a signal, text where it will not

- **Enums** (small, closed, will eventually be rankable): irritability,
  24-hour pattern, constancy, onset mode.
- **Chips** (curated vocabulary, rankable via a reserved `signal_id`):
  aggravating, easing.
- **Free text** (honest, engine-invisible, always optional): mechanism
  ("twisted playing cricket"), activity tolerance ("10 min walking →
  6/10"), and one fallback note per factor list.

---

## 3. Schema — exactly what I would apply

Three tables. **Not applied yet — needs authorisation per the standing
rule.** RLS posture copies `patient_conditions` / `care_plans`: isolation
through `visits`, never through a nullable `hospital_id` (§14.13's bug, in
reverse), and **policies created in the same migration as the table**, since
RLS-on-with-zero-policies is a silent empty set (trap 2).

```sql
-- 1. The vocabulary. Facility-independent reference data.
create table story_factors (
    id          bigserial primary key,
    label       text not null,
    direction   text not null check (direction in ('aggravating','easing')),
    -- reserved seam: when clinical content justifies it, a factor can feed
    -- the engine exactly the way observable_signals does. Null until then.
    signal_id   text references signals(id),
    sort_order  int  not null default 0,
    active      boolean not null default true,
    created_at  timestamptz not null default now(),
    unique (label, direction)
);

-- 2. One row per visit. Everything that is not a repeatable pick.
create table visit_story (
    visit_id      uuid primary key references visits(id) on delete cascade,
    onset_date    date,
    onset_mode    text check (onset_mode in
                    ('sudden','gradual','post_surgical','post_traumatic','unknown')),
    mechanism     text,
    irritability  text check (irritability in ('low','moderate','high')),
    constancy     text check (constancy in ('constant','intermittent','variable')),
    -- multi-select; small closed set, so an array beats a fourth table
    pattern       text[] not null default '{}',
    tolerance     text,
    note          text,
    created_by_doctor_id uuid references doctors(id) on delete set null,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now()
);

-- 3. The picks.
create table visit_story_factors (
    visit_id   uuid   not null references visits(id) on delete cascade,
    factor_id  bigint not null references story_factors(id),
    created_at timestamptz not null default now(),
    primary key (visit_id, factor_id)
);
```

`pattern` values: `morning_stiffness_under_30`, `morning_stiffness_over_30`,
`night_pain`, `worse_end_of_day`, `worse_with_rest`, `worse_with_activity`.

**Why `pattern` is an array and factors are a table:** the pattern set is
closed, tiny, and will never be searched across visits; the factor
vocabulary is open-ended, needs a stable id to hang a `signal_id` off later,
and will be queried ("how many knee patients are aggravated by stairs").

### Seed

~28 `story_factors` rows, all `signal_id = null` initially. Full list goes
in `docs/Cortex Specialties/story-factors.sql` alongside the modality and
exercise SQL, so the content is reviewable and re-appliable.

---

## 4. Files

**New:**

| File | Purpose |
|---|---|
| `src/features/consult/PhysioInputs.tsx` | The physiotherapy input surface. Copy of `GeneralOpdInputs.tsx` with `StoryCard` inserted above the Case Sheet. |
| `src/features/consult/StoryCard.tsx` | The Story block itself. |
| `src/hooks/useVisitStory.ts` | Load / edit / persist, in the layer-1 "facts" slot per the hook table. |
| `src/lib/db/story.ts` | Supabase boundary. Same shape as `lib/db/bodySites.ts`. |
| `scripts/story-vocabulary.mjs` | `npm run check:story` — vocabulary + enum integrity. |
| `docs/Cortex Specialties/story-factors.sql` | The seed, with reasoning. |

**Changed:**

| File | Change |
|---|---|
| `specialtyProfile.ts` | `inputLayout` gains `"physio"`; `PHYSIOTHERAPY` uses it. `tsc` will find every exhaustive switch. |
| `App.tsx` | One branch: `inputLayout === "physio" ? <PhysioInputs/> : usesCaseSheet ? <GeneralOpdInputs/> : <SoapInputs/>`. |
| `useConsultLifecycle.ts` | Persist the story on save, in the same awaited sequence as the exercise write — **and with §14.25's lesson applied: it must not throw after the visit is already committed.** Catch, finish the save, toast the specific failure. |
| `ReviewModal.tsx` | Story appears in the doctor's own review. **Not** on the patient prescription. |
| `aren-cortex-ui-doctrine.md` | Amend the no-per-specialty-branch law — see §7. |

---

## 5. The screen

`StoryCard` sits at the top of the Subjective column, above the Case Sheet,
because it is what the patient said before anything is interpreted.

```
┌─ STORY ──────────────────────────────────────────────┐
│  Onset   [ 12 Jul ]  (sudden)(gradual)(post-op)(injury)│
│          twisted it playing cricket…                  │
│                                                       │
│  Worse with   [stairs ×] [squatting ×]  + add         │
│  Better with  [rest ×]                  + add         │
│                                                       │
│  Pattern  (morning >30min)(night pain)(worse evening) │
│  Constant / Intermittent / Variable                   │
│                                                       │
│  Irritability   ( Low )( Moderate )( High )    ⓘ      │
│  Tolerance      10 min walking → 6/10                 │
└───────────────────────────────────────────────────────┘
```

Rules it follows:
- **Every field optional.** An empty Story block collapses to one line, so a
  20-minute follow-up session is not made longer than it is today. This is
  the doctrine's "does an empty consultation get shorter?" test.
- **Collapsible**, defaulting open on a first visit and **collapsed on a
  follow-up**, where the story is usually already known.
- The `ⓘ` on irritability states the criterion in one line rather than
  assuming SINSS is common vocabulary.
- Factor chips reuse the existing chip styling exactly — no new visual
  language.

---

## 6. Load / save

Mirrors how `useLongitudinalRecord` and `useConsultChart` already work.

- **Load:** on visit open, `fetchVisitStory(visitId)` + the vocabulary
  (cached once per session, it is reference data).
- **Edit:** local state in `useVisitStory`, no write per keystroke.
- **Save:** one upsert into `visit_story` + a delete/insert of
  `visit_story_factors`, inside the existing save sequence, **after** the
  visit is completed, catching rather than throwing.
- **Reset:** `useVisitStory.reset()` wired into the same
  patient-switch/cancel path as `plan.reset()` — and unlike `stagedMedicine`
  (still an open bug), it will be wired from the start.

---

## 7. The doctrine amendment

`PhysioInputs.tsx` knowingly breaks *"there is no per-specialty branch
anywhere in the render tree."* Rather than violate it silently I would add
to the doctrine:

> The law holds where a specialty needs a different **instrument** inside
> the same consultation shape — dentistry, dermatology, paediatrics. It does
> **not** hold where the specialty's clinical reasoning is itself a
> different shape. Physiotherapy is the first such case. The test is not
> "does the input half look different?" but "does this clinician reason in a
> different order?" A profile that answers yes earns its own input file; a
> profile that answers no must keep sharing one.

Without this, the next specialty inherits an assumption instead of making a
decision.

---

## 8. Verification

1. `npm run check:story` — every factor has a valid direction, every enum
   value used in code is in the CHECK constraint, no orphan `signal_id`.
   **Proven non-vacuous** by breaking one row and watching it fail, per the
   standing practice.
2. **Chromium harness** against the real `StoryCard`: chips toggle, enums
   are single-select, everything empty renders one collapsed line, the
   `ⓘ` opens, and the whole block round-trips through `useVisitStory`.
3. **Database verification, not screenshot** (trap 1): after a save, query
   `visit_story` and `visit_story_factors` directly to confirm rows landed —
   the CHECK-constraint outage in §14.21 looked perfect on screen.
4. `tsc -b`, `vite build`, and every existing `check:*` — Phase 1 must be a
   provable no-op for General OPD and the six `SoapInputs` profiles.
5. RLS proven by reading `pg_policy`, not by the app appearing to work.

---

## 9. What Phase 1 deliberately does NOT do

Stated so review can catch a wrong omission:

- **No signals from story factors.** `signal_id` is reserved and null. Chips
  record; they do not yet rank. Promoting them needs clinical content and
  real usage evidence, and doing it blind would repeat the "37 rules for 8
  signals" mistake.
- **No carry-forward.** Each visit records its own story. "Same as last
  visit" prefill is obvious and cheap but belongs after we know the block
  gets filled at all.
- **No patient goals / PSFS** — Phase 4.
- **No examination changes** — Phase 3. ROM/MMT/special tests untouched.
- **Nothing touches `visit_measurements`, `trend.ts` or the engine.**

---

## 10. Phases 2–6, unchanged from the decision note

Sketched only; each gets its own plan document before it is built.

2. **Record spine** — `visit_measurements` gains `side` / `method` /
   `context` / `qualifier`, becomes the read path, `trend.ts` trends
   `baseline` only.
3. **Examination** — AROM/PROM, MMT, special tests with result semantics.
4. **Impression** — functional limitations, patient goals, `impairment` as a
   ranked intent type.
5. **Response** — within-session re-test, treatment response, adherence,
   dose rationale.
6. **Outcomes** — two instruments, not seven, plus MCID in `trend.ts`.

---

## 11. Risk and rollback

- **Rollback is clean.** Phase 1 adds three tables and one input file; the
  branch in `App.tsx` is one line. Reverting `inputLayout` to
  `"case-sheet"` restores today's behaviour exactly, and the tables become
  inert rather than broken.
- **The real risk is clinical, not technical**: that a busy clinic never
  fills this in. Phase 1 is the cheapest possible test of that, which is why
  it is first. **If it goes unfilled in real use, Phases 3–6 should be
  re-scoped before they are built.**
- **The `useConsultLifecycle` change is the only edit to a working save
  path.** §14.25's ordering lesson applies directly and is already accounted
  for above.

---

## 12. What I need from review

1. Is the Story block's **field list** right — too much, too little, wrong
   emphasis? This is the part only a clinician can answer.
2. Chips-over-free-text for aggravating/easing: agreed?
3. Is the ~28-item vocabulary the right starting set? It will go in
   `story-factors.sql` for line-by-line review before it is applied.
4. Doctrine amendment (§7): agreed as written?
5. Authorisation to apply the three-table migration when you are satisfied.
