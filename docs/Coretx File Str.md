UPDATED FILE TREE (Session 31, not very Recent, But the recent i can find for cortex) — WHAT EVERY FILE DOES
====================================================
====================================================

src/
  App.tsx
      Root component. Still one large file (~780 lines). Owns ALL
      top-level state: patient, visit, symptoms, findings, prescription,
      vitals, ranked medicines, frequent picks, snapshots, sidebar/page
      navigation, and all three consult-only modal flags
      (patientModalOpen, isReviewOpen, activeConsultGuardOpen). Renders
      Sidebar + GlobalLogoTrigger always; renders exactly one of
      PatientsPage / ComingSoonPage / the consult workspace based on
      activePage; renders the three modals at the bottom (should be
      gated by !isFeaturePage — see Category 1 item 8). A split into a
      consult-state hook + shell is planned but not started.

  lib/
    db.ts
        Barrel file only. Re-exports everything from db/reference.ts,
        db/patients.ts, db/intelligence.ts via export *. Never add new
        functions directly here.
    lib/db/reference.ts
        Constants (DOCTOR_ID, HOSPITAL_ID), DBSymptom/DBFinding types,
        frequency slot<->label helpers, fetchSymptoms, fetchFindings,
        fetchProbableFindings, fetchRankedPanels,
        fetchSnapshotSuggestions, fetchDynamicTests.
    lib/db/patients.ts
        DBPatient/DBVisit/DBDoctor/DBHospital/RealVisit/
        PatientRecordRow types. searchPatients, findPatientByPhone,
        createPatient, createVisit, saveVisitSymptoms/
        replaceVisitSymptoms, replaceVisitFindings, fetchDoctor,
        fetchHospital, fetchPatientVisits, fetchTodayPatients,
        fetchRecentPatients, updateVisitStatus, fetchDraftVisits,
        fetchVisitWithDetails.
    lib/db/intelligence.ts
        RankedMedicine/SaveConsultMedicine/FrequentPick/
        DBMedicineSearchResult types. rankMedicines, saveConsult,
        runLearningLoop, searchMedicinesDB, fetchFrequentPicks,
        fetchFavouriteMedicines, fetchDoctorFavourites,
        toggleFavouriteMedicine, logCoprescriptionObservations. This is
        where the medicine-ranking/bias engine lives on the frontend
        side — the actual scoring math is server-side in the Edge
        Function listed below.
    lib/supabase.ts
        Supabase client init only.

  components/
    ChipSearchPanel.tsx
        Symptoms input panel. Fixed 280px height, portal dropdown,
        snapshot quick-select wiring, selected chip display.
        CSS-variable based, NOT Tailwind — locked, do not convert.
    FindingsPanel.tsx
        Findings input. Probable findings from RPC. Uses Tailwind (the
        one exception to the CSS-variable rule). Has a browse-by-category
        dropdown that is currently visually broken (carried from Session
        29 as a layout bug, not touched this session).
    Tag.tsx
        Individual selected chip. Right-click intensity menu.
    MedicineSuggestions.tsx
        Ranked medicines list. Search, favourite toggle.
    MedicineInspector.tsx
        Slide-in panel for dosage/frequency/duration editing.
    FrequentPicksPanel.tsx
        Doctor's frequent-picks sidebar list.
    PatientHeader.tsx
        Topbar for the consult screen: patient info, vitals, past
        visits, Review Rx button, and the real (non-clone) logo that
        GlobalLogoTrigger measures from via logoRef.
    PatientModal.tsx
        New/returning patient entry modal. Honestly non-dismissable as
        of Session 30 (X button and backdrop-click both removed; Cancel
        inside the create-patient form goes back to search mode instead
        of closing). onClose prop still in the type signature but unused
        internally — harmless, cosmetic cleanup item only.
    PreviewPanel.tsx
        Right sidebar: Tests & Lab panel (the messiest UI piece, see
        Category 1 item 3) and preferred-lab selector. This is the
        actual Tests & Lab component — note it is NOT named
        TestsPanel.tsx.
    ReviewModal.tsx
        Full prescription preview before save. Contrast/readability
        needs polish (Category 1 item 6).
    SelectedMedicinesBar.tsx
        Bottom bar showing added medicines.
    ActiveConsultGuard.tsx
        Shown when switching patients mid-consult; offers discard/
        complete/close. One of the three consult-only overlay flags that
        needs the !isFeaturePage guard (Category 1 item 8).
    GlobalLogoTrigger.tsx
        Floating clone of the real topbar logo, rendered as an
        App-level sibling outside every header's stacking context.
        Exists only so the logo stays clickable while a full-screen
        overlay (patient modal, review modal, consult guard) is
        blurring the real one underneath. As of Session 31: gated by
        both sidebarOpen (hidden while the sidebar is open or
        mid-close-transition) and active (hidden unless one of the
        three overlay flags is true) — see "WHAT CHANGED THIS SESSION"
        for full detail. Do not remove the active gating — without it
        the clone duplicates every other page's own header.
    ComingSoonPage.tsx
        Generic placeholder shell for any unbuilt feature page, takes a
        title/subtitle. Used as the fallback for any activePage that
        isn't "patients".

  features/
    sidebar/
      Sidebar.tsx
          The slide-in nav panel itself. Contains a useLayoutEffect that
          measures the real topbar logo's position and computes
          --morph-dx/--morph-dy/--morph-scale CSS vars, intended to
          drive a logo "morph" animation from topbar into the sidebar
          header. As of this session, the CSS half of that animation may
          have been removed (Category 1 item 10, unconfirmed) — if so,
          this measuring code is harmless dead weight, worth stripping
          later.
      SidebarNav.tsx
          The actual list of nav items (Consult, Patients,
          Prescriptions, Investigations, Communication, Practice,
          Clinic, Settings, Support) and their icons/sub-items.
      sidebar.css
          All sidebar-specific styles: backdrop, panel slide transition,
          logo pill plus (possibly former) morph animation, nav item
          hover/active states, doctor footer pill.
      ComingSoonPage.tsx
          NOTE: a duplicate-named file exists here AND at
          components/ComingSoonPage.tsx — confirm which one is actually
          imported (App.tsx imports from "./components/ComingSoonPage"
          per current code, so the one under features/sidebar/ may be an
          orphaned duplicate worth checking/removing).
    patients/
      PatientsPage.tsx
          Top-level Patients feature page. Renders search plus today's
          patients plus all patients list. This is what's currently
          visible when activePage === "patients".
      PatientsList.tsx
          The actual patient table/card list rendering, used inside
          PatientsPage.
      PatientRecord.tsx
          Single patient's detail/history view (45KB — largest non-App
          file in the project, likely needs its own look eventually).
    prescription/
      PrescriptionDocument.tsx
          The actual printable/exportable prescription layout (28KB).
      PrintFormatSelector.tsx
          Lets the doctor choose a print/export format before
          generating PrescriptionDocument output.
    prescriptions/ (note: plural, separate from "prescription" above)
      PrescriptionsPage.tsx
          0 bytes — empty stub, not built yet.
    investigations/
      InvestigationsPage.tsx
          0 bytes — empty stub, not built yet.
    communication/
      CommunicationPage.tsx
          0 bytes — empty stub, not built yet.
    practice/
      PracticePage.tsx
          0 bytes — empty stub, not built yet.
    clinic/
      ClinicPage.tsx
          0 bytes — empty stub, not built yet.
    settings/
      SettingsPage.tsx
          0 bytes — empty stub, not built yet.
    support/
      SupportPage.tsx
          0 bytes — empty stub, not built yet.

  styles/
    layout.css
        Topbar (.topbar-unified), brand/logo (.tb-brand, .tb-logo-pill),
        general page chrome. NEVER edit for ChipSearchPanel/FindingsPanel
        work specifically — those have their own styling rules.
    components-base.css
        Shared base styles/atoms.
    components-panels.css
        Panel-specific styles (Tests & Lab, preview overlays, etc.)

  hooks/
    useConsultKeyboard.ts
        Keyboard shortcuts for the consult screen (focus jumps, review
        shortcut, undo snapshot, etc.) Reads isAnyModalOpen from the
        same three flags discussed in Category 1 item 8 — another
        reason that bug matters beyond just visuals, since keyboard
        shortcut gating depends on these flags being accurate too.

  data/
    mockData.ts
        Static testGroups data structure, used by PreviewPanel until the
        real tests/bundles DB import (Category 1 item 3) is built.

  types.ts
      Shared TS types: SelectedSymptom, Medicine, Patient,
      PrescriptionMedicine, Vitals, etc.

  utils/
    filter.ts
        Generic filtering helpers.

supabase/
  functions/rank-compositions/index.ts
      THE medicine-ranking Edge Function. rankMedicines() (base scoring
      plus bias) and runLearningLoop() (bias increment logic) both live
      here. Session 29 retuned constants here (tagSignature collapsing,
      raised bias caps, favourite flat bonus). Real-world ranking
      quality still reported unsatisfying — parked, do not touch until
      UI work is done (Category 2).

====================================================
CODEBASE RULES — IMPORTANT, KEEP FOLLOWING THESE
====================================================

1. Always request/view the actual current file before editing it. Never
   assume a previously-proposed edit was applied without verifying via
   Select-String/grep — this session had two separate "we think this
   landed" situations that were never actually confirmed.
2. Read the relevant SKILL.md before creating .docx/.pptx/.xlsx/.pdf/
   frontend files.
3. Never touch layout.css for ChipSearchPanel/FindingsPanel work
   specifically.
4. Never redefine CSS classes that already exist — check first.
5. Dropdown overlays always use createPortal.
6. ChipSearchPanel panel shell = CSS variables, NOT Tailwind. Dropdown
   internals = inline styles. FindingsPanel IS Tailwind (the one
   exception). Whether this CSS-vs-Tailwind split should change
   generally is still an open, unanswered question (Category 1 item
   11) — do not unilaterally convert anything until that's explicitly
       resolved.
7. All DB calls go in src/lib/db/* (reference/patients/intelligence).
   Barrel db.ts only re-exports, never add functions there directly.
8. Learning loop failures are non-fatal — always .catch().
9. str_replace / targeted edits only — never silently rewrite an entire
   file unless the user explicitly asks for a full rewrite (this
   session, full-file Notepad rewrites were used only after a smaller
   targeted edit approach via PowerShell heredoc proved unreliable for
   this user).
   10. Ask for PowerShell/SQL output to confirm current state before
       editing — don't assume.
   11. Ranking philosophy is "re-rank by habit," not "recommend by clinical
       truth." Don't propose clinical-accuracy guardrails as the fix for
       ranking complaints — propose stronger personalization math instead.
       (Currently parked regardless — Category 2.)
   12. You cannot escape an ancestor's stacking context by raising a
       descendant's z-index alone. If something needs to render above a
       future overlay and currently lives inside an element that sets its
       own position+z-index (topbar-unified, ws-header, sidebar-panel all
       do), the fix is to render it as a sibling outside that ancestor's
       DOM subtree, not to give it a bigger z-index number.
   13. Any floating "trigger" clone of a real UI element (like
       GlobalLogoTrigger) must gate its own visibility on an explicit "is
       something actually covering the screen right now" condition — not
       just render unconditionally and rely on pointer-events:none to
       "hide" it. Disabling pointer events stops clicks, it does not stop
       the element from being painted and visually overlapping whatever
       else is on screen.
   14. Global overlays/modals whose state lives in App.tsx (patient modal,
       review modal, consult guard, etc.) must be explicitly force-closed
       inside any navigation handler that changes the active page, AND
       their render blocks must independently check they're not on a
       feature page (!isFeaturePage). Relying on only one of these two
       halves is not enough — both are needed for the leak to be
       structurally impossible rather than just usually-not-triggered.
   15. Don't fire two competing transitions/animations off the same state
       change on a parent and a child simultaneously (e.g. a panel's own
       slide-in transition plus a separate keyframe animation on an
       element inside it). If both exist, either synchronize them
       deliberately or remove one — don't leave them racing.
   16. This user is non-technical. Always give literal, copy-paste-ready
       instructions. For small edits, single-line PowerShell
       Select-String/str_replace-style commands work well. For full-file
       rewrites, prefer walking them through "notepad <path>, select all,
       delete, paste, save" over PowerShell heredoc blocks (@' ... '@),
       which are fragile through copy-paste and fail in confusing ways
       (e.g. surfacing as an unrelated Babel "decorators" parse error
       rather than an obvious paste failure).
   17. No diagrams, HTML, or visual tool output in chat for this project —
       text and code only, per explicit standing instruction.

====================================================
SESSION 32 — SUGGESTED STARTING ORDER
====================================================

1. Verify the two unconfirmed items from this session first, before any
   new work: the handleSidebarNavigate + !isFeaturePage modal-leak fix
   (Category 1 item 8), and the sidebar.css morph-removal fix (Category
   1 item 10). Use the Select-String commands listed under each.
2. If either is missing, apply it (exact code already written in this
   handoff's item descriptions above — just needs pasting in).
3. Move to Category 1 items 1 and 2 together (consult summary strip
   plus removing the duplicate Review Rx button) — smallest, most
   self-contained UI win on the open list.
4. Then Category 1 item 3 (Tests & Lab rebuild) — biggest,
   most-requested. Needs PreviewPanel.tsx (full file), types.ts,
   data/mockData.ts, and the real tests/bundles table+column names
   before starting.
5. Do not touch Category 2 (Synapse/ranking) or attempt the App.tsx
   state-split refactor unless explicitly asked — both are
   intentionally parked.
