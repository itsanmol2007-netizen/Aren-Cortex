-- ---------------------------------------------------------------------------
-- SUPPORT REQUESTS — the queue behind Help & Support.
--
-- Added 2026-09-11. Until now, a doctor asking AREN for help produced exactly
-- one artefact: an email, plus a row in `support_email_log` recording that an
-- email was sent. That is a delivery receipt, not a ticket. It cannot answer
-- "what is still open", "who is handling this", "has this clinic asked three
-- times about the same thing", or "show me every WhatsApp fault reported this
-- month" — and a mailbox is the wrong instrument for all four.
--
-- Anmol: "you can create a new db table to keep these records which can be
-- accessed by my support team dashboard or my own zenith (master control)
-- panel."
--
-- ── The email is still sent. This does not replace it ──────────────────────
--
-- The row is the RECORD; the email is the NOTIFICATION. They fail
-- independently and that is deliberate — `support-notify` writes the row
-- FIRST and mails second, so a Zoho outage loses the notification and never
-- the request. The reverse order would have made the mailbox the source of
-- truth again, which is the thing this table exists to stop.
--
-- ── Why the doctor cannot write to this table ──────────────────────────────
--
-- No INSERT policy for any signed-in role. The edge function writes it under
-- the service role, having resolved the doctor and clinic from the SESSION
-- (see supabase/functions/support-notify/index.ts) — so a request can only
-- ever be filed against the clinic of whoever actually sent it. A doctor who
-- could insert here could file a request as another clinic, or forge a
-- `status = 'resolved'` row. Same reasoning as the messaging ledger.
--
-- They CAN read their own clinic's rows. That is what makes a future "your
-- past requests" list in the app possible without a second store, and it
-- costs nothing today.
-- ---------------------------------------------------------------------------

create table if not exists public.support_requests (
    id          bigint generated always as identity primary key,

    -- Who. All three resolved server-side from the session, never posted by
    -- the browser. `on delete set null` rather than cascade: a clinic leaving
    -- must not silently erase the history of what they reported.
    hospital_id uuid references public.hospitals(id) on delete set null,
    doctor_id   uuid references public.doctors(id) on delete set null,
    user_id     uuid references public.users(id) on delete set null,

    -- What. `topic` is the label the doctor picked (features/support/
    -- supportTopics.ts); `areas` is their triage, empty for topics that do not
    -- ask. Both are stored as the human strings deliberately — this table is
    -- read by people and by a dashboard, and an id nobody can decode without
    -- the frontend source is worse than a string that might be renamed.
    topic       text not null,
    areas       text[] not null default '{}',
    message     text,
    reply_to    text,

    -- The browser/session facts that rode along. jsonb because the SET will
    -- change: today it carries build sha, prior page, recent errors, service
    -- worker state, network quality. A column per fact would mean a migration
    -- every time we learn something new is worth asking.
    diagnostics jsonb not null default '{}'::jsonb,

    -- Handling. Nothing writes these yet; the support dashboard will.
    status          text not null default 'open'
                    check (status in ('open', 'in_progress', 'waiting_on_doctor', 'resolved', 'closed')),
    assigned_to     text,
    internal_note   text,
    resolved_at     timestamptz,

    -- Did the notification get out. Separate from `status`, because "we never
    -- emailed anyone about this" and "nobody has picked it up" are different
    -- failures and only one of them is the support team's.
    email_status    text,
    email_error     text,

    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);

-- The two questions a dashboard opens with: what is still open, and what has
-- this clinic been reporting.
create index if not exists support_requests_open_idx
    on public.support_requests (status, created_at desc)
    where status in ('open', 'in_progress', 'waiting_on_doctor');

create index if not exists support_requests_clinic_idx
    on public.support_requests (hospital_id, created_at desc);

alter table public.support_requests enable row level security;

-- Read your own clinic's requests. Nothing else — no insert, no update, no
-- delete policy exists, so the service role is the only writer.
drop policy if exists support_requests_read_own_clinic on public.support_requests;
create policy support_requests_read_own_clinic
    on public.support_requests
    for select
    using (
        hospital_id in (
            select u.hospital_id from public.users u
            where u.id = auth.uid() and u.is_active
        )
    );

-- `updated_at` maintained by the database, so a dashboard that forgets to set
-- it cannot produce a row whose "last touched" is a lie.
create or replace function public.touch_support_request()
returns trigger
language plpgsql
as $$
begin
    new.updated_at := now();
    return new;
end;
$$;

drop trigger if exists support_requests_touch on public.support_requests;
create trigger support_requests_touch
    before update on public.support_requests
    for each row execute function public.touch_support_request();

comment on table public.support_requests is
    'Help & Support requests from inside Cortex. Written only by the support-notify edge function under the service role; the email is the notification, this row is the record.';
