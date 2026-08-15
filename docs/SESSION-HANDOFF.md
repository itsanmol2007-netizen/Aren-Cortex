# Session handoff — 2026-08-15

**This file is temporary and self-replacing.** It carries context between
sessions so nothing has to be re-derived. It was fully rewritten on 2026-08-15;
everything the previous version said is either folded into
`aren-cortex-atlas.md` or obsolete, so there is nothing to recover from it.
Rewrite or delete this file the same way when the next session ends.

**Read order for a cold start:** this file, then `aren-cortex-ui-doctrine.md`,
then `aren-cortex-atlas.md` §14 (newest entries at the bottom — §14.19 through
§14.22e are this run of sessions'). Don't re-survey the repo; both docs are
current.

---

## 0. Where things stand

`master`. Everything below is committed and built clean (`tsc -b` +
`vite build`). The first two pieces were **verified in the real running app
against the live database**; the third (keyboard) was verified by harness and
in Chromium but **not through the real consult screen** — see §0.3. No work in
flight.

Three pieces of work landed on 2026-08-15, in this order:

### `App.tsx` Stage 2 — the state split (atlas §14.20)

`App.tsx` went **2,196 → ~1,070 lines**. The consult's state moved into five
hooks in `src/hooks/`, and §10.7 — open since 2026-07-30 — is closed.

It is five hooks rather than the single `useConsultWorkspace()` that §10.7 and
§14.19 both predicted, because the state is three layers with a **declaration
order React forces**:

| Layer | Hook | Reads |
|---|---|---|
| 1 — facts | `useConsultChart` · `useAcceptLedger` · `useConsultSession` | nothing |
| 2 — engine | `useConsultIntelligence` (pre-existing) | layer 1 |
| 3 — behaviour | `useConsultPlan` · `useConsultLifecycle` | layer 2, mutates layer 1 |

If you add state to the consult, that table tells you which hook it belongs in.
What is left in `App.tsx` is the shell: boot, navigation, toast, which overlay
is open.

### The longitudinal record, steps 1–5 (atlas §14.21)

Confirming a condition used to push a string onto `diagnoses` and print it. It
now **re-ranks the consultation in the same frame**, and when the condition is
chronic it becomes a durable patient fact that **comes back on the next visit**,
pre-ticked and visibly marked as carried forward.

Built from `docs/confirmed-conditions-investigation.md`, which now carries a
status header recording the three places it turned out to be wrong. New:
`condition_observable_map` + `patient_conditions` tables (RLS matching existing
posture), `useLongitudinalRecord.ts`, and provenance on every chart chip.

**The map is deliberately 7 rows.** Only mappings whose target observable
already carries a signal that `signal_intent_rules` actually reference — the
rest would carry forward and re-rank nothing. Three of the seven are the shape
worth knowing about: an acute *episode* pointing at the chronic fact it proves
(diabetic ketoacidosis → Known diabetic).

### 0.3 The keyboard pass (atlas §14.22)

Cortex claimed to be keyboard-first and was not. `ShortcutsSheet.tsx` held a
hand-written table and **four of its eleven rows documented shortcuts that had
never been implemented**.

Bindings are now data — `src/lib/keyboard/keymap.ts`, the one place. The
handler dispatches from it and the sheet prints it, so they cannot drift.
**Add or change a shortcut there and nowhere else.**

The whole flow is now reachable without a mouse: intake → case sheet →
assessment → medicines → the add sheet → the plan → review → save. Assessment
had no Tab stop at all before this, so that step was mouse-only.

Three real bugs fell out of writing it down:

- **Ctrl+Enter did nothing in the review modal** — the global handler caught it
  and re-opened the review it was already showing. The one key that finishes a
  consult was inert.
- **`Tab` and `Shift+Tab` both matched "next stop"**; only handler ordering hid
  it.
- **`isAnyModalOpen` was missing `pendingMedicine`** (and four others), so Tab
  moved focus out of the add sheet mid-edit.

A fourth bug turned up when the real `MedicineAddSheet` was driven in a
browser (atlas §14.22a): **no overlay took focus when it opened**, so focus
stayed in the search field behind the scrim. Every bare-key binding in the
sheet was dead — `1`-`4` and `0` were dropped on every press because the
keystroke belonged to a text input — and anything else typed went into that
hidden field. Enter worked the whole time, which is why it was invisible: the
common path was fine and only the shortcuts were broken. Overlays now take
focus on open and hand it back on close.

**The rule that leaves behind:** an overlay binding any un-modified key MUST
take focus when it opens, and must focus something that is not a text field.

**What was NOT verified:** credentials were provided, but **Chromium in this
environment has no outbound network** — every HTTPS host resets, with or
without the agent proxy, while `curl` to the same hosts succeeds. Login could
not complete, so nothing was driven through the real consult screen. The add
sheet was driven for real; the rest of the per-card wiring is typed and
reviewed but not clicked. **Do one pass through a real consult** — especially
the four `searchRef`/`listRef` attachments and the Assessment Tab stop.

---

## 0.4 Six bugs from actually using it (atlas §14.22c)

Anmol drove the app for real and reported six problems in one message. All
six had a specific root cause, all six are fixed, all six are verified in
Chromium against the real components:

1. **Ctrl+N tore open patient intake over an active consult, no warning** —
   the keyboard path skipped the guard the mouse button already had. One-line
   fix: call the same check.
2. **Assessment's ranked list: ↓ did nothing until you searched** — wrong CSS
   selector, isolated to that one card.
3. **Alt+E's why-popup had no way to close and froze everything else** — it
   had wrongly become a modal; reverted to a read-only popover that never
   takes focus and is out of `isAnyModalOpen`.
4. **→ opened alternates but ↓ jumped to the next medicine** — alternates now
   join the same roving walk in place of the row they belong to.
5. **The add-sheet's brand list scrolled independently of the selection** —
   added `scrollIntoView` on every move.
6. **A multi-strength brand had no way to reach its other strength** — new
   ← → axis (`sheetStrength`), separate from ↑↓.

Full root-cause writeups and the exact fix for each are in atlas §14.22c —
read that before touching any of these six files again, the reasoning for
each fix is not obvious from the diff alone.

**Still not verified against the live app** — same network gap as before.
270 assertions across 8 harnesses instead, all against the real components.

---

## 0.5 Measurements + Related reachable, built to scale (atlas §14.22d)

Anmol's next report, with screenshots: no keyboard path to Measurements (or
its "More" sheet) or to the Case Sheet's Related suggestions, plus an
explicit ask — build it so the next specialty (coming in weeks) can copy the
same binding.

**Checked the architecture before writing code**: `MeasurementsCard` and
`ChartSurface` are already shared — `SoapInputs.tsx` (the fallback every
non-General-OPD profile uses today) renders `MeasurementsCard` directly, and
`ChartSurface` is the same modal the dental/body/growth charts already open
through. Fixed both ONCE at that shared layer; every current and future
profile gets it for free. Only the Related-row wiring lives in
`GeneralOpdInputs.tsx` — the file the doctrine already says gets copied per
specialty — documented as the three lines a copy needs to keep or drop.

- **`Alt+M`** jumps to Measurements (new fifth Tab stop, right after `chart`).
- Building it surfaced a real gap: **bare Tab is reserved globally for
  moving BETWEEN stops**, so it was never available to walk within one —
  `↓` from the header now enters the grid, and Enter (which already hopped
  field-to-field) now falls through to the card's own "More" button once the
  fields run out.
- That fix also caught a **pre-existing correctness bug**: the field-walk
  order was built from `shown` (everything relevant) rather than `inline`
  (what's actually rendered with a ref) — silently dead once a chart pushed
  past the card's cap. `focusNext` now takes the list it should walk as an
  argument.
- The Add Measurement menu — two hand-copied mouse-only renderings — is one
  `MeasurementPicker` component now, with `useRovingList` nav built in once.
- `ChartSurface` takes focus on open. It didn't before — Tab from "More"
  walked into the page BEHIND the modal. One fix, dental/body/growth charts
  inherit it too.
- Related suggestions: `ClinicalCommandBar`'s arrows did nothing with an
  empty query (provably inert — checked the math). Three optional callbacks
  (`onEmptyDown`/`onEmptyUp`/`onEmptyEnter`) are the whole seam to
  `CaseSheet`'s Related row, wired from `GeneralOpdInputs.tsx`. Typing is
  completely unaffected — same `open` gate as before.

**Known, recorded gap**: `SoapInputs.tsx`'s own "related" equivalent
(`examSuggestionLabels` via `PickerCard`) did NOT get this — different
component, out of scope for a pass driven by the General OPD screen.

293 assertions total across every suite this session, zero failures. `tsc -b`
and `vite build` clean. Still not verified against the live app.

---

## 0.6 Tab escaping the Measurements modal, plus a dedicated way in (atlas §14.22e)

Anmol's reaction to §0.5, immediately: the "More" modal had no dedicated
control once it was actually open. Real bug, worse than "missing control" —
`showAll`/`pickerOpen` (`MeasurementsCard`'s own local `useState`) were never
added to `App.tsx`'s `isAnyModalOpen`, so Tab, while the modal was open and
correctly focused, silently reached through it to the Assessment stop behind
it. The modal stayed open on screen; the keyboard had already left.

Fixed structurally rather than by adding two more flags to that list, on
purpose — a hand-maintained list is exactly what a future specialty's own
local modal is one honest omission away from falling outside of, same as
this one did:

- `useOverlayFocus` now marks whatever it focuses with `data-cx-kbd-owner`
  for as long as it holds the keyboard.
- `useConsultKeyboard` checks the DOM for that mark as a backstop to
  `isAnyModalOpen`, which stays first-line for the one frame before focus
  actually lands.
- Confirmed via `App.tsx`'s real `isAnyModalOpen` expression that every
  OTHER overlay was already listed there — `MeasurementsCard`'s two flags
  were the only gap, so this is a no-op everywhere else.

Second half: `ChartSurface` gained an optional `onEnterContent` prop — ↓ on
the modal panel itself (not a descendant field) jumps into whatever the
caller says is "the first thing." `MeasurementsCard` wires it to the first
reading in the full list the modal shows. Documented as `measModalEnter` in
`keymap.ts` so the shortcuts sheet prints it.

237 matcher assertions (four new). 14 fresh Chromium assertions against the
real `MeasurementsCard` + `useConsultKeyboard`, proving Tab is now trapped
in both the "More" modal and the Add Measurement popup, ↓ on a fresh panel
reaches the first reading, Escape still closes and returns focus, and Tab
resumes normal stop-cycling once the modal is closed. `tsc -b` and
`vite build` clean. Full regression on other `useOverlayFocus` consumers was
done by reading `isAnyModalOpen` rather than re-running every earlier
harness — see above for why that's sound. Still not verified against the
live app.

---

## 1. What to do next — the specialty work

**Read `docs/Cortex Specialties/cortex-longitudinal-spec.md` first.** It is the
live spec for the next phase and it is good: it states what is wanted rather
than how to build it, covers six specialties' actual clinical shape, and lists
the edge cases. Anmol is theorising the design/UX flow for specialties as of
2026-08-15, so treat that document as the thing being designed against and
expect it to be revised rather than replaced.

Its sequencing, unchanged:

1. **The trend header** — the one genuinely missing MVP piece. Answers "is this
   working?" not "how many visits". One generic component driven by the
   specialty configuration, *not* a version per specialty.
2. WhatsApp follow-up reminder wiring (interval is captured, nothing is sent).
3. A light persistent care plan ("session 4 of 12").

Two things from this session that bear directly on it:

- **The prerequisite is done.** That spec's §3.1 wants trends "generated
  algorithmically from stored signals — no AI, no API round-trip." The
  longitudinal record now gives durable per-patient facts to hang that on, and
  Stage 2 means a trend header can take a hook rather than threading props
  through a 2,200-line file.
- **§14.19's template rule still governs specialty divergence.**
  `GeneralOpdInputs.tsx` is the template: the day a second profile earns its own
  input layout, copy it, rename it, add one branch in `App.tsx`. Don't pre-split
  `SoapInputs.tsx` into seven near-identical copies.

---

## 2. Traps found this session — worth knowing before writing code

These cost real time and none of them are visible on screen.

1. **A fire-and-forget write behind a CHECK constraint is a silent data
   outage.** `visit_observations.source` permits only
   `doctor | confirmed_intent | carried_forward | import`. Writing anything else
   rejects the **entire insert**, and the write is `.catch(console.warn)`, so
   every consult with a confirmed condition recorded ZERO observations while the
   UI looked perfect. Found only by querying Postgres. **Verify features in the
   database, not the screenshot.**
2. **`handleAcceptIntent` has a deliberately empty dependency list** (§14.20).
   Anything it calls is frozen at the first render unless reached through a ref.
   `confirmCondition` closes over the patient id — calling it directly filed
   standing facts against whoever was on screen first.
3. **`opacity-*` cannot style Case Sheet chips.** They animate in and motion
   writes an inline `opacity` that beats any class.
4. **Two Tailwind utilities setting the same property** resolve by generated-
   stylesheet order, not class-string order. Replace the class, don't append an
   override.
5. **`diagnostic_orders` has an FK to `prescriptions` as well as `visits`**, so
   test-data cleanup must delete it before prescriptions. The obvious order
   fails.
6. **A browser tab never delivers Ctrl+N, Ctrl+T or Ctrl+W.** The browser
   consumes them before any listener runs, so `preventDefault` cannot help —
   the event never arrives. An installed PWA does get them. Any shortcut that
   matters needs a chord from outside that set (Alt+letter is free); see the
   three tiers at the top of `lib/keyboard/keymap.ts`.
7. **Documentation kept in step by discipline drifts.** Four of the eleven rows
   in the shortcuts sheet described features that were never built, because the
   table and the handler were two files a rule said to edit together. When two
   things must agree, make one of them read the other.
8. **A modal that does not take focus silently kills its own bare-key
   shortcuts** — the keystroke belongs to whatever field is behind the scrim,
   and any handler that (correctly) ignores keys typed into a field drops it.
   Modified chords keep working, so the common path looks fine and only the
   shortcuts are dead. Focus something inside the overlay that is not a text
   field, and hand focus back on close.

---

## 3. Open items, most important first

- **The keyboard pass needs one live pass through a real consult** (§0.3). It
  is the newest work and the only piece of today's three not driven through the
  real screen.
- **Longitudinal step 6 — resolve / refute — is NOT built.** A condition
  confirmed in error can be un-ticked from today's chart, but the
  `patient_conditions` row survives and carries forward again next visit. From
  the doctor's side a mistake is currently permanent. The `status` column and
  its check constraint already exist; only the UI is missing. **Given that this
  feature's whole risk is a wrong fact propagating silently, do this before
  widening the map.**
- **`stagedMedicine` / `pendingMedicine` are not cleared by `plan.reset()`** —
  pre-existing, documented in `useConsultPlan.ts`'s reset header. An add sheet
  left open across a patient switch can commit onto a blank consult. Not caught
  by this session's verification run, which commits the sheet before saving.
- **~12 more chronic conditions need signal content, not schema** — coronary
  artery disease, atrial fibrillation, treated TB, osteoarthritis, gout, iron
  deficiency anaemia. Each needs an observable, a signal, and
  `signal_intent_rules` rows. Clinical curation.
- **Hypoglycaemia → Known diabetic was deliberately not seeded.** Usually
  implies diabetes on treatment, genuinely occurs without it, and the map has no
  "probably". Needs a clinical decision.
- **ACS has no correct mapping target** until a "Known coronary artery disease"
  observable exists. It was explicitly rejected rather than approximated —
  a heart attack is not a family history of one.
- Combinations are offered correctly but not *ranked* higher for covering two
  active needs at once (§14.17).
- No guard content for quinine / HCQS QT risk (§14.18). Needs clinical input.
- Atlas §5.1's inventory table is stale — missing the six hooks and several
  `features/consult` files.

---

## 4. Environment

- **No `supabase/migrations/` directory.** Schema changes are applied live via
  the Supabase MCP tools; `apply_migration` records them in Supabase's own
  migration log, and the prose in the atlas is the only other record. **Write it
  down or it is gone.**
- **Don't write to the live DB without asking.** Every write this week was
  authorised first.
- Supabase project `ieimvjprtltancxapuzg` (org `arenod`, `ap-south-1`).
- **Test data gets deleted afterwards.** Two test patients were created and
  removed on 2026-08-15; the DB is clean.
- `main` and `master` are unrelated histories sharing a remote. **`master` is
  where everything real lives.** If a branch gets cut from `main` by mistake,
  `git checkout -B <branch> origin/master` before doing anything.
- Dev server: `npm run dev` → `http://127.0.0.1:5173`.

## 5. Unexplained — worth a look

**Two stray edits appeared in files no session touched**, both on 2026-08-15:
`src/lib/db/synapse.ts` lost the word `model:` from a comment (restored), and
`referance (synapsev2)/Synapse engine.ts` had its ruleset version flipped
`'mvp-1'` → `'V2'` (reverted; that directory is not imported, so nothing broke).
Neither was made by the session that found them. Something else may be writing
to the working tree — worth checking before assuming a future odd diff is yours.
