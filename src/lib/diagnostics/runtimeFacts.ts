// ---------------------------------------------------------------------------
// WHAT THIS INSTALL IS RUNNING — the technical half of a support case.
//
// Anmol, 2026-09-13: "it states like what is the app version, which browser
// he's using... but more clearly, if PWA is installed or not, and if possible
// what operating system they are using, and sync status and all... so that my
// admin panel code base can actually get from it."
//
// Everything here is collected from the browser about ITSELF and written to
// this install's own `user_devices` row, which Master Control already reads
// with the service role. Nothing is fetched, nothing is inferred about the
// person, and no request of its own is made — `touchThisDevice` already
// writes that row on every boot, so these ride along on a write that was
// happening anyway.
//
// ── The line this file does not cross ──────────────────────────────────────
// Technical and operational facts only: version, browser, OS, install mode,
// service-worker state, sync health, page NAMES. Never a patient, never a
// diagnosis, never anything typed into a consult. `pageTrail()` is the same
// names-only buffer the support mail already carries (see sessionTrace.ts's
// own rules), and it is the only thing here that comes close to describing
// what someone was doing.
//
// ── And what it is not ─────────────────────────────────────────────────────
// Self-reported, under the "own rows" RLS policy: a modified client could
// write anything into these columns. They are diagnostics for a support
// conversation, NOT an audit trail and never an input to a security or
// billing decision. The migration says the same thing in a column comment,
// so it is true where the data lives as well as where it is produced.
// ---------------------------------------------------------------------------

import { appVersionState, pageTrail } from "./sessionTrace";
import { getLastConfirmedOnlineAtSync } from "../offline/connectivityClock";
import { pendingWriteCount } from "../offline/writeQueue";

export interface RuntimeFacts {
    app_version: string;
    build_sha: string;
    display_mode: string;
    os: string | null;
    sw_state: string;
    pending_writes: number;
    last_online_at: string | null;
    page_trail: string | null;
    timezone: string | null;
    screen: string | null;
    locale: string | null;
}

/**
 * Installed, or a browser tab?
 *
 * `display-mode` is the only honest answer available to a web app: it
 * reports how the window was OPENED, which is exactly the question. A PWA
 * launched from the dock matches `standalone` (or `fullscreen`, which is
 * what both AREN manifests now ask for); the same URL in a tab matches
 * `browser`. iOS reports it on `navigator.standalone` instead.
 */
function displayMode(): string {
    try {
        for (const mode of ["fullscreen", "standalone", "minimal-ui", "window-controls-overlay"]) {
            if (window.matchMedia(`(display-mode: ${mode})`).matches) return mode;
        }
        if ((navigator as { standalone?: boolean }).standalone) return "standalone";
        return "browser";
    } catch {
        return "unknown";
    }
}

/**
 * The operating system, preferring User-Agent Client Hints.
 *
 * UA-CH gives a real platform name and version where it exists (Chromium),
 * which matters because the UA string has been frozen for years — every
 * recent Windows reports "Windows NT 10.0" in it whether it is 10 or 11.
 * Falls back to the UA string elsewhere, and to null rather than a guess.
 */
async function operatingSystem(): Promise<string | null> {
    try {
        const uaData = (navigator as unknown as {
            userAgentData?: {
                platform?: string;
                getHighEntropyValues?: (h: string[]) => Promise<{ platform?: string; platformVersion?: string }>;
            };
        }).userAgentData;

        if (uaData?.getHighEntropyValues) {
            const hints = await uaData.getHighEntropyValues(["platform", "platformVersion"]);
            if (hints?.platform) {
                return hints.platformVersion ? `${hints.platform} ${hints.platformVersion}` : hints.platform;
            }
        }
        if (uaData?.platform) return uaData.platform;

        const ua = navigator.userAgent;
        if (/iPad|iPhone|iPod/.test(ua)) return "iOS";
        if (/Android/.test(ua)) return "Android";
        if (/Windows/.test(ua)) return "Windows";
        if (/Mac OS X|Macintosh/.test(ua)) return "macOS";
        if (/CrOS/.test(ua)) return "ChromeOS";
        if (/Linux/.test(ua)) return "Linux";
        return null;
    } catch {
        return null;
    }
}

/** Everything above, gathered once. Never throws — a diagnostic that can
 *  break a sign-in is worse than no diagnostic. */
export async function collectRuntimeFacts(): Promise<RuntimeFacts> {
    const pending = await pendingWriteCount().catch(() => 0);
    const trail = (() => { try { return pageTrail() || null; } catch { return null; } })();

    return {
        app_version: typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "unknown",
        build_sha: typeof __BUILD_SHA__ === "string" ? __BUILD_SHA__ : "unknown",
        display_mode: displayMode(),
        os: await operatingSystem(),
        sw_state: (() => { try { return appVersionState(); } catch { return "unknown"; } })(),
        pending_writes: pending,
        // The connectivity clock's own "last time we genuinely reached the
        // server" — an epoch ms, stored as a timestamptz.
        last_online_at: (() => {
            try {
                const ms = getLastConfirmedOnlineAtSync();
                return ms ? new Date(ms).toISOString() : null;
            } catch { return null; }
        })(),
        page_trail: trail,
        timezone: (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone ?? null; } catch { return null; } })(),
        screen: (() => { try { return `${window.screen.width}x${window.screen.height}`; } catch { return null; } })(),
        locale: (() => { try { return navigator.language ?? null; } catch { return null; } })(),
    };
}
