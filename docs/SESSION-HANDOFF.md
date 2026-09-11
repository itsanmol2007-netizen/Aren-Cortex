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
- **The logo stays in the dark header**, one logo, never moves. Clicking it
  opens the panel; the panel hangs underneath it. The JS logo-morph (measuring
  two rects, animating a delta) is gone with the second logo it needed.
- **Clicking anywhere closes it**, plus Escape. It is an aid, not a mode.
- The rail is only in the doctor's workspace. Front desk keeps
  `features/frontdesk/components/NavRail.tsx` (which this was modelled on) and
  Parallax keeps `AdminShell`'s.

**The consult topbar went full-bleed** to make the logo land in the same place
on every screen — it was an inset rounded card (`margin: 0 18px`, `margin-top:
14px`, `border-radius: 12px 12px 0 0`), it is now flush and square like every
`ws-header`. Consequences, both in `layout.css`/`consult.css`:

- `.app-shell` lost `max-width: 1720px; margin: 0 auto` (a centred shell drifts
  away from a viewport-anchored rail on wide screens). The cap moved to
  `.cs-shell`, which is what it was protecting.
- Both headers pull back across the rail's gutter with a negative margin.
- `.cs-shell`'s height maths went `100vh - 92px` → `100vh - 84px` (the
  topbar's 14px top margin is gone; 8px of its own remains).

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

- `npx tsc --noEmit` — clean.
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

## Still open

- **`support-notify` takes a caller-supplied `to`** (`const to = (body?.to as
  string) || …`, inherited from the Express route it was ported from). Nothing
  in the app passes it, but any authenticated user could, which makes AREN's
  own Zoho mailbox able to send arbitrary HTML to an arbitrary address. Worth
  closing: drop the override, or allow-list it. Not changed here because it is
  pre-existing behaviour and removing it silently could break an unseen caller.
- **The send is slow.** In the live test the button sat on "Sending…" for more
  than six seconds — a Zoho token exchange plus the send, on a cold function
  instance. Honest, but long. Worth either warming the token or saying
  something after ~4s.
