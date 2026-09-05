-- ---------------------------------------------------------------------------
-- WHATSAPP: INBOX VISIBILITY + APPOINTMENT BOOKING
--
-- Three things this adds, all additive (no drops, no data migration):
--
--   1. `whatsapp_messages.hospital_id` + a SELECT policy, so the Communication
--      page can actually READ the inbox. Until now the table was service_role
--      only, which is correct for the webhook writer but means the frontend
--      (anon/authed key) saw zero rows no matter what.
--
--   2. `whatsapp_conversations` — one row per patient phone, holding the
--      state machine for a two-way conversation ("I asked which day, I'm
--      waiting for the answer") and the two timestamps that decide whether
--      Meta will even let us send a free-form reply.
--
--   3. `appointment_requests` — what a patient tapping "Book appointment"
--      actually produces. Deliberately a REQUEST, not a booking: front desk
--      confirms it. See the table comment for why.
--
-- Plus `hospital_whatsapp_config`, which is empty today on purpose — every
-- clinic currently shares AREN's one Meta number, read from server/.env. The
-- table exists so moving a clinic onto its own number later is a row, not a
-- rewrite of every call site.
-- ---------------------------------------------------------------------------


-- ── 1. whatsapp_messages: hospital scoping ─────────────────────────────────

alter table public.whatsapp_messages
    add column if not exists hospital_id uuid references public.hospitals(id) on delete set null;

comment on column public.whatsapp_messages.hospital_id is
    'Which clinic this message belongs to. Derived by the webhook from the matched patient''s most recent visit — NULL when the sender matches no patient, which is a real state (a stranger texting the number), not an error. Rows with a NULL hospital_id are invisible to every clinic by design; they surface only in service-role tooling.';

-- Staff read their own clinic's messages. The existing service_role ALL
-- policy stays untouched — policies are OR'd, so the webhook writer keeps
-- full access while the frontend gains scoped read.
drop policy if exists whatsapp_messages_hospital_select on public.whatsapp_messages;
create policy whatsapp_messages_hospital_select
    on public.whatsapp_messages
    for select
    using (hospital_id = public.current_user_hospital_id());

-- The inbox's two access patterns: "every conversation in this clinic, newest
-- first" and "the thread for this one phone".
create index if not exists whatsapp_messages_hospital_created_idx
    on public.whatsapp_messages (hospital_id, created_at desc);
create index if not exists whatsapp_messages_phone_created_idx
    on public.whatsapp_messages (phone, created_at desc);
-- Status updates arrive keyed only by the WhatsApp message id.
create index if not exists whatsapp_messages_wa_message_id_idx
    on public.whatsapp_messages (wa_message_id);


-- ── 2. whatsapp_conversations: per-phone state ─────────────────────────────

create table if not exists public.whatsapp_conversations (
    id                bigint generated always as identity primary key,
    phone             text not null unique,
    hospital_id       uuid references public.hospitals(id) on delete set null,
    patient_id        uuid references public.patients(id) on delete set null,

    state             text not null default 'idle',
    state_data        jsonb not null default '{}'::jsonb,

    last_inbound_at   timestamptz,
    last_outbound_at  timestamptz,

    created_at        timestamptz not null default now(),
    updated_at        timestamptz not null default now(),

    constraint whatsapp_conversations_state_check check (
        state in ('idle', 'awaiting_clinic', 'awaiting_day', 'awaiting_note')
    )
);

comment on table public.whatsapp_conversations is
    'One row per patient phone number — the memory a two-way WhatsApp thread needs. `state` is where the bot is in a flow it started ("awaiting_day" = it asked which day and has not heard back); `state_data` carries the partial answer being assembled. Distinct from whatsapp_messages, which is the immutable log: this is the mutable cursor over it.';

comment on column public.whatsapp_conversations.last_inbound_at is
    'When the patient last messaged us. Load-bearing, not analytics: Meta only permits free-form (non-template) replies within 24 hours of this timestamp. Outside that window a reply MUST be a pre-approved template or it is rejected. The inbox reads this to decide whether the composer is enabled.';

comment on column public.whatsapp_conversations.state is
    'idle = no flow in progress. awaiting_clinic = patient matched more than one clinic and we asked which. awaiting_day = we asked which day suits them. awaiting_note = we asked what it is regarding. A flow that stalls is swept back to idle rather than trapping the patient mid-dialogue.';

alter table public.whatsapp_conversations enable row level security;

drop policy if exists whatsapp_conversations_service_only on public.whatsapp_conversations;
create policy whatsapp_conversations_service_only
    on public.whatsapp_conversations
    for all
    using (auth.role() = 'service_role')
    with check (auth.role() = 'service_role');

drop policy if exists whatsapp_conversations_hospital_select on public.whatsapp_conversations;
create policy whatsapp_conversations_hospital_select
    on public.whatsapp_conversations
    for select
    using (hospital_id = public.current_user_hospital_id());

create index if not exists whatsapp_conversations_hospital_idx
    on public.whatsapp_conversations (hospital_id, updated_at desc);


-- ── 3. appointment_requests ────────────────────────────────────────────────

create table if not exists public.appointment_requests (
    id             bigint generated always as identity primary key,
    hospital_id    uuid not null references public.hospitals(id) on delete cascade,
    patient_id     uuid references public.patients(id) on delete set null,
    phone          text not null,
    doctor_id      uuid references public.doctors(id) on delete set null,

    preferred_day  text,
    preferred_date date,
    note           text,

    source         text not null default 'whatsapp',
    status         text not null default 'pending',

    confirmed_for  timestamptz,
    visit_id       uuid references public.visits(id) on delete set null,
    handled_by     uuid references public.users(id) on delete set null,
    handled_at     timestamptz,

    created_at     timestamptz not null default now(),
    updated_at     timestamptz not null default now(),

    constraint appointment_requests_status_check check (
        status in ('pending', 'confirmed', 'declined', 'cancelled', 'expired')
    ),
    constraint appointment_requests_source_check check (
        source in ('whatsapp', 'phone', 'walk_in', 'web')
    )
);

comment on table public.appointment_requests is
    'A patient ASKING for an appointment — not an appointment. The bot never allocates a slot: it captures intent and preferred day, and front desk confirms. That split is deliberate. Confirming needs per-doctor schedules, slot lengths, leave and holiday handling and race safety, none of which exist yet; a request queue needs none of it and keeps the clinic in control of its own diary. When real scheduling lands, this table becomes its inbox rather than being replaced.';

comment on column public.appointment_requests.preferred_day is
    'What the patient actually chose, verbatim ("tomorrow", "this week", "kal"). Kept alongside the resolved preferred_date because "tomorrow" tapped at 11pm is ambiguous and staff should see the words, not just our interpretation of them.';

comment on column public.appointment_requests.visit_id is
    'Set once front desk turns this request into a real visit row. Until then NULL — a pending request has no presence in the queue.';

alter table public.appointment_requests enable row level security;

-- Front desk works these: read, confirm, decline.
drop policy if exists appointment_requests_hospital_isolation on public.appointment_requests;
create policy appointment_requests_hospital_isolation
    on public.appointment_requests
    for all
    using (hospital_id = public.current_user_hospital_id())
    with check (hospital_id = public.current_user_hospital_id());

-- The webhook creates them.
drop policy if exists appointment_requests_service_all on public.appointment_requests;
create policy appointment_requests_service_all
    on public.appointment_requests
    for all
    using (auth.role() = 'service_role')
    with check (auth.role() = 'service_role');

-- The Front Desk badge counts pending requests for one clinic.
create index if not exists appointment_requests_hospital_status_idx
    on public.appointment_requests (hospital_id, status, created_at desc);


-- ── 4. hospital_whatsapp_config ────────────────────────────────────────────

create table if not exists public.hospital_whatsapp_config (
    hospital_id      uuid primary key references public.hospitals(id) on delete cascade,
    enabled          boolean not null default true,
    booking_enabled  boolean not null default true,

    phone_number_id  text,
    waba_id          text,
    display_name     text,
    greeting         text,

    created_at       timestamptz not null default now(),
    updated_at       timestamptz not null default now()
);

comment on table public.hospital_whatsapp_config is
    'Per-clinic WhatsApp settings. Expected to be EMPTY for most clinics: every one currently shares AREN''s single Meta number from server/.env, and a missing row means exactly that (enabled, booking on, global number). It exists so that putting one clinic on its own WhatsApp number later is an INSERT, not a refactor of every send path.';

comment on column public.hospital_whatsapp_config.phone_number_id is
    'NULL = use the global WHATSAPP_PHONE_NUMBER_ID from server/.env. Set only for a clinic that has onboarded its own WhatsApp Business number.';

alter table public.hospital_whatsapp_config enable row level security;

drop policy if exists hospital_whatsapp_config_isolation on public.hospital_whatsapp_config;
create policy hospital_whatsapp_config_isolation
    on public.hospital_whatsapp_config
    for all
    using (hospital_id = public.current_user_hospital_id())
    with check (hospital_id = public.current_user_hospital_id());

drop policy if exists hospital_whatsapp_config_service_all on public.hospital_whatsapp_config;
create policy hospital_whatsapp_config_service_all
    on public.hospital_whatsapp_config
    for all
    using (auth.role() = 'service_role')
    with check (auth.role() = 'service_role');
