# AREN Parallax — the admin workspace

Stable reference pocket. Read this before touching anything under
`src/features/admin/`, `src/lib/db/admin.ts`, or the admin-access resolver.

Created 2026-09-04, when the clinic-owner surface stopped being one page and
became its own workspace.

---

## What Parallax is

The third workspace, beside Cortex (doctor does own intake) and Consult (front
desk prepares the encounter). Parallax answers a question neither of them can:
**"how is my clinic doing, who works here, and what are we charging?"**

It is **not** a clinical surface. It never shows a chart, a diagnosis, a
prescription's contents, or any observable. It shows counts, money, people and
configuration. Patient **names** appear in exactly one place — the outstanding-
payments list on Money — because "who still owes ₹400" is unusable as a list of
visit ids (Anmol, 2026-09-04: names and money yes, clinical detail no).

## The name lives in one constant

`src/lib/workspace/mode.ts` → `ADMIN_BRAND`. That file's header already claimed
to be "the only place either product name is written down"; the admin product
joins it rather than starting a second convention. Renaming Parallax is that
object and nothing else.

"Parallax": measuring a subject by comparing it from two viewpoints. The whole
page compares — this period against the one before, this bench against that
one. Alternate on record if it is ever changed: **Azimuth**.

`SHAPE_LABEL` in the same file holds the human words for clinic shapes. There
is **no four-tier subscription ladder** — AREN Polaris remains the only plan
(Anmol, 2026-09-04). These are internal vocabulary and display strings.

| Stored `clinic_mode` | Shown |
|---|---|
| `solo` | Solo practice |
| `solo_reception` | Single bench, front desk |
| `multi_doctor` | Multi-bench clinic |
| *(any) + ≥1 admin user* | **Managed clinic** |

`managed` is **derived, never stored** — a clinic is managed the day it hires
an office manager and unmanaged the day that person leaves, with no migration
in between. That is why it cannot be a fourth enum value.

## Who gets which surface — the resolver

`src/lib/workspace/adminAccess.ts` is **pure** (no React, no Supabase) so the
rule can be read and tested on its own. `hooks/useAdminAccess.ts` supplies its
two inputs.

| Signed-in role | Clinic has admin/owner users? | `access` | What they get |
|---|---|---|---|
| `admin` / `owner` | — | `dedicated` | Parallax is their home at sign-in |
| `doctor` | **zero** | `embedded` | "Clinic Control" in their clinical sidebar **+ a door into Parallax** |
| `doctor` | one or more | `none` | Nothing — that job belongs to someone |
| `reception` | — | `none` | Nothing |

**This is the correction to the first attempt.** Admin Control was briefly an
unconditional row in the Cortex sidebar; a doctor at a clinic with a real
office manager got a nav row about money and staff, mid-consultation. The
condition is what earns it a place at all.

The owner-doctor reaches the full suite **on their own session** — no second
login, no role change. `/app/admin` admits `doctor` for exactly this reason,
and the rail shows "Back to my workspace" instead of a sign-out because they
are a guest there. That allowance comes back out the moment real `owner`
accounts exist and a junior doctor should not be reading clinic-wide money.

## The pages

`/app/admin` mounts `AdminShell` (rail + `<Outlet/>`); every page below is a
nested route rendering a body only — the shell owns the dark header.

| Route | File | Does |
|---|---|---|
| `/app/admin` | `pages/OverviewPage.tsx` | KPIs with period deltas, trend chart, busiest hours, bench table |
| `reports` | `pages/ReportsPage.tsx` | The four drill-down tables. `?tab=days\|money\|hours\|benches` |
| `people` | `pages/PeoplePage.tsx` | Staff roles + activate/deactivate; bench load |
| `money` | `pages/MoneyPage.tsx` | Collections breakdown, method split, outstanding, fees |
| `catalogue` | `pages/CataloguePage.tsx` | Clinic labs, salt-request queue (read-only), clinic brands |
| `clinic` | `pages/ClinicSettingsPage.tsx` | Clinic info + hours, via Cortex's own modals |
| `plan` | `pages/PlanPage.tsx` | Subscription facts; every action writes a *request* |

Plus `pages/ClinicControlPage.tsx` — the embedded summarised view, rendered
inside Cortex/Consult at `activePage === "admin"`, **not** a Parallax route.

## The rail and the scroll model

`AdminShell.tsx`. Collapsible, copied deliberately from
`frontdesk/components/NavRail.tsx`: 58px icon column at rest, 206px expanded,
toggled by the header logo, folded by any click outside it, remembered in
`localStorage` under `aren.parallax.nav`.

**The shell is exactly one viewport tall and never scrolls itself**
(`h-screen overflow-hidden flex-col`). The header is `shrink-0`, the rail is
`h-full` in a `min-h-0` row so it stays put, and `<main>` is
`min-h-0 overflow-hidden`. Each page then owns its own scroll through its inner
`flex-1 overflow-y-auto` container — which only works because every level above
it is height-bounded. A page whose wrapper is missing `min-h-0` will scroll the
whole shell and drag the rail off-screen; that was the 2026-09-05 bug.

Long lists WITHIN a page (Outstanding on Money, staff on People, every list on
Catalogue) get their own `max-h-[Npx] overflow-y-auto` container with
`flex-none` rows, so the card stays a fixed size and the list scrolls inside
it rather than the page growing without bound.

Both rails in this product animate identically — width interpolates, icons
stay anchored, labels fade and slide 8px.

## Hard rules this workspace obeys

1. **No composition minting.** Standing rule 22 holds for admins with no
   exception. Catalogue shows the `composition_requests` queue read-only. But
   an admin CAN add a **brand** against an existing salt (2026-09-05,
   "the catalogue section is useless... make it usable like a doctor section"):
   `AddMedicineModal.tsx` → `addClinicMedicine` → the `add_medicine` RPC,
   which was widened so a caller with role admin/owner and no `doctors` row can
   use it (the created `medicines` row carries a NULL `created_by_doctor_id` —
   an admin is not the prescriber). The salt is still forced through
   `searchCompositions`, never typed, so rule 22 needs no special case in the
   page. `searchCompositions` is a plain `ilike` on `compositions`, NOT the
   consult screen's `search_intents` RPC — the admin needs an id, not ranking.
   Anmol, 2026-09-04: *"if you start adding random compositions from there it
   will fuck up our rank."* A salt reaches the catalogue through
   compositions → gates → rules, run by a human.
2. **Clinic labs rank at the BOTTOM of a doctor's list.** `clinic_preferred_labs`
   is a separate table from `doctor_preferred_labs`, never a flag on it — a
   house endorsement and a doctor's own pick are different claims. "Apply to
   all doctors" is explicit, skips what a doctor already has, and **never sets
   `is_default`**, so a doctor's own default survives.
3. **Money is never rewritten from here.** "Mark paid" changes a status. It
   cannot change an amount — a recorded fee is what the patient was quoted.
   Front desk is under the same rule from the other side: it can discount but
   has no control that sets a base fee, and every action it takes lands in
   `visit_payment_events`, shown on Money as **Fee activity**. That table has
   a SELECT and an INSERT policy and deliberately no UPDATE or DELETE — a trail
   a clinic can rewrite is decoration.
4. **Nobody edits their own subscription.** Plan actions write
   `subscription_requests` rows.
5. **An admin cannot deactivate or demote themselves.** Reversible in
   principle, irreversible *from here* — the surface that could undo it is the
   one they just lost.
6. **All queries live in `lib/db/admin.ts`** (standing rule 1). The pages do no
   querying.

## Analytics shape

`fetchClinicAnalytics(hospitalId, range)` is the single read. It fetches ONE
window covering both the selected range and the equally-long range before it,
then splits in memory — two round trips per table would double latency to
compute a delta over rows already in hand.

- Every boundary is stamped `+05:30` explicitly. IST has no DST so a literal
  offset is exact. `new Date().toISOString()` is wrong here: until 05:30 IST
  the UTC date is still yesterday.
- `Metric.changePct` is **null** when the previous period was zero. A rise from
  nothing has no percentage; the UI renders "no prior data", never "+100%".
- Discarded visits count toward nothing in headline numbers (not work the
  clinic did) but *are* a column in Reports, so an owner can notice a bench
  abandoning a fifth of its queue.
- `revenueTracked: false` when no payment has ever been recorded, so money
  panels say "Not set up" rather than claiming the clinic earned ₹0.

## Charts

`features/admin/charts.tsx` — hand-rolled inline SVG, **no charting library**,
deliberately. Every chart library ships its own palette and type scale to fight
forever, plus ~90KB on a bundle already flagged at 1.75MB. Four components
(`TrendChart`, `HourBars`, `ShareBar`, `Ring`) read the same `--cs-*` tokens
every card does.

They **measure their container** (one ResizeObserver) and render at real pixel
dimensions rather than using `preserveAspectRatio="none"`, which distorts every
stroke and circle.

Every chart has a **Detail** door into the matching Reports table. A chart says
what shape a period was; a table says what happened on the 14th. Neither
replaces the other.

## Tables added by this work

| Table | Holds |
|---|---|
| `visit_payments` | One row per visit's payment. `total` is a **generated column** (`fee - discount + gst_amount`) so a receipt and a day's total cannot disagree. Fee is *copied* at collection, never referenced — raising a fee must not rewrite history. |
| `clinic_preferred_labs` | Clinic-endorsed diagnostic centres. See rule 2 above. |
| `visit_payment_events` | Append-only audit of every desk fee action — who discounted what, when, on whose visit. Actor name and role are denormalised so a receptionist who leaves is still named in last quarter's trail. |
| `doctors.consultation_fee` / `follow_up_fee` | Nullable. **NULL means "not set", never "free"** — an explicit `0` is a free consultation and the two must stay distinguishable. |
| `hospitals.gst_enabled` / `gst_percent` / `allow_discount` / `currency` | GST defaults **off** — most small Indian clinics are below the registration threshold and must not print tax they do not owe. |

## Open

- **Follow-up fee has no rule for what counts as a follow-up.** The column
  exists; nothing picks it automatically. Needs a decision (within N days? same
  complaint?) before front desk can apply it.
- **Front-desk collection is not built.** `visit_payments` is written by the
  seed and by Parallax's "mark paid" only. The desk-side flow (show fee,
  discount box, GST line, write the row) is the next piece.
- **Bench × day matrix** is not in Reports yet — only bench totals.
