/* ------------------------------------------------------------------
   messaging-send — send a prescription or a follow-up over WhatsApp,
   spend the credit, keep the ledger honest.

   The Supabase-hosted replacement for server/messaging (routes.js +
   service.js + providers/*). `server/` needs a public host and has
   none; this needs neither. Everything the Express version did is
   here, minus the operational EMAIL (Zoho creds aren't on Supabase —
   failures are logged instead; the credit refund, which is the part
   that costs a doctor real money, is a DB RPC and fully preserved).

   verify_jwt is ON. The caller is a signed-in clinic user; their token
   is verified by the platform before this runs, and `getUser()` here
   resolves WHO. `doctorId` is never read from the body — it names
   whose credits get spent.

   Route:  POST /functions/v1/messaging-send
   Body:   { purpose: "prescription" | "follow_up",
             patientId, prescriptionId?, visitId?, documentUrl?, followUpDate? }
   Reply:  200 { ok: true, messageId, status, balance, provider }
           200 { ok: false, error, message }   ← doctor-actionable (no credits,
                                                  no phone, rate limit, …)
           5xx { ok: false, error: "server_error", message }   ← a bug
------------------------------------------------------------------- */

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.45.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function admin(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
}

// ── Errors ────────────────────────────────────────────────────────────────
// MessagingError → a message written FOR the doctor, returned as 200 { ok:false }
// so the browser reads `.message` verbatim. Anything else is a bug → 5xx.
class MessagingError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.code = code;
  }
}

// ── Rate limit ────────────────────────────────────────────────────────────
// Per doctor, in memory. Not for abuse (this is behind a clinic login) — for
// the frustrated double-click that would otherwise spend four credits and
// send the patient four identical prescriptions. Module state is per isolate,
// so this is best-effort across a scaled deployment — same caveat the Express
// version stated for its single process.
const SEND_WINDOW_MS = 10_000;
const SEND_MAX_IN_WINDOW = 3;
const recentSends = new Map<string, number[]>();

function rateLimited(doctorId: string): boolean {
  const now = Date.now();
  const hits = (recentSends.get(doctorId) ?? []).filter((t) => now - t < SEND_WINDOW_MS);
  if (hits.length >= SEND_MAX_IN_WINDOW) {
    recentSends.set(doctorId, hits);
    return true;
  }
  hits.push(now);
  recentSends.set(doctorId, hits);
  return false;
}

// ── Identity ──────────────────────────────────────────────────────────────
async function resolveCaller(db: SupabaseClient, jwt: string) {
  const { data: { user }, error } = await db.auth.getUser(jwt);
  if (error || !user) throw new MessagingError("Your session has expired — sign in again.", "bad_token");

  const { data: profile } = await db
    .from("users")
    .select("id, full_name, role, hospital_id, is_active")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile) throw new MessagingError("This account is not set up for a clinic.", "unknown_user");
  if (profile.is_active === false) throw new MessagingError("This account has been deactivated.", "inactive_user");

  const { data: doctor } = await db
    .from("doctors")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  return {
    userId: user.id,
    role: profile.role as string | null,
    hospitalId: profile.hospital_id as string,
    doctorId: (doctor?.id as string | null) ?? null,
  };
}

// ── Phone + name helpers (ported verbatim from service.js) ────────────────
function formatDoctorName(raw: string | null): string {
  const bare = String(raw ?? "").trim().replace(/^d[r]\.?\s+/i, "").trim();
  return bare ? `Dr. ${bare}` : "your doctor";
}

function normalisePhone(raw: string | null): string | null {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, "");
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return digits;
  if (digits.length >= 11 && digits.length <= 15) return digits;
  return null;
}

// ── Provider (ported from providers/ + whatsapp/client.js) ────────────────
const META_GRAPH_VERSION = "v21.0";
const FAST2SMS_GRAPH_VERSION = "v26.0";

function whatsappTransport(): { label: string; url: string; headers: Record<string, string> } {
  const phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");
  if (!phoneNumberId) throw new Error("WHATSAPP_PHONE_NUMBER_ID not set");

  const fast2smsKey = Deno.env.get("FAST2SMS_API_KEY");
  if (fast2smsKey) {
    const version = Deno.env.get("WHATSAPP_GRAPH_VERSION") || FAST2SMS_GRAPH_VERSION;
    return {
      label: "fast2sms",
      url: `https://www.fast2sms.com/dev/whatsapp/${version}/${phoneNumberId}/messages`,
      headers: { Authorization: fast2smsKey, "Content-Type": "application/json" },
    };
  }

  const accessToken = Deno.env.get("WHATSAPP_ACCESS_TOKEN");
  if (!accessToken) throw new Error("Neither FAST2SMS_API_KEY nor WHATSAPP_ACCESS_TOKEN is set");
  const version = Deno.env.get("WHATSAPP_GRAPH_VERSION") || META_GRAPH_VERSION;
  return {
    label: "meta",
    url: `https://graph.facebook.com/${version}/${phoneNumberId}/messages`,
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
  };
}

async function callGraphApi(body: unknown): Promise<{ messages: Array<{ id: string }> }> {
  const t = whatsappTransport();
  const res = await fetch(t.url, { method: "POST", headers: t.headers, body: JSON.stringify(body) });
  const data = await res.json().catch(() => null) as
    | { messages?: Array<{ id: string }>; error?: { message?: string }; message?: string }
    | null;
  if (!res.ok) {
    const detail = data?.error?.message || data?.message || res.statusText;
    throw new Error(`WhatsApp send failed (${res.status}) via ${t.label}: ${detail}`);
  }
  if (!data?.messages?.[0]?.id) {
    const detail = data?.error?.message || data?.message || "provider returned no message id";
    throw new Error(`WhatsApp send failed via ${t.label}: ${detail}`);
  }
  return data as { messages: Array<{ id: string }> };
}

interface OutMessage {
  to: string;
  purpose: "prescription" | "follow_up";
  patientName: string | null;
  clinicName: string;
  doctorName: string;
  documentUrl: string | null;
  followUpDate: string | null;
}

function templateFor(purpose: OutMessage["purpose"]) {
  if (purpose === "prescription") {
    return {
      name: Deno.env.get("WHATSAPP_TEMPLATE_PRESCRIPTION") || "en_prescription_ready02",
      language: Deno.env.get("WHATSAPP_TEMPLATE_LANG") || "en",
    };
  }
  return {
    name: Deno.env.get("WHATSAPP_TEMPLATE_FOLLOW_UP") || "aren_follow_up",
    language: Deno.env.get("WHATSAPP_TEMPLATE_LANG") || "en",
  };
}

function urlButtonParam(value: string) {
  return Deno.env.get("WHATSAPP_BUTTON_PARAM_STYLE") === "payload"
    ? { type: "payload", payload: value }
    : { type: "text", text: value };
}

function buildComponents(m: OutMessage): unknown[] {
  if (m.purpose === "prescription") {
    const components: unknown[] = [
      { type: "header", parameters: [{ type: "text", text: m.patientName || "there" }] },
      {
        type: "body",
        parameters: [
          { type: "text", text: m.doctorName || "your doctor" },
          { type: "text", text: m.clinicName || "your clinic" },
        ],
      },
    ];
    if (m.documentUrl) {
      components.push({
        type: "button",
        sub_type: "url",
        index: "0",
        parameters: [urlButtonParam(m.documentUrl)],
      });
    }
    return components;
  }
  return [
    {
      type: "body",
      parameters: [
        { type: "text", text: m.patientName || "there" },
        { type: "text", text: m.followUpDate || "soon" },
        { type: "text", text: m.clinicName || "your clinic" },
      ],
    },
  ];
}

/** MESSAGING_PROVIDER selects the path. `mock` runs the full credit/ledger
 *  flow and only simulates the WhatsApp hop. An explicitly-named provider is
 *  never second-guessed — no silent downgrade to mock. */
async function providerSend(m: OutMessage): Promise<{ providerMessageId: string; name: string }> {
  const named = Deno.env.get("MESSAGING_PROVIDER");
  const name = named || (Deno.env.get("WHATSAPP_ACCESS_TOKEN") ? "meta" : "mock");

  if (name === "mock") {
    const failureRate = Number(Deno.env.get("MESSAGING_MOCK_FAILURE_RATE") || 0);
    if (failureRate > 0 && Math.random() < failureRate) {
      const err = new Error("simulated failure (MESSAGING_MOCK_FAILURE_RATE)") as Error & { providerDetail?: string };
      err.providerDetail = "simulated failure (MESSAGING_MOCK_FAILURE_RATE)";
      throw err;
    }
    await new Promise((r) => setTimeout(r, 200));
    const id = `wamid.MOCK${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    return { providerMessageId: id, name: "mock" };
  }

  if (name !== "meta" && name !== "fast2sms") {
    throw new Error(`MESSAGING_PROVIDER="${name}" is not a known provider (meta, fast2sms, mock)`);
  }

  const { name: templateName, language } = templateFor(m.purpose);
  try {
    const data = await callGraphApi({
      messaging_product: "whatsapp",
      to: m.to,
      type: "template",
      template: {
        name: templateName,
        language: { code: language },
        components: buildComponents(m),
      },
    });
    return { providerMessageId: data.messages[0].id, name };
  } catch (e) {
    const err = new Error((e as Error).message) as Error & { providerDetail?: string };
    err.providerDetail = (e as Error).message;
    throw err;
  }
}

// ── Context load (ported from service.js loadContext) ─────────────────────
async function loadContext(
  db: SupabaseClient,
  doctorId: string,
  patientId: string,
) {
  const [doctorRes, patientRes] = await Promise.all([
    db.from("doctors").select("id, name, hospital_id, hospitals(name)").eq("id", doctorId).maybeSingle(),
    db.from("patients").select("id, name, phone, hospital_id").eq("id", patientId).maybeSingle(),
  ]);
  const doctor = doctorRes.data as { id: string; name: string | null; hospital_id: string; hospitals?: { name?: string } | null } | null;
  const patient = patientRes.data as { id: string; name: string | null; phone: string | null; hospital_id: string | null } | null;

  if (!doctor) throw new MessagingError("We could not find your doctor profile.", "no_doctor");
  if (!patient) throw new MessagingError("We could not find that patient.", "no_patient");
  if (patient.hospital_id && doctor.hospital_id && patient.hospital_id !== doctor.hospital_id) {
    throw new MessagingError("That patient belongs to another clinic.", "cross_clinic");
  }

  const phone = normalisePhone(patient.phone);
  if (!phone) {
    throw new MessagingError(
      `${patient.name || "This patient"} has no WhatsApp number on file. Add one on their record first.`,
      "no_phone",
    );
  }

  return {
    doctorId: doctor.id,
    doctorName: formatDoctorName(doctor.name),
    hospitalId: doctor.hospital_id,
    clinicName: doctor.hospitals?.name || "your clinic",
    patientId: patient.id,
    patientName: patient.name || null,
    phone,
  };
}

async function currentBalance(db: SupabaseClient, doctorId: string): Promise<number> {
  const { data } = await db
    .from("messaging_credit_balances")
    .select("balance")
    .eq("doctor_id", doctorId)
    .maybeSingle();
  return Number((data as { balance?: number } | null)?.balance ?? 0);
}

async function prescriptionShareToken(db: SupabaseClient, prescriptionId: string | null): Promise<string | null> {
  if (!prescriptionId) return null;
  const { data, error } = await db
    .from("prescriptions")
    .select("share_token")
    .eq("id", prescriptionId)
    .maybeSingle();
  if (error) {
    console.warn(`[messaging-send] could not read share_token for ${prescriptionId}: ${error.message}`);
    return null;
  }
  return (data as { share_token?: string } | null)?.share_token || null;
}

// ── The send (ported from service.js sendMessage) ────────────────────────
interface SendInput {
  doctorId: string;
  patientId: string;
  purpose: "prescription" | "follow_up";
  prescriptionId: string | null;
  visitId: string | null;
  documentUrl: string | null;
  followUpDate: string | null;
}

async function sendMessage(db: SupabaseClient, input: SendInput) {
  const cost = 1; // every message is one credit today

  const ctx = await loadContext(db, input.doctorId, input.patientId);

  const before = await currentBalance(db, ctx.doctorId);
  if (before < cost) {
    throw new MessagingError(
      "Messaging credits exhausted. Recharge to continue sending messages.",
      "insufficient_credits",
    );
  }

  const preview = input.purpose === "prescription"
    ? `Prescription for ${ctx.patientName || "patient"}`
    : `Follow-up reminder for ${ctx.patientName || "patient"}`;

  const { data: row, error: insertError } = await db
    .from("whatsapp_messages")
    .insert({
      direction: "outbound",
      phone: ctx.phone,
      patient_id: ctx.patientId,
      prescription_id: input.prescriptionId,
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
  const messageId = (row as { id: number }).id;

  // ── Debit ──────────────────────────────────────────────────────────────
  let ledgerId: unknown;
  try {
    const { data, error } = await db.rpc("debit_messaging_credit", {
      p_doctor_id: ctx.doctorId,
      p_credits: cost,
      p_message_id: messageId,
      p_note: preview,
    });
    if (error) throw error;
    ledgerId = data;
  } catch (e) {
    await db.from("whatsapp_messages").delete().eq("id", messageId);
    if (String((e as Error).message || "").includes("INSUFFICIENT_CREDITS")) {
      throw new MessagingError(
        "Messaging credits exhausted. Recharge to continue sending messages.",
        "insufficient_credits",
      );
    }
    throw new Error(`sendMessage debit: ${(e as Error).message}`);
  }

  // ── Send ───────────────────────────────────────────────────────────────
  const buttonParam = input.purpose === "prescription"
    ? (input.documentUrl ?? (await prescriptionShareToken(db, input.prescriptionId)))
    : null;

  try {
    const result = await providerSend({
      to: ctx.phone,
      purpose: input.purpose,
      patientName: ctx.patientName,
      clinicName: ctx.clinicName,
      doctorName: ctx.doctorName,
      documentUrl: buttonParam,
      followUpDate: input.followUpDate,
    });

    await db.from("whatsapp_messages")
      .update({ wa_message_id: result.providerMessageId, status: "sent", credits_charged: cost })
      .eq("id", messageId);

    const balance = await currentBalance(db, ctx.doctorId);
    return { ok: true as const, messageId, status: "sent", balance, provider: result.name };
  } catch (e) {
    const detail = (e as Error & { providerDetail?: string }).providerDetail
      || (e as Error).message
      || "Unknown provider error";

    // Refund FIRST — the doctor's credit coming back must not depend on
    // anything after this line.
    try {
      await db.rpc("refund_messaging_credit", {
        p_ledger_id: ledgerId,
        p_note: `Send failed: ${detail}`.slice(0, 300),
      });
    } catch (refundError) {
      console.error(
        `[messaging-send] REFUND FAILED for ledger ${ledgerId} (message ${messageId}):`,
        (refundError as Error).message,
      );
    }

    await db.from("whatsapp_messages")
      .update({ status: "failed", error_detail: detail.slice(0, 500), credits_charged: 0 })
      .eq("id", messageId);

    // Operational email alerts (notify / provider_error) are not ported —
    // Zoho creds aren't on Supabase. The failure is logged; support can read
    // whatsapp_messages.error_detail. Wire a call to `support-notify` here
    // once that function accepts a service-role caller.
    console.error(`[messaging-send] send failed (message ${messageId}): ${detail}`);

    throw new MessagingError(
      "WhatsApp could not deliver this message. Your credit has been refunded.",
      "send_failed",
    );
  }
}

// ── HTTP ──────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "bad_request", message: "POST only." }, 405);

  const jwt = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!jwt) return json({ ok: false, error: "no_token", message: "Sign in again." }, 401);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "bad_json", message: "Bad request." }, 400);
  }

  const db = admin();

  try {
    const who = await resolveCaller(db, jwt);
    if (!who.doctorId) {
      return json({ ok: false, error: "not_a_doctor", message: "Only a doctor can send a prescription or follow-up." });
    }
    if (rateLimited(who.doctorId)) {
      return json({ ok: false, error: "too_many", message: "That message is already on its way — give it a moment." });
    }

    const purpose = String(body.purpose ?? "");
    if (purpose !== "prescription" && purpose !== "follow_up") {
      return json({ ok: false, error: "bad_purpose", message: `Unknown message type "${purpose}".` });
    }
    const patientId = String(body.patientId ?? "").trim();
    if (!patientId) {
      return json({ ok: false, error: "no_patient", message: "No patient was named." });
    }

    const result = await sendMessage(db, {
      doctorId: who.doctorId, // from the session, never the body
      patientId,
      purpose,
      prescriptionId: (body.prescriptionId as string | null) || null,
      visitId: (body.visitId as string | null) || null,
      documentUrl: (body.documentUrl as string | null) || null,
      followUpDate: (body.followUpDate as string | null) || null,
    });
    return json(result);
  } catch (e) {
    if (e instanceof MessagingError) {
      return json({ ok: false, error: e.code, message: e.message });
    }
    console.error("[messaging-send]", e);
    return json(
      { ok: false, error: "server_error", message: "Something went wrong sending that message. Please try again." },
      500,
    );
  }
});
