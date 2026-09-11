import {
    AlertTriangle,
    CreditCard,
    GraduationCap,
    Lightbulb,
    MessageCircleQuestion,
    type LucideIcon,
} from "lucide-react";

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
 * What AREN needs to know to recognise the sender and the state they were in,
 * WITHOUT asking a doctor to describe their own browser.
 *
 * Anmol: "that mail will reach to us with its own identity... so we can also
 * recognize who the doctor is, why he is sending this message, and what his
 * current system state is." The identity half comes from the session on the
 * server (the edge function resolves the doctor and clinic itself — the page
 * cannot claim to be someone else). This is the other half: the things only
 * the browser knows.
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

    for (const [k, v] of Object.entries(extra)) put(k, v);

    if (typeof window !== "undefined") {
        put("Screen", `${window.innerWidth}×${window.innerHeight}`);
        put("Connection", navigator.onLine ? "online" : "offline");
        put("Time zone", Intl.DateTimeFormat().resolvedOptions().timeZone);
        put("Browser", describeBrowser(navigator.userAgent));
        put("Language", navigator.language);
    }
    return out;
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
