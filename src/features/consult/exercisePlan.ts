// ---------------------------------------------------------------------------
// THE EXERCISE PLAN — dose, and whether it went up since last time.
//
// Built 2026-08-16 as the last piece of the physiotherapy screen. Anmol's
// mockup shows every exercise row carrying a badge — Progressed, Same, Added —
// and the longitudinal spec (§5, Physiotherapy) says why it matters:
//
//     "Treatment is progressive — the exercise prescription is supposed to get
//      harder as the patient improves... A physio opening session 9 needs
//      what was prescribed last session so they can progress it rather than
//      repeat it."
//
// ── Why an exercise needed a structure at all
//
// Until now an accepted exercise became a LINE OF TEXT in `adviceNotes`,
// alongside referrals and advice. "Straight leg raise — 3 sets x 12" was one
// string, so the dose was a fact about the sentence rather than about the
// prescription. Nothing could compare two visits, because comparing them means
// comparing numbers and there were none — only prose that happened to contain
// digits.
//
// ── The volume model, and its deliberate crudeness
//
// One number per line: sets x (reps or hold seconds) x times per day. That is
// enough to answer "did this get harder?", which is the only question the
// badge answers. It is NOT a training-load model — it does not know that a
// wall sit at 45 seconds is harder than one at 30 in a way that differs from
// twelve reps becoming fifteen, and it cannot see load in kilograms because
// this build does not record any.
//
// Crude is correct here. The badge is a REMINDER of what the physio did last
// time, not an assessment of it, and the numbers are always on screen beside
// it so the doctor can disagree at a glance. The standing design principle at
// the top of the longitudinal spec applies with full force: never fight the
// doctor's ego, nothing reads as an instruction.
//
// ── What is compared to what
//
// Identity is `intentId` plus SIDE, not the label. A left knee and a right
// knee doing the same exercise are two lines and must not collapse into one —
// a physio progressing the operated side while holding the other would
// otherwise see a single confusing badge. A free-typed exercise has no intent
// id and falls back to its label.
// ---------------------------------------------------------------------------

export type ExerciseSide = "left" | "right" | "both";

export interface ExerciseDose {
    sets: number | null;
    reps: number | null;
    /** an isometric hold, in seconds — mutually exclusive with `reps` in practice */
    holdSeconds: number | null;
    /** times per day */
    perDay: number | null;
}

export interface ExerciseLine extends ExerciseDose {
    /** client-side row id; not the database id */
    id: string;
    /** the engine intent this came from, or null when typed freehand */
    intentId: number | null;
    label: string;
    side: ExerciseSide | null;
    notes: string;
    sortOrder: number;
}

/**
 * How this line compares with the same line last session.
 *
 * `unknown` is a real outcome and it renders as NO badge: it means one of the
 * two prescriptions carried numbers and the other did not, so any badge would
 * be a claim the data does not support. Silence is the honest rendering.
 */
export type Progression = "added" | "progressed" | "same" | "eased" | "unknown";

/**
 * What identifies this exercise across visits. See the header on why side is
 * part of it.
 */
export function identityOf(line: Pick<ExerciseLine, "intentId" | "label" | "side">): string {
    const base = line.intentId != null ? `i${line.intentId}` : `l${line.label.trim().toLowerCase()}`;
    return `${base}::${line.side ?? "-"}`;
}

/**
 * One comparable number for a prescription, or null when it carries none.
 *
 * `reps` and `holdSeconds` are alternatives, not additions — an exercise is
 * either counted or held. When a line somehow carries both, reps wins, because
 * that is the one a physio wrote deliberately if they filled in two boxes.
 */
export function volumeOf(d: ExerciseDose): number | null {
    const unit = d.reps ?? d.holdSeconds;
    if (d.sets == null && unit == null && d.perDay == null) return null;
    return (d.sets ?? 1) * (unit ?? 1) * (d.perDay ?? 1);
}

/**
 * Today's line against last session's, if there was one.
 */
/** Which unit this prescription is counted in, or null when it carries none. */
function unitOf(d: ExerciseDose): "reps" | "hold" | null {
    if (d.reps != null) return "reps";
    if (d.holdSeconds != null) return "hold";
    return null;
}

export function progressionOf(today: ExerciseDose, last: ExerciseDose | undefined): Progression {
    if (!last) return "added";

    // ── Changing the unit is not progression, in either direction ──────────
    //
    // Found in the browser, 2026-08-16: switching a line from 3 × 12 reps to
    // 3 × 10 sec produced volumes of 36 and 30, so the badge read "Eased" —
    // a confident comparison between repetitions and seconds. The header
    // above promises reps and holds are never added together, and they are
    // not; this is the same mistake one level up, ACROSS visits rather than
    // within a line, and `volumeOf` alone cannot catch it because both
    // numbers are perfectly valid on their own.
    //
    // A physiotherapist who converts an exercise from counted to held has
    // changed the prescription in a way no single number can rank. Silence is
    // the only honest answer.
    // Any DISAGREEMENT about the unit, including one side having none at all:
    // "3 sets" last session against "3 × 12" today is not a progression from 3
    // to 36, it is a prescription whose repetitions were never written down.
    // Both sides unit-less is not a disagreement — two undosed prescriptions
    // fall through and compare on sets and frequency, which is all they have.
    const nowUnit = unitOf(today);
    const thenUnit = unitOf(last);
    if (nowUnit !== thenUnit) return "unknown";

    const now = volumeOf(today);
    const then = volumeOf(last);

    // Neither prescription carried numbers. Nothing changed, and saying so is
    // accurate rather than evasive — an undosed exercise repeated is the same
    // exercise repeated.
    if (now === null && then === null) return "same";
    // Exactly one side has numbers. There is no honest comparison to draw.
    if (now === null || then === null) return "unknown";

    if (now > then) return "progressed";
    if (now < then) return "eased";
    return "same";
}

export interface PlanComparison {
    /** row identity -> how it compares with last session */
    byIdentity: Map<string, Progression>;
    /** lines on last session's plan that are NOT on today's */
    dropped: ExerciseLine[];
    /** true when there is a previous plan to compare against at all */
    hasPrevious: boolean;
}

/**
 * Compare a whole plan with the previous session's.
 *
 * `dropped` is not in Anmol's mockup and is here because a physiotherapist
 * dropping an exercise is a decision as real as progressing one, and today's
 * list cannot show a line that is not on it. The card states the count rather
 * than re-listing them — a prompt, not a checklist, same rule as the exam
 * suggestions cap.
 */
export function comparePlans(today: ExerciseLine[], previous: ExerciseLine[]): PlanComparison {
    const prevByIdentity = new Map(previous.map((l) => [identityOf(l), l]));
    const byIdentity = new Map<string, Progression>();

    for (const line of today) {
        const id = identityOf(line);
        // A first-ever plan has no previous session, so every line reads
        // "added" — which is true, and is why `hasPrevious` exists for the
        // card to decide whether to print any badges at all.
        byIdentity.set(id, progressionOf(line, prevByIdentity.get(id)));
    }

    const todayIds = new Set(today.map(identityOf));
    const dropped = previous.filter((l) => !todayIds.has(identityOf(l)));

    return { byIdentity, dropped, hasPrevious: previous.length > 0 };
}

/**
 * The dose, printed the way a physiotherapist writes it.
 *
 * Returns "" when the line carries no numbers — the caller renders nothing
 * rather than an empty bracket. "3 x 12" and "3 x 30 sec" are the two shapes;
 * "twice daily" is appended only when it is not once.
 */
export function formatDose(d: ExerciseDose): string {
    const parts: string[] = [];
    const unit = d.reps != null ? `${d.reps}` : d.holdSeconds != null ? `${d.holdSeconds} sec` : null;

    if (d.sets != null && unit) parts.push(`${d.sets} × ${unit}`);
    else if (d.sets != null) parts.push(`${d.sets} sets`);
    else if (unit) parts.push(unit);

    if (d.perDay != null && d.perDay !== 1) parts.push(`${d.perDay}× daily`);

    return parts.join(" · ");
}

/** The side, as a short suffix. "" for an unsided or bilateral exercise. */
export function formatSide(side: ExerciseSide | null): string {
    if (side === "left") return "L";
    if (side === "right") return "R";
    return "";
}

/** One line, printed — for the prescription and the plan rail. */
export function formatLine(line: ExerciseLine): string {
    const dose = formatDose(line);
    const side = formatSide(line.side);
    const head = side ? `${line.label} (${side})` : line.label;
    const tail = [dose, line.notes.trim()].filter(Boolean).join(" · ");
    return tail ? `${head} — ${tail}` : head;
}

/**
 * The default dose a newly added exercise starts on.
 *
 * Three sets of ten is the most common starting prescription in outpatient
 * musculoskeletal physiotherapy, and starting from SOMETHING is what makes the
 * one-key add worth having — the alternative is a row of empty boxes that the
 * physio must fill before the line means anything. Every number is editable
 * on the row, and the badge only ever compares against what was actually
 * saved, so a default that a physio overrides costs nothing.
 */
export const DEFAULT_DOSE: ExerciseDose = {
    sets: 3,
    reps: 10,
    holdSeconds: null,
    perDay: 1,
};

/** A label like "…hold" or "…sec" is an isometric — start it on a hold, not reps. */
export function doseFor(label: string): ExerciseDose {
    const isHold = /\bhold\b|\bsec\b|\bisometric|\bplank\b|\bwall sit\b/i.test(label);
    return isHold
        ? { sets: 3, reps: null, holdSeconds: 10, perDay: 1 }
        : { ...DEFAULT_DOSE };
}
