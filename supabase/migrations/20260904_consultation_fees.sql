-- ---------------------------------------------------------------------------
-- CONSULTATION FEES — the money layer, deliberately small.
--
-- Anmol, 2026-09-04: "we don't need to build sophisticated GST billing or
-- something, but definitely a thing to add a consultation fee of a doctor,
-- which can appear on the front desk model... doctor fees with discount option
-- and also adding 18% GST option."
--
-- So this is NOT accounting software. There is no invoice number, no tax
-- register, no ledger, no payment gateway. It is three questions and their
-- answers:
--
--   What does this doctor charge?        → doctors.consultation_fee
--   Does this clinic add GST / discount? → hospitals.gst_* / allow_discount
--   What was actually collected today?   → visit_payments
--
-- Everything is ADDITIVE and NULLABLE. A clinic that never opens the fees
-- screen behaves exactly as it does today: no fee shows anywhere, front desk
-- is unchanged, nothing breaks. Fees are opt-in per clinic, and a NULL fee
-- means "not set", never "free".
-- ---------------------------------------------------------------------------


-- ── 1. What a doctor charges ───────────────────────────────────────────────

alter table public.doctors
    add column if not exists consultation_fee numeric(10, 2),
    add column if not exists follow_up_fee    numeric(10, 2);

comment on column public.doctors.consultation_fee is
    'What this doctor charges for a first consultation, in the clinic''s currency. NULL means the clinic has not set a fee — which renders as "not set" and shows no amount at front desk. NULL is never treated as zero: a free consultation is an explicit 0, and the two must stay distinguishable or a clinic that simply has not finished onboarding looks like one that works for free.';

comment on column public.doctors.follow_up_fee is
    'Charged instead of consultation_fee when the patient has visited this clinic before. NULL = no separate follow-up rate; charge consultation_fee for every visit. Kept as its own column rather than a percentage of the first fee because clinics quote it as a flat number ("₹200 follow-up"), not as a discount.';


-- ── 2. Whether the clinic adds GST, and whether it allows discounts ────────
--
-- On `hospitals` rather than a settings table: these are three facts about a
-- clinic, in the same shape and lifetime as its name and address, and every
-- surface that needs them already loads the hospital row (lib/auth.ts's
-- loadIdentity). A separate table would mean a second fetch on the front desk
-- hot path to answer "does this clinic add 18%".

alter table public.hospitals
    add column if not exists currency       text           not null default 'INR',
    add column if not exists gst_enabled    boolean        not null default false,
    add column if not exists gst_percent    numeric(5, 2)  not null default 18,
    add column if not exists allow_discount boolean        not null default true;

comment on column public.hospitals.gst_enabled is
    'Off by default, and that default is the honest one: most small Indian clinics are below the GST registration threshold and must NOT show tax on a receipt. A clinic turns this on only when it actually has a GSTIN.';

comment on column public.hospitals.gst_percent is
    'Rate applied when gst_enabled. Defaults to 18 because that is the rate Anmol named, but it is a column rather than a constant so a clinic on a different slab is a value change, not a code change.';

comment on column public.hospitals.allow_discount is
    'Whether front desk may reduce a fee at the counter. On by default — discounts at the desk are normal practice in Indian OPD — but a clinic that wants a fixed price can switch the control off entirely rather than relying on staff discipline.';


-- ── 3. What was actually collected ─────────────────────────────────────────
--
-- One row per visit, created when front desk records payment — NOT created
-- with the visit. A missing row means "nothing recorded yet", which is a
-- normal state all day long, and is why `visit_id` is unique rather than the
-- primary key: the absence of a row has to be cheap to check.

create table if not exists public.visit_payments (
    id            bigint generated always as identity primary key,
    visit_id      uuid not null unique references public.visits(id)     on delete cascade,
    hospital_id   uuid not null        references public.hospitals(id)  on delete cascade,
    doctor_id     uuid                 references public.doctors(id)    on delete set null,

    -- The four numbers, stored as they were at the moment of collection.
    -- Deliberately NOT read back from doctors.consultation_fee at display
    -- time: a doctor who raises their fee next month must not retroactively
    -- change what a patient paid last week.
    fee           numeric(10, 2) not null default 0,
    discount      numeric(10, 2) not null default 0,
    gst_percent   numeric(5, 2)  not null default 0,
    gst_amount    numeric(10, 2) not null default 0,

    -- Generated, not passed in. Every caller that computes a total by hand is
    -- a chance for the receipt and the report to disagree; making Postgres own
    -- the arithmetic means they cannot.
    total         numeric(10, 2) generated always as (fee - discount + gst_amount) stored,

    status        text not null default 'paid',
    method        text,
    note          text,

    collected_by  uuid references public.users(id) on delete set null,
    collected_at  timestamptz not null default now(),
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now(),

    constraint visit_payments_status_check check (
        status in ('paid', 'pending', 'waived', 'refunded')
    ),
    constraint visit_payments_method_check check (
        method is null or method in ('cash', 'upi', 'card', 'other')
    ),
    -- A discount larger than the fee would make `total` negative, which is not
    -- a discount, it is a refund — and refunds are a different row entirely.
    constraint visit_payments_discount_within_fee check (discount >= 0 and discount <= fee),
    constraint visit_payments_non_negative check (fee >= 0 and gst_amount >= 0)
);

comment on table public.visit_payments is
    'What a patient actually paid for one visit. NOT an invoice and not a ledger — there is no invoice number, no tax register and no gateway reference, because this exists to answer "did this patient pay, and how much did the clinic take today", nothing further. A visit with no row here has simply not been billed yet, which is the normal state for most of a working day.';

comment on column public.visit_payments.fee is
    'The fee as quoted at collection time, copied from the doctor''s rate rather than referenced. A later change to doctors.consultation_fee must never rewrite history.';

comment on column public.visit_payments.total is
    'Generated: fee - discount + gst_amount. Never written by the application — the receipt and the day''s total are the same arithmetic, done once, in the database.';

alter table public.visit_payments enable row level security;

drop policy if exists visit_payments_hospital_isolation on public.visit_payments;
create policy visit_payments_hospital_isolation
    on public.visit_payments
    for all
    using (hospital_id = public.current_user_hospital_id())
    with check (hospital_id = public.current_user_hospital_id());

-- "What did this clinic collect today", the only aggregate the admin panel asks.
create index if not exists visit_payments_hospital_collected_idx
    on public.visit_payments (hospital_id, collected_at desc);
create index if not exists visit_payments_doctor_collected_idx
    on public.visit_payments (doctor_id, collected_at desc);
