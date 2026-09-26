-- The clinical state lifecycle: what an earlier visit's assessment or plan
-- is doing NOW, recorded as it changes rather than by editing the earlier
-- visit's own record (docs/clinical-state-vocabulary.md).
--
--   an assessment    healing, clinically / radiologically united, resolved,
--                    improving, in remission, recurred, back to active
--   a planned item   deferred (to a new date) or cancelled; "done" is not an
--                    event, it is the performing row's `fulfils_id`
--
-- Append-only: the latest event per target is its state; the history is the
-- course of the fracture. A device coming off is not here either: that is the
-- removal procedure itself (`removes_id`). Additive only.

create table if not exists public.clinical_state_events (
    id uuid primary key default gen_random_uuid(),
    patient_id uuid not null references public.patients(id) on delete cascade,
    -- the visit during which the change was recorded
    visit_id uuid references public.visits(id) on delete set null,
    assessment_id uuid references public.prescription_assessments(id) on delete cascade,
    intervention_id uuid references public.prescription_interventions(id) on delete cascade,
    status text not null check (status in (
        'active', 'healing', 'improving', 'clinically_united', 'radiologically_united',
        'resolved', 'remission', 'recurred',
        'deferred', 'cancelled'
    )),
    -- deferred: the new due date
    due_date date,
    created_at timestamptz not null default now(),
    -- exactly one target
    check ((assessment_id is null) <> (intervention_id is null)),
    -- plan states only on a planned item, clinical states only on an assessment
    check (
        (assessment_id is not null and status not in ('deferred', 'cancelled'))
        or (intervention_id is not null and status in ('deferred', 'cancelled'))
    )
);

create index if not exists clinical_state_events_patient_idx on public.clinical_state_events (patient_id, created_at desc);
create index if not exists clinical_state_events_assessment_idx on public.clinical_state_events (assessment_id);
create index if not exists clinical_state_events_intervention_idx on public.clinical_state_events (intervention_id);

alter table public.clinical_state_events enable row level security;
drop policy if exists clinical_state_events_hospital on public.clinical_state_events;
create policy clinical_state_events_hospital on public.clinical_state_events
    for all
    using (patient_id in (select p.id from public.patients p where p.hospital_id = public.current_user_hospital_id()))
    with check (patient_id in (select p.id from public.patients p where p.hospital_id = public.current_user_hospital_id()));

-- A deferral or cancellation taken back is recorded too ("active" again),
-- so a planned item may carry active / deferred / cancelled.
alter table public.clinical_state_events drop constraint if exists clinical_state_events_check1;
alter table public.clinical_state_events drop constraint if exists clinical_state_events_target_status;
alter table public.clinical_state_events add constraint clinical_state_events_target_status check (
    (assessment_id is not null and status not in ('deferred', 'cancelled'))
    or (intervention_id is not null and status in ('active', 'deferred', 'cancelled'))
);
