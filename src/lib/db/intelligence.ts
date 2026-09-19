import { supabase } from "../supabase";
import { registerWriteHandler } from "../offline/writeQueue";
import type { Vitals } from "../../types";
import type { ReviewBillingResult } from "./additionalCharges";

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
    composition_ids: number[];     // all composition IDs (1 for single, 2+ for combos), empty for a composition-less add
    composition_note?: string | null; // doctor's free-text salt description when composition_ids is empty
    dosage_mg: number | null;
    frequency: string;             // slot string e.g. "1-0-1-0"
    duration_days: number | null;
    route: string;
    notes: string;
    instructions: string;
    is_sos: boolean;
    sort_order: number;
    /** Medicine dispensing billing (opt-in) — absent/null for every clinic
     *  that has never turned this on. See lib/db/medicinePricing.ts. */
    quantity_dispensed?: number | null;
    unit_price?: number | null;
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
    // Was Record<string, string> — widened for `customMeasurements`, the one
    // array-valued field (see measures.ts's `MeasureFieldKey`). Written
    // straight into `visits.vitals` jsonb either way; this type only ever
    // described what the column already accepted.
    vitals: Vitals;
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
    /**
     * Medicine dispensing billing (opt-in) — omitted entirely for the vast
     * majority of clinics that never turn this on, in which case step 3.5
     * below is skipped outright and `visit_payments` is never touched by
     * this function. When present, `gstPercent` is the clinic's OWN GST
     * rate (`hospitals.gst_percent`) applied to dispensed medicine, not a
     * second rate — see the `medicine_dispensing_billing` migration.
     */
    medicineBilling?: { gstEnabled: boolean; gstPercent: number } | null;
    /**
     * Additional (non-medicine) service charges added at review time, and a
     * discount on the visit's FINAL total — separate from front desk's own
     * intake-time discount on the fee alone (`visit_payments.discount`).
     * Omitted entirely for the vast majority of consults that use neither;
     * folded into the SAME `visit_payments` update as `medicineBilling`
     * below when either is present, never a second round trip for one visit.
     */
    reviewBilling?: ReviewBillingResult | null;
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
            composition_note: m.composition_note ?? null,
            dosage_mg: m.dosage_mg,
            frequency: m.frequency,
            duration_days: m.duration_days,
            route: m.route,
            notes: m.notes,
            instructions: m.instructions,
            is_sos: m.is_sos,
            sort_order: m.sort_order,
            quantity_dispensed: m.quantity_dispensed ?? null,
            unit_price: m.unit_price ?? null,
        }));
        const { error: medErr } = await supabase
            .from("prescription_medicines")
            .insert(rows);
        if (medErr) throw new Error(`insertPrescriptionMedicines: ${medErr.message}`);
    }

    // 3.5. Billing fold — medicine dispensing AND/OR the review-time
    // additional charges/discount, in ONE update to the visit's payment
    // row rather than one per feature. Skipped outright when neither opt
    // was passed, or when there is genuinely nothing to fold in (no
    // medicine was priced, no charge was added, no discount was given) —
    // `visit_payments` is created ONCE at intake (see lib/db/payments.ts's
    // `recordVisitPayment`) and never by this function, so a visit with no
    // fee configured — no payment row at all — is a silent no-op here, not
    // an error: there is nothing to fold anything into.
    const billingUpdate: Record<string, unknown> = {};

    if (opts.medicineBilling && opts.medicines.length) {
        const medicineTotal = opts.medicines.reduce((sum, m) => {
            if (m.quantity_dispensed == null || m.unit_price == null) return sum;
            return sum + Math.round(m.quantity_dispensed * m.unit_price * 100) / 100;
        }, 0);
        if (medicineTotal > 0) {
            billingUpdate.medicine_total = Math.round(medicineTotal * 100) / 100;
            billingUpdate.medicine_gst_amount = opts.medicineBilling.gstEnabled
                ? Math.round((medicineTotal * opts.medicineBilling.gstPercent) / 100)
                : 0;
        }
    }

    if (opts.reviewBilling) {
        const { additionalCharges, discountPercent, discountAmount } = opts.reviewBilling;
        if (additionalCharges.length > 0) {
            billingUpdate.additional_charges = additionalCharges;
            billingUpdate.additional_charges_total =
                Math.round(additionalCharges.reduce((sum, c) => sum + c.amount, 0) * 100) / 100;
        }
        if (discountAmount > 0) {
            billingUpdate.review_discount_percent = discountPercent;
            billingUpdate.review_discount_amount = Math.round(discountAmount * 100) / 100;
        }
    }

    if (Object.keys(billingUpdate).length > 0) {
        const { error: billingErr } = await supabase
            .from("visit_payments")
            .update(billingUpdate)
            .eq("visit_id", opts.visitId);
        // Non-fatal by design, same as the payment audit trail
        // (payments.ts's `logPaymentEvent`): the clinical record — the
        // prescription and its medicines — is already saved by this
        // point, and a consult must never fail to complete because the
        // money side of it couldn't be folded in.
        if (billingErr) console.warn("[intelligence] billing update failed (non-fatal):", billingErr.message);
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

