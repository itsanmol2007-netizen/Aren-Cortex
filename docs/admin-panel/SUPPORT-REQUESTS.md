# Support requests — how it works, and what Master Control owns

Built 2026-09-11. Source of truth for anyone (or anything) building the
support side of the Zenith / Master Control panel.

## The shape of it

A doctor opens **Help & Support** in Cortex, picks a topic, optionally ticks
which areas are affected, types what happened, and sends. That produces **one
row in `public.support_requests`** and **one email to support@arenode.com**.

**The row is the ticket. The email is only the notification.** They are
written in that order on purpose — if Zoho is down, AREN loses the email and
still has the request. Never treat the mailbox as the record.

## The one rule that matters

**Cortex can create a request. It can never change one.**

`support_requests` has RLS on with a single policy: a clinic may `SELECT` its
own rows. There is **no INSERT, UPDATE or DELETE policy for anybody**. The
only writer is the `support-notify` edge function under the service role,
which resolves `doctor_id` / `hospital_id` / `user_id` from the caller's
**session** — never from the request body — so a request can only ever be
filed against the clinic of whoever actually sent it.

So: **status is yours, not the doctor's.** Nothing on the doctor side reads or
writes it, and nothing should be added that does. A doctor who could set
`status = 'resolved'` could close their own ticket; a doctor who could see it
would ask why it says `waiting_on_doctor`.

## Columns, and who owns them

| Column | Written by | Notes |
|---|---|---|
| `topic`, `areas`, `message`, `reply_to` | the doctor, via the form | `areas` is `text[]`, empty for topics that don't ask |
| `hospital_id`, `doctor_id`, `user_id` | the edge function, from the session | never trust a client for these |
| `diagnostics` | the browser | build sha, page they came from, recent errors, service-worker state, network, viewport. **jsonb, and the key set will change** — read it, don't build a schema on it |
| `email_status`, `email_error` | the edge function | whether the *notification* went out. Not the ticket's state |
| **`status`** | **Master Control** | `open` → `in_progress` → `waiting_on_doctor` → `resolved` / `closed` (CHECK-constrained) |
| **`assigned_to`, `internal_note`, `resolved_at`** | **Master Control** | never surfaced to the clinic |
| `created_at`, `updated_at` | database | `updated_at` is trigger-maintained, so a panel that forgets it can't lie |

## Building against it

- Connect with the **service role** (this table is not reachable from an anon
  key beyond a clinic's own rows).
- The open queue is indexed: `(status, created_at desc)` where status is
  `open`/`in_progress`/`waiting_on_doctor`. Per-clinic history is indexed on
  `(hospital_id, created_at desc)`.
- The doctor's reference is **`SR_<id>`** — shown to them on send, and in the
  email subject. Match on it.
- Replying happens **by email**, to `reply_to`. There is no thread, no reply
  table, no notification back into Cortex. Don't imply one in the UI until
  there is one.
- **No patient data is ever in this table**, by design. If it ever appears,
  that is a bug worth stopping for.

## Where the code is

- Form + topics: `src/features/support/`
- Client call: `sendSupportRequest()` in `src/lib/db/messaging.ts`
- Browser facts: `src/lib/diagnostics/sessionTrace.ts`
- Server: `supabase/functions/support-notify/index.ts`
- Schema: `supabase/migrations/20260911_support_requests.sql`
