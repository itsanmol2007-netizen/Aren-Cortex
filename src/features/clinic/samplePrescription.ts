// ---------------------------------------------------------------------------
// The specimen prescription — ONE set of mock content, shared by the Clinic
// page's dashboard preview and the Prescription Editor's live preview.
//
// Both surfaces render the REAL `PrescriptionDocument` (standing rule 6: one
// prescription renderer). What they need is something for it to render, and
// they must show the SAME thing — a doctor who tunes the header in the editor
// and then sees a differently-populated preview back on the dashboard has no
// way to tell what changed. Hence one file, imported by both, rather than two
// literals that agree today.
//
// Nothing here is patient data. The names are obviously specimen names and the
// medicines are the ordinary, non-diagnostic ones (an analgesic, a PPI, a
// supplement) — a specimen prescription should not read as a clinical
// recommendation for whatever condition its contents imply.
// ---------------------------------------------------------------------------

import type { PrescriptionMedicine } from "../../types";

export const SAMPLE_PATIENT = {
    name: "Specimen Patient",
    age: 34,
    gender: "M",
    phone: "98765 43210",
};

export const SAMPLE_SYMPTOMS = ["Headache, 3 days", "Acidity after meals"];
export const SAMPLE_FINDINGS = ["Epigastric tenderness"];
export const SAMPLE_TESTS = ["CBC", "LFT"];
export const SAMPLE_FOLLOW_UP_DAYS = 7;
export const SAMPLE_REF = "RX-SPECIMEN";

/** `PrescriptionMedicine` is `Medicine & {…}` — the catalogue ids below are
 *  deliberately negative so that a specimen row can never be mistaken for, or
 *  collide with, a real `medicines`/`compositions` row if one ever leaked into
 *  a code path that writes. */
export const SAMPLE_MEDICINES: PrescriptionMedicine[] = [
    {
        id: "specimen-1",
        medicine_id: -1,
        composition_ids: [-1],
        primary_composition_id: -1,
        name: "Paracetamol 650 Tablet",
        category: "Analgesic",
        use: "Fever and pain",
        match: 0,
        composition: "Paracetamol",
        dosage: "650 mg",
        frequency: "1-0-1-0",
        duration: "5 days",
        notes: "",
        dosage_mg: 650,
        duration_days: 5,
        route: "Oral",
        instructions: "After food",
        is_sos: false,
        sort_order: 0,
    },
    {
        id: "specimen-2",
        medicine_id: -2,
        composition_ids: [-2],
        primary_composition_id: -2,
        name: "Pantoprazole 40 Tablet",
        category: "Proton pump inhibitor",
        use: "Acidity",
        match: 0,
        composition: "Pantoprazole",
        dosage: "40 mg",
        frequency: "1-0-0-0",
        duration: "10 days",
        notes: "",
        dosage_mg: 40,
        duration_days: 10,
        route: "Oral",
        instructions: "Before breakfast",
        is_sos: false,
        sort_order: 1,
    },
    {
        id: "specimen-3",
        medicine_id: -3,
        composition_ids: [-3],
        primary_composition_id: -3,
        name: "Vitamin D3 60K Sachet",
        category: "Supplement",
        use: "Deficiency",
        match: 0,
        composition: "Cholecalciferol",
        dosage: "60000 IU",
        frequency: "0-0-0-1",
        duration: "4 weeks",
        notes: "",
        dosage_mg: null,
        duration_days: 28,
        route: "Oral",
        instructions: "Weekly, with milk",
        is_sos: false,
        sort_order: 2,
    },
];
