-- The automated half of "send a follow-up reminder" — see
-- `follow-up-cron/index.ts` for the full reasoning. This migration adds
-- the one column that stops it sending twice, and the daily schedule that
-- calls it.
--
-- Anmol, 2026-09-14: "we don't have a pipeline of sending follow-up
-- messages... you select three days follow up and the follow up message
-- will go 24 hours before the follow up."

-- One shot per prescription. `follow-up-cron` stamps this after every
-- attempt it makes — success or failure — because the date it matched
-- ("tomorrow") will never be tomorrow again; there is nothing to retry
-- against, only a fresh attempt on a DIFFERENT prescription's own
-- follow-up date. A failure this stamps is not silent: it stays visible
-- forever in `whatsapp_messages.status`/`error_detail`, which is where a
-- doctor-initiated send failure already lives.
alter table prescriptions
    add column if not exists follow_up_reminder_sent_at timestamptz;

create index if not exists prescriptions_follow_up_pending_idx
    on prescriptions (follow_up_days)
    where follow_up_days is not null and follow_up_reminder_sent_at is null;

-- pg_cron/pg_net are available on this project but neither was installed
-- until now (confirmed via `list_extensions` before writing this).
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ── The one manual step this migration cannot do for you ──────────────────
-- The cron job below authenticates to `follow-up-cron` as `service_role` —
-- the same token every Edge Function already trusts unconditionally, and
-- the only one `follow-up-cron` itself will accept (see its own header).
-- Postgres migrations have no access to that key — it is deliberately
-- never exposed to anything but the Supabase dashboard/API, and no tool
-- available to this session can read it either. So it has to reach this
-- database exactly once, by hand, before the schedule below can do
-- anything: open the SQL Editor in the Supabase dashboard for THIS
-- project and run, with your own service_role key pasted in place of the
-- placeholder (Project Settings -> API -> service_role — the long secret
-- one, never the "anon"/"publishable" key):
--
--   select vault.create_secret('PASTE_YOUR_SERVICE_ROLE_KEY_HERE', 'service_role_key');
--
-- Vault encrypts it at rest; nothing about the plaintext is ever written
-- into a migration file, git history, or anywhere this session can see.
-- Until that one statement has been run, the schedule below fires
-- on time, gets a 401 back from `follow-up-cron`, and logs it — no
-- message goes out, no credit is touched, and nothing else breaks.
--
-- 03:30 UTC = 09:00 IST. `pg_cron` on Supabase runs in UTC (`cron.timezone`
-- defaults to 'UTC' and is not overridden by this project), so the literal
-- schedule below IS 9am India time, not something that needs converting
-- again at read time.
select cron.schedule(
    'aren-follow-up-reminders',
    '30 3 * * *',
    $$
    select net.http_post(
        url := 'https://ieimvjprtltancxapuzg.supabase.co/functions/v1/follow-up-cron',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || (
                select decrypted_secret from vault.decrypted_secrets
                where name = 'service_role_key'
            )
        ),
        body := '{}'::jsonb
    );
    $$
);
