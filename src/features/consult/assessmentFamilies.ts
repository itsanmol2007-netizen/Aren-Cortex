// ---------------------------------------------------------------------------
// ASSESSMENT FAMILIES — which assessments happen somewhere on the body, and
// what a doctor may add about them.
//
// "Fracture" alone is not a diagnosis anyone can treat; "Fracture — Left
// forearm, open, Gustilo II, displaced" is. This is the same shape ICD-11
// uses (a base concept plus extension codes for laterality, open/closed,
// displacement, articular involvement), kept to the vocabularies orthopaedic
// notes already use: Gustilo-Anderson for open fractures, AO/OTA's
// extra-/partial-/complete-articular split, sprain and strain grades I–III,
// Kellgren-Lawrence 0–4 for osteoarthritis, ICRS 1–4 for cartilage.
//
// ── Rules this file keeps
//   • The SITE is the only thing asked for. Every detail is optional.
//   • Lists that depend on the joint (which ligament, which tendon, which
//     direction) change with the site picked — a knee never offers ATFL.
//   • The spine takes a level, never a side; side belongs only to its
//     radiculopathy.
//   • Adding an assessment later is adding a row here, not a new screen.
//
// Anything not listed stays exactly as before: one tap, plain text, no
// modal. Malaria and hypertension have no site to ask about.
// ---------------------------------------------------------------------------

import type { BodyRegion } from "../../lib/body/anatomy";
import { clinicalSiteLabel, isSpine, type SiteRef } from "../../lib/body/clinicalSite";

export type DetailValue = string | boolean;
export type AssessmentDetails = Record<string, DetailValue>;

type Options = string[] | ((site: SiteRef | null) => string[]);

/** only offered when this returns true for what is chosen so far */
type ShowIf = (d: AssessmentDetails, site: SiteRef | null) => boolean;

export type DetailField =
    | {
        kind: "choice";
        key: string;
        label: string;
        options: Options;
        showIf?: ShowIf;
        /** how the chosen value reads in the line */
        render?: (v: string) => string;
    }
    | {
        /** several at once — stored "a|b", printed "a, b" */
        kind: "multi";
        key: string;
        label: string;
        options: Options;
        showIf?: ShowIf;
        render?: (v: string) => string;
    }
    | { kind: "flag"; key: string; label: string; render: string; showIf?: ShowIf }
    | { kind: "text"; key: string; label: string; placeholder: string; render?: (v: string) => string; showIf?: ShowIf }
    | { kind: "number"; key: string; label: string; unit: string; render: (v: string) => string; showIf?: ShowIf };

export interface AssessmentFamily {
    key: string;
    /** the zones this family may be placed on; absent = anywhere */
    regions?: BodyRegion[];
    /** the spine only (cervical / thoracic / lumbar) */
    spineOnly?: boolean;
    /** the chosen value of this field replaces the catalogue name as the
     *  headline — "Septic arthritis — Right knee", not "Local infection —
     *  Right knee, septic arthritis" */
    titleFrom?: string;
    /** the headline once a site is chosen — "X-Ray (Other Site)" reads
     *  "X-Ray — Right clavicle" */
    titleWithSite?: string;
    /** a fixed headline in place of the catalogue name ("Cast" for
     *  "Plaster of Paris (POP) cast", whose material is now a field) */
    title?: string;
    /** fields always on show; the rest wait behind "+ Add details".
     *  Absent: every field is a detail (assessments). */
    main?: string[];
    /** Left | Right | Both — for conditions that are often bilateral */
    bilateral?: boolean;
    fields: DetailField[];
}

const lower = (v: string) => v.toLowerCase();
const GRADES = ["I", "II", "III"];

// ── Joint-dependent vocabularies ───────────────────────────────────────────

const byRegion = (table: Partial<Record<BodyRegion, string[]>>, fallback: string[]): Options =>
    (site) => (site && table[site.region]) || fallback;

const DISLOCATION_DIRECTIONS = byRegion({
    shoulder: ["Anterior", "Posterior", "Inferior"],
    hip: ["Posterior", "Anterior", "Central"],
    elbow: ["Posterior", "Anterior", "Medial", "Lateral"],
    knee: ["Anterior", "Posterior", "Medial", "Lateral", "Rotatory"],
    wrist: ["Perilunate", "Lunate", "Radiocarpal"],
    hand: ["Dorsal", "Volar", "Lateral"],
    ankle: ["Anterior", "Posterior", "Lateral", "Medial"],
    foot: ["Dorsal", "Plantar", "Lateral", "Medial"],
    torso_upper: ["Anterior", "Posterior"],
}, ["Anterior", "Posterior", "Other"]);

const LIGAMENTS = byRegion({
    knee: ["ACL", "PCL", "MCL", "LCL", "Posterolateral corner", "MPFL"],
    ankle: ["ATFL", "CFL", "PTFL", "Deltoid", "Syndesmosis"],
    foot: ["Lisfranc", "Spring ligament", "Other"],
    wrist: ["Scapholunate", "Lunotriquetral", "TFCC"],
    hand: ["Thumb UCL", "Thumb RCL", "Finger collateral", "Volar plate"],
    elbow: ["UCL (medial)", "LCL (lateral)", "Annular"],
    shoulder: ["AC joint", "Coracoclavicular", "Glenohumeral"],
    hip: ["Ligamentum teres", "Iliofemoral"],
}, ["Other"]);

const TENDONS = byRegion({
    shoulder: ["Supraspinatus", "Infraspinatus", "Subscapularis", "Biceps long head"],
    upper_arm: ["Biceps long head", "Pectoralis major", "Triceps"],
    elbow: ["Distal biceps", "Triceps", "Common extensor", "Common flexor"],
    forearm: ["Flexor", "Extensor"],
    wrist: ["Flexor", "Extensor", "EPL", "APL / EPB"],
    hand: ["Flexor", "Extensor", "Central slip", "Mallet (terminal extensor)"],
    hip: ["Gluteus medius", "Iliopsoas", "Hamstring origin", "Adductor"],
    thigh: ["Quadriceps", "Hamstring"],
    knee: ["Patellar", "Quadriceps", "Pes anserinus", "Popliteus"],
    lower_leg: ["Achilles", "Tibialis anterior"],
    ankle: ["Achilles", "Peroneal", "Tibialis posterior", "Tibialis anterior"],
    foot: ["Achilles insertion", "Peroneal", "Tibialis posterior", "Plantar fascia"],
}, ["Other"]);

const MUSCLES = byRegion({
    thigh: ["Hamstring", "Quadriceps", "Adductor"],
    lower_leg: ["Gastrocnemius (calf)", "Soleus"],
    hip: ["Adductor", "Hip flexor", "Gluteal"],
    pelvis: ["Gluteal", "Adductor", "Hip flexor"],
    torso_lower: ["Paraspinal", "Abdominal", "Quadratus lumborum"],
    torso_upper: ["Paraspinal", "Intercostal", "Pectoralis", "Rhomboid"],
    neck: ["Trapezius", "Sternocleidomastoid", "Paraspinal"],
    shoulder: ["Trapezius", "Deltoid", "Pectoralis"],
    upper_arm: ["Biceps", "Triceps"],
    forearm: ["Forearm flexors", "Forearm extensors"],
}, ["Other"]);

// ── The families ───────────────────────────────────────────────────────────

const FAMILIES: Record<string, AssessmentFamily> = {
    fracture: {
        key: "fracture",
        main: ["open", "gustilo", "displaced", "pattern", "articular"],
        fields: [
            { kind: "choice", key: "open", label: "Skin", options: ["Closed", "Open"], render: lower },
            {
                kind: "choice", key: "gustilo", label: "Gustilo grade",
                options: ["I", "II", "IIIA", "IIIB", "IIIC"],
                showIf: (d) => d.open === "Open",
                render: (v) => `Gustilo ${v}`,
            },
            { kind: "choice", key: "displaced", label: "Displacement", options: ["Non-displaced", "Displaced"], render: lower },
            {
                kind: "choice", key: "pattern", label: "Pattern",
                options: ["Transverse", "Oblique", "Spiral", "Comminuted", "Segmental", "Avulsion", "Impacted", "Compression", "Greenstick", "Buckle"],
                render: lower,
            },
            {
                kind: "choice", key: "articular", label: "Joint involvement",
                options: ["Extra-articular", "Partial articular", "Complete articular"],
                render: lower,
            },
            { kind: "flag", key: "pathological", label: "Pathological fracture", render: "pathological" },
        ],
    },
    dislocation: {
        key: "dislocation",
        main: ["direction", "episode"],
        fields: [
            { kind: "choice", key: "direction", label: "Direction", options: DISLOCATION_DIRECTIONS, render: lower },
            { kind: "choice", key: "episode", label: "Episode", options: ["First episode", "Recurrent"], render: lower },
            { kind: "flag", key: "withFracture", label: "With fracture (fracture-dislocation)", render: "with fracture" },
        ],
    },
    subluxation: {
        key: "subluxation",
        main: ["direction", "episode"],
        fields: [
            { kind: "choice", key: "direction", label: "Direction", options: DISLOCATION_DIRECTIONS, render: lower },
            { kind: "choice", key: "episode", label: "Episode", options: ["First episode", "Recurrent"], render: lower },
        ],
    },
    ligament: {
        key: "ligament",
        main: ["ligament", "grade"],
        fields: [
            { kind: "choice", key: "ligament", label: "Ligament", options: LIGAMENTS },
            {
                kind: "choice", key: "grade", label: "Grade",
                options: ["I (stretch)", "II (partial tear)", "III (complete tear)"],
                render: (v) => `grade ${v.split(" ")[0]}`,
            },
        ],
    },
    tendon: {
        key: "tendon",
        main: ["tendon", "type"],
        fields: [
            { kind: "choice", key: "tendon", label: "Tendon", options: TENDONS },
            { kind: "choice", key: "type", label: "Type", options: ["Tendinopathy", "Partial tear", "Complete rupture"], render: lower },
        ],
    },
    muscle: {
        key: "muscle",
        main: ["muscle", "grade"],
        fields: [
            { kind: "choice", key: "muscle", label: "Muscle", options: MUSCLES },
            { kind: "choice", key: "grade", label: "Grade", options: GRADES, render: (v) => `grade ${v}` },
        ],
    },
    meniscus: {
        key: "meniscus",
        main: ["side"],
        regions: ["knee"],
        fields: [
            { kind: "choice", key: "side", label: "Meniscus", options: ["Medial", "Lateral"], render: (v) => `${lower(v)} meniscus` },
            {
                kind: "choice", key: "pattern", label: "Tear pattern",
                options: ["Longitudinal", "Bucket-handle", "Radial", "Horizontal", "Flap", "Complex", "Degenerative"],
                render: (v) => `${lower(v)} tear`,
            },
            { kind: "flag", key: "locking", label: "Locking", render: "locking" },
        ],
    },
    cartilage: {
        key: "cartilage",
        main: ["grade"],
        fields: [
            { kind: "choice", key: "grade", label: "ICRS grade", options: ["1", "2", "3", "4"], render: (v) => `ICRS grade ${v}` },
        ],
    },
    osteoarthritis: {
        key: "osteoarthritis",
        main: ["kl"],
        fields: [
            { kind: "choice", key: "kl", label: "Kellgren-Lawrence grade", options: ["0", "1", "2", "3", "4"], render: (v) => `KL grade ${v}` },
            { kind: "choice", key: "kind", label: "Type", options: ["Primary", "Secondary"], render: lower },
        ],
    },
    spine: {
        key: "spine",
        main: ["type", "level", "radiculopathy"],
        spineOnly: true,
        titleFrom: "type",
        fields: [
            {
                kind: "choice", key: "type", label: "Type",
                options: ["Mechanical pain", "Disc prolapse", "Spondylosis", "Spondylolisthesis", "Canal stenosis", "Vertebral compression fracture"],
            },
            { kind: "text", key: "level", label: "Level", placeholder: "e.g. L4–L5" },
            {
                kind: "choice", key: "radiculopathy", label: "Radiculopathy",
                options: ["None", "Left", "Right", "Bilateral"],
                render: (v) => (v === "None" ? "no radiculopathy" : `${lower(v)} radiculopathy`),
            },
        ],
    },
    wound: {
        key: "wound",
        main: ["type", "length", "contamination"],
        fields: [
            { kind: "choice", key: "type", label: "Type", options: ["Laceration", "Abrasion", "Puncture", "Avulsion", "Crush"], render: lower },
            { kind: "number", key: "length", label: "Length", unit: "cm", render: (v) => `${v} cm` },
            { kind: "choice", key: "contamination", label: "Contamination", options: ["Clean", "Contaminated"], render: lower },
        ],
    },
    infection: {
        key: "infection",
        main: ["type"],
        titleFrom: "type",
        fields: [
            { kind: "choice", key: "type", label: "Type", options: ["Cellulitis", "Abscess", "Septic arthritis", "Osteomyelitis", "Infected wound"] },
        ],
    },
    union: {
        key: "union",
        main: ["type", "nonunion"],
        titleFrom: "type",
        fields: [
            { kind: "choice", key: "type", label: "Type", options: ["Delayed union", "Non-union", "Malunion"] },
            {
                kind: "choice", key: "nonunion", label: "Non-union type",
                options: ["Hypertrophic", "Atrophic"],
                showIf: (d) => d.type === "Non-union",
                render: lower,
            },
        ],
    },
    postop: {
        key: "postop",
        main: ["procedure", "days"],
        fields: [
            { kind: "text", key: "procedure", label: "Procedure done", placeholder: "e.g. ORIF distal radius" },
            { kind: "number", key: "days", label: "Days since surgery", unit: "days", render: (v) => `day ${v} post-op` },
        ],
    },
    siteOnly: { key: "siteOnly", fields: [] },
};

/**
 * Catalogue name → family, plus the zones a joint-specific name implies
 * ("Knee osteoarthritis" is only ever a knee). Matched on the exact
 * catalogue label, lower-cased.
 */
const BY_LABEL: Record<string, { family: string; regions?: BodyRegion[]; bilateral?: boolean }> = {
    "fracture": { family: "fracture" },
    "previous fracture": { family: "siteOnly" },
    "dislocation": { family: "dislocation" },
    "subluxation": { family: "subluxation" },
    "ligament sprain": { family: "ligament" },
    "ankle sprain": { family: "ligament", regions: ["ankle", "foot"] },
    "tendon injury": { family: "tendon" },
    "achilles tendinopathy": { family: "siteOnly", regions: ["ankle", "lower_leg", "foot"], bilateral: true },
    "rotator cuff tendinopathy": { family: "siteOnly", regions: ["shoulder"] },
    "subacromial impingement": { family: "siteOnly", regions: ["shoulder"] },
    "adhesive capsulitis (frozen shoulder)": { family: "siteOnly", regions: ["shoulder"], bilateral: true },
    "lateral epicondylitis (tennis elbow)": { family: "siteOnly", regions: ["elbow"], bilateral: true },
    "medial epicondylitis": { family: "siteOnly", regions: ["elbow"], bilateral: true },
    "carpal tunnel syndrome": { family: "siteOnly", regions: ["wrist", "hand"], bilateral: true },
    "de quervain tenosynovitis": { family: "siteOnly", regions: ["wrist", "hand"], bilateral: true },
    "trochanteric bursitis": { family: "siteOnly", regions: ["hip"], bilateral: true },
    "plantar fasciitis": { family: "siteOnly", regions: ["foot"], bilateral: true },
    "muscle strain": { family: "muscle" },
    "meniscal injury": { family: "meniscus" },
    "cartilage / osteochondral injury": { family: "cartilage" },
    "osteoarthritis": { family: "osteoarthritis", bilateral: true },
    "knee osteoarthritis": { family: "osteoarthritis", regions: ["knee"], bilateral: true },
    "hip osteoarthritis": { family: "osteoarthritis", regions: ["hip"], bilateral: true },
    "spine disorder": { family: "spine" },
    "soft-tissue injury / contusion": { family: "siteOnly" },
    "wound": { family: "wound" },
    "local infection": { family: "infection" },
    "cellulitis": { family: "siteOnly" },
    "delayed union / non-union / malunion": { family: "union" },
    "osteonecrosis (avn)": { family: "siteOnly", bilateral: true },
    "gout": { family: "siteOnly" },
    "post-operative rehabilitation": { family: "postop" },
};

export interface ResolvedFamily extends AssessmentFamily {
    /** true when the catalogue name already says which joint ("Knee
     *  osteoarthritis"), so the line only needs the side */
    namesItsJoint: boolean;
}

/** The family behind a catalogue assessment, or null for one with no site. */
export function familyFor(label: string): ResolvedFamily | null {
    const hit = BY_LABEL[label.trim().toLowerCase()];
    if (!hit) return null;
    const base = FAMILIES[hit.family];
    const regions = hit.regions ?? base.regions;
    return { ...base, regions, namesItsJoint: !!hit.regions, bilateral: hit.bilateral ?? base.bilateral };
}

export function isAnatomicalAssessment(label: string): boolean {
    return familyFor(label) !== null;
}

/** Whether a zone may carry this assessment — fed to the picker's `allowed`. */
export function siteAllowed(family: AssessmentFamily, site: SiteRef): boolean {
    if (family.spineOnly) return isSpine(site);
    if (family.regions) return family.regions.includes(site.region);
    return true;
}

export function optionsOf(field: Extract<DetailField, { kind: "choice" | "multi" }>, site: SiteRef | null): string[] {
    return typeof field.options === "function" ? field.options(site) : field.options;
}

/** The fields actually on offer for what is chosen so far, at this site. */
export function visibleFields(family: AssessmentFamily, details: AssessmentDetails, site: SiteRef | null = null): DetailField[] {
    return family.fields.filter((f) => !f.showIf || f.showIf(details, site));
}

/**
 * Drop anything the current site or choices no longer allow — a ligament
 * picked for the knee does not survive the site changing to the ankle.
 */
export function pruneDetails(family: AssessmentFamily, site: SiteRef | null, details: AssessmentDetails): AssessmentDetails {
    const out: AssessmentDetails = {};
    for (const f of visibleFields(family, details, site)) {
        const v = details[f.key];
        if (v === undefined || v === "" || v === false) continue;
        if (f.kind === "choice" && !optionsOf(f, site).includes(String(v))) continue;
        if (f.kind === "multi") {
            const opts = optionsOf(f, site);
            const kept = String(v).split("|").filter((x) => opts.includes(x));
            if (kept.length) out[f.key] = kept.join("|");
            continue;
        }
        out[f.key] = v;
    }
    return out;
}

/**
 * The one line that prints: "Fracture — Left forearm, open, Gustilo II,
 * displaced". Also what lands in the visit's plain `diagnoses` list, so
 * print, review and the saved record read it with no change.
 */
export function composeAssessmentText(
    label: string,
    family: ResolvedFamily,
    site: SiteRef | null,
    details: AssessmentDetails,
): string {
    let title = site && family.titleWithSite ? family.titleWithSite : (family.title ?? label);
    const parts: string[] = [];

    if (site) {
        if (family.namesItsJoint) {
            if (site.side) parts.push(site.side === "both" ? "Bilateral" : site.side === "left" ? "Left" : "Right");
        } else {
            parts.push(clinicalSiteLabel(site));
        }
    }

    for (const f of visibleFields(family, details, site)) {
        const v = details[f.key];
        if (v === undefined || v === "" || v === false) continue;
        if (family.titleFrom === f.key) { title = String(v); continue; }
        if (f.kind === "flag") parts.push(f.render);
        else if (f.kind === "multi") {
            const list = String(v).split("|").join(", ");
            parts.push(f.render ? f.render(list) : list);
        }
        else if (f.render) parts.push(f.render(String(v).trim()));
        else parts.push(String(v).trim());
    }

    return parts.length ? `${title} — ${parts.join(", ")}` : title;
}

// ── Imaging placed on the body ─────────────────────────────────────────────
// A limb X-ray or MRI names its joint but not its side, and "X-Ray Knee"
// on a two-knee patient is an order the radiographer has to phone back
// about. Same engine as assessments: the site is asked, views are optional.

const IMAGING_FAMILIES: Record<string, AssessmentFamily> = {
    xray: {
        key: "xray",
        main: ["views"],
        fields: [
            { kind: "choice", key: "views", label: "Views", options: ["AP + Lateral", "AP", "Lateral", "Oblique", "Stress view", "Weight-bearing"] },
            { kind: "flag", key: "compare", label: "Comparison view of the other side", render: "with comparison view" },
        ],
    },
    mri: {
        key: "mri",
        main: ["contrast"],
        fields: [
            { kind: "choice", key: "contrast", label: "Contrast", options: ["Plain", "With contrast"], render: lower },
        ],
    },
    siteOnly: { key: "siteOnly", fields: [] },
};

const LOWER_LIMB: BodyRegion[] = ["hip", "thigh", "knee", "lower_leg", "ankle", "foot"];

const IMAGING_BY_LABEL: Record<string, { family: string; regions?: BodyRegion[]; bilateral?: boolean }> = {
    "x-ray knee": { family: "xray", regions: ["knee"] },
    "x-ray shoulder": { family: "xray", regions: ["shoulder"] },
    "x-ray hand / wrist": { family: "xray", regions: ["hand", "wrist"] },
    "x-ray foot / ankle": { family: "xray", regions: ["foot", "ankle"] },
    "x-ray elbow": { family: "xray", regions: ["elbow"] },
    "x-ray forearm": { family: "xray", regions: ["forearm"] },
    "x-ray humerus": { family: "xray", regions: ["upper_arm"] },
    "x-ray hip": { family: "xray", regions: ["hip"] },
    "x-ray femur": { family: "xray", regions: ["thigh"] },
    "x-ray leg (tibia / fibula)": { family: "xray", regions: ["lower_leg"] },
    "x-ray (other site)": { family: "xray" },
    "mri knee": { family: "mri", regions: ["knee"] },
    "mri shoulder": { family: "mri", regions: ["shoulder"] },
    "mri hip": { family: "mri", regions: ["hip"] },
    "mri ankle": { family: "mri", regions: ["ankle", "foot"] },
    "mri wrist": { family: "mri", regions: ["wrist", "hand"] },
    "usg doppler (lower limb)": { family: "siteOnly", regions: LOWER_LIMB },
};

/** The imaging family behind a catalogue test, or null for one with no side. */
export function imagingFamilyFor(label: string): ResolvedFamily | null {
    const hit = IMAGING_BY_LABEL[label.trim().toLowerCase()];
    if (!hit) return null;
    const base = IMAGING_FAMILIES[hit.family];
    // "X-Ray (Other Site)" names no joint, so its line carries the full site.
    return {
        ...base, regions: hit.regions, namesItsJoint: !!hit.regions,
        // Paired limb imaging can be of both sides at once ("X-Ray Knee —
        // Bilateral"); the catch-all X-ray names its own site.
        bilateral: !!hit.regions,
        titleWithSite: hit.regions ? undefined : label.replace(/\s*\(.*\)\s*$/, ""),
    };
}
