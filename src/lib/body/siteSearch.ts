// ---------------------------------------------------------------------------
// SITE SEARCH — "kn" → Right knee, Left knee, Both knees.
//
// The typed half of every "where?" question: the command bar's where-slot
// after a local finding, and the finding chip's own popover. Built on the
// same site table as the anatomy picker (`CLINICAL_SITE_OPTIONS`), so a
// typed "Right knee" and a clicked one are one string.
//
// Ranked by what this visit already knows, not alphabetically:
//
//   1. places already in the visit — a sited finding, a marked joint, an
//      assessment's site ("Right knee" after "Fracture - Right knee")
//   2. places the complaints imply — "Knee pain" on the sheet puts both
//      knees ahead of every other joint
//   3. everything else that matches
//
// Typing is forgiving the way a clinician writes: "rt kn", "l wrist",
// "b/l knee", "lower back", "shin" all land where they should. Every typed
// word must begin some word of the place (its name or a common alias), so
// "kn" is the knee and never "unknown".
// ---------------------------------------------------------------------------

import type { BodyAspect, BodyRegion } from "./anatomy";
import { CLINICAL_SITE_OPTIONS, clinicalSiteLabel, isMidline, sameSite, type SiteRef } from "./clinicalSite";

export type SiteWhy = "visit" | "complaint";

export interface SiteHit {
    site: SiteRef;
    label: string;
    /** why it ranks where it does, shown on the row */
    why?: SiteWhy;
}

/** Words a clinician uses for a place that its chart name does not contain. */
const ALIASES: Partial<Record<string, string[]>> = {
    "lumbar spine": ["lower", "back", "lbp", "ls"],
    "thoracic spine": ["upper", "back", "dorsal", "mid"],
    "cervical spine": ["neck", "cs"],
    "upper arm": ["arm", "humerus", "biceps"],
    forearm: ["arm", "radius", "ulna"],
    hand: ["finger", "fingers", "palm", "thumb"],
    foot: ["toe", "toes", "heel", "sole", "metatarsal"],
    ankle: ["malleolus"],
    thigh: ["femur", "quadriceps", "hamstring"],
    "lower leg": ["leg", "shin", "calf", "tibia", "fibula"],
    knee: ["patella"],
    hip: ["groin"],
    buttock: ["gluteal"],
    shoulder: ["deltoid"],
    pelvis: ["pelvic"],
};

/** Shorthand for a side, as it gets written on a chart. */
const SIDE_WORDS: Record<string, "left" | "right" | "bilateral"> = {
    r: "right", rt: "right", right: "right",
    l: "left", lt: "left", left: "left",
    bl: "bilateral", "b/l": "bilateral", bilat: "bilateral", both: "bilateral", bilateral: "bilateral",
};

interface Option { site: SiteRef; label: string; words: string[]; nameWords: string[] }

const OPTIONS: Option[] = (() => {
    const out: Option[] = [];
    const add = (site: SiteRef) => {
        const label = clinicalSiteLabel(site);
        const base = label.toLowerCase().replace(/^(left|right|bilateral) /, "");
        const sideWord = site.side === "both" ? "bilateral" : site.side ?? "";
        const words = [
            ...label.toLowerCase().split(/\s+/),
            ...(ALIASES[base] ?? []),
            ...(sideWord ? [sideWord] : []),
        ];
        out.push({ site, label, words, nameWords: label.toLowerCase().split(/\s+/) });
    };
    for (const o of CLINICAL_SITE_OPTIONS) add(o.site);
    // Both sides at once, for the paired limbs ("Bilateral knee"), after
    // their left and right — offered, never the first guess.
    const seen = new Set<string>();
    for (const o of CLINICAL_SITE_OPTIONS) {
        if (!o.site.side || isMidline(o.site.region, o.site.aspect)) continue;
        const k = `${o.site.region}|${o.site.aspect}`;
        if (seen.has(k)) continue;
        seen.add(k);
        add({ ...o.site, side: "both" });
    }
    return out;
})();

function matches(opt: Option, tokens: string[]): boolean {
    return tokens.every((t) => {
        // "l" is Left, but also the start of "lower back": a side word
        // matches its side OR, like any word, the start of a name.
        const side = SIDE_WORDS[t];
        if (side && opt.words.includes(side)) return true;
        return opt.words.some((w) => w.startsWith(t));
    });
}

/**
 * The places a complaint already names. "Knee pain" is a knee, either
 * side; "Low back pain" is the lumbar spine. Nothing is inferred beyond the
 * catalogue's own region-named complaints.
 */
const COMPLAINT_REGION: Record<string, { region: BodyRegion; aspect: BodyAspect }> = {
    "Knee pain": { region: "knee", aspect: "front" },
    "Shoulder pain": { region: "shoulder", aspect: "front" },
    "Elbow pain": { region: "elbow", aspect: "front" },
    "Wrist / hand pain": { region: "wrist", aspect: "front" },
    "Hip pain": { region: "hip", aspect: "front" },
    "Ankle / foot pain": { region: "ankle", aspect: "front" },
    "Neck pain": { region: "neck", aspect: "back" },
    "Upper back pain": { region: "torso_upper", aspect: "back" },
    "Low back pain": { region: "torso_lower", aspect: "back" },
};

export function impliedSites(labels: Iterable<string>): SiteRef[] {
    const out: SiteRef[] = [];
    for (const l of labels) {
        const r = COMPLAINT_REGION[l];
        if (!r) continue;
        const sides: (SiteRef["side"])[] = isMidline(r.region, r.aspect) ? [null] : ["right", "left"];
        for (const side of sides) {
            const s: SiteRef = { region: r.region, aspect: r.aspect, side };
            if (!out.some((x) => sameSite(x, s))) out.push(s);
        }
    }
    return out;
}

function whyOf(site: SiteRef, known: SiteRef[], implied: SiteRef[]): SiteWhy | undefined {
    if (known.some((k) => sameSite(k, site))) return "visit";
    if (implied.some((k) => sameSite(k, site))) return "complaint";
    return undefined;
}

const RANK: Record<SiteWhy | "none", number> = { visit: 0, complaint: 1, none: 2 };
const SIDE_ORDER = (s: SiteRef) => (s.side === "right" ? 0 : s.side === "left" ? 1 : s.side === null ? 2 : 3);
/** A place found by its own name ("sh" → Shoulder) before one found only by an alias ("sh" → shin). */
const byAlias = (o: Option, tokens: string[]) =>
    tokens.some((t) => !SIDE_WORDS[t] && !o.nameWords.some((w) => w.startsWith(t))) ? 1 : 0;

/** Typed: every match, the visit's own places first. Empty query → []. */
export function searchSites(query: string, known: SiteRef[], implied: SiteRef[], limit = 6): SiteHit[] {
    const tokens = query.toLowerCase().trim().split(/[\s,]+/).filter(Boolean);
    if (!tokens.length) return [];
    const hits = OPTIONS.filter((o) => matches(o, tokens)).map((o, i) => ({
        o, i, why: whyOf(o.site, known, implied), alias: byAlias(o, tokens),
    }));
    hits.sort((a, b) =>
        RANK[a.why ?? "none"] - RANK[b.why ?? "none"]
        || a.alias - b.alias
        || SIDE_ORDER(a.o.site) - SIDE_ORDER(b.o.site)
        || a.i - b.i);
    return hits.slice(0, limit).map((h) => ({ site: h.o.site, label: h.o.label, why: h.why }));
}

/** Nothing typed yet: the visit's places, then the complaints' — the likely answers. */
export function suggestSites(known: SiteRef[], implied: SiteRef[], limit = 6): SiteHit[] {
    const out: SiteHit[] = [];
    for (const s of known) {
        if (!out.some((h) => sameSite(h.site, s))) out.push({ site: s, label: clinicalSiteLabel(s), why: "visit" });
    }
    for (const s of implied) {
        if (!out.some((h) => sameSite(h.site, s))) out.push({ site: s, label: clinicalSiteLabel(s), why: "complaint" });
    }
    return out.slice(0, limit);
}
