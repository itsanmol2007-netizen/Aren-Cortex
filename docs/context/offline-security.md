# Offline foundation + the PIN lock

Part of the `aren-cortex-context.md` split. Current state only — for how this
landed and what was verified, see `SESSION-HANDOFF.md` (until it's rewritten
again) and `aren-technical-atlas.md` §9a's 2026-09-12 entries.

**Read this before touching anything under `src/lib/offline/` or
`src/lib/security/`, or before telling anyone "the app works offline."**
As of 2026-09-12 a doctor can chart, rank, prescribe from the existing
catalogue, AND SAVE a whole consultation while offline — the queue closes
with everything already saved here still fully readable. Deliberately
NOT covered, by Anmol's own explicit call (not an oversight): adding a
brand-new medicine to the catalogue mid-consult or from the Practice page
stays online-only. See "The honest state" below for the full, current
breakdown — this is a "core features survive, not a full offline HMS"
system, and that boundary is deliberate.

---

## The honest state, first

Real and wired in for real:

1. **A durable write queue** — a doctor's own offline writes survive a
   reload. Wired to TWO flows: Front Desk's `createNewVisit` (new patient +
   visit registration) and, as of this session, `"consult.saveConsult"` —
   see item 8 below, the actual core-survivability feature.
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
7. **The offline medicine-ranking replica** (`lib/offline/offlineBrands.ts`,
   `lib/offline/offlineMedicineLookup.ts`) — `composition_brands()`'s exact
   ranking (single-molecule filter, doctor-preference/clinic-default
   reorder, paediatric-form boost, `is_primary`, alphabetical tiebreak) and
   the exact-name lookups (`resolveProductByName`/`fetchProductsByNames`)
   both now have offline replicas, wired into `fetchCompositionBrands` and
   `lib/db/medicines.ts` with network-first/local-fallback. **Verified
   against the real RPC's actual SQL source (pulled directly from the live
   database, not guessed) at full scale** — an equivalent query built off
   the same raw tables the client mirror actually holds (not the
   `mv_composition_brand` view) produced byte-identical output to
   `composition_brands()` across paracetamol (1786 candidates), amoxicillin
   (1511), a combination-only composition, a composition with no coverage
   at all, and compositions with real `is_primary` rows — zero diffs, both
   with and without a paediatric/keep-list boost active. **Local-first, not
   fallback-only**: once a device has ever synced the catalogue,
   `fetchCompositionBrands`/`resolveProductByName`/`fetchProductsByNames`
   read the local mirror FIRST (not the network, falling back to local on
   failure) — Anmol's call, for speed: a same-machine IndexedDB read beats
   a network round trip regardless of connectivity, and the background sync
   already keeps the local copy close to current independently. Only a
   device that has never synced asks the network at all; an unexpected
   local read failure still falls through to the network as a safety net.
8. **Offline consult-save** — the actual core-survivability feature,
   built after Anmol's own "this should have been the first priority"
   reaction to finding it wasn't there yet. `saveConsult`
   (`lib/db/intelligence.ts`: visit completion + prescription +
   prescription_medicines + diagnostic_orders) now has a registered write
   handler (`"consult.saveConsult"`) — `useConsultLifecycle.ts`'s
   `handleConfirmAndSave` tries it live first, and on a genuine offline
   failure (`!navigator.onLine`, not a real server-side rejection, which
   still surfaces exactly as before) queues the whole save and finishes the
   consult from the doctor's point of view (chart resets, toast confirms,
   moves to the next patient) instead of hard-failing at the last step. No
   id-reconciliation risk: every medicine/composition id it ever receives
   already exists in the (downloaded-well-before-this-consult) catalogue.
   Deliberately NOT queued alongside it — WhatsApp send (no offline
   equivalent exists for a message send), the exercise plan write, the
   story/goals write, the decision-log learning write — all four are
   already treated as best-effort/non-fatal even when fully online (see
   `useConsultLifecycle.ts`'s own comments), so skipping them outright when
   the whole save had to queue is the same acceptance, not a new one.
9. **Medicine/lab additions are explicitly restricted to online-only**,
   not silently broken. `addMedicine` (consult) and `addClinicMedicine`
   (Practice page) both call `requireOnlineFor()`
   (`lib/offline/onlineOnly.ts`) up front and throw a clear, doctor-facing
   message rather than attempting a write that has nowhere safe to go
   offline. This was a deliberate scope cut, not an oversight: queuing a
   brand-new medicine's creation would need either inventing a fake id and
   reconciling it once the real one exists, or resolving a same-consult
   prescription by name instead of id at replay time — both real, buildable
   designs, deliberately not built because the case (adding a genuinely new
   medicine mid-consult, offline) is rare and worth less than the risk of
   getting a medicine-id linkage wrong. Anmol's own words: "we just need to
   build core features survivable, not a full offline HMS."
10. **Personalisation refreshes periodically, not just at login.**
    `useSynapse.ts` re-runs its whole load (ruleset + preferences + brand
    habits + frequent list + clinic defaults) every 24 hours while the tab
    stays open AND online — closes the one real gap in "cached once at
    login": a doctor who keeps an installed PWA open across several days
    would otherwise rank against a slowly staling snapshot of their own
    habits until they happened to reload.

What does **NOT** exist yet:

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
## The offline medicine-ranking replica

`composition_brands()` is a Postgres RPC (source pulled directly from the
live database, not guessed — `pg_get_functiondef`), backed by a
materialized view (`mv_composition_brand` = `medicine_composition_map`
joined to `medicines`, with `ingredient_count` computed as "how many
compositions does this medicine_id map to, total"). Its logic, in order:
filter to compositions/hospital-visible rows, compute `single_total`/
`combination_total` across ALL visible rows, then rank ONLY the
single-molecule ones by (doctor-history-or-clinic-default) desc, then
(paediatric AND route is syrup/drops) desc, then `is_primary` desc, then
name ascending — and take the top `limit`.

- **`lib/offline/offlineBrands.ts`** — reproduces that exact logic over
  `medicinesCatalogue`/`medicineCompositionMap` (computing `ingredient_count`
  itself, since the mirror holds the raw tables, not the view). Returns the
  same `BrandRow[]` shape the RPC does (now exported from `lib/db/synapse.ts`
  for this reason), so every line downstream of the RPC call in
  `fetchCompositionBrands` (building candidates/totals, `resolveBrands`,
  `groupBrandFamilies`) runs unchanged regardless of which one answered.
- **`lib/offline/offlineMedicineLookup.ts`** — the offline counterpart to
  `lib/db/medicines.ts`'s exact-name lookups
  (`resolveProductByName`/`fetchProductsByNames`), mirroring that file's own
  `hydrate()` field-for-field — including its deliberate `strengthMg: null`
  quirk (the catalogue puts strength in the product NAME instead;
  diverging from that offline would make a product's card look different
  depending on connectivity).
- **Wiring**: both `fetchCompositionBrands` and `lib/db/medicines.ts`'s two
  lookups try the network first, catch, and fall back to the local replica.
  An EMPTY offline result is treated as ambiguous rather than trusted at
  face value — this file's own header states the rule that motivated the
  check: "REACHABILITY IS ABSOLUTE… a product the search can find must be a
  product the accept can deliver." So an empty/null offline answer is only
  accepted when the catalogue has actually synced at least once on this
  device (`getCatalogueSyncState().localVersion > 0`); otherwise the real
  network error surfaces instead of a false "not found."
- **Correctness verification**: given the clinical stakes (this decides
  what a doctor sees to prescribe), the ranking logic was checked against
  the REAL RPC's REAL output on the REAL catalogue, not a synthetic sample
  — an equivalent SQL query built directly off the raw tables (the same
  ones the client mirror holds) was diffed against `composition_brands()`
  itself using `EXCEPT`, at full scale: paracetamol (1786 single-molecule
  candidates), amoxicillin (1511), a combination-only composition (zero
  single-molecule products — the one-row-of-nulls-carrying-totals case), a
  composition with no catalogue coverage at all (zero output rows, not a
  placeholder), and compositions with real `is_primary` rows, both with and
  without a paediatric/doctor-preference boost active. Zero differences in
  every case.
- **What this does NOT solve**: a doctor ADDING a brand-new medicine
  (`addMedicine`) while offline. This is now a deliberate, explicit
  restriction rather than an open gap — see "The honest state" item 9
  (`lib/offline/onlineOnly.ts`'s `requireOnlineFor`): both `addMedicine`
  and Practice's `addClinicMedicine` throw a clear message up front instead
  of attempting a write that has no safe offline path (the id-
  reconciliation problem this ranking replica does NOT need to solve, since
  every id it ever reads already exists in the synced catalogue).

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
