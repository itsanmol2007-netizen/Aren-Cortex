# Master Control — build plan & product direction

**Written 2026-09-10 with Anmol.** This is the *what to build and in what
order* for Master Control. The companion file `ADMIN-PANEL-INTEGRATION.md`
(same folder) is the *what the database looks like* reference — read both when
building; this one first for scope, that one for table shapes / RLS / RPCs.

Master Control is a **separate codebase** (service_role key can never ship in
a browser bundle — see `ADMIN-PANEL-INTEGRATION.md` §0). Build it in a new
repo against the same Supabase project (`ieimvjprtltancxapuzg`).

---

## 0. What it is

The operations console for ARENODE. One question it must answer:

> *"Can I operate, maintain and troubleshoot every AREN clinic from here?"*

Not a CRM, not HR/payroll, not marketing. If a screen doesn't help operate,
maintain or troubleshoot a live clinic, it doesn't belong in the MVP.

**Operators:** just Anmol, now and for the next few months. Build the data
model so multiple actors and a reduced-permission "support" tier are possible
later, but the auth itself can be single-user simple for v1. Nobody else gets
this authority level for a good while.

---

## 1. Architecture & stack

**The whole platform's server logic already lives in Supabase Edge Functions
(Deno) — Master Control follows that, it does not introduce a second backend.**

- **Backend = Supabase Edge Functions**, same as `admin-staff`, `messaging-send`,
  `rx-preview`, `whatsapp-webhook`. The **service_role** key and the **AWS S3**
  keys are *already* Supabase function secrets — nothing new to provision.
  Each admin capability is one function (`admin-clinics`, `admin-deals`,
  `admin-medicines`, `admin-synapse`, …) or a few grouped ones. They run with
  service_role, so RLS is irrelevant — **validate every input in the function
  itself**; service_role is the opposite of a safety net.
- **Frontend = a static SPA on Cloudflare Pages.** Cloudflare Pages is *just
  static file hosting* here — **no Cloudflare Workers, no Cloudflare
  functions.** Anmol picked Cloudflare for the free-tier headroom; that
  benefit is the CDN + static hosting, and none of the Workers complexity is
  needed because the backend is Supabase. Framework: a plain **Vite + React
  SPA** (matches Cortex; the design DNA in §15 assumes it). It ships only a
  session token — never any secret.
- **Auth:** the panel is **not a Supabase Auth surface** (`ADMIN-PANEL-INTEGRATION.md`
  §3, Option 2). Its own login:
  - `admin_users` table (new): `id`, `email`, `name`, `role`
    (`'owner' | 'support'` — only `owner` in v1), `password_hash` (argon2id or
    bcrypt), `is_active`, `created_at`, `last_login_at`. `role` gates screens
    later; everyone is `owner` for now.
  - An `admin-auth` edge function verifies email + password against
    `admin_users` and returns a short-lived **signed session JWT** (HS256,
    signed with a new `ADMIN_SESSION_SECRET` function secret). Every other
    admin function verifies that JWT on the way in. No Supabase Auth, no RLS.
  - Put the deployed Pages site behind **Cloudflare Access** (email-gated,
    free for small teams) as a second wall in front of the app login.

---

## 2. The three levers — decoupled

Onboarding is **not** a funnel. Three independent switches that line up in the
happy path but each stands alone:

| Lever | Where | Meaning |
|---|---|---|
| **Access** | `hospitals.is_active` | Can this clinic log into Cortex |
| **Subscription** | `subscriptions` row | Which plan, valid until when, seats |
| **The sale** | new `deals` / `deal_payments` | Money in, who collected it, proof |

This lets you express: a comped pilot (access on, no subscription); a
suspended-for-non-payment clinic (subscription exists, access off); a clinic
paid but not yet switched on while its catalogue is set up.

**New clinics are created OFF.** Registration self-service already told the
doctor "your access will be verified" — so they arrive here as **pending
access**, you review, you approve. Approval = flip `is_active` + fire the
welcome/access email (§8).

---

## 3. MVP cut line

Build these seven. Everything else is deferred (§9).

1. **Clinics** — list, pending-access queue, approve/suspend/reactivate,
   edit clinic-behaviour fields, assign/edit subscription.
2. **Deals & payments** — record a sale, record payment(s) with proof +
   verified-by, fire the doctor confirmation email.
3. **Credit recharge** — approval queue with the same payment trail.
4. **Medicine & composition editor** — search → card → edit the full chain;
   add several at once; add a composition and wire it to intents.
5. **Audit log** — `admin_audit` written on every mutation.
6. **Clinic issues** — reported-bug list + detail.
7. **Synapse inspection** — read-only run view + orphan health-check.

---

## 4. Clinics — access & lifecycle

### Registration is NOT here
Self-service registration lives on the landing page
(`arenode.com/register` — already built, iterated, in good shape; it carries
image-compression models and upload flows that have no business in this repo).
Master Control has a **"Register a clinic" button that just links out** to that
URL. Nothing is created from this panel.

### Pending-access queue
The landing site inserts `hospitals` rows with `is_active = false` (confirm
this is what actually happens — schema default is `true` today; a trigger or
the registration edge function may already force `false`, and if not, that's a
one-line change on the landing side, not here).

Queue screen: every `is_active = false` hospital, newest first. Row shows
clinic name, city, the owner `users` row, the `doctors` row(s), contact,
`clinic_mode`, `specialty_profile`, registered-at. Detail view → **Approve**
(→ `is_active = true`, welcome email, `admin_audit` entry) or leave it
(spam signups just sit; no rejection workflow in v1).

### Ongoing clinic management
- **Suspend / reactivate** — toggle `is_active`. Suspend reason is a free-text
  note stored on the audit entry. The login flow already signs a suspended
  session out with "account disabled" — no Cortex change needed.
- **Per-account disable** — same toggle against `users.is_active` (offboard one
  doctor without killing the clinic).
- **Edit clinic-behaviour fields** — `clinic_mode`
  (`solo | solo_reception | multi_doctor`) and `specialty_profile` as
  **dropdowns, not free text** — they drive which nav/profile Cortex boots
  and must match the DB CHECK + `specialtyProfile.ts` (`ADMIN-PANEL-INTEGRATION.md`
  §4, rule 19). Also editable: name, city, phone, address, accent colour,
  `is_branded`.
- **Cross-account device view** — "someone else is in my account" support
  case: list/revoke another user's `user_devices` (service_role only — RLS is
  per-user by design, `ADMIN-PANEL-INTEGRATION.md` §4b).

### Plans & pricing (set with Anmol 2026-09-10)

| Plan | For | Price (INR, **tax-inclusive**) |
|---|---|---|
| **AREN Polaris** (`code='solo'`) | single-doctor clinic — receptionist or not | **₹18,000** / term |
| *(second plan, not yet in `plans`)* | multi-doctor clinic | **₹25,000** / term — the ceiling rate |

- Prices are **all-inclusive** — GST and everything is baked into the number,
  there is no separate tax line on a deal.
- **Discounts are expected**, especially early (founding partners, launch
  offers) — the deal screen's `discount` / `offer` fields are the normal case,
  not an exception.
- `plans.price_amount` is `NULL` today — set Polaris to `18000` and add the
  multi-doctor plan row (`code='multi'` or similar, `price_amount = 25000`)
  when Master Control's first deal needs them. `plans.code` stays the only
  stable key; nothing branches on `name` or price.

### Subscription
`subscriptions` assignment is Master Control's job by construction — no role
can do it through the anon key (`ADMIN-PANEL-INTEGRATION.md` §4a).

- **Assign** — pick a plan (`plans`, Polaris today; multi-doctor plan to be
  added — see the table above), status, `started_at`, `current_period_end`,
  `seats`.
- **Term** — defaults to the plan's `billing_interval`. **Overridable** for a
  founding-partner deal: a custom span at a special price (e.g. 24 months).
  The "standard term" option is selected by default; the custom span is one
  field, not a separate flow. `is_founding = true` marks these.
- **Extend / renew** — new period → a new deal (§5), one deal per period.
- **Cancel** — set status; `cancel_at_period_end` for graceful end. A partial
  unique index enforces one live (`active`/`trialing`) row per clinic;
  cancelled/expired rows stay as history.
- **`subscription_requests`** — the doctor-facing "upgrade / add seats /
  invoice / cancel" asks (already exists, clinic can file + read own, nobody
  can resolve). This screen is the worklist: open requests oldest-first,
  resolve via service_role once the thing asked for is actually done.

---

## 5. Deals, payments & offers — the money trail

**Entirely greenfield.** `visit_payments` is *patient → clinic* consult fees —
unrelated. New tables (migration in the Cortex Supabase project):

```
deals
  id, hospital_id, plan_id,
  kind            -- 'new' | 'renewal' | 'upgrade'
  term_months     -- default = plan interval; override for founding deals
  base_price      -- snapshot from plans.price_amount at deal time
  offer_id        -- nullable
  offer_snapshot  -- jsonb: {code,label,kind,value} frozen at apply time
  discount        -- resolved rupee amount
  final_price
  currency default 'INR'
  status          -- 'draft' | 'committed' | 'refunded'
  salesperson_id  -- nullable (see commission note)
  commission_rate -- nullable snapshot; % of final_price
  created_by      -- admin_users.id
  subscription_id -- the subscription this deal paid for
  note, created_at, committed_at

deal_payments      -- one OR MORE per deal (installments are real)
  id, deal_id, amount, method       -- 'cash' | 'upi' | 'bank' | 'cheque' | 'other'
  paid_at
  reference          -- UTR / txn id / free text
  proof_url          -- nullable; screenshot in a storage bucket
  recorded_by        -- admin_users.id (who typed it)
  verified_by        -- admin_users.id (who confirmed the money landed)
  verified_at
  note, created_at

offers
  id, code unique, label,
  kind             -- 'percent' | 'flat' | 'free_months'
  value, valid_from, valid_to, is_active, created_at
```

### Flow
1. **Create deal** — pick clinic + plan → `base_price` auto-fills from the
   plan → apply an offer and/or a manual discount → `final_price` computes.
   Founding deal: set `term_months`. Save as `draft`.
2. **Record payment(s)** — against the deal: amount, method, `paid_at`,
   `reference`, optional proof upload. `recorded_by` = current operator.
3. **Verify** — a separate action sets `verified_by` + `verified_at` (even
   when it's the same person: "I checked the bank on this date" is the trail).
   `sum(verified deal_payments.amount) >= final_price` → deal auto-moves to
   `committed`.
4. **Confirmation email** (§8) fires on each `deal_payments` insert:
   *"We've recorded ₹X received on DATE via METHOD against your AREN Polaris
   subscription. Reply if anything looks wrong."* Independent of any Cortex
   screen — a standalone trust receipt.

### Commission — designed-for, NOT built
No salespeople today. `deals.salesperson_id` + `deals.commission_rate` exist
in the schema so nothing needs migrating later. **Do not build** the
`commissions` table, the verification hold, or the weekly payout ledger —
that's a night's work when a real salesperson exists. Note it here and move on.

---

## 6. Messaging credits — recharge approval

`credit_recharge_requests` already exists (clinic files a package request,
`status` flows open → decided; `decided_by`, `ledger_id` columns present).
**No admin side is built** (earlier handoffs flag `approve_credit_recharge`
as missing UI). Live demand — this is MVP.

Screen: open recharge requests, oldest first. Each shows clinic, doctor,
package, credits, amount, `balance_at_request`. **Approve** → capture the same
payment-trail fields as a deal payment (method, `reference`, `proof_url`,
`verified_by`) → an RPC credits `messaging_credit_ledger` and stamps
`decided_by` / `decided_at` / `ledger_id` on the request. **Decline** → status
+ `decision_note`. Every action → `admin_audit`.

---

## 7. Medicine & composition editor

Build the **interactive editor now**. Bulk CSV import is a **later phase**
(§9) — Anmol has a rough importer in a separate repo (`arennode`); the
parsing method (manufacturer / brand name / strength → derive composition)
needs its own design pass.

### Catalogue shape (`ADMIN-PANEL-INTEGRATION.md` §5)
`compositions` (~284 molecules, the thing the engine ranks) ← `medicine_composition_map`
(the join; a combination product has >1 row) → `medicines` (213k+, the thing a
doctor prescribes; `hospital_id` NULL = global, set = one clinic's own add).

### Edit a medicine
- **Search-as-you-type** on medicine name. `medicines.name` has **no search
  index** — `.ilike()` on 213k rows gets killed by the statement timeout
  (`ADMIN-PANEL-INTEGRATION.md` §5). Two options for the builder:
  (a) add a `pg_trgm` GIN index on `medicines.name` + `compositions.name`
  (a migration in the Cortex project — the cleaner long-term answer, also
  unblocks fuzzy match for the future importer), or
  (b) a dedicated search RPC / prefix-limited query. **(a) is recommended.**
- Results render as **cards** below the search box.
- **Click a card → full edit**: `name`, `manufacturer`, `strength_mg`,
  `route` (dosage form — CHECKed set: `tablet, capsule, syrup, suspension,
  drops, injection, topical, cream, ointment, gel, inhalation, inhaler`), and
  **the composition mapping** — add/remove `medicine_composition_map` rows,
  set `is_primary`. A combination product is edited here as its list of
  compositions.
- **Promote a clinic's private medicine to global**: `hospital_id = NULL`.

### Add medicines
- **Several at a time** (7–8), each row: name + manufacturer + strength +
  route + composition picker (autocomplete against `compositions`). Commit as
  one transaction.
- Master Control writes `medicines` + `medicine_composition_map` **directly
  via service_role** — it does **not** go through the `add_medicine` RPC
  (that's the hospital-scoped, composition-can't-be-created path for doctors
  inside a consult).
- **After ANY medicine/composition/mapping write:**
  `refresh materialized view concurrently mv_composition_brand;` — nothing
  does this automatically and a stale view serves old data silently
  (`ADMIN-PANEL-INTEGRATION.md` §5). `CONCURRENTLY` needs the existing unique
  index on `(composition_id, medicine_id)` — don't drop it.

### Add a composition — and wire it
A new `compositions` row that isn't connected to the engine **ranks nothing,
silently**. Adding a composition therefore has a second step, same philosophy
as §8's Synapse work:
- Create the `compositions` row (`name`, `specialization_scope`).
- **Wire it to intents**: create an `intents` row (`type='medicine'`,
  `ref_table='compositions'`, `ref_id=<new id>`) and the `signal_intent_rules`
  linking the signals it should rank against, with a `weight` in the tiering
  band (medicine 0.55–0.85, `ADMIN-PANEL-INTEGRATION.md` §6) and
  `reviewed_by` / `rationale` filled.
- **`composition_requests`** — the doctor-facing "this salt is missing" queue
  (already exists, `status='pending'`, hospital-scoped). This screen is its
  admin side: review a request → turn it into the composition + intent +
  rules above, or decline. It is explicitly *not* an auto-path to a rankable
  composition (a person reviews every one).
- **`doctor_free_terms`** — read-only view: terms doctors keep typing that
  aren't in the catalogue, with `use_count`. A prioritised backlog for what to
  add next. Don't edit it, just surface it.
- After wiring, run the **orphan check** (§8) — a rule naming a signal or
  intent that doesn't exist ranks nothing.

---

## 8. Synapse inspection — read-only

**Build:** visibility, not authoring.

- **Run view** — filter `decision_log` by clinic / date / outcome; show the
  inputs (context), the ranked outputs, any errors, engine version.
  **Dependency:** verify `decision_log` (15 cols, ~1400 rows, actively
  written) actually carries engine version + full inputs + error/failed-run
  rows. If it doesn't, *Synapse itself* needs richer run tracing before this
  screen is meaningful — the panel can only show what's logged. Flag this to
  Anmol as a finding when the builder gets here.
- **Orphan health-check** — a standing screen, not a one-off query:
  `signal_intent_rules` / `intents` / `intent_guards` / `measurement_rules`
  naming a `signal_id` or `intent_id` that doesn't exist. These fail silently
  (no error, just absent content). Also: intents with no rules, signals with
  no observables feeding them.

**Do NOT build for MVP:** a form to edit `signal_intent_rules` / `intent_guards`
/ `intents`. Editing the knowledge base through a UI is rare and
high-blast-radius — keep it SQL/migration with review. The one exception is
the narrow "add a composition + its rules" flow in §7, which is a guided,
audited path for a specific, common need.

Cortex's own Settings has a clinic-scoped `System Health` screen already
(`src/features/settings/health/model.ts`) — prior art for the *shape* of a
"what's working" view, not something to extend (it can't do the cross-hospital
orphan check).

---

## 9. Audit log

`admin_audit` (new), appended by the panel's backend on **every** mutation:

```
admin_audit
  id, actor_id            -- admin_users.id
  action                  -- 'clinic.approve' | 'subscription.assign' |
                          --   'deal.payment.record' | 'medicine.edit' | ...
  target_type, target_id
  before, after           -- jsonb
  note
  at
```

This is "who verified this ₹18,000 / changed that subscription / edited this
medicine" answered structurally, not per-feature. One helper, called from
every write path. Non-negotiable.

---

## 10. Clinic issues

`clinic_issues` (new):

```
id, hospital_id, reported_by     -- users.id or an admin who logged it
title, detail, severity          -- 'low' | 'normal' | 'high' | 'critical'
status                           -- 'open' | 'investigating' | 'resolved' | 'wont_fix'
evidence_urls text[]             -- screenshots / logs in a bucket
resolution, resolved_by, resolved_at
created_at, updated_at
```

List (filter by clinic / severity / status) + detail panel. Don't rebuild log
aggregation — for deep failures, link out to Supabase's own edge-function /
Postgres logs.

---

## 11. Email — transactional

Infrastructure already exists: `ZOHO_*` secrets are on the Supabase project,
and `support-notify` sends through Zoho. Master Control's emails go through a
**shared function with a template map** — extend `support-notify` or add an
`admin-notify` edge function / Worker route. Don't overengineer (Anmol's call).

Events for v1:
- **Welcome / access granted** — on clinic approval (§4).
- **Payment recorded** — the standalone receipt on every `deal_payments`
  insert (§5).
- **Subscription activated / renewed** — on assign/extend (§4).
- Later: renewal reminders, past-due notices.

All logged to `support_email_log` (already exists).

---

## 12. New tables — summary for the migration

One migration in the Cortex Supabase project (`apply_migration`, reviewed like
any schema change — not a change in either app's repo):

- `admin_users` — panel login identities (§1)
- `deals`, `deal_payments`, `offers` — the money trail (§5)
- `admin_audit` — action log (§9)
- `clinic_issues` — bug reports (§10)
- `pg_trgm` GIN indexes on `medicines.name` + `compositions.name` (§7)
- Confirm/settle the `hospitals.is_active` default (should be `false` for new
  registrations — fix on the landing side if it isn't)

Not now: `commissions` + payout batches (§5), any CSV-import staging tables
(§7).

---

## 13. Deferred — "designed-for, not built"

- **Commission payout ledger** — `salesperson_id` / `commission_rate` fields
  ship; the table and weekly-batch UI wait for a real salesperson.
- **Bulk CSV medicine import** — the interactive editor covers the common
  case; the importer needs its own design pass on the parsing method
  (manufacturer / brand / strength → derive composition). Anmol has a rough
  version in the `arennode` repo to reference.
- **Synapse rule editing UI** — SQL/migration with review until there's a
  real need for a form.
- **Self-serve registration rejection workflow** — spam signups just sit.
- **System-log aggregation** — link out to Supabase's own logs.
- **Reduced-permission "support" operator tier** — `admin_users.role` supports
  it; the screen-gating waits until a second operator exists.

---

## 14. Resolved & remaining

**Resolved 2026-09-10:**

- **Pricing** — Polaris (single-doctor) ₹18,000 tax-inclusive; Constellation (multi-doctor)
  plan ₹25,000 tax-inclusive (add the `plans` row). All-inclusive, no separate
  tax line. Discounts are normal, especially early. (§4)
- **Proof storage** — **AWS S3**, not Supabase Storage. The keys already exist
  as Supabase function secrets (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`,
  `AWS_REGION`, `AWS_BUCKET_NAME` — plus a separate `ATTACHMENTS_S3_*` set the
  patient-attachment flow uses). An `admin-deals` edge function signs an S3
  PUT URL for the upload and stores the resulting key in `deal_payments.proof_url`;
  reads go through a signed GET URL from the same function. Reuse the pattern
  in `supabase/functions/attachment-upload-url` / `attachment-view-url`.
- **`decision_log` shape** (checked live) — 15 cols, one row **per ranked
  intent per run**, grouped by `context_key`. It **has**: `ruleset_version`
  (engine version), `signal_context` (input signals), `intent_id` + `score` +
  `rank` + `rank_position`, `outcome` + `was_shown` + `chosen_medicine_id`.
  It **does not have** any error / failed-run capture — a run that throws or
  produces nothing simply writes no rows. So §8's *happy-path* run view
  ("what ranked for this visit, what the doctor did") is buildable from
  `decision_log` today; the *"failed runs / operational issues"* half of the
  spec needs Synapse to emit an error trace first (a new
  `synapse_run_errors` table, or structured error logging from the ranking
  edge function). Build the run view now; flag the error-trace gap as a
  Synapse-side follow-up.

**Still open:**

- **`hospitals.is_active` on registration** — does the landing site's
  registration flow already insert `is_active = false`? (Schema default is
  `true`; 19 hospitals exist, 13 active.) If not, it's a one-line change on
  the landing side, not here. Confirm before building the pending-access queue.

---

## 15. Visual design

Anmol will live in this tool for years. It must be **simple and beautiful**,
in **Cortex's visual language** — the calm blue / violet palette, hairline
structure, high information density with low visual density.

**Carry the Cortex Design DNA over.** Copy `docs/cortex-design-dna/` from the
Cortex repo into the new repo and follow it — with one scoping note:

- **The *look* transfers in full**: the seven-colour semantic palette
  (`--cs-blue #1268e8` = action, `--cs-violet #7c3aed` = the engine's reading,
  `--cs-teal`, `--cs-rose`, `--cs-amber`, `--cs-red`, `--cs-green`), the
  neutrals (`--cs-ink` / `--cs-muted` / `--cs-label` / `--cs-faint`,
  `--cs-line` / `--cs-line-strong`, `--cs-page` / `--cs-card`), the shared
  spacing scale (`--cs-s1…--cs-s5`), `.cs-card` panel structure, restrained
  motion (shared spring config, `useReducedMotion()`), typography (short
  labels + tooltips, never a sentence of UI prose), empty states (one true
  line + the family SVG), and **rule 13 — render it, measure it, click it**.
  Tailwind utilities reading those tokens through arbitrary values, same as
  new Cortex pages.
- **The *structural doctrine* does NOT transfer.** Cortex's
  `aren-cortex-ui-doctrine.md` says "shaped like a consult, not a form" and
  "never give one component the whole horizontal canvas" — those are about a
  clinical workspace. Master Control **is** legitimately forms and tables and
  full-width lists. Keep the surface (colour, type, spacing, calm, hairlines);
  drop the "not a form" rule.
- **Login screen** — match Cortex's `LoginPage` treatment (the landing-page
  identity: paper / ink / restrained accent, `lg-*` scoped classes). It's the
  same product.
- **Palette anchor for a tool this data-dense:** `--cs-blue` for primary
  actions, `--cs-violet` for anything Synapse-related, `--cs-green` for
  confirmed / paid / verified, `--cs-amber` for pending / needs-verification,
  `--cs-red` for suspended / declined / critical. No eighth colour.

---

## 16. How to build this — new session setup

Build it in a **fresh session** (this planning session carries a lot of
unrelated Cortex context). Concretely:

1. **Make the repo.** `X:\Aren-Master-Control` (or wherever), `git init`,
   `npm create vite@latest . -- --template react-ts`, add Tailwind.
2. **Copy in the references** so the new session is self-contained:
   - `docs/admin-panel/MASTER-CONTROL-PLAN.md` (this file)
   - `docs/admin-panel/ADMIN-PANEL-INTEGRATION.md`
   - the whole `docs/cortex-design-dna/` folder
   - `src/features/auth/LoginPage.tsx` from Cortex as a visual reference
3. **Open a new Claude Code session in that folder** and paste the kickoff
   prompt below.
4. The build session's **first job** is the one-migration in the *Cortex*
   Supabase project (§12) — `admin_users`, `deals`, `deal_payments`, `offers`,
   `admin_audit`, `clinic_issues`, `pg_trgm` indexes — via `apply_migration`,
   reviewed like any schema change.
5. Then screens in the §3 order. `admin-auth` edge function + Cloudflare
   Access first, then Clinics, then Deals.

### Kickoff prompt for the new session

> You're building **Master Control** — the ARENODE operations console. It's a
> new, separate codebase (a Vite + React + TS SPA on Cloudflare Pages;
> backend = Supabase Edge Functions against project `ieimvjprtltancxapuzg`,
> holding the service_role key).
>
> Read these first, in order:
> - `MASTER-CONTROL-PLAN.md` — scope, the 7-screen MVP, new tables, the
>   architecture (Supabase Edge Functions for all server logic, **no
>   Cloudflare Workers**), and the resolved decisions.
> - `ADMIN-PANEL-INTEGRATION.md` — the live database reference (tables, RLS,
>   RPCs, the medicine catalogue shape, the Synapse pipeline).
> - `cortex-design-dna/` — the visual language to follow (see PLAN §15 for
>   what transfers and what doesn't — the look does, the "not a form"
>   doctrine doesn't).
>
> Don't reuse Cortex's `src/lib/db/*` — those are written against the anon key
> and a doctor's RLS context. Write new, small edge functions against a
> service_role client, and validate every input inside the function.
>
> Start by proposing the one migration from PLAN §12 for my approval, then
> build in the PLAN §3 order: `admin-auth` + login, then Clinics
> (pending-access queue → approve → `is_active` + welcome email), then Deals.
> Confirm the open item in PLAN §14 (does landing registration insert
> `is_active = false`?) before building the pending-access queue.
