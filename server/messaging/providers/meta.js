// ---------------------------------------------------------------------------
// META CLOUD API ADAPTER  (and the shared template-send it is built from).
//
// Turns AREN's vocabulary (a purpose, a patient, a clinic) into the Cloud
// API's (a template name, a language code, a component array). This is the
// ONLY file in the messaging path that knows any of those shapes exist.
//
// It deliberately reuses `server/whatsapp/client.js` rather than re-issuing
// its own Graph calls: that file already handles the token, the error body
// the API hides its useful message in, and logging an outbound row for the
// status webhook to update by `wa_message_id`. Two code paths to the same API
// would mean two places for a credential change to break.
//
// ── One send, two providers
//
// Fast2SMS's WhatsApp API is a straight passthrough of this exact wire
// format, so `fast2sms.js` is this same send under a different name and a
// different `configured()` check — `makeCloudApiAdapter` is the seam. The
// host/auth split lives entirely in client.js's whatsappTransport().
//
// ── The 24-hour rule, and why both sends here are templates
//
// The Cloud API only permits a free-form message within 24 hours of the
// PATIENT's last message. A prescription and a follow-up are both AREN
// opening a conversation from cold, so both must be approved templates —
// always, no conditional "text if we can". See docs/whatsapp-two-way.md.
//
// Template names are env-configured because they belong to the WABA, not to
// us: a template re-approved under a new name must be a .env change, not a
// release.
// ---------------------------------------------------------------------------

import { sendTemplateMessage } from "../../whatsapp/client.js";
// sendPrescriptionTemplate (client.js) builds a body+URL-button shape — kept
// there for when a button template is approved, but not used here: the
// current approved template (en_prescription_ready02) has no button.

/** Approved-template names, per purpose. Defaults match what is approved on
 *  AREN's WABA today (2026-09-09); override in server/.env when they change —
 *  they are the WABA's names, not ours. */
function templateFor(purpose) {
    if (purpose === "prescription") {
        return {
            name: process.env.WHATSAPP_TEMPLATE_PRESCRIPTION || "en_prescription_ready02",
            language: process.env.WHATSAPP_TEMPLATE_LANG || "en",
        };
    }
    return {
        name: process.env.WHATSAPP_TEMPLATE_FOLLOW_UP || "aren_follow_up",
        language: process.env.WHATSAPP_TEMPLATE_LANG || "en",
    };
}

/**
 * The component array that fills a template's variables, keyed to the EXACT
 * shape each approved template was registered with. Get this wrong — a body
 * param for a header slot, a full URL where a dynamic button wants only the
 * suffix — and the send is rejected with "number of parameters does not
 * match" or a broken link.
 *
 * ── prescription → `en_prescription_ready02` (approved 2026-09-09, UTILITY,
 *    template_id 1782679709275882, en)
 *   HEADER text — 1 var: patient name
 *   BODY   text — 2 vars: doctor ("Your prescription from …"), clinic
 *          ("With care, …")
 *   FOOTER static
 *   BUTTON "View Your Prescription" — dynamic URL. Its parameter is the
 *          per-prescription value that completes the base URL registered on
 *          the template (base looks like https://www.arenode.com/prescriptions/…).
 *          `message.documentUrl` carries whatever the caller wants appended;
 *          with nothing to append, the button component is omitted (a
 *          structurally different send — see NOTE) so the message still goes.
 *
 * NOTE — Fast2SMS's CTA docs show the URL-button param as
 *   `{ type: "payload", payload: <value> }`, while Meta's native shape is
 *   `{ type: "text", text: <value> }`. Fast2SMS is a passthrough so the Meta
 *   shape SHOULD ride through; WHATSAPP_BUTTON_PARAM_STYLE=payload switches it
 *   if a real send is rejected on the button component.
 *
 * ── follow_up → NO approved template exists yet.
 *   The 3-body-param shape below is the pre-existing guess. Nothing triggers
 *   a follow-up send today; when a real template is approved, match this to
 *   its actual header/body split the same way the prescription case does.
 */
function urlButtonParam(value) {
    return process.env.WHATSAPP_BUTTON_PARAM_STYLE === "payload"
        ? { type: "payload", payload: value }
        : { type: "text", text: value };
}

function buildComponents(message) {
    if (message.purpose === "prescription") {
        const components = [
            {
                type: "header",
                parameters: [{ type: "text", text: message.patientName || "there" }],
            },
            {
                type: "body",
                parameters: [
                    { type: "text", text: message.doctorName || "your doctor" },
                    { type: "text", text: message.clinicName || "your clinic" },
                ],
            },
        ];
        if (message.documentUrl) {
            components.push({
                type: "button",
                sub_type: "url",
                index: "0",
                parameters: [urlButtonParam(message.documentUrl)],
            });
        }
        return components;
    }
    return [
        {
            type: "body",
            parameters: [
                { type: "text", text: message.patientName || "there" },
                { type: "text", text: message.followUpDate || "soon" },
                { type: "text", text: message.clinicName || "your clinic" },
            ],
        },
    ];
}

/**
 * Build a Cloud-API template adapter. `meta.js` and `fast2sms.js` are the
 * same send behind different names and credential checks — the only real
 * difference (host + auth header) is resolved in client.js at call time.
 *
 * @param {string} name             provider name, surfaced on errors and /health
 * @param {() => boolean} configured are this provider's credentials present
 */
export function makeCloudApiAdapter(name, configured) {
    return {
        name,
        configured,

        async send(message) {
            const { name: templateName, language } = templateFor(message.purpose);

            try {
                const { waMessageId } = await sendTemplateMessage(
                    message.to,
                    templateName,
                    language,
                    buildComponents(message),
                    { patientId: message.patientId, prescriptionId: message.prescriptionId, hospitalId: message.hospitalId, skipLog: true }
                );
                return { providerMessageId: waMessageId, status: "sent" };
            } catch (e) {
                // The provider's own words, carried through untouched. The
                // service turns this into a refund and decides whether it is
                // one patient's problem or the whole integration's — an adapter
                // must not make that call, because it cannot see the other sends.
                const err = new Error(e.message);
                err.providerDetail = e.message;
                err.provider = name;
                throw err;
            }
        },
    };
}

/** The direct-Meta adapter: a Meta app's own Phone Number ID + access token. */
export const metaAdapter = makeCloudApiAdapter("meta", () =>
    Boolean(process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_ACCESS_TOKEN)
);
