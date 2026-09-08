// ---------------------------------------------------------------------------
// FAST2SMS ADAPTER — WhatsApp through a BSP.
//
// Fast2SMS's WhatsApp API is a straight passthrough of Meta's Cloud API: the
// same request body, the same `{version}/{phone_number_id}/messages` path
// shape, the same `{ messages: [{ id: "wamid..." }] }` response. So this
// adapter IS `meta.js`'s send — `makeCloudApiAdapter` — under a different
// name and a different credential check. The only real divergence (host +
// how the key rides in the Authorization header) lives in client.js's
// `whatsappTransport()`, keyed on FAST2SMS_API_KEY being present.
//
// Needs, in server/.env:
//   FAST2SMS_API_KEY          — the Fast2SMS Dev API key. Its PRESENCE is
//                               what routes sends through Fast2SMS.
//   WHATSAPP_PHONE_NUMBER_ID  — the Phone Number ID from Fast2SMS's
//                               "Get WABA & Template Details" call (NOT a
//                               Meta-app one). `npm run check:whatsapp`
//                               prints it.
//   WHATSAPP_TEMPLATE_*       — the approved template NAMES on the WABA
//                               (same env vars meta.js reads).
//
// Delivery receipts and inbound messages come back through the same webhook
// (server/whatsapp/webhook.js) — configure the Fast2SMS webhook in
// "META DIRECT" format so its payload matches what parseWebhookPayload
// already expects.
// ---------------------------------------------------------------------------

import { makeCloudApiAdapter } from "./meta.js";

export const fast2smsAdapter = makeCloudApiAdapter("fast2sms", () =>
    Boolean(process.env.FAST2SMS_API_KEY && process.env.WHATSAPP_PHONE_NUMBER_ID)
);
