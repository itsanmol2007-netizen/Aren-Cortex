-- ---------------------------------------------------------------------------
-- SPLIT PAYMENTS — one visit, two methods
--
-- Anmol, 2026-09-11: "we already asked if we are collecting this in UPI cash
-- or something, this will be a simple option of split payment... the total
-- consult fees is 500, and you click on split... you click on UPI, and then
-- you enter 400 there, and then you click on credit card... that will
-- automatically be adjusted with 100 INR."
--
-- `visit_payments` has `unique (visit_id)` (see the table's own comment) —
-- one payment row per visit, and a LOT of code reads it that way (Overview's
-- collected totals, the outstanding list, the queue's paid/unpaid badge,
-- `fetchTodayVisits`'s `paymentByVisit` map). Adding a SECOND row per visit
-- for the split's other half was the first attempt at this and it does not
-- work — either the unique constraint rejects the second insert outright, or
-- (were the constraint lifted) every one of those single-row readers starts
-- silently under-reporting whichever portion it doesn't happen to pick up.
--
-- Instead: the row stays singular. `fee`/`discount`/`gst_amount`/`total` keep
-- meaning exactly what they always have — the WHOLE visit's charge — and
-- `method` keeps naming the first (or only) portion's method. Two new nullable
-- columns carry the second portion: `split_method` (which method) and
-- `split_amount` (how much via it). The first portion's own amount is never
-- stored twice — it's `total - split_amount`, always. A non-split row simply
-- leaves both null, so every existing reader of `total`/`method` keeps working
-- unchanged; only the "collected by method" breakdown (Overview) needs to
-- know to add `split_amount` to `split_method`'s bucket instead of `method`'s.
-- ---------------------------------------------------------------------------

alter table public.visit_payments
  add column if not exists split_method text,
  add column if not exists split_amount numeric;

alter table public.visit_payments
  add constraint visit_payments_split_method_check
  check (split_method is null or split_method = any (array['cash', 'upi', 'card', 'other']));

alter table public.visit_payments
  add constraint visit_payments_split_amount_within_total
  check (split_amount is null or (split_amount >= 0 and split_amount <= total));

-- Both set or both null — a split amount with no split method (or vice
-- versa) is a half-written row, never a valid state.
alter table public.visit_payments
  add constraint visit_payments_split_pair
  check ((split_method is null) = (split_amount is null));

comment on column public.visit_payments.split_method is
  'Set only for a split payment — the SECOND method used. `method` stays the '
  'first (or only) portion''s method, same as before splits existed. Null for '
  'every plain, single-method payment.';
comment on column public.visit_payments.split_amount is
  'Set only for a split payment — rupees collected via `split_method`. The '
  'first portion (via `method`) is never stored redundantly: it is always '
  '`total - split_amount`.';


-- ── start_consult_visit(): two more (optional) params, same one insert ─────
-- Signature is genuinely changing (two new params), not just a body edit —
-- drop the old overload explicitly so callers can never resolve to a stale
-- one by argument count.
drop function if exists public.start_consult_visit(uuid, uuid, uuid, text, text, text, numeric, numeric, text, numeric, numeric, numeric);

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
  p_gst_amount       numeric default 0,
  p_split_method     text    default null,       -- 'cash' | 'upi' | 'card' | 'other', 2nd portion
  p_split_amount     numeric default null         -- rupees via p_split_method; the rest is via p_pay_method
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
  if p_split_amount is not null and (p_split_method is null or p_pay_method is null) then
    raise exception 'start_consult_visit: split_amount given without both methods';
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
      gst_percent, gst_amount, status, method, collected_by,
      split_method, split_amount
    ) values (
      v_visit.id, p_hospital_id, p_doctor_id, p_visit_type,
      coalesce(p_fee, 0), coalesce(p_discount, 0), coalesce(p_discount_kind, 'none'), p_discount_percent,
      case when p_gst_amount > 0 then p_gst_percent else 0 end, coalesce(p_gst_amount, 0),
      p_pay_status, p_pay_method, v_actor,
      p_split_method, p_split_amount
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
        case
          when p_split_method is not null then
            'split: ' || p_pay_method || ' ' || (coalesce(p_fee, 0) - coalesce(p_discount, 0) + coalesce(p_gst_amount, 0) - p_split_amount)::text
            || ' + ' || p_split_method || ' ' || p_split_amount::text
          when p_discount_kind = 'percent' and p_discount_percent is not null
            then p_discount_percent::text || '% off'
          else null
        end,
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
  'p_pay_status is given), and writes visit_payments (optionally split across '
  'p_pay_method + p_split_method) + its first audit event atomically. Front '
  'desk keeps using createVisit/markVisitServing directly.';

revoke all on function public.start_consult_visit(uuid,uuid,uuid,text,text,text,numeric,numeric,text,numeric,numeric,numeric,text,numeric) from public;
grant execute on function public.start_consult_visit(uuid,uuid,uuid,text,text,text,numeric,numeric,text,numeric,numeric,numeric,text,numeric) to authenticated;
