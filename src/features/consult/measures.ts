// ---------------------------------------------------------------------------
// MEASUREMENTS — the field catalogue, and the two things that decide which of
// them a doctor actually sees.
//
// This file is data, not behaviour. `MeasurementsCard` renders whatever is in
// MEASURE_FIELDS; `specialtyProfile.ts` says which are on by default at this
// facility; RELEVANT_FIELDS says which one the chart has just made worth
// filling in. Nothing here knows how any of it is drawn.
//
// ── Why the catalogue lives here and not in `Vitals` ──────────────────────
// `Vitals` is a storage shape — the keys written into `visits.vitals`. A field
// needs four more things before it can be rendered or scored: a label, a unit,
// a measure key for the engine, and whether it is a number at all. Deriving any
// of those from the property name is how a UI ends up guessing that `temp` is
// Celsius. Every one of them is declared, once, below.
// ---------------------------------------------------------------------------

import type { Vitals } from "../../types";

export type MeasureFieldKey = keyof Vitals;

/**
 * `bp` is its own input kind because it is ONE control and TWO measurements.
 * The handoff (§2.4) is blunt about this: written as a single "170/100" row it
 * matches no rule and blood pressure silently never fires. The split happens in
 * `consultInput.ts`; this flag is what tells the card to draw two boxes.
 *
 * `select` exists for blood group — the only measurement in the catalogue that
 * is not a number, and therefore the only one that lands in
 * `visit_measurements.value_text` rather than `value_num`.
 *
 * `date` exists for the LMP. A date is not what the engine wants — "12 June"
 * means nothing to a rule — so `consultInput.ts` carries the date through for
 * the record and derives LMP_DAYS from it for the ranking. The doctor enters
 * the thing they actually know; the engine gets the thing it can reason about.
 *
 * `gpla` is the obstetric history, and follows `bp`'s precedent exactly: one
 * control, four measurements. G-P-L-A is written and spoken as a single unit,
 * so it is entered as one, but Gravida, Para, Living and Abortions are four
 * separate numbers to anything downstream.
 */
export type MeasureInputKind = "number" | "bp" | "select" | "date" | "gpla";

/**
 * Which way is better, for anything that reads a series of this measurement
 * over time (`trend.ts`, and the "vs last" line under a reading).
 *
 * `"none"` is the default and it is not a cop-out — it is the honest answer
 * for most of the catalogue. A knee girth falling means swelling settled; a
 * thigh girth rising means muscle came back. Body weight is the same argument
 * one level up: down is good in heart failure and bad in a toddler. Where the
 * meaning genuinely depends on the specialty, the field declines to judge and
 * `SpecialtyProfile.trend` overrides it — see that file. A `"none"` series
 * still shows its numbers and its change; it just draws no verdict, which is
 * doctrine §5's "ranking is a safety property, never a verdict" applied to a
 * trend arrow.
 *
 * `"band"` means the field has a normal range and the verdict is distance
 * from it. It reuses `warn` rather than restating the thresholds, so the
 * amber cell and the trend arrow can never disagree about what "out of range"
 * means — the §14.22 lesson (when two things must agree, make one read the
 * other) applied here.
 */
export type BetterWhen = "lower" | "higher" | "band" | "none";

/**
 * Sections in the Add Measurement menu. The catalogue is 30-odd fields now
 * that per-joint ROM exists, and a flat list of that length is a list nobody
 * reads to the end of. Order here is the order the menu prints its headings.
 */
export type MeasureGroup = "vitals" | "body" | "metabolic" | "musculoskeletal" | "obstetric";

export interface MeasureField {
    key: MeasureFieldKey;
    /** what the card prints, unit included — never left to the doctor to type */
    label: string;
    placeholder: string;
    kind: MeasureInputKind;
    /** choices for `kind: "select"` */
    options?: string[];
    /**
     * Short accessible name, without the unit. Used for the relevance tooltip
     * ("Relevant to Fever") where repeating "(°F)" reads as noise.
     */
    shortLabel: string;
    /**
     * The unit on its own, for the two print surfaces — which draw the label
     * and the unit as separate pieces of type, so they cannot take `label`'s
     * "Temp (°F)" form. Empty string for the fields that have no unit (blood
     * group, LMP, G-P-L-A).
     */
    unit: string;
    /** what ReviewModal calls this — room for a real word */
    printLabel: string;
    /**
     * What the printed prescription calls this. Shorter, and in the vocabulary
     * an Indian Rx already uses: FBS, not "Fasting Glucose".
     */
    rxLabel: string;
    /** which section of the Add Measurement menu this sits in */
    group: MeasureGroup;
    /** which direction counts as improvement — see BetterWhen */
    betterWhen: BetterWhen;
    /**
     * The smallest change worth calling a change. Below this a series reads as
     * steady rather than as movement, so a 70.0 → 70.2 kg weighing does not
     * get reported to a doctor as deterioration. Omitted means any difference
     * counts.
     */
    trendNoise?: number;
    warn?: (v: string) => boolean;
    warnText?: string;
}

const numberInRange = (lo: number, hi: number) => (v: string) => {
    const n = Number.parseFloat(v);
    return Number.isFinite(n) && (n < lo || n > hi);
};

/**
 * A typo guard, not a clinical one. Used by the per-joint range fields, where
 * a below-normal reading is the reason the patient is in the room and warning
 * on it would be noise — see the block comment above those fields.
 */
const implausible = (hi: number) => (v: string) => {
    const n = Number.parseFloat(v);
    return Number.isFinite(n) && (n < 0 || n > hi);
};

/**
 * Every measurement Cortex can take, in the order a card renders them.
 *
 * The order is fixed for every facility. A specialty changes which of these are
 * VISIBLE, never where they sit — the philosophy doc's "Stable Layout" rule.
 */
export const MEASURE_FIELDS: MeasureField[] = [
    {
        key: "bp", label: "BP (mmHg)", shortLabel: "Blood pressure",
        unit: "mmHg", printLabel: "BP", rxLabel: "BP",
        group: "vitals", betterWhen: "band", trendNoise: 5,
        placeholder: "120", kind: "bp",
        warn: (v) => {
            const sys = Number.parseInt(String(v).split("/")[0] ?? "", 10);
            return Number.isFinite(sys) && (sys > 140 || sys < 90);
        },
        warnText: "Systolic outside 90–140 mmHg",
    },
    {
        key: "pulse", label: "Pulse (bpm)", shortLabel: "Pulse",
        unit: "bpm", printLabel: "Pulse", rxLabel: "Pulse",
        group: "vitals", betterWhen: "band", trendNoise: 4,
        placeholder: "72", kind: "number",
        warn: numberInRange(50, 100), warnText: "Outside 50–100 bpm",
    },
    {
        // Sits with the cardiorespiratory numbers, where it is counted.
        //
        // ⚠ THE WARNING BAND HERE IS ADULT-ONLY, AND THAT IS A KNOWN LIMIT.
        // Normal respiratory rate is profoundly age-dependent — WHO IMNCI
        // calls breathing "fast" at ≥60/min under 2 months, ≥50 to 12 months,
        // ≥40 to 5 years and ≥30 above that, and fast breathing is THE
        // clinical sign of childhood pneumonia. A healthy newborn breathing
        // 45/min is normal and would trip the adult band below.
        //
        // `MeasureField.warn` receives only the typed string — it cannot see
        // the patient's age — so an age-banded threshold is not expressible
        // today. Rather than warn wrongly on every infant, the band is stated
        // as adult and the paediatric thresholds are left to the doctor. Fixing
        // this properly means giving `warn` the patient context, which is the
        // same change the paediatric growth work needs.
        key: "respRate", label: "Resp Rate (/min)", shortLabel: "Respiratory rate",
        unit: "/min", printLabel: "Resp Rate", rxLabel: "RR",
        group: "vitals", betterWhen: "band", trendNoise: 2,
        placeholder: "16", kind: "number",
        // Upper bound matches the measurement rule exactly (RR ≥ 22 raises
        // BREATHLESSNESS), so the amber state and the engine never disagree.
        warn: numberInRange(12, 21),
        warnText: "Outside 12–21 /min for an adult — paediatric normals are much higher",
    },
    {
        key: "spo2", label: "SpO₂ (%)", shortLabel: "SpO₂",
        unit: "%", printLabel: "SpO₂", rxLabel: "SpO₂",
        group: "vitals", betterWhen: "band", trendNoise: 1,
        placeholder: "98", kind: "number",
        warn: (v) => { const n = Number.parseFloat(v); return Number.isFinite(n) && n < 95; },
        warnText: "Below 95%",
    },
    {
        // °F is printed rather than assumed. The rule base is Celsius and the
        // conversion downstream is a magnitude heuristic, so a doctor who types
        // 38 meaning °C is still read correctly — but stating the unit is the
        // cheapest way to stop them having to rely on that.
        key: "temp", label: "Temp (°F)", shortLabel: "Temperature",
        unit: "°F", printLabel: "Temp", rxLabel: "Temp",
        group: "vitals", betterWhen: "band", trendNoise: 0.4,
        placeholder: "98.6", kind: "number",
        warn: numberInRange(96, 99.5), warnText: "Outside 96–99.5 °F",
    },
    {
        // `betterWhen: "none"` is load-bearing here, not laziness. Weight
        // rising is growth in a child and fluid overload in heart failure —
        // opposite verdicts from one number. The field refuses to judge and
        // PEDIATRICS / CARDIOLOGY each override it in their own `trend` list.
        key: "weight", label: "Body Weight (kg)", shortLabel: "Body weight",
        unit: "kg", printLabel: "Weight", rxLabel: "Wt",
        group: "body", betterWhen: "none", trendNoise: 0.5,
        placeholder: "—", kind: "number",
    },
    {
        key: "height", label: "Height (cm)", shortLabel: "Height",
        unit: "cm", printLabel: "Height", rxLabel: "Ht",
        group: "body", betterWhen: "none", trendNoise: 0.5,
        placeholder: "—", kind: "number",
    },
    {
        key: "bloodGroup", label: "Blood Group", shortLabel: "Blood group",
        unit: "", printLabel: "Blood Group", rxLabel: "Blood Grp",
        group: "body", betterWhen: "none",
        placeholder: "—", kind: "select",
        options: ["A+", "A−", "B+", "B−", "AB+", "AB−", "O+", "O−"],
    },
    // ── Glycaemic panel (added 2026-08-11) ──────────────────────────────
    // mg/dL, not mmol/L: every Indian lab and glucometer reports mg/dL, and
    // the measurement_rules were authored in those units too (fasting ≥126,
    // random ≥200 — the ADA diagnostic thresholds). A unit toggle would be
    // the kind of ambiguity `temp`'s °F/°C heuristic exists to apologise for;
    // there is no reason to import that problem here.
    //
    // Three fields rather than one "sugar" box because the THRESHOLD IS THE
    // MEANING: 150 mg/dL is diabetic fasting and unremarkable post-meal. One
    // field would have to guess which, and guessing wrong is a wrong diagnosis
    // in both directions.
    {
        key: "glucoseFasting", label: "Fasting Glucose (mg/dL)", shortLabel: "Fasting glucose",
        unit: "mg/dL", printLabel: "Fasting Glucose", rxLabel: "FBS",
        group: "metabolic", betterWhen: "band", trendNoise: 5,
        placeholder: "—", kind: "number",
        warn: numberInRange(70, 125),
        warnText: "≥126 is the diabetic range; under 70 is hypoglycaemia",
    },
    {
        key: "glucoseRandom", label: "Random / PP Glucose (mg/dL)", shortLabel: "Random glucose",
        unit: "mg/dL", printLabel: "Random Glucose", rxLabel: "RBS",
        group: "metabolic", betterWhen: "band", trendNoise: 5,
        placeholder: "—", kind: "number",
        warn: numberInRange(70, 199),
        warnText: "≥200 is the diabetic range; under 70 is hypoglycaemia",
    },
    {
        key: "hba1c", label: "HbA1c (%)", shortLabel: "HbA1c",
        unit: "%", printLabel: "HbA1c", rxLabel: "HbA1c",
        // Lower rather than band: HbA1c has no meaningful low end to warn
        // about (see `warn` below), so the only direction worth reporting on
        // a patient being managed is downward.
        group: "metabolic", betterWhen: "lower", trendNoise: 0.2,
        placeholder: "—", kind: "number",
        // No low-end warning: a low HbA1c is not a clinical event the way a
        // low glucose is. 5.7–6.4 is prediabetic and 6.5 is the diagnostic
        // cut-off, which is what the rule fires on.
        warn: (v) => { const n = Number.parseFloat(v); return Number.isFinite(n) && n >= 5.7; },
        warnText: "5.7–6.4% is prediabetic; ≥6.5% is the diabetic range",
    },
    {
        // Deliberately before the obstetric pair: those two are the only
        // fields in the catalogue that are sex-specific, and the "Stable
        // Layout" rule means they hold this position whether or not the
        // facility is a gynaecology one.
        key: "painVas", label: "Pain (0–10)", shortLabel: "Pain scale",
        unit: "/10", printLabel: "Pain", rxLabel: "Pain",
        group: "musculoskeletal", betterWhen: "lower", trendNoise: 1,
        placeholder: "0", kind: "number",
        warn: (v) => { const n = Number.parseFloat(v); return Number.isFinite(n) && n >= 7; },
        warnText: "Severe pain",
    },
    {
        // Kept, deliberately, now that per-joint degrees exist below. This is
        // the key `measurement_rules` is authored against (ROM_PCT), and it is
        // the only ROM field a NON-physiotherapy facility would ever want —
        // one number for "how restricted is this patient". The degree fields
        // are the record and the trend; this stays the engine's input. Deleting
        // it would leave ROM_PCT's live rules with nothing feeding them, which
        // is the exact failure `check:measures` exists to catch.
        key: "romPct", label: "Range of Motion (%)", shortLabel: "Range of motion",
        unit: "%", printLabel: "ROM", rxLabel: "ROM",
        group: "musculoskeletal", betterWhen: "higher", trendNoise: 5,
        placeholder: "100", kind: "number",
        warn: (v) => { const n = Number.parseFloat(v); return Number.isFinite(n) && n < 50; },
        warnText: "Under half of expected range",
    },

    // ── Physiotherapy: function and per-joint range ──────────────────────
    // Added 2026-08-16 for the longitudinal band. A physiotherapy course is a
    // small set of numbers repeated at high frequency, and the trend across
    // sessions IS the record (cortex-longitudinal-spec §5) — so these exist to
    // be TRENDED first and scored second. Only `painVas` and `romPct` above
    // carry measurement_rules; nothing below feeds the engine today, and that
    // is fine here in a way it explicitly was NOT for the glucose panel: these
    // are recorded, printed and trended, so a doctor sees every number they
    // enter. They are not placeholders waiting for content.
    //
    // ── Why left and right are separate fields
    // A knee flexion of 108° means nothing without a side, and a physio
    // treating one knee needs to watch that knee, not an average of two. Two
    // fields is the honest shape and it is what the doctor already writes.
    //
    // ── Why almost none of them warn
    // A below-normal range is the REASON the patient is in the room. Amber on
    // every reading of every session would be noise, and doctrine §8 is
    // explicit that amber means "the value you entered is out of range", not
    // "this patient is unwell". So these warn only where a number is
    // physically impossible — i.e. a typo — and stay quiet otherwise.
    {
        key: "lefs", label: "LEFS (/80)", shortLabel: "Lower extremity function",
        unit: "/80", printLabel: "LEFS", rxLabel: "LEFS",
        group: "musculoskeletal", betterWhen: "higher", trendNoise: 3,
        placeholder: "—", kind: "number",
        warn: implausible(80), warnText: "The LEFS runs 0–80",
    },
    {
        key: "cervicalRotL", label: "Cervical Rotation L (°)", shortLabel: "Cervical rotation (L)",
        unit: "°", printLabel: "Cervical Rot L", rxLabel: "Cerv Rot L",
        group: "musculoskeletal", betterWhen: "higher", trendNoise: 5,
        placeholder: "—", kind: "number",
        warn: implausible(100), warnText: "Check the number — over 100° is not anatomically possible",
    },
    {
        key: "cervicalRotR", label: "Cervical Rotation R (°)", shortLabel: "Cervical rotation (R)",
        unit: "°", printLabel: "Cervical Rot R", rxLabel: "Cerv Rot R",
        group: "musculoskeletal", betterWhen: "higher", trendNoise: 5,
        placeholder: "—", kind: "number",
        warn: implausible(100), warnText: "Check the number — over 100° is not anatomically possible",
    },
    {
        key: "shoulderFlexL", label: "Shoulder Flexion L (°)", shortLabel: "Shoulder flexion (L)",
        unit: "°", printLabel: "Shoulder Flex L", rxLabel: "Sh Flex L",
        group: "musculoskeletal", betterWhen: "higher", trendNoise: 5,
        placeholder: "—", kind: "number",
        warn: implausible(190), warnText: "Check the number — over 190° is not anatomically possible",
    },
    {
        key: "shoulderFlexR", label: "Shoulder Flexion R (°)", shortLabel: "Shoulder flexion (R)",
        unit: "°", printLabel: "Shoulder Flex R", rxLabel: "Sh Flex R",
        group: "musculoskeletal", betterWhen: "higher", trendNoise: 5,
        placeholder: "—", kind: "number",
        warn: implausible(190), warnText: "Check the number — over 190° is not anatomically possible",
    },
    {
        key: "shoulderAbdL", label: "Shoulder Abduction L (°)", shortLabel: "Shoulder abduction (L)",
        unit: "°", printLabel: "Shoulder Abd L", rxLabel: "Sh Abd L",
        group: "musculoskeletal", betterWhen: "higher", trendNoise: 5,
        placeholder: "—", kind: "number",
        warn: implausible(190), warnText: "Check the number — over 190° is not anatomically possible",
    },
    {
        key: "shoulderAbdR", label: "Shoulder Abduction R (°)", shortLabel: "Shoulder abduction (R)",
        unit: "°", printLabel: "Shoulder Abd R", rxLabel: "Sh Abd R",
        group: "musculoskeletal", betterWhen: "higher", trendNoise: 5,
        placeholder: "—", kind: "number",
        warn: implausible(190), warnText: "Check the number — over 190° is not anatomically possible",
    },
    {
        key: "hipFlexL", label: "Hip Flexion L (°)", shortLabel: "Hip flexion (L)",
        unit: "°", printLabel: "Hip Flex L", rxLabel: "Hip Flex L",
        group: "musculoskeletal", betterWhen: "higher", trendNoise: 5,
        placeholder: "—", kind: "number",
        warn: implausible(150), warnText: "Check the number — over 150° is not anatomically possible",
    },
    {
        key: "hipFlexR", label: "Hip Flexion R (°)", shortLabel: "Hip flexion (R)",
        unit: "°", printLabel: "Hip Flex R", rxLabel: "Hip Flex R",
        group: "musculoskeletal", betterWhen: "higher", trendNoise: 5,
        placeholder: "—", kind: "number",
        warn: implausible(150), warnText: "Check the number — over 150° is not anatomically possible",
    },
    {
        key: "kneeFlexL", label: "Knee Flexion L (°)", shortLabel: "Knee flexion (L)",
        unit: "°", printLabel: "Knee Flex L", rxLabel: "Knee Flex L",
        group: "musculoskeletal", betterWhen: "higher", trendNoise: 5,
        placeholder: "—", kind: "number",
        warn: implausible(160), warnText: "Check the number — over 160° is not anatomically possible",
    },
    {
        key: "kneeFlexR", label: "Knee Flexion R (°)", shortLabel: "Knee flexion (R)",
        unit: "°", printLabel: "Knee Flex R", rxLabel: "Knee Flex R",
        group: "musculoskeletal", betterWhen: "higher", trendNoise: 5,
        placeholder: "—", kind: "number",
        warn: implausible(160), warnText: "Check the number — over 160° is not anatomically possible",
    },
    {
        // The one ROM field where LOWER is the win: extension lag is the
        // shortfall from a straight knee, so zero is the goal. Getting this
        // backwards would show an ACL patient improving while their knee
        // stiffened — the exact failure the spec's edge-case list warns about.
        key: "kneeExtLagL", label: "Knee Extension Lag L (°)", shortLabel: "Knee extension lag (L)",
        unit: "°", printLabel: "Knee Ext Lag L", rxLabel: "Knee Lag L",
        group: "musculoskeletal", betterWhen: "lower", trendNoise: 2,
        placeholder: "—", kind: "number",
        warn: implausible(60), warnText: "Check the number — a lag over 60° is implausible",
    },
    {
        key: "kneeExtLagR", label: "Knee Extension Lag R (°)", shortLabel: "Knee extension lag (R)",
        unit: "°", printLabel: "Knee Ext Lag R", rxLabel: "Knee Lag R",
        group: "musculoskeletal", betterWhen: "lower", trendNoise: 2,
        placeholder: "—", kind: "number",
        warn: implausible(60), warnText: "Check the number — a lag over 60° is implausible",
    },
    {
        key: "ankleDorsiL", label: "Ankle Dorsiflexion L (°)", shortLabel: "Ankle dorsiflexion (L)",
        unit: "°", printLabel: "Ankle Dorsi L", rxLabel: "Ank Dorsi L",
        group: "musculoskeletal", betterWhen: "higher", trendNoise: 3,
        placeholder: "—", kind: "number",
        warn: implausible(45), warnText: "Check the number — over 45° is not anatomically possible",
    },
    {
        key: "ankleDorsiR", label: "Ankle Dorsiflexion R (°)", shortLabel: "Ankle dorsiflexion (R)",
        unit: "°", printLabel: "Ankle Dorsi R", rxLabel: "Ank Dorsi R",
        group: "musculoskeletal", betterWhen: "higher", trendNoise: 3,
        placeholder: "—", kind: "number",
        warn: implausible(45), warnText: "Check the number — over 45° is not anatomically possible",
    },
    {
        // `betterWhen: "none"` for the same reason body weight declines to
        // judge: girth falling is swelling settling, girth rising is muscle
        // coming back, and which one is happening is the doctor's read of the
        // patient in front of them, not a number's.
        key: "kneeGirthL", label: "Knee Girth L (cm)", shortLabel: "Knee girth (L)",
        unit: "cm", printLabel: "Knee Girth L", rxLabel: "Knee Girth L",
        group: "musculoskeletal", betterWhen: "none", trendNoise: 0.5,
        placeholder: "—", kind: "number",
        warn: implausible(90), warnText: "Check the number",
    },
    {
        key: "kneeGirthR", label: "Knee Girth R (cm)", shortLabel: "Knee girth (R)",
        unit: "cm", printLabel: "Knee Girth R", rxLabel: "Knee Girth R",
        group: "musculoskeletal", betterWhen: "none", trendNoise: 0.5,
        placeholder: "—", kind: "number",
        warn: implausible(90), warnText: "Check the number",
    },
    {
        key: "lmp", label: "LMP", shortLabel: "Last menstrual period",
        unit: "", printLabel: "LMP", rxLabel: "LMP",
        group: "obstetric", betterWhen: "none",
        placeholder: "—", kind: "date",
        // A date in the future is a typo, always. A date more than a year back
        // is usually one too, but it can be genuine (lactational amenorrhoea,
        // menopause), so it warns rather than blocks — §14: never hide.
        warn: (v) => {
            if (!v) return false;
            const days = (Date.now() - new Date(v).getTime()) / 86400000;
            return !Number.isFinite(days) || days < 0 || days > 400;
        },
        warnText: "Check the date — in the future, or over a year ago",
    },
    {
        key: "gpla", label: "G-P-L-A", shortLabel: "Obstetric history",
        unit: "", printLabel: "G-P-L-A", rxLabel: "G-P-L-A",
        group: "obstetric", betterWhen: "none",
        placeholder: "0", kind: "gpla",
        // Living children cannot exceed births, and pregnancies cannot be
        // fewer than births plus losses. Both are arithmetic, so they are
        // worth catching at entry rather than in a chart review later.
        warn: (v) => {
            const [g, p, l, a] = v.split("/").map((n) => Number.parseInt(n, 10));
            if (![g, p, l, a].every(Number.isFinite)) return false;
            return l > p || g < p + a;
        },
        warnText: "G-P-L-A does not add up — living exceeds births, or G is under P+A",
    },
];

export const FIELD_BY_KEY: Map<MeasureFieldKey, MeasureField> = new Map(
    MEASURE_FIELDS.map((f) => [f.key, f])
);

/**
 * Headings for the Add Measurement menu, in the order it prints them. A
 * catalogue this size needs sections or the menu becomes a list a doctor
 * scrolls past rather than reads — and per-joint range in particular would
 * otherwise bury blood pressure for every non-physiotherapy facility.
 */
export const GROUP_LABEL: Record<MeasureGroup, string> = {
    vitals: "Vitals",
    body: "Body",
    metabolic: "Metabolic",
    musculoskeletal: "Movement & function",
    obstetric: "Obstetric",
};

export const GROUP_ORDER: MeasureGroup[] = [
    "vitals", "body", "metabolic", "musculoskeletal", "obstetric",
];

/**
 * Split a set of offerable fields into the menu's sections, dropping any
 * section that has nothing in it. Catalogue order is preserved inside each
 * section — the "Stable Layout" rule applies to the menu too.
 */
export function groupFields(fields: MeasureField[]): { group: MeasureGroup; label: string; fields: MeasureField[] }[] {
    return GROUP_ORDER
        .map((g) => ({ group: g, label: GROUP_LABEL[g], fields: fields.filter((f) => f.group === g) }))
        .filter((s) => s.fields.length > 0);
}

// ============================================================
// PROGRESSIVE RELEVANCE — a field appears where it is needed
// ============================================================
//
// When something on the chart makes a measurement clinically relevant, that
// field becomes visible where the doctor would naturally fill it in. Ticking
// "Fever" surfaces Temperature inside Measurements. It is not a new panel, not
// a prompt, and not a question — it is the field, present, quietly marked.
//
// ── Why this is keyed on SIGNALS and not on chip labels ───────────────────
// It is still a static mapping — nothing is computed, nothing is learned, no
// entropy or discriminator logic is involved. But a chip-label map would have
// to name all 374 chips and would go stale the day the catalogue grows, while
// the ~280 signals are the stable vocabulary those chips already collapse into.
// "Fever", "Fever with rash" and "बुखार" all emit FEVER, so one row here covers
// every spelling of the same complaint, in every language, forever.
//
// A signal absent from this map surfaces nothing. That is the default and it is
// deliberate: a measurement that appears for everything is a measurement the
// doctor stops reading.

export const RELEVANT_FIELDS: Record<string, MeasureFieldKey[]> = {
    // temperature
    FEVER: ["temp"],
    HIGH_FEVER: ["temp"],
    FEVER_PROLONGED: ["temp"],
    FEVER_RECURRENT: ["temp"],
    RIGORS: ["temp"],
    DENGUE_SUSPICION: ["temp"],

    // oxygenation and rate
    // Respiratory rate belongs beside SpO₂ on all of these: it is the vital
    // that separates "short of breath" from respiratory distress, and in a
    // child with cough it is the pneumonia sign (WHO IMNCI counts breaths
    // before it counts anything else).
    BREATHLESSNESS: ["spo2", "pulse", "respRate"],
    BREATHLESSNESS_REST: ["spo2", "pulse", "respRate"],
    WHEEZE: ["spo2", "respRate"],
    CYANOSIS: ["spo2", "respRate"],
    COUGH: ["spo2", "respRate"],
    // Airway obstruction — the highest-idf respiratory signal in the base
    // (3.1) and, until now, in no relevance row at all.
    STRIDOR: ["spo2", "respRate"],

    // circulation
    CHEST_PAIN: ["bp", "pulse"],
    CHEST_PAIN_TYPICAL: ["bp", "pulse"],
    PALPITATIONS: ["pulse", "bp"],
    TACHYCARDIA: ["pulse"],
    HIGH_BP: ["bp"],
    SEVERE_HIGH_BP: ["bp"],
    LOW_BP: ["bp"],
    DIZZINESS: ["bp", "pulse"],
    PRESYNCOPE: ["bp", "pulse"],
    SYNCOPE: ["bp", "pulse"],
    HEADACHE: ["bp"],

    // body habitus — dosing and load tolerance
    // Unintentional weight loss with osmotic symptoms is how new diabetes
    // most often presents, so it asks for a sugar as well as the trend.
    WEIGHT_LOSS: ["weight", "height", "glucoseRandom"],
    WEIGHT_GAIN: ["weight", "height"],
    // paediatric dosing is by weight, always
    PEDIATRIC: ["weight"],

    // glycaemic — see the panel in MEASURE_FIELDS above.
    // Once a random sugar has raised HIGH_BLOOD_GLUCOSE, the HbA1c is
    // genuinely the next question (a spot reading diagnoses nothing on its
    // own), so this is a real next step rather than the circular case.
    HIGH_BLOOD_GLUCOSE: ["hba1c", "weight", "height"],
    // The signal is `DIABETIC`. This entry read `KNOWN_DIABETES` until
    // 2026-08-11 — a signal id that does not exist in the `signals` table and
    // never has, so the row was dead and a known diabetic's chart surfaced
    // nothing. The same class of mistake as the dead measurement keys: a
    // plausible-looking name that nothing validates against reality.
    DIABETIC: ["glucoseRandom", "hba1c", "weight", "height"],
    // The classic osmotic triad — the presentation that most deserves a
    // bedside sugar before the patient leaves the room.
    POLYURIA: ["glucoseRandom"],
    POLYDIPSIA: ["glucoseRandom"],
    POLYPHAGIA: ["glucoseRandom"],
    // Hyperglycaemia changes the lens osmotically; blurred vision is a real
    // presenting complaint of undiagnosed diabetes, not only an eye problem.
    VISION_BLURRED: ["glucoseRandom"],

    // volume status
    VOMITING: ["pulse", "bp"],
    DEHYDRATION: ["pulse", "bp"],

    // bleeding — the one place blood group is genuinely the next question
    BLEEDING: ["bloodGroup"],
    TRAUMA_HISTORY: ["bloodGroup", "bp", "pulse"],

    // obstetric — the LMP is the next question for any of these, and for a
    // pregnancy the obstetric history comes with it. Note AMENORRHEA appears
    // here even though LMP_DAYS is what RAISES it: a doctor who ticks "missed
    // periods" from the chip list still needs somewhere to put the date.
    AMENORRHEA: ["lmp"],
    MENSTRUAL_IRREGULAR: ["lmp"],
    INTERMENSTRUAL_BLEEDING: ["lmp"],
    PREGNANCY: ["lmp", "gpla"],
    PREGNANCY_NAUSEA: ["lmp", "gpla"],

    // musculoskeletal — pain scale and range of motion
    LOW_BACK_PAIN: ["painVas"],
    NECK_PAIN: ["painVas"],
    BACK_PAIN_UPPER: ["painVas"],
    JOINT_PAIN: ["painVas"],
    KNEE_PAIN: ["painVas", "romPct"],
    SHOULDER_PAIN: ["painVas", "romPct"],
    HIP_PAIN: ["painVas", "romPct"],
    ELBOW_PAIN: ["painVas", "romPct"],
    WRIST_HAND_PAIN: ["painVas", "romPct"],
    ANKLE_FOOT_PAIN: ["painVas", "romPct"],
    PAIN_SEVERE: ["painVas"],
    PAIN_CHRONIC: ["painVas"],
    ROM_RESTRICTED: ["romPct"],
    ROM_RESTRICTED_SEVERE: ["romPct"],
    ROM_PAINFUL_ARC: ["romPct", "painVas"],
    STIFFNESS_MORNING: ["romPct"],
};

export interface FieldRelevance {
    /** fields the chart has made worth filling in */
    keys: Set<MeasureFieldKey>;
    /** field -> the human label of the signal that asked for it */
    because: Map<MeasureFieldKey, string>;
}

/**
 * Which measurements this chart has made relevant, and what asked for each.
 *
 * `signals` comes straight from the engine run, strongest first, so `because`
 * naturally names the strongest reason rather than the last one seen.
 */
export function relevantFields(
    signals: { id: string; label: string }[]
): FieldRelevance {
    const keys = new Set<MeasureFieldKey>();
    const because = new Map<MeasureFieldKey, string>();
    for (const s of signals) {
        for (const key of RELEVANT_FIELDS[s.id] ?? []) {
            keys.add(key);
            if (!because.has(key)) because.set(key, s.label);
        }
    }
    return { keys, because };
}
