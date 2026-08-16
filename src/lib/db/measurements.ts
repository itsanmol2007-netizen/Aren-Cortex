import { supabase } from "../supabase";

// ═══════════════════════════════════════════════════════════════════════════
//  VITALS → visit_measurements
//
//  The topbar vitals bar (see PatientHeader.tsx VITAL_FIELDS) has always saved
//  a free-text blob to visits.vitals on every consult — bp: "120/80",
//  temp: "98.6" — but nothing ever turned that into numbers anyone could
//  query. visit_measurements (visit_id, measure_key, value_num, unit) is the
//  right-shaped table for that; it already exists, nothing reads or writes it.
//
//  This is the missing writer. It does NOT replace visits.vitals — the print
//  document and the topbar both read that jsonb blob directly, and changing
//  that shape is out of scope here. This is additive: same input, a second,
//  structured destination that a future trend chart can actually query.
//
//  Bounds below are a data-quality gate (reject a stray keystroke, not a
//  clinical judgement) — they are deliberately wider than the topbar's own
//  `warn` thresholds, which already flag numerically valid but abnormal
//  readings (BP > 140/90, etc.) with the amber pill styling. Don't conflate
//  the two: "implausible" gets dropped here, "abnormal" is a UI concern that
//  already exists and is left untouched.
// ═══════════════════════════════════════════════════════════════════════════

type MeasurementRow = {
    visit_id: string;
    measure_key: string;
    value_num: number;
    unit: string;
};

const PLAUSIBLE: Record<string, [number, number]> = {
    BP_SYS: [60, 260],
    BP_DIA: [30, 160],
    HR: [30, 220],
    TEMP: [30, 43],   // Celsius
    SPO2: [50, 100],
    WEIGHT: [1, 300], // kg
};

function inRange(key: string, v: number): boolean {
    const bounds = PLAUSIBLE[key];
    return bounds ? v >= bounds[0] && v <= bounds[1] : true;
}

// measurement_rules defines TEMP thresholds in Celsius; the topbar collects
// Fahrenheit (placeholder "98.6"). Convert at write time so a row here is
// directly comparable against that table, rather than leaving a silent
// unit mismatch for whoever reads this next.
function fahrenheitToCelsius(f: number): number {
    return Math.round(((f - 32) * 5) / 9 * 10) / 10;
}

export function parseVitalsToMeasurements(
    visitId: string,
    vitals: Record<string, string>
): MeasurementRow[] {
    const rows: MeasurementRow[] = [];

    // parseFloat tolerates trailing junk ("65 kg" → 65), so no need to strip
    // units a doctor might type out of habit from the field's placeholder.
    const push = (measure_key: string, raw: string | undefined, unit: string) => {
        if (!raw?.trim()) return;
        const value_num = parseFloat(raw);
        if (Number.isFinite(value_num) && inRange(measure_key, value_num)) {
            rows.push({ visit_id: visitId, measure_key, value_num, unit });
        }
    };

    // BP is a single "120/80" field. A partial entry ("120" with no diastolic)
    // still yields one usable row rather than being dropped entirely.
    const bp = vitals.bp?.trim();
    if (bp) {
        const [sys, dia] = bp.split("/");
        push("BP_SYS", sys, "mmHg");
        push("BP_DIA", dia, "mmHg");
    }

    push("HR", vitals.pulse, "bpm");
    push("SPO2", vitals.spo2, "%");
    push("WEIGHT", vitals.weight, "kg");

    if (vitals.temp?.trim()) {
        const f = parseFloat(vitals.temp);
        if (Number.isFinite(f)) push("TEMP", String(fahrenheitToCelsius(f)), "C");
    }

    return rows;
}

/**
 * Best-effort — throws like the codebase's other secondary write-path
 * functions (runLearningLoop, logCoprescriptionObservations) so the caller
 * attaches `.catch()` and a logging failure never blocks the actual
 * prescription save.
 */
export async function logVisitMeasurements(
    visitId: string,
    vitals: Record<string, string>
): Promise<void> {
    const rows = parseVitalsToMeasurements(visitId, vitals);
    if (!rows.length) return;

    const { error } = await supabase.from("visit_measurements").insert(rows);
    if (error) throw new Error(`logVisitMeasurements: ${error.message}`);
}
