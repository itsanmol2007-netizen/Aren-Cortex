// ---------------------------------------------------------------------------
// The tooth chart's vocabulary — data model AND the visual chart's layout.
// tooth_number (FDI notation) was always the addressable unit; TOOTH_CHART_ROWS
// below is what a real dentist actually clicks (2026-08-10): two arches, each
// split at the midline, patient's right shown first — the standard odontogram
// layout, not an alphabetic dropdown.
// ---------------------------------------------------------------------------

export type DentalCondition =
    | "caries"
    | "filling_needed"
    | "missing"
    | "root_canal_needed"
    | "impacted"
    | "fractured"
    | "mobile"
    | "other";

export const DENTAL_CONDITIONS: DentalCondition[] = [
    "caries",
    "filling_needed",
    "root_canal_needed",
    "fractured",
    "mobile",
    "impacted",
    "missing",
    "other",
];

export const DENTAL_CONDITION_LABEL: Record<DentalCondition, string> = {
    caries: "Caries",
    filling_needed: "Filling needed",
    root_canal_needed: "Root canal needed",
    fractured: "Fractured",
    mobile: "Mobile",
    impacted: "Impacted",
    missing: "Missing",
    other: "Other",
};

/**
 * FDI two-digit tooth notation — quadrant (1 upper-right, 2 upper-left,
 * 3 lower-left, 4 lower-right) + position (1 central incisor .. 8 third
 * molar/wisdom), generated rather than hand-typed so all 32 are correct by
 * construction, not by proofreading.
 */
const QUADRANT_LABEL: Record<string, string> = {
    "1": "Upper right",
    "2": "Upper left",
    "3": "Lower left",
    "4": "Lower right",
};

const POSITION_LABEL = [
    "Central incisor",
    "Lateral incisor",
    "Canine",
    "First premolar",
    "Second premolar",
    "First molar",
    "Second molar",
    "Third molar (wisdom)",
];

export interface ToothOption {
    /** FDI code, e.g. "36" — matches dental_findings.tooth_number's CHECK constraint */
    code: string;
    /** "36 — Lower left first molar" */
    label: string;
}

export const TOOTH_OPTIONS: ToothOption[] = (["1", "2", "3", "4"] as const).flatMap((q) =>
    POSITION_LABEL.map((pos, i) => {
        const code = `${q}${i + 1}`;
        return { code, label: `${code} — ${QUADRANT_LABEL[q]} ${pos.toLowerCase()}` };
    })
);

/** code -> full label, for the chart's hover tooltip — built once, not per-render. */
export const TOOTH_LABEL: Record<string, string> = Object.fromEntries(
    TOOTH_OPTIONS.map((t) => [t.code, t.label])
);

/**
 * The chart itself: two arches (upper, lower), each arch a single row read
 * left-to-right the way a dentist draws one — quadrant 1 (upper right)
 * innermost-out reversed so the midline sits in the visual centre, mirrored
 * for the other three quadrants. This is the one place quadrant order
 * matters visually; TOOTH_OPTIONS above stays in plain ascending FDI order
 * for the (now secondary) case something just needs the full list.
 */
function quadrantCodes(q: "1" | "2" | "3" | "4", reversed: boolean): ToothOption[] {
    const codes = POSITION_LABEL.map((_, i) => `${q}${i + 1}`);
    return (reversed ? codes.slice().reverse() : codes).map((code) => ({
        code,
        label: TOOTH_LABEL[code],
    }));
}

export const TOOTH_CHART_ROWS: ToothOption[][] = [
    [...quadrantCodes("1", true), ...quadrantCodes("2", false)], // upper: right -> left
    [...quadrantCodes("4", true), ...quadrantCodes("3", false)], // lower: right -> left
];

/** One color per condition, used as a className suffix (`is-cond-${condition}`) in consult.css. */
export const DENTAL_CONDITION_COLOR: Record<DentalCondition, string> = {
    caries: "red",
    filling_needed: "amber",
    root_canal_needed: "violet",
    fractured: "rose",
    mobile: "orange",
    impacted: "teal",
    missing: "muted",
    other: "blue",
};

export interface DentalFinding {
    id: number;
    visitId: string;
    toothNumber: string;
    condition: DentalCondition;
    note: string | null;
    attachmentId: number | null;
    createdByDoctorId: string | null;
    createdAt: string;
}
