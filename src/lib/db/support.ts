// ---------------------------------------------------------------------------
// SUPPORT TICKETS — reading back what `support-notify` filed, and the
// conversation on top of it.
//
// Added 2026-09-11 (Founder directive, same day as `support_requests`
// itself): "Communication between Master Control and Cortex must happen
// through the database, not email alone." `support_request_messages` is
// that database — a doctor and an AREN operator both read and write the
// same thread, and email stays a parallel notification, not the channel.
//
// ── The write path stays split, on purpose ──────────────────────────────
// Filing a NEW ticket still goes through the `support-notify` edge function
// (`sendSupportRequest` in `lib/db/messaging.ts`) — it resolves the doctor
// and clinic from the session, sends the email, and only then writes the
// row, in that order (see the function's own header for why). A REPLY on an
// existing ticket has none of that to do: the ticket already exists, the
// clinic is already fixed, there is no email to send. So a reply is a plain
// insert here, straight to the table, gated by the same RLS the read is.
//
// ── Why this file, and not `messaging.ts` ────────────────────────────────
// `messaging.ts` is WhatsApp credits and the send seam; support tickets are
// a different domain that happens to share an edge function for creation.
// Keeping the conversation reads/writes here, separate from that file, is
// the same reasoning `lib/db/support.ts` earns its own module for anything
// else this size — see standing rule 1's "every query lives in lib/db/, not
// the page."
//
// ── What RLS actually allows, so a blank list is never a surprise ────────
// `support_requests_read_own_clinic` scopes to `users.hospital_id` — anyone
// active at the clinic (reception included). `support_messages_read_own_
// clinic` / `_insert_own_clinic` scope to `doctors.hospital_id` — ONLY an
// account with its own `doctors` row. A reception or admin session can
// therefore see the TICKET LIST but get an empty thread and a failed insert
// on REPLY. That is the schema's own boundary (Master Control's handoff,
// 2026-09-11), not a bug here — `sendDoctorReply` surfaces it as a normal
// thrown error rather than papering over it.
// ---------------------------------------------------------------------------

import { supabase } from "../supabase";

export type SupportTicketStatus = "open" | "in_progress" | "waiting_on_doctor" | "resolved" | "closed";

export interface SupportTicket {
    id: number;
    /** `SR_<id>` — the same reference shown at send time and in the email subject. */
    reference: string;
    topic: string;
    areas: string[];
    message: string | null;
    status: SupportTicketStatus;
    createdAt: string;
    updatedAt: string;
    resolvedAt: string | null;
}

export interface SupportMessage {
    id: number;
    requestId: number;
    senderType: "admin" | "doctor" | "system";
    /** Whoever Master Control named them as — "Founder Anmol", an operator's
     *  name. `null` falls back to a generic label; never invent one here. */
    senderName: string | null;
    body: string;
    createdAt: string;
}

function toTicket(row: Record<string, unknown>): SupportTicket {
    return {
        id: row.id as number,
        reference: `SR_${row.id}`,
        topic: row.topic as string,
        areas: (row.areas as string[] | null) ?? [],
        message: (row.message as string | null) ?? null,
        status: row.status as SupportTicketStatus,
        createdAt: row.created_at as string,
        updatedAt: row.updated_at as string,
        resolvedAt: (row.resolved_at as string | null) ?? null,
    };
}

function toMessage(row: Record<string, unknown>): SupportMessage {
    return {
        id: row.id as number,
        requestId: row.request_id as number,
        senderType: row.sender_type as SupportMessage["senderType"],
        senderName: (row.sender_name as string | null) ?? null,
        body: row.body as string,
        createdAt: row.created_at as string,
    };
}

/**
 * Every support ticket this clinic can see — filed by this doctor or anyone
 * else at the same hospital (RLS is clinic-scoped, not doctor-scoped; a
 * front-desk clinic reasonably shows every bench the same visibility a
 * shared queue already does). Newest first.
 */
export async function fetchMySupportTickets(): Promise<SupportTicket[]> {
    const { data, error } = await supabase
        .from("support_requests")
        .select("id, topic, areas, message, status, created_at, updated_at, resolved_at")
        .order("created_at", { ascending: false });
    if (error) throw new Error(`fetchMySupportTickets: ${error.message}`);
    return (data ?? []).map(toTicket);
}

/** One ticket's conversation, oldest first — the order a chat reads in. */
export async function fetchTicketMessages(ticketId: number): Promise<SupportMessage[]> {
    const { data, error } = await supabase
        .from("support_request_messages")
        .select("*")
        .eq("request_id", ticketId)
        .order("created_at", { ascending: true });
    if (error) throw new Error(`fetchTicketMessages: ${error.message}`);
    return (data ?? []).map(toMessage);
}

/**
 * The doctor's own reply on an existing ticket. `sender_type` is hard-coded
 * to `"doctor"` — the INSERT policy's `with_check` requires exactly that
 * value, so this is not a convenience default, it is the only value that can
 * ever succeed from here.
 */
export async function sendDoctorReply(ticketId: number, body: string, doctorName: string): Promise<SupportMessage> {
    const trimmed = body.trim();
    if (!trimmed) throw new Error("Write something before sending.");
    const { data, error } = await supabase
        .from("support_request_messages")
        .insert({
            request_id: ticketId,
            sender_type: "doctor",
            sender_name: doctorName,
            body: trimmed,
        })
        .select()
        .single();
    if (error) throw new Error(`sendDoctorReply: ${error.message}`);
    return toMessage(data);
}

/**
 * Realtime, for the thread the doctor currently has open. `onChange` fires
 * on every insert — a new admin reply, or the doctor's own message arriving
 * back through the same channel it went out on — and the caller refetches
 * rather than trusting `payload.new` directly, same convention
 * `subscribeDoctorRequests` (lib/db/patients.ts) already uses: one source of
 * truth for "what does this list actually look like now," not two ways to
 * arrive at it that can drift.
 *
 * Channel name carries a timestamp because Supabase channel names must be
 * unique per subscription — reopening the same ticket needs a fresh one.
 */
export function subscribeToTicketMessages(ticketId: number, onChange: () => void): () => void {
    const channel = supabase
        .channel(`support-thread-${ticketId}:${Date.now()}`)
        .on(
            "postgres_changes",
            { event: "INSERT", schema: "public", table: "support_request_messages", filter: `request_id=eq.${ticketId}` },
            () => onChange()
        )
        .subscribe();
    return () => {
        void supabase.removeChannel(channel);
    };
}

/**
 * Realtime for the LIST — a status change (Master Control moving a ticket to
 * `in_progress`) or a reply landing on a ticket the doctor isn't currently
 * reading should still update the list's status pill and "last updated"
 * without a manual refresh.
 */
export function subscribeToMyTickets(onChange: () => void): () => void {
    const channel = supabase
        .channel(`support-tickets:${Date.now()}`)
        .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "support_requests" },
            () => onChange()
        )
        .subscribe();
    return () => {
        void supabase.removeChannel(channel);
    };
}
