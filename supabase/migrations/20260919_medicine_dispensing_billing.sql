-- ---------------------------------------------------------------------------
-- MEDICINE DISPENSING BILLING — opt-in, per-clinic.
--
-- Lets a clinic that resells the medicine it dispenses (common where there is
-- no separate pharmacy — Anmol's own family clinic, rural, no consult fee at
-- all: "the only source of money, reselling medicines") bill a per-visit
-- total that adds dispensed-medicine charges to the existing consult-fee
-- receipt, without touching the shared ~213k-row medicine catalogue at all.
--
-- Four pieces, in the order a receipt actually needs them:
--
--   1. `hospitals.medicine_billing_enabled` / `medicine_gst_enabled` — the
--      two toggles (Clinic page). Both default false: a clinic that never
--      turns this on sees zero behavioural change anywhere.
--   2. `clinic_medicine_prices` — one row per (hospital, medicine): "this
--      clinic sells THIS medicine for THIS much." Mirrors
--      `clinic_brand_preference`'s exact shape (same PK style, same RLS
--      pattern, same `set_by`) since it is the same kind of fact: a
--      per-clinic override sitting beside a shared global catalogue.
--      `unit_price` is derived (pack price ÷ pack units) rather than typed
--      in directly — a clinic prices what it actually buys (10-strip pack,
--      ₹200), not an abstract per-tablet rate.
--   3. `prescription_medicines.quantity_dispensed` / `unit_price` /
--      `line_total` — quantity is a genuinely new concept (nothing today
--      derives "how many units handed over" from a dosing schedule); price
--      is COPIED here from `clinic_medicine_prices` at save time, same
--      principle `doctors.consultation_fee` → `visit_payments.fee` already
--      uses, so a price change next month never rewrites a receipt already
--      handed to a patient.
--   4. `visit_payments.medicine_total` / `medicine_gst_amount` — plain
--      columns, app-computed the same way `gst_amount` already is (it is
--      NOT itself generated — only `total` is). `total`'s generated
--      expression is extended to fold both in; every existing row's total
--      is unchanged because both new columns default to 0.
-- ---------------------------------------------------------------------------

-- ── 1. The two toggles ──────────────────────────────────────────────────────
alter table hospitals
    add column if not exists medicine_billing_enabled boolean not null default false,
    -- Only meaningful once `medicine_billing_enabled` AND the clinic's own
    -- `gst_enabled` are both true — the app gates the control on that, this
    -- column just remembers the answer. Reuses `hospitals.gst_percent`
    -- (one shared rate) rather than a second rate field: Anmol asked for
    -- medicine GST to be optional, not a different percentage.
    add column if not exists medicine_gst_enabled boolean not null default false;

-- ── 2. Per-clinic dispensing price ──────────────────────────────────────────
create table if not exists clinic_medicine_prices (
    hospital_id uuid not null references hospitals(id) on delete cascade,
    medicine_id integer not null references medicines(id) on delete cascade,
    pack_price numeric(10,2) not null check (pack_price >= 0),
    pack_units integer not null check (pack_units > 0),
    -- 4 decimal places, not 2 — a ₹200/30-strip pack is ₹6.6667/unit, and
    -- rounding that to ₹6.67 before multiplying by a quantity of, say, 40
    -- compounds a visible error into the line total. `line_total` below does
    -- the one rounding that actually reaches a rupee amount.
    unit_price numeric(10,4) generated always as (pack_price / pack_units) stored,
    set_by uuid references users(id),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    primary key (hospital_id, medicine_id)
);

alter table clinic_medicine_prices enable row level security;

-- Same shape as `visit_payments_hospital_isolation` — one ALL policy, not the
-- extra redundant SELECT-only policy `clinic_brand_preference` happens to
-- carry (that second policy adds nothing an ALL policy doesn't already cover).
create policy clinic_medicine_prices_hospital_isolation on clinic_medicine_prices
    for all
    using (hospital_id = current_user_hospital_id())
    with check (hospital_id = current_user_hospital_id());

create trigger clinic_medicine_prices_set_updated_at
    before update on clinic_medicine_prices
    for each row execute function set_updated_at();

-- ── 3. What was actually dispensed, and at what price ───────────────────────
alter table prescription_medicines
    add column if not exists quantity_dispensed numeric(10,2),
    add column if not exists unit_price numeric(10,4),
    add column if not exists line_total numeric(10,2) generated always as (
        case when quantity_dispensed is not null and unit_price is not null
             then round(quantity_dispensed * unit_price, 2)
             else null end
    ) stored;

-- ── 4. The receipt total ────────────────────────────────────────────────────
alter table visit_payments
    add column if not exists medicine_total numeric not null default 0,
    add column if not exists medicine_gst_amount numeric not null default 0;

-- Postgres has no ALTER on a generated column's expression — drop and
-- re-add is the only path. Every existing row recomputes under the new
-- formula the instant this runs; both new terms default to 0, so no
-- existing total changes by so much as a paisa.
alter table visit_payments drop column total;
alter table visit_payments
    add column total numeric generated always as (
        (fee - discount) + gst_amount + medicine_total + medicine_gst_amount
    ) stored;
