-- Short-lived, single-use tokens for the Cortex -> landing-page photo/
-- signature editor redirect. Same shape as the existing visit_gateways
-- precedent (aren-landing-page repo): a purpose-built token table, an
-- Edge Function on the landing side does the privileged read/write, no
-- anonymous-token RLS policy. Cortex mints a row for itself (doctor edits
-- their own field only); the landing page's Edge Function (service_role)
-- does everything else. See aren-landing-page's supabase/functions/
-- doctor-photo-handoff/index.ts for the redemption side.

create table if not exists doctor_photo_handoffs (
    token text primary key default encode(gen_random_bytes(24), 'hex'),
    doctor_id uuid not null references doctors(id) on delete cascade,
    hospital_id uuid not null references hospitals(id) on delete cascade,
    field text not null check (field in ('avatar', 'signature', 'logo')),
    status text not null default 'active' check (status in ('active', 'used', 'expired')),
    return_url text not null,
    expires_at timestamptz not null default (now() + interval '15 minutes'),
    created_at timestamptz not null default now()
);

comment on table doctor_photo_handoffs is
    'Cortex -> arenode.com photo/signature editor handoff. One row per redirect; token is the whole access control on the landing-page side, resolved by a service_role Edge Function there. Mirrors visit_gateways.';

alter table doctor_photo_handoffs enable row level security;

-- A doctor may only mint a token for their OWN doctor row -- never
-- another doctor's, even within the same clinic.
create policy doctor_photo_handoffs_insert_own on doctor_photo_handoffs
    for insert to authenticated
    with check (
        doctor_id in (select id from doctors where user_id = auth.uid())
    );

-- No select/update policy for anon or authenticated -- only service_role
-- (the landing page's Edge Function) ever reads or writes a row again
-- after Cortex creates it, exactly like visit_gateways.
