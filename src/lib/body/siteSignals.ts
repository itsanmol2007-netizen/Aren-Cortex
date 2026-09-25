// ---------------------------------------------------------------------------
// SITE SIGNALS — a place on the patient, in the engine's vocabulary.
//
// The engine used to be site-blind: "Joint swelling" after a fall ranked the
// same imaging whether the swelling was at the knee or the wrist. Every place
// established in a visit (a sited finding, a body-map mark, an assessment or
// intervention site) now becomes one region signal (SITE_KNEE…), whose rules
// (migration 20260925_sited_findings) tilt the ranking toward that region's
// X-ray and conditions. Chest, abdomen and head map to nothing: a place there
// says little an orthopaedic rule could use.
// ---------------------------------------------------------------------------

import type { SiteRef } from "./clinicalSite";
import { normalizeSite } from "./clinicalSite";

export function siteSignalOf(site: SiteRef): string | null {
    const s = normalizeSite(site);
    switch (s.region) {
        case "knee": return "SITE_KNEE";
        case "ankle":
        case "foot": return "SITE_ANKLE_FOOT";
        case "wrist":
        case "hand": return "SITE_WRIST_HAND";
        case "forearm": return "SITE_FOREARM";
        case "elbow": return "SITE_ELBOW";
        case "upper_arm": return "SITE_UPPER_ARM";
        case "shoulder": return "SITE_SHOULDER";
        case "hip": return "SITE_HIP";
        case "pelvis": return "SITE_PELVIS";
        case "thigh": return "SITE_THIGH";
        case "lower_leg": return "SITE_LOWER_LEG";
        case "neck": return s.aspect === "back" ? "SITE_CERVICAL" : null;
        case "torso_upper": return s.aspect === "back" ? "SITE_THORACIC" : null;
        case "torso_lower": return s.aspect === "back" ? "SITE_LUMBAR" : null;
        default: return null;
    }
}

/** Distinct region signals for a set of places, in a stable order. */
export function siteSignalsOf(sites: SiteRef[]): string[] {
    const out = new Set<string>();
    for (const s of sites) {
        const id = siteSignalOf(s);
        if (id) out.add(id);
    }
    return [...out].sort();
}
