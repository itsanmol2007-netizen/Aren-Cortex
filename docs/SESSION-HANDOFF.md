# Session handoff — 2026-09-08, round 2 (staff creation, Team consolidation, chart→CSV)

**Temporary, self-replacing. REWRITE THE WHOLE FILE.**

Follow-up to the same day's earlier round (four live-use bugs, the
Communication chat-preview fix, and the PatientModal/PatientPaymentRail
payment-lock parity fix — Anmol confirmed "Now it's working" on all of
that). This round is a batch of three optimization/feature requests he gave
in one long message. **Nothing in this round has been clicked in a
browser** — same sandbox limitation as before (Chromium can't complete a
TLS handshake through this proxy; see "Traps" below). Verification here is
`npx tsc -b --noEmit` (clean) and a full `vite build` (clean) after every
change, plus reading the real Supabase schema directly via the Supabase MCP
tools (`list_tables`/`execute_sql` against project `ieimvjprtltancxapuzg`)
rather than guessing column names. That is real signal, but it is not the
same as a human clicking through it — say so if asked, don't imply more.

## What shipped, in order

### F. Add staff from inside the app, with a built-in audit trail

Anmol wanted a clinic admin to create a real sign-in (name, phone, password,
role) for a new doctor/receptionist/admin, instead of that person
registering themselves. `users`' RLS policy only allows `INSERT ... WITH
CHECK id = auth.uid()`, so this had to cross into `server/` for the
service-role key — new `server/admin/routes.js`, `POST /api/admin/staff`,
authorized to an owner/admin role OR a doctor with `doctors.is_clinic_admin
= true` (re-checked server-side, never trusted from the request).

The interesting part is the audit trail he asked for: "don't use the same
[email] ending as the landing page... we'll just look at the internal email
and find out, oh, it was created by doctors... or not us directly" — with
no new database column. Self-registration's synthetic Supabase Auth address
is `<digits>@aren.internal` (`phoneToAuthEmail`, `src/lib/auth.ts` — must
stay byte-identical to the landing repo's copy). This route mints
`<digits>@aren-staff.internal` instead (`phoneToStaffAuthEmail`, duplicated
byte-for-byte in both `src/lib/auth.ts` and `server/admin/routes.js` — the
two have no shared import path, same reason `phoneToAuthEmail` itself is a
duplicate of the landing repo's copy).

**The catch, and how it's handled:** the login screen only has a phone
number to work with — it cannot know up front which domain an account was
minted under. `LoginPage.tsx` tries `phoneToAuthEmail` first and, ONLY on a
rejection that specifically means invalid credentials (never on a
network/timeout failure), retries once against `phoneToStaffAuthEmail`
before showing "phone and password don't match." Two independent Supabase
Auth identities can exist for the same 10 digits (one self-registered, one
admin-created) with different passwords — each domain is checked
independently, so this is not a conflict, just two doors.

New UI: `PeoplePage.tsx`'s "People" card header has an "Add staff" toggle
opening `AddStaffForm` inline (name, phone, password with a show/hide
toggle, role select). Since `PeoplePage` is embedded in TWO places (standing
Parallax, and now Overview's new Team modal — see E), this one addition
covers both automatically.

`lib/db/messaging.ts`'s `postAuthed` helper (the one existing seam into
`server/`) was extracted to `src/lib/apiClient.ts` so this second
server-backed feature doesn't fork it. `lib/db/staff.ts` gained
`createStaffMember`.

**Not testable here:** `server/admin/routes.js` needs `SUPABASE_SERVICE_ROLE_KEY`
and a running `npm run server` to actually exercise — checked with
`node --check` (syntax only) and against the REAL `users`/`doctors` column
list (verified live via Supabase MCP, not guessed). The login retry logic
is read-through-verified against `LoginPage.tsx`'s existing error-shape
handling, not exercised against a real second-domain account.

### E. "Clinic management" renamed to "Team", consolidated to one button

Anmol named the old label a problem in its own right (colliding with the
existing "Clinic" page) and asked for "just one button beside doctors...
manage all the staffs including doctors, their fees, and their admin
thing... assign a new user as admin too from the same part." The section in
`DoctorOverviewPage.tsx` used to be a Doctors roster with its own per-row
"Manage" → admin-toggle/deactivate actions, plus a separate "request staff"
card that only fired an email to AREN. Both are now gone, replaced by one
row (headcount + the existing "Fees" pill, unchanged, + "Manage team") that
opens Parallax's `PeoplePage` — already the richer surface asked for,
INCLUDING the new "Add staff" form from F — inside a new `xl` variant of
`PracticeModal` (920px/86vh, for embedding a whole page rather than one
form or list; `practiceModal.css`).

`roster` (the doctor list + count) is KEPT as page state — the admin-doctor
scope toggle above this section still needs doctor names and the
two-bench-minimum check, both un-ranged reads unrelated to the removed UI.

### D. Trend chart → detail list → patient-safe CSV export

"Whenever you're creating a graph, make the user click on that graph...
show the list of all the collections... also an option of exporting that
thing as a CSV" — referencing Parallax's own `DetailLink` (chart →
`/app/admin/reports?tab=...`) pattern. A doctor (admin or not) can't land on
`/app/admin`, so this is a modal (`TrendDetailModal.tsx`), not a route.

Clicking the chart (or a new "Detail →" link beside the Patients/Money
toggle) opens a day-by-day table for whichever metric is active — reusing
`data.series`, the exact scoped rows already fetched to draw the chart, so
opening it costs no extra read. The CSV button is separate and DOES fetch
on click: a new, deliberately narrower query,
`fetchPatientLedgerRows` (`lib/db/admin.ts`) — one row per visit in the
window, `{date, patient name, amount paid}` only. Anmol was explicit this
must exclude clinical detail: "just like this patient came into this
clinic on this date, paid this much amount... not their actual clinical
details which are sensitive." A tiny generic CSV helper (`lib/csv.ts`,
quote/escape/join/download) backs it — not worth a dependency.

## Traps worth knowing before you edit (carried forward)

- **Chromium cannot complete a TLS handshake through this sandbox's agent
  proxy.** `curl`/Node's own `https` DO work through it. Don't rediscover
  this from scratch; ask whether a working relay exists outside this repo
  first, or do static verification and say so upfront.
- **`doctors.is_clinic_admin` is NOT `users.role`.** Never write `role:
  'admin'` to promote a doctor — they stay `role: 'doctor'` with the flag
  additive. The new staff route checks BOTH (`role === 'admin'/'owner'` OR
  `is_clinic_admin`) for exactly this reason.
- **Two synthetic-email domains now exist for the same phone number**:
  `<digits>@aren.internal` (self-registration, landing repo) and
  `<digits>@aren-staff.internal` (admin-created, this round). If you ever
  touch `LoginPage.tsx`'s sign-in flow again, keep the retry — removing it
  silently locks out every admin-created account.
- **`button:disabled` in this codebase is not decoration-safe** —
  `styles/base.css`'s unlayered rule beats every Tailwind override.
- **`input, select { padding: 0 9px }`**, same file — icon-in-input layouts
  need the Tailwind `!` bang on padding.
- Supabase MCP's `execute_sql` refuses multi-statement writes;
  `apply_migration` handles a whole file fine. Real project id this round:
  `ieimvjprtltancxapuzg` ("arenode").
- `node_modules` starts empty in a fresh container; `npm install` first.

## Next, in the order I'd do it

1. **Get eyes on this live**, all three items above — none have been
   clicked, same caveat as every round before this one.
2. If staff creation is exercised live: check the phone-already-in-use
   conflict message reads sensibly, and that a newly created doctor account
   actually reaches Cortex (their `doctors` row's other fields — fee,
   specialization — are left null/unset on creation; PeoplePage's Benches
   card already handles "Fee not set" but a brand-new doctor should
   probably be nudged toward setting one before their first consult).
3. Carried forward, still open from earlier rounds: SK Pandey's 76-credit
   test state, `RC_2`'s pending recharge, the follow-up-message scheduler,
   real Meta template submission, an admin UI for
   `approve_credit_recharge`.
