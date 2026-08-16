// ---------------------------------------------------------------------------
// THE LONGITUDINAL TREND — turning a patient's visit history into "is this
// working?"
//
// Built 2026-08-16 for `docs/Cortex Specialties/cortex-longitudinal-spec.md`
// §3.1, which asks for one thing above everything else in this phase: a
// returning patient's screen should answer whether the treatment is working
// before the doctor types anything. The existing header answered "how many
// times have they been here", which is a different and much less useful
// question.
//
// ── This file is arithmetic, and that is a requirement, not a limitation
//
// The spec is explicit: "generated algorithmically from stored signals — no
// AI, no API round-trip." Everything here is pure. It takes the visit rows
// already loaded for the past-visit rail, plus whatever is on screen right
// now, and returns series. No fetch, no clock beyond the `now` it is handed,
// no React. That makes the whole thing testable from a node script, which is
// `scripts/longitudinal-trend.mjs` — and given this feature draws a
// conclusion about whether a patient is getting better, a testable core
// matters more here than in most places.
//
// ── The five things that are easy to get wrong, and are handled here
//
// Each of these is one of the spec's §6 edge cases, and each one produces a
// CONFIDENT WRONG ANSWER rather than an obvious failure if it is skipped —
// which is the whole reason they are listed there and handled here.
//
//  1. DIRECTION. Lower pain is better, higher range of motion is better, and
//     body weight depends entirely on who is asking. Get this wrong and the
//     band tells a doctor their patient is improving while they deteriorate.
//     Direction comes from the field (`betterWhen`), overridable per specialty
//     (`TrendEntry.betterWhen`) — see both for why weight has no fixed answer.
//
//  2. GAPS. Some visits do not record the measurement being trended. Those
//     visits are not points. Nothing is interpolated and nothing is
//     carried forward: a series of four readings across nine visits says four
//     readings across nine visits.
//
//  3. SAME-DAY REPEATS. A patient seen twice in one day must not become two
//     points — that is a made-up movement. The later reading of a day wins,
//     because it is the one taken after whatever happened in between.
//
//  4. LONG ABSENCE. A year-old reading presented next to today's, with no
//     comment, reads as a recent comparison. The series reports its own gap so
//     the band can say so out loud.
//
//  5. NOISE. 70.0 kg to 70.2 kg is not weight loss and 98.6 °F to 98.7 °F is
//     not a fever breaking. Every field declares the smallest change worth
//     calling a change (`trendNoise`), and anything under it reads steady.
//
// ── Units
//
// The spec's "unit inconsistency" case is mostly closed by construction here:
// each field has exactly one unit, declared in the catalogue, and the input
// card does not offer a choice. The one genuine exception is temperature,
// where the app's own downstream code already accepts that a doctor may type
// 38 meaning °C, so `readValue` applies the same magnitude heuristic
// `consultInput.ts` uses rather than inventing a second one. Blood pressure is
// the other special read: it is stored as one string and trended on the
// systolic, which is the number its warning band is written against.
// ---------------------------------------------------------------------------

import {
    FIELD_BY_KEY,
    type BetterWhen,
    type MeasureField,
    type MeasureFieldKey,
} from "./measures";
import type { TrendEntry } from "../synapse/specialtyProfile";

/** One real reading, at the visit it was taken. */
export interface TrendPoint {
    /** the visit this reading came from — `null` for the consult in progress */
    visitId: string | null;
    /** ISO timestamp of the visit */
    at: string;
    value: number;
    /** true for the reading being typed right now, which is not yet saved */
    isToday: boolean;
}

export type TrendVerdict = "improving" | "worsening" | "steady" | "neutral";

export interface TrendSeries {
    key: MeasureFieldKey;
    /** the field's own short name, without the unit */
    label: string;
    unit: string;
    /** oldest first, one per visit that actually recorded this measurement */
    points: TrendPoint[];
    first: number;
    last: number;
    /** last − first, in the field's own unit. Signed. */
    delta: number;
    direction: BetterWhen;
    verdict: TrendVerdict;
    /** how many visits this series spans — i.e. `points.length` */
    sessions: number;
    /** whole days between the first and last point */
    spanDays: number;
}

/** What a visit looks like to this module. Deliberately minimal. */
export interface TrendVisit {
    id: string;
    created_at: string;
    vitals: Record<string, unknown> | null;
}

export interface TrendSummary {
    /** the series worth showing, in the specialty's priority order */
    series: TrendSeries[];
    /** completed visits this patient has, whether or not they carry readings */
    visitCount: number;
    /** ISO date of the most recent completed visit, or null for a first visit */
    lastVisitAt: string | null;
    /**
     * Whole days since that visit. The band says this out loud past
     * `LONG_ABSENCE_DAYS` — see below.
     */
    daysSinceLastVisit: number | null;
    /** true when the gap is long enough that old numbers must not read as recent */
    isLongAbsence: boolean;
}

/**
 * What counts as "this patient has been away long enough that their old
 * numbers are a different clinical situation".
 *
 * 120 days rather than a round year. The spec's example is a patient
 * returning after a year, but the failure it describes — old numbers reading
 * as recent — starts long before that, and the specialties this is built for
 * put their visits weeks apart. Four months is past every normal follow-up
 * interval in the product (the follow-up selector tops out at custom, and
 * routine chronic review is three-monthly), so crossing it means the patient
 * genuinely dropped out of care rather than merely took their time.
 */
export const LONG_ABSENCE_DAYS = 120;

/** The most series the band will draw. Beyond this it stops being a glance. */
export const MAX_SERIES = 4;

const DAY_MS = 86_400_000;

/**
 * Read one measurement out of a stored vitals blob.
 *
 * Returns null for everything that is not a real number: absent keys, the
 * empty strings `saveConsultation` writes for fields the doctor left blank
 * (which is MOST of what is in the column — a visit typically records two of
 * the five fields on screen), and anything a past build of the app happened
 * to write that is no longer a number.
 */
export function readValue(field: MeasureField, vitals: Record<string, unknown> | null): number | null {
    if (!vitals) return null;
    const raw = vitals[field.key];
    if (raw === null || raw === undefined) return null;
    const text = String(raw).trim();
    if (!text) return null;

    // Blood pressure is one string and two numbers. The systolic is what the
    // field's own warning band is written against, so it is what a "band"
    // verdict has to be computed from — trending the diastolic instead would
    // silently disagree with the amber state on the same cell.
    if (field.kind === "bp") {
        const sys = Number.parseFloat(String(text).split("/")[0] ?? "");
        return Number.isFinite(sys) ? sys : null;
    }

    // Non-numeric fields cannot be trended at all: a blood group does not have
    // a direction and a G-P-L-A is four numbers in a trench coat.
    if (field.kind === "select" || field.kind === "date" || field.kind === "gpla") return null;

    const n = Number.parseFloat(text);
    if (!Number.isFinite(n)) return null;

    // Temperature only. `consultInput.ts` already accepts that a doctor may
    // type 38 meaning °C into a box labelled °F, and converts by magnitude.
    // The same heuristic has to run here or a series holding one of each would
    // report a 60-degree drop — the spec's "unit inconsistency must not
    // silently produce a fake trend" case, and the only field in the catalogue
    // where it can actually happen.
    if (field.key === "temp" && n < 50) return n * 9 / 5 + 32;

    return n;
}

/**
 * Collapse readings that share a calendar day, keeping the later one.
 *
 * A patient seen twice in a day — sent for a test and returning with it, or
 * simply re-registered by the front desk — must not produce two points. The
 * later reading wins because it is the one taken after whatever the first
 * visit did.
 *
 * Day boundaries are LOCAL, not UTC: a clinic's second visit of the day is a
 * second visit of ITS day, and an evening consult in IST is already tomorrow
 * in UTC.
 */
function collapseSameDay(points: TrendPoint[]): TrendPoint[] {
    const byDay = new Map<string, TrendPoint>();
    for (const p of points) {
        const d = new Date(p.at);
        const day = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
        const existing = byDay.get(day);
        // `points` arrives oldest-first, so a later entry for the same day is
        // by definition the later reading. `isToday` wins outright: the
        // reading being typed now is the freshest thing there is.
        if (!existing || p.isToday || new Date(p.at) >= new Date(existing.at)) {
            byDay.set(day, p);
        }
    }
    return [...byDay.values()].sort((a, b) => +new Date(a.at) - +new Date(b.at));
}

/**
 * How far a value sits outside its field's normal band, in the field's own
 * unit. Zero when it is inside.
 *
 * This exists so a "band" field can have a direction at all. It reads the
 * thresholds by BISECTING the field's own `warn` predicate rather than by
 * restating them, which keeps the one promise that matters here: the trend
 * arrow and the amber cell can never disagree about what out-of-range means,
 * because there is only one definition and this reads it.
 *
 * Bisection rather than a declared min/max because `warn` is a free function —
 * some fields warn on one side only (HbA1c), some on both (pulse), and one is
 * not a simple range at all. 40 iterations over the field's plausible span
 * lands well inside any unit anyone measures in.
 */
function distanceOutsideBand(field: MeasureField, value: number): number {
    if (!field.warn) return 0;
    const inBand = (n: number) => !field.warn!(String(n));
    if (inBand(value)) return 0;

    // Walk outward from the value to find the nearest in-band number. The
    // search span is generous on purpose: it costs nothing and a field whose
    // band sits far from the reading (a 400 mg/dL glucose) still resolves.
    let lo = value;
    let hi = value;
    let found: number | null = null;
    for (let step = 1; step <= 4096; step *= 2) {
        if (inBand(value - step)) { lo = value - step; hi = value; found = lo; break; }
        if (inBand(value + step)) { lo = value; hi = value + step; found = hi; break; }
    }
    if (found === null) return 0;

    // Bisect to the exact edge so the distance is the real one, not the
    // doubling step that happened to find it.
    for (let i = 0; i < 40; i++) {
        const mid = (lo + hi) / 2;
        if (inBand(mid)) {
            if (found === lo) lo = mid; else hi = mid;
        } else {
            if (found === lo) hi = mid; else lo = mid;
        }
    }
    return Math.abs(value - (found === lo ? lo : hi));
}

/**
 * Improving, worsening, steady — or no opinion at all.
 *
 * `neutral` is returned for `betterWhen: "none"` and it is a real answer: the
 * band still prints "70 → 72 kg, +2" and simply declines to colour it. That is
 * doctrine §5 ("ranking is a safety property, never a verdict") applied to a
 * trend arrow, and it is why body weight has no fixed direction — see
 * `measures.ts`.
 */
export function verdictFor(
    field: MeasureField,
    direction: BetterWhen,
    first: number,
    last: number,
): TrendVerdict {
    if (direction === "none") return "neutral";

    const noise = field.trendNoise ?? 0;

    if (direction === "band") {
        // Distance from the normal range is the thing that improved or did
        // not. This reads correctly in all four cases that matter: out to in
        // (improving), in to out (worsening), further out (worsening), and two
        // readings both comfortably inside (steady — which is right, because a
        // pulse of 68 is not "better" than 72).
        const before = distanceOutsideBand(field, first);
        const after = distanceOutsideBand(field, last);
        const moved = after - before;
        if (Math.abs(moved) < noise) return "steady";
        return moved < 0 ? "improving" : "worsening";
    }

    const moved = last - first;
    if (Math.abs(moved) < noise) return "steady";
    const better = direction === "lower" ? moved < 0 : moved > 0;
    return better ? "improving" : "worsening";
}

/**
 * Build one series, or null if there is not enough to say anything.
 *
 * Two real readings is the floor. One reading is a measurement, not a trend,
 * and drawing an arrow off it would be inventing a direction from a single
 * point — the spec's "must never render an empty or broken frame" case at the
 * per-series level.
 */
export function buildSeries(
    entry: TrendEntry,
    visits: TrendVisit[],
    todayVitals: Record<string, unknown> | null,
    now: number,
): TrendSeries | null {
    const field = FIELD_BY_KEY.get(entry.key);
    if (!field) return null;

    const points: TrendPoint[] = [];
    // Oldest first. The caller hands these over newest-first (that is the
    // order the past-visit rail wants), so the sort is done here rather than
    // relied on.
    const chronological = [...visits].sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at));
    for (const v of chronological) {
        const value = readValue(field, v.vitals);
        if (value === null) continue;
        points.push({ visitId: v.id, at: v.created_at, value, isToday: false });
    }

    // The consult in progress counts as the newest point the moment a number
    // is typed. Without this the band would tell a physio their patient's pain
    // was 7 → 5 while a 4 sat on screen beside it, which is the one comparison
    // they came to make.
    const todayValue = readValue(field, todayVitals);
    if (todayValue !== null) {
        points.push({ visitId: null, at: new Date(now).toISOString(), value: todayValue, isToday: true });
    }

    const collapsed = collapseSameDay(points);
    if (collapsed.length < 2) return null;

    const first = collapsed[0].value;
    const last = collapsed[collapsed.length - 1].value;
    const direction = entry.betterWhen ?? field.betterWhen;

    return {
        key: field.key,
        label: field.shortLabel,
        unit: field.unit,
        points: collapsed,
        first,
        last,
        delta: last - first,
        direction,
        verdict: verdictFor(field, direction, first, last),
        sessions: collapsed.length,
        spanDays: Math.round(
            (+new Date(collapsed[collapsed.length - 1].at) - +new Date(collapsed[0].at)) / DAY_MS
        ),
    };
}

/**
 * The whole band's data, from a specialty's priority list and a patient's
 * history.
 *
 * Reads DOWN the priority list and keeps the first `MAX_SERIES` entries that
 * have two or more real readings. That is what lets one physiotherapy
 * configuration serve a knee patient and a shoulder patient without either
 * being configured — see `SpecialtyProfile.trend`.
 *
 * `visits` should be the patient's COMPLETED visits (which is what
 * `fetchPatientVisits` returns); an abandoned consult is not a session and
 * must not be counted as one.
 */
export function buildTrendSummary(args: {
    trend: TrendEntry[];
    visits: TrendVisit[];
    todayVitals: Record<string, unknown> | null;
    now?: number;
}): TrendSummary {
    const now = args.now ?? Date.now();
    const { trend, visits, todayVitals } = args;

    const series: TrendSeries[] = [];
    for (const entry of trend) {
        if (series.length >= MAX_SERIES) break;
        const s = buildSeries(entry, visits, todayVitals, now);
        if (s) series.push(s);
    }

    const sorted = [...visits].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
    const lastVisitAt = sorted.length ? sorted[0].created_at : null;
    const daysSinceLastVisit = lastVisitAt
        ? Math.floor((now - +new Date(lastVisitAt)) / DAY_MS)
        : null;

    return {
        series,
        visitCount: visits.length,
        lastVisitAt,
        daysSinceLastVisit,
        isLongAbsence: daysSinceLastVisit !== null && daysSinceLastVisit >= LONG_ABSENCE_DAYS,
    };
}

/**
 * The change since the immediately previous visit, for the "vs last" line
 * under a reading on the Measurements card.
 *
 * This is a different question from the series above and deliberately a
 * separate function: the band answers "across this course", this answers
 * "since last time". A physio progressing an exercise cares about both and
 * they are frequently different — pain 7 → 4 across the course, but 5 → 4
 * since Tuesday.
 *
 * Returns null when there is no previous reading to compare against, which is
 * the common case and must render as nothing rather than as a zero.
 */
export function lastReadingOf(
    key: MeasureFieldKey,
    visits: TrendVisit[],
): { value: number; at: string } | null {
    const field = FIELD_BY_KEY.get(key);
    if (!field) return null;
    const sorted = [...visits].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
    for (const v of sorted) {
        const value = readValue(field, v.vitals);
        if (value !== null) return { value, at: v.created_at };
    }
    return null;
}

/**
 * Format a delta the way it should be read: signed, and rounded to the
 * precision the field is actually measured at rather than to whatever
 * floating-point subtraction produced.
 */
export function formatDelta(delta: number): string {
    const rounded = Math.abs(delta) < 10 ? Math.round(delta * 10) / 10 : Math.round(delta);
    if (rounded === 0) return "0";
    return `${rounded > 0 ? "+" : "−"}${Math.abs(rounded)}`;
}

/** A reading, printed. Same rounding rule as `formatDelta`. */
export function formatValue(value: number): string {
    return String(Math.abs(value) < 10 ? Math.round(value * 10) / 10 : Math.round(value));
}
