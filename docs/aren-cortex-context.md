# AREN CORTEX — CONTEXT

*The doctor-facing half of Arenode. Current state only — no session logs, no history.*

Scope: **Cortex only** (`src/features/consult/` + supporting hooks/lib). Front Desk
(`src/features/frontdesk/`) is a separate suite, out of scope here except where noted.

---

## 1. What Cortex is

The doctor's consult workspace: patient intake → chart (symptoms/findings/history) →
Synapse engine ranks possible conditions, medicines, tests, referrals, advice,
exercises, modalities, impairments → doctor accepts/searches/confirms → review & save
→ decision log feeds the learning loop.

Eight specialty profiles: General OPD (default), Physiotherapy, Diagnostics,
Cardiology, Pediatrics, Gynaecology, Dentistry, Dermatology. A profile is pure
**configuration** — which intent type is primary, which measurements default on,
which specialty charts render. It never changes the engine's ranking logic.

---

## 2. File tree — where things live

```
src/
  App.tsx                          — shell only: boot, nav, toast, which overlay is open (~1,050 lines)
  hooks/
    useConsultChart.ts             — what was RECORDED (symptoms, findings, vitals)
    useAcceptLedger.ts             — which engine intent each plan item came from
    useConsultSession.ts           — who/which visit/which patient; v1 compat write
    useConsultIntelligence.ts      — runs the Synapse engine per chart change
    useConsultPlan.ts              — accept-to-plan pipeline; handleAcceptIntent (the one entry point)
    useConsultLifecycle.ts         — start/repeat/save/end; clearWorkspace()
    useClinicalIdentity.ts         — which doctor/clinic is signed in
    useLongitudinalRecord.ts       — patient history / trend data, between session and plan
    useRovingList.ts               — shared ↑↓/Enter keyboard nav over ranked lists (DOM-cursor based)
    useOverlayFocus.ts             — shared focus-trap/restore for all overlays
    useConsultKeyboard.ts          — global keyboard handler
    useDismiss.ts                  — outside-click close for menus
    usePinnedMedicines.ts          — doctor's pins (Supabase-backed, not localStorage)
  features/consult/
    GeneralOpdInputs.tsx           — General OPD's own input surface (Case Sheet + Measurements/Attachments)
    SoapInputs.tsx                 — shared fallback: 3 pickers (History/Symptoms/Findings) + Measurements
    PhysioInputs.tsx               — Physiotherapy's own input surface (Story+Goals ahead of command bar)
    CaseSheet.tsx                  — chip entry surface used by General OPD / Physio (ROW_BUDGET per group)
    StoryCard.tsx / GoalsCard.tsx  — Physiotherapy subjective intake + patient goals
    ConditionsCard.tsx             — Possible Conditions (engine's finding-type output)
    MeasurementsCard.tsx           — single source of truth for this visit's numbers
    AttachmentsCard.tsx            — X-rays/lab reports/photos, B2-backed
    RecommendationsCard.tsx        — ranked medicines, brand-first, combinations as alternates
    SuggestionsCard.tsx            — tests/referrals/advice as one ranked stream
    ExercisePlanCard.tsx           — physiotherapy exercise plan + Progressed/Same/Eased/Added badges
    PlanCard.tsx                   — the assembled consultation
    IntentSearch.tsx               — the ONE manual-search fallback for all output types
    ContributionSheet.tsx          — "why is this ranked here" (never a modal — no focus trap)
    DentalChartCard.tsx / BodyMapCard.tsx / JointMapCard.tsx / GrowthChartCard.tsx
                                    — specialty tools, gated per profile via SpecialtyProfile.charts
    LongitudinalBand.tsx           — trend/history strip, collapsible, scrolls with page
    measures.ts                    — MEASURE_FIELDS catalogue + RELEVANT_FIELDS (signal→field relevance)
    story.ts                       — physiotherapy Subjective vocabulary (factors, patterns)
    exercisePlan.ts                — exercise dose model (sets/reps/hold/side), comparePlans()
    examination.ts                 — physio exam regions/movements/MMT/special tests
    dosing.ts                      — static composition→food-instruction map
    parts.tsx                      — shared vocabulary (MedicineIdentity, RankBar, PinButton, GuardReason)
    types.ts                       — AcceptPayload, the one shape every accept takes
  lib/
    synapse/                       — the engine: PURE, no React/Supabase import, ever
      engine.ts                    — runEngine, guardIntent, guardCombination, medicineIntentIndex
      consultInput.ts              — vitals → engine input (BP split, °F→°C, age, text-row filtering)
      brands.ts                    — brand-family grouping, PEDIATRIC_FORMS
      specialtyProfile.ts          — the 8 profiles; profileFor() reads hospitals.specialty_profile
      systems.ts                   — body-system order/labels, the one place
    keyboard/keymap.ts             — the ONE declaration of every keyboard binding
    dental/ · body/                — chart geometry (anatomy.ts, types.ts)
    growth/                        — WHO growth engine (whoStandards.ts, growth.ts, age.ts)
    db/
      synapse.ts                   — loadRuleset, commitConsultation, addMedicine
      medicines.ts                 — fetchCombinationProducts (whole-product resolution)
      story.ts                     — Story/Goals persistence
      bodySites.ts                 — shared storage for BodyMapCard + JointMapCard
      intelligence.ts              — saveConsult
      reference.ts / patients.ts / prescriptions.ts
      — DB calls ONLY go here. db.ts is a barrel; never add functions there.
  components/
    ReviewModal.tsx                — the one shared review/print surface (Tailwind)
    PatientHeader.tsx / PatientModal.tsx / ActiveConsultGuard.tsx
    MedicineInspector.tsx / GlobalLogoTrigger.tsx / ShortcutsSheet.tsx
  features/prescription/PrescriptionDocument.tsx  — what the patient actually receives (print/PDF/WhatsApp)
  features/settings/SettingsPage.tsx  — specialty switch (doctor self-service, temporary) + logout
  features/patients/  — PatientsPage + PatientRecord (built). features/practice/PracticePage.tsx
    — pinned medicines, real (built 2026-08-23; see §7). features/sidebar/ — Sidebar +
    SidebarNav, six real destinations (Consult action, Patients, Communication, Practice,
    Clinic, Settings) + Help & Support utility, rebuilt 2026-08-23 — "Prescriptions" and
    "Investigations" are deliberately NOT pages (see SidebarNav.tsx's header for why); their
    0-byte stub folders were deleted, not left as dead placeholders. features/communication/
    CommunicationPage.tsx and features/clinic/ClinicPage.tsx (2026-08-24) are dedicated
    coming-soon pages now, own illustration + own copy — genuinely still not built (no data
    model behind either), just no longer the generic ComingSoonPage. features/support/
    SupportPage.tsx (same day) is real: mailto:/tel: cards, not a stub. App.tsx's
    COMING_SOON_META now stays empty, kept only as the fallback for a future destination
    with no page yet. See §7 for the full reasoning on all three.
  styles/
    consult.css   (cs-*)  — the consult screen. ALL new consult UI goes here.
    workspace.css (cx-*)  — legacy, mostly dead; 3 sheets + 1 selector hook still live
supabase/functions/   — edge functions, in git (attachment-upload-url, -view-url, -delete, -configure-cors)
```

---

## 3. Data model — the tables that matter

| Table | What |
|---|---|
| `observables` | the catalogue — every pickable symptom/finding/history chip |
| `observable_signals` / `signals` | chip → engine vocabulary |
| `measurement_rules` | numeric threshold → signal |
| `intents` | every possible output (medicine/finding/test/referral/advice/exercise/modality/impairment) |
| `signal_intent_rules` | **the knowledge base** — what ranks against what |
| `intent_guards` / `intent_classes` / `intent_class_map` | warn / warn_hard gating |
| `compositions` | the molecule catalogue — what the engine actually ranks |
| `medicines` | products (213k+ rows collapsing to ~284 molecules); read only via `composition_brands` RPC |
| `intent_companions` | intent → companion intent, authored |
| `visit_observations` / `visit_measurements` | the permanent engine-shaped record of a visit |
| `decision_log` | the learning write, gated on a real identity |
| `patient_conditions` / `condition_observable_map` | durable chronic facts carried forward across visits |
| `visit_story` / `patient_goals` / `visit_goal_scores` | physiotherapy subjective intake + goals |
| `visit_body_sites` | dermatology body map + physiotherapy joint map (shared storage) |
| `prescription_exercises` | structured exercise plan rows |
| `care_plans` | session-count tracking for physiotherapy courses |
| `visit_attachments` | X-rays/lab reports, B2-backed |
| `doctor_pinned_intent` | doctor's pins, RLS-scoped, follows them across machines |
| `clinic_brand_preference` / `doctor_signal_intent_rules` | clinic/doctor personalisation overlays |

RPC surface: `composition_brands` (SQL, invoker) and `search_intents` (SQL, security definer,
brand-priority over label-priority).

---

## 4. The intelligence layer — Synapse

- `useSynapse()` loads the ruleset + doctor's learned overlay once per session.
- `useConsultIntelligence()` runs the engine **synchronously in `useMemo`**, on every
  keystroke — safe because `runEngine` is pure and `persistVisitInput` is idempotent.
- Guards: `warn` / `warn_hard`. **Never hides anything.** A `warn_hard` intent ranks at
  its real position, in red, unlockable only by acknowledgement.
- **No score is ever printed** — relative rank is a proportional bar or a relevance
  word only. Cross-type score comparison is meaningless (different intent types score
  on different scales).
- **Ranking is "re-rank by habit," not "recommend by clinical truth."** The knowledge
  base is data in Supabase, out of scope for UI work.
- Combinations: ranked list stays single-molecule (`ingredient_count = 1` filter);
  every product a doctor *names* (search or accept) resolves whole via
  `fetchCombinationProducts`, sitting beside `composition_brands` rather than
  replacing it. `guardCombination` checks every molecule a combination product
  carries, not just the one it was reached through — a hard warning on any
  ingredient locks the whole row.
- 8 intent types: medicine, finding, test, referral, advice, exercise, **modality**
  (physiotherapy in-clinic treatment — ultrasound/IFT/TENS/etc., its own plan section
  "Therapy — this session"), **impairment** (physiotherapy functional-limitation
  ranking, ranks above findings on that profile).
- **Trend/MCID**: a measurement's `MeasureField` carries `trendNoise` (real change vs.
  jitter) and `mcid` — minimum clinically important difference, the smallest change
  worth drawing an arrow at. `verdictFor` requires clearing both before the
  longitudinal band calls a change real. Outcome instruments: LEFS (lower limb), ODI
  (low back), QuickDASH (upper limb) — ODI/QuickDASH are DISABILITY scores
  (`betterWhen: "lower"`), opposite direction from LEFS. Pain VAS has an MCID of 2.

---

## 5. Standing rules (do not relitigate)

1. **All DB calls go in `src/lib/db/*`.** `db.ts` is a barrel only.
2. **The engine (`lib/synapse/*.ts`) is pure.** No Supabase import, no React import, ever.
3. **Symptoms/findings/history are structured `observables`.** Never free text as the
   primary path — a chip always exists before a note does.
4. **Learning-loop and compatibility-write failures are non-fatal.** Always `.catch()`.
5. **Never redefine an existing CSS class** — `consult.css` owns everything under `cs-`.
6. **One prescription renderer, one review surface.** Don't fork `PrescriptionDocument`
   or `ReviewModal`. If you're changing what the *patient* sees, that's
   `PrescriptionDocument` — styling `ReviewModal` alone does nothing to print/PDF.
7. **One manual search** (`IntentSearch.tsx`) for every output category — give it a
   `types` array, don't fork it.
8. **No guard ever hides a suggestion.** Anything reached by search must compute and
   render the same guard verdict the ranked list would.
9. **Never print a score.** Proportional bars and relevance words only.
10. **Add zero new `tsc` errors.** `tsc -b` and `npm run build` both pass clean.
11. **Targeted edits only** — never silently rewrite a whole file.
12. **Never persist an alias, search term, or v1 name into a visit record.** The
    canonical identity of anything on the chart is its `observable.id`.
13. **Keyboard bindings: `lib/keyboard/keymap.ts` is the only declaration.** The
    handler dispatches from it, `ShortcutsSheet` prints from it — a binding that
    isn't dispatched can't be documented and vice versa.
14. **An overlay that binds any un-modified key MUST take focus when it opens**
    (`useOverlayFocus`), or those bindings are dead — focus something that isn't a
    text field.
15. **Ranked lists use a DOM-read cursor (`data-cx-cursor`), never a React state
    index** — these lists re-rank live under the doctor's cursor; an index is a claim
    about a list that has already changed.
16. **The per-specialty-branch law:** a profile earns its own render file only when
    *the clinician reasons in a different order*, not merely when the input surface
    looks different. Copy `GeneralOpdInputs.tsx` (rename, diverge) — never grow a
    specialty conditional inside a shared file, and never pre-split into near-identical
    placeholder copies "for later."
17. **"Cortex should know a lot, but show little."** Standing law, not a preference —
    apply progressive disclosure rather than surfacing every possible field.
18. **A fire-and-forget write plus a live CHECK constraint is a silent-failure trap.**
    Verify writes against Postgres directly, not just by trusting migration text.
19. **When two things must independently agree (a check, a constraint, a hand-maintained
    list), make one read the other rather than trusting both stay in sync by discipline.**
    This has broken multiple times (`hospitals_specialty_profile_check` vs `PROFILES`
    map; print surfaces vs `MEASURE_FIELDS`; `ShortcutsSheet` vs the keyboard handler).
20. **Anmol is non-technical:** literal, copy-paste-ready instructions; text/code in
    chat, no diagrams or HTML.
21. **`.env` is committed to this repo, deliberately.** Holds only the public anon
    key + Supabase URL. Do not delete it, do not re-gitignore it, do not "fix" this.
22. **Never mint a new composition from the UI/self-service path.** A doctor may
    attach a new *medicine* to an *existing* composition (`add_medicine` RPC); a new
    composition is a clinical decision requiring the full compositions → gates →
    rules pipeline.

---

## 6. Where do I change X?

| I want to change… | Open |
|---|---|
| Consult state, effects, handlers (the shell) | `src/App.tsx` |
| Anything about how the consult screen LOOKS | `src/styles/consult.css` (`cs-*`) |
| Chip entry, fuzzy search, browse-all | `PickerCard.tsx` (SOAP profiles) / `CaseSheet.tsx` (General OPD, Physio) |
| Possible Conditions (engine's reading) | `ConditionsCard.tsx` |
| Which measurement fields exist | `measures.ts` → `MEASURE_FIELDS` |
| Which measurements a facility shows by default | `specialtyProfile.ts` → `measurements` |
| Which symptom surfaces which measurement | `measures.ts` → `RELEVANT_FIELDS` (keyed on signal id) |
| Which joint surfaces which ROM field | `measures.ts` → `JOINT_RANGE_FIELDS` (separate map, physio-only) |
| Which intent type is primary for a profile | `specialtyProfile.ts` → `primary` |
| The manual search on any category | `IntentSearch.tsx` — the one place |
| The "why did this rank" panel | `ContributionSheet.tsx` |
| Prescription dose/frequency/duration editing | `PlanCard.tsx` (`DoseEditor`) |
| Freq ⇄ dose-slot conversion (M/A/E/N) | `lib/db/reference.ts` — the slot string is canonical, never parse the human label |
| A combination product's guard verdict | `lib/synapse/engine.ts` → `guardCombination` / `medicineIntentIndex` |
| Which combination products a molecule offers | `lib/db/medicines.ts` → `fetchCombinationProducts` |
| Keyboard shortcuts | `lib/keyboard/keymap.ts` — the one place |
| ↑↓/Enter over a ranked list | `hooks/useRovingList.ts` — don't fork it |
| Ranking/guards/personalisation/brands — the MATH | `src/lib/synapse/*.ts` (pure) |
| Vitals → engine measurements | `lib/synapse/consultInput.ts` — the one place |
| Loading ruleset/catalogue/preference models | `src/lib/db/synapse.ts` |
| Which doctor/clinic is signed in | `src/hooks/useClinicalIdentity.ts` |
| What saving a consult writes | `lib/db/intelligence.ts` → `saveConsult` |
| The learning write | `lib/db/synapse.ts` → `commitConsultation` |
| Body-system order/labels | `lib/synapse/systems.ts` — the one place |
| A DB query | `lib/db/{reference,patients,intelligence,prescriptions,synapse}.ts` — never `lib/db.ts` |

---

## 7. Open / left to do

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
  chart change (doctrine §4). Reported as a "weird blue screen animation"
  showing up "whenever a new thing is added in Synapse, selecting any chip."
  `ThinkingRing` now always renders `null`; the 4 call sites were left alone
  on purpose (smaller diff, same net effect) — `.cs-thinking-ring`/
  `.cs-glyph-live` in consult.css are dead CSS now. Same pass: the "Add
  medicine" brand/dose sheet (`MedicineAddSheet.tsx`) no longer animates its
  scrim/panel in with a fade + spring bounce on every open — it still opens
  and closes, just without the motion.
- **"Confirming a condition doesn't rerank medicines/tests" — investigated
  2026-08-24, widened 2026-08-25 with Anmol's explicit go-ahead ("we are in
  MVP, the goal is shipping fast... not database perfection").**
  Coverage went from **7 of 87 active `finding`-type intents to 21 of 87**
  (verified live, both counts). Two kinds of addition, both via
  `apply_migration` (not raw `execute_sql`) so they show up in
  `list_migrations` like every other content batch this ruleset has had
  (`mumps_measles_gout_*`, `cardio_depth_*`, the original
  `seed_condition_observable_map_chronic_subset`):
  - **6 "free wins"** (`condition_observable_map_free_wins`) — conditions
    pointed at an observable that ALREADY existed and was ALREADY wired to
    real `signal_intent_rules`, so no new clinical content was authored,
    just recognised: Piles→"Piles / haemorrhoids", Dengue fever→"Dengue
    suspected", Atrial fibrillation→"ECG: Atrial fibrillation rhythm",
    Vertigo→"Vertigo — spinning sensation", Mechanical low back pain→"Low
    back pain", Mechanical neck pain→"Neck pain".
  - **8 new chronic facts** (3 migrations:
    `chronic_conditions_batch1_signals_and_observables` →
    `..._batch2_link_and_map` → `..._batch3_intent_rules`, same 3-step
    split the ruleset's own history uses) — Migraine, GERD, Hip+Knee
    osteoarthritis (shared one observable — same disease process, same
    rerank, matching how asthma+COPD-exacerbation already share
    `known_asthma_copd`), Gout, Allergic rhinitis, Peripheral arterial
    disease, Congestive heart failure. Every medicine/test referenced
    already existed in the catalogue (rule 22 — nothing minted); every
    association was checked against a real guideline before being written
    (AAFP migraine prophylaxis, ACP/ACR gout management, current OA
    guidance — paracetamol is explicitly NOT first-line any more, NSAID +
    physiotherapy referral outrank it here on purpose — AAFP allergic
    rhinitis, ACC/AHA PAD, AHA/ACC heart failure GDMT). Weights follow the
    existing DIABETIC/LOW_BACK_PAIN pattern (primary ~0.35–0.45, secondary
    ~0.25–0.35, adjuncts/tests ~0.15–0.30); every new row is
    `is_safety_critical=false` — these are rank-order nudges, not guards,
    and no `intent_guards`/`intent_class` row was touched this pass.
    Verified end-to-end live (every one of the 21 rows resolves
    intent→observable→signal→≥3 real rules; the 8 new ones average 6–8
    each) and against `get_advisors` (no new findings — everything flagged
    pre-dates this batch).
  **Still not mapped: 66 of 87.** Mostly genuine one-off acute infections/
  injuries (URI, gastroenteritis, malaria, ankle sprain, appendicitis, …)
  where a "confirm" adding today's context has real but smaller value than
  the chronic batch did, plus a handful of cardiology/paediatric findings
  closer to a monitoring finding than a "diagnosis a doctor confirms". Same
  process works for more of them — `condition_observable_map`'s own
  `note` column on each row this pass documents the reasoning so a future
  batch (or a scan for more "free wins" against observables added since)
  is a repeat of this playbook, not a re-investigation.
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
  so full login-gated screens can't be driven end-to-end — see §7's
  Cross-cutting note on this): `.app-shell` (App.tsx, the ancestor of
  every page) has no height of its own — `max-width`/`margin`/`padding`
  only, sized by its content like `<body>` above it, and nothing in the
  app (`html`/`body`/`#root` included) ever gives it one. Every feature
  page's root div used `height: 100%`, which — per plain CSS, a parent
  with no explicit height makes a percentage height on the child compute
  to `auto` — silently did nothing, and the page shrank to fit its own
  content instead of filling the screen. Invisible on Patients (enough
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

**Cross-cutting:**
- **WhatsApp follow-up reminders**: still not built — the real API integration
  is still blocked on Anmol choosing a provider. **A placeholder now exists**
  (`lib/whatsapp.ts`, added 2026-08-23 for the Patient Record page's "Send via
  WhatsApp" prescription action, Anmol's own ask, explicitly framed as
  temporary): opens a `wa.me` deep link with the message pre-filled, no
  template system, no delivery tracking, no automated send. Every caller goes
  through `buildWhatsAppLink()` so swapping in the real API later doesn't mean
  hunting down every place that builds a wa.me URL by hand.
- **Sidebar rebuilt to six real destinations 2026-08-23** (Consult, Patients,
  Communication, Practice, Clinic, Settings + a Help & Support utility) —
  full reasoning in `SidebarNav.tsx`'s header.
- **Practice built for real the same day, hours after being documented as
  blocked.** The blocker was "no standalone query resolves a pinned
  `intent_id` to a display name without the full ruleset loader" — checked
  live with Supabase MCP direct SQL access (confirmed working this session,
  a separate path from the blocked browser — see SESSION-HANDOFF.md §3) and
  it turned out to be one join: `intents.label` already IS the display name
  for a medicine intent (verified: `id=390` → `label="omeprazole"`, matches
  `compositions.name` exactly). `fetchPinnedMedicineDetails(doctorId)` in
  `lib/db/synapse.ts`, `features/practice/PracticePage.tsx` built on it,
  wired into `App.tsx`. `doctor_pinned_intent` has 0 rows for this account
  today (Dr Anmol Pandey has never pinned a medicine) — the page correctly
  shows an honest empty state, not fabricated data. Preferred Labs and
  Prescription Templates stay explicitly "not built" within the same page
  (no schema exists for either — checked the live table list, not assumed).
  Communication and Clinic remain `ComingSoonPage` stubs — genuinely more
  complex (new data models: conversation/message storage, staff/hours/
  operational config), reasonable to leave for a session with Anmol's
  input on scope. Support's existing "Help & documentation" copy is fine
  as-is.
- **Confirmed-condition resolve/refute** (status active/resolved/refuted) only
  works on the Case Sheet surface (General OPD, Physio) — the 6 SOAP-fallback
  profiles still treat removal as silent and today-only.
- **Nothing surfaces a patient's retired (resolved/refuted) conditions** —
  they're recorded but invisible.
- `workspace.css` (2,794 lines, `cx-*`) is mostly dead — 24 classes still live
  (3 sheets + 1 selector hook). Migration to `cs-*` is a presentation decision,
  not mechanical.
- Combinations are offered as alternates but **not scored as combinations** —
  a product answering two active needs at once isn't ranked higher for it.
  Flagged as a bigger engine change, not attempted.
- No India-region data residency for attachments yet (Backblaze B2, US region) —
  acceptable for pilot, `storage_provider` column exists so migration is a
  secrets change later, not a rewrite. Get real legal counsel before scaling
  past a small consenting pilot.
- Admin panel (hospital activation, doctor credential reset, medicine-catalogue
  approval queue) — not built. The `add_medicine()` RPC it depends on IS built
  and verified.
- Specialty selection is still a doctor-facing Settings toggle (temporary,
  deliberate) rather than admin-assigned per facility.
- `App.tsx` line count and the state/render split (5 hooks) is the reference
  pattern now — if it starts growing again, ask which of the 5 hooks new state
  belongs in, not whether `App.tsx` can hold one more thing.
- **Everything in this codebase is built and verified against `tsc`/`vite build`/
  check scripts and Chromium component harnesses, but a recurring gap is that
  much of it (especially the physiotherapy rebuild, session 2026-08-17 onward)
  has NOT been driven against the actual live app** — the working environment's
  Chromium has no outbound network. Treat recent physiotherapy work as
  type-checked and structurally verified, not yet eyeballed in production.

---

## 8. Gotchas worth remembering (one-liners only)

- `.app-shell` (App.tsx) has no height of its own — a feature page's root
  must use `min-height: 100vh`, never `height: 100%`, or it silently
  collapses to its own content height instead of filling the screen.
  Chromium in this sandbox can reach the app's own dev/preview server but
  not Supabase, so a login-gated screen can't be driven end-to-end here —
  a plain HTML file loading the built CSS bundle against the real class
  names is how the fix above was actually confirmed, not guessed.
- BP is one UI field but must become two measurements (`BP_SYS`/`BP_DIA`) or the
  BP rule never fires.
- The rule base is in Celsius; the UI takes Fahrenheit — conversion happens in
  `consultInput.ts`.
- A `MeasurementRow` with a text value (e.g. blood group) must be filtered out
  before reaching the engine, or it passes NaN as a silent wrong answer.
- `.ilike()` on the 213k-row `medicines` table times out; use `.eq()` for exact
  match — `search_intents` already returns the row's own name.
- A bare anon key returns **zero rows, no error** on Synapse's RLS-protected
  tables — don't mistake that for "nothing matched" in a check script.
- The `postgres` role bypasses RLS entirely — never use it to verify isolation;
  use a real `authenticated` session instead.
- `mv_composition_brand` must be refreshed manually after any composition/brand
  change — nothing does it automatically, and a stale view looks correct.
- A new Backblaze B2 bucket ships with no CORS rule — `curl` against a presigned
  URL won't reveal this; only a real browser PUT/GET will.
- Prescription insert needs `hospital_id` set explicitly or RLS's WITH CHECK
  silently rejects it (403) — this can leave a visit marked completed with no
  prescription attached.
- Vitals dependency arrays for the engine memo must key on the whole object
  (`JSON.stringify(vitals)`), not an enumerated field list — new measurement
  fields silently fail to trigger a re-rank otherwise.
- `is_primary` on `medicine_composition_map` cannot be trusted for combination
  products — infer the characteristic composition by rarity (fewest brands)
  instead.
- Mirroring one drug's rules does not mean inheriting its pregnancy/other gates
  — check class membership explicitly per molecule.
- Reserving visual space for an empty state creates a void, not breathing room —
  empty panels should be short and centred in whatever space is left.
- A component harness that doesn't run the real build pipeline (Vite+Tailwind)
  can only check structure, never real layout — esbuild-only harnesses have
  produced false failures more than once.
- `visits.vitals` and `visit_measurements` are NOT interchangeable, even for the
  same reading — `vitals` is the doctor's record (what was typed, in the units
  typed, e.g. Fahrenheit); `visit_measurements` is the engine's normalised record
  (Celsius). Reading trend data off the wrong one draws a confident, wrong arrow.
  `visit_measurements` carries additive `side`/`method`/`context`/`qualifier`
  columns (`context` defaults to `'baseline'`; a physio re-test writes
  `'post_intervention'` on the same row-shape so an in-session retest can never
  contaminate a between-visit trend).
- A boolean guard derived from an enum (e.g. `usesCaseSheet` meaning "not the old
  SOAP fallback") silently narrows in meaning the moment a new enum value is
  added — `tsc` cannot catch it because every value involved is still a valid
  boolean. Name the predicate for what it actually means
  (`usesRebuiltSurface = inputLayout !== "soap"`), not for the one case that was
  true when it was written.
