-- ---------------------------------------------------------------------------
-- LAB HANDOFF (2026-09-27)
--
-- 1. A preferred lab can carry a WhatsApp number (to send it an order), a
--    plain address and a Google Maps link (so the patient's prescription
--    page can take them there). All three optional; nullable, additive.
--
-- 2. lab_order_handoffs: one row per investigation order sent to a lab.
--    What was asked (tests with site and side), how urgently, why (the
--    clinical indication) and the minimal story (context); the random
--    share_token is the only credential of the public order page the lab
--    opens (/lab-orders/:token), the same model as prescriptions.share_token.
--    It is also the record a future lab integration writes results back to.
--
-- 3. whatsapp_messages.purpose gains 'lab_order' — every lab message is a
--    real send and spends a credit like any other.
-- ---------------------------------------------------------------------------

alter table public.doctor_preferred_labs
    add column if not exists whatsapp_phone text,
    add column if not exists address text,
    add column if not exists maps_url text;

alter table public.clinic_preferred_labs
    add column if not exists whatsapp_phone text,
    add column if not exists address text,
    add column if not exists maps_url text;

create table if not exists public.lab_order_handoffs (
    id uuid primary key default gen_random_uuid(),
    share_token text not null unique default replace(gen_random_uuid()::text, '-', ''),
    hospital_id uuid not null references public.hospitals(id) on delete cascade,
    doctor_id uuid references public.doctors(id) on delete set null,
    patient_id uuid not null references public.patients(id) on delete cascade,
    visit_id uuid references public.visits(id) on delete set null,
    prescription_id uuid references public.prescriptions(id) on delete set null,
    lab_name text not null,
    lab_phone text,
    priority text not null default 'routine' check (priority in ('routine', 'urgent', 'stat')),
    indication text,
    context text,
    -- [{ "name": "X-Ray Hand / Wrist", "site": "Left wrist", "side": "left" }]
    tests jsonb not null default '[]'::jsonb,
    status text not null default 'draft' check (status in ('draft', 'sent', 'failed')),
    whatsapp_message_id bigint,
    sent_at timestamptz,
    created_by uuid default auth.uid(),
    created_at timestamptz not null default now()
);

create index if not exists lab_order_handoffs_visit on public.lab_order_handoffs (visit_id);
create index if not exists lab_order_handoffs_prescription on public.lab_order_handoffs (prescription_id);

alter table public.lab_order_handoffs enable row level security;

drop policy if exists lab_order_handoffs_hospital on public.lab_order_handoffs;
create policy lab_order_handoffs_hospital on public.lab_order_handoffs
    for all
    using (hospital_id = public.current_user_hospital_id())
    with check (hospital_id = public.current_user_hospital_id());

alter table public.whatsapp_messages drop constraint if exists whatsapp_messages_purpose_check;
alter table public.whatsapp_messages add constraint whatsapp_messages_purpose_check check (
    purpose is null or purpose = any (array['prescription', 'follow_up', 'reply', 'booking', 'other', 'lab_order'])
);
