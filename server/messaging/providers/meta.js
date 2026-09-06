// ---------------------------------------------------------------------------
// META CLOUD API ADAPTER.
//
// Turns AREN's vocabulary (a purpose, a patient, a clinic) into Meta's
// (a template name, a language code, a component array). This is the ONLY
// file in the messaging path that knows any of Meta's shapes exist.
//
// It deliberately reuses `server/whatsapp/client.js` rather than re-issuing
// its own Graph calls: that file already handles the access token, the error
// body Meta hides its useful message in, and logging an outbound row for the
// status webhook to update by `wa_message_id`. Two code paths to the same API
// would mean two places for a token change to break.
//
// ── The 24-hour rule, and why both sends here are templates
//
// Meta only permits a free-form message within 24 hours of the PATIENT's last
// message. A prescription and a follow-up are both AREN opening a
// conversation from cold, so both must be approved templates — always, no
// conditional "text if we can". See docs/whatsapp-two-way.md.
//
// Template names are env-configured because they are Meta's, not ours: a
// template re-approved under a new name must be a .env change, not a release.
// ---------------------------------------------------------------------------

import { sendTemplateMessage, sendPrescriptionTemplate } from "../../whatsapp/client.js";

/** Meta's approved-template names, per purpose. Defaults match the templates
 *  submitted for AREN's WABA; override in server/.env when they change. */
function templateFor(purpose) {
    if (purpose === "prescription") {
        return {
            name: process.env.WHATSAPP_TEMPLATE_PRESCRIPTION || "aren_prescription",
            language: process.env.WHATSAPP_TEMPLATE_LANG || "en_US",
        };
    }
    return {
        name: process.env.WHATSAPP_TEMPLATE_FOLLOW_UP || "aren_follow_up",
        language: process.env.WHATSAPP_TEMPLATE_LANG || "en_US",
    };
}

export const metaAdapter = {
    name: "meta",

    configured() {
        return Boolean(
            process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_ACCESS_TOKEN
        );
    },

    async send(message) {
        const { name, language } = templateFor(message.purpose);

        try {
            // A prescription with a rendered PDF gets the document-header
            // template; without one it falls back to the plain body template,
            // because "here is your prescription, ask the clinic for a copy"
            // is still worth sending and a missing PDF must not swallow the
            // message entirely.
            if (message.purpose === "prescription" && message.documentUrl) {
                const { waMessageId } = await sendPrescriptionTemplate(
                    message.to,
                    name,
                    message.documentUrl,
                    message.patientName || "there",
                    message.clinicName || "your clinic",
                    { patientId: message.patientId, prescriptionId: message.prescriptionId, hospitalId: message.hospitalId, skipLog: true }
                );
                return { providerMessageId: waMessageId, status: "sent" };
            }

            const { waMessageId } = await sendTemplateMessage(
                message.to,
                name,
                language,
                [{
                    type: "body",
                    parameters: [
                        { type: "text", text: message.patientName || "there" },
                        { type: "text", text: message.clinicName || "your clinic" },
                        // Slot 3 differs by purpose and every AREN template
                        // reserves it: the follow-up date for a reminder, the
                        // doctor's name on a prescription.
                        {
                            type: "text",
                            text: message.purpose === "follow_up"
                                ? (message.followUpDate || "soon")
                                : (message.doctorName || "your doctor"),
                        },
                    ],
                }],
                { patientId: message.patientId, prescriptionId: message.prescriptionId, hospitalId: message.hospitalId, skipLog: true }
            );
            return { providerMessageId: waMessageId, status: "sent" };
        } catch (e) {
            // Meta's own words, carried through untouched. The service turns
            // this into a refund and decides whether it is one patient's
            // problem or the whole integration's — an adapter must not make
            // that call, because it cannot see the other sends.
            const err = new Error(e.message);
            err.providerDetail = e.message;
            err.provider = "meta";
            throw err;
        }
    },
};
