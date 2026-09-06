// ---------------------------------------------------------------------------
// THE AREN MESSAGING SERVICE — credits in, message out, ledger honest.
//
//   Consultation completed
//          ↓
//   Prescription generated
//          ↓
//   Communication Service      ← this file
//          ↓  check credits
//          ↓  debit
//          ↓
//   Provider Adapter           ← providers/
//          ↓
//   Meta / BSP → WhatsApp → Patient
//          ↓
//   Webhook status update → Communication Activity
//
// ── The invariant this file exists to hold
//
// **A message is never sent without a credit, and a credit is never spent on
// a message that never sent.** Both halves matter and they pull in opposite
// directions: debiting after the send risks sending for free, debiting before
// it risks charging for nothing. So the debit comes first — the strict
// reading of "no message should be sent without sufficient credits" — and a
// failure is REFUNDED rather than prevented. Both movements stay visible in
// the ledger, which is the difference between "handled" and "silently lost".
//
// ── Why the message row is written BEFORE the debit
//
// `messaging_credit_ledger.message_id` is what makes a debit auditable, and a
// unique index enforces one debit per message. Both need a message id to
// exist. So the row is inserted first in a `pending` state; if the debit then
// fails, the row is DELETED rather than left as a "failed" message — nothing
// was attempted, and a phantom failure in a doctor's activity list is a
// support call about a message they never sent.
// ---------------------------------------------------------------------------

import { getSupabase } from "../whatsapp/supabaseClient.js";
import { resolveProvider } from "./providers/index.js";
import { notify, maybeAlertLowCredits } from "../email/notify.js";

/** What one message costs, in AREN credits. Every message is one credit
 *  today; the constant exists so a future per-purpose price is a change here
 *  rather than a hunt through call sites. */
const CREDIT_COST = { prescription: 1, follow_up: 1 };

/** Thrown for anything the doctor can act on — no credits, no phone number.
 *  The route turns these into a 4xx with the message shown verbatim, and
 *  everything else into a 502 with a generic one. */
export class MessagingError extends Error {
    constructor(message, code, status = 400) {
        super(message);
        this.name = "MessagingError";
        this.code = code;
        this.httpStatus = status;
    }
}

/**
 * Does this error mean the whole integration is down, or just that this one
 * message failed?
 *
 * A wrong number affects one patient. An expired token affects every message
 * from now until somebody notices — and "somebody notices" is exactly what
 * this distinction buys, because the second case emails support and the first
 * does not. Deliberately conservative: matching too little means one extra
 * per-message alert, matching too much means the real outage is buried.
 */
function isProviderLevelFailure(detail = "") {
    return /token|oauth|permission|unauthor|not approved|does not exist|template|waba|subscri|billing|account/i
        .test(detail);
}

async function loadContext(sb, { doctorId, patientId }) {
    const [doctorRes, patientRes] = await Promise.all([
        sb.from("doctors").select("id, name, hospital_id, hospitals(name)").eq("id", doctorId).maybeSingle(),
        sb.from("patients").select("id, name, phone, hospital_id").eq("id", patientId).maybeSingle(),
    ]);

    const doctor = doctorRes.data;
    const patient = patientRes.data;
    if (!doctor) throw new MessagingError("We could not find your doctor profile.", "no_doctor", 403);
    if (!patient) throw new MessagingError("We could not find that patient.", "no_patient", 404);

    // The clinic boundary, checked here rather than trusted from the request:
    // a doctor's session is scoped to their clinic, but the patient id came
    // from the browser and nothing else on this path re-checks it.
    if (patient.hospital_id && doctor.hospital_id && patient.hospital_id !== doctor.hospital_id) {
        throw new MessagingError("That patient belongs to another clinic.", "cross_clinic", 403);
    }

    const phone = normalisePhone(patient.phone);
    if (!phone) {
        throw new MessagingError(
            `${patient.name || "This patient"} has no WhatsApp number on file. Add one on their record first.`,
            "no_phone",
            400
        );
    }

    return {
        doctorId: doctor.id,
        doctorName: doctor.name || "your doctor",
        hospitalId: doctor.hospital_id,
        clinicName: doctor.hospitals?.name || "your clinic",
        patientId: patient.id,
        patientName: patient.name || null,
        phone,
    };
}

/**
 * To E.164 without "+", which is the only shape WhatsApp accepts.
 *
 * India-defaulting on purpose: every number in this schema is a local
 * 10-digit one, and a country code is the single most common reason a
 * perfectly valid clinic phone number is rejected by Meta. Anything already
 * carrying a country code is left alone.
 */
function normalisePhone(raw) {
    if (!raw) return null;
    const digits = String(raw).replace(/\D/g, "");
    if (digits.length === 10) return `91${digits}`;
    if (digits.length === 12 && digits.startsWith("91")) return digits;
    if (digits.length >= 11 && digits.length <= 15) return digits;
    return null;
}

async function currentBalance(sb, doctorId) {
    const { data } = await sb
        .from("messaging_credit_balances")
        .select("balance")
        .eq("doctor_id", doctorId)
        .maybeSingle();
    return Number(data?.balance ?? 0);
}

/**
 * Send one message and account for it.
 *
 * @param {{
 *   doctorId: string, patientId: string,
 *   purpose: "prescription" | "follow_up",
 *   prescriptionId?: string, visitId?: string,
 *   documentUrl?: string, followUpDate?: string
 * }} input
 */
export async function sendMessage(input) {
    const sb = getSupabase();
    const cost = CREDIT_COST[input.purpose];
    if (!cost) throw new MessagingError(`Unknown message type "${input.purpose}".`, "bad_purpose", 400);

    const ctx = await loadContext(sb, input);

    // A cheap read that answers the common case cleanly. NOT the authority —
    // `debit_messaging_credit` re-checks under a per-doctor lock, because two
    // consultations finishing in the same second would both pass this one.
    // Its only job is to reject an out-of-credits doctor before a message row
    // is ever written.
    const before = await currentBalance(sb, ctx.doctorId);
    if (before < cost) {
        throw new MessagingError(
            "Messaging credits exhausted. Recharge to continue sending messages.",
            "insufficient_credits",
            402
        );
    }

    const preview = input.purpose === "prescription"
        ? `Prescription for ${ctx.patientName || "patient"}`
        : `Follow-up reminder for ${ctx.patientName || "patient"}`;

    const { data: row, error: insertError } = await sb
        .from("whatsapp_messages")
        .insert({
            direction: "outbound",
            phone: ctx.phone,
            patient_id: ctx.patientId,
            prescription_id: input.prescriptionId ?? null,
            hospital_id: ctx.hospitalId,
            doctor_id: ctx.doctorId,
            purpose: input.purpose,
            message_type: "template",
            body_preview: preview,
            status: "pending",
            credits_charged: 0,
        })
        .select("id")
        .single();

    if (insertError) throw new Error(`sendMessage log: ${insertError.message}`);
    const messageId = row.id;

    // ── Debit ──────────────────────────────────────────────────────────────
    let ledgerId;
    try {
        const { data, error } = await sb.rpc("debit_messaging_credit", {
            p_doctor_id: ctx.doctorId,
            p_credits: cost,
            p_message_id: messageId,
            p_note: preview,
        });
        if (error) throw error;
        ledgerId = data;
    } catch (e) {
        // Nothing was attempted, so nothing should be remembered. Leaving a
        // 'failed' row here would put a message the doctor never sent into
        // their activity list.
        await sb.from("whatsapp_messages").delete().eq("id", messageId);
        if (String(e.message || "").includes("INSUFFICIENT_CREDITS")) {
            throw new MessagingError(
                "Messaging credits exhausted. Recharge to continue sending messages.",
                "insufficient_credits",
                402
            );
        }
        throw new Error(`sendMessage debit: ${e.message}`);
    }

    // ── Send ───────────────────────────────────────────────────────────────
    const provider = resolveProvider();
    try {
        const result = await provider.send({
            to: ctx.phone,
            purpose: input.purpose,
            patientId: ctx.patientId,
            patientName: ctx.patientName,
            clinicName: ctx.clinicName,
            doctorName: ctx.doctorName,
            hospitalId: ctx.hospitalId,
            prescriptionId: input.prescriptionId ?? null,
            documentUrl: input.documentUrl ?? null,
            followUpDate: input.followUpDate ?? null,
        });

        await sb.from("whatsapp_messages")
            .update({
                wa_message_id: result.providerMessageId,
                // 'sent' means it left AREN. delivered/read arrive later, from
                // the status webhook, keyed on wa_message_id.
                status: result.status || "sent",
                credits_charged: cost,
            })
            .eq("id", messageId);

        const balance = await currentBalance(sb, ctx.doctorId);
        // Fire-and-forget: an alert that is slow must not make a delivered
        // message look slow to the doctor waiting on the toast.
        void maybeAlertLowCredits(ctx.doctorId, balance).catch((e) =>
            console.error("[messaging] low-credit alert failed:", e.message)
        );

        return { ok: true, messageId, status: "sent", balance, provider: provider.name };
    } catch (e) {
        const detail = e.providerDetail || e.message || "Unknown provider error";

        // Refund FIRST. Everything after this is reporting; the doctor's
        // credit coming back is the part that must not depend on an email
        // service or a second update succeeding.
        try {
            await sb.rpc("refund_messaging_credit", {
                p_ledger_id: ledgerId,
                p_note: `Send failed: ${detail}`.slice(0, 300),
            });
        } catch (refundError) {
            // A lost refund is the one failure here that costs a doctor real
            // money, so it is logged loudly and left recoverable: the
            // MESSAGE_DEBIT row with no matching REFUND is queryable.
            console.error(
                `[messaging] REFUND FAILED for ledger ${ledgerId} (message ${messageId}):`,
                refundError.message
            );
        }

        await sb.from("whatsapp_messages")
            .update({ status: "failed", error_detail: detail.slice(0, 500), credits_charged: 0 })
            .eq("id", messageId);

        void notify("message_failed", {
            doctorId: ctx.doctorId,
            hospitalId: ctx.hospitalId,
            patientName: ctx.patientName,
            phone: ctx.phone,
            purposeLabel: input.purpose === "prescription" ? "Prescription" : "Follow-up",
            reason: detail,
            reference: `MSG_${messageId}`,
        }).catch(() => {});

        if (isProviderLevelFailure(detail)) {
            void notify("provider_error", {
                hospitalId: ctx.hospitalId,
                provider: provider.name,
                operation: input.purpose,
                reason: detail,
            }).catch(() => {});
        }

        throw new MessagingError(
            "WhatsApp could not deliver this message. Your credit has been refunded.",
            "send_failed",
            502
        );
    }
}

export const sendPrescription = (input) => sendMessage({ ...input, purpose: "prescription" });
export const sendFollowUp = (input) => sendMessage({ ...input, purpose: "follow_up" });
