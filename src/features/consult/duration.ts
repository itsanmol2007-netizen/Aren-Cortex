// ---------------------------------------------------------------------------
// HOW LONG HAS IT BEEN GOING ON.
//
// The one clinical qualifier a general OPD consultation asks for more than any
// other and had nowhere to put. "Fever" and "fever for eighteen days" are not
// the same complaint, and the catalogue already knows it — `fever_prolonged`
// ("Fever over 2 weeks") and `cough_chronic` ("Cough over 3 weeks") are real
// observables with real rules behind them. What was missing was the number
// that decides which one you are looking at.
//
// ── Why this is not a form field ──────────────────────────────────────────
// Physiotherapy already solved this shape once, in `story.ts`: the composer
// asks the next open question in the same box the doctor is already typing in,
// a skip costs one keystroke, and nothing is ever a permanent row on screen
// (doctrine §4.1, progressive-disclosure.md). This is that mechanism applied
// to General OPD, deliberately reusing its vocabulary of "slot", "skip" and
// "prompt" rather than inventing a second one — see `ClinicalCommandBar`'s
// duration slot.
//
// ── Why not every symptom ─────────────────────────────────────────────────
// Anmol, 2026-09-03: "there are some things where duration is important, like
// for fever and something else. Not literally everything." A box asking how
// long somebody has had a runny nose is the form-filling this screen exists to
// avoid. `ASKS_DURATION` is therefore a curated list, not a rule over the
// catalogue: 280 symptom observables, ~70 of them where the answer changes
// what the doctor does.
//
// ── What the number is allowed to do ──────────────────────────────────────
// Record, and OFFER. It never silently adds an observable — crossing a
// threshold surfaces a one-click suggestion ("18 days — add 'Fever over 2
// weeks'?") exactly the way `suggestIrritability` and MeasureCell's
// `suggested`/`because` already do. Auto-charting `fever_prolonged` would be
// the software making a clinical assertion nobody made, and it would rank
// medicines off it. The doctor confirms; the engine then does the rest with
// content that already exists. No new signals, no new rules (rule 22's spirit
// applied to knowledge-base content, not just compositions).
// ---------------------------------------------------------------------------

/** A duration the doctor can pick, carrying the one unit anything downstream reads. */
export interface DurationChoice {
    /** what it reads as — "3 days", "2 weeks" */
    label: string;
    /** the same thing in days, which is what gets stored and compared */
    days: number;
}

const DAYS_PER = { day: 1, week: 7, month: 30, year: 365 } as const;

/**
 * "3 weeks" / "3w" / "21 days" / "2 months" -> days.
 *
 * Returns null for a bare number: "3" is genuinely ambiguous and guessing
 * days would be wrong about half the time. The caller offers the three
 * readings instead (`durationChoicesFor`), which is what physiotherapy's own
 * duration list has always done in spirit — a clinician types `3` and expects
 * `3 days / 3 weeks / 3 months` back, not a menu of ranges to bin the answer
 * into.
 */
export function parseDurationDays(raw: string): number | null {
    const q = raw.trim().toLowerCase();
    if (!q) return null;
    const m = /^(\d+(?:\.\d+)?)\s*(d|day|days|w|wk|wks|week|weeks|m|mo|mon|month|months|y|yr|yrs|year|years)$/.exec(q);
    if (!m) return null;
    const n = Number.parseFloat(m[1]);
    if (!Number.isFinite(n) || n <= 0) return null;
    const unit = m[2];
    if (unit.startsWith("d")) return Math.round(n * DAYS_PER.day);
    if (unit.startsWith("w")) return Math.round(n * DAYS_PER.week);
    if (unit.startsWith("y")) return Math.round(n * DAYS_PER.year);
    return Math.round(n * DAYS_PER.month);
}

/** A bare positive integer, or null. `"3"` -> 3; `"3 days"` -> null (that's `parseDurationDays`). */
export function bareNumber(raw: string): number | null {
    const q = raw.trim();
    if (!/^\d{1,4}$/.test(q)) return null;
    const n = Number.parseInt(q, 10);
    return n > 0 ? n : null;
}

/** Days, back into the words a clinician would actually say. */
export function formatDuration(days: number): string {
    if (days < 1) return "Today";
    if (days === 1) return "1 day";
    if (days < 14) return `${days} days`;
    if (days % 365 === 0) return `${days / 365} year${days / 365 > 1 ? "s" : ""}`;
    if (days >= 60 && days % 30 === 0) return `${days / 30} months`;
    if (days % 7 === 0) return `${days / 7} weeks`;
    if (days >= 365) return `${Math.round((days / 365) * 10) / 10} years`;
    if (days >= 60) return `${Math.round(days / 30)} months`;
    return `${days} days`;
}

/** The short form a chip wears — "18d", "3w", "4mo". */
export function shortDuration(days: number): string {
    if (days < 14) return `${days}d`;
    if (days < 60) return `${Math.round(days / 7)}w`;
    if (days < 365) return `${Math.round(days / 30)}mo`;
    return `${Math.round((days / 365) * 10) / 10}y`;
}

/**
 * What to offer for a typed query.
 *
 * A bare number gets all three readings; a qualified one ("3 weeks") gets the
 * exact answer alone. THIS is the fix for the complaint that started this
 * work — physiotherapy's duration list is eighteen hard-coded terms, so
 * "4 days" or "37 days" simply had no option to pick, and the clinician was
 * stuck. Nothing is hard-coded here: any number the patient actually said is
 * a real answer.
 */
export function durationChoicesFor(query: string): DurationChoice[] {
    const exact = parseDurationDays(query);
    if (exact !== null) return [{ label: formatDuration(exact), days: exact }];
    const n = bareNumber(query);
    if (n === null) return [];
    return [
        { label: n === 1 ? "1 day" : `${n} days`, days: n },
        { label: n === 1 ? "1 week" : `${n} weeks`, days: n * DAYS_PER.week },
        { label: n === 1 ? "1 month" : `${n} months`, days: n * DAYS_PER.month },
    ];
}

/** The default ladder an empty duration slot offers — the everyday answers. */
export const DURATION_QUICK: DurationChoice[] = [
    { label: "1 day", days: 1 },
    { label: "2 days", days: 2 },
    { label: "3 days", days: 3 },
    { label: "1 week", days: 7 },
    { label: "2 weeks", days: 14 },
    { label: "1 month", days: 30 },
];

// ── Which complaints get asked ────────────────────────────────────────────
//
// Curated by slug, because the answer is clinical and not derivable from the
// catalogue's own columns. Grouped by why duration matters, so the next
// person adding to it can tell whether their symptom belongs.

export const ASKS_DURATION: ReadonlySet<string> = new Set([
    // Fever — the entire acute-vs-prolonged split turns on this number.
    "fever", "fever_high_grade", "fever_low_grade", "fever_with_chills",
    "fever_recurrent", "fever_with_rash", "fever_with_joint_pain",
    "fever_with_body_ache", "fever_with_abdominal_pain", "fever_with_lymphadenopathy",
    // Respiratory — three weeks is the TB-screening threshold.
    "cough", "cough_dry", "cough_productive", "cough_night", "cough_evening_fever",
    "breathlessness", "breathlessness_exertion", "wheeze", "hemoptysis",
    "sore_throat", "nasal_congestion", "runny_nose", "hoarseness",
    // Pain — acute, subacute and chronic are different problems.
    "chest_pain", "chest_pain_pleuritic", "abdominal_pain_upper", "abdominal_pain_lower",
    "abdominal_pain_general", "abdominal_pain_colicky", "ruq_pain", "rlq_pain",
    "flank_pain", "loin_to_groin_pain", "pelvic_pain_gynae",
    "headache", "headache_tension", "headache_migrainous",
    "low_back_pain", "back_pain_upper", "neck_pain", "knee_pain", "shoulder_pain",
    "hip_pain", "elbow_pain", "wrist_hand_pain", "ankle_foot_pain",
    "joint_pain_multiple", "muscle_pain", "bone_pain", "joint_stiffness",
    "pain_radiating_arm", "pain_radiating_leg",
    // Gastrointestinal — acute gastroenteritis vs a chronic bowel problem.
    "diarrhea", "watery_stools", "vomiting", "nausea", "constipation",
    "blood_in_stool", "melena", "rectal_bleeding", "bloating", "indigestion",
    "heartburn", "dysphagia", "appetite_loss",
    // Urinary / gynaecology.
    "dysuria", "hematuria", "urinary_frequency", "vaginal_discharge",
    "bleeding_abnormal", "menorrhagia", "amenorrhea", "periods_irregular",
    // Skin, and the constitutional symptoms a duration reframes entirely.
    "rash", "itching", "hair_fall", "swelling_legs",
    "weight_loss", "weight_gain", "fatigue", "night_sweats",
    "dizziness", "vertigo", "palpitations", "numbness", "tingling",
    // Mental health — most criteria are defined by a duration.
    "low_mood", "sadness_persistent", "anxiety", "insomnia", "sleep_onset_difficulty",
    "memory_loss", "concentration_poor",
]);

/**
 * A duration that crosses a threshold and the observable it makes true.
 *
 * Every `toSlug` below is a REAL, live observable — checked against
 * `observables` in Postgres, not assumed from clinical plausibility, the same
 * discipline `story.ts` applies to its `signalId`s. Nothing here mints
 * catalogue content; it only routes a number to a chip that already exists and
 * already ranks.
 */
export interface DurationEscalation {
    /** at or above this many days */
    minDays: number;
    /** the observable slug this makes true */
    toSlug: string;
}

const PAIN_CHRONIC: DurationEscalation = { minDays: 90, toSlug: "pain_chronic" };

export const DURATION_ESCALATIONS: Readonly<Record<string, DurationEscalation[]>> = {
    fever: [{ minDays: 14, toSlug: "fever_prolonged" }],
    fever_high_grade: [{ minDays: 14, toSlug: "fever_prolonged" }],
    fever_low_grade: [{ minDays: 14, toSlug: "fever_prolonged" }],
    fever_with_chills: [{ minDays: 14, toSlug: "fever_prolonged" }],
    cough: [{ minDays: 21, toSlug: "cough_chronic" }],
    cough_dry: [{ minDays: 21, toSlug: "cough_chronic" }],
    cough_productive: [{ minDays: 21, toSlug: "cough_chronic" }],
    cough_night: [{ minDays: 21, toSlug: "cough_chronic" }],
    low_back_pain: [PAIN_CHRONIC],
    neck_pain: [PAIN_CHRONIC],
    knee_pain: [PAIN_CHRONIC],
    shoulder_pain: [PAIN_CHRONIC],
    hip_pain: [PAIN_CHRONIC],
    joint_pain_multiple: [PAIN_CHRONIC],
    back_pain_upper: [PAIN_CHRONIC],
    muscle_pain: [PAIN_CHRONIC],
    headache: [PAIN_CHRONIC],
};

/** The escalation this duration reaches, if any. Highest threshold first. */
export function escalationFor(slug: string, days: number): DurationEscalation | null {
    const rules = DURATION_ESCALATIONS[slug];
    if (!rules) return null;
    const hit = [...rules].sort((a, b) => b.minDays - a.minDays).find((r) => days >= r.minDays);
    return hit ?? null;
}

/**
 * Which complaints on the sheet are still owed a duration, oldest first.
 *
 * The one place that question is answered, so the command bar's slot and any
 * future surface asking the same thing cannot disagree about it. Symptoms
 * only — a duration qualifies a complaint, not an examination finding and not
 * a standing history item ("Known diabetic for 3 days" is not a sentence).
 */
export function durationCandidates(
    entries: readonly { label: string; kind: string; durationDays?: number }[],
    slugByLabel: ReadonlyMap<string, string>
): string[] {
    const out: string[] = [];
    for (const e of entries) {
        if (e.kind !== "symptom") continue;
        if (e.durationDays != null) continue;
        const slug = slugByLabel.get(e.label);
        if (slug && ASKS_DURATION.has(slug)) out.push(e.label);
    }
    return out;
}
