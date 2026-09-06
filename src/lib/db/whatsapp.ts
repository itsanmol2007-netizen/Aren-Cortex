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
    /** When the status last moved. The only timestamp we have for "delivered"
     *  or "read" — Meta reports each state as a separate webhook that
     *  overwrites this, so it dates the LATEST step reached and not each one. */
    updated_at: string | null;
    /** Whose wallet paid for this send. Null on inbound, and on outbound rows
     *  written before Communication V1. */
    doctor_id: string | null;
    /**
     * AREN's own category — the two the doctor knows about, plus what the
     * bot itself sends. Deliberately NOT read off `template_name`: that is
     * Meta's name for an approved template and changes when a template is
     * re-approved, which must not silently reclassify a year of history.
     */
    purpose: WhatsAppPurpose | null;
    /** Credits this message actually consumed. 0 once a failure is refunded. */
    credits_charged: number;
};

export type WhatsAppPurpose = "prescription" | "follow_up" | "reply" | "booking" | "other";

/**
 * The four delivery states the doctor is shown, collapsed from everything
 * Meta reports. `accepted`/`sent` are one thing to a doctor ("it left"), and
 * a status nobody has a mental model for is worse than four they do.
 */
export type DeliveryState = "sent" | "delivered" | "read" | "failed" | "pending";

export function deliveryStateOf(status: string): DeliveryState {
    switch (status) {
        case "read": return "read";
        case "delivered": return "delivered";
        case "sent":
        case "accepted": return "sent";
        case "failed":
        case "undelivered": return "failed";
        default: return "pending";
    }
}

export const DELIVERY_LABEL: Record<DeliveryState, string> = {
    pending: "Sending",
    sent: "Sent",
    delivered: "Delivered",
    read: "Read",
    failed: "Failed",
};

/** What the doctor calls each kind of message. `null` covers rows written
 *  before V1 stamped a purpose. */
export function purposeLabel(purpose: WhatsAppPurpose | null): string {
    switch (purpose) {
        case "prescription": return "Prescription";
        case "follow_up": return "Follow-up";
        case "reply": return "Reply";
        case "booking": return "Booking";
        default: return "Message";
    }
}

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
        .select("id, direction, phone, patient_id, prescription_id, wa_message_id, message_type, template_name, body_preview, status, error_detail, created_at, updated_at, doctor_id, purpose, credits_charged")
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

// ── ACTIVITY — what this doctor has SENT ────────────────────────────────────
//
// The inbox above answers "who is talking to the clinic". This answers "did
// my prescription reach Rahul", which is a different question with a
// different owner: threads are per-CLINIC (one shared WhatsApp number, and a
// patient replies to the clinic, not to a bench), but a send is per-DOCTOR,
// because a doctor's own credits paid for it.

export type MessageActivity = {
    id: number;
    phone: string;
    patientId: string | null;
    patientName: string | null;
    purpose: WhatsAppPurpose | null;
    /** Collapsed from Meta's status vocabulary — see `deliveryStateOf`. */
    state: DeliveryState;
    /** Meta's own words when a send failed. The doctor sees a plain sentence;
     *  this is what support needs to act. */
    errorDetail: string | null;
    creditsCharged: number;
    createdAt: string;
    /** When the delivery state last moved — see DBWhatsAppMessage.updated_at. */
    updatedAt: string | null;
    prescriptionId: string | null;
};

/**
 * Outbound messages, newest first.
 *
 * `doctorId` is optional and its absence means "this whole clinic", not "no
 * filter I forgot to apply" — Parallax and an admin-doctor's Overview
 * both want the clinic-wide answer, and a doctor's own Communication page
 * passes their id. Capped by the same window the inbox uses, for the same
 * reason: see MESSAGE_WINDOW.
 */
export async function fetchMessageActivity(
    hospitalId: string,
    opts: { doctorId?: string | null; limit?: number } = {}
): Promise<MessageActivity[]> {
    let query = supabase
        .from("whatsapp_messages")
        .select("id, phone, patient_id, prescription_id, purpose, status, error_detail, credits_charged, created_at, updated_at")
        .eq("hospital_id", hospitalId)
        .eq("direction", "outbound")
        .order("created_at", { ascending: false })
        .limit(opts.limit ?? MESSAGE_WINDOW);

    // Rows written before V1 carry no doctor_id. Filtering by doctor would
    // hide a clinic's entire message history on the day this ships, so the
    // filter is applied only when asked for and the page says whose list it is.
    if (opts.doctorId) query = query.eq("doctor_id", opts.doctorId);

    const { data, error } = await query;
    if (error) throw new Error(`fetchMessageActivity: ${error.message}`);

    const rows = (data ?? []) as {
        id: number; phone: string; patient_id: string | null; prescription_id: string | null;
        purpose: WhatsAppPurpose | null; status: string; error_detail: string | null;
        credits_charged: number | null; created_at: string; updated_at: string | null;
    }[];
    if (!rows.length) return [];

    const names = await fetchPatientNames(
        [...new Set(rows.map((r) => r.patient_id).filter((id): id is string => !!id))]
    );

    return rows.map((r) => ({
        id: r.id,
        phone: r.phone,
        patientId: r.patient_id,
        patientName: r.patient_id ? names.get(r.patient_id) ?? null : null,
        purpose: r.purpose,
        state: deliveryStateOf(r.status),
        errorDetail: r.error_detail,
        creditsCharged: Number(r.credits_charged ?? 0),
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        prescriptionId: r.prescription_id,
    }));
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

/** The few facts the conversation panel's header shows about a patient.
 *  Deliberately not the full record — this is a header, and the door to the
 *  record is one click away on the same row. */
export interface PatientCard {
    id: string;
    name: string | null;
    phone: string | null;
    age: number | null;
    gender: string | null;
}

export async function fetchPatientCard(patientId: string): Promise<PatientCard | null> {
    const { data, error } = await supabase
        .from("patients")
        .select("id, name, phone, age, gender")
        .eq("id", patientId)
        .maybeSingle();
    if (error) {
        // A header without an age is still a usable header; losing the whole
        // conversation because one lookup failed is not.
        console.error("fetchPatientCard:", error.message);
        return null;
    }
    if (!data) return null;
    return {
        id: data.id as string,
        name: (data.name as string | null) ?? null,
        phone: (data.phone as string | null) ?? null,
        age: data.age == null ? null : Number(data.age),
        gender: (data.gender as string | null) ?? null,
    };
}

// ── DELIVERY HEALTH ─────────────────────────────────────────────────────────

export interface DeliveryStats {
    /** Outbound messages in the window. Inbound is never counted: a patient's
     *  reply is not something AREN delivered, and it costs nothing. */
    sent: number;
    delivered: number;
    read: number;
    failed: number;
    /** Delivered-or-read as a share of everything that left, 0–100. The one
     *  number a doctor actually wants: "are my messages reaching people". */
    reachedPct: number;
    /** Outbound this calendar month, for the header's "messages this month". */
    monthCount: number;
}

/**
 * How well messages are landing.
 *
 * Counts, not rows — five `head: true` queries rather than pulling a window of
 * messages and tallying in JavaScript, because the answer is six integers and
 * a busy clinic's month should not cross the wire to produce them.
 *
 * `read` is a subset of delivered in Meta's model (a read message was
 * delivered first), but they arrive as separate terminal statuses on the row,
 * so these buckets are disjoint as stored and `reachedPct` adds the two.
 */
export async function fetchDeliveryStats(
    hospitalId: string,
    opts: { doctorId?: string | null; days?: number } = {}
): Promise<DeliveryStats> {
    const days = opts.days ?? 14;
    const since = new Date(Date.now() - days * 86400000).toISOString();
    // First of the month in IST, not UTC — "messages this month" flipping a
    // day early for five and a half hours is the kind of small wrongness
    // nobody reports and everybody notices.
    const istNow = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
    }).format(new Date());
    const monthStart = `${istNow.slice(0, 8)}01T00:00:00.000+05:30`;

    const base = () => {
        let q = supabase
            .from("whatsapp_messages")
            .select("id", { count: "exact", head: true })
            .eq("hospital_id", hospitalId)
            .eq("direction", "outbound");
        if (opts.doctorId) q = q.eq("doctor_id", opts.doctorId);
        return q;
    };

    const [sentRes, deliveredRes, readRes, failedRes, monthRes] = await Promise.all([
        base().gte("created_at", since).in("status", ["sent", "accepted", "pending"]),
        base().gte("created_at", since).eq("status", "delivered"),
        base().gte("created_at", since).eq("status", "read"),
        base().gte("created_at", since).in("status", ["failed", "undelivered"]),
        base().gte("created_at", monthStart),
    ]);

    const sent = sentRes.count ?? 0;
    const delivered = deliveredRes.count ?? 0;
    const read = readRes.count ?? 0;
    const failed = failedRes.count ?? 0;
    const total = sent + delivered + read + failed;

    return {
        sent, delivered, read, failed,
        reachedPct: total > 0 ? Math.round(((delivered + read) / total) * 100) : 0,
        monthCount: monthRes.count ?? 0,
    };
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
