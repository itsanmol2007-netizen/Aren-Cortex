# Session handoff — 2026-08-31 (PDPG layout + attachment pipeline pass)

**Temporary, self-replacing. REWRITE THE WHOLE FILE, not append a new dated
section.** `cortex-design-dna/*.md` and `context/*.md` are stable reference
material — touch them only when a rule or fact in them is actually wrong.

## What this round touched

Two areas, both against reference screenshots the user supplied directly (no
dev-server screenshots taken this round — the user asked not to spend tokens
re-deriving what the images already pinpointed; verified by reading the
actual JSX/CSS instead). `npx tsc -p tsconfig.app.json --noEmit` is clean
throughout (one pre-existing, unrelated `baseUrl` deprecation warning). Could
not run `vite build` — this sandbox's `node_modules` has no local `vite`
install and `npx` couldn't fetch one; not caused by this round's edits.

### 1. Attachment pipeline (`features/consult/`)

- **`AttachmentsCard.tsx`** — the "Upload from this computer" / "Upload from
  phone" menu items had their icon rendering above the text on its own line:
  Tailwind's preflight forces `svg { display: block }`, and the `<button>`
  had no `display` of its own (falls back to `inline-block`), so the icon
  became a full-width block line. Fixed with `inline-flex items-center
  gap-1.5` on the buttons — once the button is a flex container the icon is
  a flex item regardless of its own `display`.
- Strip-mode card (the one in the Consult Workspace, "ATTACHMENTS N files"):
  - Was resizing with content — `.cs-attach.is-strip { min-height: 0 }` — so
    deleting the one attachment shrank the whole card. Now `min-height:
    108px` on the card plus `min-height: 38px` on both the populated strip
    row and the empty-state block, so add/remove doesn't reflow it.
  - The "More ⌄" footer button (`.cs-card-foot-more`) — changed the card's
    height by itself, and opened a modal from a control that read as
    decorative. Removed; a `Maximize2` icon-button (`.cs-head-view-all`) now
    sits in the header next to a real `Plus` icon-button (`.cs-head-add-btn`)
    — both fixed-size, both always in the same place regardless of file
    count.
  - The "Evidence" modal (`ChartSurface` "showAll") was using the shared
    800px default width, meant for a chart canvas (odontogram/body map) —
    read as absurdly wide for a single file row. Now `maxWidth={460}` plus a
    `minHeight: 120` wrapper on both the strip and full-mode call sites, so
    deleting the file down to zero no longer shrinks the modal.
- **`UploadFromPhoneModal.tsx`**:
  - Removed the separate "Resume" button under the expired QR — the blurred
    QR box + reload icon + "Expired" badge is now itself the click target
    (`onClick={doResume}`) when resumable. The non-resumable "Start a new
    session" button is kept, per explicit instruction.
  - `window.confirm()` for "Cancel this link" replaced with an in-app
    confirmation step inside the same fixed-size `ChartSurface` body (Keep
    it / Cancel link) — no more native browser popup breaking the app's own
    chrome.
  - The `error` phase (no active session at all) used to be a bare red
    sentence in an otherwise-unstyled box. Now shows a mock blurred QR
    (a CSS-drawn placeholder grid, not a real code) with an "Unavailable"
    badge and a click-to-retry action (`retryToken` state re-runs the
    `ensureActiveGatewaySession` effect), matching the expired state's own
    visual language instead of reading as a different, broken shell.
  - Modal width/height (`QR_MODAL_WIDTH`/`BODY_MIN_HEIGHT`) untouched in
    every phase — this was already correct going in, just re-verified.

### 2. Patient Record / PDPG (`features/patients/`)

- **New Consult** moved out of its own full-width light-body row
  (`.prec-page-header`, now unused JSX — the shared CSS class stays, other
  patients pages still use it) into `WorkspaceHeader`'s dark-glass
  `rightSlot`, to the LEFT of `BackButton` — new `.ws-new-consult-btn`
  (workspace-header.css), same glass/blur/border family as `.ws-back-btn`,
  blue-tinted to read as the primary action. Back button's own position
  (rightmost) is unchanged, per the standing "back button never moves"
  rule.
- **Visit Timeline was cramped** — `.prec-panel-card--grow` +
  `.prec-panel-card-body--grow` (an earlier session's fix for a different
  complaint, "the timeline is half cut") made the card absorb the column's
  whole remaining height and scroll INTERNALLY, which is what produced the
  "thin white band" sliver scrollbar with most rows invisible above it.
  Removed both classes from `PatientRecord.tsx` (real card + skeleton) and
  deleted the now-unused CSS rules from `patients-shell.css`. The Visit
  Timeline card now sizes to its own content like every other card, and
  `.prec-main-col`'s own `overflow-y: auto` (already correct, untouched) is
  the one scrollbar for the whole main column — confirmed by reading the
  CSS, not by loading the page (see note above on why no screenshot).
  `.prec-right-col` was already a fixed-width, independently-scrolling
  sidebar; no change needed there.
- **Empty/semi-empty state** — Clinical Snapshot, Progress Trend, and the
  four sidebar cards (Care Plan, Frequent Complaints, Common Medicines,
  Visit Pattern) used to vanish ENTIRELY when they had nothing to show,
  which is what produced the "half the page is dead white" look in the
  reference screenshot. All six now always render their card shell; a new
  `.prec-placeholder-dash` (a plain centred "—", or a short label for Care
  Plan/Visit Pattern) or a placeholder `.prec-trend-grid` (dash cards, same
  shape as populated ones) fills in instead of the card disappearing.
  `RankedBarList` already had its own "No data yet." fallback — only the
  PARENT's conditional wrapper was hiding it, so that gate came off.
- **`.prec-tl-inprogress-notice`** (the amber "N visits haven't been
  finished in Consult yet" banner) was 11px/8×11px padding next to 18px
  identity text — enlarged to 13px/12×16px padding with a left accent bar
  instead of an all-round hairline, so it reads as part of the page rather
  than a small floating chip.
- **Longitudinal Record / Progress Trend graphs** — clicking a trend
  mini-card used to open `PastVisitCard` (the per-visit dark detail view)
  for whichever visit produced its newest reading — answering "what
  happened at one visit" when the actual click was on a GRAPH. New
  **`TrendDetailModal.tsx`**: a real plotted line (same time-axis math as
  `LongitudinalBand.tsx`'s `Sparkline`, just bigger, with per-point date
  labels) plus a list of every reading, newest first. Clicking a point or a
  row hands off to the same shared `PastVisitCard` — this does NOT create a
  second per-visit detail view (`cortex-longitudinal-spec.md` §3.1's rule
  is about visits, not about a series' own expansion, which didn't exist
  before this).

### 3. Follow-up round — the dark card on a light page

Anmol, on the past-visit card opening from a trend graph: "this screen was
dark only coz when clicking on the past visit shown on dark header so its
also dark, but now is also being opened when clicking on graph elements
which are obviously in light theme... but dont change the actual dark model
which appear when clicking on past visit timeline on darkheader of consult,
that should be preserved."

- **`PastVisitCard` gained a `tone` prop** (`"dark"` default, `"light"`
  opt-in). Dark is byte-for-byte the same experience for Consult's header
  chips and longitudinal band — `App.tsx` passes nothing and gets exactly
  what it had. `PatientRecord.tsx` passes `tone="light"`, which swaps the
  palette to the shared light-modal family (`.pv-*.is-light` in
  past-visit.css, every value lifted from `.cs-chartmodal-*` — panel
  background/border/shadow, scrim + blur, stripe gradient, icon badge — so
  no new colours) and centres the card instead of anchoring it to the `x` of
  whatever was clicked, since in that context it drills in from a centred
  modal rather than dropping out of a chip. Same component, same sections,
  same order: only the surface changes.
- **The graph modal stays mounted underneath** the visit card now
  (`.pv-overlay.is-light` is z-900, above `.cs-chartmodal`'s 800), so
  closing a visit steps back to the graph the doctor was reading instead of
  dumping them on the bare page. `PastVisitCard`'s Escape handler gained
  `stopPropagation` for this — `ChartSurface` closes on a WINDOW keydown
  listener, so without it one Escape would have collapsed both layers.
- **Shared entry motion.** `.cs-chartmodal-panel`/`-scrim` had none at all;
  both now use the same rise+fade keyframes `.pv-card.is-light` does, so
  stepping from graph to visit reads as one surface arriving after another.
  Both guarded by `prefers-reduced-motion` (design DNA rule 6).
- **`UploadFromPhoneModal`'s shell is now hoisted** — each phase used to
  return its own `<ChartSurface>`, so the element type at that tree position
  changed on every phase change and React remounted the whole shell. That
  already re-stole focus mid-open (a real, pre-existing `useOverlayFocus`
  bug) and would additionally have replayed the new entry animation, making
  a routine loading→ready transition look like the modal closed and
  reopened. One stable shell now, body swaps inside it; `preventDismiss`
  varies by phase (off for the error state, which has nothing to lose).
- **The graph itself got the polish pass** (`TrendDetailModal`): the line,
  dots, area fill and verdict badge all take ONE colour from
  `series.verdict`, and it is the same green/amber/slate the mini-card's own
  sparkline already uses — a blue line under a green "Improving" badge made
  the expanded graph look like a different measurement from the card that
  opened it. The decorative fixed-midline is replaced by the series' real
  low/high as labelled gridlines (78 → 110 had no frame of reference
  before), there's a gradient area fill under the line, the latest point is
  filled rather than hollow, and every dot has an invisible 14px hit disc
  because a 3.5px target is not clickable. One `hoverIndex` links both
  halves both ways: pointing at a dot lifts its reading row, pointing at a
  row lifts its dot and floats its value above the line.

## Not done / flagged rather than guessed

- The sidebar's "Quick Actions → Start New Consult" button is now a near-
  duplicate of the new header button. Left it alone rather than removing it
  unasked — it is a real action (not a decorative "useless" button the way
  the old trend-card click was), just redundant now. Worth a direct
  "remove it?" if the next session touches this page again.
- No live verification (dev server, screenshots) this round — the user
  explicitly asked not to spend tokens re-deriving what their four
  reference images already pinpointed. Everything above was checked by
  reading the actual rendered CSS/class chain, not by opening a browser.
  **Rule 13 in `cortex-design-dna/README.md` ("render it, measure it,
  click it") was skipped by explicit instruction this round — flag this
  the next time anyone touches these two areas, since it's the one rule
  every prior regression traces back to skipping.**

## Environment / recipe

- No `supabase/migrations/`; schema changes apply live via Supabase MCP
  when needed. Project `ieimvjprtltancxapuzg` (org `arenod`, `ap-south-1`).
  Nothing in this round touched the DB.
- `main` and `master` are unrelated histories, per prior sessions' notes.
  This round's branch: `claude/pdpg-layout-fixes-768k6v`.
- This sandbox's `node_modules` doesn't carry a working local `vite` —
  `npx vite build` tries to fetch a fresh copy and fails offline. `tsc -p
  tsconfig.app.json --noEmit` is the verification path that actually works
  here; used throughout.
