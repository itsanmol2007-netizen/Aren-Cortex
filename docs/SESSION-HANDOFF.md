# Session handoff — 2026-08-16

**This file is temporary and self-replacing.** It carries context between
sessions so nothing has to be re-derived. It was fully rewritten on 2026-08-16;
everything the previous version said is either folded into
`aren-cortex-atlas.md` or obsolete, so there is nothing to recover from it.
Rewrite or delete this file the same way when the next session ends.

**Read order for a cold start:** this file, then `aren-cortex-ui-doctrine.md`,
then `aren-cortex-atlas.md` §14 (newest at the bottom — §14.19 through §14.24
are this run of sessions'). Then
`docs/Cortex Specialties/cortex-longitudinal-spec.md`, which is the live spec
for the current phase. Don't re-survey the repo; the docs are current.

---

## 0. Where things stand

`master`. Everything below is committed and built clean (`tsc -b` +
`vite build`). No work in flight.

The specialty phase has started. §14.23 built the first of the longitudinal
spec's three pieces; §14.24, the same day, made physiotherapy the first
profile other than General OPD to get the rebuilt screen.

### 0.1 The longitudinal band (atlas §14.23)

A returning patient's screen now answers **"is this working?"** — a band below
the dark header showing up to four measurements as `before → after` with a
direction, a delta, a time-proportional sparkline, plus the care plan and the
last visit, and a visit timeline behind one control.

Five things to know before touching it:

1. **It is ONE component for every specialty.** `specialty.trend` is the
   entire input. If you find yourself writing `if (profile === ...)` in
   `LongitudinalBand.tsx`, the answer is a new field in the configuration.
2. **`SpecialtyProfile.trend` is a PRIORITY LIST, not three fixed fields.** The
   band reads down it and keeps the first four the patient actually has two
   readings of. That is what lets one physiotherapy config serve a knee patient
   and a shoulder patient with no per-patient setup.
3. **Direction lives in two places, deliberately.** The field declares
   `betterWhen`; a specialty overrides it. Body weight is why: rising is growth
   in a child and fluid overload in heart failure, so the field says `"none"`
   and paediatrics, cardiology and gynaecology each say what they mean.
4. **The maths is pure and separately tested.** `features/consult/trend.ts` has
   no React and no fetch; `npm run check:trend` is 148 assertions over it.
   Change the maths, run that.
5. **It renders NOTHING for a first visit.** Not an empty frame — absent.

### 0.2 Physiotherapy has real fields now

Seventeen: LEFS, and per-joint range in degrees (cervical, shoulder ×2, hip,
knee, knee extension lag, ankle) plus knee girth, **left and right separate**.
Only pain existed before, and `romPct` — a single generic percentage — is kept
because it carries the live `ROM_PCT` rules, not because it is the right shape.

Adding fields costs **no database work**: measurements are a JSON blob on the
visit, so a new key persists the moment it is in `measures.ts` and `Vitals`.

### 0.3 Physiotherapy is live (atlas §14.24)

Three things landed:

1. **It renders the Case Sheet surface**, not the old three-picker SOAP
   layout. It does NOT have its own copy of `GeneralOpdInputs.tsx` — its input
   half is genuinely identical, so the branch became configuration
   (`SpecialtyProfile.inputLayout`). Copy the file the day the inputs actually
   diverge; a byte-identical copy is the duplication the doctrine forbids.
2. **`modality` is the seventh intent type** — what the clinic DELIVERS during
   the session, as opposed to `exercise`, which is what the patient does at
   home. 23 therapies, 79 rules, 7 guards, all live. It has its own plan
   group, its own print section and its own `prescriptions.therapy_notes`
   column; it is deliberately not filed under advice.
3. **The Assessment's second column is the specialty's instrument.** The
   confirmed-conditions list that used to sit there was ~230px of white space
   duplicating the plan rail. `SpecialtyExamCard` moved into it — nothing new
   was built. Physiotherapy gets the body map.

Only General OPD and physiotherapy are on the new surface. **Six profiles are
still on `SoapInputs`** and each is one `inputLayout` line away, when its turn
comes.

### 0.4 A light care plan (spec §3.3)

`care_plans` already existed in the live DB, correctly shaped and completely
unused — left by the abandoned prescription-flow branch. Adopted. It shows
"Session 4 of 12" in the band, renames the header's visit chips, and is
editable and closable. Sessions are counted by reading `visits.care_plan_id`,
and a visit joins the course when the consult is **saved**, never when it opens.

---

## 1. What to do next

### 1.1 WhatsApp follow-up reminders — spec §3.2, and it needs you

**Blocked on a decision, not on code.** The interval is captured
(`prescriptions.follow_up_days`); nothing sends. There is no reminder table, no
scheduler and no provider account. Ask Anmol which WhatsApp provider before
designing anything — the answer changes the shape of the whole piece. The
spec's §6 requirement is the interesting part: a reminder that fails (no phone
number, wrong number, never opted in) must fail **quietly to the patient and
visibly to the clinic**, never silently.

### 1.2 The band has never rendered against real data

It is proven against fabricated visits in Chromium (45 assertions) and no
patient in the database has two visits carrying the same measurement, so nobody
has seen it for real. Creating a test patient with three or four visits is the
fastest way to close this — **ask before writing to the DB**, and delete the
test data afterwards per §4.

### 1.3 The exercise plan with progression

The largest remaining physiotherapy piece and the bottom half of Anmol's
mockup: exercise recommendations carrying progressed / held / added between
sessions, the treatment modules column, "impairments" instead of "conditions".
He deferred it explicitly on 2026-08-16 — build it next.

None of that data is recorded today, which is also why the band's Last Session
card is thinner than the mockup. Now that `modality` exists, comparing this
session's plan against last session's is finally possible.

### 1.4 One specialty at a time — Anmol's standing instruction

*"I will strongly recommend you to not do all at the same time... we will
manually wire them as the way I'm saying because we are not making twice."*
He reviews and tweaks each profile himself. Do not batch them, and do not
start the next one until he says which.

---

## 2. Traps — worth knowing before writing code

Carried forward, plus this session's. None of these is visible on screen.

1. **A fire-and-forget write behind a CHECK constraint is a silent data
   outage** (§14.21). `visit_observations.source` permits only
   `doctor | confirmed_intent | carried_forward | import`.
2. **RLS enabled with zero policies is the same failure with a different
   cause** (§14.23, new). `care_plans` denied every read and write, and a
   denied read comes back as an EMPTY SET rather than an error. Found by
   querying `pg_policy`, not by using the app. **When a new table appears to
   do nothing, check its policies before its code.**
3. **`handleAcceptIntent` has a deliberately empty dependency list** (§14.20).
   Anything it calls is frozen at first render unless reached through a ref.
4. **`opacity-*` cannot style Case Sheet chips** — motion writes an inline
   opacity that beats any class.
5. **Two Tailwind utilities setting one property** resolve by stylesheet order,
   not class-string order. Replace the class, don't append.
6. **`diagnostic_orders` has an FK to `prescriptions` as well as `visits`** —
   test cleanup must delete it before prescriptions.
7. **A browser tab never delivers Ctrl+N, Ctrl+T or Ctrl+W.** See the three
   tiers at the top of `lib/keyboard/keymap.ts`.
8. **Documentation kept in step by discipline drifts** (§14.22). When two
   things must agree, make one read the other. Applied again this session: the
   two print surfaces now read `MEASURE_FIELDS` instead of hand-listing it.
9. **An overlay that binds any un-modified key must take focus** (§14.22a), and
   anything added to `isAnyModalOpen` must take focus too — standing the global
   handler down over an unfocused overlay leaves the keyboard dead.
10. **`saveConsult` writes empty strings for blank fields**, so a stored vitals
    blob is mostly `""`. "Absent" and "recorded as blank" are the same thing in
    storage.
11. **`fetchPatientVisits` is the only loader of patient history.** It had
    never selected `vitals`, which made every measurement write-only from the
    consult screen's point of view. If a feature needs something historical,
    check that function actually fetches it.
12. **The guards table is `intent_guards`, not `guards`**, and
    `intent_guards_one_target` allows exactly ONE of target_type /
    target_class_id / target_intent_id. Both were found by the database
    rejecting a migration, not by review.
13. **A component harness that does not run the real build pipeline can check
    structure and nothing else.** An esbuild bundle has no Tailwind, so every
    Tailwind-styled card renders unstyled and any layout judgement from it is
    worthless. Build harnesses with Vite and the project's own config — see
    §14.24's verification note, where 5 of 5 reported failures were the
    harness.

---

## 3. Open items, most important first

- **Longitudinal step 6 — resolve / refute — is STILL NOT built.** A condition
  confirmed in error can be un-ticked from today's chart, but the
  `patient_conditions` row survives and carries forward again next visit. From
  the doctor's side a mistake is permanent. `status` and its check constraint
  already exist; only the UI is missing. **Do this before widening the
  condition map.**
- **The band has never rendered against real data** (§1.2).
- **Psychiatry has no profile and nothing to trend.** The spec devotes a
  section to it; the catalogue holds no mood or symptom rating. Needs both.
- **Cardiology's lipid values do not exist** as fields. The spec names them.
- **Dentistry and dermatology draw no numbers by design** and want their own
  longitudinal view: unfinished treatment per tooth, prior photos per body
  site.
- **Physiotherapy's contraindication signals do not exist** — pacemaker, metal
  implant, malignancy, DVT, acute fracture, impaired sensation. Until they do,
  those risks are the physiotherapist's alone; the 7 guards that exist cover
  pregnancy and heat-in-the-acute-phase only.
- **Modality dosage is prose and laterality is not captured.** "Ultrasound to
  the right knee at 5 minutes" needs a dosage model and a side; today the label
  is one string.
- **The body map does not surface the joint's measurements.** Marking the right
  knee could raise knee flexion R / extension lag R / girth R — the machinery
  exists for signals (`RELEVANT_FIELDS`) but body sites emit none, so it needs
  a mapping that does not exist. This is what would make the map physio's own
  rather than dermatology's, reused.
- **Physiotherapy's labels are still General OPD's** — "Ranked conditions"
  where the mockup says "Ranked impairments / functional problems".
  Configuration, left for Anmol's review pass.
- **`stagedMedicine` / `pendingMedicine` are not cleared by `plan.reset()`** —
  an add sheet left open across a patient switch can commit onto a blank
  consult. Documented in `useConsultPlan.ts`'s reset header.
- **~12 more chronic conditions need signal content, not schema** — CAD,
  atrial fibrillation, treated TB, osteoarthritis, gout, iron deficiency
  anaemia. Clinical curation.
- **Hypoglycaemia → Known diabetic was deliberately not seeded**, and **ACS has
  no correct mapping target** until a "Known coronary artery disease"
  observable exists. Both want a clinical decision.
- **The keyboard pass has still never been driven through a real consult**
  (§0.3 of the previous handoff, unchanged).
- The band takes ~200px out of a locked-height shell; only seen at 1440×900.
- Combinations are offered correctly but not *ranked* higher for covering two
  needs at once (§14.17).
- No guard content for quinine / HCQS QT risk (§14.18).
- Atlas §5.1's inventory table is stale — missing the hooks, several
  `features/consult` files, and everything added this session.

---

## 4. Environment

- **No `supabase/migrations/` directory.** Schema changes are applied live via
  the Supabase MCP tools; `apply_migration` records them in Supabase's own log,
  and the atlas prose is the only other record. **Write it down or it is gone.**
  Five migrations this session, all authorised first:
  `care_plans_hospital_isolation_policy`,
  `modality_intent_type_and_therapy_notes`,
  `physiotherapy_modality_catalogue`, `physiotherapy_modality_rules`,
  `physiotherapy_modality_guards`. The last four are also written out in full,
  with their reasoning, in `docs/Cortex Specialties/physiotherapy-modalities.sql`.
- **Don't write to the live DB without asking.** Every write this week was
  authorised first.
- Supabase project `ieimvjprtltancxapuzg` (org `arenod`, `ap-south-1`).
- **Test data gets deleted afterwards.** None was created this session.
- `main` and `master` are unrelated histories sharing a remote. **`master` is
  where everything real lives.** If a branch gets cut from `main` by mistake,
  `git checkout -B <branch> origin/master` before doing anything.
- Dev server: `npm run dev` → `http://127.0.0.1:5173`.
- **Chromium in this environment has no outbound network.** Every HTTPS host
  resets while `curl` to the same host succeeds, so the real app cannot be
  logged into from here. Component harnesses against real components are the
  substitute; they are driven with `playwright-core` (installed with
  `--no-save`) against `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`,
  bundling with esbuild and **defining `import.meta.env`** — without that the
  Supabase client throws at module load and the page renders blank.
- Checks: `npm run check:trend` (148), `check:measures` (32 fields),
  `check:dental`, `check:obstetric`, `check:growth`, `check:combos`,
  `check:search`, `check:brands`. The two database halves of `check:measures`
  need `AREN_CHECK_EMAIL` / `AREN_CHECK_PASSWORD`, which are not in `.env` —
  they skip loudly.

## 5. Unexplained — still worth a look

**Two stray edits appeared in files no session touched**, both on 2026-08-15:
`src/lib/db/synapse.ts` lost the word `model:` from a comment (restored), and
`referance (synapsev2)/Synapse engine.ts` had its ruleset version flipped
`'mvp-1'` → `'V2'` (reverted; that directory is not imported). Neither was made
by the session that found them. Nothing similar recurred on 2026-08-16.
