// ---------------------------------------------------------------------------
// THE PHYSIOTHERAPY EXAMINATION — what was tested, on which side, and how.
//
// Phase 3 of `docs/Cortex Specialties/physiotherapy-phase-1-plan.md`'s
// sequence. Data and predicates only, no React, same convention as
// `measures.ts` / `story.ts` / `trend.ts` — checkable from a node script.
//
// ── Three kinds of thing, deliberately not collapsed into one
//
//   RANGE     a movement, in degrees, measured ACTIVE and PASSIVE.
//   STRENGTH  a muscle group, graded 0-5 (Oxford / MRC scale).
//   TEST      a named special test: positive, negative, or not done.
//
// They are stored in one table (`visit_measurements`, which gained
// `side`/`method`/`context` in Phase 2) but they are NOT one concept. A
// range is a number whose two readings are compared to each other; a grade
// is an ordinal with no arithmetic; a test result is a claim. Rendering
// them with one control would be the same mistake as a single ROM_PCT box.
//
// ── Why active and passive sit on one row
//
// The GAP between them is the finding, not either number. A large gap
// (active well short of passive) points at weakness or neurological
// involvement; a small gap points at a mechanical block. Put the two
// readings in separate fields and the physiotherapist does that
// subtraction in their head on every row. The card computes it.
//
// ── Scoped to a region, never the whole body
//
// `EXAM_REGIONS` holds every joint this file knows. The card shows ONE,
// chosen from what the joint map marked. That is the doctrine's
// "know a lot, show little" law: the catalogue is deep, the surface is one
// joint's worth.
//
// Normal ranges below are the standard published values taught for
// goniometry (AAOS/AMA ranges). They drive the "outside expected" hint
// only — never a warning. A restricted range is the reason the patient is
// in the room, and amber on every reading of every session is noise
// (`measures.ts` makes the same argument for the physio fields).
// ---------------------------------------------------------------------------

export type ExamMethod = "active" | "passive";
export type TestResult = "positive" | "negative" | "not_done";
/** Oxford / MRC manual muscle testing grade. */
export type MmtGrade = 0 | 1 | 2 | 3 | 4 | 5;

export interface RangeMovement {
    key: string;
    label: string;
    /** the published normal, for the "outside expected" hint only */
    normal: number;
    unit: "°";
}

export interface MuscleGroup {
    key: string;
    label: string;
}

export interface SpecialTest {
    key: string;
    label: string;
    /** what a POSITIVE result suggests — shown on hover, never as a verdict */
    suggests: string;
}

export interface ExamRegion {
    /** matches `BodyRegion` in lib/body/anatomy.ts where one exists */
    key: string;
    label: string;
    /** true when left/right is meaningful — false for the spine */
    paired: boolean;
    movements: RangeMovement[];
    muscles: MuscleGroup[];
    tests: SpecialTest[];
}

const deg = (key: string, label: string, normal: number): RangeMovement =>
    ({ key, label, normal, unit: "°" });

export const EXAM_REGIONS: ExamRegion[] = [
    {
        key: "neck", label: "Cervical spine", paired: false,
        movements: [
            deg("cx_flex", "Flexion", 50),
            deg("cx_ext", "Extension", 60),
            deg("cx_rot_l", "Rotation L", 80),
            deg("cx_rot_r", "Rotation R", 80),
            deg("cx_sidebend_l", "Side-bend L", 45),
            deg("cx_sidebend_r", "Side-bend R", 45),
        ],
        muscles: [
            { key: "cx_flexors", label: "Deep neck flexors" },
            { key: "cx_extensors", label: "Neck extensors" },
        ],
        tests: [
            { key: "spurling", label: "Spurling's", suggests: "cervical radiculopathy" },
            { key: "cx_distraction", label: "Distraction", suggests: "cervical radiculopathy (relieving)" },
            { key: "ultt", label: "Upper limb tension", suggests: "neural mechanosensitivity" },
        ],
    },
    {
        key: "shoulder", label: "Shoulder", paired: true,
        movements: [
            deg("gh_flex", "Flexion", 180),
            deg("gh_abd", "Abduction", 180),
            deg("gh_er", "External rotation", 90),
            deg("gh_ir", "Internal rotation", 70),
        ],
        muscles: [
            { key: "deltoid", label: "Deltoid" },
            { key: "supraspinatus", label: "Supraspinatus" },
            { key: "gh_er_cuff", label: "External rotators" },
            { key: "gh_ir_cuff", label: "Internal rotators" },
        ],
        tests: [
            { key: "neer", label: "Neer", suggests: "subacromial impingement" },
            { key: "hawkins", label: "Hawkins–Kennedy", suggests: "subacromial impingement" },
            { key: "empty_can", label: "Empty can (Jobe)", suggests: "supraspinatus involvement" },
            { key: "painful_arc", label: "Painful arc", suggests: "subacromial pain" },
            { key: "apprehension", label: "Apprehension", suggests: "anterior instability" },
        ],
    },
    {
        key: "elbow", label: "Elbow", paired: true,
        movements: [
            deg("el_flex", "Flexion", 150),
            deg("el_ext", "Extension", 0),
            deg("el_pron", "Pronation", 80),
            deg("el_sup", "Supination", 80),
        ],
        muscles: [
            { key: "biceps", label: "Biceps" },
            { key: "triceps", label: "Triceps" },
        ],
        tests: [
            { key: "cozen", label: "Cozen's", suggests: "lateral epicondylalgia" },
            { key: "golfers", label: "Golfer's elbow test", suggests: "medial epicondylalgia" },
        ],
    },
    {
        key: "wrist", label: "Wrist / hand", paired: true,
        movements: [
            deg("wr_flex", "Flexion", 80),
            deg("wr_ext", "Extension", 70),
            deg("wr_rad", "Radial deviation", 20),
            deg("wr_uln", "Ulnar deviation", 30),
        ],
        muscles: [
            { key: "wr_flexors", label: "Wrist flexors" },
            { key: "wr_extensors", label: "Wrist extensors" },
            { key: "grip", label: "Grip" },
        ],
        tests: [
            { key: "phalen", label: "Phalen's", suggests: "carpal tunnel syndrome" },
            { key: "tinel", label: "Tinel's", suggests: "median nerve irritation" },
            { key: "finkelstein", label: "Finkelstein's", suggests: "de Quervain's tenosynovitis" },
        ],
    },
    {
        key: "torso_lower", label: "Lumbar spine", paired: false,
        movements: [
            deg("lx_flex", "Flexion", 60),
            deg("lx_ext", "Extension", 25),
            deg("lx_sidebend_l", "Side-bend L", 25),
            deg("lx_sidebend_r", "Side-bend R", 25),
        ],
        muscles: [
            { key: "trunk_ext", label: "Trunk extensors" },
            { key: "trunk_flex", label: "Trunk flexors" },
        ],
        tests: [
            { key: "slr", label: "Straight leg raise", suggests: "lumbar radiculopathy" },
            { key: "slump", label: "Slump", suggests: "neural mechanosensitivity" },
            { key: "prone_instability", label: "Prone instability", suggests: "segmental instability" },
            { key: "faber_lx", label: "FABER", suggests: "hip or sacroiliac origin" },
        ],
    },
    {
        key: "hip", label: "Hip", paired: true,
        movements: [
            deg("hip_flex", "Flexion", 120),
            deg("hip_abd", "Abduction", 45),
            deg("hip_ir", "Internal rotation", 45),
            deg("hip_er", "External rotation", 45),
        ],
        muscles: [
            { key: "hip_flexors", label: "Hip flexors" },
            { key: "hip_abductors", label: "Hip abductors" },
            { key: "glut_max", label: "Gluteus maximus" },
        ],
        tests: [
            { key: "faber", label: "FABER (Patrick's)", suggests: "hip or sacroiliac origin" },
            { key: "fadir", label: "FADIR", suggests: "femoroacetabular impingement" },
            { key: "thomas", label: "Thomas", suggests: "hip flexor tightness" },
            { key: "trendelenburg", label: "Trendelenburg", suggests: "abductor weakness" },
        ],
    },
    {
        key: "knee", label: "Knee", paired: true,
        movements: [
            deg("knee_flex", "Flexion", 135),
            // Normal is 0. Anything above it is an extension LAG — the one
            // movement here where the goal is zero, same trap `kneeExtLag`
            // carries in measures.ts.
            deg("knee_ext", "Extension", 0),
        ],
        muscles: [
            { key: "quadriceps", label: "Quadriceps" },
            { key: "hamstrings", label: "Hamstrings" },
        ],
        tests: [
            { key: "lachman", label: "Lachman", suggests: "ACL insufficiency" },
            { key: "ant_drawer_knee", label: "Anterior drawer", suggests: "ACL insufficiency" },
            { key: "post_drawer_knee", label: "Posterior drawer", suggests: "PCL insufficiency" },
            { key: "mcmurray", label: "McMurray", suggests: "meniscal tear" },
            { key: "valgus_stress", label: "Valgus stress", suggests: "MCL injury" },
            { key: "varus_stress", label: "Varus stress", suggests: "LCL injury" },
        ],
    },
    {
        key: "ankle", label: "Ankle / foot", paired: true,
        movements: [
            deg("ank_df", "Dorsiflexion", 20),
            deg("ank_pf", "Plantarflexion", 50),
            deg("ank_inv", "Inversion", 35),
            deg("ank_ev", "Eversion", 15),
        ],
        muscles: [
            { key: "ank_df_m", label: "Dorsiflexors" },
            { key: "ank_pf_m", label: "Plantarflexors" },
            { key: "peroneals", label: "Peroneals" },
        ],
        tests: [
            { key: "ant_drawer_ankle", label: "Anterior drawer", suggests: "ATFL injury" },
            { key: "talar_tilt", label: "Talar tilt", suggests: "CFL injury" },
            { key: "thompson", label: "Thompson (calf squeeze)", suggests: "Achilles rupture" },
        ],
    },
];

export const REGION_BY_KEY = new Map(EXAM_REGIONS.map((r) => [r.key, r]));

/**
 * The measure key a range reading is stored under.
 *
 * Side and method are COLUMNS now (Phase 2), not part of the key — which is
 * the whole reason Phase 2 existed. The old `vitalsToMeasurements` path
 * still writes `KNEE_FLEX_R`-style keys with null side/method from the
 * Vitals blob; these are a separate namespace and the two never collide.
 */
export const rangeMeasureKey = (movementKey: string) => `EXAM_${movementKey.toUpperCase()}`;
export const mmtMeasureKey = (muscleKey: string) => `MMT_${muscleKey.toUpperCase()}`;
export const testMeasureKey = (testKey: string) => `TEST_${testKey.toUpperCase()}`;

/**
 * Pain, 0-10, for ONE joint on ONE side.
 *
 * Not `painVas` from `measures.ts`, and the difference is the whole reason
 * this exists. That field is a single number on the Vitals blob with nowhere
 * to put a site, so a patient with a right knee at 7 and a left shoulder at 5
 * has to be recorded as one of those, or as an average of two facts that were
 * never the same fact. It sat in General Measurements beside blood pressure
 * until 2026-08-20 for that reason and no better one.
 *
 * Here pain is a reading like any other: keyed by region, carrying `side` in
 * its own column, and living with the range and strength readings taken at the
 * same joint in the same minute.
 */
export const regionPainKey = (regionKey: string) => `PAIN_${regionKey.toUpperCase()}`;

/** 0-5, with the words. A grade is an ordinal, so it is picked, never typed. */
export const MMT_LABEL: Record<MmtGrade, string> = {
    0: "No contraction",
    1: "Flicker",
    2: "Full range, gravity eliminated",
    3: "Full range against gravity",
    4: "Against some resistance",
    5: "Normal",
};

/**
 * The gap between active and passive, when both are present.
 *
 * `null` when either is missing — a gap needs two readings, and inventing
 * one from a single number is the confident-wrong-answer this codebase
 * keeps having to guard against. Negative is impossible in principle
 * (passive should never be less than active) but IS returned rather than
 * clamped: it means one of the two was mis-entered, and hiding that helps
 * nobody.
 */
export function activePassiveGap(active: number | null, passive: number | null): number | null {
    if (active === null || passive === null) return null;
    return passive - active;
}

/** True when a reading is outside the published normal. A HINT, never a warning. */
export function outsideExpected(m: RangeMovement, value: number | null): boolean {
    if (value === null) return false;
    // Extension's normal is 0 and any positive value is a lag, so "outside"
    // is > normal there and < normal everywhere else.
    return m.normal === 0 ? value > 0 : value < m.normal;
}
