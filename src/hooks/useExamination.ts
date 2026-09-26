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
//
// ── Offline (2026-09-27)
//
// Each write goes through the durable write queue (`exam.saveReading`) when
// the caller names the clinic, so a reading typed with no connection is
// sent when it returns, even across a reload. And every value is mirrored
// per visit in localStorage, laid over what the server returns, so a
// reload with no connection (or before the queue has drained) still shows
// what was typed.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchExamReadings, saveExamReading } from "../lib/db/examination";
import type { ExamReading, MeasureContext, MeasureSide } from "../lib/db/examination";
import { enqueueWrite, registerWriteHandler } from "../lib/offline/writeQueue";

type ReadingArgs = Parameters<typeof saveExamReading>[0];
registerWriteHandler("exam.saveReading", (payload) => saveExamReading(payload as ReadingArgs));

// ── The per-visit mirror ────────────────────────────────────────────────
const MIRROR = "aren-cortex:exam:";
const MIRROR_MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;
interface Mirror { at: number; n: [string, number][]; t: [string, string][] }

function readMirror(visitId: string): Mirror | null {
    try {
        const raw = localStorage.getItem(MIRROR + visitId);
        if (!raw) return null;
        const m = JSON.parse(raw) as Mirror;
        if (Date.now() - m.at > MIRROR_MAX_AGE_MS) { localStorage.removeItem(MIRROR + visitId); return null; }
        return m;
    } catch { return null; }
}
function writeMirror(visitId: string, n: Map<string, number>, t: Map<string, string>) {
    try {
        localStorage.setItem(MIRROR + visitId, JSON.stringify({ at: Date.now(), n: [...n], t: [...t] }));
    } catch { /* storage full or blocked: the queue still carries the write */ }
}

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

export function useExamination(
    visitId: string | null,
    /** the clinic and doctor, for the offline write queue; without them a
     *  reading is written directly, as before */
    queue?: { hospitalId: string; doctorId: string | null } | null,
): ExaminationHook {
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
                // What was typed on this device wins over what the server
                // has not caught up with yet.
                const m = readMirror(visitId);
                if (m) {
                    for (const [k, v] of m.n) n.set(k, v);
                    for (const [k, v] of m.t) t.set(k, v);
                }
                setNumbers(n);
                setTexts(t);
            })
            .catch((e) => {
                if (cancelled) return;
                // No connection: show what was typed here.
                const m = readMirror(visitId);
                if (m) { setNumbers(new Map(m.n)); setTexts(new Map(m.t)); return; }
                setError(e instanceof Error ? e.message : String(e));
            })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [visitId]);

    // Mirror every change (a cleared value leaves the mirror too).
    const loadedFor = useRef<string | null>(null);
    useEffect(() => {
        if (!visitId || loading) return;
        if (loadedFor.current !== visitId) { loadedFor.current = visitId; return; }
        writeMirror(visitId, numbers, texts);
    }, [visitId, numbers, texts, loading]);

    const hospitalId = queue?.hospitalId ?? null;
    const doctorId = queue?.doctorId ?? null;
    /** One reading, through the durable queue when the clinic is known. */
    const persist = useCallback((args: ReadingArgs) => (hospitalId
        ? enqueueWrite("exam.saveReading", args, { hospitalId, doctorId }).then(() => undefined)
        : saveExamReading(args)), [hospitalId, doctorId]);

    const getNumber = useCallback((key, side, method, context: MeasureContext = "baseline") =>
        numbers.get(slot(key, side, method, context)) ?? null,
    [numbers]) as ExaminationHook["getNumber"];

    const getText = useCallback((key, side, context: MeasureContext = "baseline") =>
        texts.get(slot(key, side, null, context)) ?? null,
    [texts]) as ExaminationHook["getText"];

    /**
     * ── ONE WRITE PER VALUE, NOT ONE PER KEYSTROKE ─────────────────────────
     *
     * `saveExamReading` is a DELETE followed by an INSERT, and it used to be
     * fired straight from the change handler. Typing a three-digit range
     * therefore started three of those pairs a few milliseconds apart and let
     * them interleave: an INSERT for "1" could land after the DELETE that was
     * meant to clear it, so the row that survived was the first keystroke and
     * the later ones died on the unique index. Observed live — typing 110 into
     * knee flexion left `EXAM_KNEE_FLEX = 1` in the database while the box on
     * screen still read 110, with only a red line at the foot of the modal to
     * say so. A physiotherapist reading that screen has no way to know the
     * stored number is not the measured one.
     *
     * So writes are debounced per slot (the last value typed is the one
     * meant) and then run through a single promise chain, which keeps the
     * DELETE/INSERT pairs from overlapping each other. The optimistic local
     * update is unchanged — the number stays on screen immediately.
     */
    const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
    const pending = useRef(new Map<string, () => Promise<void>>());
    const chain = useRef<Promise<unknown>>(Promise.resolve());

    const runNow = useCallback((slotKey: string) => {
        const run = pending.current.get(slotKey);
        if (!run) return;
        pending.current.delete(slotKey);
        chain.current = chain.current
            .then(run)
            .catch((e) => setError(e instanceof Error ? e.message : String(e)));
    }, []);

    const queueSave = useCallback((slotKey: string, run: () => Promise<void>) => {
        pending.current.set(slotKey, run);
        const prev = timers.current.get(slotKey);
        if (prev) clearTimeout(prev);
        timers.current.set(slotKey, setTimeout(() => {
            timers.current.delete(slotKey);
            runNow(slotKey);
        }, 400));
    }, [runNow]);

    /**
     * Closing the modal must not eat the last number typed. Anything still
     * inside the debounce window is flushed on unmount rather than dropped.
     */
    useEffect(() => {
        const t = timers.current;
        return () => {
            for (const [slotKey, id] of t) { clearTimeout(id); runNow(slotKey); }
            t.clear();
        };
    }, [runNow]);

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
        queueSave(s, () => persist({
            visitId, measureKey: key, side, method, context, valueNum: value, unit,
        }));
    }, [visitId, queueSave, persist]);

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
        queueSave(s, () => persist({
            visitId, measureKey: key, side, method: null, context, valueText: value,
        }));
    }, [visitId, queueSave, persist]);

    const reset = useCallback(() => {
        setNumbers(new Map());
        setTexts(new Map());
        setError(null);
    }, []);

    return { numbers, texts, loading, error, getNumber, getText, setNumber, setText, reset };
}
