-- Where a doctor is in their first-run walkthrough.
--
-- Anmol, 2026-09-14: "add a beautiful ui and ux walkthrough for the very
-- first sign in of a new user, to guide what to do... without being
-- overwhelming" — and, on the shape: "with actual pointing in ui to those
-- buttons and all... and skippable if they want."
--
-- On `doctors`, not `users`, because this is scoped to the Cortex consult
-- workspace only — front desk and admin land on entirely different apps
-- (`homeRouteForRole`) and get nothing from these hints. A front-desk user
-- has no `doctors` row to carry state on, which is exactly right.
--
-- SERVER-SIDE, not localStorage, and that is the whole point of a column
-- rather than a browser key: a doctor who starts on the clinic desktop and
-- opens the same account on a tablet has already been walked through it.
-- Re-running the hints there would be the app forgetting a conversation it
-- already had.
--
-- One jsonb rather than three booleans because the `seen` list grows as
-- hints are added, and a migration per hint is a migration too many:
--   { "welcomed": true,          -- has seen (or skipped past) the welcome
--     "skipped":  true,          -- asked to be left alone; nothing more fires
--     "seen":     ["consult.start", "case.search"] }
-- Absent/null means "brand new" — the default for every doctor who exists
-- today, which is the correct reading of a column that did not exist when
-- their row was written.
alter table doctors
    add column if not exists onboarding_state jsonb;

comment on column doctors.onboarding_state is
    'First-run walkthrough progress for the Cortex workspace: {welcomed, skipped, seen[]}. Null = never started. Doctors only — front desk/admin have no walkthrough.';
