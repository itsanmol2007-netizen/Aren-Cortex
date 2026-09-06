-- ---------------------------------------------------------------------------
-- WITHDRAWING A RECHARGE REQUEST
--
-- A doctor asks for credits, and then nobody calls. Before this, that was a
-- dead end: `credit_recharge_requests` has a unique partial index allowing one
-- PENDING row per doctor, so the request that nobody actioned also blocked
-- them from raising a fresh one. The only way out was AREN rejecting it.
--
-- ── Why three hours, and not zero
--
-- The whole point of a request is that a human reads it and calls back.
-- Letting it be withdrawn instantly turns the support queue into something
-- that churns while somebody is mid-call about it. Making it permanent
-- strands a doctor whose request was simply missed. Three hours is long
-- enough that support has genuinely had a shot at it, short enough that a
-- doctor who needs credits today is not blocked until tomorrow.
--
-- ── Why an RPC and not an UPDATE policy
--
-- RLS cannot see the OLD row. A policy permissive enough to let a doctor set
-- `status = 'cancelled'` would also let them rewrite `credits` and `amount` —
-- the two columns that say what they are owed — because `WITH CHECK` only
-- inspects the row being written. A SECURITY DEFINER function changes exactly
-- one column and nothing else can ride along.
--
-- The three-hour rule therefore lives in the DATABASE. The UI also hides the
-- button until then, but a hidden button is a suggestion; this is the rule.
-- ---------------------------------------------------------------------------

alter table public.credit_recharge_requests
    drop constraint if exists credit_recharge_requests_status_check;

alter table public.credit_recharge_requests
    add constraint credit_recharge_requests_status_check
    check (status in ('pending', 'approved', 'rejected', 'expired', 'cancelled'));

comment on column public.credit_recharge_requests.status is
    'pending -> approved | rejected | expired | cancelled. "cancelled" is the DOCTOR withdrawing their own ask after waiting; every other transition is AREN''s. A cancelled row is never deleted — it is why a second request for the same doctor exists.';

create or replace function public.cancel_credit_recharge(p_request_id bigint)
returns boolean
language plpgsql
security definer
set search_path = public
as $fn$
declare
    v_req public.credit_recharge_requests%rowtype;
begin
    select * into v_req
    from public.credit_recharge_requests
    where id = p_request_id
    for update;

    if not found then
        raise exception 'No such recharge request.' using errcode = 'no_data_found';
    end if;

    -- The caller's own clinic, resolved from their session rather than taken
    -- from the request. `current_user_hospital_id()` reads auth.uid(), which
    -- is still the signed-in user inside a SECURITY DEFINER body.
    if v_req.hospital_id is distinct from public.current_user_hospital_id() then
        raise exception 'That request belongs to another clinic.' using errcode = 'insufficient_privilege';
    end if;

    -- An approved request has already moved credits. Cancelling one would
    -- mean unwinding a PURCHASE, which is a refund decision and not a
    -- withdrawal.
    if v_req.status <> 'pending' then
        raise exception 'This request has already been %.', v_req.status using errcode = 'check_violation';
    end if;

    if v_req.created_at > now() - interval '3 hours' then
        raise exception 'A request can only be withdrawn after 3 hours.' using errcode = 'check_violation';
    end if;

    update public.credit_recharge_requests
    set status = 'cancelled',
        decided_at = now(),
        decision_note = 'Withdrawn by the doctor'
    where id = p_request_id;

    return true;
end;
$fn$;

comment on function public.cancel_credit_recharge(bigint) is
    'A doctor withdrawing their own pending recharge so they can raise a fresh one. An RPC rather than an UPDATE policy because RLS cannot see the OLD row: a policy permissive enough to allow this would also let a doctor rewrite the credits and amount they asked for. Here exactly one column changes, and the 3-hour wait is enforced by the DATABASE — not by a disabled button, which is a suggestion.

Three hours, not zero: the whole point of the request is that a human at AREN reads it and calls. Letting it be withdrawn instantly turns the queue into something that churns while support is mid-call; making it permanent strands a doctor whose request nobody picked up.';

revoke all on function public.cancel_credit_recharge(bigint) from public;
grant execute on function public.cancel_credit_recharge(bigint) to authenticated;
