// ---------------------------------------------------------------------------
// Is the WhatsApp provider (Fast2SMS BSP) actually connected? One command, a
// real answer — and it SENDS NOTHING.
//
//   node scripts/check-whatsapp.mjs
//
// Every call here is read-only (WABA details, templates, wallet balance), on
// purpose: a freshly-approved number should not see a burst of activity while
// you're still wiring it up. Use this to confirm the key, the phone number
// ID, the number's quality rating and — once it clears — your template's
// approval status and variable count, without putting a single message on
// the wire.
//
// Reads server/.env for:
//   FAST2SMS_API_KEY          (required)
//   WHATSAPP_PHONE_NUMBER_ID  (optional — filters to just that number)
//   WHATSAPP_TEMPLATE_PRESCRIPTION / _FOLLOW_UP  (optional — flags whether
//                             the names AREN is configured to send exist and
//                             are approved on the WABA)
// ---------------------------------------------------------------------------

import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", "server", ".env") });

const KEY = process.env.FAST2SMS_API_KEY;
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || "";
const WANT_TEMPLATES = [
    process.env.WHATSAPP_TEMPLATE_PRESCRIPTION || "aren_prescription",
    process.env.WHATSAPP_TEMPLATE_FOLLOW_UP || "aren_follow_up",
];

const BASE = "https://www.fast2sms.com/dev";

console.log("\n  AREN WhatsApp check  (Fast2SMS, read-only — sends nothing)\n  ────────────────────────────────────────────────────────\n");

if (!KEY) {
    console.log("  ✗ FAST2SMS_API_KEY is not set in server/.env.\n");
    console.log("    Add it (from Fast2SMS -> Dev API), then re-run. Until it's set,");
    console.log("    the messaging service stays on the mock provider.\n");
    process.exit(1);
}
console.log(`  ✓ FAST2SMS_API_KEY        set (${KEY.length} chars)`);
console.log(`  ${PHONE_NUMBER_ID ? "✓" : "·"} WHATSAPP_PHONE_NUMBER_ID ${PHONE_NUMBER_ID || "(not set — will list all numbers on the account)"}\n`);

async function get(url) {
    const res = await fetch(url, { headers: { Authorization: KEY } });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* keep raw */ }
    return { status: res.status, ok: res.ok, json, text };
}

async function post(url) {
    const res = await fetch(url, { method: "POST", headers: { Authorization: KEY } });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* keep raw */ }
    return { status: res.status, ok: res.ok, json, text };
}

// ── Wallet balance ─────────────────────────────────────────────────────────
try {
    const w = await post(`${BASE}/wallet`);
    if (w.json?.wallet != null) {
        console.log(`  ✓ Wallet balance         ₹${w.json.wallet}`);
    } else {
        console.log(`  ✗ Wallet check failed    HTTP ${w.status} ${w.text.slice(0, 200)}`);
        console.log("    A 401 here means the API key is wrong or the account is disabled.\n");
        process.exit(1);
    }
} catch (e) {
    console.log(`  ✗ Wallet check errored   ${e.message}`);
    console.log("    Can this machine reach https://www.fast2sms.com over HTTPS?\n");
    process.exit(1);
}

// ── WABA / number details ─────────────────────────────────────────────────
const numQ = new URLSearchParams({ type: "number" });
if (PHONE_NUMBER_ID) numQ.set("phone_number_id", PHONE_NUMBER_ID);
const numbers = await get(`${BASE}/dlt_manager/whatsapp?${numQ}`);

if (!numbers.json?.success || !Array.isArray(numbers.json.data)) {
    console.log(`\n  ✗ Could not read WABA details — HTTP ${numbers.status}`);
    console.log(`    ${numbers.text.slice(0, 300)}\n`);
    process.exit(1);
}
if (numbers.json.data.length === 0) {
    console.log("\n  ✗ No numbers returned. Either the phone_number_id is wrong, or no");
    console.log("    number is provisioned on this Fast2SMS account yet.\n");
    process.exit(1);
}

console.log("\n  Numbers on this WABA");
console.log("  ────────────────────");
for (const n of numbers.json.data) {
    console.log(`
    number            ${n.number}   "${n.verified_name}"
    phone_number_id    ${n.phone_number_id}
    waba_id            ${n.waba_id}
    name status        ${n.name_status}
    quality rating     ${n.quality_rating}
    messaging limit    ${n.messaging_limit}
    connection         ${n.connection_status}`);
}

// ── Templates ─────────────────────────────────────────────────────────────
const tplQ = new URLSearchParams({ type: "template" });
if (PHONE_NUMBER_ID) tplQ.set("phone_number_id", PHONE_NUMBER_ID);
const templates = await get(`${BASE}/dlt_manager/whatsapp?${tplQ}`);

const allTemplates = [];
if (templates.json?.success && Array.isArray(templates.json.data)) {
    for (const row of templates.json.data) {
        for (const t of row.templates || []) allTemplates.push(t);
    }
}

console.log("\n\n  Templates");
console.log("  ─────────");
if (allTemplates.length === 0) {
    console.log("    (none returned yet — a template still under review may not appear here)");
} else {
    for (const t of allTemplates) {
        console.log(`
    ${t.template_name}   [${t.status}]   ${t.language}   ${t.var_count} var(s)   ${t.category}
      message_id ${t.message_id}   template_id ${t.template_id}`);
    }
}

// The prescription template is the only one wired to a live trigger today
// (Consult's "WhatsApp" button). The follow-up template has no sender yet, so
// its absence is reported but does not block going live.
const rxWant = process.env.WHATSAPP_TEMPLATE_PRESCRIPTION || "en_prescription_ready02";
const fuWant = process.env.WHATSAPP_TEMPLATE_FOLLOW_UP || "aren_follow_up";

/** Reads the BUTTONS component: is there a URL button, and is it dynamic
 *  (ends with {{1}}) or static (a fixed link)? The prescription flow needs a
 *  dynamic one — it sends a per-prescription token as {{1}}. */
function urlButtonInfo(hit) {
    const bc = (hit.components || []).find((c) => String(c.type).toUpperCase() === "BUTTONS");
    const btn = (bc?.buttons || []).find((b) => String(b.type).toUpperCase() === "URL");
    if (!btn) return { kind: "none" };
    const dynamic = /\{\{1\}\}/.test(btn.url || "") || !!btn.example;
    return { kind: dynamic ? "dynamic" : "static", url: btn.url || "" };
}

function report(want, label) {
    const hit = allTemplates.find((t) => t.template_name === want);
    if (!hit) return console.log(`    ✗ ${want} (${label}) — NOT found on the WABA (pending, or a name mismatch)`);
    const approved = String(hit.status).toLowerCase() === "approved";
    console.log(
        `    ${approved ? "✓" : "·"} ${want} (${label}) — ${hit.status}, ${hit.var_count} var(s)`
    );
    if (approved) {
        for (const c of hit.components || []) {
            if (String(c.type).toUpperCase() === "BUTTONS") {
                for (const b of c.buttons || []) {
                    console.log(`        BUTTON/${b.type}  "${b.text}"  ${b.url || b.phone_number || ""}`);
                }
                continue;
            }
            const t = (c.text || "").replace(/\s+/g, " ").trim().slice(0, 70);
            console.log(`        ${c.type}${c.format ? `/${c.format}` : ""}${t ? `  "${t}${t.length >= 70 ? "…" : ""}"` : ""}`);
        }
    }
    return undefined;
}

console.log("\n\n  Templates AREN sends:");
report(rxWant, "prescription");
report(fuWant, "follow-up");

const rxHit = allTemplates.find((t) => t.template_name === rxWant);
const rxApproved = rxHit && String(rxHit.status).toLowerCase() === "approved";
const btn = rxHit ? urlButtonInfo(rxHit) : { kind: "none" };
const ready = rxApproved && btn.kind === "dynamic";

if (rxApproved && btn.kind === "static") {
    console.log(`
  ⚠  ${rxWant}'s button is a STATIC url:
       ${btn.url}
     That is the same dead link for every patient. The server sends a
     per-prescription token as the button's {{1}} — a static button rejects
     that. In WhatsApp Manager, edit the button: URL type -> Dynamic, Website
     URL -> https://www.arenode.com/prescriptions/{{1}}, then re-submit.
     See docs/whatsapp-prescription-link-handoff.md Part 1.`);
}

console.log(`
  ${ready ? "✓" : "·"} ${ready
        ? `${rxWant} is approved with a DYNAMIC button. To go live: set\n    MESSAGING_PROVIDER=fast2sms in server/.env (never auto-selected), restart\n    \`npm run server\`, then send ONE real prescription from the app. Confirm\n    the button opens https://www.arenode.com/prescriptions/<token> first —\n    see docs/whatsapp-prescription-link-handoff.md.`
        : `Not ready to go live — keep MESSAGING_PROVIDER=mock. Need: ${rxWant}\n    Approved (${rxApproved ? "yes" : "no"}) AND its button Dynamic (${btn.kind}).`}
  ${allTemplates.find((t) => t.template_name === fuWant) ? "" : "· No follow-up template yet — sendFollowUp has no live trigger, so this is fine."}
`);
