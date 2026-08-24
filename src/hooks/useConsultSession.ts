// ---------------------------------------------------------------------------
// THE SESSION RECORD — who this consultation is with, which visit it is, and
// the flags that say where in the consultation we are.
//
// Extracted 2026-08-15 as Stage 2, step 3 (atlas §14.19). It is the third and
// last of the "layer 1" hooks, and the layering is worth stating once because
// it is what decides which hook anything new belongs in:
//
//   Layer 1  facts, no dependencies    useConsultChart · useAcceptLedger · this
//   Layer 2  the engine                useConsultIntelligence — reads layer 1
//   Layer 3  behaviour                 useConsultPlan · useConsultLifecycle —
//                                      read layer 2, mutate layer 1
//
// That ordering is forced by React, not chosen: `useConsultIntelligence` needs
// the patient's age and the visit id at RENDER time, and everything that
// STARTS or ENDS a consultation needs the engine's result at render time too.
// Both cannot be second. So the record lives here, and the transitions on it
// live in useConsultLifecycle.ts — the same split, for the same reason, as
// useAcceptLedger.ts against useConsultPlan.ts.
//
// The one effect this hook owns is the v1 compatibility write, which is here
// rather than in useConsultChart because it needs a visit id: the chart does
// not know a patient exists, and should not.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Patient } from "../types";
import { ageInMonths } from "../lib/growth/age";
import type { Sex } from "../lib/growth/growth";
import {
  replaceVisitSymptoms, replaceVisitFindings,
  fetchPatientVisits,
  type RealVisit,
} from "../lib/db";
import type { SynapseData } from "./useSynapse";
import type { ConsultChart } from "./useConsultChart";

export interface ConsultSessionArgs {
  chart: ConsultChart;
  data: SynapseData | null;
}

export interface ConsultSession {
  patient: Patient | null;
  setPatient: React.Dispatch<React.SetStateAction<Patient | null>>;
  visitId: string | null;
  setVisitId: React.Dispatch<React.SetStateAction<string | null>>;

  pastVisits: RealVisit[];
  pastVisitsLoading: boolean;
  /**
   * Fetch this patient's history for the past-visit rail. `excludeVisitId` is
   * the consult in progress right now — always pass it once
   * `resolveVisitForConsult` has returned a visit id, or that brand-new,
   * still-empty row comes back as this patient's own "past visit" (see
   * `fetchPatientVisits`).
   */
  loadPastVisits: (patientId: string, excludeVisitId?: string | null) => void;

  repeatRxBanner: string | null;
  setRepeatRxBanner: React.Dispatch<React.SetStateAction<string | null>>;

  isSaving: boolean;
  setIsSaving: React.Dispatch<React.SetStateAction<boolean>>;
  isReviewOpen: boolean;
  setIsReviewOpen: React.Dispatch<React.SetStateAction<boolean>>;
  patientModalOpen: boolean;
  setPatientModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  activeConsultGuardOpen: boolean;
  setActiveConsultGuardOpen: React.Dispatch<React.SetStateAction<boolean>>;

  // ── Derived from the patient ──────────────────────────────────────────
  ageYears: number | null;
  /** exact age in months from the date of birth — growth standards only */
  ageMonths: number | null;
  patientSex: Sex | null;
  /**
   * Whether a consultation is under way.
   *
   * Keys on the patient alone, deliberately: a consult with a patient and an
   * empty chart is still a consult in progress, and what is on the chart or
   * the prescription does not change the answer.
   */
  hasActiveConsult: boolean;

  reset: () => void;
}

export function useConsultSession({ chart, data }: ConsultSessionArgs): ConsultSession {
  const [patient, setPatient] = useState<Patient | null>(null);
  const [visitId, setVisitId] = useState<string | null>(null);
  const [pastVisits, setPastVisits] = useState<RealVisit[]>([]);
  const [pastVisitsLoading, setPastVisitsLoading] = useState(false);
  const [repeatRxBanner, setRepeatRxBanner] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [patientModalOpen, setPatientModalOpen] = useState(true);
  const [activeConsultGuardOpen, setActiveConsultGuardOpen] = useState(false);

  const rankTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const ageYears = useMemo(() => {
    const n = Number.parseInt(String(patient?.age ?? ""), 10);
    return Number.isFinite(n) ? n : null;
  }, [patient?.age]);

  // Exact age, for the growth standards only. Null whenever no date of birth
  // is recorded — which is every patient created before that column existed —
  // and everything downstream is built to skip rather than approximate.
  // Never derived from `ageYears`: twelve times an integer year is a made-up
  // month count, and a made-up month puts a child on the wrong curve.
  const ageMonths = useMemo(
    () => ageInMonths(patient?.dateOfBirth),
    [patient?.dateOfBirth]
  );

  // WHO publishes separate standards per sex, and has none for "Other" — so
  // that maps to null and the chart says why instead of picking one.
  const patientSex = useMemo<Sex | null>(() => {
    const g = String(patient?.gender ?? "").toLowerCase();
    return g === "male" ? "male" : g === "female" ? "female" : null;
  }, [patient?.gender]);

  const { selectedSymptoms, selectedFindings, selectedSymptomsWithIntensity, observableByLabel } = chart;

  // ── The v1 compatibility write ──────────────────────────────────────────
  //
  // `visit_observations` is the permanent, engine-shaped record and is written
  // by useConsultIntelligence. This second write keeps `visit_symptoms` /
  // `visit_findings` current as well, because Front Desk's visit detail, the
  // past-visit rail and every existing patient record still read them.
  //
  // Only chips that HAVE a legacy row can be written there — the v2 catalogue
  // is five times the size of the v1 one, so a chip like "Positive slump test"
  // simply has no v1 equivalent and lives only in visit_observations. That gap
  // closes when the v1 tables are torn down and everything reads observations.
  // This whole effect dies with them.
  useEffect(() => {
    if (!visitId || !data) return;
    if (rankTimer.current) clearTimeout(rankTimer.current);

    const { symptomOf, findingOf } = data.observableMaps;

    rankTimer.current = setTimeout(() => {
      const legacySymptoms: number[] = [];
      const intensities: ("mild" | "moderate" | "severe")[] = [];
      for (const label of selectedSymptoms) {
        const obsId = observableByLabel.get(label);
        const legacyId = obsId != null ? symptomOf.get(obsId) : undefined;
        if (legacyId == null) continue;
        legacySymptoms.push(legacyId);
        intensities.push(
          selectedSymptomsWithIntensity.find((s) => s.name === label)?.intensity ?? "moderate"
        );
      }

      const legacyFindings = selectedFindings
        .map((label) => observableByLabel.get(label))
        .map((obsId) => (obsId != null ? findingOf.get(obsId) : undefined))
        .filter((id): id is number => id != null);

      replaceVisitSymptoms(visitId, legacySymptoms, intensities).catch(() => { });
      replaceVisitFindings(visitId, legacyFindings).catch(() => { });
    }, 300);

    return () => { if (rankTimer.current) clearTimeout(rankTimer.current); };
  }, [visitId, data, selectedSymptoms, selectedFindings,
      selectedSymptomsWithIntensity, observableByLabel]);

  const loadPastVisits = useCallback((patientId: string, excludeVisitId?: string | null) => {
    setPastVisitsLoading(true);
    fetchPatientVisits(patientId, excludeVisitId)
      .then(setPastVisits)
      .catch(() => { })
      .finally(() => setPastVisitsLoading(false));
  }, []);

  const reset = useCallback(() => {
    setPatient(null);
    setVisitId(null);
    setPastVisits([]);
    setRepeatRxBanner(null);
    setPatientModalOpen(true);
  }, []);

  return {
    patient, setPatient,
    visitId, setVisitId,
    pastVisits,
    pastVisitsLoading,
    loadPastVisits,
    repeatRxBanner, setRepeatRxBanner,
    isSaving, setIsSaving,
    isReviewOpen, setIsReviewOpen,
    patientModalOpen, setPatientModalOpen,
    activeConsultGuardOpen, setActiveConsultGuardOpen,
    ageYears,
    ageMonths,
    patientSex,
    hasActiveConsult: !!patient,
    reset,
  };
}
