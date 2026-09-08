-- Backfill: a clinic that already employs an active receptionist is a front
-- desk clinic, whatever `clinic_mode` says. `lib/workspace/mode.ts` derives
-- the whole Cortex/Consult split from this one column, and nothing ever
-- WROTE it after registration — the `admin-staff` Edge Function's own
-- "add staff" path (server-side counterpart of this migration, see
-- supabase/functions/admin-staff/index.ts) now promotes `solo` ->
-- `solo_reception` the moment a reception hire lands, going forward. This
-- migration is the one-time correction for clinics that hired a
-- receptionist BEFORE that promotion existed and have been stuck showing
-- Cortex (no queue, no Consult chrome) ever since — found live 2026-09-08:
-- "Ekanki Solo Clinc" (hospital 64c26e24-3668-49c6-8b99-6ddb8c14883e), whose
-- receptionist has been registering patients into a queue its own doctor
-- could never see.
--
-- Never touches `multi_doctor` (already a front-desk mode) or a clinic with
-- no active reception user.
update hospitals h
set clinic_mode = 'solo_reception'
where (h.clinic_mode is null or h.clinic_mode = 'solo')
  and exists (
    select 1 from users u
    where u.hospital_id = h.id
      and u.role = 'reception'
      and u.is_active
  );
