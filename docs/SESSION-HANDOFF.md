# Session handoff — 2026-09-12, offline foundation + PIN lock + a Cloudflare fix

**Temporary, self-replacing. REWRITE THE WHOLE FILE next session.**

Everything below landed on `claude/latest-commit-details-vwb2bj`, five
commits: a payment-rail keyboard bug, the PWA/offline write-side
foundation, a per-doctor PIN lock, and a Cloudflare deploy fix that turned
out to be unrelated to the app code entirely.

**Read `docs/context/offline-security.md` before touching anything under
`src/lib/offline/` or `src/lib/security/` — it states the one thing most
worth knowing up front: the offline work below covers WRITES, not reads.**

---

## 1. Payment rail: dead arrow keys + an invisible focus ring

Anmol, reviewing the previous session's keyboard-nav work: *"you click
enter [on Collect ₹total] and then this thing just disappeared, now the
whole arrow movement [stopped working]"* — plus the focus ring being too
subtle to see against the gradient buttons.

Two real, separate bugs in `components/PatientPaymentRail.tsx`:

- **Dead arrows**: pressing Enter on "Collect ₹total" swaps it for the
  payment-method grid — the focused button is removed from the DOM, and
  the BROWSER (not React) resets focus to `<body>` the instant that
  happens. A keydown fired while `<body>` is focused never reaches the
  rail's `onKeyDown` listener at all — it doesn't bubble down to a div
  that isn't an ancestor. Fixed with a `useEffect` that refocuses the
  first control in whichever decision area just appeared, whenever
  `collecting`/`splitting`/`decided` changes and focus was lost — never on
  first mount (`PatientModal` owns that moment), never fighting the split
  amount input's own `autoFocus`.
- **Invisible ring**: Tailwind's `focus:outline-none` (needed to suppress
  the ring on a plain mouse click) and `focus-visible:outline` both
  resolve through the SAME shared `--tw-outline-style` custom property.
  `:focus-visible` is always also `:focus`, so `outline-none`'s value won
  regardless of the `focus-visible:` rule trying to override it — confirm
  this against the BUILT CSS if it recurs elsewhere, not by reading the
  class list, that's how it was actually found. Fixed with an explicit
  `focus-visible:[outline:2.5px_solid_#a855f7]` (the arbitrary-property
  form), which sets the literal shorthand and bypasses the shared
  variable — applied to all fourteen buttons in the rail.

Verified live with Playwright: arrow into "Collect ₹500" (ring visibly
violet), Enter, focus lands on "Cash" (not `<body>`), a further
`ArrowRight` still moves it.

## 2. The offline foundation — write side only, and that matters

Full architecture in `docs/context/offline-security.md`; the one line
that matters most if you read nothing else: **nothing reads from the
local mirror yet.** `patientsMirror`/`visitsMirror`/`prescriptionsMirror`
(`lib/offline/db.ts`) are real Dexie tables with zero readers or writers.
Every screen in Cortex still does a raw `supabase.from(...)` with no
offline fallback. Anmol's own reaction after this landed: *"this app is
really not offline friendly"* — correct, and expected at this point in
the work, not a regression. **The next slice is populating that read
side** — a real read-through cache (network first, local fallback,
refresh on reconnect) for the signed-in doctor's own patients/visits, at
minimum.

What DOES work, wired in for real:

- **A durable write queue** (`lib/offline/writeQueue.ts`) — generalizes
  the in-memory retry `useVisitActions.ts`'s `createNewVisit` already had
  into something that survives a reload. One registered handler today:
  `"frontdesk.createVisit"`. A queued row's payload is encrypted under the
  signed-in doctor's DEK (see §3) whenever one is available — real PII
  sitting in IndexedDB overnight is exactly the scenario the PIN lock
  exists for.
- **A connectivity clock** (`lib/offline/connectivityClock.ts`) — "when
  did this device last actually hear from the server," advanced only on a
  real authenticated round trip, never on bare `navigator.onLine`.
- **The 72-hour B2B lock** (`lib/offline/lockGate.ts`) — a licensing
  friction, not a security boundary (says so in its own comments), checked
  independently at three seams: new-patient creation, Synapse ranking
  (`useConsultIntelligence.ts`'s `synapseLocked`), WhatsApp sends
  (`messaging.ts`'s `invokeSend`).
- **Settings → System Health** gained an "Offline queue" row, following
  that panel's existing service-registry pattern rather than a new widget.

## 3. A per-doctor PIN lock, with real server-side recovery

Design reviewed and approved separately before building (4-digit PIN,
rest of the technical decisions left open). Locks the whole app after 10
minutes of real idle time; shows only the doctor's name and clinic until
the right PIN (or a registered platform authenticator) comes back.
Full detail in `docs/context/offline-security.md`; the shape:

- **`src/lib/security/`** — `crypto.ts` (Web Crypto: AES-256-GCM DEK,
  PBKDF2+AES-KW PIN-wrap), `deviceKey.ts` (the DEK's in-memory-only
  lifecycle, per-DOCTOR not per-device), `idleTimer.ts` (10-min real
  activity), `webauthn.ts` (Face ID/Touch ID/Windows Hello via the
  `largeBlob` extension — a convenience layered on the PIN, never a
  replacement), `escrow.ts` (client for the server-side recovery below).
- **Server-side**: new table `device_key_escrow` (no RLS policy for
  anybody — the edge function is the only reader/writer) + the
  `device-key-escrow` Edge Function, deployed. No manually-configured
  secret — its wrapping key derives via HKDF from
  `SUPABASE_SERVICE_ROLE_KEY`, which every Edge Function already gets.
- **UI**: `components/LockScreen.tsx` + `components/AppLockGate.tsx`
  (mounted once in `main.tsx`, inside `AuthProvider` — resting state is
  LOCKED whenever a PIN is configured and no DEK is in memory, which is
  every fresh login AND every reload, deliberately: a reload must never
  double as a bypass for physical access) + a new Settings **App Lock**
  card (`features/settings/AppLockCard.tsx` — `SettingsCard` is now
  exported from `SettingsPage.tsx` for this).

**Verified live, end to end, against the real deployed edge function**:
set a PIN (escrow store round-trip succeeds for real) → lock → wrong PIN
rejected with a visible error → correct PIN unlocks → lock again → full
Forgot-PIN recovery (password re-verify → real escrow retrieve
round-trip → new PIN) → unlocks. Two real bugs were caught and fixed
during that pass — both are the kind that cost a while to find if you
don't already know to look:

- `AppLockGate` checked "is a PIN configured" once, at mount, and never
  again — setting one up mid-session (Settings) changed nothing until a
  reload. Fixed: re-check on every lock-state transition, not just when
  `userId` changes.
- The PIN input's refocus-after-a-wrong-attempt called `.focus()` on a
  still-`disabled` element (`checking` hadn't committed to the DOM yet at
  that point in the promise chain) — silently ate every keystroke typed
  right after a mistake. Fixed by moving the refocus into a `useEffect`
  keyed on `checking`, so it only fires against a render where the input
  is actually enabled again.

## 4. Cloudflare deploy was failing — not the app's fault

Anmol's Cloudflare build log showed the actual build succeeding
completely (`tsc -b`, `vite build`, PWA precache all green), then the
DEPLOY step — `npx wrangler versions upload` — failing immediately:
`Missing entry-point to Worker script or to assets directory`. This
project deploys as a Cloudflare **Worker** (not classic Pages), and there
was no `wrangler.jsonc` telling Wrangler the build output lives in
`dist/`. Added one at repo root: `assets.directory: "./dist"` +
`not_found_handling: "single-page-application"` (client routes like
`/app/cortex` are handled entirely by react-router in the browser — without
this a hard reload on a deep route 404s at the edge instead of getting
`index.html` back). Verified locally with `npx wrangler versions upload
--dry-run` — reports a real asset upload instead of failing before it
gets that far.

The local `dexie` import error Anmol also hit that session was separate
and unrelated: a stale local checkout that predated `npm install` picking
up the new dependency. Not a code bug either.

---

## Status

- `npx tsc -p tsconfig.app.json --noEmit` and `npm run build` — clean.
  (Same standing note as last time: plain `tsc --noEmit` at the repo root
  is vacuous here — the root `tsconfig.json` is a solution file with only
  `references`. Use `tsc -b`, or `-p tsconfig.app.json`.)
- Fresh clone + `npm ci` + `npm run build` verified clean in an isolated
  directory (not just the working tree) before every push.
- Walked live in a real browser signed in as the test doctor for both the
  payment-rail fix and the full PIN-lock flow (setup, lock, wrong PIN,
  correct PIN, forgot-PIN recovery) — screenshots taken at each step, zero
  console errors throughout.
- The `device-key-escrow` Edge Function is deployed and live (version 1).
  The `device_key_escrow` migration is applied.

## Still open

- **The offline read side — see §2.** This is the one that actually makes
  "offline-friendly" true of the doctor's real workflow, not just
  new-patient intake. Nothing else in this list matters as much.
- **PIN-lock follow-ups, roughly in order of what a doctor would notice
  first**: no UI yet to turn OFF a registered WebAuthn credential (only to
  turn it on); no UI to see/revoke escrow backups per device from
  Settings; the 10-minute idle timeout is not configurable (deliberately,
  for now — see the design note in `offline-security.md`'s history if it
  comes up again).
- **Local data at rest**: only the write queue's payloads are encrypted
  today. The mirror tables would need the same treatment once they have
  real readers/writers (§2) — the DEK and the AES-GCM helpers
  (`lib/security/crypto.ts`) already exist for this, it's wiring, not new
  crypto.
- Everything listed as still-open in the 2026-09-11 handoff before this
  one (now folded into `aren-technical-atlas.md` §9a and the relevant
  context pockets rather than repeated here) — nothing in this session
  touched sidebar/branding/Help&Support, so check there if picking that up.
