// ---------------------------------------------------------------------------
// AREN's WhatsApp server — a small, separate Express process from the Vite
// frontend. Run it with `npm run server`. It does ONE job tonight: the
// WhatsApp Cloud API webhook (receiving messages/status updates) and sending
// messages. Nothing about the frontend build changes because this exists.
//
// Needs server/.env (gitignored — never commit real secrets). Copy
// server/.env.example to server/.env and fill in the real values.
// ---------------------------------------------------------------------------

import { fileURLToPath } from "node:url";
import path from "node:path";
import dotenv from "dotenv";
import express from "express";
import { mountWhatsAppWebhook } from "./whatsapp/webhook.js";

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

const port = process.env.PORT || 4000;
app.listen(port, () => {
    console.log(`AREN WhatsApp server listening on http://localhost:${port}`);
    console.log(`Webhook path: http://localhost:${port}/webhooks/whatsapp`);
});
