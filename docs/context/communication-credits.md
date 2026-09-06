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

### 4. Debit first, refund on failure — never "send then charge"

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

`purpose` is deliberately NOT derived from `template_name`: that is Meta's
name for an approved template and changes when one is re-approved, which must
not silently reclassify a year of history.

---

## Email

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

`src/features/communication/CommunicationPage.tsx`, Tailwind on `--cs-*`
(design-DNA §0a). The old `communication.css` was deleted with the old layout.

Credits strip → appointment requests (when any) → activity list + conversation
panel → a small dashed "coming soon" line. There is **no send button** and no
composer, both deliberately:

- Sends are triggered by clinical work (`useConsultLifecycle`'s
  `handleConfirmAndSave`), not by this screen. A send button here would invite
  messaging a patient with no prescription attached.
- Replies need Meta's 24-hour window, and a text box that silently cannot send
  outside it is worse than an honest note.

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

- **The follow-up send has no trigger yet.** `sendFollowUp` and its template
  exist and work; nothing schedules them. It needs a job (or a login-time
  sweep) over `prescriptions.follow_up_days`. Until then the Templates tab's
  "sent automatically when a follow-up falls due" is a promise, not a fact.
- **`server/` still has no stable home.** Same blocker as the two-way reply:
  the frontend calls `/api` through Vite's dev proxy, and
  `VITE_AREN_API_URL` exists for when that changes.
- **Admin approval has no UI.** `approve_credit_recharge()` is called by hand
  (SQL or a service-role tool). Parallax is the natural home for the queue.
- **Meta templates are not submitted.** `aren_prescription` / `aren_follow_up`
  are the configured names; until they are approved, `MESSAGING_PROVIDER`
  should stay unset so the mock adapter runs.
