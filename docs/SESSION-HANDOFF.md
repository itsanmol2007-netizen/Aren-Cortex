# Session handoff — 2026-08-15

**This file is temporary and self-replacing.** It carries context between
sessions so nothing has to be re-derived. It was fully rewritten on 2026-08-15;
everything the previous version said is either folded into
`aren-cortex-atlas.md` or obsolete, so there is nothing to recover from it.
Rewrite or delete this file the same way when the next session ends.

**Read order for a cold start:** this file, then `aren-cortex-ui-doctrine.md`,
then `aren-cortex-atlas.md` §14 (newest entries at the bottom — §14.19, §14.20,
§14.21 are this day's). Don't re-survey the repo; both docs are current.

---

## 0. Where things stand

`master`. Everything below is committed, built clean (`tsc -b` + `vite build`),
and **verified in the real running app against the live database**, not merely
type-checked. No work in flight.

Two pieces of work landed on 2026-08-15, in this order:

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

---

## 3. Open items, most important first

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
