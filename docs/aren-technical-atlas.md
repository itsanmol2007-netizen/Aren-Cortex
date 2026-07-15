# AREN — Technical Atlas

*A star chart of the codebase for whoever flies it next.*
Last surveyed: 2026-07-16 · Branch: `master` · Includes everything through the Print RX page.

This document is deliberately **technical, not philosophical** — for product philosophy, design doctrine and workflow reasoning, open `aren-frontdesk-source-of-truth.md`. This atlas answers one question: *what files exist, and what does each one do*, so a CTO or full-stack developer can land, orient, and change things without archaeology.

Confidence note: the **reception suite** (`src/features/frontdesk/`), **prescription pipeline**, and **data layer** summaries below are verified from the code itself. The Cortex consult internals (`src/components/`, most of `src/features/*`) are mature and stable; their one-liners come from file naming and the architecture handoffs, not a fresh line-by-line read.

---

## 1. The sky at a glance

One React app. One Vite build. One deployment. One Supabase (Postgres) database. Two workspaces sharing that sky:

- **Cortex** — the doctor's clinical night-shift workspace (consult, diagnose, prescribe).
- **Reception** — the receptionist's dawn-side suite: Front Desk (today's queue), Patients (the archive), Print RX (the document room).

There is **no backend of our own**: the browser talks straight to Supabase with the anon key from `.env`. There is **no auth yet** — every route is open.

### Routes (`src/main.tsx`)

| Route | Component | Workspace |
|---|---|---|
| `/app/cortex` | `src/App.tsx` | Cortex (doctor) |
| `/app/frontdesk` | `src/features/frontdesk/FrontDeskPage.tsx` | Reception |
| `/app/patients` | `src/features/frontdesk/PatientsPage.tsx` | Reception |
| `/app/printrx` | `src/features/frontdesk/PrintRxPage.tsx` | Reception |
| `/`, `/app` | redirect → `/app/cortex` | — |

Cortex is itself a mini-router: `App.tsx` swaps internal "sidebar pages" (Patients, Prescriptions, Investigations, Communication, Clinic, Practice, Settings, Support) without changing the URL. Do not confuse `src/features/patients/` (Cortex's internal patients page) with `src/features/frontdesk/PatientsPage.tsx` (the routed reception page) — they are different stars that happen to share a name.

### Hardcoded identifiers (single-clinic MVP)

Defined in `src/lib/db/reference.ts`:
- `HOSPITAL_ID = 38bd8da3-0dd2-43a5-ad09-2d3194c95ba9`
- `DOCTOR_ID = 5cd330d2-5a48-4098-b865-ed3393e08698` (Dr. SK Pandey, `general`)

---

## 2. Orbital mechanics — stack, build, run

**Stack**: React 19 · TypeScript 5.9 · Vite 7 (esbuild dev — *no typecheck during dev*) · Tailwind **v4** (`@tailwindcss/vite`, imported in `src/styles.css`) · React Router 7 · TanStack Query (installed app-wide; the reception suite uses its own tiny hooks instead) · Supabase JS v2 · `sonner` (toasts) · `lucide-react` (icons) · `react-to-print` + `qrcode` (prescription printing) · `react-hook-form`/`zod`/radix/shadcn (present in deps; barely used so far).

**Scripts** (`package.json`):
- `npm run dev` → `http://127.0.0.1:5173`
- `npm run build` = `tsc -b && vite build` — **currently blocked**: ~46 *pre-existing* type errors in legacy files (`src/App.tsx`, `src/components/PreviewPanel.tsx`, `src/data/mockData.ts`). The app runs fine in dev because esbuild skips typechecking. Any new work must add **zero** new errors; filter with:
  `npx tsc -b 2>&1 | grep -iE 'frontdesk|lib/db|printrx'`
- Headless verification: system Chrome — `chrome.exe --headless=new --disable-gpu --no-sandbox --virtual-time-budget=8000 --dump-dom <url>` (or `--screenshot=`). For interactive flows, drive CDP over `--remote-debugging-port` with Node's native WebSocket (no npm packages needed).

**Env** (`.env`, not committed): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.

**Fonts**: Manrope + Inter via Google Fonts `<link>` in `index.html` (system-sans fallback offline).

---

## 3. The data layer — `src/lib/`

Rule: **components never touch Supabase directly.** Every query lives here.

```
src/lib/
├── supabase.ts          Supabase client singleton (env-driven).
├── db.ts                Barrel — re-exports ./db/* so `@/lib/db` imports work.
└── db/
    ├── reference.ts     Fixed IDs (hospital/doctor), symptom & finding catalogs
    │                    (fetchSymptoms/fetchFindings), frequency-slot helpers
    │                    (freqSlotToLabel / freqLabelToSlot — "1-0-1-0" ⇄ label),
    │                    Cortex ranking RPCs (probable findings, ranked panels).
    ├── patients.ts      The reception workhorse: searchPatients, findPatientByPhone,
    │                    createPatient, createVisit (computes token_number = today-max+1),
    │                    markVisitServing, updateVisitStatus, reassignVisitDoctor,
    │                    saveVisitSymptoms/replaceVisitSymptoms, replaceVisitFindings,
    │                    fetchDoctor(sByHospital), fetchHospital, fetchPatientVisits
    │                    (clinical history incl. meds), fetchTodayVisits (the live queue),
    │                    fetchPatientDirectory (archive w/ aggregates), fetchPatientHistory
    │                    (operational visit list), updatePatient (demographics only),
    │                    fetchPatientVisitStats, fetchTodayPatients/fetchRecentPatients
    │                    (Cortex records pages), fetchDraftVisits, fetchVisitWithDetails.
    ├── prescriptions.ts Print RX reads: fetchPrintQueue (latest 150 prescriptions
    │                    hydrated with patient/doctor/token/med counts) and
    │                    fetchPrescriptionRenderData (one prescription shaped exactly
    │                    for ReviewModal/PrescriptionDocument — medicines with names +
    │                    composition labels, symptoms, findings, tests, vitals, doctor).
    └── intelligence.ts  Cortex clinical engine: saveConsult (writes prescription +
                         prescription_medicines + diagnostic_orders + completes visit),
                         learning-loop / ranking edge-function calls. Reception never
                         imports this.
```

**Hydration pattern**: no SQL joins — fetch parent rows, then `IN (...)` fetches for related tables, aggregate in memory. Fine at clinic scale; revisit if a table outgrows a few thousand rows.

### Database tables (as the app uses them)

| Table | Key columns | Notes |
|---|---|---|
| `patients` | id, name, age, gender, phone, hospital_id, abha_id, phone_normalized, created_at | **No address column.** Older rows may have `hospital_id` null — directory/search intentionally don't filter by it. |
| `visits` | id, patient_id, assigned_doctor_id, hospital_id, status (plain TEXT), token_number, vitals (jsonb), prescription_ref, created_at, started_at, completed_at | Status values: `waiting · serving · completed · discarded · referred · draft`. `token_number` computed client-side in `createVisit`. |
| `visit_symptoms` | visit_id, symptom_id, intensity | Symptoms are **structured** — always IDs from the catalog, never free text. |
| `visit_findings` | visit_id, finding_id | |
| `symptoms` / `findings` | id, name (…) | ~51-row symptom catalog feeds everything. |
| `prescriptions` | id, visit_id, assigned_doctor_id, findings_text, follow_up_days, advice_notes, created_at | **No print-tracking columns** — see §6, print log. |
| `prescription_medicines` | prescription_id, medicine_id, composition_id, composition_ids[], dosage_mg, frequency (slot string, nullable), duration_days, route, notes, instructions, is_sos, sort_order | |
| `medicines` | id, name, manufacturer, strength_mg | No composition text here — |
| `compositions` | id, name, specialization_scope[] | …composition labels come from this table. |
| `diagnostic_orders` | visit_id, prescription_id, test_name, status | |
| `doctors` | id, name, specialization, qualification, registration_number, phone, signature_image_url, avatar_url, availability_status, hospital_id | |
| `hospitals` | id, name, address, phone, email, city, state, tagline, logo_url, accent_color, is_branded | Letterhead branding source. |

No `doctor_requests` table exists — that Front Desk card is a session-local mock.

---

## 4. Star chart — full file tree

### 4.1 Root & configuration

```
index.html            Vite entry; Google Fonts link; #root.
vite.config.ts        Vite + React + Tailwind v4 plugins; `@` → ./src alias.
tsconfig*.json        Project refs (app + node).
package.json          Scripts & deps (see §2).
components.json       shadcn config (mostly unused so far).
.env                  Supabase URL + anon key (do not commit).
public/aren-nebula.svg  The shared header "sky" texture.
```

### 4.2 `src/` core

```
src/main.tsx          THE router + global providers (QueryClient, sonner Toaster
                      bottom-right) + all legacy CSS imports (see layer trap, §6).
src/App.tsx           Cortex's entire consult workspace in one large component:
                      patient/visit state, symptoms→findings→medicines flow,
                      internal sidebar-page switching, ReviewModal wiring,
                      saveConsult call. (Owns most of the 46 legacy tsc errors.)
src/types.ts          Shared UI types: Medicine, PrescriptionMedicine (UI display
                      fields + DB persistence fields), Vitals, SelectedSymptom, Test…
src/styles.css        Tailwind v4 entry (`@import "tailwindcss"`).
src/vite-env.d.ts     Vite type shims.
src/utils/filter.ts   fuzzyFilter helper (Cortex chip search).
src/hooks/useConsultKeyboard.ts  Cortex consult keyboard shortcuts.
src/data/mockData.ts        Legacy mock catalog (type-error hotspot; dev-only paths).
src/data/testsCatalogue.ts  Static investigations catalog for TestsPanel.
src/assets/           aren-logo.png (color), aren-logo-w.png (white), nebula svg.
```

### 4.3 Cortex consult components — `src/components/` *(summaries from naming + handoffs)*

```
WorkspaceHeader.tsx      Ink header band of Cortex.
GlobalLogoTrigger.tsx    Logo button that opens the Cortex sidebar.
PatientModal.tsx         Patient intake/selection at consult start.
PatientHeader.tsx        Current patient strip inside the consult.
ActiveConsultGuard.tsx   Guards against losing an in-progress consult
                         (draft/referred/discarded transitions).
ChipSearchPanel.tsx      Symptom chip search/selection panel.
Tag.tsx                  The chip/tag primitive.
FindingsPanel.tsx        Probable findings (ranked) selection.
VitalsStrip.tsx          BP/pulse/temp/SpO₂/weight inputs.
MedicineSuggestions.tsx  Ranked medicine suggestions for selected findings.
FrequentPicksPanel.tsx   Doctor's frequently-picked medicines.
MedicineInspector.tsx    Dosage/frequency/duration/instructions editor for one med.
SelectedMedicinesBar.tsx Bar of currently selected medicines.
PrescriptionPanel.tsx    The prescription being assembled.
TestsPanel.tsx           Investigations picker (uses testsCatalogue).
PreviewPanel.tsx         Live consult preview (legacy tsc-error hotspot).
ReviewModal.tsx          ★ THE prescription review/print surface — see §5.
ActionButton.tsx         Shared button primitive.
ComingSoonPage.tsx       Placeholder for unbuilt Cortex pages.
```

### 4.4 Cortex feature pages — `src/features/` *(each = one sidebar page + its CSS)*

```
sidebar/       Sidebar.tsx + SidebarNav.tsx + sidebar.css — Cortex's internal nav
               (SidebarPage type drives App.tsx's page switching); ComingSoonPage.
patients/      Cortex's OWN patients records pages (PatientsPage/PatientsList/
               PatientRecord + 8 css files). NOT the routed /app/patients.
prescriptions/ PrescriptionsPage.tsx — doctor-side prescriptions list.
investigations/ InvestigationsPage.tsx — diagnostics overview.
communication/ CommunicationPage.tsx — placeholder/mock.
clinic/        ClinicPage.tsx — clinic profile page.
practice/      PracticePage.tsx — practice stats page.
settings/      SettingsPage.tsx — doctor settings.
support/       SupportPage.tsx — support/help page.
```

### 4.5 The prescription pipeline — `src/features/prescription/` ★ single source of truth

There is exactly **one** prescription renderer in the product. Cortex reviews through it; Print RX reprints through it. Branding/layout changes made here apply everywhere.

```
PrescriptionDocument.tsx  The printable document itself (A4 / A5 / Thermal variants,
                          inline-styled for print fidelity, QR generation).
                          Optional `date` prop: reprints carry the ORIGINAL
                          prescription date, not today.
PrintFormatSelector.tsx   A4/A5/Thermal picker modal + "remember my choice".
usePrintFormat.ts         Chosen format, persisted in localStorage `aren_print_format`.
```

And the surface that drives it, `src/components/ReviewModal.tsx`:
- Renders an on-screen preview + a hidden `PrescriptionDocument` for `react-to-print`.
- `mode` prop: `"review"` (default — Cortex's Edit / Confirm & Save flow, unchanged) or `"print"` (Print RX — read-only, Close + Print only).
- Optional `date`, `autoPrint` (fires the print flow on open, waiting briefly for the QR), `onPrinted` (fires on `onAfterPrint` — note: the browser cannot distinguish print from cancel).
- `onEdit`/`onSave` are optional (print mode doesn't pass them).

### 4.6 The reception suite — `src/features/frontdesk/` (detailed; all verified)

Despite the folder name, this hosts **all three** reception pages.

```
src/features/frontdesk/
│
├── FrontDeskPage.tsx        /app/frontdesk composition root: useQueue +
│                            useVisitActions + doctors fetch + 20s clock +
│                            modal state; lays out launcher/stats/queue/sidebar.
├── PatientsPage.tsx         /app/patients composition root: directory + history
│                            hooks, browser/workspace split, timeline & edit modals,
│                            reuses createNewVisit for "New Visit".
├── PrintRxPage.tsx          /app/printrx composition root: usePrintQueue +
│                            usePrintLog + per-selection fetchPrescriptionRenderData;
│                            deep links (?visit= / ?patient=, applied once then URL
│                            cleaned, info-toast when no prescription exists);
│                            opens ReviewModal mode="print" (autoPrint for the
│                            one-click path); records prints + success toast.
│
├── statusStyle.ts           Single lookup for status colors/tints/chips
│                            (STATUS_TINT + tintFor). Change a status color here only.
├── utils.ts                 Pure helpers: timeAgo, formatShortDate,
│                            formatArchiveDate (adds year when ≠ current),
│                            maskPhone, initials, padToken.
├── printLog.ts              ★ Print tracking. localStorage `aren.printrx.log`
│                            {rxId: {count, last}}; readPrintLog/recordPrint/
│                            usePrintLog (live via custom + storage events).
│                            Client-side by design — the DB has no print columns.
│                            If one lands, replace ONLY this module.
│
├── types/frontdesk.ts       Feature types: VisitStatus union, STATUS_LABEL,
│                            QueueTab, DoctorSummary/Request, PatientMatch,
│                            CreateVisitFormValues; re-exports DB row types.
│
├── hooks/
│   ├── useQueue.ts            Live visit queue — fetchTodayVisits, 25s silent poll.
│   ├── useVisitActions.ts     All visit mutations as standalone callables with
│   │                          optimistic patch → DB → rollback + toast:
│   │                          startConsultation, completeVisit, cancelVisit (undo),
│   │                          reassignDoctor, createNewVisit (dedupe + symptoms).
│   ├── usePatientDirectory.ts Archive list, load-once + refetch/patchEntry.
│   ├── usePatientHistory.ts   One patient's operational visit list.
│   └── usePrintQueue.ts       Prescription queue — fetchPrintQueue, 25s silent
│                              poll, exposes updatedAt for the "Updated…" pill.
│
├── i18n/
│   ├── strings.ts           THE copy dictionary: `en` (defines StringKey),
│   │                        full `hinglish`, `hi` = empty stubs (fallback to en),
│   │                        DICTS + LANGS. «token» interpolation. Every visible
│   │                        string in the reception suite lives here.
│   └── i18n.tsx             I18nProvider/useT/useI18n; lang persisted in
│                            localStorage `aren.frontdesk.lang`.
│
└── components/
    ├── WorkspaceShell.tsx     ★ Shared chrome for ALL reception pages: ink header
    │                          (clinic name, clock, LanguageDropdown, logo-toggles-
    │                          rail), NavRail mount, dawn background, FrontDeskStyles.
    ├── NavRail.tsx            Collapsible icon rail. NAV_ITEMS registry — adding a
    │                          page = one entry + route in main.tsx + label key.
    ├── FrontDeskStyles.tsx    ★ Inline <style>: the unlayered `fd-*` classes
    │                          (fd-bare, fd-field, fd-field-sm, fd-label…) that beat
    │                          the legacy CSS layer trap (§6) + keyframes
    │                          (aren-breath/pulse/rise), reduced-motion safe.
    ├── ModalShell.tsx         ★ The one modal surface (portal, thread, Escape,
    │                          press+release backdrop close, maxWidth prop).
    │                          Every new reception modal must use this.
    ├── fields.tsx             Shared form primitives: SectionLabel, Field,
    │                          AgeInput, GenderControl, PhoneInput (+91, 10-digit).
    │
    ├── PatientLauncher.tsx    Front Desk search-or-create bar (debounced
    │                          searchPatients, portal dropdown).
    ├── StatStrip.tsx          4 stat cards over the queue (zero-rule aware).
    ├── QueuePanel.tsx         Queue table: tabs+counts, sorting, column headers,
    │                          internal scroll, empty-state routing, skeletons.
    ├── VisitRow.tsx           One queue row + kebab menu. Completed rows carry the
    │                          quiet printer icon + "Print Prescription" menu item
    │                          → navigate(/app/printrx?visit=<id>).
    ├── Sidebar.tsx            Stacks the three sidebar cards.
    ├── SummaryCard.tsx        Current token + avg/longest wait + patients seen.
    ├── DoctorsCard.tsx        Per-doctor presence (off/busy/free) + queue count.
    ├── DoctorRequestsCard.tsx MOCK doctor requests (no DB) + the only sound (chime).
    ├── EmptyStates.tsx        MorningWelcome / TabEmpty / DayDone.
    ├── DawnArcs.tsx           The arcs SVG motif (morning / endOfDay variants).
    ├── CreateVisitModal.tsx   Intake form: grouped fields, Enter-flow, smart
    │                          phone/name dedupe, SymptomPicker (catalog picker,
    │                          typo-tolerant, stores symptom IDs).
    ├── VisitDetailModal.tsx   Visit view: symptoms, doctor reassign, semantic
    │                          status buttons, recent visits.
    │
    ├── patients/              /app/patients internals:
    │   ├── PatientBrowser.tsx     Search+filters+sort list (exports avatarTint).
    │   ├── PatientWorkspace.tsx   Header card, summary strip, timeline, recent
    │   │                          visits, Quick Actions (copy phone / WhatsApp /
    │   │                          View in Print RX → ?patient= deep link).
    │   ├── VisitTimeline.tsx      Proportional-spacing dot timeline.
    │   ├── TimelineModal.tsx      Full history modal (ModalShell 640).
    │   └── EditPatientModal.tsx   Demographics editor with phone-dedupe guard.
    │
    └── printrx/               /app/printrx internals:
        ├── PrintQueuePanel.tsx    Search (spans the whole loaded archive, overrides
        │                          tabs) · tabs Ready(=unprinted)/Recently Printed
        │                          (=printed, by last print) · doctor filter ·
        │                          auto-follows external selections to the right tab
        │                          + scrollIntoView · exports PrintStateChip
        │                          (amber "Not printed" / green "Printed n×").
        └── PrintWorkspace.tsx     Identity card + operational facts (doctor,
                                   prescribed, copies, last printed) · content chips
                                   (n medicines/tests/follow-up) · Print (brand
                                   gradient, autoPrint path) + Preview · patient's
                                   Prescription History (click to reprint older) ·
                                   warm empty state.
```

### 4.7 Dark matter — legacy & strays (safe to ignore, don't import)

```
@/                    A literal folder named "@" (shadcn misfire): button.tsx +
                      utils.ts created on disk instead of resolving the alias.
                      Nothing imports them. Deletable.
app.js                Ancient pre-React prototype data. Dead.
server.mjs            Tiny node static-file server; not referenced by any script.
original_chip.txt     Backup of an old chip component. Dead.
src-tree.txt          Stale UTF-16 `tree` dump. Dead (this atlas supersedes it).
src/styles/*.css      Cortex's legacy stylesheets, imported UNLAYERED in main.tsx —
                      alive and load-bearing for Cortex, and the cause of the
                      layer trap (§6). rx-modal.css is currently unimported.
docs/aren-session33-handoff.md  Stale on styling; history only.
```

---

## 5. How printing flows (the one pipeline, end to end)

```
Cortex:   consult → ReviewModal (mode=review) → Confirm & Save → saveConsult()
                                             └→ Print/Save PDF → PrintFormatSelector → react-to-print
Print RX: select rx → fetchPrescriptionRenderData → ReviewModal (mode=print,
          date=rx.created_at, autoPrint on the Print button) → same selector /
          same document → onPrinted → printLog.recordPrint + toast
Entry points into Print RX: nav rail · Front Desk completed-row printer icon
          (?visit=) · Patients quick action (?patient=).
```

---

## 6. Gravitational constants — invariants & gotchas

1. **Tailwind v4 layer trap** (the #1 foot-gun): the legacy Cortex CSS in `src/styles/` is imported *unlayered* in `main.tsx` and styles raw `input/select/textarea/label` **elements**; unlayered CSS beats Tailwind's layered utilities regardless of specificity. In the reception suite, never style those elements with utilities — use/extend the `fd-*` classes in `FrontDeskStyles.tsx`. (Raw `h2` is also affected — reception pages use styled `div`s for headings.)
2. **All reception styling is Tailwind-in-TSX.** No new .css files there; exceptions are inline `style=` gradients and the `FrontDeskStyles` inline block.
3. **Every reception string goes through `t('key')`** from `i18n/strings.ts` (en + hinglish; hi stubs). Cortex is not localized — acknowledged exception, as is the shared bottom-right Toaster.
4. **Symptoms are structured**: select from the `symptoms` catalog, persist IDs into `visit_symptoms`. Never free text.
5. **One modal chrome** (`ModalShell`), **one prescription renderer** (§5). Don't fork either.
6. **Print tracking is localStorage-only** (`aren.printrx.log`, per machine). Clearing browser data loses badges/copy-counts, never prescriptions. `onAfterPrint` also fires on a cancelled dialog — accepted: worst case an item reaches "Recently Printed" early, where it remains one click from reprinting.
7. **Optimistic mutations**: `useVisitActions` patches state, calls the DB, rolls back on failure; the 25s polls self-correct both queues. Skeletons, never spinners; undo instead of confirm where safe.
8. **Keyboard-ready, not keyboard-bound**: listbox/option roles, arrow-key list walking, Enter flows — but no global shortcut registry yet; visit actions are standalone callables so one can be added later.
9. `fetchPrintQueue` loads the latest **150** prescriptions and search/history work within that window — raise it or paginate when the clinic outgrows it.

## 7. Open items (technical debt ledger)

1. `npm run build` blocked by ~46 legacy tsc errors (App.tsx / PreviewPanel / mockData) — dev unaffected.
2. No auth / roles on any route.
3. `clinic_mode` (Solo Mode) exists in architecture, unread in code; Cortex "Next Patient" button (queue → serving handoff) unbuilt.
4. Devanagari `hi` strings are empty stubs (dropdown shows "soon").
5. `patients` has no address column though the Patients brief wanted one.
6. Native doctor `<select>` in reception modals is the last non-premium field.
7. Re-layering the legacy CSS (the real layer-trap fix) deliberately deferred.
8. `prescriptions` print-tracking column would let `printLog.ts` retire (see §6.6).

## 8. Deeper charts

- `aren-frontdesk-source-of-truth.md` — product/architecture/design doctrine, session history (Parts A–H). Read first for *why*.
- `Print RX Design Brief.md`, `Patients Page Design Brief.md` — the briefs those pages were built against.
- `aren-architecture-handoff.md`, `aren-frontdesk-design-direction.md` — frozen foundations.

*End of atlas. Update it when a new star ignites.*
