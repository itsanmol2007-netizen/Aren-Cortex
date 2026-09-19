-- Additional (non-medicine) service charges a doctor can add at review time
-- ("physio session", "dressing", ...) plus a review-time discount on the
-- visit's final total. Both independent of medicine billing and of each
-- other -- Anmol, 2026-09-19: "it's not necessary that when doctor
-- consultation fees is turned on only then medicine thing will be turned
-- on... these things could be individually turned on or off." No clinic-
-- level enable/disable toggle for additional charges: an empty catalog IS
-- the off state, same as clinic_medicine_prices already is for pricing.

-- A per-clinic saved catalog, so a charge typed once is offered again next
-- time rather than retyped from scratch every visit.
create table clinic_additional_charges (
    id bigint generated always as identity primary key,
    hospital_id uuid not null references hospitals(id) on delete cascade,
    label text not null,
    default_amount numeric(10,2) not null default 0,
    sort_order int not null default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (hospital_id, label)
);

comment on table clinic_additional_charges is
    'Per-clinic saved catalog of ad-hoc service charges offered at review time, alongside the consultation fee and dispensed medicine. What actually got billed on one visit is visit_payments.additional_charges (its own jsonb snapshot -- a catalog edit must never rewrite a bill already shown to a patient, same copied-once principle as doctors.consultation_fee -> visit_payments.fee).';

alter table clinic_additional_charges enable row level security;

create policy clinic_additional_charges_hospital_isolation on clinic_additional_charges
    for all
    using (hospital_id = current_user_hospital_id())
    with check (hospital_id = current_user_hospital_id());

create trigger clinic_additional_charges_set_updated_at
    before update on clinic_additional_charges
    for each row execute function set_updated_at();

-- What actually got billed on THIS visit -- a jsonb snapshot (label +
-- amount pairs), not a foreign key into the catalog above: a catalog price
-- change next month must never rewrite a bill already shown to a patient,
-- same principle clinic_medicine_prices -> prescription_medicines.unit_price
-- already follows. additional_charges_total is the plain app-computed sum,
-- same pattern medicine_total already uses (not a generated column --
-- summing a jsonb array in a STORED generated expression needs its own
-- immutable function for no real benefit here).
alter table visit_payments
    add column additional_charges jsonb not null default '[]'::jsonb,
    add column additional_charges_total numeric(10,2) not null default 0,
    -- The review-time discount on the FINAL total (fee + GST + medicine +
    -- medicine GST + additional charges) -- a separate thing from the
    -- existing discount/discount_kind/discount_percent columns above,
    -- which are front desk's INTAKE-time discount on the consultation fee
    -- alone. percent is nullable (a flat rupee amount typed directly
    -- leaves it null), same nullable shape discount_percent already uses;
    -- amount is always stored, computed once at save time.
    add column review_discount_percent numeric(5,2),
    add column review_discount_amount numeric(10,2) not null default 0;

comment on column visit_payments.additional_charges is
    'Snapshot of what was actually billed on this visit besides the fee and medicine -- [{"label": "...", "amount": 123.45}, ...]. Written once at consult save, never re-derived from the catalog.';
comment on column visit_payments.review_discount_percent is
    'The review-time discount, as a percent of the final total -- null when a flat rupee amount was typed instead. Separate from discount_percent above, which is front desk''s intake-time discount on the fee alone.';

-- Postgres cannot ALTER a generated column's expression -- drop and
-- recreate, same as the medicine_dispensing_billing migration already did
-- once for this same column.
alter table visit_payments drop column total;
alter table visit_payments add column total numeric generated always as (
    greatest(0,
        (fee - discount) + gst_amount + medicine_total + medicine_gst_amount
        + additional_charges_total - review_discount_amount
    )
) stored;
