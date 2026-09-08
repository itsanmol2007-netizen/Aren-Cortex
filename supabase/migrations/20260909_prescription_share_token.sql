-- ---------------------------------------------------------------------------
-- prescriptions.share_token — the credential behind the patient prescription
-- link.
--
-- The WhatsApp template `en_prescription_ready02` carries a dynamic URL button
-- ("View Your Prescription") whose base is registered with Meta as
--   https://www.arenode.com/prescriptions/{{1}}
-- At send time AREN supplies only {{1}} — this token. The public page at that
-- URL resolves it through the `rx-preview` edge function (service-role read;
-- no RLS policy is opened on prescriptions or any joined table).
--
-- A random opaque token, not prescriptions.id: the id appears in URLs, logs
-- and other patients' data all over the app, and a prescription is PHI. The
-- token is single-purpose and only ever travels in the one WhatsApp message
-- to the one patient it belongs to.
-- ---------------------------------------------------------------------------

-- A volatile default: Postgres gives every existing row its own value on
-- ADD COLUMN (no fast-default path for volatile expressions), and every future
-- INSERT that omits the column — saveConsult does — gets one too. No trigger.
alter table public.prescriptions
    add column if not exists share_token text
    default replace(gen_random_uuid()::text, '-', '');

-- Explicit backfill for any row a prior partial run left null.
update public.prescriptions
set share_token = replace(gen_random_uuid()::text, '-', '')
where share_token is null;

alter table public.prescriptions
    alter column share_token set not null;

create unique index if not exists prescriptions_share_token_key
    on public.prescriptions (share_token);

comment on column public.prescriptions.share_token is
    'Opaque per-prescription token. Fills {{1}} of the en_prescription_ready02 '
    'WhatsApp button; resolved by the rx-preview edge function. Never an id.';
