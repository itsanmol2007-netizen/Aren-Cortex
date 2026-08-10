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
    warn?: (v: string) => boolean;
    warnText?: string;
}

const numberInRange = (lo: number, hi: number) => (v: string) => {
    const n = Number.parseFloat(v);
    return Number.isFinite(n) && (n < lo || n > hi);
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
        placeholder: "120", kind: "bp",
        warn: (v) => {
            const sys = Number.parseInt(String(v).split("/")[0] ?? "", 10);
            return Number.isFinite(sys) && (sys > 140 || sys < 90);
        },
        warnText: "Systolic outside 90–140 mmHg",
    },
    {
        key: "pulse", label: "Pulse (bpm)", shortLabel: "Pulse",
        placeholder: "72", kind: "number",
        warn: numberInRange(50, 100), warnText: "Outside 50–100 bpm",
    },
    {
        key: "spo2", label: "SpO₂ (%)", shortLabel: "SpO₂",
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
        placeholder: "98.6", kind: "number",
        warn: numberInRange(96, 99.5), warnText: "Outside 96–99.5 °F",
    },
    {
        key: "weight", label: "Body Weight (kg)", shortLabel: "Body weight",
        placeholder: "—", kind: "number",
    },
    {
        key: "height", label: "Height (cm)", shortLabel: "Height",
        placeholder: "—", kind: "number",
    },
    {
        key: "bloodGroup", label: "Blood Group", shortLabel: "Blood group",
        placeholder: "—", kind: "select",
        options: ["A+", "A−", "B+", "B−", "AB+", "AB−", "O+", "O−"],
    },
    {
        // Deliberately before the obstetric pair: those two are the only
        // fields in the catalogue that are sex-specific, and the "Stable
        // Layout" rule means they hold this position whether or not the
        // facility is a gynaecology one.
        key: "painVas", label: "Pain (0–10)", shortLabel: "Pain scale",
        placeholder: "0", kind: "number",
        warn: (v) => { const n = Number.parseFloat(v); return Number.isFinite(n) && n >= 7; },
        warnText: "Severe pain",
    },
    {
        key: "romPct", label: "Range of Motion (%)", shortLabel: "Range of motion",
        placeholder: "100", kind: "number",
        warn: (v) => { const n = Number.parseFloat(v); return Number.isFinite(n) && n < 50; },
        warnText: "Under half of expected range",
    },
    {
        key: "lmp", label: "LMP", shortLabel: "Last menstrual period",
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
    BREATHLESSNESS: ["spo2", "pulse"],
    BREATHLESSNESS_REST: ["spo2", "pulse"],
    WHEEZE: ["spo2"],
    CYANOSIS: ["spo2"],
    COUGH: ["spo2"],

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
    WEIGHT_LOSS: ["weight", "height"],
    WEIGHT_GAIN: ["weight", "height"],
    // paediatric dosing is by weight, always
    PEDIATRIC: ["weight"],
    HIGH_BLOOD_GLUCOSE: ["weight", "height"],
    KNOWN_DIABETES: ["weight", "height"],

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
