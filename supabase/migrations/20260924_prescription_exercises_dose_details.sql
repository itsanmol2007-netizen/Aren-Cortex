-- The rest of an exercise dose: load, how many days a week, for how long.
-- Nullable, so older app builds inserting the original columns are unaffected.
alter table public.prescription_exercises
    add column if not exists load_kg numeric(6,2),
    add column if not exists days_per_week integer check (days_per_week between 1 and 7),
    add column if not exists weeks integer check (weeks > 0);
