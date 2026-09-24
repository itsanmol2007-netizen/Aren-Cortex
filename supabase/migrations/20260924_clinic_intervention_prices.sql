-- What a clinic charges for an intervention family ("Cast"), optionally per
-- configuration ("Cast" + "Above-elbow (long arm)"). config_key '' is the
-- family's base price. An empty table is the off state, the same as
-- clinic_medicine_prices. Performed interventions pre-fill Review's
-- additional charges from this; planned ones are never billed.
create table if not exists public.clinic_intervention_prices (
    id bigint generated always as identity primary key,
    hospital_id uuid not null references public.hospitals(id) on delete cascade,
    family text not null,
    config_key text not null default '',
    price numeric(10,2) not null check (price >= 0),
    set_by uuid,
    updated_at timestamptz not null default now(),
    unique (hospital_id, family, config_key)
);
alter table public.clinic_intervention_prices enable row level security;
create policy hospital_isolation on public.clinic_intervention_prices for all
    using (hospital_id = current_user_hospital_id())
    with check (hospital_id = current_user_hospital_id());
