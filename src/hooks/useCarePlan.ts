// ---------------------------------------------------------------------------
// THE CARE PLAN — a course of treatment that outlives the visit.
//
// `cortex-longitudinal-spec.md` §3.3. Built 2026-08-16 alongside the
// longitudinal band, which is where it is displayed.
//
// ── Where this sits in the five-hook layering (atlas §14.20)
//
// Layer 1, with the facts. It needs the patient at render time and nothing
// else — not the engine, not the plan, not the chart — so it is declared
// beside `useConsultSession` rather than after `useConsultIntelligence`. That
// is the same position `useLongitudinalRecord` occupies for the other durable
// patient fact, and for the same reason: a standing fact about a PATIENT is
// not a line on today's prescription.
//
// It deliberately does NOT own the trend. The trend is pure arithmetic over
// data other hooks already loaded (`trend.ts`, called from a `useMemo` in
// App), and giving it a hook would imply it has state or fetches something. It
// has neither.
//
// ── Session numbering reads the visits, it does not keep a counter
//
// "Session 4 of 12" is derived from which visits carry this plan's id, every
// time. A counter on the plan row would be a second copy of a fact the visits
// already hold, and it would be wrong the first time a visit was deleted,
// reassigned, or abandoned mid-consult.
//
// ── The linking rule, and why it is not automatic
//
// A visit joins the course when the consult is SAVED, not when it opens. A
// physiotherapy patient who comes in mid-course with a fever has had a visit,
// not a session, and the doctor is the only one who can tell the difference —
// `attachCurrentVisit` is called from the save path with the plan that was
// actually on screen.
//
// ⚠ THIS HOOK IS INERT UNTIL `care_plans` HAS AN RLS POLICY. The table shipped
// with row level security enabled and no policies at all, which denies every
// read and write. Reads come back as an empty result rather than an error, so
// the symptom is "the doctor's care plan never appears" with nothing in the
// console. See `lib/db/carePlans.ts` and the atlas entry.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    closeCarePlan, createCarePlan, fetchActiveCarePlan, fetchCarePlanVisitIds,
    linkVisitToCarePlan, updateCarePlan, type CarePlan,
} from "../lib/db";

export interface UseCarePlanResult {
    plan: CarePlan | null;
    loading: boolean;
    /** the write in flight, so the sheet can disable its own buttons */
    busy: boolean;
    /** visit id → session number within this plan, 1-based, oldest first */
    sessionNumbers: Map<string, number>;
    /** visit id → the label the header chips print ("Session 4") */
    sessionLabels: Map<string, string>;
    /** which session the consult in progress would be */
    currentSession: number;
    start: (args: {
        goal: string; diagnosis: string | null;
        targetVisitCount: number | null; targetDate: string | null; notes: string | null;
    }) => Promise<void>;
    edit: (args: {
        goal: string; diagnosis: string | null;
        targetVisitCount: number | null; targetDate: string | null; notes: string | null;
    }) => Promise<void>;
    close: () => Promise<void>;
    /** called from the save path — see the header on why this is not automatic */
    attachCurrentVisit: (visitId: string) => Promise<void>;
    reset: () => void;
}

export function useCarePlan(args: {
    patientId: string | null;
    doctorId: string | null;
    hospitalId: string | null;
    /** surfaced to the doctor — a care plan failing silently is the whole risk */
    onError?: (message: string) => void;
}): UseCarePlanResult {
    const { patientId, doctorId, hospitalId, onError } = args;

    const [plan, setPlan] = useState<CarePlan | null>(null);
    const [planVisitIds, setPlanVisitIds] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const [busy, setBusy] = useState(false);

    // `onError` is frequently an inline arrow at the call site, which would
    // otherwise re-run the load effect on every render of App.
    const onErrorRef = useRef(onError);
    onErrorRef.current = onError;

    const load = useCallback(async (pid: string) => {
        setLoading(true);
        try {
            const found = await fetchActiveCarePlan(pid);
            setPlan(found);
            setPlanVisitIds(found ? await fetchCarePlanVisitIds(found.id) : []);
        } catch (e) {
            setPlan(null);
            setPlanVisitIds([]);
            onErrorRef.current?.(e instanceof Error ? e.message : "Could not load the care plan");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!patientId) {
            setPlan(null);
            setPlanVisitIds([]);
            return;
        }
        void load(patientId);
    }, [patientId, load]);

    const sessionNumbers = useMemo(() => {
        const m = new Map<string, number>();
        planVisitIds.forEach((id, i) => m.set(id, i + 1));
        return m;
    }, [planVisitIds]);

    const sessionLabels = useMemo(() => {
        const m = new Map<string, string>();
        for (const [id, n] of sessionNumbers) m.set(id, `Session ${n}`);
        return m;
    }, [sessionNumbers]);

    const write = useCallback(async (fn: () => Promise<void>, failure: string) => {
        setBusy(true);
        try {
            await fn();
        } catch (e) {
            onErrorRef.current?.(e instanceof Error ? e.message : failure);
        } finally {
            setBusy(false);
        }
    }, []);

    const start: UseCarePlanResult["start"] = useCallback(async (a) => {
        if (!patientId || !doctorId) return;
        await write(async () => {
            const created = await createCarePlan({
                patientId, doctorId, hospitalId,
                goal: a.goal, diagnosis: a.diagnosis,
                targetVisitCount: a.targetVisitCount, targetDate: a.targetDate, notes: a.notes,
            });
            setPlan(created);
            setPlanVisitIds([]);
        }, "Could not start the care plan");
    }, [patientId, doctorId, hospitalId, write]);

    const edit: UseCarePlanResult["edit"] = useCallback(async (a) => {
        if (!plan) return;
        await write(async () => {
            const updated = await updateCarePlan(plan.id, {
                goal: a.goal,
                diagnosis: a.diagnosis,
                notes: a.notes,
                target_visit_count: a.targetVisitCount,
                target_date: a.targetDate,
            });
            setPlan(updated);
        }, "Could not save the care plan");
    }, [plan, write]);

    const close = useCallback(async () => {
        if (!plan) return;
        await write(async () => {
            await closeCarePlan(plan.id);
            setPlan(null);
            setPlanVisitIds([]);
        }, "Could not close the care plan");
    }, [plan, write]);

    const attachCurrentVisit = useCallback(async (visitId: string) => {
        if (!plan) return;
        // Not fire-and-forget: a session that silently never counted makes
        // "session 4 of 12" wrong for the rest of the course, and the doctor
        // has no way to notice from the screen. Atlas trap 1.
        await write(async () => {
            await linkVisitToCarePlan(visitId, plan.id);
            setPlanVisitIds((prev) => (prev.includes(visitId) ? prev : [...prev, visitId]));
        }, "Could not record this visit against the care plan");
    }, [plan, write]);

    const reset = useCallback(() => {
        setPlan(null);
        setPlanVisitIds([]);
    }, []);

    return {
        plan, loading, busy,
        sessionNumbers, sessionLabels,
        currentSession: planVisitIds.length + 1,
        start, edit, close, attachCurrentVisit, reset,
    };
}
