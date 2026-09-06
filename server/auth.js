// ---------------------------------------------------------------------------
// WHO IS CALLING — Supabase session -> a clinic identity, server-side.
//
// Every authenticated route in `server/` goes through this. The browser sends
// its own Supabase access token; this verifies it against Supabase and reads
// the `users` row it names. Nothing about the caller is taken from the request
// body — a request that says `{ doctorId: "someone else" }` gets checked
// against what the token actually proves.
//
// ── Why the doctor id is resolved here and not trusted from the request
//
// The frontend has a `doctorId` in hand and it would be convenient to send it.
// But the service below spends that doctor's credits, and a request body is
// something anyone with a session can edit. So the token names a `users` row,
// the `users` row names a hospital, and the `doctors` row is looked up by
// `user_id` — three steps a caller cannot forge with a valid session for
// somebody else.
// ---------------------------------------------------------------------------

import { getSupabase } from "./whatsapp/supabaseClient.js";

/**
 * Verifies the bearer token and resolves the caller.
 *
 * Returns null AND writes the response on failure, so a route reads:
 *   const who = await requireClinicUser(req, res);
 *   if (!who) return;
 */
export async function requireClinicUser(req, res) {
    const jwt = (req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim();
    if (!jwt) {
        res.status(401).json({ ok: false, error: "no_token", message: "Sign in again." });
        return null;
    }

    // Express 4 does not catch a rejection from an async handler: it just
    // never responds, and the caller hangs until their own timeout. Measured
    // live 2026-09-06 with SUPABASE_SERVICE_ROLE_KEY unset — `getSupabase()`
    // throws, and `curl` sat there with no status and no body. Everything
    // that can throw before a response is written belongs inside this try.
    let sb;
    let user;
    try {
        sb = getSupabase();
        const result = await sb.auth.getUser(jwt);
        user = result.data.user;
        if (result.error || !user) throw new Error(result.error?.message || "no user");
    } catch (e) {
        // A misconfigured server and a bad token are genuinely different, and
        // only one of them is the caller's problem — but neither may leave the
        // request unanswered.
        if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
            console.error("[auth] server is not configured:", e.message);
            res.status(500).json({
                ok: false,
                error: "server_misconfigured",
                message: "This AREN server is not finished setting up. Contact support.",
            });
            return null;
        }
        res.status(401).json({ ok: false, error: "bad_token", message: "Your session has expired — sign in again." });
        return null;
    }
    let profile, doctor, hospital;
    try {
        ({ data: profile } = await sb
            .from("users")
            .select("id, full_name, role, hospital_id, is_active")
            .eq("id", user.id)
            .maybeSingle());
    } catch (e) {
        console.error("[auth] profile lookup failed:", e.message);
        res.status(502).json({ ok: false, error: "lookup_failed", message: "Could not verify your account. Try again." });
        return null;
    }

    if (!profile) {
        res.status(403).json({ ok: false, error: "unknown_user", message: "This account is not set up for a clinic." });
        return null;
    }
    // A deactivated account keeps a valid token until it expires. Checking
    // here is what makes "deactivate this user" take effect now rather than
    // in an hour.
    if (profile.is_active === false) {
        res.status(403).json({ ok: false, error: "inactive_user", message: "This account has been deactivated." });
        return null;
    }

    // A doctor row is optional: reception and admin accounts have none, and
    // they legitimately reach some of these routes (a support request, say).
    // Only the messaging routes require one, and they say so themselves.
    // Both are decoration on the identity, not part of it — a failure here
    // must not turn a valid session into a 401.
    try {
        ({ data: doctor } = await sb
            .from("doctors").select("id, name, hospital_id").eq("user_id", user.id).maybeSingle());
        ({ data: hospital } = await sb
            .from("hospitals").select("name").eq("id", profile.hospital_id).maybeSingle());
    } catch (e) {
        console.error("[auth] doctor/hospital lookup failed (non-fatal):", e.message);
    }

    return {
        userId: user.id,
        role: profile.role,
        userName: profile.full_name || null,
        hospitalId: profile.hospital_id,
        clinicName: hospital?.name || "Unknown clinic",
        doctorId: doctor?.id || null,
        doctorName: doctor?.name || profile.full_name || null,
    };
}
