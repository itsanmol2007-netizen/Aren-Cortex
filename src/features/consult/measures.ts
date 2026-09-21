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

// Every catalogue field is a single value the card can put in a box — the
// one exception, `customMeasurements`, is an array and belongs to the
// fallback in consultInput.ts, never to a MeasureField. Excluded here so
// `vitals[f.key]` stays a string everywhere a MeasureField is read, rather
// than every reader having to widen for a key that can never actually occur.
export type MeasureFieldKey = Exclude<keyof Vitals, "customMeasurements">;

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
export type MeasureGroup = "vitals" | "body" | "metabolic" | "hematology" | "labs" | "imaging" | "musculoskeletal" | "obstetric" | "cardiac";

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
    /**
     * MINIMAL CLINICALLY IMPORTANT DIFFERENCE — the change below which a
     * real movement is not a movement that MATTERS. Phase 6.
     *
     * Deliberately a sibling of `trendNoise` rather than a replacement for
     * it, because they answer different questions and a field can need
     * both:
     *
     *   trendNoise  "is this change real, or measurement jitter?"
     *   mcid        "the change is real — is it big enough to mean anything?"
     *
     * `verdictFor` requires a change to clear BOTH bars before it draws an
     * arrow. Without this, a validated instrument moving 4 points reads as
     * "improving" identically to one moving 20, which is precisely the
     * confident-wrong-answer `trend.ts`'s header exists to prevent — the
     * number moved, and the patient did not get better.
     *
     * Values are the widely-cited published MCIDs for each instrument. They
     * vary by population and by how the study anchored them, so they are
     * deliberately set at the conservative (larger) end of the reported
     * range: over-calling improvement is the failure that matters here.
     */
    mcid?: number;
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
            const [sysRaw, diaRaw] = String(v).split("/");
            const sys = Number.parseInt(sysRaw ?? "", 10);
            const dia = Number.parseInt(diaRaw ?? "", 10);
            return (Number.isFinite(sys) && (sys > 140 || sys < 90))
                || (Number.isFinite(dia) && (dia > 90 || dia < 60));
        },
        warnText: "Outside 90–140 / 60–90 mmHg",
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
    // ── Cardiology — Project Pulse Point (added 2026-09-21) ─────────────────
    // Two numbers, not a new input mechanism: both are `kind: "number"` like
    // everything else in this catalogue, specifically so they ride the
    // existing trend/graph pipeline for free — "EF 35% → 38% → 42%" and
    // "NYHA III → II" are just `trend.ts` doing what it already does for BP,
    // applied to two more keys. See `CARDIOLOGY.measurements`/`.trend` in
    // specialtyProfile.ts for how a cardiology facility sees these by default.
    {
        key: "efPercent", label: "EF (%)", shortLabel: "Ejection fraction",
        unit: "%", printLabel: "EF", rxLabel: "EF",
        group: "cardiac", betterWhen: "higher", trendNoise: 3,
        placeholder: "60", kind: "number",
        // Only a low reading is ever a concern — EF has no meaningful upper
        // bound the way BP does, same precedent as SpO₂'s one-sided warn.
        // 50% is the conservative edge of "normal" (55–70%); everything from
        // there down to the 41–49% "mildly reduced" band still deserves the
        // amber, not just the ≤40% HFrEF cutoff.
        warn: (v) => { const n = Number.parseFloat(v); return Number.isFinite(n) && n < 50; },
        warnText: "Below the normal 55–70% range",
    },
    {
        // Stored as a plain integer 1–4 (I–IV), NOT `kind: "select"` — a
        // text select lands in `value_text`, which the trend pipeline never
        // reads, and NYHA's whole point here is "III → II" as a real trend
        // line. The cost of that choice: this pass prints the raw digit
        // everywhere (measurements card, Rx, trend chart) rather than the
        // roman numeral a cardiologist actually writes. A `formatNyha(n)`
        // display-layer helper is the honest follow-up, not done here —
        // touches several render surfaces (MeasurementsCard, PrescriptionDocument,
        // TrendMiniCard) and isn't required for the data model or the
        // trending to be correct today.
        key: "nyhaClass", label: "NYHA Class (1=I … 4=IV)", shortLabel: "NYHA class",
        unit: "", printLabel: "NYHA", rxLabel: "NYHA",
        group: "cardiac", betterWhen: "lower",
        placeholder: "2", kind: "number",
        warn: (v) => { const n = Number.parseFloat(v); return Number.isFinite(n) && (n < 1 || n > 4); },
        warnText: "NYHA class is I–IV (enter 1–4)",
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
    // ── CBC / hematology panel (added 2026-09-19) ───────────────────────
    // "It really doesn't have to feed CBC reports — what's the Hb count or
    // TLC count, basic thing in malaria or dengue" (Anmol). Both signals
    // already exist and already fire (DENGUE_SUSPICION, MALARIA_CONFIRMED
    // below) but had nothing to surface — a fever workup with no way to
    // record the three numbers it's actually run on.
    {
        key: "hb", label: "Hemoglobin (g/dL)", shortLabel: "Hemoglobin",
        unit: "g/dL", printLabel: "Hb", rxLabel: "Hb",
        group: "hematology", betterWhen: "higher", trendNoise: 0.5,
        placeholder: "13.5", kind: "number",
        // Normal range is sex-dependent (13–17 male, 12–15 female) and this
        // field cannot see the patient's sex — same honest limit respRate's
        // own comment documents for its age-band. Set at the low end valid
        // for either sex rather than warn wrongly for one of them.
        warn: (v) => { const n = Number.parseFloat(v); return Number.isFinite(n) && n < 11; },
        warnText: "Under 11 g/dL suggests anemia — normal range is sex-dependent (12–17)",
    },
    {
        key: "tlc", label: "TLC (/µL)", shortLabel: "Total leukocyte count",
        unit: "/µL", printLabel: "TLC", rxLabel: "TLC",
        group: "hematology", betterWhen: "band", trendNoise: 500,
        placeholder: "8000", kind: "number",
        warn: numberInRange(4000, 11000),
        warnText: "Outside 4,000–11,000/µL — low fits a viral fever (dengue), high fits a bacterial one",
    },
    {
        // The dengue severity marker — a single low reading matters less
        // than the TREND across the illness (cortex-longitudinal-spec's own
        // principle for exactly this kind of serial lab value), which is why
        // this carries a `trendNoise` at all rather than being a one-off number.
        key: "plateletCount", label: "Platelet Count (×10³/µL)", shortLabel: "Platelet count",
        unit: "×10³/µL", printLabel: "Platelets", rxLabel: "Plt",
        group: "hematology", betterWhen: "higher", trendNoise: 10,
        placeholder: "250", kind: "number",
        warn: (v) => { const n = Number.parseFloat(v); return Number.isFinite(n) && n < 150; },
        warnText: "Under 150 ×10³/µL is thrombocytopenia — dengue is followed on the trend, not one reading",
    },
    // ── CBC differential + ESR/RBC (added 2026-09-19) ───────────────────
    // "WBC, not just WBC — neutrophils or leucocytes and all" (Anmol). The
    // differential is what actually separates a viral fever workup from a
    // bacterial one and is the first thing a real CBC report shows under TLC.
    {
        key: "neutrophilsPct", label: "Neutrophils (%)", shortLabel: "Neutrophils",
        unit: "%", printLabel: "Neutrophils", rxLabel: "N%",
        group: "hematology", betterWhen: "none", trendNoise: 3,
        placeholder: "60", kind: "number",
        warn: numberInRange(40, 75), warnText: "Outside 40–75% — high fits bacterial, low fits viral",
    },
    {
        key: "lymphocytesPct", label: "Lymphocytes (%)", shortLabel: "Lymphocytes",
        unit: "%", printLabel: "Lymphocytes", rxLabel: "L%",
        group: "hematology", betterWhen: "none", trendNoise: 3,
        placeholder: "30", kind: "number",
        warn: numberInRange(20, 45), warnText: "Outside 20–45% — high fits a viral illness",
    },
    {
        key: "eosinophilsPct", label: "Eosinophils (%)", shortLabel: "Eosinophils",
        unit: "%", printLabel: "Eosinophils", rxLabel: "E%",
        group: "hematology", betterWhen: "lower", trendNoise: 1,
        placeholder: "2", kind: "number",
        warn: (v) => { const n = Number.parseFloat(v); return Number.isFinite(n) && n > 6; },
        warnText: "Over 6% — raised in allergy, asthma and worm infestation",
    },
    {
        key: "monocytesPct", label: "Monocytes (%)", shortLabel: "Monocytes",
        unit: "%", printLabel: "Monocytes", rxLabel: "M%",
        group: "hematology", betterWhen: "none", trendNoise: 2,
        placeholder: "5", kind: "number",
        warn: numberInRange(2, 10), warnText: "Outside 2–10%",
    },
    {
        key: "basophilsPct", label: "Basophils (%)", shortLabel: "Basophils",
        unit: "%", printLabel: "Basophils", rxLabel: "B%",
        group: "hematology", betterWhen: "none", trendNoise: 0.5,
        placeholder: "0.5", kind: "number",
        warn: (v) => { const n = Number.parseFloat(v); return Number.isFinite(n) && n > 1; },
        warnText: "Over 1%",
    },
    {
        // Age- and sex-dependent, same honest limit as hb and respRate — see
        // their own comments. Set at a conservative adult upper bound rather
        // than warn wrongly for a child or during pregnancy.
        key: "esr", label: "ESR (mm/hr)", shortLabel: "ESR",
        unit: "mm/hr", printLabel: "ESR", rxLabel: "ESR",
        group: "hematology", betterWhen: "lower", trendNoise: 5,
        placeholder: "10", kind: "number",
        warn: (v) => { const n = Number.parseFloat(v); return Number.isFinite(n) && n > 20; },
        warnText: "Over 20 mm/hr (adult) — a non-specific marker of inflammation, followed on trend",
    },
    {
        key: "rbcCount", label: "RBC Count (million/µL)", shortLabel: "RBC count",
        unit: "million/µL", printLabel: "RBC", rxLabel: "RBC",
        group: "hematology", betterWhen: "higher", trendNoise: 0.2,
        placeholder: "4.8", kind: "number",
        warn: (v) => { const n = Number.parseFloat(v); return Number.isFinite(n) && n < 4; },
        warnText: "Under 4 million/µL suggests anemia — normal range is sex-dependent",
    },

    // ── LFT / RFT / electrolytes / thyroid / lipid / CRP (added 2026-09-19)
    // "Everything measured in blood test... should be in our app" (Anmol).
    // Reference ranges below are the commonly cited adult ones; like every
    // band in this file they are a screening line, not a lab-specific cutoff.
    {
        key: "totalBilirubin", label: "Total Bilirubin (mg/dL)", shortLabel: "Total bilirubin",
        unit: "mg/dL", printLabel: "T. Bilirubin", rxLabel: "T.Bil",
        group: "labs", betterWhen: "lower", trendNoise: 0.2,
        placeholder: "0.8", kind: "number",
        warn: (v) => { const n = Number.parseFloat(v); return Number.isFinite(n) && n > 1.2; },
        warnText: "Over 1.2 mg/dL — the jaundice threshold",
    },
    {
        key: "sgot", label: "SGOT / AST (U/L)", shortLabel: "SGOT / AST",
        unit: "U/L", printLabel: "SGOT", rxLabel: "SGOT",
        group: "labs", betterWhen: "lower", trendNoise: 5,
        placeholder: "25", kind: "number",
        warn: (v) => { const n = Number.parseFloat(v); return Number.isFinite(n) && n > 40; },
        warnText: "Over 40 U/L",
    },
    {
        key: "sgpt", label: "SGPT / ALT (U/L)", shortLabel: "SGPT / ALT",
        unit: "U/L", printLabel: "SGPT", rxLabel: "SGPT",
        group: "labs", betterWhen: "lower", trendNoise: 5,
        placeholder: "25", kind: "number",
        warn: (v) => { const n = Number.parseFloat(v); return Number.isFinite(n) && n > 56; },
        warnText: "Over 56 U/L",
    },
    {
        key: "alkPhosphatase", label: "Alkaline Phosphatase (U/L)", shortLabel: "Alkaline phosphatase",
        unit: "U/L", printLabel: "ALP", rxLabel: "ALP",
        group: "labs", betterWhen: "lower", trendNoise: 10,
        placeholder: "90", kind: "number",
        warn: numberInRange(44, 147), warnText: "Outside 44–147 U/L",
    },
    {
        key: "totalProtein", label: "Total Protein (g/dL)", shortLabel: "Total protein",
        unit: "g/dL", printLabel: "T. Protein", rxLabel: "T.Prot",
        group: "labs", betterWhen: "band", trendNoise: 0.2,
        placeholder: "7", kind: "number",
        warn: numberInRange(6.0, 8.3), warnText: "Outside 6.0–8.3 g/dL",
    },
    {
        key: "albumin", label: "Albumin (g/dL)", shortLabel: "Albumin",
        unit: "g/dL", printLabel: "Albumin", rxLabel: "Alb",
        group: "labs", betterWhen: "higher", trendNoise: 0.2,
        placeholder: "4.2", kind: "number",
        warn: (v) => { const n = Number.parseFloat(v); return Number.isFinite(n) && n < 3.5; },
        warnText: "Under 3.5 g/dL",
    },
    {
        key: "bloodUrea", label: "Blood Urea (mg/dL)", shortLabel: "Blood urea",
        unit: "mg/dL", printLabel: "Blood Urea", rxLabel: "Urea",
        group: "labs", betterWhen: "lower", trendNoise: 3,
        placeholder: "25", kind: "number",
        warn: numberInRange(15, 40), warnText: "Outside 15–40 mg/dL",
    },
    {
        key: "creatinine", label: "Serum Creatinine (mg/dL)", shortLabel: "Serum creatinine",
        unit: "mg/dL", printLabel: "Creatinine", rxLabel: "Creat",
        group: "labs", betterWhen: "lower", trendNoise: 0.1,
        placeholder: "0.9", kind: "number",
        warn: numberInRange(0.6, 1.3), warnText: "Outside 0.6–1.3 mg/dL",
    },
    {
        key: "uricAcid", label: "Uric Acid (mg/dL)", shortLabel: "Uric acid",
        unit: "mg/dL", printLabel: "Uric Acid", rxLabel: "UA",
        group: "labs", betterWhen: "lower", trendNoise: 0.3,
        placeholder: "5", kind: "number",
        warn: numberInRange(3.5, 7.2), warnText: "Outside 3.5–7.2 mg/dL — high fits gout",
    },
    {
        key: "sodium", label: "Sodium (mEq/L)", shortLabel: "Sodium",
        unit: "mEq/L", printLabel: "Sodium", rxLabel: "Na+",
        group: "labs", betterWhen: "band", trendNoise: 2,
        placeholder: "140", kind: "number",
        warn: numberInRange(135, 145), warnText: "Outside 135–145 mEq/L",
    },
    {
        key: "potassium", label: "Potassium (mEq/L)", shortLabel: "Potassium",
        unit: "mEq/L", printLabel: "Potassium", rxLabel: "K+",
        group: "labs", betterWhen: "band", trendNoise: 0.3,
        placeholder: "4.2", kind: "number",
        warn: numberInRange(3.5, 5.1), warnText: "Outside 3.5–5.1 mEq/L",
    },
    {
        key: "tsh", label: "TSH (µIU/mL)", shortLabel: "TSH",
        unit: "µIU/mL", printLabel: "TSH", rxLabel: "TSH",
        group: "labs", betterWhen: "band", trendNoise: 0.5,
        placeholder: "2", kind: "number",
        warn: numberInRange(0.4, 4.0), warnText: "Outside 0.4–4.0 µIU/mL",
    },
    {
        key: "totalCholesterol", label: "Total Cholesterol (mg/dL)", shortLabel: "Total cholesterol",
        unit: "mg/dL", printLabel: "T. Cholesterol", rxLabel: "T.Chol",
        group: "labs", betterWhen: "lower", trendNoise: 10,
        placeholder: "180", kind: "number",
        warn: (v) => { const n = Number.parseFloat(v); return Number.isFinite(n) && n >= 200; },
        warnText: "≥200 mg/dL is the borderline-high range",
    },
    {
        key: "triglycerides", label: "Triglycerides (mg/dL)", shortLabel: "Triglycerides",
        unit: "mg/dL", printLabel: "Triglycerides", rxLabel: "TG",
        group: "labs", betterWhen: "lower", trendNoise: 15,
        placeholder: "120", kind: "number",
        warn: (v) => { const n = Number.parseFloat(v); return Number.isFinite(n) && n >= 150; },
        warnText: "≥150 mg/dL is the borderline-high range",
    },
    {
        key: "hdl", label: "HDL Cholesterol (mg/dL)", shortLabel: "HDL cholesterol",
        unit: "mg/dL", printLabel: "HDL", rxLabel: "HDL",
        group: "labs", betterWhen: "higher", trendNoise: 3,
        placeholder: "45", kind: "number",
        warn: (v) => { const n = Number.parseFloat(v); return Number.isFinite(n) && n < 40; },
        warnText: "Under 40 mg/dL",
    },
    {
        key: "ldl", label: "LDL Cholesterol (mg/dL)", shortLabel: "LDL cholesterol",
        unit: "mg/dL", printLabel: "LDL", rxLabel: "LDL",
        group: "labs", betterWhen: "lower", trendNoise: 10,
        placeholder: "100", kind: "number",
        warn: (v) => { const n = Number.parseFloat(v); return Number.isFinite(n) && n >= 130; },
        warnText: "≥130 mg/dL is the borderline-high range",
    },
    {
        key: "crp", label: "CRP (mg/L)", shortLabel: "CRP",
        unit: "mg/L", printLabel: "CRP", rxLabel: "CRP",
        group: "labs", betterWhen: "lower", trendNoise: 3,
        placeholder: "3", kind: "number",
        warn: (v) => { const n = Number.parseFloat(v); return Number.isFinite(n) && n > 10; },
        warnText: "Over 10 mg/L — assay-dependent, followed on trend",
    },

    // ── Ultrasound abdomen — general (added 2026-09-19) ──────────────────
    // "How will he record the findings from that investigation... we don't
    // have any other way to keep the track record of measurements" (Anmol).
    // The numeric findings a general abdomen USG report actually gives; the
    // narrative stays in Findings, this is only what has a number attached.
    {
        key: "liverSpan", label: "Liver Span (cm)", shortLabel: "Liver span",
        unit: "cm", printLabel: "Liver Span", rxLabel: "Liver Span",
        group: "imaging", betterWhen: "none", trendNoise: 0.5,
        placeholder: "13", kind: "number",
        warn: numberInRange(6, 16), warnText: "Outside roughly 6–16 cm — hepatomegaly (high) or a shrunken cirrhotic liver (low)",
    },
    {
        key: "spleenSize", label: "Spleen Length (cm)", shortLabel: "Spleen length",
        unit: "cm", printLabel: "Spleen", rxLabel: "Spleen",
        group: "imaging", betterWhen: "lower", trendNoise: 0.5,
        placeholder: "9", kind: "number",
        warn: (v) => { const n = Number.parseFloat(v); return Number.isFinite(n) && n > 13; },
        warnText: "Over 13 cm suggests splenomegaly",
    },
    {
        key: "gbWallThickness", label: "GB Wall Thickness (mm)", shortLabel: "Gallbladder wall thickness",
        unit: "mm", printLabel: "GB Wall", rxLabel: "GB Wall",
        group: "imaging", betterWhen: "lower", trendNoise: 0.5,
        placeholder: "2", kind: "number",
        warn: (v) => { const n = Number.parseFloat(v); return Number.isFinite(n) && n > 3; },
        warnText: "Over 3 mm suggests cholecystitis",
    },
    {
        key: "cbdDiameter", label: "CBD Diameter (mm)", shortLabel: "CBD diameter",
        unit: "mm", printLabel: "CBD", rxLabel: "CBD",
        group: "imaging", betterWhen: "lower", trendNoise: 0.5,
        placeholder: "4", kind: "number",
        warn: (v) => { const n = Number.parseFloat(v); return Number.isFinite(n) && n > 6; },
        warnText: "Over 6 mm suggests biliary obstruction — the normal upper limit rises after cholecystectomy",
    },
    {
        key: "rightKidneySize", label: "Right Kidney Length (cm)", shortLabel: "Right kidney length",
        unit: "cm", printLabel: "Right Kidney", rxLabel: "R Kidney",
        group: "imaging", betterWhen: "none", trendNoise: 0.3,
        placeholder: "10", kind: "number",
        warn: numberInRange(9, 12), warnText: "Outside roughly 9–12 cm",
    },
    {
        key: "leftKidneySize", label: "Left Kidney Length (cm)", shortLabel: "Left kidney length",
        unit: "cm", printLabel: "Left Kidney", rxLabel: "L Kidney",
        group: "imaging", betterWhen: "none", trendNoise: 0.3,
        placeholder: "10", kind: "number",
        warn: numberInRange(9, 12), warnText: "Outside roughly 9–12 cm",
    },
    {
        key: "postVoidResidual", label: "Post-void Residual (mL)", shortLabel: "Post-void residual",
        unit: "mL", printLabel: "PVR", rxLabel: "PVR",
        group: "imaging", betterWhen: "lower", trendNoise: 10,
        placeholder: "20", kind: "number",
        warn: (v) => { const n = Number.parseFloat(v); return Number.isFinite(n) && n > 50; },
        warnText: "Over 50 mL suggests incomplete bladder emptying",
    },

    {
        // Deliberately before the obstetric pair: those two are the only
        // fields in the catalogue that are sex-specific, and the "Stable
        // Layout" rule means they hold this position whether or not the
        // facility is a gynaecology one.
        key: "painVas", label: "Pain (0–10)", shortLabel: "Pain scale",
        unit: "/10", printLabel: "Pain", rxLabel: "Pain",
        group: "musculoskeletal", betterWhen: "lower", trendNoise: 1, mcid: 2,
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
        // MCID 9 points, the commonly cited value for the LEFS.
        group: "musculoskeletal", betterWhen: "higher", trendNoise: 3, mcid: 9,
        placeholder: "—", kind: "number",
        warn: implausible(80), warnText: "The LEFS runs 0–80",
    },
    {
        // Oswestry Disability Index — the routine low-back outcome measure.
        // Scored 0-100%, and LOWER is better: it measures disability, not
        // function, which is the opposite direction to LEFS beside it. That
        // inversion is exactly the kind of thing `betterWhen` exists to stop
        // anyone having to remember.
        key: "odi", label: "ODI (%)", shortLabel: "Oswestry disability index",
        unit: "%", printLabel: "ODI", rxLabel: "ODI",
        group: "musculoskeletal", betterWhen: "lower", trendNoise: 4, mcid: 10,
        placeholder: "—", kind: "number",
        warn: implausible(100), warnText: "The ODI runs 0–100%",
    },
    {
        // QuickDASH — upper limb, the short (11-item) form of the DASH.
        // Also a DISABILITY score, so lower is better. MCID ~15.9 is the
        // JOSPT-reported value for the shortened version.
        key: "quickdash", label: "QuickDASH (%)", shortLabel: "Upper limb disability",
        unit: "%", printLabel: "QuickDASH", rxLabel: "QuickDASH",
        group: "musculoskeletal", betterWhen: "lower", trendNoise: 5, mcid: 16,
        placeholder: "—", kind: "number",
        warn: implausible(100), warnText: "The QuickDASH runs 0–100%",
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

    // ── Obstetric ultrasound biometry (added 2026-09-19) ──────────────────
    // The numbers an antenatal USG report actually gives, alongside the LMP
    // and G-P-L-A above. No warn on the biometry fields themselves — every
    // one of them is read against gestational age on a growth chart, not a
    // fixed band, and a fixed band here would be a fabricated verdict for
    // whichever week the pregnancy is actually at. AFI is the one exception:
    // oligo/polyhydramnios thresholds are absolute, not GA-dependent.
    {
        key: "gestationalAgeUsg", label: "Gestational Age by USG (wks)", shortLabel: "Gestational age (USG)",
        unit: "wks", printLabel: "GA (USG)", rxLabel: "GA(USG)",
        group: "obstetric", betterWhen: "none",
        placeholder: "—", kind: "number",
    },
    {
        key: "efw", label: "Est. Fetal Weight (g)", shortLabel: "Estimated fetal weight",
        unit: "g", printLabel: "EFW", rxLabel: "EFW",
        group: "obstetric", betterWhen: "none",
        placeholder: "—", kind: "number",
    },
    {
        key: "afi", label: "Amniotic Fluid Index (cm)", shortLabel: "Amniotic fluid index",
        unit: "cm", printLabel: "AFI", rxLabel: "AFI",
        group: "obstetric", betterWhen: "none",
        placeholder: "—", kind: "number",
        warn: (v) => { const n = Number.parseFloat(v); return Number.isFinite(n) && (n < 5 || n > 25); },
        warnText: "Under 5 is oligohydramnios; over 25 is polyhydramnios",
    },
    {
        key: "bpd", label: "BPD (mm)", shortLabel: "Biparietal diameter",
        unit: "mm", printLabel: "BPD", rxLabel: "BPD",
        group: "obstetric", betterWhen: "none",
        placeholder: "—", kind: "number",
    },
    {
        key: "fl", label: "Femur Length (mm)", shortLabel: "Femur length",
        unit: "mm", printLabel: "FL", rxLabel: "FL",
        group: "obstetric", betterWhen: "none",
        placeholder: "—", kind: "number",
    },
    {
        key: "hc", label: "HC (mm)", shortLabel: "Head circumference",
        unit: "mm", printLabel: "HC", rxLabel: "HC",
        group: "obstetric", betterWhen: "none",
        placeholder: "—", kind: "number",
    },
    {
        key: "ac", label: "AC (mm)", shortLabel: "Abdominal circumference",
        unit: "mm", printLabel: "AC", rxLabel: "AC",
        group: "obstetric", betterWhen: "none",
        placeholder: "—", kind: "number",
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
    hematology: "Blood count (CBC)",
    labs: "Other blood tests",
    imaging: "Ultrasound findings",
    musculoskeletal: "Movement & function",
    obstetric: "Obstetric",
    cardiac: "Cardiac",
};

export const GROUP_ORDER: MeasureGroup[] = [
    "vitals", "body", "metabolic", "hematology", "labs", "imaging", "musculoskeletal", "obstetric",
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
    // The signal already fired here before it had anywhere to send a
    // doctor — DENGUE_SUSPICION existed with no CBC fields to surface until
    // the hematology panel above. Platelets and TLC are what the workup and
    // the monitoring both actually run on; verified against the live
    // `signals` table before adding (2026-09-19) — see this file's own
    // "KNOWN_DIABETES" cautionary note above for why that check matters.
    DENGUE_SUSPICION: ["temp", "plateletCount", "tlc"],
    // Confirmed malaria is followed the same way — Hb for the hemolysis,
    // TLC and platelets for the same reason dengue watches them.
    MALARIA_CONFIRMED: ["temp", "hb", "tlc", "plateletCount"],
    TYPHOID_CONFIRMED: ["temp", "tlc"],
    // Jaundice is worked up on the liver panel, not just the Hb it already
    // had — verified against the live `signals` table (2026-09-19), same as
    // every row added this pass.
    JAUNDICE: ["hb", "totalBilirubin", "sgot", "sgpt"],
    PALLOR: ["hb"],

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
    // The cardiac-risk workup rides along on the "typical, ischaemic" chest
    // pain specifically — the lipid panel is a risk-factor check, not
    // something every chest pain warrants.
    CHEST_PAIN_TYPICAL: ["bp", "pulse", "totalCholesterol", "ldl"],
    // Palpitations are a thyroid presentation as often as a cardiac one.
    PALPITATIONS: ["pulse", "bp", "tsh"],
    TACHYCARDIA: ["pulse"],
    HIGH_BP: ["bp"],
    SEVERE_HIGH_BP: ["bp"],
    LOW_BP: ["bp"],
    DIZZINESS: ["bp", "pulse"],
    PRESYNCOPE: ["bp", "pulse"],
    SYNCOPE: ["bp", "pulse"],
    HEADACHE: ["bp"],
    DYSLIPIDEMIA: ["totalCholesterol", "triglycerides", "hdl", "ldl"],

    // abdomen / hepatobiliary — RUQ pain is the gallstone/hepatitis workup;
    // a mass or distension asks the same two organs be measured.
    RUQ_PAIN: ["liverSpan", "gbWallThickness", "cbdDiameter", "sgot", "sgpt", "totalBilirubin"],
    ABDOMINAL_MASS: ["liverSpan", "spleenSize"],
    ABDOMINAL_DISTENSION: ["liverSpan", "spleenSize"],

    // renal / urinary
    RENAL_COLIC_CONFIRMED: ["bloodUrea", "creatinine", "rightKidneySize", "leftKidneySize"],
    RENAL_IMPAIRMENT: ["bloodUrea", "creatinine", "sodium", "potassium", "uricAcid"],
    DYSURIA: ["bloodUrea", "creatinine"],
    URINARY_FREQUENCY: ["bloodUrea", "creatinine", "postVoidResidual"],
    UTI_CONFIRMED: ["bloodUrea", "creatinine"],

    // oedema — the renal/hypoalbuminaemia workup a swollen patient prompts
    PERIPHERAL_EDEMA: ["creatinine", "totalProtein", "albumin"],
    GENERALISED_EDEMA: ["creatinine", "totalProtein", "albumin"],
    PERIORBITAL_EDEMA: ["creatinine", "totalProtein", "albumin"],

    // allergy / atopy / parasites — eosinophilia is the shared lab thread
    ALLERGIC_REACTION: ["eosinophilsPct"],
    URTICARIA: ["eosinophilsPct"],
    ALLERGIC_RHINITIS_HISTORY: ["eosinophilsPct"],
    ALLERGIC_DERMATITIS_CONFIRMED: ["eosinophilsPct"],
    FOOD_ALLERGY: ["eosinophilsPct"],
    ANGIOEDEMA: ["eosinophilsPct"],
    ASTHMA_COPD_KNOWN: ["eosinophilsPct"],
    WORMS_IN_STOOL: ["eosinophilsPct"],

    // body habitus — dosing and load tolerance
    // Unintentional weight loss with osmotic symptoms is how new diabetes
    // most often presents, so it asks for a sugar as well as the trend.
    // Thyroid disease is the other classic cause of unexplained weight change
    // in either direction, so TSH rides along on both.
    WEIGHT_LOSS: ["weight", "height", "glucoseRandom", "tsh"],
    WEIGHT_GAIN: ["weight", "height", "tsh"],
    // paediatric dosing is by weight, always
    PEDIATRIC: ["weight"],
    // thyroid — the other classic presentations, beyond weight change
    COLD_INTOLERANCE: ["tsh"],
    HEAT_INTOLERANCE: ["tsh"],
    FATIGUE: ["tsh", "hb"],

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

    // bleeding — blood group for a possible transfusion, platelets because
    // abnormal bleeding is the platelet count's own clinical question.
    BLEEDING: ["bloodGroup", "plateletCount"],
    BLEEDING_GUMS: ["plateletCount"],
    TRAUMA_HISTORY: ["bloodGroup", "bp", "pulse"],

    // obstetric — the LMP is the next question for any of these, and for a
    // pregnancy the obstetric history comes with it. Note AMENORRHEA appears
    // here even though LMP_DAYS is what RAISES it: a doctor who ticks "missed
    // periods" from the chip list still needs somewhere to put the date.
    AMENORRHEA: ["lmp"],
    MENSTRUAL_IRREGULAR: ["lmp"],
    INTERMENSTRUAL_BLEEDING: ["lmp"],
    // A confirmed pregnancy is where the antenatal USG numbers belong —
    // PREGNANCY_NAUSEA is the early sign and stays on LMP/G-P-L-A alone,
    // since biometry is not usually taken that early.
    PREGNANCY: ["lmp", "gpla", "gestationalAgeUsg", "efw", "afi", "bpd", "fl", "hc", "ac"],
    PREGNANCY_NAUSEA: ["lmp", "gpla"],

    // musculoskeletal — pain scale and range of motion
    LOW_BACK_PAIN: ["painVas"],
    NECK_PAIN: ["painVas"],
    BACK_PAIN_UPPER: ["painVas"],
    // Inflammatory markers — a joint pain that is actually arthritis is
    // worked up on ESR/CRP, not just described.
    JOINT_PAIN: ["painVas", "esr", "crp"],
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
    // Sudden single-joint pain and swelling is the gout/septic-arthritis
    // presentation — uric acid alongside the same inflammatory markers.
    ACUTE_MONOARTHRITIS: ["esr", "crp", "uricAcid"],
    JOINT_SWELLING: ["esr", "crp"],
};

/**
 * The per-joint DEGREE fields, surfaced by the same signals as above — but
 * only for a facility that has opted into goniometry. Added 2026-08-17b.
 *
 * ── Why this is a second map rather than more entries in the first
 *
 * `RELEVANT_FIELDS` is global: every profile reads it, which is exactly
 * right for temperature-on-fever and SpO₂-on-breathlessness, because those
 * are relevant to whoever is in the room. Knee flexion in degrees is not.
 * Folding these rows into the map above would put four goniometry boxes in
 * front of a general physician the moment they ticked "Knee pain" — a
 * measurement they will not take, pushing blood pressure down the card to
 * make room. That is the "auto-surfaced fields are visually distinct"
 * promise being spent on noise.
 *
 * So the split is by FACILITY, using the mechanism the codebase already
 * uses for exactly this question — `SpecialtyProfile`. `App.tsx` passes
 * this map to `relevantFields` only when the profile carries the joint map
 * (`charts: ["joints"]`), which is the same statement as "this clinic
 * measures joint angles". Configuration, not inference, same law as
 * `primary` and `measurements`.
 *
 * ── Both sides, every time, and that is deliberate
 *
 * A chip carries no laterality anywhere in this product (see
 * `JointMapCard.tsx`'s header), so KNEE_PAIN cannot know which knee. It
 * surfaces both and the physiotherapist fills the one they are treating —
 * which is also the honest clinical answer, since the uninvolved side is
 * the reference a range measurement is read against.
 *
 * Knee girth hangs off JOINT_SWELLING rather than KNEE_PAIN because girth
 * is the measurement of a swelling, not of a painful joint. Elbow, wrist
 * and the spine have no degree field in the catalogue yet; they keep
 * `romPct` from the map above and appear here not at all.
 */
export const JOINT_RANGE_FIELDS: Record<string, MeasureFieldKey[]> = {
    NECK_PAIN: ["cervicalRotL", "cervicalRotR"],
    SHOULDER_PAIN: ["shoulderFlexL", "shoulderFlexR", "shoulderAbdL", "shoulderAbdR"],
    HIP_PAIN: ["hipFlexL", "hipFlexR"],
    KNEE_PAIN: ["kneeFlexL", "kneeFlexR", "kneeExtLagL", "kneeExtLagR"],
    ANKLE_FOOT_PAIN: ["ankleDorsiL", "ankleDorsiR"],
    JOINT_SWELLING: ["kneeGirthL", "kneeGirthR"],
    // The function score is what a course is judged on, so any lower-limb
    // complaint is a reason to have it on screen.
    LOW_BACK_PAIN: ["lefs"],
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
 *
 * `extra` is an optional SECOND map consulted alongside the global one, for
 * fields a particular kind of facility wants and the rest would find noise —
 * `JOINT_RANGE_FIELDS` is the only one today. See its own comment for why
 * this is a parameter rather than more rows above.
 */
export function relevantFields(
    signals: { id: string; label: string }[],
    extra?: Record<string, MeasureFieldKey[]>
): FieldRelevance {
    const keys = new Set<MeasureFieldKey>();
    const because = new Map<MeasureFieldKey, string>();
    for (const s of signals) {
        const asked = extra
            ? [...(RELEVANT_FIELDS[s.id] ?? []), ...(extra[s.id] ?? [])]
            : RELEVANT_FIELDS[s.id] ?? [];
        for (const key of asked) {
            keys.add(key);
            if (!because.has(key)) because.set(key, s.label);
        }
    }
    return { keys, because };
}
