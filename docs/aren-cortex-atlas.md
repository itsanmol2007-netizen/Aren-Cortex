# AREN CORTEX — TECHNICAL ATLAS

*The doctor-facing half of the product, read from the code itself.*

> **Environment note (2026-08-08, explicit instruction from Anmol — do not
> "fix" this).** `.env` is committed to this repo, deliberately, and is no
> longer in `.gitignore`. It holds only `VITE_SUPABASE_URL` and
> `VITE_SUPABASE_ANON_KEY` — the anon key is meant to be public (it ships in
> every browser bundle the moment the app is built; `VITE_`-prefixed vars are
> never actually secret) and the real security boundary is RLS, not keeping
> that key hidden. No service-role key, no DB password, and none belongs here
> — if one ever needs adding, it does NOT go in this committed `.env`. This
> repo is private with no public access, used solely by Anmol across his own
> devices, and re-typing the URL/key by hand from device to device was costing
> real time to character-level typos. **When you clone or set up this repo:
> the `.env` is already there. Do not delete it, do not re-gitignore it, do
> not ask before using it.**

Surveyed: **2026-07-30** · Branch `master` · Commit `d5af9f7` + the session-41
working tree
Partial re-audit: **2026-08-06** · Branch `claude/cortex-atlas-summary-auycuc` ·
Commit `edfb000`. Five of the nine items in §10 had been fixed and never struck
off — including the one the last edition called the biggest architectural gap —
so work was nearly planned off a list that was substantially historical.

Content work done on the same branch (2026-08-06): the orphaned test panels and
individual tests were wired, taking `signal_intent_rules` from 1,224 to **1,543**
and reachable intents from 456 to **581**. See §6.1 for the catalogue-duplicate
question that surfaced during it.

Re-verified on that pass, and current as of 2026-08-06:
**§10** (every item, each with the check that proves it) · **§6** row counts ·
the file counts in "Where it lives" · **§5.3** (two profiles were missing and
its open question had been resolved) · the `App.tsx` line count and the boot
description in §2.

Sessions of **2026-08-08 → 2026-08-11** added the attachment pipeline (§14.6),
the specialty tools (§14.7), the dentistry/obstetric content (§14.8), the
drug-allergy guards (§14.9), Settings + specialty self-service + chart gating
(§14.10), the glycaemic panel and the measurement-wiring guard (§14.11),
respiratory rate + the WHO growth engine and date of birth (§14.12), and the
first UI polish pass (§14.13); edge-function source was brought into the repo.
All current as of 2026-08-11.

**What was verified how, because it differs by section.** §14.6–§14.8: live,
real browser, real database. §14.9 and the §14.11–§14.12 data work: database
read-back and the check scripts, which is stronger than a screenshot for
anything numeric. **§14.10, §14.12's card and §14.13's polish were NOT
browser-verified** — Anmol took over visual checking partway through the
session — so treat every UI change from §14.10 onward as implemented,
type-checked and building, but **not yet eyeballed**.

**Everything else still carries its 2026-07-30 reading and was NOT re-checked.**
Treat §3, §4, §7–§9 and §11–§13 as of that date. Where a claim there contradicts
§10, §10 is the newer reading; where it contradicts §14.6–§14.8, those are newer
still.

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

## 0. Start here — current state, keys, and what's open

*Written 2026-08-11 as the handoff point between a browser session and local
terminal work. If you are picking this repo up cold, this section plus §14.6–
§14.8 is the recent half; §1–§13 is the standing description of the app.*

### Where the code is

Branch `claude/cortex-atlas-summary-auycuc`, always fast-forwarded to `master`
— the two are kept identical, so either is safe to read. Everything described
in §14.6–§14.8 is committed and pushed.

```bash
npm run dev              # vite, 127.0.0.1:5173
npm run build            # tsc -b && vite build
npm run check:search     # search coverage
npm run check:brands     # brand-family grouping, against the LIVE catalogue
npm run check:dental     # odontogram geometry (§14.7)
npm run check:obstetric  # LMP / G-P-L-A derivation (§14.8)
npm run check:measures   # measurement wiring, end to end (§14.11)
npm run check:growth     # WHO growth z-scores against WHO's own tables (§14.12)
```

> All five run clean on Windows as of 2026-08-11. Four of them did **not**
> before that date — they had only ever been run inside a Linux container, and
> two failed on path handling, one on CRLF `.env` parsing, and one on a
> duplicated database function. See §14.11. If you add a check script, run it
> on the machine the work actually happens on.

The two newest checks exist because both failures are **invisible**: a
mesial/distal swap looks fine in a screenshot, and a broken LMP derivation
still fills the box and still records correctly. Both were confirmed
non-vacuous by deliberately breaking the code first. Run them before trusting
a refactor near either area.

### Where the keys are

| What | Where it lives | In git? |
|---|---|---|
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | `.env` at the repo root | **Yes, deliberately** — see the preamble above |
| `ATTACHMENTS_S3_*` (Backblaze B2) | **Supabase function secrets only** | **No, and never** |
| Supabase service-role key / DB password | Supabase dashboard | No |

The B2 credentials — endpoint, key id, secret, bucket — are set as Supabase
**function secrets** and read by the three attachment edge functions at
runtime. They are not in `.env`, not in the repo, and not recoverable from
it: `supabase secrets list` shows names and digests, never values. If they
are ever lost, mint a new application key in the Backblaze console and re-set
them; nothing needs redeploying and no already-issued presigned URL outlives
its 5-minute TTL.

Bucket: **`aren-packets-attachment`**, private, S3-compatible API. See
`supabase/functions/README.md` for the exact variable names and the deploy
commands.

> The variable names are generic (`ATTACHMENTS_S3_*`, not `B2_*`) on purpose.
> Every S3-compatible provider is reachable through the identical SDK calls,
> so **changing provider is a secrets change, not a code change** — which is
> also the escape hatch for the data-residency question in §14.6.

### Where the edge functions are

`supabase/functions/` — in git as of 2026-08-11. Before that they existed
only deployed on Supabase and in a throwaway container, which meant the only
copy of the attachment pipeline was one accidental delete from gone. If you
change one, deploy it *and* commit it; there is no CI keeping them in sync.

Note `rank-compositions` is deployed but **not** mirrored into the repo yet —
it predates this pipeline.

### Migrations

Applied directly to the live database through the Supabase MCP tools, **not**
stored as migration files in this repo. `supabase/migrations/` does not
exist. This is a real gap and a deliberate one for now (solo founder, one
environment, no staging): the schema's history lives in Supabase's own
migration log. If a second environment ever appears, this is the first thing
that has to change.

### What is open

Nothing is half-built — these are all "decided not to start", with reasons.

1. ~~**The charts are not specialty-gated.**~~ **Fixed 2026-08-11 — see
   §14.10.** Dental chart shows only for Dentistry, body map only for
   Dermatology, via a new `charts` field on `SpecialtyProfile`. This also
   reversed which way the two specialty tools default — see §14.10 for why.
2. ~~**Guards are `exercise`-only.**~~ **This was wrong, and fixed 2026-08-11
   — see §14.9.** `guardIntent()` was already fully generic over `IntentType`
   / class / specific intent; 16 of the 20 live guards already targeted
   medicines (pregnancy, pediatric, renal impairment) before this pass. The
   real gap was content, not code — no allergy signal was specific enough to
   safely gate a drug — and that's what §14.9 closes.
3. **Attachment tags overlap the body map.** `visit_attachments.laterality` /
   `.body_region` predate `visit_body_sites` and now duplicate it loosely.
   An attachment should probably reference a body site.
4. **The body figure is a schematic** — 14 regions. Fine for marking a limb,
   too coarse for real dermatology (no cheek vs periorbital, no fingers).
5. **Data residency.** B2 is US-region. Acceptable for a consenting pilot,
   not for scale — see the compliance note in §14.6, which is not legal
   advice and should not be treated as any.
6. **No PDF compression**, and no QR phone-handoff for photos (§14.6). Both
   deliberately deferred; `accept="image/*"` already opens the camera
   directly on a real phone browser.

### Conventions worth knowing before you touch anything

- **Verify against reality.** Every claim in §14.6–§14.8 was checked with a
  real browser session and live database queries, not by reading the code.
  Screenshots lie less than diffs, and both lie less than a query.
- **Clean up test data.** Every test patient created during verification was
  deleted afterwards, and attachments were removed through the real
  `attachment-delete` function so the B2 object went too, not just the row.
  The database currently has **zero** test patients.
- **Colour carries meaning, never mood** (§12.1). This survived the
  glassmorphism pass in §14.7 — the glass is on containers only.
- **Guards warn, never hide** (§14).
- **Greys are chosen by measured contrast, not by eye** (§14.13). The text
  floor is 11px. Assume a dim, low-grade 1366×768 panel in a bright room.
- **Spacing comes off the 4px scale** (`--cs-s1`…`--cs-s5`), not from
  whatever looked right (§14.13).

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
| Root component | `src/App.tsx` (1,670 lines) |
| ★ **The consult screen** | `src/features/consult/*` (14 files, 3,285 lines) |
| Remaining shared components | `src/components/*.tsx` (10 files, 2,143 lines) |
| ★ The engine (pure, no React, no Supabase) | `src/lib/synapse/*.ts` (7 files, 1,125 lines) |
| ★ The engine's Supabase boundary | `src/lib/db/synapse.ts` (916 lines) |
| ★ Brand picker + facility profile | `src/features/synapse/` (2 files) |
| Engine-loading + per-consult ranking hooks | `src/hooks/{useSynapse,useConsultIntelligence,useClinicalIdentity}.ts` |
| Internal pages | `src/features/{patients,prescriptions,investigations,communication,practice,clinic,settings,support}/` |
| Internal nav | `src/features/sidebar/` |
| Prescription renderer | `src/features/prescription/` (shared with Print RX) |
| ★ Consult styling | `src/styles/consult.css` (2,191 lines, `cs-` prefix) |
| Legacy data (save + v1 hydration only) | `src/lib/db/{reference,patients,intelligence}.ts` |

Cortex is **not** a router. `App.tsx` swaps "sidebar pages" in local state
(`activePage: SidebarPage | null`) without touching the URL. `activePage === null`
means *the consult workspace*; anything else is a feature page.

---

## 2. `App.tsx` — the whole workspace in one component

Still the single most important file in Cortex and still the single biggest
liability. **1,670 lines** (2026-08-06), up from 999 at the last survey: the Mock 2 rebuild
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
   `useSynapse()` (§4.1). A failure now sets `bootError` and the splash offers a
   retry (fixed since this section was written — see §10.2).
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

Inside the consult workspace there is one further branch, and only one:
`isGeneralOpd` picks `GeneralOpdInputs` over `SoapInputs` for the **input
half** of the screen. Everything below that row — Possible Conditions, the
plan row, the Consultation Plan rail, every modal — is shared by all
profiles. See §14.19.

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
                        findQueuedVisit → markVisitServing,
                        else createVisit(patientId)     ← reuses today's waiting
                                                          queue row when one exists;
                                                          only mints a new visit and
                                                          token otherwise (§10.1, fixed
                                                          after this diagram was drawn)
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

### 5.3 The facility profile — `features/synapse/specialtyProfile.ts` (217 lines)

The one place a specialty is expressed. It decides **two** things and cannot
touch a score, a rank, or which intents exist:

Five profiles as of 2026-08-06 — Cardiology and Paediatrics were added after
this section was first written:

| Profile | Primary slot | Measurements visible by default |
|---|---|---|
| `general_opd` (default) | Medicines | BP · Pulse · SpO₂ · Temp · Body Weight |
| `physiotherapy` | Exercise Plans | Pain · Range of Motion · BP · Pulse · Body Weight |
| `diagnostics` | Investigations | BP · Pulse · SpO₂ · Temp · Weight · Height · Blood Group |
| `cardiology` | Medicines | BP · Pulse · SpO₂ · Weight · Height |
| `pediatrics` | Medicines | Weight · Temp · Height · Pulse · SpO₂ |

Note that Cardiology and Paediatrics both keep **Medicines** in the primary
slot. That is the law working, not a shortcut: depth for a specialty comes from
clinical content underneath it (ECG-derived signals and beta-blocker guards for
cardiology; growth faltering, stridor and the paediatric drug guards for
paediatrics), never from rearranging the screen.

Set **once at onboarding, per facility**; never relearned at runtime and never
derived from what the doctor happens to prescribe. Field *order* is never taken
from here — fields always render in catalogue order, so the layout is identical
for every facility. `profileFor()` is the single read point.

~~**Still unresolved:** `hospitals` has no column for this, so
`PROFILE_BY_FACILITY` is a hand-maintained map.~~ **Resolved** — migration
`20260802191801_add_hospitals_specialty_profile` added the column, and
`profileFor()` now reads `hospitals.specialty_profile`. The hardcoded map is
gone. No onboarding UI writes the column yet, so every facility still reads as
General OPD until one is set directly.

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

Row counts re-measured **2026-08-06** (the previous edition's counts are in
parentheses where they moved).

| Table | Rows | Cortex's relationship |
|---|---|---|
| `patients` | 8 | create, lookup by phone, search. |
| `visits` | 60 (57) | creates one per consult; updates status via `saveConsult` and `ActiveConsultGuard`. Writes `vitals` (jsonb) at save. |
| ★ `observables` | 393 (374) | **the catalogue** — every pickable symptom / finding / history chip, `kind`-split. Read once per session. Front Desk's intake reads it too, through a separate alias layer. |
| `observable_alias` | 165 | regional/typo alternates feeding search. |
| `observable_signals` | 522 (503) | chip → signal. |
| `signals` | 300 (281) | the engine's vocabulary + `idf_weight`. |
| `measurement_rules` | 29 | threshold → signal. |
| `intents` | 729 total / **717 active** (652) | every possible output. |
| `signal_intent_rules` | **1,569 active** (1,099) | **the knowledge base**. 95 safety-critical. |
| `tests` | 249 | the investigation catalogue. **Two generations** — see below. |
| `signal_finding_suggestions` | 10 | symptom → what to examine for (added 2026-08-05). |
| `intent_guards` | **20** (14) | 14 hard, 6 soft, 0 hiding. |
| `intent_classes` / `intent_class_map` | 7 / **79** (6 / 71) | grouping, for gating only. |
| ★ `compositions` | **284** (264) | the molecule catalogue — what the engine actually ranks. 20 added 2026-08-08, §6.2. |
| ★ `medicines` | **213,145** (213,838) | products. Deduplicated then given 69 real branded products across the 20 new compositions, 2026-08-08, §6.2. |
| `intent_companions` | 26 | intent → companion intent, authored, global. |
| ★ `visit_observations` | 55 (52) | the permanent, engine-shaped record of what was on the chart. |
| ★ `visit_measurements` | 48 (45) | same, for numbers. **`value_text` is now written** for blood group. |
| ★ `decision_log` | 23 | the learning write, gated on a real identity. |
| `clinic_brand_preference` | 0 | the clinic-wide declared brand default, set from `BrandSheet`. |
| `doctor_signal_intent_rules` | 0 | the per-doctor learned overlay, applied by `loadRuleset(…, doctorId)`. |
| `v_doctor_preference` / `_brand_preference` / `_frequent_medicine` | views | the three personalisation models. |
| `visit_symptoms` / `visit_findings` | 81 / 16 (78 / 16) | **still written**, as a compatibility bridge only. |
| `symptoms` / `findings` | 51 / 0 | **no longer read by Cortex.** Front Desk still reads `symptoms`. |
| `symptom_observable_map` / `finding_observable_map` | 52 / 27 | the bridge between the two catalogues. |
| `prescriptions` / `prescription_medicines` / `diagnostic_orders` | — | insert at save. |
| `medicines`, `compositions`, `medicine_composition_map` | — | read **only** through the `composition_brands` RPC, never directly from a component. |
| `doctors`, `hospitals` | 7 / 12 (6 / 11) | letterhead; `doctors.last_seen` written by the 30 s heartbeat. **All five clinical tables here carry an RLS `hospital_isolation` policy (`hospital_id = current_user_hospital_id()`)** — see §10.11 for why that matters. |
| `doctor_pinned_intent` | 0 | per-doctor pins; added 2026-08-02 (§10.5). |

### 6.0 `intents.is_active` was not enforced by the engine (fixed 2026-08-06)

Worth knowing before retiring anything. `search_intents` filters `i.is_active`,
so a retired row vanishes from search — but `loadRuleset` selected
`id, type, label, ref_table, ref_id` and **never read `is_active`**. Its
`.then(r => r.filter(x => x))` looked like a guard and filtered nothing. The
engine reaches an intent through `signal_intent_rules`, so a retired intent that
still had live rules went on being **suggested while being unsearchable** — the
worst of both.

`engine.ts` now selects and filters `is_active`. Two consequences for anyone
retiring catalogue rows:

1. Retiring a row that carries rules requires deactivating **the rules too**, not
   just the intent, so the data is correct independently of which client build
   is deployed.
2. Retiring a rule-less row is free and always was — which is why the 14 test
   rows retired the same day had no ranking effect.

### 6.1 The tests catalogue had two generations (resolved 2026-08-06)

Found 2026-08-06 while wiring the orphaned tests. `tests` was seeded twice on
the same day:

| Generation | `created_at` | Style |
|---|---|---|
| v1 | `2026-06-11 05:28:56` | combined names — `Malaria Antigen / Smear`, `Serum Iron / TIBC`, `T3 / T4`, `Uric Acid`, `Blood Sugar PP`, `Stool Culture` |
| v2 | `2026-06-11 06:01:26` | the split canonical tests, mostly `priority_tier` 1 |

Both generations were live, so **the same investigation existed twice under two
names**. Ranking rules are authored only against the canonical entry, and the
14 redundant rows have now been retired (`is_active = false`, migration
`retire_duplicate_test_catalogue_rows`) so each investigation appears exactly
once in search.

> **Why retiring them mattered — this was never cosmetic.** `search_intents`
> returned both rows. If a doctor picked the rule-less twin, `decision_log`
> recorded `outcome = 'searched_accepted'` against it, and `learn_doctor_rules`
> (threshold 2, weight 0.4) then wrote a `doctor_signal_intent_rules` row
> pointing **at the duplicate**. The engine would then start actively suggesting
> the orphan copy to that doctor, permanently splitting their catalogue — a
> compounding, per-doctor divergence that would have surfaced as one doctor's
> Cortex quietly disagreeing with everyone else's. Checked before retiring:
> nothing had been taught yet, so there was nothing to unwind.

Every retired row carried zero rules, so ranking was unchanged (1,520 before and
after) and no rule points at a retired intent. `is_active` is a soft flag and
nothing was deleted, so any row can be brought back with a one-line update.

One pair inverts the pattern: for **FSH / LH** it is the *combined* v1 row that
carries the rules, so the single-analyte v2 rows were the redundant ones.
Keeping the combined row leaves one chip instead of three and needed no rules
moved. If standalone LH is ever wanted for ovulation timing, reactivate it.

`priority_tier` is the field that already encodes this: **tier 1 = canonical and
common**. A useful invariant falls out of it, and is worth re-running after any
catalogue work:

> **All 57 tier-1 tests are reachable from the chart. Zero are orphaned.**
> Everything still unreachable is tier 2 or 3.

**Not retired, deliberately:** `X-Ray Chest (AP View)` and
`X-Ray Abdomen (Supine)` are genuinely different radiographic views a doctor
chooses on purpose — AP for a patient who cannot stand, and erect vs supine
answer different questions. They are lower-priority variants, not duplicate
names for one test.

The 15 remaining unwired tests are intentional: immunity checks (`Anti-HBs`),
procedures that follow a result rather than a symptom (bone marrow / liver
biopsy, colposcopy, USG-guided FNAC), techniques inside another test (Gram
stain), and tests with no signal to key on — `Blood Lead Level` needs an
occupational-exposure signal and `Neonatal Bilirubin` a neonate signal, neither
of which exists.

**Hydration pattern:** unchanged — no SQL joins for the big reads; fetch parents
then `IN (…)` the children and aggregate in memory.

**RPC surface:** exactly two — `composition_brands` (SQL, invoker, reads only the
`mv_composition_brand` matview) and `search_intents` (SQL, **security definer**).

---

### 6.2 Medicines are deliberately scoped — read this before "completing" them

68 medicine intents carry no rules. **That is mostly policy, not a gap**, and
the rule table states the policy without ever writing it down: across
`ANXIETY`, `INSOMNIA`, `LOW_MOOD`, `PSYCHOSIS`, `SUICIDAL_IDEATION` and
`SEIZURE` there is **not one medicine rule**. Every one of those signals routes
to a Psychiatry or Neurology referral plus a workup and stops:

| Signal | Reaches |
|---|---|
| `SUICIDAL_IDEATION` | Psychiatry 0.95 · Emergency transfer 0.85 |
| `PSYCHOSIS` | Psychiatry 0.90 · CT Brain |
| `SEIZURE` | Neurology 0.75 · EEG · MRI · RBS · electrolytes — **no anticonvulsant** |
| `LOW_MOOD` | Psychiatry 0.55 · TSH · B12 · CBC |
| `ANXIETY` | Psychiatry 0.45 · TSH · ECG |
| `INSOMNIA` | Sleep advice · Psychiatry · TSH |

So the ~35 unwired psychotropics, benzodiazepines and anticonvulsants are
unreachable **by design**. Wiring them would silently reverse a safety posture
someone chose consistently across six signals. Do not "finish" them.

The same reasoning retires four more groups from consideration: IV/hospital-only
antibacterials, beta-lactamase inhibitors that never stand alone, definitive
therapy that must follow a diagnosis rather than a symptom (antimalarials,
anti-TB — the engine already routes those presentations to the confirmatory
test), and specialist-initiated or market-restricted drugs.

**A saturation rule falls out of this too.** Before adding a medicine to a
signal, count what is already there. `PRURITUS` offers 14 medicines, `DYSPEPSIA`
10, `WHEEZE` 9, `HEARTBURN` 8. A fifteenth option is noise, not coverage. The
2026-08-06 batch wired 14 medicines against ten signals that had **no medicine
at all** — erectile difficulty, menorrhagia, bleeding, epistaxis, infertility,
irregular periods, amenorrhoea, cognitive decline, stroke signs, known
asthma/COPD — and skipped every crowded one.

**Wiring a drug can create a safety gap.** `clomiphene` is contraindicated in
pregnancy, so it was added to the existing `Contraindicated in pregnancy`
class (id 4) rather than given a new guard — the `PREGNANCY -> warn_hard` guard
then covers it automatically, as it already does for isotretinoin and
doxycycline. Check class membership whenever wiring a drug, not just weights.

---

### 6.3 The product catalogue — what 213k rows actually are (2026-08-08)

**213,076 products collapse to 284 molecules.** The engine ranks the molecules;
`medicines` is a lookup after ranking (§4.5). So "the medicine database is
huge" is not a scale problem — anything that needs authoring happens at the
composition level, which is a table you can read in one sitting.

Four things were measured this pass, and only one of them was the problem
everyone expects:

**Duplicate names were never the issue** — 40 exact-duplicate pairs in 213,798
names. **Duplicate *products* were**: 762 rows were the same medicine entered
twice under two spellings (`Adimox 250 Capsule` / `Adimox 250mg Capsule`,
`Levoc 5mg Tablet` / `Levo C 5mg Tablet`), differing only in whether the
strength carried its unit or where a space fell. Deleted; nothing referenced
them. Scope was narrowed to products mapping to exactly one composition, because
a combination product maps to every ingredient and a name match across those
could merge two genuinely different formulations.

**The visible problem is brand families.** Every strength and form of a product
is its own row, so `Aceto` is six rows under paracetamol and the worst brand
reaches twelve — 43% of offerable rows are a variant of a brand already in the
list. Grouped in `lib/synapse/brands.ts`; see the module header. `npm run
check:brands` guards it against the live catalogue.

**31% of products have no strength, and it is not recoverable.** 66,270 rows
have `strength_mg = null`; only ~7,400 have a parseable strength in the name.
**53,401 carry no number anywhere** — including `Calpol`, `Crocin` and
`Dolo 500 Tablet`, the three curated paracetamol brands. The brands a doctor
most wants are the ones with the least data. No parser and probably no purchased
dataset fixes this; the realistic path is capturing it from what doctors
actually prescribe, which makes "add a missing medicine" and "complete an
incomplete one" the same feature.

**`route` was wrong for 1,682 products.** Oral drops were filed as `syrup` —
and `route` is the only dosage form this schema has (`medicines` has no form
column), so a dropper and a spoonful were indistinguishable on infants.
Reclassified. Verified zero eye/ear/nasal preparations were in the set first,
because `drops` is a member of `PEDIATRIC_FORMS` in `lib/synapse/brands.ts`.

**Twenty compositions were missing**, and the gaps were ordinary rather than
exotic: ORS absent entirely; oral iron absent while IV iron sucrose was present;
furosemide absent while torasemide was present; nitrofurantoin absent while
flavoxate — an antispasmodic, not an antibiotic — was there. Added with 26 rules
and 4 new guards. The three migrations ran in the order §4/§15 demands —
compositions, then **gates**, then rules — so no drug was ever ruled before it
was gated.

Two things worth keeping from authoring them:

- **Mirroring a drug's rules does not mean inheriting its gates.** Benzoyl
  peroxide mirrors adapalene's `ACNE 0.400` exactly but is deliberately *not* in
  `pregnancy_contraindicated`: adapalene is a retinoid and a real teratogen,
  benzoyl peroxide is not. A gate has to be true of the molecule or it is noise,
  and noise is what §14's alert-fatigue risk is made of.
- **Guarded drugs are ranked below their unguarded alternatives on purpose.** In
  acute diarrhoea, ORS leads at 1.935, then racecadotril 0.560, then loperamide
  0.420 — which carries two hard warnings. That ordering is the clinical answer,
  not tuning.

**`mv_composition_brand` must be refreshed after any of this.** Nothing does it
automatically, and a stale materialised view looks exactly like a correct one.
Both migrations that touched products end with the refresh.

**Still unmeasurable from inside the database:** which compositions the original
import *discarded*. Those rows never landed, so the catalogue cannot report them.
The way to answer it is to re-run one source CSV against the current 284 and read
what fails to match — that turns the gap from an estimate into a list.

### 6.4 Brands for the 20 new compositions — web-verified, not recalled (2026-08-08)

69 real Indian products added — each checked against a live pharmacy source
(1mg, Medindia, manufacturer listings, drugsupdate) this session, not typed
from memory. Counts per composition are honest, not padded to a target: ORS,
nitrofurantoin, benzoyl peroxide and hydroxychloroquine had a wide, clearly
sourced brand landscape (5–7 each); ferrous fumarate, ferrous sulfate,
carbonyl iron and insulin aspart turned up exactly **one** brand each that
could be confidently attributed without contradicting sources. The Indian
iron-salt brand market in particular is fragmented and cross-labelled in a way
that made asserting more unsafe.

**Pure ferrous ascorbate and pure calcium carbonate essentially do not exist as
marketed Indian products.** Every real brand found for either is sold combined
with folic acid (iron) or vitamin D3 (calcium) — both already compositions in
this catalogue. Modelling those brands as single-ingredient would have been
exactly the "combination trap" §12 of the Synapse handoff already warns about:
the UI would offer a 2-ingredient product as if it were the ranked pure
molecule. They are linked to **both** compositions instead
(`ingredient_count = 2`), so `ferrous ascorbate`, `ferrous fumarate`,
`ferrous sulfate`, `carbonyl iron` and `calcium carbonate` are now
combination-only in the same way `trypsin` / `oxetacaine` /
`phenylpropanolamine` already were — counted in `mv_composition_brand`,
never offered as a single-molecule brand. Verified: `composition_brands()`
returns `ingredient_count = 1` rows for the other 15 and none for these 5.

Excluded deliberately: `Glyxambi` / `Synjardy` / `Trijardy` are real
empagliflozin combination brands (with linagliptin / metformin) — left out
rather than mismapped, same reasoning as the iron/calcium combos. `Enerzal`
came up repeatedly for ORS but is a sports/energy drink, not a WHO-formula
oral rehydration salt — excluded as not clinically equivalent.

*Check:* `npm run check:brands` — the sample now includes `oral rehydration
salts` (id 285) and `nitrofurantoin` (id 292) alongside the original eight
high-volume generics.

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

~~**It has not caught up with the new measurements.**~~ **Fixed 2026-08-05** —
height, blood group, pain and ROM now render alongside BP, Pulse, Temp, SpO₂ and
Weight, in both `ReviewModal` (`:446-449`) and `PrescriptionDocument`
(`:233-236`). See §10.6.

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

## 10. Known defects, gaps, and debt (re-audited 2026-08-06)

> **Read this first.** On the 2026-08-06 pass, **five of the nine items below
> were already fixed** and had simply never been struck off — including 10.1,
> which the previous edition called "the single biggest architectural gap".
> Work was very nearly planned off a list that was substantially historical.
> Each item now records how its status was checked, so the next reader can
> re-run the check instead of trusting the label.

### 10.1 ✅ FIXED — Cortex is disconnected from the reception queue

Was 🔴. `App.tsx:48` now imports `findQueuedVisit` and `markVisitServing`, and
`App.tsx:517` marks the existing queue row as serving instead of minting a
second visit. Starting a consult no longer duplicates a waiting patient's
token.

*Check:* `grep -n "findQueuedVisit\|markVisitServing" src/App.tsx`

### 10.2 ✅ FIXED — Boot is all-or-nothing

Was 🟠. `App.tsx` now holds `bootError` state (`:131`) and a `retryBoot`
callback (`:381`), and the splash renders the message plus a retry button
(`:1245-1252`) instead of hanging forever.

*Check:* `grep -n "bootError\|retryBoot" src/App.tsx`

### 10.3 🟡 Hardcoded identity fallback (downgraded from 🟠)

`DOCTOR_ID` / `HOSPITAL_ID` (`lib/db/reference.ts`) are still the fallback in
`useClinicalIdentity` when a signed-in account has no `doctors` row, so those
accounts still get **no personalisation and no learning**.

What changed: the previous edition's main complaint was that *nothing in the UI
told them why*. That is fixed — `StatusBar` takes an `unidentified` prop,
distinct from `degraded`, and `App.tsx:1535` passes `!identity.isReal` into it.
The corruption risk remains closed (`useSynapse` and `commitConsultation` both
gate on `isReal`).

Note the reception half of this was a separate and worse instance, now fixed —
see the Front Desk note at the end of this section.

### 10.4 🟠 `workspace.css` is 2,794 lines for 25 classes

Unchanged, and marginally worse than recorded. Re-measured 2026-08-06:
**175 `cx-` classes defined, 25 still referenced, 150 dead.** Still imported at
`main.tsx:24`. The survivors are `BrandSheet`, `BrowseSheet`, `ShortcutsSheet`
and the `data-cx-planline` hook in `PlanCard`. The fix — move those into
`consult.css` as `cs-*` and delete the file — is a presentation decision, not a
mechanical one, because the sheets would need restyling to match.

*Check:* the class census is a one-liner; see the commit that added this note.

### 10.5 ✅ FIXED — Pins are localStorage-only

Was 🟡, and the entry was wrong by the time it was read: the table *does* exist.
`doctor_pinned_intent (doctor_id, intent_id, hospital_id, created_at)` was added
by migration `20260802185000_add_doctor_pinned_intent`, has RLS enabled with a
policy, and `usePinnedMedicines.ts` reads and writes it through
`loadPinnedIntents` / `setPinnedIntent`. Pins follow the doctor between
machines. In-memory-only remains the behaviour for a fallback identity, which is
correct — there is no `doctors` row to key a pin on.

### 10.6 ✅ FIXED — The print does not carry the new measurements

Was 🟡. Both surfaces now render height, blood group, pain score and range of
motion: `ReviewModal.tsx:446-449` and `PrescriptionDocument.tsx:233-236`.

*Check:* `grep -n "bloodGroup\|painVas\|romPct" src/components/ReviewModal.tsx
src/features/prescription/PrescriptionDocument.tsx`

### 10.7 ✅ CLOSED — `App.tsx` is 1,053 lines

999 → 1,586 (2026-07-30) → 1,670 (2026-08-06) → ~2,300 (2026-08-14, after the
General OPD rebuild) → 2,196 (2026-08-15, after the render split in §14.19)
→ **1,053** (2026-08-15, after the state split in §14.20).

Both halves of the seam this entry named on 2026-07-30 are now cut. The
*render* half went to `GeneralOpdInputs.tsx` / `SoapInputs.tsx` (§14.19); the
*state* half went to five hooks in `src/hooks/` (§14.20) rather than the one
`useConsultWorkspace()` this entry used to predict — the single hook turned
out to be three layers with a forced declaration order, and pretending it was
one would have hidden that. What is left in this file is genuinely the shell:
boot, navigation, the toast, and which overlay is open.

Kept as a marker rather than deleted, because the growth pattern is the
lesson: this file went from 999 to 2,300 lines over six weeks without any
single change looking unreasonable at the time. If it starts climbing again,
the question to ask is which of the five hooks the new state belongs in —
§14.20's layering answers it — not whether App.tsx can hold one more thing.

### 10.8 ✅ FIXED — Two tables have RLS disabled

Was 🟡. `prescription_counters` and `visit_attachments` both have
`relrowsecurity = true` with one policy each, so enabling RLS did not black them
out.

*Check:* `select relname, relrowsecurity from pg_class …` against the two
tables, plus `pg_policies`.

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

### 10.11 ✅ FIXED (2026-08-06) — Front Desk was pinned to one hardcoded clinic

Strictly out of this atlas's scope (`src/features/frontdesk/`) but recorded here
because it is the reception-side twin of 10.3 and was found during this pass.

Every reception page read the `HOSPITAL_ID` constant instead of the signed-in
identity — the queue, doctor list, stats, doctor-requests card and the Print RX
letterhead. **No data ever leaked**: RLS (`hospital_isolation`:
`hospital_id = current_user_hospital_id()`) is enabled on `patients`, `visits`,
`prescriptions`, `doctors` and `hospitals`, so a query for the constant's
hospital intersected with the caller's own returned nothing. The effect was the
inverse — for all eleven other clinics Front Desk came up **empty**: empty
queue, empty intake dropdown, and a header falling back to the generic "Clinic".

Fixed by `useHospitalId()` (`features/frontdesk/hooks/`), which reads the
verified hospital off the auth identity with deliberately no fallback to the
constant. The lesson worth keeping: **RLS turned a confidentiality bug into an
availability bug.** It is the reason this was survivable, and the reason it went
unnoticed.

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
| The add sheet's food-instruction pre-fill | `features/consult/dosing.ts` — a documented static map, not a DB lookup (§14.17) |
| A combination product's guard verdict | `lib/synapse/engine.ts` → `guardCombination` / `medicineIntentIndex` — checks EVERY molecule the product carries, not just the one it was ranked or searched through (§14.17) |
| Which combination products a ranked molecule offers | `lib/db/medicines.ts` → `fetchCombinationProducts`, wired in `useConsultIntelligence.ts` §4b |
| **Keyboard shortcuts — adding or changing a binding** | `lib/keyboard/keymap.ts`, the **one place**. The handler dispatches from it and `ShortcutsSheet` prints it, so they can no longer drift (§14.22) |
| Where a key is *handled* | `hooks/useConsultKeyboard.ts` for the global ones; the surface itself for anything inside a list or a modal |
| ↑ ↓ / Enter over a ranked list | `hooks/useRovingList.ts` — **don't fork it**; four cards share it |
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

## 14.5 Doctor-added medicines + the admin panel (decided 2026-08-08)

**Status: the RPC and its TypeScript wrapper are built and verified. The UI
(search-fallback entry point, dedicated add screen) and the whole admin panel
are not.** Read this before touching either.

### What exists now

`add_medicine(p_name, p_composition_ids, p_route, p_strength_mg,
p_manufacturer)` — security-definer SQL function, same pattern as
`search_intents` / `composition_brands`. Takes ONE name, ONE strength, ONE
form for the whole product (a tablet cannot be "tablet" for one ingredient and
"syrup" for another) and an *array* of composition ids — the array is what
makes a combination product a combination. Never creates a composition; raises
if any id doesn't already exist. Hospital-scoped on every insert
(`hospital_id = current_user_hospital_id()`), never global.

Verified this pass, live against `arenod`, each in its own rolled-back
transaction so nothing was left behind:

| Case | Result |
|---|---|
| Real doctor, valid input | Returns one row per composition, correct fields |
| No `auth.uid()` | `not authenticated` |
| Composition id doesn't exist | `unknown composition id(s): 999999` |
| Name exists already, different case (`DOLO 500 TABLET` vs `Dolo 500 Tablet`) | Caught — case-insensitive on purpose, see below |
| Same composition id twice in one call | `the same composition was listed more than once` |
| Signed-in user with no `doctors` row | `no doctor profile linked to this account` |

**Case-insensitive name check is deliberate, not the DB's own behaviour.**
`medicines.name` carries a plain `UNIQUE` constraint, which is case-sensitive
— it would let `"Dolo"` and `"dolo"` both through. That's exactly the
formatting-duplicate problem the 2026-08-08 dedup pass (762 rows) just
cleaned up, so the RPC checks `lower(name) = lower(input)` itself before
the insert rather than relying on the constraint.

TypeScript side: `addMedicine()` in `lib/db/synapse.ts`, returns
`{ compositionId, medicine: Medicine }[]` — one entry per composition linked,
already shaped as a `Medicine` so a caller can splice it straight into the
current consult's brand list without waiting on `mv_composition_brand`'s
refresh. RPC error text is surfaced as-is (`throw new Error(error.message)`)
— the six messages above ARE the doctor-facing copy, not generic failures.

### What's still open

Not built yet — this is the standing decision so a future session doesn't
re-litigate it.

**Problem:** ~46% of `medicines` are genuinely multi-composition (measured live:
53.9% single, 46.1% two, a sliver at 3–4), and the catalogue will always be
some years stale no matter how it was imported. The fix isn't a bigger import,
it's a smooth add-flow that absorbs drift permanently — usable both at
onboarding and mid-prescribing.

**The line that must hold:** a doctor may attach a new *medicine* to an
*existing* composition. A doctor may never mint a new *composition* — that
still requires the full compositions → gates → rules pipeline (§6.3/§15) a
clinical decision, not a self-service one. `medicine_composition_map` already
supports multi-composition products (proved in §6.4 — the iron/calcium
combos), so this covers combination products natively.

**Design:**
- `add_medicine()` RPC, security-definer (same pattern as `composition_brands`
  / `search_intents`) — takes a name, one-or-more `{composition_id,
  strength_mg, form}`, optional manufacturer. Regular doctors cannot write
  `medicine_composition_map` directly (`admin_write` policy requires
  `current_user_is_admin()`), so this has to go through a function, not a
  direct insert.
- New medicines are **hospital-scoped by default** (`hospital_id =
  current_user_hospital_id()`), never global on creation — mirrors the
  doctor-local-rule-promotion philosophy already in Synapse (§10b of the
  handoff): safe and instant locally, promoted only if it proves out.
- **No new "pending" column needed.** `hospital_id` already encodes the
  state — every existing catalogue medicine has `hospital_id = null` (global);
  a doctor-added one has their real hospital id (pending). Admin approval is
  just setting it back to `null`.
- `medicines.created_by_doctor_id` / `created_at` (added 2026-08-08, both
  nullable, null on all pre-existing rows) exist for exactly this — the admin
  review queue needs to show who submitted a pending medicine and when.
- `mv_composition_brand` has a unique index
  (`composition_id, medicine_id`), so `REFRESH MATERIALIZED VIEW
  CONCURRENTLY` is available and doesn't block other readers. The RPC doesn't
  need to wait on it either way — it returns the new medicine directly, so the
  calling consult can use it immediately; the refresh only matters for the
  *next* search, by anyone.
- Reachable from two places: the search-fallback (mid-prescribing, when a
  molecule ranks but no brand exists) and a dedicated add screen (onboarding).
  Same RPC underneath.

**Admin panel:** `arenod.com/admin`, same codebase as Cortex/Front Desk, not a
separate repo. Reasoning: the actual security boundary is already RLS
(`current_user_is_admin()`) at the database layer, not which frontend calls
it — a second codebase buys no additional isolation. The existing
`RequireAuth` + `RequireRole` pattern already used to split Cortex (doctor)
from Front Desk (reception) extends cleanly to a third role; lazy-load
(`React.lazy`) so the admin bundle never ships to a doctor or receptionist.
Scope: hospital activation, doctor credential reset (password/phone/details),
and the medicine-catalogue approval queue this section describes. Multi-day
build, separate from the RPC above — the RPC has to exist first, since the
approval queue has nothing to review until doctors can submit.

---

## 14.6 Attachments — built and verified end-to-end (2026-08-08)

X-rays, lab reports, ultrasound images. The three-input-shapes architecture
in the Synapse handoff always named "attachments" as a real input type
(§1); this is it finally built, not a new concept.

**Storage: Backblaze B2, not Cloudflare R2.** R2 requires a payment method on
file even for free-tier use — a real blocker Anmol hit live. B2 needs none,
is cheaper per GB (~$0.006 vs R2's ~$0.015), and has the same 10GB free
tier. Both are S3-compatible, so the code is **provider-neutral on purpose**:
`ATTACHMENTS_S3_ENDPOINT` / `_ACCESS_KEY_ID` / `_SECRET_ACCESS_KEY` /
`_BUCKET` env vars, not anything B2-specific — switching provider later, or
to AWS S3 `ap-south-1` (Mumbai) for India data residency once past pilot
(see the compliance note below), is a secrets change, never a code change.

**Compliance note, said plainly to Anmol and repeated here:** India's
data-localisation rules for health data are still evolving; the DPDPA
doesn't ban cross-border transfer outright today, but the direction of
policy leans toward keeping health data in-country, and this is not legal
advice. B2's US-region storage is an accepted MVP/pilot-stage choice, not a
permanent one — `storage_provider` on `visit_attachments` exists specifically
so a later move to an India-region provider costs a migration, not a rewrite.
Get real counsel before onboarding beyond a small consenting pilot.

### What exists

Three edge functions, all deployed, all `verify_jwt: true`, all
security-scoped through the **caller's own session** (not a service-role
bypass) — asking "does this visit exist" through an RLS-scoped client IS the
authorization check, same pattern as `add_medicine`:

| Function | Does |
|---|---|
| `attachment-upload-url` | Validates mime type / size / attachment_type, presigns a PUT, returns a random (never the original filename) storage path |
| `attachment-view-url` | Checks `visit_attachments` is visible to the caller, presigns a GET |
| `attachment-delete` | Deletes the metadata row through the caller's RLS-scoped client FIRST — that's the auth check — only then deletes from storage. This order means a failure can only ever leave a harmless orphaned object, never a broken reference the app still shows |

`visit_attachments` (existed as an unused stub before tonight — no FK on
`visit_id`, no `storage_provider`/`uploaded_by`/`size_bytes`/
`attachment_type`) is now fully wired: FK added, four columns added,
`attachment_type` constrained to `xray | lab_report | photo | scan | other`
— same fixed-set discipline as every other categorical column in this
schema.

**Compression is type-aware, not one target** (`lib/attachments/compress.ts`,
pure, no Supabase dependency):

| Type | Max dimension | Target | Quality floor |
|---|---|---|---|
| xray, scan | 2400px | ~1.5MB | 0.65 |
| photo, lab_report, other | 1600px | ~550KB | 0.5 |

Reasoning: an X-ray or ultrasound's diagnostic value IS the fine detail;
over-compressing one the same way as a wound photo destroys exactly what the
doctor took it for. `application/pdf` passes through unchanged — client-side
PDF recompression needs a real PDF library, out of scope tonight; the 8MB
backstop in `attachment-upload-url` still catches anything absurd.

`AttachmentsCard` (`features/consult/`) sits in `cs-body-left` directly after
`MeasurementsCard` — secondary by design, per the agreed UI philosophy
("structured first, artifact when necessary"), never competing with the
chip pickers or the engine's own output for attention. Interaction mirrors
`MeasurementsCard`'s "Add Measurement" pattern deliberately (button → small
menu → action) rather than inventing a new one: tap Attach, pick what kind
of file this is (the type has to be picked FIRST — it drives the compression
profile), the native file picker opens. Thumbnails are never eagerly
fetched — every visible file would mean an immediate signed-URL round trip
for detail nobody asked to see yet, the same restraint already applied to
brand candidate windows elsewhere in this codebase.

### Verified, live, through the real UI — not just the API

Driven through a real headless browser session (login, new-patient intake,
active consult), not curl-only:

- Upload: real JPEG compressed and landed in the real B2 bucket, appeared in
  the card as "X-ray · 759 B"
- View: real network call to `attachment-view-url`, 200, valid presigned URL
  returned
- Delete: card reverted to empty state, confirmed in the DB
- Cross-hospital isolation re-confirmed through the real `authenticated`
  Postgres role (not the `postgres` role `execute_sql` uses, which bypasses
  RLS entirely — a methodology mistake caught mid-session, see the commit
  history for the full account) — a different hospital's session gets `[]` /
  `404`, never the file
- All test patients/visits/attachments created during verification deleted
  afterward through the real delete function, not a raw DB wipe

### Bucket CORS was never actually set (found and fixed 2026-08-11)

The 2026-08-08 verification above tested the presigned-URL *contract* (a
valid URL comes back, a PUT to it succeeds) but every real upload from an
actual browser tab failed at the CORS preflight —
`No 'Access-Control-Allow-Origin' header is present`. The browser's PUT/GET
against a presigned URL goes straight to B2, never through Supabase, so it's
the *bucket's* CORS policy gating it, which is separate from whether the URL
itself is valid — a new B2 bucket ships with no CORS rule at all, and none
was ever set here. `curl` against the same URL was never affected, which is
exactly why this slipped past that pass's verification.

Fixed by a fourth edge function, `attachment-configure-cors`
(`supabase/functions/README.md` has the full account) — `AllowedOrigins:
['*']`, safe because the bucket is still private and every request still
needs a real, doctor-minted, 5-minute presigned URL; CORS only decides
whether the *browser* shows the response, never whether the bucket accepts
the request. Verified by simulating the exact preflight the browser sends
(`curl -X OPTIONS` with `Origin` / `Access-Control-Request-Method` headers)
before and after — bucket returned bare 200s with no CORS headers before,
`access-control-allow-origin: <origin>` + `allow-methods: PUT` + `allow-
headers: content-type` after.

### Still open

- QR phone-handoff (desktop doctor, photo on phone) — deliberately deferred,
  not built. "Upload from computer" (today's file picker) covers desktop
  webcams and, on an actual phone browser, triggers the native camera
  directly via `accept="image/*"` with no QR needed at all.
- India-region storage migration — tracked above, not urgent for pilot.
- No PDF compression.

---
## 14.7 Specialty tools — the dental chart and the body map

Both exist because of one correction from Anmol, worth restating because it
governs how any future specialty support should be judged:

> *"You are again and again talking in terms of engine… I'm talking about a
> specialty from the perspective of a doctor. How does a dentist operate? He
> must operate on a dental chart."*

The question is never "does this specialty change the ranking" — it is "what
does this doctor actually reach for". A dentist reaches for a tooth chart; a
dermatologist points at a body. **Neither is read by the engine.** Guards,
signals and ranking are untouched (§14), exactly as with specialty profiles.
These are record and presentation.

Both were built twice. The first attempt at each was a dropdown and a
free-text box, which Anmol rejected in the same terms — *"meet what dentists
use in real life, not boxes"*. That verdict is the useful part of the
history; the rest of it isn't, so what follows describes the final state only.

### The dental chart

`lib/dental/anatomy.ts` (geometry) · `lib/dental/types.ts` (vocabulary) ·
`features/consult/DentalChartCard.tsx` (render only, owns no anatomy) ·
`dental_findings` table · `npm run check:dental`

**The shape.** Two horseshoe arches mirrored across the occlusal plane, drawn
as an ellipse wider than deep because a real arch is (~55mm across vs ~40mm
front-to-back). Teeth are placed by **arc length, not by angle** — even
angular spacing leaves gaps between the narrow front teeth and crowds the
molars — so the arch is walked crown width by crown width and the curve
parameter solved numerically at module load. Each crown rotates onto the arch
normal, so buccal always faces the cheek. Crown outlines differ by class
(incisor a flattened lens, canine a teardrop, premolar two lobes, molar four
with the fissures showing) and carry the real cusp count.

**The unit of record, which matters more than the shape.** A dentist charts
caries per **surface**: "36 MO" is the mesial and occlusal surfaces of the
lower left first molar. Recording "tooth 36 has caries" throws away the
information the chart exists to carry. So every tooth is five independently
clickable surfaces (mesial, distal, buccal, lingual, occlusal), clipped to
the crown outline so the fills follow the real shape while the zone maths
stays rectangular and simple.

`dental_findings.surface` is **nullable, and NULL is meaningful** — mobility,
impaction, a missing tooth and a root canal are whole-tooth facts. The chart
asks for a surface only where one exists (`isSurfaceCondition`), and states
in words which of the two it is about to write, so what gets recorded can
never differ from what the doctor thought they clicked.

Surface names follow the tooth: the outer surface is *buccal* on a molar but
*labial* on an incisor, *palatal* above and *lingual* below, *occlusal* on a
molar and *incisal* on an incisor.

> **Why there is a check script.** A mesial/distal swap on one quadrant looks
> completely fine in a screenshot and silently records caries on the wrong
> surface — a wrong medical record. `check:dental` verifies numerically that
> crowns touch without overlapping, that mesial genuinely faces the midline,
> and that buccal faces out of the arch. It was confirmed non-vacuous by
> deliberately inverting the mesial calculation (32 errors, as expected).

### The body map

`lib/body/anatomy.ts` · `features/consult/BodyMapCard.tsx` ·
`visit_body_sites` table

The dermatology counterpart, deliberately the same shape of answer: where
the mouth's addressable unit is tooth + surface, the body's is **region +
aspect + side**. Site is not documentation — a steroid safe on a shin will
thin an eyelid, and distribution is itself diagnostic (palms and soles,
flexures, sun-exposed areas).

One silhouette serves both views, because a person's outline does not change
when they turn around — only the names do: chest → upper back, shin → calf,
palm → back of hand. The patient's right half is authored once and mirrored,
with a guard that **refuses to mirror any path containing an arc**, since a
sweep flag would also have to flip and the failure would be silent.

It is an honest schematic, not an illustration — 14 regions, 25 zones. If
dermatology becomes a real pilot target it wants finer regions (face split
into cheek / periorbital / perioral, hands into fingers).

### Shared presentation

Both cards render through `ChartSurface`, which puts the *same children*
inline or in a portal modal over a blurred backdrop — so there is no second
copy of either chart and no state handed across; the card owns it either way.
The expand button exists because the card column was sized for text, and
charting "36 MO" on a 25px tooth is a mis-tap waiting to happen.

Glass, depth and blur live **only on the container**. §12.1's rule is that
colour carries meaning and never mood, so the teeth and body zones keep the
flat clinical palette; the washes on the panel are near-transparent and
cannot be mistaken for a finding.

### Attachment tagging

`visit_attachments.laterality` (`left|right|bilateral`) and `.body_region`
(free text) are plain nullable columns rather than a table, because tagging
is optional metadata on something that already exists. They predate the body
map and now overlap it — `visit_body_sites` is the structured version.
**Not yet reconciled:** an attachment should probably reference a body site
rather than carry its own loose text.

---

## 14.8 Dentistry and obstetric content (2026-08-10)

Engine content, not UI — these are rows, and they change ranking.

### Dentistry

Cortex had `TOOTHACHE` and `BLEEDING_GUMS` signals and twenty referral
specialties, **none of them a dentist**. Toothache resolved to ibuprofen and
paracetamol and nothing else, which reads as *"take a painkiller"* for a
condition whose treatment is always dental.

- `Dentistry` referral intent — the 21st.
- `dental_abscess` observable + `DENTAL_ABSCESS` signal (idf 2.2, above
  toothache's 1.6 — a visible abscess is far more specific than "my tooth
  hurts"). `search_text` carries the Hindi transliterations the rest of the
  catalogue uses; a patient says *daant mein pus*.
- Abscess routes to: **Dentistry 0.90** (safety-critical — drainage,
  extraction or RCT is the cure; antibiotics only buy time), amoxicillin
  0.80, metronidazole 0.75 (anaerobic cover *alongside* amoxicillin, not
  instead of it), ibuprofen 0.70, paracetamol 0.65, and **Emergency 0.55**
  safety-critical for spreading facial-space infection — trismus, dysphagia,
  floor-of-mouth or periorbital swelling is airway-threatening (Ludwig's
  angina).
- Toothache → Dentistry 0.55, which now **outranks both painkillers**
  (0.45 / 0.35). Bleeding gums → Dentistry 0.50.

> **Deliberately not done — do not "complete" this.** No antibiotic is
> attached to plain toothache. Antibiotics do not treat uncomplicated
> pulpitis, and reflexive antibiotic prescribing for toothache is a real
> problem in Indian OPD. The antibiotics hang off `DENTAL_ABSCESS` — an
> actual infection — and nothing else. The rationale is written into the rule
> rows themselves.

### Obstetric fields

Two new `MeasureInputKind`s, both in `features/consult/measures.ts`:

**`date`**, for the LMP. This is the one field where what the doctor types
and what the engine scores are different things: a date means nothing to a
rule. `consultInput.ts` carries the date for the record and derives
**`LMP_DAYS`** for the ranking, and a `measurement_rules` row maps
LMP_DAYS 35–400 → `AMENORRHEA` (35 = a 28-day cycle plus a week's grace;
400 caps it so lactational amenorrhoea and menopause don't fire "missed
period" forever). A **future date is recorded but never scored** — a
mistyped year would otherwise run the interval backwards.

**`gpla`**, following `bp`'s precedent exactly: one control, four
measurements. Stored `"G/P/L/A"`, split into GRAVIDA / PARA / LIVING /
ABORTIONS. **Blanks stay blank rather than becoming zeroes** — a first
pregnancy is `"1///"`, and asserting P=0 asserts a fact nobody entered.
Warns when the arithmetic is impossible (living > births, or G < P+A).

New `GYNAECOLOGY` specialty profile (the 6th) shows both by default, LMP
first. Everywhere else they stay behind `RELEVANT_FIELDS` — a general OPD
doctor seeing a man should never be shown an obstetric history box.

`npm run check:obstetric` exists because the derivation is invisible in the
UI: if it broke, the LMP box would still fill in, the record would still be
right, and amenorrhoea would quietly never fire again. Confirmed
non-vacuous.

---

## 14.9 Medicine-level drug-allergy guards (2026-08-11)

Content only — **zero lines of application code changed.** `guardIntent()`
(`lib/synapse/engine.ts`) has always taken `targetType | targetClassId |
targetIntentId` and compared whichever is set against any intent, of any
type. §0's former "guards are `exercise`-only" claim was checked against
`intent_guards.target_type` alone and missed that 16 of the 20 live guards
already went through `target_class_id` / `target_intent_id` instead —
pregnancy already hard-blocks isotretinoin, doxycycline and NSAIDs;
pediatric already hard-blocks aspirin and nimesulide. The mechanism was
never the gap.

**The actual gap:** a "Known drug allergy" chip existed
(`observables.id 39` → signal `DRUG_ALLERGY`) but only ever fed an Allergy
Workup test suggestion — it doesn't say *which* drug, so nothing could
safely gate on it. No guard read it at all.

**What was added**, live migration `add_drug_allergy_guards`, purely
additive:

| Row | What |
|---|---|
| Guard: `DRUG_ALLERGY` → `warn`, `target_type = 'medicine'` | Generic net — any noted allergy softly flags *every* medicine ("confirm which one") until the doctor names it. First guard ever written directly against a `target_type`, proving that path works for something other than `exercise` too. |
| 3 new signals: `PENICILLIN_ALLERGY`, `SULFA_ALLERGY`, `NSAID_ALLERGY` | Specific, distinct from `DRUG_ALLERGY` |
| 3 new history chips | *Penicillin allergy* · *Sulfa drug allergy* · *NSAID / aspirin allergy* — `observables` 395–397 |
| New class **Penicillins** (id 8) | amoxicillin, ampicillin, cloxacillin, dicloxacillin, piperacillin |
| New class **Cephalosporins** (id 9) | all 10 cephalosporins in the catalogue |
| Guard: `PENICILLIN_ALLERGY` → `warn_hard` on class 8 | The direct fix for the amoxicillin/dental-abscess case (§14.8) |
| Guard: `PENICILLIN_ALLERGY` → `warn` on class 9 | Real but low (~1–2%) cross-reactivity — soft, not a block |
| Guard: `SULFA_ALLERGY` → `warn_hard` on intent 720 (cotrimoxazole) | The only sulfonamide antibiotic in the catalogue, so targeted directly rather than a one-member class |
| Guard: `NSAID_ALLERGY` → `warn_hard` on the existing class 1 (`nsaid`) | Reused, not duplicated |

Verified live against `arenod` (ids and joins read back after insert, not
assumed): guard ids 21–25 landed with the exact `signal_id` /
`target_class_id` / `target_intent_id` / `reason` intended; `intent_class_map`
carries exactly 5 rows under `penicillin` and 10 under `cephalosporin`;
`observable_signals` links all three new chips to their new signals.
Not re-verified through an actual browser consult this pass — the DB read-back
plus the fact that this is the identical code path already exercised by the
16 pre-existing medicine-class guards was judged sufficient; the loader
(`loadRuleset`) and `guardIntent` were also read end-to-end to confirm both
generalize over `target_type` with no `exercise`-specific branch anywhere.

**Deliberately not done:** no guard targets `aspirin` (intent 470) through
the NSAID class — it isn't a member of class 1 today (only `PEDIATRIC` guards
it directly, for Reye's). Adding it would also pull aspirin under the
`PREGNANCY` → class 1 guard, which is a real clinical nuance (low-dose
aspirin has a legitimate use in some pregnancies) this pass didn't try to
resolve — left for whoever next touches class 1 membership. No dedicated
"cephalosporin allergy" chip either; the penicillin-allergy cross-reactivity
guard covers the common real-world case, and a direct chip is a cheap
follow-up if ever needed.

---

## 14.10 Settings page, specialty self-service, and chart gating (2026-08-11)

Three connected changes, one session, Anmol's own instructions ("build a
setting page... toggle the specialty... put exact things at exact setup like
dental chart at dentist").

**`features/settings/SettingsPage.tsx`** — real page now, was a 0-byte stub.
Reachable from the sidebar. Two sections: a specialty grid (all 8 profiles,
click to switch, saves immediately) and Session (doctor pill + Log out).

**Log out moved off the sidebar, into Settings.** `SidebarNav` /
`Sidebar.tsx` no longer take or render an `onLogout` — `SettingsPage` calls
`useLogout()` itself. `sidebar.css`'s `.variant-logout` rules are gone with
it.

**Specialty is now doctor-self-service, deliberately temporarily.**
`updateHospitalSpecialtyProfile()` (`lib/db/patients.ts`) does a plain
RLS-scoped update on `hospitals.specialty_profile` — no edge function, same
`hospital_isolation` policy every other hospital write already relies on.
This is a real, on-the-record exception to "set once at onboarding, per
facility" (§5.3's own words): there's no onboarding flow and no admin panel
yet, so the doctor testing five specialties in one sitting needs a fast
switch. Both `specialtyProfile.ts`'s header and §5.3 now say so explicitly.
When the admin panel (§14.5) exists, this is a permissions change, not a
schema change — same column.

**Two new profiles: Dentistry and Dermatology** (`specialtyProfile.ts`),
eight total now. Both keep Medicines as primary (a dental or derm consult
still ends in a prescription); what's new is a third configuration axis,
`charts: ChartKind[]` (`'dental' | 'body'`), empty for every other profile.

**The two specialty-tool cards are now gated on it** — `App.tsx` wraps
`<DentalChartCard>` / `<BodyMapCard>` in `specialty.charts.includes(...)`.
This is a deliberate reversal of §14.7's original call, which shipped both
cards always-visible on purpose ("a general OPD doctor with an occasional
dental walk-in needs this exactly as much as a dedicated dental clinic
would"). In practice that meant every specialty scrolling past a tooth chart
on every patient, and precision won. Neither card changed; only whether they
mount did.

**A stale DB constraint surfaced immediately** —
`hospitals_specialty_profile_check` was a hand-maintained whitelist that
still only had five ids (`general_opd, physiotherapy, diagnostics,
cardiology, pediatrics`). It predates this session: `gynaecology` was
already missing before `dentistry`/`dermatology` were ever added, meaning
Settings would have hard-failed switching to Gynaecology too, undetected
until someone tried. Fixed by widening the constraint to all eight current
ids (migration `widen_hospitals_specialty_profile_check`). **Worth
remembering:** `specialtyProfile.ts`'s `PROFILES` map and this constraint are
two copies of the same list with nothing keeping them in sync — adding a
ninth profile needs both again.

*Check:* `select pg_get_constraintdef(oid) from pg_constraint where
conrelid = 'hospitals'::regclass and conname =
'hospitals_specialty_profile_check';` — every id in `specialtyProfile.ts`'s
`PROFILES` should appear.

---

## 14.11 The glycaemic panel, and the silent-wiring class of bug (2026-08-11)

Started as "add a blood sugar field". Turned into finding that a whole class
of failure had been running unchecked, three separate times.

### What was actually broken

`GLUCOSE_FASTING`, `GLUCOSE_RANDOM` and `HBA1C` had **live, correctly
authored `measurement_rules`** — ADA thresholds, mg/dL, the right units for
India — and **no field anywhere in the app emitting those keys.** Because
`HIGH_BLOOD_GLUCOSE` and `LOW_BLOOD_GLUCOSE` carry **zero chips** (verified:
`observable_signals` has no row for either), a number was the *only* way to
raise them. So the entire authored diabetes pathway was unreachable:

| Unreachable | Detail |
|---|---|
| 11 medicines | metformin, glimepiride, gliclazide, sitagliptin, teneligliptin, vildagliptin, empagliflozin, dapagliflozin, voglibose, pioglitazone, glibenclamide |
| 2 conditions | Type 2 diabetes mellitus · Diabetic ketoacidosis |
| 4 tests | HbA1c · FBS · PPBS · Urine Ketones |
| 1 referral | Endocrinology |
| 1 advice | Diabetic diet counselling |
| **1 safety route** | hypoglycaemia → **Emergency / immediate hospital transfer** |

Nothing was wrong with the knowledge base. Nothing ever sent it a value.

**Two more instances of the same class, found the same hour:**

- `RELEVANT_FIELDS` in `measures.ts` had a `KNOWN_DIABETES` key. **No such
  signal exists** — it is `DIABETIC`. That row had never fired, so a known
  diabetic's chart surfaced nothing.
- `lmp` and `gpla`, added by §14.8 the previous day, reached **neither print
  surface**. Recorded, saved, and invisible to both doctor and patient — the
  identical defect §10.6 had already found and fixed once for height / blood
  group / pain / ROM. It recurred within a day of the last fix.

### What was built

Three fields (`glucoseFasting`, `glucoseRandom`, `hba1c`), emitted in
`consultInput.ts`, printed on both surfaces, plus relevance rows for
`DIABETIC`, the osmotic triad (`POLYURIA` / `POLYDIPSIA` / `POLYPHAGIA`),
`WEIGHT_LOSS` and `VISION_BLURRED` (hyperglycaemia changes the lens
osmotically — blurred vision is a real presentation of undiagnosed diabetes).
Fasting glucose added to the Diagnostics profile's defaults, since a fasting
sugar is on essentially every pre-op and health-check panel.

**Fasting and random are separate fields on purpose and must never be merged.**
The rules fire at ≥126 and ≥200 respectively; 150 mg/dL is diabetic fasting
and unremarkable post-meal. One "sugar" box would have to guess which, and
guessing wrong is a wrong diagnosis in both directions.

### `npm run check:measures`

New, because every hop in `MEASURE_FIELDS → Vitals → vitalsToMeasurements →
measure key → rule → print` fails silently and three of them had. It checks
four things; two need no database and always run, two need a session.

Confirmed non-vacuous by deleting the `GLUCOSE_FASTING` emission (caught) and
by deleting the `lmp` line from `PrescriptionDocument` (caught).

**`KNOWN_UNFED` is a baseline, not an excuse.** Three keys are still
knowingly unfed and allowlisted, and the check fails if the list goes stale in
either direction:

| Key | Feeds | Why not yet |
|---|---|---|
| `MMT` | muscle weakness / atrophy / focal weakness | Graded per muscle group; belongs with the physiotherapy rebuild, where a single box would repeat the `ROM_PCT` mistake |
| `GRIP_KG` | grip weakness | Same rebuild; most Indian OPDs have no dynamometer |
| `RR` | breathlessness | A real core vital and **the cheapest remaining fix** — one field, one emission |

### The check scripts were themselves broken

Found while adding the new one. Every documented check was either dead or
vacuous **on Anmol's actual Windows machine** — they had only ever run in the
Linux container used for browser sessions:

1. **`check:dental` and `check:obstetric` could not start.** They passed
   `new URL(...).pathname` to esbuild, which on Windows yields `/X:/...` —
   unresolvable. Both now use `fileURLToPath`. Both pass.
2. **`check:search` parsed `.env` to `{}` and died.** Its regex ended `(.*)$`,
   and this repo's `.env` is CRLF; `$` cannot match with a `\r` still pending.
   Now uses the tolerant pattern the other scripts use.
3. **`check:brands` failed at the first composition.** Two overloads of
   `composition_brands` now exist in the live database (a four-argument one
   and a five-argument hospital-scoped one), so a four-argument call matches
   both and PostgREST refuses it. **The app was never affected** — it always
   passes all five (`lib/db/synapse.ts:495`) — but the script did not. Fixed
   by passing `p_hospital_id: null` explicitly. The redundant overload is
   still there and is a latent trap for any future four-argument caller.

> **The RLS trap, and why this nearly shipped as a fake check.** Every Synapse
> reference table carries `synapse_read_all USING (auth.uid() IS NOT NULL)`.
> A bare anon key is not signed in, so those reads return **zero rows and no
> error**. The first version of `check:measures` read that as "nothing
> matched": it reported almost every relevance row as broken while the rule
> check passed by examining nothing at all. A check that silently examines
> nothing is worse than no check, because it reads as coverage. It now proves
> it can read before trusting a result, and **skips loudly** rather than
> passing quietly. This is the same methodology error §14.6 records from the
> attachment work, in the opposite direction — there `execute_sql` bypassed
> RLS and made isolation look broken; here the anon key hit RLS and made
> content look missing. **Neither the `postgres` role nor a bare anon key is
> the role your app runs as.**

*Check:* `npm run check:measures` · to include the database half,
`AREN_CHECK_EMAIL=… AREN_CHECK_PASSWORD=… npm run check:measures`

---

## 14.12 Respiratory rate, and the paediatric growth foundation (2026-08-11)

### Respiratory rate — the last cheap dead key

`RR` had a live rule (≥22 → `BREATHLESSNESS`) and no field. Now a real field,
emitted, printed on both surfaces, relevant on breathlessness / cough / wheeze
/ cyanosis / stridor, and **on by default for Paediatrics only** — counting
breaths is the first thing WHO IMNCI asks for in a child with cough, and fast
breathing is what separates pneumonia from a cold.

> **The warning band is adult-only, deliberately, and it is written into the
> code.** Normal respiratory rate is profoundly age-dependent — WHO IMNCI
> calls breathing fast at ≥60/min under 2 months, ≥50 to 12 months, ≥40 to 5
> years, ≥30 above. `MeasureField.warn` receives **only the typed string**; it
> cannot see the patient. Warning on every healthy infant would be textbook
> alert fatigue, so the band says "for an adult" and paediatric thresholds are
> left to the doctor. Fixing this properly means giving `warn` patient
> context — the same change the growth work needs, and the natural time to do
> both.

Only `MMT` and `GRIP_KG` remain unfed, both allowlisted with reasons in
`check:measures`.

### The WHO growth engine

`lib/growth/` — `whoStandards.ts` (generated), `growth.ts` (the maths),
`age.ts` (date of birth → months), `npm run check:growth`.

**The data is real and its provenance is recorded.** WHO Child Growth
Standards 2006, expanded z-score tables, fetched from `cdn.who.int` on
2026-08-11 by `scripts/extract-who-standards.mjs`, which is committed so the
fetch is repeatable. Weight-for-age and height-for-age, both sexes, 0–60
months. **These were NOT written from memory** — inventing percentile tables
would produce confident, wrong numbers on real children, which is worse than
having no growth chart. The extractor sanity-checks its own parse against
WHO's published medians (boys birth weight 3.3464 kg, girls 3.2322, birth
length 49.8842 / 49.1477) and refuses to write the file if they do not land.

Monthly samples, interpolated at runtime: 6.7 KB instead of ~11,000 numbers,
and L/M/S are smooth enough in age that the error is far below anything a
decision turns on.

Two behaviours worth knowing:

- **It refuses rather than extrapolating.** Age outside 0–60 months, a
  non-finite input, or a value ≤ 0 returns `null`. Past five years these
  curves were never fitted, and a confident percentile from an unfitted curve
  is a clinical assertion nobody made.
- **WHO's ±3 SD tail correction is implemented, and it is not optional.**
  Beyond ±3 SD the Box-Cox tail is fitted to almost no children, so WHO
  rescales it linearly off the 2–3 SD band. Without it a severely wasted
  2-year-old reads −7.5 SD instead of −6.0 — squarely in the range where the
  number changes management. Applied to weight-for-age only; WHO does not
  apply it to height-for-age, and `check:growth` asserts that asymmetry.

*Check:* `npm run check:growth` — 72 of WHO's own published SD values must
round-trip to their own z-score, plus refusal, boundary and tail cases. The
fixtures are the `SD2neg` / `SD0` / `SD2` columns this codebase deliberately
does **not** ship, so the check is independent of the data it validates.
Confirmed non-vacuous three ways: flipping the sign of `L` (46 failures),
disabling the tail correction (the two tail assertions, with the linearity
test showing unequal steps — exactly the signature), and corrupting a single
LMS row (caught at that one age).

> **A note on writing checks.** An earlier draft of `check:growth` asserted
> that a severely underweight child's z would be greater than −6. It failed on
> correct code: 5.5 kg at two years really is about −6 SD. The fix was to test
> the algorithm's **defining property** — that the corrected tail is linear,
> so equal weight steps give equal z steps — instead of the author's guess at
> a magnitude. Assert the property, not the number you expected.

### Date of birth

`patients.date_of_birth`, **nullable** (migration
`add_patients_date_of_birth`). `patients.age` stays required and is still what
everything reads; DOB is purely additive, so every existing row and every
existing code path is untouched.

It exists because the growth standards are indexed per month and an integer
year cannot express that: a 3-month-old and an 11-month-old are both `age: 0`,
across a span where WHO's median weight runs 3.35 kg to 9.4 kg. Deriving DOB
from `age` would be the same rounding, hidden.

Wired into **all three intake surfaces**, on Anmol's instruction — reception
is where a birth date is actually known, so Cortex-only would have been the
wrong half:

| Surface | |
|---|---|
| `components/PatientModal.tsx` | Cortex intake |
| `frontdesk/components/CreateVisitModal.tsx` | Front Desk new visit (i18n: `fldDob`, English + Hindi) |
| `frontdesk/components/patients/EditPatientModal.tsx` | where a missing DOB gets filled in later — every patient predating the column has none |

Two rules hold on all three:

1. **Optional always; flagged only for an under-five** (`dobMattersFor`, ≤5y —
   the exact window WHO's standards cover). Amber and worded, never a blocking
   `*`. A prompt that fires on every adult is one receptionists stop reading.
2. **The age field follows the date, never the reverse.** A date is the harder
   fact; asking for both independently guarantees they drift.

The lower bound (`> 1900-01-01`) is a DB constraint; "not in the future" is
validated in the app, because a CHECK constraint cannot call `current_date`
(Postgres requires IMMUTABLE). Stated here so nobody assumes the database is
enforcing something it is not.

### The chart, and the engine wiring

`features/consult/GrowthChartCard.tsx` — WHO reference curves (−3, −2, 0, +2,
+3 SD) across the whole 0–60 month window, weight-for-age or height-for-age,
with this visit plotted on them. Gated to Paediatrics via
`SpecialtyProfile.charts` (`"growth"`), expandable through `ChartSurface` like
the other two.

It reads weight and height **straight off `vitals`** rather than holding its
own copy — two renderings of one number is how a consultation ends up with two
different numbers, the same reason the vitals strip left `PatientHeader`.

The reference curves are drawn by binary-searching `growthZ` rather than
reimplementing the LMS inversion, so the curve a dot is judged against and the
z-score printed beside it cannot disagree. Slower, and completely irrelevant at
61 points × 5 curves recomputed only on metric/sex change.

**`WAZ` is now an engine input**, derived in `consultInput.ts` — migration
`add_growth_zscore_measurement_rules`:

| Rule | Raises |
|---|---|
| `WAZ` below −2 | `GROWTH_FALTERING` @ 0.800 |
| `WAZ` below −3 | `GROWTH_FALTERING` @ 1.000 |

Overlapping on purpose: `resolveSignals` keeps the highest weight seen, so a
child at −4 SD matches both and the 1.0 wins — severity gets a gradient
without a second signal. That finally makes the six rules behind
`GROWTH_FALTERING` (Paediatrics referral, Failure to thrive, CBC, TSH, Serum
Zinc, Stool Reducing Substances) follow from a measurement instead of from a
doctor eyeballing a curve and ticking a chip.

**`HAZ` is computed and recorded but ranks nothing.** Stunting has no signal in
this knowledge base, and minting one means authoring its clinical consequences
too — content, not wiring.

**The derivation is NOT gated by the chart.** `charts` hides the panel only;
`consultInput.ts` emits WAZ on every consult that has a date of birth and a
sex. A general physician seeing a malnourished child still gets the
failure-to-thrive workup ranked — they simply aren't shown a growth curve for
every adult.

Verified through the real `buildEngineInput`: median weight → WAZ 0.03; 9.5 kg
at 24 months → −2.16 (fires at 0.8); 7.0 kg → −4.57 (fires at 1.0); and all
three refusal paths — no date of birth, sex "Other", and a 7-year-old — emit
nothing at all.

### 🔴 The stale dependency list, found while wiring this

`useConsultIntelligence`'s engine memo listed vitals fields **individually**,
and that list had stopped at the original five (`bp`, `pulse`, `temp`, `spo2`,
`weight`). Every field added since — height, blood group, pain, ROM, LMP,
G-P-L-A, the glycaemic panel, respiratory rate — **did not re-run the engine
when it changed.**

So entering an LMP raised no `AMENORRHEA`, and entering a random sugar raised
no `HIGH_BLOOD_GLUCOSE` — the pathway §14.11 had just finished unblocking.

It hid for so long because it **self-heals**: `observableIds` is also a
dependency, so adding any chip after typing the number recomputes the memo with
current vitals. It only ever failed when a measurement was the **last or only**
thing entered — which is exactly what a doctor does when they take a sugar on a
patient whose chart is already filled in.

Fixed by keying on `JSON.stringify(vitals)` instead of an enumeration. That
makes the failure **structurally impossible** rather than merely fixed: there is
no longer a list that can fall behind `MEASURE_FIELDS`. A dozen short strings
per keystroke costs nothing next to the engine run it guards.

> Third instance today of the same shape — an authored thing on one side, a
> hand-maintained list on the other, and nothing checking they agree. Where a
> check can't reach (React dependency arrays), prefer a construction with no
> list at all.

**Still to build:** the serial view across past visits. One visit is a dot;
faltering is a *direction*, and `visit_measurements` already holds the history
to draw it. The card says so in words rather than letting a single point imply
a trend.

---

## 14.13 UI polish — first pass (2026-08-11)

Anmol's brief, verbatim in substance: *"look how much white space and
terrible spacing there is. Terrible box-like spacing, anything scattering
anywhere... how much small their icon is looking right now... how much gray
they are... keeping in mind that doctor's PC could be low grade also or maybe
with a small screen. I don't want to reshuffle everything."*

Taken as four separate problems, because they are. **Nothing was moved** — same
bands, same columns, same order, same components.

### The grey was a defect, not a preference

`--cs-faint` measured **2.56:1** against a white card. That is a WCAG failure,
not a taste call, and it was carrying real content: attachment sizes, empty
states, relevance hints, tick labels. On the dim, low-grade panel a clinic
actually owns, in a bright room, that text was close to invisible.

Both text greys are now set by **measured** contrast rather than by eye:

| Token | Was | Now | Contrast on white |
|---|---|---|---|
| `--cs-muted` | `#64748b` | `#55647c` | 4.76 → **6.00:1** |
| `--cs-faint` | `#94a3b8` | `#68778d` | 2.56 → **4.55:1** |

Both clear AA for body text. The three-step hierarchy (ink / muted / faint)
survives — faint still reads as secondary, it simply no longer achieves that
by being unreadable. One token change, every card lifted at once.

> The rule now written into the file header: **assume the doctor's monitor is
> not yours.** Pick greys by ratio, not by how they look on the machine the
> CSS was written on.

### "Scattered boxes" had a specific, findable cause

`consult.css` used 4, 5, 6, 7, 8, 9, 10, 12, 13, 14, 16 and 20px more or less
interchangeably. Every value was defensible in isolation; together they left
the page with no rhythm — and the eye registers a broken beat long before it
can name the cause, which is exactly why the complaint arrives as "everything
is scattered" rather than as a measurement.

One 4px scale now drives the layout (`--cs-s1`…`--cs-s5`), applied to the page
padding, all three band gaps, the body/engine grids and the card header. The
steps are deliberately tight: the philosophy doc asks for high information
density and low *visual* density, and the whole consult has to fit a 1366×768
clinic screen. Air was never the goal; consistency was.

### Icons and hit targets were genuinely too small

Named tokens (`--cs-icon-sm`, `--cs-icon-md`, `--cs-hit`) so no card can
quietly drift smaller again. Card title glyph tiles 22 → 26px with 14px icons
throughout (7 cards). Text floor raised to 11px — 16 declarations sat at
10–10.5px.

The attachment card, called out by name: its file-type icon was a 14px glyph in
the failing grey, floating in the row. It is now a **32px tinted tile**, the
row has real padding, the icon-only actions went 24 → 30px (24 was under a
comfortable pointer target with no surrounding padding), and the file name and
size both moved up a step and off `--cs-faint`.

### Where the white space actually came from

`.cs-empty` carried 44px of vertical padding *inside* a column already pinned
to a fixed 540px (`--cs-engine-h`). That is not breathing room, it is a hole —
and the shorter the message, the larger the hole looked. Now centred in
whatever space exists rather than reserving a stadium around itself.

### Deliberately not done

Roughly 40 internal gaps (chip rows, dose fields, sheet internals) are still
off-scale. Stopping was the point: Anmol owns visual verification for this
session, and sweeping dozens of unverifiable spacing changes across surfaces
nobody has looked at is how a polish pass turns into a regression hunt. The
foundation — tokens, contrast, floor, rhythm — is in; the next pass should run
with eyes on the screen.

---

## 15. Further reading

- ★ `aren-cortex-ui-doctrine.md` — **read this before touching the consult
  screen.** The UI/UX architecture and the reasoning behind it, split out of
  this atlas 2026-08-12 because the atlas had grown to mix edge functions and
  RLS with design decisions. It argues that the screen's problem is
  structural (SOAP used as a layout, everything visible at once, specialty
  used as the gate instead of the encounter) and that visual work cannot fix
  it. It also records what was already tried and failed.
- `aren-technical-atlas.md` — the whole-repo map (both workspaces, auth, data
  layer, Front Desk's intake-alias layer over the shared `observables` table).
- `aren-architecture-handoff.md` — product philosophy, the Visit object,
  Universal Cortex, Solo Mode. Read for *why*.
- `Aren cortex visual philosophy.md` + `Aren Cortex Mock 2.png` — the layout law
  the consult screen is built to. "Configure, never redesign."
- `confirmed-conditions-investigation.md` — the open design question: making a
  confirmed condition a durable patient fact. Findings and a proposal; not built.
- `referance (synapsev2)/Synapse v2 handoff .md` — the sandbox-side doctrine for
  the engine itself: the guard philosophy (§14 there), the personalisation model
  (§10a there), the migration checklist this port followed. **Read before
  changing anything under `lib/synapse/`.**

**Deleted 2026-08-14** (§14.17), as pure noise once the docs above and
`aren-technical-atlas.md` said everything they still had to say: `aren-cortex-workspace-design.md`
and `aren-cortex-redesign-plan.md` (both already marked historical-only above
— the three-column workspace they specified was torn down), `Coretx File
Str.md` (a 2026-08's-predecessor file tree, superseded by §1's own "Where it
lives" table since the day this atlas was split out), and `Authentication &
RLS Implementation Plan.md` (described a pre-auth, RLS-off state that §8 of
`aren-technical-atlas.md` says has been false since 2026-07-19 — auth and RLS
are both live). If any of the four is needed again, `git log` on this repo
still has them.

*End. Update this document when the consult screen changes shape again — at
minimum §5 (the screen), §10 (defects), §11 (the diff) and §13 (where-do-I-change-X).*

---

## 14.14 Session 2026-08-12 — SOAP layout, brand-first medicines, add-sheet

Worked with a live browser this session. Several "UI polish" items turned out
to be defects that only a rendered page reveals — recorded here because the
pattern will repeat.

### Defects found by looking, not by reading

1. **`.cs-picker { min-height: 196px }`** — a second height floor. An earlier
   pass removed `.cs-work .cs-picker` and reported cards as content-driven;
   they were not. Every empty picker still reserved ~60px.
2. **`.cs-shell { overflow: hidden }` disabled `position: sticky`** for every
   descendant, so the summary rail silently scrolled away. Now `overflow:
   clip`, which clips to the radius without creating a scroll container.
3. **Measurement placeholders read as recorded vitals** — `120 / 80` at value
   weight in mid-grey. Now much fainter and at normal weight.
4. **`.cs-print` / `.cs-review` had no `:disabled` style**, so an empty plan
   got the browser's wash over solid navy/teal and read as broken.
5. **BP clipped to `12(/ 80`** at a single grid cell. Two-input fields now
   carry `.is-wide` (`grid-column: span 2`).

### `search_intents` — 46% of the catalogue was unreachable

The brand branch joined `... having count(*) = 1` over
`medicine_composition_map`, so **only single-composition medicines were
searchable by brand**. 98,306 of 213,145 products (46.1%) were invisible —
every combination. `Acenac-P`, `Acenac-MR`, `Combiflam`, `Zerodol SP` all
returned nothing while plain `Acenac` worked.

Fixed in two migrations. The second matters: a combination maps to N
compositions and one must be chosen, and `is_primary` **cannot be trusted**
(Acenac-P has it `false` on both rows; Acenac-MR Tablet has it `true` on
two). Leadness is inferred from **rarity** instead — the composition carried
by the fewest brands is the characteristic one, because that is what makes
the combination distinctive. Paracetamol is in tens of thousands of products,
aceclofenac in far fewer. Verified: `acenac-p` → aceclofenac, `combiflam` →
ibuprofen.

> Still imperfect: `zerodol sp` resolves to drotaverine rather than
> aceclofenac. The real fix is for search to return **medicines** rather than
> compositions, so a brand carries its whole composition list instead of
> collapsing to one.

### Brand is the headline. Always.

Standing rule, from Anmol 2026-08-12: **in every surface, the brand name is
primary and the composition is the subtitle — never the reverse.** The doctor
prescribes a product and the patient buys a product. A search for "Acenac-P"
that answers "aceclofenac" makes the doctor wonder whether what they typed
exists. Applied in `IntentSearch.tsx` (brand-matched hits) and
`MedicineAddSheet.tsx`.

### `MedicineAddSheet` — the confirm step

`+` used to commit a medicine with the resolver's brand and the composition's
default dose. It now stages: `handleAcceptIntent` sets `pendingMedicine`
instead of calling `commitAccept`, and the sheet confirms brand, strength,
dose, slots, duration and timing in one place. Confirm commits, then applies
the dose over the default one frame later.

### Layout

The consult screen is SOAP top-to-bottom in a left column, with a summary
rail on the right — see the band comment in `consult.css`. Plan holds two
placeholders whose CONTENT comes from `specialty.primary` (`planSlots` in
App.tsx). **That wiring is new**: `primary`/`primaryLabel`/`sections` were
previously read only by the Settings page, which printed them as a
description while the consult screen rendered hardcoded medicines — so
Physiotherapy was told "Exercise Plans primary" and shown Medicines.

### Open

- Ranked medicine row still needs restructuring to Ref2 (`docs/temp/`):
  rank badge · brand · molecule · relevance bar · heart · add, alternates
  below. Currently cluttered at the right edge.
- ~~`MedicineAddSheet` is **not browser-verified**~~ Anmol reviewed it
  2026-08-13 and likes it — see doctrine §6. (Its 2026-08-14 additions —
  circles, food-instruction pre-fill, blue confirm — are a fresh
  not-yet-verified layer on top; §14.17.)
- ~~Findings ranking: `examSuggestions.ts` runs on every chart change and
  nothing consumes it; `signal_finding_suggestions` has 10 rules against
  1,577 intent rules.~~ **Wired 2026-08-13** as Related Findings (§8 of the
  doctrine, `CaseSheet`'s `related` prop) and the rule count is **537** as of
  2026-08-14, not 10 — see doctrine §3's correction box. The open question
  is now content quality (527 rules added 2026-08-12, unaudited), not wiring.

---

## 14.15 Session 2026-08-13 — General OPD as its own screen, and three bugs
           that were structural rather than cosmetic

Driven from the browser throughout. Every defect below was found by loading
the page, and none of them were findable by reading the code — which is the
same lesson §14.14 recorded and the same one this session had to relearn
twice before it stuck.

### The three bugs

**1. Combinations could not be prescribed. At all.**

`composition_brands` states its own rule at `lib/db/synapse.ts:448`: a brand
is only offered when the product contains that molecule ALONE, filtering on
`ingredient_count = 1`. So the resolver behind every accept was structurally
incapable of returning a combination. A doctor could search "Acenac-P", see
it in the results, press the button, and get either a different
single-molecule product or nothing: `resolveBrandFor` returned null, the
sheet opened with no brand, and `commitAccept` deleted the intent again on
confirm.

Combinations are a large share of Indian prescribing and are frequently the
correct choice — aceclofenac with paracetamol answers pain and fever in one
product. This was most of a working day, not an edge case.

Fixed with `lib/db/medicines.ts`, which sits BESIDE `composition_brands`
rather than replacing it: the ranked list keeps its single-molecule filter,
because there the engine genuinely scored one molecule, and every product the
doctor NAMES is resolved whole. `AcceptPayload.brandHint` carries the typed
name through. `Medicine.compositionIds` carries every molecule back.

Two measurements that shaped the implementation, both taken against the live
catalogue:

  * `medicine_composition_map` has NO `strength_mg` column. An earlier
    version selected it and every call threw.
  * `.ilike("name", "acenac%")` is CANCELLED BY THE STATEMENT TIMEOUT on
    213,145 rows. `.eq("name", ...)` returns in ~730ms. Exact match is not a
    compromise here: `search_intents` returns the row's own name.

The RPC's rarity heuristic also picks the MINOR ingredient far more often
than the major one — "Acenac-MR" comes back as thiocolchicoside, "Acenac-N"
as pregabalin — so the search row now resolves and prints every molecule
rather than the one the RPC chose.

`npm run check:combos` verifies the whole path. It needs credentials: the
catalogue tables return zero rows to an anonymous client while
`search_intents` is SECURITY DEFINER and answers anyone, and that asymmetry
is exactly how this hid for so long.

**2. Recommended medicines never showed the confirm sheet.**

`handleAcceptIntent` short-circuited on `payload.type !== "medicine" ||
payload.medicine`. The ranked list always resolves a brand before calling, so
every RECOMMENDED medicine skipped `MedicineAddSheet` entirely and landed on
the prescription at the composition's default dose with nothing shown. Only
searched medicines, which arrive without a product, got the sheet. The dose
is a clinical decision on every route to a prescription.

**3. Saving a prescription was impossible. 403, every time.**

`POST /rest/v1/prescriptions` → `42501: new row violates row-level security
policy`. The insert never set `hospital_id`, which exists on that table and
is what its RLS policy checks. It went in NULL and the WITH CHECK failed.

The shape of this one is worth remembering: step 1 marks the visit
`completed`, step 2 inserts the prescription. So a failed save left the visit
closed with no prescription attached. `prescription_medicines` and
`diagnostic_orders` have no `hospital_id` and scope through the parent, so
only the one insert needed the field.

### General OPD is now its own screen

`specialtyProfile.ts` says "there is no per-specialty branch anywhere in the
render tree". That is now false, deliberately, and the reasoning is in
`aren-cortex-ui-doctrine.md` §8: configuration can change what goes INSIDE a
module but can never remove a module another profile requires, and removing
modules was the whole task. Every other profile still renders the shared SOAP
column untouched until its own turn.

What the screen is now: a page-level command bar, then a fixed-height row of
Case Sheet │ Measurements over Attachments, then a two-column Assessment
(ranked left, confirmed right), then the plan panels.

`ROW_BUDGET` in `CaseSheet.tsx` is the load-bearing idea. Each group gets a
budget in CHIP ROWS (history 1, reported 2, examined 2, related 2) and
overflow goes to the browse modal rather than down the page. Nothing in that
row grows, because the panel directly below it is the Assessment.

### Smaller things found by looking

  * `.cs-meas.is-suggested` was `background: #fcfdff`, white to within a
    rounding error. The relevance engine had been working and invisible.
  * The brand drawer closed on its own scroll: a bare capture-phase `scroll`
    listener treated `.cx-sheet-list` scrolling as the page moving, so the
    doctor could not scroll to a brand without dismissing the list.
  * `prescription_medicines.composition_ids` was written as
    `[brand.compositionId]` against a column documented as "all composition
    IDs", so a combination entered the record as a single molecule and its
    second drug was invisible to duplicate checking.
  * `MedicineAddSheet` hard-sliced brands to 8 of the 30 fetched, on the one
    panel whose job is choosing between them.
  * Small menus had no outside-click close at all — `useDismiss` now serves
    all of them.

### The prescription is TWO components

`ReviewModal.tsx` renders an on-screen preview AND mounts
`PrescriptionDocument.tsx` off-screen at `left: -9999px`. The second is what
feeds print, PDF and WhatsApp — it is the document the patient receives.

Styling one does nothing to the other, which cost a round trip this session.
**If you are changing what a patient sees, change `PrescriptionDocument`.**
Collapsing the two is worth doing and has not been done.

### The clinic accent was overridden, not underused

`hospitals.accent_color` was blended into hardcoded `#7c3aed` and `#ec4899`
in the accent rule, and the specialisation pill was hardcoded pink outright.
A clinic choosing forest green got green fading through purple into pink, so
every clinic's prescription looked like the same violet house style.

`lib/brand/accent.ts` derives a ramp from the single stored hex, because one
colour cannot serve a heading, a hairline and a tinted band. `ink` is
CONTRAST-CLAMPED against white: a clinic choosing `#facc15` gets headings at
`#8f7306`. Brand expression stops where legibility starts, because this
document is printed on cheap stock. `components/RxMarks.tsx` holds
stroke-based SVG that takes any hue and survives greyscale.

### Open

- The print document's new look is **not browser-verified**. It builds and
  type-checks; it has not been seen rendered.
- ~~Ranking combinations by coverage is not done... `fetchCombinationProducts`
  is written and deliberately unwired.~~ **Wired 2026-08-14 — see §14.17.**
  A combination is now OFFERED as an alternate under the ranked molecule it
  contains (still not itself scored as answering two needs — that remains
  future work, see §14.17's own "Open"), and a molecule with no standalone
  product can be prescribed directly from its best combination.
- The whole screen is tuned such that it reads best at ~80% browser zoom on a
  14" display, which means the type and spacing scale is one step too large
  at 100%. Needs a deliberate density pass, not per-card nudges.
- With a rich chart every visible measurement cell is tinted at once, and a
  mark that applies to everything marks nothing. Needs a cap or a
  most-recently-raised rule.

---

## 14.16 Session 2026-08-13b — the General OPD visual pass

Brief: *"better fonts, no greyscale texts, better contrast and better visual
hierarchy and less dead white space even in the cold start and blank state."*

Driven from the browser at **1422×595**, which is the viewport this account
actually renders at (1920 panel, 135% Windows scaling). That number matters:
it is a *short* screen, and almost every finding below is a finding about
vertical space rather than about colour.

**Nothing moved.** Same modules, same order, same columns. This is the pass
`aren-cortex-ui-doctrine.md` §0 says cannot fix a structural fault — and it
is only being run because §8 fixed the structural fault this morning.

### The type ramp was being written and then thrown away

`index.html` requested `Inter:wght@400;500;600;700` — four static cuts —
while `consult.css` sets **450, 480, 520, 550, 600, 620, 640, 650 and 660**
across the workspace. Every one of those snapped to the nearest of the four,
so a card title at 700 and a measurement value at 640 rendered *identically*
and the weight hierarchy collapsed into three visible steps. Nine authored
weights, three rendered.

Inter is now requested with its `wght` and `opsz` axes. Verified by
measuring rendered text width at each weight — 400/450/500/550/600/620/650/700
now give **eight distinct widths** (301.3 → 318.5px at 40px), where before
they gave four.

`font-optical-sizing: auto` rides the `opsz` axis, which matters here because
nearly all of this screen is 11–13px. `cv05` and `cv08` are on globally: they
give lowercase `l` a tail and uppercase `I` serifs, so `l / I / 1` stop being
three identical strokes on a surface that prints drug names. Clinical numerals
(measurement inputs, dose fields, counts) get `tabular-nums slashed-zero`.

> This is the reason to check a *rendered* page rather than the stylesheet.
> Every one of those nine weights is correct in the CSS.

### "Greyscale text" was an allocation problem, not a colour value

The 2026-08-11 and 2026-08-12 passes both moved the grey ramp darker and both
were told it still read grey. They were tuning the wrong variable: the ramp had
**three rungs doing four jobs** — content, secondary content, structural
micro-labels (`RANKED CONDITIONS`, `Reported`, `BP (mmHg)`) and ornament. Labels
and ornament shared `--cs-faint`, so the words giving the page its skeleton
rendered at the same weight as the apologies in the empty states.

A fourth rung, `--cs-label`, splits them. The ramp moved one more step down with
it: muted 12.1:1, label 8.9:1, faint 6.8:1 on white. Every rung keeps blue ~40
above red, so nothing on this screen is actually a neutral grey — a true grey on
a faintly cool ground is what reads as washed out even when the ratio passes.

Then sentences a doctor is meant to READ moved off the ornament rung: empty-state
bodies, the Ranked Conditions honesty line, attachment hints, relevance words.

**The one deliberate exception is the measurement placeholder**, which stays at
`#dbe1ea`. §14.14 found `120 / 80` reading as a recorded vital at a glance. A
placeholder that passes a contrast check is a placeholder that lies about
whether the patient has been examined.

### Hierarchy: everything was tier 1, so nothing was

Six modules rendered their titles identically (13.5px/700/uppercase/ink, 26px
tinted glyph), so ATTACHMENTS shouted exactly as loudly as ASSESSMENT.

- **Tier 1** — where the consultation is reasoned: Case Sheet, Measurements,
  Assessment, and the two ranked panels.
- **Tier 2** (`.cs-card-head.is-utility`) — Attachments: 12px/650 on the label
  rung, 22px glyph. Still present, told to stop competing.
- **The Assessment** gets a stronger edge and one more degree of lift. Border
  and shadow, not an accent band — structure survives greyscale and does not
  spend a meaning-bearing colour on "this one matters".
- **Clinical Suggestions wore a nav tab.** `.cs-sug-tab` was violet, underlined
  and anchored to the card's bottom edge — tab-strip language, on a panel with
  no second tab, in the colour that already means *assessment* two cards above.
  It is a card title with a slate glyph now, so the two plan panels read as
  siblings.

### Where the cold-start white space actually was

Measured with a patient open and nothing entered:

| | |
|---|---|
| command bar helper line | 27px, saying at the top of the page what the empty Case Sheet says 200px below it |
| `0 / 0 shown` | 31px of footer counting nothing, on the card whose only state is empty |
| `.cs-empty` padding | 20px top and bottom, ×4 panels on screen at once |
| plan rail blank state | pinned to the top of a full-height column, ~180px of white under it |

Row 1 came to **372px and the Assessment header sat below the fold** — the
doctor could not see the panel the whole screen is built around without
scrolling to it. That is the real cost, and why this was not cosmetic.

After: row 1 **338px**, document **1207 → 1079px**, and the Assessment header
plus its first ranked rows are on the first screen.

Two rules came out of it:

- **An empty panel should be SHORT, and what is in it should be CENTRED IN
  WHAT IS LEFT** rather than reserving a stadium. Applied to `.cs-empty`, the
  plan rail (`:has(> .cs-plan-empty)`) and the Selected/Confirmed column.
- **Where a void CANNOT be removed, fill it rather than float in it.** The
  Case Sheet is height-locked to the column beside it (§14.15), so its blank
  state has ~300px it cannot give back. A 62px drawing floating in that is what
  made the void read as an accident; the drawing is 104px now with an ink
  heading above the line. This is the documented exception to BlankArt.tsx's
  44–62px cap, and the reason is written in the file.

### Found by looking, again

`ConditionsCard`'s `ROW_H` was **46 against a real row of 52.9px**, so the
collapsed box came to 184px over 212px of content and **the fourth ranked
condition was sliced a quarter of the way through**. The constant carried a
comment saying it was "measured rather than guessed" — it had simply gone stale
and nobody had looked. Now 53, and four rows end on an edge.

### Open

- Only General OPD was eyeballed. The shared SOAP column inherits the token,
  `.cs-empty` and `.cs-sug-head` changes — all improvements on paper, none
  browser-verified on that profile.
- The Case Sheet void is reduced, not removed. Removing it means relaxing the
  row-1 height lock when the sheet is empty, which trades a void for a
  one-time reflow when the first chip lands. Not attempted.
- `:has()` carries the plan rail's centring. Chrome-only concern in practice;
  the fallback is the previous top-anchored layout, so it degrades quietly.

---

## 14.17 Session 2026-08-14 — combination ranking wired, search's brand
           priority fixed at the root, add sheet finished

Picked up on a fresh machine from `SESSION-HANDOFF.md`, a temporary file
written to move this session across machines without losing what the
previous one had already established — including live database numbers.
That file is now folded in here (this section, plus the corrections to
§14.14/§14.15's "Open" bullets and doctrine §3/§6 above) and deleted, per
its own instruction. Not browser-verified against the running app — no
doctor login was available in this environment. Verified instead with
`tsc -b`, `vite build`, static renders of new markup against the real
stylesheet, `npm run check:search` / `check:brands`, and read-only SQL
against the live database. **Open the browser before trusting any of
this**, per §7 of the doctrine — the same lesson every session before this
one had to relearn.

### The add sheet, finished (doctrine §6)

`doseFieldValue` (already committed the session before, in `brands.ts`)
wired into `MedicineAddSheet`'s re-seed effect and its strength-variant
click handler — the doctor no longer retypes a dose already in the product
name they just picked. A new `features/consult/dosing.ts` adds a
documented, conservative static map from composition name to a default food
instruction (NSAIDs after food, PPIs/sulfonylureas before food,
levothyroxine/bisphosphonates empty stomach, metformin after food) — there
is no food-instruction column anywhere in the schema (confirmed live
2026-08-14: `compositions` carries only `id`, `name`,
`specialization_scope`; `medicine_composition_map.route` is the dosage
FORM, not a timing), so this stays a PRE-FILL the doctor can change, never a
guard. The four Morning/Afternoon/Evening/Night buttons became the ●○●○
circle notation doctors already write by hand — filled when on, a small
label under each so the notation is learnable, same underlying `"1-0-1-0"`
slot string. `.cs-addmed-confirm` moved green → blue: it stages a medicine
onto the plan, which has not been taken yet, and the colour law (doctrine
§5 / §12.1 below) reserves green for TAKEN and blue for THE ACTION.

### Combination ranking wired — the "very big flaw"

Anmol, on this being unwired: *"That's a very big flaw."* `fetchCombinationProducts`
(`lib/db/medicines.ts`) was written 2026-08-13 and called from nowhere —
§14.15 flagged it as dead code. It is wired now, without touching the
engine, which still ranks compositions and stays pure:

- `useConsultIntelligence.ts` fetches combination products for every ranked
  (and companion) composition, cached by composition id, same
  async/never-blocks-the-ranking shape as the existing brand fetch.
- `RecommendationsCard.tsx`: a ranked molecule now offers its combination
  products as alternates on the open row, **fewest extra molecules first**,
  each stating every molecule it carries on the chip itself — never only a
  tooltip, the same rule `MedicineAddSheet`'s brand list already followed. A
  molecule with **no standalone product** — previously a dead end needing a
  manual search — now offers its best combination directly as the row's
  primary, with a real Prescribe button, for the first time.
- **The safety-critical half.** A combination carries molecules the engine
  never scored, so its guard verdict cannot come from the one composition
  it happens to be filed under. `lib/synapse/engine.ts` gains two pure
  functions — `medicineIntentIndex` (composition id → the catalogued
  medicine intent for it, the reverse of how `rs.intents` is keyed) and
  `guardCombination` (the worst status and every reason across ALL of a
  product's molecules, via that index) — neither imports React or Supabase.
  A hard verdict on ANY combination offered under a row locks the WHOLE
  row — every alternate, single-molecule or combination — until it is read
  and acknowledged, the same mechanism the engine's own hard warnings use.
  This is doctrine rule 11 (§14 below): nothing reached by any route may
  show a weaker warning than the ranked list would give it directly.
- The identical gap existed in the manual search path: `IntentSearch.tsx`
  computed a hit's verdict from only the ONE composition `search_intents`
  matched through, even when the resolved product carried more. Same fix
  applied there, reusing `guardCombination`.
- Two smaller correctness fixes the wiring forced into view: `chosenFor()`
  in `RecommendationsCard` only ever searched the single-molecule brand list
  when redrawing an already-accepted row, so an accepted combination would
  have displayed under the wrong brand name — it now searches both lists. A
  combination handed to the accept flow directly (from either surface
  above, with no typed brand name) now heads its own brand list in the add
  sheet, matching the treatment a brand-searched combination already got —
  otherwise it opened correctly selected but never showed as "chosen"
  anywhere in its own picker (`App.tsx`'s `handleAcceptIntent`).

### `search_intents` — the brand-priority bug was in the database, not the app

Task 2, "brand is the headline in search," turned out to need **zero app
code changes**. `IntentSearch.tsx` was already rendering brand-first
correctly — verified while fixing the above. The actual bug was upstream,
in the `search_intents` Postgres function itself, and no amount of reading
`IntentSearch.tsx` would ever have found it.

The function computes a `by_label` hit (query matches a composition's own
name) and a `by_brand` hit (query matches a real product's name) as
separate rows, then keeps exactly one per intent via `distinct on (m.id)
order by m.id, m.provenance, m.score desc`. Provenance was `label=1,
symptom=2, brand=3` — so whenever BOTH fired for the same intent, the LABEL
match won and the brand match, `via_label` included, was discarded before
it ever reached the app. Confirmed live: typing "ace" returned bare
"aceclofenac" even though "Ace-P Tablet" — a real, prescribable product —
matched too. Not an edge case: most Indian brand names are prefixed by
their own molecule ("Acenac" / aceclofenac, "Acer" / cefadroxil, "Ace-TH" /
thiocolchicoside — all four turned up in one `search_intents('ace', ...)`
call), so this collision is closer to the common case than the rare one.

Fixed live, with Anmol's authorisation, by
`CREATE OR REPLACE FUNCTION public.search_intents(...)` — migration
`search_intents_prefer_brand_over_label`. The only change: the three
provenance literals became `brand=1, symptom=2, label=3`, so a brand match
wins whenever one exists for the same intent. Same signature, same output
columns, every other clause byte-identical. Verified after, read-only:
"ace" now surfaces "Ace-P Tablet" (brand) for aceclofenac; "dolo" is
unchanged (was already all-brand, nothing to collide with); a pure molecule
search like "metformin" still correctly returns the composition when no
brand collides with it.

**This fix has no other record than this paragraph.** There is no
`supabase/migrations/` directory (§0) — the schema's history lives entirely
in Supabase's own migration log and in whatever prose someone wrote down.
If a migrations directory is ever introduced, carry this one forward
explicitly; it will not be there otherwise.

### Branch hygiene, for whoever reads git history here

The working branch for this session had been cut from `main`, an 11-commit
history unrelated to `master` (no common ancestor) with no `docs/` at all —
`master` is where this atlas, the doctrine, and everything else actually
live. Restarted the branch from `master` before anything else; it cost
nothing, since the branch carried zero unique commits. Only worth recording
here in case `main` and `master` are ever meant to converge — right now
they are two different repositories that happen to share a remote.

### Open

- Combinations are still not scored AS combinations. The engine ranks the
  one composition it was reached through; a product that answers two active
  needs at once is offered (this session) but not ranked any higher for
  covering both. Doctrine's ranking law (§5 there) says ranking is a
  proportional property of the engine, not the brand layer, so this is a
  bigger change than wiring — flagged, not attempted.
- ~~The add sheet's three 2026-08-14 additions (circles, food-instruction
  pre-fill, blue confirm) are not browser-verified.~~ **Closed 2026-08-15**:
  all three were verified against the real running app with real data that
  session, along with everything else in §14.18/§14.19. Doctrine §6's
  matching claim is corrected too.
- `search_intents`'s fix changes final list ORDER slightly for any query
  that used to collide: the surviving row's `score` is now the brand
  match's score, not the label match's (usually somewhat lower — 2.0ish
  against 3.0ish in the cases checked), so a previously-top result can move
  down a few places even though it is now labelled correctly. Not checked
  against `check:search`'s weak-match list beyond confirming 0 terms went to
  no-result.

---

## 14.18 Session 2026-08-15 — content gap: antimalarials had zero rules

Anmol, on Synapse ranking nothing but paracetamol for a malaria picture:
*"I don't think so you only take paracetamol in malaria... it's not about
ranking or something. It's just saying that doctor know there is malaria...
Both things should rank there [tablet and injection] ... that's the
philosophy of synapse."* Investigated live, read-only, before touching
anything.

**Root cause: a pure content gap, not a code one — the same shape as
doctrine §3's `signal_finding_suggestions` gap.** `compositions` has real
antimalarial rows — artesunate, artemether, quinine, hydroxychloroquine
(doxycycline too, but only wired to acne/discharge/cough, nothing malaria-
related) — and `intents` has a medicine intent for each. But
`signal_intent_rules` had **zero rows for any of the four**, for any
signal, unconditionally. Not ranked low, not guarded — structurally
unreachable by the engine no matter what was on the chart. "Malaria" itself
(the Possible Condition) IS wired — `RIGORS`, `FEVER_RECURRENT`,
`HIGH_FEVER`, `FEVER` all map to it — which is exactly why the condition
surfaces while nothing to treat it with ever could. Paracetamol showed only
because plain `FEVER`/`HIGH_FEVER` map to it directly (0.75/0.70); nothing
about that path is malaria-specific.

Confirming a Possible Condition doesn't currently feed anything back into
the engine at all — see `confirmed-conditions-investigation.md`, which
found and proposed a fix for exactly that gap weeks ago and was never
built. Worth noting because it means the fix below could NOT have waited
for that: even a working confirm-reranks-the-chart mechanism would have had
nothing to boost, because the drugs had no rules to activate in the first
place.

**Fixed live, with Anmol's authorisation**: 16 new `signal_intent_rules`
rows — the same 4 signals already driving "Malaria" × the 4 antimalarial
medicine intents, `is_safety_critical = true` on all of them (so a doctor
who rarely prescribes for malaria doesn't have personalisation quietly bury
them). Weights deliberately lower than paracetamol's own FEVER/HIGH_FEVER
rules (0.75/0.70) and shaped like "Malaria"'s own weights: `RIGORS` and
`FEVER_RECURRENT` (the two genuinely malaria-suggestive signals) at 0.45,
`HIGH_FEVER` at 0.25, bare `FEVER` at 0.15. All four drugs carry identical
weights per signal — deliberately: differentiating which antimalarial
ranks higher is a clinical judgement this session has no authority to
make, and the standing rule is that ranking offers options, it never picks
one. `rationale` filled on every row, matching the table's own existing
convention of documenting non-obvious pairings inline.

Verified by replaying the engine's own scoring arithmetic (read-only,
against live weights) for three charts: `RIGORS` + `FEVER_RECURRENT` alone
ranks all four antimalarials at 0.90 with paracetamol absent (it has no
rule for either signal) — a doctor who has ticked a genuinely malaria-
shaped picture and nothing else sees only the antimalarials, which is
correct, not a bug. `RIGORS` + plain `FEVER` together — the realistic
case, a doctor recording both the specific sign and the general complaint —
ranks paracetamol first (0.75) with all four antimalarials right behind it
(0.60). Plain `FEVER` alone — an ordinary fever, nothing malaria-shaped —
keeps paracetamol at 0.75 and drops the antimalarials to 0.15, present and
reachable but not intrusive.

**Same rule this whole session kept landing on**: this fix has no other
record than this paragraph. No `supabase/migrations/` directory exists
(§0), so the live `signal_intent_rules` rows above and this write-up are
the only trace of it.

### Open

- No guard content was added alongside this. Quinine and hydroxychloroquine
  both carry real cardiac (QT) and other risk considerations a full pass
  would want guarded, the same way §14.9's medicine-level guards cover
  other drug classes. Flagged, not attempted — inventing guard reasons
  without real clinical review would be worse than leaving the gap open.
- The four drugs are undifferentiated by design (see above) — no
  first-line/second-line ordering between artesunate, artemether, quinine
  and hydroxychloroquine. If that ordering matters clinically, it needs a
  clinician's input, not a weight guessed here.
- Only 4 of the well-known antimalarial molecules are in the catalogue at
  all (no lumefantrine, primaquine, mefloquine, atovaquone-proguanil,
  piperaquine). Artemether typically ships combined with lumefantrine
  (Coartem) — the combination-ranking work in this same session (§14.17)
  means a lumefantrine composition, if added to the catalogue later, would
  need its own rules to be reachable; it would not inherit artemether's.

---

## 14.19 Session 2026-08-15 — `App.tsx` Stage 1: the render split

Recorded after the fact. The split below shipped in PR #1 with §14.18's
content work; the session that made it did not get as far as writing it
down, and said so in its handoff. This section is that entry, plus the
§10.7 line-count correction it asked for.

Anmol's framing, which is what set the boundary: 2,200 lines is "definitely
now in something big category"; multiple files per specialty scale better
than "appending onto the same file"; `App.tsx` should "just import them and
not actually build the DOM."

### What moved

`App.tsx`'s `isGeneralOpd`-branched render block — about 155 lines, behind a
boolean checked roughly ten times through one 2,300-line render function —
became two files in `features/consult/`:

| File | Lines | What it is |
|---|---|---|
| `GeneralOpdInputs.tsx` | 110 | The TRUE branch: the command bar, the Case Sheet, and Measurements/Attachments locked to one height beside it. |
| `SoapInputs.tsx` | 167 | The FALSE branch: three pickers (History/Context, Symptoms, Findings), then Measurements beside the specialty examination and Attachments. |

Both take props and nothing else. They own **no state and no handlers** —
that was the deliberate stopping line, see Stage 2 below. `App.tsx` went
~2,300 → 2,196 lines, the first time this file has ever got shorter.

### What deliberately did NOT move

Possible Conditions, the plan row, the Consultation Plan rail, `StatusBar`,
and every modal/sheet (`MedicineAddSheet`, `BrandSheet`, `ContributionSheet`,
`BrowseSheet`, the three specialty chart modals) all stayed in `App.tsx`,
shared.

The reason is doctrine §8's law, applied to files rather than modules:
*configuration can change what goes INSIDE a module, it can never remove a
module another profile requires.* Every one of those surfaces was already
identical for every profile before the split — General OPD never touched
them. Copying them down into the two new files, or into either one, would
have been one bug fixed in two places from the day it landed. The branch in
§2.3 is therefore the input half only, and stays that way.

### `GeneralOpdInputs.tsx` is the template, not a one-off

This is the part worth carrying forward. `features/synapse/specialtyProfile.ts`
has 8 profiles, but every one of them is pure *configuration* — which intent
type is primary, which measurements default on, which of the two specialty
charts render. General OPD is the only profile that ever earned its own
render path, because it is the only one whose input surface is structurally
different (the Case Sheet replacing three pickers).

The day a second profile earns the same thing the same way: copy
`GeneralOpdInputs.tsx`, rename it, change what it renders, add one branch to
the picker in `App.tsx`. Nothing else moves. `SoapInputs.tsx` stays the
shared fallback for every profile that has not earned a divergence — it is
deliberately **not** pre-split into seven near-identical copies, which would
be exactly the placeholder-building doctrine already warned a past session
off of. Both files carry this reasoning in their own headers; this entry
exists so it is findable without opening them.

### Open

- ~~**Stage 2 is not started.**~~ **Done 2026-08-15 — see §14.20.** It did
  not land as the single `useConsultWorkspace.ts` predicted here; it landed
  as five hooks, for a reason that entry explains.
- ~~A second profile could adopt the template today, but it would still be
  threading its handlers through `App.tsx`.~~ **No longer true after §14.20**
  — the state layer is out, so a profile can now own both its own input file
  and its own slice of state. Still nobody has needed to.
- §5.1's inventory table is stale independently of this split — it still says
  "fourteen files" and omits `CaseSheet.tsx`, `BlankArt.tsx`,
  `AttachmentsCard.tsx`, `SpecialtyExamCard.tsx`, `dosing.ts`, `useDismiss.ts`
  and the two files above. Not refreshed here; flagged.
- Specialty selection is still a doctor-facing Settings toggle (§14.10), a
  deliberate temporary exception Anmol wants replaced by admin-driven
  assignment once every profile is tested. Not blocking anything
  architectural.

---

## 14.20 Session 2026-08-15 — `App.tsx` Stage 2: the state split

Stage 1 (§14.19) moved the RENDER of the input surface out. This moves the
STATE behind it. `App.tsx` went **2,196 → 1,053 lines**, and §10.7 — open
since 2026-07-30 — is closed.

### It is five hooks, not the one this was predicted to be

§10.7 and §14.19 both predicted a single `useConsultWorkspace()`. Writing it
that way turned out to be impossible without hiding the thing worth knowing:
the consult's state is three layers with a **declaration order that React
forces**, not a preference.

| Layer | Hook | Depends on |
|---|---|---|
| 1 — facts | `useConsultChart` · `useAcceptLedger` · `useConsultSession` | nothing |
| 2 — the engine | `useConsultIntelligence` (already existed) | layer 1 |
| 3 — behaviour | `useConsultPlan` · `useConsultLifecycle` | layer 2, mutates layer 1 |

The order is forced twice over, and both are worth stating because both look
like they could be "simplified" away:

- `useConsultIntelligence` needs the accepted intent ids at render time (they
  drive companions), and `useConsultPlan` needs the intelligence back at the
  same render (brand index, active signals, hard warnings). Both cannot be
  second. **The ledger is the piece they genuinely share**, so it is declared
  first and handed to both — that is why `useAcceptLedger` is its own hook and
  not six more fields on the plan.
- The same shape one level up: the engine needs the patient's age and the
  visit id at render time, and everything that starts or ends a consultation
  needs the engine's result at render time. So the session *record* is layer 1
  and the *transitions on it* are layer 3 — `useConsultSession` against
  `useConsultLifecycle`, exactly mirroring ledger against plan.

A single hook would have had to contain all of this and would have read as one
flat 1,100-line list where the layering is invisible. Five files with the
dependency in the signature is the same code with the constraint made
checkable by the compiler.

### What each hook owns

- **`useConsultChart`** (291) — what was RECORDED: symptoms + intensities,
  findings, vitals, the handlers that mutate them, and everything derived from
  them or the catalogue. Does not know a patient exists.
- **`useAcceptLedger`** (125) — which engine intent each thing on the plan came
  from: six collections answering six different questions (`acceptedIntents`,
  `chosenBrands`, `deliberateBrands`, `searchedAccepts`, `acknowledgedIntents`,
  `dismissedCompanions`). This is `commitConsultation`'s input. Collapsing any
  of them into the prescription array loses a distinction the decision log
  depends on — notably `deliberateBrands`, which is the only set that teaches
  the brand model, because logging a default as a choice trains the model on
  its own output.
- **`useConsultSession`** (197) — who the consult is with, which visit, and the
  where-are-we flags. Owns the v1 compatibility write to `visit_symptoms` /
  `visit_findings` (it needs a visit id, which the chart deliberately has no
  access to), plus the age/sex derivations the growth standards need.
- **`useConsultPlan`** (838) — what was DECIDED, and the accept-to-plan
  pipeline. `handleAcceptIntent` stays the one entry point for every intent
  type, because the decision log must not be able to tell apart the route a
  doctor reached something by; anything bypassing it is invisible to the
  learning loop.
- **`useConsultLifecycle`** (346) — starting, repeating, saving, ending. The
  only hook spanning all four others, and one hook rather than five methods
  spread across them for a concrete reason: `App.tsx` had **three hand-copied
  reset sequences and they had already drifted** — one cleared the past-visit
  rail, the others did not. There is now one `clearWorkspace()`, so a field
  added to any hook cannot be cleared on one path and left stale on another.
  Navigation is NOT owned here — `setActivePage` / `setSidebarOpen` are passed
  in, because which screen is showing is the shell's business.

### What stayed in `App.tsx`

Boot (`dbReady`, `bootError`, the doctor/hospital profiles), navigation
(`activePage`, `sidebarOpen`), the toast, and which overlay is open
(`browse`, `openChart`, `brandSheet`, `explain`). That is the shell, and it is
what §10.7 always said should be left.

### Behaviour is unchanged by design

This was a move, not a rewrite. Two things were found and deliberately NOT
fixed in the same pass, so the diff stays reviewable as a move:

- `stagedMedicine` / `pendingMedicine` are not cleared by `plan.reset()`,
  because none of `App.tsx`'s three reset paths cleared them either. **This is
  a real bug** — an add sheet left open across a patient switch can commit onto
  a blank consult. Recorded in `useConsultPlan.ts`'s own header at the reset
  function; fix it separately.
- `handleStartConsultFromRecord` / `handlePatientConfirm` had `useCallback`
  dependency lists naming only `resolveVisitForConsult` while closing over much
  more. The hook versions declare full dependencies, which is a fix, not a
  move — worth knowing if anything downstream depended on those handlers being
  referentially stable across a patient change.

Verified by `npm run build` (`tsc -b` clean, 2,409 modules).

### Open

- ~~Not browser-verified.~~ **Verified 2026-08-15, same session.** A full
  consult was driven in the real running app against the live DB — new
  patient → "Fever" → Calpol prescribed → CBC ordered → Confirm & Save — and
  every hook's write path was then checked in Postgres for that visit:

  | Row written | Count | Proves |
  |---|---|---|
  | `visits.status = completed` + `prescriptions` / `prescription_medicines` | 1 / 1 | `useConsultLifecycle`'s `handleConfirmAndSave` |
  | `visit_observations` | 1 | `useConsultIntelligence`, unchanged |
  | `visit_symptoms` | 1 | **`useConsultSession`'s v1 compatibility effect** — the one that moved hooks |
  | `decision_log` | 40 | **`useConsultLifecycle`'s learning write**, with `identity.isReal` true |

  The reset was confirmed visually as well, which was the actual risk: after
  save, the review modal closed, the patient header cleared, the case sheet
  went back to "Nothing recorded yet", the plan to "0 items", and the intake
  modal reopened — i.e. the single `clearWorkspace()` does what the three
  drifted hand-copies used to. Test patient and visit were deleted afterward
  per §0's convention; the DB is clean.

  Also confirmed incidentally: §14.17's add-sheet work (dose circles, blue
  confirm) and §14.18's antimalarial rules both render correctly — fever
  ranked artesunate, artemether, quinine and HCQS alongside paracetamol.
- The `stagedMedicine` reset bug above — **still open**, and note the
  verification run above would not have caught it: it commits the add sheet
  before saving, which is the path that works.
- §5.1's inventory table remains stale — now also missing the five hooks
  above. Same flag as §14.19 carried forward.

---

## 14.21 Session 2026-08-15 — the longitudinal record, steps 1–5

A confirmed condition is no longer a string that prints. It re-ranks the
consultation it was confirmed in, and — when it is chronic — becomes a durable
fact that comes back on the patient's next visit.

Built from `docs/confirmed-conditions-investigation.md` (2026-07-30), which had
already checked every claim against the live schema. Read that first; this
entry records what changed against it.

### The investigation was right about the mechanism and wrong about the size

Re-verified, still true: **zero** label overlap between finding intents and
observables, no `patient_conditions`, `visits.patient_id` still the only
`patient_id` column in the database. Drift: the catalogue grew from 68 to **87**
active finding intents, and history observables from 22 to 28.

Where it was wrong: it framed step 1 as "pick the ~12 chronic intents, half a
day of curation". That assumes the mapping TARGETS exist. They mostly do not —
and a new history observable does nothing until `signal_intent_rules` reference
its signal, so creating "Known coronary artery disease" today would produce a
chip that displays, carries forward and re-ranks **nothing**. That is the
placeholder-building doctrine already forbids.

So the seed is **7 rows, not 20** — only mappings whose target observable
already carries a signal that rules actually use:

| Confirming this | Records this standing fact | Signal | Intents re-ranked |
|---|---|---|---|
| Type 2 diabetes mellitus | Known diabetic | `DIABETIC` | 14 |
| Diabetic ketoacidosis | Known diabetic | `DIABETIC` | 14 |
| Dyslipidaemia | Known dyslipidaemia | `DYSLIPIDEMIA` | 6 |
| Essential hypertension | Known hypertensive | `HYPERTENSIVE` | 5 |
| Hypertensive urgency | Known hypertensive | `HYPERTENSIVE` | 5 |
| Asthma / reactive airway | Known asthma / COPD | `ASTHMA_COPD_KNOWN` | 3 |
| COPD exacerbation | Known asthma / COPD | `ASTHMA_COPD_KNOWN` | 3 |

**The best part of the idea is one the investigation did not make.** Because the
map is intent→observable, an acute EPISODE can point at the chronic fact it
proves: confirming diabetic ketoacidosis establishes that the patient is
diabetic. Three of the seven rows are that shape, and they are arguably worth
more than the direct ones, because that inference is the one a busy doctor
skips.

**Rejected: Acute coronary syndrome → Family history of heart disease.** It was
the only remaining candidate with an existing target and it is simply false — a
patient having a heart attack is not a family history of one. It would have
written a wrong standing fact that follows them forever. ACS stays unmapped
until a "Known coronary artery disease" observable exists with rules behind it.

### What was built

- `condition_observable_map` (intent_id, observable_id, **is_chronic**) and
  `patient_conditions` (patient, observable, status active/resolved/refuted,
  provenance). Both RLS-enabled matching the existing posture: the map reads
  like the rest of the catalogue, `patient_conditions` uses hospital isolation.
- `useLongitudinalRecord.ts` — a new hook between the session and the plan,
  the only position that works (it needs the patient at render time and the
  plan needs it at render time).
- `useConsultChart` gained `chipOrigins` and `addContextObservable`.
  **Confirming a condition is genuinely one line**: the mapped observable's
  LABEL joins `selectedSymptoms`, `chartObservableIds` already derives from
  that, and the engine re-runs in the same frame.
- Carried-forward chips render dashed and drained beside solid same-hue chips.
  Not decoration — a doctor must be able to tell that "Known diabetic" came
  from a confirmation three visits ago rather than from the patient in front of
  them, or one wrong confirmation propagates forever looking fresh every time.

### Two bugs found by checking the database rather than the screen

1. **`visit_observations.source` has a CHECK constraint** allowing only
   `doctor | confirmed_intent | import`. The investigation said to write
   `'confirmed'` — it had read the column default, not the constraint. Writing
   it rejected the **entire insert**, and because that write is deliberately
   fire-and-forget (`.catch(console.warn)`), every consult with a confirmed
   condition silently recorded ZERO observations. The screen looked perfect.
   Fixed by adding `carried_forward` to the constraint and translating UI names
   to column vocabulary at one boundary (`DB_SOURCE` in `lib/db/synapse.ts`).
   **The lesson generalises: a fire-and-forget write plus a CHECK constraint is
   a silent data outage, and no amount of UI testing finds it.**
2. **`handleAcceptIntent` has a deliberate empty dependency list** (§14.20).
   `confirmCondition` closes over the patient and visit id, both of which
   change mid-consult, so calling it directly would have filed standing facts
   against whichever patient was on screen first — unpickable on real data.
   Reached through a ref instead, which fixes this path without disturbing the
   dependency list the medicine path still relies on.

Also found: `opacity-*` cannot style these chips — they animate in, and motion
writes an inline `opacity` that beats any class. And two Tailwind utilities
setting the same property resolve by generated-stylesheet order, not class-string
order, so the carried-forward treatment is a full class REPLACEMENT rather than
an override appended to `TONE[kind].chip`.

### Verified live, end to end

New patient → confirm "Type 2 diabetes mellitus" on an otherwise **empty**
chart → medicine recommendations went from "No medicine ranked for this chart"
to **8 matched** with metformin first, a Diabetes Follow-up investigation
appeared, the exam cascade offered non-healing wound / diminished reflex / nail
changes, and Height and Weight were promoted to relevant. `patient_conditions`
recorded the fact with attribution and provenance. A **second** consult for the
same patient opened with "Known diabetic" already on the chart, dashed, before
anything was typed. `visit_observations` for one visit ended up holding all
three provenances correctly: `carried_forward`, `confirmed_intent`, `doctor`.

Test patient and visits deleted afterwards per §0; the 7 catalogue rows stay.

### Open

- **Step 6 is not built** — there is no resolve/refute control. A condition
  confirmed in error can be un-ticked from the chart for that visit, but the
  `patient_conditions` row survives and will carry forward again next time. The
  status column and its check constraint already exist; only the UI is missing.
  This is the most important gap: the feature currently makes a mistake
  permanent from the doctor's point of view.
- **The remaining ~12 chronic conditions need signal content, not schema.**
  Coronary artery disease, atrial fibrillation, treated TB, osteoarthritis,
  gout, iron deficiency anaemia. Each needs an observable, a signal, and
  `signal_intent_rules` rows — clinical curation, and the reason they were left
  out rather than stubbed.
- **Hypoglycaemia → Known diabetic was deliberately NOT seeded.** It usually
  implies diabetes on treatment but genuinely occurs without it, and this map
  has no "probably". Wants a clinical decision.
- Confirming an episode still records nothing durable and shows no history of
  "had appendicitis, Jan 2026". That is §5.3 of the investigation and remains a
  display question, not an engine one.

---

## 14.22 Session 2026-08-15c — the consult, without a mouse

Cortex has claimed to be keyboard-first since the first version. It was not,
and the gap between the claim and the truth was written down in the one place a
doctor would look.

### The defect that started this

`ShortcutsSheet.tsx` held a hand-written table of eleven shortcuts. **Four of
them did not exist**: arrow-key navigation of the ranked lists, the severity
digits, "Delete removes the focused chip", and "← → move between brands" were
all documented and none were implemented. A doctor who pressed `?` was told
about a keyboard that had never been built.

Nobody wrote them down wrongly on purpose. The bindings lived in
`useConsultKeyboard.ts` and their documentation lived in `ShortcutsSheet.tsx`,
and this atlas's own §13 row said "keep both in step" — a rule that works right
up until it doesn't.

### The fix is structural, not editorial

`src/lib/keyboard/keymap.ts` is now the only declaration of a binding. The
handler dispatches from it and the sheet prints it, so a binding that is not
dispatched cannot be documented and one that is dispatched cannot be silently
dropped from the help. **Add or change a shortcut there and nowhere else.**

Each binding carries its chords, its scope, the sentence the sheet prints, and
`whileTyping` — which is enforced inside `matches()` rather than at each call
site, so a new binding cannot accidentally steal a keystroke from a search box
by being wired up in a hurry. `whileTyping` is also settable per-CHORD, for the
two bindings whose two chords disagree about it: `Ctrl+K` must work mid-word
and a bare `/` must not, or typing "b.d./tds" into the medicine search jumps
focus to the case sheet and leaves a stray slash behind.

### Three real bugs found by writing it down

1. **Ctrl+Enter did nothing in the review modal.** The global handler kept
   Ctrl+N and Ctrl+Enter live over every overlay, deliberately, so Ctrl+Enter
   in the review was caught by the global binding and RE-OPENED the review it
   was already showing. The one key that finishes a consult was inert. The hook
   now stands down entirely while an overlay is up — an overlay owns the
   keyboard — with the single exception of the shortcuts sheet, because "what
   can I press" has to be answerable from inside the modal that prompted it.
2. **`Tab` and `Shift+Tab` both matched "next stop".** An unspecified `shift`
   is not compared, so the bare `Tab` chord matched both, and only the order
   the handler happened to test them in made Shift+Tab work. `nextStop` now
   states `shift: false`, and the harness asserts no Tab chord anywhere omits
   it.
3. **`isAnyModalOpen` did not include `pendingMedicine`.** Every global chord
   stayed live underneath the add sheet, so Tab moved focus out of a modal the
   doctor was halfway through filling in. `browse`, `brandSheet`, `explain`,
   `openChart` and `sidebarOpen` were missing too.

### Assessment was unreachable by keyboard

`STOPS` was chart → medicines → plan. The one panel where a condition is
confirmed had no Tab stop, so the whole Assessment step was mouse-only. It is
now chart → **assessment** → medicines → plan, which is also the order a
consultation is built in.

### `useRovingList` — why the cursor is in the DOM

Four cards need ↑ ↓ and Enter over their rows. The obvious implementation is a
`cursor` index in each card's state and it is **wrong here for a specific
reason: these lists re-rank underneath the cursor.** The engine is pure and
re-runs in the same frame a chip lands, so the row at index 3 a moment ago is a
different medicine now. An index in React state is a claim about a list that
has already changed.

So the cursor is a `data-cx-cursor` attribute, read back from the DOM on every
keystroke. There is no second copy to reconcile. Verified in Chromium: after a
re-rank the cursor is **still on the same drug**, not on the same rank, and
when its row is removed the next ↓ restarts cleanly from the top.

The side benefit is that the ranked list and the SEARCH RESULTS are walked by
one cursor without either knowing about the other — they render into the same
`.cs-list`, so they are one list as far as the hook is concerned, which is what
a doctor pressing ↓ after typing already assumes.

**A row whose verb is missing stays in the walk and does nothing on Enter.**
Skipping it would make ↓ jump silently over a red guard, which is the exact
failure rule 11 exists to prevent.

### What is now reachable, end to end

Patient intake (type → ↑↓ or Tab → Enter; Alt+N for the new-patient form,
where Enter walks the seven fields and saves on the last) → case sheet (↑↓
Enter, Alt+1/2/3 for severity on the symptom just recorded) → assessment (↑↓
Enter) → medicines (↑↓ Enter, → for other brands, Alt+E for why) → the add
sheet (↑↓ brands, **1-4 for morning/noon/evening/night**, 0 for SOS, Enter to
add) → the plan (↑↓, Enter for the dose editor, Del to remove) → review
(Ctrl+P print, Ctrl+Enter confirm and save).

The digits in the add sheet are the notation doctors already write by hand:
`1` and `4` is literally 1-0-0-1.

### Browser conflicts, handled rather than hoped about

Three tiers, documented at the top of `keymap.ts`. **Ctrl+N, Ctrl+T and Ctrl+W
are never delivered to a browser tab at all** — the browser eats them before
any listener runs, and `preventDefault` cannot reach an event that never
arrives. An installed PWA does receive them. So every action has at least one
chord from the tiers that *are* reachable: Ctrl+N is kept for next-patient
because it is what every doctor reaches for and it works the day Cortex is
installed, and **Alt+N is bound to the same action** so nothing is unreachable
today. The shortcuts sheet prints that caveat on the row rather than hiding it.

`Ctrl+P` is claimed rather than left to the browser deliberately, and that one
is a correctness fix: the browser's own print renders the MODAL — scrim,
buttons and all — instead of `PrescriptionDocument`, which is a wrong
prescription on real paper.

### The keyboard map has a way in now

`?` has opened the sheet since it was built and nothing on screen ever said so,
which makes it a shortcut for people who already know it. There is a
**Shortcuts button in the status bar** with the chord printed on it, so the
button teaches its own replacement. The status bar rather than the sidebar
because the sidebar is two clicks away behind an overlay and this is needed
*while* working; priority-3 metadata is exactly the right tier for it.

`.cx-keys-hint` in `workspace.css` had been sitting unused since the sheet was
built — it was written for a control that was never added.

### A latent CSS bug, fixed in passing

`.cs-kbd` was in use on the Review button and **had no base rule at all**:
`.cs-review .cs-kbd` sets a `border-color` with no `border-width`, so it never
drew one. The base is now defined in `consult.css` and those two rules become
what they read as — overrides for the green ground.

### Verification

- `tsc -b` and `npm run build` clean.
- **199 assertions** over the real `keymap.ts` matcher: the chords a doctor
  presses, the `whileTyping` contract (a digit typed into the Dose box must not
  reschedule the drug; Backspace in the notes textarea must not delete a plan
  line), Tab vs Shift+Tab, and a sweep asserting **no two bindings in one scope
  claim the same chord** — the failure mode where whichever the handler tests
  first silently wins.
- **25 assertions in real Chromium** against the real `useRovingList` and the
  real row class names: walking, wrapping, exactly-one-cursor, focus never
  leaving the search field, Enter on a row with no verb being a no-op, → / ←
  driving the row's own expander idempotently, and the two re-rank cases above.
- **12 assertions in Chromium against the REAL `MedicineAddSheet`**, opened
  the way the real card opens it. This is what found §14.22a below.
- **NOT verified against the live app.** Credentials were provided, but
  **Chromium in this environment has no outbound network at all** — every
  HTTPS host returns `ERR_CONNECTION_RESET`, with or without the agent proxy,
  while the same requests succeed from `curl`. So the login could not complete
  and nothing was driven through the real screen or the real database. The
  mechanism is proven and the add sheet was driven for real; the wiring into
  the other cards is typed and reviewed but not clicked. **Worth one pass
  through a real consult**, in particular the four `searchRef` / `listRef`
  attachments and the Assessment Tab stop.
- No DB writes. No test data created.

---

## 14.22a The focus bug underneath all of it (same session)

Found by mounting the real `MedicineAddSheet` in a harness and driving it,
after Anmol asked a good question: *"if everything seems fine and the doctor
just wants to continue, does he have an option, or does he still have to go
through all those things?"*

The answer was yes — Enter commits — but checking it exposed something worse.

**Nothing moved focus when an overlay opened.** The add sheet is opened by
Enter on a ranked row, so focus stayed in the medicine search field, which is
now behind the scrim. Two consequences:

1. **Every bare-key binding in the sheet silently did nothing.** `matches()`
   refuses a binding without `whileTyping` when the event came from a field,
   and the focused element was a text input — so `1`-`4` and `0` were dropped
   on every press. Verified: pressing "2" toggled no slot.
2. **Everything else typed went into that hidden search box.** Cancel the
   sheet and find the query mangled by whatever was pressed while looking at
   a dose form.

Enter worked throughout, because it is bound `whileTyping` — which is exactly
what made this hard to see. **The common path was fine and only the shortcuts
were broken**, which is the failure mode that survives a casual test.

The fix: the panel takes focus on open (`tabIndex={-1}`, programmatic only),
and hands it back to whatever opened it on close. Focusing the PANEL and not
the Dose input is deliberate — landing in a text field would put the digits
right back inside a field.

Handing focus back is what makes the sheet a step in a flow rather than a dead
end: the doctor presses Enter, Enter, and the caret is already back in the
medicine search ready for the next drug, with no mouse reach anywhere.

`ReviewModal` had the same bug and the same fix, for one extra reason: with
focus behind the scrim, Page Down and the arrows scrolled the *workspace*
instead of the prescription being read, which on a long Rx reads as the scroll
being broken. Its scrollable body takes focus rather than the card, so those
keys reach the thing that actually scrolls.

**The general rule this leaves behind:** an overlay that binds any un-modified
key MUST take focus when it opens, or those bindings are dead on arrival. If
you add a modal with bare-key shortcuts, focus something inside it that is not
a text field.

---

## 14.22b One hook, six overlays — visible focus as a system (same session)

Anmol's follow-up, after §14.22a's fix landed: *"whenever the actual action is
happening, the focus should be there, which will tell you where the keystrokes
will actually go... even the options being selected and all. Build that
thing."* Right call — §14.22a fixed two overlays inline and left the same gap
open everywhere else, and it suppressed the visible ring on the ground that a
landing pad isn't a control, which was backwards: the landing pad is exactly
what needs to be visible.

**`src/hooks/useOverlayFocus.ts`** is the one mechanism now, extracted from
the duplicated logic `MedicineAddSheet` and `ReviewModal` each had: remember
`document.activeElement`, focus the given ref next frame, restore on close.
Applied to all six overlays that can be driven by keyboard:

| Overlay | Before | After |
|---|---|---|
| `MedicineAddSheet` | fixed in §14.22a | refactored onto the shared hook |
| `ReviewModal` | fixed in §14.22a | refactored onto the shared hook |
| `ActiveConsultGuard` | **no keyboard path at all** — not even Escape | Escape closes, ↑↓ walks the four options, Enter activates the highlighted one (or the safe "continue" default with nothing highlighted) |
| `BrandSheet` | **no keyboard path at all** — mouse only | ↑↓ walks every brand row across strength families, Enter chooses and closes |
| `ContributionSheet` | opened without moving focus | takes focus, returns it — a double-click had left focus nowhere |
| `BrowseSheet` | focused its search field but never returned focus | now via the shared hook, so closing it restores the caller |
| `Sidebar` | Escape only | takes focus on open, hands it back on close |

`ActiveConsultGuard` and `BrandSheet` were the real gaps — genuinely
mouse-only before this, not shortcuts that were merely undiscoverable. The
guard can interrupt a doctor mid-keystroke (opening patient intake while a
consult is active triggers it), which makes it the overlay most likely to
appear while hands are already on the keyboard and, until this pass, the least
reachable from there.

### `.cx-kbd-surface` — the visible answer, not a suppressed one

Every container this hook focuses carries `tabIndex={-1}` (programmatic focus
only, never a Tab stop) and a blue ring on `:focus` — plain `:focus`, not
`:focus-visible`, because these containers are never subject to a mouse-click
focus case to distinguish from. `ReviewModal` and `ActiveConsultGuard` are
Tailwind end to end, so they get the equivalent as utilities rather than the
shared class — doctrine rule 7, don't mix vocabularies in one file.

### Verified in Chromium, real components

- **6 assertions on the real `ActiveConsultGuard`**, DB call stubbed at the
  bundle boundary rather than mocked in-process (ESM named exports are
  read-only, so monkeypatching the import after the fact silently failed and
  produced a blank render — worth knowing if this pattern is reused): Escape
  closes safely, bare Enter with nothing highlighted defaults to "continue"
  and never a destructive action, ↑↓ visibly walks to Discard, Enter there
  fires the real handler through to the stub.
- **5 assertions on the real `BrandSheet`**: focus lands on the sheet on open,
  ↑↓ walks Dolo → Calpol across separate single-variant families, Enter
  chooses and closes.
- The two suites from §14.22a re-run clean against the refactored components
  (18 assertions), plus the 199 matcher assertions — 228 total, zero failures.
- `tsc -b` and `vite build` clean.
- **Still not through the real consult screen** — see §14.22a's note on why;
  unchanged this session. `Sidebar` and `ContributionSheet`'s focus-return
  specifically were reviewed but not driven in a harness.
