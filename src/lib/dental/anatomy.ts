// ---------------------------------------------------------------------------
// THE ODONTOGRAM'S GEOMETRY — the actual anatomy, computed once at module
// load, so the component only renders what this file already decided.
//
// Written 2026-08-10 after Anmol's (entirely fair) complaint that the first
// "tooth chart" was 32 rectangles in two straight rows. That is not what a
// dentist uses. A real chart has two curved arches facing each other across
// the occlusal plane, teeth that differ in size and shape by class, and —
// the part that actually matters clinically — each tooth divided into its
// five SURFACES, because caries is charted per surface. "36 MO" (mesial and
// occlusal of the lower left first molar) is the unit of dental record
// keeping; "tooth 36 has caries" throws away the information the chart is
// for.
//
// Layout notes, since they encode real anatomy and not arbitrary taste:
//   - Each arch is drawn as an occlusal (bird's-eye) view of its jaw, bulging
//     away from the occlusal plane: incisors at the apex, third molars coming
//     back toward the centre. The two together make the lens shape every
//     printed dental chart uses. The concave side of each arch is the inside
//     of the mouth (palate above, tongue below); the convex side is lips and
//     cheeks, which is why buccal always points outward.
//   - Teeth are spaced by their true mesiodistal width, not evenly: a first
//     molar is ~10mm across and a lateral incisor ~6.5mm, and an evenly
//     spaced arch reads wrong to anyone who has looked at real teeth.
//   - Each tooth is rotated to sit radially on its arch, so buccal always
//     faces outward and lingual/palatal always faces the arch centre.
//   - Cusp marks (4 on a first molar, 2 on a premolar, 1 on a canine, none
//     on an incisor) sit on the occlusal surface. Small detail, but it is
//     the difference between "a shape" and "a tooth".
// ---------------------------------------------------------------------------

export type ToothSurface = "mesial" | "distal" | "buccal" | "lingual" | "occlusal";
export type ToothClass = "incisor" | "canine" | "premolar" | "molar";
export type ArchName = "upper" | "lower";

export const SURFACES: ToothSurface[] = ["mesial", "distal", "buccal", "lingual", "occlusal"];

/**
 * Mesiodistal widths and buccolingual depths, proportional to real crown
 * dimensions (mm scaled to px). `cusps` is the real cusp count for that
 * tooth class.
 */
interface ToothSpec {
    cls: ToothClass;
    /** mesiodistal — how wide across the arch */
    w: number;
    /** buccolingual — how deep from cheek to tongue */
    h: number;
    cusps: number;
}

const SPECS: ToothSpec[] = [
    { cls: "incisor", w: 24, h: 19, cusps: 0 },  // 1 central incisor
    { cls: "incisor", w: 21, h: 19, cusps: 0 },  // 2 lateral incisor
    { cls: "canine", w: 24, h: 25, cusps: 1 },   // 3 canine
    { cls: "premolar", w: 24, h: 27, cusps: 2 }, // 4 first premolar
    { cls: "premolar", w: 23, h: 27, cusps: 2 }, // 5 second premolar
    { cls: "molar", w: 33, h: 32, cusps: 4 },    // 6 first molar
    { cls: "molar", w: 31, h: 31, cusps: 4 },    // 7 second molar
    { cls: "molar", w: 28, h: 29, cusps: 3 },    // 8 third molar (wisdom)
];

// --- arch placement ---------------------------------------------------------

const CX = 230;          // midline
// A real arch is wider across than it is deep front-to-back (~55mm vs ~40mm),
// so this is an ellipse, not a circle.
const RX = 185;
const RY = 140;
// Each arch bulges AWAY from the occlusal plane: the incisors sit at the apex
// and the third molars come back toward the centre, so the two arches together
// make the lens shape every printed dental chart uses. The centre of curvature
// is therefore on the far side of each arch — below the upper one, above the
// lower one.
// Both centres of curvature sit on the occlusal plane, so the two arches are
// mirror images of each other across it — the way the jaws actually close.
const CY_UPPER = 197;
const CY_LOWER = 197;
/** contact gap between adjacent crowns */
const GAP = 1.5;

/** Where the arches meet — the occlusal plane the chart is folded around. */
export const OCCLUSAL_Y = 197;

export const CHART_VIEWBOX = "14 24 432 346";

const rad = (deg: number) => (deg * Math.PI) / 180;

/**
 * Teeth are placed by ARC LENGTH, not by angle. Spacing them evenly in angle
 * leaves visible gaps between the narrow front teeth and crowds the molars,
 * because an ellipse covers different distances per degree along its length.
 * Real teeth sit in contact with their neighbours, so the arch is walked
 * crown width by crown width and the parameter is solved for numerically —
 * cheap, done once at module load, and correct by construction.
 */
const ARC_TABLE: { u: number; s: number }[] = (() => {
    const table: { u: number; s: number }[] = [];
    let s = 0;
    let px = 0, py = -RY;
    for (let deg = 0; deg <= 110; deg += 0.25) {
        const u = rad(deg);
        const x = RX * Math.sin(u), y = -RY * Math.cos(u);
        if (deg > 0) s += Math.hypot(x - px, y - py);
        table.push({ u: deg, s });
        px = x; py = y;
    }
    return table;
})();

/** Inverse of the arc-length table: how far around the arch is a given distance? */
function angleAtArc(target: number): number {
    for (let i = 1; i < ARC_TABLE.length; i++) {
        const a = ARC_TABLE[i - 1], b = ARC_TABLE[i];
        if (b.s >= target) {
            const f = b.s === a.s ? 0 : (target - a.s) / (b.s - a.s);
            return a.u + (b.u - a.u) * f;
        }
    }
    return ARC_TABLE[ARC_TABLE.length - 1].u;
}

/** Distance from the midline to each tooth's centre, measured along the arch. */
const ARC_AT_TOOTH: number[] = (() => {
    let cum = 0;
    return SPECS.map((s) => {
        const mid = cum + s.w / 2;
        cum += s.w + GAP;
        return mid;
    });
})();

// --- per-tooth shape --------------------------------------------------------

export interface ToothZone {
    surface: ToothSurface;
    /** svg polygon points, in the tooth's local frame */
    points: string;
}

export interface ToothGeometry {
    /** FDI code, e.g. "36" */
    code: string;
    quadrant: 1 | 2 | 3 | 4;
    position: number;
    cls: ToothClass;
    arch: ArchName;
    /** screen position of the tooth's centre */
    x: number;
    y: number;
    /** degrees, so buccal faces out of the arch */
    rotate: number;
    w: number;
    h: number;
    /** rounded-crown outline, local frame */
    outline: string;
    zones: ToothZone[];
    cusps: { cx: number; cy: number; r: number }[];
    /** where the FDI number goes — outside the arch, upright, never rotated */
    labelX: number;
    labelY: number;
}

function roundedRect(w: number, h: number, r: number): string {
    const x = -w / 2, y = -h / 2;
    return [
        `M${x + r},${y}`,
        `H${x + w - r}`, `Q${x + w},${y} ${x + w},${y + r}`,
        `V${y + h - r}`, `Q${x + w},${y + h} ${x + w - r},${y + h}`,
        `H${x + r}`, `Q${x},${y + h} ${x},${y + h - r}`,
        `V${y + r}`, `Q${x},${y} ${x + r},${y}`,
        "Z",
    ].join(" ");
}

function pts(...p: [number, number][]): string {
    return p.map(([a, b]) => `${a.toFixed(1)},${b.toFixed(1)}`).join(" ");
}

/**
 * The classic charting cell: an outer crown outline, an inner box that is the
 * occlusal (or incisal) surface, and four trapezoids between them — one per
 * axial surface. Every dental charting system on the market draws this, for
 * the good reason that it is the only compact shape where all five surfaces
 * are independently clickable.
 *
 * Which trapezoid is mesial depends on where the tooth sits: mesial always
 * means "toward the midline". Because the lower arch is rotated 180° to face
 * the upper one, local +x points toward the midline for quadrants 1 and 3,
 * and away from it for quadrants 2 and 4.
 */
function zonesFor(w: number, h: number, mesialIsPlusX: boolean): ToothZone[] {
    const ox = w / 2, oy = h / 2;
    const ix = ox * 0.46, iy = oy * 0.46;

    const plusX: ToothSurface = mesialIsPlusX ? "mesial" : "distal";
    const minusX: ToothSurface = mesialIsPlusX ? "distal" : "mesial";

    return [
        { surface: "lingual", points: pts([-ox, -oy], [ox, -oy], [ix, -iy], [-ix, -iy]) },
        { surface: "buccal", points: pts([-ox, oy], [ox, oy], [ix, iy], [-ix, iy]) },
        { surface: minusX, points: pts([-ox, -oy], [-ox, oy], [-ix, iy], [-ix, -iy]) },
        { surface: plusX, points: pts([ox, -oy], [ox, oy], [ix, iy], [ix, -iy]) },
        { surface: "occlusal", points: pts([-ix, -iy], [ix, -iy], [ix, iy], [-ix, iy]) },
    ];
}

function cuspsFor(count: number, w: number, h: number) {
    const ix = (w / 2) * 0.46, iy = (h / 2) * 0.46;
    const r = 1.7;
    switch (count) {
        case 1: return [{ cx: 0, cy: 0, r }];
        // A premolar's two cusps are buccal and lingual — across the tooth,
        // not along the arch.
        case 2: return [{ cx: 0, cy: -iy * 0.55, r }, { cx: 0, cy: iy * 0.55, r }];
        case 3: return [
            { cx: -ix * 0.55, cy: -iy * 0.55, r }, { cx: ix * 0.55, cy: -iy * 0.55, r },
            { cx: 0, cy: iy * 0.55, r },
        ];
        case 4: return [
            { cx: -ix * 0.55, cy: -iy * 0.55, r }, { cx: ix * 0.55, cy: -iy * 0.55, r },
            { cx: -ix * 0.55, cy: iy * 0.55, r }, { cx: ix * 0.55, cy: iy * 0.55, r },
        ];
        default: return [];
    }
}

function build(quadrant: 1 | 2 | 3 | 4): ToothGeometry[] {
    const arch: ArchName = quadrant === 1 || quadrant === 2 ? "upper" : "lower";
    // Quadrants 1 and 4 are the patient's right, which is the viewer's left.
    const sign = quadrant === 1 || quadrant === 4 ? -1 : 1;

    return SPECS.map((spec, i) => {
        const position = i + 1;
        const u = rad(sign * angleAtArc(ARC_AT_TOOTH[i]));

        const x = CX + RX * Math.sin(u);
        const y = arch === "upper" ? CY_UPPER - RY * Math.cos(u) : CY_LOWER + RY * Math.cos(u);

        // Outward normal — perpendicular to the arch, pointing at the cheek.
        // The upper arch opens downward and the lower upward, so the tangent
        // is rotated the opposite way for each.
        const tx = RX * Math.cos(u);
        const ty = (arch === "upper" ? 1 : -1) * RY * Math.sin(u);
        const nx = arch === "upper" ? ty : -ty;
        const ny = arch === "upper" ? -tx : tx;
        const nlen = Math.hypot(nx, ny) || 1;
        const ux = nx / nlen, uy = ny / nlen;

        // Rotate the crown so its local +y (buccal) lands on that normal.
        const rotate = (Math.atan2(-ux, uy) * 180) / Math.PI;

        // Mesial always means "toward the midline". Rather than hard-code it
        // per quadrant and risk getting one wrong, ask where local +x actually
        // ends up on screen and compare against the midline.
        const midlineIsToTheRight = quadrant === 1 || quadrant === 4;
        const localPlusXPointsRight = Math.cos(rad(rotate)) > 0;
        const mesialIsPlusX = localPlusXPointsRight === midlineIsToTheRight;

        const off = spec.h / 2 + 11;

        return {
            code: `${quadrant}${position}`,
            quadrant,
            position,
            cls: spec.cls,
            arch,
            x, y, rotate,
            w: spec.w,
            h: spec.h,
            outline: roundedRect(spec.w, spec.h, spec.cls === "molar" ? 5 : 6),
            zones: zonesFor(spec.w, spec.h, mesialIsPlusX),
            cusps: cuspsFor(spec.cusps, spec.w, spec.h),
            labelX: x + ux * off,
            labelY: y + uy * off + 3.5,
        };
    });
}

/** Every tooth, upper arch then lower, each arch running patient-right to patient-left. */
export const UPPER_ARCH: ToothGeometry[] = [...build(1).reverse(), ...build(2)];
export const LOWER_ARCH: ToothGeometry[] = [...build(4).reverse(), ...build(3)];
export const ALL_TEETH: ToothGeometry[] = [...UPPER_ARCH, ...LOWER_ARCH];

export const TOOTH_BY_CODE: Record<string, ToothGeometry> = Object.fromEntries(
    ALL_TEETH.map((t) => [t.code, t])
);

// --- naming -----------------------------------------------------------------

/**
 * The same surface has different names on different teeth, and dentists use
 * the right one: the outer surface of a molar is buccal (it faces the cheek)
 * but of an incisor is labial (it faces the lip); the inner surface is
 * palatal on top and lingual below; the biting surface is occlusal on a
 * molar and incisal on an incisor. Showing "buccal" on a front tooth would
 * read as software written by someone who had not asked a dentist.
 */
export function surfaceLabel(surface: ToothSurface, t: ToothGeometry): string {
    const anterior = t.cls === "incisor" || t.cls === "canine";
    switch (surface) {
        case "occlusal": return anterior ? "Incisal" : "Occlusal";
        case "buccal": return anterior ? "Labial" : "Buccal";
        case "lingual": return t.arch === "upper" ? "Palatal" : "Lingual";
        case "mesial": return "Mesial";
        case "distal": return "Distal";
    }
}

/** "MOD" style shorthand — how a finding is actually written in a dental note. */
export const SURFACE_INITIAL: Record<ToothSurface, string> = {
    mesial: "M",
    occlusal: "O",
    distal: "D",
    buccal: "B",
    lingual: "L",
};
