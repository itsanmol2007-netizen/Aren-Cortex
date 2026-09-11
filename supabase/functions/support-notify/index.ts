// support-notify — emails AREN (Zoho Mail) about an operational event a
// signed-in doctor's own action raised: a credit recharge request, its
// withdrawal, a low-credit warning, or a support request.
//
// MIGRATED 2026-09-08 from server/messaging/routes.js's `POST
// /api/support/notify` (+ server/email/{notify,templates,zoho}.js) to a
// Supabase Edge Function — same reasoning as `admin-staff`: one platform
// instead of two, and Anmol wants new server-side work to land here going
// forward rather than growing the separate Express process.
//
// SCOPE, on purpose: only the four "kinds" a BROWSER can ever raise
// (`recharge_request`, `recharge_cancelled`, `low_credit`, `support_request`
// — the old route's own `CLIENT_KINDS` allow-list). `message_failed`,
// `provider_error`, `patient_message` and `credits_exhausted` stay on
// server/email/ for now: all four are raised from INSIDE the WhatsApp send
// path (server/messaging/service.js), which still needs real Meta
// credentials nobody has yet (docs/SESSION-HANDOFF.md). Moving them now
// would be porting code with no way to exercise it. When WhatsApp moves
// here too, fold those templates in rather than forking this file.
//
// Same two-client split as `admin-staff`:
//   - `callerClient` resolves who is calling THROUGH RLS — "ids come from
//     the session, so an alert can only ever be about the caller's own
//     clinic and their own wallet" (the original route's own comment,
//     still true here).
//   - `adminClient` (service-role, auto-injected) does everything the
//     original `notify.js` already did with `getSupabase()`: reading
//     doctor/hospital/balance/recharge-request context and writing
//     `support_email_log`. That was always privileged, cross-clinic-shaped
//     logic, not something RLS was ever meant to gate.
//
// Needs these as Edge Function secrets (`supabase secrets set`, or the
// Supabase dashboard's Edge Functions → Secrets screen) — NEVER pasted into
// a chat, a commit, or this file:
//   ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN, ZOHO_ACCOUNT_ID
//   ZOHO_FROM              (defaults to care@arenode.com if unset)
//   SUPPORT_NOTIFY_EMAIL   (defaults to support@arenode.com if unset)
// `SUPABASE_URL`/`SUPABASE_ANON_KEY`/`SUPABASE_SERVICE_ROLE_KEY` are
// already there automatically — do not set those.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

// ── Zoho transport (server/email/zoho.js, ported) ──────────────────────────
//
// Two facts that will waste an afternoon if forgotten (carried over from
// the original file's own warning):
// 1. The account is in Zoho's INDIA data centre — a token from
//    accounts.zoho.in works ONLY against accounts.zoho.in / mail.zoho.in.
// 2. The from-address is fixed to a mailbox the Zoho account owns
//    (care@arenode.com or a confirmed alias).

const ZOHO_TOKEN_URL = 'https://accounts.zoho.in/oauth/v2/token';
const ZOHO_MAIL_BASE = 'https://mail.zoho.in/api/accounts';

// Edge Functions can reuse a warm instance across invocations the same way
// a long-lived Node process does, so this module-scope cache is the same
// optimization the original file relied on — just not GUARANTEED to
// survive between calls the way it was on a single always-on server. A
// cold instance re-exchanges the refresh token, which Zoho's token
// endpoint can handle; what it can't handle is doing that on every send
// under real volume, which this still prevents within a warm instance.
let tokenCache: { value: string; expiresAt: number } | null = null;

function emailConfigured(): boolean {
  return Boolean(
    Deno.env.get('ZOHO_CLIENT_ID') &&
    Deno.env.get('ZOHO_CLIENT_SECRET') &&
    Deno.env.get('ZOHO_REFRESH_TOKEN') &&
    Deno.env.get('ZOHO_ACCOUNT_ID')
  );
}

function need(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`missing secret: ${name}`);
  return v;
}

async function getZohoAccessToken(force = false): Promise<string> {
  if (!force && tokenCache && tokenCache.expiresAt > Date.now() + 60_000) {
    return tokenCache.value;
  }

  const body = new URLSearchParams({
    refresh_token: need('ZOHO_REFRESH_TOKEN'),
    client_id: need('ZOHO_CLIENT_ID'),
    client_secret: need('ZOHO_CLIENT_SECRET'),
    grant_type: 'refresh_token',
  });

  const r = await fetch(ZOHO_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data.access_token) {
    throw new Error(`Zoho token exchange failed: HTTP ${r.status} ${JSON.stringify(data).slice(0, 300)}`);
  }

  tokenCache = {
    value: data.access_token,
    expiresAt: Date.now() + (Number(data.expires_in) || 3600) * 1000,
  };
  return tokenCache.value;
}

async function sendZohoMail({ to, subject, html, fromName }: {
  to: string; subject: string; html: string; fromName?: string;
}): Promise<void> {
  const accountId = need('ZOHO_ACCOUNT_ID');
  const fromBare = Deno.env.get('ZOHO_FROM') || 'care@arenode.com';
  const fromAddress = fromName ? `${fromName} <${fromBare}>` : fromBare;

  async function attempt(token: string) {
    const r = await fetch(`${ZOHO_MAIL_BASE}/${accountId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Zoho-oauthtoken ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ fromAddress, toAddress: to, subject, content: html, mailFormat: 'html' }),
    });
    const data = await r.json().catch(() => ({}));
    return { httpStatus: r.status, zohoCode: data?.status?.code, desc: data?.status?.description };
  }

  let token = await getZohoAccessToken();
  let res = await attempt(token);
  if (res.httpStatus === 401) {
    token = await getZohoAccessToken(true);
    res = await attempt(token);
  }

  // Zoho answers HTTP 200 with a failure code IN THE BODY on a rejected
  // send — trusting the status line alone would report success for mail
  // that was never accepted.
  const ok = res.httpStatus === 200 && res.zohoCode === 200;
  if (!ok) {
    throw new Error(`Zoho send failed: HTTP ${res.httpStatus} code ${res.zohoCode} ${res.desc || ''}`);
  }
}

// ── What an email says (server/email/templates.js, the 4 reachable kinds) ──

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function istTime(): string {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  }).format(new Date());
}
function credits(n: unknown): string { return new Intl.NumberFormat('en-IN').format(Number(n ?? 0)); }
function rupees(n: unknown): string { return `₹${new Intl.NumberFormat('en-IN').format(Number(n ?? 0))}`; }

const SHELL = (inner: string) =>
  `<div style="font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:14px;line-height:1.55;color:#1f2937;max-width:560px">${inner}</div>`;

function facts(rows: [string, unknown][]): string {
  const cells = rows
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(([label, value]) =>
      `<tr><td style="padding:5px 14px 5px 0;color:#6b7280;white-space:nowrap;vertical-align:top">${esc(label)}</td>` +
      `<td style="padding:5px 0;color:#111827;font-weight:600">${esc(value)}</td></tr>`)
    .join('');
  return `<table style="border-collapse:collapse;margin:10px 0 14px">${cells}</table>`;
}
function subjectBand({ who, sub, ref, tone = '#1268e8', soft = '#eef4fe' }: {
  who: string; sub?: string; ref?: string | null; tone?: string; soft?: string;
}): string {
  return (
    `<table style="border-collapse:separate;width:100%;background:${esc(soft)};border-radius:10px;margin:0 0 14px"><tr>` +
    `<td style="padding:12px 14px"><div style="font-size:16px;font-weight:700;color:#111827;line-height:1.3">${esc(who)}</div>` +
    (sub ? `<div style="font-size:13px;color:#4b5563;margin-top:2px">${esc(sub)}</div>` : '') + `</td>` +
    (ref
      ? `<td align="right" style="padding:12px 14px;white-space:nowrap;vertical-align:top">` +
        `<div style="font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#9ca3af">Reference</div>` +
        `<div style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:14px;font-weight:700;color:${esc(tone)};margin-top:2px">${esc(ref)}</div></td>`
      : '') + `</tr></table>`
  );
}
function headlineFigure(value: string, label: string, tone = '#1268e8'): string {
  return `<div style="margin:0 0 14px"><div style="font-size:28px;font-weight:800;color:${esc(tone)};line-height:1.1">${esc(value)}</div>` +
    `<div style="font-size:12px;color:#6b7280;margin-top:2px">${esc(label)}</div></div>`;
}
function heading(text: string, tone = '#1268e8'): string {
  return `<p style="margin:0 0 4px;font-size:15px;font-weight:700;color:${esc(tone)}">${esc(text)}</p>`;
}
function footerNote(note: string): string {
  return `<p style="margin:14px 0 0;padding-top:10px;border-top:1px solid #e5e7eb;font-size:12px;color:#9ca3af">${esc(note)}</p>`;
}

type Ctx = Record<string, unknown>;

const TEMPLATES: Record<string, (ctx: Ctx) => { subject: string; html: string }> = {
  recharge_request(ctx) {
    return {
      subject: `AREN — Credit Recharge Request — ${ctx.doctorName} (${ctx.reference || 'new'})`,
      html: SHELL(
        heading('Credit recharge request') +
        subjectBand({ who: String(ctx.doctorName), sub: String(ctx.clinicName), ref: ctx.reference as string | null }) +
        headlineFigure(`${credits(ctx.credits)} credits · ${rupees(ctx.amount)}`, ctx.packageLabel ? `Package: ${ctx.packageLabel}` : 'Requested') +
        facts([['Balance when asked', `${credits(ctx.balance)} credits`], ['Requested at', istTime()], ['Doctor note', ctx.note as string]]) +
        `<p style="margin:0;color:#374151">Verify the payment, then approve the request — approval is what actually adds the credits.</p>` +
        footerNote('Nothing has been credited yet. If nobody actions this within 3 hours the doctor can withdraw it themselves and raise a fresh one.')
      ),
    };
  },
  recharge_cancelled(ctx) {
    return {
      subject: `AREN — Recharge Request Withdrawn — ${ctx.doctorName} (${ctx.reference || ''})`,
      html: SHELL(
        heading('Recharge request withdrawn', '#b45309') +
        subjectBand({ who: String(ctx.doctorName), sub: String(ctx.clinicName), ref: ctx.reference as string | null, tone: '#b45309', soft: '#fef6e7' }) +
        facts([
          ['Had asked for', `${credits(ctx.credits)} credits · ${rupees(ctx.amount)}`],
          ['Waited', ctx.waited as string], ['Balance now', `${credits(ctx.balance)} credits`], ['Withdrawn at', istTime()],
        ]) +
        `<p style="margin:0;color:#374151">They waited three hours without hearing back and withdrew it. They can raise a fresh request immediately — if one has already arrived, action that one instead.</p>` +
        footerNote('Nothing was charged and no credits moved.')
      ),
    };
  },
  low_credit(ctx) {
    return {
      subject: `AREN — Low Messaging Credits — ${ctx.doctorName}`,
      html: SHELL(
        heading('Low messaging credits', '#b45309') +
        facts([
          ['Doctor', ctx.doctorName as string], ['Clinic', ctx.clinicName as string],
          ['Remaining credits', credits(ctx.balance)], ['Sent so far', `${credits(ctx.spent)} messages`], ['Time', istTime()],
        ]) +
        `<p style="margin:0;color:#374151">Recharge may be required. They can still send until the balance reaches zero.</p>`
      ),
    };
  },
  /**
   * Rewritten 2026-09-11, when Help & Support stopped being two `mailto:`
   * cards and became a real form (features/support/SupportPage.tsx).
   *
   * The old version was three facts and a paragraph, which was right for what
   * it received. This one is built to be ACTIONED FROM THE MAILBOX: the
   * subject line alone says who and what, the doctor's own words come first
   * at full size (they are the message — everything else is metadata about
   * it), then the triage areas, then the browser/session facts as a quiet
   * table nobody has to read unless the words above it were not enough.
   *
   * `replyTo` is rendered as a mailto: link rather than set as a real
   * Reply-To header: the send goes out on AREN's own Zoho mailbox, and a
   * header claiming a doctor-supplied address would be a spoofable field on
   * outbound mail AREN owns. One click either way; no forged header.
   */
  support_request(ctx) {
    const areas = Array.isArray(ctx.areas) ? (ctx.areas as string[]) : [];
    const words = String(ctx.message ?? '').trim();
    const diag = (ctx.diagnostics && typeof ctx.diagnostics === 'object')
      ? (ctx.diagnostics as Record<string, unknown>)
      : {};

    return {
      subject: `AREN Support ${ctx.requestRef ? `[${ctx.requestRef}] ` : ''}\u2014 ${ctx.topic || 'Request'} \u2014 ${ctx.doctorName} (${ctx.clinicName})`,
      html: SHELL(
        heading('Support request') +
        subjectBand({
          who: String(ctx.doctorName),
          sub: `${ctx.clinicName}${ctx.topic ? ` \u00b7 ${ctx.topic}` : ''}`,
          ref: (ctx.requestRef as string | null) ?? null,
        }) +
        (words
          ? `<div style="margin:0 0 14px;padding:14px 16px;background:#f9fafb;border-left:3px solid #1268e8;border-radius:0 8px 8px 0;` +
            `font-size:15px;line-height:1.6;color:#111827;white-space:pre-wrap">${esc(words)}</div>`
          : `<p style="margin:0 0 14px;color:#6b7280;font-style:italic">No message \u2014 the topic above is the whole request.</p>`) +
        (areas.length
          ? `<p style="margin:0 0 4px;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#9ca3af">Affected</p>` +
            `<p style="margin:0 0 14px;color:#374151;font-weight:600">${areas.map((a) => esc(a)).join(' &middot; ')}</p>`
          : '') +
        // The reply address is the one ACTIONABLE thing in the mail, so it
        // gets its own line and a real mailto: link. It cannot go through
        // `facts()` \u2014 that helper escapes every value, which is exactly what
        // you want for the diagnostics below and exactly what would print an
        // anchor tag as literal text here.
        (ctx.replyTo
          ? `<p style="margin:0 0 14px;font-size:14px;color:#374151">Reply to ` +
            `<a href="mailto:${esc(ctx.replyTo)}" style="color:#1268e8;font-weight:700">${esc(ctx.replyTo)}</a></p>`
          : `<p style="margin:0 0 14px;font-size:14px;color:#6b7280">No reply address given \u2014 reply via the clinic record.</p>`) +
        // Everything below is for whoever picks this up, in the order they
        // need it: when, who to look up in the database, what the wallet says
        // (half of "my messages are failing" is an empty one), then the
        // browser facts the doctor should never have had to type.
        facts([
          ['Sent', istTime()],
          ['Message credits', ctx.doctorId ? `${credits(ctx.balance)} left \u00b7 ${credits(ctx.spent)} sent` : null],
          ['Doctor id', ctx.doctorId as string],
          ['Clinic id', ctx.hospitalId as string],
          ...Object.entries(diag).map(([k, v]) => [k, v] as [string, unknown]),
        ]) +
        footerNote(
          (ctx.requestRef
            ? `Logged as ${ctx.requestRef} in support_requests \u2014 that row is the record, this email is only the notification. `
            : 'NOT logged to support_requests \u2014 the row failed to write, so this email is the only copy. ') +
          'The doctor and clinic above were resolved from their signed-in session, not typed in.'
        )
      ),
    };
  },
};

// ── When one is sent (server/email/notify.js, the reachable subset) ────────

const FROM_NAME = 'AREN Cortex';

async function resolveDoctor(adminClient: ReturnType<typeof createClient>, doctorId: string | null) {
  if (!doctorId) return { doctorName: 'Unknown doctor', clinicName: 'Unknown clinic', hospitalId: null as string | null };
  const { data } = await adminClient.from('doctors').select('id, name, hospital_id, hospitals(name)').eq('id', doctorId).maybeSingle();
  const hospitals = data?.hospitals as { name?: string } | { name?: string }[] | null;
  const clinicName = Array.isArray(hospitals) ? hospitals[0]?.name : hospitals?.name;
  return { doctorName: data?.name || 'Unknown doctor', hospitalId: data?.hospital_id || null, clinicName: clinicName || 'Unknown clinic' };
}
async function resolveClinic(adminClient: ReturnType<typeof createClient>, hospitalId: string | null) {
  if (!hospitalId) return { clinicName: 'Unknown clinic' };
  const { data } = await adminClient.from('hospitals').select('name').eq('id', hospitalId).maybeSingle();
  return { clinicName: data?.name || 'Unknown clinic' };
}
async function resolveBalance(adminClient: ReturnType<typeof createClient>, doctorId: string | null) {
  if (!doctorId) return { balance: 0, spent: 0 };
  const { data } = await adminClient.from('messaging_credit_balances').select('balance, spent').eq('doctor_id', doctorId).maybeSingle();
  return { balance: Number(data?.balance ?? 0), spent: Number(data?.spent ?? 0) };
}

async function buildContext(adminClient: ReturnType<typeof createClient>, kind: string, payload: Ctx): Promise<Ctx> {
  const ctx: Ctx = { ...payload };

  if (payload.doctorId) {
    Object.assign(ctx, await resolveDoctor(adminClient, payload.doctorId as string));
    Object.assign(ctx, await resolveBalance(adminClient, payload.doctorId as string));
  } else if (payload.hospitalId) {
    Object.assign(ctx, await resolveClinic(adminClient, payload.hospitalId as string));
  }

  if ((kind === 'recharge_request' || kind === 'recharge_cancelled') && payload.requestId) {
    const { data } = await adminClient
      .from('credit_recharge_requests')
      .select('id, doctor_id, hospital_id, package_label, credits, amount, balance_at_request, note, created_at')
      .eq('id', payload.requestId as number)
      .maybeSingle();
    if (data) {
      if (!payload.doctorId) Object.assign(ctx, await resolveDoctor(adminClient, data.doctor_id));
      Object.assign(ctx, {
        reference: `RC_${data.id}`, packageLabel: data.package_label, credits: data.credits, amount: data.amount,
        balance: data.balance_at_request, note: data.note, doctorId: data.doctor_id, hospitalId: data.hospital_id,
      });
      if (kind === 'recharge_cancelled' && data.created_at) {
        const mins = Math.round((Date.now() - new Date(data.created_at).getTime()) / 60000);
        ctx.waited = mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`;
        if (payload.doctorId) Object.assign(ctx, await resolveBalance(adminClient, payload.doctorId as string));
      }
    }
  }

  ctx.doctorName ??= 'Unknown doctor';
  ctx.clinicName ??= 'Unknown clinic';
  return ctx;
}

async function record(adminClient: ReturnType<typeof createClient>, args: {
  kind: string; to: string; subject: string; status: 'sent' | 'failed'; error?: string; ctx: Ctx;
}) {
  try {
    await adminClient.from('support_email_log').insert({
      kind: args.kind, to_address: args.to, subject: args.subject, status: args.status,
      error_detail: args.error ?? null,
      hospital_id: args.ctx.hospitalId ?? null, doctor_id: args.ctx.doctorId ?? null,
      context: {
        reference: args.ctx.reference ?? null, balance: args.ctx.balance ?? null,
        credits: args.ctx.credits ?? null, reason: args.ctx.reason ?? null,
      },
    });
  } catch (e) {
    console.error('[support-notify] could not record send (non-fatal):', e instanceof Error ? e.message : e);
  }
}

/** Mark on the request row whether its notification actually went out. */
async function stampRequest(
  adminClient: ReturnType<typeof createClient>,
  id: number | null,
  status: 'sent' | 'failed',
  error: string | null,
) {
  if (id === null) return;
  try {
    await adminClient.from('support_requests')
      .update({ email_status: status, email_error: error })
      .eq('id', id);
  } catch (e) {
    console.error('[support-notify] could not stamp request (non-fatal):', e instanceof Error ? e.message : e);
  }
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return jsonResponse({ ok: false, error: 'not_authenticated', message: 'Sign in again to continue.' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const callerClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await callerClient.auth.getUser();
    if (userErr || !userData?.user) {
      return jsonResponse({ ok: false, error: 'not_authenticated', message: 'Sign in again to continue.' }, 401);
    }

    // Resolved through RLS as the caller themselves, same authorization
    // shape as `admin-staff` — this IS the check, not a formality before
    // one. A doctor row is optional (reception/admin accounts have none
    // and can still file a support request).
    const { data: me } = await callerClient.from('users').select('hospital_id, is_active').eq('id', userData.user.id).maybeSingle();
    if (!me || !me.is_active) {
      return jsonResponse({ ok: false, error: 'not_authenticated', message: 'Your account could not be verified.' }, 401);
    }
    const { data: doctorRow } = await callerClient.from('doctors').select('id').eq('user_id', userData.user.id).maybeSingle();

    const body = await req.json().catch(() => ({}));
    const kind = String(body?.kind || '');
    if (!TEMPLATES[kind]) {
      return jsonResponse({ ok: false, error: 'bad_kind', message: 'Unknown notification.' }, 400);
    }

    const adminClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // Ids come from the verified session, never the request body — an
    // alert can only ever be about the caller's own clinic and their own
    // wallet, same rule the Express route enforced.
    const payload: Ctx = { ...body, kind: undefined, doctorId: doctorRow?.id ?? null, hospitalId: me.hospital_id };

    let ctx: Ctx;
    try {
      ctx = await buildContext(adminClient, kind, payload);
    } catch (e) {
      console.error(`[support-notify] context build failed for ${kind}:`, e instanceof Error ? e.message : e);
      ctx = { ...payload, doctorName: 'Unknown doctor', clinicName: 'Unknown clinic' };
    }

    // ── The record, written BEFORE the notification ───────────────────────
    //
    // Order matters and is the whole point of the table. `support_requests`
    // is the record of what a doctor asked; the email is how AREN finds out
    // about it. Writing the row first means a Zoho outage costs the
    // notification and never the request — the support dashboard still has
    // it, and it can be chased. The other order would quietly put the mailbox
    // back in charge of the truth.
    //
    // A failure here is logged and does NOT abort: an email with no row is
    // worse than nothing, but much better than a doctor being told their
    // request failed when we could still tell somebody.
    let requestRowId: number | null = null;
    if (kind === 'support_request') {
      try {
        const { data, error } = await adminClient
          .from('support_requests')
          .insert({
            hospital_id: me.hospital_id,
            doctor_id: doctorRow?.id ?? null,
            user_id: userData.user.id,
            topic: String(body?.topic ?? 'Request').slice(0, 200),
            areas: Array.isArray(body?.areas) ? (body.areas as string[]).slice(0, 20).map((a) => String(a).slice(0, 120)) : [],
            // Capped, not because anyone will legitimately write this much,
            // but because nothing else caps it.
            message: body?.message ? String(body.message).slice(0, 8000) : null,
            reply_to: body?.replyTo ? String(body.replyTo).slice(0, 320) : null,
            diagnostics: (body?.diagnostics && typeof body.diagnostics === 'object') ? body.diagnostics : {},
          })
          .select('id')
          .single();
        if (error) throw error;
        requestRowId = data.id as number;
        ctx.requestRef = `SR_${requestRowId}`;
      } catch (e) {
        console.error('[support-notify] could not record support_request:', e instanceof Error ? e.message : e);
      }
    }

    // AREN's own mailbox, and ONLY AREN's own mailbox.
    //
    // This used to read `(body?.to as string) || …`, inherited from the
    // Express route it was ported from. Any signed-in user could therefore
    // hand it a recipient, which made AREN's authenticated Zoho account able
    // to send attacker-chosen HTML to an attacker-chosen address over AREN's
    // own domain and reputation. Nothing in the product ever passed it.
    // Removed 2026-09-11.
    const to = Deno.env.get('SUPPORT_NOTIFY_EMAIL') || 'support@arenode.com';

    // Same rule as the original: a caller's own action (filing a recharge
    // request, say) already succeeded before this ever runs, so a failed
    // or unconfigured email is never reported back to them as failure —
    // it is AREN's own problem to notice in `support_email_log`.
    if (!emailConfigured()) {
      console.warn(`[support-notify] Zoho not configured — would have sent to ${to}: ${subject}`);
      return jsonResponse({ ok: true, skipped: 'not_configured' });
    }

    try {
      await sendZohoMail({ to, subject, html, fromName: FROM_NAME });
      await record(adminClient, { kind, to, subject, status: 'sent', ctx });
      await stampRequest(adminClient, requestRowId, 'sent', null);
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      console.error(`[support-notify] send failed for ${kind}:`, detail);
      await record(adminClient, { kind, to, subject, status: 'failed', error: detail, ctx });
      // The request itself is still filed and still answerable — the row says
      // so, rather than leaving a support team to wonder whether the doctor
      // was ever told anything.
      await stampRequest(adminClient, requestRowId, 'failed', detail);
    }

    // Always ok for the CALLER's purposes — but the reference goes back, so
    // a page that wants to show "we've logged this as SR_41" can.
    return jsonResponse({ ok: true, reference: requestRowId ? `SR_${requestRowId}` : null });
  } catch (err) {
    console.error('[support-notify]', err);
    return jsonResponse({ ok: false, error: 'server_error', message: err instanceof Error ? err.message : 'Something went wrong.' }, 500);
  }
});
