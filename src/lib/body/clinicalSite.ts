// ---------------------------------------------------------------------------
// CLINICAL SITE — a place on the patient, named the way an orthopaedic or
// general doctor writes it on a chart.
//
// `anatomy.ts` names zones for dermatology ("Elbow crease", "Shin", "Sole"),
// which is right for a skin finding and wrong for a fracture. This file puts
// a clinical name on the SAME zones, and is what the shared anatomy picker,
// structured assessments ("Fracture — Left knee") and interventions ("Cast —
// Left forearm") all use, so one place is always one string.
//
// ── The spine has no side
//
// The torso zones are drawn as left/right halves (dermatology needs that),
// but seen from behind they ARE the spine, which is midline: a click on
// either half of the lower back is "Lumbar spine", never "Left lumbar
// spine". `normalizeSite` drops the side for those, which is what keeps a
// spine assessment from ever being asked "left or right?".
// ---------------------------------------------------------------------------

import type { BodyAspect, BodyRegion, BodySide } from "./anatomy";

/** "both" — bilateral, for the conditions that allow it (knee OA, carpal
 *  tunnel…); never offered on the body map itself, only on a joint's own
 *  Left | Right | Both control. */
export type SiteSide = BodySide | "both";

export interface SiteRef {
    region: BodyRegion;
    side: SiteSide | null;
    aspect: BodyAspect;
}

const NAMES: Record<BodyRegion, { front: string; back: string }> = {
    head_top: { front: "Head", back: "Head" },
    head_bottom: { front: "Face", back: "Occiput" },
    neck: { front: "Neck", back: "Cervical spine" },
    torso_upper: { front: "Chest", back: "Thoracic spine" },
    torso_lower: { front: "Abdomen", back: "Lumbar spine" },
    pelvis: { front: "Pelvis", back: "Buttock" },
    shoulder: { front: "Shoulder", back: "Shoulder" },
    upper_arm: { front: "Upper arm", back: "Upper arm" },
    elbow: { front: "Elbow", back: "Elbow" },
    forearm: { front: "Forearm", back: "Forearm" },
    wrist: { front: "Wrist", back: "Wrist" },
    hand: { front: "Hand", back: "Hand" },
    hip: { front: "Hip", back: "Hip" },
    thigh: { front: "Thigh", back: "Thigh" },
    knee: { front: "Knee", back: "Knee" },
    lower_leg: { front: "Lower leg", back: "Lower leg" },
    ankle: { front: "Ankle", back: "Ankle" },
    foot: { front: "Foot", back: "Foot" },
};

/** Midline places with no side, whatever half of the drawing was clicked. */
export function isMidline(region: BodyRegion, aspect: BodyAspect): boolean {
    if (region === "head_top" || region === "head_bottom" || region === "neck") return true;
    if (aspect === "back" && (region === "torso_upper" || region === "torso_lower")) return true;
    return false;
}

/** True for the spinal regions — used by assessments whose details differ for the spine. */
export function isSpine(site: SiteRef | null): boolean {
    if (!site) return false;
    return (site.region === "neck" && site.aspect === "back")
        || (site.aspect === "back" && (site.region === "torso_upper" || site.region === "torso_lower"));
}

export function normalizeSite(site: SiteRef): SiteRef {
    return isMidline(site.region, site.aspect) ? { ...site, side: null } : site;
}

/** "Left knee", "Lumbar spine", "Right forearm". */
export function clinicalSiteLabel(site: SiteRef): string {
    const s = normalizeSite(site);
    const base = NAMES[s.region][s.aspect];
    if (!s.side) return base;
    if (s.side === "both") return `Bilateral ${base.toLowerCase()}`;
    return `${s.side === "left" ? "Left" : "Right"} ${base.toLowerCase()}`;
}

/** The region's clinical name without a side — "Knee", "Lumbar spine". */
export function regionName(region: BodyRegion, aspect: BodyAspect = "front"): string {
    return NAMES[region][aspect];
}

/** Stable identity for "the same place", independent of which view picked it
 *  (a left knee picked from the front or back is one knee). */
export function siteKey(site: SiteRef): string {
    const s = normalizeSite(site);
    const name = NAMES[s.region][s.aspect];
    return `${name.toLowerCase()}|${s.side ?? "-"}`;
}

export function sameSite(a: SiteRef | null, b: SiteRef | null): boolean {
    return !!a && !!b && siteKey(a) === siteKey(b);
}

/**
 * Every distinct site as a typeable option, for the picker's search box —
 * a doctor who would rather type "left wr" than click the figure. Built from
 * the same table, so a typed site and a clicked site are the same string.
 */
export const CLINICAL_SITE_OPTIONS: { label: string; site: SiteRef }[] = (() => {
    const out: { label: string; site: SiteRef }[] = [];
    const seen = new Set<string>();
    const regions = Object.keys(NAMES) as BodyRegion[];
    for (const aspect of ["front", "back"] as BodyAspect[]) {
        for (const region of regions) {
            const sides: (BodySide | null)[] = isMidline(region, aspect) ? [null] : ["left", "right"];
            for (const side of sides) {
                const site: SiteRef = { region, side, aspect };
                const k = siteKey(site);
                if (seen.has(k)) continue;
                seen.add(k);
                out.push({ label: clinicalSiteLabel(site), site });
            }
        }
    }
    return out;
})();

/** Back from a stored label ("Left knee") to the site it names; null for a
 *  free-text site no option matches. */
export function siteFromLabel(label: string | null | undefined): SiteRef | null {
    const q = (label ?? "").trim().toLowerCase();
    if (!q) return null;
    return CLINICAL_SITE_OPTIONS.find((o) => o.label.toLowerCase() === q)?.site ?? null;
}

/**
 * A body-map / examination region key ("knee", "torso_lower") and its side,
 * as a site. The examination names the spine by its torso zone, so those
 * are read from the back, where the figure draws the spine.
 */
export function siteFromRegionKey(key: string, side: BodySide | null): SiteRef | null {
    if (!(key in NAMES)) return null;
    const region = key as BodyRegion;
    const aspect: BodyAspect = region === "neck" || region === "torso_upper" || region === "torso_lower" ? "back" : "front";
    return normalizeSite({ region, side, aspect });
}
