// ---------------------------------------------------------------------------
// INTERVENTION FAMILIES — what a doctor configures when they perform one.
//
// Synapse ranks FAMILIES ("Cast"), never configurations ("Below-elbow POP
// backslab"). The configuration happens in the Perform modal, and the
// fields depend on the family: a cast asks extent, construction, material;
// an injection asks target and agent; a wound closure asks method, suture
// and when it comes out. Same field engine as assessments
// (assessmentFamilies.ts), so a new family is a row here, not a screen.
//
// Vocabulary follows standard orthopaedic and emergency documentation:
// cast extent by joint (short/long arm, short/long leg, thumb spica),
// full cast vs backslab vs bivalved, POP vs fibreglass; weight-bearing as
// NWB / PWB / FWB; suture removal days by region (face ~5, scalp 7–10,
// trunk and limbs 10–14, over joints ~14).
//
// Removals point back at what they remove: a "Cast removal" offers this
// patient's earlier casts to pick, which fills the site and links the two.
// ---------------------------------------------------------------------------

import type { BodyRegion } from "../../lib/body/anatomy";
import { isSpine, type SiteRef } from "../../lib/body/clinicalSite";
import type { AssessmentDetails, AssessmentFamily, ResolvedFamily } from "./assessmentFamilies";

const lower = (v: string) => v.toLowerCase();

const UPPER: BodyRegion[] = ["shoulder", "upper_arm", "elbow", "forearm", "wrist", "hand"];
const LOWER: BodyRegion[] = ["hip", "thigh", "knee", "lower_leg", "ankle", "foot"];
const isUpper = (s: SiteRef | null) => !!s && UPPER.includes(s.region);
const isLower = (s: SiteRef | null) => !!s && LOWER.includes(s.region);

// ── Site-filtered lists ────────────────────────────────────────────────────

const CAST_EXTENT = (site: SiteRef | null): string[] => {
    if (isUpper(site)) return ["Below-elbow (short arm)", "Above-elbow (long arm)", "Thumb spica", "Other"];
    if (isLower(site)) return ["Below-knee (short leg)", "Above-knee (long leg)", "Cylinder", "Other"];
    return ["Below-elbow (short arm)", "Above-elbow (long arm)", "Thumb spica", "Below-knee (short leg)", "Above-knee (long leg)", "Cylinder", "Other"];
};

const DEVICES_BY_REGION: Partial<Record<BodyRegion, string[]>> = {
    hand: ["Thumb splint", "Finger splint", "Buddy strapping", "Wrist splint"],
    wrist: ["Wrist splint", "Thumb splint"],
    forearm: ["Wrist splint", "Arm sling"],
    elbow: ["Arm sling", "Collar-and-cuff", "Elbow brace"],
    upper_arm: ["Arm sling", "Collar-and-cuff", "Humeral brace"],
    shoulder: ["Arm sling", "Collar-and-cuff", "Shoulder immobiliser"],
    neck: ["Cervical collar"],
    torso_upper: ["Thoracolumbar brace"],
    torso_lower: ["Lumbar belt", "Thoracolumbar brace"],
    knee: ["Knee brace (hinged)", "Knee brace (unhinged)", "Knee immobiliser"],
    thigh: ["Knee immobiliser"],
    lower_leg: ["Walking boot", "Knee immobiliser"],
    ankle: ["Ankle brace", "Walking boot"],
    foot: ["Walking boot", "Ankle brace"],
};
const DEVICES = (site: SiteRef | null): string[] =>
    [...(site && DEVICES_BY_REGION[site.region] ? DEVICES_BY_REGION[site.region]! : [
        "Wrist splint", "Thumb splint", "Arm sling", "Cervical collar", "Knee brace (hinged)",
        "Knee immobiliser", "Ankle brace", "Walking boot", "Lumbar belt",
    ]), "Other"];

/**
 * Days to suture removal, by region — the standard teaching figures, as a
 * starting value the doctor can change: face ~5, scalp 7–10, trunk and
 * limbs 10–14, over a joint ~14.
 */
export function suggestedSutureDays(site: SiteRef | null): number | null {
    if (!site) return null;
    if (site.region === "head_bottom") return 5;
    if (site.region === "head_top") return 8;
    if (site.region === "neck") return 7;
    if (["elbow", "knee", "wrist", "ankle", "hand", "foot", "shoulder", "hip"].includes(site.region)) return 14;
    if (isSpine(site) || ["torso_upper", "torso_lower", "pelvis"].includes(site.region)) return 12;
    return 12;
}

const ANAESTHESIA = ["None", "Local", "Haematoma block", "Regional block", "Procedural sedation"];

// ── The families ───────────────────────────────────────────────────────────

const FAMILIES: Record<string, AssessmentFamily> = {
    cast: {
        key: "cast",
        title: "Cast",
        main: ["extent", "construction", "material"],
        fields: [
            { kind: "choice", key: "extent", label: "Extent", options: CAST_EXTENT, render: (v) => lower(v.replace(/ \(.*\)$/, "")) },
            { kind: "choice", key: "construction", label: "Construction", options: ["Full cast", "Backslab", "Bivalved"], render: lower },
            { kind: "choice", key: "material", label: "Material", options: ["POP", "Fibreglass"], render: (v) => (v === "POP" ? "POP" : "fibreglass") },
            {
                kind: "choice", key: "weightBearing", label: "Weight-bearing",
                options: ["NWB", "PWB", "FWB"],
                showIf: (_d, site) => isLower(site),
            },
            { kind: "number", key: "reviewWeeks", label: "Review / removal due", unit: "weeks", render: (v) => `review in ${v} wk` },
        ],
    },
    splint: {
        key: "splint",
        title: "Splint / brace",
        titleFrom: "device",
        main: ["device", "make"],
        fields: [
            { kind: "choice", key: "device", label: "Device", options: DEVICES },
            { kind: "choice", key: "make", label: "Type", options: ["Prefabricated", "Custom"], render: lower },
            {
                kind: "choice", key: "hinge", label: "Hinge",
                options: ["Locked", "Unlocked", "ROM-limited"],
                showIf: (d) => d.device === "Knee brace (hinged)" || d.device === "Elbow brace",
                render: (v) => `hinge ${lower(v)}`,
            },
            { kind: "choice", key: "wear", label: "Wear", options: ["Full-time", "Night only", "Activity only"], render: lower },
            { kind: "number", key: "weeks", label: "Duration", unit: "weeks", render: (v) => `for ${v} wk` },
        ],
    },
    strapping: {
        key: "strapping",
        title: "Strapping",
        main: ["type"],
        fields: [
            { kind: "choice", key: "type", label: "Type", options: ["Rigid", "Kinesio", "Buddy"], render: lower },
            { kind: "text", key: "purpose", label: "Purpose", placeholder: "e.g. offload lateral ankle" },
        ],
    },
    reduction: {
        key: "reduction",
        title: "Closed reduction",
        main: ["what", "anaesthesia", "nvBefore", "nvAfter"],
        fields: [
            { kind: "choice", key: "what", label: "Of", options: ["Fracture", "Dislocation", "Subluxation"], render: (v) => `of ${lower(v)}` },
            { kind: "choice", key: "anaesthesia", label: "Anaesthesia", options: ANAESTHESIA, render: (v) => (v === "None" ? "no anaesthesia" : `under ${lower(v)}`) },
            { kind: "choice", key: "nvBefore", label: "Neurovascular before", options: ["Intact", "Compromised"], render: (v) => `NV ${lower(v)} before` },
            { kind: "choice", key: "nvAfter", label: "Neurovascular after", options: ["Intact", "Compromised"], render: (v) => `NV ${lower(v)} after` },
            { kind: "choice", key: "confirmed", label: "Reduction confirmed", options: ["Clinically", "On X-ray"], render: (v) => `confirmed ${lower(v)}` },
            { kind: "number", key: "attempts", label: "Attempts", unit: "", render: (v) => `${v} attempt${v === "1" ? "" : "s"}` },
        ],
    },
    aspiration: {
        key: "aspiration",
        title: "Aspiration",
        main: ["target", "volume", "appearance"],
        fields: [
            { kind: "choice", key: "target", label: "Target", options: ["Joint", "Bursa"], render: lower },
            { kind: "number", key: "volume", label: "Volume", unit: "mL", render: (v) => `${v} mL` },
            {
                kind: "choice", key: "appearance", label: "Appearance",
                options: ["Clear / straw", "Turbid", "Purulent", "Blood-stained"], render: lower,
            },
            { kind: "choice", key: "guidance", label: "Guidance", options: ["Landmark", "Ultrasound"], render: (v) => `${lower(v)}-guided` },
            {
                kind: "multi", key: "sentFor", label: "Sent for",
                options: ["Cell count", "Gram stain & culture", "Crystals"], render: (v) => `sent for ${lower(v)}`,
            },
        ],
    },
    injection: {
        key: "injection",
        title: "Injection",
        main: ["target", "agent", "dose"],
        fields: [
            {
                kind: "choice", key: "target", label: "Target",
                options: ["Intra-articular", "Bursa", "Tendon sheath", "Soft tissue / trigger point"], render: lower,
            },
            {
                kind: "choice", key: "agent", label: "Agent",
                options: ["Triamcinolone", "Methylprednisolone", "Lignocaine", "Bupivacaine", "Hyaluronic acid", "PRP", "Other"],
            },
            { kind: "number", key: "dose", label: "Dose", unit: "mg", render: (v) => `${v} mg` },
            { kind: "number", key: "volume", label: "Volume", unit: "mL", render: (v) => `${v} mL` },
            { kind: "choice", key: "guidance", label: "Guidance", options: ["Landmark", "Ultrasound"], render: (v) => `${lower(v)}-guided` },
        ],
    },
    cleaning: {
        key: "cleaning",
        title: "Wound cleaning",
        main: ["solution"],
        fields: [
            { kind: "choice", key: "solution", label: "Solution", options: ["Normal saline", "Povidone-iodine", "Chlorhexidine", "Tap water"], render: lower },
            { kind: "number", key: "volume", label: "Volume", unit: "mL", render: (v) => `${v} mL` },
        ],
    },
    debridement: {
        key: "debridement",
        title: "Debridement",
        main: ["extent", "anaesthesia"],
        fields: [
            { kind: "choice", key: "extent", label: "Extent", options: ["Superficial", "To fascia", "To bone"], render: lower },
            { kind: "choice", key: "anaesthesia", label: "Anaesthesia", options: ["None", "Local", "Regional block"], render: (v) => (v === "None" ? "no anaesthesia" : `under ${lower(v)}`) },
        ],
    },
    dressing: {
        key: "dressing",
        title: "Dressing",
        main: ["type", "changeDays"],
        fields: [
            { kind: "choice", key: "type", label: "Type", options: ["Dry gauze", "Paraffin gauze", "Antiseptic", "Foam / moist"], render: lower },
            { kind: "number", key: "changeDays", label: "Change every", unit: "days", render: (v) => `change every ${v} d` },
        ],
    },
    closure: {
        key: "closure",
        title: "Wound closure",
        main: ["method", "material", "size", "removalDays"],
        fields: [
            { kind: "choice", key: "method", label: "Method", options: ["Sutures", "Staples", "Adhesive strips", "Tissue glue"], render: lower },
            {
                kind: "choice", key: "material", label: "Suture",
                options: ["Nylon", "Silk", "Polypropylene", "Absorbable"],
                showIf: (d) => d.method === "Sutures", render: lower,
            },
            { kind: "choice", key: "size", label: "Size", options: ["3-0", "4-0", "5-0", "6-0"], showIf: (d) => d.method === "Sutures" },
            { kind: "number", key: "count", label: "Number", unit: "", render: (v) => `×${v}` },
            {
                kind: "choice", key: "technique", label: "Technique",
                options: ["Interrupted", "Continuous", "Mattress"],
                showIf: (d) => d.method === "Sutures", render: lower,
            },
            { kind: "choice", key: "anaesthesia", label: "Anaesthesia", options: ["None", "Local"], render: (v) => (v === "None" ? "no anaesthesia" : "under local") },
            {
                kind: "number", key: "removalDays", label: "Removal due", unit: "days",
                showIf: (d) => d.method === "Sutures" || d.method === "Staples",
                render: (v) => `remove in ${v} d`,
            },
        ],
    },
    removal: {
        key: "removal",
        titleFrom: "what",
        main: ["what"],
        fields: [
            { kind: "choice", key: "what", label: "What", options: ["Cast removal", "Splint / brace removal", "Suture removal", "Staple removal", "Strapping removal"] },
        ],
    },
    dressingChange: {
        key: "dressingChange",
        title: "Dressing change",
        main: ["type"],
        fields: [
            { kind: "choice", key: "type", label: "New dressing", options: ["Dry gauze", "Paraffin gauze", "Antiseptic", "Foam / moist"], render: lower },
            { kind: "choice", key: "wound", label: "Wound", options: ["Healing well", "Discharge", "Signs of infection"], render: lower },
        ],
    },
};

/**
 * Catalogue name → family, with anything the name already decides.
 * "Plaster of Paris (POP) cast" is a cast whose material is POP;
 * "Suturing of laceration" is a closure by sutures.
 */
const BY_LABEL: Record<string, { family: string; preset?: AssessmentDetails }> = {
    "plaster of paris (pop) cast": { family: "cast", preset: { material: "POP" } },
    "cast": { family: "cast" },
    "removable splint / brace application": { family: "splint" },
    "strapping / taping": { family: "strapping" },
    "closed reduction of fracture/dislocation": { family: "reduction" },
    "joint aspiration": { family: "aspiration", preset: { target: "Joint" } },
    "intra-articular corticosteroid injection": { family: "injection", preset: { target: "Intra-articular" } },
    "injection (joint / soft tissue)": { family: "injection" },
    "wound cleaning / irrigation": { family: "cleaning" },
    "wound debridement and dressing": { family: "debridement" },
    "dressing": { family: "dressing" },
    "suturing of laceration": { family: "closure", preset: { method: "Sutures" } },
    "cast / splint / suture removal": { family: "removal" },
    "dressing change": { family: "dressingChange" },
};

export interface InterventionFamily extends ResolvedFamily {
    /** what the catalogue name already decides — pre-filled, changeable */
    preset: AssessmentDetails;
}

/** The family behind a catalogue intervention, or null (physio modalities,
 *  anything not configured — those keep the plain site + notes modal). */
export function interventionFamilyFor(label: string): InterventionFamily | null {
    const hit = BY_LABEL[label.trim().toLowerCase()];
    if (!hit) return null;
    return { ...FAMILIES[hit.family], namesItsJoint: false, preset: hit.preset ?? {} };
}

/** Which earlier families a removal / change can point back at. */
export function removableFamilies(familyKey: string): string[] {
    if (familyKey === "removal") return ["cast", "splint", "closure", "strapping"];
    if (familyKey === "dressingChange") return ["dressing", "debridement", "closure", "dressingChange"];
    return [];
}

/** The removal that undoes an earlier intervention — "Cast removal" for a cast. */
export function removalWhatFor(earlierFamily: string, earlierDetails: AssessmentDetails): string | null {
    if (earlierFamily === "cast") return "Cast removal";
    if (earlierFamily === "splint") return "Splint / brace removal";
    if (earlierFamily === "strapping") return "Strapping removal";
    if (earlierFamily === "closure") return earlierDetails.method === "Staples" ? "Staple removal" : "Suture removal";
    return null;
}

/** An assessment family that a reduction treats → its "Of" value. */
export function reductionOfFor(assessmentFamily: string): string | null {
    if (assessmentFamily === "fracture") return "Fracture";
    if (assessmentFamily === "dislocation") return "Dislocation";
    if (assessmentFamily === "subluxation") return "Subluxation";
    return null;
}

// ── Pricing (Phase 7) ──────────────────────────────────────────────────────
// A clinic prices a family ("Cast"), and optionally one configuration of it
// ("Above-elbow (long arm)" costs more than "Below-elbow"). Which field is
// the configuration is fixed per family, so the Practice screen can offer
// exactly those options and a bill can find the right price.

export interface PriceableFamily {
    key: string;
    title: string;
    /** the detail whose value can carry its own price, if any */
    configField: string | null;
    configLabel: string | null;
    configOptions: string[];
}

const allDevices = [...new Set(Object.values(DEVICES_BY_REGION).flat()), "Other"];

export const PRICEABLE_FAMILIES: PriceableFamily[] = [
    { key: "cast", title: "Cast", configField: "extent", configLabel: "Extent", configOptions: CAST_EXTENT(null) },
    { key: "splint", title: "Splint / brace", configField: "device", configLabel: "Device", configOptions: allDevices },
    { key: "strapping", title: "Strapping", configField: "type", configLabel: "Type", configOptions: ["Rigid", "Kinesio", "Buddy"] },
    { key: "reduction", title: "Closed reduction", configField: "what", configLabel: "Type", configOptions: ["Fracture", "Dislocation", "Subluxation"] },
    { key: "aspiration", title: "Aspiration", configField: "target", configLabel: "Target", configOptions: ["Joint", "Bursa"] },
    { key: "injection", title: "Injection", configField: "agent", configLabel: "Agent", configOptions: ["Triamcinolone", "Methylprednisolone", "Lignocaine", "Bupivacaine", "Hyaluronic acid", "PRP", "Other"] },
    { key: "cleaning", title: "Wound cleaning", configField: null, configLabel: null, configOptions: [] },
    { key: "debridement", title: "Debridement", configField: "extent", configLabel: "Extent", configOptions: ["Superficial", "To fascia", "To bone"] },
    { key: "dressing", title: "Dressing", configField: "type", configLabel: "Type", configOptions: ["Dry gauze", "Paraffin gauze", "Antiseptic", "Foam / moist"] },
    { key: "closure", title: "Wound closure", configField: "method", configLabel: "Method", configOptions: ["Sutures", "Staples", "Adhesive strips", "Tissue glue"] },
    { key: "removal", title: "Removal", configField: "what", configLabel: "Type", configOptions: ["Cast removal", "Splint / brace removal", "Suture removal", "Staple removal", "Strapping removal"] },
    { key: "dressingChange", title: "Dressing change", configField: null, configLabel: null, configOptions: [] },
];

/** The configuration value a line is priced by — "" when none applies. */
export function priceConfigOf(familyKey: string, details: AssessmentDetails | undefined): string {
    const f = PRICEABLE_FAMILIES.find((p) => p.key === familyKey);
    if (!f?.configField) return "";
    const v = details?.[f.configField];
    return typeof v === "string" ? v : "";
}
