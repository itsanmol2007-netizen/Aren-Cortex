-- The app offers an Orthopedics profile; the check constraint never listed it,
-- so choosing it failed with hospitals_specialty_profile_check.
alter table public.hospitals drop constraint if exists hospitals_specialty_profile_check;
alter table public.hospitals add constraint hospitals_specialty_profile_check check (
    specialty_profile is null or specialty_profile = any (array[
        'general_opd','physiotherapy','orthopedics','diagnostics','cardiology',
        'pediatrics','gynaecology','dentistry','dermatology'
    ]::text[])
);
