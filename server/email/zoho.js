// ---------------------------------------------------------------------------
// ZOHO MAIL — the transport, and nothing else.
//
// This file knows how to put one email on the wire. It knows nothing about
// recharges, credits or doctors; that is `templates.js` (what an email says)
// and `notify.js` (when one is sent). Splitting it three ways is what makes
// "move off Zoho" a change to this file alone.
//
// Same mechanism the arenode.com landing page already uses in production, so
// the deliverability question is answered: arenode.com's SPF/DKIM/DMARC are
// configured in Zoho, which is why those emails arrive cleanly today.
//
// ── Two facts that will waste an afternoon if you don't know them ─────────
//
// 1. **The account is in Zoho's INDIA data centre.** A token issued by
//    `accounts.zoho.in` works ONLY against `accounts.zoho.in` and
//    `mail.zoho.in`. Pointed at the `.com` hosts it returns
//    `INVALID_OAUTHTOKEN` — which looks exactly like a bad credential and is
//    not one. If a send starts failing that way, check the host before you
//    touch the token.
//
// 2. **The `from` address is fixed.** It must be `care@arenode.com` or a
//    confirmed alias of that mailbox (`support@arenode.com` is one). Zoho
//    rejects a from-address the account does not own — this is not a header
//    you can set freely.
//
// Needs, in server/.env (gitignored — never commit these, never prefix any of
// them with VITE_, which would ship them in the browser bundle):
//   ZOHO_CLIENT_ID
//   ZOHO_CLIENT_SECRET
//   ZOHO_REFRESH_TOKEN   — long-lived; exchanged for a ~1h access token
//   ZOHO_ACCOUNT_ID      — 6202294000000002002 (not a secret)
//   ZOHO_FROM            — care@arenode.com
// ---------------------------------------------------------------------------

const ZOHO_TOKEN_URL = "https://accounts.zoho.in/oauth/v2/token";
const ZOHO_MAIL_BASE = "https://mail.zoho.in/api/accounts";

/**
 * The access token, held in module scope.
 *
 * This cache is load-bearing, not an optimisation: Zoho rate-limits the token
 * endpoint, and exchanging the refresh token on every email will start
 * failing under any real volume. Do not remove it.
 */
let tokenCache = null; // { value, expiresAt }

function need(name) {
    const v = process.env[name];
    if (!v) throw new Error(`missing env var: ${name}`);
    return v;
}

/** True when the Zoho credentials are present at all. Lets callers degrade to
 *  "log it, don't send it" on a developer machine rather than throwing on
 *  every notification. */
export function emailConfigured() {
    return Boolean(
        process.env.ZOHO_CLIENT_ID &&
        process.env.ZOHO_CLIENT_SECRET &&
        process.env.ZOHO_REFRESH_TOKEN &&
        process.env.ZOHO_ACCOUNT_ID
    );
}

/** Long-lived refresh token -> short-lived access token, cached until a
 *  minute before it expires. */
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
 *
 * Retries exactly once on a 401 with a forced token refresh. That covers the
 * real failure mode — an access token that went stale earlier than its stated
 * expiry — without turning a genuinely bad credential into a retry loop
 * against a rate-limited endpoint.
 *
 * @param {{ to: string, subject: string, html: string, fromName?: string, replyTo?: string }} opts
 */
export async function sendZohoMail({ to, subject, html, fromName, replyTo }) {
    const accountId = need("ZOHO_ACCOUNT_ID");
    const fromBare = process.env.ZOHO_FROM || "care@arenode.com";
    // Zoho accepts an RFC 5322 "Display Name <addr>" here.
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
                ...(replyTo ? { replyTo } : {}),
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
        token = await getZohoAccessToken(true);
        res = await attempt(token);
    }

    // Zoho answers HTTP 200 with a failure code in the body, so both have to
    // be checked — trusting the status line alone reports success for mail
    // that was never accepted.
    const ok = res.httpStatus === 200 && res.zohoCode === 200;
    if (!ok) {
        throw new Error(
            `Zoho send failed: HTTP ${res.httpStatus} code ${res.zohoCode} ${res.desc || ""}`
        );
    }
    return { ok: true };
}
