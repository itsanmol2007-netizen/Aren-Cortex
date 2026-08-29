# Session handoff — 2026-08-29 (V2: hydration bug, Patients speed, status menu, art, motion)

**Temporary, self-replacing. REWRITE THE WHOLE FILE, not append a new dated
section.** `cortex-design-dna/*.md` and `context/*.md` are stable reference
material — touch them only when a rule or fact in them is actually wrong.

## What this round did (6 items, user's own numbering)

0. **Fixed a real React hydration error**: `.prac-hit-row`/`.prac-modal-
   row.is-pick` (both `<button>`s, whole-row-click-to-add rows) nested a
   `PinButton` — itself a real `<button>` — inside them. Invalid HTML,
   caught live once a search actually turned up a brand hit ("Diclo Gel").
   Replaced with `StaticPin`, a non-interactive `<span>` carrying the same
   two visual states (filled rose / grey outline) with zero `onClick` —
   the row's own click already did what `PinButton`'s `onToggle` would
   have. See `cortex-gotchas.md`'s new note; this pattern can recur
   anywhere a status-icon component built to be independently clickable
   gets reused inside a row that's already the click target.
1. **Related Settings gained a "Prescription Pad" tile**, routed to
   `onNavigate("clinic")` — the feature itself doesn't exist yet ("keep
   it open for now... it should redirect to Clinic page, which we are
   building now"), just the doorway. Grid went 2×2 → 2×3 to fit a 5th
   tile.
2. **Patients page load restructured for real parallelism.**
   `buildPatientRecordRows` (`lib/db/patients.ts`) ran ~12 independent
   Supabase queries one `await` at a time — now 3 `Promise.all` waves
   (patients/visit-counts/symptoms-ids/etc. → symptom-and-finding-name
   lookups/prescription-medicines/exercises → medicine names), plus the
   care-plan progress loop moved to START alongside Wave 1 instead of
   running AFTER Wave 3 (it only ever needed `visits`, already in hand —
   the "0-1 plans, negligible" assumption its own old comment made turned
   out wrong: 5 distinct plans, measured live). `PatientsPage`/
   `PatientsList` also split one shared `loading` flag into
   `todayLoading`/`recentLoading` so whichever of Today's-Patients / All-
   Patients resolves first renders first, instead of both waiting on the
   slower query.
3. **Today's Patients cards got a real ⋮ status menu** — "Mark as
   completed" / "Discard visit" (`setVisitStatus`, `lib/db/patients.ts`),
   scoped to the two REAL terminal statuses `visitStatus.ts` already
   recognises, not new ones ("referred"/"rejected") that every downstream
   count/pill/filter would need teaching about first. Required converting
   `TodayCard` from a `<button>` to a `<div role="button">` (same nested-
   button constraint as item 0) — `data-today-menu-btn` lets the card's
   own click handler tell "open this patient" apart from "open the menu",
   same pattern `VisitRow.tsx` (frontdesk) already uses for its own ⋮.
4. **Rebuilt the background watermark from scratch.** The prior round's
   `ArenMark` letterform blown up to 520px read as "trash" once actually
   cropped at the corner — see `icons.md`'s new note for why a letterform
   specifically doesn't survive that. `PracticeCanvasArt` is a hand-placed
   node scatter + a few sparkle "stars" (reusing the exact 4-point sparkle
   shape `GroupHeadMark` already draws elsewhere, just parametrised) —
   400×200, no letterform, no shape that breaks when cropped.
5. **Fixed two genuinely un-smooth animations** — the composition-tree
   accordion's open/close, and `CappedRows`' own "Show more" (Preferred
   Labs). Both animated `maxHeight` toward a flat `9999` instead of a real
   number; see `motion.md`'s new note for the actual mechanism (a spring
   easing toward 9999 "arrives" after covering well under 2% of its
   nominal travel when the real distance is 50-200px, reading as a snap).
   Fixed with precise, per-render-computed targets: the composition
   group's exact `visibleRows.length * TREE_ROW_H (+ show-more button
   height)`, and a bounded `EXPANDED_ROW_WINDOW = 8` rows for `CappedRows`
   (still scrollable past that via the existing `flex:1; overflow-y:auto`
   mechanism, just with a real, finite target to ease toward first).

## A real bug found DURING verification, not reported

`TodayCardMenu`'s position only clamped the RIGHT edge of the viewport
(`Math.min(rect.right - 178, window.innerWidth - 190)`) — copied from
`VisitRow`'s own menu, whose rows span the full page width so a LEFT-edge
overflow never came up there. This card lives in a horizontal scroller;
the FIRST card's trigger sits close to the screen's left edge, and the
menu opened half off-screen (screenshotted: only "...leted" of "Mark as
completed" was visible). Fixed with `Math.max(8, ...)`.

## Verified live (Ekanki Solo Clinic account)

- Item 0: searched "Paracetamol" and other real brand-hit terms;
  `document.querySelectorAll` confirmed zero `<button>` nested inside
  `.prac-hit-row`/`.prac-modal-row.is-pick`; zero page errors.
- Item 1: `Prescription Pad` tile present, screenshotted.
- Item 2: network-traced (`page.on("request"/"requestfinished")`) against
  a PRODUCTION build (`vite preview`, not dev — `<StrictMode>` in
  `main.tsx` double-invokes effects in dev and roughly doubles every
  request count, misleading if traced there) — confirmed Wave 1 (10
  queries), Wave 2 (4 queries), and the 5-plan care-plan loop all fire
  concurrently with each other, not sequentially. Absolute load time in
  THIS sandboxed proxy environment (~5.2s) didn't drop as much as the
  structural fix implies it should on a normal connection — the proxy
  itself adds real per-request latency here that isn't representative;
  the STRUCTURE (waves vs. one-at-a-time) is what was verified, not a
  clean before/after wall-clock number.
- Item 3: inserted one temporary `visits` row (status `waiting`,
  `started_at: now()`) for a real existing patient, confirmed the ⋮ menu
  opens with the correct two items, clicked "Mark as completed" →
  confirmed the status chip/sidebar counts updated and PERSISTED (checked
  on a fresh page load), clicked "Discard visit" → confirmed
  `is-inactive`/"Inactive". Deleted the temporary visit afterward,
  confirmed the patient's table row read back to EXACTLY its original
  state ("1 visit · Completed · 21h ago").
- Item 4: screenshotted at both the real 0.09 opacity (barely visible, as
  intended — "slight decorative element") and isolated at full opacity
  (to confirm the shape itself reads as a node diagram / constellation,
  not noise).
- Item 5: sampled `getComputedStyle(el).maxHeight` every ~40ms during
  both the tree accordion's open/close and Labs' show-more — both now
  show a real, gradually-decelerating curve (e.g. 0 → 11.6 → 20.4 → 26.4
  → 30 → 32 → 33.5 → 34px) rather than jumping most of the way in the
  first sample or two.
- `tsc -b` and `npm run build` clean throughout. Zero page errors on
  every check.

## Cleanup notes for next round

- `dist/` and the production preview server (`vite preview --config
  vite.preview.config.ts`) were used for item 2's network trace — same
  harness recipe as dev mode, just `npm run build` first, then `vite
  preview` instead of `vite`. Preview also needs `--strictPort` and the
  same `.env.local`/`vite.preview.config.ts` pair.
- A patient named "Test" with 82 visits exists on the live account —
  clearly synthetic test data from an EARLIER round (not this one), not
  touched this round since it wasn't created here and cleaning it up
  wasn't asked for. Flagged here rather than silently left for the next
  round to wonder about.

## Environment / recipe (unchanged from prior rounds)

1. `node_modules/playwright` + pre-installed Chromium at
   `/opt/pw-browsers/chromium-1194/chrome-linux/chrome` (do NOT run
   `playwright install`). Launch with `--proxy-server=$HTTPS_PROXY
   --proxy-bypass-list=127.0.0.1;localhost --ignore-certificate-errors`.
2. Chromium cannot CONNECT to `*.supabase.co` directly here — relay
   through a dev OR preview server: `vite.preview.config.ts` (`@` alias +
   `tailwindcss()` + `server.proxy['/sb']` via `HttpsProxyAgent`) and
   `.env.local` (`VITE_SUPABASE_URL=http://127.0.0.1:5173/sb`). Delete
   both (and any `scratch-*.mjs` scripts) before committing — never
   tracked. Check for a stray server from an earlier round before
   starting a new one (`ps aux | grep vite`).
3. Log in with the real test account: phone `9999999999` /
   `Gigabyte@Test` (Ekanki Solo Clinic, Dr Anmol Pandey,
   `hospital_id 64c26e24-3668-49c6-8b99-6ddb8c14883e`,
   `doctor_id 40aa12a6-54f2-4b49-9100-8a2f8de0254d`).
4. Sidebar nav buttons are off-viewport — `.dispatchEvent('click')`, not
   `.click()`.
5. A component checking `svg.is-flipped`/similar to detect an accordion's
   OWN open/closed state before deciding whether to click it is safer
   than assuming a fixed starting state — which group auto-expands can
   change between test runs as the underlying data's `updated_at`
   ordering shifts.
6. Any write made while testing is REAL data on a REAL account — verify
   with `mcp__Supabase__execute_sql` before deleting anything, prefer
   temporary rows tied to EXISTING catalogue rows/patients over minting
   new ones, and re-query after cleanup to confirm the account reads back
   to EXACTLY its prior state, not just "the delete succeeded."

## Environment

- No `supabase/migrations/`; schema changes apply live via Supabase MCP.
  Project `ieimvjprtltancxapuzg` (org `arenod`, `ap-south-1`).
- `main` and `master` are unrelated histories. Work here is on
  `claude/cortex-practice-implementation-knrjcj`, fast-forwarded to
  `master`.
