// ---------------------------------------------------------------------------
// SPECIALTY PROFILE — which intent type the workspace elevates.
//
// Visual philosophy, "AREN Layout Philosophy": a specialty never introduces a
// new layout. It replaces the CONTENT inside an existing placeholder. The
// workspace has exactly one elevated slot — Primary Recommendation — and this
// module is the only thing that decides what goes in it.
//
//   General OPD    -> Medicines
//   Physiotherapy  -> Exercise Plans
//   Diagnostics    -> Investigations
//
// Three properties are load-bearing:
//
//  1. This is CONFIGURATION, not inference. The Synapse engine treats all six
//     intent types as equal peers and is not consulted here. Nothing in this
//     file can change a score, a rank, or which intents exist — swap the
//     profile and the same ranked list simply renders in a different order of
//     panels.
//
//  2. It is set ONCE, at onboarding, per facility. It is never relearned at
//     runtime and never derived from what the doctor happens to prescribe.
//     A workspace that quietly reorganised itself because a doctor ordered
//     four X-rays in a row would destroy the muscle memory the philosophy's
//     "Stable Layout" principle exists to protect.
//
//  3. The layout is identical for every profile. Only `primary` changes which
//     section is lifted out of the ranked column into the elevated slot; the
//     remaining types fall through to Clinical Suggestions in their declared
//     order. There is no per-specialty branch anywhere in the render tree.
//
// ── WHERE THIS SHOULD LIVE (flagged, not invented) ────────────────────────
// A facility's profile belongs on the facility. `hospitals` has no column for
// it today — the nearest field, `clinic_mode`, is solo/multi_doctor, an
// operational setting, not a clinical one. Rather than invent a schema, the
// assignment lives in `PROFILE_BY_FACILITY` below: a hand-maintained map that
// the clinic owner's onboarding would write to a `hospitals.specialty_profile`
// column once that column exists. `profileFor()` is already the single read
// point, so that migration is a one-line change here and nothing else.
// ---------------------------------------------------------------------------

import type { IntentType } from "../../lib/synapse/engine";
import type { MeasureFieldKey } from "../consult/measures";

export interface SpecialtySection {
    type: IntentType;
    /** what this facility calls this intent type */
    label: string;
}

export interface SpecialtyProfile {
    id: string;
    /** shown in the workspace footer — the doctor's confirmation of what loaded */
    label: string;
    /**
     * The intent type elevated into the Primary Recommendation placeholder.
     * Exactly one, always present.
     */
    primary: IntentType;
    /** the heading over the elevated slot */
    primaryLabel: string;
    /**
     * Everything else, in clinical reading order, rendered inside Clinical
     * Suggestions. `primary` must not appear here — it has its own slot.
     */
    sections: SpecialtySection[];
    /**
     * Which measurement fields this facility shows without being asked.
     *
     * The same configuration idea as `primary`, applied to the other place a
     * specialty differs: a General OPD wants temperature and blood pressure in
     * front of it, a physiotherapist wants a pain score and a range of motion,
     * and neither should have to look past the other's fields to reach their
     * own. The full catalogue lives in `consult/measures.ts` and every field is
     * always REACHABLE — this decides only what is visible before the doctor
     * asks, so a facility whose profile is wrong costs a click, never a
     * measurement.
     *
     * Order is NOT taken from here. Fields always render in catalogue order, so
     * the layout is identical for every facility (§3 above); this is a
     * membership test and nothing more.
     */
    measurements: MeasureFieldKey[];
}

/**
 * General OPD. The default for every facility that has not been configured,
 * because a general physician prescribing medicines is the case the product
 * ships for.
 */
export const GENERAL_OPD: SpecialtyProfile = {
    id: "general_opd",
    label: "General OPD",
    primary: "medicine",
    primaryLabel: "Medicines",
    sections: [
        { type: "finding", label: "Possible Finding" },
        { type: "test", label: "Investigation" },
        { type: "referral", label: "Referral" },
        { type: "advice", label: "Advice" },
        { type: "exercise", label: "Exercise" },
    ],
    // The five a general physician records on nearly every patient. Height,
    // blood group, pain scale and range of motion are one click away rather
    // than absent — see `measurements` above.
    measurements: ["bp", "pulse", "spo2", "temp", "weight"],
};

/**
 * Physiotherapy — the worked example from the philosophy doc. Exercise plans
 * are the output of the consultation; medicines drop to a supporting section.
 *
 * Note what did NOT change: the section list, the panel order, the plan
 * grouping, the accept interaction. That is the "configure, never redesign"
 * law holding.
 */
export const PHYSIOTHERAPY: SpecialtyProfile = {
    id: "physiotherapy",
    label: "Physiotherapy",
    primary: "exercise",
    primaryLabel: "Exercise Plans",
    sections: [
        { type: "finding", label: "Possible Finding" },
        { type: "test", label: "Investigation" },
        { type: "referral", label: "Referral" },
        { type: "medicine", label: "Medicine" },
        { type: "advice", label: "Advice" },
    ],
    // Pain and range of motion lead, because they are what a physiotherapy
    // consultation is measured in. BP stays visible: it is an exercise-safety
    // input here, not a general vital (SEVERE_HIGH_BP guards the whole
    // `exercise` type).
    measurements: ["painVas", "romPct", "bp", "pulse", "weight"],
};

/** Investigation-led practice — diagnostics, pre-op workup. */
export const DIAGNOSTICS: SpecialtyProfile = {
    id: "diagnostics",
    label: "Diagnostics",
    primary: "test",
    primaryLabel: "Investigations",
    sections: [
        { type: "finding", label: "Possible Finding" },
        { type: "referral", label: "Referral" },
        { type: "medicine", label: "Medicine" },
        { type: "advice", label: "Advice" },
        { type: "exercise", label: "Exercise" },
    ],
    // Pre-op workup asks for the body habitus a general OPD usually skips.
    measurements: ["bp", "pulse", "spo2", "temp", "weight", "height", "bloodGroup"],
};

export const PROFILES: Record<string, SpecialtyProfile> = {
    [GENERAL_OPD.id]: GENERAL_OPD,
    [PHYSIOTHERAPY.id]: PHYSIOTHERAPY,
    [DIAGNOSTICS.id]: DIAGNOSTICS,
};

/**
 * hospitalId -> profile id. The onboarding choice, one row per facility.
 *
 * Empty is correct today: every live facility is General OPD, which is the
 * fallback. An entry here is only needed to move a facility OFF the default.
 */
export const PROFILE_BY_FACILITY: Record<string, string> = {};

/**
 * The one read point. A facility with no assignment gets General OPD — a
 * missing configuration must never leave the Primary Recommendation slot
 * empty, because an empty slot is a workspace the doctor cannot use.
 */
export function profileFor(hospitalId: string | null | undefined): SpecialtyProfile {
    const id = hospitalId ? PROFILE_BY_FACILITY[hospitalId] : undefined;
    return (id && PROFILES[id]) || GENERAL_OPD;
}
