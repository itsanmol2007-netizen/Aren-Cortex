# Session handoff — 2026-09-01 (privacy fix, subscription content, real devices)

**Temporary, self-replacing. REWRITE THE WHOLE FILE.** `cortex-design-dna/*.md`
and `context/*.md` are stable reference — touch them only when a rule in them
is actually wrong.

## ⚠ HOW TO VERIFY IN THIS SANDBOX — read before trusting any check

1. **`node_modules` starts incomplete** (no `react`, no `@types`). With no
   types, `npx` resolves a NEWER tsc than the pinned 5.9.3, which aborts on a
   `baseUrl` deprecation *before checking any file*. **Run `npm install`
   first**, confirm `npx tsc --version` says 5.9.3, then use `npm run build`.
   Do NOT add `ignoreDeprecations` to tsconfig.
2. **`npm run build` passing does not mean it LOOKS right.** The throwaway
   harness below found three real bugs this round (a Devices card stuck on a
   skeleton forever, `capitalize` title-casing a whole grid, headless
   Chromium reading as "Safari on Linux" because `/\bChrome\//` does not match
   `HeadlessChrome/`):

   ```
   preview.html + src/__preview.tsx   # mount a page with mock props inside
                                      # QueryClientProvider + MemoryRouter +
                                      # AuthProvider; ?v= picks the page
   npx vite --port 5199 --host 127.0.0.1
   node shot.mjs <view> [selector-to-click]
   ```
   `shot.mjs` uses `executablePath: "/opt/pw-browsers/chromium"`,
   `page.route("**/rest/v1/**")` to fulfil Supabase reads with canned JSON, and
   `addInitScript` to seed a fake `sb-<project>-auth-token` plus
   `aren.device.v1.key` so signed-in paths actually render. Screenshot AND
   `getBoundingClientRect()`. All three files are deleted afterwards.

   Live login is impossible here: the browser's egress to the Supabase host
   returns `ERR_CONNECTION_RESET`, through `$HTTPS_PROXY` too.

## What this round did

### The auth email and the phone number are now unpublishable
Cortex signs in by phone; the landing repo derives `<digits>@aren.internal` so
Supabase has something email-shaped to key on. Settings was DISPLAYING that
address as "your email" and offering to change it through
`supabase.auth.updateUser({ email })` — which publishes the doctor's phone
number and, if used, would rewrite the login identity out from under
`phoneToAuthEmail()` and lock them out.

- The auth address is never read into UI state at all. `getUser()` is now used
  only for `last_sign_in_at`.
- **New column `doctors.email`** — a real, optional, doctor-owned CONTACT
  address. NULL renders as "Add a contact email", never as a fake value.
- The modal edits `doctors.email` via `updateDoctorContactEmail`. The sign-in
  method is stated, not editable, and the number is masked to `•••• 5678`.
- Verified by rendering: `document.body.innerText` contains neither
  `aren.internal` nor the raw number.

### Subscription — content, and a Manage button that does something
Migration `subscription_plan_content_and_requests`, applied live:
- `plans` + `tagline`, `highlights text[]`, `support_response`, `cta_note`.
- `subscriptions` + `seats`, `billing_email`, `billing_name`.
- **`subscription_requests`** — kind (upgrade / add_seats / billing_details /
  invoice / cancel / question), message, status. RLS: a clinic may SELECT its
  own and INSERT one with `status='open'`; it cannot resolve its own request.
- Plan renamed to **"AREN Polaris"** with real copy in the rows. The old rule
  still holds absolutely: nothing branches on `plan.name`, `plan.code` is the
  only stable key, and every string a doctor reads is editable without a
  deploy.
- "Manage subscription" opens a sheet: plan facts, what it carries, support
  promise, a request form that writes a row, and the requests already filed.
  No mailto — an unconfigured mail client would swallow the ask.

### Devices are really tracked
Migration `user_device_sessions`. One row per (account, browser install);
`device_key` is a UUID in localStorage. **No IP and no location by design.**
- `touchThisDevice` runs once per signed-in account from `AuthProvider` (never
  while offline) and reports its own row's `revoked_at` back — so signing a
  device out from Settings genuinely signs it out when it next opens Cortex.
  `scope: "global"` remains the immediate server-side kill switch, and the UI
  says which is which.
- RLS is per-USER, not per-hospital: a colleague must not enumerate or revoke
  the machines someone else works from.
- New gate notice `device-revoked` so the login screen explains what happened.

### System Health survives a lost connection
- Probes run in **parallel** and are **skipped entirely** when
  `navigator.onLine` is false — three 6s ceilings in series was an 18-second
  page at exactly the moment it was least affordable. Measured: offline
  verdict on screen 152ms after DOM ready.
- The last snapshot is cached per-device (`aren.health.v1.snapshot`) and
  rendered immediately, labelled "Last checked …" until a live probe lands.
- Full-page skeleton at real sizes, not a spinner in an empty frame.
- Offline is ONE fault with four symptoms, so the hero says "You're offline"
  rather than counting four problems that are really the Wi-Fi.

### Two visual fixes
- **The doctor photo's blue tile is gone.** `AVATAR_SCREEN_BG` is the brand
  gradient at wash strength with brand-ink initials. Prescriptions were
  already correct — `PrescriptionDocument` puts the photo on plain white with
  only an accent border, and only the *no-image* crest uses clinic colour.
- **Sidebar dividers are fixed 1px hairlines.** Third attempt. They were
  growable (76px slabs, then 44px of dark nothing); `margin-top: auto` on the
  tail was tried and moved the complaint rather than fixing it — one 400px
  band instead of three small ones. The nav is now its own height and the
  leftover panel sits BELOW it, above the doctor pill, where an unfilled list
  is ordinary.

## Flagged / not done

- **`TERMS_URL` is still a guess** (`arenode.com/terms`).
- Nothing writes `subscription_requests.status` — triage is service-role, and
  no Admin panel exists to do it. Requests will sit at `open` until one does.
- `subscriptions.billing_email` is null for both real clinics; the sheet falls
  back to the doctor's contact email and says "Not set" when there is none.
- The sidebar nav still occupies roughly the top half of a tall panel. That is
  normal for a nav list, but if it should fill more, the answer is bigger
  tiles — never gaps between groups.
- Notifications, Appearance, Export and Data management still render as rows
  marked "Not yet".

## Environment

- No `supabase/migrations/`; schema changes go in live via Supabase MCP.
  Project `ieimvjprtltancxapuzg` (org `arenod`, `ap-south-1`).
- `main` and `master` are unrelated histories. Work is on
  `claude/pdpg-layout-fixes-768k6v`, fast-forwarded into `master` each round.
