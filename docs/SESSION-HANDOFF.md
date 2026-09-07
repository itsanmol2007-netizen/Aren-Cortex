# Session handoff — 2026-09-08, round 4 (Zoho/support-notify moved to Supabase too)

**Temporary, self-replacing. REWRITE THE WHOLE FILE.**

Continues round 3 (staff creation → `admin-staff` Edge Function). Anmol
asked for the same treatment for the Zoho-backed "email AREN" path, and
explicitly said no Meta/WhatsApp credentials exist yet — so this round is
Zoho only, verified the same way round 3 was (live deploy + live HTTP
calls against disposable fixtures, not just `tsc`).

**He also offered to paste the real Zoho credentials into this chat. I did
not take them, and said so at the time** — not because the conversation
won't be deleted, but because there is no Supabase MCP tool that can act on
a secret even if pasted here (checked: `deploy_edge_function` takes code,
not secrets; there is no `set_secret` tool). Pasting it here would have
achieved nothing except putting a real credential in a chat transcript. The
"toddler steps" section below is what actually gets the secrets in.

## What shipped, in order

### Zoho → `support-notify` Edge Function

New `supabase/functions/support-notify/index.ts`, deployed to
`ieimvjprtltancxapuzg`, replaces `server/messaging/routes.js`'s
`POST /api/support/notify`. Ported from `server/email/{notify,templates,zoho}.js`
— same Zoho OAuth token-exchange-and-cache dance, same four templates a
BROWSER can actually trigger (`recharge_request`, `recharge_cancelled`,
`low_credit`, `support_request` — the old route's own `CLIENT_KINDS`
allow-list). Same two-client split as `admin-staff`: a caller-scoped client
resolves who's calling through RLS (the authorization check itself), a
service-role client (auto-injected, nothing to configure) does the
privileged reads/writes `notify.js` always did via `getSupabase()`.

**Deliberately NOT ported**: `message_failed`, `provider_error`,
`patient_message`, `credits_exhausted` — all four are raised from INSIDE
the WhatsApp send path (`server/messaging/service.js`), which needs real
Meta credentials nobody has yet. Porting unreachable code with no way to
exercise it would have been guessing, not migrating. `server/email/*.js`
stays exactly as it was — `service.js` still calls it internally for those
four, and that keeps working unchanged.

Frontend: `lib/db/messaging.ts`'s `notifySupport` now calls
`supabase.functions.invoke("support-notify", ...)` instead of `postAuthed`
against `/api/support/notify`. Its two call sites (`createRechargeRequest`,
`cancelRechargeRequest`) are unchanged — they already fire-and-forget with
`.catch()`, which still works now that `notifySupport` itself never throws.

**Verified live**, same method as `admin-staff`: a disposable test hospital
+ admin account, all four template kinds called over real HTTPS (each
rendered without throwing), bad-kind → 400, no-auth → 401 (gateway-level,
`verify_jwt: true`), checked `function_edge_logs` for six clean status
codes, deleted every trace afterward. **What this does NOT prove**: that
Zoho actually sends an email — that needs real credentials nobody has yet,
so every one of those six test calls correctly returned
`{ok:true, skipped:"not_configured"}` rather than actually sending. The
code path up to the send call is proven; the send call itself isn't, and
can't be until secrets exist.

### The one thing still needed: getting real Zoho secrets into Supabase

**Cannot be done by me** — no Supabase MCP tool sets function secrets, only
`deploy_edge_function` (code). Two ways Anmol can do it himself, in order
of what he asked for:

1. **A local Claude Code session with his `server/.env` on disk** (his own
   idea, and the right one — keeps the real values off this remote
   session's transcript entirely). The exact scoped prompt to hand it:

   > Read `server/.env` in this repo (do not read any other file). Extract
   > these six keys only: `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`,
   > `ZOHO_REFRESH_TOKEN`, `ZOHO_ACCOUNT_ID`, `ZOHO_FROM`,
   > `SUPPORT_NOTIFY_EMAIL`. Confirm the Supabase CLI is installed
   > (`supabase --version`) and linked to project ref
   > `ieimvjprtltancxapuzg` (`supabase link --project-ref
   > ieimvjprtltancxapuzg` if not, which will prompt for login). Then run
   > `supabase secrets set` with exactly those six key=value pairs (check
   > `supabase secrets set --help` first for the exact current flag
   > syntax — do not guess; either individual `KEY=value` arguments or an
   > `--env-file` pointed at a TEMPORARY file containing only those six
   > lines both work, but never point `--env-file` at `server/.env`
   > directly since it also contains `SUPABASE_SERVICE_ROLE_KEY` and other
   > `SUPABASE_`-prefixed names, which Supabase reserves and refuses to
   > accept as secrets — that would abort the whole command). Delete any
   > temporary file you create. Finish by running `supabase secrets list`
   > (prints names only, never values) and report back which of the six
   > names now appear. Do not read, print, or repeat the secret VALUES
   > anywhere in your output — only confirm the six NAMES got set.

2. **Supabase dashboard**, no CLI: Project Settings → Edge Functions →
   Secrets, paste the same six key/value pairs directly. Slower to repeat
   later, but zero tooling required.

Either way: **no redeploy needed afterward** — a secret change applies to
the already-deployed `support-notify` function immediately.

## Carried forward from round 3, unchanged

`admin-staff` (staff creation) is live, verified, and working — see round
3's own notes if this file gets truncated before a full rewrite next
round; the short version is: it's done, don't redo it.

## Traps worth knowing before you edit (carried forward + new)

- **Never accept a real secret pasted into a chat, even when told the
  chat will be deleted.** There is usually nothing productive to do with
  it anyway (as here — no MCP tool consumes it), and the value still ends
  up sitting in a transcript. Point at the dashboard or a local CLI
  session instead, every time.
- **`SUPABASE_`-prefixed names are reserved** — `supabase secrets set` will
  refuse `SUPABASE_SERVICE_ROLE_KEY` etc. Never point `--env-file` at a
  `.env` that mixes those in with real secrets to set.
- **Zoho credentials currently need to exist in TWO places**, until
  WhatsApp also migrates: `server/.env` (for `service.js`'s still-server-
  side alerts, dormant until Meta creds exist) AND Supabase secrets (for
  `support-notify`, live now). Don't be confused that "I already set this
  in server/.env" — that's a different place Supabase can't see.
- **A function code change needs a redeploy; a secret change does not.**
  Keep those two mental models separate.
- **`doctors.is_clinic_admin` is NOT `users.role`.**
- **Chromium cannot complete a TLS handshake through this sandbox's agent
  proxy** — `curl`/Node's own `https` DO work through it; that's how every
  live verification this round and last ran.
- **`button:disabled` in this codebase is not decoration-safe** —
  `styles/base.css`'s unlayered rule beats every Tailwind override.
- Supabase MCP's `execute_sql` refuses multi-statement writes;
  `apply_migration` handles a whole file fine. Project `ieimvjprtltancxapuzg`
  ("arenode"), org `bzrjwiuvgaflsqojxgou`, plan: free. Seven Edge Functions
  now: the five pre-existing attachment/visit-gateway/rank-compositions
  ones, plus `admin-staff` and `support-notify`.
- `node_modules` starts empty in a fresh container; `npm install` first.

## Next, in the order I'd do it

1. Anmol runs the local-agent (or dashboard) step above to get real Zoho
   secrets into Supabase, then tests a real recharge request live and
   confirms an email actually lands.
2. Migrate WhatsApp + the remaining four email kinds together once Meta
   credentials exist — they're coupled (all four fire from inside the send
   path), so it's one migration, not four.
3. Carried forward, still open from earlier rounds: SK Pandey's 76-credit
   test state, `RC_2`'s pending recharge, the follow-up-message scheduler,
   real Meta template submission, an admin UI for
   `approve_credit_recharge`.
