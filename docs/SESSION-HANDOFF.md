# Session handoff — 2026-08-26 (Practice page rebuild, STOPPED by Anmol — read this first)

**Temporary, self-replacing. This means REWRITE THE WHOLE FILE, not append
a new dated section to the bottom of it.** The previous version of this
file had grown to ~430 lines across a different arc (Patients) entirely
because that rule wasn't followed — every pass added a section instead of
replacing the file. That sprawl is exactly what Anmol flagged ending this
session ("there shouldn't be a document to update every time... just one
or two documents"). This file is the one. `cortex-design-dna/*.md` and
`context/*.md` are stable reference material — touch them only when a
rule or a fact in them is actually wrong, never as a place to log a
session's history. History lives in git, not in growing docs.

## Where this arc actually stands

The Practice page was rebuilt this session into a real, database-backed
config workspace (schema + CRUD + Consult integration — see below, it's
solid and shouldn't be re-litigated). **The visual result was rejected by
Anmol three times in a row**, each time after a real correction pass, and
his final message ended the session: **"still looking fucked up... no
single improvement, even after giving you a dedicated prompt."** Take that
at face value, not as something to argue with or re-explain. Don't reopen
this by re-running the same loop a fourth time.

**What actually happened, three rounds:**
1. First build: Anmol called it ugly, flagged an amber/orange modal, SVG
   icons that read as broken, excessive whitespace.
2. First correction: softened the amber gradient, redrew two faint icons,
   widened the page slightly. Anmol: verify-and-look-again — turned out to
   still be visibly wrong (a house icon for "labs", uneven card heights,
   still amber, a real CSS bug in a button's icon layout).
3. Second correction, after Anmol wrote a long, specific, structural
   critique (container philosophy, stable card geometry, one modal colour
   system instead of one per feature, a designed intro instead of floating
   prose): rebuilt the container to inherit `.app-shell`'s existing
   1720px shell instead of inventing a competing width, gave the 4
   Clinical-Defaults cards one fixed grid-defined height instead of
   content-driven ones, unified every modal onto Cortex's own signature
   gradient (icon tile is the only thing `accent` still controls), redrew
   the labs icon as a flask in neutral slate instead of a house in amber.
   **Verified rendered via a local harness (see below) at every step,
   screenshots taken, changes looked correct in them.** Anmol's response:
   still rejected. This document does not know exactly what is still
   wrong — the session ended before that could be asked.

**The real lesson, stated once, don't re-litigate it either:** this
session's Playwright-screenshot verification method proves a page RENDERS
and matches what the agent asked for — it does not prove the result reads
right to an actual person. This is the second time in this codebase's
history that "verified rendered, screenshots taken" and "the person who
has to look at it says it's wrong" have diverged (the first was
ConditionsCard/SuggestionsCard, logged in this file's git history under
2026-08-25). **Whoever picks this up: get Anmol looking at the real,
live, running page — not another round of local-harness screenshots
reviewed by an agent — before doing another full visual pass.** If the
live browser is still unreachable from this sandbox (§3 below), that is a
reason to ask Anmol to look and describe/screenshot it himself, not a
reason to trust agent-only judgment again.

## What's actually solid — don't rebuild this part

Schema (3 real migrations, applied): `prescription_templates` +
`_items`, `doctor_preferred_labs` + `diagnostic_orders.lab_name`,
`doctors.preferred_measure_keys`. Practice page CRUD: Clinic Default
Brands settable (not just clearable), Your Clinical Terms add+chip-cloud,
Preferred Labs full CRUD behind a modal, Prescription Templates a real
builder (create/edit/duplicate/delete). Consult integration: PlanCard's
"order from" lab prompt (persists to `diagnostic_orders.lab_name`),
CaseSheet's case-sheet search surfaces template matches distinct from
symptom matches and applies them through the same guarded
`handleAcceptIntent` path everything else uses (hard-warned items are
skipped with a toast, never silently added; a medicine still confirms its
dose in the normal sheet), a "Save as template" action on the Plan rail.
`tsc -b` and `vite build` are clean as of the last push. None of this was
what Anmol objected to — only the visual layer was. Don't discard the
functional work chasing the visual complaint.

**Files, if picking this up:** `src/features/practice/PracticePage.tsx`
(+ `practice.css`, `PracticeModal.tsx` + `practiceModal.css`,
`SaveAsTemplateModal.tsx`), `src/features/consult/PlanCard.tsx` (the lab
prompt), `src/features/consult/CaseSheet.tsx` (`ClinicalCommandBar`'s
`templates`/`onApplyTemplate` props), `src/App.tsx` (owns `preferredLabs`/
`measurePrefs`/`templates` state, the `applyTemplate` queue), `src/lib/db/
synapse.ts` (every new fetch/write function, all named `*PreferredLab*`/
`*PrescriptionTemplate*`/`*MeasurePrefs*`).

## 1. The next real checkpoint

Get Anmol (or a screenshot from him, or a session that can actually reach
the live app) looking at the current Practice page and naming specifically
what is still wrong. Do not guess again from a local harness. If a
render-verification tool is available, use it to CONFIRM a fix Anmol has
already described, not to self-approve a redesign before he's seen it.

## 2. Environment

- No `supabase/migrations/`; schema changes apply live via Supabase MCP.
  Project `ieimvjprtltancxapuzg` (org `arenod`, `ap-south-1`).
- Dev server `npm run dev` → `http://127.0.0.1:5173`.
- Ekanki Solo Clinic (`hospital_id 64c26e24-3668-49c6-8b99-6ddb8c14883e`),
  doctor **Dr Anmol Pandey** (`40aa12a6-54f2-4b49-9100-8a2f8de0254d`) is
  the real test account. A second working login this session: phone
  `9999999999` / password `Gigabyte@Test` (falls back to the hardcoded
  `DOCTOR_ID` constant for doctor-scoped reads — no `doctors` row — but
  `hospital_id` resolves to Ekanki, real data).
- **Browser → live Supabase is blocked in this sandbox**: headless
  Chromium cannot reach `ieimvjprtltancxapuzg.supabase.co` at all
  (`ERR_CONNECTION_RESET` after ~12.5s, confirmed multiple independent
  ways across sessions). Direct SQL via `mcp__Supabase__execute_sql` etc.
  is a different path and DOES work. A local Playwright harness (real
  components, fabricated props, no live network — see this session's git
  history for the exact `preview.html`/`preview-main.tsx` pattern, never
  committed) can prove a page renders and responds to clicks; it cannot
  prove the result looks right to a person. See the lesson above before
  leaning on it for a visual judgment call again.
- `main` and `master` are unrelated histories in the original repo. This
  session's work is on `claude/readme-cortex-design-dna-an2lhi`, pushed to
  both that branch and `master`.
