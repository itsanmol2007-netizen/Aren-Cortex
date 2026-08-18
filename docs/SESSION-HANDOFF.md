# Session handoff — 2026-08-18

**This file is temporary and self-replacing.** It carries context between
sessions so nothing has to be re-derived. Fully rewritten this session;
everything the previous version said is folded into `aren-cortex-atlas.md`
§14.31 or obsolete. Rewrite or delete this file the same way when the next
session ends.

**Read order for a cold start:** this file, then `aren-cortex-ui-doctrine.md`,
then `aren-cortex-atlas.md` §14 (newest at the bottom — §14.31 is this
session). Then `docs/Cortex Specialties/physiotherapy-phase-1-plan.md` and
`-phase-2-plan.md` if touching physiotherapy further.

---

## 0. Where things stand

Branch `claude/cortex-ui-body-map-review-i1ilg8`. Everything below is
committed, pushed, and built clean (`tsc -b` + `vite build`). No work in
flight.

**Physiotherapy is now a fully built specialty — all six planned phases
landed this session**, on Anmol's explicit go-ahead to stop reviewing
phase by phase ("build with the knowledge you have... I need the result").
Full detail in atlas §14.31; short version:

1. **Story + Goals** — its own Subjective input surface, `PhysioInputs.tsx`
2. **Measurement foundation** — corrected mid-build (see below), shipped
   narrower than planned
3. **Examination** — ROM active/passive with computed gap, MMT, special
   tests, one region at a time
4. **Impairments** — 8th intent type, ranked ahead of findings
5. **Within-session re-test** — same row as Phase 3's baseline
6. **Outcome instruments with MCID** — ODI, QuickDASH, alongside LEFS

**The one correction worth knowing before touching this again:** Phase 2's
plan assumed `visit_measurements` could become the trend read path. It
can't — it's the ENGINE's normalised view (temperature in °C, `bp` split
into two rows), not a copy of what the doctor typed. One real visit had
`vitals.temp = "100"` (°F) against a `TEMP` row of `37.8` (°C). Switching
the loader would have shown a temperature falling 100→37.8 with a
confident arrow drawn at it. So Phase 2 shipped only four additive columns
(`side`/`method`/`context`/`qualifier`); `trend.ts` was never touched.

## 1. What to do next

**Nobody has used any of this.** That's the actual next step, not more
building: get a real physiotherapist (or Anmol) through a real consult in
the live app. Chromium in this environment has no outbound network, so
every phase this session was verified via component harnesses and direct
Postgres queries, never through login. If the Story block goes unfilled in
practice, Phases 3–6 (built on top of it) need re-scoping — that's an
accepted, stated risk, not an oversight.

After that: **6 of 8 specialty profiles are still on the old `soap`
three-picker fallback** (diagnostics, cardiology, paediatrics, gynaecology,
dentistry, dermatology). Physiotherapy is now the reference case for what
moving one off `soap` costs. Anmol's prior read: cardiology first — no
chart to relocate, trend list already configured, clearest longitudinal
case in the spec.

## 2. Traps found this session — worth knowing before writing code

1. **A boolean guard's meaning can silently narrow when an enum it's built
   on gains a value, and `tsc` will not catch it.** `usesCaseSheet` meant
   "not the SOAP fallback" until `inputLayout` gained a third value
   (`"physio"`), at which point three guards using it as that proxy went
   quietly wrong — physio lost its joint map, gained duplicate phase
   labels. Every value involved was still a valid boolean. Found by reading
   the guards, not by a check. Renamed to say what it means
   (`usesRebuiltSurface`). **Worth grepping `App.tsx` for the same pattern
   before the next `inputLayout` value ships.**
2. **A store that looks like a copy of user input may be a normalized
   derivative instead**, and the two are not interchangeable no matter how
   tempting the row count is. Check what's actually IN a table before
   proposing to promote it, not just whether it's written to.
3. **Two properties can look redundant and not be** — `trendNoise` (real
   vs. measurement jitter) and `mcid` (real vs. clinically meaningful) are
   both a threshold on the same number and answer genuinely different
   questions. Collapsing them would have lost the "is this validated
   instrument's move big enough to matter" check.
4. All prior traps (§14.1–14.30) still apply — `visit_observations.source`'s
   CHECK constraint, RLS-with-zero-policies, `handleAcceptIntent`'s empty
   deps, opacity on Case Sheet chips, `diagnostic_orders`' FK order, browser
   tab shortcuts, doc/code drift, focus-on-open for overlays.

## 3. Open items, most important first

- **Live-app verification of all six physio phases** — see §1.
- **The `stagedMedicine`/`pendingMedicine` reset gap** — still open,
  unrelated to this session, documented in `useConsultPlan.ts`.
- **6 profiles still on `soap`** — see §1.
- **Impairment content is MSK-general** — not joint-specific, not tailored
  to any physio sub-population (post-op, neuro, paediatric). Widening it
  is clinical curation, not architecture.
- **`condition_observable_map`'s remaining ~12 chronic conditions** —
  unrelated to this session, still open from earlier ones.
- Atlas §5.1's inventory table is stale — missing every file from this
  session and several before it.

## 4. Environment

- **No `supabase/migrations/` directory.** Schema changes apply live via
  Supabase MCP tools. This session's migrations, in order:
  `physiotherapy_story_and_goals`, `qualified_measurements_side_method_context`,
  `impairment_intent_type`, `impairment_catalogue_and_rules`. Full SQL and
  reasoning in the commit messages and atlas §14.31.
- Two real-data writes this session were test-and-delete, not left behind:
  Phase 1's enum round-trip on a real visit, verified and cleaned up
  immediately.
- Supabase project `ieimvjprtltancxapuzg` (org `arenod`, `ap-south-1`).
- `main` and `master` are unrelated histories; this session worked on
  `claude/cortex-ui-body-map-review-i1ilg8`, branched from the
  longitudinal-spec work, not from `master` directly — check `git log`
  before assuming `master` has this session's work.
- Dev server: `npm run dev` → `http://127.0.0.1:5173`.
- Checks: `npm run check:trend` (167), `check:measures`, `check:examination`
  (new), `check:story`, `check:exercise`, `check:growth`, `check:dental`,
  `check:obstetric`, `check:combos`, `check:search`, `check:brands`.
