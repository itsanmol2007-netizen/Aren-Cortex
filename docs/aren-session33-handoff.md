# AREN — SESSION 33 HANDOFF (Front Desk assembled & running)

Date: 2026-07-11
Read this alongside the frozen architecture doc (`docs/aren-architecture-handoff.md`)
and the build brief (`docs/aren-frontdesk-brief.md`). This doc covers what
happened THIS session and where to continue.

Note: `docs/aren-session32-handoff.md` is now partly STALE — session 32 used a
plain-CSS `frontdesk.css` / `fd-*` approach that has been REPLACED this session
by the Tailwind production rebuild described below. Trust this doc + the brief
over session 32 for anything Front-Desk styling related.

====================================================
## 1. WHAT AREN IS
====================================================

AREN is a lightweight clinical operating system for small/medium clinics
(currently on paper or old software). Philosophy: reduce friction, reduce
clicks, reduce cognitive load. It is NOT a hospital management system and NOT
analytics software — it's an operational workspace that should "just work" and
then disappear while people use it.

Everything revolves around the **Visit** object (Patient ≠ Visit; one patient
has many visits). The whole product is two workspaces over the SAME visit data,
in the SAME app / deployment / database, split only by route:

- **Cortex** — the doctor's clinical workspace (`/app/cortex`, `src/App.tsx`).
  Review history, record findings, diagnose, pick medicines, order tests,
  generate prescription, complete the consult. This already existed before the
  Front Desk work and is largely untouched.
- **Front Desk** — the receptionist's visit-management workspace
  (`/app/frontdesk`). Search/create patients, create visits, manage the queue,
  assign doctors. This is what we are building now.

Visit status flow: `waiting → serving (In Consultation) → completed`.
`discarded` (Cancelled) and `referred` are terminal side states.

Architecture is FROZEN — do not re-litigate the Reception/Doctor split, the
"one Universal Cortex, no config engine", or the panel-composition model without
new field evidence. Full detail in `docs/aren-architecture-handoff.md`.

Key load-bearing rule: shared components NEVER branch on `specialty` or
`clinicMode` internally. Any such difference is decided at the page/route level.

====================================================
## 2. WHAT WE ARE BUILDING (Front Desk)
====================================================

Porting a finished HTML prototype into the real React + TypeScript + Vite +
Tailwind + Supabase codebase as production components. The reference and the
full spec are:

- Visual reference (the exact target): `design/aren-frontdesk-v2.html`
  (a standalone HTML mock with fake data — open it in a browser to see the
  intended design fully populated).
- Build brief (rules, file layout, decorative details): `docs/aren-frontdesk-brief.md`

Rules that matter most:
- All styling is Tailwind utility classes inside the `.tsx` files. NO separate
  CSS files for Front Desk. Inline `style=` only for the row-tint gradients.
- All DB calls live in `src/lib/db/*` only — never inline Supabase in a component.
- Dropdowns/overlays use `createPortal`.
- Components talk through props / shared state, never by importing each other's
  internals.

Confirmed DB facts (do not re-ask):
- Supabase project `ieimvjprtltancxapuzg`; creds in `.env`.
- Hospital ID `38bd8da3-0dd2-43a5-ad09-2d3194c95ba9`.
- Doctor `SK Pandey` = `5cd330d2-5a48-4098-b865-ed3393e08698`.
- `visits.status` is plain TEXT (no enum). Values: waiting, serving, completed,
  discarded, referred.
- `visits.token_number` has NO DB default — computed in `createVisit()` as
  "highest token today + 1" (already implemented).

====================================================
## 3. WHAT I DID THIS SESSION
====================================================

The individual Front Desk components already existed from the prior session but
were NOT wired together — `FrontDeskPage.tsx` was still an old stub pointing at
throwaway components, so the page was broken. This session finished the build:

**a) Fixed a compile-blocking bug (DB layer).**
`DoctorsCard` reads `doctor.avatar_url` and `doctor.availability_status`, but
the `DBDoctor` type and the doctor queries didn't include those fields — a hard
TypeScript error. Verified against the LIVE database that both columns actually
exist, then added them to the `DBDoctor` type and to both doctor `select`s.
File: `src/lib/db/patients.ts`.

**b) Assembled the real main page.**
Rewrote `src/features/frontdesk/FrontDeskPage.tsx` from a stub into the full
workspace: Header + PatientLauncher + StatStrip + a grid of QueuePanel (left)
and Sidebar (right), plus the two modals. Wired to the `useQueue` and
`useVisitActions` hooks. Added an inline Header (brand mark, live clinic name +
date + clock, user avatar) and the faint dot-grid page background.

**c) Simplified the Sidebar.**
Changed `Sidebar.tsx` to receive the doctor list as a prop instead of fetching
it itself, so the page fetches doctors once and shares them with the modals.

**d) Updated routing.**
`src/main.tsx`: removed the dead `/app/frontdesk/register` route and its import,
and removed the now-unused `frontdesk.css` import. `/app/cortex` and the `/`
redirect are untouched.

**e) Deleted the leftover session-32 files** (confirmed no remaining references):
- `src/features/frontdesk/components/PatientSearchBar.tsx`
- `src/features/frontdesk/components/QueueCard.tsx`
- `src/features/frontdesk/RegisterPatientPage.tsx`
- `src/styles/frontdesk.css`

**f) Verified in a real browser (headless Chrome).**
`/app/frontdesk` mounts, loads LIVE Supabase data (clinic name "Anmol Homeo
Clinics", doctor SK Pandey with avatar + green online ring), Tailwind is fully
applied, no app console errors. Queue shows its empty state because no visits
are logged today (expected). Re-checked `/app/cortex` still mounts fine.

====================================================
## 4. CURRENT FRONT DESK FILE TREE (with purpose)
====================================================

All under `src/features/frontdesk/` unless noted.

    FrontDeskPage.tsx          [REWRITTEN this session]
        The /app/frontdesk page. Owns page-level state (openVisit modal,
        create-visit modal, doctors list, hospital info, live clock) and wires
        useQueue + useVisitActions. Renders Header + PatientLauncher + StatStrip
        + (QueuePanel | Sidebar) grid + the two modals. Header is an inline
        component here (no separate Header file). Page bg = faint dot-grid.

    statusStyle.ts
        Central per-status palette (waiting=amber, serving=blue, completed=green,
        discarded/referred=neutral): border color, dot color, text class, chip bg,
        and the exact row-tint gradient strings copied from the prototype.
        tintFor(status) is the lookup used by VisitRow / modals.

    utils.ts
        Pure presentational helpers: timeAgo, formatShortDate, maskPhone,
        initials, padToken. No DB, no side effects.

    types/frontdesk.ts
        Front Desk TypeScript types. Re-exports TodayVisit/DBPatient/DBDoctor
        from the db layer, plus VisitStatus, QueueTab, DoctorActivity,
        DoctorSummary, DoctorRequest, PatientMatch, CreateVisitFormValues, and
        STATUS_LABEL.

    hooks/useQueue.ts
        Fetches fetchTodayVisits(hospitalId) on mount and silently re-fetches
        every 25s (REFRESH_INTERVAL_MS). Returns { visits, setVisits, loading,
        refetch }. First load shows skeletons; refreshes are invisible.

    hooks/useVisitActions.ts
        All visit mutations with OPTIMISTIC UI (patch in-memory queue first, roll
        back on error, toast on both): startConsultation (markVisitServing),
        completeVisit, cancelVisit (with Undo toast), reassignDoctor,
        createNewVisit (findPatientByPhone → createPatient → createVisit(...,
        "waiting", doctorId) → best-effort symptom matching → refetch).

    components/PatientLauncher.tsx
        Full-width search bar (debounced searchPatients, portal dropdown of
        existing matches + a "Register new patient" row) and the blue circular +
        button. onSelectExisting / onCreateNew bubble up to the page, which opens
        CreateVisitModal. The soft violet focus ring is the only purple in FD.

    components/StatStrip.tsx
        Four stat cards (Today's Visits / Waiting / In Consultation / Completed),
        counts derived from the visits array, each with a faint decorative corner
        circle SVG.

    components/QueuePanel.tsx
        "Today's Visits" table shell + the four count tabs (All / Waiting /
        In Consultation / Completed). Filters + sorts the visits (waiting first,
        then serving, then completed; oldest-first within a status). Renders a
        VisitRow per visit; skeleton rows while loading; illustrated empty state.

    components/VisitRow.tsx
        One visit row. Owns its own hover + right-side context menu (portal):
        Open Patient / Move to Another Doctor / Mark Completed / Cancel Visit.
        Left 3px colored stripe = primary status indicator; row background uses
        the status-tint gradient. Shows token, name, Returning badge, masked
        phone, up-to-2 symptoms (+N tooltip), doctor, last-visit date, status.

    components/VisitDetailModal.tsx
        Centered modal (portal) for a single visit: patient header, symptoms,
        assigned-doctor <select> (reassign), status-change buttons (context-aware
        by current status), and the patient's 3 most recent past visits
        (fetchPatientVisits). Esc / backdrop closes.

    components/CreateVisitModal.tsx
        Centered modal (portal) for a new visit. Existing patient → compact
        confirmation card + symptoms + doctor. New patient → name/phone/age/
        gender + symptoms + doctor, with validation. Calls onCreate
        (useVisitActions.createNewVisit). Esc / backdrop closes.

    components/Sidebar.tsx        [SIMPLIFIED this session]
        Assembles SummaryCard + DoctorsCard + DoctorRequestsCard. Now receives
        `doctors` as a prop (page fetches once).

    components/SummaryCard.tsx
        Today's Summary: Current Token (highest active serving token) and Average
        Wait (mean wait of waiting visits).

    components/DoctorsCard.tsx
        Per-doctor row: avatar (with status-colored ring: blue=with patient,
        green=free/online, none=off), name, activity line, and per-doctor waiting
        queue count. Reads d.avatar_url + d.availability_status (the fields added
        this session).

    components/DoctorRequestsCard.tsx
        "Future communication bridge" — NO backing DB table yet. Session-only
        simulate/acknowledge to demo the pulsing-amber active state. Purely mock.

Changed OUTSIDE the feature folder:
    src/lib/db/patients.ts   — DBDoctor type + DOCTOR_COLUMNS + both doctor
                               selects now include avatar_url, availability_status.
    src/main.tsx             — removed register route + frontdesk.css import.

====================================================
## 5. HOW TO RUN / TEST
====================================================

In the Claude Code prompt, type:  ! npm run dev
Then open in a browser:
    http://127.0.0.1:5173/app/frontdesk    (Front Desk)
    http://127.0.0.1:5173/app/cortex       (Doctor workspace)
    http://127.0.0.1:5173/                 (redirects to /app/cortex)

To see the queue populated, click the blue + button (or search a name) and
create a visit — it appears immediately as a "Waiting" row.

To see the intended design fully populated with fake data, open the prototype
file directly in a browser: design/aren-frontdesk-v2.html

====================================================
## 6. KNOWN ISSUES / OPEN ITEMS
====================================================

1. **DESIGN NOT SIGNED OFF.** Anmol's reaction to the live page: "looking
   terrible." The empty queue makes it look sparse vs. the populated prototype,
   but there may be genuine styling divergence from `design/aren-frontdesk-v2.html`
   too. NEXT: render the prototype and the React page side-by-side, list concrete
   differences, and either fix the port to match precisely OR agree on specific
   changes. Do this before building more features on top.

2. **`npm run build` fails on ~46 PRE-EXISTING TypeScript errors** in legacy
   files (`src/App.tsx`, `src/components/PreviewPanel.tsx`, `src/data/mockData.ts`)
   — the `Test`/`SelectedSymptom` types. These are NOT from the Front Desk work
   and do NOT stop `npm run dev` (Vite uses esbuild, no typecheck). A production
   build needs them cleaned up eventually. To check only FD files:
   `npx tsc -b 2>&1 | grep -iE 'frontdesk|lib/db'`  (currently clean).

3. **No auth on Front Desk.** Anyone with the URL can open /app/frontdesk. Fine
   for local dev; must be resolved before any real clinic.

4. **Cortex ↔ Front Desk loop not closed.** Cortex has no "Next Patient" button
   yet. The DB function markVisitServing exists and useVisitActions.startConsultation
   uses it from the Front Desk side, but Cortex itself can't yet pull the oldest
   waiting visit. This is the piece that connects the two workspaces end-to-end.

5. **DoctorRequestsCard is mock-only** (no DB table). Fine per architecture.

6. **clinic_mode not read anywhere.** Column exists; no code checks solo vs
   reception yet.

====================================================
## 7. SUGGESTED NEXT STEPS (in order)
====================================================

1. Resolve the design (item 6.1) — match the prototype precisely or agree
   concrete changes. Highest priority; Anmol is blocked on this.
2. Manually test the create-visit flow end-to-end (create new + existing
   patient → appears in queue → open → In Consultation → Completed / Cancel +
   Undo).
3. Build the Cortex-side "Next Patient" button to close the loop (item 6.4).
4. Then revisit auth (6.3) and clinic_mode (6.6) before any pilot.

Codebase rules and the full architecture still apply — see the brief and the
architecture handoff.
