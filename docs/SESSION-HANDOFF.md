# SESSION HANDOFF — 2026-08-14

**Temporary file.** Delete it once the work below is finished and folded into
`aren-cortex-atlas.md`. It exists only to move an in-progress session from one
machine to another without losing what was learned.

Branch `master`, up to date with `origin/master`. Everything described here is
committed and pushed — `git pull` and you have the whole state.

---

## 0. What to read first, in this order

1. This file, all of it.
2. `docs/aren-cortex-ui-doctrine.md` — what the consult screen is supposed to BE.
   **Its §3 is wrong; see §4 below before you trust it.**
3. `docs/aren-cortex-atlas.md` §0, §5, §12, §13, §14.14–§14.16.
4. `docs/Cortex Specialties/cortex-longitudinal-spec.md` — the NEXT phase, not
   this one. Do not start it yet.

Do not re-survey the repo from scratch. §4 of this file records the findings
that cost real time to establish.

---

## 1. Where the work stands

The agreed sequencing, from Anmol: **finish the General OPD workspace first,
then move to the other specialties.** General OPD is not one profile of eight —
12 of the 14 hospitals have `specialty_profile` NULL, which `profileFor()`
reads as General OPD, so it is what every real clinic currently sees.

Anmol has **closed the visual pass**. In his words: the UI is clearer, the
greyscale-text problem is fixed, the prescription sheet is reviewed and good,
and the medicine picker is good. Do not reopen any of that. What follows is
what he asked for next.

### His five asks, as given

1. **Medicine picker — dose slots should be CIRCLES.** Replace the
   Morning / Afternoon / Evening / Night buttons with the circle notation
   doctors actually write by hand. This is the classic `1-0-1` / ●○●○ Indian
   Rx notation.
2. **Medicine picker — pre-fill the dose from the product name.** The doctor
   should not have to retype a number that is already in the name of the
   product they just picked.
3. **Medicine picker — pre-fill the food instruction ("when").** Anmol believed
   this is already recorded "in our composition map or whatever". **It is not —
   see §4.1.** Read that before promising it.
4. **Medicine picker — the confirm button is green; move it to the blue theme.**
   He was ambivalent ("or maybe just leave it, I don't know"). The codebase's
   own colour law settles it: blue = the action, green = taken. "Add to plan"
   is the action, so it should be blue.
5. **Two real defects, in his priority order:**
   - **Medicine search still treats the composition as primary.** The brand
     name must be the headline and the composition the subtitle.
   - **Synapse does not recommend medicines with more than one composition.**
     His words: *"That's a very big flaw."* This is the biggest item here.

### Task list (mirrors the tracked tasks)

| # | Task | Status |
|---|---|---|
| 1 | Rank combination medicines, not just single molecules | **done 2026-08-14 — see §8** |
| 2 | Make brand the headline in medicine search | **done 2026-08-14 — see §8** |
| 3 | Add sheet: circles, dose prefill, timing prefill, blue confirm | **done 2026-08-14 — see §8** |
| 4 | Correct the stale claims in the doctrine and atlas | **not started** |

Task 1 is the one Anmol called a very big flaw. Task 3 is partly done. Do task
3 first (it is nearly finished and self-contained), then task 1, then 2, then 4.

Only task 4 is left. §8 below records what shipped and, for task 2
specifically, a fix that lives ONLY in the live database — there is no
`supabase/migrations/` directory, so nothing in git shows it happened.

---

## 2. Exactly what is half-done

**One commit of real code so far this session**, on top of `9e7fbf6`:
`src/lib/synapse/brands.ts` gained two exported pure functions —

- `doseMgFromName(name): number | null`
- `doseFieldValue({ name, strengthMg }): string`

They read a dose out of a product name and refuse to guess in three cases
(concentration like `125mg/5ml`, combination with two strengths, bare number
outside a plausible range). The reasoning is written into the function's own
doc comment — read it rather than reconstructing it.

`tsc -b` passes clean with this in.

**Nothing consumes them yet.** That is the next edit:
`src/features/consult/MedicineAddSheet.tsx:78` currently seeds the dose box with

```ts
setDosage(initialBrand?.strengthMg ? String(initialBrand.strengthMg) : "");
```

and should call `doseFieldValue(initialBrand)` instead. The same substitution
belongs at the strength-variant click handler, `MedicineAddSheet.tsx:186`.

The other three parts of task 3 — circles, timing prefill, blue button — are
**not started**. See §3 for the decisions already taken on them.

---

## 3. Decisions already made, so they are not re-litigated

- **Circles.** Four circles, filled when on, in slot order
  morning-afternoon-evening-night, with a small text label so the notation is
  learnable. The underlying value stays the existing `"1-0-1-0"` slot string —
  `frequency` is canonical and `lib/db/reference.ts` warns never to parse the
  human label. This is a rendering change only, not a data change.
- **Confirm button → blue.** `.cs-addmed-confirm` in `src/styles/consult.css`.
  Justify it in the commit by the colour law in doctrine §5, not by taste.
- **Food instruction.** There is no column for it anywhere (§4.1). The agreed
  path is a documented static map keyed on composition name, in the style of
  `measures.ts`'s `RELEVANT_FIELDS`, living in a new
  `src/features/consult/dosing.ts`. Keep it conservative and limited to
  well-established cases (NSAIDs after food, PPIs before food, levothyroxine
  and bisphosphonates empty stomach, sulfonylureas before food, metformin after
  food). It is a PRE-FILL the doctor can change, never a guard, never a
  warning. The permanent home is a `compositions.default_timing` column, which
  is a migration against the live database and therefore **Anmol's call to
  authorise, not something to apply unasked.**
- **Combinations (task 1).** Do NOT change the engine — it ranks compositions
  and `lib/synapse/*.ts` is pure by law. The fix is at the brand layer:
  `fetchCombinationProducts` in `src/lib/db/medicines.ts:245` is already
  written, tested in shape, and **called from nowhere**. Wire it so a ranked
  molecule also offers the combination products containing it, ordered by
  fewest extra molecules, each showing every molecule it carries.
  **The safety-critical part:** a combination carries molecules the engine never
  scored, so its guard verdict must be computed over ALL of its compositions and
  rendered at full strength. Doctrine rule 11 — nothing reached by any route may
  show a weaker warning than the ranked list would.

---

## 4. Findings from this session — do not re-derive these

### 4.1 There is no food-instruction data. Anywhere.

Probed live 2026-08-14. Full column sets:

- `compositions` — `id`, `name`, `specialization_scope`. That is all.
- `medicines` — `id`, `name`, `manufacturer`, `hospital_id`, `strength_mg`,
  `created_by_doctor_id`, `created_at`.
- `medicine_composition_map` — `id`, `medicine_id`, `composition_id`,
  `is_primary`, `route`.

`route` is the dosage form, not a timing. So ask 3 cannot be satisfied from
stored data and needs authored content. Tell Anmol this plainly rather than
shipping a prefill that is really a hardcoded default pretending to be a lookup.

### 4.2 Doctrine §3 is stale, and it is the most consequential staleness

It calls the ratio of `signal_finding_suggestions` (10 rules) to
`signal_intent_rules` (1,577) *"the single highest-leverage number in this
document"* and says `examSuggestions.ts` is computed and thrown away.

Measured live 2026-08-14: **`signal_finding_suggestions` holds 537 active rules
across 215 of 304 signals.** 527 of them were added 2026-08-12 and never struck
off. And `examSuggestions` IS consumed — `App.tsx:1447` builds `relatedFindings`
and passes it to `CaseSheet`'s `related` prop.

Related Findings is a live feature. Anyone planning off §3 will be planning off
history. This is exactly the trap the atlas's own §10 preamble warns about.

### 4.3 Doctrine §2.1's measurements fix was never done

`MeasurementsCard.tsx:106-117` is still the four-way union
(`defaultKeys ∪ relevantKeys ∪ added ∪ anything-with-a-value`) that §2.1 says
should be replace-not-union.

It does not hurt General OPD — BP/Pulse/SpO₂/Temp/Weight genuinely are the
right defaults there — which is why it survived. It is the reason a dentist
gets blood pressure on every patient. **Fix it before starting profile #2, not
after.**

### 4.4 The verification debt is the real risk in General OPD

Three things are built, type-check, and have never been seen rendered:

- `PrescriptionDocument` with the new accent ramp (`lib/brand/accent.ts`,
  `components/RxMarks.tsx`). This is the document the patient physically
  receives, and §14.15 records that it is a SEPARATE component from the
  on-screen preview — the preview looking right proves nothing.
- `MedicineAddSheet` (doctrine §6). Anmol has now reviewed this one himself and
  likes it, so treat it as verified.
- The close path. Live counts: **118 visits — 94 stuck in `serving`**, 8
  completed, 4 waiting, 1 draft, 11 discarded. **3 prescriptions in total**, only
  one of them since the RLS fix on 2026-08-13, and 5 `prescription_medicines`
  rows. Saving 403'd on every attempt until that fix and has barely been
  exercised since.

`follow_up_days` is NULL on all three prescriptions. **This is not a bug** — the
wiring is correct (`lib/db/intelligence.ts:79` writes it, `App.tsx:1272` passes
it). It just means nobody has ever picked a follow-up. Worth exercising, because
it is the input the longitudinal spec's WhatsApp reminder depends on.

### 4.5 Other live numbers, measured 2026-08-14

| | |
|---|---|
| `medicines` | 213,145 — 146,979 with `strength_mg`, **12,760 null but with a number in the name** (what `doseMgFromName` recovers), 53,406 with no number anywhere and unrecoverable |
| `signal_intent_rules` | 1,577 active |
| `signals` / `observables` | 304 / 397 |
| `intent_guards` | 25 |
| `decision_log` | 49 rows, most recent 2026-08-13 |
| `visit_measurements` | 122 |
| patients | 12 |

### 4.6 Housekeeping

The live database has ~6 junk hospitals — `VERIFY PROBE — DELETE ME` ×3,
`Test (delete it)`, `f`, `Fc`, `Divyxyz`, `FRankel (Delete It)` — against the
atlas's own "clean up test data" convention. Two minutes of work, and it keeps
that convention honest.

### 4.7 Confirmed still open in General OPD

- **Combination ranking** — task 1. `fetchCombinationProducts` confirmed dead
  code by grep: defined at `medicines.ts:245`, called nowhere.
- **The measurement relevance tint has no cap.** `MeasurementsCard` tints every
  key in `relevantKeys`; with a rich chart everything is marked, and a mark on
  everything marks nothing.
- **Density.** §14.15 says the screen is tuned for ~80% zoom on a 14" display;
  §14.16 then drove it at 1422×595 (135% scaling). Those two may have cancelled
  out. One deliberate check at 100% settles it.
- **The Case Sheet cold-start void** — reduced, not removed (§14.16).
- **`:has()`** carries the plan rail's centring; degrades quietly.

### 4.8 Explicitly NOT this phase

The longitudinal spec's three items — trend header, WhatsApp reminder,
persistent care plan — are specialty features. The spec itself says general OPD
clinics are largely satisfied with paper. Do not let them leak into the General
OPD finish. There is no reminder or WhatsApp code anywhere in `src/` outside
Front Desk's i18n strings.

---

## 5. Environment on the new machine

- `.env` is committed on purpose (atlas preamble). It is already there after a
  clone. Do not delete it, do not re-gitignore it, do not ask before using it.
- `npm install`, then `npm run dev` → 127.0.0.1:5173.
- Checks: `npm run check:search` · `check:brands` · `check:dental` ·
  `check:obstetric` · `check:measures` · `check:growth` · `check:combos`.
  `check:combos` and the database half of `check:measures` need credentials.
- Supabase project is `arenod`, ref `ieimvjprtltancxapuzg`, region ap-south-1.
  Reachable through the Supabase MCP tools.
- Migrations are applied directly to the live database through those tools —
  there is no `supabase/migrations/` directory. **Anything that writes to the
  live database is Anmol's call to authorise first.**
- `tsc -b` passed clean at the moment this file was written. Treat any new
  error as a regression.

---

## 6. Standing rules most likely to be tripped by this work

From doctrine §5 and atlas §14 — the ones that bear directly on the tasks above:

- **Brand is the headline. Always.** The composition is the subtitle, never the
  reverse. This is the whole of task 2.
- **Colour carries meaning, never mood.** blue = the action · rose = reported ·
  teal = examined · violet = the engine's reading · amber = soft guard ·
  red = hard guard · green = taken.
- **Ranking decides what is OFFERED, never what is REACHABLE.**
- **No guard ever hides a suggestion**, and anything reached by any route must
  compute and render the same verdict at full strength.
- **Never print a score.** Proportional bars and relevance words only.
- **The engine (`lib/synapse/*.ts`) is pure** — no React import, no Supabase
  import, ever.
- **One manual search** — do not fork `IntentSearch`.
- **Targeted edits only.** Never silently rewrite a whole file.
- **Add zero new `tsc` errors.**
- Anmol is non-technical: literal, copy-paste-ready instructions, no diagrams.

---

## 7. The one lesson this repo keeps relearning

Open the browser first, not last. §14.14, §14.15 and §14.16 each record defects
that were invisible in the code and obvious on a rendered page — a stale row
height slicing a card, a relevance tint that was white, a font ramp that was
being authored and thrown away. If a change here is reported as done without
the page being loaded, it is not done.

---

## 8. Session 2026-08-14b — tasks 3, 1 and 2 closed

Continued from a fresh machine (branch had been cut from the wrong base —
`main` is a stale, unrelated 11-commit history with no `docs/` at all; restarted
it from `master`, which cost nothing since it carried zero unique commits).
Not browser-verified against the real app — no doctor login was available in
this environment. Verified instead with `tsc -b`, `vite build`, static renders
of the new markup against the real stylesheet, `npm run check:search` /
`check:brands`, and read-only SQL against the live database. **Open the
browser before trusting any of this**, per §7.

### Task 3 — the add sheet, finished

`doseFieldValue` wired into the sheet (initial seed + strength-variant click).
Added `features/consult/dosing.ts`: a short, conservative static map from
composition name to food instruction — no DB column exists for this (§4.1
still holds), so it stays a pre-fill, never a guard. Circles replaced the
four M/A/E/N buttons. Confirm button moved green -> blue.

### Task 1 — combination ranking wired, the "very big flaw"

`fetchCombinationProducts` wired into `RecommendationsCard`: a ranked
molecule now offers its combination products as alternates (fewest extra
molecules first), and a molecule with NO standalone product gets a real
Prescribe button off its best combination for the first time. The engine
gained two pure functions, `medicineIntentIndex` and `guardCombination`
(`lib/synapse/engine.ts`) — a combination's guard verdict is computed across
EVERY molecule it carries, not just the one the ranked list scored, and a
hard verdict on any combination offered under a row locks the whole row.
Same fix applied to the manual search path (`IntentSearch.tsx`), which had
the identical gap. See the commit on `claude/medicine-add-sheet-ranking-y8on0i`
for the full reasoning.

### Task 2 — brand as the headline in search, root cause was in the database

The client (`IntentSearch.tsx`) was already correct — brand-first rendering
was really applied 2026-08-12 as the atlas claims. The bug was upstream, in
the `search_intents` SQL function itself, and NO amount of client-side work
would have found it by reading `IntentSearch.tsx`.

`search_intents` computes a `by_label` hit (query matches the composition
name) and a `by_brand` hit (query matches a real product name) separately,
then keeps exactly one per intent via `distinct on (m.id) order by m.id,
m.provenance, ...`. Provenance was `label=1, symptom=2, brand=3` — so
whenever BOTH fired for the same intent, the LABEL match won and the brand
match, `via_label` included, was silently discarded before it ever reached
the app. Confirmed live: typing "ace" returned bare "aceclofenac" even
though "Ace-P Tablet" — a real, prescribable product — matched too. This
collision is common, not an edge case: most Indian brand names are prefixed
by their own molecule ("Acenac" / aceclofenac, "Dolowin" is coincidence but
plenty aren't).

Fixed with `CREATE OR REPLACE FUNCTION public.search_intents(...)` —
migration `search_intents_prefer_brand_over_label`, applied 2026-08-14 with
Anmol's authorisation. Only the three provenance literals changed:
`brand=1, symptom=2, label=3`, so a brand match wins whenever one exists.
Same signature, same output columns, every other clause byte-identical.
Verified after: "ace" now returns "Ace-P Tablet" (brand) for aceclofenac;
"dolo" is unaffected (was already all-brand, no collision to have); a pure
molecule search like "metformin" still correctly returns the composition
when no brand collides. **This fix is NOT in git** — there is no
`supabase/migrations/` directory (§0), so the function body above, and this
paragraph, are its only record. If the schema is ever dumped or migrated
to a real migrations directory, carry this change forward explicitly.

### Still open

Only task 4 — folding the now-stale parts of the doctrine and atlas (start
with doctrine §3, flagged wrong by this file's own §4.2) back into a single
accurate document, and deleting this file once that is done.
