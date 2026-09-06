-- ---------------------------------------------------------------------------
-- AREN MESSAGING CREDITS — the ledger, the packages, the recharge queue.
--
-- Communication V1 gives every doctor an internal currency (AREN Messaging
-- Credits) and spends one per successfully sent WhatsApp message. This
-- migration is the machinery under that sentence.
--
-- ── Why a ledger and not a balance column
--
-- A single `credits_remaining` integer is the obvious shape and it is the
-- wrong one. It cannot answer "where did 4,700 credits go", it cannot be
-- reconciled after a provider outage, and two concurrent sends racing on
-- `credits = credits - 1` silently lose one. An append-only ledger answers
-- all three: the balance is `sum(delta)`, every movement names its own reason,
-- and a failed send is a REFUND row sitting visibly next to the MESSAGE_DEBIT
-- it reverses rather than a number that quietly went back up.
--
-- The doctor never sees any of this. They see "4,999 Message Credits".
--
-- ── Why the doctor cannot write to any of it
--
-- There is no INSERT policy on the ledger. None. A doctor who could insert a
-- ledger row could grant themselves credits, which is the entire thing this
-- design exists to prevent. Debits are written by `server/` under the service
-- role; grants are written by an approved recharge request. The one table a
-- doctor may insert into is `credit_recharge_requests`, and its WITH CHECK
-- pins the status to 'pending' — asking is not receiving.
--
-- ── What is deliberately NOT here
--
-- No payment gateway, no `payments` table, no webhook. V1 recharges are
-- verified by a human and approved by hand. When a gateway lands it replaces
-- exactly one step — what flips a request to 'approved' — and every table
-- below stays as it is. That is why `credit_recharge_requests` carries the
-- money fields (`amount`, `currency`) even though nothing charges them yet:
-- the row is already the shape a payment reference attaches to.
-- ---------------------------------------------------------------------------


-- ── 1. Packages — what a doctor can buy ────────────────────────────────────
--
-- DATA, not a constant in the frontend bundle. Anmol's V1 spec: "the exact
-- pricing should be configurable from the backend, not hardcoded into the
-- UI", so changing a price is an UPDATE rather than a release. Same argument
-- `plans`/`plan_entitlements` already won for subscriptions.

create table if not exists public.messaging_credit_packages (
    id          bigint generated always as identity primary key,
    code        text not null unique,
    label       text not null,
    credits     integer not null check (credits > 0),
    amount      numeric(10, 2) not null check (amount >= 0),
    currency    text not null default 'INR',
    is_active   boolean not null default true,
    sort_order  integer not null default 0,
    created_at  timestamptz not null default now()
);

comment on table public.messaging_credit_packages is
    'Buyable credit bundles. Rows, not code — AREN changes a price with an UPDATE and every client picks it up on next load. `code` is the stable key a recharge request stores, so a later price change never rewrites what an old request was actually sold at.';

insert into public.messaging_credit_packages (code, label, credits, amount, sort_order)
values
    ('starter_500',  '500 credits',   500,  300.00, 1),
    ('plus_900',     '900 credits',   900,  500.00, 2),
    ('pro_2000',     '2,000 credits', 2000, 1000.00, 3),
    ('scale_4500',   '4,500 credits', 4500, 2000.00, 4)
on conflict (code) do nothing;

alter table public.messaging_credit_packages enable row level security;

-- Every signed-in user may read the price list. There is no write policy:
-- pricing is AREN's, changed under the service role.
drop policy if exists messaging_credit_packages_select on public.messaging_credit_packages;
create policy messaging_credit_packages_select
    on public.messaging_credit_packages
    for select
    to authenticated
    using (is_active);


-- ── 2. The ledger ──────────────────────────────────────────────────────────

create table if not exists public.messaging_credit_ledger (
    id           bigint generated always as identity primary key,
    hospital_id  uuid not null references public.hospitals(id) on delete cascade,
    -- The wallet's owner. Credits are per DOCTOR, not per clinic: the free
    -- allocation is "every doctor receives 5,000", and a multi-bench clinic
    -- where one doctor's follow-ups drain another's balance would be a
    -- support ticket on day one.
    doctor_id    uuid not null references public.doctors(id) on delete cascade,

    kind         text not null,
    -- Signed. A debit is negative, so the balance is a plain sum and no
    -- reader has to know which kinds subtract.
    delta        integer not null,

    -- What this movement was about, when there is something to point at.
    message_id            bigint references public.whatsapp_messages(id) on delete set null,
    recharge_request_id   bigint,
    reverses_ledger_id    bigint references public.messaging_credit_ledger(id) on delete set null,

    note         text,
    created_by   uuid references public.users(id) on delete set null,
    created_at   timestamptz not null default now(),

    constraint messaging_credit_ledger_kind_check check (
        kind in ('FREE_ALLOCATION', 'PURCHASE', 'MESSAGE_DEBIT', 'REFUND', 'ADMIN_ADJUSTMENT')
    ),
    -- Direction is a property of the kind, not of the caller. A MESSAGE_DEBIT
    -- that credits, or a PURCHASE that debits, is a bug we would rather see as
    -- a constraint violation at 3am than as a wrong balance next quarter.
    constraint messaging_credit_ledger_direction_check check (
        (kind in ('FREE_ALLOCATION', 'PURCHASE', 'REFUND') and delta > 0)
        or (kind = 'MESSAGE_DEBIT' and delta < 0)
        or (kind = 'ADMIN_ADJUSTMENT')
    )
);

comment on table public.messaging_credit_ledger is
    'Append-only record of every messaging-credit movement. Balance = sum(delta) per doctor. There is deliberately no UPDATE or DELETE policy and no client INSERT policy: a ledger a doctor can write is not a ledger. Debits come from server/ under the service role; grants come from an approved recharge request.';

comment on column public.messaging_credit_ledger.reverses_ledger_id is
    'Set on a REFUND to name the MESSAGE_DEBIT it undoes. A provider failure therefore reads as two visible rows rather than a number that quietly went back up — which is what "handle the credit appropriately rather than silently losing it" actually requires.';

create index if not exists messaging_credit_ledger_doctor_idx
    on public.messaging_credit_ledger (doctor_id, created_at desc);
create index if not exists messaging_credit_ledger_hospital_idx
    on public.messaging_credit_ledger (hospital_id, created_at desc);
-- One MESSAGE_DEBIT per message, enforced rather than trusted: a retry loop
-- that re-debits an already-charged message is the classic way a ledger
-- starts disagreeing with reality.
create unique index if not exists messaging_credit_ledger_one_debit_per_message
    on public.messaging_credit_ledger (message_id)
    where kind = 'MESSAGE_DEBIT' and message_id is not null;

alter table public.messaging_credit_ledger enable row level security;

drop policy if exists messaging_credit_ledger_select on public.messaging_credit_ledger;
create policy messaging_credit_ledger_select
    on public.messaging_credit_ledger
    for select
    to authenticated
    using (hospital_id = public.current_user_hospital_id());


-- ── 3. Balances — derived, never stored ────────────────────────────────────
--
-- LOW_CREDITS is a VIEW, for the same reason `managed` is not a fourth
-- clinic_mode (docs/context/parallax-admin.md): a doctor is low on credits
-- the moment their balance crosses 100 and not low the moment it doesn't,
-- with no migration in between. A stored flag would need a job to keep it
-- honest and would be wrong between runs.

create or replace view public.messaging_credit_balances
with (security_invoker = true) as
select
    d.id                                        as doctor_id,
    d.hospital_id                               as hospital_id,
    d.name                                      as doctor_name,
    coalesce(sum(l.delta), 0)::integer          as balance,
    coalesce(sum(l.delta) filter (where l.kind in ('FREE_ALLOCATION', 'PURCHASE', 'ADMIN_ADJUSTMENT') and l.delta > 0), 0)::integer as granted,
    coalesce(-sum(l.delta) filter (where l.kind = 'MESSAGE_DEBIT'), 0)::integer as spent,
    coalesce(sum(l.delta) filter (where l.kind = 'REFUND'), 0)::integer as refunded,
    max(l.created_at)                           as last_movement_at,
    case
        when coalesce(sum(l.delta), 0) <= 0  then 'EXHAUSTED'
        when coalesce(sum(l.delta), 0) < 100 then 'LOW_CREDITS'
        else 'OK'
    end                                         as status
from public.doctors d
left join public.messaging_credit_ledger l on l.doctor_id = d.id
group by d.id, d.hospital_id, d.name;

comment on view public.messaging_credit_balances is
    'One row per doctor: balance, lifetime granted/spent/refunded, and the LOW_CREDITS/EXHAUSTED flag AREN''s support team watches. Derived from the ledger on read — there is no stored balance to drift. security_invoker means a clinic sees only its own doctors, through the ledger''s own RLS.';


-- ── 4. Recharge requests ───────────────────────────────────────────────────

create table if not exists public.credit_recharge_requests (
    id                 bigint generated always as identity primary key,
    hospital_id        uuid not null references public.hospitals(id) on delete cascade,
    doctor_id          uuid not null references public.doctors(id) on delete cascade,
    requested_by       uuid references public.users(id) on delete set null,

    -- Both the id and the code. The id is the join; the code is what the row
    -- was actually sold as, and survives the package being repriced or
    -- retired later.
    package_id         bigint references public.messaging_credit_packages(id) on delete set null,
    package_code       text not null,
    package_label      text not null,

    credits            integer not null check (credits > 0),
    amount             numeric(10, 2) not null check (amount >= 0),
    currency           text not null default 'INR',

    -- What the doctor's balance was when they asked. Support reads this to
    -- judge urgency, and it is meaningless to recompute later.
    balance_at_request integer not null default 0,

    status             text not null default 'pending',
    note               text,

    decided_at         timestamptz,
    decided_by         uuid references public.users(id) on delete set null,
    decision_note      text,
    -- The ledger row an approval produced. Non-null exactly when credits
    -- actually landed, so "approved but never credited" is a state you can
    -- query for rather than a story you have to reconstruct.
    ledger_id          bigint references public.messaging_credit_ledger(id) on delete set null,

    created_at         timestamptz not null default now(),

    constraint credit_recharge_requests_status_check check (
        status in ('pending', 'approved', 'rejected', 'expired')
    )
);

comment on table public.credit_recharge_requests is
    'A doctor ASKING to buy credits — not a purchase. V1 has no payment gateway: AREN contacts the doctor, verifies payment by whatever manual method is in use, and an admin approves, which is what actually writes the PURCHASE ledger row. Old requests are never deleted; they are the billing history until a gateway exists. When one lands it replaces exactly one step (what flips this to approved) and nothing else here changes.';

create index if not exists credit_recharge_requests_status_idx
    on public.credit_recharge_requests (status, created_at desc);
create index if not exists credit_recharge_requests_hospital_idx
    on public.credit_recharge_requests (hospital_id, created_at desc);
-- A doctor has at most one open request. Pressing "Request recharge" twice
-- must not create two things for support to reconcile.
create unique index if not exists credit_recharge_requests_one_pending_per_doctor
    on public.credit_recharge_requests (doctor_id)
    where status = 'pending';

alter table public.credit_recharge_requests enable row level security;

drop policy if exists credit_recharge_requests_select on public.credit_recharge_requests;
create policy credit_recharge_requests_select
    on public.credit_recharge_requests
    for select
    to authenticated
    using (hospital_id = public.current_user_hospital_id());

-- A doctor may ASK. The WITH CHECK is what makes that different from
-- receiving: status is pinned to 'pending', and none of the decision columns
-- can be set on the way in.
drop policy if exists credit_recharge_requests_insert on public.credit_recharge_requests;
create policy credit_recharge_requests_insert
    on public.credit_recharge_requests
    for insert
    to authenticated
    with check (
        hospital_id = public.current_user_hospital_id()
        and status = 'pending'
        and decided_at is null
        and decided_by is null
        and ledger_id is null
    );

-- Deliberately no UPDATE and no DELETE policy. Approving is a service-role
-- operation (see approve_credit_recharge below); withdrawing a request is not
-- a V1 feature, and a doctor who could UPDATE their own row could set
-- status = 'approved'.


-- ── 5. The free allocation ─────────────────────────────────────────────────
--
-- "Every doctor receives 5,000 Messaging Credits." Implemented as a real
-- FREE_ALLOCATION ledger row rather than a starting number, so the balance
-- arithmetic has exactly one shape and a doctor's first credit and their
-- five-thousandth were granted the same way.

create or replace function public.grant_messaging_free_allocation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    -- A doctor with no clinic has no wallet to fund yet; the row is created
    -- when they are attached to one.
    if new.hospital_id is null then
        return new;
    end if;

    insert into public.messaging_credit_ledger (hospital_id, doctor_id, kind, delta, note)
    select new.hospital_id, new.id, 'FREE_ALLOCATION', 5000, 'Included with the plan'
    where not exists (
        select 1 from public.messaging_credit_ledger
        where doctor_id = new.id and kind = 'FREE_ALLOCATION'
    );

    return new;
end;
$$;

comment on function public.grant_messaging_free_allocation() is
    'Gives a doctor their 5,000 included credits, once, as a FREE_ALLOCATION ledger row. Idempotent by the NOT EXISTS guard, so it is safe on both INSERT and the UPDATE that first attaches a doctor to a clinic.';

drop trigger if exists doctors_grant_messaging_credits on public.doctors;
create trigger doctors_grant_messaging_credits
    after insert or update of hospital_id on public.doctors
    for each row
    execute function public.grant_messaging_free_allocation();

-- Backfill: every doctor who already exists gets theirs now.
insert into public.messaging_credit_ledger (hospital_id, doctor_id, kind, delta, note)
select d.hospital_id, d.id, 'FREE_ALLOCATION', 5000, 'Included with the plan'
from public.doctors d
where d.hospital_id is not null
  and not exists (
      select 1 from public.messaging_credit_ledger l
      where l.doctor_id = d.id and l.kind = 'FREE_ALLOCATION'
  );


-- ── 6. Spending, atomically ────────────────────────────────────────────────
--
-- The one write path for a debit. `server/` could do check-then-insert in
-- JavaScript, and two prescriptions finishing in the same instant would both
-- read 1 credit and both spend it. A transaction-scoped advisory lock on the
-- doctor makes the check and the insert one indivisible step.
--
-- Raises rather than returning a falsy value: "no message should be sent
-- without sufficient credits" is a rule that should stop a caller, not one a
-- caller can forget to read the return value of.

create or replace function public.debit_messaging_credit(
    p_doctor_id   uuid,
    p_credits     integer default 1,
    p_message_id  bigint  default null,
    p_note        text    default null
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
    v_hospital_id uuid;
    v_balance     integer;
    v_ledger_id   bigint;
begin
    if p_credits is null or p_credits <= 0 then
        raise exception 'debit_messaging_credit: credits must be positive, got %', p_credits;
    end if;

    select hospital_id into v_hospital_id from public.doctors where id = p_doctor_id;
    if v_hospital_id is null then
        raise exception 'debit_messaging_credit: no doctor % attached to a clinic', p_doctor_id;
    end if;

    -- Held until this transaction ends. Serialises every debit for ONE doctor
    -- and blocks nothing for any other.
    perform pg_advisory_xact_lock(hashtextextended(p_doctor_id::text, 0));

    select coalesce(sum(delta), 0) into v_balance
    from public.messaging_credit_ledger
    where doctor_id = p_doctor_id;

    if v_balance < p_credits then
        raise exception 'INSUFFICIENT_CREDITS: balance %, needed %', v_balance, p_credits
            using errcode = 'check_violation';
    end if;

    insert into public.messaging_credit_ledger
        (hospital_id, doctor_id, kind, delta, message_id, note)
    values
        (v_hospital_id, p_doctor_id, 'MESSAGE_DEBIT', -p_credits, p_message_id, p_note)
    returning id into v_ledger_id;

    return v_ledger_id;
end;
$$;

comment on function public.debit_messaging_credit(uuid, integer, bigint, text) is
    'Spend credits for one message, atomically. Takes a per-doctor advisory lock so a balance check and its debit cannot be interleaved by a concurrent send. Raises INSUFFICIENT_CREDITS rather than returning null — a caller must not be able to send by forgetting to check a return value.';

-- Service role only. `revoke from public` is the load-bearing line: a
-- SECURITY DEFINER function is executable by anyone by default, and this one
-- writes the ledger.
revoke all on function public.debit_messaging_credit(uuid, integer, bigint, text) from public;
revoke all on function public.debit_messaging_credit(uuid, integer, bigint, text) from anon;
revoke all on function public.debit_messaging_credit(uuid, integer, bigint, text) from authenticated;
grant execute on function public.debit_messaging_credit(uuid, integer, bigint, text) to service_role;


-- ── 7. Refunding a send that never landed ──────────────────────────────────

create or replace function public.refund_messaging_credit(
    p_ledger_id bigint,
    p_note      text default null
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
    v_debit   public.messaging_credit_ledger%rowtype;
    v_refund  bigint;
begin
    select * into v_debit from public.messaging_credit_ledger where id = p_ledger_id;
    if not found then
        raise exception 'refund_messaging_credit: no ledger row %', p_ledger_id;
    end if;
    if v_debit.kind <> 'MESSAGE_DEBIT' then
        raise exception 'refund_messaging_credit: row % is a %, not a MESSAGE_DEBIT', p_ledger_id, v_debit.kind;
    end if;

    -- Idempotent: a retry of the same failure handler must not pay the doctor
    -- twice. Returns the existing refund instead of raising, because the
    -- caller's intent ("this debit should be reversed") is already satisfied.
    select id into v_refund
    from public.messaging_credit_ledger
    where reverses_ledger_id = p_ledger_id and kind = 'REFUND'
    limit 1;
    if v_refund is not null then
        return v_refund;
    end if;

    insert into public.messaging_credit_ledger
        (hospital_id, doctor_id, kind, delta, message_id, reverses_ledger_id, note)
    values
        (v_debit.hospital_id, v_debit.doctor_id, 'REFUND', -v_debit.delta,
         v_debit.message_id, v_debit.id,
         coalesce(p_note, 'Message could not be delivered'))
    returning id into v_refund;

    return v_refund;
end;
$$;

comment on function public.refund_messaging_credit(bigint, text) is
    'Reverses one MESSAGE_DEBIT after a provider failure. Idempotent — a repeated failure handler returns the existing refund rather than paying twice.';

revoke all on function public.refund_messaging_credit(bigint, text) from public;
revoke all on function public.refund_messaging_credit(bigint, text) from anon;
revoke all on function public.refund_messaging_credit(bigint, text) from authenticated;
grant execute on function public.refund_messaging_credit(bigint, text) to service_role;


-- ── 8. Approving a recharge ────────────────────────────────────────────────
--
-- The single step a payment gateway will one day replace. Everything before
-- it (the request) and after it (the PURCHASE ledger row, the balance) stays
-- exactly as it is.

create or replace function public.approve_credit_recharge(
    p_request_id bigint,
    p_admin_user_id uuid default null,
    p_note text default null
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
    v_req    public.credit_recharge_requests%rowtype;
    v_ledger bigint;
begin
    select * into v_req from public.credit_recharge_requests where id = p_request_id for update;
    if not found then
        raise exception 'approve_credit_recharge: no request %', p_request_id;
    end if;
    if v_req.status <> 'pending' then
        raise exception 'approve_credit_recharge: request % is already %', p_request_id, v_req.status;
    end if;

    insert into public.messaging_credit_ledger
        (hospital_id, doctor_id, kind, delta, recharge_request_id, note, created_by)
    values
        (v_req.hospital_id, v_req.doctor_id, 'PURCHASE', v_req.credits, v_req.id,
         coalesce(p_note, v_req.package_label), p_admin_user_id)
    returning id into v_ledger;

    update public.credit_recharge_requests
    set status = 'approved',
        decided_at = now(),
        decided_by = p_admin_user_id,
        decision_note = p_note,
        ledger_id = v_ledger
    where id = p_request_id;

    return v_ledger;
end;
$$;

comment on function public.approve_credit_recharge(bigint, uuid, text) is
    'Turns a pending recharge request into real credits. The one manual step V1 has instead of a payment gateway; a gateway webhook will call this same function after verifying a payment, and nothing else in the credit system changes.';

revoke all on function public.approve_credit_recharge(bigint, uuid, text) from public;
revoke all on function public.approve_credit_recharge(bigint, uuid, text) from anon;
revoke all on function public.approve_credit_recharge(bigint, uuid, text) from authenticated;
grant execute on function public.approve_credit_recharge(bigint, uuid, text) to service_role;


-- ── 9. What a message cost, and what it was for ────────────────────────────
--
-- `whatsapp_messages` already carries direction, status and template name.
-- Two things it cannot answer that Communication V1 asks on every row: which
-- doctor's wallet paid for this, and was this a prescription or a follow-up.
-- `template_name` is Meta's vocabulary and changes when a template is
-- re-approved under a new name — the doctor's two categories must not be
-- derived from it.

alter table public.whatsapp_messages
    add column if not exists doctor_id uuid references public.doctors(id) on delete set null,
    add column if not exists purpose text,
    add column if not exists credits_charged integer not null default 0;

comment on column public.whatsapp_messages.purpose is
    'AREN''s own category for this message — prescription, follow_up, reply, booking, other. Deliberately NOT derived from template_name: that is Meta''s vocabulary and changes whenever a template is re-approved, and the doctor''s two categories must survive that.';
comment on column public.whatsapp_messages.credits_charged is
    'Credits actually consumed, after any refund. 0 for inbound messages and for a send that failed and was refunded.';

do $$
begin
    if not exists (
        select 1 from pg_constraint where conname = 'whatsapp_messages_purpose_check'
    ) then
        alter table public.whatsapp_messages
            add constraint whatsapp_messages_purpose_check
            check (purpose is null or purpose in ('prescription', 'follow_up', 'reply', 'booking', 'other'));
    end if;
end $$;

create index if not exists whatsapp_messages_doctor_created_idx
    on public.whatsapp_messages (doctor_id, created_at desc);


-- ── 10. Support email log ──────────────────────────────────────────────────
--
-- Every operational email AREN sends itself, recorded. Not decoration: an
-- email that silently failed to send is indistinguishable from one nobody
-- read, and a low-credit alert that never arrived is a doctor who stops
-- being able to message patients with no warning to anybody.

create table if not exists public.support_email_log (
    id           bigint generated always as identity primary key,
    kind         text not null,
    to_address   text not null,
    subject      text not null,
    status       text not null default 'sent',
    error_detail text,

    hospital_id  uuid references public.hospitals(id) on delete set null,
    doctor_id    uuid references public.doctors(id) on delete set null,
    -- Enough to re-send or to answer "what did that email actually say"
    -- without keeping the rendered HTML.
    context      jsonb not null default '{}'::jsonb,

    created_at   timestamptz not null default now(),

    constraint support_email_log_status_check check (status in ('sent', 'failed'))
);

comment on table public.support_email_log is
    'Every operational email AREN sent itself — recharge requests, low-credit alerts, provider failures. Service-role only: it is AREN''s own record, not the clinic''s. A "failed" row is the alert that the alerting broke.';

create index if not exists support_email_log_kind_idx
    on public.support_email_log (kind, created_at desc);

alter table public.support_email_log enable row level security;
-- No policy at all. Service role bypasses RLS; nobody else has any access,
-- which is the intent — this is AREN's operational record, not a clinic's.


-- ── 11. Suppressing duplicate low-credit alerts ────────────────────────────
--
-- The alert fires on a threshold crossing, and a doctor sitting at 73 credits
-- crosses nothing — but every send re-evaluates it. Without a memory of the
-- last alert, support gets one email per message for the rest of the day.

create table if not exists public.messaging_alert_state (
    doctor_id        uuid primary key references public.doctors(id) on delete cascade,
    last_low_alert_at   timestamptz,
    last_low_alert_balance integer,
    last_zero_alert_at  timestamptz,
    updated_at       timestamptz not null default now()
);

comment on table public.messaging_alert_state is
    'When AREN last emailed itself about this doctor''s credits. Exists purely so a doctor parked below the threshold produces one alert, not one per message sent. Service-role only.';

alter table public.messaging_alert_state enable row level security;
