// ---------------------------------------------------------------------------
// THE TWO-WAY FLOW: a tap becomes an appointment REQUEST.
//
// The whole conversation, end to end:
//
//   patient: (taps "Book appointment" under their prescription)
//   aren:    "Which day suits you?"  [Today] [Tomorrow] [This week]
//   patient: (taps "Tomorrow")
//   aren:    "Done — Sunrise Clinic will confirm your time shortly."
//            ...and a row lands in front desk's pending requests.
//
// What this deliberately does NOT do is allocate a slot. The founder call
// (2026-09-04) was request-then-confirm: the bot captures intent and a
// preferred day, a human confirms the actual time. Real slot allocation
// needs per-doctor schedules, slot lengths, leave, holidays and race safety,
// none of which exist in this schema — and a bot that confidently books a
// time the doctor isn't there is worse than one that promises a callback.
//
// Every send here is best-effort. Meta can reject a send for reasons that
// have nothing to do with us (billing lapsed, window closed, number blocked)
// and none of them justify losing the patient's request — so the database
// write happens FIRST and the reply is attempted after.
// ---------------------------------------------------------------------------

import { getSupabase } from "./supabaseClient.js";
import { sendTextMessage, sendInteractiveButtons } from "./client.js";
import { resolveIdentity, fetchClinicIdentity, fetchWhatsAppConfig } from "./routing.js";
import {
    getOrCreateConversation, markInbound, markOutbound, setState, clearState,
} from "./conversation.js";
import { BUTTON, readIntent, resolvePreferredDate } from "./intent.js";

const DAY_LABEL = { today: "today", tomorrow: "tomorrow", week: "this week" };

/**
 * Sends a reply and records that we did, without ever letting a send failure
 * escape. The caller has already committed whatever mattered to the database;
 * this is the courtesy layer on top.
 */
async function reply(phone, send) {
    try {
        await send();
        await markOutbound(phone);
        return true;
    } catch (e) {
        // Expected in normal operation — an expired token, a lapsed billing
        // account, a closed 24h window. Logged rather than thrown so one
        // undeliverable reply cannot take down webhook processing.
        console.error(`[whatsapp] reply to ${phone} failed (non-fatal): ${e.message}`);
        return false;
    }
}

/** The menu we fall back to whenever we don't know what someone wants. */
async function sendMenu(phone, { clinicName, patientId, hospitalId, bookingEnabled }) {
    const buttons = [{ id: BUTTON.TALK, title: "Talk to clinic" }];
    if (bookingEnabled) buttons.unshift({ id: BUTTON.BOOK, title: "Book appointment" });

    return reply(phone, () => sendInteractiveButtons(
        phone,
        `Hi! You're messaging ${clinicName}. How can we help?`,
        buttons,
        { patientId, hospitalId, footer: "AREN Node" }
    ));
}

async function askForDay(phone, { clinicName, patientId, hospitalId }) {
    return reply(phone, () => sendInteractiveButtons(
        phone,
        `Sure — when would you like to visit ${clinicName}?`,
        [
            { id: BUTTON.DAY_TODAY, title: "Today" },
            { id: BUTTON.DAY_TOMORROW, title: "Tomorrow" },
            { id: BUTTON.DAY_WEEK, title: "This week" },
        ],
        { patientId, hospitalId }
    ));
}

/**
 * Asks which clinic, when one phone matches patients at several.
 *
 * Capped at three because that is Meta's button limit. A patient attending
 * four clinics through AREN is not a case worth a list-message detour today —
 * they get the three most recent and can type instead. Revisit when a real
 * user hits it rather than building for a hypothetical.
 */
async function askWhichClinic(phone, candidates) {
    const choices = candidates.slice(0, 3);
    return reply(phone, () => sendInteractiveButtons(
        phone,
        "You're registered at more than one clinic. Which one is this about?",
        choices.map((c) => ({
            id: `${BUTTON.CLINIC_PREFIX}${c.hospitalId}`,
            title: c.hospitalName,
        })),
        {}
    ));
}

/**
 * Writes the request, then tells the patient. In that order, always: if the
 * confirmation fails to send, the clinic still sees the request and can ring
 * the patient — whereas a request that was announced but never stored is a
 * promise nobody in the clinic knows about.
 */
async function createRequest({ phone, identity, hospitalId, patientId, day, clinicName }) {
    const preferredDate = resolvePreferredDate(day);

    const { error } = await getSupabase().from("appointment_requests").insert({
        hospital_id: hospitalId,
        patient_id: patientId ?? null,
        phone: identity.barePhone,
        preferred_day: day,
        preferred_date: preferredDate,
        source: "whatsapp",
        status: "pending",
    });

    if (error) {
        console.error("[whatsapp] appointment_requests insert failed:", error.message);
        await reply(phone, () => sendTextMessage(
            phone,
            "Sorry — something went wrong saving your request. Please call the clinic directly.",
            { patientId, hospitalId }
        ));
        return false;
    }

    const when = DAY_LABEL[day] ?? day;
    await reply(phone, () => sendTextMessage(
        phone,
        `Done — your appointment request for ${when} has been sent to ${clinicName}. ` +
        `They'll confirm your time shortly.`,
        { patientId, hospitalId }
    ));
    return true;
}

/**
 * The entry point the webhook calls for every inbound patient message.
 *
 * @param {{phone: string, text?: string|null, buttonId?: string|null}} message
 * @returns {Promise<{hospitalId: string|null, patientId: string|null}>}
 *          resolved identity, so the caller can stamp the message log row
 */
export async function handleInboundMessage(message) {
    const { phone } = message;
    const identity = await resolveIdentity(phone);
    const conversation = await getOrCreateConversation(phone);
    const intent = readIntent(message);

    // An unknown number is a normal event, not an error — people text
    // businesses. We answer honestly instead of pretending to recognise them,
    // and the message still lands in service-role tooling with a null clinic.
    if (!identity.isKnown) {
        await markInbound(phone);
        await reply(phone, () => sendTextMessage(
            phone,
            "Thanks for messaging. We couldn't find this number in our records — " +
            "please call the clinic directly, or reply with the clinic's name and " +
            "we'll pass your message on."
        ));
        return { hospitalId: null, patientId: null };
    }

    // ── Resolve which clinic ───────────────────────────────────────────────
    // Three ways we might know: it was never ambiguous; the patient just
    // tapped a clinic button; or we asked earlier and stored the answer.
    let hospitalId = identity.hospitalId;
    let patientId = identity.patientId;
    let pendingIntent = intent;

    if (!hospitalId && intent?.kind === "clinic") {
        const chosen = identity.candidates.find((c) => c.hospitalId === intent.hospitalId);
        if (chosen) {
            hospitalId = chosen.hospitalId;
            patientId = chosen.patientId;
            // The button only said WHICH CLINIC. What they originally wanted
            // was parked in state_data when we asked.
            pendingIntent = conversation.state_data?.pendingIntent
                ? { kind: conversation.state_data.pendingIntent }
                : null;
        }
    } else if (!hospitalId && conversation.hospital_id) {
        // Answered this before; don't ask twice in one conversation.
        hospitalId = conversation.hospital_id;
        patientId = conversation.patient_id;
    }

    await markInbound(phone, { hospitalId, patientId });

    if (!hospitalId && identity.isAmbiguous) {
        await setState(phone, "awaiting_clinic", {
            pendingIntent: intent?.kind === "clinic" ? null : intent?.kind ?? null,
        });
        await askWhichClinic(phone, identity.candidates);
        return { hospitalId: null, patientId: null };
    }

    const clinic = await fetchClinicIdentity(hospitalId);
    const clinicName = clinic?.name ?? "the clinic";
    const config = await fetchWhatsAppConfig(hospitalId);

    // A clinic that has switched WhatsApp off should not have a bot speaking
    // on its behalf. The message is still logged — staff see it in the inbox
    // and can reply by hand — we simply don't auto-respond.
    if (!config.enabled) {
        await clearState(phone);
        return { hospitalId, patientId };
    }

    // ── Act on intent ──────────────────────────────────────────────────────
    const state = conversation.state;

    if (pendingIntent?.kind === "day" && (state === "awaiting_day" || pendingIntent)) {
        // A day answer is only meaningful as an answer. If they volunteer
        // "kal" out of nowhere we still take it — they've told us what they
        // want and asking again would be pedantic.
        if (!config.bookingEnabled) {
            await clearState(phone);
            await reply(phone, () => sendTextMessage(
                phone,
                `Please call ${clinicName} directly to arrange a visit.`,
                { patientId, hospitalId }
            ));
            return { hospitalId, patientId };
        }
        await clearState(phone);
        await createRequest({
            phone, identity, hospitalId, patientId,
            day: pendingIntent.day, clinicName,
        });
        return { hospitalId, patientId };
    }

    if (pendingIntent?.kind === "book") {
        if (!config.bookingEnabled) {
            await reply(phone, () => sendTextMessage(
                phone,
                `Please call ${clinicName} directly to arrange a visit.`,
                { patientId, hospitalId }
            ));
            return { hospitalId, patientId };
        }
        await setState(phone, "awaiting_day", {});
        await askForDay(phone, { clinicName, patientId, hospitalId });
        return { hospitalId, patientId };
    }

    if (pendingIntent?.kind === "talk") {
        await clearState(phone);
        await reply(phone, () => sendTextMessage(
            phone,
            `Thanks — your message has reached ${clinicName}. Someone will reply here shortly.`,
            { patientId, hospitalId }
        ));
        return { hospitalId, patientId };
    }

    // Nothing recognised. Show the menu rather than guessing — and note we do
    // NOT loop: if they were already mid-flow, state is left alone so their
    // next tap still lands where it should.
    if (state === "idle") {
        await sendMenu(phone, {
            clinicName, patientId, hospitalId,
            bookingEnabled: config.bookingEnabled,
        });
    }
    return { hospitalId, patientId };
}
