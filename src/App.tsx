import { CircleDot, HeartPulse, RefreshCw, UserRound } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { systemLabel } from "./lib/synapse/systems";
import { MedicineInspector } from "./components/MedicineInspector";
import { PatientHeader } from "./components/PatientHeader";
import { PatientModal } from "./components/PatientModal";
import { ActiveConsultGuard } from "./components/ActiveConsultGuard";
import { ShortcutsSheet } from "./components/ShortcutsSheet";
import ReviewModal from "./components/ReviewModal";
import { Sidebar } from "./features/sidebar/Sidebar";
import { GlobalLogoTrigger } from "./components/GlobalLogoTrigger";
import type { SidebarPage } from "./features/sidebar/SidebarNav";
import type { SelectedSymptom, Medicine, Patient, PrescriptionMedicine, Vitals } from "./types";
import { PatientsPage } from "./features/patients/PatientsPage";
import { SettingsPage } from "./features/settings/SettingsPage";
import { ComingSoonPage } from "./components/ComingSoonPage";
import { useConsultKeyboard } from "./hooks/useConsultKeyboard";
import { useDoctorHeartbeat } from "./hooks/useDoctorHeartbeat";
import { useClinicalIdentity } from "./hooks/useClinicalIdentity";
import { useSynapse } from "./hooks/useSynapse";
import { useConsultIntelligence } from "./hooks/useConsultIntelligence";
import { PickerCard, type PickerKind } from "./features/consult/PickerCard";
import { BrowseSheet } from "./features/consult/BrowseSheet";
import { MeasurementsCard } from "./features/consult/MeasurementsCard";
import { AttachmentsCard } from "./features/consult/AttachmentsCard";
import { DentalChartCard } from "./features/consult/DentalChartCard";
import { BodyMapCard } from "./features/consult/BodyMapCard";
import { GrowthChartCard } from "./features/consult/GrowthChartCard";
import { RecommendationsCard } from "./features/consult/RecommendationsCard";
import { SuggestionsCard } from "./features/consult/SuggestionsCard";
import { ConditionsCard } from "./features/consult/ConditionsCard";
import { ContributionSheet, type ExplainTarget } from "./features/consult/ContributionSheet";
import { relevantFields } from "./features/consult/measures";
import { PlanCard } from "./features/consult/PlanCard";
import { StatusBar } from "./features/consult/StatusBar";
import { topScoreByType } from "./features/consult/parts";
import { usePinnedMedicines } from "./features/consult/usePinnedMedicines";
import type { AcceptPayload } from "./features/consult/types";
import { BrandSheet } from "./features/synapse/BrandSheet";
import { profileFor } from "./features/synapse/specialtyProfile";
import { ageInMonths } from "./lib/growth/age";
import type { Sex } from "./lib/growth/growth";
import { useOnline } from "./features/frontdesk/operational/useOnline";
import type { PersonalizedIntent } from "./lib/synapse/personalize";
import type { CompanionSuggestion } from "./lib/synapse/companions";
import {
  commitConsultation, setClinicBrandDefault, clearClinicBrandDefault,
  fetchCompositionBrands, resolvePanelTests,
  type SearchedAccept,
} from "./lib/db/synapse";
import type { Medicine as SynapseBrand } from "./lib/synapse/brands";
import {
  DOCTOR_NAME, DOCTOR_SPECIALIZATION,
  createPatient, findPatientByPhone, createVisit,
  findQueuedVisit, markVisitServing,
  replaceVisitSymptoms, replaceVisitFindings,
  saveConsult,
  freqSlotToLabel, freqLabelToSlot,
  fetchPatientVisits,
  fetchDoctor, fetchHospital,
  type DBFinding,
  type SaveConsultMedicine, type RealVisit,
  type DBDoctor, type DBHospital,
} from "./lib/db";

const emptyVitals: Vitals = { bp: "", pulse: "", temp: "", spo2: "", weight: "" };

// Title + subtitle for every coming-soon feature page
const COMING_SOON_META: Record<string, { title: string; subtitle: string }> = {
  prescriptions: { title: "Prescriptions", subtitle: "Rx history & templates" },
  investigations: { title: "Investigations", subtitle: "Lab orders & results" },
  communication: { title: "Communication", subtitle: "Patient messages & follow-ups" },
  practice: { title: "Practice", subtitle: "Preferences & clinical tools" },
  clinic: { title: "Clinic", subtitle: "Staff, schedule & operations" },
  support: { title: "Support", subtitle: "Help & documentation" },
  // "settings" deliberately has no entry here — it's a real page
  // (features/settings/SettingsPage.tsx), not a coming-soon stub.
};

/**
 * A ranked molecule plus the brand chosen for it, as a prescription line.
 *
 * The engine ranks compositions; `brand` is the product actually dispensed.
 * A composition with no single-molecule product behind it is rankable but not
 * prescribable, and the caller must handle that rather than silently adding a
 * medicine with no id.
 */
function toPrescriptionLine(
  payload: AcceptPayload,
  brand: SynapseBrand,
  sortOrder: number
): PrescriptionMedicine {
  return {
    id: String(brand.id),
    medicine_id: brand.id,
    composition_ids: [brand.compositionId],
    primary_composition_id: brand.compositionId,
    name: brand.name,
    category: payload.label,
    use: "",
    match: 0,
    composition: payload.label,
    dosage: "1 tab",
    frequency: "Morning and Night",
    duration: "5 days",
    notes: "After food",
    dosage_mg: null,
    duration_days: null,
    route: brand.form ?? "oral",
    instructions: "",
    is_sos: false,
    sort_order: sortOrder,
    intent_id: payload.intentId,
    via_search: payload.viaSearch,
    overridden: payload.overridden,
  };
}

function hasActiveConsult(
  patient: Patient | null,
  prescription: PrescriptionMedicine[],
  selectedSymptoms: string[],
  selectedFindings: string[]
): boolean {
  return !!(
    patient
  );
}

function App() {
  const logoRef = useRef<HTMLDivElement>(null) as React.RefObject<HTMLDivElement>;
  // One ref per column — the three Tab stops of the workspace. The old
  // findings/tests refs are gone with the panels they pointed at.
  const chartSearchRef = useRef<HTMLInputElement>(null) as React.RefObject<HTMLInputElement>;
  const synapseSearchRef = useRef<HTMLInputElement>(null) as React.RefObject<HTMLInputElement>;
  const planRef = useRef<HTMLElement>(null) as React.RefObject<HTMLElement>;

  const [dbReady, setDbReady] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);
  const [bootAttempt, setBootAttempt] = useState(0);
  const [doctorProfile, setDoctorProfile] = useState<DBDoctor | null>(null);
  const [hospitalProfile, setHospitalProfile] = useState<DBHospital | null>(null);

  // ★ The one answer to "which doctor, which clinic". Everything Synapse
  // learns is keyed on these, so they have to be the signed-in ones — a bias
  // row written under the wrong doctor cannot be untangled later.
  const identity = useClinicalIdentity();
  const DOCTOR = useMemo(
    () => ({ id: identity.doctorId, name: identity.doctorName, specialty: identity.specialization }),
    [identity.doctorId, identity.doctorName, identity.specialization]
  );

  // Presence heartbeat: mark this doctor "online" for reception while Cortex is open.
  useDoctorHeartbeat(identity.ready ? identity.doctorId : null);

  const [patient, setPatient] = useState<Patient | null>(null);
  const [visitId, setVisitId] = useState<string | null>(null);
  const [vitals, setVitals] = useState<Vitals>(emptyVitals);
  const [selectedSymptoms, setSelectedSymptoms] = useState<string[]>([]);
  const [selectedSymptomsWithIntensity, setSelectedSymptomsWithIntensity] = useState<SelectedSymptom[]>([]);
  const [selectedFindings, setSelectedFindings] = useState<string[]>([]);
  const [prescription, setPrescription] = useState<PrescriptionMedicine[]>([]);
  const [selectedMedicineId, setSelectedMedicineId] = useState<string | null>(null);
  const [selectedTests, setSelectedTests] = useState<string[]>([]);

  // ── Synapse: what the doctor took, and what they were offered ──
  // `accepted` is keyed by intent id because that is what the engine ranked and
  // what the decision log records. The prescription rows are downstream of it.
  const [acceptedIntents, setAcceptedIntents] = useState<Map<number, AcceptPayload>>(new Map());
  const [chosenBrands, setChosenBrands] = useState<Map<number, number>>(new Map());
  const [searchedAccepts, setSearchedAccepts] = useState<SearchedAccept[]>([]);

  /** Impressions the doctor agreed with — the working diagnosis. */
  const [diagnoses, setDiagnoses] = useState<string[]>([]);

  /**
   * Hard warnings this doctor has read. Lifted out of the suggestions panel so
   * that closing the consult can refuse while a contraindication the doctor is
   * actually prescribing is still unread (handoff §14, second half of the gate).
   */
  const [acknowledgedIntents, setAcknowledgedIntents] = useState<Set<number>>(new Set());

  /**
   * Brands the doctor picked ON PURPOSE, as opposed to accepting the default.
   * Only these are fed to the learning write — see handleAcceptIntent.
   */
  const [deliberateBrands, setDeliberateBrands] = useState<Map<number, number>>(new Map());

  /**
   * Companion suggestions the doctor waved off, this consultation only.
   *
   * Per-consultation and deliberately not persisted: dismissing the PPI for
   * one patient says nothing about the next one, and a dismissal that outlived
   * the visit would quietly turn a nudge into a permanent opt-out the doctor
   * never asked for.
   */
  const [dismissedCompanions, setDismissedCompanions] = useState<Set<number>>(new Set());

  const [pastVisits, setPastVisits] = useState<RealVisit[]>([]);
  const [pastVisitsLoading, setPastVisitsLoading] = useState(false);

  const [stagedMedicine, setStagedMedicine] = useState<PrescriptionMedicine | null>(null);
  const [toast, setToast] = useState("");
  const [repeatRxBanner, setRepeatRxBanner] = useState<string | null>(null);
  const [patientModalOpen, setPatientModalOpen] = useState(true);
  const [activeConsultGuardOpen, setActiveConsultGuardOpen] = useState(false);
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [followUpDays, setFollowUpDays] = useState<number | null>(null);
  const [adviceNotes, setAdviceNotes] = useState<string>("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activePage, setActivePage] = useState<SidebarPage | null>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  /** Free text for this visit, separate from the advice the doctor accepted. */
  const [visitNotes, setVisitNotes] = useState("");
  const [suggestionsExpanded, setSuggestionsExpanded] = useState(false);
  /** which picker's browse-everything sheet is open */
  const [browse, setBrowse] = useState<PickerKind | null>(null);
  const [brandSheet, setBrandSheet] = useState<
    { intentId: number; compositionId: number; label: string; rect: DOMRect } | null
  >(null);

  /**
   * Which ranked item the doctor asked "why is this here" about.
   *
   * Never open by default. The contribution data has always been computed —
   * every scored intent carries its contributors — but showing it beside every
   * row turns a decision surface into a reading surface.
   */
  const [explain, setExplain] = useState<ExplainTarget | null>(null);

  const online = useOnline();

  const rankTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useConsultKeyboard({
    chartRef: chartSearchRef,
    synapseRef: synapseSearchRef,
    planRef,
    medicineCount: prescription.length,
    onNewPatient: () => setPatientModalOpen(true),
    onReviewRx: () => openReview(),
    onToggleShortcuts: () => setShortcutsOpen((v) => !v),
    isAnyModalOpen:
      patientModalOpen || isReviewOpen || activeConsultGuardOpen ||
      shortcutsOpen || !!stagedMedicine || !!selectedMedicineId,
  });

  // ★ Ranking + the catalogue. `observables` IS the catalogue in v2 (handoff
  // §16): symptoms, examination findings and patient history are one table
  // split by `kind`, not three. The legacy `symptoms` / `findings` tables still
  // hold every existing patient's history and Front Desk still writes them —
  // Cortex just no longer picks from them.
  const synapse = useSynapse();

  const observables = synapse.data?.observables ?? [];

  // ChartPanel takes the catalogue whole and splits it by `kind` itself — one
  // search over everything, and the chip routes to the right zone rather than
  // the doctor choosing a panel first (design spec §4.2). What App still needs
  // are the label sets below, which decide which SURFACE renders a chip and
  // what may legitimately sit in `selectedSymptoms`.

  /** Patient context — pregnancy, comorbidities, exposures. Rendered by ContextBar. */
  const historyLabels = useMemo(
    () => new Set(observables.filter((o) => o.kind === "history").map((o) => o.label)),
    [observables]
  );

  /** Everything that may legitimately sit in `selectedSymptoms`. */
  const reportableLabels = useMemo(
    () => new Set(
      observables
        .filter((o) => o.kind === "symptom" || o.kind === "history")
        .map((o) => o.label)
    ),
    [observables]
  );

  /** Seen on examination. */
  const findingObservables = useMemo(
    () => observables.filter((o) => o.kind === "finding"),
    [observables]
  );

  const observableByLabel = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of observables) m.set(o.label, o.id);
    return m;
  }, [observables]);

  /**
   * ReviewModal and the past-visit rail are typed against `DBFinding`, so the
   * finding observables are presented in that shape rather than rewriting them.
   * Every finding observable is an abnormal sign — the catalogue has no "chest
   * clear", because a normal finding emits no signal and is represented by
   * absence.
   */
  const findingsAsDb: DBFinding[] = useMemo(
    () => findingObservables.map((o) => ({
      id: o.id,
      name: o.label,
      group_name: systemLabel(o.system),
      is_abnormal: true,
    })),
    [findingObservables]
  );

  // ── One chart, two surfaces ─────────────────────────────────────────────
  // `selectedSymptoms` stays the single array it has always been — the engine,
  // the v1 compatibility write and the review modal all read it unchanged. It
  // is only SPLIT for rendering: complaints go to the picker, context to the
  // bar. Showing a chip in both places would let a doctor remove it twice and
  // wonder which surface won.
  const symptomChips = useMemo(
    () => selectedSymptoms.filter((l) => !historyLabels.has(l)),
    [selectedSymptoms, historyLabels]
  );

  const contextChips = useMemo(
    () => selectedSymptoms.filter((l) => historyLabels.has(l)),
    [selectedSymptoms, historyLabels]
  );

  /** Everything on the chart, for the ✓ in a search result or the browse sheet. */
  const onChartSet = useMemo(
    () => new Set([...selectedSymptoms, ...selectedFindings]),
    [selectedSymptoms, selectedFindings]
  );

  /** The symptoms picker owns the complaints half; context survives its edits. */
  const handleSymptomToggle = useCallback((label: string) => {
    setSelectedSymptoms((curr) =>
      curr.includes(label) ? curr.filter((l) => l !== label) : [...curr, label]
    );
    setSelectedSymptomsWithIntensity((curr) =>
      curr.some((i) => i.name === label)
        ? curr.filter((i) => i.name !== label)
        : [...curr, { name: label, intensity: "moderate" }]
    );
  }, []);

  const handleFindingToggle = useCallback((label: string) => {
    setSelectedFindings((curr) =>
      curr.includes(label) ? curr.filter((l) => l !== label) : [...curr, label]
    );
  }, []);

  const handleIntensityChange = useCallback(
    (label: string, intensity: SelectedSymptom["intensity"]) => {
      setSelectedSymptomsWithIntensity((curr) =>
        curr.some((i) => i.name === label)
          ? curr.map((i) => (i.name === label ? { ...i, intensity } : i))
          : [...curr, { name: label, intensity }]
      );
    },
    []
  );

  const handleContextToggle = useCallback((label: string) => {
    setSelectedSymptoms((curr) =>
      curr.includes(label) ? curr.filter((l) => l !== label) : [...curr, label]
    );
    // Context is never graded mild/moderate/severe. If an intensity row exists
    // for this label — a chart built before the bar existed — drop it.
    setSelectedSymptomsWithIntensity((curr) => curr.filter((s) => s.name !== label));
  }, []);

  useEffect(() => {
    if (!identity.ready) return;
    setBootError(null);
    Promise.all([
      fetchDoctor(identity.doctorId),
      fetchHospital(identity.hospitalId),
    ])
      .then(([doctor, hospital]) => {
        setDoctorProfile(doctor);
        setHospitalProfile(hospital);
        setDbReady(true);
      })
      .catch((err) => {
        const message = err instanceof Error ? err.message : String(err);
        showToast(`DB load failed: ${message}`);
        setBootError(message);
      });
  }, [identity.ready, identity.doctorId, identity.hospitalId, bootAttempt]);

  const retryBoot = useCallback(() => setBootAttempt((n) => n + 1), []);

  // The chart, as observable ids. Both panels hold display LABELS; this is the
  // one place they become the engine's vocabulary — and since the catalogue IS
  // the engine's vocabulary now, it is a lookup rather than a translation.
  const chartObservableIds = useMemo(
    () => [...selectedSymptoms, ...selectedFindings]
      .map((label) => observableByLabel.get(label))
      .filter((id): id is number => id !== undefined),
    [selectedSymptoms, selectedFindings, observableByLabel]
  );

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

  // The engine is a pure function over data already in memory, so ranking is
  // synchronous — the list re-ranks in the same frame the chip lands. The old
  // path posted every change to an edge function and waited 300 ms.
  const intelligence = useConsultIntelligence({
    data: synapse.data,
    visitId,
    observableIds: chartObservableIds,
    vitals,
    ageYears,
    ageMonths,
    sex: patientSex,
    acceptedIntentIds: useMemo(() => [...acceptedIntents.keys()], [acceptedIntents]),
    hospitalId: identity.hospitalId,
  });

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
    if (!visitId || !synapse.data) return;
    if (rankTimer.current) clearTimeout(rankTimer.current);

    const { symptomOf, findingOf } = synapse.data.observableMaps;

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
  }, [visitId, synapse.data, selectedSymptoms, selectedFindings,
      selectedSymptomsWithIntensity, observableByLabel]);

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(""), 2400);
  };
  const resetConsultState = () => {
    setPatient(null);
    setVisitId(null);
    setSelectedSymptomsWithIntensity([]);
    setVitals(emptyVitals);
    setSelectedSymptoms([]);
    setSelectedFindings([]);
    setPrescription([]);
    setSelectedMedicineId(null);
    setSelectedTests([]);
    setAcceptedIntents(new Map());
    setChosenBrands(new Map());
    setSearchedAccepts([]);
    setDiagnoses([]);
    setAcknowledgedIntents(new Set());
    setDeliberateBrands(new Map());
    setDismissedCompanions(new Set());
    setPastVisits([]);
    setRepeatRxBanner(null);
    setFollowUpDays(null);
    setAdviceNotes("");
    setVisitNotes("");
    setPatientModalOpen(true);
  };

  const handleOpenSidebar = () => {
    if (hasActiveConsult(patient, prescription, selectedSymptoms, selectedFindings)) {
      showToast("Consult in progress — your work is safe");
    }
    setSidebarOpen(true);
  };

  const handleSidebarNavigate = (page: SidebarPage) => {
    if (hasActiveConsult(patient, prescription, selectedSymptoms, selectedFindings)) {
      showToast("Consult paused — saved as draft");
    }
    setActivePage(page);
    setSidebarOpen(false);
    // Any consult-only overlay must die the moment we leave the consult screen —
    // it has no business surviving on Patients/Prescriptions/etc.
    setPatientModalOpen(false);
    setIsReviewOpen(false);
    setActiveConsultGuardOpen(false);
  };

  const handleSidebarConsult = () => {
    setActivePage(null);
    setSidebarOpen(false);
    if (!hasActiveConsult(patient, prescription, selectedSymptoms, selectedFindings)) {
      setPatientModalOpen(true);
    }
  };

  // Front Desk may already have this patient waiting in today's queue. Resume
  // that visit instead of minting a second, disconnected one with its own
  // token — createVisit remains the fallback for Solo Mode / no queue entry.
  const resolveVisitForConsult = useCallback(async (patientId: string) => {
    const queued = await findQueuedVisit(patientId, identity.hospitalId);
    if (queued) {
      await markVisitServing(queued.id);
      return queued;
    }
    return createVisit(patientId);
  }, [identity.hospitalId]);

  const handleStartConsultFromRecord = useCallback(async (incomingPatient: Patient) => {
    try {
      const visit = await resolveVisitForConsult(incomingPatient.id!);
      setVisitId(visit.id);
      setSelectedSymptomsWithIntensity([]);
      setPatient(incomingPatient);
      setVitals(emptyVitals);
      setSelectedSymptoms([]);
      setSelectedFindings([]);
      setPrescription([]);
      setSelectedMedicineId(null);
      setSelectedTests([]);
      setAcceptedIntents(new Map());
      setChosenBrands(new Map());
      setSearchedAccepts([]);
      setDiagnoses([]);
      setAcknowledgedIntents(new Set());
      setDeliberateBrands(new Map());
      setDismissedCompanions(new Set());
      setRepeatRxBanner(null);
      setFollowUpDays(null);
      setAdviceNotes("");
    setVisitNotes("");
      setActivePage(null);
      setSidebarOpen(false);
      showToast(`Consult started for ${incomingPatient.name}`);
      window.setTimeout(() => chartSearchRef.current?.focus(), 0);

      setPastVisitsLoading(true);
      fetchPatientVisits(incomingPatient.id!)
        .then(setPastVisits)
        .catch(() => { })
        .finally(() => setPastVisitsLoading(false));
    } catch (err: any) {
      showToast(`Error starting consult: ${err.message}`);
    }
  }, [resolveVisitForConsult]);

  // ────────────────────────────────────────────────────────────────────
  // Taking a suggestion.
  //
  // One entry point for every intent type, because the decision log records
  // them all the same way. Where each type LANDS differs — a medicine becomes
  // a prescription line, a test becomes an order, advice and referrals become
  // lines on the advice note — but the record of "the doctor took this" is one
  // shape, and that is what the learning loop reads.
  //
  // `commitAccept` is the second half: everything below assumes a medicine
  // intent already knows its product. `handleAcceptIntent` guarantees that.
  // ────────────────────────────────────────────────────────────────────
  const commitAccept = useCallback((payload: AcceptPayload, panelTestNames?: string[]) => {
    setAcceptedIntents((curr) => {
      if (curr.has(payload.intentId)) return curr;
      const next = new Map(curr);
      next.set(payload.intentId, payload);
      return next;
    });

    if (payload.viaSearch) {
      setSearchedAccepts((curr) => [
        ...curr.filter((s) => s.intentId !== payload.intentId),
        { intentId: payload.intentId, chosenMedicineId: payload.medicine?.id ?? null },
      ]);
    }

    switch (payload.type) {
      case "medicine": {
        if (!payload.medicine) {
          // Genuinely not prescribable: the catalogue holds no product with
          // this molecule on its own. `handleAcceptIntent` has already tried to
          // resolve one, so reaching here means there is nothing to resolve —
          // saying so is the whole point of surfacing it rather than quietly
          // dropping it.
          showToast(`${payload.label} has no single-molecule brand — search a product instead`);
          setAcceptedIntents((curr) => {
            const next = new Map(curr);
            next.delete(payload.intentId);
            return next;
          });
          return;
        }
        const brand = payload.medicine;
        setChosenBrands((curr) => new Map(curr).set(payload.intentId, brand.id));
        // Only a DELIBERATE pick teaches the brand model. Recording the default
        // as if it had been chosen would train the model on its own output
        // (handoff §12) — the drift §10a avoids by never logging the
        // personalised score.
        if (payload.brandDeliberate) {
          setDeliberateBrands((curr) => new Map(curr).set(payload.intentId, brand.id));
        }
        setPrescription((curr) => {
          if (curr.some((m) => m.medicine_id === brand.id)) return curr;
          return [...curr, toPrescriptionLine(payload, brand, curr.length)];
        });
        // Deliberately NOT opening the dose editor. The defaults are right most
        // of the time, and a modal after every single accept was the largest
        // click cost in the old workspace. The line is editable on the Plan.
        break;
      }
      case "test":
        // A panel intent isn't itself an orderable test — "Fever Workup" is
        // the accept, but CBC / Widal / Dengue NS1 etc. are what actually go
        // on the plan. `panelTestNames` carries that resolved list; every
        // other test accept still adds its own label as one line.
        if (panelTestNames) {
          setSelectedTests((curr) => {
            const merged = new Set(curr);
            panelTestNames.forEach((name) => merged.add(name));
            return [...merged];
          });
        } else {
          setSelectedTests((curr) =>
            curr.includes(payload.label) ? curr : [...curr, payload.label]
          );
        }
        break;
      case "referral":
        appendAdvice(`Refer to ${payload.label}`);
        break;
      case "advice":
      case "exercise":
        appendAdvice(payload.label);
        break;
      case "finding":
        // The engine's reading of the chart, taken as the working diagnosis.
        // It lands on the Plan and prints on the Rx — and, the part that was
        // missing until now, it is finally RECORDED as an accept, so the
        // decision log sees which impression the doctor actually agreed with.
        setDiagnoses((curr) =>
          curr.includes(payload.label) ? curr : [...curr, payload.label]
        );
        break;
    }
  }, []);

  /**
   * The product behind a molecule, fetched on demand.
   *
   * ── The bug this exists to fix ─────────────────────────────────────────
   * Only the RANKED medicine list ever had brands in hand: `useConsultIntelligence`
   * fetches them for the compositions the engine scored, and the ranked row
   * passes the resolved product straight into the accept. Every OTHER way of
   * reaching a medicine — searching for it, taking a companion before its
   * brands had loaded — handed the accept a `medicine: null`, and the accept
   * path read that as "this molecule has no product in the catalogue". The
   * doctor got "…has no single-molecule brand" on drugs with hundreds of
   * brands, and the intent was silently un-accepted.
   *
   * The catalogue was never the problem — `composition_brands` returns those
   * brands for anon and authenticated alike, and `medicine_composition_map`
   * has had a working read policy throughout. The lookup simply was not being
   * made. It is made here, once, for every path into an accept.
   *
   * The session cache inside `useConsultIntelligence` is consulted first, so
   * accepting a ranked medicine still costs no round trip.
   */
  const resolveBrandFor = useCallback(
    async (compositionId: number): Promise<SynapseBrand | null> => {
      const cached = intelligence.brands.get(compositionId);
      if (cached) return cached.brands[0] ?? null;
      if (!synapse.data) return null;

      const index = await fetchCompositionBrands({
        compositionIds: [compositionId],
        prefs: synapse.data.brandPreferences,
        clinicDefaults: synapse.data.clinicBrandDefaults,
        isPediatric: intelligence.isPediatric,
      });
      return index.get(compositionId)?.brands[0] ?? null;
    },
    [intelligence.brands, intelligence.isPediatric, synapse.data]
  );

  /**
   * The one entry point. A medicine that arrives without a product gets one
   * before anything else happens; a panel gets its member tests resolved the
   * same way; every other type passes straight through.
   */
  const handleAcceptIntent = useCallback((payload: AcceptPayload) => {
    if (payload.type === "test" && payload.refTable === "panels" && payload.refId != null) {
      resolvePanelTests(payload.refId)
        .then((testNames) => commitAccept(payload, testNames))
        .catch((err: any) => showToast(`Could not load tests for ${payload.label}: ${err.message}`));
      return;
    }
    if (payload.type !== "medicine" || payload.medicine) {
      commitAccept(payload);
      return;
    }

    const compositionId =
      payload.refTable === "compositions" ? payload.refId : null;
    if (compositionId == null) {
      // A medicine intent with no composition behind it is a data problem, not
      // a lookup failure, and must not be reported as one.
      showToast(`${payload.label} is not linked to a composition`);
      return;
    }

    resolveBrandFor(compositionId)
      .then((brand) => commitAccept({ ...payload, medicine: brand }))
      .catch((err) => {
        // The ranking is unaffected — only the product lookup failed — so this
        // says which half broke rather than blaming the molecule.
        console.warn("brand resolution failed:", err);
        showToast(`Could not load a product for ${payload.label} — try again`);
      });
  }, [commitAccept, resolveBrandFor]);

  const appendAdvice = (line: string) => {
    setAdviceNotes((curr) => {
      const existing = curr.split("\n").map((l) => l.trim()).filter(Boolean);
      if (existing.includes(line)) return curr;
      return [...existing, line].join("\n");
    });
  };

  /** Swap the brand under an already-chosen molecule. Always deliberate. */
  const handleChangeBrand = useCallback((intentId: number, brand: SynapseBrand) => {
    setChosenBrands((curr) => new Map(curr).set(intentId, brand.id));
    setDeliberateBrands((curr) => new Map(curr).set(intentId, brand.id));
    setPrescription((curr) =>
      curr.map((m) =>
        m.intent_id === intentId
          ? { ...m, id: String(brand.id), medicine_id: brand.id, name: brand.name, route: brand.form ?? m.route }
          : m
      )
    );
  }, []);

  /** Pin (or unpin) the brand the whole clinic sees first for this molecule. */
  const handlePinClinicBrand = useCallback(async (brand: SynapseBrand, pinned: boolean) => {
    try {
      if (pinned) {
        await setClinicBrandDefault({
          hospitalId: identity.hospitalId,
          compositionId: brand.compositionId,
          medicineId: brand.id,
          form: brand.form,
          setBy: null,
        });
        showToast(`${brand.name} is now the clinic default`);
      } else {
        await clearClinicBrandDefault({
          hospitalId: identity.hospitalId,
          compositionId: brand.compositionId,
          medicineId: brand.id,
        });
        showToast(`${brand.name} is no longer the clinic default`);
      }
      synapse.reload();
    } catch (err: any) {
      showToast(`Clinic default failed: ${err.message}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity.hospitalId, synapse.reload]);

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
          const created = await createPatient({
            name: incoming.name,
            age: Number(incoming.age),
            gender: incoming.gender,
            phone: incoming.phone,
            date_of_birth: incoming.dateOfBirth || null,
          });
          dbPatient = {
            ...created,
            age: String(created.age),
            gender: created.gender as Patient["gender"],
            dateOfBirth: created.date_of_birth ?? undefined,
          };
        }
      }

      const visit = await resolveVisitForConsult(dbPatient.id!);
      setVisitId(visit.id);
      setPatient(dbPatient);
      setVitals(emptyVitals);
      setSelectedSymptoms([]);
      setSelectedSymptomsWithIntensity([]);
      setSelectedFindings([]);
      setPrescription([]);
      setSelectedMedicineId(null);
      setSelectedTests([]);
      setAcceptedIntents(new Map());
      setChosenBrands(new Map());
      setSearchedAccepts([]);
      setDiagnoses([]);
      setAcknowledgedIntents(new Set());
      setDeliberateBrands(new Map());
      setDismissedCompanions(new Set());
      setRepeatRxBanner(null);
      setFollowUpDays(null);
      setAdviceNotes("");
    setVisitNotes("");
      setPatientModalOpen(false);
      setActivePage(null);
      showToast(`Consult started for ${dbPatient.name}`);
      // The chart is where a consult actually begins, so the cursor lands there
      // and the first complaint is one keystroke away (spec §4.2).
      window.setTimeout(() => chartSearchRef.current?.focus(), 0);

      setPastVisitsLoading(true);
      fetchPatientVisits(dbPatient.id!)
        .then(setPastVisits)
        .catch(() => { })
        .finally(() => setPastVisitsLoading(false));
    } catch (err: any) {
      showToast(`Error: ${err.message}`);
    }
  }, [resolveVisitForConsult]);

  const confirmStagedMedicine = () => {
    if (!stagedMedicine) return;
    setPrescription((curr) => [...curr, { ...stagedMedicine, sort_order: curr.length }]);
    setStagedMedicine(null);
    setSelectedMedicineId(null);
  };

  const updateMedicine = (updated: PrescriptionMedicine) => {
    if (stagedMedicine && stagedMedicine.id === updated.id) {
      setStagedMedicine(updated);
      return;
    }
    setPrescription((curr) => curr.map((m) => (m.id === updated.id ? updated : m)));
  };

  // Releasing an intent matters everywhere something is removed: an accept
  // the doctor took back is not an accept, and leaving it in the map would
  // teach the preference model a decision that never happened.
  const releaseIntent = (intentId: number) => {
    setAcceptedIntents((curr) => {
      const next = new Map(curr);
      next.delete(intentId);
      return next;
    });
    setChosenBrands((curr) => {
      const next = new Map(curr);
      next.delete(intentId);
      return next;
    });
    setSearchedAccepts((curr) => curr.filter((s) => s.intentId !== intentId));
  };

  const removeMedicine = (id: string) => {
    const line = prescription.find((m) => m.id === id);
    if (line?.intent_id != null) releaseIntent(line.intent_id);
    setPrescription((curr) => curr.filter((m) => m.id !== id));
    if (selectedMedicineId === id) setSelectedMedicineId(null);
  };

  const removeTest = (label: string) => {
    setSelectedTests((curr) => curr.filter((t) => t !== label));
    for (const [intentId, p] of acceptedIntents) {
      if (p.type === "test" && p.label === label) releaseIntent(intentId);
    }
  };

  /**
   * What actually prints as Advice: the lines the doctor ACCEPTED, then
   * anything they typed freehand. Two inputs, one field on the prescription —
   * the Rx prints a single advice block and the doctor should not have to
   * decide which half a line belongs in.
   */
  const reviewAdvice = useMemo(
    () => [adviceNotes, visitNotes.trim()].filter(Boolean).join("\n"),
    [adviceNotes, visitNotes]
  );

  /** Advice notes are one string; the Plan column edits them as lines. */
  const adviceLines = useMemo(
    () => adviceNotes.split("\n").map((l) => l.trim()).filter(Boolean),
    [adviceNotes]
  );

  const removeDiagnosis = (label: string) => {
    setDiagnoses((curr) => curr.filter((d) => d !== label));
    for (const [intentId, p] of acceptedIntents) {
      if (p.type === "finding" && p.label === label) releaseIntent(intentId);
    }
  };

  const handleAcknowledge = useCallback((intentId: number, ack: boolean) => {
    setAcknowledgedIntents((curr) => {
      const next = new Set(curr);
      if (ack) next.add(intentId);
      else next.delete(intentId);
      return next;
    });
    // Un-acknowledging withdraws the accept it permitted (handoff §14) — an
    // override the doctor took back must not stay on the prescription.
    if (!ack) {
      setPrescription((curr) => curr.filter((m) => m.intent_id !== intentId));
      releaseIntent(intentId);
    }
  }, [acceptedIntents]);

  const removeAdviceLine = (line: string) => {
    setAdviceNotes((curr) =>
      curr.split("\n").map((l) => l.trim()).filter((l) => l && l !== line).join("\n")
    );
    for (const [intentId, p] of acceptedIntents) {
      const asLine = p.type === "referral" ? `Refer to ${p.label}` : p.label;
      if ((p.type === "referral" || p.type === "advice" || p.type === "exercise") && asLine === line) {
        releaseIntent(intentId);
      }
    }
  };

  const handleRepeatRx = (visit: RealVisit) => {
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
      .filter((n): n is string => !!n && reportableLabels.has(n));

    const validFindings = visit.findings
      .map((f) => canonical(f.name))
      .filter((n): n is string => !!n && findingsAsDb.some((a) => a.name === n));

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

    setSelectedSymptoms(validSymptoms);
    setSelectedFindings(validFindings);
    setPrescription(importedMeds);
    setSelectedMedicineId(null);
    setStagedMedicine(null);

    const dateLabel = new Date(visit.created_at).toLocaleDateString("en-IN", {
      day: "numeric", month: "short", year: "numeric",
    });
    setRepeatRxBanner(`Repeat Rx from ${dateLabel}, Please review and edit before saving`);
    setTimeout(() => setRepeatRxBanner(null), 6000);
  };

  const handleConfirmAndSave = async () => {
    if (!visitId) { showToast("No active consult to save"); return; }
    setIsSaving(true);
    try {
      const medicineRows: SaveConsultMedicine[] = prescription.map((m, i) => ({
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

      await saveConsult({
        visitId,
        medicines: medicineRows,
        tests: selectedTests,
        vitals,
        // The working diagnosis leads, then what was seen on examination.
        findingsText: [...diagnoses, ...selectedFindings].join(", "),
        followUpDays,
        adviceNotes: reviewAdvice,
      });

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
          accepted: new Set(acceptedIntents.keys()),
          // Nothing is explicitly skipped in this UI yet; the implicit-skip
          // inference inside commitConsultation covers "shown, left untouched,
          // in a type where something else was taken".
          skipped: new Set<number>(),
          // Only deliberate picks — never the default the panel offered.
          chosenBrands: deliberateBrands,
          searched: searchedAccepts,
        }).catch((e) => console.warn("decision_log (non-fatal):", e));
      } else if (intelligence.result && !identity.isReal) {
        console.warn(
          "decision_log skipped: this account has no doctors row, so the " +
          "decision cannot be attributed. Create one to enable personalisation."
        );
      }

      setIsReviewOpen(false);
      resetConsultState();
      showToast("Prescription saved ✓");
    } catch (err: any) {
      showToast(`Save failed: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  /**
   * The second half of the §14 gate.
   *
   * A hard warning attached to something in the ranked list is gated by its own
   * acknowledge button. Nothing gates an intent reached by SEARCH or from the
   * frequent list — those have no button to lock — so the close of the consult
   * is where that is caught: if the doctor is prescribing something a guard is
   * warning about and has not read the reason, review does not open.
   */
  const unreadPrescribedWarnings = useMemo(
    () => intelligence.hardWarned.filter(
      (i) => acceptedIntents.has(i.intentId) && !acknowledgedIntents.has(i.intentId)
    ),
    [intelligence.hardWarned, acceptedIntents, acknowledgedIntents]
  );

  const openReview = useCallback(() => {
    const blocking = unreadPrescribedWarnings[0];
    if (blocking) {
      showToast(`Read the contraindication on ${blocking.label} before finishing`);
      return;
    }
    setIsReviewOpen(true);
  }, [unreadPrescribedWarnings]);

  const selectedMedicine = useMemo(
    () => prescription.find((m) => m.id === selectedMedicineId),
    [prescription, selectedMedicineId]
  );

  const inspectorMedicine = stagedMedicine
    ? stagedMedicine
    : selectedMedicineId && !stagedMedicine
      ? selectedMedicine
      : null;

  const prescriptionCompositionIds = useMemo(
    () => prescription.flatMap((m) => m.composition_ids ?? []),
    [prescription]
  );

  const acceptedIntentIdSet = useMemo(
    () => new Set(acceptedIntents.keys()),
    [acceptedIntents]
  );

  // ── The specialty profile ───────────────────────────────────────────────
  // Which intent type this facility elevates into the Primary Recommendation
  // slot. Read once from the facility, never inferred from what the doctor is
  // doing — see specialtyProfile.ts for why that distinction is load-bearing.
  const specialty = useMemo(
    () => profileFor(hospitalProfile?.specialty_profile),
    [hospitalProfile?.specialty_profile]
  );

  /**
   * The doctor's pins — the heart on a recommendation row.
   *
   * A pin lifts that medicine to the top of the recommendations whenever it is
   * ranked again. It reorders what is SHOWN and never touches a score, so the
   * bar beside a pinned row still draws the engine's real reading.
   */
  const pins = usePinnedMedicines(
    identity.isReal ? identity.doctorId : null,
    identity.isReal ? identity.hospitalId : null
  );

  /** The denominator behind every rank bar and relevance word on this screen. */
  const topOfType = useMemo(
    () => topScoreByType(intelligence.intents as PersonalizedIntent[]),
    [intelligence.intents]
  );

  const handleExplain = useCallback(
    (intent: PersonalizedIntent, anchor: DOMRect) => setExplain({ intent, anchor }),
    []
  );

  /**
   * Which measurements the chart has just made worth taking.
   *
   * Derived from the engine's own active signals rather than from the chip
   * labels, so "Fever", "Fever with rash" and the Hindi alias all surface
   * Temperature through the one signal they share. Static mapping, no
   * inference — see `measures.ts`.
   */
  const measureRelevance = useMemo(
    () => relevantFields(intelligence.signals),
    [intelligence.signals]
  );

  const handleOpenBrandSheet = useCallback(
    (intent: PersonalizedIntent, rect: DOMRect) => {
      if (intent.refTable !== "compositions" || intent.refId == null) return;
      setBrandSheet({
        intentId: intent.intentId,
        compositionId: intent.refId,
        label: intent.label,
        rect,
      });
    },
    []
  );

  // ── Companions, indexed by the medicine that triggered them ─────────────
  // The Plan asks per line. Anything already on the plan, or waved off this
  // consultation, never reaches the slot.
  const companionsByTrigger = useMemo(() => {
    const m = new Map<number, CompanionSuggestion[]>();
    for (const c of intelligence.companions?.suggestions ?? []) {
      if (dismissedCompanions.has(c.companionIntentId)) continue;
      if (acceptedIntents.has(c.companionIntentId)) continue;
      for (const trigger of c.triggeredBy) {
        const list = m.get(trigger);
        if (list) list.push(c);
        else m.set(trigger, [c]);
      }
    }
    return m;
  }, [intelligence.companions, dismissedCompanions, acceptedIntents]);

  const companionsFor = useCallback(
    (intentId: number) => companionsByTrigger.get(intentId) ?? [],
    [companionsByTrigger]
  );

  const dismissCompanion = useCallback((companionIntentId: number) => {
    setDismissedCompanions((curr) => new Set(curr).add(companionIntentId));
  }, []);

  /**
   * Taking a companion.
   *
   * It routes through the same accept path as everything else, because the
   * decision log must not be able to tell a companion apart from a suggestion
   * the doctor reached any other way — it is a prescription either way. The
   * one thing that has to happen here is resolving the BRAND: a companion
   * carries an intent id and a label, not a product, so the brand index (which
   * now covers companion compositions) is consulted before handing it on.
   */
  const handleAddCompanion = useCallback((c: CompanionSuggestion) => {
    const intent = synapse.data?.ruleset.intents.get(c.companionIntentId);
    const compositionId =
      intent?.refTable === "compositions" ? intent.refId : null;
    const brand =
      c.type === "medicine" && compositionId != null
        ? intelligence.brands.get(compositionId)?.brands[0] ?? null
        : null;

    handleAcceptIntent({
      intentId: c.companionIntentId,
      type: c.type,
      label: c.label,
      refTable: intent?.refTable ?? null,
      refId: intent?.refId ?? null,
      medicine: brand,
      // It was offered by the pairing table, not by the ranking, so it is not
      // a ranked accept and must not be logged as one.
      viaSearch: true,
      overridden: c.status === "warn_hard",
    });
  }, [synapse.data, intelligence.brands, handleAcceptIntent]);

  if (!dbReady) {
    return (
      <div className="app-shell" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
        <div style={{ textAlign: "center", color: "var(--muted)" }}>
          <div style={{ fontSize: 28, marginBottom: 12 }}>⚕</div>
          {bootError ? (
            <>
              <p style={{ fontSize: 14, color: "var(--cs-red, #b42318)" }}>
                Couldn't reach the AREN database.
              </p>
              <p style={{ fontSize: 12, marginTop: 4, marginBottom: 16 }}>{bootError}</p>
              <button
                onClick={retryBoot}
                style={{
                  fontSize: 13,
                  padding: "8px 18px",
                  borderRadius: 8,
                  border: "1px solid var(--line, #dbe2ec)",
                  background: "var(--card, #fff)",
                  cursor: "pointer",
                }}
              >
                Retry
              </button>
            </>
          ) : (
            <p style={{ fontSize: 14 }}>Connecting to AREN database…</p>
          )}
        </div>
      </div>
    );
  }

  // ── The one rule: feature pages get the full viewport, no topbar, no vitals ──
  const isFeaturePage = activePage !== null;

  // Resolve coming-soon page meta (fallback for any unmapped page)
  const comingSoonMeta = activePage
    ? (COMING_SOON_META[activePage] ?? {
      title: activePage.charAt(0).toUpperCase() + activePage.slice(1),
      subtitle: "Coming soon",
    })
    : null;

  return (
    <div className="app-shell">

      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        activePage={activePage}
        onNavigate={handleSidebarNavigate}
        onConsult={handleSidebarConsult}
        doctor={DOCTOR}
        logoRef={logoRef}
      />

      {/* Invisible, always-reachable click target that mirrors wherever the
          real logo currently is. Lives outside every header's stacking
          context, so it stays clickable even while the patient modal (or
          any other overlay) is covering the screen. See component for why. */}
      <GlobalLogoTrigger
        logoRef={logoRef}
        onOpenSidebar={handleOpenSidebar}
        sidebarOpen={sidebarOpen}
        active={patientModalOpen || isReviewOpen || activeConsultGuardOpen}
      />

      {/* Topbar and vitals only render on the consult workspace */}
      {!isFeaturePage && (
        <PatientHeader
          patient={patient ?? { name: "—", age: "—", gender: "", phone: "" }}
          doctor={DOCTOR}
          onOpenPatientModal={() => {
            if (patient && visitId) {
              setActiveConsultGuardOpen(true);
            } else {
              setPatientModalOpen(true);
            }
          }}
          onReviewRx={openReview}
          onCancelConsult={resetConsultState}
          onOpenSidebar={handleOpenSidebar}
          isSidebarOpen={sidebarOpen}
          pastVisits={pastVisits}
          pastVisitsLoading={pastVisitsLoading}
          onRepeatRx={handleRepeatRx}
          logoRef={logoRef}
        />
      )}

      {/* Feature pages */}
      {activePage === "patients" ? (
        <PatientsPage
          onStartConsult={handleStartConsultFromRecord}
          logoRef={logoRef}
          onOpenSidebar={handleOpenSidebar}
        />
      ) : activePage === "settings" ? (
        <SettingsPage
          logoRef={logoRef}
          onOpenSidebar={handleOpenSidebar}
          hospitalId={identity.hospitalId}
          hospitalProfile={hospitalProfile}
          doctorProfile={doctorProfile}
          doctorName={DOCTOR.name}
          onSpecialtyChanged={(id) =>
            setHospitalProfile((prev) => (prev ? { ...prev, specialty_profile: id } : prev))
          }
        />
      ) : isFeaturePage && comingSoonMeta ? (
        <ComingSoonPage
          logoRef={logoRef}
          onOpenSidebar={handleOpenSidebar}
          title={comingSoonMeta.title}
          subtitle={comingSoonMeta.subtitle}
        />
      ) : (
        /* ── The consultation, read top to bottom ──────────────────────────
           History → Symptoms → Findings → Measurements → Recommendations,
           with the Consultation Plan running alongside as the destination of
           all of them. Built to docs/Aren Cortex Mock 2.png; the layout rules
           are in docs/Aren cortex visual philosophy.md. */
        <div className="cs-shell">
          <main className="cs-page">
            {/* Context first, but not at the same visual weight as the three
                cards below it. Most consults tick zero or one of these — equal
                card treatment for a rarely-used field is visual symmetry
                winning over clinical flow, which the philosophy doc's
                "Clinical Flow over Visual Symmetry" rule exists to prevent.
                Same PickerCard, same behaviour, just full-width and shorter
                instead of competing for one of the four grid slots. Toggling a
                chip here still re-runs the engine in the same frame, so
                ticking "Pregnant" still turns contraindicated medicines red
                with no other click anywhere. */}
            <div className="cs-context-strip">
              <PickerCard
                kind="history"
                title="History / Context"
                glyph={<UserRound size={12} />}
                glyphTone="blue"
                placeholder="Search history…"
                observables={observables}
                selected={contextChips}
                onToggle={handleContextToggle}
                onChart={onChartSet}
                onBrowse={() => setBrowse("history")}
                emptyHint="Pregnancy, comorbidities, allergies — what frames the whole consultation."
                disabled={!patient}
              />
            </div>

            {/* Three cards: what the patient reports, what the doctor finds,
                and the engine's reading of both. Possible Conditions is last
                because it reads from all three plus the measurements, and any
                earlier position would imply it reflects only the card
                beside it. */}
            <div className="cs-pickers">
              <PickerCard
                kind="symptom"
                title="Symptoms"
                glyph={<HeartPulse size={12} />}
                glyphTone="rose"
                placeholder="Search symptoms…"
                observables={observables}
                selected={symptomChips}
                onToggle={handleSymptomToggle}
                onChart={onChartSet}
                intensities={selectedSymptomsWithIntensity}
                onIntensityChange={handleIntensityChange}
                onBrowse={() => setBrowse("symptom")}
                emptyHint="What the patient came in with. Hindi works too — बुखार, bukhar."
                disabled={!patient}
                searchRef={chartSearchRef}
              />

              <PickerCard
                kind="finding"
                title="Findings"
                note="On Examination"
                glyph={<CircleDot size={12} />}
                glyphTone="teal"
                placeholder="Search findings…"
                observables={observables}
                selected={selectedFindings}
                onToggle={handleFindingToggle}
                onChart={onChartSet}
                onBrowse={() => setBrowse("finding")}
                emptyHint="What you saw on examination — every entry here is an abnormal sign."
                disabled={!patient}
              />

              {/* The engine's reading, beside the chart it reads. It used to
                  sit inside Clinical Suggestions between Investigations and
                  Advice, which put the answer to "what is going on" below the
                  answers to "what do I do about it". It re-ranks in the same
                  frame a chip lands, so the doctor watches their own reasoning
                  move as they type.

                  It is DELIBERATELY the fourth card and not the second: it
                  reads from all three pickers plus the measurements, and
                  placing it after its inputs is the only arrangement that does
                  not imply it only reflects the one beside it. */}
              <ConditionsCard
                intents={intelligence.byType.finding}
                topScore={topOfType.get("finding") ?? 0}
                acceptedIntentIds={acceptedIntentIdSet}
                acknowledged={acknowledgedIntents}
                onAcknowledge={handleAcknowledge}
                onAccept={handleAcceptIntent}
                onExplain={handleExplain}
                ruleset={synapse.data?.ruleset ?? null}
                activeSignals={intelligence.result?.activeSignals ?? []}
                hasChart={intelligence.hasInput}
                disabled={!patient}
              />
            </div>

            <div className="cs-body">
              <div className="cs-body-left">
                {/* The single source of truth for these five numbers. The
                    topbar strip that used to duplicate them is gone. */}
                <MeasurementsCard
                  vitals={vitals}
                  onChange={setVitals}
                  // Which fields this facility shows without being asked —
                  // the same one-time onboarding config that decides which
                  // intent type gets the Primary Recommendation slot.
                  defaultKeys={specialty.measurements}
                  relevantKeys={measureRelevance.keys}
                  relevantBecause={measureRelevance.because}
                  disabled={!patient}
                />

                {/* Secondary by design (atlas S14.5's attachment philosophy —
                    "structured first, artifact when necessary"): sits after
                    the numbers, before the engine's own output, never
                    competing with either for attention. */}
                <AttachmentsCard visitId={visitId} disabled={!patient} />

                {/* Per-tooth record, separate from Attachments — a finding
                    can exist with no X-ray at all, and most do. Gated on the
                    facility's specialty profile (Settings → Specialty) since
                    2026-08-11 — it shipped always-visible, which meant a
                    dermatologist scrolling past a tooth chart on every
                    patient. specialtyProfile.ts's `charts` field is the
                    single read point; the card itself is unchanged and still
                    presentation-only (the engine never reads it). */}
                {specialty.charts.includes("dental") && (
                  <DentalChartCard
                    visitId={visitId}
                    // Same corruption-risk gate as every other attribution
                    // write in this file (line ~1143) — a fallback identity
                    // must never write a real doctor's id onto a finding it
                    // did not enter.
                    doctorId={identity.isReal ? identity.doctorId : null}
                    disabled={!patient}
                  />
                )}

                {/* Same argument as the dental chart, for the rest of the
                    body: "where" is a clinical input a free-text box cannot
                    carry — site decides topical potency and distribution is
                    itself diagnostic. Same specialty gate, same reasoning,
                    just `charts.includes("body")` instead. */}
                {specialty.charts.includes("body") && (
                  <BodyMapCard
                    visitId={visitId}
                    doctorId={identity.isReal ? identity.doctorId : null}
                    disabled={!patient}
                  />
                )}

                {/* Reads weight and height straight off `vitals` rather than
                    holding its own copy — two renderings of one number is how
                    a consultation ends up with two different numbers (the same
                    reason the vitals strip left PatientHeader). Note this gate
                    hides the PANEL only: the WAZ z-score is derived in
                    consultInput.ts on every consult, so a general physician
                    still gets GROWTH_FALTERING ranked for a malnourished
                    child, they just aren't shown a growth curve for adults. */}
                {specialty.charts.includes("growth") && (
                  <GrowthChartCard
                    ageMonths={ageMonths}
                    sex={patientSex}
                    weightKg={vitals.weight}
                    heightCm={vitals.height ?? ""}
                    disabled={!patient}
                  />
                )}

                <div className="cs-engine">
                  <RecommendationsCard
                    intents={intelligence.byType.medicine}
                    topScore={topOfType.get("medicine") ?? 0}
                    brands={intelligence.brands}
                    brandsLoading={intelligence.brandsLoading}
                    brandError={intelligence.brandError}
                    brandPreferences={synapse.data?.brandPreferences}
                    acceptedIntentIds={acceptedIntentIdSet}
                    chosenBrands={chosenBrands}
                    acknowledged={acknowledgedIntents}
                    onAcknowledge={handleAcknowledge}
                    onAccept={handleAcceptIntent}
                    isPinned={pins.isPinned}
                    onTogglePin={pins.toggle}
                    onOpenBrandSheet={handleOpenBrandSheet}
                    onExplain={handleExplain}
                    ruleset={synapse.data?.ruleset ?? null}
                    activeSignals={intelligence.result?.activeSignals ?? []}
                    hasChart={intelligence.hasInput}
                    searchRef={synapseSearchRef}
                  />

                  <SuggestionsCard
                    byType={intelligence.byType}
                    topOfType={topOfType}
                    acceptedIntentIds={acceptedIntentIdSet}
                    acknowledged={acknowledgedIntents}
                    onAcknowledge={handleAcknowledge}
                    onAccept={handleAcceptIntent}
                    onExplain={handleExplain}
                    ruleset={synapse.data?.ruleset ?? null}
                    activeSignals={intelligence.result?.activeSignals ?? []}
                    expanded={suggestionsExpanded}
                    onToggleExpanded={() => setSuggestionsExpanded((v) => !v)}
                    hasChart={intelligence.hasInput}
                    disabled={!patient}
                  />
                </div>
              </div>

              <PlanCard
                diagnoses={diagnoses}
                onRemoveDiagnosis={removeDiagnosis}
                prescription={prescription}
                onSelectMedicine={setSelectedMedicineId}
                onUpdateMedicine={updateMedicine}
                onRemoveMedicine={removeMedicine}
                tests={selectedTests}
                onRemoveTest={removeTest}
                adviceLines={adviceLines}
                onRemoveAdviceLine={removeAdviceLine}
                followUpDays={followUpDays}
                onFollowUpChange={setFollowUpDays}
                notes={visitNotes}
                onNotesChange={setVisitNotes}
                companionsFor={companionsFor}
                onAddCompanion={handleAddCompanion}
                onDismissCompanion={dismissCompanion}
                onAddMedicine={() => synapseSearchRef.current?.focus()}
                onAddTest={() => setSuggestionsExpanded(true)}
                onReviewRx={openReview}
                onPrint={openReview}
                panelRef={planRef}
              />
            </div>
          </main>

          <StatusBar
            active={synapse.status === "ready"}
            modelVersion={synapse.data?.ruleset.version ?? null}
            specialty={specialty.label}
            degraded={!!synapse.data?.degraded}
            unidentified={!identity.isReal}
            online={online}
          />

          {/* The brand picker, anchored to the row that opened it. */}
          {brandSheet && intelligence.brands.get(brandSheet.compositionId) && (
            <BrandSheet
              anchor={brandSheet.rect}
              composition={intelligence.brands.get(brandSheet.compositionId)!}
              compositionLabel={brandSheet.label}
              currentMedicineId={chosenBrands.get(brandSheet.intentId) ?? null}
              brandPreferences={synapse.data?.brandPreferences ?? new Map()}
              clinicDefaults={synapse.data?.clinicBrandDefaults ?? new Map()}
              onChoose={(m) => handleChangeBrand(brandSheet.intentId, m)}
              onPinClinic={handlePinClinicBrand}
              onClose={() => setBrandSheet(null)}
            />
          )}

          {/* "Why is this here?" — the engine's own contribution data, on
              request only. Anchored to the row that asked, like the brand
              sheet, and closed by anything else. */}
          {explain && synapse.data && (
            <ContributionSheet
              target={explain}
              signalLabels={synapse.data.signalLabels}
              onClose={() => setExplain(null)}
            />
          )}

          {browse && (
            <BrowseSheet
              kind={browse}
              observables={observables}
              selected={onChartSet}
              onToggle={
                browse === "history" ? handleContextToggle
                  : browse === "symptom" ? handleSymptomToggle
                    : handleFindingToggle
              }
              onClose={() => setBrowse(null)}
            />
          )}
        </div>
      )
      }

      {
        inspectorMedicine && (
          <MedicineInspector
            medicine={inspectorMedicine}
            symptoms={selectedSymptoms}
            findings={selectedFindings}
            isStaging={!!stagedMedicine}
            onUpdate={updateMedicine}
            onConfirmStaged={confirmStagedMedicine}
            onClose={() => { setStagedMedicine(null); setSelectedMedicineId(null); }}
          />
        )
      }

      {
        repeatRxBanner && (
          <div className="repeat-rx-banner">
            <RefreshCw size={13} />
            <span>{repeatRxBanner}</span>
            <button type="button" onClick={() => setRepeatRxBanner(null)} aria-label="Dismiss">×</button>
          </div>
        )
      }

      {shortcutsOpen && <ShortcutsSheet onClose={() => setShortcutsOpen(false)} />}

      {toast && <div className="toast">{toast}</div>}

      {
        !isFeaturePage && activeConsultGuardOpen && (
          <ActiveConsultGuard
            visitId={visitId!}  // ← ADD THIS LINE (the ! means "I promise it's not null")
            patientName={patient?.name ?? "this patient"}
            onDiscard={() => {
              resetConsultState();
              setActiveConsultGuardOpen(false);
            }}
            onComplete={() => {
              // After saving as draft/referral, reset and start new consult
              resetConsultState();
              setActiveConsultGuardOpen(false);
              setPatientModalOpen(true); // Open modal to start new consult
            }}
            onClose={() => setActiveConsultGuardOpen(false)}
          />
        )
      }
      {
        !isFeaturePage && patientModalOpen && (
          <PatientModal
            onClose={patient ? () => setPatientModalOpen(false) : () => { }}
            onConfirm={handlePatientConfirm}
          />
        )
      }

      {
        !isFeaturePage && isReviewOpen && patient && (
          <ReviewModal
            patient={patient}
            doctor={{
              name: doctorProfile?.name ?? DOCTOR_NAME,
              specialization: doctorProfile?.specialization ?? DOCTOR_SPECIALIZATION,
              qualification: doctorProfile?.qualification ?? null,
              registration_number: doctorProfile?.registration_number ?? null,
              signature_image_url: doctorProfile?.signature_image_url ?? null,
              avatar_url: (doctorProfile as any)?.avatar_url ?? null,
            }}
            hospital={hospitalProfile}
            vitals={vitals}
            symptoms={selectedSymptoms}
            findings={selectedFindings}
            allFindings={findingsAsDb}
            prescription={prescription}
            tests={selectedTests}
            isSaving={isSaving}
            onEdit={() => setIsReviewOpen(false)}
            onSave={handleConfirmAndSave}
            onClose={() => setIsReviewOpen(false)}
            followUpDays={followUpDays}
            adviceNotes={reviewAdvice}
            visitId={visitId ?? undefined}
          />
        )
      }
    </div >
  );
}

export default App;