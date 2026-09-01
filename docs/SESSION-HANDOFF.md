# Session handoff — 2026-08-31 (Settings rebuild + subscription foundation)

**Temporary, self-replacing. REWRITE THE WHOLE FILE.** `cortex-design-dna/*.md`
and `context/*.md` are stable reference — touch them only when a rule in them
is actually wrong.

## ⚠ HOW TO VERIFY IN THIS SANDBOX — read before trusting any check

Two rounds of visual regressions shipped this session because verification
was fake. Both causes are now known:

1. **`node_modules` starts incomplete** (no `react`, no `@types`). With no
   types, `npx` resolves a NEWER tsc than the pinned 5.9.3, which aborts on
   a `baseUrl` deprecation *before checking any file* and prints nothing
   else. **Run `npm install` first**, then confirm `npx tsc --version` says
   5.9.3 and that a deliberate type error is caught. Do NOT add
   `ignoreDeprecations` to tsconfig — under 5.9.3 there is nothing to
   ignore and `"6.0"` may be rejected.
2. **`npm run build` passing does not mean it LOOKS right.** Two shipped
   disasters (grey slabs in the sidebar, a squashed search field) both
   compiled perfectly. The method that actually works, and is cheap:

   ```
   # throwaway harness, deleted afterwards
   preview.html + src/__preview.tsx  (mount the page with mock props,
                                      wrapped in QueryClientProvider +
                                      MemoryRouter + AuthProvider)
   npx vite --port 5199 --host 127.0.0.1
   node shot.mjs   # playwright, executablePath: "/opt/pw-browsers/chromium"
   ```
   Screenshot AND `getBoundingClientRect()` the key nodes. `npm install
   --no-save playwright` if needed; the browser is preinstalled. This found
   both bugs in one run.

## What this round did

### Sidebar — fixed the slabs I shipped
The flexible dividers painted their gradient on a box allowed to grow to
76px, so each "hairline" rendered as a grey slab between nav groups. The box
is transparent flexible space now; the line is a centred 1px `::before`,
capped at 44px. **A growable element must never carry paint it only needs a
line's worth of.**

### Settings — rebuilt in Tailwind against a supplied reference
The old page was a single full-width column (layout-composition rule 1's
exact prohibition). Now:
- **Master search lives in the dark header** via a new optional `centerSlot`
  on the shared `WorkspaceHeader` (`.ws-header-center`, plus
  `.has-center` so the page identity stops competing for width). One search
  box in the whole app. Dropdown = icon + name + where-it-lives label; ⌘K,
  arrow keys, Enter. Verified live: "hours" → one result, "Clinic hours …
  CLINIC".
- **`settingsRegistry.ts` is now 18 entries** across Clinic, Prescription
  Pad, Practice and Settings' own rows. Every entry points at a DOM anchor
  that exists — a row whose anchor doesn't resolve strands the doctor, so
  never add one without adding the id.
- **2×2 grid** — Your Account | Subscription, Preferences | Data & Privacy,
  then a compact Help & Support strip. Clinic/Practice/Medicines/Labs/
  Prescription are deliberately NOT repeated here; they are reachable only
  through search.
- **Account:** change email + change password are wired to Supabase Auth for
  real. Phone, multi-user and deletion render but say "Not yet" — a control
  that silently does nothing is worse than one admitting it isn't built.
- **The specialty picker moved to Clinic** as "Consult Setup"
  (`clin-card-specialty`, folded behind Change). It writes
  `hospitals.specialty_profile`, so Clinic already owned that row; keeping it
  on Settings would contradict the new spec and deleting it would remove a
  real control.
- `settings.css` is down to ONE rule — `.cx-setting-flash`, which is applied
  to elements on *other* pages so it cannot be a Tailwind class here.

### Subscription foundation — applied live, additive
`plans` / `plan_entitlements` / `subscriptions`, plus `set_updated_at()`.
- Plan **name, price, interval, trial length and entitlements are all rows**,
  so Admin changes any of them with no migration and no deploy. "Polaris" is
  a placeholder: nothing in the app may branch on `plan.name`; `plan.code`
  is the only stable key.
- `limit_value NULL` means **unlimited**, never a sentinel — the base plan
  carries Synapse and WhatsApp with no patient/consult ceiling.
- Partial unique index = one live (`active`/`trialing`) subscription per
  clinic; cancelled/expired rows stay as history.
- **RLS: a clinic can READ its own subscription and nothing else.**
  Deliberately not the `ALL` shape used elsewhere — a doctor must not be able
  to extend or re-plan their own subscription from the client. Assignment is
  service-role/Admin only.
- `external_customer_id` / `external_subscription_id` exist empty so a
  payment provider attaches without another migration mid-integration.
- Seeded: one `solo` plan + 7 entitlements, and an active founding
  subscription for the two real clinics (`Ekanki Solo Clinc`,
  `Anmol Homeo Clinics`). Every other hospital has none and renders a
  truthful "No subscription on file".

Read layer: `lib/db/subscriptions.ts` (`fetchClinicSubscription`,
`hasEntitlement`, `entitlementLimit`, `billingIntervalLabel`). No feature
gates on entitlements yet — `hasEntitlement` exists so the first one has a
correct place to ask.

## Flagged / not done

- **`TERMS_URL` is a guess** (`arenode.com/terms`, derived from the supplied
  privacy URL). The only invented URL in the page; Help center and Contact
  support route to the in-app Support page rather than to more guesses.
- Notifications, Appearance, Export data and Data management render as rows
  marked "Not yet" — no backend exists for any of them.
- "Manage subscription" shows a toast pointing at support; there is no
  billing flow to send anyone to.
- The Admin panel that is meant to edit plans/entitlements/assignments does
  not exist. The schema is shaped for it; nothing writes these tables yet
  except SQL.

## Environment

- No `supabase/migrations/`; schema changes go in live via Supabase MCP.
  Project `ieimvjprtltancxapuzg` (org `arenod`, `ap-south-1`).
- `main` and `master` are unrelated histories. Work is on
  `claude/pdpg-layout-fixes-768k6v`, fast-forwarded into `master` each round.
