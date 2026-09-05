// ---------------------------------------------------------------------------
// WHATSAPP — what the Communication page reads.
//
// Everything here is READ-ONLY from the browser, and that is structural, not
// an oversight. Sending a WhatsApp message needs Meta credentials that must
// never reach a browser bundle, so every send goes through `server/` with the
// service-role key. The frontend's job is to show the conversation, not to
// own it.
//
// ── Why threads are grouped in JavaScript and not in SQL
//
// The natural shape is a view: distinct phone, newest message, unread count.
// PostgREST cannot express that grouping over `whatsapp_messages` without one,
// and adding a view is a migration — which this feature already needed one of.
// Rather than stack a second, the page fetches a recent window of messages and
// groups them here. At this clinic's volume (43 patients, a handful of
// messages each) that is one indexed query returning a few hundred rows.
//
// It is genuinely the wrong shape at ten thousand messages, and the fix then
// is a `whatsapp_threads` view plus keyset pagination — not a bigger LIMIT.
// The ceiling is named in MESSAGE_WINDOW below so this is caught by reading
// the code rather than by a doctor noticing a thread has gone missing.
// ---------------------------------------------------------------------------

import { supabase } from "../supabase";

/**
 * How many recent messages back the inbox reads. Deliberately a hard number
 * with a stated reason: see the file header for what to do when it stops
 * being enough.
 */
const MESSAGE_WINDOW = 500;

/** Meta's re-engagement window. Mirrors FREEFORM_WINDOW_MS in server/whatsapp/conversation.js. */
const FREEFORM_WINDOW_MS = 24 * 60 * 60 * 1000;

export type WhatsAppDirection = "inbound" | "outbound";

export type DBWhatsAppMessage = {
    id: number;
    direction: WhatsAppDirection;
    phone: string;
    patient_id: string | null;
    prescription_id: string | null;
    wa_message_id: string | null;
    message_type: string;
    template_name: string | null;
    body_preview: string | null;
    status: string;
    error_detail: string | null;
    created_at: string;
};

export type WhatsAppThread = {
    /** E.164 without "+", as WhatsApp sends it. The thread's identity. */
    phone: string;
    patientId: string | null;
    patientName: string | null;
    messages: DBWhatsAppMessage[];
    lastMessage: DBWhatsAppMessage;
    /**
     * Whether a plain text reply will be ACCEPTED by Meta right now. False
     * means the composer must be disabled: outside 24h of the patient's last
     * message a free-form send is rejected outright, so letting a doctor type
     * one would be showing them a button that cannot work.
     */
    canReply: boolean;
    /** Milliseconds left to reply freely, 0 when closed. For "3h left" copy. */
    replyWindowRemainingMs: number;
};

/**
 * Every conversation for one clinic, newest first.
 *
 * Returns [] rather than throwing when the clinic has no messages — an empty
 * inbox is a state the page renders, not an error it reports.
 */
export async function fetchWhatsAppThreads(hospitalId: string): Promise<WhatsAppThread[]> {
    const { data, error } = await supabase
        .from("whatsapp_messages")
        // One string literal, not a concatenation: supabase-js infers the row
        // type by parsing this at the type level, and a `+` expression is
        // opaque to it — the result degrades to GenericStringError[].
        .select("id, direction, phone, patient_id, prescription_id, wa_message_id, message_type, template_name, body_preview, status, error_detail, created_at")
        .eq("hospital_id", hospitalId)
        .order("created_at", { ascending: false })
        .limit(MESSAGE_WINDOW);

    if (error) throw new Error(`fetchWhatsAppThreads: ${error.message}`);
    const rows = (data ?? []) as DBWhatsAppMessage[];
    if (!rows.length) return [];

    // Group by phone. Rows arrive newest-first, so the first row seen for a
    // phone is that thread's latest message and the per-thread array is built
    // newest-first too — reversed at the end, because a chat reads downward.
    const byPhone = new Map<string, DBWhatsAppMessage[]>();
    for (const row of rows) {
        const bucket = byPhone.get(row.phone);
        if (bucket) bucket.push(row);
        else byPhone.set(row.phone, [row]);
    }

    const patientNames = await fetchPatientNames(
        [...new Set(rows.map((r) => r.patient_id).filter((id): id is string => !!id))]
    );

    // The 24h clock is driven by the patient's last INBOUND message, which is
    // also what `whatsapp_conversations.last_inbound_at` holds server-side.
    // Deriving it from the messages we already have avoids a second query and
    // cannot disagree with what is on screen.
    const threads: WhatsAppThread[] = [];
    for (const [phone, newestFirst] of byPhone) {
        const lastInbound = newestFirst.find((m) => m.direction === "inbound");
        const remaining = lastInbound
            ? Math.max(0, FREEFORM_WINDOW_MS - (Date.now() - new Date(lastInbound.created_at).getTime()))
            : 0;
        const withPatient = newestFirst.find((m) => m.patient_id);

        threads.push({
            phone,
            patientId: withPatient?.patient_id ?? null,
            patientName: withPatient?.patient_id ? patientNames.get(withPatient.patient_id) ?? null : null,
            messages: [...newestFirst].reverse(),
            lastMessage: newestFirst[0],
            canReply: remaining > 0,
            replyWindowRemainingMs: remaining,
        });
    }

    threads.sort(
        (a, b) => new Date(b.lastMessage.created_at).getTime() - new Date(a.lastMessage.created_at).getTime()
    );
    return threads;
}

async function fetchPatientNames(ids: string[]): Promise<Map<string, string>> {
    if (!ids.length) return new Map();
    const { data, error } = await supabase.from("patients").select("id, name").in("id", ids);
    if (error) {
        // A thread is still perfectly usable showing a phone number. Losing
        // the whole inbox because a name lookup failed would not be.
        console.error("fetchPatientNames:", error.message);
        return new Map();
    }
    return new Map((data ?? []).map((p) => [p.id as string, p.name as string]));
}

// ── APPOINTMENT REQUESTS ────────────────────────────────────────────────────

export type AppointmentRequestStatus =
    | "pending" | "confirmed" | "declined" | "cancelled" | "expired";

export type DBAppointmentRequest = {
    id: number;
    hospital_id: string;
    patient_id: string | null;
    phone: string;
    doctor_id: string | null;
    preferred_day: string | null;
    preferred_date: string | null;
    note: string | null;
    source: string;
    status: AppointmentRequestStatus;
    confirmed_for: string | null;
    visit_id: string | null;
    created_at: string;
};

export type AppointmentRequest = DBAppointmentRequest & {
    patientName: string | null;
};

/**
 * Requests a patient has made over WhatsApp that nobody has actioned yet.
 *
 * `pending` only, by default: this is a work queue, and a list that also
 * carries everything already confirmed stops being one.
 */
export async function fetchAppointmentRequests(
    hospitalId: string,
    statuses: AppointmentRequestStatus[] = ["pending"]
): Promise<AppointmentRequest[]> {
    const { data, error } = await supabase
        .from("appointment_requests")
        .select("*")
        .eq("hospital_id", hospitalId)
        .in("status", statuses)
        .order("created_at", { ascending: false });

    if (error) throw new Error(`fetchAppointmentRequests: ${error.message}`);
    const rows = (data ?? []) as DBAppointmentRequest[];

    const names = await fetchPatientNames(
        [...new Set(rows.map((r) => r.patient_id).filter((id): id is string => !!id))]
    );
    return rows.map((r) => ({
        ...r,
        patientName: r.patient_id ? names.get(r.patient_id) ?? null : null,
    }));
}

/**
 * Front desk actioning a request.
 *
 * Note what this does NOT do: create a visit. Confirming here records the
 * clinic's decision and stops the request nagging the queue; putting the
 * patient into `visits` is the front desk's existing flow, unchanged, and
 * conflating the two would mean a mis-tap silently adds someone to today's
 * queue. `visit_id` on the request is the seam for linking them later.
 */
export async function setAppointmentRequestStatus(
    id: number,
    status: AppointmentRequestStatus,
    handledBy: string | null
): Promise<void> {
    const { error } = await supabase
        .from("appointment_requests")
        .update({
            status,
            handled_by: handledBy,
            handled_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        })
        .eq("id", id);
    if (error) throw new Error(`setAppointmentRequestStatus: ${error.message}`);
}

// ── FORMATTING ──────────────────────────────────────────────────────────────

/** "+91 98765 43210" from "919876543210" — readable, not a wall of digits. */
export function formatWhatsAppPhone(phone: string): string {
    const bare = phone.length === 12 && phone.startsWith("91") ? phone.slice(2) : phone;
    if (bare.length !== 10) return phone;
    return `+91 ${bare.slice(0, 5)} ${bare.slice(5)}`;
}

/** "3h left" / "20m left" / "" once the window has closed. */
export function formatReplyWindow(remainingMs: number): string {
    if (remainingMs <= 0) return "";
    const hours = Math.floor(remainingMs / 3_600_000);
    if (hours >= 1) return `${hours}h left`;
    return `${Math.max(1, Math.floor(remainingMs / 60_000))}m left`;
}
