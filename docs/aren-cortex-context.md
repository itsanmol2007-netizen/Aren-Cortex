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
  features/patients/  — PatientsPage + PatientRecord (built). features/sidebar/ — Sidebar +
    SidebarNav, six real destinations (Consult action, Patients, Communication, Practice,
    Clinic, Settings) + Help & Support utility, rebuilt 2026-08-23 — "Prescriptions" and
    "Investigations" are deliberately NOT pages (see SidebarNav.tsx's header for why); their
    0-byte stub folders were deleted, not left as dead placeholders. features/communication/,
    features/practice/, features/clinic/, features/support/ are still 0-byte stubs — real
    destinations, not yet built (each renders ComingSoonPage today, App.tsx's
    COMING_SOON_META). See §7 for which of those is the best next build.
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
- **`care_plans` is correctly modeled and — UPDATE, later on 2026-08-23 — is
  now genuinely linked for at least one real patient.** The entry above (same
  date, earlier check) said `care_plan_id` was null on effectively every
  visit including patients with 5+ visits, and concluded "session 4 of 12"
  had never once rendered true data. Building the Patient Record page's Care
  Plan card that same day, against Ekanki's live account, showed Rohan
  Malhotra with a real `care_plan_progress` — "Session 6 of 12", a correct
  50% bar, target 12 — not fabricated, read straight from
  `PatientRecordRow.care_plan_progress` (which itself reads `care_plans` via
  `buildPatientRecordRows`). Both checks were real reads of the same live
  data hours apart; the honest reading is that **something started linking
  visits to a plan for this patient in between**, not that the earlier
  finding was wrong. **Left for the next physio-consult session:** re-run the
  live check this entry originally did (how many patients now have a real
  `care_plan_id`, is it one patient or a pattern) before trusting or
  distrusting "session N of M" anywhere in the product — don't assume either
  the old "never used" claim or the new one-patient sighting generalizes.
- **`fetchPatientVisits` (`lib/db/patients.ts`, used by the Patient Record
  page) has no physio fields at all — found 2026-08-23, second pass on the
  Patient Record page.** `PatientRecordRow` (the Overview table's row) got
  real `body_sites`/`exercise_names`/`impairment_names` in the first pass of
  this arc; `RealVisit`/`fetchPatientVisits` (the PER-VISIT history the
  Record page's timeline reads) never did — it still only selects
  symptoms/findings/medicines via the v1-legacy join. Concretely, live
  against Rohan Malhotra: every visit in his timeline reads as generic
  "Consultation" (the badge logic is `hasMeds ? "Prescription" : hasFindings
  ? "Examination" : "Consultation"`, and physio visits routinely have
  neither) even though the account's own real exercise data exists — the
  Identity card's "Last Exercise" stat only manages to show something real
  because it reads `row.exercise_names[0]` off the Overview row instead, which
  is only ever the MOST RECENT exercise, not per-visit. A physiotherapist
  opening a past session in the timeline cannot see what was actually
  prescribed that day. Needs: extend `RealVisit`/`fetchPatientVisits` with
  the same `body_sites`/`exercise_names`/`impairment_names` fields
  `buildPatientRecordRows` already knows how to compute, then give
  `VisitRow` (`PatientRecord.tsx`) a physio-aware branch on the visit-type
  badge and expanded body, same specialty-branch discipline as rule 16.
- **`fetchPatientVisits`'s `visit_count` vs `PatientRecordRow.visit_count` can
  disagree by a lot — found 2026-08-23, not root-caused.** Live on Rohan
  Malhotra: the Identity card's "Total sessions" (from `row.visit_count`,
  computed by `buildPatientRecordRows`) read **24**; the Visit Timeline right
  below it (from `fetchPatientVisits`, `.eq("status","completed")` capped at
  `.limit(20)`) showed **6**. Two live reads of the same account, same
  session, genuinely 18 apart. Two candidate explanations, neither confirmed
  against the schema this session (no live DB access — see
  SESSION-HANDOFF.md §2): either most of Rohan's 24 visits carry a
  `visits.status` other than `completed` (plausible — physio sessions may
  legitimately sit in `serving`/`waiting`/`draft` more often than a
  General-OPD visit does, and `visit_count`'s own count query may not filter
  the same way `fetchPatientVisits` does), or the `.limit(20)` cap is
  genuinely too low for a physio patient this far into a course and quietly
  truncating real history. **Left for the next session with live DB access:**
  check which status values Rohan's other 18 visits actually carry before
  changing either query — do not just raise the limit or loosen the status
  filter without knowing which one (or both) is the real cause.

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
  full reasoning in `SidebarNav.tsx`'s header. Of the four still-stub pages
  (Communication, Practice, Clinic, Support — each renders `ComingSoonPage`
  today), **Practice is the best next build**: the real data already exists
  (`doctor_pinned_intent` / `usePinnedMedicines.ts`, a doctor's pinned
  medicines) and needs no product decision from Anmol, only wiring — but it
  was NOT built this session because resolving a pinned `intent_id` to a
  display name has no existing standalone query (every current caller reads
  it out of the full ruleset the consult screen loads, which is heavy to
  pull in for one static page) and this session had no live DB access to
  write and verify a new one. **Concretely for that session:** write
  `fetchPinnedMedicineDetails(doctorId)` in `lib/db/synapse.ts` alongside
  `loadPinnedIntents`/`setPinnedIntent` (join `doctor_pinned_intent` →
  `intents` → whatever table actually carries the display name — check
  live, don't assume the column name), verify it against Ekanki's account,
  then build `features/practice/PracticePage.tsx` on it. Communication and
  Clinic are genuinely more complex (need new data models — conversation/
  message storage, staff/hours/operational config) and are reasonable to
  leave for later; Support's existing "Help & documentation" ComingSoon
  copy is fine as-is, it was never meant to be a major destination.
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
