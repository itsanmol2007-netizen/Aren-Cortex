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

## Shared chart shell

`ChartSurface.tsx` — the modal every specialty chart (odontogram, body map,
joint map, growth chart, Measurements' "More") renders through. Fix
something here once, every chart gets it. Carries the Apple-style header
treatment (gradient stripe, icon badge) as of 2026-08-17 — see `.pm-*` in
`components-modals.css` for the reference it was matched to.

## What's NOT covered here

Specialty-specific screen shape (→ `specialties.md`), engine/ranking
internals (→ `engine.md`), frontdesk/queue UI (separate app section
entirely, see the frontdesk docs).
