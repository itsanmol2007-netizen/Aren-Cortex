import { supabase } from "../supabase";
import { DOCTOR_ID } from "./reference";

// ---------------------------------------------------------------------------
// What saving a consultation writes.
//
// Everything else that used to live here was v1 and is gone: `rankMedicines`
// and `runLearningLoop` (the `rank-compositions` edge function, replaced by the
// Synapse engine running client-side), `fetchFrequentPicks` and the favourites
// helpers on `doctor_medicine_bias`, `logCoprescriptionObservations`, and
// `searchMedicinesDB`. Their replacements live in `lib/db/synapse.ts` and are
// driven by the rule base rather than by a separate set of hint tables.
// ---------------------------------------------------------------------------
// ── SAVE PRESCRIPTION ──────────────────────────────────────────────────────────
export type SaveConsultMedicine = {
    medicine_id: number;
    composition_ids: number[];     // all composition IDs (1 for single, 2+ for combos)
    dosage_mg: number | null;
    frequency: string;             // slot string e.g. "1-0-1-0"
    duration_days: number | null;
    route: string;
    notes: string;
    instructions: string;
    is_sos: boolean;
    sort_order: number;
};

export async function saveConsult(opts: {
    visitId: string;
    medicines: SaveConsultMedicine[];
    tests: string[];
    vitals: Record<string, string>;
    findingsText: string;
    followUpDays?: number | null;
    adviceNotes?: string | null;
}): Promise<{ prescriptionId: string }> {
    // 1. Save vitals + mark visit completed
    const { error: visitErr } = await supabase
        .from("visits")
        .update({
            vitals: opts.vitals,
            status: "completed",
            completed_at: new Date().toISOString(),
        })
        .eq("id", opts.visitId);
    if (visitErr) throw new Error(`updateVisit: ${visitErr.message}`);

    // 2. Create prescription row
    const { data: rx, error: rxErr } = await supabase
        .from("prescriptions")
        .insert({
            visit_id: opts.visitId,
            assigned_doctor_id: DOCTOR_ID,
            findings_text: opts.findingsText,
            follow_up_days: opts.followUpDays ?? null,
            advice_notes: opts.adviceNotes ?? null,
        })
        .select("id")
        .single();
    if (rxErr) throw new Error(`createPrescription: ${rxErr.message}`);

    // 3. Prescription medicines — full dosage data
    if (opts.medicines.length) {
        const rows = opts.medicines.map((m) => ({
            prescription_id: rx.id,
            medicine_id: m.medicine_id,
            composition_ids: m.composition_ids,          // integer[] array column
            composition_id: m.composition_ids[0] ?? null, // keep legacy column as primary
            dosage_mg: m.dosage_mg,
            frequency: m.frequency,
            duration_days: m.duration_days,
            route: m.route,
            notes: m.notes,
            instructions: m.instructions,
            is_sos: m.is_sos,
            sort_order: m.sort_order,
        }));
        const { error: medErr } = await supabase
            .from("prescription_medicines")
            .insert(rows);
        if (medErr) throw new Error(`insertPrescriptionMedicines: ${medErr.message}`);
    }

    // 4. Diagnostic orders
    if (opts.tests.length) {
        const rows = opts.tests.map((name) => ({
            visit_id: opts.visitId,
            prescription_id: rx.id,
            test_name: name,
            status: "ordered",
        }));
        const { error: testErr } = await supabase
            .from("diagnostic_orders")
            .insert(rows);
        if (testErr) throw new Error(`insertDiagnosticOrders: ${testErr.message}`);
    }

    return { prescriptionId: rx.id };
}

