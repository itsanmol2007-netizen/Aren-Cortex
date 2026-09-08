-- ---------------------------------------------------------------------------
-- ONE ACTIVE CONSULT PER DOCTOR + PAYMENT AS A BACKBONE
--
-- Anmol, 2026-09-08. Two structural rules the consult workflow never had:
--
--   1. A doctor may have AT MOST ONE consult in the `serving` state at a
--      time. Everywhere (Cortex and Consult). Enforced by a partial unique
--      index, not by client bookkeeping — a reload, a logout, a second tab
--      must not be able to mint a second one.
--
--   2. If a doctor has a consultation fee configured, a visit CANNOT be
--      created without a paid/unpaid decision attached. `visit_payments`
--      stops being a fire-and-forget row written after the fact and becomes
--      part of the same atomic call that starts the visit. A doctor with no
--      fee set is untouched — no money question, no row, nothing changes.
--
-- `start_consult_visit()` is the single round trip the consult screen makes
-- to begin a visit: it resolves today's front-desk `waiting` row if there is
-- one (so a queued patient is not given a second disconnected visit), or
-- mints a new one, enforces both rules above, and records the payment — all
-- in one transaction. Front desk keeps using `createVisit` / `markVisitServing`
-- directly; only the doctor-side "start a consult" path routes through here.
--
-- The one-time DELETE below is safe because every clinic in this project is
-- test data today (confirmed with Anmol). It clears every in-progress consult
-- so the unique index can be built and the DB-backed "resume my consult"
-- prompt starts from a clean slate. `waiting` rows (live queue entries) are
-- deliberately left alone.
-- ---------------------------------------------------------------------------


-- ── One-time cleanup: drop every in-progress consult, all clinics ──────────
do $$
declare
  v_dead uuid[];
begin
  select array_agg(id) into v_dead
  from public.visits
  where status in ('serving', 'draft', 'in_progress', 'referred');

  if v_dead is not null then
    -- Child rows whose FK to visits is NO ACTION or absent — these would
    -- block the delete or leave orphans. Everything else (prescriptions,
    -- visit_payments, visit_payment_events, visit_story, dental_findings,
    -- diagnostic_orders, visit_body_sites / _gateways / _goal_scores /
    -- _impairments, visit_attachments) is ON DELETE CASCADE from visits.
    delete from public.coprescription_observations where visit_id = any(v_dead);
    delete from public.doctor_logs                  where visit_id = any(v_dead);
    delete from public.visit_findings               where visit_id = any(v_dead);
    delete from public.visit_symptoms               where visit_id = any(v_dead);
    delete from public.visit_observations           where visit_id = any(v_dead);
    delete from public.visit_measurements           where visit_id = any(v_dead);
    delete from public.decision_log                 where visit_id = any(v_dead);

    delete from public.visits where id = any(v_dead);

    raise notice 'start_consult_visit migration: cleared % in-progress visits', array_length(v_dead, 1);
  end if;
end $$;


-- ── Rule 1: at most one `serving` visit per doctor ───────────────────────
create unique index if not exists visits_one_serving_per_doctor
  on public.visits (assigned_doctor_id)
  where status = 'serving' and assigned_doctor_id is not null;

comment on index public.visits_one_serving_per_doctor is
  'A doctor sees one patient at a time. A second visit going `serving` for the '
  'same doctor raises unique_violation, which start_consult_visit() and '
  'markVisitServing surface as ACTIVE_CONSULT_EXISTS.';


-- ── Rule 2 + the atomic start: start_consult_visit() ─────────────────────
create or replace function public.start_consult_visit(
  p_patient_id       uuid,
  p_hospital_id      uuid,
  p_doctor_id        uuid,
  p_visit_type       text    default 'new',      -- 'new' | 'follow_up'
  p_pay_status       text    default null,       -- 'paid' | 'pending' | null (= no fee question)
  p_pay_method       text    default null,       -- 'cash' | 'upi' | 'card' | 'other'
  p_fee              numeric default 0,          -- base fee, pre-discount (visit_payments.fee)
  p_discount         numeric default 0,
  p_discount_kind    text    default 'none',
  p_discount_percent numeric default null,
  p_gst_percent      numeric default 0,
  p_gst_amount       numeric default 0
)
returns public.visits
language plpgsql
security definer
set search_path = public
as $$
declare
  v_visit      public.visits;
  v_doc_fee    numeric;
  v_token      bigint;
  v_actor      uuid := auth.uid();
  v_actor_name text;
  v_actor_role text;
  v_payment_id bigint;
begin
  -- A SECURITY DEFINER function must not become a cross-clinic door.
  -- Mirrors the visits.hospital_isolation RLS policy.
  if p_hospital_id is distinct from public.current_user_hospital_id() then
    raise exception 'FORBIDDEN: hospital mismatch';
  end if;

  if p_visit_type not in ('new', 'follow_up') then
    raise exception 'start_consult_visit: bad visit_type %', p_visit_type;
  end if;
  if p_pay_status is not null and p_pay_status not in ('paid', 'pending') then
    raise exception 'start_consult_visit: bad pay_status %', p_pay_status;
  end if;

  -- ── Rule 1: one active consult ────────────────────────────────────────
  -- Explicit check for a clean error message; the partial unique index is
  -- the real backstop against a race between two tabs.
  if exists (
    select 1 from public.visits
    where assigned_doctor_id = p_doctor_id and status = 'serving'
  ) then
    raise exception 'ACTIVE_CONSULT_EXISTS';
  end if;

  -- ── Rule 2: the fee gate ─────────────────────────────────────────────
  -- Checked BEFORE anything is written, so a rejected call leaves nothing
  -- behind. NULL fee = no money question; p_pay_status stays null and
  -- visit_payments is never touched.
  select consultation_fee into v_doc_fee from public.doctors where id = p_doctor_id;
  if v_doc_fee is not null and p_pay_status is null then
    raise exception 'PAYMENT_DECISION_REQUIRED';
  end if;

  -- ── Resolve the visit: reuse today's front-desk waiting row if present ─
  select * into v_visit
  from public.visits
  where patient_id = p_patient_id
    and hospital_id = p_hospital_id
    and status = 'waiting'
    and created_at >= date_trunc('day', now())
  order by created_at desc
  limit 1;

  if found then
    update public.visits
       set status = 'serving',
           started_at = now(),
           assigned_doctor_id = coalesce(assigned_doctor_id, p_doctor_id)
     where id = v_visit.id
     returning * into v_visit;
  else
    select coalesce(max(token_number), 0) + 1 into v_token
    from public.visits
    where hospital_id = p_hospital_id
      and created_at >= date_trunc('day', now());

    insert into public.visits (patient_id, hospital_id, assigned_doctor_id, status, token_number, started_at)
    values (p_patient_id, p_hospital_id, p_doctor_id, 'serving', v_token, now())
    returning * into v_visit;
  end if;

  -- ── Record the money decision, in the same transaction ───────────────
  if p_pay_status is not null then
    insert into public.visit_payments (
      visit_id, hospital_id, doctor_id, visit_type,
      fee, discount, discount_kind, discount_percent,
      gst_percent, gst_amount, status, method, collected_by
    ) values (
      v_visit.id, p_hospital_id, p_doctor_id, p_visit_type,
      coalesce(p_fee, 0), coalesce(p_discount, 0), coalesce(p_discount_kind, 'none'), p_discount_percent,
      case when p_gst_amount > 0 then p_gst_percent else 0 end, coalesce(p_gst_amount, 0),
      p_pay_status, p_pay_method, v_actor
    )
    on conflict (visit_id) do nothing
    returning id into v_payment_id;

    if v_payment_id is not null then
      select full_name, role into v_actor_name, v_actor_role
      from public.users where id = v_actor;

      insert into public.visit_payment_events (
        payment_id, visit_id, hospital_id, action,
        fee, discount, total, status, method, note,
        actor_id, actor_name, actor_role
      ) values (
        v_payment_id, v_visit.id, p_hospital_id,
        case when coalesce(p_discount, 0) > 0 then 'discounted' else 'recorded' end,
        coalesce(p_fee, 0), coalesce(p_discount, 0),
        coalesce(p_fee, 0) - coalesce(p_discount, 0) + coalesce(p_gst_amount, 0),
        p_pay_status, p_pay_method,
        case when p_discount_kind = 'percent' and p_discount_percent is not null
             then p_discount_percent::text || '% off' else null end,
        v_actor, v_actor_name, v_actor_role
      );
    end if;
  end if;

  return v_visit;
end $$;

comment on function public.start_consult_visit is
  'The doctor-side "start a consult" round trip. Resolves today''s front-desk '
  'waiting visit for the patient or mints a new serving one, enforces '
  'one-serving-per-doctor (ACTIVE_CONSULT_EXISTS) and the fee gate '
  '(PAYMENT_DECISION_REQUIRED when the doctor has a consultation_fee and no '
  'p_pay_status is given), and writes visit_payments + its first audit event '
  'atomically. Front desk keeps using createVisit/markVisitServing directly.';

revoke all on function public.start_consult_visit(uuid,uuid,uuid,text,text,text,numeric,numeric,text,numeric,numeric,numeric) from public;
grant execute on function public.start_consult_visit(uuid,uuid,uuid,text,text,text,numeric,numeric,text,numeric,numeric,numeric) to authenticated;
