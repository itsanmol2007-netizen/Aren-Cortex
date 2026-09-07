// ---------------------------------------------------------------------------
// ADMIN-ONLY ROUTES — currently one: minting a real sign-in for a new staff
// member from inside the app.
//
//   POST /api/admin/staff   { fullName, phone, password, role } -> a new
//                           Supabase Auth account + `users` row (+ `doctors`
//                           row if role is "doctor")
//
// Why this has to live server-side: `users`' INSERT policy is
// `with_check id = auth.uid()` — a signed-in person can only insert THEIR
// OWN row, which is what makes self-registration (the landing site's wizard)
// safe without giving every browser a blank check to mint accounts. An admin
// creating staff for someone else needs the service-role key to both create
// the Supabase Auth user and write rows under an id that isn't their own —
// `getSupabase()` (server/whatsapp/supabaseClient.js) is that key, already
// established for exactly this kind of trusted server-only write.
// ---------------------------------------------------------------------------

import { requireClinicUser } from "../auth.js";
import { getSupabase } from "../whatsapp/supabaseClient.js";

const ALLOWED_ROLES = new Set(["admin", "doctor", "reception"]);

/**
 * The staff-creation half of the synthetic-email convention.
 *
 * Must stay byte-identical to `phoneToStaffAuthEmail` in
 * `src/lib/auth.ts` — same strip, same domain — or an account created here
 * derives an address the frontend's login retry (LoginPage.tsx) never tries,
 * and the person it was created for can never sign in.
 *
 * The domain deliberately differs from the landing site's `<digits>@aren.
 * internal`: Anmol wanted a way to tell, just by looking at the Auth email
 * in the Supabase dashboard, whether an account was self-registered or
 * created by a clinic from inside AREN — this domain IS that marker, with no
 * new column to keep in sync.
 */
function phoneToStaffAuthEmail(phone) {
    const digits = String(phone).replace(/\D/g, "");
    return `${digits}@aren-staff.internal`;
}

export function mountAdminRoutes(app) {
    app.post("/api/admin/staff", async (req, res) => {
        const who = await requireClinicUser(req, res);
        if (!who) return;

        const sb = getSupabase();

        // Authorization: an owner/admin role, or a doctor personally
        // carrying clinic-admin authority (`doctors.is_clinic_admin`) — the
        // same additive-authority model `adminAccess.ts` uses on the
        // frontend, re-checked here because a request header is not proof
        // that the caller's own UI actually gated this button.
        let allowed = who.role === "admin" || who.role === "owner";
        if (!allowed && who.doctorId) {
            try {
                const { data: doc } = await sb
                    .from("doctors")
                    .select("is_clinic_admin")
                    .eq("id", who.doctorId)
                    .maybeSingle();
                allowed = !!doc?.is_clinic_admin;
            } catch (e) {
                console.error("[admin/staff] clinic-admin lookup failed:", e.message);
            }
        }
        if (!allowed) {
            return res.status(403).json({
                ok: false,
                error: "not_admin",
                message: "Only a clinic admin can add staff.",
            });
        }

        const { fullName, phone, password, role } = req.body || {};
        const digits = String(phone || "").replace(/\D/g, "");
        const name = String(fullName || "").trim();

        if (digits.length !== 10) {
            return res.status(400).json({ ok: false, error: "bad_phone", message: "Enter a 10-digit phone number." });
        }
        if (!name) {
            return res.status(400).json({ ok: false, error: "bad_name", message: "Enter their name." });
        }
        if (!password || String(password).length < 8) {
            return res.status(400).json({ ok: false, error: "bad_password", message: "Use a password of at least 8 characters." });
        }
        if (!ALLOWED_ROLES.has(role)) {
            return res.status(400).json({ ok: false, error: "bad_role", message: "Choose a role for this person." });
        }

        // A phone already on file at THIS clinic is a named conflict, not a
        // generic failure — the admin almost certainly means to edit that
        // person's existing row (PeoplePage), not create a second one.
        try {
            const { data: dupe } = await sb
                .from("users")
                .select("id")
                .eq("hospital_id", who.hospitalId)
                .eq("phone", digits)
                .maybeSingle();
            if (dupe) {
                return res.status(409).json({
                    ok: false,
                    error: "phone_in_use",
                    message: "Someone at this clinic already has that phone number on file.",
                });
            }
        } catch (e) {
            console.error("[admin/staff] duplicate check failed:", e.message);
        }

        const authEmail = phoneToStaffAuthEmail(digits);

        let newUserId;
        try {
            const { data: created, error: createErr } = await sb.auth.admin.createUser({
                email: authEmail,
                password: String(password),
                email_confirm: true,
            });
            if (createErr || !created?.user) {
                const msg = createErr?.message || "";
                if (/already.*registered|already exists/i.test(msg)) {
                    // Same phone number, minted through this same door
                    // before — the users-row check above already catches
                    // the ordinary case; this is what's left if that row
                    // was since deleted but the Auth account wasn't.
                    return res.status(409).json({
                        ok: false,
                        error: "phone_in_use",
                        message: "That phone number already has a sign-in created this way.",
                    });
                }
                throw new Error(msg || "Could not create the sign-in.");
            }
            newUserId = created.user.id;
        } catch (e) {
            console.error("[admin/staff] auth.admin.createUser failed:", e.message);
            return res.status(502).json({ ok: false, error: "auth_create_failed", message: "Could not create that sign-in. Try again." });
        }

        const { error: userRowErr } = await sb.from("users").insert({
            id: newUserId,
            hospital_id: who.hospitalId,
            full_name: name,
            phone: digits,
            role,
            is_active: true,
        });
        if (userRowErr) {
            // Best-effort cleanup: an Auth user with no `users` row can never
            // sign in anywhere — loadIdentity() fails closed on
            // "no-user-row" — but leaving it behind is still a stray,
            // unreachable credential worth removing rather than ignoring.
            await sb.auth.admin.deleteUser(newUserId).catch(() => {});
            console.error("[admin/staff] users insert failed:", userRowErr.message);
            return res.status(502).json({ ok: false, error: "user_row_failed", message: "Could not finish setting up that account." });
        }

        if (role === "doctor") {
            const { error: docErr } = await sb.from("doctors").insert({
                user_id: newUserId,
                hospital_id: who.hospitalId,
                name,
                phone: digits,
                is_clinic_admin: false,
            });
            if (docErr) {
                // The sign-in and `users` row are already good — a missing
                // `doctors` row degrades to "no clinical profile yet", the
                // same fallback loadIdentity() already has for it, not a
                // broken account. Logged, not rolled back.
                console.error("[admin/staff] doctors insert failed (non-fatal):", docErr.message);
            }
        }

        return res.json({ ok: true, userId: newUserId, authEmail });
    });
}
