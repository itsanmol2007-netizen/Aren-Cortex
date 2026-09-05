# Session handoff — 2026-09-05 (Parallax, fee capture, and the intake rebuild)

**Temporary, self-replacing. REWRITE THE WHOLE FILE.** `cortex-design-dna/*.md`
and `context/*.md` are stable reference — touch them only when a rule in them
is actually wrong.

## ⚠ HOW TO VERIFY IN THIS ENVIRONMENT

Windows, Claude desktop app — not the Linux sandbox older handoffs describe.

- `npx tsc -b` and `npm run build` both pass clean. Chunk-size warning is
  pre-existing (~1.83MB).
- **The in-app browser reaches the dev server fine.** `npm run dev` on
  `127.0.0.1:5173`. No proxy, no playwright harness, no throwaway preview file.
- **But nothing behind the login has been seen rendered.** The agent cannot
  type a password into a login form. Everything below is verified as: compiles,
  builds, boots with zero console errors, route guards redirect correctly.
  **Design-DNA rule 13 is UNSATISFIED for every screen in this handoff.**
  First job next session: get a human to sign in, then measure.

Test accounts: **Raju Chauhan** (role `admin`, Anmol Homeo) for Parallax; any
reception login for the intake modal. Ask Anmol for credentials.

## What this session did

### 1. AREN Parallax — the admin workspace
Full detail in **`context/parallax-admin.md`**. `/app/admin`, its own
collapsible rail, seven pages (Overview, Reports, People & Benches, Money,
Catalogue, Clinic, Plan). Access is derived, never configured —
`lib/workspace/adminAccess.ts` + `hooks/useAdminAccess.ts`.

The product name lives **only** in `lib/workspace/mode.ts` → `ADMIN_BRAND`.
No new subscription tiers: AREN Polaris stays the only plan.

### 2. Fees — configuration AND collection
- **Admin side**: `doctors.consultation_fee` / `follow_up_fee`,
  `hospitals.gst_enabled` / `gst_percent` / `allow_discount` / `currency`,
  edited from Parallax → Money.
- **Desk side**: `lib/db/payments.ts` is the one place fee maths and writes
  live. `computeFee` is pure. Reception has **no code path that sets a base
  fee** — it discounts, an admin prices.
- **Audit**: `visit_payment_events`, append-only (SELECT + INSERT policies, no
  UPDATE or DELETE). Shown on Parallax → Money as **Fee activity**.

`NULL` fee means "not set", never "free" — an explicit `0` is a free
consultation and the two stay distinguishable everywhere.

### 3. The intake modal, rebuilt
`CreateVisitModal.tsx` was rejected twice and is now a two-column surface:

- **Left**: Patient Details (name/phone, age+DOB in one row/gender), Today's
  Visit (doctor, symptoms), Attachment.
- **Right**: a persistent **payment rail** (`PaymentRail.tsx`).

What changed and why:
- **Progressive disclosure.** v1 showed paid/unpaid, four methods, discount
  type and discount value at once. Anmol: *"this is not airplane cockpit."*
  The rail now shows one decision at a time — methods appear only after
  **Collect**, discount only after opening it.
- **New visit / Follow-up is offered for EVERY patient**, not only returning
  ones. A clinic's first week is full of people on their fifth visit whom the
  database has never seen.
- **Measurements left registration entirely.** Taken later from the queue.
  `MeasurementsModal` still exists and is still used by Practice.
- **Attachments** are one `+ Attach document` button with a Computer/Phone
  menu (`AttachDocumentField.tsx`). Drag-and-drop still works; it is just no
  longer a 90px advertisement.
- **Duplicate detection is a dropdown**, floating over the rows beneath rather
  than growing the form. The "Existing patient? Search…" link is gone — the
  form already searches as you type.
- `ObservablePicker` grows with its chips (`min-h`, not a fixed `h-[62px]`).
- `ModalShell` gained optional `subtitle` and `flushBody`; existing callers are
  untouched.

**Symptoms stayed a structured `ObservablePicker`, not a free-text box.** The
reference mockup showed a textarea, but standing rule 3 and the whole
intake→Synapse handoff depend on `observableIds`. It now *looks* like the
reference (full width, grows) while still writing structured observables.
Flagged rather than silently changed either way.

### 4. Two real bugs fixed
- `Sidebar.tsx` hard-coded "AREN Cortex" while `WorkspaceHeader` beside it read
  the real product from the clinic row. Every Consult clinic was told it was
  running Cortex. Both now read `useWorkspaceMode()`.
- `WorkspaceHeader` gained an optional `brand` prop so Parallax can name itself
  without forking a second header.

### 5. Anmol Homeo Clinics is genuinely multi-bench
Was `solo_reception`, `seats = 1`, one doctor. Now `multi_doctor`, `seats = 4`,
four benches with fees (SK Pandey ₹400, Meera Iyer ₹500, Rajat Verma ₹600,
Farhana Sheikh ₹700).

### 6. Seed data — REMOVE BEFORE ANY DEMO THAT MATTERS
Seeded into **Anmol Homeo Clinics only**: 45 patients, 1,380 visits (8 Jul –
5 Sep), 1,075 prescriptions, 1,136 payments. Every row is tagged:

```sql
delete from patients where abha_id = 'DEMO-SEED-20260904';
delete from doctors  where registration_number = 'DEMO-SEED-20260904';
```

Visits, prescriptions and payments cascade. The clinic's **94 real visits and
13 real patients are untouched** — they do not carry the tag.

## What is NOT done

1. **Visual verification of everything.** Top of the next list.
2. **Cortex's own patient entry has no fee UI.** `components/PatientModal.tsx`
   is a different modal (search-or-register, its own keyboard flow) and the
   visit is created in `hooks/useConsultLifecycle.ts` →
   `resolveVisitForConsult`. **Open product question:** in solo mode the doctor
   registers and consults in one motion, so is the fee captured at registration
   or at the end of the consult? Needs Anmol's call before it is built.
3. **Follow-up fee has no rule for what counts as a follow-up.**
   `FOLLOW_UP_WINDOW_DAYS = 14` is a DEFAULT the desk overrides; there is no
   "same complaint" logic and probably should not be.
4. **Collecting payment later from the visit page** is referenced in the rail's
   own copy ("Payment can also be collected later from the visit page") but
   that surface does not exist yet. Build it or change the copy.
5. **WhatsApp is unchanged and still parked** on Meta credentials. `server/`
   holds a complete webhook + Cloud API client + booking bot. Verify token is
   already in `server/.env.example`.

## Traps worth knowing before you edit

- **These files are CRLF.** A node script matching on `\n` silently does
  nothing. Read with `.replace(/\r\n/g,"\n")`, write back with the reverse.
- **Bash heredocs mangle box-drawing characters and `₹`.** Use the Write tool
  for anything containing them, or a `.cjs` file written via Write.
- **`base.css` is unlayered and beats Tailwind utilities.** Front-desk chrome
  uses the unlayered `fd-*` classes for exactly this reason; admin form
  controls carry trailing `!`.
- **Supabase MCP refuses multi-statement writes.** Split them.
- **`add_medicine` was widened** so an admin with no `doctors` row can add a
  brand (NULL `created_by_doctor_id`). Rule 22 still holds — the composition
  must already exist.
