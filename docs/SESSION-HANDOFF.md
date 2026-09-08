# Session handoff — 2026-09-08, round 5 (Cortex↔Consult root cause + two live bugs)

**Temporary, self-replacing. REWRITE THE WHOLE FILE.**

Anmol reported the app "confused between Cortex and Consult" on the real
test clinic (Ekanki Solo Clinc, `9999999999` / `Gigabyte@Test`): a
receptionist had been added from the admin panel, but Overview showed no
queue tile, Consult showed no queue, and registering a patient from the
desk seemed to go nowhere. Also flagged: the Register Patient modal's Age
field was unusably cramped, the modal read oversized, and a "queue sheet
flashes to the registration modal ~200ms after opening" flicker.

## Root cause — `clinic_mode` was never written after registration

The whole Cortex/Consult split is already correctly built and has been for
a while: `lib/workspace/mode.ts` derives it from `hospitals.clinic_mode`
(`solo` | `solo_reception` | `multi_doctor`), `useWorkspaceMode` reads it
off the auth identity, and everything downstream — Overview's queue tile,
the Consult queue sheet, `useConsultQueue` — is already correctly gated on
`workspace.isConsult`. **The bug was one missing write.** Adding staff
(`supabase/functions/admin-staff/index.ts`, called by `createStaffMember`
in `src/lib/db/staff.ts`) creates the `users`/`doctors` rows but never
touched `clinic_mode` — so a solo clinic that hired a receptionist from
inside the app (onboarding or later, exactly Anmol's path) stayed rendered
as Cortex forever: no queue, no Consult chrome, even though a receptionist
existed and was actively registering patients into a queue nobody could see.

Confirmed live: `hospitals` row `64c26e24-3668-49c6-8b99-6ddb8c14883e`
("Ekanki Solo Clinc") had `clinic_mode = 'solo'` with an active `reception`
user (`Test Reception`, created 2026-08-29) on file the whole time.

**Fixed two ways, both shipped:**
1. `admin-staff/index.ts` now promotes `clinic_mode` from `solo`/null to
   `solo_reception` the moment a `reception`-role hire succeeds (best-effort,
   non-fatal, same pattern as the existing `doctors` insert). Deployed live
   (project `ieimvjprtltancxapuzg`, function version 4). Never touches
   `multi_doctor` or non-reception hires.
2. One-time backfill migration
   `supabase/migrations/20260908_backfill_clinic_mode_reception.sql`,
   applied live: promotes any existing clinic stuck the same way (found
   exactly one — Ekanki). Verified: that hospital's `clinic_mode` is now
   `solo_reception`.

**What this means for testing:** the fix is server-side and retroactive —
Ekanki's `clinic_mode` is already corrected in the DB. The *currently
signed-in* doctor session (if one is open) won't see it until the identity
reloads (next login, or a hard refresh — `AuthProvider` only re-verifies on
mount/reconnect/token-refresh, never on plain navigation, which is
deliberate — see the next section). A fresh sign-in with the same
credentials should now land in Consult with the receptionist's queue visible.

## The "loading again and again" / flashing complaint — already mostly right, one real bug

Anmol's instinct ("verify once at login, cache it, stop re-verifying on
every page") is already how this app works: `AuthProvider` loads identity
ONCE on mount and only re-verifies on token refresh, reconnect, or device
revocation — never on navigation. `useQueue` already cache-first's the
queue itself into localStorage (`aren.cache.queue.<hospitalId>.v1`) so
leaving and returning to a page doesn't blank it. Nothing needed rebuilding
here architecturally.

**The one real bug**: `App.tsx`'s "which overlay opens on load" effect
(queue sheet vs. Register Patient) decided off `queue.waiting.length`
alone. Two ways that read wrong for one render and then couldn't self-correct
(the effect is guarded to decide only once, by design — `consultOverlayShowing`
short-circuits it once any overlay is open):
- Before the first fetch ever resolves, `waiting` is `[]` — reads as
  "nobody waiting" even though nobody has actually checked yet.
- Worse: `useQueue`'s cache-first seed can show a STALE queue (people who
  were waiting last time the tab was open) for one render before the live
  fetch corrects it — long enough to open the wrong overlay, with no way back.

Fixed by adding a `settled` flag to `useQueue` → `useConsultQueue` (true
only once a REAL fetch has returned, distinct from `loading`, which flips
false on a cache hit too) and gating the decision effect on it. One
correct decision, made after the network has actually spoken — not a race.

## Register Patient modal — Age field bug + scaled down ~12%

Reproduced exactly (see "how" below): the Age number input rendered at
**28px wide** — a sliver, not a usable field — while the "or" + date picker
next to it looked fine. Root cause: the date `<input>` carried both
`fd-field` (unlayered CSS, `width:100%`) and Tailwind's `w-[152px]`
(layered) on the *same element*. Per the codebase's own documented §13
layer trap, unlayered always beats layered regardless of specificity — so
`w-[152px]` silently lost, the date input's real flex-basis became "100% of
the row" instead of a fixed 152px, and flexbox starved its `flex-1`
sibling (the age input) down toward zero to make room. Fixed the same way
`AgeInput` already does it right: wrap the date input in a `w-[152px]
shrink-0` **div** and let the input fill that wrapper at `width:100%` —
never combine `fd-field` with a Tailwind width utility on the same element
again anywhere in this feature.

Also scaled the whole modal down ~12% (Anmol: "too giant, like another
page") — `maxWidth` 936→820, rail 292→258, paddings/gaps/section-header
sizes trimmed proportionally. `PaymentRail` internals untouched (fit fine
in the narrower rail, verified visually).

**How this was verified without a live browser session**: Chromium cannot
complete a TLS handshake through this sandbox's agent proxy (confirmed
again this round, both with and without an explicit `--proxy-server` arg —
this is a hard environment limit, not a config issue, matching round 4's
own note on the same trap). Live login-and-click E2E was not possible.
Instead: a temporary route (`src/DebugPreview.tsx` + a `/debug/preview-modal`
entry in `main.tsx`) mounted `CreateVisitModal` directly with mock props —
zero network calls, so Chromium could load it from the local Vite server
with no proxy involved at all. Screenshotted before and after the fix
(confirmed the 28px bug, then confirmed the repair), then **deleted both
files** before committing — do not leave that route in.

## Traps worth knowing before you edit (carried forward + new)

- **Chromium cannot get through this sandbox's proxy to any real HTTPS
  host** (Supabase, Google Fonts, anything) — confirmed a second time this
  round. `curl`/Node's own `https` still work fine (that's how the DB
  queries and Edge Function deploy in this round were verified). For any
  visual UI check that doesn't strictly need live data, mount the component
  behind a temporary no-network debug route instead of fighting the proxy —
  and delete the route before committing.
- **`fd-field` (unlayered, `width:100%`) beats any Tailwind width utility on
  the same element, always** — this is the §13 layer trap biting the
  feature's own newer code, not just legacy `base.css`. If an input needs a
  fixed width, the width goes on a wrapping div, never combined onto the
  `fd-field` element itself. Audited: no other occurrence of this exact
  combination currently exists in `src/features/frontdesk` or
  `src/features/admin`.
- **`hospitals.clinic_mode` is written in exactly one place now**:
  `admin-staff`'s reception-hire path. If a second staff-creation path is
  ever added (bulk import, a different admin flow), it needs this same
  promotion or the bug comes back for that path.
- **`AuthProvider` identity is load-once-per-session by design** — don't
  "fix" the Cortex/Consult mode by re-fetching it on every render/route;
  that's the opposite of what was asked. A `clinic_mode` change takes
  effect on next sign-in/reload, not instantly for an already-open tab —
  this is a deliberate tradeoff (Rule 19: read once, trust it), not a bug.
- **`doctors.is_clinic_admin` is NOT `users.role`.**
- Supabase MCP's `execute_sql` refuses multi-statement writes;
  `apply_migration` handles a whole file fine. Project `ieimvjprtltancxapuzg`
  ("arenode"), org `bzrjwiuvgaflsqojxgou`, plan: free.
- `node_modules` starts empty in a fresh container; `npm install` first —
  and it touches `package-lock.json` with meaningless `"dev": true` noise
  on already-resolved optional deps; `git checkout -- package-lock.json`
  before committing if nothing else needed it to change.

## Carried forward from round 4, unchanged

Zoho `support-notify` real secrets still not in Supabase (needs Anmol's own
local-CLI or dashboard step — see round 4's own notes if this file gets
truncated before a full rewrite next round). `admin-staff` (staff creation)
was already live before this round; now also does the `clinic_mode` write
above.

## Next, in the order I'd do it

1. Anmol re-tests: fresh sign-in on `9999999999` / `Gigabyte@Test` should
   now land in Consult with the receptionist's queue visible, and
   Overview's "Today's queue" tile should populate. Also re-check the
   Register Patient modal's Age field and overall size on his own screen.
2. If any OTHER existing clinic reports the same "stuck as Cortex" symptom,
   it means it hired reception through a path other than `admin-staff`
   (self-registration onboarding, most likely) — that path should already
   ask "do you have a receptionist" at signup time per
   `docs/Login Screen Implementation.md`, but it's worth confirming that
   flow still sets `clinic_mode` correctly at creation time; this round
   didn't audit it since no live clinic showed that symptom.
3. Zoho real secrets (round 4, still open).
4. Carried forward, still open from earlier rounds: SK Pandey's 76-credit
   test state, `RC_2`'s pending recharge, the follow-up-message scheduler,
   real Meta template submission, an admin UI for
   `approve_credit_recharge`.
