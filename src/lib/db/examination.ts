// ---------------------------------------------------------------------------
// EXAMINATION — the Supabase boundary for Phase 3.
//
// Everything lands in `visit_measurements`, using the `side` / `method` /
// `context` columns Phase 2 added. See
// `docs/Cortex Specialties/physiotherapy-phase-2-plan.md` §6 for the rule
// this file has to respect:
//
//   `visits.vitals` is the DOCTOR's record, in the units typed.
//   `visit_measurements` is the ENGINE's record, normalised for rules.
//
// Examination readings are SAFE in rows because every one of them is a
// plain number with no conversion — degrees and a 0-5 grade. Nothing here
// touches the converted fields (temp, bp, lmp, gpla) and nothing here may
// be generalised to them.
//
// `context` is why this exists at all: a reading taken after a treatment
// is evidence the treatment worked, not evidence of this session's
// progress, and the two must never be averaged into one trend.
// ---------------------------------------------------------------------------

import { supabase } from "../supabase";

export type MeasureContext = "baseline" | "post_intervention";
export type MeasureSide = "left" | "right";

export interface ExamReading {
    measureKey: string;
    side: MeasureSide | null;
    /** 'active' | 'passive' for ranges, 'mmt' for strength, null for tests */
    method: string | null;
    context: MeasureContext;
    valueNum: number | null;
    valueText: string | null;
    qualifier: string | null;
}

const COLUMNS = "measure_key, side, method, context, value_num, value_text, qualifier";

/**
 * The key a reading is STORED under.
 *
 * `visit_measurements` carries a unique index on `(visit_id, measure_key)`
 * alone — it predates the side/method/context columns, and the vitals save
 * (`onConflict: "visit_id,measure_key"`) depends on it, including on the
 * branch the test devices run. So one examination measure can hold only one
 * row per visit under its plain key, and the second of active/passive,
 * left/right or baseline/re-test died on that index ("duplicate key value
 * violates unique constraint visit_measurements_unique").
 *
 * Each slot is therefore stored under its own key. The real side / method /
 * context columns are still written, so the row stays queryable by column;
 * the key suffix only exists to keep the old index satisfied. Swap this for
 * a `NULLS NOT DISTINCT` index on all five columns once every deployed
 * branch has the updated vitals `onConflict`.
 */
function storedKey(key: string, side: MeasureSide | null, method: string | null, context: MeasureContext): string {
    return `${key}|${side ?? "-"}|${method ?? "-"}|${context}`;
}

function fromRow(r: {
    measure_key: string; side: string | null; method: string | null;
    context: string; value_num: number | null; value_text: string | null;
    qualifier: string | null;
}): ExamReading {
    return {
        // Plain keys are rows written before `storedKey` existed.
        measureKey: r.measure_key.split("|")[0],
        side: (r.side as MeasureSide | null) ?? null,
        method: r.method,
        context: r.context as MeasureContext,
        // Supabase returns numeric as a string often enough to be worth
        // normalising here rather than at every read site.
        valueNum: r.value_num === null ? null : Number(r.value_num),
        valueText: r.value_text,
        qualifier: r.qualifier,
    };
}

/**
 * Everything examined at this visit. Deliberately unfiltered by context —
 * the card needs baselines AND post-intervention readings to draw the
 * re-test pair; only trends care about baselines alone.
 */
export async function fetchExamReadings(visitId: string): Promise<ExamReading[]> {
    const { data, error } = await supabase
        .from("visit_measurements")
        .select(COLUMNS)
        .eq("visit_id", visitId);
    if (error) throw new Error(`fetchExamReadings: ${error.message}`);
    return (data ?? []).map(fromRow);
}

/**
 * One reading, written or overwritten.
 *
 * Delete-then-insert under the slot's `storedKey`, rather than an upsert:
 * an upsert with the wrong conflict target silently writes duplicates, which
 * is the class of failure this project has been bitten by often enough
 * (§14.21's CHECK constraint, `care_plans`' missing policy) to prefer the
 * explicit version.
 */
export async function saveExamReading(args: {
    visitId: string;
    measureKey: string;
    side: MeasureSide | null;
    method: string | null;
    context: MeasureContext;
    valueNum?: number | null;
    valueText?: string | null;
    unit?: string | null;
    qualifier?: string | null;
}): Promise<void> {
    const key = storedKey(args.measureKey, args.side, args.method, args.context);

    // Clears this slot under its current key AND any legacy plain-key row for
    // the same slot, so an old reading can never shadow the new one.
    let legacy = supabase
        .from("visit_measurements")
        .delete()
        .eq("visit_id", args.visitId)
        .eq("measure_key", args.measureKey)
        .eq("context", args.context);
    legacy = args.side === null ? legacy.is("side", null) : legacy.eq("side", args.side);
    legacy = args.method === null ? legacy.is("method", null) : legacy.eq("method", args.method);
    const [{ error: delErr }, { error: legacyErr }] = await Promise.all([
        supabase.from("visit_measurements").delete().eq("visit_id", args.visitId).eq("measure_key", key),
        legacy,
    ]);
    if (delErr || legacyErr) throw new Error(`saveExamReading (clear): ${(delErr ?? legacyErr)!.message}`);

    // A cleared field is a delete, not a null row — an empty box means the
    // physiotherapist did not measure it, and a row saying so is a claim.
    if (args.valueNum === null && !args.valueText) return;

    const { error } = await supabase.from("visit_measurements").insert({
        visit_id: args.visitId,
        measure_key: key,
        side: args.side,
        method: args.method,
        context: args.context,
        value_num: args.valueNum ?? null,
        value_text: args.valueText ?? null,
        unit: args.unit ?? null,
        qualifier: args.qualifier ?? null,
    });
    if (error) throw new Error(`saveExamReading: ${error.message}`);
}
