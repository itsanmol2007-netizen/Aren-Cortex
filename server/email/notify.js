// ---------------------------------------------------------------------------
// THE EMAIL SERVICE — one door, for every operational event.
//
// Anmol's V1 spec, §6/§7: every request or failure that needs AREN's
// attention goes to support@arenode.com, through ONE service, so that
// changing provider or wording never touches a page.
//
//      anything that happened
//              ↓
//        notify(kind, ids)          ← this file: resolves, records, sends
//              ↓
//        renderEmail(kind, ctx)     ← templates.js: what it says
//              ↓
//        sendZohoMail(...)          ← zoho.js: how it goes
//              ↓
//        support@arenode.com
//
// ── Three rules this file exists to enforce
//
// 1. **A caller passes IDS, never prose.** `notify("low_credit", {doctorId})`,
//    not a subject line. Every call site therefore stays correct when the
//    wording changes, and the wording lives somewhere a non-engineer can be
//    shown.
//
// 2. **Email never fails the thing it is reporting on.** A prescription that
//    reached the patient must not report failure because an SMTP hop was
//    slow, and a recharge request already in the database must not look
//    rejected because Zoho rate-limited us. Every send here is caught, logged
//    to `support_email_log`, and swallowed.
//
// 3. **Every attempt is recorded.** A row in `support_email_log` with
//    status 'failed' is the only way anyone learns the alerting itself broke —
//    which is otherwise indistinguishable from "nothing needed alerting".
// ---------------------------------------------------------------------------

import { getSupabase } from "../whatsapp/supabaseClient.js";
import { emailConfigured, sendZohoMail } from "./zoho.js";
import { renderEmail } from "./templates.js";

/** Where operational mail lands. The spec names support@arenode.com;
 *  overridable so a developer can point it at themselves without editing
 *  code. */
const SUPPORT_INBOX = process.env.SUPPORT_NOTIFY_EMAIL
    || process.env.REQUESTS_NOTIFY_EMAIL
    || "support@arenode.com";

const FROM_NAME = "AREN Cortex";

// ── Context resolution ─────────────────────────────────────────────────────
//
// Callers hand over ids. These read the rows a template needs, and are
// deliberately forgiving: a missing clinic name must degrade to "Unknown
// clinic" rather than losing the alert entirely, because the alert is the
// thing that matters and the name is decoration on it.

async function resolveDoctor(doctorId) {
    if (!doctorId) return { doctorName: "Unknown doctor", clinicName: "Unknown clinic", hospitalId: null };
    const sb = getSupabase();
    const { data } = await sb
        .from("doctors")
        .select("id, name, hospital_id, hospitals(name)")
        .eq("id", doctorId)
        .maybeSingle();
    return {
        doctorName: data?.name || "Unknown doctor",
        hospitalId: data?.hospital_id || null,
        clinicName: data?.hospitals?.name || "Unknown clinic",
    };
}

async function resolveClinic(hospitalId) {
    if (!hospitalId) return { clinicName: "Unknown clinic" };
    const { data } = await getSupabase()
        .from("hospitals").select("name").eq("id", hospitalId).maybeSingle();
    return { clinicName: data?.name || "Unknown clinic" };
}

async function resolveBalance(doctorId) {
    if (!doctorId) return { balance: 0, spent: 0 };
    const { data } = await getSupabase()
        .from("messaging_credit_balances")
        .select("balance, spent")
        .eq("doctor_id", doctorId)
        .maybeSingle();
    return { balance: Number(data?.balance ?? 0), spent: Number(data?.spent ?? 0) };
}

/**
 * Turns the ids a caller had into the fields a template names.
 *
 * One function rather than per-kind resolvers because most kinds need the
 * same three things (who, where, how many credits), and a template that
 * suddenly wants the balance shouldn't need its own plumbing.
 */
async function buildContext(kind, payload) {
    const ctx = { ...payload };

    if (payload.doctorId) {
        Object.assign(ctx, await resolveDoctor(payload.doctorId));
        Object.assign(ctx, await resolveBalance(payload.doctorId));
    } else if (payload.hospitalId) {
        Object.assign(ctx, await resolveClinic(payload.hospitalId));
    }

    // A recharge alert is about a specific request, and the request row is
    // the authority on what was asked for — re-deriving it from a package
    // code would report today's price for a request filed last week.
    if ((kind === "recharge_request" || kind === "recharge_cancelled") && payload.requestId) {
        const { data } = await getSupabase()
            .from("credit_recharge_requests")
            .select("id, doctor_id, hospital_id, package_label, credits, amount, balance_at_request, note, created_at")
            .eq("id", payload.requestId)
            .maybeSingle();
        if (data) {
            if (!payload.doctorId) Object.assign(ctx, await resolveDoctor(data.doctor_id));
            Object.assign(ctx, {
                reference: `RC_${data.id}`,
                packageLabel: data.package_label,
                credits: data.credits,
                amount: data.amount,
                // What it was when they asked, not what it is now. By the
                // time this is read the live balance has moved and the
                // urgency it conveyed would be wrong.
                balance: data.balance_at_request,
                note: data.note,
                doctorId: data.doctor_id,
                hospitalId: data.hospital_id,
            });
            // How long they waited before giving up — the fact that makes a
            // withdrawal readable ("waited 4h 20m" is a missed callback;
            // "waited 3h 1m" is somebody who watched the clock).
            if (kind === "recharge_cancelled" && data.created_at) {
                const mins = Math.round((Date.now() - new Date(data.created_at).getTime()) / 60000);
                ctx.waited = mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`;
                // A withdrawal is about the balance NOW, not the one captured
                // when they asked — they have been sending in the meantime.
                if (payload.doctorId) Object.assign(ctx, await resolveBalance(payload.doctorId));
            }
        }
    }

    // Sensible fallbacks so a template never renders "undefined".
    ctx.doctorName ??= "Unknown doctor";
    ctx.clinicName ??= "Unknown clinic";
    return ctx;
}

// ── The one door ───────────────────────────────────────────────────────────

/**
 * Email AREN about something that happened.
 *
 * NEVER throws. Every caller is in the middle of doing something more
 * important than sending an email — completing a consultation, recording a
 * recharge request — and none of them should have to write a try/catch to
 * stay correct. The return value says what happened for callers who care.
 *
 * @param {"recharge_request"|"low_credit"|"credits_exhausted"|"message_failed"|"provider_error"|"patient_message"|"support_request"} kind
 * @param {Record<string, unknown>} payload  ids and any values the template needs
 * @returns {Promise<{ok: boolean, skipped?: string, error?: string}>}
 */
export async function notify(kind, payload = {}) {
    let ctx;
    try {
        ctx = await buildContext(kind, payload);
    } catch (e) {
        console.error(`[email] could not build context for ${kind}:`, e.message);
        ctx = { ...payload, doctorName: "Unknown doctor", clinicName: "Unknown clinic" };
    }

    let subject = `AREN — ${kind}`;
    let html = "";
    try {
        ({ subject, html } = renderEmail(kind, ctx));
    } catch (e) {
        console.error(`[email] template error for ${kind}:`, e.message);
        return { ok: false, error: `template: ${e.message}` };
    }

    const to = payload.to || SUPPORT_INBOX;

    // No credentials on this machine is a normal developer state, not a
    // failure to shout about. Log what WOULD have been sent so a local run
    // can still be verified end to end.
    if (!emailConfigured()) {
        console.warn(`[email] Zoho not configured — would have sent to ${to}: ${subject}`);
        return { ok: false, skipped: "not_configured" };
    }

    try {
        await sendZohoMail({ to, subject, html, fromName: FROM_NAME });
        await record({ kind, to, subject, status: "sent", ctx });
        return { ok: true };
    } catch (e) {
        console.error(`[email] send failed for ${kind}:`, e.message);
        await record({ kind, to, subject, status: "failed", error: e.message, ctx });
        return { ok: false, error: e.message };
    }
}

/** The durable record. Itself non-fatal — losing the log row must not turn a
 *  delivered email into a reported failure. */
async function record({ kind, to, subject, status, error, ctx }) {
    try {
        await getSupabase().from("support_email_log").insert({
            kind,
            to_address: to,
            subject,
            status,
            error_detail: error ?? null,
            hospital_id: ctx.hospitalId ?? null,
            doctor_id: ctx.doctorId ?? null,
            // The ids, not the rendered HTML: enough to re-send or to answer
            // "what did that email say", without storing a copy of every
            // message body forever.
            context: {
                reference: ctx.reference ?? null,
                balance: ctx.balance ?? null,
                credits: ctx.credits ?? null,
                reason: ctx.reason ?? null,
            },
        });
    } catch (e) {
        console.error("[email] could not record send (non-fatal):", e.message);
    }
}

// ── Credit alerts, de-duplicated ───────────────────────────────────────────

const LOW_CREDIT_THRESHOLD = 100;
/** One low-credit alert per doctor per day. A doctor parked at 73 credits
 *  crosses no threshold, but every send re-evaluates the condition — without
 *  this, support gets one email per message until they recharge. */
const LOW_ALERT_COOLDOWN_MS = 24 * 60 * 60 * 1000;

/**
 * Called after every successful debit. Decides whether AREN needs to know.
 *
 * The threshold check lives here rather than in the send path because
 * "should we email about this" is an alerting question, not a messaging one —
 * and because the cooldown state it needs has nothing to do with sending a
 * WhatsApp message.
 */
export async function maybeAlertLowCredits(doctorId, balance) {
    if (balance > LOW_CREDIT_THRESHOLD) return;

    const sb = getSupabase();
    const { data: state } = await sb
        .from("messaging_alert_state")
        .select("last_low_alert_at, last_zero_alert_at")
        .eq("doctor_id", doctorId)
        .maybeSingle();

    const now = Date.now();
    const exhausted = balance <= 0;

    // Zero is its own event and jumps the cooldown ONCE: a doctor who quietly
    // stops being able to message patients is a different problem from one
    // who is merely running low, and it should not wait out a 24h window that
    // the low-credit alert already started.
    if (exhausted) {
        if (state?.last_zero_alert_at) return;
        await notify("credits_exhausted", { doctorId });
        await sb.from("messaging_alert_state").upsert({
            doctor_id: doctorId,
            last_zero_alert_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        });
        return;
    }

    const last = state?.last_low_alert_at ? new Date(state.last_low_alert_at).getTime() : 0;
    if (now - last < LOW_ALERT_COOLDOWN_MS) return;

    await notify("low_credit", { doctorId });
    await sb.from("messaging_alert_state").upsert({
        doctor_id: doctorId,
        last_low_alert_at: new Date().toISOString(),
        last_low_alert_balance: balance,
        // Cleared so a doctor who recharges and later runs dry again is
        // alerted about it, rather than being permanently marked "already
        // told them once".
        last_zero_alert_at: null,
        updated_at: new Date().toISOString(),
    });
}
