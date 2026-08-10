// ---------------------------------------------------------------------------
// The tooth chart's vocabulary. Backend/backbone tonight, per explicit scope
// agreed with Anmol (2026-08-08) — the UI is a plain list-and-form, not a
// clickable diagram. tooth_number (FDI notation) is already the addressable
// unit a real diagram would click on later; nothing here needs to change
// when that gets built.
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
