-- ---------------------------------------------------------------------------
-- Clinic-owned observables: the body map's "not in the list" fallback.
--
-- A doctor who types a finding the catalogue does not have ("Medial joint
-- line tenderness") gets it recorded like any catalogue finding: on the
-- chart, at its site, saved to visit_observations, printed, and offered in
-- search the next time. It lives in `observables` itself, owned by the
-- clinic (hospital_id), so every path that already reads an observable by
-- id works unchanged. Global rows keep hospital_id NULL.
--
-- Additive only: two nullable columns, the read policy narrowed so a
-- clinic's own terms are seen by that clinic alone, and one function to add
-- (or find) a term. Synapse never ranks on these: no signal edges exist.
-- ---------------------------------------------------------------------------

alter table public.observables add column if not exists hospital_id uuid references public.hospitals(id);
alter table public.observables add column if not exists created_by_doctor_id uuid references public.doctors(id);
create index if not exists observables_hospital_idx on public.observables(hospital_id) where hospital_id is not null;

drop policy if exists synapse_read_all on public.observables;
create policy synapse_read_all on public.observables
    for select
    using (current_user_is_active() and (hospital_id is null or hospital_id = current_user_hospital_id()));

create or replace function public.add_clinic_observable(
    p_label text,
    p_kind text,
    p_domain text default null,
    p_system text default null
) returns setof public.observables
language plpgsql
security definer
set search_path = public
as $$
declare
    v_hosp uuid := current_user_hospital_id();
    v_label text := btrim(regexp_replace(coalesce(p_label, ''), '\s+', ' ', 'g'));
    v_doctor uuid;
    v_row public.observables;
begin
    if not current_user_is_active() or v_hosp is null then
        raise exception 'NOT_ALLOWED';
    end if;
    if length(v_label) < 2 or length(v_label) > 80 then
        raise exception 'BAD_LABEL';
    end if;
    if p_kind not in ('symptom', 'finding') then
        raise exception 'BAD_KIND';
    end if;

    -- Already a word for it, in the catalogue or this clinic's own list.
    select * into v_row
    from public.observables
    where is_active and lower(label) = lower(v_label)
      and (hospital_id is null or hospital_id = v_hosp)
    order by hospital_id nulls first
    limit 1;
    if found then
        return next v_row;
        return;
    end if;

    select id into v_doctor from public.doctors where user_id = auth.uid() limit 1;

    insert into public.observables
        (slug, label, kind, search_text, is_active, domains, system, localizable, hospital_id, created_by_doctor_id)
    values
        ('clinic-' || replace(gen_random_uuid()::text, '-', ''), v_label, p_kind, lower(v_label), true,
         array[coalesce(nullif(p_domain, ''), 'general')], coalesce(nullif(p_system, ''), 'general'),
         true, v_hosp, v_doctor)
    returning * into v_row;
    return next v_row;
end;
$$;

revoke all on function public.add_clinic_observable(text, text, text, text) from public;
grant execute on function public.add_clinic_observable(text, text, text, text) to authenticated;
