// ---------------------------------------------------------------------------
// EVERY SETTING IN CORTEX, IN ONE LIST — the index behind the Settings page's
// search box.
//
// This is a MAP of settings that already exist, never a menu of new ones.
// Every entry points at a real control on a real page, by the DOM id that
// control already carries (`prac-card-*` from PracticeCard, `clin-card-*` and
// `clin-identity-*` from ClinicPage) — if an entry here has no working
// anchor, the search sends a doctor to a page and abandons them there, which
// is worse than not listing it.
//
// ── Why this exists
//
// Cortex spreads its settings across the page that OWNS them on purpose:
// clinic hours next to the clinic's identity, preferred labs next to the
// medicines they rank. That is right for using them and useless for finding
// them — Anmol, 2026-08-31: "there are settings distributed in different
// pages... everything should be there. You could access everything for a
// context from there."
//
// So Settings does not become the page that holds every switch; it becomes
// the page that KNOWS where every switch is. Search here, land there.
//
// ── Keeping it honest
//
// When a new setting lands anywhere in the app, it gets a row here and a DOM
// id on the page that owns it. When one is removed, its row goes with it. The
// test for a row is not "is this configurable" but "would a doctor go looking
// for this and not know which page it is on".
//
// This rule was broken once already: Clinic's Staff card (2026-09-03) shipped
// with no row here and no anchor on itself, three sessions before anyone
// noticed — "there are some new things added and can't search for them."
// Both are fixed now (`clinic.staff` / `clin-card-staff`), but the miss is
// worth keeping as the standing reminder this comment now is: a feature PR
// isn't done until this file and the anchor on the new control both land in
// the SAME change, not a follow-up someone might get to.
// ---------------------------------------------------------------------------

import type { LucideIcon } from "lucide-react";
import {
    Activity, Building2, Clock, FlaskConical, Keyboard, Layers,
    MonitorSmartphone, Pill, Printer, Shield, ShieldCheck, Sparkles,
    Stethoscope, User, Users,
} from "lucide-react";
import type { SidebarPage } from "../sidebar/SidebarNav";

export interface SettingEntry {
    /** Stable id, `page.thing`. Only used as a React key and for tests. */
    id: string;
    /** What a doctor would call it. */
    label: string;
    /** One line: what it decides. Never two. */
    description: string;
    /** Words a doctor might search that aren't in the label — the whole
     *  reason "which measurements does the consult open with" finds
     *  "Consult defaults". */
    keywords: string[];
    /** Which page owns the control. */
    page: SidebarPage;
    /** DOM id of the control on that page. Verified to exist — see header. */
    anchor: string;
    /** The small location label on a search result — where this lives, in the
     *  words a doctor would use to describe the place. */
    group: "Clinic" | "Practice" | "Prescription Pad" | "Settings";
    /** Result-row icon. A registry of UI destinations may hold UI. */
    icon: LucideIcon;
}

export const SETTINGS_INDEX: SettingEntry[] = [
    // ── Clinic ────────────────────────────────────────────────────────────
    {
        id: "clinic.identity",
        label: "Clinic profile",
        description: "Name, logo, address, phone and what patients see on a prescription.",
        keywords: ["clinic", "logo", "address", "branding", "name", "letterhead", "hospital", "contact", "website"],
        page: "clinic", anchor: "clin-identity-clinic", group: "Clinic", icon: Building2,
    },
    {
        id: "clinic.doctor",
        label: "Doctor profile",
        description: "Your name, photo, qualification, registration number and signature.",
        keywords: ["doctor", "profile", "photo", "avatar", "signature", "qualification", "registration", "degree"],
        page: "clinic", anchor: "clin-identity-doctor", group: "Clinic", icon: Stethoscope,
    },
    {
        id: "clinic.hours",
        label: "Clinic hours",
        description: "Which days you see patients, and when.",
        keywords: ["hours", "timing", "open", "closed", "schedule", "days", "week", "opening", "shift"],
        page: "clinic", anchor: "clin-card-hours", group: "Clinic", icon: Clock,
    },
    {
        // Added with Consult (2026-09-03) and missed here until 2026-09-06 —
        // exactly the "new things added and can't search for them" gap this
        // registry exists to not have. See the file header's own warning.
        id: "clinic.staff",
        label: "Staff",
        description: "Who works at this clinic, their role, and whether they can sign in.",
        keywords: ["staff", "receptionist", "reception", "front desk", "employee", "team", "user", "users",
            "role", "access", "permission", "deactivate", "invite", "add staff", "manage staff"],
        page: "clinic", anchor: "clin-card-staff", group: "Clinic", icon: Users,
    },

    {
        id: "settings.consult",
        label: "Consult setup",
        description: "Which chart, outputs and measurements the consult screen opens with.",
        keywords: ["specialty", "speciality", "profile", "physiotherapy", "dental", "cardiology", "chart", "consult", "facility", "engine", "synapse"],
        page: "settings", anchor: "set-card-consult", group: "Settings", icon: Stethoscope,
    },

    // ── Prescription pad (lives on Clinic, but nobody looks for it there) ──
    {
        id: "rx.layout",
        label: "Prescription pad",
        description: "How a printed prescription is laid out, and what it carries by default.",
        keywords: ["prescription", "rx", "print", "pad", "layout", "footer", "letterhead", "paper", "header"],
        page: "clinic", anchor: "clin-card-rx", group: "Prescription Pad", icon: Printer,
    },
    {
        id: "rx.advice",
        label: "Default prescription advice",
        description: "The standing advice lines every prescription starts with.",
        keywords: ["advice", "instructions", "notes", "default", "standing", "footer"],
        page: "clinic", anchor: "clin-card-rx", group: "Prescription Pad", icon: Layers,
    },
    {
        id: "rx.language",
        label: "Prescription language",
        description: "The language a printed prescription is rendered in.",
        keywords: ["language", "hindi", "english", "translate", "script", "bilingual", "regional"],
        page: "clinic", anchor: "clin-card-rx", group: "Prescription Pad", icon: Printer,
    },

    // ── Practice ──────────────────────────────────────────────────────────
    {
        id: "practice.medicines",
        label: "Preferred medicines",
        description: "The medicines your practice reaches for first, grouped by composition.",
        keywords: ["medicine", "drug", "brand", "preferred", "favourite", "composition", "molecule", "formulary"],
        page: "practice", anchor: "prac-card-medicines", group: "Practice", icon: Pill,
    },
    {
        id: "practice.labs",
        label: "Preferred labs",
        description: "Which diagnostic centres Cortex suggests first for investigations.",
        keywords: ["lab", "labs", "diagnostic", "centre", "center", "investigation", "test", "pathology"],
        page: "practice", anchor: "prac-card-labs", group: "Practice", icon: FlaskConical,
    },
    {
        id: "practice.templates",
        label: "Prescription templates",
        description: "Saved prescription setups you can apply in one click.",
        keywords: ["template", "preset", "saved", "quick", "reuse", "protocol"],
        page: "practice", anchor: "prac-card-templates", group: "Practice", icon: Layers,
    },
    {
        id: "practice.companions",
        label: "Companion suggestions",
        description: "Which medicines Cortex may offer alongside one you've already chosen.",
        keywords: ["companion", "pairing", "together", "suggest", "alongside", "combination", "synapse"],
        page: "practice", anchor: "prac-card-companions", group: "Practice", icon: Sparkles,
    },

    // ── Settings' own ─────────────────────────────────────────────────────
    // Indexed like everything else so the search is genuinely a map of the
    // whole app, not "other pages, plus whatever you can already see".
    {
        id: "settings.account",
        label: "Account & security",
        description: "Contact email, password and which clinic you belong to.",
        keywords: ["account", "email", "password", "phone", "security", "login", "sign in", "delete account", "users"],
        page: "settings", anchor: "set-card-account", group: "Settings", icon: User,
    },
    {
        id: "settings.subscription",
        label: "Subscription",
        description: "Your plan, what it carries, when it renews, and how to change it.",
        keywords: ["subscription", "plan", "billing", "renew", "payment", "invoice", "upgrade", "trial"],
        page: "settings", anchor: "set-card-subscription", group: "Settings", icon: ShieldCheck,
    },
    {
        id: "settings.devices",
        label: "Devices",
        description: "Every machine signed in to this account, and how to sign one out.",
        keywords: ["device", "session", "sign out", "logout", "laptop", "tablet", "shared", "computer", "revoke"],
        page: "settings", anchor: "set-card-devices", group: "Settings", icon: MonitorSmartphone,
    },
    {
        id: "settings.health",
        label: "System health",
        description: "What's working, and diagnostics to send us when something isn't.",
        keywords: ["health", "status", "diagnostics", "offline", "slow", "broken", "not working", "sync", "logs", "support"],
        page: "settings", anchor: "set-health-strip", group: "Settings", icon: Activity,
    },
    {
        id: "settings.privacy",
        label: "Privacy & security",
        description: "How AREN protects your data, and your rights over it.",
        keywords: ["privacy", "security", "gdpr", "policy", "rights", "protection", "compliance"],
        page: "settings", anchor: "set-help-strip", group: "Settings", icon: Shield,
    },
    {
        id: "settings.keyboard",
        label: "Keyboard shortcuts",
        description: "Every shortcut the consult screen listens for.",
        keywords: ["keyboard", "shortcut", "key", "binding", "hotkey", "kbd", "shortcuts"],
        page: "settings", anchor: "set-card-consult", group: "Settings", icon: Keyboard,
    },
];

/**
 * A character-order subsequence test — every character of `q` has to occur
 * in `text`, in the same order, not necessarily touching. The standard
 * lightweight "fuzzy" test (the one fzf/Sublime-style pickers use): "cnslt
 * hrs" still finds "Consult setup" / "Clinic hours", and a dropped or
 * doubled letter ("consut", "reciption") still lands on the right row.
 * Both arguments are assumed already lower-cased by the caller.
 */
function isFuzzySubsequence(text: string, q: string): boolean {
    if (!q) return true;
    let ti = 0;
    for (let qi = 0; qi < q.length; qi++) {
        const ch = q[qi];
        let found = false;
        while (ti < text.length) {
            if (text[ti] === ch) { found = true; ti++; break; }
            ti++;
        }
        if (!found) return false;
    }
    return true;
}

/**
 * Match a query against the index.
 *
 * A case-insensitive substring over label, description and keywords first —
 * label beats keyword beats description — and only once none of those three
 * hit anything does a fuzzy (character-subsequence) pass over label and
 * keywords run, ranked below every exact hit. 2026-09-06: this used to be
 * substring-only, on the reasoning that a dozen rows don't need "machinery
 * standing in for a list" — true for reading the list, wrong for SEARCHING
 * it, where a typo or a word swapped for its synonym ("recepion", "front
 * desk staff") used to come back empty. The fuzzy pass is deliberately
 * gated to a 3-character-minimum query and to label/keywords only (never
 * the free-text description, which is long enough that a short query
 * subsequence-matches almost any sentence, returning noise) — see
 * `isFuzzySubsequence`'s own doc comment for what it does and doesn't catch.
 */
export function searchSettings(query: string): SettingEntry[] {
    const q = query.trim().toLowerCase();
    if (!q) return [];

    const scored: { entry: SettingEntry; rank: number }[] = [];
    for (const entry of SETTINGS_INDEX) {
        const label = entry.label.toLowerCase();
        const keywords = entry.keywords.map((k) => k.toLowerCase());

        if (label.includes(q)) {
            scored.push({ entry, rank: label.startsWith(q) ? 0 : 1 });
            continue;
        }
        if (keywords.some((k) => k.includes(q))) {
            scored.push({ entry, rank: 2 });
            continue;
        }
        if (entry.description.toLowerCase().includes(q)) {
            scored.push({ entry, rank: 3 });
            continue;
        }
        if (q.length >= 3 && (isFuzzySubsequence(label, q) || keywords.some((k) => isFuzzySubsequence(k, q)))) {
            scored.push({ entry, rank: 4 });
        }
    }
    return scored.sort((a, b) => a.rank - b.rank).map((s) => s.entry);
}
