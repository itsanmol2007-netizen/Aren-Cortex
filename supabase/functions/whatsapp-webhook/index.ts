/* ------------------------------------------------------------------
   whatsapp-webhook — inbound WhatsApp messages + delivery receipts.

   Fast2SMS (our BSP) is configured in "META DIRECT" format, so its POST
   body is Meta's native shape: entry[].changes[].value.{messages,statuses}.
   This function is the Supabase-hosted replacement for the old
   server/whatsapp/webhook.js (server/ has no public home).

   verify_jwt is OFF. Fast2SMS signs nothing, so the credential is a
   shared token: set WHATSAPP_WEBHOOK_TOKEN as a function secret and put
   ?token=<that value> on the callback URL in the Fast2SMS dashboard.
   If the secret is unset the function still runs (so you can wire it up
   first) but logs a warning on every call — set it before this is real.

   What it does, per event:
     • message  → resolve the patient by phone (per-clinic), write an
                  inbound row to whatsapp_messages (the Communication page
                  reads these).
     • status   → update whatsapp_messages.status by wa_message_id; on
                  failed/undelivered, refund the credit that was charged
                  (idempotent — refund_messaging_credit returns the
                  existing refund rather than paying twice).

   NOT included: the "Book appointment" conversation bot (booking.js) and
   the patient-wrote-in email alert. Those can move over later; this is
   the "replies show up for the doctor" path.

   Route:  GET  /functions/v1/whatsapp-webhook   (optional hub.challenge)
           POST /functions/v1/whatsapp-webhook?token=...
------------------------------------------------------------------- */

import { createClient } from "npm:@supabase/supabase-js@2.45.4";

function admin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

const WEBHOOK_TOKEN = Deno.env.get("WHATSAPP_WEBHOOK_TOKEN") ?? "";
const VERIFY_TOKEN = Deno.env.get("WHATSAPP_VERIFY_TOKEN") ?? "";

/** WhatsApp sends "91XXXXXXXXXX"; patients.phone stores the bare 10 digits. */
function stripCountryCode(waPhone: string): string {
  return waPhone.length === 12 && waPhone.startsWith("91") ? waPhone.slice(2) : waPhone;
}

/** A tapped button's id across the three shapes one gesture arrives as. */
function readButtonId(msg: Record<string, any>): string | null {
  return (
    msg.interactive?.button_reply?.id ??
    msg.interactive?.list_reply?.id ??
    msg.button?.payload ??
    null
  );
}

function readMessageText(msg: Record<string, any>): string | null {
  return (
    msg.text?.body ??
    msg.interactive?.button_reply?.title ??
    msg.interactive?.list_reply?.title ??
    msg.button?.text ??
    null
  );
}

interface FlatEvent {
  kind: "message" | "status";
  from?: string;
  text?: string | null;
  buttonId?: string | null;
  messageType?: string;
  waMessageId?: string;
  status?: string;
  statusForMessageId?: string;
  raw: Record<string, any>;
}

function parsePayload(payload: Record<string, any>): FlatEvent[] {
  const out: FlatEvent[] = [];
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value ?? {};
      for (const msg of value.messages ?? []) {
        out.push({
          kind: "message",
          from: msg.from,
          text: readMessageText(msg),
          buttonId: readButtonId(msg),
          messageType: msg.type,
          waMessageId: msg.id,
          raw: msg,
        });
      }
      for (const st of value.statuses ?? []) {
        out.push({
          kind: "status",
          from: st.recipient_id,
          status: st.status,
          statusForMessageId: st.id,
          raw: st,
        });
      }
    }
  }
  return out;
}

/** 0 rows → stranger (null clinic). 1 distinct clinic → resolved. 2+ → left
 *  unattributed rather than guessed. Service role, so no RLS to fight. */
async function resolvePatient(db: ReturnType<typeof admin>, waPhone: string) {
  const bare = stripCountryCode(waPhone);
  const { data } = await db
    .from("patients")
    .select("id, hospital_id")
    .eq("phone", bare);
  const candidates = (data ?? []).filter((r: any) => r.hospital_id);
  const hospitals = [...new Set(candidates.map((r: any) => r.hospital_id))];
  if (hospitals.length === 1) {
    return { patientId: candidates[0].id as string, hospitalId: hospitals[0] as string };
  }
  return { patientId: null, hospitalId: null };
}

/** Meta accepted, then reported the message never arrived. Refund the credit.
 *  Idempotent — WhatsApp re-delivers status webhooks. Ported from
 *  server/messaging/service.js settleFailedDelivery. */
async function settleFailedDelivery(
  db: ReturnType<typeof admin>,
  waMessageId: string,
  reason: string,
) {
  const { data: msg } = await db
    .from("whatsapp_messages")
    .select("id, credits_charged")
    .eq("wa_message_id", waMessageId)
    .maybeSingle();
  if (!msg || !msg.credits_charged) return;

  const { data: debit } = await db
    .from("messaging_credit_ledger")
    .select("id")
    .eq("message_id", msg.id)
    .eq("kind", "MESSAGE_DEBIT")
    .maybeSingle();
  if (!debit) {
    console.error(`[whatsapp-webhook] message ${msg.id} charged but no MESSAGE_DEBIT row — not refunding`);
    return;
  }

  await db.rpc("refund_messaging_credit", {
    p_ledger_id: debit.id,
    p_note: `Delivery failed: ${reason || "reported failed by the provider"}`.slice(0, 300),
  });
  await db
    .from("whatsapp_messages")
    .update({ credits_charged: 0, error_detail: (reason || "Delivery failed").slice(0, 500) })
    .eq("id", msg.id);
}

async function handleEvent(db: ReturnType<typeof admin>, ev: FlatEvent) {
  if (ev.kind === "message") {
    const { patientId, hospitalId } = await resolvePatient(db, ev.from ?? "");
    await db.from("whatsapp_messages").insert({
      direction: "inbound",
      phone: ev.from,
      patient_id: patientId,
      hospital_id: hospitalId,
      wa_message_id: ev.waMessageId,
      message_type: ev.messageType || "text",
      body_preview: (ev.text || "").slice(0, 200),
      status: "received",
      credits_charged: 0,
    });
    if (!patientId) {
      console.warn(`[whatsapp-webhook] inbound from ${ev.from} matched no patient`);
    }
    return;
  }

  // status
  const { error, count } = await db
    .from("whatsapp_messages")
    .update({ status: ev.status, updated_at: new Date().toISOString() }, { count: "exact" })
    .eq("wa_message_id", ev.statusForMessageId);
  if (error || !count) {
    console.warn(`[whatsapp-webhook] status ${ev.status} had no matching row: ${ev.statusForMessageId}`);
  }
  if (ev.status === "failed" || ev.status === "undelivered") {
    const reason =
      ev.raw?.errors?.[0]?.title ||
      ev.raw?.errors?.[0]?.message ||
      `Provider reported ${ev.status}`;
    await settleFailedDelivery(db, ev.statusForMessageId ?? "", reason);
  }
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // GET — Meta-style verification handshake, if the BSP proxies one.
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    if (mode === "subscribe" && VERIFY_TOKEN && token === VERIFY_TOKEN) {
      return new Response(challenge ?? "", { status: 200, headers: { "Content-Type": "text/plain" } });
    }
    return new Response("ok", { status: 200 });
  }

  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

  // Shared-token auth (Fast2SMS signs nothing).
  if (WEBHOOK_TOKEN) {
    if (url.searchParams.get("token") !== WEBHOOK_TOKEN) {
      console.warn("[whatsapp-webhook] token missing/mismatched — rejecting POST");
      return new Response("unauthorized", { status: 401 });
    }
  } else {
    console.warn("[whatsapp-webhook] WHATSAPP_WEBHOOK_TOKEN is not set — POST is UNAUTHENTICATED");
  }

  let payload: Record<string, any>;
  try {
    payload = await req.json();
  } catch {
    return new Response("bad json", { status: 400 });
  }

  const db = admin();
  const events = parsePayload(payload);

  // Process before responding — an edge function has no "ack then work"
  // lifecycle the way a long-lived server does, and the volume here is one
  // message at a time. Each event is isolated so one failure doesn't sink
  // the batch.
  for (const ev of events) {
    try {
      await handleEvent(db, ev);
    } catch (e) {
      console.error("[whatsapp-webhook] event failed:", (e as Error).message, JSON.stringify(ev.raw).slice(0, 300));
    }
  }

  return new Response(JSON.stringify({ ok: true, handled: events.length }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
