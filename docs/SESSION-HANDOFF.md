# Session handoff — 2026-09-03 (Front Desk intake: unified symptom/history picker, reception measurements, layout polish)

**Temporary, self-replacing. REWRITE THE WHOLE FILE.** `cortex-design-dna/*.md`
and `context/*.md` are stable reference — touch them only when a rule in them
is actually wrong. Front Desk's own long-form record is
`docs/aren-frontdesk-source-of-truth.md` (add a Part when this lands for good).

## ⚠ HOW TO VERIFY IN THIS ENVIRONMENT

- `npm install` first (node_modules can start incomplete). `npx tsc --version`
  must say **5.9.3**. `npm run build` (`tsc -b && vite build`) currently passes
  clean — 0 type errors, exit 0. Do not add `ignoreDeprecations`.
- **Build passing ≠ looks right.** Render it. This session's throwaway harness
  (deleted afterward) was `preview.html` + `src/__preview.tsx`: mounts
  `CreateVisitModal` / `FrontDeskPage` inside `QueryClientProvider` +
  `MemoryRouter` + `AuthProvider`, stubs `window.fetch` for the three catalogue
  reads (`observables`, `observable_alias`, `observable_signals`) with a mock
  chip set, `npx vite --port 5199`, drive with the browser tools.
  `?v=page` rendered the whole Front Desk page; `?v=modal` just the intake modal.
  - **Gotcha:** `useCachedIntakeChips` refreshes on mount whenever
    `navigator.onLine`; against the real `.env` Supabase that returns `[]`
    (unauthed RLS) and *overwrites* the seeded localStorage cache. Stub `fetch`,
    don't just seed the cache.
  - **Gotcha:** synthetic `dispatchEvent('click')` on a `createPortal` dropdown
    row does NOT reach React's handler (portal is outside `#root`). Real clicks
    (`computer` tool / `.click()` won't help) work; drive picks via keyboard
    (type + Enter) or the `computer` tool with a fresh screenshot.

## What this session did — Front Desk intake modal + layout

### One search field for symptoms AND history (was: symptoms only, inline results)
`components/ObservablePicker.tsx` (new) replaces the old inline `SymptomPicker`
inside `CreateVisitModal.tsx`. Modelled on Cortex's `PickerCard`:
- **`kinds: ("symptom"|"history")[]`** — Front Desk passes both into ONE field
  ("Symptoms & History", required ≥1 symptom-kind). Each result row shows a
  `SYMPTOM` / `HISTORY` tag; history chips wear a violet tint. Split back by
  `chip.kind` at save: symptom labels → `symptomNames` (queue column), all ids →
  `visit_observations`.
- **Results in a `createPortal` dropdown** (`position:fixed`, own scroll, capped
  `MAX_RESULTS = 10`) — never in-flow. The selected-chip well is **fixed height
  `h-[62px]`** and scrolls. **Verified: the modal card is byte-identical
  (measured `getBoundingClientRect`) across closed / open / 3 results / 20 fuzzy
  results / no match / after Escape.** This was the whole point — the old inline
  picker grew and shrank the modal on every keystroke.
- Ranking/keyboard/dismissal carried over from the old picker
  (`observableMatch.ts`, extracted). Empty query → the everyday general-system
  symptoms; history surfaces once you type. Dismiss on outside **click** (never
  mousedown — the s37 "existing patient visits fail" regression).
- Persistence path unchanged: `useVisitActions.createNewVisit` →
  `saveVisitObservations` writes every id, `saveVisitSymptoms` mirrors the legacy
  subset. **`observationNamesByVisit` gained a `kinds` param** (default
  `["symptom","history"]`, unchanged for every existing caller);
  `fetchTodayVisits` now passes `["symptom"]` so volunteered history is saved
  canonically but does not read as a presenting complaint in the queue column.

### Reception measurements — a stacked sub-modal
`components/MeasurementsModal.tsx` (new), opened from a quiet optional row in the
intake modal ("Measurements", like the Attachments row), stacked over intake via
`ModalShell`'s existing `openModalIds` stack.
- Reuses Cortex's field catalogue verbatim — `MEASURE_FIELDS` / `FIELD_BY_KEY`
  from `features/consult/measures.ts` — filtered to a **reception allow-list**
  (`RECEPTION_KEYS`: BP, pulse, resp rate, SpO₂, temp, weight, height, blood
  group, the glucose panel, pain, LMP, G-P-L-A). No goniometry / disability
  indices.
- Shown = default vitals (`bp,pulse,temp,spo2,weight`) ∪ **Synapse-relevant** ∪
  anything holding a value. The rest reached via a capped search
  (`DEFAULT_VISIBLE = 6`). Fixed-height scroll box (`h-[300px]`); the
  add-measurement section is **always mounted** with fixed internal heights
  (`h-[62px]` chip area) so the modal is the same size with ten fields to add or
  none. **Verified stable** across adding all fields.
- **Synapse relevance**: `fetchIntakeChips` in `lib/db/synapse.ts` now reads
  `observable_signals` and attaches **`signalIds: string[]`** to each
  `IntakeChip` (cache key bumped `aren.cache.intakechips.v2` → `v3` in
  `operational/referenceCache.ts`). `CreateVisitModal.relevantFromChips()` maps
  the picked chips' signals → `RELEVANT_FIELDS` (same map Cortex's
  MeasurementsCard uses). **Verified live**: Fever→Temp, Cough→Resp Rate,
  Pregnancy(history)→LMP + G-P-L-A auto-surface. `JOINT_RANGE_FIELDS` not used.
- **Persistence**: `lib/db/patients.ts` `saveVisitMeasurements(visitId, rows)` —
  additive `upsert` into `visit_measurements` on `onConflict: "visit_id,
  measure_key"` (same target as `persistVisitInput`). Rows built by the shared
  **`vitalsToMeasurements`** (`lib/synapse/consultInput.ts`) so a reception BP is
  the exact `BP_SYS`/`BP_DIA` pair the engine/print expect (also °F→°C, LMP→
  LMP_DAYS, G-P-L-A split). Wired through `createNewVisit` as an optional
  `vitals?: Partial<Vitals>`, best-effort — a failed number never fails the visit.

### Layout — reference image (2026-09-03)
- **`StatStrip.tsx`** icons: Waiting `Armchair`→**`Hourglass`**, In Consultation
  `ClipboardCheck`→`Stethoscope`, Completed `BadgeCheck`→`CheckCircle2`. Tone
  tiles unchanged.
- **`FrontDeskPage.tsx`** regrid: the launcher + stat strip + queue now share the
  **left column** of a `grid-cols-[1fr_248px]`; the right **Sidebar rises to the
  top**, aligned with the search bar. So the search bar is queue-width, not
  full-page, and the sidebar no longer starts below the stat strip.
- **`Sidebar.tsx`** is now **ONE white panel**, full height, same surface
  language as the QueuePanel — both columns are framed and end on the same line.
  `SummaryCard` / `DoctorsCard` / `DoctorRequestsCard` are **sections** of it
  (hairline `divide-y` between; their individual `rounded/border/bg-white/shadow`
  chrome removed). Fixes the "sidebar ends mid-air with a void beneath it"
  problem without stretching anything — leftover space is quiet panel, exactly
  like the QueuePanel's own empty area.

## Flagged / not done

- **NavRail** not touched. The reference's "rail nudged up" was judged not worth
  a change; revisit if it still reads wrong on a real 1080p screen.
- **VisitDetailModal** shows no dedicated "History / context" section — history
  is saved to `visit_observations` (Cortex reads it) but the FD detail view
  still only lists symptom-kind labels via `visit.symptom_names`. Add a section
  if reception needs to see it back.
- Only verified against the **mock** catalogue in the harness + `getBounding
  ClientRect` measurements + screenshots. **Not** verified against live Supabase
  with a real reception login, and a real `visit_measurements` / history-kind
  `visit_observations` write was **not** confirmed end-to-end via the DB.
- `i18n/strings.ts` carries a few now-unused keys from an earlier two-field
  design (`fldHistory`, `phHistory`, `histCatalog`, `noHistoryMatch`) — harmless,
  `hinglish` has them too; delete on a tidy pass.
- Chunk-size build warning is pre-existing (1.6 MB `index` bundle), not from this
  work.

## Environment

- No `supabase/migrations/`; schema changes go in live via Supabase MCP. This
  session added **no** schema — `observable_signals`, `visit_measurements`,
  `visit_observations` already existed.
- Project `ieimvjprtltancxapuzg` (org `arenod`, `ap-south-1`).
- `main` and `master` are unrelated histories; Front Desk work lands on `master`.
- Changed: `FrontDeskPage.tsx`, `CreateVisitModal.tsx`, `Sidebar.tsx`,
  `SummaryCard.tsx`, `DoctorsCard.tsx`, `DoctorRequestsCard.tsx`,
  `StatStrip.tsx`, `hooks/useVisitActions.ts`, `i18n/strings.ts`,
  `operational/referenceCache.ts`, `lib/db/patients.ts`, `lib/db/synapse.ts`.
  New: `components/ObservablePicker.tsx`, `components/observableMatch.ts`,
  `components/MeasurementsModal.tsx`.
