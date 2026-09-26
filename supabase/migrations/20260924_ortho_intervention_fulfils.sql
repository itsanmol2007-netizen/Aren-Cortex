-- A planned intervention (status 'planned', e.g. "Suture removal, due day
-- 10") is fulfilled by a later performed row that points back at it.
alter table public.prescription_interventions
    add column if not exists fulfils_id uuid references public.prescription_interventions(id) on delete set null;
