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
(`/app/admin`, clinic-wide, admin/owner only) and not Clinic Control (the
embedded summarised admin view) — **there is no bench comparison here,
ever**, and multi-doctor changes nothing about the page. A landing page that
ranks a doctor against colleagues is a scoreboard they cannot opt out of.

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
  | Collected | `PaymentDetailsModal` — totals, transactions, and the consultation-fee editor at the bottom |
  | New patients | nothing — no deeper screen it would open onto that Patients Seen doesn't already cover |

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
  nobody has confirmed a multi-bench admin actually wants the reports link
  from here rather than from Clinic Control.
- The reference mock's auto-generated "Tip: usually busiest 5–7 PM" bottom
  bar was deliberately NOT built — it would need synthesizing a claimed RANGE
  from one busiest-hour bucket, which is inventing a fact this page doesn't
  actually have.
