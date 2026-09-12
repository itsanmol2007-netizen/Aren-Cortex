import { supabase } from "../supabase";
import { registerWriteHandler } from "../offline/writeQueue";

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
    /**
     * Who is signing this prescription. Required — it was the DOCTOR_ID
     * constant, so every prescription written from any account was attributed
     * to one specific doctor at one specific clinic. That is the worst of the
     * tenancy bugs to leave silent: it is not a blank screen the doctor can
     * see, it is a signed clinical document with the wrong name on it.
     */
    doctorId: string;
    /**
     * The facility this prescription belongs to. REQUIRED.
     *
     * `prescriptions.hospital_id` exists and its RLS policy checks it on
     * INSERT. This insert never set it, so the column went in NULL, the
     * WITH CHECK failed, and every save died on
     * `42501: new row violates row-level security policy for table
     * "prescriptions"` — a 403 at the last step of the consultation, after
     * the visit had already been marked completed by step 1.
     *
     * Nothing else in the chain needs it: `prescription_medicines` and
     * `diagnostic_orders` have no `hospital_id` of their own and scope
     * through the prescription. Verified against the live schema 2026-08-13.
     */
    hospitalId: string;
    medicines: SaveConsultMedicine[];
    tests: string[];
    vitals: Record<string, string>;
    findingsText: string;
    followUpDays?: number | null;
    adviceNotes?: string | null;
    /**
     * What the clinic delivered during this visit — ultrasound, IFT, manual
     * therapy. Its own column rather than more lines in `advice_notes`,
     * because "what was done to the patient" and "what the patient should do"
     * are different questions and the longitudinal record has to be able to
     * answer the first one per visit. See IntentType in engine.ts.
     */
    therapyNotes?: string | null;
    /**
     * The diagnostic centre these tests were ordered from — a doctor-picked
     * preferred lab, or null when none was selected. One choice for the whole
     * order, not per test: Consult's plan-rail prompt asks "order from" once,
     * for whatever investigations are on the plan, the same way a real
     * referral slip names one destination lab.
     */
    labName?: string | null;
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
            assigned_doctor_id: opts.doctorId,
            // The tenancy discriminator the RLS policy checks. See `hospitalId`.
            hospital_id: opts.hospitalId,
            findings_text: opts.findingsText,
            follow_up_days: opts.followUpDays ?? null,
            advice_notes: opts.adviceNotes ?? null,
            therapy_notes: opts.therapyNotes ?? null,
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
            lab_name: opts.labName ?? null,
        }));
        const { error: testErr } = await supabase
            .from("diagnostic_orders")
            .insert(rows);
        if (testErr) throw new Error(`insertDiagnosticOrders: ${testErr.message}`);
    }

    return { prescriptionId: rx.id };
}

// ── OFFLINE — queued consult save ───────────────────────────────────────────
//
// This is the CORE offline-survivability write, not a full offline HMS —
// see docs/context/offline-security.md's design discussion. It exists
// because, until now, finishing a consult had NO offline path at all: only
// front desk's new-patient/visit registration was queued
// (`frontdesk.createVisit` in useVisitActions.ts). A doctor who lost
// connectivity mid-consult could chart everything, then hit a hard "Save
// failed" at the very last step — the one moment losing the work actually
// mattered.
//
// What this handler does NOT cover, deliberately: `saveExercisePlan`,
// `onSaveStory` (the story/goals write), `commitConsultation` (the
// decision-log learning write), and any WhatsApp send. All four are
// already treated as best-effort/non-fatal even in the ONLINE path today
// (see useConsultLifecycle.ts's own comments — "a consult save must never
// fail because personalisation did") — extending that same acceptance to
// "the network wasn't there for the whole save" is consistent, not a new
// compromise. `useConsultLifecycle.ts`'s offline branch skips them outright
// rather than trying to queue four more independent writes, several of
// which (WhatsApp in particular) cannot be queued at all — a message send
// has no offline equivalent to fall back to.
//
// No new-medicine-creation risk here either: every `medicine_id`/
// `composition_id` this ever receives already exists in the catalogue by
// the time a doctor can pick it (the catalogue is downloaded well before
// any consult starts) — there is no id-reconciliation problem like the one
// discussed for offline medicine ADDITION, which is why that stays
// restricted to online-only instead.
async function replaySaveConsult(payload: unknown): Promise<void> {
    await saveConsult(payload as Parameters<typeof saveConsult>[0]);
}
registerWriteHandler("consult.saveConsult", replaySaveConsult);

