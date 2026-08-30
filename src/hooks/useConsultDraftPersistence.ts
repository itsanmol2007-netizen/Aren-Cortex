// ---------------------------------------------------------------------------
// CONSULT DRAFT PERSISTENCE — the orchestrator for lib/consultDraft.ts.
//
// Lives here, not inside useConsultSession/useConsultChart/useConsultPlan
// themselves, because it is the one thing in the consult that genuinely
// needs all three at once: which patient/visit (session), what was charted
// (chart), what was decided (plan), and the story (visitStory). Each of
// those stays a clean "layer 1" hook that knows nothing about localStorage —
// this hook is the seam, called once from App.tsx after all four exist.
//
// ── The one real timing hazard: the Story fetch
//
// `useVisitStory`'s own effect re-fetches `story`/`todayScores` the instant
// `visitId`/`patientId` change — which restoring a draft causes on purpose.
// For an in-progress (never-saved) visit that fetch resolves to `emptyStory()`
// a beat later, and if this hook had already called `visitStory.setStory`
// by then, that fetch would silently overwrite the very thing just restored.
// So the story half of a restore is staged in `pendingStoryRef` and only
// actually applied on the loading:true -> false FALLING EDGE that
// `useVisitStory`'s own fetch produces — i.e. strictly after it has already
// lost the race, not before it started. `restoringRef` blocks persistence
// for that same narrow window, so a crash inside it can't overwrite a good
// draft with a half-applied one.
// ---------------------------------------------------------------------------

import { useEffect, useRef } from "react";
import {
    saveConsultDraft, loadConsultDraft, clearConsultDraft,
} from "../lib/consultDraft";
import type { ConsultSession } from "./useConsultSession";
import type { ConsultChart } from "./useConsultChart";
import type { ConsultPlan } from "./useConsultPlan";
import type { VisitStoryHook } from "./useVisitStory";

export interface ConsultDraftPersistenceArgs {
    /** Real-identity-gated (`identity.isReal ? identity.doctorId : null`) —
     *  `null` skips both restore and persist entirely. See consultDraft.ts. */
    doctorId: string | null;
    session: ConsultSession;
    chart: ConsultChart;
    plan: ConsultPlan;
    visitStory: VisitStoryHook;
}

const DEBOUNCE_MS = 600;

export function useConsultDraftPersistence({
    doctorId, session, chart, plan, visitStory,
}: ConsultDraftPersistenceArgs): void {
    const restoredRef = useRef<string | null>(null);
    /** A story draft waiting for `useVisitStory`'s own fetch to settle — see
     *  this file's header. */
    const pendingStoryRef = useRef<{ story: import("../lib/consultDraft").StoryDraft } | null>(null);
    /** True from the moment a draft is applied until the story half has
     *  actually landed — persistence is skipped while this is true so a
     *  crash mid-restore can't clobber the draft with a half-applied one. */
    const restoringRef = useRef(false);

    // ── Restore: once per doctor, only into an otherwise-empty session ──────
    useEffect(() => {
        if (!doctorId) return;
        if (restoredRef.current === doctorId) return;
        restoredRef.current = doctorId;
        if (session.patient) return; // an active consult already in memory wins

        const draft = loadConsultDraft(doctorId);
        if (!draft) return;

        restoringRef.current = true;
        session.setPatient(draft.patient);
        session.setVisitId(draft.visitId);
        // The intake modal defaults open — without this, a resumed consult
        // renders correctly underneath a "who is this for" prompt that has
        // no reason to be there.
        session.setPatientModalOpen(false);
        chart.restoreChart(draft.chart);
        plan.restorePlan(draft.plan);
        pendingStoryRef.current = { story: draft.story };
        // Deliberately doctorId-only — see the ref guard above for why this
        // must run exactly once per doctor rather than react to session/
        // chart/plan identity (which changes every render).
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [doctorId]);

    // ── The Story half, applied on the fetch's falling edge — see header ───
    const wasStoryLoadingRef = useRef(false);
    useEffect(() => {
        const wasLoading = wasStoryLoadingRef.current;
        wasStoryLoadingRef.current = visitStory.loading;
        if (!pendingStoryRef.current) return;
        if (!(wasLoading && !visitStory.loading)) return;

        const { story } = pendingStoryRef.current;
        pendingStoryRef.current = null;
        visitStory.setStory(story.story);
        for (const [goalId, score] of story.todayScores) visitStory.setTodayScore(goalId, score);
        restoringRef.current = false;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visitStory.loading]);

    // ── Clear on a real end-of-consult ──────────────────────────────────────
    useEffect(() => {
        if (!doctorId) return;
        if (!session.patient) clearConsultDraft(doctorId);
    }, [doctorId, session.patient]);

    // ── Debounced persist, everything else ──────────────────────────────────
    useEffect(() => {
        if (!doctorId || !session.patient || restoringRef.current) return;
        const t = setTimeout(() => {
            saveConsultDraft(doctorId, {
                patient: session.patient!,
                visitId: session.visitId,
                chart: {
                    vitals: chart.vitals,
                    selectedSymptoms: chart.selectedSymptoms,
                    selectedSymptomsWithIntensity: chart.selectedSymptomsWithIntensity,
                    selectedFindings: chart.selectedFindings,
                    chipOrigins: [...chart.chipOrigins],
                },
                plan: {
                    prescription: plan.prescription,
                    selectedTests: plan.selectedTests,
                    selectedLabName: plan.selectedLabName,
                    diagnoses: plan.diagnoses,
                    followUpDays: plan.followUpDays,
                    adviceNotes: plan.adviceNotes,
                    therapyNotes: plan.therapyNotes,
                    exercisePlan: plan.exercisePlan,
                    visitNotes: plan.visitNotes,
                },
                story: {
                    story: visitStory.story,
                    todayScores: [...visitStory.todayScores],
                },
            });
        }, DEBOUNCE_MS);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        doctorId, session.patient, session.visitId,
        chart.vitals, chart.selectedSymptoms, chart.selectedSymptomsWithIntensity,
        chart.selectedFindings, chart.chipOrigins,
        plan.prescription, plan.selectedTests, plan.selectedLabName, plan.diagnoses,
        plan.followUpDays, plan.adviceNotes, plan.therapyNotes, plan.exercisePlan, plan.visitNotes,
        visitStory.story, visitStory.todayScores,
    ]);
}
