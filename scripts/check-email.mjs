// ---------------------------------------------------------------------------
// Does email actually work on this machine? One command, a real answer.
//
//   node scripts/check-email.mjs            → check config + send a test email
//   node scripts/check-email.mjs --dry      → check config only, send nothing
//
// Exists because "I clicked Buy Credits and nothing arrived" has four possible
// causes (no credentials, wrong region, wrong recipient) and staring at the
// app tells you which one it is exactly never.
// ---------------------------------------------------------------------------

import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", "server", ".env") });

const dry = process.argv.includes("--dry");
const REQUIRED = ["SES_AWS_ACCESS_KEY_ID", "SES_AWS_SECRET_ACCESS_KEY"];

console.log("\n  AREN Amazon SES email check\n  ───────────────────────────\n");

let missing = [];
for (const key of REQUIRED) {
    const v = process.env[key];
    // Never print a secret. Length and presence is all anyone needs.
    console.log(`  ${v ? "✓" : "✗"} ${key.padEnd(26)} ${v ? `set (${v.length} chars)` : "MISSING"}`);
    if (!v) missing.push(key);
}

const region = process.env.SES_AWS_REGION || "ap-south-1";
const from = process.env.SES_FROM || "care@arenode.com";
const to = process.env.SUPPORT_NOTIFY_EMAIL || process.env.REQUESTS_NOTIFY_EMAIL || "support@arenode.com";
console.log(`\n  region → ${region}`);
console.log(`  from   → ${from}`);
console.log(`  to     → ${to}`);

if (missing.length) {
    console.log(
        `\n  ✗ Not configured. ${missing.length} value(s) missing from server/.env / environment,\n` +
        `    so operational emails will be skipped.\n\n` +
        `    Required variables:\n` +
        `      ${missing.join("\n      ")}\n`
    );
    process.exit(1);
}

const { sendSesMail } = await import("../server/email/ses.js");
const { renderEmail } = await import("../server/email/templates.js");

if (dry) {
    console.log("\n  --dry: stopping before the send. Config is good.\n");
    process.exit(0);
}

// The real thing a doctor triggers, with the real template, so what lands in
// the inbox is what they would actually cause.
const { subject, html } = renderEmail("recharge_request", {
    doctorName: "Dr Test", clinicName: "Test Clinic",
    credits: 500, amount: 300, packageLabel: "500 credits",
    balance: 73, reference: "RC_TEST", note: "Sent by scripts/check-email.mjs",
});

try {
    await sendSesMail({ to, subject: `[TEST] ${subject}`, html, fromName: "AREN Cortex" });
    console.log(`  ✓ Test email sent to ${to} via Amazon SES`);
    console.log("\n  Check that inbox. If it arrived, email notifications are working.\n");
} catch (e) {
    console.log(`  ✗ Send FAILED: ${e.message}\n`);
    process.exit(1);
}

