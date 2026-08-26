# Session handoff — 2026-08-26 (Practice: Preferred Medicines / Add New
Medicine / Clinical Companions, built against a literal reference screenshot)

**Temporary, self-replacing. REWRITE THE WHOLE FILE, not append a new dated
section.** `cortex-design-dna/*.md` and `context/*.md` are stable reference
material — touch them only when a rule or fact in them is actually wrong,
never as a place to log a session's history. History lives in git.

## Where this arc actually stands

The previous entry in this file (same day, earlier) recorded three straight
visual rejections of a rebuilt Practice page and asked whoever picked it up
to get a human looking at the real page before another full visual pass —
guessing from a local harness had twice produced a page that "verified
rendered" but read wrong to the person who had to look at it.

**This session was different in kind, not just another guess**: it arrived
with a literal reference screenshot (the approved visual baseline) and a
29-point functional spec, not a vague "make it not ugly." The work done is
real and functional, not a fourth visual guess:

1. **Preferred Medicines** — "Clinic Default Brands" reframed into a
   composition-grouped tree (single-expand accordion, bounded card height,
   internal scroll, `scrollIntoView` focus-follow on expand). Reuses
   `clinic_brand_preference` unchanged — its primary key was already
   `(hospital_id, composition_id, medicine_id)`, so multiple preferred
   brands per composition were already representable; only the UI and
   Consult's rendering were flat before. The heart marker reuses
   `PinButton` (Consult's own component, not a copy) throughout.
2. **Add New Medicine** — a new Practice-local modal (`AddMedicineModal`)
   built from the same composition-anchored primitives Consult's
   `AddMedicineSheet` already uses (`addMedicine` RPC — never mints a
   composition, standing rule 22), with an optional "mark as preferred"
   step on success.
3. **Clinical Companions** — a genuinely new backend layer,
   `hospital_companion_preference` (hospital-scoped; curates existing
   `intent_companions` edges off, or authors new ones between two EXISTING
   intents — never a new intent/signal). Read by `applyHospitalCompanionPrefs`
   in `lib/synapse/companions.ts`, called from `useConsultIntelligence.ts`
   right after `resolveCompanions` — the engine itself is untouched. Safety
   rule: a suggestion carrying any warn/warn_hard guard verdict can never be
   suppressed by a practice's curation, only an `ok`-status one.
4. **Consult surfacing** — `RecommendationsCard.tsx`'s `MedicineRow` now
   renders every OTHER clinic-preferred brand for a composition
   ALWAYS-visible (capped at 7, so primary + 7 = 8 rows), not gated behind
   opening the row — verified this does not disturb the existing keyboard
   roving-list (`useRovingList`): the new block sits in the DOM AFTER
   `.cs-prescribe`, so Enter-to-activate on an unopened row still finds
   Prescribe first via `querySelector`. Zero/one preferred candidate is
   byte-identical to the old behaviour (no fallback invented).
5. **Layout** — Pinned Medicines' Practice-page card was removed (confirmed
   with the user; the feature itself — `doctor_pinned_intent`, the personal
   pin — is untouched and still lives inline in Consult). Clinical Defaults
   is now two 3-across rows matching the reference screenshot's card count
   exactly; the three "primary" cards in each row share one derived fixed
   height (`  .prac-card.is-fixed`, 342px — see that rule's own comment for
   the derivation) instead of the old 360px content-driven one.

**Files touched:** `src/features/practice/PracticePage.tsx` (+ `practice.css`,
`practiceModal.css`), `src/features/consult/RecommendationsCard.tsx`,
`src/features/consult/parts.tsx` (a third `CompanionScope`, `'practice'`),
`src/features/consult/BlankArt.tsx` (`BlankCompanionArt`,
`BlankAddMedicineArt`), `src/lib/db/synapse.ts` (every new
`*HospitalCompanion*`/`fetchAuthoredCompanionCatalogue` function),
`src/lib/synapse/companions.ts` (`applyHospitalCompanionPrefs`,
`CompanionPreferenceMap`), `src/hooks/useSynapse.ts` (loads + unions the
practice companion layer), `src/hooks/useConsultIntelligence.ts` (applies
the curation filter). New table: `hospital_companion_preference` (applied
live via Supabase MCP, project `ieimvjprtltancxapuzg`).

## What was actually verified, and what was not

Verified, directly:
- `tsc -b` and `npm run build` clean after every slice, not just at the end.
- `hospital_companion_preference`'s RLS policy and constraints, read back
  from `pg_policies`/`pg_constraint` after creation — matches the exact
  `hospital_isolation` shape `doctor_preferred_labs`/`prescription_templates`
  already use.
- The composition-grouping claim (req. "Paracetamol" and "Aceclofenac +
  Paracetamol" must land in separate tree branches) against real rows:
  Acenac-P Tablet maps to `composition_ids [21 (aceclofenac), 2
  (paracetamol)]` — genuinely separate composition identities, confirming
  the tree's plain groupBy-on-`compositionId` is correct without any extra
  ingredient-matching logic.
- The roving-list DOM-order argument above, by reading `useRovingList.ts`'s
  actual `activate()` implementation, not by assumption.

**NOT verified: the live, rendered page.** Per this file's own previous
entry and `cortex-design-dna/verification.md`, "tsc is clean" and "the SQL
checks out" are not the same claim as "it looks right" — and this session
did not open the app in a browser (the sandbox's browser-to-Supabase
connectivity is the same as previously documented; login-gated pages can't
be driven end-to-end here) or take a screenshot. **Whoever looks at this
next: check the live Practice page yourself before treating this as done**,
specifically:
- the composition tree's expand/collapse motion and focus-follow scroll
  feel (described in code comments, never seen rendered);
- the two-row Clinical Defaults grid at the derived 342px height — confirm
  no card clips its own content, especially Prescription Templates and
  Clinical Companions rows at `MED_ROW_H` (54px) with real (potentially
  longer) trigger/companion label text;
- Consult's always-visible preferred-brand chips on a row that also has
  several ordinary alternates — confirm the wrapped chip row doesn't crowd
  the identity line above it on a narrower viewport.

## Environment

- No `supabase/migrations/`; schema changes apply live via Supabase MCP.
  Project `ieimvjprtltancxapuzg` (org `arenod`, `ap-south-1`).
- Dev server `npm run dev` → `http://127.0.0.1:5173`. `node_modules` was not
  installed at the start of this session — `npm install` first if it's
  missing again.
- Ekanki Solo Clinic (`hospital_id 64c26e24-3668-49c6-8b99-6ddb8c14883e`),
  doctor **Dr Anmol Pandey** (`40aa12a6-54f2-4b49-9100-8a2f8de0254d`) is the
  real test account.
- `main` and `master` are unrelated histories in the original repo. This
  session's work is on `claude/cortex-practice-implementation-knrjcj`.
