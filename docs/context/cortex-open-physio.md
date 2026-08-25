# Open / left to do — Physiotherapy

Part of the `aren-cortex-context.md` split, 2026-08-24. This pocket is the
Physiotherapy half of §7 of that file, unchanged in content, just moved —
it's the single largest section of the old file and the one most likely to
be irrelevant to a non-physio task, so it gets its own pocket rather than
being dragged in every time.

For the other half (WhatsApp, sidebar, Practice, layout bugs, and anything
not physio-specific), see `cortex-open-crosscutting.md`.

---

**Physiotherapy (most active area):**
- 6 of 8 profiles are still on the generic `SoapInputs` fallback (Diagnostics,
  Cardiology, Pediatrics, Gynaecology, Dentistry, Dermatology) — copy
  `GeneralOpdInputs.tsx` per rule 16 when one earns its own layout.
- Onset mode and most specific aggravating/easing factors in `story.ts` have
  **no signal content** — real clinical work, not wiring.
- No physiotherapist has used any of the 6-phase rebuild yet in live practice.
- Elbow/wrist/spine joints have no degree-based ROM field (still `romPct` only).
- Guard content for modalities is incomplete — pacemaker+electrotherapy,
  metal+SWD, malignancy, DVT, fracture+traction, impaired sensation+heat have
  no observable to guard on yet.
- Modality dosage is still free-text prose ("Ultrasound 1 MHz, 7 min"), no
  laterality field on a modality.
- No demonstration image/video per exercise; drag-reordering not implemented
  (sort_order stored, nothing moves a row yet).
- **Accepted impairments are not persisted anywhere queryable (found 2026-08-23,
  building the Patient Overview page).** Every other intent type a doctor
  accepts lands somewhere the record can read back — medicine →
  `prescription_medicines`, test → `diagnostic_orders`, exercise →
  `prescription_exercises`, finding → `visit_findings`. `impairment` (added
  2026-08-18, ranks above findings for physio — "what is limiting this
  person") has no `case "impairment"` in `useConsultPlan.ts`'s accept handler
  at all: it only reaches the in-memory plan for print/PDF, never a table. A
  physiotherapist's actual functional-limitation record ("reduced squat
  depth", "cannot climb stairs without pain") exists nowhere after the visit
  closes. **`visit_impairments` table now exists** (migration
  `add_visit_impairments`, 2026-08-23) — shaped like `prescription_exercises`
  (`visit_id`, `intent_id` → `intents.id` since impairment has no v1 legacy
  catalogue to join through, `label` snapshot, `side`), same
  `hospital_isolation` RLS policy as `visit_findings`/`visit_body_sites`. **Not
  wired**: no write in `useConsultPlan.ts`'s accept handler, no read in the
  consult screen. Schema is ready; the write/read path is real clinical work
  for a dedicated physio-consult session, not a wiring task.
- **`care_plans` — RESOLVED 2026-08-23 with direct live SQL (not a browser),
  correcting two same-day entries above that got there by inference.** The
  first said `care_plan_id` was null on effectively every visit; the second
  found one real "Session 6 of 12" and could only say "something changed,
  don't assume it generalizes." Queried `care_plans` directly instead of
  guessing further: **5 real active plans exist**, one per patient (Rohan
  Malhotra, Manoj Kumar Thakur, Deepak Prasad, Sanjay Verma, Om Prakash
  Mishra), each with a real clinical goal and 5–7 visits actually linked
  (`visits.care_plan_id` populated), the oldest created 2026-06-20 — well
  before this arc even started. The original "never used" finding was
  simply wrong (stale, or checked against the wrong account/window) — care
  plan linking has been working correctly for these five patients for
  weeks. "Session N of M" can be trusted wherever `care_plan_progress` is
  non-null. No further action needed here.
- **`fetchPatientVisits` missing physio fields — RESOLVED 2026-08-23, same
  day it was documented.** `RealVisit` now carries `body_sites`/
  `exercise_names`/`impairment_names`/`story_duration`/`story_mechanism`,
  fetched the same way `buildPatientRecordRows` already did for the
  Overview table (`visit_body_sites`, `visit_impairments`, `visit_story`,
  `prescription_exercises` — same queries, not a second implementation).
  Wired into `VisitRow`'s expanded body (`PatientRecord.tsx`) as a "Body
  Site"/"Functional Limitation" chip row, a "Patient's Account" text block,
  and an "Exercises Prescribed" list alongside the existing medicines list
  — each section renders only when that visit actually has the data, same
  as the existing symptoms/findings sections. Also wired into
  `CompareVisitsModal` (body site/impairment diff, story side-by-side,
  exercises side-by-side) so a two-visit comparison shows the same signal.
  Verified live against Dr Anmol Pandey's real account before wiring:
  70 of 82 completed visits have exercise data, 5 have body sites, 3 have
  a recorded story — this was write-only from the Record page's point of
  view until now, not empty data. The generic "Consultation" badge on
  exercise-only visits was fixed the same pass (see `visitTypeLabel()`
  below).
- **The visit-count discrepancy — RESOLVED 2026-08-23 with direct live SQL,
  and it's test noise, not a bug.** Was a 24-vs-6 mismatch on Rohan
  Malhotra between `row.visit_count` (counts every status) and
  `fetchPatientVisits`'s completed-only count. Queried `visits.status`
  directly for Dr Anmol Pandey's whole account: **86 visits are stuck in
  `serving`, concentrated in only 5 distinct patients, every one of them
  created between 2026-08-12 and 2026-08-23** (Rohan alone: 18, including
  11 opened on 2026-08-21 alone — no real physio opens 11 sessions with one
  patient in a day). Meanwhile **75 visits completed normally across 17
  different patients from 2026-06-21 through 2026-08-22**, overlapping the
  same window — so the save/complete path itself was NOT broken during
  this period; completions kept happening for the rest of the patient
  base right through it. The pattern (recent, concentrated on a handful of
  patients, high same-day repeat counts) reads as manual testing of the
  physio consult screen — someone repeatedly starting fresh consults on a
  few test patients without running the save flow to completion — not a
  production defect. **Not fixed, on purpose**: bulk-updating real
  `visits.status` rows is exactly the kind of change that needs Anmol's
  explicit go-ahead, not an agent's guess about which rows are test noise.
  **Ask him**: are these 86 `serving` visits safe to mark `discarded`
  (they're currently counted as "Active"/"In Session" by
  `visitStatusKind()`, which inflates the Overview's active-patient
  numbers for these 5 patients)? If yes, that's a two-line
  `UPDATE ... WHERE status='serving' AND created_at > '2026-08-12'` a
  future session can run after confirming the exact id list with him
  first — never assume "looks like test data" is authorization to change
  it.
  **Follow-up, same day — this is what made Patient Record "look trash".**
  Anmol tested the app and called Patient Record "trash... maybe because we
  don't have actually anything there." Traced it: his OWN test patients
  ("Anmol" x2, "Test") are exactly the ones carrying most of these 86 stuck
  rows (one "Anmol" patient: 0 completed / 2 stuck; "Test": 2 completed / 57
  stuck) — and `fetchPatientVisits` used to hard-filter to
  `status="completed"` only, so opening one of those patients showed a
  populated header (`row.visit_count` counts every status) directly above a
  totally empty timeline/trend section. **Fixed at the data layer, not by
  touching the rows**: `fetchPatientVisits` now fetches every status
  `visitStatusKind()` doesn't call "inactive" (reusing that shared
  categorisation, not a second exclusion list), and `PatientRecord.tsx`
  surfaces the non-completed ones with an honest "N visits not yet finished
  in Consult" notice instead of silently excluding them. This makes the
  page correct regardless of whether the 86 stuck rows ever get cleaned up
  — the cleanup question above is now genuinely just data hygiene, not a
  UI-correctness blocker.
- **Visit-type badge duplicated the same computation twice — fixed
  2026-08-23, same pass as the fetchPatientVisits filter fix.** The
  `hasMeds ? "Prescription" : hasFindings ? "Examination" : "Consultation"`
  logic lived inline in `PatientRecord.tsx`'s `VisitRow` and was about to be
  copied a second time into `CompareVisitsModal.tsx` — pulled into
  `visitTypeLabel()` in `features/patients/visitStatus.ts` instead (rule
  19), and given a fourth branch: exercises now count too (`"Exercise
  Plan"`), so a physio visit with exercises prescribed but no formal
  "finding" stops reading as generic "Consultation".
- **The longitudinal band showed an empty strip on a patient's very FIRST
  visit — root-caused and fixed 2026-08-24.** `resolveVisitForConsult`
  (`useConsultLifecycle.ts`) always creates/resumes the CURRENT visit before
  `loadPastVisits` runs, so that brand-new, still-empty row came back as the
  patient's own "1 previous visit" — `LongitudinalBand`'s
  `pastVisits.length === 0` guard, and the topbar's "no past visits" empty
  state, were never true for a genuine first-time patient. `fetchPatientVisits`
  now takes an `excludeVisitId` (the visit just resolved); both call sites in
  `useConsultLifecycle.ts` pass it.
  **Second, separate gap same session**: even for a returning patient, the
  topbar's dark "Past visits" strip and the band were showing visits that
  were still `waiting`/`serving` elsewhere, or that closed with literally
  nothing charted — a chip with only a date, a band card saying "Nothing"
  prescribed. Both now read a new `meaningfulPastVisits` (`App.tsx`): the raw
  `pastVisits` filtered to `visitStatusKind(status) === "done"` AND
  `visitHasContent(visit)` (new export, `PastVisitCard.tsx` — symptoms,
  findings, medicines, body sites, exercises, impairments, story, OR a real
  recorded measurement). `trendSummary` is built off the same filtered array
  the band's `pastVisits` prop gets, on purpose — `visitForLastReading` looks
  up a trend point's visit BY id against whatever array the band was handed,
  so the two have to agree. The 3 input surfaces (`PhysioInputs`/
  `GeneralOpdInputs`/`SoapInputs`, measurement carry-forward) still get the
  raw, unfiltered array — untouched.
  **Third**: `PastVisitCard` — the one detail view both the topbar chips and
  the band's timeline open (doctrine: "do not build a second detail view") —
  only ever showed symptoms/findings/medicines, so a physio visit that was
  all exercises/body sites/impairments/story, or a visit that only carried a
  measurement reading, opened looking emptier than it actually was. Now also
  renders Patient's account (`visit_story`), Body site, Functional
  limitation, Exercises prescribed, and Measurements recorded (labelled off
  `MEASURE_FIELDS`, the same catalogue the band trends off) — each section
  still gated on that visit actually having it, same convention as the
  existing sections.
  **Fourth**: the topbar's past-visit chips carried no signal about what
  KIND of visit each one was beyond a medicine name if one existed — added a
  small type glyph per chip (`VisitTypeIcon`, `PatientHeader.tsx`, same
  ordering as `visitTypeLabel`) and widened the hover tooltip beyond the
  first 3 symptoms to include finding/medicine/exercise counts.
- **The "just re-ranked" ripple (`ThinkingRing`, `parts.tsx`) — removed
  2026-08-24, Anmol's call.** It fired on Possible Conditions, Medicine
  Recommendations, Suggestions and Exercise Plan simultaneously every time
  `useConsultIntelligence`'s `thinkingKey` changed — which is every accept
  and every chip toggle, since the engine re-runs synchronously on every
  chart change (see `cortex-intelligence-summary.md`). Reported as a "weird
  blue screen animation" showing up "whenever a new thing is added in
  Synapse, selecting any chip." `ThinkingRing` now always renders `null`;
  the 4 call sites were left alone on purpose (smaller diff, same net
  effect) — `.cs-thinking-ring`/`.cs-glyph-live` in consult.css are dead CSS
  now. Same pass: the "Add medicine" brand/dose sheet
  (`MedicineAddSheet.tsx`) no longer animates its scrim/panel in with a
  fade + spring bounce on every open — it still opens and closes, just
  without the motion.
- **"Confirming a condition doesn't rerank medicines/tests" — investigated
  2026-08-24, widened over two sessions 2026-08-25 with Anmol's explicit
  go-ahead ("we are in MVP, the goal is shipping fast... not database
  perfection").** Coverage went **7 → 21 → 65 → 66 of 87 active `finding`-type
  intents** (verified live at each step). Every addition via
  `apply_migration` (not raw `execute_sql`), so it shows up in
  `list_migrations` like every other content batch this ruleset has had.
  Four migration sets:
  1. `condition_observable_map_free_wins` (6) + `..._msk_free_wins` (20) —
     conditions pointed at an observable that ALREADY existed and was
     ALREADY wired to real `signal_intent_rules`, so no new clinical
     content authored, just recognised. The 20 MSK ones share regional
     pain observables (Shoulder/Elbow/Wrist/Hip/Knee/Ankle pain, 25–34
     rules each) the same way Hip+Knee osteoarthritis already share
     `known_osteoarthritis` below — a specific diagnosis (Rotator cuff
     tendinopathy) confirming its region's general symptom (Shoulder pain)
     is the same relationship, not a new idea repeated 20 times.
  2. `chronic_conditions_batch1-3_*` (8, `is_chronic=true`) — Migraine,
     GERD, Hip+Knee osteoarthritis, Gout, Allergic rhinitis, Peripheral
     arterial disease, Congestive heart failure. Current OA guidance
     explicitly demotes paracetamol below NSAID+physiotherapy here, on
     purpose — not an oversight.
  3. `episodic_conditions_batch1-4_*` (24, `is_chronic=false` except Iron
     deficiency anaemia) — UTI, pharyngitis/tonsillitis, otitis media,
     pneumonia, gastroenteritis, dyspepsia, peptic ulcer disease, iron
     deficiency anaemia, tension headache, renal colic, cellulitis,
     allergic dermatitis, fungal skin infection, scabies, hepatitis,
     conjunctivitis, URI/common cold, viral fever undifferentiated, acute
     bronchitis, sinusitis, typhoid, chickenpox, measles, mumps. URI/viral
     fever/bronchitis deliberately rank supportive care (paracetamol,
     steam inhalation) ABOVE any antibiotic — most are viral, ranking an
     antibiotic by default would be the wrong kind of "confident-looking"
     suggestion. Chickenpox never ranks aspirin (Reye syndrome in
     varicella, verified against CDC/WHO). Typhoid ranks azithromycin
     above cefixime (WHO 2024, current resistance patterns) — verified
     live it used to be the reverse assumption.
  4. `antimalarial_confirmation_guard` — the actual safety finding this
     round surfaced. Checked live: artemether/artesunate/quinine were
     ranking at combined weight ~1.3 off symptom chips ALONE (chills/
     rigors + recurrent fever), already flagged `is_safety_critical=true`
     — which is only a cosmetic "Safety" badge, not a gate (confirmed by
     reading `ConditionRow` in `ConditionsCard.tsx`). WHO's malaria
     guideline is explicit: parasitological confirmation (RDT/smear)
     before antimalarial therapy, presumptive treatment discouraged.
     Fixed with the SAME mechanism the existing DENGUE_SUSPICION→
     antibiotics guard already uses (`intent_guards` id 12) — `warn_hard`
     on the 3 antimalarials whenever RIGORS or FEVER_RECURRENT is active.
     Doctrine-consistent on purpose: never hides the medicine (ranking is
     a safety property), but forces a conscious acknowledgement instead of
     letting it sit at the top of the list looking routine. This is also
     most of the answer to "why doesn't confirming Dengue demote malaria
     meds" — the engine is additive, not exclusive, so nothing SUBTRACTS a
     competing diagnosis's weight; the guard is what makes an unconfirmed
     antimalarial visually distinct from a routine suggestion regardless
     of which other diagnosis gets confirmed.
  5. `malaria_medicines_require_confirmation_not_symptoms` — same day,
     Anmol pushed back on the guard alone being enough: "selecting an
     Assessment should immediately change the ranking... right now the
     engine is thinking oh cold wild rigors and fever, wow let's assume
     it's malaria before any confirmation." Right — a `warn_hard` flag
     doesn't touch the RANKING, and the ranking was the actual complaint.
     Checked live: ALL 12 of artemether/artesunate/quinine's rules were
     the 4 raw symptom signals (FEVER/RIGORS/HIGH_FEVER/FEVER_RECURRENT)
     — nothing else ranked them, so they scored purely off symptom chips
     with zero dependency on the diagnosis actually being confirmed.
     Retired (`is_active=false`, same convention as
     `retire_duplicate_test_catalogue_rows`) all 12; added a
     `MALARIA_CONFIRMED` signal (the `condition_observable_map` pattern
     every other batch this round used) as the ONLY thing that now ranks
     the 3 antimalarials, at a clearly-above-differential weight (0.70/
     0.70/0.50) so treatment visibly jumps once the doctor actually
     confirms the diagnosis from Possible Conditions. Malaria TESTS
     (RDT/smear) were deliberately left untouched — still rank from raw
     symptoms, confirmed correct by Anmol ("that's not a big problem" —
     ordering the confirmatory test from a suspicious pattern is exactly
     right, presumptively treating off it is not). The RIGORS/
     FEVER_RECURRENT `warn_hard` guard (item 4, previous session) still
     fires independently even after confirmation, on purpose — a
     differential confirm is a clinical impression, not the positive
     lab result WHO's guideline actually asks for. Verified live: each of
     the 3 medicines now has exactly one active rule (`MALARIA_CONFIRMED`);
     the engine's own `loadRuleset` (`lib/synapse/engine.ts`) filters
     `signal_intent_rules` on `is_active`, confirmed by reading it rather
     than assumed. Same fix is available for any other condition where a
     "differential" signal is doing double duty as a "treat now" signal —
     checked `DENGUE_SUSPICION` specifically (the other guarded signal)
     and it was already correct: ranks tests/fluids/safety-netting, never
     a specific drug, so no analogous fix was needed there.
  6. `confirmed_diagnosis_dominant_weight_tier` — Anmol generalised the
     malaria fix into a standing architecture, not a one-off: "it needs to
     be done for every thing." Formalised as rule 23 in
     `cortex-standing-rules.md` — read that for the full reasoning. In one
     line: all 31 `condition_observable_map` signals this session built now
     sit in a verified 4-tier weight structure by intent type (test
     0.15–0.35 unchanged, referral ~0.45, advice 0.35–0.55, medicine
     0.55–0.85), so confirming a diagnosis reliably outranks a
     merely-symptom-matched competitor without the engine needing a
     suppression mechanism it doesn't have.
  Every medicine/test/advice referenced already existed in the catalogue
  (rule 22 — nothing minted); every non-obvious association was checked
  against a real guideline before being written. Every new
  `signal_intent_rules`/`intent_guards` row is `is_safety_critical=false`
  except the malaria guard and the 3 new `MALARIA_CONFIRMED` rules
  (genuine `is_safety_critical=true`, matching what they replaced) —
  everything else is a rank-order nudge, not a new gate. Verified
  end-to-end live after every batch (zero of the 66
  `condition_observable_map` rows resolve to zero ACTIVE rules) and
  against `get_advisors` (no new findings).
  **Still not mapped: 21 of 87** — Acute appendicitis, Cauda equina
  syndrome, Febrile seizure, Hypoglycaemia (emergencies needing a REFERRAL
  action, not a medicine rank list); Acute coronary syndrome, Angina
  pectoris, Arrhythmia, Bradyarrhythmia, Heart block, SVT, Valvular heart
  disease (cardiology subtypes needing specialist-level nuance a general
  pass shouldn't approximate); Pulmonary tuberculosis (multi-drug regimen,
  India's RNTCP program-driven, resistance-monitored — too high-stakes to
  approximate); Croup, Developmental delay, Failure to thrive, Infantile
  reflux (paediatric, narrower safety margins, deserves its own verified
  pass); Balance and falls risk, Deconditioning, Post-operative
  rehabilitation, Myofascial pain syndrome, Inflammatory arthropathy
  suspected (impression categories that lead to a referral/exercise plan,
  not a specific drug). `condition_observable_map`'s own `note` column on
  every row this round documents the reasoning, so a future pass on any of
  these 22 is a deliberate clinical review, not a re-investigation.
- **Communication, Clinic and Support given real pages 2026-08-24** —
  replacing the generic `ComingSoonPage` for those three specifically
  (`COMING_SOON_META` now stays empty, kept only as the fallback for a
  FUTURE sidebar destination with no page yet). `CommunicationPage.tsx` and
  `ClinicPage.tsx` are still honestly "coming soon" (no data model behind
  either), each with its own hero illustration (`PlaceholderArt.tsx`) and a
  short list of what will actually be there — Anmol's ask, specifically
  against the old page's one-line generic copy. `SupportPage.tsx` is the
  one exception: genuinely real today, `mailto:`/`tel:` cards for
  care@arenode.com / +91 95599 51905, no form and no fabricated hours.
- **Sidebar badge colors unified 2026-08-24** — the five per-page icon
  badges (Patients/Communication/Practice/Clinic/Settings) were blue, teal,
  purple, amber and slate: five unrelated hues, reported as "a mixture of
  color... like a rainbow." Teal and amber (the two actual outliers — green
  and orange) are gone; the `tone` prop is now `"blue" | "indigo" |
  "slate"` and doubles as a grouping (blue = patient-facing, indigo =
  configuration, slate = account-level) instead of five arbitrary picks.
  See `SidebarNav.tsx`'s `tone` prop comment and `sidebar.css`'s
  `.tone-indigo`.
- **Every feature page was silently collapsed to its own content height —
  found and fixed 2026-08-24, same day the 3 above were built, from a
  screenshot: "half rendered page, split screen and the content is not in
  the centre too... every page looks half rendered except consult and
  patient."** Root cause, verified with a local CSS-only harness (this
  sandbox's Chromium can reach the app's own dev server but not Supabase,
  so full login-gated screens can't be driven end-to-end — see
  `cortex-open-crosscutting.md`'s note on this): `.app-shell` (App.tsx, the
  ancestor of every page) has no height of its own — `max-width`/`margin`/
  `padding` only, sized by its content like `<body>` above it, and nothing
  in the app (`html`/`body`/`#root` included) ever gives it one. Every
  feature page's root div used `height: 100%`, which — per plain CSS, a
  parent with no explicit height makes a percentage height on the child
  compute to `auto` — silently did nothing, and the page shrank to fit its
  own content instead of filling the screen. Invisible on Patients (enough
  rows to exceed the viewport regardless) and on Consult (never used
  `height: 100%` at all — it just grows and the whole page scrolls), which
  is exactly why those two "looked fine" and the screenshot was Support.
  Fixed on Communication/Clinic/Support (built the same day) and,
  found while fixing those three, the SAME latent bug on Practice and
  Settings (both pre-existing) — `height: 100%` → `min-height: 100vh` on
  each page's root class, an absolute floor rather than a percentage, so
  it holds regardless of what `.app-shell` does. `.prac-body` was also
  missing the `margin: 0 auto` its 3 sibling pages have (content sat flush
  left on a wide screen); added. `ComingSoonPage.tsx` (unused today, kept
  as the fallback for a future destination) got the same height fix plus
  a real bug — its body div's className never matched anything sidebar.css
  defined (`coming-soon-body` vs `.coming-soon-page`), so it rendered
  unstyled. `Patients`/`PatientRecord` (`.prec-page`) were NOT touched —
  not reported broken, and the same latent bug there is currently masked
  by real content length, so leaving it alone is the smaller, safer diff
  (targeted edits, rule 11) until it's ever actually visible.
