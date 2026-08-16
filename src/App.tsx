import {
  PersonStanding, RefreshCw, Smile, TrendingUp,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MedicineInspector } from "./components/MedicineInspector";
import { PatientHeader } from "./components/PatientHeader";
import { PatientModal } from "./components/PatientModal";
import { ActiveConsultGuard } from "./components/ActiveConsultGuard";
import { ShortcutsSheet } from "./components/ShortcutsSheet";
import ReviewModal from "./components/ReviewModal";
import { Sidebar } from "./features/sidebar/Sidebar";
import { GlobalLogoTrigger } from "./components/GlobalLogoTrigger";
import type { SidebarPage } from "./features/sidebar/SidebarNav";
import { PatientsPage } from "./features/patients/PatientsPage";
import { SettingsPage } from "./features/settings/SettingsPage";
import { ComingSoonPage } from "./components/ComingSoonPage";
import { useConsultKeyboard } from "./hooks/useConsultKeyboard";
import { useDoctorHeartbeat } from "./hooks/useDoctorHeartbeat";
import { useClinicalIdentity } from "./hooks/useClinicalIdentity";
import { useSynapse } from "./hooks/useSynapse";
import { useConsultIntelligence } from "./hooks/useConsultIntelligence";
import { useConsultChart } from "./hooks/useConsultChart";
import { useAcceptLedger } from "./hooks/useAcceptLedger";
import { useConsultSession } from "./hooks/useConsultSession";
import { useLongitudinalRecord } from "./hooks/useLongitudinalRecord";
import { useCarePlan } from "./hooks/useCarePlan";
import { useConsultPlan } from "./hooks/useConsultPlan";
import { useConsultLifecycle } from "./hooks/useConsultLifecycle";
import { type PickerKind } from "./features/consult/PickerCard";
import { BrowseSheet } from "./features/consult/BrowseSheet";
import { MedicineAddSheet } from "./features/consult/MedicineAddSheet";
import { useChartSummaries } from "./features/consult/useChartSummaries";
import { GeneralOpdInputs } from "./features/consult/GeneralOpdInputs";
import { SoapInputs } from "./features/consult/SoapInputs";
import { DentalChartCard } from "./features/consult/DentalChartCard";
import { BodyMapCard } from "./features/consult/BodyMapCard";
import { GrowthChartCard } from "./features/consult/GrowthChartCard";
import { RecommendationsCard } from "./features/consult/RecommendationsCard";
import { SuggestionsCard } from "./features/consult/SuggestionsCard";
import { ConditionsCard } from "./features/consult/ConditionsCard";
import { SpecialtyExamCard } from "./features/consult/SpecialtyExamCard";
import { ContributionSheet, type ExplainTarget } from "./features/consult/ContributionSheet";
import { relevantFields } from "./features/consult/measures";
import { buildTrendSummary } from "./features/consult/trend";
import { formatLine, type ExerciseLine } from "./features/consult/exercisePlan";
import { ExercisePlanCard } from "./features/consult/ExercisePlanCard";
import { LongitudinalBand } from "./features/consult/LongitudinalBand";
import { CarePlanSheet } from "./features/consult/CarePlanSheet";
import { PastVisitCard } from "./components/PastVisitCard";
import { PlanCard } from "./features/consult/PlanCard";
import { StatusBar } from "./features/consult/StatusBar";
import { topScoreByType } from "./features/consult/parts";
import { usePinnedMedicines } from "./features/consult/usePinnedMedicines";
import { BrandSheet } from "./features/synapse/BrandSheet";
import { profileFor, type ChartKind } from "./features/synapse/specialtyProfile";
import { useOnline } from "./features/frontdesk/operational/useOnline";
import type { PersonalizedIntent } from "./lib/synapse/personalize";
import { type Observable } from "./lib/db/synapse";
import {
  DOCTOR_NAME, DOCTOR_SPECIALIZATION,
  fetchDoctor, fetchHospital,
  type DBDoctor, type DBHospital, type RealVisit,
} from "./lib/db";
import { fetchLastExercisePlan } from "./lib/db/exercises";

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

function App() {
  const logoRef = useRef<HTMLDivElement>(null) as React.RefObject<HTMLDivElement>;
  // One ref per Tab stop of the workspace, in the order STOPS walks them
  // (useConsultKeyboard.ts). The old findings/tests refs are gone with the
  // panels they pointed at.
  const chartSearchRef = useRef<HTMLInputElement>(null) as React.RefObject<HTMLInputElement>;
  /**
   * The Measurements card — a Tab stop added 2026-08-15b. Shared by every
   * specialty profile (`MeasurementsCard` is one component, configured, not
   * forked per specialty — see its own header), so this one ref and its
   * one line below in each Inputs component is the whole of what a future
   * specialty's copy of `GeneralOpdInputs.tsx` needs to keep to get this for
   * free; see that file's own header for the "copy it, rename it" rule.
   */
  const measurementsRef = useRef<HTMLElement>(null) as React.RefObject<HTMLElement>;
  /** the Assessment card's search — the second Tab stop, added 2026-08-15 */
  const assessmentSearchRef = useRef<HTMLInputElement>(null) as React.RefObject<HTMLInputElement>;
  const synapseSearchRef = useRef<HTMLInputElement>(null) as React.RefObject<HTMLInputElement>;
  const planRef = useRef<HTMLElement>(null) as React.RefObject<HTMLElement>;
  /** the Plan row, so "Add Test" in the summary can bring it into view */
  const planRowRef = useRef<HTMLDivElement>(null);

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

  const [toast, setToast] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activePage, setActivePage] = useState<SidebarPage | null>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  const [suggestionsExpanded, setSuggestionsExpanded] = useState(false);
  /** which picker's browse-everything sheet is open */
  const [browse, setBrowse] = useState<PickerKind | null>(null);
  /**
   * Which specialty chart is open, launched from the Measurements row.
   * The charts render nowhere on the page otherwise — see the launcher
   * comment in `MeasurementsCard` and `.cs-meas-tool` in consult.css.
   */
  const [openChart, setOpenChart] = useState<ChartKind | null>(null);
  const [brandSheet, setBrandSheet] = useState<
    { intentId: number; compositionId: number; label: string; rect: DOMRect } | null
  >(null);
  /**
   * The shared past-visit detail, and which point on screen it points at.
   *
   * This lived inside `PatientHeader` until 2026-08-16. It moved up here
   * because the longitudinal band's visit timeline is a second way into the
   * SAME view, and cortex-longitudinal-spec §3.1 says in as many words: do not
   * build a second detail view. See PastVisitCard.tsx.
   *
   * Being here rather than in the header also puts it in `isAnyModalOpen`
   * below for the first time — it was outside that list for as long as it was
   * local state, which is exactly the §14.22e defect (Tab reaching through an
   * open overlay to the workspace behind it).
   */
  const [activeVisit, setActiveVisit] = useState<{ visit: RealVisit; x: number } | null>(null);
  const [carePlanSheetOpen, setCarePlanSheetOpen] = useState(false);

  /**
   * Which ranked item the doctor asked "why is this here" about.
   *
   * Never open by default. The contribution data has always been computed —
   * every scored intent carries its contributors — but showing it beside every
   * row turns a decision surface into a reading surface.
   */
  const [explain, setExplain] = useState<ExplainTarget | null>(null);

  const online = useOnline();

  // Every hook below takes this, so it is stable rather than rebuilt each
  // render — an unstable one would churn the identity of every handler that
  // depends on it, all the way down into the ranked panels.
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(""), 2400);
  }, []);

  // Where a consult actually begins. Passed to the lifecycle hook rather than
  // the ref itself, so that hook stays ignorant of the DOM.
  const focusChartSearch = useCallback(() => {
    window.setTimeout(() => chartSearchRef.current?.focus(), 0);
  }, []);

  // ★ Ranking + the catalogue. `observables` IS the catalogue in v2 (handoff
  // §16): symptoms, examination findings and patient history are one table
  // split by `kind`, not three. The legacy `symptoms` / `findings` tables still
  // hold every existing patient's history and Front Desk still writes them —
  // Cortex just no longer picks from them.
  const synapse = useSynapse();

  const observables = synapse.data?.observables ?? [];

  // ★ The chart — what has been recorded about this patient, and everything
  // derived from it. `useConsultChart` owns the four pieces of state, the six
  // handlers that mutate them and the catalogue indexes they need; see that
  // file's header for where the boundary is and why. Destructured under the
  // names this file already used, so every call site below reads unchanged.
  const chart = useConsultChart(observables);
  const {
    vitals, setVitals,
    selectedSymptoms, selectedSymptomsWithIntensity, selectedFindings,
    reportableLabels, observableByLabel, findingsAsDb,
    symptomChips, contextChips, onChartSet, caseSheetEntries, chartObservableIds,
    handleSymptomToggle, handleFindingToggle, handleContextToggle,
    handleIntensityChange, handleObservableToggle, handleCaseSheetRemove,
  } = chart;

  // ★ The decision ledger — which engine intent each thing on the plan came
  // from. Declared before the engine because the engine reads the accepted
  // ids (they drive companions) at the same render the plan reads the engine
  // back; see useAcceptLedger.ts for why that ordering is forced.
  const ledger = useAcceptLedger();

  // ★ The session record — who this consult is with, which visit it is, and
  // the flags for where in the consultation we are. Layer 1 like the chart and
  // the ledger: it holds facts, and the transitions ON those facts live in
  // useConsultLifecycle below. See useConsultSession.ts for the layering.
  const session = useConsultSession({ chart, data: synapse.data });
  const {
    patient, visitId,
    pastVisits, pastVisitsLoading,
    repeatRxBanner, setRepeatRxBanner,
    isSaving, isReviewOpen, setIsReviewOpen,
    patientModalOpen, setPatientModalOpen,
    activeConsultGuardOpen, setActiveConsultGuardOpen,
    ageYears, ageMonths, patientSex, hasActiveConsult,
  } = session;

  // ★ The longitudinal record — a confirmed condition becomes an engine input
  // and, when it is chronic, a fact that survives the visit. Sits between the
  // session and the plan because it needs the patient at render time and the
  // plan needs it at render time. See useLongitudinalRecord.ts.
  const { confirmCondition, carryForwardFor } = useLongitudinalRecord({
    data: synapse.data,
    chart,
    session,
    identity,
  });

  // ★ The care plan — the course of treatment this visit is one session of.
  // Layer 1 beside the session for the same reason as the longitudinal record:
  // it needs the patient at render time and nothing downstream of it. See
  // useCarePlan.ts, and note its warning about `care_plans` RLS.
  /**
   * The programme this patient was last actually given, for the exercise
   * card's progression badges. A plain effect rather than a hook of its own:
   * it is one read keyed on the patient, with no transitions on it.
   */
  const [previousExercises, setPreviousExercises] = useState<{ lines: ExerciseLine[]; at: string | null }>(
    { lines: [], at: null }
  );
  useEffect(() => {
    const pid = patient?.id;
    if (!pid) { setPreviousExercises({ lines: [], at: null }); return; }
    let cancelled = false;
    fetchLastExercisePlan(pid)
      .then((r) => { if (!cancelled) setPreviousExercises(r); })
      .catch(() => { if (!cancelled) setPreviousExercises({ lines: [], at: null }); });
    return () => { cancelled = true; };
  }, [patient?.id]);

  const carePlan = useCarePlan({
    patientId: patient?.id ?? null,
    doctorId: identity.doctorId,
    hospitalId: identity.hospitalId,
    onError: showToast,
  });

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

  // The engine is a pure function over data already in memory, so ranking is
  // synchronous — the list re-ranks in the same frame the chip lands. The old
  // path posted every change to an edge function and waited 300 ms.
  const intelligence = useConsultIntelligence({
    data: synapse.data,
    visitId,
    observableIds: chartObservableIds,
    observableSources: chart.observableSources,
    vitals,
    ageYears,
    ageMonths,
    sex: patientSex,
    acceptedIntentIds: ledger.acceptedIntentIds,
    hospitalId: identity.hospitalId,
  });

  // ★ The plan — everything the doctor has TAKEN, and the accept-to-plan
  // pipeline that gets it there. Sits after the intelligence hook because the
  // accept path reads the brand index and the engine's active signals; see
  // useConsultPlan.ts's header for the full boundary.
  const plan = useConsultPlan({
    data: synapse.data,
    reloadSynapse: synapse.reload,
    intelligence,
    ledger,
    hospitalId: identity.hospitalId,
    showToast,
    confirmCondition,
  });
  const {
    prescription, selectedTests, diagnoses, visitNotes, setVisitNotes,
    followUpDays, setFollowUpDays,
    acceptedIntents, acceptedIntentIdSet, chosenBrands, deliberateBrands,
    searchedAccepts, acknowledgedIntents,
    adviceLines, therapyLines, therapyNotes, exercisePlan, reviewAdvice, justAdded, unreadPrescribedWarnings,
    selectedMedicineId, setSelectedMedicineId, stagedMedicine, setStagedMedicine,
    pendingMedicine, setPendingMedicine, inspectorMedicine,
    confirmPendingMedicine, confirmStagedMedicine,
    handleAcceptIntent, handleAcknowledge, handleChangeBrand, handlePinClinicBrand,
    updateMedicine, removeMedicine, removeTest, removeDiagnosis, removeAdviceLine,
    removeTherapyLine, updateExercise, removeExercise, duplicateExerciseForSide,
    companionsFor, handleAddCompanion, dismissCompanion,
  } = plan;

  /**
   * Alt+1/2/3 — severity, on the symptom the doctor just recorded.
   *
   * "Just recorded" is the LAST entry of kind `symptom` on the case sheet,
   * which is where the one they are still thinking about always is: chips are
   * appended in the order they were taken. The alternative — a roving focus
   * over the chips — costs three more keys to reach the chip that is already
   * the obvious subject, and severity entered three keystrokes later is
   * severity entered at the wrong moment.
   *
   * Silent when there is no symptom yet: an Alt+2 typed a moment early should
   * do nothing, not file "moderate" against whatever is nearest.
   */
  const handleSeverityKey = useCallback(
    (intensity: "mild" | "moderate" | "severe") => {
      const last = [...caseSheetEntries].reverse().find((e) => e.kind === "symptom");
      if (!last) return;
      handleIntensityChange(last.label, intensity);
      showToast(`${last.label} — ${intensity}`);
    },
    [caseSheetEntries, handleIntensityChange, showToast]
  );

  useConsultKeyboard({
    chartRef: chartSearchRef,
    measurementsRef,
    assessmentRef: assessmentSearchRef,
    synapseRef: synapseSearchRef,
    planRef,
    medicineCount: prescription.length,
    // Was `() => setPatientModalOpen(true)` unconditionally — Ctrl+N bypassed
    // the exact guard `onOpenPatientModal` (PatientHeader's mouse button)
    // already enforces below, so a doctor mid-consult who reflexively hit
    // Ctrl+N had the patient-intake modal thrown over their work with no
    // warning and no way back to it. This is the same check, so the keyboard
    // and the mouse can no longer disagree about what "new patient" means
    // while a consult is running.
    onNewPatient: () => {
      if (patient && visitId) setActiveConsultGuardOpen(true);
      else setPatientModalOpen(true);
    },
    onReviewRx: () => openReview(),
    onToggleShortcuts: () => setShortcutsOpen((v) => !v),
    onSeverity: handleSeverityKey,
    // `pendingMedicine` was missing from this list, so every chord the global
    // handler owns stayed live underneath the add sheet — Tab moved focus out
    // of a modal the doctor was mid-way through filling in.
    //
    // `explain` is deliberately NOT here. It was, briefly, and the effect was
    // exactly what "an overlay owns the keyboard" is supposed to prevent from
    // happening to a lightweight popover: Alt+E opened the contribution
    // sheet, and every other key on the page — Tab, the arrows, next patient,
    // review — went dead until the doctor found Escape, with nothing on
    // screen saying that was the way out. `ContributionSheet` is read-only
    // and never takes DOM focus (see its header comment), so the ranked list
    // underneath it keeps its own cursor and keeps responding to every key
    // exactly as if the popover were not there — pressing ↓ to keep moving
    // is what makes it get out of the way, which is the "any new key
    // overrides it" behaviour asked for, without a special case here for one
    // overlay.
    isAnyModalOpen:
      patientModalOpen || isReviewOpen || activeConsultGuardOpen ||
      shortcutsOpen || !!pendingMedicine || !!stagedMedicine || !!selectedMedicineId ||
      !!browse || !!brandSheet || openChart !== null || sidebarOpen ||
      !!activeVisit || carePlanSheetOpen,
  });

  // The consult workspace's shell (`.cs-shell`, consult.css) locks its own
  // height and gives `.cs-work` the only scrollbar, so the plan rail beside
  // it never has to move — see the 2026-08-15 comment block on `.cs-shell`.
  // `body.cs-locked-shell` is the guarantee behind "never," not the height
  // math: it stops the OUTER page from scrolling at all, so a small mismatch
  // in that math can't wobble the rail by even a couple of pixels. Scoped to
  // exactly when the workspace itself is showing (`activePage === null`) —
  // every feature page (Patients, Settings, ...) keeps its ordinary scroll,
  // and the class is removed on unmount so it can never leak onto them.
  useEffect(() => {
    document.body.classList.toggle("cs-locked-shell", activePage === null);
    return () => { document.body.classList.remove("cs-locked-shell"); };
  }, [activePage]);

  // ★ The consult lifecycle — starting one, repeating a past one, saving it
  // and ending it. The only hook here that spans all the others: a consult
  // begins by resetting the chart AND the plan AND the ledger, and ends by
  // writing all of them. Declared last because the learning write records the
  // ranking as the doctor saw it, so it needs the engine's result at render
  // time. Navigation stays here in the shell and is passed in.
  const {
    handleStartConsultFromRecord, handlePatientConfirm, handleRepeatRx,
    handleConfirmAndSave, openReview, resetConsultState,
  } = useConsultLifecycle({
    identity,
    observables,
    chart,
    ledger,
    session,
    plan,
    intelligence,
    carryForwardFor,
    onVisitSaved: carePlan.attachCurrentVisit,
    showToast,
    focusChartSearch,
    setActivePage,
    setSidebarOpen,
  });

  const handleOpenSidebar = () => {
    if (hasActiveConsult) {
      showToast("Consult in progress — your work is safe");
    }
    setSidebarOpen(true);
  };

  const handleSidebarNavigate = (page: SidebarPage) => {
    if (hasActiveConsult) {
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
    if (!hasActiveConsult) {
      setPatientModalOpen(true);
    }
  };

  // ── The specialty profile ───────────────────────────────────────────────
  // Which intent type this facility elevates into the Primary Recommendation
  // slot. Read once from the facility, never inferred from what the doctor is
  // doing — see specialtyProfile.ts for why that distinction is load-bearing.
  const specialty = useMemo(
    () => profileFor(hospitalProfile?.specialty_profile),
    [hospitalProfile?.specialty_profile]
  );

  // ── The longitudinal trend ──────────────────────────────────────────────
  // Pure arithmetic over data two other hooks already loaded, so it is a memo
  // rather than a hook of its own: no state, no fetch, nothing to own. It
  // re-runs when a measurement is typed, which is deliberate — the number on
  // screen is the newest point in its own series the moment it exists, and a
  // physio watching pain go 7 → 5 → 4 should see the 4 land.
  //
  // `specialty.trend` is the ENTIRE specialty input. See LongitudinalBand.tsx
  // on why there is no per-profile branch anywhere below this line.
  const trendSummary = useMemo(
    () => buildTrendSummary({
      trend: specialty.trend,
      visits: pastVisits,
      todayVitals: vitals as unknown as Record<string, unknown>,
    }),
    [specialty.trend, pastVisits, vitals]
  );


  /**
   * ── Which consultation surface this facility gets ────────────────────────
   *
   * General OPD is being rewritten as its own screen, one piece at a time.
   * Every other profile keeps the shared SOAP column untouched until its own
   * turn comes, so a dentist's workspace cannot regress while this one is
   * rebuilt. `specialtyProfile.ts` says there is no per-specialty branch in
   * the render tree; that is now false, deliberately, and the doctrine
   * records why: configuration can change what goes INSIDE a module, but it
   * can never remove a module some other profile requires, and removing
   * modules is the whole task.
   */
  /**
   * Which input surface this facility renders. Was `specialty.id ===
   * "general_opd"`; became configuration on 2026-08-16 when physiotherapy
   * moved onto the same surface — see `SpecialtyProfile.inputLayout` for why
   * that is a shared file rather than a second copy of it.
   */
  const usesCaseSheet = specialty.inputLayout === "case-sheet";

  /**
   * The specialty charts, as launchers inside the Measurements row.
   *
   * Same `specialty.charts` gate as before — a dermatologist still never sees
   * a tooth chart — but the gate now decides whether an ICON appears beside
   * Temperature, not whether a full-width panel occupies the page on every
   * consultation. Catalogue order, so the row does not reshuffle between
   * facilities.
   */
  const chartTools = useMemo(
    () =>
      ([
        { key: "dental", label: "Dental Chart", icon: <Smile size={20} /> },
        { key: "body", label: "Body Map", icon: <PersonStanding size={20} /> },
        { key: "growth", label: "Growth", icon: <TrendingUp size={20} /> },
      ] as const)
        .filter((t) => specialty.charts.includes(t.key))
        .map((t) => ({ ...t })),
    [specialty.charts]
  );

  /**
   * What the chart says is worth examining for, as labels.
   *
   * `useConsultIntelligence` has computed this on every chart change since
   * the engine was built and nothing consumed it — the rules table held 10
   * rows against signal_intent_rules' 1,577, so wiring it would have lit up
   * for eight signals and looked broken everywhere else. That table now holds
   * 537 rules across 215 signals, so the cascade is finally live: symptoms
   * suggest what to examine for → the doctor confirms → the engine re-runs →
   * Possible Conditions firms up.
   *
   * Capped at six. This is a prompt, not a checklist, and a doctor handed
   * twenty things to look for will read none of them.
   */
  const examSuggestionLabels = useMemo(() => {
    const byId = new Map(observables.map((o) => [o.id, o.label]));
    return intelligence.examSuggestions
      .slice(0, 6)
      .map((s) => byId.get(s.observableId))
      .filter((l): l is string => !!l);
  }, [intelligence.examSuggestions, observables]);

  /**
   * The same suggestions as whole observables, for the Case Sheet.
   *
   * `CaseSheet` routes an entry by its `kind`, so it needs the object rather
   * than the label. Handing it a bare string would mean looking the kind back
   * up by display text, which is the fragile step one input surface exists to
   * remove.
   */
  const relatedFindings = useMemo(() => {
    const byId = new Map(observables.map((o) => [o.id, o]));
    return intelligence.examSuggestions
      .slice(0, 6)
      .map((s) => byId.get(s.observableId))
      .filter((o): o is Observable => !!o);
  }, [intelligence.examSuggestions, observables]);

  /**
   * ── The two Plan placeholders ────────────────────────────────────────────
   *
   * This is where `specialtyProfile.ts`'s elevation mechanism finally reaches
   * the screen. Until 2026-08-12 `primary`, `primaryLabel` and `sections`
   * were read by exactly one place — the Settings page, which PRINTED them as
   * a description — while the consult screen rendered a hardcoded
   * medicines-then-everything-else pair. A physiotherapy clinic was told
   * "Exercise Plans primary" in Settings and shown Medicines in the workspace.
   *
   * Slot 1 is the facility's `primary` type. Slot 2 is the remainder, derived
   * from `sections` rather than typed out, so a type can never be listed twice
   * or dropped entirely when a profile is edited.
   */
  const planSlots = useMemo(() => {
    const rest = specialty.sections
      .map((s) => s.type)
      .filter((t) => t !== specialty.primary && t !== "finding");
    return {
      primaryIsMedicine: specialty.primary === "medicine",
      restTypes: rest,
    };
  }, [specialty.primary, specialty.sections]);

  /**
   * The one-line extract under each launcher, so the doctor can see what is
   * charted without opening the chart. Re-read when a chart modal closes,
   * which is the only moment its contents can have changed.
   */
  const chartSummaries = useChartSummaries(
    visitId,
    chartTools.map((t) => t.key),
    openChart
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
          onOpenVisit={(visit, x) => setActiveVisit({ visit, x })}
          sessionLabels={carePlan.sessionLabels}
          logoRef={logoRef}
        />
      )}

      {/* The shared past-visit detail, opened by the header's chips AND by the
          band's timeline. One view, two ways in. */}
      {activeVisit && (
        <PastVisitCard
          visit={activeVisit.visit}
          x={activeVisit.x}
          onClose={() => setActiveVisit(null)}
          onRepeatRx={(v) => { setActiveVisit(null); handleRepeatRx(v); }}
        />
      )}

      {carePlanSheetOpen && (
        <CarePlanSheet
          plan={carePlan.plan}
          sessionNumber={carePlan.currentSession}
          busy={carePlan.busy}
          onDismiss={() => setCarePlanSheetOpen(false)}
          onSave={async (draft) => {
            const args = {
              goal: draft.goal,
              diagnosis: draft.diagnosis || null,
              targetVisitCount: draft.targetVisitCount ? Number(draft.targetVisitCount) : null,
              targetDate: draft.targetDate || null,
              notes: draft.notes || null,
            };
            if (carePlan.plan) await carePlan.edit(args);
            else await carePlan.start(args);
            setCarePlanSheetOpen(false);
          }}
          onClosePlan={async () => {
            await carePlan.close();
            setCarePlanSheetOpen(false);
            showToast("Care plan closed");
          }}
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
          {/* ── The longitudinal band ────────────────────────────────────
              Above everything, inside the locked shell, so a returning
              patient's direction of travel is read before anything is typed
              and it never scrolls away with the work.

              It renders NOTHING for a patient with no history — not an empty
              frame, not a placeholder — so a first consult is exactly the
              screen it was before this existed. One component for every
              profile; `specialty.trend` is the only thing that differs.
              See LongitudinalBand.tsx. */}
          <LongitudinalBand
            summary={trendSummary}
            pastVisits={pastVisits}
            carePlan={carePlan.plan}
            sessionNumbers={carePlan.sessionNumbers}
            onOpenVisit={(visit, x) => setActiveVisit({ visit, x })}
            onEditCarePlan={() => setCarePlanSheetOpen(true)}
            onStartCarePlan={() => setCarePlanSheetOpen(true)}
          />
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
            {/* ── The consultation, in SOAP order ──────────────────────────
                Subjective (what they tell you) -> Objective (what you observe
                and measure) -> Assessment (what you conclude). Everything
                output-side lives in the strip to the right, so this column is
                purely the consultation being TAKEN.

                SOAP controls vertical order, not card size: a phase does not
                earn a full-width card just by existing, and every module here
                sizes to its content. */}
            <div className="cs-work">
              {/* The input half of the screen — the one part that genuinely
                  differs by profile. GeneralOpdInputs / SoapInputs.tsx: see
                  their headers for why the split stops exactly here and does
                  not reach into Possible Conditions or the plan row below,
                  which stay shared and unchanged. */}
              {usesCaseSheet ? (
                <GeneralOpdInputs
                  observables={observables}
                  onChartSet={onChartSet}
                  onObservableToggle={handleObservableToggle}
                  caseSheetEntries={caseSheetEntries}
                  onCaseSheetRemove={handleCaseSheetRemove}
                  intensities={selectedSymptomsWithIntensity}
                  onIntensityChange={handleIntensityChange}
                  relatedFindings={relatedFindings}
                  onBrowseFinding={() => setBrowse("finding")}
                  vitals={vitals}
                  onVitalsChange={setVitals}
                  defaultMeasureKeys={specialty.measurements}
                  relevantMeasureKeys={measureRelevance.keys}
                  relevantMeasureBecause={measureRelevance.because}
                  pastVisits={pastVisits}
                  visitId={visitId}
                  disabled={!patient}
                  searchRef={chartSearchRef}
                  measurementsRef={measurementsRef}
                />
              ) : (
                <SoapInputs
                  observables={observables}
                  onChartSet={onChartSet}
                  contextChips={contextChips}
                  onContextToggle={handleContextToggle}
                  symptomChips={symptomChips}
                  onSymptomToggle={handleSymptomToggle}
                  intensities={selectedSymptomsWithIntensity}
                  onIntensityChange={handleIntensityChange}
                  selectedFindings={selectedFindings}
                  onFindingToggle={handleFindingToggle}
                  examSuggestionLabels={examSuggestionLabels}
                  onBrowse={setBrowse}
                  vitals={vitals}
                  onVitalsChange={setVitals}
                  defaultMeasureKeys={specialty.measurements}
                  relevantMeasureKeys={measureRelevance.keys}
                  relevantMeasureBecause={measureRelevance.because}
                  pastVisits={pastVisits}
                  chartTools={chartTools}
                  onOpenChart={(key) => setOpenChart(key as ChartKind)}
                  chartSummaries={chartSummaries}
                  visitId={visitId}
                  disabled={!patient}
                  searchRef={chartSearchRef}
                  measurementsRef={measurementsRef}
                />
              )}

              {/* Assessment — the engine's reading of everything above it.
                  It re-ranks in the same frame a chip lands, so the doctor
                  watches their own reasoning move as they type.

                  The band label is hidden for General OPD because the card
                  directly beneath it is also titled ASSESSMENT. The same word
                  twice, 40px apart, is not a hierarchy. */}
              {!usesCaseSheet && <div className="cs-phase">Assessment</div>}

              {/* ALWAYS RENDERED. Hiding these on an empty chart was a real
                  regression, made 2026-08-12 and reverted the same evening:
                  each of these panels carries the SEARCH BOX that reaches a
                  medicine, a test or a condition the engine never ranked.
                  Hiding the panel hid the only way in, which breaks the one
                  rule that outranks tidiness: ranking decides what is
                  OFFERED, never what is REACHABLE.
                  The empty states are made compact instead. */}
              <ConditionsCard
                intents={intelligence.byType.finding}
                topScore={topOfType.get("finding") ?? 0}
                thinkingKey={intelligence.thinkingKey}
                acceptedIntentIds={acceptedIntentIdSet}
                acknowledged={acknowledgedIntents}
                onAcknowledge={handleAcknowledge}
                onAccept={handleAcceptIntent}
                onExplain={handleExplain}
                ruleset={synapse.data?.ruleset ?? null}
                activeSignals={intelligence.result?.activeSignals ?? []}
                hasChart={intelligence.hasInput}
                diagnoses={diagnoses}
                onRemoveDiagnosis={removeDiagnosis}
                disabled={!patient}
                searchRef={assessmentSearchRef}
                /* ── The Assessment's second column ────────────────────────
                   A facility with its own instrument puts it here, beside the
                   assessment it informs, instead of the confirmed-conditions
                   list that the Consultation Plan rail already carries. See
                   ConditionsCard's `sideSlot`.

                   `SpecialtyExamCard` is reused verbatim — it was already the
                   launcher-plus-extract shape this needs, already opening the
                   real chart through `ChartSurface`, and already fed by
                   `useChartSummaries`. Nothing new was built for this; it
                   moved. A profile with no charts passes nothing and keeps the
                   column it always had. */
                sideSlot={
                  /* Gated on the Case Sheet layout, NOT merely on having a
                     chart: `SoapInputs` renders its own `SpecialtyExamCard` in
                     the Objective row, so a profile still on that surface
                     (dentistry, dermatology, paediatrics today) would show the
                     same launcher twice. Each profile picks this up when its
                     turn comes and it moves off `soap`. */
                  usesCaseSheet && chartTools.length > 0 ? (
                    <SpecialtyExamCard
                      tools={chartTools}
                      onOpen={(key) => setOpenChart(key as ChartKind)}
                      summaries={chartSummaries}
                      disabled={!patient}
                    />
                  ) : undefined
                }
              />

              {/* ── PLAN ────────────────────────────────────────────────────
                  Two placeholders, side by side. The MODULE is always the same
                  shape; what goes in it is the facility's specialty profile.
                  Slot 1 holds this facility's primary output — medicines for a
                  general OPD, exercise plans for physiotherapy, investigations
                  for a diagnostics practice. Slot 2 holds everything else.

                  Both are bounded to one shared height and scroll internally,
                  so a slot holding eleven medicines cannot stretch the slot
                  beside it holding two tests and leave dead space between
                  them. See `.cs-row-plan` in consult.css. */}
              {/* The band label goes for General OPD, not the panels. "Plan"
                  was always the wrong word here anyway: the plan is the rail
                  on the right, and these two are where the doctor picks FROM. */}
              {!usesCaseSheet && <div className="cs-phase">Plan</div>}

              <div className="cs-row cs-row-plan" ref={planRowRef}>
                {planSlots.primaryIsMedicine ? (
                  <RecommendationsCard
                    intents={intelligence.byType.medicine}
                    topScore={topOfType.get("medicine") ?? 0}
                    thinkingKey={intelligence.thinkingKey}
                    brands={intelligence.brands}
                    brandsLoading={intelligence.brandsLoading}
                    brandError={intelligence.brandError}
                    combinations={intelligence.combinations}
                    combinationsLoading={intelligence.combinationsLoading}
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
                ) : specialty.primary === "exercise" ? (
                  /* An exercise HAS a dose, and the dose is the clinical
                     content — see ExercisePlanCard's header. This is the one
                     elevated type besides medicines that earns its own card
                     rather than a plain ranked list. */
                  <ExercisePlanCard
                    title={specialty.primaryLabel}
                    intents={intelligence.byType.exercise}
                    topScore={topOfType.get("exercise") ?? 0}
                    thinkingKey={intelligence.thinkingKey}
                    plan={exercisePlan}
                    previousPlan={previousExercises.lines}
                    previousAt={previousExercises.at}
                    ruleset={synapse.data?.ruleset ?? null}
                    activeSignals={intelligence.result?.activeSignals ?? []}
                    hasChart={intelligence.hasInput}
                    disabled={!patient}
                    onAccept={handleAcceptIntent}
                    onUpdate={updateExercise}
                    onRemove={removeExercise}
                    onDuplicateForSide={duplicateExerciseForSide}
                    searchRef={synapseSearchRef}
                  />
                ) : (
                  /* This facility does not lead with medicines. The primary
                     type gets a plain ranked list — no brand picker, no dose
                     editor, because those are properties of a MEDICINE and
                     not of an elevated slot. */
                  <SuggestionsCard
                    types={[specialty.primary]}
                    title={specialty.primaryLabel}
                    byType={intelligence.byType}
                    topOfType={topOfType}
                    thinkingKey={intelligence.thinkingKey}
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
                )}

                <SuggestionsCard
                  types={planSlots.restTypes}
                  byType={intelligence.byType}
                  topOfType={topOfType}
                  thinkingKey={intelligence.thinkingKey}
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

            {/* ── THE SUMMARY RAIL ────────────────────────────────────────
                What has been CHOSEN, not what is on offer. A narrow rail —
                short lines, no ranked bars, no search — sticky so the doctor
                can see the prescription taking shape from anywhere on the
                page. The choosing happens in the Plan row above. */}
            <aside className="cs-summary">
              <PlanCard
                justAdded={justAdded}
                diagnoses={diagnoses}
                onRemoveDiagnosis={removeDiagnosis}
                prescription={prescription}
                onSelectMedicine={setSelectedMedicineId}
                onUpdateMedicine={updateMedicine}
                onRemoveMedicine={removeMedicine}
                tests={selectedTests}
                onRemoveTest={removeTest}
                adviceLines={adviceLines}
                therapyLines={therapyLines}
                exerciseLines={exercisePlan.map((l) => ({ id: l.id, text: formatLine(l) }))}
                onRemoveExercise={removeExercise}
                onRemoveAdviceLine={removeAdviceLine}
                onRemoveTherapyLine={removeTherapyLine}
                followUpDays={followUpDays}
                onFollowUpChange={setFollowUpDays}
                notes={visitNotes}
                onNotesChange={setVisitNotes}
                companionsFor={companionsFor}
                onAddCompanion={handleAddCompanion}
                onDismissCompanion={dismissCompanion}
                onAddMedicine={() => synapseSearchRef.current?.focus()}
                // Was `setSuggestionsExpanded(true)`, which became a no-op the
                // moment cap-and-expand was removed. There is nothing to
                // expand now, so the useful action is to put the panel that
                // holds tests in front of the doctor.
                onAddTest={() =>
                  planRowRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })
                }
                onReviewRx={openReview}
                onPrint={openReview}
                panelRef={planRef}
              />
            </aside>
          </main>

          <StatusBar
            active={synapse.status === "ready"}
            modelVersion={synapse.data?.ruleset.version ?? null}
            specialty={specialty.label}
            degraded={!!synapse.data?.degraded}
            unidentified={!identity.isReal}
            online={online}
            onOpenShortcuts={() => setShortcutsOpen(true)}
          />

          {/* ── The specialty charts ────────────────────────────────────────
              Mounted here as siblings of the page rather than inside it, and
              only while open. Each renders nothing at all until its launcher
              in the Measurements row is clicked, then takes over a modal with
              the room the interaction actually needs — charting "36 MO" on a
              25px tooth was a mis-tap waiting to happen.

              The `identity.isReal` gate on doctorId is the same corruption
              guard as every other attribution write in this file: a fallback
              identity must never write a real doctor's id onto a finding it
              did not enter. */}
          {specialty.charts.includes("dental") && (
            <DentalChartCard
              presentation="modal"
              open={openChart === "dental"}
              onClose={() => setOpenChart(null)}
              visitId={visitId}
              doctorId={identity.isReal ? identity.doctorId : null}
              disabled={!patient}
            />
          )}

          {specialty.charts.includes("body") && (
            <BodyMapCard
              presentation="modal"
              open={openChart === "body"}
              onClose={() => setOpenChart(null)}
              visitId={visitId}
              doctorId={identity.isReal ? identity.doctorId : null}
              disabled={!patient}
            />
          )}

          {/* Reads weight and height straight off `vitals` rather than holding
              its own copy — two renderings of one number is how a consultation
              ends up with two different numbers. Note this gate hides the
              CHART only: the WAZ z-score is derived in consultInput.ts on
              every consult, so a general physician still gets
              GROWTH_FALTERING ranked for a malnourished child. */}
          {specialty.charts.includes("growth") && (
            <GrowthChartCard
              presentation="modal"
              open={openChart === "growth"}
              onClose={() => setOpenChart(null)}
              ageMonths={ageMonths}
              sex={patientSex}
              weightKg={vitals.weight}
              heightCm={vitals.height ?? ""}
              disabled={!patient}
            />
          )}

          {/* Brand + dose confirmation, between "ranked" and "prescribed". */}
          <MedicineAddSheet
            open={!!pendingMedicine}
            compositionLabel={pendingMedicine?.payload.label ?? ""}
            brands={pendingMedicine?.brands ?? []}
            initialBrand={pendingMedicine?.initialBrand ?? null}
            onCancel={() => setPendingMedicine(null)}
            onConfirm={confirmPendingMedicine}
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
            therapyNotes={therapyNotes}
            exerciseLines={exercisePlan.map(formatLine)}
            visitId={visitId ?? undefined}
          />
        )
      }
    </div >
  );
}

export default App;
