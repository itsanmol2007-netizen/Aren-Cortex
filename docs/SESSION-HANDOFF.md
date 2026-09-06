# Session handoff — 2026-09-06 (Overview absorbs admin; WhatsApp template redesigned)

**Temporary, self-replacing. REWRITE THE WHOLE FILE.**

## What shipped, in order

### 1. WhatsApp "Prescription Ready" template — new shape

Anmol supplied the real copy: header "Prescription Ready" (static text, not
a document attachment any more), a body with patient/doctor/clinic name, and
a "View Prescription" button. `server/whatsapp/client.js`'s
`sendPrescriptionTemplate` and `server/messaging/providers/meta.js` rebuilt
to match — the button is a dynamic-URL button pointing straight at the
prescription's own link (no hosted app to route a quick-reply through yet,
per Anmol: *"unless whatsapp is wired, simply open that exact prescription
preview"*). Full detail incl. the no-PDF-yet fallback's structural mismatch:
`docs/context/communication-credits.md` §5b.

### 2. "Clinic Management" removed; Overview grows an admin-doctor layer

The whole point of this round. Anmol's brief: stop having Overview → a
separate Admin Dashboard → a separate Clinic Management page; a doctor with
admin authority should get "Normal Overview + additional clinic visibility +
additional authority", nothing more.

- **`ClinicControlPage.tsx` is deleted.** Its content (KPIs, fee card, bench
  performance, the "Full Parallax" door) is gone as a page; the KPI/fee/bench
  substance now lives inside `DoctorOverviewPage.tsx`'s new "Clinic
  management" section. "Clinic Control" is gone from the sidebar too.
- **New concept: a doctor can be a clinic admin without stopping being a
  doctor.** `doctors.is_clinic_admin` (migration
  `20260906_doctor_clinic_admin.sql`), additive to `users.role` — deliberately
  NOT a role change, so nothing keyed on `role === 'doctor'` (RLS, the
  clinical sidebar, the consult workspace) needed touching. Several doctors
  at one clinic can carry the flag at once. `resolveAdminAccess()` in
  `lib/workspace/adminAccess.ts` now takes this as a third input; `embedded`
  means "this doctor has admin authority" (via zero dedicated admins OR this
  flag) and **no longer implies a door into Parallax** — only `dedicated`
  (a non-doctor admin/owner) has Parallax as home now.
- **Overview's existing cards get a scope toggle, not duplicates.** An admin
  doctor sees "Performance: Overall | You | {other doctors}" above the SAME
  KPI tiles/chart/donut/busiest-hours cards a plain doctor has — picking a
  scope re-fetches `fetchClinicAnalytics` with a different (or no) `doctorId`
  filter. Untouched, the page is pixel-identical to a plain doctor's.
- **New "Doctors" bench-management card**, admin-only: roster with fee, an
  admin badge, and a per-row "Manage" control (self-guarded, same rule as
  Parallax's People page) exposing Make/Remove admin and Remove/fire
  (`is_active`). A "Fees" button opens the same `FeesModal` Parallax uses.
- **Minimal "Request to add staff"**, shown only when the clinic has no
  active reception staff — sends `notifySupport("support_request", …)`
  rather than fabricating a staff-management workflow a solo/Cortex clinic
  has no use for (Anmol was explicit: no invented workflow here).
- **Parallax's People page** gained the same Make/Remove admin toggle per
  bench row (`setDoctorClinicAdmin`), so a dedicated admin can also grant the
  flag — this is how the FIRST doctor-admin at a multi-doctor clinic with a
  real office manager gets flagged, without a new bootstrap mechanism.
- **Bootstrapping the very first admin at a clinic with NONE at all** (no
  dedicated admin, no doctor flagged) is deliberately NOT self-service —
  Anmol, when asked: treat it like `owner` today, a manual/operational
  action, not a product feature.
- Parallax itself (routes, pages, People/Money/Catalogue/Plan/Clinic) is
  **untouched** — it remains the full authoritative surface for a non-doctor
  admin/manager, per the brief's "do not force the doctor-admin into
  Parallax."

Full detail: `docs/context/doctor-overview.md` (rewritten sections) and
`docs/context/parallax-admin.md`'s resolver table (rewritten).

**Verified:** `npx tsc -b --noEmit` clean across the whole project after
every change in this round (App.tsx, Sidebar/SidebarNav, adminAccess.ts,
useAdminAccess.ts, useClinicalIdentity.ts, auth.ts, lib/db/admin.ts,
DoctorOverviewPage.tsx, PeoplePage.tsx). **Not exercised live** — no browser
verification this round (no relay/credentials set up in this container); the
next session should click through as an admin-doctor (toggle the scope,
promote/demote a colleague, confirm the self-guard) before trusting the UI
beyond the type-checker.

## Next, in the order I'd do it

1. **Consult "Create New Patient" flow** (front desk's `PatientLauncher` +
   `CreateVisitModal` + `PaymentRail`) — Anmol's second ask this round, not
   yet started when this file was written:
   - A much more prominent "Patient '{name}' not found → Create New Patient"
     empty state than today's plain "Register new patient «name»" row.
   - Preserve the searched name into the New Patient wizard's Patient Name
     field (this part may already work — `CreateVisitModal` already takes
     `prefillName` and seeds `name` from it; verify, don't rebuild).
   - Lock Paid/Not Paid until name+phone+age+gender are filled for a NEW
     patient; already-selected existing patients unlock it immediately.
   - Remove the separate "Save & Create Visit" footer button — Paid/Not Paid
     (`PaymentRail`'s "Collect ₹X" / "Mark as unpaid") becomes the
     completion action itself, for both flows. Keep SOME completion control
     for the one edge case `PaymentRail` has no buttons at all (no fee
     configured for the assigned doctor).
2. Live-verify the whole admin-doctor layer (see above) — nobody has clicked
   through it yet.
3. Decide whether SK Pandey should stay at 76 credits (previous session's
   test data) or be restored; `RC_2` (their pending recharge) is still open.
4. Everything from the previous handoff's "Next" is still open and untouched
   this round: the follow-up-message scheduler, real Meta template
   submission (now with a settled shape to submit, see §1 above), an admin UI
   for `approve_credit_recharge`.

## Traps worth knowing before you edit (carried forward + this round's)

- **`doctors.is_clinic_admin` is NOT `users.role`.** Never write `role:
  'admin'` to promote a doctor — that routes them to Parallax as their HOME
  and is a different, larger change nobody asked for. The column to write is
  `doctors.is_clinic_admin`, via `setDoctorClinicAdmin()`.
- **`button:disabled` in this codebase is not decoration-safe.**
  `styles/base.css`'s unlayered rule beats every Tailwind override; render a
  plain element instead of a disabled interactive one whenever "disabled"
  really means "nothing to click".
- **Same file, `input, select { padding: 0 9px }`** — any icon-in-input
  layout needs the Tailwind `!` bang on padding, not a bare utility.
- Chromium in this sandbox cannot complete a TLS handshake through the agent
  proxy; prior sessions built a local Node relay (via `undici`'s
  `ProxyAgent`) to get around it for live verification — not set up in this
  container, which is why this round's changes are type-checked but not
  browser-verified.
- Supabase MCP's `execute_sql` refuses multi-statement writes; `apply_migration`
  handles a whole file fine.
- `node_modules` was empty at the start of this session (a fresh container) —
  `npm install` populated it; don't assume a checkout already has it.
