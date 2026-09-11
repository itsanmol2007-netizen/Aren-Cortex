-- Confirmed Devanagari display names — Anmol, 2026-09-11 (multilingual
-- prescriptions). Names are TRANSLITERATED (proper nouns), never translated,
-- and never generated per-request: the doctor/admin types it once, it is
-- stored here, and every future Hindi prescription reads this column instead
-- of re-deriving it. NULL means "not set yet" — every Hindi renderer falls
-- back to the Latin name rather than guessing a transliteration, because a
-- wrong guess on a person's own name is worse than leaving it in English.
alter table public.doctors   add column if not exists name_hi text;
alter table public.hospitals add column if not exists name_hi text;

comment on column public.doctors.name_hi is
  'Doctor''s name in Devanagari, confirmed by the doctor/admin once. NULL = not set; Hindi renderers fall back to the Latin `name`.';
comment on column public.hospitals.name_hi is
  'Clinic name in Devanagari, confirmed by the doctor/admin once. NULL = not set; Hindi renderers fall back to the Latin `name`.';
