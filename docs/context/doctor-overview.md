# The doctor's Overview page

Stable reference pocket. Read this before touching
`src/features/overview/`, or `fetchDoctorPaymentSummary` /
`fetchDoctorVisitRows` / `fetchDoctorPrescriptionRows` in `lib/db/admin.ts`.

Created 2026-09-06 as the new landing page in both workspaces; reworked
2026-09-07 against a reference mock Anmol supplied, and around the principle
**progressive disclosure — a KPI tile is a door, not a dashboard.**

---

## What this is, and what it is deliberately not

It answers "how am I doing", scoped to one doctor. It is not Parallax
(`/app/admin`, clinic-wide, admin/owner only, no `doctors` row) — for a PLAIN
doctor (no admin authority) **there is no bench comparison here, ever**, and
multi-doctor changes nothing about the page. A landing page that ranks a
doctor against colleagues, unconditionally, is a scoreboard they cannot opt
out of.

**2026-09-06 — the admin-doctor layer, and `ClinicControlPage` is gone.**
Anmol: remove the redundant "Clinic Management" page (`ClinicControlPage.tsx`,
"Clinic Control" in the sidebar) entirely; the doctor's Overview absorbs its
job instead of a second page existing to hold it. Read
`docs/context/parallax-admin.md`'s resolver table before touching any of
this — the short version:

- `useAdminAccess().access === "embedded"` now means "this DOCTOR has
  clinic-admin authority", full stop — via `dedicatedAdminCount === 0` (the
  de-facto owner, as before) OR `doctors.is_clinic_admin` (an individually
  flagged doctor-admin, new; several can exist at once). Either fact renders
  the "Clinic management" section at the bottom of this page.
- It stays additive: the KPI tiles, sparklines, patient-flow chart, "Who you
  saw" donut and busiest-hours card above it are the EXACT SAME cards a
  plain doctor sees — an admin doctor's page looks identical until they touch
  the new scope toggle ("Performance: Overall | You | {other doctors}"),
  which re-fetches those same cards for the clinic or a chosen colleague
  instead of adding duplicate cards. Default state (toggle untouched) is
  pixel-identical to the non-admin page.
- "Clinic management" (only rendered for an admin doctor) carries: a
  "Doctors" card — bench roster with each doctor's fee, an admin badge, and a
  contextual "Manage" control (self-guarded, same rule as PeoplePage: an
  admin cannot demote/deactivate themselves) exposing "Make/Remove admin" and
  "Remove / fire" (`updateStaffMember`'s `is_active`); a "Fees" button opening
  the same `FeesModal` Parallax uses; and, only when the clinic has no active
  reception staff, a minimal "Request to add staff" card that emails AREN via
  `notifySupport("support_request", …)` rather than fabricating a staff
  workflow a solo/Cortex clinic has no use for.
- No door into Parallax is offered from here any more (`canOpenFullSuite`
  now only returns true for `dedicated`) — "do not create a separate Parallax
  for them... keep them on the same Overview page, but make the Overview
  richer" (Anmol, 2026-09-06). An admin doctor who needs a Parallax-only
  capability not yet folded in here (medicine catalogue, plan/subscription,
  GST policy) still reaches it via "View Reports" in Quick Actions or a
  direct URL — just never a standing nav item.

## The 2026-09-07 rework

Anmol's brief came with two hard exclusions and one organising idea:

- **No persistent left sidebar, no search bar in the dark header** — both
  belong to the reference mock's OWN chrome. `WorkspaceHeader` stays
  untouched, exactly as every other Cortex page uses it.
- **"Don't add a new card when an existing card can become the entry point
  to that functionality."** Three of the four KPI tiles are DOORS:

  | Tile | Opens |
  |---|---|
  | Patients seen | `ActivityListModal` (visits) |
  | Prescriptions | `ActivityListModal` (prescriptions) |
  | Collected | `PaymentDetailsModal` when revenue tracked; `FeesModal` directly when "Not set up" |
  | New patients | `ActivityListModal` (new registrations) |

  Each tile also carries a `Sparkline` (`features/admin/charts.tsx`) built
  from `data.series`, fixed-pixel and un-measured unlike every OTHER chart in
  that file — it's a small fixed ornament beside a number, not the whole
  card, so there is nothing to measure.

- **The big blue "Start Consult" banner is gone.** Replaced by a compact
  greeting row (`Good {morning|afternoon|evening}, {name}` + today's date/time
  + a pill button) — the door into the consult is still first on the page,
  just no longer the loudest thing on it.

- **Today's Queue** (Consult only — hidden entirely in Cortex, which has no
  front desk to have queued anyone) is a straight READ of App.tsx's own
  `useConsultQueue`, threaded down as props (`queueWaiting`, `queueLoading`,
  `onOpenQueue`, `onStartFromQueueRow`) — never a second poll of "who is
  waiting". Starting a row computes `aheadOfQueue` the same way the queue
  sheet does (`visit.visit_id !== queue.waiting[0]?.visit_id`) so an override
  is still logged when a doctor skips ahead.

- **Quick Actions** are four tiles that each route through machinery the app
  already has (`onNavigate`, `onStartConsult`) — none of them owns a screen.
  The fourth tile is admin-gated: "View Reports" (`navigate("/app/admin/
  reports")`) only when `useAdminAccess().access === "embedded"`; otherwise
  "Manage Practice" (`onNavigate("practice")`), so the tile is never a dead
  end for a doctor with no admin door.

- **`HourBars`** (shared with Parallax's Overview and Clinic Control) gained
  a floating hover tooltip — "N visits / Xam–Yam" — replacing the bare
  `title` attribute. Backward compatible; every existing caller gets it for
  free.

## Two real bugs the rebuild surfaced by actually clicking through

1. **`button:disabled` washes text toward grey**, unfixable with any Tailwind
   text/opacity utility — `styles/base.css` carries an unlayered
   `button:disabled { opacity: … }` rule that wins regardless of source
   order (see `cortex-gotchas.md`). Every KPI tile and activity-list row that
   has nothing to click renders a plain `<div>` instead of a disabled
   `<button>` — sidestepping the cascade fight rather than fighting it.
2. **The Patient Activity modal's own count didn't match the KPI tile it
   opened from** (18 rows vs "17" on the tile) — `fetchDoctorVisitRows`
   wasn't excluding discarded visits, the same rule `fetchClinicAnalytics`
   already states for the headline number. Fixed by filtering `inactive`
   visits out of the list, same as the tile.

## Money: Payment Details + the fee editor

`fetchDoctorPaymentSummary(hospitalId, doctorId, range)` — scoped to the SAME
range the KPI tile is showing, not "all time". One nested-select query
(`visit_payments … visits ( patients ( id, name ) )`), same pattern
`fetchPendingPayments` already uses.

The consultation-fee editor lives at the BOTTOM of this same modal, not as a
fifth Overview card — reuses `fetchFeeSettings`/`updateDoctorFees` from
`lib/db/admin.ts` (Parallax's own fee machinery), filtered to this one
doctor. Only the consultation fee is editable here; the follow-up fee is
carried through unchanged (parallax-admin.md's own "Open": *"Follow-up fee
has no rule for what counts as a follow-up"* — not solved by this page).

**Trap already paid for once, worth not re-discovering:** the money input's
`pl-[26px]` padding-left utility (to clear a ₹ icon) lost outright to
`base.css`'s unlayered `input, select { padding: 0 9px }` — the icon sat on
top of the fee's first digit ("₹00" for 400, though the real value was
correctly "400" the whole time). Fixed with the Tailwind v4 trailing `!`
(`pl-[26px]!`), the same dodge `FeesModal`'s `MoneyField` already uses.

## Open

- Quick Actions' "View Reports" / "Manage Practice" split is a first pass —
  `ClinicControlPage` (the "from Clinic Control" alternative this note used
  to weigh against) no longer exists, so the reports link's only other
  candidate now is Parallax's own Reports page, which is what it opens.
- The reference mock's auto-generated "Tip: usually busiest 5–7 PM" bottom
  bar was deliberately NOT built — it would need synthesizing a claimed RANGE
  from one busiest-hour bucket, which is inventing a fact this page doesn't
  actually have.
- **Who can grant the FIRST `doctors.is_clinic_admin` at a clinic with zero
  admins of any kind (no dedicated admin, no doctor already flagged) is not a
  self-service flow.** Anmol, 2026-09-06, when asked: treat it like `owner`
  today — a manual/operational action, not a product feature — until asked
  for otherwise. Once ONE admin exists (dedicated or doctor), they can
  promote/demote from here (or Parallax's People page) without AREN's help.
- The "Doctors" card's "Manage" actions are deliberately narrower than
  Parallax's People page: fee, admin status, activate/deactivate — no full
  role reassignment (to reception/lab/etc.), which stays Parallax-only.
