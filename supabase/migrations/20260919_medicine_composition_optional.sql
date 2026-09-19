-- Composition is no longer required to add a medicine (doctrine rule 22
-- relaxed, 2026-09-19). A real medicine with no catalogued salt must still be
-- addable mid-consult -- see AddMedicineSheet.tsx's header for the full story.

alter table medicines add column if not exists composition_note text;
alter table prescription_medicines add column if not exists composition_note text;

drop function if exists public.add_medicine(text, integer[], text, integer, text);

create or replace function public.add_medicine(
    p_name text,
    p_composition_ids integer[],
    p_route text default null::text,
    p_strength_mg integer default null::integer,
    p_manufacturer text default null::text,
    p_composition_note text default null::text
)
 returns table(composition_id integer, medicine_id integer, name text, manufacturer text, strength_mg integer, route text, composition_note text)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
    v_doctor_id uuid;
    v_hospital_id uuid;
    v_role text;
    v_medicine_id integer;
    v_name text := btrim(p_name);
    v_manufacturer text := nullif(btrim(coalesce(p_manufacturer, '')), '');
    v_composition_note text := nullif(btrim(coalesce(p_composition_note, '')), '');
    v_bad_ids text;
    v_has_compositions boolean := p_composition_ids is not null and array_length(p_composition_ids, 1) is not null;
begin
    if auth.uid() is null then
        raise exception 'not authenticated';
    end if;

    select d.id into v_doctor_id from doctors d where d.user_id = auth.uid();
    select u.role into v_role from users u where u.id = auth.uid();

    -- A doctor attributes the row to themselves. An admin/owner may add one
    -- with no attribution. Anyone else with no doctor profile is refused,
    -- exactly as before.
    if v_doctor_id is null and v_role not in ('admin', 'owner') then
        raise exception 'no doctor profile linked to this account -- cannot attribute the addition';
    end if;

    v_hospital_id := current_user_hospital_id();
    if v_hospital_id is null then
        raise exception 'no hospital resolved for this account';
    end if;

    if v_name is null or v_name = '' then
        raise exception 'medicine name is required';
    end if;

    -- Doctrine rule 22 relaxed: a brand no longer has to attach to an
    -- existing composition to be addable. When compositions ARE given they
    -- still have to be real and non-repeated -- only the "at least one is
    -- required" floor is gone.
    if v_has_compositions then
        if array_length(p_composition_ids, 1) <> (select count(distinct x) from unnest(p_composition_ids) x) then
            raise exception 'the same composition was listed more than once';
        end if;

        select string_agg(x::text, ', ') into v_bad_ids
        from unnest(p_composition_ids) x
        where not exists (select 1 from compositions c where c.id = x);
        if v_bad_ids is not null then
            raise exception 'unknown composition id(s): %', v_bad_ids;
        end if;
    end if;

    if p_route is not null and p_route not in (
        'tablet','capsule','syrup','suspension','drops','injection',
        'topical','cream','ointment','gel','inhalation','inhaler'
    ) then
        raise exception 'unknown dosage form: %', p_route;
    end if;

    if exists (select 1 from medicines m where lower(m.name) = lower(v_name)) then
        raise exception 'a medicine named "%" already exists', v_name;
    end if;

    insert into medicines (name, manufacturer, hospital_id, strength_mg, created_by_doctor_id, created_at, composition_note)
    values (v_name, v_manufacturer, v_hospital_id, p_strength_mg, v_doctor_id, now(), v_composition_note)
    returning id into v_medicine_id;

    if v_has_compositions then
        insert into medicine_composition_map (medicine_id, composition_id, is_primary, route)
        select v_medicine_id, x, false, p_route
        from unnest(p_composition_ids) x;

        refresh materialized view concurrently mv_composition_brand;

        return query
        select x, v_medicine_id, v_name, v_manufacturer, p_strength_mg, p_route, v_composition_note
        from unnest(p_composition_ids) x;
    else
        return query
        select null::integer, v_medicine_id, v_name, v_manufacturer, p_strength_mg, p_route, v_composition_note;
    end if;
end;
$function$;
