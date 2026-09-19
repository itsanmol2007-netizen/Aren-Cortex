-- Fix: adding a medicine WITH a composition was blocking on
-- `refresh materialized view concurrently mv_composition_brand` (311k+ rows,
-- 63MB) inside the same transaction. On a loaded connection this exceeded
-- the pooler's statement_timeout and killed the WHOLE call with a 500 --
-- "canceling statement due to statement timeout" (Anmol, 2026-09-19),
-- taking the medicines insert down with it even though that part had
-- already succeeded. lib/db/synapse.ts's own addMedicine() comment already
-- says this refresh is not something the CURRENT consult needs to wait on
-- ("the refresh is what makes the medicine reachable on the *next* search,
-- by anyone, not what this consult needs right now") -- this migration
-- makes the code actually match that: the refresh gets a generous local
-- timeout and any failure (including its own timeout) is swallowed rather
-- than rolling back the add.

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

        -- Best-effort, never fatal to the add -- see header comment.
        begin
            set local statement_timeout = '25s';
            refresh materialized view concurrently mv_composition_brand;
        exception when others then
            null;
        end;

        return query
        select x, v_medicine_id, v_name, v_manufacturer, p_strength_mg, p_route, v_composition_note
        from unnest(p_composition_ids) x;
    else
        return query
        select null::integer, v_medicine_id, v_name, v_manufacturer, p_strength_mg, p_route, v_composition_note;
    end if;
end;
$function$;
