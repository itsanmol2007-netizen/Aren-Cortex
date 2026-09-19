-- Follow-up reminders go from "on for everyone the moment a cron fires" to
-- "off everywhere until a clinic turns it on" — a clinic setting, not an
-- assumption.
--
-- Anmol, 2026-09-14: "keep it disabled by default. It could be enabled into
-- clinic setting page... I didn't even had approved any follow-up thing
-- because there shouldn't be anything of rescheduling a follow-up. It
-- should be just a message that, oh, here is a follow-up, you can come.
-- Just to remind them, not a rescheduling thing... we don't have that
-- infrastructure yet."
--
-- Two things follow from that:
--   1. The cron (`aren-follow-up-reminders`) was unscheduled the moment
--      this was raised — nothing has ever sent a real follow-up (confirmed:
--      zero rows in `whatsapp_messages` with purpose='follow_up' before
--      this migration), so there is no live behaviour to migrate away from,
--      only a switch to add before it is ever turned back on.
--   2. `follow-up-cron`'s own candidate query must now check this flag —
--      done in the same deploy as this migration, never a client-only gate
--      a doctor could bypass by hitting the function directly.
--
-- Hospital-level, not per-doctor: a follow-up reminder goes out under the
-- CLINIC's name (see `messaging-send`'s `clinicName`), and whether that
-- clinic wants to send them at all is the clinic's own decision — the same
-- level `clinic_hours`/`prescription_config` already live at.
alter table hospitals
    add column if not exists follow_up_reminders_enabled boolean not null default false;

comment on column hospitals.follow_up_reminders_enabled is
    'Whether follow-up-cron may send reminders for this clinic. Default OFF — a clinic opts in from the Clinic page, not the other way round.';
