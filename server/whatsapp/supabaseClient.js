// ---------------------------------------------------------------------------
// A service-role Supabase client, for THIS integration only.
//
// Service role bypasses RLS entirely — correct here, because this backend
// process is the trusted source of truth writing whatsapp_messages, not a
// browser session subject to per-hospital row policies. Never ship this key
// to a frontend/browser bundle.
//
// Needs (same Supabase project the Vite frontend already uses):
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY   — Project Settings -> API -> service_role
//                                 (NOT the anon key — that one is subject to
//                                 RLS and would be silently blocked by the
//                                 policy schema.sql already applied)
// ---------------------------------------------------------------------------

import { createClient } from "@supabase/supabase-js";

let client = null;

export function getSupabase() {
    if (client) return client;
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
        throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — check server/.env");
    }
    client = createClient(url, key, { auth: { persistSession: false } });
    return client;
}
