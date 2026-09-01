# Master Control (admin panel) — integration reference

Written 2026-08-29 for building the admin/master-control panel as a
**separate codebase** against the same Supabase project Cortex/Front
Desk use. This file is the handoff: what tables exist, what already
half-works, what's missing, and how to wire auth safely.

> **Updated 2026-09-01.** Three tables were added since the original
> write-up (`doctors.email`, `user_devices`, `subscription_requests`),
> and the subscription tables (`plans`, `plan_entitlements`,
> `subscriptions`) went from schema-only to actually carrying live
> content and two founding subscriptions. None of this changes the
> core argument in §0/§2 — if anything it adds a fourth genuinely new
> bucket-B surface (subscription assignment, §4a) and a table that
> is the FIRST clean exception to "no role can write across accounts"
> (`user_devices`, §4b). Everything marked **[2026-09-01]** below is
> new; everything else is as it was on 2026-08-29 and still verified
> live against `pg_policies` as of this update.

---

## 0. Separate codebase — yes, and here's the concrete reason why

Not just "for safety" in the abstract. The actual reason: **the
operations you're describing (activate a clinic, delete/edit any
medicine, edit ranking/intent rules) cannot be done through the anon
key the doctor app uses at all** — see §2. They require the Supabase
**service_role key**, which bypasses Row Level Security entirely. That
key must never ship inside a browser bundle a doctor or receptionist
could open dev tools on. Cortex's `.env` deliberately commits only the
anon key (rule 21 in the codebase's standing rules) — the service_role
key has no business anywhere near that repo, its build output, or its
git history. A separate repo/deploy target is what keeps that key out
of the wrong bundle, not a style preference.

---

## 1. The Supabase project

One project, already live — `arenode` (project ref `ieimvjprtltancxapuzg`,
region `ap-south-1`, Postgres 17). Same project for Cortex, Front Desk,
the landing/registration site, and this new admin panel — there is no
separate database to provision.

```ts
import { createClient } from '@supabase/supabase-js'

// Admin panel needs its OWN env vars — do not copy Cortex's .env file.
// SUPABASE_URL: same value as Cortex's VITE_SUPABASE_URL.
// SUPABASE_SERVICE_ROLE_KEY: from Supabase dashboard → Project Settings →
//   API → service_role (secret) key. NEVER prefix this with VITE_/NEXT_PUBLIC_/
//   anything that reaches the browser. Server-side only.
export const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } } // this client is never a logged-in user
)
```

Recommended shape: a small server (Next.js API routes / a couple of
Supabase Edge Functions / any thin backend) holds `supabaseAdmin` and
is the only thing that ever sees the service_role key. The admin
panel's frontend never imports it directly, the same way Cortex's
frontend never sees anything but the anon key.

---

## 2. Why this can't just reuse the doctor app's anon-key pattern

Checked live against the database (`pg_policies`), not assumed. RLS is
**on** for every table below. Two very different situations exist side
by side:

**A. Tables where an `admin`/`owner`-role user already has a working
write policy** (via `current_user_is_admin()`, defined as
`role IN ('owner','admin')` — see §3):

`compositions`, `medicine_composition_map`, `symptoms`, `tests`,
`tags`, `panels`, `findings`, `composition_dosage_defaults`,
`composition_coprescription_hints`, `composition_tag_map`,
`symptom_tag_map`, `finding_tag_map`, `test_tag_map`, `test_panel_map`,
`symptom_cluster_test_hints`, `signal_finding_suggestions`,
`coprescription_promotions`, `clinical_snapshots`, `snapshot_findings`,
`snapshot_symptoms`, `synapse_import_log`.

These are legacy v1 content tables mostly (`symptoms`/`findings`/`tests`
predate the `observables`/`intents` v2 catalogue) — an admin-role user
authenticated through ordinary Supabase Auth CAN write these today.

**B. Tables with no write policy for anyone — not even `admin`/`owner`:**

- `hospitals` — only `hospital_isolation` (ALL, scoped to your own
  hospital) + an INSERT policy for registration. **No role can flip
  another clinic's `is_active` through the anon/authenticated key.**
  This is exactly the manual-flip gap in `aren-test-accounts.md`.
- `users`, `doctors`, `medicines` — same story: only
  `hospital_isolation`, scoped to `current_user_hospital_id()`. An
  admin-role user is still walled into their own hospital for these.
- `signal_intent_rules`, `intent_guards`, `intents`, `intent_classes`,
  `intent_class_map`, `observables`, `observable_signals`,
  `measurement_rules`, `signals` — **read-only for everyone**
  (`synapse_read_all`: `SELECT` where `auth.uid() IS NOT NULL`). There
  is currently **no INSERT/UPDATE/DELETE policy at all** on the core
  Synapse rule/ranking tables. Today these are only ever written via
  direct SQL (Supabase SQL editor / migrations), never through the app.
- **[2026-09-01]** `plans`, `plan_entitlements` — `SELECT` only, for any
  authenticated user (catalogue is meant to be world-readable inside
  the app so Settings can show plan content). No write path for anyone.
  Renaming the placeholder plan, editing its highlights/copy, or adding
  a second plan all require service_role or a new `admin_write` policy
  (§7) — there is no in-app "edit plan" surface today, deliberately.
- **[2026-09-01]** `subscriptions` — `SELECT` only, scoped to the
  owning clinic (`subscriptions_read_own`). **No role, including
  `admin`/`owner` on that clinic's own account, can assign, extend or
  cancel a subscription through the anon/authenticated key.** This was
  deliberate at write time, not an oversight: a clinic must not be able
  to grant itself a longer subscription by editing its own row. Every
  subscription so far (two, both founding) was written via direct SQL.
  This is the cleanest bucket-B case in the schema — assigning plans is
  Master Control's job by construction, not a gap waiting to be filled
  by a looser policy.

So: medicine CRUD across hospitals, clinic activation, touching
Synapse's ranking/rule tables, and now subscription assignment / plan
content editing are **all in bucket B** — the service_role key (or new
RLS policies granting `current_user_is_admin()` broader scope — see §7)
is not an optional convenience for this tool, it's the only way any of
its core job gets done at all.

`current_user_is_admin()` and `current_user_hospital_id()` are both
`SECURITY DEFINER` SQL functions — they run as the function owner, not
the caller, which is how they're allowed to read `users` from inside a
policy on `users` itself without infinite-recursing.

---

## 3. Auth — two real options, pick one

The `users.role` CHECK constraint (verified live) already allows:
`'owner' | 'admin' | 'doctor' | 'reception' | 'lab' | 'pharmacist'`.
So `admin`/`owner` roles already exist in the schema — they're just not
used by anything yet (no UI reads or sets them beyond the
`current_user_is_admin()` checks in bucket A above).

**Option 1 — real Supabase Auth users with `role = 'admin'`/`'owner'`**
Same login mechanics as Cortex (`docs/Login Screen Implementation.md`):
phone→`{digits}@aren.internal`, `supabase.auth.signInWithPassword`. But
an admin's `users` row would need a **real `hospital_id`** (`NOT NULL`
on that table today) even though a cross-clinic admin conceptually
doesn't belong to one clinic — either relax that NOT NULL, or accept a
"home" hospital row that's cosmetic. Then your backend, after verifying
the session, uses the service_role client for the actual bucket-B
writes (the admin's own role never gets them via RLS anyway per §2), or
you add new admin-scoped RLS policies (§7) and let the admin's own
authenticated session do it directly.

> **[2026-09-01] One correction to this option, learned the hard way in
> Cortex itself this round:** if an admin login ever needs to DISPLAY an
> email address anywhere in the admin UI, it must be a real address a
> person owns — never `{digits}@aren.internal` read back out of
> `auth.users`. That synthetic address is a login artifact of phone-based
> auth (see §4's `doctors.email` note); showing it publishes the
> underlying phone number, and offering to "change" it would rewrite the
> login identity `phoneToAuthEmail()` derives and lock the account out.
> This bit Cortex's own Settings page and was fixed 2026-09-01 — worth
> not repeating in Master Control if Option 1 is the path taken.

**Option 2 (recommended, simpler) — the admin panel is not a Supabase
Auth surface at all.** It's an internal tool with its own login
(env-var password, a small `admins` table you create, whatever), and
every DB operation goes through your backend using the service_role
client. No RLS interaction to design at all — the backend IS the
security boundary, same trust level as an operator with SQL editor
access today, just with a UI. Given the current state (bucket B has
*no* policy path for anyone), this matches what's actually happening
today more honestly than half-wiring Supabase Auth into it.

Either way: **anything reachable from a browser must be the anon key
only; the service_role key lives in your backend's environment, never
in a client bundle.**

---

## 4. Clinic activation & profile management

```sql
-- hospitals
id uuid pk, name text not null, city text, state text, phone text,
email text, address text,
is_active boolean default true,        -- ← the flip that's currently manual
created_at timestamp,
tagline text, logo_url text,
accent_color text default '#1268e8',
is_branded boolean default false,
clinic_mode text default 'solo',       -- 'solo' | 'solo_reception' | 'multi_doctor'
specialty_profile text,                -- which of the 8 Cortex profiles (see specialtyProfile.ts)
consent_at timestamptz, policy_version text
```

```sql
-- users  (one per Supabase Auth login; id == auth.users.id)
id uuid pk, hospital_id uuid not null,
full_name text, phone text,
role text not null,                    -- owner|admin|doctor|reception|lab|pharmacist
is_active boolean not null default true, -- ← per-account disable
created_at timestamptz
```

```sql
-- doctors  (only for role='doctor')
id uuid pk, user_id uuid, hospital_id uuid,
name text, specialization text, phone text,
availability_status text default 'active',
registration_number text, qualification text,
signature_image_url text, avatar_url text,
default_language text default 'english',
last_seen timestamptz, preferred_measure_keys text[],
email text                             -- ← [2026-09-01] see note below
```

> **[2026-09-01] `doctors.email` is new — a real contact address, and
> the ONLY email that should ever be shown for a doctor anywhere,
> Master Control included.** It is separate from, and unrelated to, the
> Supabase Auth email on that doctor's `auth.users` row
> (`{digits}@aren.internal`, derived from their phone number purely so
> Supabase has something email-shaped to authenticate against). If
> Master Control ever lists doctors with an "email" column, read it from
> `doctors.email` (nullable — a doctor with none on file is a normal,
> honest state), never from `auth.users.email` or by reversing the
> phone number back out of it. Cortex's own Settings page made exactly
> this mistake and was corrected 2026-09-01 — see
> `docs/context/cortex-standing-rules.md` for the rule this became.

Via service_role, activating a clinic is a one-line update:

```ts
await supabaseAdmin.from('hospitals').update({ is_active: true }).eq('id', hospitalId)
```

Disabling a single account (support request, offboarding) is the same
shape against `users.is_active` — the login flow already checks this
(`Login Screen Implementation.md` §3) and signs the session out with
"account disabled" if false, so this lever already has an effect with
zero app-side changes needed.

`clinic_mode` and `specialty_profile` are the two fields that actually
change Cortex's behavior for a hospital (which nav/profile it boots
into) — worth exposing as editable dropdowns, not free text, matching
the fixed sets `specialtyProfile.ts` / `PROFILES` expect (see rule 19 in
`cortex-standing-rules.md`: these must stay in sync with a DB CHECK
constraint on `hospitals.specialty_profile` — read that constraint
before writing an arbitrary string into it).

### 4a. Subscriptions — plan assignment and content **[2026-09-01, new]**

Three tables, added as a foundation this round and now carrying live
content and two founding subscriptions (Ekanki Solo Clinc, Anmol Homeo
Clinics — both on the `solo` plan, `status='active'`, `is_founding=true`).

```sql
-- plans  (the catalogue Master Control would edit)
id uuid pk, code text unique not null,   -- STABLE key — 'solo' — app code
                                          -- branches ONLY on this, never on `name`
name text not null,                      -- display name — "AREN Polaris" today,
                                          -- an Admin-editable placeholder, not a
                                          -- constant to hardcode anywhere
description text, tagline text,
billing_interval text not null,          -- 'annual' | 'monthly' | 'lifetime' | ...
price_amount numeric,                    -- NULL = undecided, NOT free — never
                                          -- coerce to 0 or render as ₹0
price_currency text not null default 'INR',
trial_days integer not null default 0,
highlights text[] not null default '{}',  -- ordered "what you get" copy lines —
                                           -- prose for humans, never matched on
support_response text, cta_note text,
created_at timestamptz, updated_at timestamptz

-- plan_entitlements  (what a plan actually switches on — the SOURCE OF TRUTH,
--                      not `highlights`, which can legitimately drift from it
--                      mid-edit)
id uuid pk, plan_id uuid references plans,
feature_key text not null,               -- 'synapse' | 'whatsapp' | 'doctors' | ...
enabled boolean not null default true,
limit_value integer                      -- NULL = UNLIMITED, never treat as 0

-- subscriptions  (one clinic's live plan — assignment is Master Control's job)
id uuid pk, hospital_id uuid references hospitals,
plan_id uuid references plans,
status text not null,                    -- 'trialing'|'active'|'past_due'|
                                          -- 'cancelled'|'expired'|... (free text,
                                          -- not an enum — Admin can introduce a
                                          -- new status without a migration)
started_at timestamptz, current_period_end timestamptz, trial_ends_at timestamptz,
cancel_at_period_end boolean default false,
is_founding boolean default false,
seats integer not null default 1,        -- COMMERCIAL seat count — deliberately
                                          -- NOT the same number as the `doctors`
                                          -- entitlement limit; they can disagree
                                          -- mid-upgrade on purpose
billing_email text, billing_name text,
external_customer_id text, external_subscription_id text  -- empty until a
                                          -- payment provider is wired up
```

A partial unique index enforces **one live (`active`/`trialing`) row per
clinic** — cancelled/expired rows stay as history. Assigning a plan to a
clinic, upgrading it, or ending it is a service_role write against this
table; nothing in Cortex's own app-facing code can do any of the three
(§2 above — this is the cleanest bucket-B case in the whole schema).

```ts
// Assign the founding plan to a newly-activated clinic
const { data: plan } = await supabaseAdmin.from('plans').select('id').eq('code', 'solo').single()
await supabaseAdmin.from('subscriptions').insert({
  hospital_id: hospitalId, plan_id: plan.id, status: 'active',
  started_at: new Date().toISOString(), is_founding: true, seats: 1,
})
```

A **`subscription_requests`** table already exists as the doctor-facing
half of this — a clinic files an ask (`upgrade`, `add_seats`,
`billing_details`, `invoice`, `cancel`, `question`) from Cortex's own
Settings page, with a free-text message and their contact email. RLS
lets the clinic INSERT its own (forced to `status='open'`) and SELECT
its own; **no role can resolve one**, by design — triage is Master
Control's job:

```sql
id uuid pk, hospital_id uuid references hospitals,
subscription_id uuid references subscriptions,
requested_by uuid references users,
kind text not null,      -- CHECKed: upgrade|add_seats|billing_details|invoice|cancel|question
message text, contact_email text,
status text not null default 'open',     -- CHECKed: open|in_progress|resolved|declined
handled_at timestamptz, handled_note text,
created_at timestamptz, updated_at timestamptz
```

This is the natural admin-panel worklist: every clinic's open requests,
oldest first, resolved via service_role
(`update subscription_requests set status = 'resolved', handled_at = now(), handled_note = '...' where id = ...`)
once whatever the doctor asked for has actually been done (a plan
change, a seat added, an invoice sent by hand).

### 4b. Device sessions — the one table an account already fully owns **[2026-09-01, new]**

```sql
-- user_devices  (per-account, RLS already lets the OWNER manage every row)
id uuid pk, user_id uuid references users, hospital_id uuid references hospitals,
device_key text not null,                -- random UUID, minted client-side,
                                          -- identifies the INSTALL not the person
label text, platform text, browser text, -- "Chrome on macOS" — parsed from the
                                          -- user agent at sign-in, not sharper
form_factor text not null default 'desktop',
first_seen_at timestamptz, last_seen_at timestamptz,
revoked_at timestamptz,                  -- set → that install signs itself out
                                          -- next time it checks in
created_at timestamptz, updated_at timestamptz
```

Unlike everything else in §4, this one is **not** bucket B — RLS already
lets a signed-in user manage every row where `user_id = auth.uid()`, and
Cortex's own Settings page already reads/revokes through the anon key.
**No IP address and no location are stored, by design** — the table
answers "which machines is this account signed in on", not "where are
they".

What Master Control adds on top, since a support agent isn't the
account owner: **viewing or revoking another user's devices** (support
request: "I think someone else is signed into my account") needs
service_role, because the RLS above is intentionally per-user, not
per-admin — a colleague inside the same clinic must not be able to
enumerate or kill sessions on someone else's account, and that
constraint doesn't relax just because the caller happens to be an
admin elsewhere in the schema. A cross-account device view is exactly
the shape of query only Master Control can honestly run:

```ts
const { data } = await supabaseAdmin
  .from('user_devices').select('*')
  .eq('user_id', targetUserId).is('revoked_at', null)
  .order('last_seen_at', { ascending: false })
```

---

## 5. Medicine CRUD — the catalogue's actual shape

Three tables, always joined through the middle one:

```sql
-- compositions (~284 molecules — the thing the ENGINE ranks)
id serial pk, name text not null, specialization_scope text[] default '{general}'

-- medicines (213k+ rows — the thing a doctor actually PRESCRIBES)
id serial pk, name text not null, manufacturer text,
hospital_id uuid,          -- NULL = global catalogue; set = one clinic's own addition
strength_mg integer,
created_by_doctor_id uuid, created_at timestamptz

-- medicine_composition_map (the join — a combination product has >1 row here)
medicine_id int, composition_id int, is_primary boolean, route text  -- route = dosage form
```

Master Control's medicine powers, concretely:

- **Add/edit/delete a medicine** — direct writes to `medicines` +
  `medicine_composition_map` via service_role. The app-facing
  `add_medicine` RPC (SQL definition pulled live, see below) exists for
  *doctors* adding a brand from inside a consult — it deliberately
  **cannot** create a new composition, only attach a brand to an
  existing one, and it's hospital-scoped to the calling doctor. Master
  Control doesn't need to go through this RPC at all — service_role can
  insert into `medicines`/`medicine_composition_map` directly, with
  `hospital_id = NULL` for a real global-catalogue add. That's also
  the "promote a hospital's private medicine to the global catalogue"
  action: `update medicines set hospital_id = null where id = ...`.
- **After ANY medicine/composition/mapping change**, refresh the
  materialized view the ranked-brand lookup reads from — nothing does
  this automatically and a stale view looks correct while quietly
  serving old data:

  ```sql
  refresh materialized view concurrently mv_composition_brand;
  ```

  (Same call `add_medicine` makes internally — see its definition
  below. `CONCURRENTLY` needs the view's existing unique index on
  `(composition_id, medicine_id)`, already present — don't drop it.)
- **`medicines.name` lookups**: never `.ilike()` on this table — 213k
  rows, no prefix index, the live catalogue confirmed a wildcard query
  gets cancelled by the statement timeout. Use `.eq()` for exact name
  checks (e.g. a duplicate-name guard before insert — `add_medicine`'s
  own definition does this case-insensitively via `lower(name)`).

`add_medicine`'s real definition (security definer, so it runs as
elevated regardless of caller's RLS — this is how doctors can add
medicines today despite bucket B's gaps, but only in this one narrow,
guarded shape):

```sql
create or replace function public.add_medicine(
  p_name text, p_composition_ids integer[], p_route text default null,
  p_strength_mg integer default null, p_manufacturer text default null
) returns table(composition_id int, medicine_id int, name text,
                 manufacturer text, strength_mg int, route text)
language plpgsql security definer set search_path to 'public' as $$
  -- requires auth.uid(); resolves calling doctor + their hospital_id;
  -- rejects unknown composition ids, duplicate ids, unknown p_route,
  -- and a case-insensitive duplicate name; inserts into medicines with
  -- hospital_id = caller's hospital (never NULL); inserts one
  -- medicine_composition_map row per composition id; refreshes
  -- mv_composition_brand concurrently; returns one row per composition.
$$;
```

Valid `route` (dosage form) values, per this function's CHECK: `tablet,
capsule, syrup, suspension, drops, injection, topical, cream, ointment,
gel, inhalation, inhaler`.

---

## 6. Synapse ranking / intent rules — the "how it ranks" control

This is bucket B — no app-facing write path exists today, service_role
only. Pipeline (fuller narrative in `docs/context/engine.md`):

```
observables → observable_signals → signals → signal_intent_rules → intents
                                                        ↓
                                                 intent_guards (warn-only, never hides)
```

```sql
-- observables — the pickable chip catalogue
id bigserial, slug text, label text,
kind text,              -- 'symptom' | 'finding' | 'history'
domains text[],         -- which specialty views show it (UI filter only)
search_text text, system text, is_active boolean, created_at

-- signals — the weighted engine vocabulary
id text pk, label text, description text, idf_weight numeric default 1.0

-- observable_signals — chip → signal, weighted
observable_id bigint, signal_id text, weight numeric default 1.0

-- measurement_rules — numeric threshold → signal
id bigserial, measure_key text, unit text, min_value numeric, max_value numeric,
signal_id text, weight numeric default 1.0, is_active boolean

-- intents — every rankable output
id bigserial, type text,      -- medicine|test|exercise|modality|referral|finding|advice|impairment
label text, ref_table text, ref_id bigint, is_active boolean, created_at

-- signal_intent_rules — THE KNOWLEDGE BASE: what ranks against what
id bigserial, signal_id text, intent_id bigint, weight numeric,
is_safety_critical boolean default false,
rationale text, reviewed_by text, reviewed_at timestamptz,
is_active boolean, created_at

-- intent_guards — warn / warn_hard gating, flag-only (never hides/reorders)
id bigserial, signal_id text, action text,     -- 'warn' | 'warn_hard'
target_type text, target_class_id bigint, target_intent_id bigint,  -- exactly one of these three
reason text, is_active boolean, created_at

-- intent_classes / intent_class_map — grouping intents for guard targeting
```

Verification pattern worth carrying into the admin panel (from
`engine.md`): after any write here, check for orphan references —
`select count(*) from signal_intent_rules where not exists (select 1
from signals where id = signal_intent_rules.signal_id)` and the same
shape against `intents`. An intent/rule naming a signal that doesn't
exist ranks nothing, silently — no error, no crash, just absence. Worth
building as a standing health-check screen in Master Control rather
than a one-off query, since it's exactly the kind of thing an admin
tool should catch before a doctor ever notices content missing.

> **[2026-09-01]** Cortex's own Settings page grew exactly this kind of
> standing health-check screen this round (`System Health`, doctor-
> facing, checks records/Synapse rules/attachments reachability — see
> `src/features/settings/health/model.ts`). It is scoped to what a
> single clinic can observe about its own connection and is NOT a
> substitute for the orphan-reference check above, which needs a
> cross-hospital, schema-level view only an admin tool (or direct SQL)
> can run. Worth knowing it exists as prior art for the shape of a
> "what's actually working" screen, not as something to extend.

The weight-tiering convention (rule 23 in `cortex-standing-rules.md`,
worth respecting if the panel offers a "new rule" form rather than raw
SQL): test 0.15–0.35, referral ~0.45, advice 0.35–0.55, medicine/exercise
0.55–0.85 — and a *disease-specific* medicine/test riding on an
ambiguous multi-diagnosis symptom pattern should be gated to fire off a
*confirmed* finding, not the raw symptom, so it doesn't outrank
still-undifferentiated alternatives.

---

## 7. If you'd rather grant real RLS access instead of service_role-only

Possible, and arguably the more "real admin panel" shape long-term:
add `admin_write`-style policies (same pattern already used on the
bucket-A tables in §2) to the bucket-B tables:

```sql
create policy admin_write on hospitals for all
  using (current_user_is_admin()) with check (current_user_is_admin());
-- repeat for users, doctors, medicines, signal_intent_rules, intent_guards,
-- intents, intent_classes, intent_class_map, observables, observable_signals,
-- measurement_rules, signals, composition_requests (cross-hospital read
-- needed for an approval queue — see below), and — [2026-09-01] — plans,
-- plan_entitlements, subscriptions, subscription_requests (the UPDATE half,
-- for resolving a request; INSERT/SELECT already work per-clinic)
```

This is real schema work in the *Cortex* Supabase project (a migration,
via `apply_migration`, not a change in either app's repo), reviewed
like any RLS change — do it deliberately, not as a side effect of
building the panel. Until it's done, service_role-only (§2/§3 Option 2)
is correct and is not a workaround, it's the accurate reflection of
what currently has a write path at all.

---

## 8. Things already half-built that Master Control is the natural home for

- **`composition_requests`** — a doctor's "this salt is missing" ask,
  logged `status='pending'`, `hospital_id`-scoped (so no one hospital
  can see another's asks — an admin approval queue needs
  cross-hospital read, hence §7 or service_role). Columns: `id,
  doctor_id, hospital_id, requested_name, notes, status, created_at,
  reviewed_at`. Explicitly **not** a live path to a rankable
  composition (rule 22) — turning one into a real `compositions` row +
  gates + `signal_intent_rules` is exactly the "clinical-review
  pipeline, done by a person" this panel would BE. Flagged in
  `cortex-open-crosscutting.md` as "admin approval queue — not built."
- **`doctor_free_terms`** — a doctor-typed term that missed the
  catalogue, remembered per-doctor against the signals it was entered
  under. Not something to edit, but worth a read-only view: it's
  literally a list of "things doctors keep typing that aren't in the
  catalogue yet," i.e. a prioritized backlog for what to add to
  `observables`/`intents` next. Columns: `id, doctor_id, hospital_id,
  label, signal_ids[], use_count, last_used_at, intent_type,
  accepted_intent_ids[]`.
- **[2026-09-01] `subscription_requests`** — see §4a. A clinic can file
  one and see their own; nobody can resolve one. This is the second
  "approval queue with no admin side yet" pattern in the schema
  (`composition_requests` was the first) — worth building both as the
  same kind of worklist screen rather than two bespoke ones.

---

## 9. What NOT to bring over

- Don't reuse Cortex's `src/lib/db/*` files — they're written against
  the anon key + a signed-in doctor's RLS context and half of them
  won't even resolve rows for the operations this panel needs (§2
  bucket B). Write new, small server-side functions against
  `supabaseAdmin` instead.
- Don't copy Cortex's `.env` into this repo, and don't put the
  service_role key in any variable Vite/Next would inline into a
  client bundle (`VITE_*`, `NEXT_PUBLIC_*`).
- **[2026-09-01]** Don't surface `auth.users.email` for a doctor
  anywhere in the panel — it's the phone-derived `{digits}@aren.internal`
  sign-in address, not a real contact email, and showing it publishes
  the phone number it was built from. Use `doctors.email` (§4).
- `postgres`-role access (e.g. raw `execute_sql` via the Supabase MCP
  tools) bypasses RLS entirely and was used to gather this document's
  schema info — same caution applies to `supabaseAdmin`: it isn't a
  substitute for validating input server-side, it's the opposite of a
  safety net.
