# AREN CORTEX — TECHNICAL ATLAS

*The doctor-facing half of the product, read from the code itself.*

Surveyed: 2026-07-28 · Branch `master` · Commit `c3c4a51`
Scope: **Cortex only.** Everything under `src/features/frontdesk/` (the reception
suite) is deliberately out of scope — see `aren-technical-atlas.md` §4.6 for that,
except where Front Desk shares a table with Cortex (the catalogue, §4a) — those
crossings are called out explicitly.

Purpose: this is the **source of truth going into a UI redesign**. The previous
survey (2026-07-21) described a Cortex still wired to a v1 edge function and a
mock test catalogue. Since then the Synapse v2 engine went live, the picking
catalogue moved from two hand-maintained tables to the engine's own vocabulary,
and every dead v1 code path was removed — `tsc -b` and `npm run build` now both
pass clean, for the first time. Every claim below was verified this pass by
reading the file, running `tsc`, running the production build, or querying the
live database. §11 lists what changed since the 2026-07-21 survey, so a reader
who only remembers that version can jump straight to the diff.

---

## 1. What Cortex is

The doctor's clinical workspace. One patient at a time, one screen, one output:
a prescription. Per `aren-architecture-handoff.md` ("Consult"), its
responsibilities are exactly: open patient · review history · record findings ·
add diagnosis · select medicines · order investigations · generate prescription ·
complete consultation. **Nothing else** — the doctor never manages a queue by
hand.

There is **one** Cortex for all specialties ("Universal Cortex"): specialty is a
data lens over a shared consultation engine, not a separate app.

**What changed fundamentally this pass:** Cortex's ranking used to be a POST to a
Supabase Edge Function whose source was not in this repo. It is now the
**Synapse v2 engine** — a pure, client-side scoring function over a ruleset
loaded once at boot. Ranking is synchronous: the suggestion list re-orders in the
same frame a chip lands, with no network round-trip and no debounce on the
ranking itself. See §4.

### Where it lives

| Thing | Path |
|---|---|
| Route | `/app/cortex` (`src/main.tsx`, behind `RequireAuth` + `RequireRole allow={["doctor"]}`) |
| Root component | `src/App.tsx` (999 lines) |
| Consult panels | `src/components/*.tsx` |
| ★ The engine (pure, no React, no Supabase) | `src/lib/synapse/*.ts` |
| ★ The engine's Supabase boundary | `src/lib/db/synapse.ts` (818 lines — the biggest data file in Cortex) |
| ★ The suggestions UI | `src/features/synapse/*.tsx` |
| ★ Engine-loading + per-consult ranking hooks | `src/hooks/{useSynapse,useConsultIntelligence,useClinicalIdentity}.ts` |
| Internal pages | `src/features/{patients,prescriptions,investigations,communication,practice,clinic,settings,support}/` |
| Internal nav | `src/features/sidebar/` |
| Prescription renderer | `src/features/prescription/` (shared with Print RX) |
| Legacy data (save + v1 hydration only) | `src/lib/db/{reference,patients,intelligence}.ts` |
| Styling | `src/styles/*.css` (unlayered, global) |

Cortex is **not** a router. `App.tsx` swaps "sidebar pages" in local state
(`activePage: SidebarPage | null`) without touching the URL. `activePage === null`
means *the consult workspace*; anything else is a feature page.

---

## 2. `App.tsx` — the whole workspace in one component

Still the single most important file in Cortex and still the single biggest
liability, though it lost roughly 250 lines of v1 wiring this pass (learning
loop, snapshots, favourites, frequent picks) and gained the Synapse plumbing.
950 → 999 lines net, but the composition changed more than the length suggests.

### 2.1 State inventory (all `useState` in one component)

**Reference data** — `dbReady`, `doctorProfile`, `hospitalProfile`.
`allSymptoms`/`allFindings` **are gone** — the catalogue now comes from
`useSynapse().data.observables`, not a boot-time fetch into local state (§4.1).

**The consult** — `patient`, `visitId`, `vitals`, `selectedSymptoms` (string
**labels**, now observable labels not v1 symptom names), `selectedSymptomsWithIntensity`
(`SelectedSymptom[]`), `selectedFindings` (string labels), `prescription`
(`PrescriptionMedicine[]`), `selectedMedicineId`, `selectedTests` (string names).
`selectedLab` **is gone** (§10.6 in the old doc — the mock lab selector was
deleted with the mock test catalogue).

**The intelligence layer — completely new shape.** `acceptedIntents`
(`Map<number, AcceptPayload>` — the doctor's actual decisions, keyed by the
engine's own intent id), `chosenBrands` (`Map<intentId, medicineId>`),
`searchedAccepts` (`SearchedAccept[]`, for intents reached by search rather than
the ranked list). **Gone entirely:** `rankedMedicines`, `rankedCompositionIds`,
`rankLoading`, `frequentPicks`, `picksLoading`, `activeTagIds`, `favouriteIds`,
`favouritePicks`, `lastSnapshot`, `recentSnapshots`. There is no favourites
feature and no clinical-snapshot feature any more — see §11.

**UI / overlays** — unchanged: `stagedMedicine`, `toast`, `repeatRxBanner`,
`patientModalOpen` (starts `true`), `activeConsultGuardOpen`, `isReviewOpen`,
`isSaving`, `sidebarOpen`, `activePage`, plus `followUpDays`/`adviceNotes`.

One debounce ref (`rankTimer`, 300 ms — repurposed, see §2.2) and five DOM refs
(`logoRef` + four panel search inputs; `testsSearchRef` is now unused since
`PreviewPanel` lost its search box, see §10.1).

**Derived values, computed with `useMemo` rather than held in state** (new this
pass): `symptomObservables`, `findingObservables`, `observableByLabel`,
`symptomNames`, `symptomMeta`, `findingsAsDb`, `chartObservableIds`, `ageYears`.
These exist because the catalogue is now a single `observables` table split by
`kind`, and everything downstream — the two picker panels, the engine input, the
legacy compatibility write — is a filter or lookup over it, not a separate fetch.

> **The old warning about string-typed state is now partly resolved.** Symptoms
> and findings are still held as display **labels** (`string[]`), but the
> conversion to what matters — engine observable ids — happens in exactly one
> place (`chartObservableIds`, a `useMemo`), not scattered across three
> `.find()` calls at render time the way `symptomNameToId`/`findingNameToId`
> used to be. The v1 runtime bug this caused (§10.2 in the old doc,
> `selectedFindings.map(f => f.id)` on a string array) is gone — it went with
> the whole learning-loop code path it belonged to.

### 2.2 Effects

1. **Boot** (`[]`, gated on `identity.ready`) — now just **two** calls:
   `fetchDoctor`, `fetchHospital`. Sets `dbReady`. `fetchSymptoms`/`fetchFindings`
   are gone from here — the catalogue loads inside `useSynapse()`, a separate
   hook with its own status machine (§4.1), not this effect. Still true: no
   error state, only a toast; a failed boot leaves the splash on screen forever
   (§10.3 below — unchanged).
2. **The v1 compatibility write** (300 ms debounce, `rankTimer` — same ref, new
   job) — on every chart change, writes `visit_symptoms`/`visit_findings` for
   whichever selected chips *have a legacy row* (via `symptomOf`/`findingOf`
   maps loaded in `useSynapse`). This used to also trigger the ranking POST;
   ranking is synchronous now and needs no debounce of its own — see §4.2. This
   effect is explicitly a bridge and is commented as dying with the v1 teardown.

Everything the old §2.2 called "Frequent picks" (500 ms debounce, inline
`symptom_tag_map` query) **is gone** — deleted whole, including the one inline
Supabase call that lived directly in `App.tsx` (old §10.8's documented rule
violation no longer exists).

### 2.3 Render branches

Unchanged in shape:

```
!dbReady                      → boot splash
activePage === "patients"     → features/patients/PatientsPage
activePage === anything else  → components/ComingSoonPage (title/subtitle from COMING_SOON_META)
activePage === null           → the consult workspace
```

Always rendered regardless of branch: `Sidebar`, `GlobalLogoTrigger`.
Rendered only when `!isFeaturePage`: `PatientHeader`, and the three overlays
(`ActiveConsultGuard`, `PatientModal`, `ReviewModal`) — each guarded *both* by
`!isFeaturePage` and force-closed inside `handleSidebarNavigate`. Both halves
still present; nothing about the overlay doctrine changed this pass (§9).

---

## 3. The consult lifecycle

```
                       ┌─ PatientModal (opens on mount, non-dismissable until a patient exists)
                       │     search by phone → findPatientByPhone
                       │     new patient     → createPatient
                       │
                       ├─ features/patients/PatientRecord "Start Consult"
                       └─→ handlePatientConfirm / handleStartConsultFromRecord
                                    │
                                    ▼
                        createVisit(patientId)          ← ALWAYS creates a NEW visit,
                        status "serving", started_at,     status "serving", new token
                        token = today's max + 1            (still true — §10.4, unchanged)
                                    │
                                    ▼
   ┌──────────────── consult workspace (activePage === null) ────────────────┐
   │  PatientHeader   patient strip · 5 vitals inputs · past-visit rail      │
   │                  (click a chip → PastVisitCard → "Repeat Rx")           │
   │  ChipSearchPanel symptoms — from `observables` (kind=symptom|history)   │
   │      │           idle list = system "general"; Browse all N → 18       │
   │      │           systems; search spans the whole ~300-entry vocabulary  │
   │      ▼           (clinical snapshots feature REMOVED, see §11)          │
   │  FindingsPanel   findings — from `observables` (kind=finding), same     │
   │      │           system browse; shows what's RECORDED, not a probable- │
   │      │           findings RPC ranking (REMOVED, see §11)                │
   │      ├── debounce 300ms → v1 compatibility write (visit_symptoms/       │
   │      │                     visit_findings, only for chips with a v1 row)│
   │      └── SYNCHRONOUS  → useConsultIntelligence runs the engine in-memory│
   │                    │                                                    │
   │                    ▼                                                    │
   │  ★ SuggestionsPanel  (src/features/synapse/) — ranked medicines/tests/  │
   │       impression/plan in tabs, guard warnings with acknowledge-to-      │
   │       prescribe, brand picker (BrandSheet), search-by-symptom, clinic-  │
   │       brand pinning. Replaces MedicineSuggestions + FrequentPicksPanel  │
   │       (both DELETED, see §11).                                          │
   │                    │                                                    │
   │              click Add → handleAcceptIntent → staged/added directly     │
   │              (medicine → prescription line; test → selectedTests;      │
   │               referral/advice/exercise → appendAdvice; finding → no-op) │
   │                    │                                                    │
   │  SelectedMedicinesBar   the assembled prescription                      │
   │  PreviewPanel           now shows ONLY ordered tests — no mock catalogue│
   │                         browse, no lab selector (both REMOVED, §11) —   │
   │                         plus "Review Prescription"                      │
   └─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
                        ReviewModal (mode="review")
                          Edit ── back to workspace
                          Print/Save PDF → PrintFormatSelector → PrescriptionDocument
                          Confirm & Save → handleConfirmAndSave
                                    │
                                    ▼
                        saveConsult()  ── visits.status = "completed" + vitals
                                       ├─ insert prescriptions
                                       ├─ insert prescription_medicines
                                       └─ insert diagnostic_orders
                        then, fire-and-forget (never fatal), ONLY if identity.isReal:
                          commitConsultation()   ★ writes decision_log — the
                                                    real learning write, keyed on
                                                    the SAME EngineResult the
                                                    doctor saw (§4.4)
                        then resetConsultState() → PatientModal reopens
```

`runLearningLoop()` and `logCoprescriptionObservations()` — the two
fire-and-forget calls in the old lifecycle diagram — **are gone**. `saveConsult`
itself is unchanged in shape (still writes `prescriptions` +
`prescription_medicines` + `diagnostic_orders`); what happens after it is
entirely new.

### Interrupting a consult

`ActiveConsultGuard` — unchanged. Opens when the doctor tries to switch patient
mid-consult, writes the visit status directly (`updateVisitStatus`), offers
**Refer** / **Save as draft** / **Discard**. Still the only Cortex component that
mutates a visit outside `saveConsult`.

---

## 4. The intelligence layer — Synapse v2 (replaces the old §4 entirely)

This is the section that changed the most. The old `rank-compositions` edge
function is gone from Cortex's call graph completely; there is no server-side
ranking left to reason about.

### 4.1 Loading the engine — `useSynapse()` (`src/hooks/useSynapse.ts`, 187 lines)

Runs once per session, gated on a **real** identity (`useClinicalIdentity`,
below) being ready. Loads, in parallel:

| What | Function | Fails how |
|---|---|---|
| The ruleset (signals, rules, guards, intent classes) + this doctor's learned rule overlay | `loadSynapseRuleset(doctorId)` | **Hard** — no ruleset, no ranking |
| signalId → human label | `loadSignalLabels()` | Hard |
| The catalogue itself | `fetchObservables()` | Hard |
| Catalogue ↔ legacy symptom/finding id maps | `loadObservableMaps()` | Hard |
| This doctor's clinical preference model | `loadPreferences(doctorId)` | **Soft** — degrades to global ranking |
| This doctor's brand habits | `loadBrandPreferences(doctorId)` | Soft |
| The clinic's declared brand defaults | `loadClinicBrandDefaults(hospitalId)` | Soft |
| This doctor's frequent-medicine shortlist | `loadFrequentMedicines(doctorId)` | Soft |
| Co-prescription companion edges | `loadCompanionEdges()` | Soft |

"Soft" failures set `data.degraded = true` and fall back to an empty model —
personalisation quietly disappears, the ranking itself never does. All four
personal-data loads (preferences, brand prefs, frequent list, and the ruleset's
doctor overlay) are **skipped entirely**, not attempted-then-discarded, when
`identity.isReal` is false — see §4.5. `reload()` is exposed for
recalibration without a page refresh.

`SynapseData` (the hook's return shape) carries: `ruleset`, `signalLabels`,
`observables` (the full catalogue, `Observable[]`), `observableMaps`
(`{ symptomOf, findingOf }` — the legacy-id bridge), `preferences`,
`brandPreferences`, `clinicBrandDefaults`, `frequent`, `companionEdges`,
`signalsWithRules` (a `Set<string>` — which signals can actually produce
output, for calibration), `loadedAt`, `degraded`.

### 4.2 Ranking a chart — `useConsultIntelligence()` (`src/hooks/useConsultIntelligence.ts`, 236 lines)

Takes `{ data, visitId, observableIds, vitals, ageYears, acceptedIntentIds }` and
runs the whole pipeline **synchronously** inside `useMemo`:

```
observableIds + vitals + age
   → buildEngineInput()        (src/lib/synapse/consultInput.ts)
   → runEngine(ruleset, input) (src/lib/synapse/engine.ts)      — pure, no I/O
   → personalize(intents, preferences)                          — reorders only
   → resolveCompanions(...)    if any intents were accepted
   → fetchCompositionBrands()  ASYNC — the only network call, cannot block ranking
```

Returns `{ result, intents, byType, hardWarned, signals, companions, brands,
brandsLoading, brandError, isPediatric, measurements, hasInput }`.
`byType` is `Record<IntentType, PersonalizedIntent[]>` — `medicine | test |
exercise | referral | finding | advice`, the same six types the engine has
always scored.

**Three silent-failure traps live in `buildEngineInput`/`vitalsToMeasurements`**
(`src/lib/synapse/consultInput.ts`) and are exactly why that file exists rather
than inlining the conversion in `App.tsx`:
1. **Blood pressure** — one vitals field (`"140/90"`) must become two
   measurements, `BP_SYS`/`BP_DIA`. Handled by splitting on `/`.
2. **Temperature units** — the vitals UI is Fahrenheit (placeholder "98.6"); the
   rule base is Celsius (`FEVER` fires ≥ 37.8°C). Converted with a magnitude
   heuristic (`toCelsius`), not a UI toggle.
3. **Age** — never typed by the doctor; injected from `patient.age` on every
   run, or `ELDERLY`/`PEDIATRIC` never fire.

### 4.3 Identity — `useClinicalIdentity()` (`src/hooks/useClinicalIdentity.ts`, 65 lines)

One resolver for "which doctor, which clinic", reading `useAuth()`. Returns
`{ doctorId, hospitalId, doctorName, specialization, isReal, ready }`.
`isReal` is `false` when the signed-in account has no `doctors` row — several
active accounts in the live database are in this state (verified this pass).
Falls back to the hardcoded `DOCTOR_ID`/`HOSPITAL_ID` constants
(`lib/db/reference.ts`) only in that case, and everything downstream is built to
notice: no personal data loads, no `decision_log` write, ranking still works
(global evidence is identical for every doctor).

### 4.4 The learning write — `commitConsultation()` (`src/lib/db/synapse.ts`)

Replaces `runLearningLoop` + `logCoprescriptionObservations` with one insert
into `decision_log` at consult close, gated on `identity.isReal`. Records the
**exact** `EngineResult` object the doctor saw on screen (`intelligence.result`
— never re-run), every accepted intent, implicit skips (shown, left untouched,
in a type where something else *was* accepted — never inferred for
safety-critical intents), and distinguishes `accepted` / `searched_accepted`
(reached by search, not the ranked list) / `override_accepted` (a `warn_hard`
intent the doctor acknowledged and prescribed anyway — logged, but **never**
fed back into the preference model, so an override can't teach the system to
promote what a guard is warning about).

### 4.5 Brands, search, and the clinic tier

- **Brands** — `fetchCompositionBrands()` resolves ranked *compositions* to
  actual dispensable products via the `composition_brands` RPC, ordered by:
  this doctor's learned preference → **the clinic's declared default**
  (`clinic_brand_preference` table, new this pass — pinned/unpinned from the
  `BrandSheet` UI, §5) → most-prescribed → catalogue order → alphabetical.
- **Search** — `searchIntents()` calls a new `search_intents` RPC that matches
  by molecule name, brand name, *or the symptom it treats* (typing "fever"
  surfaces paracetamol via the rule base, not string matching). Returns
  `matchKind: 'label' | 'brand' | 'symptom'` and the matched term, so the UI can
  say *why* a result came back.
- **Guards** — unchanged engine behaviour (`warn` / `warn_hard`, never hides an
  intent), but **materially more of them now fire**. Verified this pass: 8 of
  14 active guards were previously unreachable because no Cortex chip could
  produce their signal (pregnancy, cauda equina, dengue, bilateral neuro
  deficit, renal impairment among them) — fixed by §11's catalogue change, not
  by touching the engine.

**Standing rule (carried forward, still true):** ranking is "re-rank by habit",
not "recommend by clinical truth" — complaints about ranking quality get
personalization math, not clinical guardrails baked into the engine. The
knowledge base itself (`signal_intent_rules`, guards) is data, lives in
Supabase, and is out of scope for a UI redesign.

---

## 5. The suggestions UI — `src/features/synapse/` (all new this pass)

| File | Lines | What it does |
|---|---|---|
| `SuggestionsPanel.tsx` | 608 | ★ The main surface. Tabs: Medicines / Tests / Impression / Plan (referral+advice+exercise). Each row shows the intent, its top contributing signals ("why"), a guard flag if warned, a brand picker for medicines. A `warn_hard` row requires an explicit "I understand" acknowledgement before its Add button activates. A dedicated search box spans all intent types via `searchIntents()`. Companions render as a distinct "often prescribed with" strip below the ranked list. |
| `BrandSheet.tsx` | 158 | The brand picker for one ranked composition — a small modal/popover listing dispensable products in `resolveBrands()` order, with a pin/unpin control that writes `clinic_brand_preference` (visible to every doctor at that hospital) separately from this doctor's own learned preference. |
| `SynapseStyles.tsx` | 509 | Scoped CSS for the above two — see §7.1, this is now effectively a **fourth** styling vocabulary alongside the three below, and the redesign needs to decide whether it survives, gets folded into the CSS layer, or becomes Tailwind. |

None of this existed at the 2026-07-21 survey. `MedicineSuggestions.tsx` and
`FrequentPicksPanel.tsx`, which it replaces, are deleted (§11).

---

## 6. Data model, from Cortex's side

Cortex reads and writes:

| Table | Cortex's relationship |
|---|---|
| `patients` | create (`createPatient`), lookup by phone, search. |
| `visits` | creates one per consult (`createVisit`); updates status via `saveConsult` (→ `completed`) and `ActiveConsultGuard` (→ `referred`/`draft`/`discarded`). Writes `vitals` (jsonb) at save time. |
| ★ `observables` | **the catalogue** — every pickable symptom/finding/history chip, `kind`-split. Read once per session via `useSynapse`. Front Desk's intake also reads this table now (with a separate alias layer — out of scope here, see `aren-technical-atlas.md`). |
| ★ `observable_signals`, `measurement_rules`, `signal_intent_rules`, `intent_guards`, `intent_classes`, `signals`, `intents` | the rule base / knowledge base the engine scores against. Never written by Cortex, only read via `loadSynapseRuleset`. |
| ★ `visit_observations` | the permanent, canonical record of what was on the chart — every chip the engine actually saw, by observable id. Written by `useConsultIntelligence`. This is the record that survives the v1 teardown. |
| ★ `decision_log` | the learning write — `commitConsultation()`, gated on a real identity. |
| ★ `clinic_brand_preference` | new table — the clinic-wide declared brand default per composition, set from `BrandSheet`'s pin control. |
| `visit_symptoms` / `visit_findings` | **still written**, but now as a compatibility bridge only — only for chips that have a legacy row, via `symptomOf`/`findingOf` (§2.2). Front Desk, the past-visit rail and existing patient records still read these; this is the path that disappears in the v1 teardown. |
| `symptoms` / `findings` | **no longer read by Cortex.** These are the pre-Synapse catalogue tables (51 / 73 rows); Cortex reads `observables` (~300+ rows) instead. Front Desk still reads `symptoms` for its intake picker. |
| `prescriptions` | insert at save. |
| `prescription_medicines` | insert at save; writes both `composition_ids` (array) and legacy `composition_id`. |
| `diagnostic_orders` | insert at save, `status: "ordered"`. |
| `medicines`, `compositions`, `medicine_composition_map` | read via the brand-resolution RPC (`composition_brands`), not by direct query from Cortex components any more. |
| `doctors`, `hospitals` | read for the prescription letterhead; `doctors.last_seen` written by the heartbeat. |

**Gone from Cortex's relationship list entirely:** `doctor_medicine_bias`
(favourites — feature removed), `composition_coprescription_hints` /
`symptom_tag_map` / `symptom_cluster_test_hints` (v1 hint tables — replaced by
`intent_companions` + the rule base), `coprescription_observations` (write
removed with the learning loop), `clinical_snapshots` + `snapshot_symptoms` /
`snapshot_findings` (feature removed).

**Hydration pattern:** unchanged — no SQL joins for the big reads, fetch
parents then `IN (…)` the children, aggregate in memory.

**Presence:** unchanged. `src/hooks/useDoctorHeartbeat.ts` writes
`doctors.last_seen` every 30 s. Now driven by `useClinicalIdentity()`'s
`identity.doctorId` rather than a raw `auth.identity.doctor?.id ?? DOCTOR_ID`
fallback written inline in `App.tsx` — same effective behaviour, one fewer
place the fallback logic is duplicated.

---

## 7. Component inventory (re-verified 2026-07-28)

> ## ⚠ SUPERSEDED IN PART BY THE 2026-07-28 UI REDESIGN
>
> §7.1, §12 and §13 below were rewritten on 2026-07-28 when the workspace
> redesign landed. **The redesign's own record is
> `docs/aren-cortex-redesign-plan.md` (phase log) and
> `docs/aren-cortex-workspace-design.md` (the spec).** In one paragraph, what
> changed:
>
> The consult workspace is now **three columns — Chart · Synapse · Plan** —
> each a sticky, viewport-height pane that scrolls inside itself, with a
> full-width **ContextBar** above them. `ChipSearchPanel`, `FindingsPanel`,
> `PreviewPanel`, `SelectedMedicinesBar`, `Tag`, `utils/filter.ts` and
> `SynapseStyles.tsx` are **deleted**; `ChartPanel`, `ContextBar`, `PlanPanel`
> and `ShortcutsSheet` are new, and `SuggestionsPanel` was rewritten with **no
> tabs** — every intent type has a permanent section, and medicines render as
> cards headlined by a prescribable **brand** with the composition as subtitle.
> Styling went from **four vocabularies to two**: `styles/workspace.css`
> (`cx-*`, the redesign) plus the surviving legacy stylesheets.
> `components-medicines.css` is deleted and `components-panels.css` is trimmed
> to 60 lines. Read §12 below for the parts that still hold.

### 7.1 Consult panels — `src/components/`

| File | Lines | Style | What it does |
|---|---|---|---|
| `ChipSearchPanel.tsx` | 519 | CSS classes + inline | Symptom/history entry. **Rewired this pass**: reads the `observables` catalogue via an optional `itemMeta` prop (`{system, isCommon}` per label); idle state shows the `general`-system chips, a "Browse all N" door opens all ~18 systems as a grid, search spans everything. **Clinical-snapshot feature fully removed** — no fetch, no snapshot cards, no Ctrl+Z undo (§11). Portal dropdown positioned from a measured `DOMRect`, unchanged. |
| `FindingsPanel.tsx` | 520 | inline + CSS vars | Findings entry. **Rewired this pass**: reads `observables` (kind=finding) the same way; group order now comes from `SYSTEM_LABELS_IN_ORDER` (`lib/synapse/systems.ts`), not a hardcoded 7-name list. **Probable-findings RPC ranking fully removed** — the panel shows what is *recorded*, full stop; the engine's ranked Impression lives in `SuggestionsPanel` now (one pipeline, not two). |
| `Tag.tsx` | 205 | CSS classes + tone vars | The chip primitive. Unchanged. |
| `MedicineInspector.tsx` | 208 | CSS classes | Per-medicine editor — dosage, M/A/E/N slots, duration, notes, SOS. Unchanged. |
| `SelectedMedicinesBar.tsx` | 74 | CSS classes (`.smb-*`) | The assembled prescription as cards. Unchanged. |
| `PreviewPanel.tsx` | 93 (was 174) | CSS classes | **Rewritten.** No longer a Tests & Lab *picker* — it shows only what's already ordered (from `SuggestionsPanel`'s Tests tab or search) as removable tags, plus "Review Prescription". No mock catalogue browse, no search box, no lab `<select>`. |
| `PatientHeader.tsx` | 432 | CSS classes (`.tb-*`) | Unchanged: patient identity, 5 vitals inputs, doctor pill, past-visit rail. |
| `PatientModal.tsx` | 277 | CSS classes | Unchanged. |
| `ActiveConsultGuard.tsx` | 237 | Tailwind | Unchanged. |
| `ReviewModal.tsx` | 733 | Tailwind (245 utilities) | Unchanged — still the one shared review/print surface (§8). |
| `GlobalLogoTrigger.tsx` | 103 | inline | Unchanged. |
| `WorkspaceHeader.tsx` | 60 | CSS classes (`.ws-*`) | Unchanged. |
| `ComingSoonPage.tsx` | 32 | CSS classes | Unchanged. |
| `ActionButton.tsx` | 15 | CSS classes | Unchanged. |

**Deleted this pass, confirmed zero importers:** `MedicineSuggestions.tsx` (260),
`FrequentPicksPanel.tsx` (230), `TestsPanel.tsx` (220, was already dead),
`PrescriptionPanel.tsx` (81, was already dead), `VitalsStrip.tsx` (35, was
already dead). See §11 for what replaced the first two.

### 7.2 Feature pages — `src/features/`

Unchanged from the 2026-07-21 survey: `patients/` is the only built one
(`PatientsPage` → `PatientsList` + `PatientRecord`, still a hardcoded
`PLACEHOLDER_MEDICINES` array in the "commonly prescribed" panel — not touched
this pass). The seven feature-page folders
(`prescriptions/investigations/communication/practice/clinic/settings/support`)
are still 0-byte stubs. `features/sidebar/ComingSoonPage.tsx` — the orphaned
duplicate the old atlas flagged — **is deleted** this pass; `App.tsx` always
imported `components/ComingSoonPage` so nothing changed behaviourally.

### 7.3 Shared prescription pipeline — `src/features/prescription/`

Unchanged. `PrescriptionDocument.tsx`, `PrintFormatSelector.tsx`,
`usePrintFormat.ts` — see the old atlas or `aren-technical-atlas.md` §4.5.

---

## 8. `ReviewModal` — the one shared surface

Unchanged from the previous survey. `src/components/ReviewModal.tsx`, used by
both workspaces via `mode="review"`/`mode="print"`. Still not forked. Still
renders a hidden `PrescriptionDocument` for `react-to-print`. **Not touched by
the Synapse migration** — it receives `prescription: PrescriptionMedicine[]`
same as always; it has no idea the medicines in that array now carry an
`intent_id`/`via_search`/`overridden` provenance (new optional fields on
`PrescriptionMedicine`, `src/types.ts`) for the decision log to read.

---

## 9. Overlay & stacking doctrine

Unchanged. See the previous survey's §9 — nothing about `GlobalLogoTrigger`,
the stacking-context rule, or the force-close pattern was touched this pass.

---

## 10. Known defects, gaps, and debt (re-audited 2026-07-28)

Numbering restarts clean — most of the old §10 was either fixed as a side
effect of the Synapse migration or deleted along with the code it described.
What's left:

### 10.1 🟠 `PreviewPanel` lost its search box; `testsSearchRef` is now a dead ref

`App.tsx` still declares `testsSearchRef` and wires it into
`useConsultKeyboard` (Tab/Shift+Tab panel cycling includes a fourth stop that no
longer focuses anything, since `PreviewPanel` no longer renders a search
`<input>`). Harmless — the keyboard handler is null-safe — but worth deciding
in the redesign: either give tests a real search entry point again (the engine
already supports searching by type via `searchIntents({types:['test']})`, so
this is a UI gap, not a data one) or drop the ref and the cycle stop.

### 10.2 🟠 Alt+M ("toggle favourites") is a dead shortcut

`useConsultKeyboard.ts` still dispatches `window.dispatchEvent(new
CustomEvent("aren:toggle-favourites"))` on Alt+M. Nothing listens for it any
more — `MedicineSuggestions.tsx`, the only component that ever did, is deleted.
Pressing Alt+M in Cortex today does nothing. Either remove the shortcut or
decide favouriting is coming back in the redesign (the underlying learned-brand
and frequent-medicine models already exist in `SynapseData` — see §4.1 — a
"favourite" affordance would be a thin UI layer over `frequent`, not a new
feature).

### 10.3 🔴 Cortex is disconnected from the reception queue (carried forward, unchanged)

Still true, still unfixed, still the single biggest architectural gap.
`fetchTodayVisits`/`markVisitServing`/`fetchDraftVisits`/`fetchVisitWithDetails`
are imported by zero Cortex files. Every consult start calls `createVisit`
unconditionally, minting a new visit + token even when the patient is already
`waiting` in the queue. See the pre-2026-07-21 handoffs for the full "Next
Patient" gap description — nothing here changed it.

### 10.4 🟠 Hardcoded identity fallback still exists, now more consequential

`DOCTOR_ID`/`HOSPITAL_ID` (`lib/db/reference.ts`) are still the fallback inside
`useClinicalIdentity()` when a signed-in account has no `doctors` row. This used
to be silent (the old learning loop wrote under the fallback id regardless).
It is **no longer silent** — `useSynapse`/`commitConsultation` explicitly check
`identity.isReal` and skip personal-data loads and the decision-log write for
such accounts (§4.1, §4.3). So the defect changed shape: it no longer risks
corrupting another doctor's model, but affected accounts get **no
personalisation and no learning** until their `doctors` row is created. Worth
surfacing to the doctor in the UI redesign — right now it fails silently from
their point of view (ranking still works, nothing tells them why suggestions
never adapt to their habits).

### 10.5 🟡 `App.tsx` is still one 999-line component

Unchanged as a structural fact. The Synapse migration added complexity (six new
`useMemo` derivations, the `handleAcceptIntent`/`handleChangeBrand`/
`handlePinClinicBrand` handlers) without reducing the file's role as the sole
owner of all consult state. If the UI redesign touches consult-state shape at
all, this is the moment to consider splitting it — the intelligence layer is
already cleanly separated into hooks (§4), which makes `App.tsx` itself more
splittable than it was at the last survey, not less.

### 10.6 🟡 A fourth styling vocabulary now exists

`src/features/synapse/SynapseStyles.tsx` (509 lines of scoped CSS-in-JS,
`syn-*` class prefix) sits alongside the three vocabularies §11 (old atlas)
described. It was written this way specifically to dodge the Tailwind layer
trap (§12.1) without touching the eleven legacy stylesheets. **This is the
single most relevant fact for a UI redesign** — the suggestions panel's visual
language was authored independently of the rest of Cortex and needs a
deliberate decision, not an incremental one, about whether it becomes the
template for the redesign or gets reconciled into whatever system the redesign
picks.

### 10.7 🟡 Smaller things carried forward, unchanged

- Boot is still all-or-nothing (now a two-call `Promise.all` instead of seven,
  same failure mode).
- `PatientsPage`'s "commonly prescribed" panel is still a hardcoded
  `PLACEHOLDER_MEDICINES` array — untouched by this pass, a real candidate to
  wire to `frequent` (§4.1) in the redesign.
- `FindingsPanel`'s browse-by-category dropdown visual issue (reported Session
  29) was not re-verified this pass.
- Keyboard shortcuts remain undiscoverable in the UI (Ctrl+N, Ctrl+Enter, Alt+M
  — now partly dead, see §10.2 — Tab/Shift+Tab, Esc).

### 10.8 🟢 Fixed this pass, no longer debt

- ~~`tsc -b` blocked, 46 errors~~ — **`tsc -b` and `npm run build` both pass
  clean.** Verified this session with a from-scratch `rm -rf
  node_modules/.tmp && npx tsc -b` and a full `npm run build`. The three files
  responsible (`mockData.ts`, `PreviewPanel.tsx`, `App.tsx`'s finding-id bug)
  are gone or fixed.
- ~~Investigations running on mock data~~ — `mockData.ts` and
  `testsCatalogue.ts` are both deleted; `PreviewPanel` has no catalogue browse
  left to run on mock data.
- ~~Dead code: `TestsPanel`/`PrescriptionPanel`/`VitalsStrip`/orphaned
  `ComingSoonPage`/`rx-modal.css`~~ — all deleted.
- ~~The inline `symptom_tag_map` query inside `App.tsx`, violating "all DB calls
  live in `lib/db/*`"~~ — gone with the frequent-picks feature it served.
- ~~The malformed `findingIds` learning-loop bug~~ — gone with `runLearningLoop`.
- `styles/components-picks.css` (279 lines, `.fp-*`) is now **orphaned CSS** —
  still imported in `main.tsx`, but its only consumer (`FrequentPicksPanel`) is
  deleted. Not removed this pass because deleting a stylesheet import is a
  presentation decision, which this pass deliberately avoided (§13.6 rule
  still applies) — but it is dead weight worth cutting in the redesign.
  Likewise expect dead selectors inside `components-medicines.css` (`.rank`,
  `.match`, `.lib-row`) now that `MedicineSuggestions` is gone.

---

## 11. What changed since the 2026-07-21 survey — the full diff

For a reader who has the old atlas memorized and just needs the delta.

**Added:**
- `src/lib/synapse/` — the pure engine, ported verbatim from the Synapse v2
  sandbox: `engine.ts` (418), `personalize.ts` (132), `brands.ts` (132),
  `companions.ts` (125), plus two AREN-specific additions, `consultInput.ts`
  (143, the vitals/age/BP conversion layer) and `systems.ts` (55, the one
  source of truth for body-system order/labels, used by both picker panels).
- `src/lib/db/synapse.ts` (818 lines) — the entire Supabase boundary for the
  above: ruleset loading, the catalogue (`fetchObservables`), preference/brand/
  companion models, brand resolution, `commitConsultation`, `searchIntents`.
- `src/hooks/useSynapse.ts`, `useConsultIntelligence.ts`, `useClinicalIdentity.ts`.
- `src/features/synapse/` — `SuggestionsPanel.tsx`, `BrandSheet.tsx`,
  `SynapseStyles.tsx`.
- Database: `observable_alias` (Front Desk intake, out of scope here),
  `clinic_brand_preference` (the clinic-wide brand default, read/written from
  Cortex's `BrandSheet`), plus RLS policies and RPC additions
  (`search_intents`) — see `aren-technical-atlas.md` for the full DB-side list.

**Deleted:**
- Components: `MedicineSuggestions.tsx`, `FrequentPicksPanel.tsx`,
  `TestsPanel.tsx`, `PrescriptionPanel.tsx`, `VitalsStrip.tsx`,
  `features/sidebar/ComingSoonPage.tsx`.
- Data: `src/data/mockData.ts`, `src/data/testsCatalogue.ts`.
- Style: `src/styles/rx-modal.css` (was already empty/unimported).
- Features removed outright, not just refactored: **clinical snapshots**
  (bundle-apply-with-Ctrl+Z-undo in `ChipSearchPanel`), **probable-findings
  RPC ranking** (in `FindingsPanel`), **doctor favourites** (star toggle on
  medicines, `doctor_medicine_bias`), **the mock Tests & Lab catalogue browser
  and preferred-lab selector** (in `PreviewPanel`).
- `lib/db/intelligence.ts` trimmed from ~427 lines to 100 — only `saveConsult`
  and its types remain; `rankMedicines`, `runLearningLoop`, `fetchFrequentPicks`,
  `fetchFavouriteMedicines`/`fetchDoctorFavourites`/`toggleFavouriteMedicine`,
  `logCoprescriptionObservations`, `searchMedicinesDB` all removed.
- `lib/db/reference.ts` — `fetchProbableFindings`, `fetchRankedPanels`,
  `fetchSnapshotSuggestions`, `fetchDynamicTests` all removed (all four were
  either the source of a removed feature or, per the old atlas, already
  "written, never called").

**Behaviourally changed:**
- The picking catalogue for **Cortex only** moved from `symptoms`/`findings`
  (51/73 rows) to `observables` (~300+ rows, `kind`-split). Front Desk still
  uses `symptoms` for intake (with its own alias/fuzzy layer — see
  `aren-technical-atlas.md`); the two are bridged by a compatibility write
  (§2.2, §6) until a deliberate v1 teardown.
- Ranking went from an async POST to a real edge function (300 ms debounce, own
  loading state) to a synchronous, in-memory pure function (§4.2). There is no
  `rankLoading` state any more because there is nothing to wait for.
- The learning write went from two fire-and-forget calls to a real edge
  function, to one insert into `decision_log`, gated on identity being real,
  keyed on the exact result the doctor saw.
- 8 of 14 safety guards went from unreachable (no chip could fire their signal)
  to reachable, as a side effect of the catalogue change — not an engine change.
- `npm run build` went from broken (46 `tsc` errors) to passing.

**Not touched:** the reception queue disconnect (§10.3), the styling-vocabulary
split (now four, not three — §10.6), `ReviewModal`/`PrescriptionDocument`, the
overlay/stacking doctrine, Front Desk (except the shared `observables` table
and new `observable_alias`), auth.

---

## 12. The styling system — read this before touching any Cortex UI

> **UPDATED 2026-07-28 — the redesign made this decision, and it is TWO now,
> not four.**
>
> | # | Vocabulary | Status |
> |---|---|---|
> | 1 | **`styles/workspace.css` — `cx-*`** | ★ **The answer.** Plain global CSS, class-based selectors only, in the visual language SynapseStyles.tsx piloted: glass surfaces, hairline dividers, ink-and-grey, colour only for meaning. **All new workspace UI goes here.** |
> | 2 | Legacy global stylesheets | What the redesign has not reached: the topbar (`layout.css` `.tb-*`), modals (`components-modals.css`), past-visit (`past-visit.css`), workspace-header, sidebar, features/patients. |
> | ~~3~~ | ~~Inline `style={{}}` in the pickers~~ | **Gone** — those components are deleted. (`PrescriptionDocument` still uses inline styles, correctly, for print fidelity.) |
> | ~~4~~ | ~~`SynapseStyles.tsx` CSS-in-JS~~ | **Deleted**, folded into `workspace.css` as `cx-*`. |
>
> Tailwind islands (`ReviewModal`, `ActiveConsultGuard`, `PrintFormatSelector`)
> are unchanged and still out of scope.
>
> **Deleted this pass:** `components-medicines.css` (507 lines, 29 of 33
> classes dead), `components-picks.css`, `components-bar.css`.
> **Trimmed:** `components-panels.css` 582 → 60 lines (only the overlay
> backdrop fix and the `.finding-chip*` rules PatientRecord still uses
> survived). `base.css` lost its four dead per-panel focus rules — the focus
> glows live with their panels in `workspace.css` now.
>
> The rest of §12 below is retained for the parts that still hold: the design
> tokens (§12.2, unchanged and read by `cx-*`), the layer trap (§12.3, still
> exactly why `cx-*` is plain CSS and not Tailwind), and the motion/overlay
> conventions (§12.5).

Cortex *used to have* **four** coexisting visual vocabularies. This was
*the* thing the UI redesign had to make a decision about before writing new
code — see the box above for what it decided.

### 12.1 The four vocabularies

**(a) Global unlayered CSS — still the dominant one for the legacy panels.**
Ten stylesheets now (was eleven — `rx-modal.css` deleted), imported in
`src/main.tsx`, all global, none inside a `@layer`:

| File | Lines | Owns |
|---|---|---|
| `styles/base.css` | 189 | **The design tokens** (`:root` vars), reset, typography, raw-element styling for `input/select/textarea/label/h2/h3`. Also `.toast` and per-panel focus glows. |
| `styles/layout.css` | 1223 | `.app-shell`, `.workflow`, `.main-column`, `.two-column-row`, `.medicine-workspace`, `.panel`, the `.tb-*` topbar system. |
| `styles/components-base.css` | 481 | `.chip-panel`, `.search-box`, `.icon-button`, shared atoms. |
| `styles/components-panels.css` | 582 | `.findings-*`, `.finding-chip`. |
| `styles/components-medicines.css` | 507 | `.medicine-suggestion-list`, `.lib-row`, `.rank`, `.match` — **now partly orphaned**, see §10.8. |
| `styles/components-picks.css` | 279 | `.fp-*` (frequent picks) — **fully orphaned**, `FrequentPicksPanel` is deleted, see §10.8. |
| `styles/components-bar.css` | 283 | `.smb-*` (selected medicines bar). |
| `styles/components-modals.css` | 1252 | `.mi-*` (medicine inspector), patient-modal UI. |
| `styles/past-visit.css` | 454 | `.pv-*`. |
| `styles/workspace-header.css` | 278 | `.ws-*`. |
| `features/sidebar/sidebar.css` | 587 | The sidebar. |

Plus `features/patients/*.css` — 7 files (~3.5k lines).

**(b) Inline `style={{}}`** — `FindingsPanel`, `ChipSearchPanel`,
`PrescriptionDocument` (correct and required there, for print fidelity).

**(c) Tailwind islands** — `ReviewModal`, `ActiveConsultGuard`,
`PrintFormatSelector`. (`FrequentPicksPanel` is deleted, so this list shrank
by one since the old survey.)

**(d) ★ New this pass — scoped CSS-in-JS.** `SynapseStyles.tsx` (509 lines),
injected as a `<style>` tag scoped under `.syn-*` classes, consumed only by
`SuggestionsPanel` and `BrandSheet`. Built this way specifically to sidestep
§12.2 without touching the legacy stylesheets or fighting the layer trap the
way Tailwind does. It is its own design language — distinct tokens, distinct
spacing scale, distinct component patterns — authored to look coherent with the
rest of Cortex but not literally sharing rules with it.

### 12.2 The design tokens

Unchanged — still `styles/base.css`:

```css
--bg: #eef3f8            --text: #0b1733       --blue: #1268e8   --blue-soft: #edf5ff
--worktop: rgba(255,255,255,.72)   --muted: #60708e   --cyan: #0f9f9a  --cyan-soft: #eefaf9
--surface: rgba(255,255,255,.86)   --faint: #8998b0   --green: #16a34a --green-soft: #edfdf3
--surface-solid: #ffffff --line: #d9e2ee                --pink: #d9468f  --pink-soft: #fff1f7
--line-soft: rgba(121,143,177,.2)                       --danger: #d94040
--shadow-low / --shadow-active     --radius: 8px
```

`SynapseStyles.tsx` **does read these same tokens** (`var(--blue)`,
`var(--line)`, etc.) rather than inventing new colours, so it is not a fifth
palette — just a fourth rule-authoring mechanism over the same one.

Per-panel focus-glow colour-coding unchanged: symptoms pink, findings teal,
suggestions blue, tests violet.

### 12.3 The layer trap — unchanged, still load-bearing

`base.css` still styles raw `input`/`select`/`textarea`/`label`/`h2`/`h3`
globally and unlayered; unlayered CSS still beats Tailwind's layered utilities
regardless of specificity. This is exactly why `SynapseStyles.tsx` exists as
scoped `<style>` rather than Tailwind classes — it needed real `<input>`
styling inside the suggestions search box and inheriting `base.css`'s raw
element rules was the simpler path than fighting them. Re-layering `src/styles/`
remains deliberately deferred.

### 12.4 Cortex blue vs. Front Desk "Bhor" vs. the Synapse panel

Reception is on v2 "Bhor" (ink chrome, dawn thread). Cortex's legacy panels are
still on the original light-blue clinical palette. The Synapse panel is a third
point in the same space — same *tokens* as legacy Cortex, but a distinctly
calmer, more restrained density (generous whitespace, quieter borders,
smaller type scale) that was deliberately designed to read as "considered" next
to the denser legacy panels. **If the redesign is going to unify Cortex's
look, `SynapseStyles.tsx` is the closest thing that exists today to a
preview of a restyled Cortex** — worth looking at directly before designing
from scratch.

### 12.5 Motion & other conventions

Unchanged: desktop-only (`min-width: 1120px`), all dropdowns via `createPortal`,
custom 6 px scrollbars, not localized, own `.toast` state (not the app-wide
`sonner` Toaster).

---

## 13. Where do I change X? (updated)

*Updated 2026-07-28 for the redesign. Rows marked ★ are the new workspace.*

| I want to change… | Open |
|---|---|
| Any consult state, effect, or handler | `src/App.tsx` |
| ★ **Anything about how the workspace LOOKS** | `src/styles/workspace.css` (`cx-*`) — never a legacy stylesheet |
| ★ The three-column grid / column heights | `styles/workspace.css` → `.workflow.cx-grid` and the sticky rule on `.cx-chart-panel` / `.cx-synapse .cx-syn` / `.cx-plan` |
| ★ Patient context chips (pregnant, diabetic, age badges) | `components/ContextBar.tsx` (+ `PINNED_SLUGS`) |
| ★ Symptom / finding / history entry, fuzzy search, browse-all | `components/ChartPanel.tsx` (`rankOf` is the 5-tier matcher) |
| ★ "Likely on exam" suggestions | `components/ChartPanel.tsx` → the `ghosts` memo |
| ★ Suggestion sections, order, per-section caps | `features/synapse/SuggestionsPanel.tsx` (`SECTIONS`, `SECTION_CAP`) |
| ★ The medicine card / which brands show | `features/synapse/SuggestionsPanel.tsx` → `MedicineCard` (`INLINE_ALTS`) |
| ★ The prescription, dose/frequency/duration/SOS editing | `components/PlanPanel.tsx` (`DoseEditor`) |
| ★ Frequency ⇄ dose-slot conversion (M/A/E/N) | `lib/db/reference.ts` — `freqLabelToKeys` / `keysToFreqLabel`. **The slot string is canonical; never parse the human label.** |
| ★ Keyboard shortcuts | `hooks/useConsultKeyboard.ts` + `components/ShortcutsSheet.tsx` (keep both in step) |
| The topbar / vitals strip | `components/PatientHeader.tsx` + `styles/layout.css` (`.tb-*`) + `styles/components-base.css` (`.vital-*`) |
| Design tokens, form elements, typography | `src/styles/base.css` |
| ~~Symptom entry~~ ~~`ChipSearchPanel`~~ | **deleted** — see ChartPanel above |
| ~~Findings entry~~ ~~`FindingsPanel`~~ | **deleted** — see ChartPanel above |
| ★ Ranking, guards, personalisation, brands, companions, search — the MATH | `src/lib/synapse/*.ts` (pure, no I/O — safe to unit-test in isolation) |
| ★ Loading the ruleset/catalogue/preference models from Supabase | `src/lib/db/synapse.ts` |
| ★ The suggestions list UI, guard acknowledgement, brand sheet | `src/features/synapse/*.tsx` |
| ★ Per-consult ranking wiring (React-side) | `src/hooks/useConsultIntelligence.ts` |
| ★ Which doctor/clinic is signed in | `src/hooks/useClinicalIdentity.ts` |
| What saving a consult writes (prescription rows) | `lib/db/intelligence.ts` → `saveConsult` |
| The learning write | `lib/db/synapse.ts` → `commitConsultation` |
| Investigations / ordered-tests display | `components/PreviewPanel.tsx` (now trivial — see §7.1) |
| Dosage / frequency editor | `components/MedicineInspector.tsx` + `styles/components-modals.css` |
| Frequency slot ⇄ label mapping | `lib/db/reference.ts` |
| Patient topbar, vitals, past-visit rail | `components/PatientHeader.tsx` + `styles/layout.css` (`.tb-*`) |
| The prescription document itself | `features/prescription/PrescriptionDocument.tsx` |
| The review/print surface | `components/ReviewModal.tsx` |
| Sidebar nav entries | `features/sidebar/SidebarNav.tsx` (`items` array) |
| A new Cortex feature page | Fill the 0-byte stub, add to `SidebarNav.items`, add a branch in `App.tsx`'s render, add meta to `COMING_SOON_META` |
| Keyboard shortcuts | `hooks/useConsultKeyboard.ts` (note §10.1, §10.2 — two stops are currently dead) |
| Patient records / history | `features/patients/` |
| Body-system order/labels (used by both pickers) | `lib/synapse/systems.ts` — **the one place**, don't hand-keep a second copy |
| A DB query | `lib/db/{reference,patients,intelligence,synapse}.ts` — **never** `lib/db.ts` (barrel only) |

---

## 14. Standing rules for Cortex work (updated)

1. **Read the current file before editing.** Verify with grep that a previous
   edit actually landed — do not assume.
2. **All DB calls go in `src/lib/db/*`.** `db.ts` is a barrel; never add
   functions there. (The one known violation — the inline `symptom_tag_map`
   query — is gone; there are currently zero known violations.)
3. **Symptoms, findings and history are structured entities from `observables`.**
   Never free text. Front Desk's `symptoms` table is a *separate*, v1
   catalogue Cortex does not read — don't conflate the two when working across
   both workspaces.
4. **The engine (`lib/synapse/*.ts`) is pure.** No Supabase import, no React
   import, ever. If a change needs either, it belongs in `lib/db/synapse.ts` or
   a hook, not the engine files. This is enforced by convention, not tooling —
   check before adding an import.
5. **Learning-loop / hint failures are non-fatal.** Always `.catch()`. Still
   true for `commitConsultation` and the v1 compatibility write.
6. **Never redefine an existing CSS class** — check first. Never touch
   `layout.css` for `ChipSearchPanel`/`FindingsPanel` work; those own their
   rules. `SynapseStyles.tsx` owns everything under `.syn-*` — same rule,
   fourth vocabulary.
7. **Do not convert a component between the four styling vocabularies**
   without an explicit decision (§12.4). This is now the single most important
   open question for a redesign, not a side note.
8. **Dropdown overlays use `createPortal`.** Stacking is fixed by DOM position,
   not z-index (§9, unchanged).
9. **One prescription renderer, one review surface.** Don't fork
   `PrescriptionDocument` or `ReviewModal`.
10. **Ranking is "re-rank by habit", not "recommend by clinical truth"** — this
    is now enforced by the engine's own architecture (`personalize.ts` cannot
    touch safety-critical or hard-warned intents), not just a convention.
11. **Add zero new `tsc` errors — there is no longer an allowance.** `tsc -b`
    passes clean as of this pass; treat any new error as a regression, not
    pre-existing debt to route around.
12. **Targeted edits only** — never silently rewrite a whole file.
13. **Never persist an alias, a search term, or a v1 name into a visit
    record.** The canonical identity of anything on the chart is its
    `observable.id`; everything else (labels, aliases, matched search terms) is
    a UI-level convenience for finding that id.
14. Anmol is non-technical: literal, copy-paste-ready instructions; text and
    code in chat, no diagrams or HTML.

---

## 15. Further reading

- `aren-technical-atlas.md` — the whole-repo map (both workspaces, auth, data
  layer, Front Desk's intake-alias layer over the shared `observables` table).
- `aren-architecture-handoff.md` — product philosophy, the Visit object,
  Universal Cortex, Solo Mode. Read for *why*.
- `aren-frontdesk-source-of-truth.md` — reception doctrine + session history.
- `referance (synapsev2)/Synapse v2 handoff .md` — the sandbox-side design
  doctrine for the engine itself: the guard philosophy (§14 there), the
  personalisation model (§10a there), the migration checklist this port
  followed. Read this before changing anything under `lib/synapse/`.
- `Coretx File Str.md` — Session 31. Superseded twice over now; historical only.

*End. Update this document again when the UI redesign lands — at minimum §7
(component inventory), §12 (styling — this is where the redesign's decision
gets recorded), and §13 (where-do-I-change-X) will need a fresh pass.*
