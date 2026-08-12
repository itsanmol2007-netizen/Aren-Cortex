// ---------------------------------------------------------------------------
// PAEDIATRIC GROWTH — turning a weight and an age into something clinical.
//
// A bare "12 kg" means nothing. Twelve kilos is a thriving 2-year-old, a
// borderline 3-year-old and a severely underweight 5-year-old. The number only
// becomes a finding once it is read against age and sex, and that reading is
// arithmetic the doctor should never be doing by hand — nor eyeballing off a
// wall chart, because whatever they conclude never reaches the engine.
//
// This module is PURE: no React, no Supabase, no I/O (rule 4 in §14 of the
// atlas). It is the paediatric equivalent of `consultInput.ts`'s BP split —
// the one place a raw measurement becomes something a rule can match.
//
// ── The method ─────────────────────────────────────────────────────────────
// WHO publishes its standards as LMS coefficients: a Box-Cox power (L), the
// median (M) and a coefficient of variation (S) for every age. The z-score is
//
//     z = ((X/M)^L − 1) / (L·S)        for L ≠ 0
//     z = ln(X/M) / S                  for L = 0
//
// ── The extreme-value correction, and why it is not optional ───────────────
// Beyond ±3 SD the LMS curve stops being trustworthy — the Box-Cox tail is
// fitted to almost no children, and raw z values out there are wildly
// unstable. WHO's own software therefore rescales the tails linearly using the
// width of the 2–3 SD band. Skipping this does not produce a slightly wrong
// number; it produces numbers like −7 SD on a child who is severely but
// survivably underweight, which is exactly the range where the classification
// changes management. Applied to weight-based indicators only — WHO does not
// apply it to height-for-age.
// ---------------------------------------------------------------------------

import {
    WFABOYS_LMS, WFAGIRLS_LMS, HFABOYS_LMS, HFAGIRLS_LMS,
    WHO_MAX_MONTH, type LMS,
} from "./whoStandards";

export type Sex = "male" | "female";

/** Which standard to read against. */
export type GrowthMetric = "weight-for-age" | "height-for-age";

const TABLES: Record<GrowthMetric, Record<Sex, readonly LMS[]>> = {
    "weight-for-age": { male: WFABOYS_LMS, female: WFAGIRLS_LMS },
    "height-for-age": { male: HFABOYS_LMS, female: HFAGIRLS_LMS },
};

/**
 * WHO applies the tail correction to weight-based indicators. Height-for-age
 * uses the raw z at every value — a very short child is genuinely −4 SD and
 * the figure is meaningful.
 */
const NEEDS_TAIL_CORRECTION: Record<GrowthMetric, boolean> = {
    "weight-for-age": true,
    "height-for-age": false,
};

/** The value at exactly `z` standard deviations, from an LMS triple. */
function valueAtZ([L, M, S]: LMS, z: number): number {
    return L === 0 ? M * Math.exp(S * z) : M * Math.pow(1 + L * S * z, 1 / L);
}

/**
 * L, M and S at a fractional age in months, linearly interpolated between the
 * two whole months either side. The three coefficients are smooth in age, so
 * interpolating them is both standard practice and far more accurate than
 * snapping the age to the nearest month.
 */
function lmsAt(table: readonly LMS[], months: number): LMS {
    const lo = Math.floor(months);
    const hi = Math.min(lo + 1, WHO_MAX_MONTH);
    const t = months - lo;
    if (lo >= WHO_MAX_MONTH) return table[WHO_MAX_MONTH];
    const a = table[lo];
    const b = table[hi];
    return [
        a[0] + (b[0] - a[0]) * t,
        a[1] + (b[1] - a[1]) * t,
        a[2] + (b[2] - a[2]) * t,
    ];
}

/** Φ(z) — standard normal CDF. Abramowitz & Stegun 7.1.26, error < 1.5e-7. */
function normalCdf(z: number): number {
    const sign = z < 0 ? -1 : 1;
    const x = Math.abs(z) / Math.SQRT2;
    const t = 1 / (1 + 0.3275911 * x);
    const y =
        1 -
        ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t +
            0.254829592) *
        t *
        Math.exp(-x * x);
    return 0.5 * (1 + sign * y);
}

export interface GrowthReading {
    metric: GrowthMetric;
    /** standard deviations from the median for this age and sex */
    z: number;
    /** 0–100, derived from z */
    percentile: number;
    /** the median value a child of this age and sex would have */
    median: number;
    /** true when the ±3 SD tail correction changed the answer */
    tailCorrected: boolean;
}

/**
 * The z-score for one measurement.
 *
 * Returns null rather than a number whenever the standards do not apply —
 * an age outside 0–60 months, a non-finite input, or a value at or below zero.
 * REFUSING IS THE POINT. Extrapolating past five years silently produces a
 * confident number from a curve that was never fitted there, and a wrong
 * percentile on a real child is worse than no percentile at all: it is a
 * clinical assertion nobody made.
 */
export function growthZ(
    metric: GrowthMetric,
    value: number,
    ageMonths: number,
    sex: Sex,
): GrowthReading | null {
    if (!Number.isFinite(value) || value <= 0) return null;
    if (!Number.isFinite(ageMonths) || ageMonths < 0 || ageMonths > WHO_MAX_MONTH) return null;

    const lms = lmsAt(TABLES[metric][sex], ageMonths);
    const [L, M, S] = lms;

    let z = L === 0 ? Math.log(value / M) / S : (Math.pow(value / M, L) - 1) / (L * S);
    let tailCorrected = false;

    if (NEEDS_TAIL_CORRECTION[metric]) {
        if (z > 3) {
            const sd3 = valueAtZ(lms, 3);
            const band = sd3 - valueAtZ(lms, 2);
            z = 3 + (value - sd3) / band;
            tailCorrected = true;
        } else if (z < -3) {
            const sd3 = valueAtZ(lms, -3);
            const band = valueAtZ(lms, -2) - sd3;
            z = -3 + (value - sd3) / band;
            tailCorrected = true;
        }
    }

    if (!Number.isFinite(z)) return null;

    return {
        metric,
        z: Math.round(z * 100) / 100,
        percentile: Math.round(normalCdf(z) * 1000) / 10,
        median: Math.round(M * 100) / 100,
        tailCorrected,
    };
}

// ── Classification ──────────────────────────────────────────────────────────
// WHO's own cut-offs, and only WHO's. These are the words a paediatrician
// already uses, so the card can say them without inventing a vocabulary.

export type GrowthClass =
    | "severely-underweight" | "underweight"
    | "severely-stunted" | "stunted"
    | "normal" | "above-expected";

export function classify(reading: GrowthReading): GrowthClass {
    const { z, metric } = reading;
    if (metric === "weight-for-age") {
        if (z < -3) return "severely-underweight";
        if (z < -2) return "underweight";
        // WHO deliberately does NOT read overweight off weight-for-age — a
        // heavy child may simply be a tall one. That question belongs to
        // weight-for-height / BMI-for-age, which this module does not carry.
        if (z > 2) return "above-expected";
        return "normal";
    }
    if (z < -3) return "severely-stunted";
    if (z < -2) return "stunted";
    return "normal";
}

export const CLASS_LABEL: Record<GrowthClass, string> = {
    "severely-underweight": "Severely underweight for age",
    "underweight": "Underweight for age",
    "severely-stunted": "Severely stunted",
    "stunted": "Stunted",
    "normal": "Within the expected range",
    "above-expected": "Above the expected range",
};

/** Whether this reading is one the engine should hear about. */
export function isAbnormal(c: GrowthClass): boolean {
    return c !== "normal";
}
