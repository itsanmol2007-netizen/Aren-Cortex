// ---------------------------------------------------------------------------
// CONVERSATION STATE — the memory a two-way thread needs.
//
// `whatsapp_messages` is the log: append-only, never edited, one row per
// thing that happened. It cannot answer "what am I waiting for from this
// person?" without replaying and interpreting history on every message.
// `whatsapp_conversations` is that answer, held as one mutable row per phone.
//
// It also holds `last_inbound_at`, which is not analytics — it is the clock
// on Meta's 24-hour rule. See canSendFreeform() below.
// ---------------------------------------------------------------------------

import { getSupabase } from "./supabaseClient.js";

/** Meta's re-engagement window: 24 hours from the patient's last message. */
const FREEFORM_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * A flow the bot started and hasn't finished. Anything older than this is
 * swept back to `idle` on the next message, so a patient who wandered off
 * mid-booking three days ago gets a fresh start rather than being answered
 * as though they were still mid-sentence.
 */
const STATE_STALE_MS = 60 * 60 * 1000; // 1 hour

/**
 * Loads the conversation row for a phone, creating it on first contact.
 *
 * Upsert on `phone` (its unique constraint) rather than select-then-insert:
 * two webhook POSTs for the same person can land concurrently — Meta makes
 * no ordering promise — and the read-then-write version loses that race with
 * a duplicate-key error on a perfectly normal message.
 */
export async function getOrCreateConversation(phone) {
    const supabase = getSupabase();

    const { data: existing, error: readErr } = await supabase
        .from("whatsapp_conversations")
        .select("*")
        .eq("phone", phone)
        .maybeSingle();

    if (readErr) throw new Error(`getOrCreateConversation read: ${readErr.message}`);
    if (existing) return normaliseStaleState(existing);

    const { data: created, error: insertErr } = await supabase
        .from("whatsapp_conversations")
        .upsert({ phone }, { onConflict: "phone" })
        .select()
        .single();

    if (insertErr) throw new Error(`getOrCreateConversation insert: ${insertErr.message}`);
    return created;
}

/**
 * Treats a long-abandoned flow as `idle` WITHOUT writing to the database.
 * The row still says "awaiting_day"; the caller just doesn't act on it. The
 * write happens naturally on the next real state change, so a stale row
 * costs one field of memory rather than a UPDATE on every inbound message.
 */
function normaliseStaleState(row) {
    if (row.state === "idle") return row;
    const age = Date.now() - new Date(row.updated_at).getTime();
    if (age < STATE_STALE_MS) return row;
    return { ...row, state: "idle", state_data: {} };
}

/**
 * Records that the patient just messaged us — which both stamps the 24h
 * window and attaches the resolved identity to the conversation, so the
 * inbox can show a name and a clinic for the thread.
 *
 * `hospitalId`/`patientId` are only written when they resolved: a later
 * ambiguous message must never blank out a clinic we already knew.
 */
export async function markInbound(phone, { hospitalId, patientId } = {}) {
    const patch = { last_inbound_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    if (hospitalId) patch.hospital_id = hospitalId;
    if (patientId) patch.patient_id = patientId;

    const { error } = await getSupabase()
        .from("whatsapp_conversations")
        .update(patch)
        .eq("phone", phone);
    if (error) console.error("[whatsapp] markInbound failed (non-fatal):", error.message);
}

export async function markOutbound(phone) {
    const { error } = await getSupabase()
        .from("whatsapp_conversations")
        .update({ last_outbound_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("phone", phone);
    if (error) console.error("[whatsapp] markOutbound failed (non-fatal):", error.message);
}

/**
 * Moves the flow forward. `data` REPLACES state_data rather than merging —
 * each step of the booking flow carries everything the next step needs, and
 * a merge would quietly resurrect a field from an abandoned earlier attempt.
 */
export async function setState(phone, state, data = {}) {
    const { error } = await getSupabase()
        .from("whatsapp_conversations")
        .update({ state, state_data: data, updated_at: new Date().toISOString() })
        .eq("phone", phone);
    if (error) console.error("[whatsapp] setState failed (non-fatal):", error.message);
}

export async function clearState(phone) {
    return setState(phone, "idle", {});
}

/**
 * Whether Meta will accept a plain text reply to this person right now.
 *
 * Outside the 24h window a free-form send is REJECTED by the Graph API — it
 * does not silently fail, it errors, and the clinic's message is simply not
 * delivered. The inbox calls this to disable its composer with an honest
 * explanation instead of letting a doctor type a reply that cannot land.
 *
 * @param {{last_inbound_at: string|null}} conversation
 */
export function canSendFreeform(conversation) {
    if (!conversation?.last_inbound_at) return false;
    return Date.now() - new Date(conversation.last_inbound_at).getTime() < FREEFORM_WINDOW_MS;
}

/** Milliseconds left in the window, or 0. For "expires in 3h" copy. */
export function freeformWindowRemainingMs(conversation) {
    if (!conversation?.last_inbound_at) return 0;
    const remaining = FREEFORM_WINDOW_MS - (Date.now() - new Date(conversation.last_inbound_at).getTime());
    return remaining > 0 ? remaining : 0;
}
