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

   ROUTING (which clinic an inbound belongs to). Every clinic sends from
   ONE shared WhatsApp number, and the inbound payload carries no clinic
   id — only the patient's phone. resolveRouting() attributes it, most
   certain first:
     1. context.id — the message it replies to / the button it came from
        → that outbound row's clinic. Exact, no matter how old the thread.
     2. the clinic that has actually messaged this number before (newest
        wins if more than one).
     3. the number is a registered patient at exactly one clinic.
   Otherwise the row is still written, unattributed — recoverable, never
   dropped. A conversation-session table + an interactive clinic picker
   are the real fix for the ambiguous case; this is the safe interim.

   Per event:
     • message  → route, write an inbound row to whatsapp_messages (the
                  Communication page reads these).
     • status   → update whatsapp_messages.status by wa_message_id; on
                  failed/undelivered, refund the credit (idempotent).

   NOT included: the "Book appointment" conversation bot (booking.js) and
   the patient-wrote-in email alert.

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
  /** wa_message_id of the message this one replies to / the button belongs to */
  contextId?: string | null;
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
          contextId: msg.context?.id ?? null,
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

/** The registered patient with this phone at a specific clinic, if any.
 *  patients.phone is unique per (hospital_id, phone). */
async function patientInClinic(
  db: ReturnType<typeof admin>,
  waPhone: string,
  hospitalId: string,
): Promise<string | null> {
  const bare = stripCountryCode(waPhone);
  const { data } = await db
    .from("patients")
    .select("id")
    .eq("phone", bare)
    .eq("hospital_id", hospitalId)
    .maybeSingle();
  return (data?.id as string | null) ?? null;
}

/** Which clinic (+ patient) an inbound message belongs to. See the ROUTING
 *  note at the top of the file. Every failure mode returns nulls rather than
 *  guessing — the row is still written and can be re-attributed later. */
async function resolveRouting(
  db: ReturnType<typeof admin>,
  ev: FlatEvent,
): Promise<{ patientId: string | null; hospitalId: string | null }> {
  const waPhone = ev.from ?? "";
  if (!waPhone) return { patientId: null, hospitalId: null };

  // 1. Reply context / button — the exact outbound message it responds to.
  if (ev.contextId) {
    const { data } = await db
      .from("whatsapp_messages")
      .select("hospital_id, patient_id")
      .eq("wa_message_id", ev.contextId)
      .maybeSingle();
    if (data?.hospital_id) {
      const hospitalId = data.hospital_id as string;
      return {
        hospitalId,
        patientId:
          (data.patient_id as string | null) ??
          (await patientInClinic(db, waPhone, hospitalId)),
      };
    }
  }

  // 2. The clinic that has actually messaged this number (newest wins).
  {
    const { data } = await db
      .from("whatsapp_messages")
      .select("hospital_id")
      .eq("phone", waPhone)
      .eq("direction", "outbound")
      .not("hospital_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data?.hospital_id) {
      const hospitalId = data.hospital_id as string;
      return { hospitalId, patientId: await patientInClinic(db, waPhone, hospitalId) };
    }
  }

  // 3. Registered as a patient at exactly one clinic.
  const bare = stripCountryCode(waPhone);
  const { data: pts } = await db
    .from("patients")
    .select("id, hospital_id")
    .eq("phone", bare);
  const withClinic = (pts ?? []).filter((r: any) => r.hospital_id);
  const clinics = [...new Set(withClinic.map((r: any) => r.hospital_id))];
  if (clinics.length === 1) {
    return { hospitalId: clinics[0] as string, patientId: withClinic[0].id as string };
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
    const { patientId, hospitalId } = await resolveRouting(db, ev);
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
    if (!hospitalId) {
      console.warn(`[whatsapp-webhook] inbound from ${ev.from} could not be routed to a clinic`);
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
