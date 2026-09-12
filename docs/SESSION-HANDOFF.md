# Session handoff — 2026-09-12, the offline read side + medicine catalogue pipeline

**Temporary, self-replacing. REWRITE THE WHOLE FILE next session.**

This picks up from the SAME DAY's earlier handoff (the write-side
foundation + PIN lock), on the same branch (`claude/busy-fermat-sez99f`,
mirrored to `claude/latest-commit-details-vwb2bj`/`master`). That earlier
work is untouched and still accurate as written; everything below is new
on top of it.

**Read `docs/context/offline-security.md` before touching anything under
`src/lib/offline/` or `src/lib/security/` — it now covers the read side and
the catalogue pipeline too, not just the write side.**

---

## Addendum, same session: offline consult-save (the actual core feature)

Everything below this line was the original handoff. This addendum covers
what came after, once CloudFront hit an AWS account-verification wall
(Anmol worked around it by making the S3 bucket's `snapshots/` prefix
public instead — verified end to end, real row counts, real gzip sizes)
and a design conversation about medicine additions surfaced a real gap:
**saving a whole consultation had NO offline path at all** — only front
desk's new-patient/visit registration was queued. Anmol's reaction was
correctly sharp about that ("this should have been first priority"), and
his direction from there shaped everything below: **restrict catalogue
additions to online-only, and spend the real effort on consult-save
surviving offline** — "core features survivable, not a full offline HMS."

Built, in this order:

1. **Offline consult-save** — `saveConsult` (`lib/db/intelligence.ts`) now
   has a registered write handler (`"consult.saveConsult"`).
   `useConsultLifecycle.ts`'s `handleConfirmAndSave` tries it live first;
   on a genuine offline failure it queues the WHOLE save (visit completion,
   prescription, medicines, diagnostic orders) and finishes the consult
   from the doctor's point of view exactly like a successful save — chart
   resets, a clear toast, advances to the next patient. A real (non-
   network) failure still surfaces exactly as before — only
   `!navigator.onLine` triggers the queue path. Deliberately NOT bundled
   into the same queue: WhatsApp send, the exercise plan write, the
   story/goals write, the decision-log learning write — all four are
   already best-effort/non-fatal even fully online, so this extends that
   same acceptance rather than inventing a new compromise.
2. **Medicine/lab additions restricted to online-only, on purpose.**
   `lib/offline/onlineOnly.ts`'s `requireOnlineFor()`, called from both
   `addMedicine` (consult) and `addClinicMedicine` (Practice page). Why
   restricted rather than queued: a same-consult prescription referencing
   a medicine that was ALSO just added offline creates a real id-
   reconciliation problem the write queue doesn't support (queued writes
   are independent by design — see writeQueue.ts's own header). Solvable
   (resolve the later write by name instead of id at replay time), but
   Anmol's call was that the case is rare enough not to be worth the risk
   of getting a medicine-id linkage wrong.
3. **Local-first medicine ranking/search**, not fallback-only. Anmol,
   directly: "I will prefer local database because that is very much
   fast." Once a device has ever synced the catalogue,
   `fetchCompositionBrands`/`resolveProductByName`/`fetchProductsByNames`
   now read the local mirror FIRST — not network-first-with-fallback like
   everything else built this session — falling through to network only
   when nothing has ever synced, or when the local read itself errors
   unexpectedly. Safe because the background sync already keeps the local
   copy close to current independently, and because it's read-only data
   changing rarely, unlike a patient's live chart.
4. **Personalisation now refreshes every 24h**, not just at login —
   closes the gap Anmol named directly ("that thing need to be... cast
   time by time, every one day, two day, three day, or a week"): a doctor
   with an installed PWA open across several days used to rank against a
   slowly staling snapshot of their own brand habits until they reloaded.

Verified: `npx tsc -p tsconfig.app.json --noEmit` and `npm run build` both
clean after every piece above, same discipline as the rest of this session.
NOT yet verified live in a real signed-in browser session — this addendum's
work is fresh; a Playwright pass signed in as a real doctor (finish a
consult with the network actually cut, confirm it queues and later
flushes; confirm ranking is visibly instant once synced) is the natural
next check before calling this fully proven, the same way the PIN lock and
payment-rail fixes earlier in this project's history were.

---

## What landed, in order

Anmol's brief: (1) the offline READ layer (patients/visits/prescriptions +
Synapse ruleset), (2) finish PWA installability, (3) design and build how
the medicine catalogue gets scoped by role and synced efficiently — with
(3) discussed and decided BEFORE building, since it changes (1)'s shape.
Built in that discussed order:

### 1. Catalogue version tracking (migration, live on production)

`20260912_catalogue_version_tracking.sql` — a shared monotonic version
column + trigger on `medicines`/`compositions`/`medicine_composition_map`,
plus a `catalogue_meta` singleton row. Checked the live schema first (no
`updated_at`/soft-delete existed on any of the three tables), applied in
nine smaller stages after the full script timed out the migration tool at
60s, verified with a live no-op update that both the row's version and
`catalogue_meta.current_version` move together.

### 2. The offline read layer

`lib/offline/localMirror.ts` — a generic network-first/local-fallback
read-through cache backed by the Dexie mirror tables that had been empty
schema until now. Wraps the fetch functions doctors and front desk
actually hit: `fetchPatientById`, `fetchTodayPatients`,
`fetchRecentPatients`, `fetchPatientVisits` (the one behind the consult
topbar's "past visits" strip — the read the earlier handoff specifically
named as the gap), `fetchVisitWithDetails`, `fetchPatientDirectory`,
`fetchPatientHistory`, `fetchPrescriptionRenderData`. No call site
changed — every existing caller just started working offline.

`useSynapse.ts` — the ~4,000-row ruleset + personalisation now survives a
dropped connection: on success it's cached whole (Dexie stores Maps/Sets/
Date natively) keyed per doctor; on failure the cached copy is served
instead of hard-failing the consult, with a new `fromCache` flag.

### 3. PWA install prompt

`lib/pwa/installPrompt.ts` captures `beforeinstallprompt` at app boot
(module-level, imported from `main.tsx`'s `initInstallPrompt` — Chrome
fires this once, early, so it must never depend on Settings having been
opened). New Settings card (`InstallAppCard.tsx`) right beside
`AppLockCard`, same treatment: a real "Install app" button where the
browser supports it, honest "not offered yet" otherwise, and manual
"Add to Home Screen" instructions specifically for iOS/iPadOS Safari
(never Chrome/Firefox-on-iOS, which share its engine but can't add to
home screen at all) — Apple has no programmatic prompt to capture.

### 4. The medicine catalogue — designed together, then built

Anmol's call, after discussion: **S3 + CloudFront for the bulk snapshot**,
not a live paginated Supabase pull — his own reasoning (Supabase egress
cost at scale) was sound and matched the fallback design already on the
table. He created a new bucket (`arenode-catalogue-cdn`, kept separate
from the private patient-attachments bucket on purpose) and, after one
IAM permission gap was found and fixed, everything below is live:

- `supabase/functions/catalogue-snapshot-build/` — builds one gzip-
  compressed, row-array JSON file per table, uploaded to S3, updating
  `catalogue_meta`. Actually run against the real catalogue: 213,146
  medicines (3.1MB gzipped), 311,562 map rows (1.16MB), 284 compositions
  (2.8KB) — **~4.3MB total**, well under the earlier estimate. Caught a
  real bug live: PostgREST caps `.range()` at 1000 rows regardless of what
  you ask for — a 5000-row page size silently read the truncated first
  page as "done" and produced a 1000-row snapshot. Fixed, verified with
  the real row counts.
- `supabase/functions/catalogue-cdn-healthcheck/` — the diagnostic that
  found the IAM gap (bucket existed, `arenode-storage-service` had no
  policy granting it access yet) and confirmed the fix.
- `lib/offline/db.ts` (schema v2) + `lib/offline/catalogueSync.ts` — the
  client-side mirror (`medicinesCatalogue`/`compositionsCatalogue`/
  `medicineCompositionMap`, NOT per-doctor — one shared copy) and the sync
  engine: cold start downloads the snapshot, warm syncs delta
  (`version > local`), falls back to a fresh snapshot only if the device
  is far enough behind that the delta would be huge. Triggered from
  `useSynapse.ts`, fire-and-forget, doctor-only.
- Download UX, decided with Anmol before building: **automatic, background,
  invisible** — no permission prompt, a one-time visible indicator only on
  a device's actual first sync. New "Medicine catalogue" row in Settings'
  System Health shows progress/last-synced, same pattern as the existing
  "Offline queue" row.

**Still pending, not done**: CloudFront in front of the bucket (the bucket
is intentionally private — a direct S3 fetch of a snapshot file is a 403
today; Anmol is setting this up, last update was "in progress"). Once its
domain exists, `catalogue_meta`'s `snapshot_*_url` columns get repointed
at it — no client code change needed, it just reads whatever URL is there.

---

## Status

- `npx tsc -p tsconfig.app.json --noEmit` and `npm run build` — clean,
  checked after every piece above landed, not just once at the end.
- The medicine-catalogue mirror has NOT been exercised end-to-end in a
  real browser yet — that needs CloudFront to exist first (the snapshot
  files are unreachable until then). The snapshot files themselves ARE
  confirmed correct server-side (verified row counts, verified gzip sizes,
  verified `catalogue_meta` populated correctly).
- Every edge function deployed this session
  (`catalogue-cdn-healthcheck`, `catalogue-snapshot-build`) is committed
  to `supabase/functions/` — source of truth in git, per this repo's own
  existing discipline for edge functions.

## Still open

- **CloudFront setup** — the one remaining infra step; see above. Once
  Anmol has the domain, update `catalogue_meta`'s three `snapshot_*_url`
  columns (a plain UPDATE, or just re-run `catalogue-snapshot-build` once
  more) and do a real live-browser first-sync test.
- **The offline medicine ranking replica — the biggest remaining piece.**
  The catalogue mirror has the DATA now, but `composition_brands()`
  (single-molecule filter, doctor-preference reorder via `resolveBrands`/
  `groupBrandFamilies`, clinic default tagging, pediatric forms) is still
  a live-only Postgres RPC. Offline, a doctor can chart an entire consult
  against the cached ruleset, but the medicine search/pick step still
  needs a live connection to resolve an actual prescribable brand.
  Deliberately NOT attempted this session — flagged as its own real,
  delicate piece of work rather than rushed in at the end of an already
  large one. This is the next thing to pick up.
- **No eviction on logout.** A shared device signing out one doctor and in
  as another reads only the right doctor's cached rows (every key embeds
  the scoping id), but old rows aren't actively wiped — they just sit
  there. Same class of gap as the PIN lock's own still-open list.
- **Local data at rest**: only the write queue's payloads are encrypted.
  The read-through mirror and the catalogue mirror are not — same standing
  note as the previous handoff, the DEK/crypto helpers already exist for
  this, it's wiring.
- Everything listed as still-open in the previous 2026-09-12 handoff
  before this one (PIN-lock follow-ups — no UI to turn off WebAuthn, no
  escrow-backup management UI, idle timeout not configurable) — untouched
  this session, still open.
