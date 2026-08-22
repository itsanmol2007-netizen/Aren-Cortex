# Session handoff — 2026-08-23

**Temporary, self-replacing.** Rewrite or delete when the next session ends.

**Read order for a cold start:** this file → `docs/context/README.md` (routes
to one scoped pocket) → `docs/aren-cortex-context.md` only if the task needs
the full picture.

**Why this handoff exists mid-task:** the machine this session was running on
hit a critical problem and Anmol is moving to a different machine. Nothing
here is a natural stopping point — the Patient Overview rebuild is roughly
40% done, mid-file, CSS not even started. This is a stop-and-resume, not a
finished arc.

---

## 0. What this arc is: rebuild the Patients Overview page, specialty-aware

Anmol's brief (paraphrased, he gave the full prompt in-session — re-read the
conversation if resuming same-thread, otherwise see §4 for the gist):
**`docs/temp ref/Physio Patient Overview Page.png`** is the visual reference
(now committed). Rebuild `src/features/patients/` (PatientsPage/PatientsList
— NOT the front-desk-facing brief in `docs/Patients Page Design Brief.md`,
that's a different, older doc for a different framing) at ~95% visual
similarity, with one hard requirement: the "Clinical Snapshot" column and
sidebar must be **specialty-aware** — physiotherapy shows complaint/body
region/session count, General OPD shows symptoms/findings/medicine, and nail
this without fabricating data that doesn't exist yet.

**Governing instruction from Anmol, said twice, applies to everything in this
arc:** "don't mold a doctor into our architecture, mold our architecture into
theirs" — i.e. when the UI wants a clinical concept the schema doesn't
support yet (functional-limitation text, real care-plan sessions), the
correct move is real schema work + an honest empty/zero state + a documented
gap, never a heuristic standing in for missing data. This shaped every
decision below — read it before changing any of this arc's code.

## 1. What's DONE and committed (pushed to `origin/master`)

Two commits this arc, `f24191a` then `638d02c`, both pushed, tree clean at
handoff time:

- **`visit_impairments` table created live** (Supabase migration
  `add_visit_impairments`) — the missing persistence for the physio
  "impairment" intent type (only type of the 8 with nowhere to land after
  accept). Shaped like `prescription_exercises` (points at `intents.id`
  directly, no v1 legacy join). RLS `hospital_isolation` policy verified
  against Postgres directly. **Schema only — nothing writes to it yet.**
- **`src/features/synapse/patientSnapshot.ts`** (new) — the specialty-aware
  Clinical Snapshot config, same shape as `specialtyProfile.ts`.
  `snapshotFor(profile, row)` returns `{ chips, detail }`. Real builders for
  `general_opd` and `physiotherapy`; every other profile falls through to the
  General OPD shape (correct per Anmol's scope: only those two are "real"
  contexts for now, and no other profile has its own `inputLayout` either).
- **`src/features/patients/visitStatus.ts`** (new) — `visitStatusKind()`, one
  shared 4-state categorisation (`active`/`waiting`/`done`/`inactive`) of
  `visits.status`. Fixes a real bug: the old code only recognised
  serving/active as active and defaulted EVERYTHING else — including
  `waiting` and `draft` — to "Completed". Verified live against Ekanki's 165
  physio visits which real status values actually occur:
  `serving, completed, discarded, waiting, draft`. No `scheduled` or
  `no_show` status exists anywhere — the reference mock's "Scheduled" pills
  and "No Show" stat have no backing data; do not add them without a real
  status value to read.
- **`src/lib/db/patients.ts`** — `fetchTodayPatients`/`fetchRecentPatients`
  refactored onto one shared `buildPatientRecordRows()` (was two ~170-line
  copy-pasted bodies; a third near-copy for the new fields would have been
  the third independent place to keep in sync — rule 19). `PatientRecordRow`
  gained real fields, ALL verified against live data, not fabricated:
  `body_sites` (from `visit_body_sites`), `exercise_names` (from
  `prescription_exercises` via `prescriptions.visit_id`), `impairment_names`
  (from the new table — empty today, honestly), `story_duration` /
  `story_mechanism` (from `visit_story`), `care_plan_session_label` +
  `care_plan_progress` (from `care_plans` — null for effectively every visit
  today because nothing links one yet, see §2).
- **`docs/aren-cortex-context.md` §7** — two new dated entries recording the
  real gaps found this arc (impairment persistence unwired, care_plans
  unused in practice). Read these before doing ANY physio-consult wiring
  work — they're the map for that follow-up session.
- **`src/features/patients/PatientsPage.tsx`** — `RightPanel` rebuilt:
  `Today's Practice` (avg visit time now REAL, computed from
  `started_at`/`completed_at` — was a hardcoded `"1h 42m"` lie before this
  arc), physio-only `Active Care` / `Common Conditions` / `Recent Activity`
  cards, General-OPD-and-fallback `Common Complaints` / `Top Prescribed
  Medicines` now computed for real (was `PLACEHOLDER_MEDICINES`, a fake
  hardcoded array, before this arc). Sidebar cards are filter lenses over the
  same table (`PatientFilter` state — `activeCare`/`reassessmentDue`/
  `returning`/`condition`) per the brief's "keeps the user on Patients,
  filters the list" instruction, not new pages.
- **`src/App.tsx`** — passes the computed `specialty` (`SpecialtyProfile`)
  into `<PatientsPage>`.
- **`src/features/patients/PatientsList.tsx`** — `TodayCard`/`PatientTableRow`
  now read `visitStatusKind()` and `snapshotFor()` instead of the old
  hardcoded active/completed check and the 4 fixed Symptoms/Findings/
  Medicines/Tests columns. `PatientsTableHead` takes `specialty` and labels
  the count column "Visits" or "Sessions" via `visitNoun()`.

**`tsc -b` passes clean as of `638d02c`.** Not yet run through `vite build`
or a real browser — see §2.

## 2. What's NOT done — pick up here

In priority order:

1. **`SnapshotCell` and the new `PatientTableRow`/`TodayCard` markup have
   NO CSS yet.** New classes referenced but undefined:
   `.prec-snapshot-cell`, `.prec-snapshot-chips`, `.prec-snapshot-chip`
   (+ `--primary`/`--neutral`/`--count` tone variants), `.prec-snapshot-detail`,
   `.prec-table-cell--snapshot`, `.prec-table-th--snapshot`,
   `.prec-filter-chip` (the active-filter pill in the search header),
   `.prec-activecare-grid`/`.prec-activecare-cell`/`.prec-activecare-cell--warn`,
   `.prec-activity-list`/`.prec-activity-row`/`.prec-activity-name`/
   `.prec-activity-status` (+ `is-active`/`is-waiting`/`is-done`/`is-inactive`),
   `.prec-complaint-row--clickable`. Also need `is-waiting`/`is-inactive`
   variants added to the EXISTING `.prec-status-pill`, `.prec-today-card`,
   `.prec-today-status-chip` (currently only have `is-active`/`is-done`/
   `is-inactive` in some places, `is-active`/`is-done` in others — check
   both `patients-list.css` layered sections, see the note below).
   Right before the interrupt: was reading `patients-list.css` (1325 lines,
   note it has 2-3 layered "atmospheric treatment" sections that redefine the
   same classes later in the cascade — read the WHOLE file and add new rules
   at the very end so they win, don't insert mid-file) and
   `patients-shell.css` (RightPanel's `.prec-panel-*`/`.prec-summary-*`/
   `.prec-complaint-*`/`.prec-medicine-*` live here, plus wherever
   `.prec-page-header`/`.prec-search-wrap` is for the filter chip). Palette
   already established: blue `#1268e8`/`#1d4ed8`, purple `#7c3aed`/`#6d28d9`,
   green `#15803d`/`#16a34a`, amber `#a16207` for "in progress", pink
   `#db2777`/`#ec4899` for the today-card accent gradient.
2. **Never run `npm run dev` + a real browser against this yet** — the whole
   point of moving to a real machine last time was to stop shipping blind,
   and this arc has gone right back to "reasoned from source, never
   rendered." Do this BEFORE calling it done: `npm run dev`, open Patients
   as Ekanki (physiotherapy profile, real data — 165 real visits, patient
   "Rohan Malhotra" has 5+ real physio visits to look at), confirm the
   Clinical Snapshot column actually reads clinically, confirm Today's
   Patients cards, confirm the sidebar renders without layout breaking at
   304px width, confirm filter-lens clicking actually filters the table.
3. **Status filter dropdown from the reference mock** ("All Status" select +
   filter icon next to search) — not built at all yet. Given
   `fetchRecentPatients` only ever returns `status: "completed"` rows today,
   think about whether this control is even meaningful before building it —
   see the conversation transcript for the reasoning that was in progress.
4. **Pagination in the mock screenshot vs the brief's text** — brief
   explicitly says no numbered pagination, use continuous scroll. The
   existing list already scrolls, not paginated — keep it that way, the
   mock's "1 2 3 4" footer is the one thing to deliberately NOT copy.
5. **`PatientRecord.tsx` (the detail page) is explicitly OUT of scope for
   this arc** — Anmol confirmed "Overview only, this pass" when asked. It
   still hardcodes "Medicines"/"Common Medicines"/"Prescription" labels
   regardless of specialty (a real bug, found earlier this session) — leave
   it for a dedicated follow-up, don't scope-creep into it.
6. Search results (`searchPatients` path in `PatientsPage.tsx`) still map to
   an all-empty `PatientRecordRow` (no visit data for a bare patient search)
   — the Clinical Snapshot correctly renders its empty state for these, this
   is expected, not a bug.

## 3. Two real architecture gaps found this arc — tracked, not faked

Both fully written up in `aren-cortex-context.md` §7 with dates — read
there for the complete reasoning. Short version:

- **Impairment intents (physio's "what is limiting this person") have never
  been persisted anywhere queryable.** `visit_impairments` table now exists
  (this arc). Nothing writes to it — no `case "impairment"` in
  `useConsultPlan.ts`'s accept handler, no read in the consult screen. This
  is why the Clinical Snapshot's "functional limitation" line falls back to
  story/exercise text instead of real impairment data — there isn't any yet.
- **`care_plans` is a fully-built, correctly-designed table that nothing in
  the physio consult flow actually uses.** Verified live: `care_plan_id` is
  `null` on essentially every real physio visit, including patients with 5+
  visits. So "Session 4 of 12" never renders true anywhere in the product
  today. The Patient Overview's session count correctly falls back to real
  total visit count, honestly labelled, rather than fabricating a plan-based
  number.

**Both are scoped as "a dedicated physio-consult session" — NOT this arc.**
Anmol was explicit that the write/wiring work belongs in a future session
focused on the consult screen itself, not bolted onto the Patients Overview
page as a workaround.

## 4. If resuming in a fresh conversation with no prior context

Paste this to the new session:

> Read `docs/SESSION-HANDOFF.md`, then `docs/aren-cortex-context.md`
> (especially §7's two dated entries about `visit_impairments` and
> `care_plans`). We're mid-rebuild of the Patients Overview page
> (`src/features/patients/`) against `docs/temp ref/Physio Patient Overview
> Page.png` — specialty-aware Clinical Snapshot, sidebar filter lenses, no
> fabricated data. The data layer and component logic are committed and
> `tsc` passes clean; the CSS for all the new markup has not been written
> yet, and none of it has been seen in a real browser. Pick up at §2 of the
> handoff, in order: CSS first, then `npm run dev` and actually look at it
> against Ekanki's real physiotherapy data before calling anything done.

## 5. Environment (unchanged from prior arcs)

- No `supabase/migrations/`; schema changes apply live via Supabase MCP.
  Project `ieimvjprtltancxapuzg` (org `arenod`, `ap-south-1`).
- Dev server `npm run dev` → `http://127.0.0.1:5173`.
- Ekanki Solo Clinic (`hospital_id 64c26e24-3668-49c6-8b99-6ddb8c14883e`) is
  the real physiotherapy test account — 165 real visits, use this to verify
  against, not synthetic data.
- `main` and `master` are unrelated histories. All active work is on
  `master`.
