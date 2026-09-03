// ---------------------------------------------------------------------------
// THE CONSULT LIFECYCLE — starting one, repeating a past one, saving it, and
// ending it.
//
// Extracted 2026-08-15 as Stage 2, step 3 (atlas §14.19), the layer-3 half of
// the split whose layer-1 half is useConsultSession.ts. Read that file's
// header for the layering; the short version is that everything here needs
// the ENGINE's result at render time (the learning write records the ranking
// as the doctor saw it), so it cannot be declared before the engine — while
// the patient and visit it reads must be.
//
// This is the only hook in the consult that spans all four of the others. A
// consultation begins by resetting the chart AND the plan AND the ledger and
// minting a visit; it ends by writing all of them and resetting all of them.
// That spanning is exactly why it is one hook rather than five methods spread
// across the others: the ORDER these resets happen in, and the fact that none
// of them may be forgotten, is the thing worth keeping in one readable place.
// App.tsx had three near-copies of that reset sequence and they had already
// drifted apart — one cleared the past-visit rail, the others did not.
//
// Navigation is NOT owned here. `setActivePage` / `setSidebarOpen` are passed
// in, because which screen is showing is the shell's business and a consult
// that silently navigated would be very hard to follow.
// ---------------------------------------------------------------------------

import { useCallback } from "react";
import type { Patient, PrescriptionMedicine } from "../types";
import type { SidebarPage } from "../features/sidebar/SidebarNav";
import { commitConsultation, type Observable } from "../lib/db/synapse";
import {
  createPatient, findPatientByPhone, createVisit,
  findQueuedVisit, markVisitServing,
  saveConsult,
  freqSlotToLabel, freqLabelToSlot,
  type SaveConsultMedicine, type RealVisit,
} from "../lib/db";
import { saveExercisePlan } from "../lib/db/exercises";
import type { ClinicalIdentity } from "./useClinicalIdentity";
import type { ConsultChart } from "./useConsultChart";
import type { AcceptLedger } from "./useAcceptLedger";
import type { ConsultSession } from "./useConsultSession";
import type { ConsultPlan } from "./useConsultPlan";
import type { ConsultIntelligence } from "./useConsultIntelligence";

export interface ConsultLifecycleArgs {
  identity: ClinicalIdentity;
  /** the catalogue, for canonicalising a past visit's v1 names */
  observables: Observable[];
  chart: ConsultChart;
  ledger: AcceptLedger;
  session: ConsultSession;
  plan: ConsultPlan;
  intelligence: ConsultIntelligence;
  /**
   * Pull this patient's standing conditions onto the fresh chart.
   *
   * Called on the two paths that START a consult, and deliberately NOT on
   * Repeat Rx: that path rebuilds the chart wholesale from a past visit, and
   * seeding carried-forward chips into it would race the replace.
   */
  carryForwardFor: (patientId: string) => Promise<void>;
  /**
   * Put whatever is already recorded against this visit onto the chart, and
   * say what came back. See `features/consult/useIntakePrefill.ts`.
   *
   * ── The ORDER this is called in is load-bearing ──────────────────────────
   * It runs while `visitId` is still null, before `session.setVisitId`. The
   * consult's own persist effect (`useConsultIntelligence`) DELETES a visit's
   * observations and re-inserts them from the chart on a 600ms debounce — so
   * with the visit id already set and an empty chart, it would erase the front
   * desk's intake a fraction of a second before this read put it back. No visit
   * id, no persist effect, no race. Every start path below therefore reads
   * `resolve -> clear -> prefill -> set the id`, and a new one must too.
   *
   * Awaited rather than fired and forgotten for the same reason. Optional so a
   * caller that has not wired it still works — App.tsx always passes it.
   */
  prefillFromIntake?: (visitId: string) => Promise<{ chips: number; hasMeasurements: boolean; attachmentCount: number }>;
  /**
   * Called once, after a consult has actually been saved, with the visit that
   * was saved. Today this attaches the visit to the running care plan so it
   * counts as a session.
   *
   * It happens HERE and not when the consult opens, on purpose: a
   * physiotherapy patient who comes in mid-course with a fever has had a
   * visit, not a session, and only a finished consult is evidence of which
   * one it was. Awaited rather than fired and forgotten — a session that
   * silently failed to count makes "session 4 of 12" wrong for the rest of
   * the course, with nothing on screen to show for it.
   */
  onVisitSaved?: (visitId: string) => Promise<void>;
  /**
   * The Story + Goals write, added 2026-08-17 for physiotherapy's Phase 1.
   * Same caught-not-thrown posture as `saveExercisePlan` just above it in
   * the save sequence, and the same reason: by this point the visit is
   * already committed, so a throw here would tell a doctor whose
   * consultation DID save that it failed. A no-op for every profile that
   * never touches the Story block — `saveVisitStory` skips the write
   * entirely when the story is empty (`lib/db/story.ts`).
   */
  onSaveStory?: (visitId: string, doctorId: string | null) => Promise<void>;
  /**
   * Clears Story + Goals state on every path that starts or ends a
   * consultation — wired into `clearWorkspace` alongside `chart.reset()`
   * and `plan.reset()` from the start, unlike `stagedMedicine` /
   * `pendingMedicine`, which `useConsultPlan.ts`'s own header still
   * records as NOT cleared by `plan.reset()`. Optional only so a caller
   * that has not wired `useVisitStory` yet does not break; `App.tsx`
   * always passes it.
   */
  resetStory?: () => void;
  /** `variant: "resume"` gets App.tsx's own bottom-center confirmation pill
   *  instead of the generic bottom-right toast — see `resumeConsult` below,
   *  the one caller that passes it. */
  showToast: (msg: string, opts?: { variant?: "resume" }) => void;
  /** put the cursor where a consult actually begins — the chart search box */
  focusChartSearch: () => void;
  setActivePage: (page: SidebarPage | null) => void;
  setSidebarOpen: (open: boolean) => void;
}

export interface ConsultLifecycle {
  /** Start (or resume) a consult for a patient chosen from the records page. */
  handleStartConsultFromRecord: (incomingPatient: Patient) => Promise<void>;
  /** Re-enter a visit that is already in progress, by its known id — see
   *  this function's own doc comment for why it's not the one above. */
  resumeConsult: (incomingPatient: Patient, visitId: string) => void;
  /** Start a consult from the patient modal, creating the patient if new. */
  handlePatientConfirm: (incoming: Patient) => Promise<void>;
  /** Carry a past visit's chart and medicines into this one. */
  handleRepeatRx: (visit: RealVisit) => void;
  /** Write the consultation, log the decision, and clear the workspace. */
  handleConfirmAndSave: () => Promise<void>;
  /** Open Review — refused while a prescribed hard warning is unread. */
  openReview: () => void;
  /** Abandon this consultation and go back to an empty workspace. */
  resetConsultState: () => void;
}

/**
 * What the toast says when a consult opens.
 *
 * It names what the front desk already did, once, and then gets out of the
 * way — "Consult started for Meera Nair · 4 items from front desk" tells the
 * doctor the chart in front of them is not something they typed, which is the
 * one thing they need to know in the first second. Silent when nothing was
 * prepared, which is every Cortex consult.
 */
function startedMessage(
  name: string,
  intake?: { chips: number; hasMeasurements: boolean; attachmentCount: number }
): string {
  const base = `Consult started for ${name}`;
  if (!intake) return base;
  const parts: string[] = [];
  if (intake.chips) parts.push(`${intake.chips} item${intake.chips === 1 ? "" : "s"}`);
  if (intake.hasMeasurements) parts.push("measurements");
  if (intake.attachmentCount) parts.push(`${intake.attachmentCount} file${intake.attachmentCount === 1 ? "" : "s"}`);
  return parts.length ? `${base} · ${parts.join(", ")} from front desk` : base;
}

export function useConsultLifecycle({
  identity,
  observables,
  chart,
  ledger,
  session,
  plan,
  intelligence,
  carryForwardFor,
  prefillFromIntake,
  onVisitSaved,
  onSaveStory,
  resetStory,
  showToast,
  focusChartSearch,
  setActivePage,
  setSidebarOpen,
}: ConsultLifecycleArgs): ConsultLifecycle {
  /**
   * The one reset sequence.
   *
   * Every path that starts or ends a consultation goes through this, so a
   * field added to any of the three hooks below cannot be cleared on one path
   * and left stale on another — which is exactly what had happened to the
   * three hand-copied versions this replaces.
   */
  const clearWorkspace = useCallback(() => {
    chart.reset();
    plan.reset();
    resetStory?.();
  }, [chart, plan, resetStory]);

  const resetConsultState = useCallback(() => {
    clearWorkspace();
    session.reset();
  }, [clearWorkspace, session]);

  // Front Desk may already have this patient waiting in today's queue. Resume
  // that visit instead of minting a second, disconnected one with its own
  // token — createVisit remains the fallback for Solo Mode / no queue entry.
  const resolveVisitForConsult = useCallback(async (patientId: string) => {
    const queued = await findQueuedVisit(patientId, identity.hospitalId);
    if (queued) {
      await markVisitServing(queued.id);
      return queued;
    }
    return createVisit({
      patientId,
      hospitalId: identity.hospitalId,
      doctorId: identity.doctorId,
    });
  }, [identity.hospitalId, identity.doctorId]);

  const handleStartConsultFromRecord = useCallback(async (incomingPatient: Patient) => {
    try {
      const visit = await resolveVisitForConsult(incomingPatient.id!);
      // Null first, then clear, then prefill, THEN set the real id — see
      // `prefillFromIntake`'s note on why this order is not cosmetic.
      session.setVisitId(null);
      session.setPatient(incomingPatient);
      clearWorkspace();
      const intake = await prefillFromIntake?.(visit.id);
      session.setVisitId(visit.id);
      session.setRepeatRxBanner(null);
      setActivePage(null);
      setSidebarOpen(false);
      showToast(startedMessage(incomingPatient.name, intake));
      focusChartSearch();

      // Excludes the visit just resolved above — otherwise a patient's very
      // first-ever consult sees its own brand-new, still-empty visit come
      // back as "1 previous visit".
      session.loadPastVisits(incomingPatient.id!, visit.id);
      // After clearWorkspace, never before — the reset would wipe them.
      carryForwardFor(incomingPatient.id!);
    } catch (err: any) {
      showToast(`Error starting consult: ${err.message}`);
    }
  }, [resolveVisitForConsult, session, clearWorkspace, setActivePage, setSidebarOpen,
      showToast, focusChartSearch, carryForwardFor, prefillFromIntake]);

  /**
   * Re-enter a visit that is ALREADY in progress — the Patients page's
   * "Resume consult" (Today's Patients ⋮ menu, active visits only) and
   * `useConsultSession`'s own reload/crash-recovery restore both need this,
   * not `handleStartConsultFromRecord` above: that one calls
   * `resolveVisitForConsult`, which only ever finds a `waiting` visit or
   * mints a brand new one — an already-`serving` visit matches neither
   * branch, so routing a resume through it would silently create a SECOND
   * visit row for the same encounter. This skips resolution entirely and
   * sets the exact known visit id directly.
   *
   * ⚠ Known gap, not fixed here: this restores WHICH patient and WHICH
   * visit, not the chart's own on-screen content. Nothing in this codebase
   * reads `visit_observations`/measurements/story back into the chart's
   * live React state on mount — every chip/measurement already written for
   * this visit is safely still in the DB (a re-toggle from here is a normal
   * upsert, not a duplicate), but the doctor sees a blank chart until they
   * start adding to it again. Building that read-back is a real, separate
   * feature (every one of useConsultChart/useConsultPlan/useVisitStory/
   * examination/measurements would need its own "load from this visit id"),
   * out of scope for what was asked here — see the handoff note for this.
   */
  const resumeConsult = useCallback((incomingPatient: Patient, visitId: string) => {
    session.setVisitId(null);
    session.setPatient(incomingPatient);
    clearWorkspace();
    session.setRepeatRxBanner(null);
    setActivePage(null);
    setSidebarOpen(false);
    // The read-back this function's own header used to record as a known gap
    // ("restores WHICH patient and WHICH visit, not the chart's own on-screen
    // content"). It is not the whole of that gap — the plan, the story and the
    // examination still rebuild from their own sources — but every chip and
    // every measurement already written for this visit now comes back instead
    // of the doctor facing a blank chart they have to retype.
    void (async () => {
      const intake = await prefillFromIntake?.(visitId);
      session.setVisitId(visitId);
      showToast(
        intake?.chips
          ? `Consult resumed for ${incomingPatient.name} — ${intake.chips} item${intake.chips === 1 ? "" : "s"} restored`
          : `Consult resumed for ${incomingPatient.name}`,
        { variant: "resume" }
      );
      focusChartSearch();
    })();
    session.loadPastVisits(incomingPatient.id!, visitId);
    carryForwardFor(incomingPatient.id!);
  }, [session, clearWorkspace, setActivePage, setSidebarOpen, showToast, focusChartSearch, carryForwardFor, prefillFromIntake]);

  const handlePatientConfirm = useCallback(async (incoming: Patient) => {
    try {
      let dbPatient: Patient;

      if (incoming.id) {
        dbPatient = incoming;
      } else {
        const existing = await findPatientByPhone(incoming.phone);
        if (existing) {
          dbPatient = {
            ...existing,
            age: String(existing.age),
            gender: existing.gender as Patient["gender"],
            dateOfBirth: existing.date_of_birth ?? undefined,
          };
        } else {
          const created = await createPatient(
            {
              name: incoming.name,
              age: Number(incoming.age),
              gender: incoming.gender,
              phone: incoming.phone,
              date_of_birth: incoming.dateOfBirth || null,
            },
            identity.hospitalId
          );
          dbPatient = {
            ...created,
            age: String(created.age),
            gender: created.gender as Patient["gender"],
            dateOfBirth: created.date_of_birth ?? undefined,
          };
        }
      }

      const visit = await resolveVisitForConsult(dbPatient.id!);
      session.setVisitId(null);
      session.setPatient(dbPatient);
      clearWorkspace();
      const intake = await prefillFromIntake?.(visit.id);
      session.setVisitId(visit.id);
      session.setRepeatRxBanner(null);
      session.setPatientModalOpen(false);
      setActivePage(null);
      showToast(startedMessage(dbPatient.name, intake));
      // The chart is where a consult actually begins, so the cursor lands there
      // and the first complaint is one keystroke away (spec §4.2).
      focusChartSearch();

      // Same exclusion as handleStartConsultFromRecord above.
      session.loadPastVisits(dbPatient.id!, visit.id);
      // After clearWorkspace, never before — the reset would wipe them.
      carryForwardFor(dbPatient.id!);
    } catch (err: any) {
      showToast(`Error: ${err.message}`);
    }
  }, [resolveVisitForConsult, session, clearWorkspace, identity.hospitalId,
      setActivePage, showToast, focusChartSearch, carryForwardFor, prefillFromIntake]);

  const handleRepeatRx = useCallback((visit: RealVisit) => {
    // A past visit stores v1 names ("fever"); the catalogue now speaks
    // observable labels ("Fever"). Match case-insensitively and carry the
    // CATALOGUE's spelling forward, so an imported chip is a real chip that
    // the engine can score — not a string that merely looks like one.
    const canonical = (name: string) =>
      observables.find((o) => o.label.toLowerCase() === name.toLowerCase())?.label;

    // Complaints AND context: a repeated Rx that quietly dropped "Known
    // diabetic" would re-rank the new consult without the frame the old one
    // had. The ContextBar picks the history half back up automatically.
    const validSymptoms = visit.symptoms
      .map(canonical)
      .filter((n): n is string => !!n && chart.reportableLabels.has(n));

    const validFindings = visit.findings
      .map((f) => canonical(f.name))
      .filter((n): n is string => !!n && chart.findingsAsDb.some((a) => a.name === n));

    const importedMeds: PrescriptionMedicine[] = visit.medicines.map((med, i) => ({
      id: `repeat-${med.medicine_id}-${i}`,
      medicine_id: med.medicine_id,
      composition_ids: [],
      primary_composition_id: 0,
      name: med.name,
      category: "",
      use: "",
      match: 0,
      composition: "",
      dosage: med.dosage_mg ? `${med.dosage_mg}mg` : "1 tab",
      frequency: med.frequency ? freqSlotToLabel(med.frequency) : "Morning and Night",
      duration: med.duration_days ? `${med.duration_days} days` : "5 days",
      notes: "",
      dosage_mg: med.dosage_mg,
      duration_days: med.duration_days,
      route: med.route ?? "oral",
      instructions: "",
      is_sos: false,
      sort_order: i,
    }));

    chart.replaceChart(validSymptoms, validFindings);
    plan.loadRepeatRx(importedMeds);

    const dateLabel = new Date(visit.created_at).toLocaleDateString("en-IN", {
      day: "numeric", month: "short", year: "numeric",
    });
    session.setRepeatRxBanner(`Repeat Rx from ${dateLabel}, Please review and edit before saving`);
    setTimeout(() => session.setRepeatRxBanner(null), 6000);
  }, [observables, chart, plan, session]);

  const handleConfirmAndSave = useCallback(async () => {
    const { visitId } = session;
    if (!visitId) { showToast("No active consult to save"); return; }
    session.setIsSaving(true);
    try {
      const medicineRows: SaveConsultMedicine[] = plan.prescription.map((m, i) => ({
        medicine_id: m.medicine_id,
        composition_ids: m.composition_ids ?? [],
        dosage_mg: m.dosage_mg ?? null,
        frequency: freqLabelToSlot(m.frequency),
        duration_days: m.duration_days ?? null,
        route: m.route ?? "oral",
        notes: m.notes ?? "",
        instructions: m.instructions ?? "",
        is_sos: m.is_sos ?? false,
        sort_order: i,
      }));

      const saved = await saveConsult({
        visitId,
        doctorId: identity.doctorId,
        hospitalId: identity.hospitalId,
        medicines: medicineRows,
        tests: plan.selectedTests,
        vitals: chart.vitals,
        // The working diagnosis leads, then what was seen on examination.
        findingsText: [...plan.diagnoses, ...chart.selectedFindings].join(", "),
        followUpDays: plan.followUpDays,
        adviceNotes: plan.reviewAdvice,
        therapyNotes: plan.therapyNotes || null,
        labName: plan.selectedLabName,
      });

      // The home programme, as rows rather than prose.
      //
      // ── Why this one is caught rather than thrown, unlike the writes above
      //
      // By this line the visit is already marked completed and the
      // prescription, its medicines and its orders are already committed.
      // Throwing here would put "Save failed" in front of a doctor whose
      // consultation DID save — they would then reasonably try again and
      // produce a second prescription for one visit.
      //
      // So the failure is surfaced LOUDLY and the save is allowed to finish.
      // Not fire-and-forget: the toast says exactly what is missing and the
      // error reaches the console, because a programme absent from the record
      // is also a wrong baseline for next session's progression badges, and a
      // physiotherapist needs to know that before they rely on one.
      if (plan.exercisePlan.length > 0) {
        try {
          await saveExercisePlan(saved.prescriptionId, plan.exercisePlan);
        } catch (e: any) {
          console.error("saveExercisePlan:", e);
          showToast(`Prescription saved, but the exercise programme did not: ${e?.message ?? e}`);
        }
      }

      // The Story + Goals write. Same caught-not-thrown posture as the
      // exercise programme above it, for the same reason — see `onSaveStory`'s
      // own doc comment on the Args interface.
      if (onSaveStory) {
        try {
          await onSaveStory(visitId, identity.isReal ? identity.doctorId : null);
        } catch (e: any) {
          console.error("onSaveStory:", e);
          showToast(`Prescription saved, but the story/goals did not: ${e?.message ?? e}`);
        }
      }

      // The visit is now a completed session of whatever course it belongs to.
      // Before the learning write, because this one is allowed to surface a
      // failure and that one is not.
      if (onVisitSaved) await onVisitSaved(visitId);

      // ★ The learning write. One insert, at the close of a consultation the
      // doctor actually finished — nothing is logged while they are still
      // working, because an abandoned draft is not evidence of anything.
      //
      // It records the ranking AS THE DOCTOR SAW IT (`intelligence.result` is
      // the same object that fed the panel), which is the only thing that makes
      // a past decision interpretable. Re-running the engine here to get a
      // "fresh" result would log a screen that never existed.
      //
      // Non-fatal by rule: a consult save must never fail because
      // personalisation did.
      //
      // Guarded on a REAL identity. Several signed-in doctor accounts have no
      // `doctors` row yet, and for those `useClinicalIdentity` falls back to the
      // MVP constant — which would file their prescribing under a different
      // doctor entirely. A missing row costs them personalisation until it is
      // created; writing anyway would corrupt someone else's model permanently,
      // and there is no way to unpick it afterwards. Ranking still works for
      // them: global evidence is identical for every doctor.
      if (intelligence.result && identity.isReal) {
        commitConsultation({
          visitId,
          doctorId: identity.doctorId,
          hospitalId: identity.hospitalId,
          result: intelligence.result,
          accepted: new Set(ledger.acceptedIntents.keys()),
          // Nothing is explicitly skipped in this UI yet; the implicit-skip
          // inference inside commitConsultation covers "shown, left untouched,
          // in a type where something else was taken".
          skipped: new Set<number>(),
          // Only deliberate picks — never the default the panel offered.
          chosenBrands: ledger.deliberateBrands,
          searched: ledger.searchedAccepts,
        }).catch((e) => console.warn("decision_log (non-fatal):", e));
      } else if (intelligence.result && !identity.isReal) {
        console.warn(
          "decision_log skipped: this account has no doctors row, so the " +
          "decision cannot be attributed. Create one to enable personalisation."
        );
      }

      session.setIsReviewOpen(false);
      resetConsultState();
      showToast("Prescription saved ✓");
    } catch (err: any) {
      showToast(`Save failed: ${err.message}`);
    } finally {
      session.setIsSaving(false);
    }
  }, [session, plan, chart, ledger, intelligence.result, identity,
      resetConsultState, showToast, onVisitSaved, onSaveStory]);

  const openReview = useCallback(() => {
    const blocking = plan.unreadPrescribedWarnings[0];
    if (blocking) {
      showToast(`Read the contraindication on ${blocking.label} before finishing`);
      return;
    }
    session.setIsReviewOpen(true);
  }, [plan.unreadPrescribedWarnings, session, showToast]);

  return {
    handleStartConsultFromRecord,
    resumeConsult,
    handlePatientConfirm,
    handleRepeatRx,
    handleConfirmAndSave,
    openReview,
    resetConsultState,
  };
}
