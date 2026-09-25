// ---------------------------------------------------------------------------
// FOLLOW-ONS — "what usually comes next" after an intervention.
//
// Shown as small "Next" chips on the intervention's line in the plan rail.
// One click adds; ignoring them costs nothing; NOTHING is ever added on its
// own. They carry the line's own site, so the X-ray after a reduction of
// the left wrist is already "Left wrist".
//
//   Closed reduction → Cast · Splint · Post-reduction X-ray (same site)
//   Aspiration       → the fluid tests ticked "sent for"
//   Wound closure    → Tetanus toxoid · Suture removal, planned on its day
//   Cast / splint    → Removal, planned at the review date · Follow-up then
//   Cast removal     → Physiotherapy referral · Range-of-motion exercises
//   Injection        → Post-injection advice
// ---------------------------------------------------------------------------

import type { BodyRegion } from "../../lib/body/anatomy";
import { clinicalSiteLabel, type SiteRef } from "../../lib/body/clinicalSite";
import type { AssessmentDetails } from "./assessmentFamilies";
import type { InterventionLine } from "./interventionPlan";

export type FollowOnAction =
    /** open the Perform modal for a catalogue intervention */
    | { kind: "intervention"; label: string; site: SiteRef | null; status?: "planned"; dueDays?: number | null; details?: AssessmentDetails }
    /** open the imaging modal already at this site */
    | { kind: "imaging"; label: string; site: SiteRef | null }
    | { kind: "test"; text: string }
    | { kind: "advice"; text: string }
    | { kind: "referral"; text: string }
    | { kind: "followUp"; days: number }
    /** open the add-medicine sheet on this name */
    | { kind: "medicine"; query: string };

export interface FollowOn {
    key: string;
    label: string;
    action: FollowOnAction;
}

const XRAY_BY_REGION: Partial<Record<BodyRegion, string>> = {
    shoulder: "X-Ray Shoulder",
    upper_arm: "X-Ray Humerus",
    elbow: "X-Ray Elbow",
    forearm: "X-Ray Forearm",
    wrist: "X-Ray Hand / Wrist",
    hand: "X-Ray Hand / Wrist",
    hip: "X-Ray Hip",
    thigh: "X-Ray Femur",
    knee: "X-Ray Knee",
    lower_leg: "X-Ray Leg (Tibia / Fibula)",
    ankle: "X-Ray Foot / Ankle",
    foot: "X-Ray Foot / Ankle",
};

const FLUID_TESTS: Record<string, string> = {
    "Cell count": "Synovial fluid - cell count",
    "Gram stain & culture": "Synovial fluid - Gram stain & culture",
    "Crystals": "Synovial fluid - crystal examination",
};

export function followOnsFor(line: InterventionLine): FollowOn[] {
    if (line.status === "planned") return [];
    const site = line.siteRef ?? null;
    const d = line.details ?? {};
    const out: FollowOn[] = [];

    switch (line.family) {
        case "reduction":
            out.push({ key: "cast", label: "Cast", action: { kind: "intervention", label: "Plaster of Paris (POP) cast", site } });
            out.push({ key: "splint", label: "Splint", action: { kind: "intervention", label: "Removable splint / brace application", site } });
            out.push({
                key: "xray", label: "Post-reduction X-ray",
                action: { kind: "imaging", label: (site && XRAY_BY_REGION[site.region]) || "X-Ray (Other Site)", site },
            });
            break;
        case "aspiration":
            for (const t of String(d.sentFor ?? "").split("|").filter(Boolean)) {
                if (FLUID_TESTS[t]) out.push({ key: `fluid-${t}`, label: FLUID_TESTS[t].replace("Synovial fluid - ", "Fluid "), action: { kind: "test", text: FLUID_TESTS[t] } });
            }
            break;
        case "closure": {
            out.push({ key: "tt", label: "Tetanus toxoid", action: { kind: "medicine", query: "Tetanus toxoid" } });
            if (d.method === "Sutures" || d.method === "Staples") {
                const days = Number(d.removalDays) || null;
                const what = d.method === "Staples" ? "Staple removal" : "Suture removal";
                out.push({
                    key: "removal", label: days ? `${what} on day ${days}` : `Plan ${what.toLowerCase()}`,
                    action: { kind: "intervention", label: "Cast / splint / suture removal", site, status: "planned", dueDays: days, details: { what } },
                });
            }
            break;
        }
        case "cast":
        case "splint": {
            const weeks = Number(line.family === "cast" ? d.reviewWeeks : d.weeks) || null;
            const what = line.family === "cast" ? "Cast removal" : "Splint / brace removal";
            out.push({
                key: "removal", label: weeks ? `${what} in ${weeks} wk` : `Plan ${what.toLowerCase()}`,
                action: { kind: "intervention", label: "Cast / splint / suture removal", site, status: "planned", dueDays: weeks ? weeks * 7 : null, details: { what } },
            });
            if (weeks) out.push({ key: "fu", label: `Follow-up in ${weeks} wk`, action: { kind: "followUp", days: weeks * 7 } });
            break;
        }
        case "removal":
            if (d.what === "Cast removal" || d.what === "Splint / brace removal") {
                out.push({ key: "physio", label: "Physiotherapy referral", action: { kind: "referral", text: "Physiotherapy" } });
                out.push({
                    key: "rom", label: "ROM exercises",
                    action: { kind: "advice", text: `Range-of-motion exercises${site ? ` for the ${clinicalSiteLabel(site).toLowerCase()}` : ""}` },
                });
            }
            break;
        case "injection":
            out.push({
                key: "advice", label: "Post-injection advice",
                action: { kind: "advice", text: "After the injection: rest the area for 24–48 hours and use ice for pain; return at once for fever, redness or increasing pain" },
            });
            break;
    }
    return out;
}
