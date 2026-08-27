# Session handoff — 2026-08-27 (Practice page, polish round)

**Temporary, self-replacing. REWRITE THE WHOLE FILE, not append a new dated
section.** `cortex-design-dna/*.md` and `context/*.md` are stable reference
material — touch them only when a rule or fact in them is actually wrong.

## What this round changed

All in `src/features/practice/{PracticePage.tsx,practice.css,practiceModal.css}`,
`src/lib/db/synapse.ts`, `src/styles/workspace-header.css`.

- **"View added" — a read-only history for Add New Medicine.** New
  `fetchHospitalAddedMedicines(hospitalId)` (`lib/db/synapse.ts`) reads
  `medicines` filtered on `hospital_id` (already the correct "added by this
  practice" set per `addMedicine`'s own doc comment — no new log table),
  joined through `medicine_composition_map` → `compositions` for the salt
  name(s). New `AddedMedicinesModal` (same `PracticeModal` shell as every
  other modal on this page) lists name, composition(s), manufacturer, and a
  formatted timestamp (`toLocaleString("en-IN", {…, hour, minute})`), opened
  from a new "View added" link in the Add New Medicine card head. Verified
  end-to-end against the live account: modal correctly showed the two real
  medicines this hospital has on file with real timestamps.
- **Card hover polish.** `.prac-card` gained a resting `transition` and a
  `:hover` state (1px lift + a soft `--cs-blue`-tinted shadow, no new
  colour — same rule colour.md states for every accent). Guarded by
  `prefers-reduced-motion`. Measured before/after via computed
  `box-shadow`: `rgba(16,28,46,.03) 0 1px 1px` at rest →
  `rgba(18,104,232,.08) 0 6px 20px, rgba(16,28,46,.06) 0 1px 2px` on hover.
- **Heading weight, two places.** `.prac-card-title` 12.5px → 13.5px
  (every card title on this page). `.ws-header-title`/`.ws-header-subtitle`
  and `.ws-stat-pill`'s value/label bumped a notch (15px→16.5px title,
  12px→12.5px subtitle at higher opacity, stat value 13px→14px, stat label
  10px→10.5px) — **this file is shared by every page using
  `WorkspaceHeader`** (Patients, Communication, Clinic, Support, Practice),
  so the bump was kept deliberately small, not Practice-specific.
- **Copy.** "Your Clinical Terms" subtitle now names the engine doctors are
  actually configuring: "Your terms, in your words — Synapse remembers them
  for next time" (was "Your own words, remembered for next time").

## Still the load-bearing fact from last round: the browser CAN reach the app

Recipe, start to finish (recreate these files each session — none are
committed):

1. `node_modules/playwright` + pre-installed Chromium at
   `/opt/pw-browsers/chromium-1194/chrome-linux/chrome` (do NOT run
   `playwright install`).
2. Launch args: `--proxy-server=' + process.env.HTTPS_PROXY`,
   `--proxy-bypass-list=127.0.0.1;localhost`, `--ignore-certificate-errors`.
3. Chromium cannot CONNECT to `*.supabase.co` directly in this sandbox —
   relay through the dev server: a temporary `vite.preview.config.ts` that
   copies `vite.config.ts`'s `@` alias + `tailwindcss()` plugin (skipping
   either one breaks every `@/...` import) and adds
   `server.proxy['/sb'] = { target: SUPABASE_URL, changeOrigin: true, agent:
   new HttpsProxyAgent(process.env.HTTPS_PROXY), rewrite: p =>
   p.replace(/^\/sb/, '') }`, plus a `.env.local` with
   `VITE_SUPABASE_URL=http://127.0.0.1:5173/sb`. Run the dev server with
   `run_in_background` (a plain backgrounded `nohup ... &` in one Bash call
   was unreliable this round — it silently died between calls).
4. Log in with the real test account (phone `9999999999` /
   `Gigabyte@Test` — Ekanki Solo Clinic). The phone input is NOT
   `type="tel"`; match it by placeholder (`10-digit number`) too.
5. Sidebar nav buttons are off-viewport — use
   `.dispatchEvent('click')`, not `.click()`.
6. **A `fetchHospitalAddedMedicines`-style read that chains three sequential
   Supabase queries can take several seconds through the proxy relay** —
   don't trust a fixed `waitForTimeout` after opening a data-driven modal;
   `waitForSelector` on the real row/empty-state class (not a generic
   container) before screenshotting, or the screenshot just catches the
   loading skeleton and reads as a false failure.

## Test data

No new writes to the live account this round — `fetchHospitalAddedMedicines`
is read-only, and the two medicines it displayed (`Test (New Med)`,
`Nxvom-4`) were already on file from earlier rounds' verified test data.
Nothing was added or removed.

## Environment

- No `supabase/migrations/`; schema changes apply live via Supabase MCP.
  Project `ieimvjprtltancxapuzg` (org `arenod`, `ap-south-1`).
- `npm install` first if `node_modules` is missing.
- Ekanki Solo Clinic (`hospital_id 64c26e24-3668-49c6-8b99-6ddb8c14883e`),
  Dr Anmol Pandey (`40aa12a6-54f2-4b49-9100-8a2f8de0254d`).
- `main` and `master` are unrelated histories. Work here is on
  `claude/cortex-practice-implementation-knrjcj`.
