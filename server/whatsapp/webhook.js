// ---------------------------------------------------------------------------
// WHATSAPP CLOUD API — WEBHOOK
//
// Mounted once, in server/index.js:
//
//   mountWhatsAppWebhook(app);
//
// It adds exactly one route, at whatever path you pass (default
// "/webhooks/whatsapp"), handling BOTH methods Meta uses against it:
//
//   GET  — the one-time ownership check Meta does when you paste the
//          Callback URL into the dashboard. It sends hub.mode,
//          hub.verify_token, hub.challenge as query params; you check the
//          token and echo the challenge back as plain text.
//   POST — every real event after that: an incoming patient message, or a
//          delivery-status update (sent/delivered/read/failed) for a
//          message you sent. Every POST is checked against Meta's
//          signature before anything in the body is trusted.
//
// Needs, in server/.env:
//   WHATSAPP_VERIFY_TOKEN  — a string you invent yourself
//   WHATSAPP_APP_SECRET    — from Meta App Dashboard -> App Settings ->
//                            Basic -> App Secret. Verifies the
//                            X-Hub-Signature-256 header on every POST, so a
//                            stranger can't post fake "messages" at this
//                            URL and have your app believe they're real.
//                            Optional but strongly recommended — if it's
//                            not set, signature checking is skipped (logged
//                            once as a warning) rather than blocking you
//                            tonight while you're still getting the basic
//                            flow working.
// ---------------------------------------------------------------------------

import crypto from "node:crypto";
import express from "express";
import { getSupabase } from "./supabaseClient.js";
import { resolveIdentity } from "./routing.js";
import { handleInboundMessage } from "./booking.js";

/**
 * Verifies Meta's X-Hub-Signature-256 header against the raw request body.
 * Meta signs the exact bytes it sent — HMAC-SHA256, keyed on your App
 * Secret — so this MUST run against the raw, unparsed body, not the
 * already-JSON-parsed object (re-serializing JSON can produce different
 * bytes and fail a signature that was actually valid).
 */
function verifySignature(rawBody, header, appSecret) {
    if (!header) return false;
    const expected =
        "sha256=" +
        crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");
    const a = Buffer.from(header);
    const b = Buffer.from(expected);
    // timingSafeEqual needs equal-length buffers, and throws otherwise —
    // guard the length first so a malformed header can't crash the request.
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * @param {import('express').Express} app
 * @param {object} [opts]
 * @param {string} [opts.path]              route path, default "/webhooks/whatsapp"
 * @param {(event: object) => void} [opts.onEvent]
 *        Called once per parsed event — see parseWebhookPayload's shape
 *        below. This is the ONE seam to wire something MORE than the
 *        default (log + match patient by phone) into — triggering a reply,
 *        flagging an unread message on a dashboard, etc.
 */
export function mountWhatsAppWebhook(app, opts = {}) {
    const path = opts.path || "/webhooks/whatsapp";
    const onEvent = opts.onEvent || defaultOnEvent;
    const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;
    const appSecret = process.env.WHATSAPP_APP_SECRET;

    if (!verifyToken) {
        // Fatal, not a warning: without this, the GET handler below can
        // never succeed, and Meta will refuse to save the Callback URL.
        throw new Error(
            "WHATSAPP_VERIFY_TOKEN is not set. Add it to server/.env before starting the server."
        );
    }
    if (!appSecret) {
        console.warn(
            "[whatsapp] WHATSAPP_APP_SECRET is not set — incoming POSTs are NOT " +
            "signature-checked. Fine for tonight's local testing; set this before " +
            "this endpoint is reachable from the real internet for real."
        );
    }

    const router = express.Router();

    // GET — Meta's one-time verification. Query params arrive with dots in
    // their names, which is why they're read via bracket notation rather
    // than destructuring.
    router.get(path, (req, res) => {
        const mode = req.query["hub.mode"];
        const token = req.query["hub.verify_token"];
        const challenge = req.query["hub.challenge"];

        if (mode === "subscribe" && token === verifyToken) {
            console.log("[whatsapp] webhook verified by Meta");
            res.status(200).type("text/plain").send(challenge);
        } else {
            console.warn("[whatsapp] verification failed — mode or token mismatch", {
                mode,
                tokenMatched: token === verifyToken,
            });
            res.sendStatus(403);
        }
    });

    // POST — real events. `express.raw` here (not express.json on the whole
    // app) so this ONE route gets the exact raw bytes needed for the
    // signature check; it's parsed to JSON by hand right after.
    router.post(path, express.raw({ type: "application/json" }), (req, res) => {
        const rawBody = req.body; // a Buffer, thanks to express.raw above

        if (appSecret && !verifySignature(rawBody, req.get("x-hub-signature-256"), appSecret)) {
            console.warn("[whatsapp] signature check failed — rejecting POST");
            return res.sendStatus(401);
        }

        let payload;
        try {
            payload = JSON.parse(rawBody.toString("utf8"));
        } catch (e) {
            console.warn("[whatsapp] POST body was not valid JSON:", e.message);
            return res.sendStatus(400);
        }

        // Always ack fast. Meta retries a webhook that doesn't return 200
        // within a few seconds, and a retry storm from a slow downstream
        // call (a DB write, a lookup) is a worse failure than processing
        // slightly after acking.
        res.sendStatus(200);

        for (const event of parseWebhookPayload(payload)) {
            // Fire-and-forget: onEvent (default or custom) is expected to
            // catch its own errors — see defaultOnEvent below. Already
            // acked, so there is nothing left here to fail loudly to.
            Promise.resolve(onEvent(event)).catch((e) =>
                console.error("[whatsapp] onEvent rejected:", e)
            );
        }
    });

    app.use(router);
    console.log(`[whatsapp] webhook mounted at ${path}`);
}

/**
 * Meta's webhook payload nests an object graph
 * (entry[].changes[].value.{messages[],statuses[]}) instead of one event —
 * a single POST can legitimately carry several. This flattens it to one
 * shape per event:
 *
 *   { type: "message", phoneNumberId, from, text, waMessageId, raw }
 *   { type: "status",  phoneNumberId, from, status, statusForMessageId, raw }
 *
 * `from` is the patient's phone number, E.164 without "+" — match it against
 * your patients table (after stripCountryCode). `statusForMessageId` is
 * which of YOUR sent messages a status update is about — match it against
 * the wa_message_id you stored when you called sendWhatsAppMessage().
 */
/**
 * A tapped button's id, across the three shapes Meta uses for what a patient
 * experiences as the same gesture:
 *
 *   interactive.button_reply — a button on a normal interactive message
 *   interactive.list_reply   — a row picked from a list message
 *   button.payload           — a quick-reply button on a TEMPLATE message.
 *                              Different shape entirely, and the one that
 *                              matters most: it's how a patient replies to
 *                              the prescription we sent them, which is the
 *                              first tap in the whole booking flow.
 *
 * Returns null for a plain text message, which is the signal to fall back to
 * keyword matching.
 */
function readButtonId(msg) {
    return (
        msg.interactive?.button_reply?.id ??
        msg.interactive?.list_reply?.id ??
        msg.button?.payload ??
        null
    );
}

/**
 * Human-readable text for the log, whatever the message type. A button tap
 * has no `text.body`, but it does have a title the patient actually saw —
 * logging that keeps the inbox readable as a conversation instead of showing
 * blanks wherever someone tapped rather than typed.
 */
function readMessageText(msg) {
    return (
        msg.text?.body ??
        msg.interactive?.button_reply?.title ??
        msg.interactive?.list_reply?.title ??
        msg.button?.text ??
        null
    );
}

export function parseWebhookPayload(payload) {
    const events = [];
    for (const entry of payload.entry || []) {
        for (const change of entry.changes || []) {
            const value = change.value || {};
            const phoneNumberId = value.metadata?.phone_number_id;

            for (const msg of value.messages || []) {
                events.push({
                    type: "message",
                    phoneNumberId,
                    from: msg.from,
                    text: readMessageText(msg),
                    buttonId: readButtonId(msg),
                    messageType: msg.type,
                    waMessageId: msg.id,
                    raw: msg,
                });
            }

            for (const status of value.statuses || []) {
                events.push({
                    type: "status",
                    phoneNumberId,
                    from: status.recipient_id,
                    status: status.status,
                    statusForMessageId: status.id,
                    raw: status,
                });
            }
        }
    }
    return events;
}

/**
 * Writes every event to `whatsapp_messages` (already created in Supabase)
 * and matches an incoming message's `from` against `patients.phone`. Real,
 * working default behaviour — pass your own `onEvent` to
 * `mountWhatsAppWebhook` only if you want to do something MORE than log +
 * match.
 *
 * Non-fatal by design: a failed log write must never take down webhook
 * processing, and the response to Meta has already been sent by the time
 * this runs — there is nothing left to fail loudly to.
 */
async function defaultOnEvent(event) {
    try {
        const supabase = getSupabase();

        if (event.type === "message") {
            // Run the conversation first: it resolves WHICH CLINIC this
            // message belongs to, including the cases only it can settle —
            // a patient who just tapped a clinic button, or one we asked
            // earlier and whose answer is held in conversation state.
            let resolved = { hospitalId: null, patientId: null };
            try {
                resolved = await handleInboundMessage({
                    phone: event.from,
                    text: event.text,
                    buttonId: event.buttonId,
                });
            } catch (e) {
                console.error("[whatsapp] conversation flow failed:", e.message);
                // The flow failing must not cost us the message. Fall back to
                // a plain identity lookup so the row is still attributable to
                // a clinic and shows up in that clinic's inbox.
                try {
                    const identity = await resolveIdentity(event.from);
                    resolved = { hospitalId: identity.hospitalId, patientId: identity.patientId };
                } catch { /* leave unattributed rather than lose the log */ }
            }

            await supabase.from("whatsapp_messages").insert({
                direction: "inbound",
                phone: event.from,
                patient_id: resolved.patientId,
                hospital_id: resolved.hospitalId,
                wa_message_id: event.waMessageId,
                message_type: event.messageType || "text",
                body_preview: (event.text || "").slice(0, 200),
                status: "received",
            });

            if (!resolved.patientId) {
                console.warn(`[whatsapp] inbound message from ${event.from} matched no patient`);
            }
        } else if (event.type === "status") {
            const { error, count } = await supabase
                .from("whatsapp_messages")
                .update({ status: event.status, updated_at: new Date().toISOString() }, { count: "exact" })
                .eq("wa_message_id", event.statusForMessageId);
            if (error || !count) {
                console.warn("[whatsapp] status update had no matching row:", event.statusForMessageId);
            }
        }
    } catch (e) {
        console.error("[whatsapp] defaultOnEvent failed (non-fatal):", e.message);
    }
}
