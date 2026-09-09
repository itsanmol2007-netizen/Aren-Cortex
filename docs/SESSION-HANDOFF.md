# Session handoff — 2026-09-09, WhatsApp go-live + prescription-link + fixes

**Temporary, self-replacing. REWRITE THE WHOLE FILE next session.**

This session took WhatsApp sending **live through Fast2SMS**, built the
public patient-prescription page it links to, moved the inbound webhook to a
Supabase Edge Function, and fixed a run of bugs. A large redesign task is
**still open** (see §"THE BIG ONE").

All Cortex work is committed + pushed to `master` (`687d445` and back to
`554924b`). Landing-repo work is pushed to `aren-landing-page` `main`
(`229abc8`). `server/.env` changes are local (gitignored) — listed in §Config.

---

## What shipped

### 1. WhatsApp is LIVE via Fast2SMS (BSP)
`554924b` + `f92e3f5` + `5b99291` + `687d445`.

- Fast2SMS's WhatsApp API is a **passthrough of Meta's Cloud API**, so
  `server/whatsapp/client.js` gained `whatsappTransport()` — switches host +
  auth on `FAST2SMS_API_KEY`. `providers/fast2sms.js` = `providers/meta.js`'s
  send under a different name (`makeCloudApiAdapter` factory).
- `MESSAGING_PROVIDER=fast2sms` is set in `server/.env`. It is **never
  auto-selected** — going live is that explicit line.
- **First real send verified** 2026-09-09: message delivered, 1 credit
  debited, `whatsapp_messages` row logged.
- `scripts/check-whatsapp.mjs` (`npm run check:whatsapp`) — READ-ONLY probe
  (WABA health, template approval, wallet). Sends nothing.
- `scripts/send-test-whatsapp.mjs` — ONE controlled live send (temporarily
  swaps a test patient's phone, restores it).
- **Anti-ban:** the sender number was banned once for burst setup activity.
  Never loop test sends. Fast2SMS's `dlt_manager` template list lags Meta
  approval ~30–60 min; a send with an unsynced name fails
  `(404) Template not found`.

### 2. Patient prescription link (`arenode.com/prescriptions/<token>`)
Landing repo `aren-landing-page` + `20260909_prescription_share_token.sql`
(applied) + `supabase/functions/rx-preview` (deployed, verify_jwt off).

- `prescriptions.share_token` — opaque per-Rx token, backfilled, unique.
  `server/messaging/service.js` resolves it and passes it as the template's
  dynamic-button `{{1}}`.
- `rx-preview` edge function: `{ token }` → service-role read → sanitised
  render JSON. Same pattern as `visit-gateway`.
- Landing page: `app/prescriptions/[token]/page.tsx` (+ `cleanToken()` safety
  net for Meta's doubled `{{1}}`), `components/rx/RxView.tsx`,
  `components/rx/api.ts`. **This is the file that must be REPLACED by a
  verbatim copy of Cortex's `PrescriptionDocument.tsx` — see §THE BIG ONE.**
- Robots: `/prescriptions/` disallowed (capability URL, like `/portal/gateway/`).

### 3. Inbound webhook → Supabase Edge Function
`47091bd`. `supabase/functions/whatsapp-webhook` (deployed, verify_jwt off).
Replaces `server/whatsapp/webhook.js` (server/ has no public home).

- Parses META DIRECT payload → logs inbound to `whatsapp_messages`
  (per-clinic patient match by phone) → updates delivery status → refunds
  on failed/undelivered (ported `settleFailedDelivery`).
- Auth: `?token=<WHATSAPP_WEBHOOK_TOKEN>` query param (Fast2SMS signs nothing).
- **User needs to:** set `WHATSAPP_WEBHOOK_TOKEN` as a Supabase function
  secret, and register the webhook in the Fast2SMS dashboard as **META
  DIRECT** at
  `https://ieimvjprtltancxapuzg.supabase.co/functions/v1/whatsapp-webhook?token=<that value>`.
  NOT tested end-to-end with a real inbound yet (fake payloads verified).
- **NOT ported:** the "Book appointment" conversation bot (`booking.js`), the
  patient-wrote-in email alert.

### 4. Bug fixes
- **`f92e3f5` — can't register a patient at a 2nd clinic.** `patients.phone`
  was UNIQUE **globally** → a person known at clinic A 409'd on registration
  at clinic B. Now unique per `(hospital_id, phone)`
  (`patients_phone_unique_per_hospital`, applied). Matches the multi-clinic
  model `routing.js` already assumes.
- **`f92e3f5` — consult register modal churn.** `handlePatientConfirm` now
  returns a boolean; App clears `registerRequested` only when a consult
  actually started. A failed create leaves the modal open with a toast
  instead of dropping to a blank screen the "never blank" guard re-covers.
- **`f92e3f5` / `5b99291` — "Dr. Dr Anmol Pandey".** `service.js`
  `formatDoctorName()` normalises to exactly one "Dr. " (was doubled or
  bare). `en_prescription_ready03`/`01prescription_ready_en` body is
  "from {{1}}" with no baked-in "Dr.", sample "Dr. SK Pandey".
- **`5b99291` — Communication page preview** now mirrors the approved
  template component-for-component (patient name in header, footer line,
  `WhatsAppTemplatePreview` gained a `footer` prop).

### 5. ReviewModal (`687d445` + `5b99291`)
- **"Send on WhatsApp" no longer closes Review or advances.** It saves +
  pushes the message and holds the modal open (`stayOpen`). Primary button
  becomes "Complete & Next"; closing it (`closeReview`) IS the advance.
  Guarded against a second save/send. Plain "Confirm & Save" never sends.
- **Live send feedback:** button shows Sending… (locked) → Sent (locked) →
  Retry WhatsApp on failure, with a doctor-readable error line above the
  bar (`friendlyWhatsAppError()` in `useConsultLifecycle.ts`). Retry
  re-pushes the already-saved prescription.
- **Action bar back to one line** (tighter paddings, keycaps `hidden lg:`).
- **Preview footer trimmed** to one "Generated with care, through Arenode".
- **QR moved** out of the cramped left column to bottom-right; left column is
  prescriber identity only.
- **Advice** shows only the doctor's own `adviceNotes` now — the clinic's
  canned `defaultAdvice` lines were removed from the preview.

---

## THE BIG ONE — still to do (the actual task)

Anmol's core point: **stop restyling the prescription in a second codebase.**
`PrescriptionDocument.tsx` (`src/features/prescription/`) is THE canonical
renderer. Everything else must render *that*, so a QC change (template,
colour, layout) is ONE edit, not five.

1. **Make ReviewModal's visible preview render `<PrescriptionDocument>`** —
   scaled to fit the modal, with *less margin* (Anmol: "alot of margin").
   Right now ReviewModal has a parallel hand-built layout AND renders
   `PrescriptionDocument` hidden for print. Collapse to one.
2. **The Windows print-preview reference** (screenshots Anmol sent): the QR
   there is **CENTERED with a border around it** and "looked beautiful" —
   replicate THAT treatment, not just "QR on the right". This is the tone to
   match everywhere.
3. **Landing page** = a **verbatim copy** of `PrescriptionDocument.tsx` (+ its
   deps: `lib/brand/accent.ts`, the `qrcode` import). Replace the current
   hand-built `RxView.tsx`. Add a "keep in sync with Cortex" header. Then:
   - **Mobile layout** (it's an A4/A5 fixed-width doc — needs a responsive
     wrapper / scale-to-viewport).
   - **White only. NO dark mode** — Anmol: "not like a gaming PC RGB bill".
   - **Download button** — print-to-PDF from the phone (browser print, or a
     client-side jsPDF like Cortex already uses).
4. **Instruction vs Advice split** — apply to `PrescriptionDocument.tsx` AND
   the A4/A5 print path (not just the preview, which this session did).
   Template/library instructions (`prescriptionConfig.defaultAdvice`,
   `prescription_templates` items) → **removed**. Doctor's `adviceNotes` →
   kept, **richer visuals**.
5. **A4 vs A5 print** (`PrintFormatSelector` → `PrescriptionDocument` with
   `format`): must reflect all the above (QR centered+bordered, trimmed
   footer, advice-only).
6. There is a **measurements** question Anmol raised ("there isn't any
   measurement section... what measurements are added") — clarify whether the
   canonical doc should show `visit_measurements`; the print doc currently
   passes `vitals` only.

### Follow-up messages (backend only — DO NOT test)
- Wire a job / login-time sweep over `prescriptions.follow_up_days` that
  sends a reminder at a sensible hour before the due date.
- Needs an **approved template** — Anmol will create it; produce a **sample
  spec** (body + variables) for him. Do NOT send test messages (ban risk).
- It **costs credits**, so make it a **doctor opt-in with a cost note**,
  configured on the **Communication page**. `sendFollowUp` +
  `WHATSAPP_TEMPLATE_FOLLOW_UP` already exist in the code; nothing triggers
  them.

### Unresolved: "Ekanki solo clinic getting logged every ~10 seconds"
Anmol reported this happening "whenever I leave the browser", started
suddenly. Investigated the DB: `decision_log` / `visits` / `doctor_logs` /
`operational_events` show **no 10-second periodic write**. Edge-request logs
show **bursty** traffic (up to ~1300 requests / 5 min) that tracks active
charting and **goes quiet when idle** (≈10 req / 5 min) — i.e. chattiness
during charting, possibly a Synapse reference-data re-fetch that isn't
cached (`signal_intent_rules`, `signals`, `measurement_rules` re-read many
times per session). **Need Anmol to say exactly WHERE he sees "getting
logged"** — browser console? Network tab? Supabase dashboard logs? a screen?
— and the exact repeating text. Then it's a one-pass fix.

---

## Config (server/.env — local, gitignored)

| Key | Value |
|---|---|
| `MESSAGING_PROVIDER` | `fast2sms` |
| `FAST2SMS_API_KEY` | set (Fast2SMS Dev API) |
| `WHATSAPP_PHONE_NUMBER_ID` | `1349053831618277` (+919128091905, WABA 1468324705121251, CONNECTED, TIER_2K) |
| `WHATSAPP_TEMPLATE_PRESCRIPTION` | `01prescription_ready_en` (msg_id 32130, Approved; HEADER {{1}}=patient; BODY {{1}}=doctor "Dr. X", {{2}}=clinic; dynamic URL button `.../prescriptions/{{1}}`) |
| `WHATSAPP_TEMPLATE_LANG` | `en` |
| `WHATSAPP_WEBHOOK_TOKEN` | set — must match the `?token=` on the Fast2SMS webhook URL |
| `WHATSAPP_ACCESS_TOKEN` | blank on purpose (superseded by Fast2SMS) |

Supabase project `ieimvjprtltancxapuzg`. Edge functions deployed this
session: `rx-preview` (v2), `whatsapp-webhook` (v1). Migrations applied:
`20260909_prescription_share_token`, `patients_phone_unique_per_hospital`.

Approved templates on the WABA: `01prescription_ready_en`,
`en_prescription_ready02`, `payment_completed`. No follow-up template yet.

---

## Traps

- **`patients.phone` is now unique per clinic, not global.** Any new
  patient-insert path must pass the right `hospital_id`. `findPatientByPhone`
  runs under RLS (one hospital) so `.maybeSingle()` is still safe.
- **Fast2SMS template-list lag** — after Meta approves a template, wait
  ~30–60 min before pointing `WHATSAPP_TEMPLATE_PRESCRIPTION` at it, or a
  send 404s "Template not found" (Fast2SMS resolves the name against its own
  synced copy).
- **Two prescription layouts exist** (ReviewModal's hand-built preview vs
  `PrescriptionDocument`). This session edited the preview; they are NOT yet
  unified. Don't add a THIRD.
- **`server/` has no public home.** The webhook and any future server route
  must go to Supabase Edge Functions (the pattern is `visit-gateway` /
  `rx-preview` / `whatsapp-webhook` — verify_jwt off, token in body/query,
  service role, re-derive everything).
- `node_modules` empty in a fresh container — `npm install` first (both
  repos). `git checkout -- package-lock.json` if `npm install` only added
  `"dev": true` noise.

## Carried forward, still open (pre-existing)

- Zoho real secrets not in Supabase → `notify()` logs instead of sending.
- Admin UI for `approve_credit_recharge` (Parallax).
- `clinic_mode` written in exactly one place (`admin-staff` reception hire).
