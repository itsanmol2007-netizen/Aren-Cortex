import {
    AlertTriangle,
    CreditCard,
    GraduationCap,
    Lightbulb,
    MessageCircleQuestion,
    type LucideIcon,
} from "lucide-react";
import { appVersionState, pageTrail, previousPage, recentErrors } from "../../lib/diagnostics/sessionTrace";

// ---------------------------------------------------------------------------
// WHAT A DOCTOR WRITES IN ABOUT.
//
// Built 2026-09-11. Anmol: "they will have their own dedicated options and if
// there is no any template based thing there then they will list their own
// reason by themselves... it would also ask what services are not working...
// and if nothing lists then obviously a free text, freedom of speech."
//
// So: five topics, and the last one is deliberately "Something else" — the
// escape hatch is a first-class option, not a failure state. A template that
// cannot say the thing you need to say is worse than no template, because it
// makes you choose the nearest wrong box.
//
// Only the fault topic asks WHICH AREA, because it is the only one where the
// answer changes what AREN does next: a prescription bug and a WhatsApp
// delivery bug go to different places. "Billing" and "How do I…" do not need
// triage, they need reading.
//
// These labels are what lands in the subject line of the email, so they are
// written to be scanned in a mailbox, not to be clever.
// ---------------------------------------------------------------------------

export type SupportTopic = {
    id: string;
    label: string;
    /** the line under the label on the card */
    hint: string;
    icon: LucideIcon;
    /** what the free-text box asks for once this topic is chosen */
    prompt: string;
    /** shown when this topic is chosen, if it needs triage */
    areas?: string[];
    /** the free-text box is the whole request for this topic */
    requiresMessage?: boolean;
};

export const SUPPORT_TOPICS: SupportTopic[] = [
    {
        id: "fault",
        label: "Something isn't working",
        hint: "A page, a button, or a message that failed",
        icon: AlertTriangle,
        prompt: "What happened, and what were you doing just before it?",
        areas: [
            "Consult screen",
            "Prescriptions & printing",
            "Patients & records",
            "WhatsApp messaging",
            "Front desk & queue",
            "Overview & reports",
            "Signing in & access",
            "Something else",
        ],
        requiresMessage: true,
    },
    {
        id: "billing",
        label: "Billing or my plan",
        hint: "Invoices, renewal, adding a doctor",
        icon: CreditCard,
        prompt: "What would you like sorted out?",
    },
    {
        id: "howto",
        label: "How do I do this?",
        hint: "Something in AREN you'd like walked through",
        icon: GraduationCap,
        prompt: "What are you trying to do?",
        requiresMessage: true,
    },
    {
        id: "request",
        label: "I'd like something changed",
        hint: "A feature, or something that slows you down",
        icon: Lightbulb,
        prompt: "What would you like AREN to do differently?",
        requiresMessage: true,
    },
    {
        id: "other",
        label: "Something else",
        hint: "Not on this list — say it in your own words",
        icon: MessageCircleQuestion,
        prompt: "Tell us what's going on.",
        requiresMessage: true,
    },
];

/**
 * What AREN needs to know to act on this, WITHOUT asking a doctor to describe
 * their own browser.
 *
 * Anmol: "that mail will reach to us with its own identity... so we can also
 * recognize who the doctor is, why he is sending this message, and what his
 * current system state is." The identity half comes from the session on the
 * server (the edge function resolves doctor, clinic and credit balance itself
 * — the page cannot claim to be someone else). This is the other half: what
 * only the browser knows.
 *
 * ── Every line here has to earn its place ─────────────────────────────────
 * The first version of this shipped `Language: en-US` and `Connection:
 * online`, and Anmol cut both on sight — correctly. AREN is English-only, so
 * the language is never the answer to anything; and a request that arrived
 * was self-evidently sent by someone online, so "online" is a tautology
 * dressed as a fact. A diagnostics block that pads itself with filler trains
 * whoever reads it to skim, which costs more than the missing line ever would.
 *
 * What replaced them is the set that actually decides a ticket:
 *
 *   Build        which code they are running. "It's broken" and "it's broken
 *                on a build from nine days ago" are different tickets, and the
 *                second one is often already fixed.
 *   Came from    the page they were on before Help & Support — for a fault
 *                report, this is the screen they mean.
 *   Recent       what actually threw in this tab. The difference between
 *   errors       reproducing a bug and guessing at it.
 *   Installed    a stale service worker is a whole class of "I updated and
 *   / update      it's still wrong", and it is invisible to the doctor.
 *   Network      "messages keep failing" on a 2g uplink is not a bug in AREN.
 *   Viewport     with DPR, because layout faults are resolution-shaped and
 *                `screen` is not what the app was laid out in.
 *
 * Deliberately NOT collected: anything about a patient. A support request is
 * about the software, and a screenful of clinical data in AREN's support
 * mailbox would be a data-protection problem created for a convenience.
 */
export function collectDiagnostics(extra: Record<string, string | null | undefined> = {}): Record<string, string> {
    const out: Record<string, string> = {};
    const put = (k: string, v: string | null | undefined) => {
        if (v) out[k] = v;
    };

    // The released version first, then the exact commit inside it. "App
    // version" below is the SERVICE WORKER's state (are they on stale code),
    // which is a different question and keeps its own line.
    put("Version", typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : null);
    put("Build", buildStamp());
    for (const [k, v] of Object.entries(extra)) put(k, v);

    if (typeof window !== "undefined") {
        put("Came from", previousPage());
        put("Route in", pageTrail());
        put("Recent errors", recentErrors());
        put("Install", installMode());
        put("Code freshness", appVersionState());
        put("Network", networkQuality());
        put("Viewport", `${window.innerWidth}×${window.innerHeight} @${window.devicePixelRatio || 1}x`);
        put("Time zone", Intl.DateTimeFormat().resolvedOptions().timeZone);
        put("Browser", describeBrowser(navigator.userAgent));
    }
    return out;
}

/** "7a82341 · built 9 Sept, 14 days ago" — see vite.config.ts's `buildStamp`. */
function buildStamp(): string {
    const sha = typeof __BUILD_SHA__ === "string" ? __BUILD_SHA__ : "unknown";
    let when = "";
    try {
        const built = new Date(__BUILT_AT__);
        const days = Math.floor((Date.now() - built.getTime()) / 86_400_000);
        when = ` · built ${built.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}` +
            (days > 0 ? `, ${days}d old` : ", today");
    } catch { /* a bundle without the stamp still reports its sha */ }
    return `${sha}${when}`;
}

/** Installed to the home screen, or a browser tab. Changes what "reload" means. */
function installMode(): string {
    try {
        if (window.matchMedia("(display-mode: standalone)").matches) return "installed (standalone)";
        if ((navigator as { standalone?: boolean }).standalone) return "installed (iOS)";
    } catch { /* matchMedia is not universal */ }
    return "browser tab";
}

/** "4g · 1.4 Mb/s" where the browser exposes it. Chrome and Edge do. */
function networkQuality(): string | null {
    const c = (navigator as unknown as {
        connection?: { effectiveType?: string; downlink?: number; rtt?: number; saveData?: boolean };
    }).connection;
    if (!c) return null;
    const bits = [
        c.effectiveType,
        typeof c.downlink === "number" ? `${c.downlink} Mb/s` : null,
        typeof c.rtt === "number" ? `${c.rtt}ms rtt` : null,
        c.saveData ? "data saver ON" : null,
    ].filter(Boolean);
    return bits.length ? bits.join(" · ") : null;
}

/** A user-agent string is unreadable in an email; this is the useful half. */
function describeBrowser(ua: string): string {
    const browser =
        /Edg\/([\d.]+)/.exec(ua) ? `Edge ${/Edg\/([\d.]+)/.exec(ua)![1]}` :
        /Chrome\/([\d.]+)/.exec(ua) ? `Chrome ${/Chrome\/([\d.]+)/.exec(ua)![1]}` :
        /Firefox\/([\d.]+)/.exec(ua) ? `Firefox ${/Firefox\/([\d.]+)/.exec(ua)![1]}` :
        /Version\/([\d.]+).*Safari/.exec(ua) ? `Safari ${/Version\/([\d.]+).*Safari/.exec(ua)![1]}` :
        "Unknown browser";
    const os =
        /Windows NT ([\d.]+)/.test(ua) ? "Windows" :
        /Android/.test(ua) ? "Android" :
        /iPhone|iPad/.test(ua) ? "iOS" :
        /Mac OS X/.test(ua) ? "macOS" :
        /Linux/.test(ua) ? "Linux" : "";
    return os ? `${browser} · ${os}` : browser;
}
