# Consult screen architecture — the pocket for UI/hook work

Self-contained for App.tsx / hooks / layout work. You don't need engine
internals or frontdesk to work here unless you're wiring new engine output
onto the screen (then also read `engine.md`).

## `App.tsx`'s hook layers

Three layers, declaration order forced by React:

| Layer | Hooks | Reads |
|---|---|---|
| 1 — facts | `useConsultChart`, `useAcceptLedger`, `useConsultSession`, `useVisitStory`, `useExamination` | nothing |
| 2 — engine | `useConsultIntelligence` | layer 1 |
| 3 — behaviour | `useConsultPlan`, `useConsultLifecycle` | layer 2, mutates layer 1 |

Adding state to the consult: that table says which layer it belongs in.
`useConsultLifecycle` is where save/reset live — anything new needs to be
added to `clearWorkspace` (reset) and, if it writes on save, follow the
`onSaveStory`/`saveExercisePlan` pattern: **caught, not thrown**, because by
that point in the save sequence the visit is already committed and a throw
tells a doctor whose consult DID save that it failed.

## Core doctrine (`aren-cortex-ui-doctrine.md`, full file is short, worth
reading directly if doing serious layout work)

- SOAP is a documentation format, not a workflow — don't let the record's
  structure become the screen's structure.
- **Progressive disclosure is a mechanism, not a habit**: `RELEVANT_FIELDS`
  (signal → measurement keys) is the proven shape; `story.ts`'s
  `core`/`revealWhen` is the same shape applied to chip fields. Reuse it
  before inventing a new disclosure mechanism.
- **Ranking is a safety property, never a verdict.** Nothing is presented
  as the cause. Guards warn, never hide.
- **Module height is content-driven.** No floors, no reserved space.
- **Chips over free text, everywhere a vocabulary is closed.** Manual notes
  are the last resort, never the only option — this is why `JointMapCard`
  and `story.ts`'s factors exist instead of textareas.

## The keyboard system

`src/lib/keyboard/keymap.ts` is the one place bindings are declared — the
handler and the shortcuts sheet both read it, so they can't drift. Any
overlay that binds an un-modified key **must** take focus when it opens
(`useOverlayFocus`) and must be in `isAnyModalOpen`, or the binding is dead
on arrival (keystroke goes to whatever's behind the scrim).

Not Consult-only: the `"practice"` scope (2026-08-29) extends the same
table to the Practice page's Preferred Medicines card — Ctrl+K/"/" to
focus its search, ↑↓+Enter to walk results, via the same `useRovingList`
mechanism `ConditionsCard` uses. `App.tsx`'s `useConsultKeyboard` stays
Consult-only (its `STOPS`/refs are all consult panels and it runs
unconditionally regardless of which page is showing, so its own bindings
mostly no-op harmlessly while Practice is up); Practice's own listener is
a small `useEffect` local to `PreferredMedicinesCard`, scoped for free by
only existing in the DOM while that card is mounted, gated on a
Practice-local `anyModalOpen` the same way `isAnyModalOpen` gates Consult's.
Adding the same treatment to another Practice card (Labs, Companions) is
the same three pieces: a scope entry + bindings in `keymap.ts`, a
`useRovingList` wired to that card's own result rows, and the
`practiceFocusSearch`-style effect if it needs its own focus shortcut.

## Shared chart shell

`ChartSurface.tsx` — the modal every specialty chart (odontogram, body map,
joint map, growth chart, Measurements' "More") renders through. Fix
something here once, every chart gets it. Carries the Apple-style header
treatment (gradient stripe, icon badge) as of 2026-08-17 — see `.pm-*` in
`components-modals.css` for the reference it was matched to.

## Two structural rules (2026-09-08)

Both products, enforced in the database, not by App.tsx bookkeeping.

- **One active consult per doctor.** `visits_one_serving_per_doctor` partial
  unique index (`20260908_one_active_consult_and_fee_gate.sql`). A second
  visit going `serving` raises `unique_violation` → `lib/db/patients.ts`
  turns it into `ActiveConsultExistsError`. The doctor-side start path is now
  the `start_consult_visit` RPC (one round trip): resolves today's front-desk
  `waiting` row or mints a new `serving` one, checks the index, checks the
  fee gate, writes `visit_payments` — atomically. `handlePatientConfirm`
  calls it; `handleStartConsultFromRecord` (queue pick) still uses
  `resolveVisitForConsult` but now catches the same error. Front desk keeps
  `createVisit`/`markVisitServing`.
- **Payment gate.** `start_consult_visit` raises `PAYMENT_DECISION_REQUIRED`
  (nothing written) when the doctor has `doctors.consultation_fee` set and no
  paid/unpaid decision was passed. `PatientModal`: when a fee is wired the
  rail's **Collect / Mark as unpaid** buttons ARE the submit (no separate
  "Start consult" button; a search-result click only *selects*). No fee →
  no rail, just a one-line "set up your fee" notice.

## Entry gate + never-blank rule (App.tsx, replaced the old invariant + watchdog + debug box)

On the bare consult screen (`activePage === null`, no consult in memory):

- **Immediately** (Consult only — Cortex's PatientModal is already its
  default): anyone waiting → `QueueSheet`; nobody waiting → `PatientModal`
  register screen directly, never a locked empty queue sheet. The "is
  something already covering the screen" check is `consultOverlayShowing`,
  NOT raw `patientModalOpen` — that flag defaults `true` and stays `true` in
  Consult while the modal is unrendered (only `registerRequested` renders it).
  Checking the raw flag was the "blank consult screen until you navigate away
  and back" bug.
- **In the background**, once per session per doctor: `fetchActiveConsult`
  asks the DB for a `serving`/`draft` visit localStorage missed (logout,
  other machine). If found → `ResumeConsultPrompt` (Resume / Discard, no
  dismiss), rendered last so it sits on top, and it closes whatever opened
  meanwhile.

`ActiveConsultGuard`'s "Save as draft" discards any older draft first, so
parked consults can't pile up.

## What's NOT covered here

Specialty-specific screen shape (→ `specialties.md`), engine/ranking
internals (→ `engine.md`), frontdesk/queue UI (separate app section
entirely, see the frontdesk docs).
