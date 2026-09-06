// ---------------------------------------------------------------------------
// Does email actually work on this machine? One command, a real answer.
//
//   node scripts/check-email.mjs            → check config + send a test email
//   node scripts/check-email.mjs --dry      → check config only, send nothing
//
// Exists because "I clicked Buy Credits and nothing arrived" has four possible
// causes (no credentials, wrong data centre, server not running, wrong
// recipient) and staring at the app tells you which one it is exactly never.
// ---------------------------------------------------------------------------

import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", "server", ".env") });

const dry = process.argv.includes("--dry");
const REQUIRED = ["ZOHO_CLIENT_ID", "ZOHO_CLIENT_SECRET", "ZOHO_REFRESH_TOKEN", "ZOHO_ACCOUNT_ID"];

console.log("\n  AREN email check\n  ────────────────\n");

let missing = [];
for (const key of REQUIRED) {
    const v = process.env[key];
    // Never print a secret. Length and presence is all anyone needs.
    console.log(`  ${v ? "✓" : "✗"} ${key.padEnd(20)} ${v ? `set (${v.length} chars)` : "MISSING"}`);
    if (!v) missing.push(key);
}

const from = process.env.ZOHO_FROM || "care@arenode.com";
const to = process.env.SUPPORT_NOTIFY_EMAIL || process.env.REQUESTS_NOTIFY_EMAIL || "support@arenode.com";
console.log(`\n  from → ${from}`);
console.log(`  to   → ${to}`);

if (missing.length) {
    console.log(
        `\n  ✗ Not configured. ${missing.length} value(s) missing from server/.env,\n` +
        `    so every operational email is skipped silently.\n\n` +
        `    Copy them from the landing page's .env.local:\n` +
        `      ${missing.join("\n      ")}\n`
    );
    process.exit(1);
}

const { getZohoAccessToken, sendZohoMail } = await import("../server/email/zoho.js");
const { renderEmail } = await import("../server/email/templates.js");

try {
    // Proves the credentials AND that we are talking to the right data
    // centre. A token minted at accounts.zoho.in works only against .in —
    // pointed at .com it fails in a way that looks like a bad credential.
    await getZohoAccessToken(true);
    console.log("\n  ✓ Zoho token exchange OK (accounts.zoho.in)");
} catch (e) {
    console.log(`\n  ✗ Token exchange FAILED: ${e.message}`);
    console.log("    invalid_client → wrong id/secret. invalid_code → the refresh token was revoked.\n");
    process.exit(1);
}

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
    await sendZohoMail({ to, subject: `[TEST] ${subject}`, html, fromName: "AREN Cortex" });
    console.log(`  ✓ Test email sent to ${to}`);
    console.log("\n  Check that inbox. If it arrived, clicking Buy Credits will work too —");
    console.log("  provided `npm run server` is running when you click it.\n");
} catch (e) {
    console.log(`  ✗ Send FAILED: ${e.message}\n`);
    process.exit(1);
}
