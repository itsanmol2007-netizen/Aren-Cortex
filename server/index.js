// ---------------------------------------------------------------------------
// AREN's backend — a small, separate Express process from the Vite frontend.
// Run it with `npm run server`. Two jobs:
//
//   1. The WhatsApp Cloud API webhook — receiving messages and status updates.
//   2. The messaging service — sending prescriptions and follow-ups, spending
//      credits for them, and emailing AREN when something needs attention.
//
// Both live here for the same reason: they need credentials (Meta's access
// token, Supabase's service-role key, Zoho's refresh token) that must never
// reach a browser bundle. Nothing about the frontend build changes because
// this exists — the Vite dev server proxies /api here (vite.config.ts).
//
// Needs server/.env (gitignored — never commit real secrets). Copy
// server/.env.example to server/.env and fill in the real values.
// ---------------------------------------------------------------------------

import { fileURLToPath } from "node:url";
import path from "node:path";
import dotenv from "dotenv";
import express from "express";
import { mountWhatsAppWebhook } from "./whatsapp/webhook.js";
import { mountMessagingRoutes } from "./messaging/routes.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Safe to run after the imports above: neither webhook.js nor client.js
// reads process.env at module load time, only inside function bodies that
// run later, once the server actually starts handling requests.
dotenv.config({ path: path.join(__dirname, ".env") });

const app = express();

// The webhook route reads its own raw body (needed to check Meta's
// signature) — it MUST be mounted before any express.json() for the rest
// of the app, or a global JSON parser would consume the body first.
mountWhatsAppWebhook(app);

app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true }));

// Everything the Communication page talks to: sending, and the operational
// emails that fall out of it. Mounted AFTER express.json() because unlike the
// webhook above these are ordinary JSON endpoints with no signature to check
// against a raw body.
mountMessagingRoutes(app);

const port = process.env.PORT || 4000;
app.listen(port, () => {
    console.log(`AREN WhatsApp server listening on http://localhost:${port}`);
    console.log(`Webhook path: http://localhost:${port}/webhooks/whatsapp`);
    console.log(`Messaging health: http://localhost:${port}/api/messaging/health`);
});
