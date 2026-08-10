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
// A facility's profile lives on the facility: `hospitals.specialty_profile`
// (nullable text, checked against PROFILES' ids). `profileFor()` is the single
// read point. Nothing in this codebase writes that column yet — there is no
// onboarding UI for it — so every live facility reads as General OPD until
// one is set directly.
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

/**
 * Cardiology. Primary stays Medicines — the common case is a returning
 * patient on chronic cardiac drugs (beta-blockers, ACE/ARB, statins), not a
 * fresh workup. Investigations (ECG/echo) still lead the Clinical Suggestions
 * order, so nothing about the diagnostic workflow is buried; only which
 * section gets the elevated slot changes, same as every other profile.
 */
export const CARDIOLOGY: SpecialtyProfile = {
    id: "cardiology",
    label: "Cardiology",
    primary: "medicine",
    primaryLabel: "Medicines",
    sections: [
        { type: "finding", label: "Possible Finding" },
        { type: "test", label: "Investigation" },
        { type: "referral", label: "Referral" },
        { type: "advice", label: "Advice" },
        { type: "exercise", label: "Exercise" },
    ],
    // Weight matters here beyond general vitals — trending it is how fluid
    // overload in heart failure gets caught early. Pain/ROM stay excluded;
    // they're physiotherapy's signal, not cardiology's.
    measurements: ["bp", "pulse", "spo2", "weight", "height"],
};

/**
 * Paediatrics. Primary stays Medicines — the common OPD case (fever, cough,
 * feeding complaints) resolves with a prescription, same as General OPD.
 * What differs is measurements: weight and temperature lead, because growth
 * trending and fever are the two numbers a paediatric consult is anchored on,
 * ahead of the adult-first BP/pulse ordering.
 */
export const PEDIATRICS: SpecialtyProfile = {
    id: "pediatrics",
    label: "Paediatrics",
    primary: "medicine",
    primaryLabel: "Medicines",
    sections: [
        { type: "finding", label: "Possible Finding" },
        { type: "test", label: "Investigation" },
        { type: "referral", label: "Referral" },
        { type: "advice", label: "Advice" },
        { type: "exercise", label: "Exercise" },
    ],
    // Weight and temperature first — growth faltering and fever are the two
    // pediatric red flags a general OPD's BP-first ordering would bury.
    // Pain/ROM stay excluded; they're physiotherapy's signal, not paediatric.
    measurements: ["weight", "temp", "height", "pulse", "spo2"],
};

/**
 * Obstetrics & gynaecology. Primary stays Medicines — the everyday consult is
 * a symptomatic one (menstrual complaints, infection, contraception advice),
 * not a fresh diagnostic workup — but Investigations lead the suggestion order
 * because so much of this practice turns on a scan or a beta-hCG.
 *
 * This profile is the reason `lmp` and `gpla` exist as fields rather than as a
 * note: here they are asked EVERY time, not only when something on the chart
 * happens to make them relevant. Elsewhere they stay behind
 * RELEVANT_FIELDS — a general OPD doctor seeing a man should never be shown
 * an obstetric history box.
 */
export const GYNAECOLOGY: SpecialtyProfile = {
    id: "gynaecology",
    label: "Obstetrics & gynaecology",
    primary: "medicine",
    primaryLabel: "Medicines",
    sections: [
        { type: "test", label: "Investigation" },
        { type: "finding", label: "Possible Finding" },
        { type: "referral", label: "Referral" },
        { type: "advice", label: "Advice" },
        { type: "exercise", label: "Exercise" },
    ],
    // LMP first: it is the question this consultation opens with, and it dates
    // everything that follows. BP is not general-vitals padding here either —
    // it is the pre-eclampsia screen.
    measurements: ["lmp", "gpla", "bp", "weight", "pulse", "temp"],
};

export const PROFILES: Record<string, SpecialtyProfile> = {
    [GENERAL_OPD.id]: GENERAL_OPD,
    [PHYSIOTHERAPY.id]: PHYSIOTHERAPY,
    [DIAGNOSTICS.id]: DIAGNOSTICS,
    [CARDIOLOGY.id]: CARDIOLOGY,
    [PEDIATRICS.id]: PEDIATRICS,
    [GYNAECOLOGY.id]: GYNAECOLOGY,
};

/**
 * The one read point. Takes the facility's `hospitals.specialty_profile`
 * value. A facility with no assignment (null, or an id this build doesn't
 * recognise) gets General OPD — a missing configuration must never leave the
 * Primary Recommendation slot empty, because an empty slot is a workspace the
 * doctor cannot use.
 */
export function profileFor(specialtyProfileId: string | null | undefined): SpecialtyProfile {
    return (specialtyProfileId && PROFILES[specialtyProfileId]) || GENERAL_OPD;
}
