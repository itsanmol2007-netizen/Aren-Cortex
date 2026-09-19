/* ------------------------------------------------------------------
   follow-up-cron — the automated half of "send a follow-up reminder".

   `messaging-send` has always been ABLE to send a follow-up
   (`sendFollowUp` in lib/db/messaging.ts) — nothing in this codebase
   has ever CALLED it. Anmol, 2026-09-14: "we don't have a pipeline of
   sending follow-up messages, right? Why don't you build that?...
   you select three days follow up and the follow up message will go
   24 hours before the follow up."

   This is that pipeline's trigger. A daily cron (pg_cron, scheduled in
   the migration alongside this function) POSTs here once a day; this
   function finds every prescription whose follow-up date is TOMORROW,
   sends one WhatsApp reminder per patient, and stamps the attempt so
   it is never sent twice.

   ── OFF BY DEFAULT ─────────────────────────────────────────────────────
   `hospitals.follow_up_reminders_enabled` (2026-09-14) gates every
   candidate — see `findCandidates` below. A clinic opts in from its own
   Clinic page; nothing here ever sends for a clinic that hasn't. And the
   message itself is a REMINDER, nothing more — "here's your follow-up, you
   can come in" — never an offer to reschedule. There is no reschedule
   flow behind this product yet, so a template or a doctor-facing string
   that implied one would be promising a reply the app cannot act on.

   ── WHY A SEPARATE FUNCTION, NOT A NEW CALL INTO messaging-send ──────────
   Every send still goes through the exact same template resolution,
   provider call, credit debit/refund and `whatsapp_messages` logging
   as a doctor-initiated send — copied here rather than imported,
   matching how this codebase already treats logic shared across two
   deploy boundaries (see whatsapp.ts's `hiName()` comment: "this repo
   copies it rather than sharing a module"). `messaging-send`'s own
   copy is authoritative for the actual provider/template/credit
   mechanics; if that ever changes, mirror the change here too.

   What's genuinely different, and the actual reason this isn't just
   another `purpose` value on the same endpoint: `messaging-send` is
   ALWAYS called with a doctor's own JWT — `doctorId` comes from
   `getUser()`, never the body, specifically so a doctor can only ever
   spend their own credits. A cron job has no doctor sitting at a
   keyboard. This function is authorized differently (see below) and
   the doctor whose credits are spent comes from the CANDIDATE ROW,
   never a caller-supplied id.

   ── AUTHORIZATION ─────────────────────────────────────────────────────────
   `verify_jwt` is ON, so Supabase's own gateway already rejects
   anything without a valid Supabase-issued JWT before this code runs
   at all. On top of that, this checks the token's `role` claim is
   exactly `service_role` — the one JWT that is not a signed-in
   person, and the one the migration's cron job authenticates with
   (fetched from Supabase Vault at call time, never printed into a
   migration file or committed anywhere — see the migration's own
   comment). A doctor's ordinary JWT also passes gateway verification,
   so without this second check any signed-in doctor could trigger a
   mass send of every other clinic's reminders.

   ── LANGUAGE ───────────────────────────────────────────────────────────
   English only, for now. A prescription's `language` is a choice a
   doctor makes at the moment they click Send — nothing on the
   prescription row itself records which language THIS patient should
   be reminded in, and `doctors.default_language` is an existing,
   unrelated column (English for all 16 doctors today, values that
   don't match this file's `hi`/`hi-Latn`/`en` vocabulary at all) —
   repurposing it here would be guessing at a decision nobody has
   actually made yet. Once Hindi/Hinglish follow-up templates are
   approved AND there is a real place a doctor sets a patient's
   preferred language, this is the one line to change.

   Route:  POST /functions/v1/follow-up-cron   (cron-only; see above)
   Body:   {} — no input; finds its own candidates.
   Reply:  200 { ok: true, checked, sent, failed, skipped }
   ------------------------------------------------------------------- */

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.45.4";

/** The `role` claim out of a JWT's payload, with no signature check — the
 *  signature is already verified upstream by `verify_jwt` before this code
 *  runs at all (see this file's header); this only reads what that already-
 *  trusted token says. No dependency for something this small: a JWT payload
 *  is just the middle `.`-segment, base64url, JSON. */
function jwtRole(jwt: string): string | null {
  try {
    const payload = jwt.split(".")[1];
    const b64 = payload.replace(/-/g, "+").replace(/_/g, "/").padEnd(payload.length + (4 - (payload.length % 4)) % 4, "=");
    const json = JSON.parse(atob(b64));
    return typeof json.role === "string" ? json.role : null;
  } catch {
    return null;
  }
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function admin(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

// ── Provider send — ported verbatim from messaging-send/index.ts ─────────
// (transport selection, Graph API call, template component shapes). See
// that file for the full reasoning behind each piece; comments here cover
// only what's specific to the cron path.

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

/** English-only follow-up template — see this file's header. Mirrors
 *  `messaging-send`'s own `resolveTemplate`, follow-up branch. */
function resolveFollowUpTemplate() {
  return {
    name: Deno.env.get("WHATSAPP_TEMPLATE_FOLLOW_UP") || "aren_follow_up",
    language: Deno.env.get("WHATSAPP_TEMPLATE_LANG") || "en",
  };
}

function normalisePhone(raw: string | null): string | null {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, "");
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return digits;
  if (digits.length >= 11 && digits.length <= 15) return digits;
  return null;
}

async function providerSend(m: {
  to: string; patientName: string | null; clinicName: string; followUpDate: string;
}): Promise<{ providerMessageId: string; name: string }> {
  const named = Deno.env.get("MESSAGING_PROVIDER");
  const name = named || (Deno.env.get("WHATSAPP_ACCESS_TOKEN") ? "meta" : "mock");

  if (name === "mock") {
    await new Promise((r) => setTimeout(r, 150));
    const id = `wamid.MOCK${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    return { providerMessageId: id, name: "mock" };
  }
  if (name !== "meta" && name !== "fast2sms") {
    throw new Error(`MESSAGING_PROVIDER="${name}" is not a known provider (meta, fast2sms, mock)`);
  }

  const { name: templateName, language: templateLang } = resolveFollowUpTemplate();
  const data = await callGraphApi({
    messaging_product: "whatsapp",
    to: m.to,
    type: "template",
    template: {
      name: templateName,
      language: { code: templateLang },
      components: [{
        type: "body",
        parameters: [
          { type: "text", text: m.patientName || "there" },
          { type: "text", text: m.followUpDate },
          { type: "text", text: m.clinicName || "your clinic" },
        ],
      }],
    },
  });
  return { providerMessageId: data.messages[0].id, name };
}

// ── Candidates ─────────────────────────────────────────────────────────
interface Candidate {
  prescriptionId: string;
  doctorId: string;
  patientId: string;
  hospitalId: string;
  followUpDate: string; // yyyy-mm-dd, human-facing
}

/**
 * Every prescription whose follow-up date is TOMORROW (India time) and has
 * never been reminded. "Tomorrow" — not "today" — is the whole feature: a
 * reminder due to arrive one day before the visit, exactly what Anmol asked
 * for, not a same-day nudge.
 *
 * Anchored on the PRESCRIPTION's own `created_at`, not the visit's — that is
 * the moment `follow_up_days` was actually chosen, and the two are almost
 * always the same day but not definitionally guaranteed to be.
 */
async function findCandidates(db: SupabaseClient): Promise<Candidate[]> {
  // Off by default, everywhere — see the `hospitals.follow_up_reminders_
  // enabled` migration. This is the ONE gate: nothing about a candidate row
  // below can override it, and a clinic that has never visited its own
  // Clinic page to opt in gets exactly zero reminders sent, forever.
  const { data: enabledHospitals, error: hospErr } = await db
    .from("hospitals")
    .select("id")
    .eq("follow_up_reminders_enabled", true);
  if (hospErr) throw new Error(`follow-up-cron enabled hospitals: ${hospErr.message}`);
  const enabled = new Set((enabledHospitals ?? []).map((h: { id: string }) => h.id));
  if (enabled.size === 0) return [];

  // `assigned_doctor_id`/`hospital_id` live on `prescriptions` itself —
  // `visits` is joined only for `patient_id`, which does not.
  const { data, error } = await db
    .from("prescriptions")
    .select("id, created_at, follow_up_days, follow_up_reminder_sent_at, assigned_doctor_id, hospital_id, visits(patient_id)")
    .not("follow_up_days", "is", null)
    .is("follow_up_reminder_sent_at", null)
    .in("hospital_id", [...enabled]);
  if (error) throw new Error(`follow-up-cron candidates: ${error.message}`);

  // IST "tomorrow", as a plain date — pg_cron itself already schedules this
  // run for the right IST moment (see the migration), so "tomorrow" here
  // just needs to agree with clock time at call time, not re-derive it.
  const nowIst = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  const tomorrowIst = new Date(nowIst);
  tomorrowIst.setUTCDate(tomorrowIst.getUTCDate() + 1);
  const tomorrowKey = tomorrowIst.toISOString().slice(0, 10);

  const out: Candidate[] = [];
  for (const row of (data ?? []) as any[]) {
    const patientId = row.visits?.patient_id;
    if (!row.assigned_doctor_id || !patientId || !row.hospital_id) continue;
    const createdIst = new Date(new Date(row.created_at).getTime() + 5.5 * 60 * 60 * 1000);
    const dueIst = new Date(createdIst);
    dueIst.setUTCDate(dueIst.getUTCDate() + Number(row.follow_up_days));
    const dueKey = dueIst.toISOString().slice(0, 10);
    if (dueKey !== tomorrowKey) continue;

    out.push({
      prescriptionId: row.id,
      doctorId: row.assigned_doctor_id,
      patientId,
      hospitalId: row.hospital_id,
      followUpDate: dueKey,
    });
  }
  return out;
}

/** yyyy-mm-dd -> "16 Sep" — a doctor's own reminder copy says a real date,
 *  never an ISO string a patient has to parse. */
function humanDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00+05:30`);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
}

async function sendOne(db: SupabaseClient, c: Candidate): Promise<{ ok: boolean; reason?: string }> {
  const [doctorRes, patientRes] = await Promise.all([
    // `name` isn't needed — the follow-up template's body has no doctor-name
    // slot (see `providerSend`'s 3-parameter body, matching `messaging-send`'s
    // own follow-up shape). This existence check + `hospitals(name)` is all
    // this row is for.
    db.from("doctors").select("id, hospitals(name)").eq("id", c.doctorId).maybeSingle(),
    db.from("patients").select("id, name, phone").eq("id", c.patientId).maybeSingle(),
  ]);
  const doctor = doctorRes.data as { id: string; hospitals?: { name?: string } | null } | null;
  const patient = patientRes.data as { id: string; name: string | null; phone: string | null } | null;

  // Always stamp the attempt, whatever happens next — this run owns
  // "tomorrow" for this prescription, and there will not be a second one:
  // the date this candidate matched will not be tomorrow again.
  const stamp = () => db.from("prescriptions").update({ follow_up_reminder_sent_at: new Date().toISOString() }).eq("id", c.prescriptionId);

  if (!doctor) { await stamp(); return { ok: false, reason: "no_doctor" }; }
  if (!patient) { await stamp(); return { ok: false, reason: "no_patient" }; }
  const phone = normalisePhone(patient.phone);
  if (!phone) { await stamp(); return { ok: false, reason: "no_phone" }; }

  const cost = 1;
  const { data: balRow } = await db.from("messaging_credit_balances").select("balance").eq("doctor_id", c.doctorId).maybeSingle();
  const balance = Number((balRow as { balance?: number } | null)?.balance ?? 0);
  if (balance < cost) { await stamp(); return { ok: false, reason: "insufficient_credits" }; }

  const patientName = patient.name || null;
  const clinicName = doctor.hospitals?.name || "your clinic";
  const followUpDateLabel = humanDate(c.followUpDate);
  const preview = `Follow-up reminder for ${patientName || "patient"}`;

  const { data: msgRow, error: insertError } = await db.from("whatsapp_messages").insert({
    direction: "outbound", phone, patient_id: c.patientId, prescription_id: c.prescriptionId,
    hospital_id: c.hospitalId, doctor_id: c.doctorId, purpose: "follow_up", message_type: "template",
    body_preview: preview, status: "pending", credits_charged: 0,
  }).select("id").single();
  if (insertError || !msgRow) { await stamp(); return { ok: false, reason: `log_failed: ${insertError?.message}` }; }
  const messageId = (msgRow as { id: number }).id;

  let ledgerId: unknown;
  try {
    const { data, error } = await db.rpc("debit_messaging_credit", {
      p_doctor_id: c.doctorId, p_credits: cost, p_message_id: messageId, p_note: preview,
    });
    if (error) throw error;
    ledgerId = data;
  } catch (e) {
    await db.from("whatsapp_messages").delete().eq("id", messageId);
    await stamp();
    return { ok: false, reason: `debit_failed: ${(e as Error).message}` };
  }

  try {
    const result = await providerSend({ to: phone, patientName, clinicName, followUpDate: followUpDateLabel });
    await db.from("whatsapp_messages")
      .update({ wa_message_id: result.providerMessageId, status: "sent", credits_charged: cost })
      .eq("id", messageId);
    await stamp();
    return { ok: true };
  } catch (e) {
    const detail = (e as Error).message || "Unknown provider error";
    try {
      await db.rpc("refund_messaging_credit", { p_ledger_id: ledgerId, p_note: `Send failed: ${detail}`.slice(0, 300) });
    } catch (refundError) {
      console.error(`[follow-up-cron] REFUND FAILED for ledger ${ledgerId} (message ${messageId}):`, (refundError as Error).message);
    }
    await db.from("whatsapp_messages")
      .update({ status: "failed", error_detail: detail.slice(0, 500), credits_charged: 0 })
      .eq("id", messageId);
    await stamp();
    return { ok: false, reason: "send_failed" };
  }
}

// ── HTTP ──────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: false, error: "POST only." }, 405);

  const jwt = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!jwt) return json({ ok: false, error: "no_token" }, 401);

  // Defense in depth beyond `verify_jwt` — see this file's header. Any
  // signed-in doctor's token also passes gateway verification; only the
  // service_role token (the one the cron job in the migration authenticates
  // with) may trigger a run that spends every clinic's credits.
  const role = jwtRole(jwt);
  if (role !== "service_role") {
    return json({ ok: false, error: "forbidden" }, 403);
  }

  const db = admin();
  let checked = 0, sent = 0, failed = 0;
  const failures: Record<string, number> = {};

  try {
    const candidates = await findCandidates(db);
    checked = candidates.length;
    for (const c of candidates) {
      const result = await sendOne(db, c);
      if (result.ok) sent++;
      else {
        failed++;
        failures[result.reason ?? "unknown"] = (failures[result.reason ?? "unknown"] ?? 0) + 1;
      }
    }
  } catch (e) {
    console.error("[follow-up-cron]", e);
    return json({ ok: false, error: "server_error", message: (e as Error).message }, 500);
  }

  console.log(`[follow-up-cron] checked=${checked} sent=${sent} failed=${failed}`, failures);
  return json({ ok: true, checked, sent, failed, failures });
});
