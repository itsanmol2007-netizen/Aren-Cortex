# AREN Communication V1 — messaging, credits, email

Stable reference pocket. Read this before touching anything under
`src/features/communication/`, `src/lib/db/messaging.ts`, `server/messaging/`
or `server/email/`.

Created 2026-09-06, when Communication stopped being a read-only WhatsApp
inbox and became the messaging product: prescriptions and follow-ups going
out, credits paying for them, and AREN being told when something needs a
human.

Its companion is `../whatsapp-two-way.md`, which still owns the INBOUND half
(the webhook, the booking bot, the 24-hour rule). Nothing there changed.

---

## The shape of it

```
UI (Communication page)                         UI (Buy credits)
  sendPrescription / sendFollowUp                 createRechargeRequest
        │  (Supabase session JWT)                        │  (RLS, status pinned 'pending')
        ▼                                                ▼
  POST /api/messaging/*                          credit_recharge_requests
        │                                                │
        ▼                                                ▼  admin verifies payment
  server/messaging/service.js                    approve_credit_recharge()
        │  check → debit → send → settle/refund          │
        ▼                                                ▼
  Provider Adapter  ──►  Meta / BSP  ──►  WhatsApp   messaging_credit_ledger (PURCHASE)
        │
        └──►  server/email/notify.js  ──►  Zoho  ──►  support@arenode.com
```

The doctor's whole vocabulary is two verbs and one number. Everything above
`sendPrescription` in that diagram is deliberately invisible to them.

---

## The five decisions this is built on

Changing any of them is a redesign, not a tweak.

### 1. Credits are a LEDGER, not a balance column

`messaging_credit_ledger` is append-only; the balance is `sum(delta)` per
doctor, exposed by the `messaging_credit_balances` view. A single
`credits_remaining` integer cannot answer "where did 4,700 credits go", cannot
be reconciled after a provider outage, and loses a write when two sends race.

`LOW_CREDITS` / `EXHAUSTED` is a CASE in that view, not a stored flag — same
argument as `managed` in `parallax-admin.md`. A doctor is low the moment they
cross 100 and not low the moment they don't, with no job to keep it honest.

### 2. The wallet is per DOCTOR, not per clinic

The free allocation is "every doctor receives 5,000". At a multi-bench clinic
one doctor's follow-ups draining another's balance would be a support ticket
on day one. `doctors` carries a trigger (`grant_messaging_free_allocation`)
that grants those 5,000 once, as a real `FREE_ALLOCATION` row, so a doctor's
first credit and their five-thousandth were granted the same way.

### 3. A doctor can ASK for credits and can never grant them

There is **no client INSERT policy on the ledger at all** — not a restrictive
one, none. Debits come from `server/` under the service role; grants come from
`approve_credit_recharge()`, which is `service_role`-only. The one table a
doctor may insert into is `credit_recharge_requests`, whose `WITH CHECK` pins
`status = 'pending'` and forbids the decision columns.

There is no UPDATE or DELETE policy on either table.

### 4. Debit first, refund on failure — BOTH kinds of failure

There are two, and the second is the common one:

- **Synchronous** — the send call throws (expired token, rejected request).
  `sendMessage` refunds inline.
- **Asynchronous** — Meta returns 200, the credit is charged, and a status
  webhook says `failed` minutes later because the number is not on WhatsApp or
  the patient blocked us. `settleFailedDelivery` (called from the webhook's
  status branch) refunds that one. Without it, "no credit is lost on a failed
  message" would be true only for failures that happen inside one HTTP
  request — which is the minority.

Both are idempotent: Meta re-delivers status webhooks on its own schedule.

"No message should be sent without sufficient credits" is read strictly. The
message row is written `pending`, `debit_messaging_credit()` charges it under a
per-doctor advisory lock, then the adapter sends. A provider failure inserts a
`REFUND` row naming the debit it reverses (`reverses_ledger_id`), so a failure
reads as two visible rows rather than a number that quietly went back up.

If the DEBIT fails, the message row is **deleted** — nothing was attempted, and
a phantom "failed" message in a doctor's activity list is a support call about
a message they never sent.

### 5. The provider is an adapter, in AREN's vocabulary

`server/messaging/providers/` takes a purpose, a patient and a clinic — never
a Meta-shaped payload. `meta.js` is the only file in the send path that knows
template components exist. `mock.js` is the default when Meta credentials are
absent, and it goes through the **full** path (credit debited, ledger written,
status transitioned) — only the WhatsApp hop is simulated.

`MESSAGING_MOCK_FAILURE_RATE` exists because the refund path can only be
exercised by a failure, and a failure path that has never run is a guess.

### 5a. Fast2SMS (BSP) is wired in as a third adapter (2026-09-09)

Fast2SMS's WhatsApp API is a **straight passthrough of Meta's Cloud API** —
identical request body, identical `{version}/{phone_number_id}/messages` path,
identical `{ messages: [{ id: "wamid..." }] }` response. So the whole send
path is shared:

- `server/whatsapp/client.js` gained `whatsappTransport()` — the ONE place
  the two providers diverge (host + `Authorization: <raw key>` vs
  `Bearer <token>`), switched by `FAST2SMS_API_KEY` being present. Every
  send (`sendTextMessage`, `sendInteractiveButtons`, `sendTemplateMessage`,
  `sendPrescriptionTemplate`) flows through it.
- `providers/meta.js` was refactored to a `makeCloudApiAdapter(name, configured)`
  factory; `providers/fast2sms.js` is that factory with a different name and
  credential check — ~15 lines, no send logic of its own.
- `resolveProvider()` will **never auto-select `fast2sms`** — going live is an
  explicit `MESSAGING_PROVIDER=fast2sms`, so that adding the key to run the
  read-only check can't start real sends on a freshly-approved number.
- The webhook (`server/whatsapp/webhook.js`) authenticates BSP POSTs by a
  `?token=<WHATSAPP_WEBHOOK_TOKEN>` query param instead of Meta's
  `X-Hub-Signature-256` (Fast2SMS signs nothing). Configure the Fast2SMS
  webhook in **META DIRECT** format so `parseWebhookPayload` still works.
- `npm run check:whatsapp` (`scripts/check-whatsapp.mjs`) is a read-only
  probe — WABA health, number quality rating, template approval status,
  wallet balance. **It sends nothing**, by design: the number was banned
  once for burst activity during setup.

Still not live: needs `FAST2SMS_API_KEY` + `WHATSAPP_PHONE_NUMBER_ID` in
`server/.env`, the templates Approved, then `MESSAGING_PROVIDER=fast2sms`.

### 5b. "Prescription Ready" — the template's actual shape (2026-09-06)

Agreed with Anmol, since these are unsubmitted and someone has to eventually
paste this exact copy into Meta Business Manager:

- **Header** — static text, "Prescription Ready". No variable, so
  `sendPrescriptionTemplate` sends no header component at all (Meta only
  wants parameters for the parts of an approved template that are dynamic).
- **Body** — "Hi {{1}}, Your prescription from Dr. {{2}} from {{3}} is ready
  to view or download. If you have any questions or need help, we're just a
  message away! With care, {{3}} Arenode." {{1}}=patient name, {{2}}=doctor
  name, {{3}}=clinic name — reused at the end, which WhatsApp templates
  allow.
- **Button** — "View Prescription", a dynamic-URL button whose parameter is
  the prescription's own `documentUrl` (already a public HTTPS link — the
  same one a document-header send would have fetched). Anmol, when asked
  whether this should instead be a quick-reply that triggers a follow-up
  send: *"right now the app itself is not hosted anywhere so adding any
  dynamic link will not work unless we host this app... unless whatsapp is
  wired, simply open that exact prescription preview"* — so the button opens
  the link directly, no webhook round trip. **Not solved by this change:**
  where prescriptions end up permanently hosted (the app has no stable
  public home yet — same blocker as this file's own "Open" section and
  `docs/whatsapp-two-way.md`'s). Whoever submits the real template in Meta's
  console needs to register a dynamic URL button; if Meta's UI insists on a
  fixed base + short suffix rather than a fully dynamic link, that's the
  piece to revisit once hosting is real.
- **No PDF yet** (`documentUrl` is null) falls back to a plain body-only send
  — same three variables, no button. This is a structurally DIFFERENT Meta
  template shape (no button component) sharing the same configured name as
  the button version; fine for the mock adapter, but real submission needs
  two separate approved templates, not one.

### 6. A patient's reply is FREE, and the UI must never suggest otherwise

Meta charges us to send, not to receive. So an inbound message writes no
ledger row, carries `credits_charged = 0`, and is excluded from the delivery
tile's counts.

This is a UI rule as much as a billing one. The first version of this page
carried a "usage by message type" card that split spend across categories
*including patient messages* — which charges for something free and teaches a
doctor to avoid the one thing two-way messaging exists to give them. It was
replaced by a delivery-health tile ("are my messages reaching people?"), which
counts outbound only and says the rule in words underneath.

### 6b. Three credit tiers, not two — `soft` is UI-only

`SOFT_LOW_CREDIT_THRESHOLD = 500` (`lib/db/messaging.ts`), checked ABOVE
`LOW_CREDIT_THRESHOLD = 100`, never instead of it. Anmol, 2026-09-07: *"as the
credits go under 500, start showing soft warning"* — on top of the existing
under-100 reminder. `soft` triggers no email and touches no database column;
it is purely the page nudging a doctor earlier, in a lighter tone (teal, a
wallet icon) than the amber `low` tier. At zero, the exhausted state is its
own banner above the tiles rather than a line in the same strip — "that
warning should be much better if credit is exhausted" — with the recharge
action built into the banner itself.

### 6c. The page caches itself, in memory, for one running session

Anmol, 2026-09-07: *"why are you loading data again when you are going to
that page? cache these data."* A module-scope `Map` in
`CommunicationPage.tsx`, keyed on `hospitalId::doctorId`, seeds every
`useState` on mount so a revisit within the same tab shows real numbers on
the FIRST paint, then revalidates silently in the background (no skeleton,
no error banner on a failed silent refresh — just a console log). Explicitly
NOT `localStorage`: this solves re-entering the page inside one running app,
and nothing more — credits and deliveries can change from another device at
any moment, so a cache surviving a reload or a day would go stale with no
way for a doctor to notice.

### 7. A doctor can withdraw their own request after three hours

`cancel_credit_recharge(request_id)`. Before this, a request nobody actioned
also BLOCKED the doctor from raising another, because of the unique partial
index allowing one pending row each — the only way out was AREN rejecting it.

Three hours, not zero: the point of a request is that a human reads it and
calls, and instant withdrawal turns the support queue into something that
churns mid-call. The wait is enforced **in the database**, not by a hidden
button — and it is an RPC rather than an UPDATE policy because RLS cannot see
the OLD row, so any policy permissive enough to allow the status change would
also let a doctor rewrite the `credits` and `amount` they are owed.

---

## Tables and functions

| Object | Holds / does |
|---|---|
| `messaging_credit_packages` | The price list, as ROWS. AREN reprices with an UPDATE; no release. |
| `messaging_credit_ledger` | Every movement. `FREE_ALLOCATION`/`PURCHASE`/`MESSAGE_DEBIT`/`REFUND`/`ADMIN_ADJUSTMENT`. A CHECK ties direction to kind. |
| `messaging_credit_balances` (view) | Per doctor: balance, granted, spent, refunded, `OK`/`LOW_CREDITS`/`EXHAUSTED`. `security_invoker`. |
| `credit_recharge_requests` | A doctor ASKING. One pending per doctor (unique partial index). Never deleted — this is the billing history until a gateway exists. |
| `support_email_log` | Every operational email AREN sent itself. Service-role only. A `failed` row is the alert that the alerting broke. |
| `messaging_alert_state` | When a doctor was last alerted about, so a doctor parked at 73 credits produces one email a day, not one per message. |
| `whatsapp_messages.doctor_id / purpose / credits_charged` | Whose wallet paid, AREN's own category, what it cost after refunds. |
| `debit_messaging_credit()` | Atomic spend. Raises `INSUFFICIENT_CREDITS` rather than returning falsy — a caller must not be able to send by forgetting to read a return value. |
| `refund_messaging_credit()` | Reverses one debit. Idempotent. |
| `approve_credit_recharge()` | **The one step a payment gateway will replace.** Everything before and after it stays as it is. |
| `cancel_credit_recharge()` | The doctor withdrawing their own pending request, 3h+ old. `authenticated` may execute; it re-checks the clinic, the status and the age itself. |

`purpose` is deliberately NOT derived from `template_name`: that is Meta's
name for an approved template and changes when one is re-approved, which must
not silently reclassify a year of history.

---

## Email — what fires each of the seven

| Event | Fired by | Throttle |
|---|---|---|
| `recharge_request` | `createRechargeRequest` (browser) → `POST /api/support/notify` | one pending request per doctor, enforced by a unique index |
| `recharge_cancelled` | `cancelRechargeRequest`, after the doctor withdraws | one per withdrawal; a withdrawal needs a 3h-old pending request |
| `low_credit` | `maybeAlertLowCredits`, after every successful debit | one per doctor per 24h (`messaging_alert_state`) |
| `credits_exhausted` | same | once, until the doctor recharges |
| `message_failed` | `sendMessage` (synchronous failure) **and** `settleFailedDelivery` (async webhook failure) | none — one patient, one email |
| `provider_error` | `sendMessage`, when the error matches `isProviderLevelFailure` | none — this is the outage alert |
| `patient_message` | the webhook, on inbound | free TEXT only (never a button tap), and only the first inbound in 6h from that phone |
| `support_request` | `notifySupport` from the browser | none |

`/api/support/notify` allowlists only the three a browser has any business
raising; the ids come from the SESSION, never the request body, so an alert
can only ever be about the caller's own clinic and wallet.

## Email — the plumbing

One door — `notify(kind, ids)` in `server/email/notify.js`. Callers pass IDS,
never prose, so wording changes never touch a call site. Three files, three
jobs: `zoho.js` (transport), `templates.js` (what it says), `notify.js` (when,
and the durable record).

`notify` **never throws.** Every caller is doing something more important than
sending an email, and a recharge request already in the database must not look
rejected because Zoho rate-limited us.

Two Zoho facts that will cost an afternoon if unknown:
- **India data centre.** A token from `accounts.zoho.in` works only against
  `accounts.zoho.in` / `mail.zoho.in`. The `.com` hosts return
  `INVALID_OAUTHTOKEN`, which looks like a bad credential and is not one.
- **The `from` address is fixed** to `care@arenode.com` or a confirmed alias.
  Arbitrary from-addresses are rejected.

The access-token cache in `zoho.js` is load-bearing, not an optimisation —
Zoho rate-limits the token endpoint. Do not remove it.

---

## The Communication page

`src/features/communication/` — `CommunicationPage.tsx` (layout), `parts.tsx`
(ring, bars, art, panel shell), `CreditHistoryModal.tsx`, `BuyCreditsModal.tsx`.
Tailwind on `--cs-*` (design-DNA §0a); the old `communication.css` went with
the old layout.

Three tiles (credits ring · 14-day usage · delivery health), then a feed and a
conversation side by side, then a quiet coming-soon strip.

**The shell is one viewport tall and does not scroll itself.** The two main
panels fill what is left and scroll INSIDE themselves. That is what makes them
the same height with 0 rows, 3 rows or 300 — Anmol, 2026-09-07: *"the size of
this container should be consistent."* Three states, all designed:

| Rows | What fills the panel |
|---|---|
| 0 | `BigEmpty` — the art at full size, one fact, one next action |
| 1–3 | the rows, plus `FillArt`: the SAME drawing, low opacity, behind them |
| many | the rows, scrolling |

The middle one is the case that usually gets missed and reads as unfinished.
It is Practice's `.prac-fill-art` pattern, reused rather than reinvented.

There is **no composer and no send button**, both deliberately: sends are
triggered by clinical work (`useConsultLifecycle`), and a reply box that
silently cannot send outside Meta's 24-hour window is worse than an honest
note. The conversation is "slightly WhatsApp" — tinted ground, outbound right,
bottom-anchored — and stops short of a clone precisely because a full
imitation would promise a reply box this version does not have.

## Where the prescription send is triggered

`src/hooks/useConsultLifecycle.ts` → `handleConfirmAndSave`, right after the
story/exercise writes. Not awaited and never allowed to fail the save: by that
line the prescription is committed, and a doctor told "save failed" would try
again and produce a second prescription for one visit.

**Skipped outright when the patient has no phone**, without a toast — a clinic
that does not collect phone numbers would otherwise produce one toast per
consultation about a thing the doctor already knows.

---

## Open

- **No email has ever actually been sent.** The pipeline is wired end to end
  and every template renders, but `server/.env` has no `ZOHO_*` values in any
  checkout an agent has had, so `emailConfigured()` is false and `notify()`
  takes its "log what it would have sent" path. Zoho's India token endpoint IS
  reachable and answers correctly (`invalid_client` for bogus credentials), so
  the remaining unknown is the credentials, not the code. First real send is
  also the first row in `support_email_log` — check both.
- **The follow-up send has no trigger yet.** `sendFollowUp` and its template
  exist and work; nothing schedules them. It needs a job (or a login-time
  sweep) over `prescriptions.follow_up_days`. Until then the Templates tab's
  "sent automatically when a follow-up falls due" is a promise, not a fact.
- **`server/` still has no stable home.** Same blocker as the two-way reply:
  the frontend calls `/api` through Vite's dev proxy, and
  `VITE_AREN_API_URL` exists for when that changes.
- **Admin approval has no UI.** `approve_credit_recharge()` is called by hand
  (SQL or a service-role tool). Parallax is the natural home for the queue.
- **Templates not yet approved; provider not yet flipped.** `aren_prescription`
  / `aren_follow_up` (override with `WHATSAPP_TEMPLATE_*`) are the configured
  names. The Fast2SMS adapter is wired (§5a) but `MESSAGING_PROVIDER` must
  stay `mock` until `npm run check:whatsapp` shows both templates Approved and
  the number healthy — then set `MESSAGING_PROVIDER=fast2sms` and send exactly
  one real test before any volume. Note `server/.env` still carries stale
  direct-Meta creds (`WHATSAPP_ACCESS_TOKEN` etc.), so auto-select currently
  resolves to `meta` with a likely-dead token — set `MESSAGING_PROVIDER=mock`
  explicitly in the meantime.
