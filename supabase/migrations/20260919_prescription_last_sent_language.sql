-- ---------------------------------------------------------------------------
-- prescriptions.last_sent_language — what the public prescription page
-- (/prescriptions/:token) should open in by default.
--
-- A doctor picks a language when they send a prescription over WhatsApp
-- (ReviewModal's own picker). A patient tapping that link had no way to
-- know which one was chosen — the page always opened in English regardless,
-- forcing a Hindi-speaking patient to find and tap the language switch
-- themselves every time. Recorded here at send time (messaging-send) and
-- read back by prescription-preview as the page's starting language; the
-- switcher itself is unaffected — a patient can still change it.
-- ---------------------------------------------------------------------------

alter table public.prescriptions
    add column if not exists last_sent_language text;

-- Postgres has no `ADD CONSTRAINT IF NOT EXISTS` — guard manually so this
-- migration stays safe to re-run.
do $$
begin
    if not exists (
        select 1 from pg_constraint where conname = 'prescriptions_last_sent_language_check'
    ) then
        alter table public.prescriptions
            add constraint prescriptions_last_sent_language_check
            check (last_sent_language is null or last_sent_language in ('en', 'hi', 'hi-Latn'));
    end if;
end $$;

comment on column public.prescriptions.last_sent_language is
    'The language the doctor last sent this prescription in (en/hi/hi-Latn) — the public page opens in this language by default. Null until the first WhatsApp send.';
