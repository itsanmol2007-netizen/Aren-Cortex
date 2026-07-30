# AREN CORTEX — TECHNICAL ATLAS

*The doctor-facing half of the product, read from the code itself.*

Surveyed: **2026-07-30** · Branch `master` · Commit `d5af9f7` + the session-41
working tree
Scope: **Cortex only.** Everything under `src/features/frontdesk/` (the reception
suite) is deliberately out of scope — see `aren-technical-atlas.md` §4.6 for that,
except where Front Desk shares a table with Cortex (the catalogue, §6) — those
crossings are called out explicitly.

Purpose: the single current description of the doctor's workspace. The previous
edition (2026-07-28) described a Cortex whose consult screen was a three-column
Chart · Synapse · Plan workspace. **That workspace no longer exists.** It was
replaced on 2026-07-29 by the Mock 2 rebuild, and extended on 2026-07-30 by the
Possible Conditions / search / explanation pass. This edition folds both in and
removes the "superseded in part" boxes the last one carried, because there is
nothing left in it that is superseded.

Every claim below was verified this pass by reading the file, running `tsc -b`,
running the production build, or querying the live database. §11 is the full
diff for a reader who has the 2026-07-28 edition memorised.

---

## 1. What Cortex is

The doctor's clinical workspace. One patient at a time, one screen, one output:
a prescription. Per `aren-architecture-handoff.md` ("Consult"), its
responsibilities are exactly: open patient · review history · record findings ·
add diagnosis · select medicines · order investigations · generate prescription ·
complete consultation. **Nothing else** — the doctor never manages a queue by
hand.

There is **one** Cortex for all specialties ("Universal Cortex"): specialty is a
data lens over a shared consultation engine, not a separate app. Two things are
now configured per facility rather than coded — which intent type gets the
elevated Primary Recommendation slot, and which measurement fields are visible
by default. Both live in one file (§5.3).

Ranking is the **Synapse v2 engine**: a pure, client-side scoring function over a
ruleset loaded once at boot. It is synchronous — the suggestion list re-orders in
the same frame a chip lands, with no network round-trip and no debounce on the
ranking itself. See §4.

### Where it lives

| Thing | Path |
|---|---|
| Route | `/app/cortex` (`src/main.tsx`, behind `RequireAuth` + `RequireRole allow={["doctor"]}`) |
| Root component | `src/App.tsx` (1,586 lines) |
| ★ **The consult screen** | `src/features/consult/*` (14 files, 3,273 lines) |
| Remaining shared components | `src/components/*.tsx` (10 files, 2,139 lines) |
| ★ The engine (pure, no React, no Supabase) | `src/lib/synapse/*.ts` (6 files, 1,044 lines) |
| ★ The engine's Supabase boundary | `src/lib/db/synapse.ts` (836 lines) |
| ★ Brand picker + facility profile | `src/features/synapse/` (2 files) |
| Engine-loading + per-consult ranking hooks | `src/hooks/{useSynapse,useConsultIntelligence,useClinicalIdentity}.ts` |
| Internal pages | `src/features/{patients,prescriptions,investigations,communication,practice,clinic,settings,support}/` |
| Internal nav | `src/features/sidebar/` |
| Prescription renderer | `src/features/prescription/` (shared with Print RX) |
| ★ Consult styling | `src/styles/consult.css` (2,180 lines, `cs-` prefix) |
| Legacy data (save + v1 hydration only) | `src/lib/db/{reference,patients,intelligence}.ts` |

Cortex is **not** a router. `App.tsx` swaps "sidebar pages" in local state
(`activePage: SidebarPage | null`) without touching the URL. `activePage === null`
means *the consult workspace*; anything else is a feature page.

---

## 2. `App.tsx` — the whole workspace in one component

Still the single most important file in Cortex and still the single biggest
liability. **1,586 lines**, up from 999 at the last survey: the Mock 2 rebuild
moved rendering out into `features/consult/` but moved *more state and more
handlers* in, because every one of those cards is controlled.

### 2.1 State inventory

**Reference data** — `dbReady`, `doctorProfile`, `hospitalProfile`.

**The consult** — `patient`, `visitId`, `vitals`, `selectedSymptoms` (observable
**labels**), `selectedSymptomsWithIntensity`, `selectedFindings` (labels),
`prescription`, `selectedMedicineId`, `selectedTests`, `pastVisits`,
`pastVisitsLoading`.

**The intelligence layer** — `acceptedIntents` (`Map<number, AcceptPayload>`,
keyed by the engine's own intent id), `chosenBrands`, `deliberateBrands` (only
brands picked *on purpose*, the only ones that teach the brand model),
`searchedAccepts`, `acknowledgedIntents` (hard warnings this doctor has read),
`dismissedCompanions`, `diagnoses` (confirmed conditions, as labels).

**UI / overlays** — `stagedMedicine`, `toast`, `repeatRxBanner`,
`patientModalOpen` (starts `true`), `activeConsultGuardOpen`, `isReviewOpen`,
`isSaving`, `sidebarOpen`, `activePage`, `shortcutsOpen`, `visitNotes`,
`suggestionsExpanded`, `browse` (which browse-everything sheet is open),
`brandSheet`, ★ `explain` (which row's contribution sheet is open),
`followUpDays`, `adviceNotes`.

One debounce ref (`rankTimer`, 300 ms — the v1 compatibility write) and four DOM
refs (`logoRef`, `chartSearchRef`, `synapseSearchRef`, `planRef`). The dead
`testsSearchRef` the last edition flagged is **gone**.

**Derived with `useMemo` rather than held in state**: `historyLabels`,
`reportableLabels`, `findingObservables`, `observableByLabel`, `findingsAsDb`,
`symptomChips`, `contextChips`, `onChartSet`, `chartObservableIds`, `ageYears`,
`adviceLines`, `reviewAdvice`, `acceptedIntentIdSet`,
`prescriptionCompositionIds`, `topOfType`, `companionsByTrigger`,
`unreadPrescribedWarnings`, `specialty`, ★ `measureRelevance`.

> **Labels in, ids out.** Symptoms and findings are held as display **labels**
> (`string[]`), and the conversion to observable ids happens in exactly one
> place — `chartObservableIds` (`App.tsx:363`). That memo is the boundary
> between "what the doctor sees" and "what the engine reads", and it is where
> anything new that should affect ranking has to land.

### 2.2 Effects

1. **Boot** (`[]`, gated on `identity.ready`) — two calls: `fetchDoctor`,
   `fetchHospital`. Sets `dbReady`. The catalogue loads separately inside
   `useSynapse()` (§4.1). Still no error state, only a toast; a failed boot
   leaves the splash on screen forever (§10.2).
2. **The v1 compatibility write** (300 ms debounce, `rankTimer`) — on every
   chart change, writes `visit_symptoms` / `visit_findings` for whichever
   selected chips *have a legacy row* (via `symptomOf` / `findingOf`). Explicitly
   a bridge; dies with the v1 teardown.

### 2.3 Render branches

```
!dbReady                      → boot splash
activePage === "patients"     → features/patients/PatientsPage
activePage === anything else  → components/ComingSoonPage
activePage === null           → the consult workspace  (.cs-shell)
```

Always rendered: `Sidebar`, `GlobalLogoTrigger`. Rendered only when
`!isFeaturePage`: `PatientHeader` and the three overlays (`ActiveConsultGuard`,
`PatientModal`, `ReviewModal`), each guarded *both* by `!isFeaturePage` and
force-closed inside `handleSidebarNavigate`.

---

## 3. The consult lifecycle

```
                       ┌─ PatientModal (opens on mount, non-dismissable until a patient exists)
                       ├─ features/patients/PatientRecord "Start Consult"
                       └─→ handlePatientConfirm / handleStartConsultFromRecord
                                    │
                                    ▼
                        createVisit(patientId)          ← ALWAYS creates a NEW visit,
                                                          status "serving", new token (§10.1)
                                    │
                                    ▼
 ┌──────────── the consult workspace — `.cs-shell` ─────────────────────────────┐
 │ PatientHeader   patient strip · doctor pill · past-visit rail                │
 │                 (NO vitals — that duplication was removed, see §5.2)         │
 │                                                                              │
 │ BAND 1 — .cs-pickers, four cards                                             │
 │   PickerCard "History / Context"   kind=history   (blue)                     │
 │   PickerCard "Symptoms"            kind=symptom   (rose)                      │
 │   PickerCard "Findings (On Exam)"  kind=finding   (teal)                      │
 │   ★ ConditionsCard "Possible Conditions"          (violet) ← ENGINE OUTPUT   │
 │                                                                              │
 │ BAND 2/3 — .cs-body: .cs-body-left beside the sticky PlanCard                │
 │   MeasurementsCard   the ONLY place this visit's numbers are entered         │
 │   .cs-engine (fixed height, both columns scroll internally)                  │
 │     RecommendationsCard   ranked medicines, brand under each                 │
 │     SuggestionsCard       tests · referrals · advice · exercises             │
 │                                                                              │
 │   PlanCard   the assembled consultation — diagnoses, medicines, tests,       │
 │              advice, follow-up, notes, companions, Review & Print            │
 │                                                                              │
 │ StatusBar   engine state · model version · specialty profile · online        │
 └──────────────────────────────────────────────────────────────────────────────┘
                                    │
        every chip / number change ─┼─→ useConsultIntelligence runs the engine
                                    │   IN THE SAME FRAME (§4.2)
                                    ├─→ 300 ms: v1 compatibility write
                                    └─→ 600 ms: persistVisitInput
                                            (visit_observations, visit_measurements)
                                    │
                          click Add → handleAcceptIntent
                                    │  medicine → resolve brand → prescription line
                                    │  test → selectedTests
                                    │  referral / advice / exercise → appendAdvice
                                    │  finding → diagnoses  ("Confirm")
                                    ▼
                        ReviewModal (mode="review")
                          Print/Save PDF → PrintFormatSelector → PrescriptionDocument
                          Confirm & Save → handleConfirmAndSave
                                    │
                                    ▼
                        saveConsult()  ── visits.status = "completed" + vitals
                                       ├─ insert prescriptions
                                       ├─ insert prescription_medicines
                                       └─ insert diagnostic_orders
                        then, fire-and-forget, ONLY if identity.isReal:
                          commitConsultation()   ★ writes decision_log, keyed on
                                                    the SAME EngineResult the doctor saw
                        then resetConsultState() → PatientModal reopens
```

### Interrupting a consult

`ActiveConsultGuard` — unchanged. Opens when the doctor tries to switch patient
mid-consult, writes the visit status directly (`updateVisitStatus`), offers
**Refer** / **Save as draft** / **Discard**. Still the only Cortex component that
mutates a visit outside `saveConsult`.

---

## 4. The intelligence layer — Synapse v2

### 4.1 Loading the engine — `useSynapse()` (187 lines)

Runs once per session, gated on a **real** identity. Loads in parallel:

| What | Function | Fails how |
|---|---|---|
| The ruleset + this doctor's learned overlay | `loadSynapseRuleset(doctorId)` | **Hard** |
| signalId → human label | `loadSignalLabels()` | Hard |
| The catalogue | `fetchObservables()` | Hard |
| Catalogue ↔ legacy id maps | `loadObservableMaps()` | Hard |
| This doctor's preference model | `loadPreferences(doctorId)` | **Soft** |
| This doctor's brand habits | `loadBrandPreferences(doctorId)` | Soft |
| The clinic's declared brand defaults | `loadClinicBrandDefaults(hospitalId)` | Soft |
| This doctor's frequent-medicine shortlist | `loadFrequentMedicines(doctorId)` | Soft |
| Co-prescription companion edges | `loadCompanionEdges()` | Soft |

"Soft" failures set `data.degraded = true` (surfaced in the `StatusBar`) and fall
back to an empty model — personalisation quietly disappears, the ranking never
does. All four personal-data loads are **skipped entirely** when
`identity.isReal` is false. `reload()` is exposed for recalibration without a
page refresh.

### 4.2 Ranking a chart — `useConsultIntelligence()` (260 lines)

Takes `{ data, visitId, observableIds, vitals, ageYears, acceptedIntentIds }` and
runs the whole pipeline **synchronously** inside `useMemo`:

```
observableIds + vitals + age
   → buildEngineInput()        (lib/synapse/consultInput.ts)
   → runEngine(ruleset, input) (lib/synapse/engine.ts)      — pure, no I/O
   → personalize(intents, preferences)                      — reorders only
   → resolveCompanions(...)    if any intents were accepted
   → fetchCompositionBrands()  ASYNC — cannot block ranking
```

Returns `{ result, intents, byType, hardWarned, signals, companions, brands,
brandsLoading, brandError, isPediatric, measurements, hasInput }`.

**The engine re-runs on every keystroke and that is safe.** `runEngine` is pure;
`persistVisitInput` is idempotent (delete-then-insert + upsert); the brand fetch
is session-cached. This matters for anything that wants to rerank mid-consult —
see `docs/confirmed-conditions-investigation.md`.

**Four silent-failure traps live in `consultInput.ts`** and are exactly why that
file exists rather than inlining the conversion in `App.tsx`:

1. **Blood pressure** — one field (`"140/90"`) must become two measurements,
   `BP_SYS` / `BP_DIA`. Written as one row, BP never fires.
2. **Temperature units** — the UI is Fahrenheit, the rule base is Celsius
   (`FEVER` fires ≥ 37.8 °C). Converted with a magnitude heuristic.
3. **Age** — never typed; injected from `patient.age` on every run, or
   `ELDERLY` / `PEDIATRIC` never fire.
4. ★ **Non-numeric measurements** — `MeasurementRow.value` is now `number | null`
   with an optional `text`. Blood group is the only text one. `buildEngineInput`
   **filters text rows out of the engine input**, because a row with no number
   cannot match a `measurement_rules` range and passing NaN would be a silent
   wrong answer.

### 4.3 Identity — `useClinicalIdentity()` (65 lines)

One resolver for "which doctor, which clinic", reading `useAuth()`. Returns
`{ doctorId, hospitalId, doctorName, specialization, isReal, ready }`.
`isReal` is `false` when the signed-in account has no `doctors` row — several
active accounts in the live database are in this state. Falls back to the
hardcoded `DOCTOR_ID` / `HOSPITAL_ID` constants only in that case, and everything
downstream is built to notice (§10.3).

### 4.4 The learning write — `commitConsultation()`

One insert into `decision_log` at consult close, gated on `identity.isReal`.
Records the **exact** `EngineResult` the doctor saw (`intelligence.result` —
never re-run), every accepted intent, implicit skips (shown, left untouched, in a
type where something else *was* accepted — never inferred for safety-critical
intents), and distinguishes `accepted` / `searched_accepted` / `override_accepted`.
An override is logged but **never** fed back into the preference model.

### 4.5 Brands, search, and the clinic tier

- **Brands** — `fetchCompositionBrands()` resolves ranked *compositions* to
  dispensable products via the `composition_brands` RPC, ordered by: this
  doctor's learned preference → the clinic's declared default
  (`clinic_brand_preference`) → most-prescribed → catalogue order → alphabetical.
  Only `ingredient_count = 1` products are offered; combinations are **counted
  and named**, never offered.
- ★ **Brand resolution is now demand-driven, not list-driven** — see §10.7. Every
  route into a medicine accept resolves its own product.
- **Search** — `searchIntents()` calls the `search_intents` RPC, which matches by
  molecule name, brand name, *or the symptom an intent treats*. Returns
  `matchKind: 'label' | 'brand' | 'symptom'` and the matched term. It supports
  **all six intent types** via `p_types`, and as of this pass all six are wired
  (§5.2).
- **Guards** — `warn` / `warn_hard`, never hides anything. A `warn_hard` intent
  ranks at its real position, in red, and is not prescribable until acknowledged.
  Acknowledgement is per-consultation, reversible, and un-acknowledging withdraws
  the accept it permitted.

**Standing rule:** ranking is "re-rank by habit", not "recommend by clinical
truth". The knowledge base (`signal_intent_rules`, guards) is data, lives in
Supabase, and is out of scope for UI work.

---

## 5. The consult screen — `src/features/consult/`

The whole doctor-facing surface. Fourteen files, one stylesheet.

### 5.1 Inventory

| File | Lines | What it does |
|---|---|---|
| `PickerCard.tsx` | 269 | **One component, three instances** — History/Context, Symptoms, Findings. What differs is a `kind` and a colour, never a layout, so a change to how a chip is added lands in all three. 5-tier matcher (`rankOf`) where `search_text` (Hindi/colloquial) beats a slug match. Portal dropdown. |
| `BrowseSheet.tsx` | 129 | The browse-the-whole-catalogue sheet behind each picker's `+`. |
| ★ `ConditionsCard.tsx` | 259 | **Possible Conditions** — the engine's `finding` intents, in the entry band. Relevance in words, guard reasons inline, `Confirm` verb, own search, own explain affordance. |
| `MeasurementsCard.tsx` | 284 | The single source of truth for this visit's numbers. Catalogue-driven (§5.3), facility-configured, with progressive relevance (§5.4). |
| `RecommendationsCard.tsx` | 452 | The Primary Recommendation slot. Brand headline, composition subtitle, proportional rank bar, **no score ever printed**, pin, brand alternatives, guard acknowledgement. |
| `SuggestionsCard.tsx` | 318 | Investigations · Referrals · Advice · Exercises as one flat ranked stream with a type label per row. Scoped search. |
| `PlanCard.tsx` | 415 | The consultation as assembled: diagnoses, medicines (with inline dose editor), investigations, advice, follow-up, notes, companion slot, Review & Print. |
| ★ `IntentSearch.tsx` | 281 | The shared manual-search fallback for **all six** categories — one debounced hook, one field, one results list. Computes the guard verdict for every out-of-list hit. |
| ★ `ContributionSheet.tsx` | 182 | "Why is this here?" — the engine's own `contributors`, on request only. |
| ★ `measures.ts` | 233 | The measurement field catalogue + the static signal→field relevance map. Data, no behaviour. |
| `parts.tsx` | 285 | The shared vocabulary: `MedicineIdentity`, `RankBar`, `relevanceOf`, `PinButton`, `GuardReason`, `CompanionLine`. |
| `usePinnedMedicines.ts` | 77 | The doctor's pins, localStorage (§10.5). |
| `StatusBar.tsx` | 58 | Engine state · model version · specialty profile · online. |
| `types.ts` | 31 | `AcceptPayload` — the one shape every accept takes. |

### 5.2 Three rules this screen enforces that nothing else does

1. **No score is ever printed.** Relative rank is a proportional bar in the
   medicine column and a *word* ("High relevance") everywhere else. "92% match"
   reads as diagnostic confidence to a human being and is nothing of the kind.
   The bar's denominator is the top score **of the same intent type** — findings
   score ~3 and medicines ~0.5 in the same run, so a cross-type bar would draw
   every medicine as a stub.

2. **Possible Conditions and Findings are different things and must never
   merge.** `finding` **intents** are the engine's output → *Possible
   Conditions* (violet, `ConditionsCard`). `finding` **observables** are what the
   doctor saw on examination → *Findings (On Examination)* (teal, `PickerCard`).
   Different tables, opposite directions of travel. Sharing the word made it look
   as though the system had examined the patient. The Possible Conditions card
   carries a permanent line saying it reads from symptoms, findings *and*
   measurements — because a doctor who assumed otherwise would be reading a list
   that silently included their BP reading.

3. **Every output category has a manual search.** The ranking decides what is
   *offered*; it must never decide what is *reachable*. A category with no search
   box also throws away the `searched_accepted` signal, which is what teaches the
   doctor-local rule layer that the ranking **missed**. Medicine had this; the
   other five now do, through `IntentSearch`. An out-of-list pick computes and
   renders its guard verdict at full strength — reachable, never silent.

### 5.3 The facility profile — `features/synapse/specialtyProfile.ts` (175 lines)

The one place a specialty is expressed. It decides **two** things and cannot
touch a score, a rank, or which intents exist:

| Profile | Primary slot | Measurements visible by default |
|---|---|---|
| `general_opd` (default) | Medicines | BP · Pulse · SpO₂ · Temp · Body Weight |
| `physiotherapy` | Exercise Plans | Pain · Range of Motion · BP · Pulse · Body Weight |
| `diagnostics` | Investigations | BP · Pulse · SpO₂ · Temp · Weight · Height · Blood Group |

Set **once at onboarding, per facility**; never relearned at runtime and never
derived from what the doctor happens to prescribe. Field *order* is never taken
from here — fields always render in catalogue order, so the layout is identical
for every facility. `profileFor()` is the single read point.

**Still unresolved:** `hospitals` has no column for this, so
`PROFILE_BY_FACILITY` is a hand-maintained map (empty = everyone on General OPD).
That missing column now blocks two settings rather than one.

### 5.4 Measurements — the catalogue and progressive relevance

`measures.ts` declares nine fields with their label, unit, input kind
(`number` | `bp` | `select`) and warning range. `Vitals` (`src/types.ts`) keeps
its five original keys **required** — `visits.vitals` jsonb has been written with
exactly those since the first release — and everything added since is optional.

Which fields a doctor sees is the union of three sources, and nothing ever
removes a field:

1. the facility profile (§5.3);
2. **the chart** — a field the entered symptoms have made relevant;
3. the doctor — anything added by hand from *Add Measurement*, plus anything
   that already holds a value.

**Progressive relevance** is a static map, `RELEVANT_FIELDS`, keyed on **signal
ids** rather than chip labels. It is still a static mapping — nothing is computed
or learned, no entropy or discriminator logic — but a chip-label map would have
to name all 374 chips and go stale the day the catalogue grows, while the ~280
signals are the stable vocabulary those chips already collapse into. "Fever",
"Fever with rash" and बुखार all emit `FEVER`, so one row covers every spelling in
every language. Ticking Fever surfaces Temperature; a knee complaint surfaces
Pain and Range of Motion.

The visual treatment is deliberately minimal: a hairline blue ring and a small
`+` beside the label, weaker than the amber out-of-range state, and it stops the
moment a value is entered. No card, no badge, no sentence addressed to the
doctor.

### 5.5 The explanation view

Every `ScoredIntent` has always carried `contributors` — which signals pushed it
up and by how much, largest first. It had no way to reach a doctor until now.
`ContributionSheet` renders it behind an `i` button or a double-click on any
ranked row, in any of the three ranked cards.

Three rules encoded in it:

- **Not shown by default** — a reason beside every row turns a decision surface
  into a reading surface.
- **Cumulative, never causal** — a *stack* of contributors with the count in the
  heading ("3 things on this chart contribute to it"), never an arrow from one
  input to one output. A single-contributor intent says so in words.
- **No scores** — bars are proportions of the largest contributor *in that
  intent*, labelled as comparing the inputs with each other, not as likelihood.
  A negative contributor is shown, in amber, marked "argues against"; hiding that
  half would make the panel a sales pitch.

---

## 6. Data model, from Cortex's side

| Table | Rows | Cortex's relationship |
|---|---|---|
| `patients` | 8 | create, lookup by phone, search. |
| `visits` | 57 | creates one per consult; updates status via `saveConsult` and `ActiveConsultGuard`. Writes `vitals` (jsonb) at save. |
| ★ `observables` | 374 | **the catalogue** — every pickable symptom / finding / history chip, `kind`-split. Read once per session. Front Desk's intake reads it too, through a separate alias layer. |
| `observable_signals` | 503 | chip → signal. |
| `signals` | 281 | the engine's vocabulary + `idf_weight`. |
| `measurement_rules` | 29 | threshold → signal. |
| `intents` | 652 | every possible output. |
| `signal_intent_rules` | 1,099 | **the knowledge base**. |
| `intent_guards` | 14 | 9 hard, 5 soft, 0 hiding. |
| `intent_classes` / `intent_class_map` | 6 / 71 | grouping, for gating only. |
| `intent_companions` | 26 | intent → companion intent, authored, global. |
| ★ `visit_observations` | 52 | the permanent, engine-shaped record of what was on the chart. |
| ★ `visit_measurements` | 45 | same, for numbers. **`value_text` is now written** for blood group. |
| ★ `decision_log` | 23 | the learning write, gated on a real identity. |
| `clinic_brand_preference` | 0 | the clinic-wide declared brand default, set from `BrandSheet`. |
| `doctor_signal_intent_rules` | 0 | the per-doctor learned overlay, applied by `loadRuleset(…, doctorId)`. |
| `v_doctor_preference` / `_brand_preference` / `_frequent_medicine` | views | the three personalisation models. |
| `visit_symptoms` / `visit_findings` | 78 / 16 | **still written**, as a compatibility bridge only. |
| `symptoms` / `findings` | 51 / 0 | **no longer read by Cortex.** Front Desk still reads `symptoms`. |
| `symptom_observable_map` / `finding_observable_map` | 52 / 27 | the bridge between the two catalogues. |
| `prescriptions` / `prescription_medicines` / `diagnostic_orders` | — | insert at save. |
| `medicines`, `compositions`, `medicine_composition_map` | — | read **only** through the `composition_brands` RPC, never directly from a component. |
| `doctors`, `hospitals` | 6 / 11 | letterhead; `doctors.last_seen` written by the 30 s heartbeat. |

**Hydration pattern:** unchanged — no SQL joins for the big reads; fetch parents
then `IN (…)` the children and aggregate in memory.

**RPC surface:** exactly two — `composition_brands` (SQL, invoker, reads only the
`mv_composition_brand` matview) and `search_intents` (SQL, **security definer**).

---

## 7. What is left in `src/components/`

The Mock 2 rebuild emptied most of this directory into `features/consult/`. What
remains is either shared with Front Desk or genuinely global.

| File | Lines | Style | What it does |
|---|---|---|---|
| `ReviewModal.tsx` | 733 | Tailwind | The one shared review/print surface (§8). |
| `PatientHeader.tsx` | 402 | `.tb-*` | Patient identity, doctor pill, past-visit rail. **The vitals strip is gone** — it duplicated the Measurements card, and two renderings of one number is how a consultation ends up with two different numbers. |
| `PatientModal.tsx` | 277 | CSS classes | Patient search / create. Opens on mount. |
| `ActiveConsultGuard.tsx` | 237 | Tailwind | Refer / draft / discard. |
| `MedicineInspector.tsx` | 181 | `.mi-*` | The deeper per-medicine editor, one button from the Plan's inline dose editor. |
| `GlobalLogoTrigger.tsx` | 103 | inline | The always-clickable logo mirror (§9). |
| `ShortcutsSheet.tsx` | 99 | `cx-keys-*` | The keyboard reference. |
| `WorkspaceHeader.tsx` | 60 | `.ws-*` | |
| `ComingSoonPage.tsx` | 32 | CSS classes | |
| `ActionButton.tsx` | 15 | CSS classes | |

**Deleted across the two rebuilds:** `ChipSearchPanel`, `FindingsPanel`,
`PreviewPanel`, `SelectedMedicinesBar`, `Tag`, `ChartPanel`, `ContextBar`,
`PlanPanel`, `features/synapse/SuggestionsPanel`, `features/synapse/SynapseStyles`,
`utils/filter.ts`.

### 7.1 Feature pages

Unchanged: `patients/` is the only built one (`PatientsPage` → `PatientsList` +
`PatientRecord`, 1,790 lines). The seven other folders
(`prescriptions` / `investigations` / `communication` / `practice` / `clinic` /
`settings` / `support`) are **still 0-byte stubs** — verified this pass.

---

## 8. `ReviewModal` — the one shared surface

Unchanged. `src/components/ReviewModal.tsx`, used by both workspaces via
`mode="review"` / `mode="print"`. Still not forked. Still renders a hidden
`PrescriptionDocument` for `react-to-print`. It receives
`prescription: PrescriptionMedicine[]` and has no idea those lines now carry
`intent_id` / `via_search` / `overridden` provenance for the decision log to read.

**It has not caught up with the new measurements.** It renders BP, Pulse, Temp,
SpO₂ and Weight only — height, blood group, pain and ROM are recorded and saved
but do not print. See §10.6.

---

## 9. Overlay & stacking doctrine

Unchanged. All dropdowns and sheets render through `createPortal` to
`document.body`; stacking is decided by DOM position, not z-index.
`GlobalLogoTrigger` is an invisible click target that mirrors wherever the real
logo is, living outside every header's stacking context so it stays clickable
under any overlay. Consult-only overlays are force-closed in
`handleSidebarNavigate`.

Four portal surfaces now: `PickerCard`'s dropdown, `BrowseSheet`, `BrandSheet`,
★ `ContributionSheet`.

---

## 10. Known defects, gaps, and debt (re-audited 2026-07-30)

### 10.1 🔴 Cortex is disconnected from the reception queue

Still true, still unfixed, still the single biggest architectural gap.
`fetchTodayVisits` / `markVisitServing` / `fetchDraftVisits` /
`fetchVisitWithDetails` are imported by **zero** Cortex files — verified this
pass. Every consult start calls `createVisit` unconditionally (`App.tsx:503`,
`App.tsx:768`), minting a new visit and token even when the patient is already
`waiting` in the queue.

### 10.2 🟠 Boot is still all-or-nothing

A failed `fetchDoctor` / `fetchHospital` shows a toast and leaves the splash on
screen forever. No retry, no error state.

### 10.3 🟠 Hardcoded identity fallback

`DOCTOR_ID` / `HOSPITAL_ID` (`lib/db/reference.ts`) remain the fallback when a
signed-in account has no `doctors` row. It no longer risks corrupting another
doctor's model — `useSynapse` and `commitConsultation` both check
`identity.isReal` — but affected accounts get **no personalisation and no
learning**, and nothing in the UI tells them why. The `StatusBar` shows
`degraded` for a *failed* load, not for this.

### 10.4 🟠 `workspace.css` is 2,794 lines for 24 classes

The `cx-*` stylesheet from the deleted three-column workspace is still imported
in `main.tsx`. **173 `cx-` classes are defined; 24 are still referenced** — by
`BrandSheet` (`cx-sheet*`, `cx-brandrow*`, `cx-tag`, `cx-cap`), `BrowseSheet`
(`cx-browse*`), `ShortcutsSheet` (`cx-keys*`) and one `data-cx-planline` hook in
`PlanCard`. Roughly 149 dead classes. The fix is to move those four survivors
into `consult.css` as `cs-*` and delete the file, which is a presentation
decision rather than a mechanical one — the sheets would need restyling to match.

### 10.5 🟡 Pins are localStorage-only

`usePinnedMedicines.ts` is the single read/write point. No table exists; a
`doctor_pinned_intent (doctor_id, intent_id)` table would make pins follow the
doctor between machines.

### 10.6 🟡 The print does not carry the new measurements

`ReviewModal` and `PrescriptionDocument` render five vitals. Height, blood group,
pain score and range of motion are entered, fed to the engine where a rule exists,
and saved — but never printed. A physiotherapy prescription that omits the pain
score it was written from is the case that will surface this.

### 10.7 🟡 `App.tsx` is now 1,586 lines

Up from 999. The rebuild moved rendering out and state in. The intelligence layer
is cleanly separated into hooks and the screen into `features/consult/`, which
makes `App.tsx` more splittable than it has ever been — the obvious seam is a
`useConsult()` hook owning patient / visit / chart / prescription / accepted-intent
state, leaving `App.tsx` as routing plus overlays.

### 10.8 🟡 Two tables have RLS disabled

Supabase's advisor flags `public.prescription_counters` and
`public.visit_attachments` as readable and writable by anyone holding the anon
key. Both are empty today. Enabling RLS without writing policies first would
black both tables out, so this needs one change that does both.

### 10.9 🟢 Fixed since the last survey

- ~~`PreviewPanel` lost its search box; `testsSearchRef` is a dead ref~~ —
  `PreviewPanel` is deleted and the ref is gone. Tests now have a real search
  entry point (§5.2).
- ~~Alt+M dispatches `aren:toggle-favourites` and nothing listens~~ — gone from
  `useConsultKeyboard.ts`.
- ~~A fourth styling vocabulary (`SynapseStyles.tsx`)~~ — deleted; see §12.
- ~~`components-picks.css` / `components-medicines.css` / `components-bar.css`
  orphaned~~ — all three deleted; `components-panels.css` trimmed to 64 lines.
- ~~Clicking a searched medicine fails to fetch its product~~ — **fixed this
  pass.** Only the ranked list had brands in hand; every other route into an
  accept passed `medicine: null`, and the accept path read that as "this molecule
  has no product in the catalogue", showing "…has no single-molecule brand" on
  drugs with hundreds of brands and silently un-accepting the intent. `App.tsx`
  now resolves the product on demand for every route in. **This was never an RLS
  problem** — `medicine_composition_map` and `compositions` both have working
  `read_all` policies, and `composition_brands` was verified working over REST
  with the plain anon key.
- ~~Medicine Recommendations and Clinical Suggestions leave dead space above
  "Show more"~~ — both columns now share `--cs-engine-h` (540 px) and scroll
  internally. Measured at 540/540.
- ~~Search cannot reach non-medicine categories~~ — all six, through
  `IntentSearch`.
- ~~Out-of-list picks reach a guarded intent silently~~ — `IntentSearchResults`
  computes `guardIntent()` for every hit and renders it at full strength.

---

## 11. What changed since the 2026-07-28 edition

Two passes, folded together.

### 11a. The Mock 2 consult rebuild (2026-07-29)

**Deleted:** the entire three-column Chart · Synapse · Plan workspace —
`ChartPanel`, `ContextBar`, `PlanPanel`, `features/synapse/SuggestionsPanel`,
`features/synapse/SynapseStyles`, plus the already-dead `ChipSearchPanel`,
`FindingsPanel`, `PreviewPanel`, `SelectedMedicinesBar`, `Tag`,
`utils/filter.ts`. Stylesheets `components-medicines.css`,
`components-picks.css` and `components-bar.css` went with them.

**Added:** `src/features/consult/` and `src/styles/consult.css` (`cs-` prefix) —
picker cards, measurements, recommendations, suggestions, plan, status bar, the
manual pin, the shared `parts.tsx` vocabulary.

**Behaviourally:** the vitals strip left `PatientHeader` (it duplicated
Measurements); the dose editor moved inline onto the Plan line, with
`MedicineInspector` one button away rather than opening on every accept; the
heart became a manual pin that reorders the view without touching a score.

### 11b. Conditions, search, explanation, measurements (2026-07-30)

**Added:** `features/consult/ConditionsCard.tsx`, `IntentSearch.tsx`,
`ContributionSheet.tsx`, `measures.ts`; `docs/confirmed-conditions-investigation.md`.

**Changed:**
- `finding` intents left Clinical Suggestions and became **Possible Conditions**,
  a fourth card in the entry band, violet, with its own search and its own
  honesty line. `SuggestionsCard`'s `SECTIONS` lost `finding`.
- The two ranked columns got a shared fixed height and independent scroll.
- Manual search reached all six categories, and out-of-list picks now carry their
  guard verdict.
- `Vitals` gained `height`, `bloodGroup`, `painVas`, `romPct` (all optional);
  `MeasurementRow.value` became nullable with an optional `text`;
  `buildEngineInput` filters text rows out of the engine; `persistVisitInput`
  writes `value_text`.
- `SpecialtyProfile` gained `measurements`.
- The medicine accept path resolves its own brand (§10.9).

**Not touched:** the engine (`lib/synapse/*.ts` is byte-identical apart from
`consultInput.ts`), the reception-queue disconnect, `ReviewModal` /
`PrescriptionDocument`, the overlay doctrine, Front Desk, auth.

---

## 12. The styling system — read this before touching any Cortex UI

Three vocabularies, down from four, and the split is now by *area* rather than by
accident:

| # | Vocabulary | Status |
|---|---|---|
| 1 | **`styles/consult.css` — `cs-*`** (2,180 lines, 136 classes) | ★ **The consult screen.** Plain global CSS, class selectors only. All new consult UI goes here. |
| 2 | `styles/workspace.css` — `cx-*` (2,794 lines, 173 classes) | The deleted three-column workspace. **24 classes still live** — three sheets and one selector hook. See §10.4. |
| 3 | Legacy global stylesheets | The topbar (`layout.css` `.tb-*`), modals (`components-modals.css`), past-visit, workspace-header, sidebar, `features/patients/*.css` (7 files). |

Tailwind islands (`ReviewModal`, `ActiveConsultGuard`, `PrintFormatSelector`) are
unchanged and still out of scope.

Ten stylesheets are imported in `main.tsx`: `styles.css`, `base.css`,
`layout.css`, `components-base.css`, `components-panels.css`,
`components-modals.css`, `past-visit.css`, `workspace-header.css`,
`workspace.css`, `consult.css`, plus `features/sidebar/sidebar.css`.

### 12.1 The consult palette

`consult.css` declares its own `:root` block rather than reading `base.css`'s
tokens, so the screen is self-contained and the two cannot drift into each other:

```css
--cs-page: #f4f6fa     --cs-ink: #0b1733     --cs-blue: #1268e8    --cs-teal: #0f766e
--cs-card: #ffffff     --cs-muted: #64748b   --cs-rose: #e11d48    --cs-amber: #b45309
--cs-line: #e7ecf3     --cs-faint: #94a3b8   --cs-red: #b42318     --cs-violet: #7c3aed
--cs-line-strong: #dbe2ec                    --cs-green: #16a34a
--cs-radius: 14px      --cs-radius-sm: 9px   --cs-engine-h: 540px
```

**Colour carries meaning only, never brand and never mood:** blue = the action ·
rose = reported · teal = examined · violet = the engine's reading · amber = soft
guard · red = hard guard · green = taken.

### 12.2 The layer trap — unchanged, still load-bearing

`base.css` styles raw `input` / `select` / `textarea` / `label` / `h2` / `h3`
globally and **unlayered**; unlayered CSS beats Tailwind's layered utilities
regardless of specificity. This is why `consult.css` is plain CSS and not
Tailwind. Re-layering `src/styles/` remains deliberately deferred.

### 12.3 Other conventions

Desktop-only (`min-width: 1120px`); breakpoints at 1500 px (the entry band goes
2×2), 1400 px and 1180 px (everything stacks and `.cs-engine` drops its fixed
height). All dropdowns via `createPortal`. Custom 6 px scrollbars. Not localized
on the doctor's side — the Hindi layer is Front Desk's intake and the shared
`observable_alias` table. Own `.toast` state, not the app-wide `sonner` Toaster.
A `prefers-reduced-motion` block disables the transitions.

---

## 13. Where do I change X?

| I want to change… | Open |
|---|---|
| Any consult state, effect, or handler | `src/App.tsx` |
| **Anything about how the consult screen LOOKS** | `src/styles/consult.css` (`cs-*`) — never a legacy stylesheet |
| The four-card entry band / the two-column engine row / column heights | `styles/consult.css` → `.cs-pickers`, `.cs-engine`, `--cs-engine-h` |
| Symptom / finding / history entry, fuzzy search, browse-all | `features/consult/PickerCard.tsx` (`rankOf` is the 5-tier matcher) + `BrowseSheet.tsx` |
| **Possible Conditions** — the engine's reading | `features/consult/ConditionsCard.tsx` |
| Which measurement fields exist at all | `features/consult/measures.ts` → `MEASURE_FIELDS` |
| Which measurements a facility shows by default | `features/synapse/specialtyProfile.ts` → `measurements` |
| Which symptom surfaces which measurement | `features/consult/measures.ts` → `RELEVANT_FIELDS` (keyed on signal id) |
| Which intent type gets the Primary Recommendation slot | `features/synapse/specialtyProfile.ts` → `primary` |
| Suggestion sections, order, per-section caps | `features/consult/SuggestionsCard.tsx` (`SECTIONS`, `CAP`) |
| The medicine card / which brands show inline | `features/consult/RecommendationsCard.tsx` (`INLINE_ALTS`, `CAP`) |
| The manual search on any category | `features/consult/IntentSearch.tsx` — **the one place**, don't fork it |
| The "why did this rank" panel | `features/consult/ContributionSheet.tsx` |
| The prescription, dose / frequency / duration / SOS editing | `features/consult/PlanCard.tsx` (`DoseEditor`) |
| Frequency ⇄ dose-slot conversion (M/A/E/N) | `lib/db/reference.ts` — `freqLabelToKeys` / `keysToFreqLabel`. **The slot string is canonical; never parse the human label.** |
| Keyboard shortcuts | `hooks/useConsultKeyboard.ts` + `components/ShortcutsSheet.tsx` (keep both in step) |
| Ranking, guards, personalisation, brands, companions — the MATH | `src/lib/synapse/*.ts` (pure, no I/O — safe to unit-test) |
| Vitals → engine measurements (BP split, °F→°C, age, text values) | `lib/synapse/consultInput.ts` — **the one place** |
| Loading the ruleset / catalogue / preference models | `src/lib/db/synapse.ts` |
| Per-consult ranking wiring (React side) | `src/hooks/useConsultIntelligence.ts` |
| Which doctor / clinic is signed in | `src/hooks/useClinicalIdentity.ts` |
| What saving a consult writes | `lib/db/intelligence.ts` → `saveConsult` |
| The learning write | `lib/db/synapse.ts` → `commitConsultation` |
| The topbar / past-visit rail | `components/PatientHeader.tsx` + `styles/layout.css` (`.tb-*`) |
| The prescription document itself | `features/prescription/PrescriptionDocument.tsx` |
| The review/print surface | `components/ReviewModal.tsx` |
| Sidebar nav entries | `features/sidebar/SidebarNav.tsx` (`items` array) |
| A new Cortex feature page | Fill the 0-byte stub, add to `SidebarNav.items`, add a branch in `App.tsx`'s render, add meta to `COMING_SOON_META` |
| Body-system order / labels | `lib/synapse/systems.ts` — **the one place** |
| A DB query | `lib/db/{reference,patients,intelligence,prescriptions,synapse}.ts` — **never** `lib/db.ts` (barrel only) |

---

## 14. Standing rules for Cortex work

1. **Read the current file before editing.** Verify with grep that a previous
   edit actually landed — do not assume.
2. **All DB calls go in `src/lib/db/*`.** `db.ts` is a barrel; never add
   functions there. Zero known violations.
3. **Symptoms, findings and history are structured entities from `observables`.**
   Never free text. Front Desk's `symptoms` table is a *separate*, v1 catalogue
   Cortex does not read.
4. **The engine (`lib/synapse/*.ts`) is pure.** No Supabase import, no React
   import, ever. If a change needs either, it belongs in `lib/db/synapse.ts` or a
   hook.
5. **Learning-loop and compatibility-write failures are non-fatal.** Always
   `.catch()`.
6. **Never redefine an existing CSS class** — check first. `consult.css` owns
   everything under `cs-`.
7. **Do not convert a component between styling vocabularies** without an
   explicit decision (§12).
8. **Dropdown overlays use `createPortal`.** Stacking is fixed by DOM position,
   not z-index.
9. **One prescription renderer, one review surface.** Don't fork
   `PrescriptionDocument` or `ReviewModal`.
10. **One manual search.** Don't fork `IntentSearch` for a new category — give it
    a `types` array.
11. **No guard ever hides a suggestion.** A `warn_hard` intent is shown, at its
    real rank, in red, prescribable only after acknowledgement — and anything
    reached by search must compute and render the same verdict.
12. **Never print a score.** Proportional bars and relevance words only.
13. **Ranking is "re-rank by habit", not "recommend by clinical truth."**
14. **Add zero new `tsc` errors.** `tsc -b` and `npm run build` both pass clean;
    treat any new error as a regression.
15. **Targeted edits only** — never silently rewrite a whole file.
16. **Never persist an alias, a search term, or a v1 name into a visit record.**
    The canonical identity of anything on the chart is its `observable.id`.
17. Anmol is non-technical: literal, copy-paste-ready instructions; text and code
    in chat, no diagrams or HTML.

---

## 15. Further reading

- `aren-technical-atlas.md` — the whole-repo map (both workspaces, auth, data
  layer, Front Desk's intake-alias layer over the shared `observables` table).
- `aren-architecture-handoff.md` — product philosophy, the Visit object,
  Universal Cortex, Solo Mode. Read for *why*.
- `Aren cortex visual philosophy.md` + `Aren Cortex Mock 2.png` — the layout law
  the consult screen is built to. "Configure, never redesign."
- `aren-cortex-workspace-design.md` / `aren-cortex-redesign-plan.md` — the
  2026-07-28 three-column redesign. **Historical only** — that workspace is
  deleted.
- `confirmed-conditions-investigation.md` — the open design question: making a
  confirmed condition a durable patient fact. Findings and a proposal; not built.
- `referance (synapsev2)/Synapse v2 handoff .md` — the sandbox-side doctrine for
  the engine itself: the guard philosophy (§14 there), the personalisation model
  (§10a there), the migration checklist this port followed. **Read before
  changing anything under `lib/synapse/`.**
- `Coretx File Str.md` — Session 31. Historical only.

*End. Update this document when the consult screen changes shape again — at
minimum §5 (the screen), §10 (defects), §11 (the diff) and §13 (where-do-I-change-X).*
