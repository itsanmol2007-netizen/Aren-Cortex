# Session handoff — 2026-08-29 (V3: the Clinic page, the Prescription Editor, and Tailwind)

**Temporary, self-replacing. REWRITE THE WHOLE FILE, not append a new dated
section.** `cortex-design-dna/*.md` and `context/*.md` are stable reference
material — touch them only when a rule or fact in them is actually wrong.

## STOP — the styling rule changed this round

**New Cortex pages are written in Tailwind, not a per-feature `.css` file.**
Anmol, twice, unprompted: *"anytime you guys write new code, make new pages,
write it in tailwind, it'll be more better to handle the code base."* The
reason is iteration cost, not taste — restructuring a layout should mean
editing the markup you are already looking at, not hunting a selector in a
second file.

This round's first pass shipped a `clinic.css` in the old `practice.css`
house style and had to be rewritten. `features/clinic/` now has **zero CSS
files**; `features/frontdesk/` was already Tailwind and is the precedent to
copy. The design-DNA docs are still in force — they govern the VALUES
(tokens, spacing, tone, empty states), and every Tailwind class here reads
`var(--cs-*)` through an arbitrary value (`bg-[var(--cs-card)]`) so the tokens
still reach these screens. What changed is where the declarations live, not
what they say.

`practice.css` / `consult.css` etc. are NOT being converted — leave them
alone. This applies to new work.

## What this round built

The **Clinic page**, to a written brief plus a reference image. It answers six
questions and nothing else: what is my clinic / who is the doctor / what does
my prescription look like / when am I open / how do I reach patients / how
will they book.

- **One identity surface, two halves** (`ClinicPage.tsx`). Clinic and Doctor
  are two rows in two tables and the UI deliberately does not mirror that:
  one bordered card, one hairline between them, same type hierarchy, same
  weight, each half its own click target for its own modal. The half is
  `role="button"` and the "Edit …" affordance inside it is a `<span>`, not a
  `<button>` — the nested-interactive trap this codebase has now hit three
  times.
- **Prescription Pad** — a real `PrescriptionDocument` at true paper size,
  scaled down (`RxPreview.tsx`), not a dashboard tile pretending to be a
  prescription. It is a PREVIEW and a DOORWAY; clicking it opens the editor.
- **Prescription Editor** (`PrescriptionEditorPage.tsx`) — a full page under
  Clinic, no sidebar entry. Live preview left, controls right, asymmetric.
  Auto-saves debounced (600ms) rather than hiding behind a Save button,
  because a toggle panel behind Save is a panel where the preview and the
  stored config can silently disagree.
- **Clinic Hours** — a modal, not a page. Open/closed per day, multiple
  sessions per day.
- **Patient Communication** — a doorway into the Communication Center, not a
  copy of its controls.
- **Patient Booking** — two rows and a Coming Soon. No fake configuration.

## The one architectural point worth not losing

**Rendering system ≠ editing system.** `PrescriptionDocument` stays the one
renderer (standing rule 6) and gained an optional `config` prop. The editor
never draws a prescription — it manipulates a structured `PrescriptionConfig`
(`lib/db/clinic.ts`) and hands it to the renderer.

`DEFAULT_PRESCRIPTION_CONFIG` reproduces the renderer's pre-existing output
**exactly**, including the three advice lines it used to hardcode. That is
what made it safe to thread the config through the LIVE print path: a clinic
that never opens the editor prints what it always printed.

The config reaches real prescriptions via `usePrescriptionConfig`, loaded
inside `ReviewModal` — the one door Consult, Patient Record and Print RX all
print through. Loading it there rather than plumbing a prop from three call
sites is deliberate: a prop three callers must remember is a prop one of them
eventually forgets, and on this surface that means a customised prescription
silently reverting to defaults on one path only.

## Schema (applied live, Supabase MCP — no migrations dir)

- `hospitals` + `website`, `clinic_type`, `facility_type`.
- `clinic_hours` — one row per open SESSION; zero rows for a weekday IS
  closed. `day_of_week` 0=Monday.
- `prescription_settings` — one row per clinic, created on first save.

All three are documented in `context/cortex-data-model.md`.

## Bugs found by actually running it (rule 13), not by reading code

1. **Every clinic and doctor name rendered at 12px in caps.** `base.css` is
   unlayered and styles bare `h2`; unlayered CSS beats Tailwind's `utilities`
   layer regardless of specificity. Found with `getComputedStyle`, not by
   eye — it read as "slightly small headings". Same trap hits `input`
   (31px/7px radius) and `textarea`. See the new `cortex-gotchas.md` entries
   for the two dodges used and why the real fix (moving base.css into
   `@layer base`) was flagged rather than done in passing.
2. **A second session on the same day returned 409 Conflict on save.**
   "+ Session" cloned the 10:00–14:00 default, colliding with
   `(hospital_id, day_of_week, opens_at)`. It now proposes an hour past the
   last close, and the modal mirrors both DB constraints client-side so the
   doctor gets a sentence instead of a Postgres error.
3. **The A5 preview was 994px tall in the editor's column** and, through
   `items-stretch`, wrapped a 519px Clinic Hours card around a 200px empty
   state. `RxPreview` now takes a `maxHeight`; the work row is `items-start`,
   because a real difference in content is not a layout bug to paper over.

## Verified live (Ekanki Solo Clinic account)

- Clinic hours: opened the modal, opened Mon–Fri, added a second Monday
  session, saved → confirmed 6 rows in Postgres, the dashboard week rendered
  them 12-hour with Monday's two slots, and the header pill read "5 Open days".
- Prescription Editor: identity Both→Doctor removed the clinic block from the
  preview; the registration toggle removed the number; removing and adding an
  advice line changed the preview immediately; the footer note appeared; the
  save chip settled on "Saved automatically". Confirmed via the rendered
  document's own text, not the control state.
- **The real print path**: opened a genuine saved prescription (Aparna
  Pandey, 28 Aug) through Patient Record → View Prescription and confirmed
  the hidden `PrescriptionDocument` carried the custom footer note and the
  edited advice list (added line present, removed line gone). Note the doc
  takes ~10s to load there — a 4s wait screenshots "Loading prescription…"
  and reads as a false negative.
- Modals: input measured 40px/11px radius/13px (the `!` bangs beating
  base.css's 31px/7px); the `dirty` guard held against a backdrop click with
  a half-typed form; Save wrote and the page updated with no reload; Escape
  closed. Zero nested `<button>` in the DOM; no horizontal page scroll.
- `tsc -b` and `npm run build` clean throughout; zero page errors (the
  `ERR_CONNECTION_RESET` entries are Supabase Storage images, which Chromium
  cannot reach directly in this sandbox — see the recipe below).

## Account left exactly as found

Every row written while testing was deleted and read back: the
`prescription_settings` row (it changes what REAL prescriptions print — the
important one), the six `clinic_hours` rows, and the `clinic_type`/`website`
values the clinic-modal test wrote. `hospitals` re-queried field by field
against its pre-session state. Nothing else on the account was touched.

## Known-not-done, flagged rather than silently left

- **`ReviewModal`'s own on-screen preview does not honour the config** — only
  the hidden `PrescriptionDocument` it prints from does. That is pre-existing
  by design (standing rule 6 spells out that the two are different surfaces),
  but it now has a new consequence: a doctor can customise their pad and see
  the review preview still showing the old letterhead. Worth closing; out of
  the Clinic brief's scope and a risky file to widen mid-task.
- **The clinic logo and doctor photo have no upload surface.** They are
  stored assets, not text fields; the Prescription Editor only SELECTS
  between them. A dropzone that did nothing would be exactly the fake
  configuration surface the brief's §9 forbids.
- A patient named "Test" with 82 visits still exists on the live account —
  synthetic data from a round before last, still not cleaned up because it
  was not created here and removing it has not been asked for.

## Environment / recipe (unchanged)

1. `npm install` first — `node_modules` is not checked in and a bare `tsc -b`
   against a missing one reports misleading `vite.config.ts` errors.
   `playwright` is not a dependency; `npm install --no-save playwright`.
   Chromium is pre-installed at
   `/opt/pw-browsers/chromium-1194/chrome-linux/chrome` (do NOT run
   `playwright install`). Launch with `--proxy-server=$HTTPS_PROXY
   --proxy-bypass-list=127.0.0.1;localhost --ignore-certificate-errors`.
2. Chromium cannot CONNECT to `*.supabase.co` directly here — relay through a
   dev server: `vite.preview.config.ts` (`@` alias + `tailwindcss()` +
   `server.proxy['/sb']` via `HttpsProxyAgent`) and `.env.local`
   (`VITE_SUPABASE_URL=http://127.0.0.1:5173/sb`). This relays the API only,
   NOT Supabase Storage — logo/signature images fail with
   `ERR_CONNECTION_RESET` and render as broken images in every screenshot
   here. That is the sandbox, not the app. Delete both files (and any
   `scratch-*.mjs`) before committing — never tracked.
3. Log in with the real test account: phone `9999999999` / `Gigabyte@Test`
   (Ekanki Solo Clinic, Dr Anmol Pandey,
   `hospital_id 64c26e24-3668-49c6-8b99-6ddb8c14883e`,
   `doctor_id 40aa12a6-54f2-4b49-9100-8a2f8de0254d`).
4. The login inputs are `input.lg-input` (1st phone, 2nd password) and
   `button.lg-submit` — not `type="tel"`/`type="submit"`.
5. On the consult screen the sidebar trigger is
   `button[aria-label="Open navigation menu"]` (`GlobalLogoTrigger`, a fixed
   overlay), not `.ws-logo-pill`; that class only exists on a
   `WorkspaceHeader` page. Sidebar nav buttons are off-viewport —
   `.dispatchEvent('click')`, not `.click()`.
6. Any write made while testing is REAL data on a REAL account — verify with
   `mcp__Supabase__execute_sql` before deleting, and re-query after cleanup to
   confirm the account reads back to EXACTLY its prior state, not just "the
   delete succeeded."

## Environment

- No `supabase/migrations/`; schema changes apply live via Supabase MCP.
  Project `ieimvjprtltancxapuzg` (org `arenod`, `ap-south-1`).
- `main` and `master` are unrelated histories. Work here is on
  `claude/clinic-page-design-jflwa5`, branched from `master`.
