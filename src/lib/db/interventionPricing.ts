// ---------------------------------------------------------------------------
// INTERVENTION PRICING — what a clinic charges for the procedures it does.
//
// Mirrors medicine pricing: a small per-clinic table, empty = off. A price
// belongs to a FAMILY ("Cast"), with an optional override for one
// configuration ("Cast" + "Above-elbow (long arm)") — see
// `PRICEABLE_FAMILIES` in features/consult/interventionFamilies.ts.
//
// Nothing here bills anything by itself: at Review, each intervention
// PERFORMED today that has a price is pre-filled into the existing
// additional-charges lines, where the doctor can change or drop it, and it
// saves, prints and shares through that same path. Planned ones never bill.
// ---------------------------------------------------------------------------

import { supabase } from "../supabase";
import { getDurableCache, setDurableCache } from "../offline/durableCache";
import { PRICEABLE_FAMILIES, priceConfigOf } from "../../features/consult/interventionFamilies";
import type { InterventionLine } from "../../features/consult/interventionPlan";
import type { AdditionalChargeLine } from "./additionalCharges";

export interface InterventionPrice {
    id: number;
    family: string;
    /** "" is the family's base price */
    configKey: string;
    price: number;
}

const cacheKey = (hospitalId: string) => `interventionPrices.${hospitalId}`;

export async function fetchInterventionPrices(hospitalId: string): Promise<InterventionPrice[]> {
    const { data, error } = await supabase
        .from("clinic_intervention_prices")
        .select("id, family, config_key, price")
        .eq("hospital_id", hospitalId);
    if (error) {
        // Offline: the last list this device saw is still the clinic's price
        // list; none at all means no pre-filled charges, which is safe.
        return getDurableCache<InterventionPrice[]>(cacheKey(hospitalId))?.value ?? [];
    }
    const rows = (data ?? []).map((r: any) => ({
        id: Number(r.id), family: r.family, configKey: r.config_key ?? "", price: Number(r.price),
    }));
    setDurableCache(cacheKey(hospitalId), rows);
    return rows;
}

export async function setInterventionPrice(opts: {
    hospitalId: string; family: string; configKey: string; price: number; setBy: string | null;
}): Promise<void> {
    const { error } = await supabase
        .from("clinic_intervention_prices")
        .upsert({
            hospital_id: opts.hospitalId, family: opts.family, config_key: opts.configKey,
            price: opts.price, set_by: opts.setBy, updated_at: new Date().toISOString(),
        }, { onConflict: "hospital_id,family,config_key" });
    if (error) throw new Error(`setInterventionPrice: ${error.message}`);
}

export async function deleteInterventionPrice(id: number): Promise<void> {
    const { error } = await supabase.from("clinic_intervention_prices").delete().eq("id", id);
    if (error) throw new Error(`deleteInterventionPrice: ${error.message}`);
}

/**
 * The charge lines today's PERFORMED interventions bring to the bill: the
 * configuration's own price when set, else the family's base price, else
 * nothing. Labelled with the line itself ("Cast — Left forearm, below-
 * elbow, backslab, POP") so the receipt says what was charged for.
 */
export function interventionCharges(prices: InterventionPrice[], lines: InterventionLine[]): AdditionalChargeLine[] {
    if (prices.length === 0) return [];
    const out: AdditionalChargeLine[] = [];
    for (const l of lines) {
        if (l.status === "planned" || !l.family) continue;
        const config = priceConfigOf(l.family, l.details);
        const hit = (config && prices.find((p) => p.family === l.family && p.configKey === config))
            || prices.find((p) => p.family === l.family && p.configKey === "");
        if (!hit) continue;
        const title = PRICEABLE_FAMILIES.find((f) => f.key === l.family)?.title ?? l.label;
        out.push({ label: l.text || title, amount: hit.price });
    }
    return out;
}
