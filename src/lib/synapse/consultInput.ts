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
