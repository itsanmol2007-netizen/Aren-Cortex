# Session handoff — 2026-08-27 (Practice page, verified in a real browser at last)

**Temporary, self-replacing. REWRITE THE WHOLE FILE, not append a new dated
section.** `cortex-design-dna/*.md` and `context/*.md` are stable reference
material — touch them only when a rule or fact in them is actually wrong.

## The most important thing in this file: the browser CAN reach the app now

Three previous rounds of Practice-page work were rejected on sight. Every one
of them shipped "tsc clean, build clean, reasoned against the reference
image" without anyone ever rendering the page. This session finally rendered
it, and the very first screenshot showed defects no amount of code-reading
would have caught: cards 396px tall holding one row, **295px of measured dead
space**, a companions list squashed to a 45px scrollbar sliver, and a medicine
search with no add button on any row.

Previous handoffs claimed "browser → live Supabase is blocked in this
sandbox". **That was wrong** — it was an unconfigured browser, not a blocked
network. The working recipe, start to finish:

1. `npm i -D playwright` (browsers are pre-installed; do NOT run
   `playwright install`). Binary lives at
   `/opt/pw-browsers/chromium-1194/chrome-linux/chrome` — the path in
   `PLAYWRIGHT_BROWSERS_PATH` has a version suffix, `.../chromium/...` does
   not exist.
2. Launch with the agent proxy:
   `args: ['--proxy-server=' + process.env.HTTPS_PROXY,
   '--proxy-bypass-list=127.0.0.1;localhost', '--ignore-certificate-errors']`.
   This gets github.com etc. working.
3. **Chromium still cannot CONNECT to `*.supabase.co`** (ERR_CONNECTION_RESET,
   and the proxy logs no failure for it) even though `curl` to the same host
   succeeds. Don't fight it — relay through the dev server instead:
   a temporary `vite.preview.config.ts` with
   `server.proxy: { '/sb': { target: SUPABASE_URL, changeOrigin: true,
   agent: new HttpsProxyAgent(process.env.HTTPS_PROXY), rewrite: p =>
   p.replace(/^\/sb/, '') } }`, plus a `.env.local` setting
   `VITE_SUPABASE_URL=http://127.0.0.1:5173/sb`. Node reaches Supabase fine.
4. Log in with the real test account (phone `9999999999` / `Gigabyte@Test`),
   save `storageState`, reuse it for every later run.
5. The sidebar is off-viewport, so `.click()` times out — use
   `page.locator('button.sidebar-nav-item:has-text("Practice")')
   .dispatchEvent('click')`.

Google Fonts also resets, which is cosmetic only (Geist is bundled locally).
None of the harness files were committed; recreate them from this recipe.

**Measure, don't just look**: `getBoundingClientRect()` over `.prac-card` plus
"bottom of the last visible child vs. bottom of the card body" is what turned
"looks empty" into "295px of dead space", which is what identified the actual
bug (a hard `height`, not a `max-height`).

## What this session changed

All in `src/features/practice/{PracticePage.tsx,practice.css,practiceModal.css}`.

- **Card geometry.** `.prac-card.is-fixed` was a hard `height` (360 → 396px);
  it is now `max-height: 380px`, and `.prac-grid` uses `align-items: stretch`.
  Cards in a row still line up (responsive-grid.md's parity rule) but the row
  is as tall as its tallest card's REAL content. Measured before/after on the
  live account: 396px cards with 295/275px of void → 163px cards with 62/42px.
- **Search could not add anything.** Rows were bare click targets with no
  affordance drawn on them. Every search row now carries a two-line identity
  (brand primary, composition secondary) plus an explicit `PinButton` heart,
  or a "Brands" drill button for a molecule-name hit.
- **Search grew the page forever.** `.prac-search-results` had no bound at
  all; it is now `flex:1; min-height:0; overflow-y:auto`, so it scrolls
  inside the card (measured: 251px window over 958px of results).
- **Brand resolution was broken.** `pickHit` matched `hit.viaLabel` against
  a capped `fetchBrandsForComposition` list — paracetamol carries thousands
  of brands, so "Dolo 650 Tablet" was never in the window and the heart
  silently did nothing. Now uses the existing `resolveProductByName`
  (exact `.eq("name", …)`, the same lookup Consult uses). Verified
  end-to-end against the live DB: clicking the heart wrote
  `clinic_brand_preference` and the tree grew a Paracetamol group.
- **Companions modal.** Lists now come FIRST (the add-form used to push every
  configured companion below the fold), rows are two-line with icon + toggle,
  `.prac-modal-rows` got `flex: none` (it was being squashed to 45px while
  holding 26 rows), the wide modal caps at 660px, and each list header shows
  "5 of 26 · scroll for more" so nothing below the fold reads as missing.
- **Thin stretched buttons are gone.** `.prac-modal-btn.is-compact` was a
  full-width 38px gradient bar in both Labs and Companions — reported as
  "extra thin, completely horizontal, stress type buttons". Now auto-width,
  left-aligned, sized by its label. The footer keeps the one full-width
  primary; that is the only place that treatment belongs.
- **Copy.** Em dashes stripped from every user-facing string on this page.
- **Misc.** First composition group auto-expands; `.prac-group-head` markup
  fixed so a group's subtitle no longer flies to the right edge; stat numbers
  17px; `ClinicBrandDefaultDetail` carries `productForm`/`manufacturer` so
  tree rows show form + maker.

## Test data

Adding/removing preferred medicines was verified against the REAL Ekanki
account, then **reverted** — `clinic_brand_preference` is back to exactly the
one row it had (diclofenac → Aarbser 50mg/10mg Tablet). Nothing was left
behind.

## Still open / judgement calls worth a second opinion

- With one lab and three medicines, Preferred Labs still stretches to match
  its row (≈199px of empty). That is the row-parity rule doing its job and it
  self-corrects as real data arrives, but if it still reads wrong, the
  alternative is `align-items: start` and an honestly ragged row.
- Row 2 (Add New Medicine / Companions / Consultation Defaults) is driven by
  the Add-New-Medicine illustration block; Consultation Defaults carries
  ~139px of stretch as a result.

## Environment

- No `supabase/migrations/`; schema changes apply live via Supabase MCP.
  Project `ieimvjprtltancxapuzg` (org `arenod`, `ap-south-1`).
- `npm install` first if `node_modules` is missing.
- Ekanki Solo Clinic (`hospital_id 64c26e24-3668-49c6-8b99-6ddb8c14883e`),
  Dr Anmol Pandey (`40aa12a6-54f2-4b49-9100-8a2f8de0254d`).
- `main` and `master` are unrelated histories. Work here is on
  `claude/cortex-practice-implementation-knrjcj`, fast-forwarded to `master`.
