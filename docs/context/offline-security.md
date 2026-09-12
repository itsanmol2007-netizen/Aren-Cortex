# Offline foundation + the PIN lock

Part of the `aren-cortex-context.md` split. Current state only — for how this
landed and what was verified, see `SESSION-HANDOFF.md` (until it's rewritten
again) and `aren-technical-atlas.md` §9a's 2026-09-12 entries.

**Read this before touching anything under `src/lib/offline/` or
`src/lib/security/`, or before telling anyone "the app works offline" —
it currently only half does, and the gap is below, not hidden.**

---

## The honest state, first

Two real things exist and are wired in for real:

1. **A durable write queue** — a doctor's own offline writes survive a
   reload. Wired to exactly ONE flow today: Front Desk's `createNewVisit`
   (new patient + visit registration).
2. **The PIN lock + 72-hour B2B lock** — both fully wired, both verified
   live, both independent of the point below.

What does **NOT** exist yet, and is why the app still feels broken offline
for anything beyond registering a patient:

- **Nothing reads from the local mirror.** `patientsMirror` /
  `visitsMirror` / `prescriptionsMirror` (`lib/offline/db.ts`) are real
  Dexie tables with a real schema, and nothing — not Overview, not
  Patients, not Consult, not Communication — ever writes a row into them
  or reads one back. Every screen in Cortex still does a raw
  `supabase.from(...)` call with no local fallback. Go offline mid-consult
  today and the ruleset (`useSynapse.ts`), the patient list, the visit
  history — all of it — still just fails, exactly as before this work
  started.
- **Front Desk's own, OLDER, separate offline mechanism is untouched by
  any of this.** `features/frontdesk/operational/referenceCache.ts` +
  `eventLog.ts` (see atlas §9) already cache doctors/symptoms in
  localStorage, cache-first. That is a different, simpler, pre-existing
  system for a narrower job (keep two dropdowns populated), not a
  precursor to the Dexie mirror — the two do not share code and were not
  designed as one system. Don't assume touching one affects the other.

**The next real slice of this work is populating the read side** — turning
`patientsMirror`/`visitsMirror`/`prescriptionsMirror` into an actual
read-through cache (network first, local fallback, refresh on reconnect)
for at least the patient/visit data a doctor needs mid-consult. Until that
lands, "offline-friendly" only covers new-patient registration and app
security (PIN lock), not the doctor's actual clinical workflow.

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
