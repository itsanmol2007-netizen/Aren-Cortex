// ---------------------------------------------------------------------------
// THE LONGITUDINAL RECORD — a confirmed condition becomes a durable fact about
// the patient, and comes back on their next visit.
//
// Built 2026-08-15 from docs/confirmed-conditions-investigation.md (2026-07-30),
// which checked every claim below against the live schema before any of it was
// written. Read that document before changing this one.
//
// ── The problem this solves
//
// Confirming a Possible Condition used to do exactly one thing: push a string
// onto `diagnoses`, which prints on the Rx. It did not re-rank the consultation
// it was confirmed in, and it did not survive the visit. The reason was not the
// engine — the engine already re-runs purely and synchronously on every chart
// change — it was that a confirmed condition had NOWHERE TO GO:
//
//   intents (type='finding')     "Type 2 diabetes mellitus"  an OUTPUT to rank
//   observables (kind='history')  "Known diabetic"           an INPUT to read
//
// Same clinical fact, two catalogues, authored for different jobs, and — checked
// — ZERO label overlap between them. `condition_observable_map` is that join.
//
// ── Why this is a hook and not two lines inside useConsultPlan
//
// It spans three layers that cannot be collapsed: it reads the catalogue (the
// map), it mutates the chart (layer 1), and it writes patient-level data using
// the session and the identity. `useConsultPlan`'s header states that the chart
// and the patient are OUT of its scope, and that boundary is worth keeping —
// the plan is what was DECIDED, and a standing fact about a patient is not a
// line on a prescription.
//
// Declared after `useConsultSession` and before `useConsultPlan`, which is the
// only position that works: it needs the patient at render time, and the plan
// needs it at render time.
//
// ── The one rule that matters most here
//
// `is_chronic` decides whether anything durable happens at all. Most finding
// intents are EPISODES — nobody is permanently appendicitic — and a wrong
// standing fact is worse than no standing fact, because it silently reframes
// every future consultation and looks freshly entered every time. So the map is
// deliberately small and hand-curated, and an unmapped condition falls through
// to exactly the old behaviour rather than guessing.
//
// ── The write is TWO-WAY as of 2026-08-16 ──────────────────────────────────
//
// It was one-way for a day, and that was the feature's worst property: a
// condition confirmed in error could be un-ticked from today's chart and came
// back at the next visit, forever, looking freshly entered. Atlas §14.21
// called it "the most important gap" and it was right to.
//
// `retireCondition` closes it. Taking a carried-forward chip off now asks
// what the removal MEANS, because the three answers are genuinely different
// and only one of them is what the × used to do:
//
//   not today  — off this consult; the patient still has the condition
//   resolved   — it was true and no longer is
//   refuted    — it was never true
//
// The old behaviour is still there and still the default-looking option, but
// it is no longer the ONLY thing the × can mean, which is what made it a lie:
// the chip's own tooltip said "remove it if it no longer applies" and removing
// it did not make it stop applying.
// ---------------------------------------------------------------------------

import { useCallback } from "react";
import type { ConsultChart } from "./useConsultChart";
import type { ConsultSession } from "./useConsultSession";
import type { ClinicalIdentity } from "./useClinicalIdentity";
import type { SynapseData } from "./useSynapse";
import {
  loadPatientConditions,
  retirePatientCondition,
  upsertPatientCondition,
  type Observable,
} from "../lib/db/synapse";

export interface LongitudinalRecordArgs {
  data: SynapseData | null;
  chart: ConsultChart;
  session: ConsultSession;
  identity: ClinicalIdentity;
}

export interface LongitudinalRecord {
  /**
   * Called when the doctor confirms a condition.
   *
   * Returns the label of the standing fact it established, or null when this
   * condition is not mapped — the caller uses that only to decide whether to
   * say anything; the reranking has already happened either way.
   */
  confirmCondition: (intentId: number) => string | null;
  /** Pull this patient's standing conditions onto a freshly started consult. */
  carryForwardFor: (patientId: string) => Promise<void>;
  /**
   * Take a standing fact off the patient for good — see the header.
   *
   * Takes the chip's LABEL, because that is what every surface in the consult
   * speaks; the observable id is looked up here, which is the same boundary
   * `confirmCondition` sits on.
   *
   * Throws rather than swallowing. The doctor asked for this explicitly, and a
   * silent failure would tell them it worked while the condition stayed active
   * and returned at the next visit — which is the exact bug being fixed.
   */
  retireCondition: (label: string, status: "resolved" | "refuted") => Promise<void>;
}

export function useLongitudinalRecord({
  data,
  chart,
  session,
  identity,
}: LongitudinalRecordArgs): LongitudinalRecord {
  const { addContextObservable, carryForward } = chart;

  /** observable id -> label, since the chart speaks labels and the DB speaks ids. */
  const labelOf = useCallback(
    (observableId: number): string | null =>
      data?.observables.find((o: Observable) => o.id === observableId)?.label ?? null,
    [data]
  );

  const confirmCondition = useCallback(
    (intentId: number): string | null => {
      const entry = data?.conditionMap.get(intentId);
      // Not every condition is mapped, and that is the design rather than a
      // gap to fill in later. An unmapped confirm behaves exactly as it did
      // before this feature existed.
      if (!entry) return null;

      const label = labelOf(entry.observableId);
      if (!label) return null;

      // ★ This single line IS "confirming a condition reranks the consult".
      // The label joins `selectedSymptoms`, `chartObservableIds` derives from
      // that, and the engine re-runs in the same frame — no new plumbing, no
      // debounce, no loading state.
      addContextObservable(label, "confirmed");

      // The durable half. Chronic only: an episode reranks today and is
      // recorded in this visit's observations, but must not follow the patient.
      //
      // Non-fatal by rule, exactly like the decision log: a doctor's
      // consultation must never break because the longitudinal write did. And
      // guarded on a REAL identity for the same reason `commitConsultation` is
      // — an account with no `doctors` row would file this confirmation under
      // the fallback doctor, and a mis-attributed standing fact on a real
      // patient cannot be unpicked afterwards.
      if (entry.isChronic && session.patient?.id) {
        upsertPatientCondition({
          patientId: session.patient.id,
          observableId: entry.observableId,
          visitId: session.visitId,
          doctorId: identity.isReal ? identity.doctorId : null,
        }).catch((e) => console.warn("patient_conditions (non-fatal):", e));
      }

      return label;
    },
    [data, labelOf, addContextObservable, session.patient?.id, session.visitId,
     identity.isReal, identity.doctorId]
  );

  const retireCondition = useCallback(
    async (label: string, status: "resolved" | "refuted") => {
      const patientId = session.patient?.id;
      if (!patientId) return;

      const observable = data?.observables.find((o: Observable) => o.label === label);
      // A carried-forward chip always has an observable behind it — that is
      // how it got here. If the catalogue has moved underneath us, removing it
      // from today's chart is still right and is the caller's job; there is
      // simply no durable row to retire.
      if (!observable) return;

      await retirePatientCondition({
        patientId,
        observableId: observable.id,
        status,
        visitId: session.visitId,
      });
    },
    [data, session.patient?.id, session.visitId]
  );

  const carryForwardFor = useCallback(
    async (patientId: string) => {
      try {
        const rows = await loadPatientConditions(patientId);
        const labels = rows
          .map((r) => labelOf(r.observableId))
          .filter((l): l is string => !!l);
        carryForward(labels);
      } catch (e) {
        // Same rule as above. A consult that cannot load history is a consult
        // without carried-forward context, not a broken consult.
        console.warn("patient_conditions load (non-fatal):", e);
      }
    },
    [labelOf, carryForward]
  );

  return { confirmCondition, carryForwardFor, retireCondition };
}
