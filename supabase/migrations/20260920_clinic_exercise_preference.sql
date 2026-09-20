-- The physiotherapy Practice-page analog of clinic_brand_preference --
-- which exercises this clinic actually prescribes, and the dose they
-- start on by default. Exercises are flat intents (type='exercise' on the
-- shared `intents` table, same catalog ExercisePlanCard's search already
-- reads via useIntentSearch(["exercise"])) -- no composition/brand split
-- the way medicine has, so one row per (hospital, intent) is enough.
--
-- default_sets/default_reps/default_hold_seconds/default_per_day mirror
-- ExerciseDose (exercisePlan.ts) exactly, so a saved default can be spread
-- onto a new ExerciseLine with no shape translation. All nullable --
-- saving a preferred exercise with no dose filled in is a real, useful
-- state (it still elevates the exercise into "used often", it just falls
-- back to doseFor()'s generic 3x10 same as an unpreferred exercise
-- would). reps and hold_seconds are alternatives in practice (see
-- ExerciseDose's own comment), never enforced as mutually exclusive here
-- for the same reason clinic_medicine_prices doesn't enforce pack_units
-- being sane beyond >0 -- the UI is what keeps the common case sane, the
-- column just stores what was typed.
create table clinic_exercise_preference (
    hospital_id uuid not null references hospitals(id) on delete cascade,
    intent_id bigint not null references intents(id) on delete cascade,
    default_sets int,
    default_reps int,
    default_hold_seconds int,
    default_per_day int,
    notes text not null default '',
    set_by uuid references users(id),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    primary key (hospital_id, intent_id)
);

comment on table clinic_exercise_preference is
    'Per-clinic exercise library for physiotherapy -- which exercises this practice actually prescribes, and the dose (sets/reps/hold/per-day) a newly accepted line starts on instead of the generic doseFor() default. Practice-page management today; useConsultPlan.ts wiring to prefill the dose on accept is a separate, later pass.';

alter table clinic_exercise_preference enable row level security;

-- `for all`, not `for insert` -- an insert-only policy leaves PostgREST's
-- upsert-with-.select() unable to read back the row it just wrote (the
-- doctor_photo_handoffs bug, 2026-09-19). Same working shape every other
-- clinic_* preference table in this codebase already uses.
create policy clinic_exercise_preference_hospital_isolation on clinic_exercise_preference
    for all
    using (hospital_id = current_user_hospital_id())
    with check (hospital_id = current_user_hospital_id());

create trigger clinic_exercise_preference_set_updated_at
    before update on clinic_exercise_preference
    for each row execute function set_updated_at();
