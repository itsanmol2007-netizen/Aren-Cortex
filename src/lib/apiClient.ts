// ---------------------------------------------------------------------------
// THE ONE SEAM into `server/` — every route a signed-in browser calls goes
// through this. Attaches the caller's own Supabase session as a bearer
// token; `server/auth.js`'s `requireClinicUser()` is what actually decides
// what that identity is allowed to do. Nothing here trusts anything the
// caller passes as an identity — see messaging.ts's send seam and
// admin.ts's staff-creation call for why.
//
// Extracted 2026-09-08 from lib/db/messaging.ts, which had this verbatim,
// so a second server-backed feature (staff creation) doesn't fork it.
// ---------------------------------------------------------------------------

import { supabase } from "./supabase";

/**
 * Where `server/` lives. Dev goes through Vite's `/api` proxy (vite.config.ts);
 * anywhere else needs `VITE_AREN_API_URL` because the API is a separate origin
 * from the static bundle. Empty string means "same origin, use the proxy".
 */
const API_BASE = (import.meta.env.VITE_AREN_API_URL as string | undefined)?.replace(/\/$/, "") ?? "";

export async function postAuthed<T>(path: string, body: unknown): Promise<T> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("Your session has expired — sign in again.");

    const res = await fetch(`${API_BASE}${path}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(body),
    });

    const json = await res.json().catch(() => null) as { ok?: boolean; error?: string; message?: string } & T | null;
    if (!res.ok || !json?.ok) {
        // The server's own message first: it knows exactly why this failed,
        // and each reason needs different words for the person reading it.
        throw new Error(json?.message || json?.error || `Request failed (${res.status})`);
    }
    return json as T;
}
