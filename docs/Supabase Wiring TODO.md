# Supabase Wiring — TODO

Everything in this pass that needs a **database change** is collected here. The
app code is already written to use these the moment they exist; nothing else in
the frontend needs to change unless noted. Hand this to whoever does the Supabase
work (SQL editor + dashboard).

Hospital id in use (single-clinic MVP): `38bd8da3-0dd2-43a5-ad09-2d3194c95ba9`.

---

## 1. Doctor presence (online / away / offline)

**Goal:** reception should see a doctor as *Online* only when their app is
actually open — not always-on. Chosen approach: a **heartbeat** (`last_seen`).

### 1a. Add the column

```sql
alter table doctors add column if not exists last_seen timestamptz;
```

### 1b. Doctor's app writes the heartbeat (Cortex side)

While the doctor's workspace is open, update `last_seen` every ~30 seconds (and
once on login). Example client call to run on an interval:

```ts
await supabase.from("doctors").update({ last_seen: new Date().toISOString() })
  .eq("id", DOCTOR_ID);
```

RLS: the doctor must be allowed to `update` their own `doctors` row (a policy
like `auth.uid() = user_id`). Reception only ever **reads** doctors.

### 1c. Turn it on for reception (one line, frontend)

In `src/lib/db/patients.ts`, add `last_seen` to `DOCTOR_COLUMNS`:

```ts
const DOCTOR_COLUMNS =
  "id, name, specialization, qualification, registration_number, phone, signature_image_url, hospital_id, avatar_url, availability_status, last_seen";
```

That's it — `DoctorsCard` already reads `doctor.last_seen` and shows
**Online** (< 3 min), **Away / "Seen 6 min"** (< 15 min), or **Offline**.
Until the column + heartbeat exist, everyone reads **Offline** (honest, not the
old fake "always online").

---

## 2. Doctor Requests (real, replacing the simulator)

**Goal:** when the doctor sends a request ("send next patient", "need previous
file"), it appears on reception's Doctor Requests card with a chime, and
acknowledging clears it. The simulator has been removed.

### 2a. Create the table

```sql
create table if not exists doctor_requests (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null,
  doctor_id uuid,
  doctor_name text,
  message text not null,
  status text not null default 'pending',        -- 'pending' | 'acknowledged'
  created_at timestamptz not null default now(),
  acknowledged_at timestamptz
);
create index if not exists doctor_requests_hospital_pending_idx
  on doctor_requests (hospital_id, status, created_at desc);
```

### 2b. RLS policies

- **Doctor** (same hospital) may `insert` a request.
- **Reception** (same hospital) may `select` and `update` (to set
  `status = 'acknowledged'`).

Model the `using` / `with check` clauses on however the other tables scope by
`hospital_id` for the signed-in user (there is already a
`current_user_hospital_id` helper in the project per the auth notes).

### 2c. Frontend — already wired, nothing to change

`fetchDoctorRequests` / `acknowledgeDoctorRequest` (`src/lib/db/patients.ts`) and
`useDoctorRequests` (`src/features/frontdesk/hooks/useDoctorRequests.ts`) expect
exactly the columns above (`doctor_name`, `message`, `status`, `created_at`). The
card polls every 25 s while online and **auto-activates** once the table exists.
Until then it detects the missing table on the first call and shows the calm
"no requests" state (no error spam).

### 2d. Optional: instant (realtime) instead of 25 s polling

Enable Realtime on `doctor_requests` in the dashboard, then a later change can
add a `supabase.channel(...).on('postgres_changes', ...)` subscription in
`useDoctorRequests` to refresh instantly on insert. Polling already works
without this — treat it as a nice-to-have.

---

## 3. Reference-data cache freshness (optional, low priority)

Doctors and symptoms are now cached on each computer (`localStorage`) and
**refreshed automatically every time the app is online**, so offline outages no
longer empty the intake dropdowns. This is already correct for lists that change
every few weeks/months.

If you ever want *instant* invalidation instead of "refreshed on next online
load", add an `updated_at` to `symptoms` / `doctors` (or a small
`reference_version` row) and the cache layer
(`src/features/frontdesk/operational/referenceCache.ts`) can compare timestamps
before re-fetching. Not needed now.

---

## 4. Full offline patient-saving (separate future project — NOT in this pass)

Today: while offline the intake **form works** (cached dropdowns + existing-
patient search from cache), but **saving a brand-new patient still needs the
connection back** (a moment later). Making saves survive a multi-minute outage
means an **offline write queue (outbox)**: store created patients/visits locally,
auto-upload on reconnect, and handle token numbering + duplicate resolution
carefully. This is a sizeable, higher-risk feature — scoped as its own project,
flagged here so it isn't forgotten.

---

## Summary checklist

- [x] `doctors.last_seen` column added
- [x] Doctor app writes `last_seen` heartbeat (~30 s) + on login — `useDoctorHeartbeat` (`src/hooks/useDoctorHeartbeat.ts`), mounted in `App.tsx`; writer `updateDoctorLastSeen` in `patients.ts`
- [x] `last_seen` added to `DOCTOR_COLUMNS` (frontend) + reception refetches doctors every 45 s so presence is live
- [x] `doctor_requests` table created + indexed
- [x] RLS: doctor insert, reception select+update
- [x] Realtime enabled on `doctor_requests` — subscribed in `useDoctorRequests` via `subscribeDoctorRequests` (`patients.ts`), polling kept as a safety net
- [ ] (skipped by decision) reference `updated_at` — monthly-change data, refresh-on-online is enough
- [ ] (future) offline write-queue project

All frontend wiring for the above is now complete and builds clean.
