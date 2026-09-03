// ---------------------------------------------------------------------------
// WHATSAPP CLOUD API — SENDING
//
// One function you'll actually call: sendPrescriptionTemplate(). Everything
// else in this file is it figuring out the right HTTP call to the Graph API.
//
// Needs, in server/.env (from Meta dashboard -> WhatsApp -> API Setup):
//   WHATSAPP_PHONE_NUMBER_ID  — the number you're sending FROM
//   WHATSAPP_ACCESS_TOKEN     — starts as a 24h temporary token; swap for a
//                               permanent System User token before this
//                               needs to run unattended for more than a day
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

const GRAPH_VERSION = "v21.0";

/**
 * Logs an outbound send to `whatsapp_messages` so the status webhook
 * (delivered/read/failed) has a row to update by `wa_message_id`.
 * Non-fatal: a message that sent successfully must never read as failed
 * because its OWN log row didn't write.
 */
async function logOutbound({ to, waMessageId, messageType, templateName, preview, patientId, prescriptionId }) {
    try {
        await getSupabase().from("whatsapp_messages").insert({
            direction: "outbound",
            phone: to,
            patient_id: patientId ?? null,
            prescription_id: prescriptionId ?? null,
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

async function callGraphApi(body) {
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    if (!phoneNumberId || !accessToken) {
        throw new Error(
            "WHATSAPP_PHONE_NUMBER_ID / WHATSAPP_ACCESS_TOKEN not set — check server/.env"
        );
    }

    const url = `https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`;
    const res = await fetch(url, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
    });

    const data = await res.json().catch(() => null);
    if (!res.ok) {
        // Meta's error body is where the actually-useful message lives
        // ("re-engagement window expired", "template not approved", a typo'd
        // phone number) — surface it instead of a bare HTTP status.
        const detail = data?.error?.message || res.statusText;
        throw new Error(`WhatsApp send failed (${res.status}): ${detail}`);
    }
    // { messaging_product, contacts: [{ input, wa_id }], messages: [{ id }] }
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
    await logOutbound({ to, waMessageId, messageType: "text", preview: text, patientId: opts.patientId });
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
    });
    return { waMessageId };
}

/**
 * A prescription as a template message whose header is a document (PDF).
 * The PDF must already be at a public HTTPS URL (Meta fetches it from
 * there). Assumes a template shaped like: header = document, body = "Hi
 * {{1}}, your prescription from {{2}} is attached." — adjust the
 * `components` array once you know your actual approved template's shape.
 * @param {string} to
 * @param {string} templateName
 * @param {string} pdfUrl
 * @param {string} patientName
 * @param {string} clinicName
 * @param {{patientId?: string, prescriptionId?: string}} [opts]
 */
export async function sendPrescriptionTemplate(to, templateName, pdfUrl, patientName, clinicName, opts = {}) {
    return sendTemplateMessage(to, templateName, "en_US", [
        {
            type: "header",
            parameters: [{ type: "document", document: { link: pdfUrl, filename: "prescription.pdf" } }],
        },
        {
            type: "body",
            parameters: [
                { type: "text", text: patientName },
                { type: "text", text: clinicName },
            ],
        },
    ], opts);
}
