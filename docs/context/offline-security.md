# Offline foundation + the PIN lock

Part of the `aren-cortex-context.md` split. Current state only — for how this
landed and what was verified, see `SESSION-HANDOFF.md` (until it's rewritten
again) and `aren-technical-atlas.md` §9a's 2026-09-12 entries.

**Read this before touching anything under `src/lib/offline/` or
`src/lib/security/`, or before telling anyone "the app works offline."**
As of 2026-09-12 the write side, the read side, the Synapse ruleset cache,
the medicine catalogue mirror, and PWA installability are ALL real and
wired in. What's still genuinely missing is below, not hidden: offline
consult can look up patients/visits/prescriptions and rank with the cached
ruleset, but the medicine SEARCH RESULT a doctor actually prescribes still
resolves through `composition_brands()`, a live Postgres RPC with no
offline equivalent yet (see "Still open" below) — the catalogue mirror this
session built exists to feed that replacement, once it's built.

---

## The honest state, first

Real and wired in for real:

1. **A durable write queue** — a doctor's own offline writes survive a
   reload. Wired to exactly ONE flow today: Front Desk's `createNewVisit`
   (new patient + visit registration).
2. **The PIN lock + 72-hour B2B lock** — both fully wired, both verified
   live, both independent of everything else on this page.
3. **The read-through cache** (`lib/offline/localMirror.ts`) — patients,
   visit history, a specific visit's detail, and prescription render data
   all go network-first/local-fallback now, for both the doctor (Cortex)
   and front desk's own hospital-scoped reads. See "The read side" below.
4. **The Synapse ruleset cache** (`useSynapse.ts`) — a doctor's ~4,000-row
   ruleset + personalisation survives a dropped connection instead of
   hard-failing the whole consult.
5. **The medicine catalogue mirror + sync** (`lib/offline/catalogueSync.ts`)
   — a real Dexie mirror of `medicines`/`compositions`/
   `medicine_composition_map`, kept current via a version-tracked snapshot
   + delta pipeline. See "The medicine catalogue" below.
6. **PWA installability** — `beforeinstallprompt` captured, an "Install
   App" card in Settings beside App Lock, iOS Safari's manual "Add to Home
   Screen" instructions where no programmatic prompt exists.

What does **NOT** exist yet:

- **The catalogue mirror has data but nothing ranks with it yet.**
  `composition_brands()` (single-molecule filter, doctor-preference
  reorder, clinic default tagging, pediatric forms) is still a live-only
  Postgres RPC. Offline, a doctor can chart a whole consult against the
  cached ruleset, but the medicine search/pick step still needs a live
  connection to actually resolve a prescribable brand. Explicitly deferred
  — real, delicate work, tracked separately rather than rushed alongside
  the mirror itself.
- **Front Desk's own, OLDER, separate offline mechanism is untouched by
  any of this.** `features/frontdesk/operational/referenceCache.ts` +
  `eventLog.ts` (see atlas §9) already cache doctors/symptoms in
  localStorage, cache-first. That is a different, simpler, pre-existing
  system for a narrower job (keep two dropdowns populated), not a
  precursor to the Dexie mirror — the two do not share code and were not
  designed as one system. Don't assume touching one affects the other.
- **No eviction on logout.** A shared machine that signs one doctor out and
  another in reads only the correct doctor's rows (every cache key embeds
  the id that scopes it), but a previous doctor's cached rows are not
  actively wiped — they just sit there until something clears them.
- **Local data at rest**: only the write queue's payloads are encrypted.
  The read-through mirror and the catalogue are not — the DEK/AES-GCM
  helpers (`lib/security/crypto.ts`) exist for this, it's wiring, not new
  crypto, same standing note as last session.

---

## `src/lib/offline/` — the write-side foundation

- **`db.ts`** — the Dexie database (`aren-cortex-local`). Tables:
  `writeQueue` (durable outbox), `patientsMirror`/`visitsMirror`/
  `prescriptionsMirror` (schema only, unused — see above), `meta`
  (key/value: connectivity clock timestamps, PIN-lock wrapped keys,
  escrow-sync markers, WebAuthn credential ids).
- **`connectivityClock.ts`** — "when did this device last actually hear
  from the server," NOT `navigator.onLine`. Only advances on a real
  authenticated round trip (`AuthProvider`'s identity check/`adoptIdentity`,
  a successful queue flush). Stored redundantly (IndexedDB + localStorage,
  read as their minimum) — not cryptographic, honest about that in its own
  comments. Drives quiet offline/online toasts + one-time 24h/72h warnings.
- **`lockGate.ts`** — the 72-hour B2B licensing lock (a friction, not a
  security boundary — see its own note). Checked independently at THREE
  seams: `writeQueue.ts`'s `enqueueWrite` (new patient/visit creation),
  `useConsultIntelligence.ts`'s engine run (Synapse ranking pauses,
  `synapseLocked` surfaces to the UI), `messaging.ts`'s `invokeSend`
  (WhatsApp sends). Reading already-cached data is never gated — the whole
  point of the local mirror existing, once it exists for real.
- **`writeQueue.ts`** — `registerWriteHandler(kind, fn)` + `enqueueWrite(kind,
  payload, opts)`. A queued row's payload is **encrypted** under the
  signed-in doctor's DEK (see below) whenever one is available at enqueue
  time — real PII (new patient name/phone/DOB) must not sit in IndexedDB
  in the clear. A row that can't be decrypted because the device is
  currently PIN-locked is left pending, not treated as failed; flushing
  retries on reconnect AND on unlock (`onLockStateChange`).
- **`useConnectivityStatus.ts`** — React hook for the Settings status
  indicator (a new "Offline queue" row inside System Health, following
  that panel's own service-registry pattern — see `health/model.ts`).

Registered handlers today: `"frontdesk.createVisit"` only, in
`features/frontdesk/hooks/useVisitActions.ts`.

## The read side — `localMirror.ts` + the Synapse ruleset cache

- **`lib/offline/localMirror.ts`** — the generic read-through primitive:
  network first, write the result into the mirror, return it; on failure,
  fall back to whatever's cached under that exact key; nothing cached means
  the original error still surfaces. Wraps `lib/db/patients.ts`'s
  `fetchPatientById`/`fetchTodayPatients`/`fetchRecentPatients`/
  `fetchPatientVisits`/`fetchVisitWithDetails`/`fetchPatientDirectory`/
  `fetchPatientHistory` and `lib/db/prescriptions.ts`'s
  `fetchPrescriptionRenderData` — every call site is unchanged, so every
  existing caller benefits with no component changes. `fetchTodayVisits`
  (front desk's live queue) is deliberately untouched — already covered by
  its own older localStorage cache-first mechanism (`useQueue`,
  `referenceCache.ts`), a different system for a different job.
  Cache keys always embed the id that actually scopes them (a patient/
  visit/prescription id, or a doctor/hospital id for a list read with no
  id of its own) — that's what prevents one account's data surfacing under
  another's read on a shared device, not the `doctorId`/`hospitalId`
  metadata columns on `MirrorRow`, which are best-effort bookkeeping for
  the not-yet-built "clear this doctor's cache on logout."
- **`useSynapse.ts`** — on a successful ruleset load, the whole
  `SynapseData` result (Maps/Sets/Date included — IndexedDB's structured
  clone stores them natively, no serialisation layer needed) is stashed in
  `lib/offline/db.ts`'s `meta` table, keyed per doctor
  (`synapseCacheKey`). On a failed load it's read back and served instead
  of erroring, with a `fromCache` flag on `SynapseData` for a future UI
  surface to show staleness if it wants to. Cortex-only (single call site,
  `App.tsx`) — front desk never reaches this hook.

## The medicine catalogue — version tracking, snapshot, sync

The 213k+ medicine catalogue is a different problem from the read-through
cache above: too big to just cache opportunistically, doctor-only (front
desk never downloads it — see the role-scoping rule this whole design was
built around), and needs to stay current without re-downloading everything
every time a handful of medicines change.

- **Server-side (migration `20260912_catalogue_version_tracking.sql`)** —
  a shared `catalogue_version_seq` and a `version bigint` column + trigger
  on `medicines`/`compositions`/`medicine_composition_map`, stamped on every
  insert/update. `catalogue_meta` is a singleton row holding
  `current_version` (kept live by the same triggers) and, once a snapshot
  exists, `snapshot_version` + the three `snapshot_*_url` columns. No
  soft-delete column — nothing in this codebase hard-deletes a catalogue
  row today (`addMedicine` only ever adds); if that ever changes, deletion
  must become an UPDATE (a status flag), the same discipline
  `patient_conditions` already uses, or a delta sync would never learn a
  row is gone.
- **`supabase/functions/catalogue-snapshot-build/`** — builds one
  gzip-compressed, row-array JSON file per table (not row-object — 213k+
  repetitions of the same key names is wasted bytes and wasted decode CPU)
  and uploads it to the `arenode-catalogue-cdn` S3 bucket (region
  `ap-south-1`, region and AWS credentials reused from the existing
  attachments pipeline's Supabase secrets — a NEW, separate bucket from
  `AWS_BUCKET_NAME`/`arenode-patient-orbit-uploads`, deliberately: patient
  attachments are private, the catalogue is public/CDN-served, and mixing
  them under one bucket makes that separation harder to get right, not
  easier). `medicines` is filtered to `hospital_id IS NULL` — a hospital's
  own pending doctor-added medicines are NOT part of the shared snapshot;
  the client fetches those separately, live, every sync (small, cheap).
  Processes one table per invocation to bound memory/time to that table's
  own size. **Live-verified**: compositions (284 rows, 2.8KB gzipped),
  medicines (213,146 rows, 3.1MB gzipped), medicine_composition_map
  (311,562 rows, 1.16MB gzipped) — total first-time download ≈4.3MB.
  Caught and fixed a real bug in that same pass: PostgREST silently caps
  any `.range()` request at 1000 rows regardless of what's asked for (the
  same ceiling `fetchObservables` in `lib/db/synapse.ts` already documents
  hitting) — a page-size mismatch here reads a truncated first page as
  "that's everything" and silently produces a near-empty snapshot.
- **`supabase/functions/catalogue-cdn-healthcheck/`** — one-time (or
  re-run-if-needed) diagnostic, round-trips a small test object against
  the bucket to confirm it exists and the AWS credentials can actually
  read/write/delete on it, without needing to hand the credentials to
  whoever's checking. Caught a real gap live: the existing
  `arenode-storage-service` IAM user had no policy granting it access to
  the NEW bucket (only the old attachments one) until one was added.
- **The bucket is intentionally private** (block public access on).
  CloudFront with Origin Access Control in front of it is the piece that
  makes the snapshot files actually fetchable by a browser — as of
  2026-09-12 that's the one step still pending; a direct S3 fetch of a
  snapshot file is a 403 today. Once it exists, `catalogue_meta`'s
  `snapshot_*_url` columns get repointed at the CloudFront domain — the
  client reads whatever URL is there, so that swap needs no client-side
  change.
- **`lib/offline/db.ts` (schema v2)** — `medicinesCatalogue`/
  `compositionsCatalogue`/`medicineCompositionMap`. NOT per-doctor like the
  other mirror tables — the global catalogue is the same rows for every
  doctor on a device, so there's exactly one copy, not one per signed-in
  doctor. `medicinesCatalogue.hospitalId` is null for a global row, set for
  a hospital's own pending addition.
- **`lib/offline/catalogueSync.ts`** — the sync engine. Cold start
  downloads the 3 snapshot files and bulk-inserts, then a small delta
  closes the gap since the snapshot was baked; a warm sync is a direct
  delta query (`version > local`) paginated at PostgREST's real 1000-row
  cap, falling back to redownloading the whole snapshot only when the
  device is so far behind the delta itself would be huge
  (`FALLBACK_TO_SNAPSHOT_ROWS`). Triggered from `useSynapse.ts` on every
  real-doctor load, fire-and-forget — never blocks or gates the ruleset,
  so a doctor can rank and prescribe before the first sync finishes,
  exactly as before this existed. `getCatalogueSyncState`/
  `subscribeCatalogueSync` back a new "Medicine catalogue" row in
  Settings' System Health (`features/settings/health/model.ts`), same
  service-registry pattern as the existing "Offline queue" row.
- **What this does NOT do yet**: nothing RANKS with this mirror. See "The
  honest state" above — `composition_brands()`'s replacement is separate,
  deferred, tracked work.

## `src/lib/security/` — the PIN lock

Per-**doctor** (not per-device — a shared machine must not casually mix two
doctors' data), gated on nothing until a doctor opts in from Settings' new
**App Lock** card.

- **`crypto.ts`** — Web Crypto primitives. AES-256-GCM for the Device
  Encryption Key (DEK) and for anything it encrypts; PBKDF2 (250k
  iterations) + AES-KW to wrap the DEK under a PIN. Named plainly in its
  own comments for what a 4-digit PIN actually buys (a phone-lock-screen-
  grade gate on physical access to an unattended tab) — not oversold.
- **`deviceKey.ts`** — the DEK's lifecycle. `setupPin`/`unlockWithPin`/
  `changePin`/`recoverPinFromEscrow`, a lock-state pub/sub
  (`onLockStateChange`) other modules subscribe to. The DEK lives ONLY in
  memory, only while unlocked — never persisted decrypted, which means
  **every fresh login and every reload starts locked** if a PIN is
  configured. That's deliberate: a reload must never double as a bypass
  for physical access.
- **`idleTimer.ts`** — 10-minute default idle-to-lock, real
  pointer/keyboard/touch/wheel activity only (never a background sync
  tick), wall-clock so a backgrounded tab still locks on schedule.
- **`webauthn.ts`** — the Face ID/Touch ID/Windows Hello convenience
  unlock via the WebAuthn `largeBlob` extension (stores the DEK itself as
  the blob, gated by the platform's own biometric ceremony — no server
  round trip). Feature-detected; invisible where unsupported. Layered ON
  TOP of the PIN, never instead of it.
- **`escrow.ts`** — client for the server-side key escrow (below). Called
  from `setupPin`/`changePin` (best-effort store) and the "Forgot PIN?"
  flow (retrieve, only after a fresh password re-auth).

**Server-side**: migration `device_key_escrow` (no RLS policy for
anybody — the edge function is the only reader/writer, same discipline as
`support_requests`) + the `device-key-escrow` Edge Function
(`supabase/functions/device-key-escrow/`). Store/retrieve, both
re-verifying the calling device against `user_devices` (so a revoked
device can't pull its key back even with a still-valid session token). No
manually-configured secret: the server-side wrapping key is derived via
HKDF-SHA256 from `SUPABASE_SERVICE_ROLE_KEY`, which every Edge Function
already gets automatically.

**UI**: `components/LockScreen.tsx` (doctor + clinic name only, PIN pad,
backoff after repeated wrong attempts, full Forgot-PIN recovery flow) +
`components/AppLockGate.tsx` (decides when it renders — mounted once in
`main.tsx` inside `AuthProvider`; sets `inert` on the covered content, not
just an opaque overlay, so Tab/screen-reader can't reach it either) +
`features/settings/AppLockCard.tsx` (Settings card to set up/change the
PIN and turn on fast unlock — `SettingsCard` is now exported from
`SettingsPage.tsx` for this kind of reuse).

Verified live end-to-end against the real deployed edge function: PIN
setup → escrow store round-trip → lock → wrong PIN rejected → correct PIN
unlocks → lock again → full Forgot-PIN recovery (password re-verify →
real escrow retrieve → new PIN) → unlocks. Two real bugs were caught and
fixed in that pass, both instructive:

- `AppLockGate` checked "is a PIN configured" once, at mount, and never
  again — so setting one up mid-session (from Settings) changed nothing
  until a reload. Fixed by re-checking on every lock-state transition, not
  just on `userId` changing.
- The PIN input's refocus-after-a-wrong-attempt called `.focus()` on a
  still-`disabled` element (`checking` hadn't committed to the DOM yet at
  that exact point in the promise chain), silently swallowing every
  keystroke typed right after a mistake. Fixed by moving the refocus into
  a `useEffect` keyed on `checking` itself, so it only runs against a
  render where the input is actually enabled.

## Deployment

`wrangler.jsonc` (repo root) — this project deploys to Cloudflare as a
static-asset Worker (`assets.directory: "./dist"`, SPA fallback via
`not_found_handling`), not classic Pages. If a Cloudflare build ever fails
at the deploy step with "Missing entry-point to Worker script or to
assets directory," this file is missing or was reverted — it has nothing
to do with the app code itself.
