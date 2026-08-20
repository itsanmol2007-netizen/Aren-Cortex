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
// read point. Written today from Settings (`updateHospitalSpecialtyProfile`,
// lib/db/patients.ts) — a deliberate, temporary, doctor-facing exception to
// "set once at onboarding" for the solo-piloting phase, where there is no
// onboarding flow and no admin panel yet. A facility with nothing set reads
// as General OPD.
// ---------------------------------------------------------------------------

import type { IntentType } from "../../lib/synapse/engine";
import type { BetterWhen, MeasureFieldKey } from "../consult/measures";

/**
 * One line of a profile's trend priority list. See `SpecialtyProfile.trend`.
 */
export interface TrendEntry {
    key: MeasureFieldKey;
    /**
     * Overrides the field's own `betterWhen` where this specialty genuinely
     * disagrees with every other one. Only two fields need it today and both
     * are the same argument: body weight rising is growth in a child and
     * fluid overload in heart failure. The field itself declares `"none"` and
     * declines to judge; the specialty that DOES know says so here.
     */
    betterWhen?: BetterWhen;
}

export interface SpecialtySection {
    type: IntentType;
    /** what this facility calls this intent type */
    label: string;
}

/**
 * The specialty tools. `dental` and `body` (§14.7) are record and presentation
 * only — the engine never reads them.
 *
 * `growth` (§14.12) differs in one way worth being precise about: the WAZ
 * z-score behind it IS an engine input (it raises GROWTH_FALTERING). But that
 * derivation lives in `consultInput.ts` and runs on EVERY consult, gated only
 * on having a date of birth and a sex — never on this list. So turning the
 * chart off hides the panel and changes nothing about the ranking, which is
 * the correct split: a general physician seeing a malnourished child still
 * gets the failure-to-thrive workup ranked, they just aren't shown a growth
 * curve on every adult.
 *
 * `joints` (2026-08-17) is `JointMapCard.tsx` — physiotherapy's own tool,
 * NOT the dermatology body map with a relabel. It shares `body_sites`'
 * storage and `lib/body/anatomy.ts`'s figure with `body`, but its panel is
 * chip-first (wired to the same `onObservableToggle` the Case Sheet uses)
 * rather than free-text-first — see that file's header for why the two
 * screens needed to diverge rather than share one component with a branch
 * in it.
 */
export type ChartKind = "dental" | "body" | "growth" | "joints";

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
    /**
     * Measurements this profile records against a BODY SITE rather than in
     * General Measurements — physiotherapy's pain and range of motion.
     *
     * A separate axis from `measurements`, and not simply "the fields left
     * out of it": leaving a field out only stops it being a DEFAULT, and
     * `RELEVANT_FIELDS` puts it straight back the moment a matching chip
     * lands (KNEE_PAIN lights painVas and romPct). This says something
     * stronger — for this profile the field has no meaning without a site, so
     * no amount of clinical relevance should surface it in a card that cannot
     * carry one.
     *
     * Optional. Absent means "nothing about this profile is anatomical", which
     * is true of every profile but physiotherapy today.
     */
    anatomical?: MeasureFieldKey[];
    /**
     * Which of the two specialty charts (§14.7 — dental odontogram, body map)
     * this facility's consult screen shows. Empty for every profile that
     * doesn't need either.
     *
     * This reverses the tools' original design intent, on purpose, per Anmol
     * 2026-08-11: they shipped always-visible ("a general OPD doctor with an
     * occasional dental walk-in needs this exactly as much as a dedicated
     * dental clinic would"), but in practice that meant a dermatologist
     * scrolling past a tooth chart on every single patient. Precision won —
     * same "configuration, not inference" law as `primary` and `measurements`,
     * just a third axis. Neither chart is ever read by the engine either way;
     * this only changes what renders.
     */
    charts: ChartKind[];
    /**
     * Which measurements the longitudinal band trends for a RETURNING patient,
     * in priority order. Added 2026-08-16 for cortex-longitudinal-spec §3.1.
     *
     * ── It is a PRIORITY LIST, not a fixed set of three, and that is the
     *    whole design.
     *
     * The spec asks for "the 2–3 measurements that actually matter for that
     * specialty". For cardiology that is answerable in advance — it is blood
     * pressure and weight for every patient who walks in. For physiotherapy it
     * is not: the numbers that matter for a post-ACL knee and for a frozen
     * shoulder share only the pain score, and no facility-level setting can
     * know which patient is in the room.
     *
     * So the band reads DOWN this list and shows the first few entries that
     * this patient actually has two or more readings of. A knee patient's band
     * shows knee flexion; the shoulder patient in the next slot shows shoulder
     * abduction; nobody configures anything per patient, and a facility that
     * never records a field simply never sees it. `trend.ts` does the picking.
     *
     * Listing a field here does NOT make it visible on the consult screen —
     * that is `measurements` above, a separate axis. A field can be trended
     * without being on by default (a physio adds the joint they are treating)
     * and shown without being trended (blood group).
     *
     * An EMPTY list is a real answer, not an omission: it means this specialty
     * has no numeric trend worth drawing, and the band does not render at all.
     * Dentistry and dermatology are both deliberately empty — see their
     * profiles.
     */
    trend: TrendEntry[];
    /**
     * Which input surface this profile renders — the ONE branch in the render
     * tree that §14.19 sanctions, expressed as configuration instead of as an
     * `id === "general_opd"` comparison in App.tsx.
     *
     * ── Physiotherapy copied out, 2026-08-17
     *
     * Checked on 2026-08-16 and found not to need its own file — General
     * OPD's input half genuinely matched. Checked again on 2026-08-17 against
     * `docs/Cortex Specialties/physiotherapy-phase-1-plan.md`, and the answer
     * changed: a physiotherapy consultation asks how the symptom BEHAVES and
     * what the patient wants back, BEFORE the chip-based intake General OPD
     * opens with. That is not an extra field, it is a different order of
     * reasoning — the doctrine amendment this plan proposed states the test
     * precisely: the no-per-specialty-branch law holds where a specialty
     * needs a different INSTRUMENT inside the same shape (dentistry,
     * dermatology, paediatrics); it does not hold where the clinical
     * reasoning is itself a different shape. `"physio"` is the first
     * profile that answers the second way. `PhysioInputs.tsx` is
     * `GeneralOpdInputs.tsx`, copied, with `StoryCard` / `GoalsCard` ahead
     * of the command bar — the shared half below them stays literally the
     * same code, not a fork of it.
     *
     * `"soap"` is the older three-picker fallback (History / Symptoms /
     * Findings). Every profile that has not had its turn is still on it.
     */
    inputLayout: "case-sheet" | "physio" | "soap";
}

/**
 * Every per-joint range field, in catalogue order, as the tail of a
 * physiotherapy trend list. Only the joints a patient is actually being
 * treated for will have readings, so listing them all costs nothing and means
 * a shoulder course and a knee course both work with no configuration.
 */
const PHYSIO_JOINTS: TrendEntry[] = [
    { key: "cervicalRotL" }, { key: "cervicalRotR" },
    { key: "shoulderFlexL" }, { key: "shoulderFlexR" },
    { key: "shoulderAbdL" }, { key: "shoulderAbdR" },
    { key: "hipFlexL" }, { key: "hipFlexR" },
    { key: "kneeFlexL" }, { key: "kneeFlexR" },
    { key: "kneeExtLagL" }, { key: "kneeExtLagR" },
    { key: "ankleDorsiL" }, { key: "ankleDorsiR" },
    { key: "kneeGirthL" }, { key: "kneeGirthR" },
];

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
    charts: [],
    // General OPD is the profile this matters LEAST for — the field research
    // behind the longitudinal spec found general practices largely satisfied
    // with paper, and an acute OPD visit is an episode rather than a course.
    // What a returning general patient does have is a chronic thread, so the
    // list is the chronic-disease numbers and nothing else. Most patients will
    // have two readings of none of them and see no band at all, which is the
    // correct outcome, not a failure.
    trend: [
        { key: "bp" },
        { key: "weight" },
        { key: "hba1c" },
        { key: "glucoseFasting" },
    ],
    inputLayout: "case-sheet",
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
        // Therapy leads, and this one line is the whole of "make in-clinic
        // treatment the first thing a physiotherapist sees". Nothing below is
        // hidden — investigations, referrals and medicines are exactly where
        // they were, one position lower, with their own search boxes intact.
        // Doctrine: ranking decides what is OFFERED, never what is REACHABLE.
        //
        // It sits BESIDE the elevated Exercise Plans slot rather than taking
        // it, because the exercise programme is the thing that gets progressed
        // between sessions and the modalities are relatively stable for a
        // given condition. If that turns out to be backwards in real use, the
        // fix is to swap `primary` — one word, no layout change.
        { type: "modality", label: "Therapy" },
        // Impairments lead the findings, 2026-08-18 (Phase 4). A
        // physiotherapist's impression is "what is limiting this person" —
        // reduced range, weakness, guarding — and the pathology behind it
        // is frequently already known, or not theirs to name. So the thing
        // they treat is ranked above the thing they may never diagnose.
        // Nothing is hidden: "Possible Finding" is exactly where it was,
        // one position lower, with its own search intact. Doctrine's rule
        // that ranking decides what is OFFERED, never what is REACHABLE.
        { type: "impairment", label: "Impairment" },
        { type: "finding", label: "Possible Finding" },
        { type: "test", label: "Investigation" },
        { type: "referral", label: "Referral" },
        { type: "medicine", label: "Medicine" },
        { type: "advice", label: "Advice" },
    ],
    // ── General measurements are GENERAL measurements (2026-08-20)
    //
    // This list read `["painVas", "romPct", "bp", "pulse", "weight"]` until
    // Anmol's second review, on the reasoning that pain and range are what a
    // physiotherapy consultation is measured in. True, and beside the point:
    // both of those are properties of a SITE, and this card has nowhere to put
    // one. "ROM 100%" beside a blood pressure cannot say which joint, and a
    // patient with a left shoulder and a right knee — the ordinary case, not
    // the edge one — has two ranges and one field to put them in.
    //
    // So they moved to where a site exists: `regionPainKey` and the range grid
    // inside the body-map examination, both of which carry `side` in their own
    // column. Neither field is deleted from the catalogue — `romPct` still
    // holds ROM_PCT's live `measurement_rules`, and both stay reachable through
    // Add Measurement for a facility that genuinely wants one number. Doctrine:
    // ranking decides what is OFFERED, never what is REACHABLE.
    //
    // BP stays, and is the reason this list is not simply General OPD's: it is
    // an exercise-safety input here rather than a routine vital, because
    // SEVERE_HIGH_BP guards the whole `exercise` type.
    measurements: ["bp", "pulse", "spo2", "temp", "weight"],
    // The two that moved out, named so they cannot drift back in through
    // `RELEVANT_FIELDS`. Both still exist in the catalogue and both are still
    // recorded — `regionPainKey` and the range grid, inside the body-map
    // examination, where each reading carries the joint and the side it was
    // taken on.
    anatomical: ["painVas", "romPct"],
    // `JointMapCard`, added 2026-08-17 — replaces dermatology's `BodyMapCard`,
    // which physiotherapy borrowed at first (§14.24) and which Anmol correctly
    // called out: clicking a joint opened a free-text box with no chip Synapse
    // could rank. Same WHERE question, chip-first answer. Renders in the
    // Assessment's second column (see ConditionsCard's `sideSlot`), same slot
    // `body` used, because for this profile marking the site IS part of
    // forming the assessment.
    charts: ["joints"],
    // The profile the band was built for. A physiotherapy course is two or
    // three sessions a week for weeks, and the spec is blunt about what that
    // means: the trend across sessions IS the record. Pain and overall
    // function lead because every patient has them; the joints follow and
    // sort themselves out per patient (see `trend` on the interface).
    trend: [
        { key: "painVas" },
        // The three validated outcome instruments, one per body region —
        // LEFS (lower limb), ODI (low back), QuickDASH (upper limb). All
        // three declare an MCID, so the band's verdict on them is
        // clinically meaningful change rather than any movement at all
        // (Phase 6). A patient only ever has readings of the one their
        // physiotherapist actually uses, and `trend.ts` picks whichever
        // that is — the same per-patient selection the joints below rely on.
        { key: "lefs" },
        { key: "odi" },
        { key: "quickdash" },
        ...PHYSIO_JOINTS,
        // Last resort. `romPct` is one number for "how restricted", which is
        // what a non-physiotherapy facility records; a physio who has been
        // using the degree fields should never see this one reached.
        { key: "romPct" },
    ],
    // `"physio"` since 2026-08-17 — its own copy of the input surface,
    // Story and Goals ahead of the command bar. See `inputLayout`.
    inputLayout: "physio",
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
    // Pre-op workup asks for the body habitus a general OPD usually skips —
    // and a fasting sugar, which is standard on essentially every pre-op and
    // health-check panel rather than something the chart has to argue for.
    measurements: ["bp", "pulse", "spo2", "temp", "weight", "height", "bloodGroup", "glucoseFasting"],
    charts: [],
    // A workup practice's returning patient is being re-tested, so the panel
    // values lead and the vitals follow.
    trend: [
        { key: "glucoseFasting" },
        { key: "hba1c" },
        { key: "bp" },
        { key: "weight" },
    ],
    // Not its turn yet — still the three-picker fallback. See `inputLayout`.
    inputLayout: "soap",
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
    charts: [],
    // Visits are weeks to months apart and the spec wants the trend to span
    // that, not just the last few readings — `trend.ts` puts the points on a
    // real time axis for exactly this profile's sake.
    //
    // The weight override is the whole reason `TrendEntry.betterWhen` exists.
    // Trending weight UP in a heart failure patient is fluid, and catching it
    // early is the point of weighing them at all — so here, and nowhere else,
    // a rise is the thing to flag. The field itself declares "none" because
    // paediatrics reads the identical number the opposite way.
    trend: [
        { key: "bp" },
        { key: "weight", betterWhen: "lower" },
        { key: "pulse" },
        { key: "spo2" },
    ],
    // Not its turn yet — still the three-picker fallback. See `inputLayout`.
    inputLayout: "soap",
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
    //
    // Respiratory rate is on by default here and nowhere else: counting
    // breaths is the first thing WHO IMNCI asks for in a child with cough,
    // and fast breathing is the sign that separates pneumonia from a cold.
    // An adult OPD reaches for it only when the chart asks (RELEVANT_FIELDS);
    // a paediatrician should never have to go looking.
    // Growth is only meaningful as a curve, so weight and height lead and
    // both are explicitly "higher is better" — the opposite override to
    // cardiology's, on the same field, which is why the field itself refuses
    // to have an opinion.
    //
    // Note this band is NOT the growth chart and does not replace it: the
    // chart reads weight against age and sex through the WHO standards, which
    // is the clinical instrument. This is the same two numbers in the plain
    // "up 1.2 kg across 4 visits" form, above the fold, for the visits where
    // nobody opens the chart.
    trend: [
        { key: "weight", betterWhen: "higher" },
        { key: "height", betterWhen: "higher" },
        { key: "temp" },
    ],
    measurements: ["weight", "temp", "height", "pulse", "respRate", "spo2"],
    // The growth chart is the paediatric instrument, and unlike the other
    // two it IS read by the engine — weight-for-age becomes WAZ, which
    // raises GROWTH_FALTERING. See GrowthChartCard.
    charts: ["growth"],
    // Not its turn yet — still the three-picker fallback. See `inputLayout`.
    inputLayout: "soap",
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
    charts: [],
    // Antenatal follow-up is the returning case here: blood pressure across
    // visits is the pre-eclampsia watch, and weight gain is expected rather
    // than concerning — the third specialty to read this one field its own
    // way.
    trend: [
        { key: "bp" },
        { key: "weight", betterWhen: "higher" },
        { key: "pulse" },
    ],
    // Not its turn yet — still the three-picker fallback. See `inputLayout`.
    inputLayout: "soap",
};

/**
 * Dentistry. Primary stays Medicines — a dental consult still ends in a
 * prescription (analgesic, and amoxicillin+metronidazole when it's an
 * abscess, §14.8) — but the record a dentist actually reaches for first is
 * the odontogram, not the ranked list, so the dental chart is what this
 * profile adds over General OPD.
 */
export const DENTISTRY: SpecialtyProfile = {
    id: "dentistry",
    label: "Dentistry",
    primary: "medicine",
    primaryLabel: "Medicines",
    sections: [
        { type: "finding", label: "Possible Finding" },
        { type: "test", label: "Investigation" },
        { type: "referral", label: "Referral" },
        { type: "advice", label: "Advice" },
        { type: "exercise", label: "Exercise" },
    ],
    // Temperature and pulse matter here specifically for a spreading facial
    // abscess (§14.8's Ludwig's angina note) — this is not the general OPD
    // vitals set copied over, it's the two numbers that show systemic spread.
    measurements: ["temp", "pulse", "bp", "weight"],
    charts: ["dental"],
    // DELIBERATELY EMPTY, and this is a decision rather than a gap.
    //
    // Dentistry has the strongest longitudinal record in the product and the
    // weakest case for a numeric trend: the odontogram IS the record, a tooth
    // accumulates state over years, and what a dentist opening a returning
    // patient wants is "what is started and not finished", not "temperature
    // 99 → 98". The spec says exactly this (§5, Dentistry). Trending the
    // abscess vitals would be answering a question nobody asked, so the band
    // does not render for this profile and the chart stays the record.
    //
    // What this profile actually wants is an unfinished-treatment summary
    // built on the dental chart's own state. That is real work and it is not
    // this pass.
    trend: [],
    // Not its turn yet — still the three-picker fallback. See `inputLayout`.
    inputLayout: "soap",
};

/**
 * Dermatology. Primary stays Medicines — topical and oral prescriptions are
 * the output — with the body map as the record a dermatologist reaches for:
 * site changes steroid potency and distribution is itself diagnostic (§14.7).
 */
export const DERMATOLOGY: SpecialtyProfile = {
    id: "dermatology",
    label: "Dermatology",
    primary: "medicine",
    primaryLabel: "Medicines",
    sections: [
        { type: "finding", label: "Possible Finding" },
        { type: "test", label: "Investigation" },
        { type: "referral", label: "Referral" },
        { type: "advice", label: "Advice" },
        { type: "exercise", label: "Exercise" },
    ],
    // Minimal general vitals — a dermatology consult rarely turns on BP or
    // pulse, but pregnancy status (isotretinoin, class 4's teratogen guard)
    // means weight and general fitness-for-treatment stay reachable by
    // default rather than buried behind "Add Measurement".
    measurements: ["weight", "bp"],
    charts: ["body"],
    // Empty for the same reason as dentistry, with a different instrument:
    // dermatological progress is visual, and the honest comparison is last
    // visit's photo against today's for the same body site (spec §5). A
    // weight trend would be a number offered because it exists rather than
    // because it answers anything. The body map indexing prior photos is the
    // real version of this and it is its own pass.
    trend: [],
    // Not its turn yet — still the three-picker fallback. See `inputLayout`.
    inputLayout: "soap",
};

export const PROFILES: Record<string, SpecialtyProfile> = {
    [GENERAL_OPD.id]: GENERAL_OPD,
    [PHYSIOTHERAPY.id]: PHYSIOTHERAPY,
    [DIAGNOSTICS.id]: DIAGNOSTICS,
    [CARDIOLOGY.id]: CARDIOLOGY,
    [PEDIATRICS.id]: PEDIATRICS,
    [GYNAECOLOGY.id]: GYNAECOLOGY,
    [DENTISTRY.id]: DENTISTRY,
    [DERMATOLOGY.id]: DERMATOLOGY,
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
