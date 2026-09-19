-- Security remediation pass on the live `arenod` project (ap-south-1),
-- driven by a `get_advisors` (security) review. Patient-record tables
-- (patients, visits, prescriptions, ...) were already correctly isolated
-- per clinic and are untouched here — this closes eight specific holes
-- found elsewhere in the schema. Applied to the live DB as one migration
-- per item via `apply_migration` (so each is separately reversible); this
-- file mirrors all of them for the repo's own migration history.

-- 1. get_clinic_pulse() had no auth check at all and was callable by
--    anon — anyone with the public anon key could pull every clinic's
--    name, city, doctor, subscription status and device/session trails
--    in one unauthenticated call. Server-side-only from here; a future
--    admin dashboard should gate it behind current_user_is_admin()
--    (see the platform-admin note below), not reopen it to all callers.
revoke execute on function public.get_clinic_pulse() from anon, authenticated;

-- 2. verify_admin_password() was brute-forceable: callable by anon, no
--    rate limit. Stopgap, not the full fix — the full fix is moving
--    admin auth onto real Supabase Auth, which needs the admin
--    dashboard/login code (lives outside this repo) and wasn't
--    reachable in this pass. For now: anon revoked, authenticated
--    required, and a real rate limit (5 attempts / 15 min per email)
--    enforced inside the function itself, not just at the UI.
create table if not exists public.admin_login_attempts (
    id bigint generated always as identity primary key,
    email text not null,
    attempted_at timestamptz not null default now()
);

create index if not exists admin_login_attempts_email_time_idx
    on public.admin_login_attempts (email, attempted_at desc);

alter table public.admin_login_attempts enable row level security;

create or replace function public.verify_admin_password(p_email text, p_password text)
returns table(id uuid, email text, name text, role text)
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
    v_recent_attempts integer;
    v_email text := lower(trim(p_email));
begin
    select count(*) into v_recent_attempts
    from public.admin_login_attempts a
    where a.email = v_email
      and a.attempted_at > now() - interval '15 minutes';

    if v_recent_attempts >= 5 then
        raise exception 'RATE_LIMITED: too many attempts, try again later';
    end if;

    insert into public.admin_login_attempts (email) values (v_email);

    return query
    select au.id, au.email, au.name, au.role
    from public.admin_users au
    where au.email = v_email
      and au.is_active = true
      and au.password_hash = extensions.crypt(p_password, au.password_hash);
end;
$function$;

revoke execute on function public.verify_admin_password(text, text) from public;
revoke execute on function public.verify_admin_password(text, text) from anon;
grant execute on function public.verify_admin_password(text, text) to authenticated;

-- 3. generate_prescription_ref(p_hospital_id) trusted whatever
--    hospital_id the caller passed, unlike start_consult_visit which
--    correctly checks it against the caller's own clinic — any doctor
--    from Clinic A could corrupt Clinic B's prescription numbering.
--    Same ownership guard start_consult_visit already uses, plus a
--    pinned search_path (folds in item 6 for this one function).
create or replace function public.generate_prescription_ref(p_hospital_id uuid)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
    v_number integer;
    v_date_str text;
    v_ref text;
begin
    if p_hospital_id is distinct from public.current_user_hospital_id() then
        raise exception 'FORBIDDEN: hospital mismatch';
    end if;

    insert into prescription_counters (hospital_id, counter_date, last_number)
    values (p_hospital_id, current_date, 1)
    on conflict (hospital_id, counter_date)
    do update set last_number = prescription_counters.last_number + 1
    returning last_number into v_number;

    v_date_str := to_char(current_date, 'DDMMYY');
    v_ref := 'RX-' || v_date_str || '-' || lpad(v_number::text, 4, '0');
    return v_ref;
end;
$function$;

-- 4. v_search_gap was a SECURITY DEFINER view granted to anon,
--    aggregating every clinic's search/decision-log data with no
--    login required. Switched to security_invoker and locked down to
--    postgres/service_role only — nothing in this repo references it
--    client-side, so it isn't reopened to authenticated either.
alter view public.v_search_gap set (security_invoker = on);
revoke all on public.v_search_gap from anon, authenticated;

-- 5. Clinic owners were being treated as global platform admins:
--    current_user_is_admin() returned true for any users.role in
--    ('owner','admin'), but gates writes to shared cross-clinic
--    reference tables every clinic's Synapse engine depends on. The
--    intended fix (a dedicated admin_users.is_platform_admin flag,
--    checked against auth.uid()) assumes admin_users rows are linked
--    to real auth identities — they are not yet (admin auth is still
--    its own bespoke email/password table, separate from
--    Supabase Auth), so that half was deliberately NOT applied here;
--    doing so would make current_user_is_admin() return false for
--    everyone, permanently, which is a worse hole than the one it
--    closes. Flagged, not fixed, until item 2's full Auth migration
--    lands.
--
--    The independent half — a non-admin user being able to plausibly
--    UPDATE their own `role` via the old blanket ALL policy — has no
--    such dependency and is fixed here: split into three named
--    policies, with the self-update policy pinning `role` to its
--    existing value so it can't be changed via self-update.
drop policy if exists hospital_isolation on public.users;

create policy users_select on public.users
    for select using (hospital_id = current_user_hospital_id());

create policy users_update_self on public.users
    for update using (id = auth.uid() and hospital_id = current_user_hospital_id())
    with check (id = auth.uid() and hospital_id = current_user_hospital_id()
        and role = (select role from public.users where id = auth.uid()));

create policy users_admin_write on public.users
    for all using (current_user_is_admin() and hospital_id = current_user_hospital_id())
    with check (current_user_is_admin() and hospital_id = current_user_hospital_id());

-- 6. Mutable search_path on 16 more functions (generate_prescription_ref
--    already pinned above) — vulnerable to search-path hijacking if a
--    lower-privilege role can shadow an object the function relies on.
alter function public.catalogue_bump_version() set search_path = public, pg_temp;
alter function public.check_doctor_subscription_limit() set search_path = public, pg_temp;
alter function public.check_hospital_mode_subscription_limit() set search_path = public, pg_temp;
alter function public.composition_brands(integer[], integer, boolean, integer[]) set search_path = public, pg_temp;
alter function public.composition_brands(integer[], integer, boolean, integer[], uuid) set search_path = public, pg_temp;
alter function public.current_user_hospital_id() set search_path = public, pg_temp;
alter function public.current_user_is_admin() set search_path = public, pg_temp;
alter function public.get_clinic_pulse() set search_path = public, pg_temp;
alter function public.get_duplicate_medicines() set search_path = public, pg_temp;
alter function public.insert_medicines_safe(jsonb) set search_path = public, pg_temp;
alter function public.learn_doctor_rules(integer, numeric) set search_path = public, pg_temp;
alter function public.rank_panels(integer[], integer[]) set search_path = public, pg_temp;
alter function public.rank_probable_findings(integer[]) set search_path = public, pg_temp;
alter function public.rank_tests(integer[], integer[]) set search_path = public, pg_temp;
alter function public.set_updated_at() set search_path = public, pg_temp;
alter function public.touch_support_request() set search_path = public, pg_temp;

-- 7. pg_trgm and pg_net were installed in `public` — minor
--    namespace-pollution / attack-surface issue. Moved to a dedicated
--    `extensions` schema. pg_net doesn't support ALTER EXTENSION SET
--    SCHEMA, so it's the drop/recreate-in-target-schema equivalent
--    (confirmed nothing depends on it first: no cron jobs, no
--    functions reference net.* besides Supabase's own internal
--    helper). search_intents() calls similarity() unqualified, so its
--    search_path picks up `extensions` too — verified fuzzy
--    symptom/medicine search still works after the move.
create schema if not exists extensions;
alter extension pg_trgm set schema extensions;
alter function public.search_intents(text, integer, text[]) set search_path = public, extensions;

drop extension if exists pg_net;
create extension if not exists pg_net schema extensions;

-- Follow-up, requested after the above landed: self-signup must stay
-- on (admin approval already happens via `admin_users`/is_active,
-- checked from the admin panel which only runs on the service role
-- key) — but the RLS layer itself only checked "is this person
-- logged in" on every Synapse catalogue table, not whether their
-- account or clinic had actually been approved. A signed-up-but-not-
-- yet-approved account got a real Supabase Auth session immediately,
-- which is enough to read the catalogue directly over the REST API
-- regardless of what the app's own UI does with an inactive account.
--
-- current_user_is_active() checks both layers described for this
-- product: the user's own is_active AND their hospital's is_active.
-- Swapped into every read policy that previously only checked
-- auth.uid() is not null.
create or replace function public.current_user_is_active()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
    select exists (
        select 1
        from public.users u
        join public.hospitals h on h.id = u.hospital_id
        where u.id = auth.uid()
          and u.is_active = true
          and h.is_active = true
    );
$function$;

alter policy catalogue_meta_read on public.catalogue_meta using (public.current_user_is_active());
alter policy read_all on public.clinical_snapshots using (public.current_user_is_active());
alter policy read_all on public.composition_coprescription_hints using (public.current_user_is_active());
alter policy read_all on public.composition_dosage_defaults using (public.current_user_is_active());
alter policy read_all on public.composition_tag_map using (public.current_user_is_active());
alter policy read_all on public.compositions using (public.current_user_is_active());
alter policy synapse_read_all on public.condition_observable_map using (public.current_user_is_active());
alter policy read_all on public.coprescription_promotions using (public.current_user_is_active());
alter policy fom_read on public.finding_observable_map using (public.current_user_is_active());
alter policy read_all on public.finding_tag_map using (public.current_user_is_active());
alter policy read_all on public.findings using (public.current_user_is_active());
alter policy synapse_read_all on public.intent_class_map using (public.current_user_is_active());
alter policy synapse_read_all on public.intent_classes using (public.current_user_is_active());
alter policy synapse_read_all on public.intent_companions using (public.current_user_is_active());
alter policy synapse_read_all on public.intent_guards using (public.current_user_is_active());
alter policy synapse_read_all on public.intents using (public.current_user_is_active());
alter policy synapse_read_all on public.measurement_rules using (public.current_user_is_active());
alter policy read_all on public.medicine_composition_map using (public.current_user_is_active());
alter policy medicines_read_all on public.medicines using (public.current_user_is_active());
alter policy observable_alias_read on public.observable_alias using (public.current_user_is_active());
alter policy synapse_read_all on public.observable_signals using (public.current_user_is_active());
alter policy synapse_read_all on public.observables using (public.current_user_is_active());
alter policy read_all on public.panels using (public.current_user_is_active());
alter policy read_all on public.signal_finding_suggestions using (public.current_user_is_active());
alter policy synapse_read_all on public.signal_intent_rules using (public.current_user_is_active());
alter policy synapse_read_all on public.signals using (public.current_user_is_active());
alter policy read_all on public.snapshot_findings using (public.current_user_is_active());
alter policy read_all on public.snapshot_symptoms using (public.current_user_is_active());
alter policy read_all on public.symptom_cluster_test_hints using (public.current_user_is_active());
alter policy som_read on public.symptom_observable_map using (public.current_user_is_active());
alter policy read_all on public.symptom_tag_map using (public.current_user_is_active());
alter policy read_all on public.symptoms using (public.current_user_is_active());
alter policy read_all on public.tags using (public.current_user_is_active());
alter policy read_all on public.test_panel_map using (public.current_user_is_active());
alter policy read_all on public.test_tag_map using (public.current_user_is_active());
alter policy read_all on public.tests using (public.current_user_is_active());
