// ---------------------------------------------------------------------------
// The tooth chart's vocabulary — conditions, tooth naming, and the
// surface/whole-tooth split. The chart's *geometry* (arch curves, crown
// shapes, the five clickable surfaces per tooth) lives in anatomy.ts.
// ---------------------------------------------------------------------------

import type { ToothSurface } from "./anatomy";

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
 * Which conditions live on a surface and which belong to the whole tooth.
 * This is a clinical distinction, not a UI convenience: caries, a needed
 * filling and a fracture all happen on a named surface ("36 MO"), while
 * mobility, impaction, a missing tooth and a root canal are facts about the
 * tooth entire. The chart asks for a surface only where a surface exists to
 * be asked about.
 */
export const SURFACE_CONDITIONS: DentalCondition[] = ["caries", "filling_needed", "fractured"];

export function isSurfaceCondition(c: DentalCondition): boolean {
    return SURFACE_CONDITIONS.includes(c);
}

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
    /** null = the finding is about the whole tooth, not one surface */
    surface: ToothSurface | null;
    condition: DentalCondition;
    note: string | null;
    attachmentId: number | null;
    createdByDoctorId: string | null;
    createdAt: string;
}
