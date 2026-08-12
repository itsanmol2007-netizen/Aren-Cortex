// ---------------------------------------------------------------------------
// AGE — the one place a date of birth becomes a number.
//
// `patients.age` (integer years) is required and is what the whole app reads.
// `patients.date_of_birth` is optional and, when present, is the source of
// truth for EXACT age. Only paediatric growth needs that precision, but the
// derivation must live in exactly one place or the two will disagree — the
// same argument `consultInput.ts` makes about the BP split.
//
// Pure: no React, no Supabase (§14 rule 4).
// ---------------------------------------------------------------------------

/** WHO's own month length, and the one the growth tables were sampled on. */
export const DAYS_PER_MONTH = 30.4375;

/**
 * Age in months from a date of birth, as of `asOf` (defaults to today).
 *
 * Returns null for anything that is not a usable date — absent, unparseable,
 * or in the future. A future date of birth is a typo every time, and the one
 * thing it must never do is run the interval backwards and hand the growth
 * standards a negative age.
 */
export function ageInMonths(dob: string | null | undefined, asOf: Date = new Date()): number | null {
    if (!dob) return null;
    const born = new Date(dob);
    if (!Number.isFinite(born.getTime())) return null;
    const days = (asOf.getTime() - born.getTime()) / 86_400_000;
    if (!Number.isFinite(days) || days < 0) return null;
    return days / DAYS_PER_MONTH;
}

/**
 * Whole years from a date of birth — what `patients.age` holds.
 *
 * Exposed so intake can DERIVE the age field from a date of birth instead of
 * asking for both and letting them drift. A date is the harder fact and the
 * one worth capturing; the integer should follow from it, never contradict it.
 */
export function ageInYears(dob: string | null | undefined, asOf: Date = new Date()): number | null {
    const months = ageInMonths(dob, asOf);
    return months === null ? null : Math.floor(months / 12);
}

/**
 * Is this the kind of patient whose date of birth actually changes the
 * consultation?
 *
 * WHO's growth standards run 0–60 months, so five and under is exactly the
 * window where a year of rounding is the difference between a healthy child
 * and an underweight one. Intake uses this to mark the field as needed rather
 * than merely available — a prompt that appears for every adult is a prompt
 * receptionists learn to ignore.
 */
export function dobMattersFor(ageYears: number | null | undefined): boolean {
    return ageYears !== null && ageYears !== undefined && Number.isFinite(ageYears) && ageYears <= 5;
}

/** Today as yyyy-mm-dd, for `max` on a date input. */
export function todayIso(asOf: Date = new Date()): string {
    return new Date(asOf.getTime() - asOf.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}
