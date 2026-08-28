# Session handoff — 2026-08-28 (Practice page, converged to a literal reference image)

**Temporary, self-replacing. REWRITE THE WHOLE FILE, not append a new dated
section.** `cortex-design-dna/*.md` and `context/*.md` are stable reference
material — touch them only when a rule or fact in them is actually wrong.

## What this round changed

All in `src/features/practice/{PracticePage.tsx,practice.css}`,
`src/features/consult/BlankArt.tsx`, `src/styles/{consult.css,
workspace-header.css}`. Driven by a literal reference screenshot, not
prose — "treat the reference image as the design target, not merely
inspiration." Verified end-to-end in a real browser against the live
Ekanki account (see recipe below); no data was written or changed.

- **Reinstated the on-page section heading** ("Clinical Defaults / What
  Cortex reaches for first during a consultation", `.prac-group-head`) —
  the PREVIOUS round cut this reasoning the dark header already said
  enough. That reasoning was sound in isolation; the reference image
  overrode it anyway. See panel-structure.md's new note on this — a
  reference image outranks a prior round's own argument.
- **Tone-threaded colour, page-wide.** Every card now carries a
  `.prac-card--{tone}` modifier next to its `.prac-glyph.is-{tone}`, and
  every accent ON that card (`.prac-count`, `.prac-card-manage`,
  `.prac-foot-link`, `.prac-empty-action`, the hover glow) reads in that
  SAME tone instead of one blue for the whole page ("do not use the same
  pink/purple accent for every action"). One deliberate exception:
  Preferred Medicines' count is GREEN (`countTone="green"` on
  `PracticeCard`) — colour.md's "taken/added to the plan", not a re-
  statement of the card's own teal icon. See colour.md's new note.
- **One footer-link shape, everywhere.** `PracticeCard`'s new `foot` prop
  + `FootLink` component replaces the old per-card mix of a dashed
  "+ Add another" box on some cards and a bare "Manage" text on others —
  "Manage all preferred medicines →", "View all labs →", "Manage
  companions →", "Manage clinical terms →", tone-coloured, gated on the
  card actually having content. See panel-structure.md.
- **Partial-fill illustrations.** A card with 1-3 of its possible rows
  (Preferred Labs ≤3, Templates ≤3, Companions ≤2) now shows its OWN
  empty-state art (`BlankLabArt`, `BlankTemplateArt`, `BlankCompanionArt`)
  low-opacity in the corner, behind the real rows (`.prac-fill-art`,
  `z-index:0` under the content's `z-index:1`) — reused, never a new
  drawing. New `BlankConsultDefaultsArt` (a monitor, slate-toned) fills
  the same role for Consultation Defaults, which had no empty-state art of
  its own to reuse. See empty-states.md's new note.
- **Header stat pills got icons + a chevron + real navigation.** Each
  `.ws-stat-pill` (now a `<button>`, was a `<span>`) carries the SAME
  glyph as the card it summarises (Pill/FlaskConical/Layers/Sparkles), a
  stacked value/label, and a `ChevronRight` — and clicking one calls
  `scrollToCard(key)`, which `scrollIntoView`s the matching
  `#prac-card-{id}` (a new optional `id` prop on `PracticeCard`).
  `workspace-header.css` is SHARED by every page using `WorkspaceHeader` —
  only `.ws-stat-*` classes changed, `.ws-header-title/-subtitle` untouched
  this round.
- **Related Settings** rebuilt from a stacked list of plain text buttons
  into a 2x2 grid of icon tiles (`.prac-settings-grid`/`-tile`/`-icon`),
  each with its own tinted icon (gear/person/chat/shield) + title +
  subtitle + chevron — matches the reference almost exactly.
- **Consultation Defaults** rows gained an inline "Change profile →" /
  "Configure measurements →" link line under each description (was: the
  whole row was the only affordance, no visible link text).
- **Preferred Medicines** search field gained a trailing "+ Add medicine"
  button (`IntentSearchField`'s existing `trailing` slot — no new prop
  needed there).
- **A subtle custom scrollbar** (`scrollbar-width: thin` + WebKit
  pseudo-elements, transparent track, `--cs-line-strong` thumb) on every
  nested-scroll region (`.prac-rows.is-expanded`, `.prac-tree`,
  `.prac-search-results`) — was the plain default browser scrollbar.
- **`--cs-green-soft`** added to `consult.css`'s `:root` — colour.md
  already promised every one of the seven semantic colours a soft pair;
  green's had simply never been added until a green count badge needed
  one. Not an eighth colour.
- **`CappedRows`** gained a `hideTrigger` prop (suppresses its own
  expand-in-place button when a card's persistent `FootLink` already opens
  a fuller modal instead) and its `showAllLabel` prop is now the FULL
  collapsed-state label a caller passes, not a prefix the row count used
  to get appended to.

## The browser CAN reach the app — recipe, unchanged since last round

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
   `VITE_SUPABASE_URL=http://127.0.0.1:5173/sb`. Run the dev server via the
   harness's own `run_in_background` tool call, not a plain backgrounded
   shell `&` — the latter has died silently between tool calls more than
   once now.
4. Log in with the real test account (phone `9999999999` /
   `Gigabyte@Test` — Ekanki Solo Clinic). The phone input is NOT
   `type="tel"`; match it by placeholder (`10-digit number`) too. Landing
   sometimes opens a "Find or create patient" modal first — `Escape` it
   before trying to navigate.
5. Sidebar nav buttons are off-viewport — use
   `.dispatchEvent('click')`, not `.click()`.
6. A data-driven modal that chains multiple sequential Supabase queries
   (e.g. Added Medicines' composition join) can take several seconds
   through the proxy relay — `waitForSelector` on the real row/empty-state
   class before screenshotting, never a fixed short `waitForTimeout`, or
   the screenshot just catches the loading skeleton.

## Test data

Nothing written or changed this round — every verification was a read
(open a card, open a modal, click a settings tile, hover) against the
live account's existing state (1 preferred medicine, 1 template, 0 labs,
0 companions, 2 previously-added medicines).

## Environment

- No `supabase/migrations/`; schema changes apply live via Supabase MCP.
  Project `ieimvjprtltancxapuzg` (org `arenod`, `ap-south-1`).
- `npm install` first if `node_modules` is missing.
- Ekanki Solo Clinic (`hospital_id 64c26e24-3668-49c6-8b99-6ddb8c14883e`),
  Dr Anmol Pandey (`40aa12a6-54f2-4b49-9100-8a2f8de0254d`).
- `main` and `master` are unrelated histories. Work here is on
  `claude/cortex-practice-implementation-knrjcj`, fast-forwarded to
  `master`.
