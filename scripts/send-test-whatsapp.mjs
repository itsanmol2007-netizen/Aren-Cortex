// ---------------------------------------------------------------------------
// ONE controlled live prescription send, through the real messaging service
// (credits debited, ledger written, whatsapp_messages logged, status webhook
// wired) — for the first end-to-end test of the Fast2SMS path.
//
//   node scripts/send-test-whatsapp.mjs --to 9198XXXXXXXX --prescription <uuid>
//
// --to is the recipient in E.164 WITHOUT '+', e.g. 919812345678. The named
// prescription's patient phone is swapped to --to for the send and restored
// immediately after, in a finally block, so no patient record is left changed.
//
// Sends exactly one message. Do not loop this.
// ---------------------------------------------------------------------------

import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", "server", ".env") });

function arg(name) {
    const i = process.argv.indexOf(`--${name}`);
    return i >= 0 ? process.argv[i + 1] : null;
}

const to = (arg("to") || "").replace(/[^\d]/g, "");
const prescriptionId = arg("prescription");

if (!to || to.length < 11 || !prescriptionId) {
    console.error("usage: node scripts/send-test-whatsapp.mjs --to 919812345678 --prescription <uuid>");
    process.exit(1);
}

const { getSupabase } = await import("../server/whatsapp/supabaseClient.js");
const { sendMessage } = await import("../server/messaging/service.js");
const { resolveProvider } = await import("../server/messaging/providers/index.js");

const sb = getSupabase();

console.log(`\n  provider: ${resolveProvider().name}`);
console.log(`  to:       ${to}`);
console.log(`  rx:       ${prescriptionId}\n`);

const { data: rx, error: rxErr } = await sb
    .from("prescriptions")
    .select("id, assigned_doctor_id, visit_id, share_token, visits(patient_id)")
    .eq("id", prescriptionId)
    .maybeSingle();
if (rxErr || !rx) {
    console.error("prescription not found:", rxErr?.message);
    process.exit(1);
}
const doctorId = rx.assigned_doctor_id;
const patientId = rx.visits?.patient_id;
console.log(`  doctorId:  ${doctorId}`);
console.log(`  patientId: ${patientId}`);
console.log(`  share_token: ${rx.share_token}`);
console.log(`  → button URL should become https://www.arenode.com/prescriptions/${rx.share_token}\n`);

const { data: patient } = await sb.from("patients").select("id, phone, name").eq("id", patientId).maybeSingle();
const originalPhone = patient?.phone ?? null;
console.log(`  patient "${patient?.name}" phone ${originalPhone} → temporarily ${to}\n`);

let result;
try {
    await sb.from("patients").update({ phone: to }).eq("id", patientId);
    result = await sendMessage({ doctorId, patientId, purpose: "prescription", prescriptionId });
    console.log("  RESULT:", JSON.stringify(result, null, 2));
} catch (e) {
    console.error("  SEND FAILED:", e.message);
} finally {
    await sb.from("patients").update({ phone: originalPhone }).eq("id", patientId);
    console.log(`\n  patient phone restored to ${originalPhone}`);
}

if (result?.messageId) {
    const { data: row } = await sb
        .from("whatsapp_messages")
        .select("id, status, wa_message_id, credits_charged, error_detail, created_at")
        .eq("id", result.messageId)
        .maybeSingle();
    console.log("\n  whatsapp_messages row:", JSON.stringify(row, null, 2));
}
console.log("");
