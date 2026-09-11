# Session handoff — 2026-09-11, Consult retired + navigation rebuilt

**Temporary, self-replacing. REWRITE THE WHOLE FILE next session.**

Three things happened, and the first is the one that matters beyond this
session: **AREN Consult no longer exists as a product.** There is one doctor's
workspace and it is Cortex. The permanent record of that decision is in
`aren-technical-atlas.md` §9a — read that, not this file, if you are picking
up the reasoning later.

The other two: navigation became a permanent light rail instead of a
click-the-logo drawer, and Help & Support became a real form instead of two
`mailto:` cards.

Everything below landed on `claude/latest-commit-details-vwb2bj`.

---

## 1. Consult is gone. One workspace, Cortex.

Anmol: *"the line is already getting blurred... for a doctor it doesn't matter
if he has a receptionist or not, it will be Cortex."*

- `lib/workspace/mode.ts` → **`lib/workspace/clinicShape.ts`**
  (`modeForClinic`→`hasFrontDesk`, `MODE_BRAND`→`CORTEX_BRAND`,
  `ModeBrand`→`Brand`).
- `hooks/useWorkspaceMode.ts` → **`hooks/useClinicShape.ts`**
  (`isConsult`→`frontDesk`).
- Every call site updated (App.tsx, PatientHeader, WorkspaceHeader,
  DoctorOverviewPage, Sidebar, useAdminAccess). Comments and user-visible
  copy swept too — "in Consult yet" on the Patient Record timeline is now
  "hasn't been finished yet".

**No behaviour changed.** `hospitals.clinic_mode` is still read the same way
and still decides the same things — queue vs registration form, "Complete &
Next" vs "Review Rx", which Overview tiles show. It just stopped naming a
second product while doing it.

## 2. Navigation: a permanent rail, and the panel that expands off it

The complaint: *"when you have to switch pages you literally have to first
click on that logo and then click on the pages from the sidebar... and the
sidebar is looking so much dull, so bulky — the whole page has a light theme
and the sidebar has a dark theme."*

New shape, in `features/sidebar/`:

| File | Is |
|---|---|
| `SidebarNav.tsx` | **The registry.** Data, not a component — `NAV_DESTINATIONS` + `startsGroup()`. Both surfaces render from it, so they cannot drift. |
| `NavRail.tsx` | The permanent 60px light rail. Always on screen, one click per destination, hover tooltips. |
| `Sidebar.tsx` | That same rail expanded to 252px with labels, as an **overlay** — nothing reflows. |
| `ConstellationWash.tsx` | The mark in the rail's quiet zone. |
| `sidebar.css` | Both surfaces. `--rail-w` / `--rail-pad` / `--badge` are shared **on purpose**. |

Load-bearing details a later session will otherwise break:

- **The alignment contract.** The panel's icon badges are the same size and the
  same distance from the left edge as the rail's. That is the whole "it
  widened" illusion. Change one without the other and the panel jumps open.
- **The rail outranks the modals** (`--rail-z: 10000`). That is deliberate and
  it is what let `components/GlobalLogoTrigger.tsx` be **deleted** — an
  invisible button that polled `getBoundingClientRect()` every 400ms so
  navigation stayed reachable under a full-screen overlay. A rail that is
  always visible and always on top is the honest version of that.
- **One logo, in the rail's head**, top-left of the screen, never moves on any
  page. Clicking it opens the panel, which hangs underneath it. Both headers
  lost their own logo pill — that was the "two logos" problem. The JS
  logo-morph (measuring two rects, animating a delta) went with the second logo
  it existed to move. `WorkspaceHeader` still ACCEPTS `logoRef`/`onOpenSidebar`
  as optional props because **Parallax still uses them**: its rail is a
  different thing (in-flow, expands by width) and its header logo is genuinely
  the only way to toggle it.
- **Clicking anywhere closes it**, plus Escape. It is an aid, not a mode.
- The rail is only in the doctor's workspace. Front desk keeps
  `features/frontdesk/components/NavRail.tsx` (which this was modelled on) and
  Parallax keeps `AdminShell`'s.

**The consult topbar went full-bleed** to make the logo land in the same place
on every screen — it was an inset rounded card (`margin: 0 18px`, `margin-top:
14px`, `border-radius: 12px 12px 0 0`), it is now flush and square like every
`ws-header`. Consequences, both in `layout.css`/`consult.css`:

- `.app-shell` lost `max-width: 1720px; margin: 0 auto` (a centred shell drifts
  away from a viewport-anchored rail on wide screens) and gained
  `padding-left: var(--rail-w)`. The cap moved to `.cs-shell`, which is what it
  was protecting.
- **Nothing breaks out of that padded box**, and that is deliberate. The first
  version had each header pull back across the gutter with a negative margin so
  it spanned the viewport — which looked right everywhere except Patient
  Records, whose root is `height: 100dvh; overflow: hidden` and therefore
  *clipped the logo in half*. Any future page that bounds its own scroll would
  have hit it too. The dark strip above the rail that makes the header read as
  full-bleed is painted by `.rail-head` instead, where no page's overflow can
  reach it. It matches whichever header is up (`.app-shell.is-consult` switches
  the dark), with a deliberate hairline at the junction.
- `.cs-shell`'s height maths went `100vh - 92px` → `100vh - 84px` (the
  topbar's 14px top margin is gone; 8px of its own remains).
- The `@media (max-width: 1120px)` block's `.app-shell { padding: 10px }` had
  to go: the shorthand silently reset the rail gutter, sliding every
  narrow-screen page under the rail.

## 3. Help & Support is a real form

`features/support/` — `SupportPage.tsx` + `supportTopics.ts`. Topic → affected
areas (faults only) → free text, emailed to support@arenode.com through the
existing `support-notify` edge function.

- `lib/db/messaging.ts` gained **`sendSupportRequest()`**, which **throws** —
  unlike `notifySupport()`, which swallows. The distinction is written up in
  its own doc comment and matters: every other kind is an alert about a row
  that already exists, but here **the email IS the action**, and telling a
  doctor "got it" over a message nobody received is the one failure a support
  form must not have.
- Identity is resolved server-side from the session (the page cannot claim to
  be another doctor). The browser facts ride along via `collectDiagnostics()`.
  **No patient data is ever included.**

## 4. Plan rename (database)

`plans.code='multi'`: **"AREN Nova" → "AREN Constellation"** (₹25,000/yr,
unchanged). Polaris untouched. Applied directly to the live row — `plans.name`
is display-only, `plans.code` is the stable key.

---

## Status

- `npx tsc -b` and `npm run build` — clean. (Note for next time: plain
  `npx tsc --noEmit` is VACUOUS in this repo. The root `tsconfig.json` is a
  solution file with only `references`, so it checks nothing and exits 0. Use
  `tsc -b`, or `tsc -p tsconfig.app.json --noEmit`.)
- Walked in a real browser signed in as the test doctor: Overview, Patients,
  Communication, Practice, Clinic, Settings, Help & Support, the consult
  screen, rail collapsed + expanded, tooltips. No console errors.

## Also done, after the first pass

- **`support-notify` deployed** (version 9, `verify_jwt` on) with the new
  template, and the whole chain proved end to end: the real form, signed in as
  the test doctor, put a real email in a real inbox — `support_email_log` #37,
  `status = sent`. Only the recipient was redirected for the test.
- Two things that test found and fixed: the confirmation heading was being
  uppercased by `base.css`'s bare `h2` rule ("THAT'S WITH US"), and a failure
  showed the Supabase SDK's own words to the doctor ("Edge Function returned a
  non-2xx status code"). Both corrected; the SDK message goes to the console
  now, where the person who can act on it looks.
- **AREN Constellation** got a tagline and `sort_order: 20`, so Polaris (10)
  now leads a plan list instead of trailing the expensive one.

## Second pass — branding, feedback, and the support record

**The brand lockup came back, and moved.** Stripping the header logo to fix
"two logos" took the AREN wordmark with it, which was wrong: "do we even have
branding of Aren Cortex which was before, the classic branding style common in
all our products, I need that, and it should be always visible."

It now lives in `NavRail`'s head (`.rail-brand`) — mark AND wordmark, one
element, drawn by the rail rather than by either header. That is not a
cosmetic choice: the rail is the only surface in the app that outranks every
overlay, so the branding survives a modal scrim and the nav panel's own scrim
instead of going dark under them. It paints `--brand-w` wide, overhanging into
a margin both headers leave clear (`.app-shell .ws-header-inner`,
`.app-shell>.topbar-unified`). Parallax is untouched — it still passes
`logoRef`/`onOpenSidebar` and gets the whole pill, because its rail has no head.

Three faults fixed in the corner, worth keeping straight because two of them
pull against each other:

1. **The white line** was never a seam between two darks. It was the rail's own
   light `border-right` running full height, straight up through the dark brand
   corner. It is a pseudo-element starting at `--app-header-h` now.
2. **Flat / no depth under a modal** — a solid slab beside a header carrying a
   nebula. The head has its own bloom, and `.ws-header::before` /
   `.topbar-unified::before` CONTINUE that bloom past the junction so the light
   crosses it. Change one, change the other.
3. **Disconnected** — the painted overhang now fades out over its last 52px
   (`mask-image`) instead of ending at a hard edge, which only showed once a
   modal blurred the header behind it.

The nav scrim is masked to start below the header, so opening the panel no
longer dims the brand — it still spans `inset: 0`, so click-anywhere-to-close
is unchanged; it just does not PAINT over the top strip.

**The rail acknowledges overlays.** `body.overlay-open` (App.tsx, from
`consultOverlayShowing`) gives it a light veil and a real edge shadow. A veil
alone could never match the header beside it — the modal's scrim blurs, which
lifts the header toward the page underneath, while a veil only darkens — so it
states the truth instead: the rail is above, and things above cast shadows.

**Sending narrates.** `SendingProgress` in SupportPage.tsx: a bar that eases
toward 92% and stops there (only the real response takes it to 100% — a bar
that fills and then waits converts "slow" into "stuck"), and a line that names
the real server-side stage. Anmol: "humans just need a beautiful architecture
feedback system, and they will wait."

**Diagnostics earn their place.** `Language` and `Connection: online` are gone
— one is never the answer in an English-only product, the other is a tautology
in a request that arrived. What replaced them: the **build sha** (injected by
`vite.config.ts`'s `define`), the **page they came from** and their route in,
**recent runtime errors**, **service-worker state** (a `registerType: "prompt"`
app lets a doctor sit on a stale bundle forever and never know), **network
quality**, and viewport with DPR. `src/lib/diagnostics/sessionTrace.ts` holds
the two ring buffers; it is memory-only and never records patient data.

**`support_requests` is the record now.** New table (migration
`20260911_support_requests.sql`), written by the edge function under the
service role, readable by the clinic that filed it, writable by nobody else.
The row is written BEFORE the email on purpose: a Zoho outage costs the
notification and never the request. The doctor gets the reference back
(`SR_41`) and the email carries it in its subject.

**The caller-supplied `to` is gone** — see below; it is fixed, not open.

Verified live: a real request through the real form wrote `support_requests`
#1 (`email_status: sent`, doctor and clinic resolved server-side, full
diagnostics stored) and delivered to support@arenode.com. Edge function is at
version 10.

## Still open

- ~~**`support-notify` takes a caller-supplied `to`**~~ (`const to = (body?.to as
  string) || …`, inherited from the Express route it was ported from). Nothing
  in the app passes it, but any authenticated user could, which makes AREN's
  own Zoho mailbox able to send arbitrary HTML to an arbitrary address. Worth
  closing: drop the override, or allow-list it. **Fixed 2026-09-11** — the
  recipient is `SUPPORT_NOTIFY_EMAIL` or `support@arenode.com`, full stop.
- ~~**The send is slow.**~~ Still slow (a Zoho token exchange on a cold
  function), but no longer silent — see `SendingProgress` above. Warming the
  token would still be worth doing if it ever gets worse.
- **Nothing writes `support_requests.status` yet.** The column, its check
  constraint and the open-tickets index are there for the support dashboard /
  Zenith panel to drive; today every row stays `open`.
- **The rail's overlay veil only knows about consult overlays.**
  `consultOverlayShowing` does not cover feature-page modals (FeesModal,
  PaymentDetailsModal…), so the rail stays at full contrast over those. Fixing
  it properly means those modals reporting their own state up, which none of
  them do yet.
