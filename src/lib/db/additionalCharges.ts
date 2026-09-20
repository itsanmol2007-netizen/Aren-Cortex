// ---------------------------------------------------------------------------
// ADDITIONAL CHARGES — the non-medicine services a clinic bills alongside
// the consultation fee ("physio session", "dressing", ...).
//
// Independent of medicine billing and of the consultation fee itself —
// Anmol, 2026-09-19: "it's not necessary that when doctor consultation fees
// is turned on only then medicine thing will be turned on... these things
// could be individually turned on or off." There is no clinic-level enable
// toggle here: an empty catalog IS the off state, same as
// `clinic_medicine_prices` already is for medicine pricing.
//
// Two shapes, on purpose — see the `additional_charges_and_review_discount`
// migration's own header:
//  * `AdditionalChargeCatalogEntry` — the clinic's SAVED, reusable list.
//  * `AdditionalChargeLine` — what actually got billed on ONE visit, a
//    plain snapshot the doctor typed at review time, never a foreign key
//    back to the catalog (a catalog price edit next month must never
//    rewrite a bill already shown to a patient).
// ---------------------------------------------------------------------------

import { supabase } from "../supabase";

export interface AdditionalChargeCatalogEntry {
    id: number;
    label: string;
    defaultAmount: number;
}

export interface AdditionalChargeLine {
    label: string;
    amount: number;
}

/**
 * What ReviewModal's Billing section decided, handed back through the same
 * `onSave`/`onSendWhatsApp` callbacks the consult already saves through —
 * see ReviewModal's own header comment on why this rides those rather than
 * a new prop, and `saveConsult`'s `reviewBilling` opt for where it lands.
 */
export interface ReviewBillingResult {
    additionalCharges: AdditionalChargeLine[];
    /** Percent of the final total — null when a flat rupee amount was typed
     *  instead (`discountAmount` is always the resolved number either way). */
    discountPercent: number | null;
    discountAmount: number;
}

/**
 * This clinic's saved charges, most recently used first — the quick-pick
 * chips Review's "add a charge" form offers before the doctor types a new
 * one. Small per clinic, same "one unpaginated read" shape as
 * `fetchClinicMedicinePriceList`.
 */
export async function fetchAdditionalChargesCatalog(hospitalId: string): Promise<AdditionalChargeCatalogEntry[]> {
    const { data, error } = await supabase
        .from("clinic_additional_charges")
        .select("id, label, default_amount")
        .eq("hospital_id", hospitalId)
        .order("updated_at", { ascending: false });
    if (error) throw new Error(`fetchAdditionalChargesCatalog: ${error.message}`);
    return (data ?? []).map((r) => ({
        id: Number(r.id),
        label: r.label as string,
        defaultAmount: Number(r.default_amount),
    }));
}

/**
 * Saves (or updates the rate on) a catalog entry — called once, quietly,
 * whenever a doctor adds a charge at review time that either doesn't exist
 * in the catalog yet or now costs a different default amount. Never called
 * for a charge the doctor deliberately typed as a one-off; Review's own
 * "save for next time" checkbox decides which case this is.
 */
export async function saveAdditionalChargeToCatalog(opts: {
    hospitalId: string;
    label: string;
    defaultAmount: number;
}): Promise<AdditionalChargeCatalogEntry> {
    const { data, error } = await supabase
        .from("clinic_additional_charges")
        .upsert(
            { hospital_id: opts.hospitalId, label: opts.label.trim(), default_amount: opts.defaultAmount },
            { onConflict: "hospital_id,label" }
        )
        .select("id, label, default_amount")
        .single();
    if (error) throw new Error(`saveAdditionalChargeToCatalog: ${error.message}`);
    return { id: Number(data.id), label: data.label as string, defaultAmount: Number(data.default_amount) };
}

/**
 * Edits an existing catalog entry BY ID — the Practice page's own "Additional
 * Charges" card manages the full catalog directly (add, reprice, rename,
 * remove), unlike Review's quiet upsert-by-label above. Going by id rather
 * than `(hospital_id, label)` is the whole point: a rename would otherwise
 * either violate the unique constraint or, worse, insert a second row instead
 * of editing the first.
 */
export async function updateAdditionalCharge(opts: {
    id: number;
    label: string;
    defaultAmount: number;
}): Promise<AdditionalChargeCatalogEntry> {
    const { data, error } = await supabase
        .from("clinic_additional_charges")
        .update({ label: opts.label.trim(), default_amount: opts.defaultAmount })
        .eq("id", opts.id)
        .select("id, label, default_amount")
        .single();
    if (error) throw new Error(`updateAdditionalCharge: ${error.message}`);
    return { id: Number(data.id), label: data.label as string, defaultAmount: Number(data.default_amount) };
}

/** Removes a catalog entry — visits that already billed it keep their own
 *  `visit_payments.additional_charges` snapshot untouched (see the header). */
export async function deleteAdditionalCharge(id: number): Promise<void> {
    const { error } = await supabase.from("clinic_additional_charges").delete().eq("id", id);
    if (error) throw new Error(`deleteAdditionalCharge: ${error.message}`);
}
