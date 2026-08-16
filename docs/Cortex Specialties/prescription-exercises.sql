-- ---------------------------------------------------------------------------
-- THE HOME EXERCISE PROGRAMME — one row per prescribed exercise.
--
-- ⚠ NOT APPLIED. Offered 2026-08-16 and declined at the permission prompt.
-- Nothing in the live database has been changed by this file.
--
-- ── What breaks until it is applied
--
-- Nothing catastrophic, deliberately. `useConsultLifecycle` catches the
-- failure, finishes the save, and puts a visible message in front of the
-- doctor: "Prescription saved, but the exercise programme did not." The visit,
-- the prescription, the medicines, the orders and the therapy notes all commit
-- normally, because they commit BEFORE this write.
--
-- What is lost while it is missing:
--   · the programme is not in the record, so the printed sheet is the only
--     copy the patient has;
--   · next session's Progressed / Same / Eased badges have no baseline, so
--     every exercise reads as newly added, every session.
--
-- The card itself works without it — doses edit, sides split, the plan rail
-- and both print surfaces render — so this is a persistence gap, not a broken
-- screen.
--
-- ── Why the dose is columns and not prose
--
-- Until 2026-08-16 an accepted exercise became a line of text in
-- `prescriptions.advice_notes`, beside referrals and general advice.
-- "Straight leg raise — 3 sets x 12" is a sentence that happens to contain
-- digits, and two sentences cannot be compared. Physiotherapy's whole
-- longitudinal value is that comparison (cortex-longitudinal-spec §5: "a
-- physio opening session 9 needs what was prescribed last session so they can
-- progress it rather than repeat it").
--
-- ── The two constraints, and what each one is actually stopping
--
-- `one_unit` — an exercise is counted OR held, never both. The card switches
-- between the two, so the UI cannot produce a row with both; the constraint is
-- what stops an import or a future code path storing a row that
-- `progressionOf` would then have to guess about.
--
-- `positive` — zero sets is not a prescription, and a zero would sail through
-- the volume maths as a legitimate number and report a real programme as
-- having no load.
--
-- Related: src/features/consult/exercisePlan.ts (the comparison model, 54
-- assertions in `npm run check:exercise`) and src/lib/db/exercises.ts.
-- ---------------------------------------------------------------------------

create table if not exists public.prescription_exercises (
    id uuid primary key default gen_random_uuid(),
    prescription_id uuid not null references public.prescriptions(id) on delete cascade,
    -- Null for an exercise typed freehand rather than taken from the
    -- catalogue. `exercisePlan.identityOf` falls back to the label for those.
    intent_id bigint references public.intents(id),
    label text not null,
    sets integer,
    reps integer,
    hold_seconds integer,
    per_day integer,
    -- Left and right are two prescriptions, not one with an annotation: a
    -- physio progressing the operated side while holding the other needs them
    -- to move independently.
    side text check (side is null or side = any (array['left'::text, 'right'::text, 'both'::text])),
    notes text,
    sort_order integer,
    created_at timestamptz not null default now(),
    constraint prescription_exercises_one_unit check (reps is null or hold_seconds is null),
    constraint prescription_exercises_positive check (
        (sets is null or sets > 0) and
        (reps is null or reps > 0) and
        (hold_seconds is null or hold_seconds > 0) and
        (per_day is null or per_day > 0)
    )
);

create index if not exists prescription_exercises_prescription_idx
    on public.prescription_exercises (prescription_id);

-- Same posture as `prescription_medicines`, verified against it rather than
-- written from memory: isolate through the prescription's hospital.
alter table public.prescription_exercises enable row level security;

create policy hospital_isolation on public.prescription_exercises
  for all
  using (
    prescription_id in (
      select prescriptions.id from public.prescriptions
      where prescriptions.hospital_id = current_user_hospital_id()
    )
  )
  with check (
    prescription_id in (
      select prescriptions.id from public.prescriptions
      where prescriptions.hospital_id = current_user_hospital_id()
    )
  );

-- ── Verify after applying ──────────────────────────────────────────────────
-- select count(*) from pg_policy p join pg_class c on c.oid = p.polrelid
--   where c.relname = 'prescription_exercises';                  -- expect 1
-- Anything other than 1 means the table is inert: RLS enabled with no policy
-- denies every read and write, and a denied READ comes back as an empty set
-- rather than an error. That is exactly how `care_plans` sat unused and
-- unnoticed until 2026-08-16 — atlas §14.23.
