# Sending Zoho email from the Cortex app (doctor-triggered request emails)

This explains how the arenode.com landing page sends real email through
Zoho, and how to set up the same thing inside **Aren-Cortex** so a doctor
can click a button ("request a credit recharge", "request a new
composition", …) and an email lands in the founder's inbox.

Paste this whole file into a Claude Code session opened on the
`Aren-Cortex-master` repo and let it implement the checklist at the end.

---

## TL;DR — is it possible?

**Yes. Fully. Right now, from localhost, with no domain and nothing
deployed.**

Sending mail through Zoho is a plain **server-to-server HTTPS API call**.
It has nothing to do with:

- whether your app has a domain — it doesn't need one
- whether your app is deployed — localhost is fine
- any inbound routing, DNS, ngrok, port forwarding — none of that is involved

The only requirement is that the machine running your **backend** (your
laptop, running the Cortex Express server) can make outbound HTTPS
requests to `*.zoho.in`. It can — this was already proven from this PC
when the landing page was built.

The domain (`arenode.com`) only ever mattered for *deliverability* —
making sure Gmail/Outlook trust mail claiming to be from
`care@arenode.com`. That's already done (SPF/DKIM/DMARC are configured in
Zoho for arenode.com, which is why the landing-page emails arrive
cleanly). Cortex would reuse the **same mailbox and same domain**, so
there's zero new domain work. And for mail that only goes **to yourself**
(the founder), deliverability isn't even a concern.

---

## How the landing page does it (the model to copy)

```
Doctor's browser                Cortex Express server            Zoho (India DC)
(has a Supabase session)         (server/, port 4000)            accounts.zoho.in
        |                                |                        mail.zoho.in
        |  POST /api/requests/credit     |                             |
        |  Authorization: Bearer <jwt>   |                             |
        | -----------------------------> |                             |
        |                                | 1. verify JWT -> which doctor|
        |                                | 2. look up clinic + balance  |
        |                                |    from Supabase (service key)|
        |                                | 3. refresh Zoho access token |
        |                                | ------ POST /oauth/v2/token ->|
        |                                | <----- access_token ---------|
        |                                | 4. send the email            |
        |                                | -- POST /.../messages ------> |
        |                                | <----- 200 OK --------------- |
        |   { ok: true }                 |                             |
        | <----------------------------- |                             |
   toast: "Request sent"                 |                             |
```

Key points:

- **All Zoho credentials live only on the server** (`server/.env`). The
  doctor's browser never sees them. The browser only sends its own
  Supabase session token, which the server uses to identify the doctor.
- **The access token is short-lived (~1 hour)** and is derived on demand
  from a long-lived **refresh token**. The server caches the access token
  in memory and reuses it until it's close to expiry.
- The Zoho account is in the **India (`.in`) data center**. Tokens issued
  there work **only** against `accounts.zoho.in` and `mail.zoho.in`.
  Calling the `.com` equivalents returns `INVALID_OAUTHTOKEN` — that's
  expected, not a bug. Don't "fix" a failure by swapping the host.

---

## What you need (config)

All of these already exist. **Do not paste the secret values into this
file, into chat, or into git.** Copy them directly between files on the
machine.

The four Zoho values are already on this PC in:

```
X:\Aren LP\aren-landing-page\.env.local
```

Add these lines to **`X:\Aren-Cortex-master\server\.env`** (that file
already exists and is gitignored; it already has the `SUPABASE_*` values
you need):

| Variable | Where the value comes from |
|---|---|
| `ZOHO_CLIENT_ID` | copy from `aren-landing-page\.env.local` |
| `ZOHO_CLIENT_SECRET` | copy from `aren-landing-page\.env.local` |
| `ZOHO_REFRESH_TOKEN` | copy from `aren-landing-page\.env.local` |
| `ZOHO_ACCOUNT_ID` | `6202294000000002002` (not secret — Zoho account id) |
| `ZOHO_FROM` | `care@arenode.com` |
| `REQUESTS_NOTIFY_EMAIL` | `anmol@arenode.com` (where request emails go) |
| `SUPABASE_URL` | already in `server/.env` |
| `SUPABASE_SERVICE_ROLE_KEY` | already in `server/.env` |

Facts about the Zoho account (already set up, nothing to do):

- Region: **India `.in`**
- Token endpoint: `https://accounts.zoho.in/oauth/v2/token`
- Mail send endpoint: `https://mail.zoho.in/api/accounts/<ACCOUNT_ID>/messages`
- OAuth scopes already granted: `ZohoMail.messages.CREATE`,
  `ZohoMail.accounts.READ` (sending only needs the first — you have enough)
- Sending identity: `care@arenode.com` (the mailbox the token is
  authorised for; its confirmed aliases like `support@arenode.com` also
  work). You cannot send "from" an address the account doesn't own.

Runtime: Node 18+ (global `fetch` is built in — no `node-fetch` needed).

---

## Code

### 1. Reusable Zoho module — `server/email/zoho.js`

This is the landing page's logic, trimmed to a plain ESM module that
matches the existing `server/` style.

```js
// server/email/zoho.js
// Outbound transactional email via Zoho Mail's REST API (India / .in DC).
// Same mechanism the arenode.com landing page uses. No inbound routing,
// no domain config, no deployment required — a plain server-to-server
// HTTPS call that works from localhost.

const ZOHO_TOKEN_URL = "https://accounts.zoho.in/oauth/v2/token";
const ZOHO_MAIL_BASE = "https://mail.zoho.in/api/accounts";

let tokenCache = null; // { value, expiresAt }

function need(name) {
  const v = process.env[name];
  if (!v) throw new Error(`missing env var: ${name}`);
  return v;
}

/** Long-lived refresh token -> short-lived access token, cached in memory. */
export async function getZohoAccessToken(force = false) {
  if (!force && tokenCache && tokenCache.expiresAt > Date.now() + 60_000) {
    return tokenCache.value;
  }
  const body = new URLSearchParams({
    refresh_token: need("ZOHO_REFRESH_TOKEN"),
    client_id: need("ZOHO_CLIENT_ID"),
    client_secret: need("ZOHO_CLIENT_SECRET"),
    grant_type: "refresh_token",
  });
  const r = await fetch(ZOHO_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data.access_token) {
    throw new Error(
      `Zoho token exchange failed: HTTP ${r.status} ${JSON.stringify(data).slice(0, 300)}`
    );
  }
  tokenCache = {
    value: data.access_token,
    expiresAt: Date.now() + (Number(data.expires_in) || 3600) * 1000,
  };
  return tokenCache.value;
}

/**
 * Send one HTML email.
 * @param {{ to:string, subject:string, html:string, fromName?:string }} opts
 */
export async function sendZohoMail({ to, subject, html, fromName }) {
  const accountId = need("ZOHO_ACCOUNT_ID");
  const fromBare = process.env.ZOHO_FROM || "care@arenode.com";
  // Zoho's API accepts an RFC 5322 "Display Name <addr>" here.
  const fromAddress = fromName ? `${fromName} <${fromBare}>` : fromBare;

  async function attempt(token) {
    const r = await fetch(`${ZOHO_MAIL_BASE}/${accountId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Zoho-oauthtoken ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        fromAddress,
        toAddress: to,
        subject,
        content: html,
        mailFormat: "html",
      }),
    });
    const data = await r.json().catch(() => ({}));
    return {
      httpStatus: r.status,
      zohoCode: data?.status?.code,
      desc: data?.status?.description,
    };
  }

  let token = await getZohoAccessToken();
  let res = await attempt(token);
  if (res.httpStatus === 401) {
    // token went stale early — refresh once and retry
    token = await getZohoAccessToken(true);
    res = await attempt(token);
  }
  const ok = res.httpStatus === 200 && res.zohoCode === 200;
  if (!ok) {
    throw new Error(
      `Zoho send failed: HTTP ${res.httpStatus} code ${res.zohoCode} ${res.desc || ""}`
    );
  }
  return { ok: true };
}
```

### 2. Request endpoints — `server/requests/index.js`

Mounts on the existing Express app. Verifies the caller's Supabase
session, looks up who they are, templates the email, sends it.

```js
// server/requests/index.js
import { createClient } from "@supabase/supabase-js";
import { sendZohoMail } from "../email/zoho.js";

const admin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const FOUNDER_INBOX = process.env.REQUESTS_NOTIFY_EMAIL || "anmol@arenode.com";

function esc(s = "") {
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function wrap(inner) {
  return `<div style="font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:14px;line-height:1.6;color:#1f2937;max-width:520px">${inner}</div>`;
}

/** Identify the doctor from the Supabase session JWT the browser sends. */
async function requireDoctor(req, res) {
  const jwt = (req.headers.authorization || "").replace(/^Bearer /i, "");
  if (!jwt) { res.status(401).json({ ok: false, error: "no_token" }); return null; }

  const { data: { user }, error } = await admin.auth.getUser(jwt);
  if (error || !user) { res.status(401).json({ ok: false, error: "bad_token" }); return null; }

  // TODO: match these table/column names to Cortex's real schema.
  const { data: profile } = await admin
    .from("users")
    .select("id, name, role, hospital_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile) { res.status(403).json({ ok: false, error: "unknown_user" }); return null; }

  const { data: hospital } = await admin
    .from("hospitals")
    .select("name")
    .eq("id", profile.hospital_id)
    .maybeSingle();

  return { user, profile, clinicName: hospital?.name || "Unknown clinic" };
}

export function mountRequestRoutes(app) {
  // --- credit recharge -----------------------------------------------------
  app.post("/api/requests/credit", async (req, res) => {
    const ctx = await requireDoctor(req, res);
    if (!ctx) return;

    const amount = String(req.body?.amount || "").trim();
    const note = String(req.body?.note || "").trim();

    const html = wrap(`
      <p><strong>Credit recharge request</strong></p>
      <p>
        Doctor: ${esc(ctx.profile.name)}<br>
        Clinic: ${esc(ctx.clinicName)}<br>
        User ID: ${esc(ctx.user.id)}<br>
        Amount requested: ${esc(amount) || "(not specified)"}<br>
        ${note ? `Note: ${esc(note)}<br>` : ""}
        Time: ${new Date().toISOString()}
      </p>`);

    try {
      await sendZohoMail({
        to: FOUNDER_INBOX,
        subject: `[Cortex] Credit recharge — ${ctx.clinicName}`,
        html,
        fromName: "Arenode Cortex",
      });
      // Optional: also log it so there's a record beyond the email.
      // await admin.from("credit_requests").insert({
      //   user_id: ctx.user.id, hospital_id: ctx.profile.hospital_id,
      //   amount, note,
      // });
      res.json({ ok: true });
    } catch (e) {
      console.error("[requests/credit]", e);
      res.status(502).json({ ok: false, error: "send_failed" });
    }
  });

  // --- new composition ---------------------------------------------------
  app.post("/api/requests/composition", async (req, res) => {
    const ctx = await requireDoctor(req, res);
    if (!ctx) return;

    const composition = String(req.body?.composition || "").trim();
    const brand = String(req.body?.brand || "").trim();
    const details = String(req.body?.details || "").trim();
    if (!composition) {
      return res.status(400).json({ ok: false, error: "composition_required" });
    }

    const html = wrap(`
      <p><strong>New composition request</strong></p>
      <p>
        Doctor: ${esc(ctx.profile.name)}<br>
        Clinic: ${esc(ctx.clinicName)}<br>
        Composition: ${esc(composition)}<br>
        ${brand ? `Brand seen as: ${esc(brand)}<br>` : ""}
        ${details ? `Details: ${esc(details)}<br>` : ""}
        Time: ${new Date().toISOString()}
      </p>`);

    try {
      await sendZohoMail({
        to: FOUNDER_INBOX,
        subject: `[Cortex] New composition — ${composition}`,
        html,
        fromName: "Arenode Cortex",
      });
      res.json({ ok: true });
    } catch (e) {
      console.error("[requests/composition]", e);
      res.status(502).json({ ok: false, error: "send_failed" });
    }
  });
}
```

### 3. Wire it into `server/index.js`

```js
import { mountRequestRoutes } from "./requests/index.js";

// ... existing code ...
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true }));
mountRequestRoutes(app);        // <-- add this line
```

### 4. Frontend — call it with the doctor's session token

```ts
// wherever the "Request" button lives in src/
import { toast } from "sonner";
import { supabase } from "@/lib/supabaseClient"; // use the existing client path

export async function requestCreditRecharge(amount: string, note = "") {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) { toast.error("Please sign in again."); return; }

  const res = await fetch("/api/requests/credit", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ amount, note }),
  });

  const json = await res.json().catch(() => ({}));
  if (json.ok) toast.success("Request sent. We'll get back to you shortly.");
  else toast.error("Could not send the request. Please try again.");
}
```

### 5. Vite proxy (so the frontend can use `/api/...`)

`vite.config.ts` has no `server` block yet. Add one:

```ts
export default defineConfig({
  // ...existing plugins / resolve...
  server: {
    host: "127.0.0.1",
    proxy: {
      "/api": "http://localhost:4000", // Cortex Express server (server/index.js)
    },
  },
});
```

Without the proxy, call the absolute URL `http://localhost:4000/api/...`
from the frontend instead (fine for local dev, just remember to make it
configurable before any real deployment).

---

## Wiring checklist (for the Cortex session)

1. `server/.env` — add `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`,
   `ZOHO_REFRESH_TOKEN` (copy values from
   `X:\Aren LP\aren-landing-page\.env.local`), plus
   `ZOHO_ACCOUNT_ID=6202294000000002002`, `ZOHO_FROM=care@arenode.com`,
   `REQUESTS_NOTIFY_EMAIL=anmol@arenode.com`.
2. Add `server/email/zoho.js` (section 1, verbatim).
3. Add `server/requests/index.js` (section 2). Fix the `users` /
   `hospitals` table and column names to match Cortex's real schema, and
   confirm how a logged-in user is looked up (there may already be a
   helper for this in `server/whatsapp/supabaseClient.js` or similar).
4. Add `mountRequestRoutes(app)` to `server/index.js` after
   `app.use(express.json())`.
5. Add the Vite `server.proxy` block (section 5).
6. Build the doctor-facing UI (a dialog with amount/note, or a plain
   "Request recharge" button) that calls section 4's function.
7. Test (see below).

---

## Testing

**A. Credentials reachable from this machine** (run in a terminal, with
the three values pasted in):

```bash
curl -s -X POST https://accounts.zoho.in/oauth/v2/token \
  -d "refresh_token=PASTE_REFRESH_TOKEN" \
  -d "client_id=PASTE_CLIENT_ID" \
  -d "client_secret=PASTE_CLIENT_SECRET" \
  -d "grant_type=refresh_token"
```

Expect JSON with an `access_token`. If you get that, everything else works.

**B. End to end**, with `npm run server` running:

```bash
# get a doctor's access_token from the browser devtools (Application ->
# Local Storage -> the supabase auth token -> "access_token"), then:
curl -s -X POST http://localhost:4000/api/requests/credit \
  -H "Authorization: Bearer PASTE_DOCTOR_JWT" \
  -H "Content-Type: application/json" \
  -d '{"amount":"2000","note":"testing"}'
```

Expect `{"ok":true}` and an email in `anmol@arenode.com` within a few
seconds.

---

## Gotchas / things to know

- **Region lock.** The token is `.in`-issued. It works **only** against
  `accounts.zoho.in` + `mail.zoho.in`. The `.com` hosts will reject it
  with `INVALID_OAUTHTOKEN`. This is normal multi-data-center behaviour.
- **One refresh token, two apps — fine.** The landing page and Cortex can
  both use the same refresh token at the same time; each exchanges it for
  its own access token independently. The only coupling: if that refresh
  token is ever regenerated or revoked in the Zoho API console, **both
  apps stop sending** until both `.env` files are updated. If you want
  them independent later, create a second OAuth client in the Zoho API
  console (same two scopes) and give Cortex its own refresh token.
- **Sending limits.** Zoho's free plan has a modest daily outbound cap
  (low hundreds of emails). Perfect for internal request emails; do not
  use this path for anything bulk or marketing.
- **Keep the access-token cache.** Requesting a fresh token on every
  email will hit Zoho's token-endpoint rate limit. The module-scope cache
  in `zoho.js` handles this — don't remove it.
- **Secrets stay on the server.** The browser only ever sends its own
  Supabase JWT. Never ship `ZOHO_*` values to the frontend bundle (don't
  prefix them with `VITE_`).
- **`from` address is fixed.** It must be `care@arenode.com` or a
  confirmed alias of that mailbox. Arbitrary from-addresses are rejected.
- **Localhost is enough.** Outbound HTTPS to `*.zoho.in` on port 443 is
  the only network requirement. No ngrok, no domain, no deployment.
- **Deliverability** only matters if you later email doctors/patients
  (not yourselves). arenode.com's SPF/DKIM are already set in Zoho, so
  that path is fine too — just keep the HTML plain.

---

## Optional hardening (do later, not needed to start)

- **Log every request** to a `requests` / `credit_requests` table so
  there's a durable record and a simple admin view, not just inbox mail.
- **Rate-limit per doctor** (e.g. max 5 requests/hour/user) so a
  mis-click or a frustrated user can't flood the inbox.
- **Separate Zoho OAuth client for Cortex** so the two apps' credentials
  are independent.
- **Confirmation to the doctor**: after sending the founder email, also
  `sendZohoMail` a short "we've received your request" note to the
  doctor's own email — same pattern the landing page uses (applicant +
  internal).
