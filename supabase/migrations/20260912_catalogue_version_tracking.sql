-- Catalogue version tracking — the foundation for a doctor's device asking
-- "what changed since I last synced" instead of re-downloading all 213k
-- medicines every time. See docs/context/offline-security.md.
--
-- ONE shared sequence across medicines/compositions/medicine_composition_map,
-- not three separate ones: a device stores a SINGLE watermark ("I have
-- everything up to version N"), and `WHERE version > N` means the same thing
-- in every one of the three tables. A composition edited a minute after a
-- medicine was added still sorts after it, which is all this needs to
-- guarantee — it is a change-order marker, not a timestamp, so there is no
-- clock-skew or multi-writer race to reason about.
--
-- No soft-delete column added: nothing in this codebase hard-deletes a
-- catalogue row today (medicines only ever get ADDED — see lib/db/synapse.ts's
-- `addMedicine`), so there is nothing for a delta sync to miss yet. If that
-- ever changes, deletion must become an UPDATE (a status flag), the same
-- discipline `patient_conditions` already uses for exactly this reason —
-- never a real DELETE, or a device's delta pull would never learn a row is
-- gone.

create sequence if not exists catalogue_version_seq;

alter table medicines add column if not exists version bigint;
alter table compositions add column if not exists version bigint;
alter table medicine_composition_map add column if not exists version bigint;

-- Backfill once, so a first-ever delta pull (`version > 0`) has a real
-- ordering to work with instead of every existing row reading as "version
-- zero, already known".
update medicines set version = nextval('catalogue_version_seq') where version is null;
update compositions set version = nextval('catalogue_version_seq') where version is null;
update medicine_composition_map set version = nextval('catalogue_version_seq') where version is null;

alter table medicines alter column version set not null;
alter table compositions alter column version set not null;
alter table medicine_composition_map alter column version set not null;
alter table medicines alter column version set default 0;
alter table compositions alter column version set default 0;
alter table medicine_composition_map alter column version set default 0;

create index if not exists medicines_version_idx on medicines (version);
create index if not exists compositions_version_idx on compositions (version);
create index if not exists medicine_composition_map_version_idx on medicine_composition_map (version);

-- Stamp a fresh version on every future insert/update — a corrected medicine
-- name must reach an already-synced device on its next delta pull, not just
-- brand-new rows.
create or replace function catalogue_bump_version() returns trigger as $$
begin
  new.version := nextval('catalogue_version_seq');
  return new;
end;
$$ language plpgsql;

drop trigger if exists medicines_bump_version on medicines;
create trigger medicines_bump_version before insert or update on medicines
  for each row execute function catalogue_bump_version();

drop trigger if exists compositions_bump_version on compositions;
create trigger compositions_bump_version before insert or update on compositions
  for each row execute function catalogue_bump_version();

drop trigger if exists medicine_composition_map_bump_version on medicine_composition_map;
create trigger medicine_composition_map_bump_version before insert or update on medicine_composition_map
  for each row execute function catalogue_bump_version();

-- One row, the whole catalogue's state — so a device can ask "am I behind"
-- with a single cheap read instead of taking max(version) across three
-- 200k-row tables itself on every login.
create table if not exists catalogue_meta (
  id boolean primary key default true,
  current_version bigint not null default 0,
  -- Filled in once the S3/CloudFront snapshot pipeline exists (next slice of
  -- this work, not this migration) — the version a downloadable snapshot
  -- covers, and where to fetch it. A device with no local version yet
  -- downloads the snapshot, then deltas the small gap up to current_version.
  snapshot_version bigint,
  snapshot_generated_at timestamptz,
  snapshot_medicines_url text,
  snapshot_compositions_url text,
  snapshot_map_url text,
  updated_at timestamptz not null default now(),
  constraint catalogue_meta_singleton check (id)
);

insert into catalogue_meta (id, current_version)
select true, coalesce(max(v), 0) from (
  select max(version) as v from medicines
  union all select max(version) from compositions
  union all select max(version) from medicine_composition_map
) x
on conflict (id) do nothing;

-- security definer: this trigger fires as a side effect of a write to
-- medicines/compositions/medicine_composition_map, made by whatever role that
-- statement runs as (often a doctor, via the add_medicine RPC) — a role with
-- no write grant of its own on catalogue_meta. Running as the function's
-- owner (this migration's role, which does have one) is what lets a doctor
-- adding a medicine also move the shared watermark, without granting doctors
-- direct write access to catalogue_meta itself.
create or replace function catalogue_meta_touch() returns trigger as $$
begin
  update catalogue_meta set current_version = new.version, updated_at = now() where id = true;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists medicines_touch_meta on medicines;
create trigger medicines_touch_meta after insert or update on medicines
  for each row execute function catalogue_meta_touch();
drop trigger if exists compositions_touch_meta on compositions;
create trigger compositions_touch_meta after insert or update on compositions
  for each row execute function catalogue_meta_touch();
drop trigger if exists medicine_composition_map_touch_meta on medicine_composition_map;
create trigger medicine_composition_map_touch_meta after insert or update on medicine_composition_map
  for each row execute function catalogue_meta_touch();

-- Same read rule as medicines/compositions themselves (`read_all` /
-- `medicines_read_all`): any signed-in user, front desk included — reading
-- "what version is current" reveals nothing about catalogue content, and
-- front desk's own client code simply never calls this or downloads the
-- catalogue itself (see offline-security.md's role-scoping rule).
alter table catalogue_meta enable row level security;
create policy catalogue_meta_read on catalogue_meta for select using (auth.uid() is not null);
