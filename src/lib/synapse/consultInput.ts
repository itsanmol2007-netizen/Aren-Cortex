// ---------------------------------------------------------------------------
// The consult, translated into what the engine understands.
//
// The engine's whole input surface is two arrays: observations (an observable
// was picked) and measurements (a key and a number). Everything Cortex holds —
// symptom names, finding names, a vitals strip, a patient record — has to be
// reduced to those two, and this module is the only place that reduction
// happens.
//
// Three things here are load-bearing and all three fail SILENTLY if they are
// wrong — no error, no warning, just a ranking that is quietly missing signals:
//
//  1. BLOOD PRESSURE IS TWO MEASUREMENTS. Cortex's vitals strip holds one
//     string, "140/90". Written as one row it matches no rule and BP never
//     fires. It is split here, always.
//
//  2. TEMPERATURE IS CELSIUS IN THE RULES, FAHRENHEIT IN THE UI. The vitals
//     field is placeheld "98.6" and warns above 99.5, so doctors type °F. The
//     measurement rules fire at ≥ 37.8. Passing 101 straight through would be
//     read as 101 °C — above every threshold — and 99 °F would read as 99 °C.
//     Converted here, with the unit inferred from magnitude so a doctor who
//     types °C is also right.
//
//  3. AGE IS NEVER TYPED. It comes from the patient record and must be
//     injected on EVERY run, or ELDERLY / PEDIATRIC never fire — and with them
//     go the paediatric brand-form rule and the paediatric guards.
// ---------------------------------------------------------------------------

import type { EngineInput } from "./engine";
import type { Vitals } from "../../types";
import { growthZ, type Sex } from "../growth/growth";

/**
 * A measurement on its way to both the engine and `visit_measurements`.
 *
 * `value` is nullable because not every measurement is a number. Blood group is
 * the only one today, and it exists to be recorded and printed, not scored —
 * `visit_measurements` already carries `value_text` for exactly this, and the
 * engine simply never receives a row without a number. That is enforced in
 * `buildEngineInput` below rather than left to each caller to remember.
 */
export interface MeasurementRow {
    measureKey: string;
    value: number | null;
    unit: string;
    /** the recorded value when it is not a number (blood group) */
    text?: string;
}

/** Above this, a temperature can only be Fahrenheit — 45 °C is not survivable. */
const FAHRENHEIT_FLOOR = 45;

const toCelsius = (raw: number): number =>
    raw >= FAHRENHEIT_FLOOR ? ((raw - 32) * 5) / 9 : raw;

const num = (v: string | null | undefined): number | null => {
    if (v == null) return null;
    const n = Number.parseFloat(String(v).trim());
    return Number.isFinite(n) ? n : null;
};

/**
 * The vitals strip, as measurements.
 *
 * `weight` is carried through even though no rule reads it: it belongs in the
 * permanent record, and an unknown measure key is ignored by the engine by
 * construction (`resolveSignals` only walks rules that exist).
 */
export function vitalsToMeasurements(vitals: Vitals): MeasurementRow[] {
    const out: MeasurementRow[] = [];

    // 1 — blood pressure: one field, two measurements. Never one row.
    const [sysRaw, diaRaw] = String(vitals.bp ?? "").split("/");
    const sys = num(sysRaw);
    const dia = num(diaRaw);
    if (sys !== null) out.push({ measureKey: "BP_SYS", value: sys, unit: "mmHg" });
    if (dia !== null) out.push({ measureKey: "BP_DIA", value: dia, unit: "mmHg" });

    const pulse = num(vitals.pulse);
    if (pulse !== null) out.push({ measureKey: "HR", value: pulse, unit: "bpm" });

    // 2 — temperature: the UI is Fahrenheit, the rules are Celsius.
    const temp = num(vitals.temp);
    if (temp !== null) {
        out.push({ measureKey: "TEMP", value: round1(toCelsius(temp)), unit: "C" });
    }

    // Respiratory rate. Had a live rule (RR ≥ 22 -> BREATHLESSNESS) and no
    // field emitting it until 2026-08-11 — see §14.11 on that class of gap.
    const respRate = num(vitals.respRate);
    if (respRate !== null) out.push({ measureKey: "RR", value: respRate, unit: "/min" });

    const spo2 = num(vitals.spo2);
    if (spo2 !== null) out.push({ measureKey: "SPO2", value: spo2, unit: "%" });

    const weight = num(vitals.weight);
    if (weight !== null) out.push({ measureKey: "WEIGHT", value: weight, unit: "kg" });

    const height = num(vitals.height);
    if (height !== null) out.push({ measureKey: "HEIGHT", value: height, unit: "cm" });

    // ── Physical measures ────────────────────────────────────────────────
    // Unlike WEIGHT and HEIGHT, these two DO have measurement rules behind
    // them (PAIN_VAS, ROM_PCT), so a physiotherapy facility surfacing them
    // changes the ranking rather than only the record. ROM is deliberately
    // generic and not per-joint: the chip carries the location, the number
    // carries the degree (handoff §2.4).
    const pain = num(vitals.painVas);
    if (pain !== null) out.push({ measureKey: "PAIN_VAS", value: pain, unit: "/10" });

    const rom = num(vitals.romPct);
    if (rom !== null) out.push({ measureKey: "ROM_PCT", value: rom, unit: "%" });

    // ── Physiotherapy: function and per-joint range (2026-08-16) ─────────
    // None of these has a measurement_rule behind it today and none is
    // expected to soon — a knee flexion of 108° is not a finding, it is a
    // position on a course. They are emitted anyway, and that is the point:
    // `MeasurementRow` is what carries a number into `visit_measurements`, so
    // a field that emits nothing is a number the RECORD never sees either,
    // which is precisely the hole `check:measures` was written to catch. The
    // engine ignoring a key costs nothing; the record dropping one costs the
    // trend these fields exist for.
    //
    // Left and right stay separate keys for the same reason they are separate
    // fields — see measures.ts. Averaging them, or emitting one KNEE_FLEX,
    // would make the operated knee's recovery invisible behind the good one.
    const PHYSIO_KEYS: [keyof Vitals, string, string][] = [
        ["lefs", "LEFS", "/80"],
        // Phase 6 outcome instruments. No rule reads either today; they are
        // emitted for the same reason every physio field is — a field that
        // emits nothing is a number the RECORD never sees.
        ["odi", "ODI", "%"],
        ["quickdash", "QUICKDASH", "%"],
        ["cervicalRotL", "CERVICAL_ROT_L", "deg"],
        ["cervicalRotR", "CERVICAL_ROT_R", "deg"],
        ["shoulderFlexL", "SHOULDER_FLEX_L", "deg"],
        ["shoulderFlexR", "SHOULDER_FLEX_R", "deg"],
        ["shoulderAbdL", "SHOULDER_ABD_L", "deg"],
        ["shoulderAbdR", "SHOULDER_ABD_R", "deg"],
        ["hipFlexL", "HIP_FLEX_L", "deg"],
        ["hipFlexR", "HIP_FLEX_R", "deg"],
        ["kneeFlexL", "KNEE_FLEX_L", "deg"],
        ["kneeFlexR", "KNEE_FLEX_R", "deg"],
        ["kneeExtLagL", "KNEE_EXT_LAG_L", "deg"],
        ["kneeExtLagR", "KNEE_EXT_LAG_R", "deg"],
        ["ankleDorsiL", "ANKLE_DORSI_L", "deg"],
        ["ankleDorsiR", "ANKLE_DORSI_R", "deg"],
        ["kneeGirthL", "KNEE_GIRTH_L", "cm"],
        ["kneeGirthR", "KNEE_GIRTH_R", "cm"],
    ];
    for (const [vitalKey, measureKey, unit] of PHYSIO_KEYS) {
        const v = num(vitals[vitalKey]);
        if (v !== null) out.push({ measureKey, value: v, unit });
    }

    // ── Glycaemic panel ──────────────────────────────────────────────────
    // These three keys had LIVE measurement_rules and no field emitting them
    // until 2026-08-11, so HIGH_BLOOD_GLUCOSE and LOW_BLOOD_GLUCOSE — which
    // carry no chips at all and can therefore ONLY be raised by a number —
    // were unreachable, and with them the entire authored diabetes pathway
    // (11 medicines, T2DM and DKA as conditions, Endocrinology, four tests,
    // and the hypoglycaemia → emergency-transfer route). Nothing was wrong
    // with the rules; nothing ever sent them a value.
    //
    // Fasting and random are separate keys on purpose and must never be
    // merged: the rules fire at ≥126 and ≥200 respectively, so collapsing
    // them would call a normal post-meal sugar diabetic.
    const glucoseFasting = num(vitals.glucoseFasting);
    if (glucoseFasting !== null) {
        out.push({ measureKey: "GLUCOSE_FASTING", value: glucoseFasting, unit: "mg/dL" });
    }

    const glucoseRandom = num(vitals.glucoseRandom);
    if (glucoseRandom !== null) {
        out.push({ measureKey: "GLUCOSE_RANDOM", value: glucoseRandom, unit: "mg/dL" });
    }

    const hba1c = num(vitals.hba1c);
    if (hba1c !== null) out.push({ measureKey: "HBA1C", value: hba1c, unit: "%" });

    // ── Obstetric ────────────────────────────────────────────────────────
    // The LMP is entered as a date because that is what the patient knows,
    // but "12 June" means nothing to a rule. What a rule can reason about is
    // how long it has been, so the date is carried for the record and the
    // interval is derived for the engine. LMP_DAYS is what measurement_rules
    // keys on (>35 days raises AMENORRHEA); the date itself never is.
    const lmp = String(vitals.lmp ?? "").trim();
    if (lmp) {
        out.push({ measureKey: "LMP", value: null, unit: "", text: lmp });
        const days = Math.floor((Date.now() - new Date(lmp).getTime()) / 86_400_000);
        // A future date is a typo; carrying it would fire amenorrhoea rules
        // backwards. Recorded above either way, just not scored.
        if (Number.isFinite(days) && days >= 0) {
            out.push({ measureKey: "LMP_DAYS", value: days, unit: "days" });
        }
    }

    // G-P-L-A splits exactly as bp does — one control, four measurements —
    // so each number can be read on its own downstream.
    const gpla = String(vitals.gpla ?? "").trim();
    if (gpla) {
        const parts = gpla.split("/");
        const keys = ["GRAVIDA", "PARA", "LIVING", "ABORTIONS"];
        keys.forEach((key, i) => {
            const n = num(parts[i]);
            if (n !== null) out.push({ measureKey: key, value: n, unit: "" });
        });
    }

    // The one non-numeric measurement. It is carried so that it reaches
    // `visit_measurements.value_text` and the print; no rule reads it, and
    // `buildEngineInput` never hands a text row to the engine.
    const bloodGroup = String(vitals.bloodGroup ?? "").trim();
    if (bloodGroup) {
        out.push({ measureKey: "BLOOD_GROUP", value: null, unit: "", text: bloodGroup });
    }

    return out;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * `visit_measurements` back into the `Vitals` shape the card edits — the exact
 * inverse of `vitalsToMeasurements` above, and it lives beside it for the one
 * reason that matters: these two must agree about every key, every unit and
 * every conversion, and the only way to keep that true is to read one while
 * editing the other (standing rule 19).
 *
 * Written for the Front Desk -> Consult handoff. Reception enters a BP and a
 * temperature; the row it lands in is the ENGINE's normalised record
 * (BP_SYS/BP_DIA, Celsius), because that is what `saveVitalsMeasurements`
 * writes. The doctor's card takes one "120/80" string and Fahrenheit. Without
 * this reduction the doctor sees an empty Measurements card beside a queue row
 * that plainly showed a temperature — the number was captured and then not
 * shown, which is worse than never capturing it.
 *
 * ── What it deliberately does NOT do ──────────────────────────────────────
 * It never invents a value. A key with no row comes back absent, not "", so a
 * caller merging this into existing vitals cannot blank a field the doctor has
 * already typed. Derived keys (LMP_DAYS, WAZ/HAZ, the four G-P-L-A splits) are
 * skipped on the way back: they are outputs of this reduction, and rebuilding
 * an input from them would be a second, drifting source of truth for the same
 * fact. LMP comes back from its own text row, which is the value that was
 * actually entered.
 */
export function measurementsToVitals(
    rows: { measure_key: string; value_num: number | string | null; value_text: string | null }[]
): Partial<Vitals> {
    const numByKey = new Map<string, number>();
    const textByKey = new Map<string, string>();
    for (const r of rows) {
        if (r.value_num !== null && r.value_num !== undefined) {
            const n = typeof r.value_num === "number" ? r.value_num : Number.parseFloat(r.value_num);
            if (Number.isFinite(n)) numByKey.set(r.measure_key, n);
        }
        if (r.value_text) textByKey.set(r.measure_key, r.value_text);
    }

    const out: Partial<Vitals> = {};
    const str = (n: number) => String(Math.round(n * 100) / 100);

    // BP: two rows back into one field, and only when at least one half
    // exists — "120/" is a value nobody entered.
    const sys = numByKey.get("BP_SYS");
    const dia = numByKey.get("BP_DIA");
    if (sys !== undefined || dia !== undefined) {
        out.bp = `${sys !== undefined ? Math.round(sys) : ""}/${dia !== undefined ? Math.round(dia) : ""}`;
    }

    // Temperature: stored Celsius, edited Fahrenheit. One decimal, because
    // that is the precision the field itself shows.
    const tempC = numByKey.get("TEMP");
    if (tempC !== undefined) out.temp = String(round1((tempC * 9) / 5 + 32));

    const SIMPLE: [string, keyof Vitals][] = [
        ["HR", "pulse"], ["RR", "respRate"], ["SPO2", "spo2"],
        ["WEIGHT", "weight"], ["HEIGHT", "height"],
        ["PAIN_VAS", "painVas"], ["ROM_PCT", "romPct"],
        ["LEFS", "lefs"], ["ODI", "odi"], ["QUICKDASH", "quickdash"],
        ["CERVICAL_ROT_L", "cervicalRotL"], ["CERVICAL_ROT_R", "cervicalRotR"],
        ["SHOULDER_FLEX_L", "shoulderFlexL"], ["SHOULDER_FLEX_R", "shoulderFlexR"],
        ["SHOULDER_ABD_L", "shoulderAbdL"], ["SHOULDER_ABD_R", "shoulderAbdR"],
        ["HIP_FLEX_L", "hipFlexL"], ["HIP_FLEX_R", "hipFlexR"],
        ["KNEE_FLEX_L", "kneeFlexL"], ["KNEE_FLEX_R", "kneeFlexR"],
        ["KNEE_EXT_LAG_L", "kneeExtLagL"], ["KNEE_EXT_LAG_R", "kneeExtLagR"],
        ["ANKLE_DORSI_L", "ankleDorsiL"], ["ANKLE_DORSI_R", "ankleDorsiR"],
        ["KNEE_GIRTH_L", "kneeGirthL"], ["KNEE_GIRTH_R", "kneeGirthR"],
        ["GLUCOSE_FASTING", "glucoseFasting"], ["GLUCOSE_RANDOM", "glucoseRandom"],
        ["HBA1C", "hba1c"],
    ];
    for (const [measureKey, vitalKey] of SIMPLE) {
        const n = numByKey.get(measureKey);
        if (n !== undefined) (out as Record<string, string>)[vitalKey] = str(n);
    }

    // The two text rows, entered as text and stored as text.
    const bloodGroup = textByKey.get("BLOOD_GROUP");
    if (bloodGroup) out.bloodGroup = bloodGroup;
    const lmp = textByKey.get("LMP");
    if (lmp) out.lmp = lmp;

    // G-P-L-A: four rows, one control. Rebuilt only when at least one part is
    // present, and missing parts stay empty rather than becoming zero — a
    // gravidity nobody recorded is not "G0".
    const gplaParts = ["GRAVIDA", "PARA", "LIVING", "ABORTIONS"].map((k) => numByKey.get(k));
    if (gplaParts.some((p) => p !== undefined)) {
        out.gpla = gplaParts.map((p) => (p === undefined ? "" : String(Math.round(p)))).join("/");
    }

    return out;
}

export interface BuildInputArgs {
    /**
     * The observables on the chart — symptoms, examination findings and patient
     * history alike. Cortex picks from `observables` directly (handoff §16), so
     * these ARE the engine's vocabulary and no translation step exists any more.
     */
    observableIds: number[];
    vitals: Vitals;
    /** from the patient record — not typed by the doctor */
    ageYears: number | null;
    /**
     * Exact age in months, derived from `patients.date_of_birth` — see
     * lib/growth/age.ts. Null whenever no date of birth is recorded, which is
     * every patient created before that column existed.
     *
     * Separate from `ageYears` on purpose: the integer year is what ELDERLY and
     * PEDIATRIC key on and is always present, while growth standards need month
     * precision and are simply skipped without it. Never derive one from the
     * other — `ageYears * 12` would be a fabricated month count.
     */
    ageMonths?: number | null;
    /** from the patient record. WHO publishes separate standards per sex. */
    sex?: Sex | null;
}

export interface BuiltInput {
    input: EngineInput;
    /** the same measurements, shaped for `visit_measurements` */
    measurements: MeasurementRow[];
    /** deduped observable ids, for `visit_observations` */
    observableIds: number[];
}

export function buildEngineInput(args: BuildInputArgs): BuiltInput {
    const observableIds = new Set<number>(args.observableIds);
    const measurements = vitalsToMeasurements(args.vitals);

    // 3 — age, on every single run.
    if (args.ageYears !== null && Number.isFinite(args.ageYears)) {
        measurements.push({ measureKey: "AGE", value: args.ageYears, unit: "years" });
    }

    // 4 — paediatric growth. A raw weight matches no rule and never should:
    // twelve kilos is a thriving two-year-old and a severely underweight
    // five-year-old, so the number only becomes a finding once it is read
    // against age and sex. That reading is a z-score, and WAZ/HAZ are what
    // `measurement_rules` can actually key on.
    //
    // Every one of these guards is load-bearing. `growthZ` returns null
    // outside 0–60 months, and both age-in-months and sex are frequently
    // absent (no date of birth recorded, or gender "Other"), in which case
    // NOTHING is emitted and the engine simply never hears about growth —
    // which is the correct outcome. A fabricated z-score would be a clinical
    // assertion nobody made.
    const { ageMonths, sex } = args;
    if (ageMonths !== null && ageMonths !== undefined && sex) {
        const weightKg = num(args.vitals.weight);
        if (weightKg !== null) {
            const waz = growthZ("weight-for-age", weightKg, ageMonths, sex);
            if (waz) measurements.push({ measureKey: "WAZ", value: waz.z, unit: "SD" });
        }
        const heightCm = num(args.vitals.height);
        if (heightCm !== null) {
            const haz = growthZ("height-for-age", heightCm, ageMonths, sex);
            // Emitted for the record and the card. No rule keys on HAZ yet —
            // stunting has no signal in this knowledge base, and inventing one
            // is clinical content authoring, not wiring.
            if (haz) measurements.push({ measureKey: "HAZ", value: haz.z, unit: "SD" });
        }
    }

    const ids = [...observableIds];

    return {
        input: {
            // Cortex has no "patient denies X" affordance yet, so nothing is
            // negated. The engine already handles negation; when a denial chip
            // exists, it sets this flag and nothing else changes.
            observations: ids.map((observableId) => ({ observableId, isNegated: false })),
            // Only numeric rows reach the engine. A measurement with no number
            // cannot match a `measurement_rules` range, and passing one through
            // as NaN would be a silent wrong answer of exactly the kind this
            // module exists to prevent.
            measurements: measurements
                .filter((m): m is MeasurementRow & { value: number } => m.value !== null)
                .map((m) => ({ measureKey: m.measureKey, value: m.value })),
        },
        measurements,
        observableIds: ids,
    };
}

/**
 * Whether this consultation is paediatric — the flag that decides whether a
 * brand preference learned on an adult form may be inherited (Calpol syrup is
 * not Calpol 650 tablet). Derived from the engine's own verdict, not from a
 * second age rule living in the UI: if `PEDIATRIC` fired, it is paediatric.
 */
export const PEDIATRIC_SIGNAL = "PEDIATRIC";

export function isPediatricConsult(activeSignalIds: Iterable<string>): boolean {
    for (const id of activeSignalIds) if (id === PEDIATRIC_SIGNAL) return true;
    return false;
}
