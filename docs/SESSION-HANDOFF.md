# Session handoff — 2026-08-31 (sidebar, Settings rebuild, caching, PDPG polish)

**Temporary, self-replacing. REWRITE THE WHOLE FILE, not append a new dated
section.** `cortex-design-dna/*.md` and `context/*.md` are stable reference
material — touch them only when a rule or fact in them is actually wrong.

## ⚠ READ THIS FIRST — verification in a fresh cloud sandbox

This session shipped a runtime bug (a wrong import path) that passed a
"clean" `tsc`. Root cause: **`node_modules` in this environment was
incomplete — `react` and `@types/*` were missing entirely.** With no types
present, and `npx` resolving a NEWER tsc than the project's pinned 5.9.3,
`tsc -p tsconfig.app.json --noEmit` aborted on a `baseUrl` deprecation
error *before type-checking a single file* and reported nothing else. Every
"typecheck clean" was vacuous.

**Before trusting any verification in a fresh session: run `npm install`,
then confirm the gate is real** — `npx tsc --version` should print the
project's 5.9.3, and a deliberate type error should be caught. `npm run
build` (`tsc -b && vite build`) is the honest gate and it works fine once
deps are installed (~10s install, ~6s build). Do NOT "fix" the baseUrl
deprecation in tsconfig — it does not exist under TS 5.9.3, and
`ignoreDeprecations: "6.0"` may be rejected there.

## What this round did

Ten items, all from one review pass against screenshots.

### Sidebar
- Tiles were a ~350px stack at the top of a ~1000px panel. Tiles grew
  (40→52px, Consult action 44→56, icon badges 26→32, 13→14px type) and the
  three dividers became **capped flex spacers** (`flex: 1 1 auto;
  max-height: 76px`), so the four nav groups distribute down the panel
  instead of hugging the header. Lands around 75% fill on a 1080p screen and
  collapses back to plain margins on a short one.
- The doctor footer shows the real `avatar_url` photo (falls back to
  initials) and is now a **control that opens Settings**, not a readout.

### Caching — `lib/db/profileCache.ts` (new)
The doctor row and the hospital row are the most re-read, least-changing
things in the app, and every screen fetched them on mount. Now memory →
`localStorage` → network, 10-minute TTL, shared in-flight requests, and
explicit invalidation **inside** `updateClinicProfile`/`updateDoctorProfile`
so no caller can forget. `updateHospitalSpecialtyProfile` is the one
exception — it lives in `db/patients.ts`, which `profileCache` imports, so
invalidating inside it would be circular; it invalidates at its call site
(SettingsPage) with a comment saying so. Cleared entirely on logout.
**The ROW is cached, never the image bytes** — `logo_url`/`avatar_url` come
from `getPublicUrl`, so they never expire and the browser's HTTP cache is
already the right place for pixels.

### Settings — rebuilt (`SettingsPage.tsx`, + `settingsRegistry.ts`,
`settingsFocus.ts`)
The question that shaped it, from Anmol: the doctor's profile is already on
Clinic, so what is Settings *for*? Answer: **it is the index, not the
drawer.** It carries search across every setting in the app plus the few
that belong to no other page.
- `settingsRegistry.ts` — 8 real settings by label/description/keywords,
  each pointing at a DOM anchor that **actually exists** (`prac-card-*`,
  `clin-card-*`, and two new `clin-identity-clinic` / `-doctor`). A row
  whose anchor doesn't resolve strands the doctor on a page, so never add
  one without adding the id.
- `settingsFocus.ts` — navigate to the owning page, then scroll to and
  flash the control (`.cx-setting-flash`, ~2.4s). A module-scoped pending
  anchor rather than a context, because the target page **is not mounted
  yet** when the request is made; bounded rAF retry, cleaned up on unmount,
  reduced-motion guarded. Mounted once in `App` via `useSettingFocusRunner`.
- 2×2 card grid, nothing full-width (layout-composition rule 1), built from
  the shared `features/clinic/ui.tsx` primitives so the two pages can't
  drift apart.
- The nine-card specialty picker is **folded behind a "Change" disclosure**
  showing the current value — hidden, not removed.
- Real controls that belong nowhere else: clear cached clinic data, discard
  saved consult drafts (inline confirm, not a browser popup), log out, and
  an account reference for support.

### Fixes
- **QR washed out** — the box was always a `<button>` and `disabled`
  whenever it wasn't reloadable, which is most of the time (a LIVE code
  isn't expired), and `base.css` fades every disabled button to
  `opacity: 0.48`. A perfectly good QR rendered at half strength and read
  as cancelled. It's a `<button>` only when it is genuinely an action now.
  **Same cascade family as the `label`/`svg` traps in cortex-gotchas.md.**
- **PDPG empty states** — a bare "—" and three identical "Needs 2 visits"
  tiles read as broken cells. Both now use the block Visit Timeline already
  had (art + fact + next line) at a new compact 150px tier, so a sparse
  patient gets three comparable cards. Two new marks in the BlankArt
  family: `BlankTrendArt`, `BlankSnapshotArt`.
- **Clinic hours** — 12/12.5px type borrowed from Consult's dense scale
  read tiny in a spacious card (typography.md rule 12). 14.5px days, 13.5px
  times, taller rows, an open/closed dot and a Today highlight, both in the
  card's own blue tone.
- **Patients search** — 36px near-white box on a near-white page. Now 44px,
  defined edge, resting shadow, 14px type, icon picks up focus.
- **Practice** — dropped the "Communication" tile from Related Settings: a
  whole nav destination, not a configuration surface.

## Not done / flagged

- **Nothing in this round was seen rendered.** The build passes and the
  reasoning is in the code, but no screenshot was taken (no dev server was
  run this session, per instruction). The sidebar fill percentage and the
  PDPG card balance are arithmetic, not observation — worth one look.
- The sidebar's Quick Actions "Start New Consult" is still a near-duplicate
  of the header's New Consult button on Patient Record. Left alone.

## Environment

- No `supabase/migrations/`; schema changes apply live via Supabase MCP.
  Project `ieimvjprtltancxapuzg` (org `arenod`, `ap-south-1`). Nothing in
  this round touched the DB.
- `main` and `master` are unrelated histories. Work here is on
  `claude/pdpg-layout-fixes-768k6v`, fast-forwarded into `master` each
  round at the user's request.
