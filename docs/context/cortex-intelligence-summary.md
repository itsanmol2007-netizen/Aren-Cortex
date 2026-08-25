# The intelligence layer — Synapse, as it's wired into Cortex

Part of the `aren-cortex-context.md` split, 2026-08-24. This pocket is §4 of
that file. **For engine internals (adding a signal/rule/guard, the pipeline
shape, `IntentType`) read `engine.md` instead** — this file is the shorter
"how Cortex's React side uses it" summary, not the engine reference.

---

- `useSynapse()` loads the ruleset + doctor's learned overlay once per session.
- `useConsultIntelligence()` runs the engine **synchronously in `useMemo`**, on every
  keystroke — safe because `runEngine` is pure and `persistVisitInput` is idempotent.
- Guards: `warn` / `warn_hard`. **Never hides anything.** A `warn_hard` intent ranks at
  its real position, in red, unlockable only by acknowledgement.
- **No score is ever printed** — relative rank is a proportional bar or a relevance
  word only. Cross-type score comparison is meaningless (different intent types score
  on different scales).
- **Ranking is "re-rank by habit," not "recommend by clinical truth."** The knowledge
  base is data in Supabase, out of scope for UI work.
- Combinations: ranked list stays single-molecule (`ingredient_count = 1` filter);
  every product a doctor *names* (search or accept) resolves whole via
  `fetchCombinationProducts`, sitting beside `composition_brands` rather than
  replacing it. `guardCombination` checks every molecule a combination product
  carries, not just the one it was reached through — a hard warning on any
  ingredient locks the whole row.
- 8 intent types: medicine, finding, test, referral, advice, exercise, **modality**
  (physiotherapy in-clinic treatment — ultrasound/IFT/TENS/etc., its own plan section
  "Therapy — this session"), **impairment** (physiotherapy functional-limitation
  ranking, ranks above findings on that profile).
- **Trend/MCID**: a measurement's `MeasureField` carries `trendNoise` (real change vs.
  jitter) and `mcid` — minimum clinically important difference, the smallest change
  worth drawing an arrow at. `verdictFor` requires clearing both before the
  longitudinal band calls a change real. Outcome instruments: LEFS (lower limb), ODI
  (low back), QuickDASH (upper limb) — ODI/QuickDASH are DISABILITY scores
  (`betterWhen: "lower"`), opposite direction from LEFS. Pain VAS has an MCID of 2.
- **The free-text fallback (added 2026-08-24) sits entirely OUTSIDE this layer,
  on purpose.** `doctor_free_terms` (see `cortex-data-model.md`) is matched by a
  plain overlap score in `src/features/consult/freeTerms.ts` — signal overlap
  plus a heavier weight for accepted-intent overlap — never by `runEngine`,
  never written into `signal_intent_rules`. A term a doctor typed once is a
  personal shortcut, not knowledge-base content; keeping the two mechanisms
  separate is what keeps rule 22 ("never mint... from the UI/self-service
  path") true for compositions specifically while still giving every OTHER
  output type a low-friction fallback.

**What's NOT covered here:** the engine's pipeline/types/how to add a signal
or rule (→ `engine.md`), which field renders where (→ `consult-ui.md`),
personalisation math specifics — `personalize.ts`/`brands.ts` (read those
files directly, they're short and heavily commented).
