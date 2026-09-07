# Session handoff — 2026-09-08, round 3 (staff creation moved onto Supabase Edge Functions)

**Temporary, self-replacing. REWRITE THE WHOLE FILE.**

Continues the same day's round 2 (staff creation, Overview's "Team"
consolidation, chart→CSV — all still accurate below, unchanged). This round
is architectural, prompted by Anmol asking how the whole thing deploys: he
wants to stop running a separate Express process for anything that can
instead be a Supabase Edge Function ("even further addition where we need
some more server functions... could directly label supabase"). Staff
creation moved first, because it needed zero external credentials to do —
Supabase injects `SUPABASE_SERVICE_ROLE_KEY` into every Edge Function for
free, which is exactly the thing blocking Anmol locally (`server/.env` was
never actually filled in).

**This one WAS verified live** — not just `tsc`/`build`, an actual deployed
function called over real HTTPS. See "How F was verified" below for exactly
what that means and what it doesn't cover.

## What shipped, in order

### F (revised) — staff creation is now a Supabase Edge Function, not an Express route

`server/admin/routes.js` is gone. In its place:
`supabase/functions/admin-staff/index.ts`, deployed to project
`ieimvjprtltancxapuzg` (deploy tool: Supabase MCP's `deploy_edge_function`;
this repo's copy is the source of truth — a code change here needs a
redeploy, MCP or `supabase functions deploy admin-staff`, to take effect).

Same logic as the Express version, ported to Deno:
- `callerClient` (anon key + the caller's own Authorization header) resolves
  who's calling THROUGH RLS — reading their own `users` row is the entire
  authorization check, not a formality before one. Same two-client split
  `attachment-upload-url` (the other Edge Function already in this project)
  uses, for its own equivalent reason.
- `adminClient` (service-role key — auto-injected, nothing to configure) does
  the two things RLS forbids from the browser: `auth.admin.createUser`, and
  writing `users`/`doctors` rows under an id that isn't the caller's own.
- `phoneToStaffAuthEmail` (`<digits>@aren-staff.internal`) is duplicated
  byte-for-byte between here and `src/lib/auth.ts`, same reason
  `phoneToAuthEmail` duplicates the landing repo's copy — no shared import
  path between a Deno function and this Vite app.

Frontend: `src/lib/db/staff.ts`'s `createStaffMember` now calls
`supabase.functions.invoke("admin-staff", {body})` instead of `postAuthed`
against `/api/admin/staff` — the SDK attaches the caller's session
automatically, no manual bearer header. Error bodies are unwrapped via
`FunctionsHttpError.context.json()` so the toast still shows the function's
actual message ("phone already in use"), not a bare HTTP status.

**`server/`'s remaining job** is WhatsApp + Zoho email only now — both still
need real external credentials (Meta, Zoho) only Anmol holds, so migrating
THEM is next, not done. `server/index.js`'s header comment says so. Don't
delete `server/` — it's still load-bearing for messaging.

### How F was verified (read this before trusting "it works")

Built a fully disposable test fixture directly against the live project via
Supabase MCP, exercised the deployed function over real HTTPS, then deleted
every trace:
1. Signed up two throwaway Supabase Auth users via the public `/auth/v1/signup`
   endpoint (real accounts, `@example.com` addresses).
2. Inserted one disposable `hospitals` row and two `users` rows via
   `execute_sql` (one `role='admin'`, one `role='reception'`) — this is the
   ONE step a real admin can't do themselves; it stands in for "an admin
   already exists at a clinic," which is always true in production.
3. Called the deployed function over `curl` as each test identity:
   - Admin, valid input → **200**, real account created, real `users` row
     with the right hospital/phone/role, AND signed in successfully as
     `<phone>@aren-staff.internal` with the password it was given —
     confirming the account is genuinely usable, not just recorded.
   - No `Authorization` header → **401** (rejected by Supabase's gateway
     before the function even ran, since `verify_jwt: true`).
   - Reception (non-admin, non-`is_clinic_admin`) → **403**.
   - Duplicate phone at the same clinic → **409**.
   - Invalid role → **400**.
   - Checked `function_edge_logs` afterward — five requests, five expected
     status codes, no unhandled exceptions.
4. Deleted everything: both `users` rows the fixture made plus the one the
   function created, the test `hospitals` row, and all three `auth.users`
   rows (identities/sessions/refresh_tokens first, parent row last).
   Re-queried afterward — zero rows left in any of the three tables.

**What this does NOT cover:** the actual React "Add staff" form
(`PeoplePage.tsx`'s `AddStaffForm`) submitting through the real browser UI —
that's still `tsc`/`build`-only verification, same caveat as everything
else this session. The Edge Function itself, independent of the UI in front
of it, is now real, live, tested evidence, not a read-through.

## Carried forward from round 2, unchanged

### E. "Clinic management" renamed to "Team", consolidated to one button

One row (headcount + "Fees" pill, unchanged + "Manage team") replaces a
Doctors-roster-with-per-row-actions block and a separate "request staff"
card in `DoctorOverviewPage.tsx`. "Manage team" opens Parallax's
`PeoplePage` (now carrying the F feature above too) inside a new `xl`
variant of `PracticeModal` (920px/86vh, `practiceModal.css`) — for
embedding a whole page rather than one form or list.

### D. Trend chart → detail list → patient-safe CSV export

Clicking the Patient-flow/Collections chart (or a new "Detail →" link)
opens `TrendDetailModal.tsx`: a day-by-day table reusing `data.series` (no
extra read), plus a separate "Export as CSV" button that DOES fetch on
click — `fetchPatientLedgerRows` (`lib/db/admin.ts`), one row per visit,
`{date, patient name, amount paid}` only, no clinical detail, per Anmol's
explicit ask. `lib/csv.ts` is a tiny quote/escape/join/download helper, not
a dependency.

## Traps worth knowing before you edit (carried forward + new)

- **Two synthetic-email domains for the same phone number**:
  `<digits>@aren.internal` (self-registration) and
  `<digits>@aren-staff.internal` (admin-created). `LoginPage.tsx` tries the
  first, retries the second ONLY on an invalid-credentials rejection. Keep
  that retry if you ever touch sign-in — removing it locks out every
  admin-created account silently.
- **Edge Function secrets**: `SUPABASE_URL`/`SUPABASE_ANON_KEY`/
  `SUPABASE_SERVICE_ROLE_KEY` are injected automatically into every
  function in this project — never set them as function secrets yourself,
  and never assume a NEW function needs `server/.env` at all. Anything
  else (a future WhatsApp/Zoho function) DOES need `supabase secrets set`,
  which only Anmol can do (needs the real Meta/Zoho values).
- **A function code change needs a redeploy to take effect** — editing
  `supabase/functions/admin-staff/index.ts` in this repo does nothing to
  the live function until it's redeployed (MCP `deploy_edge_function` or
  `supabase functions deploy admin-staff`). Unlike the frontend, there's no
  build step that pushes this automatically yet.
- **`doctors.is_clinic_admin` is NOT `users.role`.** Never write `role:
  'admin'` to promote a doctor — they stay `role: 'doctor'` with the flag
  additive.
- **Chromium cannot complete a TLS handshake through this sandbox's agent
  proxy** — `curl`/Node's own `https` DO work through it (this round's
  entire live-verification pass ran on that fact). Don't rediscover this;
  do static/API-level verification and say so.
- **`button:disabled` in this codebase is not decoration-safe** —
  `styles/base.css`'s unlayered rule beats every Tailwind override.
- **`input, select { padding: 0 9px }`**, same file — icon-in-input layouts
  need the Tailwind `!` bang on padding.
- Supabase MCP's `execute_sql` refuses multi-statement writes;
  `apply_migration` handles a whole file fine. Real project id:
  `ieimvjprtltancxapuzg` ("arenode"), org `bzrjwiuvgaflsqojxgou`, **plan:
  free**. Six Edge Functions total now: the five pre-existing
  (`rank-compositions`, `attachment-upload-url`, `attachment-view-url`,
  `attachment-delete`, `attachment-configure-cors`, `visit-gateway`) plus
  this round's `admin-staff`.
- **Free-tier headroom, checked live this round**: DB is 168MB/500MB, but
  142MB of that is the fixed medicine/composition catalogue — real clinical
  data (patients/visits/prescriptions/payments) is under 2MB for 1,723
  visits already recorded. Storage is ~2.7MB/1GB. Auth users: 22/50,000
  MAU. None of this is close to free-tier limits even at 10x current
  clinic count — the thing to actually watch is monthly egress/bandwidth,
  which isn't queryable via SQL (check the Supabase billing dashboard
  directly, not this file).
- `node_modules` starts empty in a fresh container; `npm install` first.

## Next, in the order I'd do it

1. **Get eyes on the "Add staff" form live in a browser** — the Edge
   Function itself is proven; the React form calling it is not.
2. **Migrate WhatsApp + Zoho email off `server/` too**, same pattern —
   needs Anmol to gather the real Meta (`WHATSAPP_ACCESS_TOKEN`,
   `WHATSAPP_APP_SECRET`, `WHATSAPP_PHONE_NUMBER_ID`) and Zoho
   (`ZOHO_CLIENT_ID/SECRET/REFRESH_TOKEN`) values and set them via
   `supabase secrets set` (or the dashboard) — I can't fetch or invent
   these. Once he has them, the port itself is low-risk: `server/`'s only
   external deps are `express`/`dotenv`/`@supabase/supabase-js`, and even
   the webhook's `node:crypto` HMAC check should run unchanged on Deno's
   Node-compat layer.
3. If staff creation is exercised live with a REAL new doctor: their
   `doctors` row's fee/specialization are left null on creation — nudge
   them to set a fee before their first consult (PeoplePage's Benches card
   already shows "Fee not set", this is just a UX polish, not a bug).
4. Carried forward, still open from earlier rounds: SK Pandey's 76-credit
   test state, `RC_2`'s pending recharge, the follow-up-message scheduler,
   real Meta template submission, an admin UI for
   `approve_credit_recharge`.
