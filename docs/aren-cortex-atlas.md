# AREN CORTEX — TECHNICAL ATLAS

*The doctor-facing half of the product, read from the code itself.*

Surveyed: 2026-07-21 · Branch `master` · Commit `068d669`
Scope: **Cortex only.** Everything under `src/features/frontdesk/` (the reception
suite) is deliberately out of scope — see `aren-technical-atlas.md` §4.6 for that.

Purpose: this exists because the next block of work is **consultation and
doctor-facing systems**, and the only Cortex-specific document on disk
(`Coretx File Str.md`) is from Session 31 and is now wrong in several
load-bearing places. Every claim below was verified by reading the file, running
`tsc`, or grepping the import graph. Where the old doc was wrong, §11 says so.

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

### Where it lives

| Thing | Path |
|---|---|
| Route | `/app/cortex` (`src/main.tsx`, behind `RequireAuth` + `RequireRole allow={["doctor"]}`) |
| Root component | `src/App.tsx` (950 lines) |
| Consult panels | `src/components/*.tsx` |
| Internal pages | `src/features/{patients,prescriptions,investigations,communication,practice,clinic,settings,support}/` |
| Internal nav | `src/features/sidebar/` |
| Prescription renderer | `src/features/prescription/` (shared with Print RX) |
| Data + intelligence | `src/lib/db/{reference,patients,intelligence}.ts` |
| Styling | `src/styles/*.css` (unlayered, global) |

Cortex is **not** a router. `App.tsx` swaps "sidebar pages" in local state
(`activePage: SidebarPage | null`) without touching the URL. `activePage === null`
means *the consult workspace*; anything else is a feature page.

---

## 2. `App.tsx` — the whole workspace in one component

This is the single most important file in Cortex and the single biggest
liability. It owns every piece of consult state, every effect, every handler, and
the render tree for both the consult screen and the feature-page shell.

### 2.1 State inventory (all `useState` in one component)

**Reference data** — `allSymptoms`, `allFindings`, `dbReady`, `doctorProfile`,
`hospitalProfile`, `recentSnapshots`.

**The consult** — `patient`, `visitId`, `vitals`, `selectedSymptoms` (string
names), `selectedSymptomsWithIntensity` (`SelectedSymptom[]`), `selectedFindings`
(string names), `prescription` (`PrescriptionMedicine[]`), `selectedMedicineId`,
`selectedTests` (string names), `selectedLab`, `followUpDays`, `adviceNotes`,
`pastVisits`, `pastVisitsLoading`.

**The intelligence layer** — `rankedMedicines`, `rankedCompositionIds`,
`rankLoading`, `frequentPicks`, `picksLoading`, `activeTagIds`, `favouriteIds`
(`Set<number>`), `favouritePicks`, `lastSnapshot`.

**UI / overlays** — `stagedMedicine`, `toast`, `repeatRxBanner`,
`patientModalOpen` (starts `true`), `activeConsultGuardOpen`, `isReviewOpen`,
`isSaving`, `sidebarOpen`, `activePage`.

Two debounce refs (`rankTimer` 300 ms, `picksTimer` 500 ms) and five DOM refs
(`logoRef` + four panel search inputs).

> **Note the shape of the state.** Symptoms, findings and tests are held as
> **display names** (`string[]`) and converted to IDs at the edges via
> `symptomNameToId` / `findingNameToId` memos. This is the root cause of two live
> bugs (§10.2, §10.3) and is the first thing to fix if consult state is ever
> refactored.

### 2.2 Effects

1. **Boot** (`[]`) — one `Promise.all` of seven calls: `fetchSymptoms`,
   `fetchFindings`, `fetchDoctorFavourites`, `fetchFavouriteMedicines`,
   `fetchDoctor`, `fetchHospital`, `fetchSnapshotSuggestions("fever")`. Sets
   `dbReady`. Until it resolves the whole app renders a "Connecting to AREN
   database…" splash — **there is no error state, only a toast**; a failed boot
   leaves the splash on screen forever.
2. **Rank** (300 ms debounce, on symptoms/findings/visitId) — persists
   `visit_symptoms` + `visit_findings` fire-and-forget, then calls
   `rankMedicines`. Empty selection clears the ranked list.
3. **Frequent picks** (500 ms debounce) — resolves symptom IDs → `symptom_tag_map`
   → tag IDs (an **inline Supabase query inside App.tsx**, the only DB call in
   the codebase that bypasses `src/lib/db/`), then `fetchFrequentPicks`.

### 2.3 Render branches

```
!dbReady                      → boot splash
activePage === "patients"     → features/patients/PatientsPage
activePage === anything else  → components/ComingSoonPage (title/subtitle from COMING_SOON_META)
activePage === null           → the consult workspace
```

Always rendered regardless of branch: `Sidebar`, `GlobalLogoTrigger`.
Rendered only when `!isFeaturePage`: `PatientHeader`, and the three overlays
(`ActiveConsultGuard`, `PatientModal`, `ReviewModal`) — each guarded *both* by
`!isFeaturePage` and force-closed inside `handleSidebarNavigate`. That
belt-and-braces pattern is deliberate (Session 31 rule #14); keep both halves.

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
                        token = today's max + 1
                                    │
                                    ▼
   ┌──────────────── consult workspace (activePage === null) ────────────────┐
   │  PatientHeader   patient strip · 5 vitals inputs · past-visit rail      │
   │                  (click a chip → PastVisitCard → "Repeat Rx")           │
   │  ChipSearchPanel symptoms (structured, from `symptoms` catalog)         │
   │      │           + clinical snapshots (bundles of symptoms + findings)  │
   │      ▼                                                                  │
   │  FindingsPanel   probable findings ranked by RPC from symptom IDs       │
   │      │                                                                  │
   │      ├── debounce 300ms → replaceVisitSymptoms / replaceVisitFindings   │
   │      └── debounce 300ms → rankMedicines (edge function)                 │
   │                    │                                                    │
   │                    ▼                                                    │
   │  MedicineSuggestions  ranked list · search · favourite toggle           │
   │  FrequentPicksPanel   co-prescription hints, minus what's already ranked│
   │                    │                                                    │
   │              click → stagedMedicine → MedicineInspector                 │
   │              (dosage / frequency slots / duration / notes / SOS)        │
   │                    │  confirm                                           │
   │                    ▼                                                    │
   │  SelectedMedicinesBar   the assembled prescription                      │
   │  PreviewPanel           Tests & Lab picker + "Review Prescription"      │
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
                        then, fire-and-forget (never fatal):
                          runLearningLoop()                (bias increment)
                          logCoprescriptionObservations()  (pairwise composition log)
                        then resetConsultState() → PatientModal reopens
```

### Interrupting a consult

`ActiveConsultGuard` opens when the doctor tries to switch patient mid-consult.
It writes the visit status directly (`updateVisitStatus`) and offers three exits:
**Refer** (`referred`), **Save as draft** (`draft`), **Discard** (`discarded`).
Note it is the only Cortex component that mutates a visit outside `saveConsult`.

---

## 4. The intelligence layer (`src/lib/db/intelligence.ts`)

This is what makes Cortex more than a form. All of it is doctor-facing and all of
it will matter for the next block of work.

| Function | What it does | Where the logic lives |
|---|---|---|
| `rankMedicines({symptoms, findingIds})` | POST to Supabase Edge Function `rank-compositions`. Sends symptom IDs **with intensity**, finding IDs, `doctorId`, `specialization`. Returns `RankedMedicine[]` with `score` + `dosage_defaults`. | **Server-side edge function — not in this repo.** |
| `runLearningLoop({tagSignature, …})` | Same endpoint with `action:"learn"`. Increments the doctor's bias for what they actually picked vs what was ranked. | Server-side. |
| `fetchFrequentPicks({activeTagIds, excludeCompositionIds, doctorId})` | Reads `composition_coprescription_hints` for the active symptom tags, dedupes against already-ranked compositions, then per hint resolves a concrete medicine — the doctor's own most-selected (`doctor_medicine_bias`) if it exists, else the primary from `medicine_composition_map`. Caps at 8. | Client-side, this file. |
| `fetchFavouriteMedicines` / `fetchDoctorFavourites` / `toggleFavouriteMedicine` | Star/unstar, stored as `doctor_medicine_bias.is_favourite`. Upsert on `(doctor_id, composition_id, medicine_id)`. | Client-side. |
| `logCoprescriptionObservations` | After a save, writes every **pair** of prescribed compositions to `coprescription_observations` with the tag signature. Feeds future hint generation. | Client-side. |
| `searchMedicinesDB(query)` | Free-text medicine lookup with composition names joined through `medicine_composition_map`. Min 2 chars, limit 20. | Client-side. |

And in `reference.ts`:

| Function | What it does |
|---|---|
| `fetchProbableFindings(symptomIds)` | RPC `rank_probable_findings` — drives FindingsPanel's ranked list. |
| `fetchRankedPanels(symptomIds, findingIds)` | RPC `rank_panels` — ranked investigation panels. **Written, never called by any component.** |
| `fetchSnapshotSuggestions(query)` | `clinical_snapshots` + join tables. A snapshot is a named bundle of symptoms + findings applied in one click, undoable with Ctrl+Z. |
| `fetchDynamicTests(activeTagIds)` | `symptom_cluster_test_hints` — dynamic test suggestions. **Written, never called.** |
| `freqSlotToLabel` / `freqLabelToSlot` | The frequency contract: DB stores `"1-0-1-0"` (morning-afternoon-evening-night); UI shows "Morning and Evening". |

> **`fetchRankedPanels` and `fetchDynamicTests` are the two ready-made hooks for a
> smarter Investigations experience.** The DB side exists; nothing consumes it.
> `PreviewPanel` still renders `src/data/mockData.ts`.

### The `tagSignature` contract

The learning loop keys on `tagSignature` = selected symptom IDs, sorted
ascending, joined with `-` (e.g. `"3-17-42"`). Built inline in
`handleConfirmAndSave`. Change how it's built and you invalidate every stored
bias row.

**Standing rule (carried from Session 31, still valid):** ranking philosophy is
*"re-rank by habit"*, not *"recommend by clinical truth"*. Complaints about
ranking quality get answered with stronger personalization math, not clinical
guardrails. Ranking tuning is **parked** until UI work is done.

---

## 5. Data model, from Cortex's side

Cortex reads and writes:

| Table | Cortex's relationship |
|---|---|
| `patients` | create (`createPatient`), lookup by phone, search. |
| `visits` | **creates** one per consult (`createVisit`); updates status via `saveConsult` (→ `completed`) and `ActiveConsultGuard` (→ `referred`/`draft`/`discarded`). Writes `vitals` (jsonb) at save time. |
| `visit_symptoms` | `replaceVisitSymptoms` on every debounced change — IDs + intensity. |
| `visit_findings` | `replaceVisitFindings`, IDs only. |
| `symptoms`, `findings` | read once at boot, cached in component state. |
| `prescriptions` | insert at save. |
| `prescription_medicines` | insert at save; writes both `composition_ids` (array) and legacy `composition_id`. |
| `diagnostic_orders` | insert at save, `status: "ordered"`. |
| `medicines`, `compositions`, `medicine_composition_map` | read for search / picks. |
| `doctor_medicine_bias` | read + upsert (favourites, personalization). |
| `composition_coprescription_hints`, `symptom_tag_map`, `symptom_cluster_test_hints` | read (hints). |
| `coprescription_observations` | insert after save. |
| `clinical_snapshots` + `snapshot_symptoms` / `snapshot_findings` | read. |
| `doctors`, `hospitals` | read for the prescription letterhead; `doctors.last_seen` written by the heartbeat. |

**Hydration pattern:** no SQL joins for the big reads — fetch parents, then
`IN (…)` the children, aggregate in memory. Fine at clinic scale.

**Presence:** `src/hooks/useDoctorHeartbeat.ts` writes `doctors.last_seen` every
30 s (plus immediately on mount) while Cortex is open. Reception's `DoctorsCard`
derives Online/Away/Offline from it. This is the *only* live signal Cortex sends
to the reception side.

---

## 6. Component inventory (verified)

Line counts are real. "Style" is how the component is actually written — this
matters, see §7.

### 6.1 Consult panels — `src/components/`

| File | Lines | Style | What it does |
|---|---|---|---|
| `ChipSearchPanel.tsx` | 524 | CSS classes + inline (34 blocks) | Symptoms input. Fixed 280 px panel, **portal** dropdown positioned from a measured `DOMRect` (re-measured on scroll/resize), fuzzy filter, snapshot suggestions inline in the dropdown, idle-state ECG artwork. |
| `FindingsPanel.tsx` | 617 | inline (49 blocks) + CSS vars | Findings input. Probable findings via RPC, grouped browse (`GROUP_ORDER`), portal dropdown. Its own inline SVG icons. |
| `Tag.tsx` | 205 | CSS classes + tone vars | The chip primitive. Right-click → intensity menu (mild/moderate/severe). |
| `MedicineSuggestions.tsx` | 260 | CSS classes | Ranked medicine list, search, match %, favourite star. |
| `FrequentPicksPanel.tsx` | 230 | **Tailwind** | Co-prescription hints + favourites, with clinical reason text. |
| `MedicineInspector.tsx` | 208 | CSS classes | Per-medicine editor: dosage, the four frequency slots (M/A/E/N), duration, notes, instructions, SOS. Doubles as the confirm step for a staged medicine. |
| `SelectedMedicinesBar.tsx` | 74 | CSS classes (`.smb-*`) | The assembled prescription as cards. |
| `PreviewPanel.tsx` | 174 | CSS classes | **Actually the Tests & Lab panel** (the name is a leftover). Renders `mockData.testGroups`, search, selected-tag strip, preferred-lab `<select>`, and the "Review Prescription" button. |
| `PatientHeader.tsx` | 432 | CSS classes (`.tb-*`) | The consult topbar: patient identity, 5 vitals inputs with warn thresholds, doctor pill, Review Rx, Cancel-consult (two-step arm), horizontally scrolling past-visit rail with `IntersectionObserver` stick detection. |
| `PatientModal.tsx` | 277 | CSS classes | Patient search / create. Non-dismissable while no patient is loaded (`onClose` becomes a no-op). |
| `ActiveConsultGuard.tsx` | 237 | **Tailwind** | Refer / Draft / Discard on patient switch. Writes visit status itself. |
| `ReviewModal.tsx` | 733 | **Tailwind** (245 utilities) | The prescription review + print surface. Shared with Print RX via `mode`. See §8. |
| `GlobalLogoTrigger.tsx` | 103 | inline | A floating clone of the topbar logo, rendered as an App-level sibling so it stays clickable above full-screen overlays. Gated on `sidebarOpen` **and** `active` (any overlay open). See §9. |
| `WorkspaceHeader.tsx` | 60 | CSS classes (`.ws-*`) | Header for feature pages (Patients, Coming Soon). |
| `ComingSoonPage.tsx` | 32 | CSS classes | Placeholder shell, title/subtitle props. |
| `ActionButton.tsx` | 15 | CSS classes | Button primitive, used only by `PatientHeader`. |
| `TestsPanel.tsx` | 220 | inline + CSS vars | **DEAD.** Nothing imports it. A newer tests picker built on `data/testsCatalogue.ts` that was never wired in. |
| `PrescriptionPanel.tsx` | 81 | — | **DEAD.** No importer. |
| `VitalsStrip.tsx` | 35 | — | **DEAD.** No importer (vitals live in `PatientHeader`). |

### 6.2 Feature pages — `src/features/`

| Folder | State |
|---|---|
| `patients/` | **The only built one.** `PatientsPage.tsx` (364) → `PatientsList.tsx` (524) + `PatientRecord.tsx` (902) + 8 CSS files (~3.5k lines). Today's/recent/search lists, then a full record: derived summary, visit-frequency chart, clinical signals, per-visit cards, "Start Consult" sidebar. Note it renders a `PLACEHOLDER_MEDICINES` array — the "commonly prescribed" panel is hardcoded, not derived. |
| `sidebar/` | `Sidebar.tsx` (203) + `SidebarNav.tsx` (264) + `sidebar.css` (587). The nav registry lives in `SidebarNav`'s `items` array. Logout is wired here via `useLogout()`. `ComingSoonPage.tsx` (21) here is an **orphaned duplicate** — App imports the one in `components/`. |
| `prescriptions/`, `investigations/`, `communication/`, `practice/`, `clinic/`, `settings/`, `support/` | **0-byte stubs, all of them** — both the `.tsx` and the `.css`. Nothing imports them. Every one of these nav entries lands on `ComingSoonPage`. |

> ⚠️ `aren-technical-atlas.md` §4.4 previously described these as built pages
> ("doctor-side prescriptions list", "diagnostics overview", "clinic profile
> page"). They are empty files. That has been corrected in this pass.

### 6.3 Shared prescription pipeline — `src/features/prescription/`

Shared with Print RX; **one renderer for the whole product.**

- `PrescriptionDocument.tsx` (617, ~89 inline style blocks — inline **on purpose**,
  for print fidelity). A4 / A5 / Thermal variants, QR generation, optional `date`
  prop so reprints carry the original date.
- `PrintFormatSelector.tsx` (171, Tailwind) — format picker + "remember my choice".
- `usePrintFormat.ts` (28) — persists to `localStorage` key `aren_print_format`.

---

## 7. The styling system — read this before touching any Cortex UI

Cortex has **three coexisting visual vocabularies**. This is the single most
confusing thing about the codebase and there is no plan of record to unify them.

### 7.1 The three vocabularies

**(a) Global unlayered CSS — the dominant one.** Eleven stylesheets imported in
`src/main.tsx`, all global, none inside a `@layer`:

| File | Lines | Owns |
|---|---|---|
| `styles/base.css` | 189 | **The design tokens** (`:root` vars), reset, typography, and raw-element styling for `input/select/textarea/label/h2/h3`. Also `.toast` and the per-panel focus glows. |
| `styles/layout.css` | 1223 | `.app-shell`, `.workflow`, `.main-column`, `.two-column-row`, `.medicine-workspace`, `.sidebar-column`, `.panel`, `.section-head`, and the whole `.tb-*` topbar system. |
| `styles/components-base.css` | 481 | `.chip-panel`, `.search-box`, `.icon-button`, `.quick-actions`, shared atoms. |
| `styles/components-panels.css` | 582 | `.findings-*`, tests panel internals, `.finding-chip`. |
| `styles/components-medicines.css` | 507 | `.medicine-suggestion-list`, `.lib-row`, `.rank`, `.match`, favourite/add buttons. |
| `styles/components-picks.css` | 279 | `.fp-*` (frequent picks). |
| `styles/components-bar.css` | 283 | `.smb-*` (selected medicines bar). |
| `styles/components-modals.css` | 1252 | `.mi-*` (medicine inspector), patient-modal + duplicate-detection UI. |
| `styles/past-visit.css` | 454 | `.pv-*` (past-visit card). |
| `styles/workspace-header.css` | 278 | `.ws-*` (feature-page header). |
| `features/sidebar/sidebar.css` | 587 | The whole sidebar. |
| `styles/rx-modal.css` | 0 | Empty and unimported. |

Plus `features/patients/*.css` — 8 files, ~3.5k lines, imported by
`features/patients/PatientsPage.tsx`.

**(b) Inline `style={{}}`** — used heavily in `FindingsPanel` (49 blocks),
`ChipSearchPanel` (34), `TestsPanel` (12), and `PrescriptionDocument` (89, where
it is correct and required for print).

**(c) Tailwind islands** — four components only: `ReviewModal` (245 utilities),
`ActiveConsultGuard` (60), `FrequentPicksPanel` (52), `PrintFormatSelector` (40).

### 7.2 The design tokens

Everything in vocabulary (a) reads from `styles/base.css`:

```css
--bg: #eef3f8            --text: #0b1733       --blue: #1268e8   --blue-soft: #edf5ff
--worktop: rgba(255,255,255,.72)   --muted: #60708e   --cyan: #0f9f9a  --cyan-soft: #eefaf9
--surface: rgba(255,255,255,.86)   --faint: #8998b0   --green: #16a34a --green-soft: #edfdf3
--surface-solid: #ffffff --line: #d9e2ee                --pink: #d9468f  --pink-soft: #fff1f7
--line-soft: rgba(121,143,177,.2)                       --danger: #d94040
--shadow-low / --shadow-active     --radius: 8px
```

Typography is **Inter** (body) — set in `base.css`. Note `src/styles.css`
separately declares `--font-sans: 'Geist Variable'` and applies it to `html` via
Tailwind's base layer, while `base.css` sets Inter on `body`; body wins for
everything Cortex renders. The `@fontsource-variable/geist` import and the entire
shadcn oklch token block in `styles.css` are effectively unused by Cortex.

Per-panel identity is colour-coded via focus glow (`base.css` lines 176–190):
symptoms **pink**, findings **teal**, suggestions **blue**, tests **violet**.

### 7.3 The layer trap — Cortex is the cause, not the victim

`base.css` styles raw `input`, `select`, `textarea`, `label`, `label span`, `h2`,
`h3` **globally and unlayered**. Unlayered CSS beats Tailwind's layered utilities
regardless of specificity. Consequences:

- **Inside Cortex** this is fine and load-bearing — those global element styles
  *are* the form design.
- **Anywhere Tailwind is used** (the four islands above, and the whole reception
  suite) utilities on those elements silently lose. Reception works around it
  with `fd-*` classes in `FrontDeskStyles.tsx`. If you write a new Tailwind form
  control in Cortex, you will hit exactly the same wall.
- Re-layering `src/styles/` is the real fix and is **deliberately deferred** —
  only worth doing alongside a Cortex restyle or dark mode.

### 7.4 Cortex blue vs. Front Desk "Bhor"

Reception was rebuilt on visual direction **v2 "Bhor"** — ink chrome, dawn
thread, three never-mixed vocabularies, the zero rule (see
`aren-frontdesk-design-direction.md` and `aren-frontdesk-source-of-truth.md` §7).
**Cortex has not been through that pass.** It is still on the original light-blue
clinical palette above.

The two workspaces are visually different products today. If Cortex is going to
be restyled toward Bhor, that is a large, deliberate project — it means
re-layering the CSS (§7.3), reconciling tokens, and touching all eleven
stylesheets. Do not do it incrementally and by accident.

### 7.5 Motion & other conventions

- `body { min-width: 1120px }` — Cortex is **desktop-only by design**. No
  responsive work exists.
- All dropdown overlays use `createPortal` (standing rule).
- Custom 6 px scrollbars, `scrollbar-gutter: stable`.
- Cortex is **not localized**. No `i18n` — English strings inline. Reception's
  `t()` dictionary does not apply here.
- Cortex uses its own `toast` state + the `.toast` CSS class, **not** the
  app-wide `sonner` Toaster mounted in `main.tsx`.

---

## 8. `ReviewModal` — the one shared surface

`src/components/ReviewModal.tsx` is used by **both** workspaces and must not be
forked.

- `mode="review"` (default) — Cortex: Edit / Confirm & Save / Print.
- `mode="print"` — Print RX: read-only, Close + Print only. `onEdit`/`onSave` are
  optional so the reception side need not wire consult actions.
- `date` — reprints carry the original prescription date.
- `autoPrint` — fires the print flow on open (Print RX one-click path).
- `onPrinted` — fires on `onAfterPrint`; note the browser cannot distinguish a
  real print from a cancelled dialog.

It renders an on-screen preview plus a hidden `PrescriptionDocument` that
`react-to-print` targets. Branding/layout changes belong in
`PrescriptionDocument`, not here.

---

## 9. Overlay & stacking doctrine

Hard-won rules that are still enforced in the code:

1. **You cannot escape an ancestor's stacking context with a bigger z-index.**
   `.topbar-unified`, `.ws-header`, and `.sidebar-panel` each set their own
   `position` + `z-index`. Anything that must paint above a future overlay has to
   be rendered as a **sibling outside** that subtree.
2. That is exactly why `GlobalLogoTrigger` exists — an App-level clone of the
   topbar logo. It must gate on an explicit "something is covering the screen"
   condition (`active={patientModalOpen || isReviewOpen || activeConsultGuardOpen}`)
   **and** on `sidebarOpen`. `pointer-events: none` stops clicks but does not stop
   painting; do not remove the gating.
3. Overlays whose state lives in `App.tsx` must be force-closed in every
   navigation handler **and** independently guarded by `!isFeaturePage` at the
   render site. Both halves, always.
4. Never race a parent transition against a child keyframe animation off the same
   state change.

---

## 10. Known defects, gaps, and debt

Ordered by how much they will hurt the upcoming consultation work.

### 10.1 🔴 Cortex is disconnected from the reception queue

**Cortex never reads the queue.** `fetchTodayVisits`, `markVisitServing`,
`fetchDraftVisits`, and `fetchVisitWithDetails` are imported by **zero** Cortex
files (`markVisitServing` is used only by reception's `useVisitActions`).

Every consult start — `handlePatientConfirm` and `handleStartConsultFromRecord` —
calls `createVisit(patientId)`, which unconditionally inserts a **new** visit row
with `status: "serving"` and **a new token number**. So when a receptionist
registers a patient (visit A, `waiting`, token 7) and the doctor then opens that
patient in Cortex, the DB gets visit B, `serving`, token 8. Visit A is orphaned
in `waiting` forever.

This is the **"Next Patient" gap** carried in every handoff since Session 36, and
it is the single most important thing to fix before building more consultation
features. It needs: a Cortex-side queue read, a "resume this visit" path that
calls `markVisitServing(existingVisitId)` instead of `createVisit`, and a rule for
when creating a fresh visit is still correct (walk-in / Solo Mode).

Related: `clinic_mode` (Solo Mode — clinic with no receptionist) exists in
`aren-architecture-handoff.md` and is **read nowhere in code**.

### 10.2 🔴 The learning loop is sending garbage finding IDs

`App.tsx:633`:

```ts
findingIds: selectedFindings.map((f) => f.id),
```

`selectedFindings` is `string[]` (finding **names**). `.id` on a string is
`undefined`, so `runLearningLoop` receives `[undefined, …]`. This is one of the
two `tsc` errors in `App.tsx` and it is a **real runtime bug**, not just a type
complaint — every learn call since findings were added has had a malformed
`findingIds`. The fix is `selectedFindings.map(n => findingNameToId.get(n))`
filtered for `undefined`, the same conversion the rank effect already does.

### 10.3 🟠 `hasActiveConsult` ignores three of its four arguments

`App.tsx:84` takes `(patient, prescription, selectedSymptoms, selectedFindings)`
and returns `!!patient`. So "do I have unsaved work?" is really "is a patient
loaded?". It drives the sidebar-navigation warning toast and the consult-guard
decision. Harmless today because a patient is always loaded first — but it will
lie the moment anything else depends on it.

### 10.4 🟠 Hardcoded identity everywhere

`DOCTOR_ID` and `HOSPITAL_ID` (`lib/db/reference.ts`) are used directly by
`App.tsx`, `createVisit`, `saveConsult`, `rankMedicines`, `runLearningLoop`,
`fetchFrequentPicks`, and the favourites calls. Auth ships a real identity
(`useAuth().identity`) and `App.tsx` uses it for **exactly one thing** — the
presence heartbeat, which falls back to `DOCTOR_ID` anyway. `fetchHospital` is
even called with the UUID string literal inline rather than the constant. A
session-identity sweep is needed before Cortex supports a second doctor.

### 10.5 🟠 `tsc -b` is blocked — 46 errors, exactly three files

Verified this session:

| File | Errors | Cause |
|---|---|---|
| `src/data/mockData.ts` | 42 | Test literals missing `id`/`category`, and using a `rare` property that `types.ts` `Test` does not declare. |
| `src/components/PreviewPanel.tsx` | 2 | Reads `t.rare` (same missing property). |
| `src/App.tsx` | 2 | §10.2 above. |

`npm run build` = `tsc -b && vite build`, so **the app cannot be built for
production today**. Dev works because Vite/esbuild skips typechecking. This is a
genuinely small fix — add `rare?: boolean` + `id`/`category` to the mock data, and
fix §10.2 — and it would unblock deployment.

Any new work must add **zero** new errors. Filter for your own:
`npx tsc -b 2>&1 | grep -v mockData`

### 10.6 🟡 Investigations is running on mock data

`PreviewPanel` renders `src/data/mockData.ts`. Meanwhile
`src/data/testsCatalogue.ts` (a real catalogue) exists but is only consumed by
the **dead** `TestsPanel.tsx`, and `fetchRankedPanels` / `fetchDynamicTests` (real
DB intelligence) are called by nobody. There is a half-built better version of
this feature sitting unwired in three places.

### 10.7 🟡 Dead code

- `components/TestsPanel.tsx`, `components/PrescriptionPanel.tsx`,
  `components/VitalsStrip.tsx` — no importers.
- `features/sidebar/ComingSoonPage.tsx` — orphaned duplicate.
- `features/{prescriptions,investigations,communication,practice,clinic,settings,support}/*` — 14 zero-byte files.
- `styles/rx-modal.css` — empty, unimported.
- `lib/db` exports `fetchDraftVisits`, `fetchVisitWithDetails` — no callers anywhere.
- Repo root: `@/` (a literal folder from a shadcn misfire), `app.js`, `server.mjs`,
  `original_chip.txt`, `src-tree.txt`.

### 10.8 🟡 Smaller things

- **Boot is all-or-nothing.** One failed call in the seven-way `Promise.all` and
  the app sits on the splash screen with a toast. No retry, no degraded mode.
  Cortex has none of reception's offline handling (`useOnline`, reference cache,
  event log) — those live in `features/frontdesk/operational/` and are
  reception-only.
- **The `symptom_tag_map` query is inline in `App.tsx`** (line ~268), violating
  the "all DB calls live in `src/lib/db/*`" rule. It's the only such violation.
- `fetchSnapshotSuggestions("fever")` is hardcoded at boot to populate "recent
  snapshots" — the idle-state suggestions are always fever-related.
- `PatientsPage`'s "commonly prescribed" panel is a hardcoded
  `PLACEHOLDER_MEDICINES` array.
- `FindingsPanel`'s browse-by-category dropdown was reported visually broken in
  Session 29 and has not been revisited.
- `App.tsx` renders `ActiveConsultGuard` with `visitId!` and a `// ← ADD THIS LINE`
  comment still in the source.
- Keyboard shortcuts exist (`useConsultKeyboard`) but are undiscoverable: Ctrl+N
  new patient, Ctrl+Enter review (needs ≥1 medicine), Ctrl+Z undo snapshot (only
  while the symptoms panel is focused), Alt+M toggle favourites (dispatches a
  `window` CustomEvent `aren:toggle-favourites`), Tab / Shift+Tab cycle the four
  panels, Esc blurs. Everything except the Ctrl/Alt set is suppressed while a
  modal is open.

---

## 11. Corrections to `docs/Coretx File Str.md` (Session 31)

Keep that file for history; do not trust these points:

| It says | Actually |
|---|---|
| `App.tsx` is ~780 lines | 950. |
| `FindingsPanel` "IS Tailwind (the one exception)" | It is **inline styles + CSS vars**. The Tailwind components are `ReviewModal`, `ActiveConsultGuard`, `FrequentPicksPanel`, `PrintFormatSelector`. |
| `PreviewPanel` is "the actual Tests & Lab component — note it is NOT named TestsPanel.tsx" | Still true, and now there *also* is a `TestsPanel.tsx` — which is dead code. |
| The `!isFeaturePage` modal-leak fix and `handleSidebarNavigate` force-close were "unconfirmed" | Both are present and correct in `App.tsx` today. |
| `features/sidebar/ComingSoonPage.tsx` "may be an orphaned duplicate" | Confirmed orphaned. App imports `components/ComingSoonPage`. |
| The sidebar logo "morph" measurement may be dead weight | `Sidebar.tsx` is 203 lines and logout is wired through `useLogout()`; the morph question was not re-verified this pass. |
| `supabase/functions/rank-compositions/index.ts` is in the tree | **There is no `supabase/` directory in this repo.** The edge function is deployed but its source is not version-controlled here. Worth fixing. |

And a correction to `docs/aren-technical-atlas.md` §4.4, now applied: the
`prescriptions/`, `investigations/`, `communication/`, `clinic/`, `practice/`,
`settings/`, `support/` feature pages are **zero-byte stubs**, not built pages.

---

## 12. Where do I change X?

| I want to change… | Open |
|---|---|
| Any consult state, effect, or handler | `src/App.tsx` (there is nowhere else) |
| The consult page grid / topbar layout | `src/styles/layout.css` |
| Design tokens, form elements, typography | `src/styles/base.css` |
| Symptom entry / snapshots | `components/ChipSearchPanel.tsx` |
| Findings entry / probable findings | `components/FindingsPanel.tsx` |
| Medicine ranking **call**, learning loop, favourites, picks | `lib/db/intelligence.ts` |
| Medicine ranking **math** | The `rank-compositions` edge function (not in this repo) |
| Ranked medicine list UI | `components/MedicineSuggestions.tsx` + `styles/components-medicines.css` |
| Dosage / frequency editor | `components/MedicineInspector.tsx` + `styles/components-modals.css` |
| Tests & Lab | `components/PreviewPanel.tsx` + `data/mockData.ts` (see §10.6) |
| Frequency slot ⇄ label mapping | `lib/db/reference.ts` |
| Patient topbar, vitals, past-visit rail | `components/PatientHeader.tsx` + `styles/layout.css` (`.tb-*`) |
| What saving a consult writes | `lib/db/intelligence.ts` → `saveConsult` |
| The prescription document itself | `features/prescription/PrescriptionDocument.tsx` |
| The review/print surface | `components/ReviewModal.tsx` |
| Sidebar nav entries | `features/sidebar/SidebarNav.tsx` (`items` array) |
| A new Cortex feature page | Fill the 0-byte stub, add to `SidebarNav.items`, add a branch in `App.tsx`'s render, add meta to `COMING_SOON_META` if still pending |
| Keyboard shortcuts | `hooks/useConsultKeyboard.ts` |
| Patient records / history | `features/patients/` |
| A DB query | `lib/db/{reference,patients,intelligence}.ts` — **never** `lib/db.ts` (barrel only) |

---

## 13. Standing rules for Cortex work

1. **Read the current file before editing.** Verify with grep that a previous edit
   actually landed — do not assume.
2. **All DB calls go in `src/lib/db/*`.** `db.ts` is a barrel; never add functions
   there. (One existing violation — §10.8.)
3. **Symptoms and findings are structured entities.** Select from the catalog,
   persist IDs. Never free text.
4. **Learning-loop / hint failures are non-fatal.** Always `.catch()`.
5. **Never redefine an existing CSS class** — check first. Never touch
   `layout.css` for `ChipSearchPanel`/`FindingsPanel` work; those own their rules.
6. **Do not convert a component between the three styling vocabularies** without
   an explicit decision (§7.4). The CSS-vs-Tailwind split is an open question, not
   an accident to be tidied.
7. **Dropdown overlays use `createPortal`.** Stacking is fixed by DOM position,
   not z-index (§9).
8. **One prescription renderer, one review surface.** Don't fork
   `PrescriptionDocument` or `ReviewModal`.
9. **Ranking is "re-rank by habit", not "recommend by clinical truth"** — and is
   parked regardless until UI work is done.
10. **Add zero new `tsc` errors.**
11. **Targeted edits only** — never silently rewrite a whole file.
12. Anmol is non-technical: literal, copy-paste-ready instructions; text and code
    in chat, no diagrams or HTML.

---

## 14. Further reading

- `aren-technical-atlas.md` — the whole-repo map (both workspaces, auth, data layer).
- `aren-architecture-handoff.md` — product philosophy, the Visit object,
  Universal Cortex, Solo Mode, Design Philosophy. Read for *why*.
- `aren-frontdesk-source-of-truth.md` — reception doctrine + session history.
  Cortex-relevant: §13 (layer trap), §19 (the "Next Patient" gap).
- `Coretx File Str.md` — Session 31. **Superseded by this document**; see §11.

*End. Update when the consult loop changes shape.*
