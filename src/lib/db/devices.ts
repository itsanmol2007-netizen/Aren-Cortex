// ---------------------------------------------------------------------------
// DEVICES — which machines this account is signed in on.
//
// Settings used to say "Other devices — not tracked yet", which was honest and
// useless. Supabase gives the client no session list, so if we want the answer
// we have to keep the record: `user_devices`, one row per (account, browser
// install), written by the client on boot (migration `user_device_sessions`).
//
// ── What identifies a device
//
// `device_key` is a random UUID minted once and kept in localStorage. It names
// the INSTALL, not the person, and carries nothing derivable — no fingerprint,
// no IP, no location. Clearing site data mints a new one, which is correct:
// that genuinely is a different install as far as this account is concerned.
//
// ── Why the label is parsed from the user agent and not much more
//
// A doctor recognises "Chrome on macOS — Desktop". They do not recognise a UA
// string, and they should not have to look at a city name to decide whether a
// row is theirs. `describeDevice` is deliberately coarse: a wrong guess
// between two Chromium forks is a cosmetic error, whereas storing anything
// sharper starts making this table worth stealing.
//
// ── Revocation
//
// `revoked_at` is enforced by the client that owns the row, two ways:
//
// 1. LIVE, via `watchThisDeviceRevocation` — a realtime subscription on this
//    device's own row (migration `user_devices_realtime`), signing out the
//    instant the UPDATE lands. This is the fix for "I signed a device out
//    and it's still logged in over there" (2026-09-02): a tab sitting open
//    had no way to learn its own row had been revoked short of a manual
//    reload, which is not what pressing "Sign out" on that device means to
//    anyone using the button.
// 2. As a FALLBACK, `touchThisDevice` reports revocation back too, so a
//    device that reconnects after being offline (or whose realtime channel
//    dropped — see AuthProvider's periodic re-check) still catches it.
//
// `scope: "global"` sign-out remains the immediate, unconditional
// server-side kill switch regardless of whether either of the above is
// connected, and Settings' UI says which is which.
// ---------------------------------------------------------------------------

import { supabase } from "../supabase";

const DEVICE_KEY_STORAGE = "aren.device.v1.key";

export interface UserDevice {
    id: string;
    deviceKey: string;
    label: string | null;
    platform: string | null;
    browser: string | null;
    formFactor: string;
    firstSeenAt: string;
    lastSeenAt: string;
    revokedAt: string | null;
    /** True for the install this code is running on. */
    isThisDevice: boolean;
}

/** The stable per-install id, minted on first use. Falls back to a
 *  session-lifetime id when storage is unavailable (private windows, embedded
 *  webviews) rather than throwing — a device we can't remember is still worth
 *  showing as "signed in right now". */
let memoryKey: string | null = null;
export function thisDeviceKey(): string {
    if (memoryKey) return memoryKey;
    try {
        const stored = localStorage.getItem(DEVICE_KEY_STORAGE);
        if (stored) { memoryKey = stored; return stored; }
        const minted = crypto.randomUUID();
        localStorage.setItem(DEVICE_KEY_STORAGE, minted);
        memoryKey = minted;
        return minted;
    } catch {
        memoryKey = crypto.randomUUID();
        return memoryKey;
    }
}

export interface DeviceDescription {
    label: string;
    browser: string;
    platform: string;
    formFactor: "desktop" | "laptop" | "tablet" | "phone";
}

/**
 * "Chrome on macOS" from the user agent. Order matters in both lists: Edge
 * and Opera both claim to be Chrome, and iPadOS claims to be a Mac, so the
 * more specific test has to run first or every row reads "Chrome on macOS".
 */
export function describeDevice(ua: string = navigator.userAgent): DeviceDescription {
    // `Chrome/` is claimed by Edge, Opera and Safari's own UA alike, so the
    // specific tests run first. Safari is the LAST guess, not the first
    // match, or every Chromium browser reads as Safari.
    const browser =
        /\bEdg\//.test(ua) ? "Edge" :
        /\bOPR\//.test(ua) ? "Opera" :
        /\bFirefox\//.test(ua) ? "Firefox" :
        /Chrome\//.test(ua) ? "Chrome" :
        /\bSafari\//.test(ua) ? "Safari" : "Browser";

    const isIPad = /iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    const platform =
        isIPad ? "iPadOS" :
        /iPhone/.test(ua) ? "iOS" :
        /Android/.test(ua) ? "Android" :
        /Windows/.test(ua) ? "Windows" :
        /Mac OS X|Macintosh/.test(ua) ? "macOS" :
        /CrOS/.test(ua) ? "ChromeOS" :
        /Linux/.test(ua) ? "Linux" : "This computer";

    const formFactor: DeviceDescription["formFactor"] =
        isIPad || /Tablet/.test(ua) ? "tablet" :
        /iPhone|Android.*Mobile|Mobile/.test(ua) ? "phone" :
        /Macintosh|Windows|Linux|CrOS/.test(ua) ? "laptop" : "desktop";

    return { label: `${browser} on ${platform}`, browser, platform, formFactor };
}

/** Human word for the form factor, for a row that already names the browser. */
export function formFactorLabel(formFactor: string): string {
    switch (formFactor) {
        case "tablet": return "Tablet";
        case "phone": return "Phone";
        case "laptop": return "Laptop or desktop";
        default: return "Desktop";
    }
}

/**
 * Record that this install is in use, and report whether it has been revoked
 * from elsewhere.
 *
 * Called on boot. Every failure mode returns `{ revoked: false }`: the device
 * list is a convenience, and a doctor must never be signed out of a consult
 * because a bookkeeping write timed out. Only an explicit `revoked_at` coming
 * back from the server counts as a revocation.
 */
export async function touchThisDevice(
    userId: string,
    hospitalId: string | null
): Promise<{ revoked: boolean }> {
    const d = describeDevice();
    try {
        const { data, error } = await supabase
            .from("user_devices")
            .upsert(
                {
                    user_id: userId,
                    hospital_id: hospitalId,
                    device_key: thisDeviceKey(),
                    label: d.label,
                    platform: d.platform,
                    browser: d.browser,
                    form_factor: d.formFactor,
                    last_seen_at: new Date().toISOString(),
                },
                { onConflict: "user_id,device_key" }
            )
            .select("revoked_at")
            .maybeSingle<{ revoked_at: string | null }>();

        if (error || !data) return { revoked: false };
        return { revoked: data.revoked_at != null };
    } catch {
        return { revoked: false };
    }
}

/**
 * Live: call `onRevoked` the moment THIS device's own row is revoked from
 * elsewhere, without waiting for a reload.
 *
 * Filtered server-side on `device_key` (RLS on `user_devices` scopes it to
 * rows this account owns regardless, but the filter also means this one
 * open tab isn't sent every OTHER device's updates just to ignore them).
 * Same `postgres_changes` shape as `subscribeGatewaySessions`
 * (`lib/db/gateways.ts`) — unique channel name, `removeChannel` on cleanup.
 *
 * This is the live half only. `touchThisDevice`'s own return value is the
 * fallback for when the channel never connected or dropped silently — see
 * AuthProvider's periodic re-check, which exists for exactly that gap.
 */
export function watchThisDeviceRevocation(onRevoked: () => void): () => void {
    const key = thisDeviceKey();
    const channel = supabase
        .channel(`user_devices:${key}:${Date.now()}`)
        .on(
            "postgres_changes",
            { event: "UPDATE", schema: "public", table: "user_devices", filter: `device_key=eq.${key}` },
            (payload) => {
                const next = payload.new as { revoked_at: string | null };
                if (next.revoked_at != null) onRevoked();
            }
        )
        .subscribe();
    return () => {
        void supabase.removeChannel(channel);
    };
}

/** Every install this account has signed in from, most recent first. Revoked
 *  rows are excluded — a revoked device is one the doctor already dismissed,
 *  and keeping it on the list only invites revoking it twice. */
export async function fetchDevices(userId: string): Promise<UserDevice[]> {
    const { data, error } = await supabase
        .from("user_devices")
        .select("id, device_key, label, platform, browser, form_factor, first_seen_at, last_seen_at, revoked_at")
        .eq("user_id", userId)
        .is("revoked_at", null)
        .order("last_seen_at", { ascending: false });

    if (error) throw new Error(`fetchDevices: ${error.message}`);
    const mine = thisDeviceKey();
    return (data ?? []).map((r) => ({
        id: r.id,
        deviceKey: r.device_key,
        label: r.label,
        platform: r.platform,
        browser: r.browser,
        formFactor: r.form_factor,
        firstSeenAt: r.first_seen_at,
        lastSeenAt: r.last_seen_at,
        revokedAt: r.revoked_at,
        isThisDevice: r.device_key === mine,
    }));
}

/** Mark another install revoked. It signs itself out the next time it runs;
 *  the caller is responsible for saying so rather than implying the session
 *  died the instant the button was pressed. */
export async function revokeDevice(deviceId: string): Promise<void> {
    const { error } = await supabase
        .from("user_devices")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", deviceId);
    if (error) throw new Error(`revokeDevice: ${error.message}`);
}

/** "Active now", "2 hours ago", "12 Aug" — the granularity a device list
 *  needs, and no more precise than the heartbeat that feeds it. */
export function lastSeenLabel(iso: string): string {
    const then = new Date(iso).getTime();
    if (Number.isNaN(then)) return "—";
    const mins = Math.floor((Date.now() - then) / 60000);
    if (mins < 3) return "Active now";
    if (mins < 60) return `${mins} min ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
    return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}
