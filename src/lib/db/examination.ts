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

function fromRow(r: {
    measure_key: string; side: string | null; method: string | null;
    context: string; value_num: number | null; value_text: string | null;
    qualifier: string | null;
}): ExamReading {
    return {
        measureKey: r.measure_key,
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
 * There is no natural unique constraint on
 * (visit, key, side, method, context) in the table — `visit_measurements`
 * predates all four of those columns — so this deletes the exact match
 * before inserting rather than relying on an upsert that has nothing to
 * conflict on. Two statements, not one, and that is deliberate: an upsert
 * with the wrong conflict target silently writes duplicates, which is the
 * class of failure this project has been bitten by often enough
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
    let del = supabase
        .from("visit_measurements")
        .delete()
        .eq("visit_id", args.visitId)
        .eq("measure_key", args.measureKey)
        .eq("context", args.context);
    del = args.side === null ? del.is("side", null) : del.eq("side", args.side);
    del = args.method === null ? del.is("method", null) : del.eq("method", args.method);
    const { error: delErr } = await del;
    if (delErr) throw new Error(`saveExamReading (clear): ${delErr.message}`);

    // A cleared field is a delete, not a null row — an empty box means the
    // physiotherapist did not measure it, and a row saying so is a claim.
    if (args.valueNum === null && !args.valueText) return;

    const { error } = await supabase.from("visit_measurements").insert({
        visit_id: args.visitId,
        measure_key: args.measureKey,
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
