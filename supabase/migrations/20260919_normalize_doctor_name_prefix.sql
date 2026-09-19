-- ---------------------------------------------------------------------------
-- Canonicalize doctors.name to always carry a "Dr. " prefix, exactly once.
--
-- Before this, `doctors.name` was whatever the doctor typed into their own
-- profile — some rows already carried "Dr", "Dr.", or "Dr." with no space,
-- most didn't carry it at all. Several UI surfaces then prepended their own
-- hardcoded "Dr. " on top (see lib/format.ts's `doctorName()`, added for the
-- exact "Dr. Dr Anmol Pandey" bug this produced), and several others didn't,
-- so the SAME doctor could print with a title on one prescription surface
-- and without one on another. Anmol, 2026-09-19: normalize the DATA once, so
-- no rendering surface has to carry this logic at all — every surface can
-- just print `doctors.name` directly from here on.
--
-- The backfill strips any existing leading Dr/Dr./DR/dr (with or without a
-- trailing space — "Dr.Sony Prasad" had none) case-insensitively, then
-- re-adds exactly one "Dr. " — idempotent, safe to run twice.
--
-- The trigger keeps the invariant true for every future INSERT/UPDATE too
-- (a doctor editing their own name from the Clinic page, an admin adding a
-- new doctor, …) — enforced at the data layer rather than trusted to every
-- call site that writes this column to remember on its own.
-- ---------------------------------------------------------------------------

update public.doctors
set name = 'Dr. ' || trim(regexp_replace(name, '^\s*dr\.?\s*', '', 'i'))
where name is not null
  and name <> 'Dr. ' || trim(regexp_replace(name, '^\s*dr\.?\s*', '', 'i'));

create or replace function public.normalize_doctor_name()
returns trigger
language plpgsql
as $$
begin
    if new.name is not null then
        new.name := 'Dr. ' || trim(regexp_replace(new.name, '^\s*dr\.?\s*', '', 'i'));
    end if;
    return new;
end;
$$;

drop trigger if exists trg_normalize_doctor_name on public.doctors;
create trigger trg_normalize_doctor_name
    before insert or update of name on public.doctors
    for each row
    execute function public.normalize_doctor_name();

comment on function public.normalize_doctor_name() is
    'Keeps doctors.name canonically prefixed "Dr. <name>", exactly once, on every write — see migration 20260919_normalize_doctor_name_prefix.sql.';
