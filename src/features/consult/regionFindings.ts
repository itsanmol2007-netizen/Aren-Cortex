// ---------------------------------------------------------------------------
// REGION FINDINGS — what can be found at the joint that was just clicked.
//
// The body map's panel used to offer the same four chips for every zone
// (range of motion, swelling, stiffness, gives way), so a thigh was offered
// "Joint swelling" and a wrist had no way to record bony tenderness after a
// fall. Each kind of place now offers what is actually examined there:
//
//   a joint         swelling / effusion, bony and soft-tissue tenderness,
//                   range, stiffness … then crepitus, instability, deformity
//   hand / foot     local swelling, bony tenderness, deformity, bruise, cut
//   a long bone     the same trauma set: swelling, bony tenderness, deformity
//   the spine       range, soft-tissue and trigger-point tenderness, bony
//   anywhere else   swelling, tenderness, bruise, a cut
//
// Not drawn as chips: the panel shows only what IS recorded at the place,
// and this is the ORDER of its add-list (JointFindingField.tsx) — `primary`
// first, the few a doctor reaches for, then `more`.
// Labels are the catalogue's own; one missing from the catalogue is skipped
// by the caller, never thrown.
// ---------------------------------------------------------------------------

import type { BodyAspect, BodyRegion } from "../../lib/body/anatomy";

export interface RegionChips {
    primary: string[];
    more: string[];
}

const SWELL_JOINT = "Joint swelling / effusion";
const SWELL_LOCAL = "Localised swelling";
const BONY = "Bony point tenderness";
const SOFT = "Soft tissue tenderness";
const TRIGGER = "Trigger point tenderness";
const ROM = "Restricted range of motion";
const STIFF = "Joint stiffness";
const CREPITUS = "Joint crepitus";
const INSTABILITY = "Positive instability test";
const GIVES_WAY = "Joint gives way";
const DEFORMITY = "Deformity of joint or limb";
const BRUISE = "Bruise / contusion";
const CUT = "Cut / laceration (fresh wound)";
const REDNESS = "Redness / warmth / tenderness";
const HOT_JOINT = "Sudden severe pain and swelling in one joint";
const ULCER = "Non-healing wound / ulcer";
const NO_WEIGHT = "Unable to bear weight";

const JOINTS = new Set<BodyRegion>(["shoulder", "elbow", "wrist", "hip", "knee", "ankle"]);
const LONG_BONES = new Set<BodyRegion>(["upper_arm", "forearm", "thigh", "lower_leg"]);
/** Weight-bearing places, where "can they walk on it" is part of the exam (Ottawa). */
const WEIGHT_BEARING = new Set<BodyRegion>(["knee", "lower_leg", "ankle", "foot"]);
/** Where instability is tested and "gives way" is a real complaint. */
const UNSTABLE = new Set<BodyRegion>(["shoulder", "knee", "ankle"]);

export function regionChips(region: BodyRegion, aspect: BodyAspect): RegionChips {
    const spine = aspect === "back" && (region === "neck" || region === "torso_upper" || region === "torso_lower");
    if (spine) {
        return {
            primary: [ROM, SOFT, TRIGGER, BONY],
            more: [DEFORMITY, SWELL_LOCAL, BRUISE],
        };
    }
    if (JOINTS.has(region)) {
        return {
            primary: [
                SWELL_JOINT, BONY, SOFT, ROM, STIFF,
                ...(WEIGHT_BEARING.has(region) ? [NO_WEIGHT] : []),
            ],
            more: [
                CREPITUS,
                ...(UNSTABLE.has(region) ? [INSTABILITY, GIVES_WAY] : region === "elbow" || region === "wrist" ? [INSTABILITY] : []),
                DEFORMITY, BRUISE, CUT, REDNESS, HOT_JOINT,
                ...(region === "hip" ? [NO_WEIGHT] : []),
            ],
        };
    }
    if (region === "hand" || region === "foot") {
        return {
            primary: [SWELL_LOCAL, BONY, SOFT, DEFORMITY, ...(region === "foot" ? [NO_WEIGHT] : [])],
            more: [SWELL_JOINT, STIFF, ROM, BRUISE, CUT, REDNESS, ...(region === "foot" ? [ULCER, HOT_JOINT] : [])],
        };
    }
    if (LONG_BONES.has(region)) {
        return {
            primary: [SWELL_LOCAL, BONY, SOFT, DEFORMITY, ...(WEIGHT_BEARING.has(region) ? [NO_WEIGHT] : [])],
            more: [BRUISE, CUT, TRIGGER, REDNESS, ...(region === "lower_leg" ? [ULCER] : []), ...(region === "thigh" ? [NO_WEIGHT] : [])],
        };
    }
    // Head, face, front of the neck, chest, abdomen, pelvis, buttock.
    return {
        primary: [SWELL_LOCAL, SOFT, BRUISE, CUT],
        more: [REDNESS, BONY, ULCER],
    };
}
