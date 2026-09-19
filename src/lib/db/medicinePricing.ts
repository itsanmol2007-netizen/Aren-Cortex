// ---------------------------------------------------------------------------
// MEDICINE DISPENSING BILLING — reading and writing what a clinic charges
// for the medicine it actually hands over.
//
// Opt-in, per clinic (`hospitals.medicine_billing_enabled`) — see the
// `20260919_medicine_dispensing_billing.sql` migration's own header for the
// full four-piece shape. This file is the doctor-side half: whether the
// policy is even on, and what THIS clinic charges for THIS medicine.
// Turning the policy on/off and setting the GST rate is the admin console's
// job (`lib/db/admin.ts`'s `BillingPolicy` / `FeesModal.tsx`) — this file
// never writes `hospitals.medicine_billing_enabled` itself.
// ---------------------------------------------------------------------------

import { supabase } from "../supabase";
import { getDurableCache, setDurableCache } from "../offline/durableCache";

export interface MedicineBillingPolicy {
    enabled: boolean;
    /** Only meaningful when `enabled` is true — see the migration's own
     *  note: medicine GST reuses the clinic's one `gst_percent`, it is not
     *  a second rate. */
    gstEnabled: boolean;
    gstPercent: number;
}

const policyKey = (hospitalId: string) => `medicineBillingPolicy.${hospitalId}`;

/**
 * Whether this clinic bills dispensed medicine, and at what GST rate.
 * Durable-cached the same way `fetchFeeContext` caches the consult-fee
 * policy — this is read once per consult load and rarely changes.
 */
export async function fetchMedicineBillingPolicy(hospitalId: string): Promise<MedicineBillingPolicy> {
    const { data, error } = await supabase
        .from("hospitals")
        .select("medicine_billing_enabled, medicine_gst_enabled, gst_percent")
        .eq("id", hospitalId)
        .maybeSingle();
    if (error) {
        // Offline, most likely — the last confirmed policy is still the
        // honest answer; a clinic that has never turned this on gets `false`
        // either way, which is the safe default in both directions.
        const cached = getDurableCache<MedicineBillingPolicy>(policyKey(hospitalId));
        if (cached) return cached.value;
        return { enabled: false, gstEnabled: false, gstPercent: 18 };
    }
    const policy: MedicineBillingPolicy = {
        enabled: data?.medicine_billing_enabled ?? false,
        gstEnabled: data?.medicine_gst_enabled ?? false,
        gstPercent: Number(data?.gst_percent ?? 18),
    };
    setDurableCache(policyKey(hospitalId), policy);
    return policy;
}

export interface ClinicMedicinePrice {
    medicineId: number;
    packPrice: number;
    packUnits: number;
    /** `pack_price / pack_units`, computed by the database. */
    unitPrice: number;
}

const toPrice = (row: { medicine_id: number | string; pack_price: number | string; pack_units: number | string; unit_price: number | string }): ClinicMedicinePrice => ({
    medicineId: Number(row.medicine_id),
    packPrice: Number(row.pack_price),
    packUnits: Number(row.pack_units),
    unitPrice: Number(row.unit_price),
});

/**
 * Every priced brand in one small batch — the dose sheet shows up to ~30
 * candidate brands at once, and fetching each one's price separately as the
 * doctor arrows through them would be a query per keystroke. `medicineIds`
 * is typically a handful; a clinic's own price list is tiny either way.
 */
export async function fetchClinicMedicinePrices(
    hospitalId: string,
    medicineIds: number[]
): Promise<Map<number, ClinicMedicinePrice>> {
    const ids = [...new Set(medicineIds)];
    const out = new Map<number, ClinicMedicinePrice>();
    if (!ids.length) return out;
    const { data, error } = await supabase
        .from("clinic_medicine_prices")
        .select("medicine_id, pack_price, pack_units, unit_price")
        .eq("hospital_id", hospitalId)
        .in("medicine_id", ids);
    if (error) throw new Error(`fetchClinicMedicinePrices: ${error.message}`);
    for (const row of data ?? []) out.set(Number(row.medicine_id), toPrice(row));
    return out;
}

/** This clinic's own price for one medicine, or null if it has never priced
 *  it. Not cached — a doctor picking through several brands in one sheet
 *  needs each one's own live answer, and the table is tiny per clinic. */
export async function fetchClinicMedicinePrice(
    hospitalId: string,
    medicineId: number
): Promise<ClinicMedicinePrice | null> {
    const { data, error } = await supabase
        .from("clinic_medicine_prices")
        .select("medicine_id, pack_price, pack_units, unit_price")
        .eq("hospital_id", hospitalId)
        .eq("medicine_id", medicineId)
        .maybeSingle();
    if (error) throw new Error(`fetchClinicMedicinePrice: ${error.message}`);
    return data ? toPrice(data) : null;
}

export interface ClinicMedicinePriceRow extends ClinicMedicinePrice {
    medicineName: string;
    manufacturer: string | null;
}

/**
 * Every medicine this clinic has ever priced, newest edit first — the
 * Practice page's Medicine Pricing card (a short preview of the most
 * recent few) and its management modal (the full list) both read this.
 * A clinic's own price list is small (it prices what it actually stocks,
 * not the whole catalogue), so one unpaginated read is the honest shape —
 * no cursor, no cache, same as `fetchClinicMedicinePrice`.
 */
export async function fetchClinicMedicinePriceList(hospitalId: string): Promise<ClinicMedicinePriceRow[]> {
    const { data, error } = await supabase
        .from("clinic_medicine_prices")
        .select("medicine_id, pack_price, pack_units, unit_price, medicines(name, manufacturer)")
        .eq("hospital_id", hospitalId)
        .order("updated_at", { ascending: false });
    if (error) throw new Error(`fetchClinicMedicinePriceList: ${error.message}`);
    return (data ?? []).map((row) => {
        const med = row.medicines as unknown as { name: string; manufacturer: string | null } | null;
        return {
            ...toPrice(row),
            medicineName: med?.name ?? `#${row.medicine_id}`,
            manufacturer: med?.manufacturer ?? null,
        };
    });
}

/**
 * Sets (or replaces) this clinic's price for one medicine — a pack price
 * and how many units the pack contains, never a per-unit rate typed
 * directly: a clinic prices what it actually buys (a 10-strip pack at
 * ₹200), not an abstract per-tablet number. See the migration's own
 * comment on `unit_price` for why it is derived, not entered.
 */
export async function setClinicMedicinePrice(opts: {
    hospitalId: string;
    medicineId: number;
    packPrice: number;
    packUnits: number;
    setBy: string | null;
}): Promise<ClinicMedicinePrice> {
    const { data, error } = await supabase
        .from("clinic_medicine_prices")
        .upsert(
            {
                hospital_id: opts.hospitalId,
                medicine_id: opts.medicineId,
                pack_price: opts.packPrice,
                pack_units: opts.packUnits,
                set_by: opts.setBy,
            },
            { onConflict: "hospital_id,medicine_id" }
        )
        .select("medicine_id, pack_price, pack_units, unit_price")
        .single();
    if (error) throw new Error(`setClinicMedicinePrice: ${error.message}`);
    return toPrice(data);
}
