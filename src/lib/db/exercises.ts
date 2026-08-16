// ---------------------------------------------------------------------------
// THE EXERCISE PLAN — the Supabase boundary.
//
// Built 2026-08-16. `prescription_exercises` is the sibling of
// `prescription_medicines`: one row per prescribed exercise, with its dose as
// COLUMNS rather than as prose.
//
// ── Why this table had to exist before the badge could
//
// Until now an accepted exercise was a line of text in `advice_notes`. That is
// fine for a general OPD's "walk 30 minutes daily" and useless for
// physiotherapy, where the whole clinical value is comparing this session's
// prescription with last session's. Comparing means comparing numbers, and
// numbers inside a sentence are not numbers. See `features/consult/exercisePlan.ts`.
//
// ── The read is the interesting half
//
// `fetchLastExercisePlan` answers "what did we give this patient last time",
// which is what the progression badges are computed against. It deliberately
// reads the most recent COMPLETED visit that actually has an exercise plan,
// not simply the previous visit: a physiotherapy patient who came in with a
// fever mid-course has a visit with no programme on it, and comparing against
// that would report every exercise as newly added.
// ---------------------------------------------------------------------------

import { supabase } from "../supabase";
import type { ExerciseLine, ExerciseSide } from "../../features/consult/exercisePlan";

export type DBExerciseRow = {
    intent_id: number | null;
    label: string;
    sets: number | null;
    reps: number | null;
    hold_seconds: number | null;
    per_day: number | null;
    side: ExerciseSide | null;
    notes: string | null;
    sort_order: number | null;
};

const toLine = (r: DBExerciseRow, i: number): ExerciseLine => ({
    id: `db-${r.intent_id ?? r.label}-${i}`,
    intentId: r.intent_id,
    label: r.label,
    sets: r.sets,
    reps: r.reps,
    holdSeconds: r.hold_seconds,
    perDay: r.per_day,
    side: r.side,
    notes: r.notes ?? "",
    sortOrder: r.sort_order ?? i,
});

/**
 * Write this visit's programme. Called once, from the consult save.
 *
 * Not fire-and-forget: an exercise plan that silently failed to save is a
 * patient who was handed a programme the record does not contain, and the
 * NEXT session's progression badges would then compare against the wrong
 * baseline. Atlas trap 1.
 */
export async function saveExercisePlan(
    prescriptionId: string,
    lines: ExerciseLine[],
): Promise<void> {
    if (lines.length === 0) return;
    const rows = lines.map((l, i) => ({
        prescription_id: prescriptionId,
        intent_id: l.intentId,
        label: l.label,
        sets: l.sets,
        reps: l.reps,
        hold_seconds: l.holdSeconds,
        per_day: l.perDay,
        side: l.side,
        notes: l.notes || null,
        sort_order: i,
    }));
    const { error } = await supabase.from("prescription_exercises").insert(rows);
    if (error) throw new Error(`saveExercisePlan: ${error.message}`);
}

/**
 * The most recent programme this patient was actually given, and when.
 *
 * Returns an empty plan rather than throwing when there is none — a first
 * visit is the common case, not an error, and the card renders no badges at
 * all when `hasPrevious` is false.
 */
export async function fetchLastExercisePlan(
    patientId: string,
): Promise<{ lines: ExerciseLine[]; at: string | null }> {
    // Completed visits only. An abandoned consult is not a session, and its
    // half-built programme was never handed to anybody.
    const { data: visits, error: vErr } = await supabase
        .from("visits")
        .select("id, created_at")
        .eq("patient_id", patientId)
        .eq("status", "completed")
        .order("created_at", { ascending: false })
        .limit(20);
    if (vErr) throw new Error(`fetchLastExercisePlan (visits): ${vErr.message}`);
    if (!visits?.length) return { lines: [], at: null };

    const visitIds = visits.map((v) => v.id);
    const { data: rxs, error: rErr } = await supabase
        .from("prescriptions")
        .select("id, visit_id")
        .in("visit_id", visitIds);
    if (rErr) throw new Error(`fetchLastExercisePlan (prescriptions): ${rErr.message}`);
    if (!rxs?.length) return { lines: [], at: null };

    const { data: rows, error: eErr } = await supabase
        .from("prescription_exercises")
        .select("prescription_id, intent_id, label, sets, reps, hold_seconds, per_day, side, notes, sort_order")
        .in("prescription_id", rxs.map((r) => r.id));
    if (eErr) throw new Error(`fetchLastExercisePlan (exercises): ${eErr.message}`);
    if (!rows?.length) return { lines: [], at: null };

    const visitOfRx = new Map(rxs.map((r) => [r.id, r.visit_id]));
    const dateOfVisit = new Map(visits.map((v) => [v.id, v.created_at]));

    // Walk the visits newest first and take the first one that actually
    // carries a programme — see the header on why "the previous visit" is the
    // wrong answer.
    for (const v of visits) {
        const mine = rows.filter((r) => visitOfRx.get(r.prescription_id) === v.id);
        if (mine.length === 0) continue;
        const sorted = [...mine].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
        return {
            lines: sorted.map((r, i) => toLine(r as DBExerciseRow, i)),
            at: dateOfVisit.get(v.id) ?? null,
        };
    }
    return { lines: [], at: null };
}
