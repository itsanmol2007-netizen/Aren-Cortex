// ---------------------------------------------------------------------------
// THE QUEUE, AS THE DOCTOR SEES IT.
//
// The receptionist owns the queue — its order, who is in it, who gets bumped.
// This is a READ of that same queue, filtered to what one doctor needs, plus
// the small preview of each waiting patient's intake that makes "who is next"
// answerable without opening anything.
//
// ── It reuses the front desk's own fetch, deliberately ────────────────────
// `useQueue` (features/frontdesk/hooks/useQueue.ts) already polls
// `fetchTodayVisits`, caches per hospital, and survives a page change without
// a blank flash. A second implementation of the same read is a second answer
// to "who is waiting", and the two would drift the first time one of them
// learned about a new status. So this wraps it and adds only what Consult
// needs on top: the doctor filter, the ordering, and the intake previews.
//
// ── Whose patients ────────────────────────────────────────────────────────
// A `solo_reception` clinic has one doctor, so every waiting visit is theirs.
// A `multi_doctor` clinic assigns visits at the desk, so a doctor's queue is
// the visits assigned TO THEM plus the unassigned ones (a receptionist who
// registered someone without picking a doctor has not thereby made that
// patient invisible to everybody). Nothing here reorders anything: the desk's
// order is the order, and a doctor who wants somebody else takes them
// explicitly and is recorded doing so.
// ---------------------------------------------------------------------------

import { useEffect, useMemo, useRef, useState } from "react";
import { useQueue } from "../../frontdesk/hooks/useQueue";
import { fetchIntakePreviews, type IntakePreview } from "../../../lib/db/intake";
import type { TodayVisit } from "../../../lib/db";

export interface ConsultQueue {
    /** still waiting, in the desk's own order — oldest first */
    waiting: TodayVisit[];
    /** the one being seen right now, if the desk has marked one */
    serving: TodayVisit[];
    completedCount: number;
    /** what reception recorded, per visit id — for the cards */
    previews: Map<string, IntakePreview>;
    loading: boolean;
    refetch: () => void;
}

const EMPTY_PREVIEWS = new Map<string, IntakePreview>();

/** How many waiting patients' intakes are worth prefetching. The transition
 *  modal shows five and the sheet's first screen about eight; beyond that a
 *  card is scrolled to, not glanced at, and can afford to say less. */
const PREVIEW_DEPTH = 10;

export function useConsultQueue(opts: {
    hospitalId: string | null;
    doctorId: string | null;
    /** several doctors behind one desk — see the file header */
    multiDoctor: boolean;
    /** false in Cortex: no desk, no queue, nothing to poll */
    enabled: boolean;
}): ConsultQueue {
    const { hospitalId, doctorId, multiDoctor, enabled } = opts;
    const { visits, loading, refetch } = useQueue(enabled ? hospitalId : null);

    const mine = useMemo(() => {
        if (!enabled) return [] as TodayVisit[];
        if (!multiDoctor) return visits;
        return visits.filter(
            (v) => !v.assigned_doctor_id || v.assigned_doctor_id === doctorId
        );
    }, [enabled, visits, multiDoctor, doctorId]);

    const waiting = useMemo(
        () => mine
            .filter((v) => v.status === "waiting")
            .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
        [mine]
    );
    const serving = useMemo(() => mine.filter((v) => v.status === "serving"), [mine]);
    const completedCount = useMemo(() => mine.filter((v) => v.status === "completed").length, [mine]);

    // ── Intake previews ─────────────────────────────────────────────────────
    // One round trip for the whole visible queue (see `fetchIntakePreviews`),
    // re-run only when the SET of visit ids changes — not on every 25s poll
    // that comes back identical, which would be three requests a minute for
    // data that did not move.
    const [previews, setPreviews] = useState<Map<string, IntakePreview>>(EMPTY_PREVIEWS);
    const previewKeyRef = useRef("");

    const previewIds = useMemo(
        () => [...serving, ...waiting].slice(0, PREVIEW_DEPTH).map((v) => v.visit_id),
        [serving, waiting]
    );
    const previewKey = previewIds.join(",");

    useEffect(() => {
        if (!enabled || !previewIds.length) {
            previewKeyRef.current = "";
            setPreviews(EMPTY_PREVIEWS);
            return;
        }
        if (previewKeyRef.current === previewKey) return;
        previewKeyRef.current = previewKey;
        let cancelled = false;
        void fetchIntakePreviews(previewIds).then((next) => {
            if (!cancelled) setPreviews(next);
        });
        return () => { cancelled = true; };
        // `previewKey` is the identity of the request — the array is rebuilt
        // every render and would loop forever. Same pattern as `brandKey` in
        // useConsultIntelligence.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [previewKey, enabled]);

    return { waiting, serving, completedCount, previews, loading: enabled && loading, refetch };
}
