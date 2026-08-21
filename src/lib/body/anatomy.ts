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

/**
 * `elbow`, `wrist`, `hip` and `ankle` were added 2026-08-17 for the
 * physiotherapy joint map (`JointMapCard.tsx`), which needs every major
 * peripheral joint to be its own target — mapping a click on "forearm" to
 * "Elbow pain" would put a joint on screen the doctor did not aim at.
 *
 * They are carved out of the four segments that already covered them
 * (upper_arm/forearm, forearm/hand, pelvis/thigh, lower_leg/foot) rather
 * than added beside them, so the silhouette is unchanged in outline and only
 * the internal divisions moved. DERMATOLOGY GETS THEM TOO, deliberately:
 * these four are real skin sites with their own clinical meaning (the
 * antecubital flexure is where atopic eczema lives, the wrist is where
 * scabies and lichen planus are looked for, the ankle is where venous
 * eczema sits), so this is a finer index for `BodyMapCard` rather than a
 * physiotherapy concept leaking into it. Existing `visit_body_sites` rows
 * naming the old regions stay valid — nothing was removed or renamed.
 */
export type BodyRegion =
    | "head_top" | "head_bottom" | "neck"
    | "torso_upper" | "torso_lower" | "pelvis"
    | "shoulder" | "upper_arm" | "elbow" | "forearm" | "wrist" | "hand"
    | "hip" | "thigh" | "knee" | "lower_leg" | "ankle" | "foot";

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
 * The figure.
 *
 * ── Curves, 2026-08-20b
 *
 * Every paired segment was a straight-edged polygon, which is what made the
 * map read as a folded paper cut-out rather than a person — Anmol's word was
 * "terrible", and he was right: a human silhouette has no straight lines in
 * it anywhere, so a figure made only of them reads as a diagram of a robot.
 *
 * Segments are cubic beziers now. The boundaries between regions are
 * unchanged — the same y bands, the same hit areas, the same nine joints — so
 * nothing about targeting or about `EXAM_REGIONS` moves. What changed is that
 * the OUTER edges bow the way a body's do: the deltoid caps the shoulder, the
 * trunk narrows at the waist and flares at the hip, the calf swells and tapers
 * into the ankle.
 *
 * Still a schematic and still not an illustration. It has to read at 200px in
 * a card, and a clinician is aiming at a region rather than admiring a
 * drawing — so this is the silhouette of a body, drawn honestly, and no
 * shading, musculature or detail beyond it.
 *
 * Authored for the patient's RIGHT (the viewer's left, x < 100) and mirrored.
 * `mirror()` below now accepts C as well as M/L/Z; see its own note for why an
 * arc still cannot be mirrored and the head therefore stays unpaired.
 */
const SEGMENTS: SegmentDef[] = [
    // Head — cranium above the brow, face below it. Unpaired, which is what
    // lets these two keep their arcs (see `mirror`).
    { region: "head_top", path: "M78,37 C78,19 88,9 100,9 C112,9 122,19 122,37 Z", paired: false },
    { region: "head_bottom", path: "M78,37 C78,53 88,63 100,63 C112,63 122,53 122,37 Z", paired: false },
    // Neck, narrowing from jaw to the sternal notch, with the trapezius
    // beginning to flare at the bottom.
    { region: "neck", path: "M91,60 C91,68 90,74 87,79 L113,79 C110,74 109,68 109,60 Z", paired: false },

    // Trunk. Split at the midline so "left chest" is sayable; the outer edge
    // carries the whole shape of a torso — out across the ribs, in at the
    // waist, out again over the iliac crest.
    { region: "torso_upper", path: "M100,79 C93,79 86,81 79,85 C71,90 67,99 67,111 C67,125 68,134 69,141 L100,141 Z", paired: true },
    { region: "torso_lower", path: "M100,141 L69,141 C68,154 69,167 72,178 C73,183 73,185 74,188 L100,188 Z", paired: true },
    { region: "pelvis", path: "M100,188 L74,188 C75,199 77,209 81,217 C87,222 94,226 100,228 Z", paired: true },

    // Arm, held clear of the trunk — zones that touch are zones a doctor
    // mis-taps. The shoulder is a deltoid cap rather than a wedge, which is
    // both anatomically right and a much easier target.
    { region: "shoulder", path: "M79,85 C70,88 62,94 58,103 C57,105 57,107 57,109 C61,111 66,111 70,109 C71,100 74,90 79,85 Z", paired: true },
    // Elbow and wrist stay narrow bands on purpose — a joint IS a narrow
    // thing, and widening them would steal area from the limb segments either
    // side. Both are ~15px in a 424px figure: comfortable once the map is open
    // in its modal.
    { region: "upper_arm", path: "M57,109 C61,111 66,111 70,109 C68,120 65,131 62,142 C58,143 53,143 49,142 C52,131 55,120 57,109 Z", paired: true },
    { region: "elbow", path: "M49,142 C53,143 58,143 62,142 C61,148 61,153 60,158 C56,159 52,159 48,158 C48,153 48,147 49,142 Z", paired: true },
    { region: "forearm", path: "M48,158 C52,159 56,159 60,158 C59,169 58,180 57,190 C53,191 49,191 45,190 C46,180 47,169 48,158 Z", paired: true },
    { region: "wrist", path: "M45,190 C49,191 53,191 57,190 C57,195 56,199 56,203 C52,204 48,204 44,203 C44,199 45,194 45,190 Z", paired: true },
    { region: "hand", path: "M44,203 C48,204 52,204 56,203 C56,213 55,223 53,231 C50,234 46,234 43,231 C42,222 42,212 44,203 Z", paired: true },

    // Leg. The thigh tapers to the knee, the calf swells below it and draws
    // into the ankle — the two curves that most say "leg" rather than "post".
    { region: "hip", path: "M74,217 C79,220 89,223 99,225 C99,231 99,237 98,243 C90,243 81,242 73,241 C73,233 73,225 74,217 Z", paired: true },
    { region: "thigh", path: "M73,241 C81,242 90,243 98,243 C98,263 97,283 96,303 C88,304 80,304 72,303 C72,283 72,262 73,241 Z", paired: true },
    { region: "knee", path: "M72,303 C80,304 88,304 96,303 C96,309 96,315 96,321 C88,322 80,322 72,321 C72,315 72,309 72,303 Z", paired: true },
    { region: "lower_leg", path: "M72,321 C80,322 88,322 96,321 C97,340 96,361 94,378 C87,379 81,379 75,378 C74,361 73,340 72,321 Z", paired: true },
    { region: "ankle", path: "M75,378 C81,379 87,379 94,378 C94,383 94,388 94,392 C87,393 81,393 75,392 C75,388 75,383 75,378 Z", paired: true },
    { region: "foot", path: "M75,392 C81,393 87,393 94,392 C95,399 96,406 97,411 C97,414 94,416 89,416 C82,416 74,415 70,413 C69,408 71,400 75,392 Z", paired: true },
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
    // C is fine and A is not, and the difference is not arbitrary. In
    // `C x1,y1 x2,y2 x,y` all three are absolute COORDINATE PAIRS, so negating
    // every x about the midline reflects the curve exactly (the winding
    // direction flips, which no filled path cares about). An arc's `rx,ry` are
    // radii rather than points, and its sweep flag would also have to invert —
    // so an arc silently mirrors WRONG rather than failing, which is precisely
    // why this guard exists. S/Q/T carry implied control points and are barred
    // for the same reason: their reflection is not a coordinate negation.
    if (/[AaSsQqTt]/.test(path)) {
        throw new Error(
            `body/anatomy: paired segment "${path}" may use M/L/C/Z only — ` +
            `arcs and smooth/quadratic curves cannot be mirrored by negating x`
        );
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
    // The front of the elbow is the antecubital flexure — the name a
    // dermatologist uses, and the site that actually matters there.
    elbow: "Elbow crease",
    forearm: "Forearm",
    wrist: "Wrist",
    hand: "Palm",
    hip: "Hip",
    thigh: "Thigh",
    knee: "Knee",
    lower_leg: "Shin",
    ankle: "Ankle",
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
    // Was "Elbow / forearm" while the forearm segment had to cover both.
    // Now that the elbow is its own region, each says only what it is —
    // a small correctness win the split paid for by itself.
    elbow: "Elbow point",
    forearm: "Forearm",
    wrist: "Back of wrist",
    hand: "Back of hand",
    hip: "Hip",
    thigh: "Back of thigh",
    knee: "Back of knee",
    lower_leg: "Calf",
    ankle: "Heel",
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
