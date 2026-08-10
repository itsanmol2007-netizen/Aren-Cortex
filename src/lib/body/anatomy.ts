// ---------------------------------------------------------------------------
// THE BODY MAP — where on the patient, pointed at rather than typed.
//
// Written 2026-08-10 alongside the odontogram rebuild, for the same reason.
// Attachments carried a free-text "body region" input, and a free-text box is
// not what a dermatologist uses: they point at a body. Site is not decoration
// either — it changes management directly, which is why it deserves a real
// control. A steroid strong enough for a plaque on the shin will thin the skin
// on an eyelid; scabies is diagnosed largely by distribution; a rash on the
// palms and soles means something specific and different.
//
// Structure mirrors lib/dental/anatomy.ts on purpose. There, the addressable
// unit is tooth + surface; here it is region + aspect + side. Same shape of
// problem, same shape of answer — a figure made of clickable zones, geometry
// owned here so the component only renders what this file decided.
//
// The silhouette is drawn once for the patient's RIGHT side (which appears on
// the viewer's LEFT, as when facing a patient) and mirrored for the left, so
// no coordinate is authored twice and the two sides cannot drift apart. The
// same silhouette serves both the front and back views — the outline of a
// person does not change when they turn around, only the names do: chest
// becomes upper back, shin becomes calf, palm becomes the back of the hand.
// ---------------------------------------------------------------------------

export type BodyAspect = "front" | "back";
export type BodySide = "left" | "right";

export type BodyRegion =
    | "head_top" | "head_bottom" | "neck"
    | "torso_upper" | "torso_lower" | "pelvis"
    | "shoulder" | "upper_arm" | "forearm" | "hand"
    | "thigh" | "knee" | "lower_leg" | "foot";

export const FIGURE_VIEWBOX = "0 0 200 424";
/** the midline, in figure coordinates — mirroring reflects across it */
export const MIDLINE_X = 100;

interface SegmentDef {
    region: BodyRegion;
    /** authored for the patient's right (viewer's left); mirrored for the other side */
    path: string;
    /** false for midline structures, which have no side and are drawn once */
    paired: boolean;
}

/**
 * The figure. Deliberately a plain schematic rather than an illustration: it
 * has to read at 200px tall in a card, and a doctor is aiming at a region,
 * not admiring a drawing.
 */
const SEGMENTS: SegmentDef[] = [
    // Head — cranium above the brow, face below it. The only curved shapes in
    // the figure, and unpaired, which is why mirror() never has to deal with
    // an arc (see the guard there).
    { region: "head_top", path: "M79,36 A21,26 0 0,1 121,36 Z", paired: false },
    { region: "head_bottom", path: "M79,36 A21,26 0 0,0 121,36 Z", paired: false },
    { region: "neck", path: "M92,61 L108,61 L110,78 L90,78 Z", paired: false },

    // Trunk, split at the midline so "left chest" is sayable, and tapered at
    // the waist so the figure reads as a body rather than a box.
    { region: "torso_upper", path: "M100,78 L90,78 L74,83 L68,101 L69,141 L100,141 Z", paired: true },
    { region: "torso_lower", path: "M100,141 L69,141 L70,187 L100,187 Z", paired: true },
    { region: "pelvis", path: "M100,187 L70,187 L74,217 L100,227 Z", paired: true },

    // Arm, held clear of the trunk — zones that touch are zones a doctor
    // mis-taps.
    { region: "shoulder", path: "M74,83 L60,87 L52,103 L64,102 L68,101 Z", paired: true },
    { region: "upper_arm", path: "M52,103 L64,102 L58,152 L44,150 Z", paired: true },
    { region: "forearm", path: "M44,150 L58,152 L54,203 L40,200 Z", paired: true },
    { region: "hand", path: "M40,200 L54,203 L52,231 L38,228 Z", paired: true },

    // Leg
    { region: "thigh", path: "M74,217 L99,225 L97,303 L72,303 Z", paired: true },
    { region: "knee", path: "M72,303 L97,303 L97,321 L72,321 Z", paired: true },
    { region: "lower_leg", path: "M72,321 L97,321 L94,391 L75,391 Z", paired: true },
    { region: "foot", path: "M75,391 L94,391 L97,413 L70,413 Z", paired: true },
];

export interface BodyZone {
    region: BodyRegion;
    side: BodySide | null;
    path: string;
    /** stable key for React and for test selectors */
    key: string;
}

/**
 * Reflect a path across the midline — the patient's left is the viewer's right.
 *
 * Only straight-line paths (M/L/Z) can be mirrored by negating x like this: an
 * arc carries a sweep flag that also has to flip, and a curve carries control
 * points that are not coordinate pairs in the same sense. Every paired segment
 * is a polygon, and the guard below keeps it that way rather than leaving a
 * trap for whoever next reshapes the figure.
 */
function mirror(path: string): string {
    if (/[AaCcSsQqTt]/.test(path)) {
        throw new Error(`body/anatomy: paired segment "${path}" must be a polygon (M/L/Z only)`);
    }
    return path.replace(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g, (_, x: string, y: string) =>
        `${(2 * MIDLINE_X - parseFloat(x)).toFixed(1)},${y}`
    );
}

export const BODY_ZONES: BodyZone[] = SEGMENTS.flatMap((s): BodyZone[] => {
    if (!s.paired) {
        return [{ region: s.region, side: null, path: s.path, key: s.region }];
    }
    return [
        { region: s.region, side: "right" as BodySide, path: s.path, key: `${s.region}-right` },
        { region: s.region, side: "left" as BodySide, path: mirror(s.path), key: `${s.region}-left` },
    ];
});

// --- naming -----------------------------------------------------------------

/**
 * The same zone is a different place depending on which way the patient is
 * facing. Showing "chest" on the back view would be the body-map equivalent of
 * calling an incisor's outer surface "buccal".
 */
const FRONT_LABEL: Record<BodyRegion, string> = {
    head_top: "Scalp",
    head_bottom: "Face",
    neck: "Neck",
    torso_upper: "Chest",
    torso_lower: "Abdomen",
    pelvis: "Groin",
    shoulder: "Shoulder",
    upper_arm: "Upper arm",
    forearm: "Forearm",
    hand: "Palm",
    thigh: "Thigh",
    knee: "Knee",
    lower_leg: "Shin",
    foot: "Foot",
};

const BACK_LABEL: Record<BodyRegion, string> = {
    head_top: "Scalp",
    head_bottom: "Occiput",
    neck: "Nape",
    torso_upper: "Upper back",
    torso_lower: "Lower back",
    pelvis: "Buttock",
    shoulder: "Shoulder blade",
    upper_arm: "Upper arm",
    forearm: "Elbow / forearm",
    hand: "Back of hand",
    thigh: "Back of thigh",
    knee: "Back of knee",
    lower_leg: "Calf",
    foot: "Sole",
};

export function regionLabel(region: BodyRegion, aspect: BodyAspect): string {
    return (aspect === "front" ? FRONT_LABEL : BACK_LABEL)[region];
}

/** "Left forearm", "Scalp", "Right sole" — how it would be written in a note. */
export function siteLabel(region: BodyRegion, aspect: BodyAspect, side: BodySide | null): string {
    const base = regionLabel(region, aspect);
    if (!side) return base;
    return `${side === "left" ? "Left" : "Right"} ${base.toLowerCase()}`;
}
