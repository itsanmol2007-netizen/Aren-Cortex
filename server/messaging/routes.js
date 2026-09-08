// ---------------------------------------------------------------------------
// THE HTTP SURFACE — three routes, and nothing clever.
//
//   POST /api/messaging/prescription   send a prescription
//   POST /api/messaging/follow-up      send a follow-up
//   GET  /api/messaging/health         which provider is live
//
// Every route resolves the caller from their Supabase session (`../auth.js`)
// and ignores any identity in the request body. `doctorId` in particular is
// NEVER read from the request: it names whose credits get spent, and a
// request body is not proof of anything.
//
// 2026-09-08: `POST /api/support/notify` moved to the `support-notify`
// Supabase Edge Function (`supabase/functions/support-notify/index.ts`) —
// same reasoning as `admin-staff`. `notify()`/`emailConfigured()`
// (`../email/`) are still used FROM WITHIN this file's own send path
// (`service.js` alerts on a failed send or low credits) — that internal
// alerting stays here because it is triggered by the WhatsApp send flow,
// which itself hasn't moved yet (no Meta credentials to test it with).
//
// ── The rate limit, and what it is actually for
//
// Not abuse — this is behind a clinic login. It is for the frustrated double-
// click and the retry loop: without it, a doctor pressing "Send" four times
// spends four credits and the patient gets four identical prescriptions. The
// window is per doctor, in memory, and resets when the process does, which is
// the right trade for a single-process server. A real deployment behind more
// than one instance wants this in Postgres.
// ---------------------------------------------------------------------------

import { requireClinicUser } from "../auth.js";
import { sendMessage, MessagingError } from "./service.js";
import { resolveProvider } from "./providers/index.js";

const SEND_WINDOW_MS = 10_000;
const SEND_MAX_IN_WINDOW = 3;
const recentSends = new Map(); // doctorId -> number[] of timestamps

function rateLimited(doctorId) {
    const now = Date.now();
    const hits = (recentSends.get(doctorId) || []).filter((t) => now - t < SEND_WINDOW_MS);
    if (hits.length >= SEND_MAX_IN_WINDOW) {
        recentSends.set(doctorId, hits);
        return true;
    }
    hits.push(now);
    recentSends.set(doctorId, hits);
    return false;
}

/** Turns any thrown thing into a response. `MessagingError` carries a message
 *  written FOR the doctor and its own status; anything else is a bug and gets
 *  a generic 502, because an internal message in a toast helps nobody and can
 *  leak schema detail. */
function fail(res, e, where) {
    if (e instanceof MessagingError) {
        return res.status(e.httpStatus).json({ ok: false, error: e.code, message: e.message });
    }
    console.error(`[${where}]`, e);
    return res.status(502).json({
        ok: false,
        error: "server_error",
        message: "Something went wrong sending that message. Please try again.",
    });
}

export function mountMessagingRoutes(app) {
    async function handleSend(req, res, purpose) {
        const who = await requireClinicUser(req, res);
        if (!who) return;

        if (!who.doctorId) {
            return res.status(403).json({
                ok: false,
                error: "not_a_doctor",
                message: "Only a doctor can send a prescription or follow-up.",
            });
        }
        if (rateLimited(who.doctorId)) {
            return res.status(429).json({
                ok: false,
                error: "too_many",
                message: "That message is already on its way — give it a moment.",
            });
        }

        const patientId = String(req.body?.patientId || "").trim();
        if (!patientId) {
            return res.status(400).json({ ok: false, error: "no_patient", message: "No patient was named." });
        }

        try {
            const result = await sendMessage({
                doctorId: who.doctorId,       // from the session, never the body
                patientId,
                purpose,
                prescriptionId: req.body?.prescriptionId || null,
                visitId: req.body?.visitId || null,
                documentUrl: req.body?.documentUrl || null,
                followUpDate: req.body?.followUpDate || null,
            });
            res.json(result);
        } catch (e) {
            fail(res, e, `messaging/${purpose}`);
        }
    }

    app.post("/api/messaging/prescription", (req, res) => handleSend(req, res, "prescription"));
    app.post("/api/messaging/follow-up", (req, res) => handleSend(req, res, "follow_up"));

    /** What is actually wired on this machine. Honest about the mock: a
     *  developer should be able to tell at a glance whether messages are
     *  reaching WhatsApp or being simulated. Email is no longer this
     *  server's concern to report on — see `support-notify`'s own health,
     *  the Edge Function's logs, for that. */
    app.get("/api/messaging/health", (_req, res) => {
        let provider = "unavailable";
        let error = null;
        try {
            provider = resolveProvider().name;
        } catch (e) {
            error = e.message;
        }
        res.json({
            ok: true,
            provider,
            live: provider === "meta" || provider === "fast2sms",
            ...(error ? { error } : {}),
        });
    });
}
