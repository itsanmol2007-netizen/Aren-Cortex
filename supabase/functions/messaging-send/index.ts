/* ------------------------------------------------------------------
   messaging-send — send a prescription or a follow-up over WhatsApp,
   spend the credit, keep the ledger honest.

   The Supabase-hosted replacement for server/messaging (routes.js +
   service.js + providers/*). Everything the Express version did is
   here (failures are logged in DB; operational support emails are handled
   via support-notify powered by Amazon SES; credit refund is a DB RPC).

   verify_jwt is ON. The caller is a signed-in clinic user; their token
   is verified by the platform before this runs, and `getUser()` here
   resolves WHO. `doctorId` is never read from the body — it names
   whose credits get spent.

   Route:  POST /functions/v1/messaging-send
   Body:   { purpose: "prescription" | "follow_up",
             patientId, prescriptionId?, visitId?, documentUrl?, followUpDate?,
             language?: "en" | "hi" | "hi-Latn" }
         | { purpose: "lab_order", handoffId }   ← 2026-09-27, see sendLabOrder
   Reply:  200 { ok: true, messageId, status, balance, provider }
           200 { ok: false, error, message }   ← doctor-actionable (no credits,
                                                  no phone, rate limit, the
                                                  language's template not
                                                  configured yet, …)
           5xx { ok: false, error: "server_error", message }   ← a bug

   ── Multilingual prescriptions (2026-09-11, templates finalised 2026-09-14) ─
   `language` picks which APPROVED WhatsApp template gets used — never a
   machine translation of anything. Hindi and Hinglish need their own Meta
   template (env vars WHATSAPP_TEMPLATE_PRESCRIPTION_HI / _HI_LATN below)
   submitted and APPROVED by Anmol first. Until that env var is set for a
   language, `resolveTemplate` throws a clean, doctor-facing MessagingError
   BEFORE anything is written — no row, no credit touched, and definitely
   no send attempted in an unapproved template. Nothing in this file sets
   those secrets or sends a non-English message on its own.

   Hindi's approved shape matches English's exactly (header: patient name;
   body: doctor, clinic). Hinglish's does NOT — see `buildComponents`'s own
   comment for the real difference (a static header with no variables at
   all, and a three-parameter body). This is the one place in the file
   where "another language" stopped meaning "the same shape, different
   words" — everything else here (phone, credits, logging) is identical
   across all three.
------------------------------------------------------------------- */

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.45.4";

type RxLanguage = "en" | "hi" | "hi-Latn";

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

// ── Phone + name helpers ────────────────────────────────────────────────
// `doctors.name` is now canonically "Dr. <name>", exactly once, enforced at
// the data layer (migration 20260919_normalize_doctor_name_prefix.sql —
// backfilled every existing row and added a trigger that normalizes every
// future write). This used to strip-and-reapply "Dr. " itself, which is
// what caused the real, live bug Anmol reported — "sometimes there is two
// DR, sometimes there is no" — every surface's OWN idea of the honorific
// disagreeing with what was actually stored. Trust the stored value.
function formatDoctorName(raw: string | null): string {
  const bare = String(raw ?? "").trim();
  return bare || "your doctor";
}

/** The Devanagari name the doctor/admin confirmed once (Clinic page,
 *  `doctors.name_hi` / `hospitals.name_hi` — migration
 *  `20260911_hindi_display_names`), used for the WhatsApp template's own
 *  clinic-name variable. Falls back to `latin` when nothing has been
 *  confirmed yet — never guessed at send time. Mirrors `hiName()` in
 *  the Cortex repo's lib/i18n/prescriptionLabels.ts; this repo copies it
 *  rather than sharing a module.
 *
 *  Anmol, 2026-09-14, submitting the actual approved templates: "use actual
 *  hindi name of clinic which is available in devnagri lang, for fallback
 *  use english name" — for BOTH Hindi and Hinglish. The Hinglish template's
 *  own submitted copy already keeps the clinic name distinct from the rest
 *  of its Latin-script body (its sample used the clinic's plain name, but
 *  a clinic's own registered identity is exactly the kind of proper noun
 *  that stays in its native script even inside an otherwise-transliterated
 *  message — the same instinct that keeps a brand name unchanged across
 *  languages). Doctor name is NOT widened the same way: nothing asked for
 *  that, and the submitted Hinglish sample ("Dr SK Pandey") is plainly
 *  Latin, not Devanagari — so `doctorName`'s own check, in `loadContext`
 *  below, still reads `language === "hi"` alone. */
function hiName(language: RxLanguage, latin: string, nameHi: string | null): string {
  const prefersDevanagari = language === "hi" || language === "hi-Latn";
  if (prefersDevanagari && nameHi && nameHi.trim()) return nameHi.trim();
  return latin;
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
  purpose: "prescription" | "follow_up" | "lab_order";
  language: RxLanguage;
  patientName: string | null;
  clinicName: string;
  doctorName: string;
  documentUrl: string | null;
  followUpDate: string | null;
  /** lab_order only: {{2}} "Rajesh Kumar (42M)", {{3}} the tests, {{4}} priority */
  lab?: { patientLabel: string; tests: string; priority: string };
}

/**
 * Which approved Meta template + language code to send. English always has
 * one (the long-standing default). Hindi/Hinglish only have one once Anmol
 * has submitted it to Meta AND set the matching env var — see the file
 * header. No fallback to English when the requested language is missing:
 * a doctor who picked Hindi and got an English message back would not
 * notice the substitution until the patient did.
 */
function resolveTemplate(purpose: OutMessage["purpose"], language: RxLanguage) {
  // An investigation order to a lab: one approved English template,
  // `lab_investigation_order` (Anmol, 2026-09-27). Labs read English; the
  // doctor's prescription language does not apply to it.
  if (purpose === "lab_order") {
    return {
      name: Deno.env.get("WHATSAPP_TEMPLATE_LAB_ORDER") || "lab_investigation_order",
      language: Deno.env.get("WHATSAPP_TEMPLATE_LAB_ORDER_LANG") || "en",
    };
  }
  // Same three-language shape as prescription, below — added 2026-09-14
  // alongside the follow-up cron (`follow-up-cron/index.ts`), which is the
  // first real caller of a follow-up in anything but English. Until then
  // `language` was silently ignored here; every follow-up sent as English
  // regardless of what was asked for, which was fine while there was
  // exactly one follow-up template and no caller ever requested another.
  if (purpose === "follow_up") {
    if (language === "en") {
      return {
        name: Deno.env.get("WHATSAPP_TEMPLATE_FOLLOW_UP") || "aren_follow_up",
        language: Deno.env.get("WHATSAPP_TEMPLATE_LANG") || "en",
      };
    }
    const suffix = language === "hi" ? "_HI" : "_HI_LATN";
    const name = Deno.env.get(`WHATSAPP_TEMPLATE_FOLLOW_UP${suffix}`);
    if (!name) {
      const label = language === "hi" ? "Hindi" : "Hinglish";
      throw new MessagingError(
        `The ${label} follow-up template isn't approved and configured yet. Switch back to English, or ask support to finish setting it up.`,
        "template_not_configured",
      );
    }
    return {
      name,
      language: Deno.env.get(`WHATSAPP_TEMPLATE_LANG${suffix}`) || (language === "hi" ? "hi" : "en"),
    };
  }

  if (language === "en") {
    return {
      name: Deno.env.get("WHATSAPP_TEMPLATE_PRESCRIPTION") || "en_prescription_ready02",
      language: Deno.env.get("WHATSAPP_TEMPLATE_LANG") || "en",
    };
  }

  const suffix = language === "hi" ? "_HI" : "_HI_LATN";
  const name = Deno.env.get(`WHATSAPP_TEMPLATE_PRESCRIPTION${suffix}`);
  if (!name) {
    const label = language === "hi" ? "Hindi" : "Hinglish";
    throw new MessagingError(
      `The ${label} prescription template isn't approved and configured yet. Switch back to English, or ask support to finish setting it up.`,
      "template_not_configured",
    );
  }
  return {
    name,
    language: Deno.env.get(`WHATSAPP_TEMPLATE_LANG${suffix}`) || (language === "hi" ? "hi" : "en"),
  };
}

function urlButtonParam(value: string) {
  return Deno.env.get("WHATSAPP_BUTTON_PARAM_STYLE") === "payload"
    ? { type: "payload", payload: value }
    : { type: "text", text: value };
}

/**
 * The prescription templates, as actually submitted to Meta (2026-09-14):
 *
 *   en / hi  (`en_prescription_ready02` / `02prescription_ready_hi`)
 *     header: {{1}} patient name
 *     body:   {{1}} doctor name, {{2}} clinic name
 *
 *   hi-Latn  (`02prescription_ready_hinglish`, registered under Meta's
 *             "English" language — there is no dedicated Hinglish code)
 *     header: STATIC TEXT, no variables at all ("Aapka Prescription Ready
 *             ho chuka hai") — its header can't carry the patient's name,
 *             so the body carries it instead.
 *     body:   {{1}} patient name, {{2}} doctor name, {{3}} clinic name
 *
 * English and Hindi share one shape; Hinglish is genuinely different, not
 * just differently worded — sending the EN/HI shape's two-parameter body
 * against a template Meta approved with three would be a parameter-count
 * mismatch the Graph API rejects outright, not a silent wrong-language
 * substitution. A header component must be OMITTED entirely for Hinglish
 * (not sent with an empty `parameters` array) — a component for a slot the
 * approved template has no variables in is itself a malformed request.
 */
/** A template variable may not carry a newline, a tab or a run of spaces. */
function oneLine(s: string, max = 900): string {
  const t = s.replace(/[\r\n\t]+/g, " ").replace(/ {2,}/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/**
 * `lab_investigation_order`, as submitted to Meta (2026-09-27):
 *   header: "New Investigation Request from {{1}}"      {{1}} clinic name
 *   body:   {{1}} doctor, {{2}} "Rajesh Kumar (42M)", {{3}} the tests,
 *           {{4}} priority
 *   button: "View order" → https://app.arenode.com/lab-orders/{{1}}
 *           {{1}} the handoff's share token
 */
function buildLabComponents(m: OutMessage): unknown[] {
  const lab = m.lab!;
  return [
    { type: "header", parameters: [{ type: "text", text: oneLine(m.clinicName || "a clinic", 60) }] },
    {
      type: "body",
      parameters: [
        { type: "text", text: oneLine(m.doctorName || "The doctor", 120) },
        { type: "text", text: oneLine(lab.patientLabel, 120) },
        { type: "text", text: oneLine(lab.tests) },
        { type: "text", text: oneLine(lab.priority, 40) },
      ],
    },
    { type: "button", sub_type: "url", index: "0", parameters: [urlButtonParam(m.documentUrl || "")] },
  ];
}

function buildComponents(m: OutMessage): unknown[] {
  if (m.purpose === "lab_order") return buildLabComponents(m);
  if (m.purpose === "prescription") {
    const components: unknown[] = [];

    if (m.language !== "hi-Latn") {
      components.push({
        type: "header",
        parameters: [{ type: "text", text: m.patientName || "there" }],
      });
    }

    components.push({
      type: "body",
      parameters: m.language === "hi-Latn"
        ? [
            { type: "text", text: m.patientName || "there" },
            { type: "text", text: m.doctorName || "your doctor" },
            { type: "text", text: m.clinicName || "your clinic" },
          ]
        : [
            { type: "text", text: m.doctorName || "your doctor" },
            { type: "text", text: m.clinicName || "your clinic" },
          ],
    });

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

  const { name: templateName, language: templateLang } = resolveTemplate(m.purpose, m.language);
  // Meta files an "English" template under en, en_US or en_GB depending on
  // what was picked when it was submitted, and a wrong code reads exactly
  // like a missing template ("Template not found"). So an English send that
  // is not found is retried under the other English codes before failing.
  const langs = templateLang.startsWith("en")
    ? [templateLang, ...["en", "en_US", "en_GB"].filter((c) => c !== templateLang)]
    : [templateLang];
  let last: Error | null = null;
  for (const code of langs) {
    try {
      const data = await callGraphApi({
        messaging_product: "whatsapp",
        to: m.to,
        type: "template",
        template: {
          name: templateName,
          language: { code },
          components: buildComponents(m),
        },
      });
      return { providerMessageId: data.messages[0].id, name };
    } catch (e) {
      last = e as Error;
      if (!isTemplateMissing(last.message)) break;
    }
  }
  const detail = `${last?.message ?? "send failed"} [template ${templateName}, tried ${langs.join("/")}]`;
  const err = new Error(detail) as Error & { providerDetail?: string };
  err.providerDetail = detail;
  throw err;
}

function isTemplateMissing(detail: string): boolean {
  return /template (name )?(does not exist|not found)|132001/i.test(detail);
}

// ── Context load (ported from service.js loadContext) ─────────────────────
async function loadContext(
  db: SupabaseClient,
  doctorId: string,
  patientId: string,
  language: RxLanguage,
) {
  const [doctorRes, patientRes] = await Promise.all([
    db.from("doctors").select("id, name, name_hi, hospital_id, hospitals(name, name_hi)").eq("id", doctorId).maybeSingle(),
    db.from("patients").select("id, name, phone, hospital_id").eq("id", patientId).maybeSingle(),
  ]);
  const doctor = doctorRes.data as {
    id: string; name: string | null; name_hi: string | null; hospital_id: string;
    hospitals?: { name?: string; name_hi?: string | null } | null;
  } | null;
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

  // Devanagari names win in Hindi mode ONLY once confirmed on the Clinic page
  // (hiName falls back to Latin otherwise) — "Dr. " is skipped on the
  // Devanagari branch since a confirmed name_hi already reads exactly as the
  // doctor wants it to, honorific included if they wrote one in.
  const doctorName = language === "hi" && doctor.name_hi?.trim()
    ? doctor.name_hi.trim()
    : formatDoctorName(doctor.name);
  const clinicName = hiName(language, doctor.hospitals?.name || "your clinic", doctor.hospitals?.name_hi ?? null);

  return {
    doctorId: doctor.id,
    doctorName,
    hospitalId: doctor.hospital_id,
    clinicName,
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
  language: RxLanguage;
  prescriptionId: string | null;
  visitId: string | null;
  documentUrl: string | null;
  followUpDate: string | null;
}

async function sendMessage(db: SupabaseClient, input: SendInput) {
  const cost = 1; // every message is one credit today

  // Fail fast on a language whose template isn't configured — BEFORE any
  // row is written or credit touched. Doing this check only inside
  // providerSend (further down, after the debit) would mean a doctor who
  // picks Hindi before it's approved gets charged and refunded for nothing.
  resolveTemplate(input.purpose, input.language);

  const ctx = await loadContext(db, input.doctorId, input.patientId, input.language);

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

  const sent = await chargeAndSend(db, {
    phone: ctx.phone,
    patientId: ctx.patientId,
    prescriptionId: input.prescriptionId,
    hospitalId: ctx.hospitalId,
    doctorId: ctx.doctorId,
    purpose: input.purpose,
    preview,
  }, async () => ({
    to: ctx.phone,
    purpose: input.purpose,
    language: input.language,
    patientName: ctx.patientName,
    clinicName: ctx.clinicName,
    doctorName: ctx.doctorName,
    documentUrl: input.purpose === "prescription"
      ? (input.documentUrl ?? (await prescriptionShareToken(db, input.prescriptionId)))
      : null,
    followUpDate: input.followUpDate,
  }));

  // Record what language this prescription actually went out in, so the
  // public page (prescription-preview) can open in the same language
  // instead of always defaulting to English — see migration
  // 20260919_prescription_last_sent_language.sql. Best-effort: a doctor's
  // send must never fail because this one bookkeeping write did.
  if (input.purpose === "prescription" && input.prescriptionId) {
    await db.from("prescriptions")
      .update({ last_sent_language: input.language })
      .eq("id", input.prescriptionId)
      .then(({ error }) => {
        if (error) console.warn(`[messaging-send] last_sent_language update failed: ${error.message}`);
      });
  }

  const balance = await currentBalance(db, ctx.doctorId);
  return { ok: true as const, messageId: sent.messageId, status: "sent", balance, provider: sent.provider };
}

/**
 * Log, debit one credit, send, and on failure refund and say so. The one
 * path every outgoing message takes, whoever it goes to: a prescription or
 * follow-up to the patient, an investigation order to a lab (every message
 * spends a credit; Anmol, 2026-09-27).
 */
async function chargeAndSend(
  db: SupabaseClient,
  log: {
    phone: string; patientId: string; prescriptionId: string | null; hospitalId: string;
    doctorId: string; purpose: OutMessage["purpose"]; preview: string;
  },
  build: () => Promise<OutMessage>,
): Promise<{ messageId: number; provider: string }> {
  const cost = 1;
  const { data: row, error: insertError } = await db
    .from("whatsapp_messages")
    .insert({
      direction: "outbound",
      phone: log.phone,
      patient_id: log.patientId,
      prescription_id: log.prescriptionId,
      hospital_id: log.hospitalId,
      doctor_id: log.doctorId,
      purpose: log.purpose,
      message_type: "template",
      body_preview: log.preview,
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
      p_doctor_id: log.doctorId,
      p_credits: cost,
      p_message_id: messageId,
      p_note: log.preview,
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
  try {
    const result = await providerSend(await build());
    await db.from("whatsapp_messages")
      .update({ wa_message_id: result.providerMessageId, status: "sent", credits_charged: cost })
      .eq("id", messageId);
    return { messageId, provider: result.name };
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

    // Operational failure is logged in whatsapp_messages.error_detail;
    // support can read and action, and support-notify dispatches alerts via Amazon SES.
    console.error(`[messaging-send] send failed (message ${messageId}): ${detail}`);

    if (isTemplateMissing(detail)) {
      throw new MessagingError(
        "This WhatsApp template isn't live yet (still in review, or saved under a different name). Your credit has been refunded.",
        "template_missing",
      );
    }
    throw new MessagingError(
      "WhatsApp could not deliver this message. Your credit has been refunded.",
      "send_failed",
    );
  }
}

// ── An investigation order, to a lab ────────────────────────────────────
// The handoff row (lab_order_handoffs) was written by the doctor's own
// session under RLS, with everything the lab's page shows; this sends the
// template that points at it and marks it sent. The recipient is the lab's
// number, never the patient's.
const PRIORITY_LABEL: Record<string, string> = { routine: "Routine", urgent: "Urgent", stat: "STAT" };

async function sendLabOrder(db: SupabaseClient, doctorId: string, handoffId: string) {
  resolveTemplate("lab_order", "en");

  const { data: h } = await db
    .from("lab_order_handoffs")
    .select("id, share_token, hospital_id, patient_id, prescription_id, lab_name, lab_phone, priority, tests, status")
    .eq("id", handoffId)
    .maybeSingle();
  const handoff = h as {
    id: string; share_token: string; hospital_id: string; patient_id: string; prescription_id: string | null;
    lab_name: string; lab_phone: string | null; priority: string;
    tests: { name: string; site?: string | null }[]; status: string;
  } | null;
  if (!handoff) throw new MessagingError("That lab order could not be found.", "no_handoff");

  const [doctorRes, patientRes] = await Promise.all([
    db.from("doctors").select("id, name, hospital_id, hospitals(name)").eq("id", doctorId).maybeSingle(),
    db.from("patients").select("id, name, age, gender").eq("id", handoff.patient_id).maybeSingle(),
  ]);
  const doctor = doctorRes.data as { id: string; name: string | null; hospital_id: string; hospitals?: { name?: string } | null } | null;
  const patient = patientRes.data as { id: string; name: string | null; age: number | null; gender: string | null } | null;
  if (!doctor) throw new MessagingError("We could not find your doctor profile.", "no_doctor");
  if (doctor.hospital_id !== handoff.hospital_id) {
    throw new MessagingError("That lab order belongs to another clinic.", "cross_clinic");
  }
  if (!patient) throw new MessagingError("We could not find that patient.", "no_patient");

  const phone = normalisePhone(handoff.lab_phone);
  if (!phone) {
    throw new MessagingError(`${handoff.lab_name} has no WhatsApp number. Add one in Practice > Preferred Labs.`, "no_phone");
  }

  const before = await currentBalance(db, doctor.id);
  if (before < 1) {
    throw new MessagingError("Messaging credits exhausted. Recharge to continue sending messages.", "insufficient_credits");
  }

  const g = (patient.gender ?? "").trim().charAt(0).toUpperCase();
  const ageSex = [patient.age != null ? String(patient.age) : "", g].join("");
  const patientLabel = `${patient.name || "Patient"}${ageSex ? ` (${ageSex})` : ""}`;
  const tests = (handoff.tests ?? [])
    .map((t) => (t.site && !t.name.toLowerCase().includes(String(t.site).toLowerCase()) ? `${t.name} - ${t.site}` : t.name))
    .join(", ");
  const priority = PRIORITY_LABEL[handoff.priority] ?? "Routine";
  const clinicName = doctor.hospitals?.name || "the clinic";
  const doctorName = formatDoctorName(doctor.name);

  let sent: { messageId: number; provider: string };
  try {
    sent = await chargeAndSend(db, {
      phone,
      patientId: patient.id,
      prescriptionId: handoff.prescription_id,
      hospitalId: handoff.hospital_id,
      doctorId: doctor.id,
      purpose: "lab_order",
      preview: `Lab order for ${patient.name || "patient"} to ${handoff.lab_name}`,
    }, async () => ({
      to: phone,
      purpose: "lab_order",
      language: "en",
      patientName: patient.name,
      clinicName,
      doctorName,
      documentUrl: handoff.share_token,
      followUpDate: null,
      lab: { patientLabel, tests: tests || "Investigations", priority },
    }));
  } catch (e) {
    await db.from("lab_order_handoffs").update({ status: "failed" }).eq("id", handoff.id);
    throw e;
  }

  await db.from("lab_order_handoffs")
    .update({ status: "sent", sent_at: new Date().toISOString(), whatsapp_message_id: sent.messageId })
    .eq("id", handoff.id);

  const balance = await currentBalance(db, doctor.id);
  return { ok: true as const, messageId: sent.messageId, status: "sent", balance, provider: sent.provider };
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
    if (purpose === "lab_order") {
      const handoffId = String(body.handoffId ?? "").trim();
      if (!handoffId) return json({ ok: false, error: "no_handoff", message: "No lab order was named." });
      return json(await sendLabOrder(db, who.doctorId, handoffId));
    }
    if (purpose !== "prescription" && purpose !== "follow_up") {
      return json({ ok: false, error: "bad_purpose", message: `Unknown message type "${purpose}".` });
    }
    const patientId = String(body.patientId ?? "").trim();
    if (!patientId) {
      return json({ ok: false, error: "no_patient", message: "No patient was named." });
    }

    const languageRaw = String(body.language ?? "en");
    const language: RxLanguage =
      languageRaw === "hi" || languageRaw === "hi-Latn" ? languageRaw : "en";

    const result = await sendMessage(db, {
      doctorId: who.doctorId, // from the session, never the body
      patientId,
      purpose,
      language,
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
