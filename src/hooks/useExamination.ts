// ---------------------------------------------------------------------------
// THE EXAMINATION — Phase 3 state.
//
// Layer-1 "facts" hook, same tier as `useConsultChart` / `useVisitStory`.
// Owns what was examined at THIS visit, keyed by
// (measureKey, side, method, context) — the four things Phase 2's columns
// made expressible.
//
// ── Written through, not batched
//
// Unlike the Story (one blob, saved with the consult), an examination
// reading is saved as it is entered. Two reasons, both clinical: the
// physiotherapist is moving between the patient and the screen rather than
// filling a form in one pass, and Phase 5's re-test compares a value to one
// taken minutes earlier in the SAME visit — a baseline that only exists in
// component state until save is a baseline the re-test cannot read.
//
// The trade is that a failed write is silent to the consult's save path.
// So it is surfaced here (`error`) rather than swallowed, and the value
// stays on screen either way — the doctor's number is never lost to a
// network failure.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useState } from "react";
import { fetchExamReadings, saveExamReading } from "../lib/db/examination";
import type { ExamReading, MeasureContext, MeasureSide } from "../lib/db/examination";

/** (key | side | method | context) — one reading. */
function slot(key: string, side: MeasureSide | null, method: string | null, context: MeasureContext): string {
    return `${key}|${side ?? "-"}|${method ?? "-"}|${context}`;
}

export interface ExaminationHook {
    /** slot -> numeric value, for ranges and MMT grades */
    numbers: Map<string, number>;
    /** slot -> text value, for special test results */
    texts: Map<string, string>;
    loading: boolean;
    error: string | null;

    getNumber: (key: string, side: MeasureSide | null, method: string | null, context?: MeasureContext) => number | null;
    getText: (key: string, side: MeasureSide | null, context?: MeasureContext) => string | null;

    setNumber: (key: string, side: MeasureSide | null, method: string | null, value: number | null, context?: MeasureContext, unit?: string) => void;
    setText: (key: string, side: MeasureSide | null, value: string | null, context?: MeasureContext) => void;

    reset: () => void;
}

export function useExamination(visitId: string | null): ExaminationHook {
    const [numbers, setNumbers] = useState<Map<string, number>>(new Map());
    const [texts, setTexts] = useState<Map<string, string>>(new Map());
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!visitId) { setNumbers(new Map()); setTexts(new Map()); return; }
        let cancelled = false;
        setLoading(true);
        fetchExamReadings(visitId)
            .then((rows: ExamReading[]) => {
                if (cancelled) return;
                const n = new Map<string, number>();
                const t = new Map<string, string>();
                for (const r of rows) {
                    const s = slot(r.measureKey, r.side, r.method, r.context);
                    if (r.valueNum !== null) n.set(s, r.valueNum);
                    else if (r.valueText) t.set(s, r.valueText);
                }
                setNumbers(n);
                setTexts(t);
            })
            .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [visitId]);

    const getNumber = useCallback((key, side, method, context: MeasureContext = "baseline") =>
        numbers.get(slot(key, side, method, context)) ?? null,
    [numbers]) as ExaminationHook["getNumber"];

    const getText = useCallback((key, side, context: MeasureContext = "baseline") =>
        texts.get(slot(key, side, null, context)) ?? null,
    [texts]) as ExaminationHook["getText"];

    const setNumber = useCallback((
        key: string, side: MeasureSide | null, method: string | null,
        value: number | null, context: MeasureContext = "baseline", unit = "°"
    ) => {
        const s = slot(key, side, method, context);
        setNumbers((curr) => {
            const next = new Map(curr);
            if (value === null) next.delete(s); else next.set(s, value);
            return next;
        });
        if (!visitId) return;
        saveExamReading({ visitId, measureKey: key, side, method, context, valueNum: value, unit })
            .catch((e) => setError(e instanceof Error ? e.message : String(e)));
    }, [visitId]);

    const setText = useCallback((
        key: string, side: MeasureSide | null, value: string | null, context: MeasureContext = "baseline"
    ) => {
        const s = slot(key, side, null, context);
        setTexts((curr) => {
            const next = new Map(curr);
            if (value === null) next.delete(s); else next.set(s, value);
            return next;
        });
        if (!visitId) return;
        saveExamReading({ visitId, measureKey: key, side, method: null, context, valueText: value })
            .catch((e) => setError(e instanceof Error ? e.message : String(e)));
    }, [visitId]);

    const reset = useCallback(() => {
        setNumbers(new Map());
        setTexts(new Map());
        setError(null);
    }, []);

    return { numbers, texts, loading, error, getNumber, getText, setNumber, setText, reset };
}
