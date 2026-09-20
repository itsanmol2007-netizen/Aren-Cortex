// ---------------------------------------------------------------------------
// EXERCISE LIBRARY — physiotherapy's Practice-page analog of Preferred
// Medicines: which exercises this clinic actually prescribes, and the dose
// (sets/reps/hold/per-day) a newly accepted line starts on.
//
// Exercises have no composition/brand split the way medicine does — an
// exercise IS an intent (`intents` row, type='exercise'), the same flat
// catalog ExercisePlanCard's own search already reads through
// `useIntentSearch(["exercise"])`. So this is ONE table keyed on
// (hospital_id, intent_id), not the two-level shape `clinic_brand_preference`
// needs for medicine.
//
// Practice-page CRUD only, today. Wiring a saved default dose into
// `useConsultPlan.ts`'s `doseFor(payload.label)` call (so accepting a
// library exercise starts on the physio's own usual dose instead of the
// generic 3x10) is real, separate work for a later pass — see that file's
// `case "exercise"` handler.
// ---------------------------------------------------------------------------

import { supabase } from "../supabase";

export interface ExerciseLibraryEntry {
    intentId: number;
    label: string;
    defaultSets: number | null;
    defaultReps: number | null;
    defaultHoldSeconds: number | null;
    defaultPerDay: number | null;
    notes: string;
}

const toEntry = (row: {
    intent_id: number | string;
    default_sets: number | string | null;
    default_reps: number | string | null;
    default_hold_seconds: number | string | null;
    default_per_day: number | string | null;
    notes: string | null;
    intents: { label: string } | { label: string }[] | null;
}): ExerciseLibraryEntry => {
    const intent = Array.isArray(row.intents) ? row.intents[0] : row.intents;
    return {
        intentId: Number(row.intent_id),
        label: intent?.label ?? `#${row.intent_id}`,
        defaultSets: row.default_sets != null ? Number(row.default_sets) : null,
        defaultReps: row.default_reps != null ? Number(row.default_reps) : null,
        defaultHoldSeconds: row.default_hold_seconds != null ? Number(row.default_hold_seconds) : null,
        defaultPerDay: row.default_per_day != null ? Number(row.default_per_day) : null,
        notes: row.notes ?? "",
    };
};

/**
 * Every exercise this clinic has ever saved a default for, newest edit
 * first — same "one unpaginated read" shape as `fetchClinicMedicinePriceList`
 * and `fetchAdditionalChargesCatalog`. A clinic's own library is small (the
 * exercises it actually uses, not the whole catalogue).
 */
export async function fetchExerciseLibrary(hospitalId: string): Promise<ExerciseLibraryEntry[]> {
    const { data, error } = await supabase
        .from("clinic_exercise_preference")
        .select("intent_id, default_sets, default_reps, default_hold_seconds, default_per_day, notes, intents(label)")
        .eq("hospital_id", hospitalId)
        .order("updated_at", { ascending: false });
    if (error) throw new Error(`fetchExerciseLibrary: ${error.message}`);
    return (data ?? []).map(toEntry);
}

/**
 * Saves (or replaces) this clinic's default dose for one exercise. Every
 * dose field is nullable — saving with none filled in is a real state: the
 * exercise is still elevated into "this clinic's library", it just falls
 * back to `doseFor()`'s generic starting dose like an unsaved exercise would.
 */
export async function setExerciseLibraryEntry(opts: {
    hospitalId: string;
    intentId: number;
    defaultSets: number | null;
    defaultReps: number | null;
    defaultHoldSeconds: number | null;
    defaultPerDay: number | null;
    notes: string;
    setBy: string | null;
}): Promise<ExerciseLibraryEntry> {
    const { data, error } = await supabase
        .from("clinic_exercise_preference")
        .upsert(
            {
                hospital_id: opts.hospitalId,
                intent_id: opts.intentId,
                default_sets: opts.defaultSets,
                default_reps: opts.defaultReps,
                default_hold_seconds: opts.defaultHoldSeconds,
                default_per_day: opts.defaultPerDay,
                notes: opts.notes.trim(),
                set_by: opts.setBy,
            },
            { onConflict: "hospital_id,intent_id" }
        )
        .select("intent_id, default_sets, default_reps, default_hold_seconds, default_per_day, notes, intents(label)")
        .single();
    if (error) throw new Error(`setExerciseLibraryEntry: ${error.message}`);
    return toEntry(data);
}

export async function deleteExerciseLibraryEntry(hospitalId: string, intentId: number): Promise<void> {
    const { error } = await supabase
        .from("clinic_exercise_preference")
        .delete()
        .eq("hospital_id", hospitalId)
        .eq("intent_id", intentId);
    if (error) throw new Error(`deleteExerciseLibraryEntry: ${error.message}`);
}
