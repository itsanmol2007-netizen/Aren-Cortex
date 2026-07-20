// Authentication + identity resolution for the whole app.
//
// Supabase Auth answers "who logged in"; the `users` row answers "who this
// person is inside AREN" (role, hospital). Every gate decision funnels through
// loadIdentity() so the app either has a fully verified identity or none —
// there is no partial state. All checks fail CLOSED: if Supabase is
// unreachable, errors, or times out, the caller treats it as "not logged in".

import { supabase } from "./supabase";

// Must stay byte-identical to the landing repo's lib/supabase.ts — same strip,
// same domain — or logins derive a different email than registration did.
export function phoneToAuthEmail(phone: string): string {
    const digits = phone.replace(/\D/g, ""); // strip non-digits
    return `${digits}@aren.internal`;
}

// Hard ceiling on every gate query. A hung request must never leave someone
// staring at a splash — after this, we fail closed to the login screen.
export const GATE_TIMEOUT_MS = 8000;

export function withTimeout<T>(p: Promise<T> | PromiseLike<T>, ms = GATE_TIMEOUT_MS): Promise<T> {
    return Promise.race([
        Promise.resolve(p),
        new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error("aren-gate-timeout")), ms);
        }),
    ]);
}

export type AppUser = {
    id: string;
    hospital_id: string;
    full_name: string | null;
    phone: string | null;
    role: string | null;
    is_active: boolean;
};

export type AppHospital = {
    id: string;
    name: string | null;
    is_active: boolean;
    clinic_mode: string | null;
    logo_url: string | null;
    accent_color: string | null;
};

export type AppDoctorProfile = {
    id: string;
    user_id: string | null;
    name: string | null;
    specialization: string | null;
    qualification: string | null;
    registration_number: string | null;
    avatar_url: string | null;
    signature_image_url: string | null;
};

export type Identity = {
    user: AppUser;
    hospital: AppHospital;
    doctor: AppDoctorProfile | null;
};

// Why a login/gate attempt was rejected. "unreachable" covers every network /
// timeout / unexpected-error case — indistinguishable from "not logged in" on
// purpose (fail closed, never fail open).
export type IdentityFailure =
    | "no-user-row" // auth succeeded but registration never finished
    | "user-inactive" // users.is_active = false
    | "hospital-inactive" // clinic registered but not yet activated
    | "unreachable";

export type IdentityResult =
    | { ok: true; identity: Identity }
    | { ok: false; reason: IdentityFailure };

export async function loadIdentity(authUserId: string): Promise<IdentityResult> {
    let user: AppUser;
    try {
        const { data, error } = await withTimeout(
            supabase
                .from("users")
                .select("id, hospital_id, full_name, phone, role, is_active")
                .eq("id", authUserId)
                .maybeSingle()
        );
        if (error) return { ok: false, reason: "unreachable" };
        if (!data) return { ok: false, reason: "no-user-row" };
        user = data as AppUser;
    } catch {
        return { ok: false, reason: "unreachable" };
    }

    if (!user.is_active) return { ok: false, reason: "user-inactive" };

    let hospital: AppHospital;
    try {
        const { data, error } = await withTimeout(
            supabase
                .from("hospitals")
                .select("id, name, is_active, clinic_mode, logo_url, accent_color")
                .eq("id", user.hospital_id)
                .maybeSingle()
        );
        // A missing hospital row means we cannot confirm the clinic is active
        // — same as unreachable: fail closed.
        if (error || !data) return { ok: false, reason: "unreachable" };
        hospital = data as AppHospital;
    } catch {
        return { ok: false, reason: "unreachable" };
    }

    if (!hospital.is_active) return { ok: false, reason: "hospital-inactive" };

    // The clinical profile is display data, not a gate condition — a doctor
    // whose profile row is momentarily unreadable can still work.
    let doctor: AppDoctorProfile | null = null;
    if (user.role === "doctor") {
        try {
            const { data } = await withTimeout(
                supabase
                    .from("doctors")
                    .select("id, user_id, name, specialization, qualification, registration_number, avatar_url, signature_image_url")
                    .eq("user_id", authUserId)
                    .maybeSingle()
            );
            doctor = (data as AppDoctorProfile | null) ?? null;
        } catch {
            doctor = null;
        }
    }

    return { ok: true, identity: { user, hospital, doctor } };
}

// Role → landing route. Unknown roles ('owner'/'admin' may exist later) land
// in Cortex explicitly rather than crashing or looping.
export function homeRouteForRole(role: string | null): string {
    if (role === "reception") return "/app/frontdesk";
    return "/app/cortex";
}

// Local-only sign-out: clears the persisted session without needing the
// network, so a failed gate can always clean up.
export async function signOutLocal(): Promise<void> {
    try {
        await withTimeout(supabase.auth.signOut({ scope: "local" }), 2000);
    } catch {
        // Storage is cleared synchronously by supabase-js; network errors here
        // are irrelevant to gating.
    }
}

// ── Last-known-good identity cache ──────────────────────────────────────────
//
// The Supabase session survives a refresh offline, but re-verifying the
// identity (users + hospitals rows) needs the network. Without a cache, an
// offline refresh would fail that verification and eject the receptionist to
// login — unacceptable mid-clinic. So on every SUCCESSFUL verification we stash
// the resolved identity here, keyed by auth user id. When verification later
// fails for a NETWORK reason (offline / timeout), the gate trusts this cache
// instead of logging out, and silently re-verifies once connectivity returns.
// A DEFINITIVE rejection (inactive user/hospital) always clears it.

const IDENTITY_CACHE_KEY = "aren.identity.v1";

export function cacheIdentity(identity: Identity): void {
    try {
        localStorage.setItem(
            IDENTITY_CACHE_KEY,
            JSON.stringify({ userId: identity.user.id, identity })
        );
    } catch {
        /* storage unavailable — cache is a bonus, never required */
    }
}

export function readCachedIdentity(userId: string): Identity | null {
    try {
        const raw = localStorage.getItem(IDENTITY_CACHE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as { userId?: string; identity?: Identity };
        // Only honour a cache that belongs to the currently-signed-in user, so
        // a previous account on this machine can never leak through.
        if (parsed?.userId === userId && parsed.identity) return parsed.identity;
        return null;
    } catch {
        return null;
    }
}

export function clearCachedIdentity(): void {
    try {
        localStorage.removeItem(IDENTITY_CACHE_KEY);
    } catch {
        /* no-op */
    }
}
