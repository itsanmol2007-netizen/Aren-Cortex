// ---------------------------------------------------------------------------
// WHATSAPP CLOUD API — SENDING
//
// One function you'll actually call: sendPrescriptionTemplate(). Everything
// else in this file is it figuring out the right HTTP call to the Graph API.
//
// Needs, in server/.env — EITHER a direct Meta app:
//   WHATSAPP_PHONE_NUMBER_ID  — the number you're sending FROM
//   WHATSAPP_ACCESS_TOKEN     — starts as a 24h temporary token; swap for a
//                               permanent System User token before this
//                               needs to run unattended for more than a day
//
// OR a BSP (Fast2SMS), whose WhatsApp API is a STRAIGHT PASSTHROUGH of Meta's
// Cloud API — same JSON body, same `{version}/{phone_number_id}/messages`
// path, same `{ messages: [{ id: "wamid..." }] }` response:
//   WHATSAPP_PHONE_NUMBER_ID  — the Phone Number ID Fast2SMS gives you (from
//                               its "Get WABA & Template Details" call)
//   FAST2SMS_API_KEY          — your Fast2SMS Dev API key. Its PRESENCE is
//                               what routes every send below through Fast2SMS
//                               instead of graph.facebook.com. The key rides
//                               raw in the Authorization header (no "Bearer").
//
// The only things that differ between the two are the host and how the key
// sits in the Authorization header — see whatsappTransport(). Everything
// else in this file, and all of providers/meta.js, is shared. There is
// deliberately ONE code path to the API; a second would be a second place
// for a credential change to break.
//
// ── The one thing that will bite you if you don't know it going in ────────
// WhatsApp only allows a free-form text message (like a plain "here's your
// prescription" note) inside a 24-HOUR WINDOW after the PATIENT last
// messaged you. Outside that window — which is the normal case for "clinic
// proactively sends a prescription" — you MUST send an approved TEMPLATE
// message instead. sendPrescriptionTemplate below is that path.
// sendTextMessage is for replying inside an open conversation window.
// ---------------------------------------------------------------------------

import { getSupabase } from "./supabaseClient.js";

/** Default Graph version per transport. Meta's path has been pinned at v21.0
 *  here since this was built; Fast2SMS's docs use v26.0. Either can be
 *  overridden with WHATSAPP_GRAPH_VERSION when a provider moves the goalposts. */
const META_GRAPH_VERSION = "v21.0";
const FAST2SMS_GRAPH_VERSION = "v26.0";

/**
 * Logs an outbound send to `whatsapp_messages` so the status webhook
 * (delivered/read/failed) has a row to update by `wa_message_id`.
 * Non-fatal: a message that sent successfully must never read as failed
 * because its OWN log row didn't write.
 */
async function logOutbound({ to, waMessageId, messageType, templateName, preview, patientId, prescriptionId, hospitalId, skipLog }) {
    // The messaging service (server/messaging/service.js) writes its OWN
    // authoritative row BEFORE the send, because a credit debit has to point
    // at a message id that already exists. When it calls through here, this
    // log would be a duplicate of that row — same message, two entries in the
    // doctor's activity list, and only one of them carrying the purpose and
    // the credit. So it opts out, and owns the row instead.
    if (skipLog) return;
    try {
        await getSupabase().from("whatsapp_messages").insert({
            direction: "outbound",
            phone: to,
            patient_id: patientId ?? null,
            prescription_id: prescriptionId ?? null,
            // Without this the clinic cannot see its own sent messages: the
            // Communication page reads under RLS scoped to hospital_id, so a
            // null here makes an outbound message invisible to the very people
            // who sent it.
            hospital_id: hospitalId ?? null,
            wa_message_id: waMessageId,
            message_type: messageType,
            template_name: templateName ?? null,
            body_preview: (preview || "").slice(0, 200),
            status: "sent",
        });
    } catch (e) {
        console.error("[whatsapp] logOutbound failed (non-fatal):", e.message);
    }
}

/**
 * Which host + auth to use for a send. The PRESENCE of FAST2SMS_API_KEY is
 * the switch: with it, every send goes through Fast2SMS's passthrough of the
 * Cloud API; without it, straight to graph.facebook.com with a Meta token.
 * The request body and the response shape are identical either way, so this
 * is the only place the two providers diverge.
 */
export function whatsappTransport() {
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    if (!phoneNumberId) {
        throw new Error("WHATSAPP_PHONE_NUMBER_ID not set — check server/.env");
    }

    const fast2smsKey = process.env.FAST2SMS_API_KEY;
    if (fast2smsKey) {
        const version = process.env.WHATSAPP_GRAPH_VERSION || FAST2SMS_GRAPH_VERSION;
        return {
            label: "fast2sms",
            url: `https://www.fast2sms.com/dev/whatsapp/${version}/${phoneNumberId}/messages`,
            // Fast2SMS wants the key RAW here — no "Bearer " prefix.
            headers: { Authorization: fast2smsKey, "Content-Type": "application/json" },
        };
    }

    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    if (!accessToken) {
        throw new Error(
            "Neither FAST2SMS_API_KEY nor WHATSAPP_ACCESS_TOKEN is set — check server/.env"
        );
    }
    const version = process.env.WHATSAPP_GRAPH_VERSION || META_GRAPH_VERSION;
    return {
        label: "meta",
        url: `https://graph.facebook.com/${version}/${phoneNumberId}/messages`,
        headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
        },
    };
}

async function callGraphApi(body) {
    const t = whatsappTransport();
    const res = await fetch(t.url, {
        method: "POST",
        headers: t.headers,
        body: JSON.stringify(body),
    });

    const data = await res.json().catch(() => null);
    if (!res.ok) {
        // The provider's error body is where the actually-useful message
        // lives ("re-engagement window expired", "template not approved", a
        // typo'd phone number). Meta nests it under `error.message`; Fast2SMS
        // uses a flat `message`. Surface whichever is there, not a bare HTTP
        // status.
        const detail = data?.error?.message || data?.message || res.statusText;
        throw new Error(`WhatsApp send failed (${res.status}) via ${t.label}: ${detail}`);
    }
    // { messaging_product, contacts: [{ input, wa_id }], messages: [{ id }] }.
    // Fast2SMS can answer 200 with no message id when it rejects a send at its
    // own layer (before Meta) — treat a missing id as the failure it is,
    // rather than letting `undefined` propagate as a message id.
    if (!data?.messages?.[0]?.id) {
        const detail =
            data?.error?.message || data?.message || "provider returned no message id";
        throw new Error(`WhatsApp send failed via ${t.label}: ${detail}`);
    }
    return data;
}

/**
 * A free-form text message. Only deliverable inside 24h of the patient last
 * messaging you — see the file header.
 * @param {string} to    patient's phone number, E.164 without "+"
 * @param {string} text
 * @param {{patientId?: string}} [opts]
 */
export async function sendTextMessage(to, text, opts = {}) {
    const data = await callGraphApi({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: text },
    });
    const waMessageId = data.messages[0].id;
    await logOutbound({
        to, waMessageId, messageType: "text", preview: text,
        patientId: opts.patientId, hospitalId: opts.hospitalId, skipLog: opts.skipLog,
    });
    return { waMessageId };
}

/**
 * A message with up to three tappable reply buttons.
 *
 * This is the backbone of the booking flow. A tap comes back through the
 * webhook as `interactive.button_reply.id` — the EXACT id string sent here —
 * so intent arrives already unambiguous, with no parsing and nothing to
 * misread. That is the whole argument for buttons over free text.
 *
 * Meta's limits, all enforced server-side by them (a violation is a 400, not
 * a truncation): at most 3 buttons, button title <= 20 chars, id <= 256,
 * body <= 1024. Titles are truncated here rather than left to fail the send,
 * because a slightly clipped label is a better outcome than no message.
 *
 * Bound by the same 24-hour window as sendTextMessage — interactive messages
 * are NOT templates. To open a conversation from cold, send an approved
 * template first; buttons work once the patient has replied.
 *
 * @param {string} to  patient's phone, E.164 without "+"
 * @param {string} bodyText
 * @param {Array<{id: string, title: string}>} buttons  max 3
 * @param {{patientId?: string, hospitalId?: string, footer?: string}} [opts]
 */
export async function sendInteractiveButtons(to, bodyText, buttons, opts = {}) {
    if (!buttons.length) throw new Error("sendInteractiveButtons: needs at least one button");
    if (buttons.length > 3) {
        // Silently dropping the 4th would hide a real bug in flow design —
        // if a step needs more than three choices it wants a list message,
        // not a quietly shortened button row.
        throw new Error(`sendInteractiveButtons: WhatsApp allows 3 buttons, got ${buttons.length}`);
    }

    const data = await callGraphApi({
        messaging_product: "whatsapp",
        to,
        type: "interactive",
        interactive: {
            type: "button",
            body: { text: bodyText.slice(0, 1024) },
            ...(opts.footer ? { footer: { text: opts.footer.slice(0, 60) } } : {}),
            action: {
                buttons: buttons.map((b) => ({
                    type: "reply",
                    reply: { id: b.id, title: b.title.slice(0, 20) },
                })),
            },
        },
    });

    const waMessageId = data.messages[0].id;
    await logOutbound({
        to, waMessageId, messageType: "interactive",
        preview: bodyText,
        patientId: opts.patientId, hospitalId: opts.hospitalId, skipLog: opts.skipLog,
    });
    return { waMessageId };
}

/**
 * An approved template message — the one that actually works for "clinic
 * proactively sends a prescription," since it isn't bound by the 24h window.
 * @param {string} to             patient's phone number, E.164 without "+"
 * @param {string} templateName   exact name of the APPROVED template in
 *                                Meta's dashboard (WhatsApp Manager ->
 *                                Message Templates)
 * @param {string} [languageCode] default "en_US" — must match what the
 *                                template was approved in
 * @param {Array<{type: string, parameters: any[]}>} [components]
 *                                fills the template's {{1}}, {{2}}… slots
 * @param {{patientId?: string, prescriptionId?: string}} [opts]
 */
export async function sendTemplateMessage(to, templateName, languageCode = "en_US", components = [], opts = {}) {
    const data = await callGraphApi({
        messaging_product: "whatsapp",
        to,
        type: "template",
        template: {
            name: templateName,
            language: { code: languageCode },
            ...(components.length ? { components } : {}),
        },
    });
    const waMessageId = data.messages[0].id;
    await logOutbound({
        to, waMessageId, messageType: "template", templateName,
        preview: `template:${templateName}`,
        patientId: opts.patientId, prescriptionId: opts.prescriptionId,
        hospitalId: opts.hospitalId, skipLog: opts.skipLog,
    });
    return { waMessageId };
}

/**
 * The "Prescription Ready" template. Shape agreed 2026-09-06 (Anmol):
 *
 *   Header: "Prescription Ready" — STATIC text, no variable, so it carries
 *           no components entry at all (Meta only wants parameters for the
 *           parts of an approved template that are actually dynamic).
 *   Body:   "Hi {{1}}, Your prescription from Dr. {{2}} from {{3}} is ready
 *            to view or download. If you have any questions or need help,
 *            we're just a message away! With care, {{3}} Arenode" —
 *            {{3}} (clinic name) is reused, which WhatsApp templates allow.
 *   Button: "View Prescription" — a dynamic-URL button. Its parameter is the
 *           full `pdfUrl` (already a public HTTPS link — the same one Meta
 *           would otherwise have fetched for a document header), so tapping
 *           it opens that exact prescription preview directly. NOT a
 *           quick-reply: there is nowhere stable to host a follow-up flow
 *           yet (no deployed app, no landing-page sub-URL for previews) —
 *           see docs/context/communication-credits.md's Open section.
 *           Whoever submits this template in Meta Business Manager needs to
 *           register the button as a dynamic URL; if Meta's console insists
 *           on a fixed base URL + short suffix rather than a fully dynamic
 *           link, this is the piece that needs revisiting once prescriptions
 *           have a stable, permanent host.
 *
 * `pdfUrl` must already be a public HTTPS link (unchanged requirement from
 * before this template's header stopped being the document itself).
 *
 * @param {string} to
 * @param {string} templateName
 * @param {string} pdfUrl
 * @param {string} patientName
 * @param {string} doctorName
 * @param {string} clinicName
 * @param {{patientId?: string, prescriptionId?: string, hospitalId?: string, skipLog?: boolean}} [opts]
 */
export async function sendPrescriptionTemplate(to, templateName, pdfUrl, patientName, doctorName, clinicName, opts = {}) {
    return sendTemplateMessage(to, templateName, "en_US", [
        {
            type: "body",
            parameters: [
                { type: "text", text: patientName },
                { type: "text", text: doctorName },
                { type: "text", text: clinicName },
            ],
        },
        {
            type: "button",
            sub_type: "url",
            index: "0",
            // Meta's native form for a dynamic URL-button suffix. Fast2SMS is
            // a passthrough so this should ride straight through, but its own
            // CTA docs show `{ type: "payload", payload: pdfUrl }` — if a real
            // button-template send is ever rejected by Fast2SMS with a
            // component error, that alternate shape is the first thing to try.
            // Untested either way today: the button variant only fires when
            // `documentUrl` is present, and prescriptions have no permanent
            // public host yet (see docs/context/communication-credits.md).
            parameters: [{ type: "text", text: pdfUrl }],
        },
    ], opts);
}
