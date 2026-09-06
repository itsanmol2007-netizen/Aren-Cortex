# Session handoff — 2026-09-06b (Communication V1 + Doctor Overview)

**Temporary, self-replacing. REWRITE THE WHOLE FILE.**

## The headline: rule 13 was satisfied, for the first time in four sessions

A live browser was available this session. The app was signed into with a real
account (SK Pandey, Anmol Homeo Clinics), every new screen was rendered,
measured with `getBoundingClientRect()`, and clicked. **Four real bugs came out
of that pass that no amount of `tsc` would ever have found** — three of them
pre-existing, one of them mine. They are listed below because each is a worked
example of exactly what rule 13 exists to catch.

Getting a browser to work here needed one trick worth writing down: **Chromium
cannot complete a TLS handshake through this sandbox's egress relay** (the
tunnel closes mid-ClientHello; `curl` and Node are fine). The way through is a
throwaway Node relay on `127.0.0.1:8787` that forwards to Supabase via
`undici`'s `ProxyAgent` with `NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt`,
then running Vite with `VITE_SUPABASE_URL=http://127.0.0.1:8787`. Nothing in
the repo depends on it; it lives in the scratchpad. Do this again rather than
shipping unseen.

### The four bugs rendering found

1. **`GlobalLogoTrigger` painted a duplicate header over the real one.** Its
   `active` prop is computed from STATE, not from "something is on screen",
   and `patientModalOpen` starts life `true` (`useConsultSession`). With
   Overview as the new landing page that flag is still true while the modal
   renders nothing — so the ghost pill AND a second "AREN Consult / Front desk
   queue" label drew at z-index 9998 directly over the header's title,
   measured at x=129.6, exactly on top of "Overview". Fixed by adding
   `!isFeaturePage` to `active` (App.tsx): a feature page's real header is
   right there and reachable, so the ghost is never needed on one.
2. **`HourBars` drew nothing, on this page AND on Parallax's Overview.** Every
   column measured 0px tall. The row's `items-end` switches off the default
   stretch, so each column was sized to its content — and the bar inside is a
   PERCENTAGE of that content, resolving against an indefinite height and
   collapsing. Fixed with `h-full` on the column (`features/admin/charts.tsx`).
   **This has presumably been broken since the chart was written.**
3. **`server/` refused to start without `WHATSAPP_VERIFY_TOKEN`.** Correct when
   the webhook was all `server/` did; wrong now that the messaging service and
   the credit ledger live there too, whose entire point is working before a
   Meta account exists. Now warns loudly and skips mounting the webhook.
4. **Every authenticated API route hung with no response when the server was
   misconfigured.** Express 4 does not catch a rejection from an async
   handler — `getSupabase()` threw and `curl` sat there with no status and no
   body. `server/auth.js` now answers every request.

## What shipped

### 1. AREN Communication V1 (the whole spec)

Read `docs/context/communication-credits.md` — it is the stable pocket for
this and covers the five load-bearing decisions. In brief:

- **Credit ledger**, not a balance column. Append-only, balance is
  `sum(delta)`, `LOW_CREDITS`/`EXHAUSTED` is a view CASE and never a stored
  flag. Every doctor got their 5,000 (all 16 backfilled, verified).
- **Per-doctor wallet**, granted by a trigger on `doctors`.
- **A doctor can ask for credits and can never grant them** — no client INSERT
  policy on the ledger at all; `credit_recharge_requests` pins `status` to
  `pending` in its `WITH CHECK`.
- **Debit → send → refund on failure.** A failure is two visible ledger rows,
  not a number that quietly went back up.
- **Provider adapter** in AREN's vocabulary (purpose/patient/clinic), with
  `meta.js` and a `mock.js` that runs the full path.
- **One email service** (`server/email/`), events not prose, to
  support@arenode.com via Zoho's India DC.
- **The page**: credits strip, appointment requests, activity + conversation,
  Buy Credits modal, coming-soon line. No composer, no send button — both
  argued in the file header.
- **Prescriptions send on consult completion** (`useConsultLifecycle`),
  fire-and-forget, skipped silently when the patient has no phone.

The migration is `supabase/migrations/20260906_messaging_credits.sql` and **is
already applied to the live project** (four `apply_migration` calls; the file
is the record).

### 2. The doctor's Overview page

`src/features/overview/DoctorOverviewPage.tsx`, now the initial `activePage`
in both workspaces. Large "Start consult" door (reusing
`handleSidebarConsult`, not a second path), then a doctor-scoped summary of
Parallax's overview: four KPI tiles with deltas, trend chart, a new segmented
`Donut` ("who you saw"), busiest hours.

**No bench comparison, ever, and multi-doctor changes nothing about this
page.** A landing page that ranks a doctor against their colleagues is a
scoreboard they see every sign-in and cannot opt out of. `BenchRow[]` stays
exclusive to Parallax.

`fetchClinicAnalytics` gained an optional `{ doctorId }` scope rather than
growing a parallel `fetchDoctorAnalytics` — the IST arithmetic and the
previous-period split are the load-bearing parts and would drift in a second
copy. Note the two reads that are deliberately NOT scoped (the doctor roster,
and `revenueTracked`) and one that changes meaning (new patients becomes
"registered in this window AND seen by me").

### 3. The blank-canvas bug — closed structurally, not by another timing guess

The previous handoff's top item. Overview is a **feature page**, so
`activePage !== null` on every cold start and reload: the state that produced
a blank dark header no longer exists on that path. Pressing "Start consult"
sets `activePage` to null, which is exactly when the queue-sheet invariant
should take over — verified live (Start consult → queue sheet opens locked,
ghost trigger reachable, sidebar → Overview works).

**The temporary `blankCanvasDetected` debug box in App.tsx is still there, on
purpose.** It never fired during this session's live pass. Remove it once a
human has used the app for a day and confirms — removing it now on my own
reasoning is the exact move the last handoff warned against.

## Verified live, and what wasn't

Signed in, rendered, measured and clicked: Overview (real data — 17 seen, 6 Rx,
₹472), Communication (5,000 credits, all three tabs), Buy Credits modal
(packages from the DB, "takes you to 5,900"), the full recharge loop
(request → `approve_credit_recharge` → 5,900 → **reverted, DB left exactly as
found**: 16 doctors, all at 5,000, zero requests), Start consult → queue sheet
→ sidebar → back, Patients (search box correctly empty).

**Not exercised**: an actual message send end to end (needs
`SUPABASE_SERVICE_ROLE_KEY`, which is not in this checkout — `server/.env` is
gitignored), so the debit/refund path has been proven by SQL and by reading,
not by a send. `/api/messaging/health` answers `{provider:"mock"}` through the
Vite proxy, and the auth guards return proper JSON. Also unexercised: the
"View patient" seed from Communication (this clinic has no sent messages yet).

## Next, in the order I would do it

1. **Run one real send.** Put `SUPABASE_SERVICE_ROLE_KEY` in `server/.env`,
   `npm run server`, complete a consult for a patient with a phone, and watch
   `MESSAGE_DEBIT` appear. Then set `MESSAGING_MOCK_FAILURE_RATE=0.5` and watch
   `REFUND` appear next to it. That is the one path nothing else can prove.
2. **The follow-up trigger.** `sendFollowUp` works; nothing schedules it.
   Until something does, the Templates tab's "sent automatically" is a promise.
3. **An admin queue for recharges.** `approve_credit_recharge()` is called by
   hand today. Parallax is its natural home.
4. **Submit the two Meta templates** (`aren_prescription`, `aren_follow_up`).
   Leave `MESSAGING_PROVIDER` unset until they are approved.

## Traps worth knowing before you edit

- **These files are CRLF on Windows.** A node script matching on `\n` silently
  does nothing there. (This container's checkout is LF — do not "fix" that.)
- **`base.css` is unlayered and beats Tailwind utilities**, same for every
  legacy sheet in `styles/`. Use an inline style or restructure the DOM.
- **A CSS `animation` and a `transition` on the same property fight.**
- **Supabase MCP refuses multi-statement writes** in `execute_sql`; split them.
  `apply_migration` handles a whole file fine.
- **A generic wrapper around a supabase-js query builder defeats its type
  inference outright** (TS2589, hit while adding the doctor scope). Spell each
  conditional `.eq()` out on its own line.
- **Chromium cannot reach the internet through this sandbox's relay.** See the
  top of this file for the way around it.
