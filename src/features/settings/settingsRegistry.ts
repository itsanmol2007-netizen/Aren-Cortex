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
// ---------------------------------------------------------------------------

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
    /** Grouping shown in the results list. */
    group: "Clinic" | "Practice" | "Workspace";
}

export const SETTINGS_INDEX: SettingEntry[] = [
    // ── Clinic ────────────────────────────────────────────────────────────
    {
        id: "clinic.identity",
        label: "Clinic profile",
        description: "Name, logo, address, phone and what patients see on a prescription.",
        keywords: ["clinic", "logo", "address", "branding", "name", "letterhead", "hospital", "contact"],
        page: "clinic",
        anchor: "clin-identity-clinic",
        group: "Clinic",
    },
    {
        id: "clinic.doctor",
        label: "Doctor profile",
        description: "Your name, photo, qualification, registration number and signature.",
        keywords: ["doctor", "profile", "photo", "avatar", "signature", "qualification", "registration", "me", "my account"],
        page: "clinic",
        anchor: "clin-identity-doctor",
        group: "Clinic",
    },
    {
        id: "clinic.hours",
        label: "Clinic hours",
        description: "Which days you see patients, and when.",
        keywords: ["hours", "timing", "open", "closed", "schedule", "days", "week", "opening"],
        page: "clinic",
        anchor: "clin-card-hours",
        group: "Clinic",
    },
    {
        id: "clinic.rx",
        label: "Prescription pad",
        description: "How a printed prescription is laid out, and the advice it carries by default.",
        keywords: ["prescription", "rx", "print", "pad", "layout", "advice", "footer", "letterhead"],
        page: "clinic",
        anchor: "clin-card-rx",
        group: "Clinic",
    },

    // ── Practice ──────────────────────────────────────────────────────────
    {
        id: "practice.medicines",
        label: "Preferred medicines",
        description: "The medicines your practice reaches for first, grouped by composition.",
        keywords: ["medicine", "drug", "brand", "preferred", "favourite", "composition", "molecule"],
        page: "practice",
        anchor: "prac-card-medicines",
        group: "Practice",
    },
    {
        id: "practice.labs",
        label: "Preferred labs",
        description: "Which diagnostic centres Cortex suggests first for investigations.",
        keywords: ["lab", "labs", "diagnostic", "centre", "center", "investigation", "test", "pathology"],
        page: "practice",
        anchor: "prac-card-labs",
        group: "Practice",
    },
    {
        id: "practice.templates",
        label: "Prescription templates",
        description: "Saved prescription setups you can apply in one click.",
        keywords: ["template", "preset", "saved", "quick", "reuse", "protocol"],
        page: "practice",
        anchor: "prac-card-templates",
        group: "Practice",
    },
    {
        id: "practice.companions",
        label: "Companion suggestions",
        description: "Which medicines Cortex may offer alongside one you've already chosen.",
        keywords: ["companion", "pairing", "together", "suggest", "alongside", "combination"],
        page: "practice",
        anchor: "prac-card-companions",
        group: "Practice",
    },
];

/**
 * Match a query against the index.
 *
 * Deliberately simple: a case-insensitive substring over label, description
 * and keywords, ranked so a label hit beats a keyword hit beats a description
 * hit. There is no fuzzy matching and no scoring model, because the whole
 * corpus is a dozen rows a doctor can also just read — a ranking algorithm
 * here would be machinery standing in for a list.
 */
export function searchSettings(query: string): SettingEntry[] {
    const q = query.trim().toLowerCase();
    if (!q) return [];

    const scored: { entry: SettingEntry; rank: number }[] = [];
    for (const entry of SETTINGS_INDEX) {
        const label = entry.label.toLowerCase();
        if (label.includes(q)) {
            scored.push({ entry, rank: label.startsWith(q) ? 0 : 1 });
            continue;
        }
        if (entry.keywords.some((k) => k.includes(q))) {
            scored.push({ entry, rank: 2 });
            continue;
        }
        if (entry.description.toLowerCase().includes(q)) {
            scored.push({ entry, rank: 3 });
        }
    }
    return scored.sort((a, b) => a.rank - b.rank).map((s) => s.entry);
}
