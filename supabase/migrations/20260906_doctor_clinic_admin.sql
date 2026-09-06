-- Doctor-admin authority — a doctor who keeps consulting but also carries
-- clinic-wide admin authority, surfaced as a richer Overview rather than a
-- separate Parallax seat.
--
-- Deliberately additive, not a `users.role` change: `users.role` stays
-- 'doctor' for these people, so nothing keyed on that role (RLS, the
-- clinical sidebar, the consult workspace) has to change to keep them
-- prescribing. `resolveAdminAccess` (src/lib/workspace/adminAccess.ts) reads
-- this column alongside role/dedicated-admin-count; PeoplePage (Parallax) and
-- the Overview bench-management card both write it via
-- `setDoctorClinicAdmin` (src/lib/db/admin.ts).
--
-- Multiple doctors at one clinic can carry this flag at once (Anmol,
-- 2026-09-06: "There can be multiple clinic admins").
alter table public.doctors
    add column if not exists is_clinic_admin boolean not null default false;

comment on column public.doctors.is_clinic_admin is
    'True when this doctor also holds clinic-admin authority (bench management, fees, staff status from their own Overview) without becoming a non-clinical users.role. Granted/revoked from Parallax''s People page or from another admin-doctor''s Overview; see adminAccess.ts.';
