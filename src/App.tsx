import {
  CheckCircle2, PersonStanding, RefreshCw, Smile, TrendingUp,
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
import { useSettingFocusRunner } from "./features/settings/settingsFocus";
import { PracticePage } from "./features/practice/PracticePage";
import { CommunicationPage } from "./features/communication/CommunicationPage";
import { ClinicPage } from "./features/clinic/ClinicPage";
import { PrescriptionEditorPage } from "./features/clinic/PrescriptionEditorPage";
import { SupportPage } from "./features/support/SupportPage";
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
import { useVisitStory } from "./hooks/useVisitStory";
import { useConsultDraftPersistence } from "./hooks/useConsultDraftPersistence";
import { useExamination } from "./hooks/useExamination";
import { REGION_BY_KEY } from "./features/consult/examination";
import { listBodySites } from "./lib/db/bodySites";
import {
  DURATION_LABEL, ONSET_LABEL, IRRITABILITY_LABEL, SETTLING_LABEL,
  AGGRAVATING_FACTORS, EASING_FACTORS, STORY_PATTERNS,
} from "./features/consult/story";
import { type PickerKind } from "./features/consult/PickerCard";
import { BrowseSheet } from "./features/consult/BrowseSheet";
import { MedicineAddSheet } from "./features/consult/MedicineAddSheet";
import { AddMedicineSheet } from "./features/consult/AddMedicineSheet";
import { useChartSummaries } from "./features/consult/useChartSummaries";
import { useIntakePrefill } from "./features/consult/useIntakePrefill";
import { useConsultQueue } from "./features/consult/queue/useConsultQueue";
import { QueueSheet } from "./features/consult/queue/QueueSheet";
import { TransitionModal } from "./features/consult/queue/TransitionModal";
import { useWorkspaceMode } from "./hooks/useWorkspaceMode";
import { logOperationalEvent } from "./lib/db/intake";
import { GatewaySessionsProvider } from "./features/frontdesk/components/gateway/GatewaySessionsProvider";
import { GatewayQrModal } from "./features/frontdesk/components/gateway/GatewayQrModal";
import { VisitAttachmentsModal } from "./features/frontdesk/components/VisitAttachmentsModal";
import { padToken } from "./features/frontdesk/utils";
import type { TodayVisit } from "./lib/db";
import type { Patient } from "./types";
import { GeneralOpdInputs } from "./features/consult/GeneralOpdInputs";
import { PhysioInputs } from "./features/consult/PhysioInputs";
import { SoapInputs } from "./features/consult/SoapInputs";
import { DentalChartCard } from "./features/consult/DentalChartCard";
import { BodyMapCard } from "./features/consult/BodyMapCard";
import { JointMapCard } from "./features/consult/JointMapCard";
import { GrowthChartCard } from "./features/consult/GrowthChartCard";
import { RecommendationsCard } from "./features/consult/RecommendationsCard";
import { SuggestionsCard } from "./features/consult/SuggestionsCard";
import { ConditionsCard } from "./features/consult/ConditionsCard";
import { SpecialtyExamCard } from "./features/consult/SpecialtyExamCard";
import { ContributionSheet, type ExplainTarget } from "./features/consult/ContributionSheet";
import { relevantFields, JOINT_RANGE_FIELDS } from "./features/consult/measures";
import { buildTrendSummary, type TrendSeries } from "./features/consult/trend";
import { formatLine, type ExerciseLine } from "./features/consult/exercisePlan";
import { ExercisePlanCard } from "./features/consult/ExercisePlanCard";
import { LongitudinalBand } from "./features/consult/LongitudinalBand";
import { CarePlanSheet } from "./features/consult/CarePlanSheet";
import { PastVisitCard, visitHasContent } from "./components/PastVisitCard";
// Same modal Patient Record's own Progress Trend cards open — see
// LongitudinalBand.tsx's `TrendCard` comment for why a graph click here
// now goes through this instead of straight to `PastVisitCard`.
import { TrendDetailModal } from "./features/patients/TrendDetailModal";
import { visitStatusKind } from "./features/patients/visitStatus";
import { PlanCard } from "./features/consult/PlanCard";
import { SaveAsTemplateModal } from "./features/practice/SaveAsTemplateModal";
import { StatusBar } from "./features/consult/StatusBar";
import { topScoreByType } from "./features/consult/parts";
import { usePinnedMedicines } from "./features/consult/usePinnedMedicines";
import { BrandSheet } from "./features/synapse/BrandSheet";
import { profileFor, type ChartKind } from "./features/synapse/specialtyProfile";
import { useOnline } from "./features/frontdesk/operational/useOnline";
import type { PersonalizedIntent } from "./lib/synapse/personalize";
import {
  type Observable, saveDoctorFreeTerm, requestNewComposition,
  type DoctorFreeTermType,
  type PreferredLab, loadPreferredLabs, loadDefaultPreferredLab,
  fetchDoctorMeasurePrefs,
  type PrescriptionTemplateSummary, loadPrescriptionTemplateSummaries,
  fetchPrescriptionTemplateDetail, type PrescriptionTemplateItemDetail,
  type PrescriptionTemplateItemInput,
} from "./lib/db/synapse";
import { guardIntent } from "./lib/synapse/engine";
import type { AcceptPayload } from "./features/consult/types";
import {
  DOCTOR_NAME, DOCTOR_SPECIALIZATION,
  fetchDoctorCached, fetchHospitalCached,
  type DBDoctor, type DBHospital, type RealVisit,
} from "./lib/db";
import { fetchLastExercisePlan } from "./lib/db/exercises";

// Title + subtitle for a coming-soon feature page — now the FALLBACK for a
// future sidebar destination that hasn't earned its own page yet, not a
// live route. Communication, Clinic and Support all got dedicated pages
// 2026-08-24 (own illustration, own copy — CommunicationPage.tsx/
// ClinicPage.tsx/SupportPage.tsx); "settings" and "practice" were already
// real pages before that (features/settings/SettingsPage.tsx,
// features/practice/PracticePage.tsx). Nothing in `SidebarPage` hits this
// today — kept rather than deleted so the NEXT destination this sidebar
// grows has somewhere to land on day one instead of a blank screen.
const COMING_SOON_META: Record<string, { title: string; subtitle: string }> = {};

function App() {
  // ★ Which workspace this clinic is served. Cortex when the doctor does
  // their own intake; Consult when a front desk prepares the encounter. Read
  // from `hospitals.clinic_mode`, never chosen — see lib/workspace/mode.ts.
  const workspace = useWorkspaceMode();
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

  // The doctor's own diagnostic-centre directory — see PlanCard's "Order
  // from" prompt. Loaded once per identity, same shape as every other
  // doctor-scoped list on this page.
  const [preferredLabs, setPreferredLabs] = useState<PreferredLab[]>([]);
  useEffect(() => {
    if (!identity.ready) return;
    let cancelled = false;
    loadPreferredLabs(identity.doctorId)
      .then((labs) => { if (!cancelled) setPreferredLabs(labs); })
      .catch((e) => console.error("loadPreferredLabs:", e));
    return () => { cancelled = true; };
  }, [identity.ready, identity.doctorId]);

  // The doctor's override of which measurements Consult opens with — see
  // Practice's Consultation Defaults card. Null (the common case) means
  // "use the specialty baseline", exactly what `specialty.measurements`
  // already was before this existed.
  const [measurePrefs, setMeasurePrefs] = useState<string[] | null>(null);
  useEffect(() => {
    if (!identity.ready) return;
    let cancelled = false;
    fetchDoctorMeasurePrefs(identity.doctorId)
      .then((keys) => { if (!cancelled) setMeasurePrefs(keys); })
      .catch((e) => console.error("fetchDoctorMeasurePrefs:", e));
    return () => { cancelled = true; };
  }, [identity.ready, identity.doctorId]);

  // The doctor's reusable prescription templates — see Practice's builder
  // and the case-sheet search's template matches (§10). Loaded once per
  // identity, same as preferredLabs; Practice's CRUD writes back through
  // `onTemplatesChange` so a template built mid-session is immediately
  // reachable from the case sheet without a reload.
  const [templates, setTemplates] = useState<PrescriptionTemplateSummary[]>([]);
  useEffect(() => {
    if (!identity.ready) return;
    let cancelled = false;
    loadPrescriptionTemplateSummaries(identity.doctorId)
      .then((rows) => { if (!cancelled) setTemplates(rows); })
      .catch((e) => console.error("loadPrescriptionTemplateSummaries:", e));
    return () => { cancelled = true; };
  }, [identity.ready, identity.doctorId]);

  const [toast, setToast] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activePage, setActivePage] = useState<SidebarPage | null>(null);

  // Runs a pending "take me to that setting" request after the page it lives
  // on has mounted — scrolls to the control and flashes it. Mounted once,
  // here, so no individual page has to know the mechanism exists. See
  // features/settings/settingsFocus.ts.
  useSettingFocusRunner(activePage);
  /**
   * The Prescription Editor is a full PAGE, but a page UNDER Clinic — it has
   * no sidebar entry, because a doctor reaches it by asking "what does my
   * prescription look like", never by navigating to it cold. So it is a view
   * flag on Clinic rather than a sixth `SidebarPage`: leaving Clinic by any
   * route (the sidebar, a Consult) puts it away, which `handleSidebarNavigate`
   * below does in one line.
   */
  const [prescriptionEditorOpen, setPrescriptionEditorOpen] = useState(false);
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
   * `AddMedicineSheet` — §5, 2026-08-24. `null` closed; a string (possibly
   * empty) is the query the doctor had already typed when they reached for
   * it. Lifted here rather than kept local to `RecommendationsCard`, same
   * as every other overlay on this list, so it can join `isAnyModalOpen`
   * below — an overlay missing from that list is the exact bug
   * `useOverlayFocus.ts`'s header documents (§14.22e): a bare Tab reaching
   * straight through it to a workspace stop behind it.
   */
  const [addMedicineQuery, setAddMedicineQuery] = useState<string | null>(null);
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

  /**
   * The Longitudinal Record's own drill-in, mirroring Patient Record's
   * `trendDetail`/visit-popover pair exactly (`PatientRecord.tsx`,
   * `TrendDetailModal.tsx`) — a graph click opens the series' detail
   * (`trendDetail`), and a point/row inside THAT opens `trendVisit`, its own
   * light-toned `PastVisitCard` layered on top so closing it steps back to
   * the graph rather than dropping out to the workspace.
   *
   * Kept separate from `activeVisit` on purpose: `activeVisit` is the DARK
   * `PastVisitCard` reached from the dark header's past-visit chips and the
   * band's own Last Visit/timeline rows — Anmol asked explicitly that this
   * entry point NOT change ("don't change the actual dark model... that
   * should be preserved", 2026-08-31). Only the trend-graph path moved to
   * the light modal chain Patient Record already uses; sharing one state
   * variable between the two would mean picking one tone for both.
   */
  const [trendDetail, setTrendDetail] = useState<TrendSeries | null>(null);
  const [trendVisit, setTrendVisit] = useState<RealVisit | null>(null);
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
  //
  // `toastTimerRef` clears any still-pending auto-dismiss before arming a
  // new one. Without it, two `showToast` calls close together (as
  // `applyTemplate` below now does — an immediate "Applying…" toast, then
  // a summary once the fetch resolves) raced: the FIRST call's timeout
  // still fired 2.4s after ITS OWN dispatch and blanked the toast early,
  // regardless of a second message having replaced it since. Invisible
  // before because nothing called `showToast` twice in quick succession.
  const toastTimerRef = useRef<number | null>(null);
  /** "resume" is its own bottom-CENTER pill, not the generic bottom-right
   *  `.toast` — Anmol: "make this toast more polished and intentional...
   *  position it at the bottom center of the viewport. Do not use the
   *  existing bottom-left/bottom-right positioning for this particular
   *  action... feel like a clear confirmation rather than a generic system
   *  notification." Every other `showToast` call omits `variant` and keeps
   *  today's behavior unchanged. */
  const [toastVariant, setToastVariant] = useState<"default" | "resume">("default");
  const showToast = useCallback((msg: string, opts?: { variant?: "resume" }) => {
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    setToastVariant(opts?.variant ?? "default");
    setToast(msg);
    toastTimerRef.current = window.setTimeout(() => {
      setToast("");
      toastTimerRef.current = null;
    }, 2400);
  }, []);

  // Where a consult actually begins. Passed to the lifecycle hook rather than
  // the ref itself, so that hook stays ignorant of the DOM.
  const focusChartSearch = useCallback(() => {
    // Consult opens onto a chart the front desk already populated — jamming
    // focus into the search field pops the catalogue dropdown open over it
    // before the doctor has had a chance to glance at what's there. Cortex
    // starts from nothing, so the search box is exactly where the cursor
    // should land.
    if (workspace.isConsult) return;
    window.setTimeout(() => chartSearchRef.current?.focus(), 0);
  }, [workspace.isConsult]);

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
  const { confirmCondition, unconfirmCondition, carryForwardFor, retireCondition } = useLongitudinalRecord({
    data: synapse.data,
    chart,
    session,
    identity,
  });

  // ★ The queue, as this doctor sees it. Reads the SAME poll the front desk
  // page uses (`useQueue`), filtered and previewed for Consult; disabled
  // entirely in Cortex, where there is no desk and nothing to poll.
  const queue = useConsultQueue({
    hospitalId: identity.ready ? identity.hospitalId : null,
    doctorId: identity.doctorId,
    multiDoctor: workspace.multiDoctor,
    enabled: workspace.isConsult && identity.ready,
  });

  const [queueSheetOpen, setQueueSheetOpen] = useState(false);
  /**
   * The handover, after Complete & Next. `null` when there is none;
   * otherwise it carries the name of the consultation that just finished, so
   * the modal can say what was saved before it says who is next.
   */
  const [transition, setTransition] = useState<{ justCompleted: string | null } | null>(null);
  /** which waiting/serving visit's attachments the doctor is managing, from
   *  the queue sheet or the handover — same modal the front desk uses. */
  const [attachmentsVisit, setAttachmentsVisit] = useState<TodayVisit | null>(null);

  /**
   * ── Why the patient modal needs a second flag in Consult ────────────────
   *
   * `session.patientModalOpen` starts TRUE and `session.reset()` sets it back
   * to true, because in Cortex "no patient" means "ask who the patient is" —
   * that modal is how a solo doctor begins, and on a cold start it is the
   * whole screen.
   *
   * In Consult it is the wrong question twice over: on boot the answer is the
   * queue, and after a save it would open behind the handover modal. But
   * registering someone directly must stay reachable (receptionist away,
   * walk-in), so the flag cannot simply be forced off either.
   *
   * So Consult renders that modal only when the doctor ASKED for it. Cortex
   * ignores this entirely and behaves exactly as it always has.
   */
  const [registerRequested, setRegisterRequested] = useState(false);

  // ★ Consult's opening state — the front desk's intake, read back onto the
  // chart at the moment a consult starts. A no-op in Cortex (nobody else
  // touched the visit); in Consult it is the whole handoff, and on a RESUMED
  // visit in either mode it is the chart read-back `resumeConsult` used to
  // list as a known gap. Layer 1: it only needs the chart.
  const prefillFromIntake = useIntakePrefill(chart);

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

  /**
   * The doctor saying a carried-forward condition should stop coming back.
   *
   * Surfaced rather than swallowed, unlike the confirm write beside it: this
   * one was asked for explicitly, and a silent failure would tell the doctor
   * they had taken something back while it stayed active and returned at the
   * next visit — which is the §14.21 bug this closes.
   */
  const handleRetireCarried = useCallback(
    (label: string, status: "resolved" | "refuted") => {
      retireCondition(label, status)
        .then(() => showToast(
          status === "resolved"
            ? `${label} marked resolved — it will not carry forward`
            : `${label} removed from the record — it will not carry forward`
        ))
        .catch((e) => showToast(`Could not update ${label}: ${e?.message ?? e}`));
    },
    [retireCondition, showToast]
  );

  const carePlan = useCarePlan({
    patientId: patient?.id ?? null,
    doctorId: identity.doctorId,
    hospitalId: identity.hospitalId,
    onError: showToast,
  });

  // The Story + Goals half — layer 1 beside the session, same reasoning as
  // the longitudinal record and the care plan above it: needs the patient
  // and the visit at render time, nothing downstream of it. Only rendered
  // for a profile with inputLayout === "physio" (see PhysioInputs below),
  // but the hook itself is unconditional, matching every other layer-1
  // hook in this file — a hook cannot be called behind a branch.
  const visitStory = useVisitStory(visitId, patient?.id ?? null);

  useEffect(() => {
    if (!identity.ready) return;
    setBootError(null);
    Promise.all([
      // Cached (profileCache.ts) — these two rows are read by the sidebar,
      // Clinic, Settings and every prescription render; without the cache,
      // each navigation re-hit the DB for rows that had not changed.
      fetchDoctorCached(identity.doctorId),
      fetchHospitalCached(identity.hospitalId),
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
    observableDurations: chart.observableDurations,
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
    unconfirmCondition,
  });
  const {
    prescription, selectedTests, selectedLabName, setSelectedLabName,
    diagnoses, visitNotes, setVisitNotes,
    followUpDays, setFollowUpDays,
    acceptedIntents, acceptedIntentIdSet, chosenBrands, deliberateBrands,
    searchedAccepts, acknowledgedIntents,
    adviceLines, therapyLines, therapyNotes, exercisePlan, reviewAdvice, justAdded, unreadPrescribedWarnings,
    selectedMedicineId, setSelectedMedicineId, stagedMedicine, setStagedMedicine,
    pendingMedicine, setPendingMedicine, inspectorMedicine,
    confirmPendingMedicine, confirmStagedMedicine,
    handleAcceptIntent, handleAcknowledge, handleChangeBrand, handlePinClinicBrand,
    updateMedicine, removeMedicine, removeTest, removeDiagnosis,
    addFreeDiagnosis, addFreeTest, addFreeReferral, addFreeAdvice, removeAdviceLine,
    removeTherapyLine, removeAcceptedIntent, updateExercise, removeExercise, duplicateExerciseForSide,
    companionsFor, handleAddCompanion, dismissCompanion,
  } = plan;

  // ★ Reload/crash recovery — see useConsultDraftPersistence.ts and
  // lib/consultDraft.ts for the full reasoning. Called here, after session/
  // chart/plan/visitStory all exist, because it is the one thing in the
  // consult that genuinely needs all four at once.
  useConsultDraftPersistence({
    doctorId: identity.isReal ? identity.doctorId : null,
    session, chart, plan, visitStory,
  });

  /**
   * Applying a template — CaseSheet's own search hands it a template id
   * (see ClinicalCommandBar's `templates`/`onApplyTemplate` props), never
   * items directly.
   *
   * A template item is one of two kinds now (`add_template_observable_items`):
   * an OBSERVABLE (a symptom/finding/history item — the chart INPUT that
   * justifies the rest) or an INTENT (a treatment decision). They are
   * applied in two passes, in that order, for a reason that is not just
   * "observables first, treatments second":
   *
   *  1. Every observable item is charted via `handleObservableToggle` —
   *     the EXACT function the case-sheet search's own "obs" row calls —
   *     skipping anything already charted (toggling twice would remove it).
   *     Never guarded: charting a fact is not a treatment decision, and
   *     nothing else in this app guards an observable either.
   *  2. Every intent item still runs through `handleAcceptIntent`, the
   *     plan's one entry point (see useConsultPlan's header) — there is no
   *     separate bulk write. But the guard check against it needs the
   *     engine to have RE-RANKED against whatever pass 1 just charted —
   *     applying "Fever" (symptom) + aceclofenac (medicine) must guard the
   *     medicine against a chart that now includes the fever, not the one
   *     from before the click. React batches pass 1's state updates with
   *     `setPendingTemplateApply` below into one render, so the effect that
   *     reads `intelligence.result` for pass 2 sees the POST-chart engine
   *     output, not a stale one — no ref workaround needed, just the extra
   *     tick a real state update (not a synchronous local variable) forces.
   *
   * Two rules the "always guard-check" answer requires, on pass 2:
   *
   *  1. A hard-warned item is never silently added. It is guard-checked
   *     here, against the SAME ruleset and active signals a live search
   *     would use, and dropped from the queue (with a toast naming what
   *     was skipped) rather than pushed through unacknowledged — only a
   *     doctor reading the warning in the normal search/accept flow can
   *     acknowledge it.
   *  2. A medicine never bypasses its dose-confirmation sheet. Calling
   *     `handleAcceptIntent` on a medicine STAGES it (MedicineAddSheet)
   *     rather than committing — "every medicine confirms in the sheet" is
   *     a deliberate rule, not an oversight, and a template is not a
   *     special case of it. So medicines queue and confirm one at a time;
   *     the queue effect below advances to the next item only once
   *     `pendingMedicine` clears (confirmed or dismissed). Non-medicine
   *     items commit immediately, same as any other accept.
   *
   * None of that changes the fact that a doctor clicking a template saw
   * NOTHING for the ~1-2s `fetchPrescriptionTemplateDetail` round trip plus
   * guard checks, then had a non-medicine item (a test, an advice line, a
   * referral) land straight in the sidebar Plan with no confirmation
   * anywhere in the main content — the ONLY visible sign a template had
   * done anything was a medicine's dose sheet, if the template happened to
   * contain one, or a newly-charted symptom chip if it happened to carry
   * one. Fixed with two toasts around the logic above: one the instant the
   * template is picked (bridging the silent fetch), one once the outcome
   * is known, naming what was charted, what landed on the plan, and how
   * many medicines are queued for their dose sheet.
   */
  const [templateQueue, setTemplateQueue] = useState<AcceptPayload[]>([]);
  const observableById = useMemo(() => new Map(observables.map((o) => [o.id, o])), [observables]);
  const [pendingTemplateApply, setPendingTemplateApply] = useState<{
    templateName: string;
    chartedLabels: string[];
    intentItems: Extract<PrescriptionTemplateItemDetail, { kind: "intent" }>[];
  } | null>(null);

  const applyTemplate = useCallback((templateId: number) => {
    const applying = templates.find((t) => t.id === templateId);
    showToast(applying ? `Applying "${applying.name}" template…` : "Applying template…");

    fetchPrescriptionTemplateDetail(templateId)
      .then((detail) => {
        if (!detail) return;

        // Pass 1 — chart every observable this template carries, skipping
        // anything already on the chart (this visit's own pick, or an
        // earlier item in this same template). `handleObservableToggle`
        // TOGGLES, so calling it on an already-charted item would remove it.
        const chartedLabels: string[] = [];
        const seenObservableIds = new Set(chartObservableIds);
        for (const item of detail.items) {
          if (item.kind !== "observable") continue;
          if (seenObservableIds.has(item.observableId)) continue;
          const obs = observableById.get(item.observableId);
          if (!obs) continue;
          handleObservableToggle(obs);
          seenObservableIds.add(item.observableId);
          chartedLabels.push(item.label);
        }

        const intentItems = detail.items.filter(
          (item): item is Extract<PrescriptionTemplateItemDetail, { kind: "intent" }> => item.kind === "intent"
        );
        // Pass 2 waits for the render the charting above triggers — see this
        // block's own doc comment for why that render, not this callback,
        // is what the guard check below needs to run against.
        setPendingTemplateApply({ templateName: detail.name, chartedLabels, intentItems });
      })
      .catch((e) => {
        console.error("applyTemplate:", e);
        showToast("Could not load that template — try again");
      });
  }, [templates, chartObservableIds, observableById, handleObservableToggle, showToast]);

  useEffect(() => {
    if (!pendingTemplateApply) return;
    const { templateName, chartedLabels, intentItems } = pendingTemplateApply;
    setPendingTemplateApply(null);

    const ruleset = synapse.data?.ruleset ?? null;
    const activeSignals = intelligence.result?.activeSignals ?? [];
    const skipped: string[] = [];
    const payloads: AcceptPayload[] = [];
    for (const item of intentItems) {
      if (acceptedIntentIdSet.has(item.intentId)) continue; // already on the plan
      const verdict = ruleset
        ? guardIntent(ruleset, activeSignals, { id: item.intentId, type: item.type })
        : { status: "ok" as const, reasons: [] };
      if (verdict.status === "warn_hard") { skipped.push(item.label); continue; }
      payloads.push({
        intentId: item.intentId, type: item.type, label: item.label,
        refTable: item.refTable, refId: item.refId, medicine: null,
        viaSearch: true, overridden: false,
      });
    }

    // Medicines still confirm one at a time in their own dose sheet — that
    // IS their visible confirmation, so they're only counted here, never
    // named individually (the sheet names them). Everything else commits
    // the moment `handleAcceptIntent` runs below with no sheet of its own,
    // so THIS toast is the only place its name ever surfaces.
    const addedNow = payloads.filter((p) => p.type !== "medicine").map((p) => p.label);
    const medicineCount = payloads.length - addedNow.length;

    const parts: string[] = [];
    if (chartedLabels.length) parts.push(`charted ${chartedLabels.join(", ")}`);
    if (addedNow.length) parts.push(`added ${addedNow.join(", ")} to the plan`);
    if (medicineCount) parts.push(`${medicineCount} medicine${medicineCount === 1 ? "" : "s"} awaiting dose confirmation`);
    if (skipped.length) parts.push(`skipped (needs a manual look): ${skipped.join(", ")}`);

    showToast(parts.length
      ? `"${templateName}" — ${parts.join("; ")}`
      : `"${templateName}" — everything was already on the plan`);

    if (payloads.length) setTemplateQueue((q) => [...q, ...payloads]);
  }, [pendingTemplateApply, synapse.data, intelligence.result, acceptedIntentIdSet, showToast]);

  // One item at a time: a medicine stages into `pendingMedicine` and this
  // waits for it to clear (confirmed or dismissed) before feeding the next
  // one in. Non-medicine items commit immediately inside `handleAcceptIntent`
  // itself, so they never linger in the queue long enough to matter here.
  useEffect(() => {
    if (templateQueue.length === 0 || pendingMedicine) return;
    const [next, ...rest] = templateQueue;
    setTemplateQueue(rest);
    handleAcceptIntent(next);
  }, [templateQueue, pendingMedicine, handleAcceptIntent]);

  // "Save as template" — the Plan rail's own path into Prescription
  // Templates, see PlanCard's own button and SaveAsTemplateModal.
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);

  // Seed the "order from" prompt with the doctor's default preferred lab the
  // moment the first investigation lands on the plan — never overwrite a
  // choice the doctor already made this consult, and never fire before the
  // default lab list has actually loaded.
  const labSeededRef = useRef(false);
  useEffect(() => {
    if (selectedTests.length === 0) { labSeededRef.current = false; return; }
    if (labSeededRef.current || selectedLabName || !identity.ready) return;
    labSeededRef.current = true;
    loadDefaultPreferredLab(identity.doctorId)
      .then((lab) => { if (lab) setSelectedLabName(lab.name); })
      .catch((e) => console.error("loadDefaultPreferredLab:", e));
  }, [selectedTests.length, selectedLabName, identity.ready, identity.doctorId, setSelectedLabName]);

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
      !!activeVisit || !!trendDetail || !!trendVisit || carePlanSheetOpen || addMedicineQuery != null,
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
    handleStartConsultFromRecord, resumeConsult, handlePatientConfirm, handleRepeatRx,
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
    prefillFromIntake,
    onVisitSaved: carePlan.attachCurrentVisit,
    onSaveStory: visitStory.save,
    // Complete & Next. Cortex passes nothing here and a save ends where it
    // always did; Consult opens the handover onto a workspace that is already
    // clear. The queue is re-read first so the modal cannot open showing the
    // patient who has just been seen still waiting.
    onConsultSaved: workspace.isConsult
      ? (name) => { queue.refetch(); setTransition({ justCompleted: name }); }
      : undefined,
    resetStory: () => { visitStory.reset(); examination.reset(); },
    showToast,
    focusChartSearch,
    setActivePage,
    setSidebarOpen,
  });

  /**
   * Story + Goals, pre-formatted for ReviewModal — doctor-facing review
   * only, never the printable Rx (plan §5). Kept as a small derived array
   * here rather than passing the raw `Story` object into ReviewModal,
   * matching how every other field on that component already arrives
   * (adviceNotes, therapyNotes, exerciseLines are all pre-formatted
   * strings) — ReviewModal stays a pure render surface, not a second place
   * that knows story.ts's label maps.
   */
  const storySummaryLines = useMemo(() => {
    const s = visitStory.story;
    const lines: string[] = [];
    if (s.duration) lines.push(`Duration: ${DURATION_LABEL[s.duration]}`);
    if (s.onsetMode) lines.push(`Onset: ${ONSET_LABEL[s.onsetMode]}`);
    if (s.mechanism.trim()) lines.push(s.mechanism.trim());
    if (s.aggravating.length > 0) {
      const labels = s.aggravating.map((k) => AGGRAVATING_FACTORS.find((f) => f.key === k)?.label ?? k);
      lines.push(`Worse with: ${labels.join(", ")}`);
    }
    if (s.easing.length > 0) {
      const labels = s.easing.map((k) => EASING_FACTORS.find((f) => f.key === k)?.label ?? k);
      lines.push(`Better with: ${labels.join(", ")}`);
    }
    if (s.pattern.length > 0) {
      const labels = s.pattern.map((k) => STORY_PATTERNS.find((p) => p.key === k)?.label ?? k);
      lines.push(`Pattern: ${labels.join(", ")}`);
    }
    if (s.tolerance.trim()) lines.push(`Tolerance: ${s.tolerance.trim()}`);
    if (s.irritability) lines.push(`Irritability: ${IRRITABILITY_LABEL[s.irritability]}`);
    if (s.settling) lines.push(`Settles: ${SETTLING_LABEL[s.settling]}`);
    if (s.note.trim()) lines.push(s.note.trim());
    return lines;
  }, [visitStory.story]);

  const goalSummaryLines = useMemo(() =>
    visitStory.goals.map((g) => {
      const before = visitStory.lastScores.get(g.id) ?? g.baselineScore;
      const today = visitStory.todayScores.get(g.id);
      const score = today !== undefined
        ? (before !== null && before !== undefined ? `${before} → ${today}` : `${today}`)
        : (before !== null && before !== undefined ? `${before}` : "not yet scored");
      return `${g.activity}: ${score}/10`;
    }),
    [visitStory.goals, visitStory.lastScores, visitStory.todayScores]
  );

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
    setPrescriptionEditorOpen(false);
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
      // In a clinic with a front desk the answer to "start a consultation" is
      // the queue, not a blank patient form — the patient is already
      // registered and already waiting. The form is still reachable from
      // inside the sheet, for when the desk is unavailable.
      if (workspace.isConsult) setQueueSheetOpen(true);
      else setPatientModalOpen(true);
    }
  };

  // ── Taking a patient from the queue ─────────────────────────────────────
  //
  // One entry point for both surfaces that offer it (the queue sheet and the
  // handover modal), because both mean exactly the same thing and an override
  // recorded from one but not the other would make the audit useless.
  //
  // `resolveVisitForConsult` (useConsultLifecycle) finds this patient's
  // waiting visit and marks it `serving`, so the desk's own board updates
  // without a second write from here — the queue row and the consult are the
  // SAME visit, which is the whole point of the handoff.
  // What to do once whatever consult is currently active has been dealt
  // with (discarded, saved as draft, or referred) — set only when the guard
  // below had to interrupt a queue action to ask first.
  const pendingQueueAction = useRef<(() => void) | null>(null);

  const consultFromQueue = useCallback((visit: TodayVisit, aheadOfQueue: boolean) => {
    // Picking someone else while a consult is already open is exactly the
    // "start a new consult over an active one" case Cortex already guards —
    // the queue must not be a side door around it. `hasActiveConsult` is
    // false the moment TransitionModal's own onContinue calls this (the
    // workspace was already cleared by the save that opened it), so this
    // never fires there.
    if (hasActiveConsult) {
      pendingQueueAction.current = () => consultFromQueue(visit, aheadOfQueue);
      setQueueSheetOpen(false);
      setActiveConsultGuardOpen(true);
      return;
    }
    setQueueSheetOpen(false);
    setTransition(null);

    if (aheadOfQueue) {
      // An override is a decision somebody may have to account for. Recorded
      // clinic-wide and durably (`operational_events`), never in the front
      // desk's per-browser event log — see `logOperationalEvent`. Fire-and-
      // forget by rule 4: the consultation must not fail because the audit
      // write did.
      logOperationalEvent({
        hospitalId: identity.hospitalId,
        actorUserId: identity.userId,
        kind: "queue_override",
        visitId: visit.visit_id,
        detail: {
          taken: { visit_id: visit.visit_id, token: visit.token_number, patient: visit.patient_name },
          // Who was in front of them, so the event answers the question
          // somebody will actually ask, rather than only naming who was taken.
          skipped: queue.waiting
            .slice(0, queue.waiting.findIndex((v) => v.visit_id === visit.visit_id))
            .map((v) => ({ visit_id: v.visit_id, token: v.token_number, patient: v.patient_name })),
        },
      });
    }

    void handleStartConsultFromRecord({
      id: visit.patient_id,
      name: visit.patient_name,
      age: visit.age ? String(visit.age) : "",
      gender: (visit.gender as Patient["gender"]) ?? "",
      phone: visit.phone ?? "",
      dateOfBirth: visit.date_of_birth ?? undefined,
    }).then(() => queue.refetch());
  }, [hasActiveConsult, identity.hospitalId, identity.userId, queue, handleStartConsultFromRecord]);

  /** The receptionist-unavailable path, from wherever it is offered. */
  const registerPatientDirectly = useCallback(() => {
    if (hasActiveConsult) {
      pendingQueueAction.current = registerPatientDirectly;
      setQueueSheetOpen(false);
      setActiveConsultGuardOpen(true);
      return;
    }
    setQueueSheetOpen(false);
    setTransition(null);
    setActivePage(null);
    setRegisterRequested(true);
    setPatientModalOpen(true);
  }, [hasActiveConsult, setActivePage, setPatientModalOpen]);

  /**
   * Consult's cold start: the queue, once, if anyone is actually in it.
   *
   * A doctor opening Consult is arriving at a clinic that has been taking
   * patients without them. Landing on an empty workspace with a number in the
   * header would make finding the first patient a step they have to think
   * about. Landing on a "create patient" form — which is what Cortex's own
   * default does — would be worse, because it answers a question the front
   * desk already answered.
   *
   * At most once per mount (`coldStart`), never over a consult already in
   * progress, and never when nobody is waiting — an empty queue sheet on boot
   * is a modal for nothing.
   */
  const coldStart = useRef(false);
  useEffect(() => {
    if (!workspace.isConsult || !workspace.ready) return;
    if (coldStart.current) return;
    if (queue.loading) return;              // wait for a real answer, not the empty first render
    coldStart.current = true;
    if (hasActiveConsult) return;           // a resumed draft owns the screen
    setPatientModalOpen(false);
    if (queue.waiting.length > 0) setQueueSheetOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace.isConsult, workspace.ready, queue.loading, queue.waiting.length, hasActiveConsult]);

  // ── The specialty profile ───────────────────────────────────────────────
  // Which intent type this facility elevates into the Primary Recommendation
  // slot. Read once from the facility, never inferred from what the doctor is
  // doing — see specialtyProfile.ts for why that distinction is load-bearing.
  const specialty = useMemo(
    () => profileFor(hospitalProfile?.specialty_profile),
    [hospitalProfile?.specialty_profile]
  );

  /** The doctor's override, narrowed to keys this specialty actually
   *  supports — it can only ever trim or reorder the baseline, never
   *  introduce a field the specialty profile doesn't already carry. Falls
   *  back to the full baseline when the override is empty or every key in
   *  it turned out to be specialty-irrelevant (e.g. after a specialty
   *  switch). */
  const effectiveMeasureKeys = useMemo(() => {
    if (!measurePrefs || measurePrefs.length === 0) return specialty.measurements;
    const allowed = new Set<string>(specialty.measurements);
    const filtered = measurePrefs.filter((k) => allowed.has(k));
    return filtered.length > 0 ? (filtered as typeof specialty.measurements) : specialty.measurements;
  }, [measurePrefs, specialty.measurements]);

  // ── What counts as a "past visit" a doctor actually wants to see ───────
  // `pastVisits` (from `useConsultSession`) is every visit `fetchPatientVisits`
  // considers "not inactive" — that deliberately includes visits still
  // `waiting`/`serving` elsewhere, per the fix documented on that loader,
  // so the raw array stays available below for surfaces that genuinely want
  // full history (the input cards' measurement carry-forward). But the
  // topbar's "Past visits" strip and the longitudinal band are both asking
  // "what has this patient actually been seen FOR" — a visit still open, or
  // one that closed with nothing charted, answers neither question and just
  // reads as noise (a chip with a date and nothing else, a "1 previous
  // visit" band with an empty last-visit card). Both now read this instead.
  const meaningfulPastVisits = useMemo(
    () => pastVisits.filter((v) => visitStatusKind(v.status) === "done" && visitHasContent(v)),
    [pastVisits]
  );

  // ── The longitudinal trend ──────────────────────────────────────────────
  // Pure arithmetic over data two other hooks already loaded, so it is a memo
  // rather than a hook of its own: no state, no fetch, nothing to own. It
  // re-runs when a measurement is typed, which is deliberate — the number on
  // screen is the newest point in its own series the moment it exists, and a
  // physio watching pain go 7 → 5 → 4 should see the 4 land.
  //
  // `specialty.trend` is the ENTIRE specialty input. See LongitudinalBand.tsx
  // on why there is no per-profile branch anywhere below this line. Trended
  // off `meaningfulPastVisits`, not the raw array — same reasoning as above,
  // and it has to be the same array the band's `pastVisits` prop gets, or
  // `visitForLastReading`'s lookup (LongitudinalBand.tsx) can point at a
  // trend point whose visit isn't in the list the band was handed.
  const trendSummary = useMemo(
    () => buildTrendSummary({
      trend: specialty.trend,
      visits: meaningfulPastVisits,
      todayVitals: vitals as unknown as Record<string, unknown>,
    }),
    [specialty.trend, meaningfulPastVisits, vitals]
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
   * moved onto the same surface, then split again on 2026-08-17 when
   * physiotherapy earned its own — see `SpecialtyProfile.inputLayout` for
   * the full history of that decision.
   */
  /** Stable identity, so MeasurementsCard's memos do not re-run every render. */
  const anatomicalMeasureKeys = useMemo(
    () => new Set(specialty.anatomical ?? []),
    [specialty.anatomical]
  );

  const usesCaseSheet = specialty.inputLayout === "case-sheet";
  const usesPhysioInputs = specialty.inputLayout === "physio";
  /**
   * "Not the old three-picker SOAP fallback" — which is a DIFFERENT question
   * from "is General OPD", and conflating the two was a real bug.
   *
   * Three guards below (the Assessment phase label, the Plan phase label,
   * and the chart in ConditionsCard's `sideSlot`) were written as
   * `usesCaseSheet` back when "case-sheet" and "not soap" were the same
   * thing. Adding `"physio"` as a third layout on 2026-08-17 silently made
   * them false for physiotherapy: it lost the joint map out of the
   * Assessment column and gained two phase labels the rebuilt surface is
   * specifically designed not to show. `tsc` cannot catch this — every
   * value is still a valid boolean.
   *
   * So the predicate says what it actually means. A fourth layout added
   * later inherits the right behaviour by default instead of repeating
   * this.
   */
  const usesRebuiltSurface = specialty.inputLayout !== "soap";

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
        { key: "joints", label: "Joint Map", icon: <PersonStanding size={20} /> },
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
  /**
   * Whether ConditionsCard's second column is showing a specialty's own exam
   * launcher (the odontogram, the body map…) — same gate as the `sideSlot`
   * prop below, named so both that prop and `planSlots` read the one answer
   * instead of two copies of "and not physio, and chartTools is non-empty"
   * drifting apart.
   */
  const hasSpecialtyExamSideSlot =
    usesRebuiltSurface && !usesPhysioInputs && chartTools.length > 0;
  /**
   * Whether that same column instead runs an Investigations quick-list —
   * §10, 2026-08-24. Everything WITHOUT an exam launcher used to fall
   * through to a static confirmed-conditions column Anmol called "essentially
   * a useless thing" (it only ever repeated what the Plan rail three inches
   * away already shows). Investigations is the one output type this facility
   * has not already been given a home for at this point on the screen.
   *
   * Excluded when Investigations is ALREADY this facility's elevated primary
   * slot (a Diagnostics practice) — showing the same ranked list twice, once
   * full-size below and once compact here, is the duplicate this exists to
   * avoid, not a second one to create.
   */
  const showInvestigationSideSlot =
    !hasSpecialtyExamSideSlot && specialty.primary !== "test";

  const planSlots = useMemo(() => {
    const rest = specialty.sections
      .map((s) => s.type)
      .filter((t) => t !== specialty.primary && t !== "finding")
      // Dropped from the Clinical Suggestions listing only, never from the
      // Investigations side-slot itself — search and accept work identically
      // in both, this just decides which panel owns the one copy so a test
      // is never ranked twice on the same screen.
      .filter((t) => !showInvestigationSideSlot || t !== "test");
    return {
      primaryIsMedicine: specialty.primary === "medicine",
      restTypes: rest,
    };
  }, [specialty.primary, specialty.sections, showInvestigationSideSlot]);

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
   * Which joints the joint map has marked — the input that decides what the
   * Examination card offers (Phase 3). Same `openChart` refresh key as
   * `chartSummaries` above, for the same reason: the real flow is mark the
   * joints, close the map, examine them, so closing the chart is exactly
   * when this needs to be current.
   *
   * `visit_body_sites.region` and `EXAM_REGIONS[].key` share a vocabulary on
   * purpose (`knee`, `shoulder`, `neck`, `torso_lower`…) so this is a filter
   * rather than a second mapping table to keep in step.
   */
  const [markedExam, setMarkedExam] = useState<{ regions: string[]; sides: Map<string, "left" | "right" | null> }>(
    { regions: [], sides: new Map() }
  );
  useEffect(() => {
    if (!visitId || !specialty.charts.includes("joints")) {
      setMarkedExam({ regions: [], sides: new Map() });
      return;
    }
    let cancelled = false;
    listBodySites(visitId)
      .then((sites) => {
        if (cancelled) return;
        const regions: string[] = [];
        const sides = new Map<string, "left" | "right" | null>();
        for (const s of sites) {
          if (!REGION_BY_KEY.has(s.region)) continue;
          if (!regions.includes(s.region)) regions.push(s.region);
          // First marking wins for the side — re-marking the other side is
          // a second site, and the card's own switcher is how you reach it.
          if (!sides.has(s.region)) sides.set(s.region, s.side);
        }
        setMarkedExam({ regions, sides });
      })
      .catch(() => { if (!cancelled) setMarkedExam({ regions: [], sides: new Map() }); });
    return () => { cancelled = true; };
  }, [visitId, openChart, specialty.charts]);

  /** Phase 3 examination state — layer 1, beside the story. */
  const examination = useExamination(visitId);

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
   * The free-text fallback, both halves at once — §4, 2026-08-24, widened
   * same day to Test/Referral/Advice alongside Assessment. The chart-local
   * half (`addFreeDiagnosis`/`addFreeTest`/`addFreeReferral`/`addFreeAdvice`,
   * `useConsultPlan.ts`) always runs; the Supabase write only under a REAL
   * identity, same rule `confirmCondition`'s standing-fact write follows —
   * an account with no `doctors` row would file this under the fallback
   * doctor, and it is meant to follow ONE doctor. Non-fatal: a save that
   * fails costs the doctor a future suggestion, never today's consult.
   * Reloads Synapse on success so the new term can surface THIS session
   * too, not only the next one — same pattern `handlePinClinicBrand`
   * already uses for its own write.
   */
  const handleAddFreeTerm = useCallback((label: string, type: DoctorFreeTermType) => {
    switch (type) {
      case "finding": addFreeDiagnosis(label); break;
      case "test": addFreeTest(label); break;
      case "referral": addFreeReferral(label); break;
      case "advice": addFreeAdvice(label); break;
    }
    if (identity.isReal) {
      saveDoctorFreeTerm({
        doctorId: identity.doctorId,
        hospitalId: identity.hospitalId,
        label,
        type,
        signalIds: (intelligence.result?.activeSignals ?? []).map((s) => s.signalId),
        acceptedIntentIds: [...acceptedIntentIdSet],
      })
        .then(() => synapse.reload())
        .catch((e) => console.warn("doctor_free_terms save (non-fatal):", e));
    }
  }, [
    addFreeDiagnosis, addFreeTest, addFreeReferral, addFreeAdvice,
    identity, intelligence.result, acceptedIntentIdSet, synapse,
  ]);

  /**
   * Which measurements the chart has just made worth taking.
   *
   * Derived from the engine's own active signals rather than from the chip
   * labels, so "Fever", "Fever with rash" and the Hindi alias all surface
   * Temperature through the one signal they share. Static mapping, no
   * inference — see `measures.ts`.
   *
   * The second argument (2026-08-17b) is what closes the loop the joint map
   * opens: marking the right knee toggles "Knee pain", which raises
   * KNEE_PAIN, which now also surfaces knee flexion and extension lag in
   * degrees — but ONLY for a facility carrying the joint map, since a
   * general physician who ticks "Knee pain" wants nothing to do with a
   * goniometer. `JOINT_RANGE_FIELDS`'s own comment has the full argument
   * for why this is a per-profile map rather than more global rows.
   */
  const measureRelevance = useMemo(
    () =>
      relevantFields(
        intelligence.signals,
        specialty.charts.includes("joints") ? JOINT_RANGE_FIELDS : undefined
      ),
    [intelligence.signals, specialty.charts]
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
        avatarUrl={doctorProfile?.avatar_url}
        onOpenProfile={() => handleSidebarNavigate("settings")}
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
          pastVisits={meaningfulPastVisits}
          pastVisitsLoading={pastVisitsLoading}
          onOpenVisit={(visit, x) => setActiveVisit({ visit, x })}
          sessionLabels={carePlan.sessionLabels}
          // Consult only — in Cortex these are undefined and the header keeps
          // its "+ Patient" button exactly as it was.
          onOpenQueue={workspace.isConsult ? () => setQueueSheetOpen(true) : undefined}
          queueCount={queue.waiting.length}
          nextToken={queue.waiting[0] ? padToken(queue.waiting[0].token_number) : null}
          logoRef={logoRef}
        />
      )}

      {/* The shared past-visit detail, opened by the header's chips AND by the
          band's Last Visit card / timeline rows. One view, two ways in — its
          dark tone (the default) is Consult's own, deliberately unchanged. */}
      {activeVisit && (
        <PastVisitCard
          visit={activeVisit.visit}
          x={activeVisit.x}
          onClose={() => setActiveVisit(null)}
          onRepeatRx={(v) => { setActiveVisit(null); handleRepeatRx(v); }}
        />
      )}

      {/* A Longitudinal Record graph, expanded — the THIRD way into a past
          visit, and the one that changed 2026-09-02: it used to hand off
          straight to the dark card above; now it goes through the same
          light `TrendDetailModal` chain Patient Record uses (see
          `LongitudinalBand.tsx`'s `TrendCard` comment). `trendVisit` is its
          own light `PastVisitCard`, layered on TOP of the modal rather than
          replacing it, so closing the visit steps back to the graph. */}
      {trendDetail && (
        <TrendDetailModal
          series={trendDetail}
          visits={meaningfulPastVisits}
          onClose={() => setTrendDetail(null)}
          onOpenVisit={setTrendVisit}
        />
      )}
      {trendVisit && (
        <PastVisitCard
          visit={trendVisit}
          x={window.innerWidth / 2}
          tone="light"
          onClose={() => setTrendVisit(null)}
          onRepeatRx={(v) => { setTrendVisit(null); setTrendDetail(null); handleRepeatRx(v); }}
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
          onResumeConsult={resumeConsult}
          logoRef={logoRef}
          onOpenSidebar={handleOpenSidebar}
          specialty={specialty}
          onNavigate={handleSidebarNavigate}
        />
      ) : activePage === "settings" ? (
        <SettingsPage
          logoRef={logoRef}
          onOpenSidebar={handleOpenSidebar}
          hospitalId={identity.hospitalId}
          doctorId={identity.doctorId}
          hospitalProfile={hospitalProfile}
          doctorProfile={doctorProfile}
          doctorName={DOCTOR.name}
          onNavigate={handleSidebarNavigate}
          onSpecialtyChanged={(id) =>
            setHospitalProfile((prev) => (prev ? { ...prev, specialty_profile: id } : prev))
          }
        />
      ) : activePage === "practice" ? (
        <PracticePage
          logoRef={logoRef}
          onOpenSidebar={handleOpenSidebar}
          observables={observables}
          specialty={specialty}
          onNavigate={handleSidebarNavigate}
          preferredLabs={preferredLabs}
          onPreferredLabsChange={setPreferredLabs}
          measurePrefs={measurePrefs}
          onMeasurePrefsChange={setMeasurePrefs}
          templates={templates}
          onTemplatesChange={setTemplates}
        />
      ) : activePage === "communication" ? (
        <CommunicationPage logoRef={logoRef} onOpenSidebar={handleOpenSidebar} />
      ) : activePage === "clinic" ? (
        prescriptionEditorOpen ? (
          <PrescriptionEditorPage
            logoRef={logoRef}
            onOpenSidebar={handleOpenSidebar}
            hospitalId={identity.hospitalId}
            hospital={hospitalProfile}
            doctor={doctorProfile}
            onBack={() => setPrescriptionEditorOpen(false)}
          />
        ) : (
          <ClinicPage
            logoRef={logoRef}
            onOpenSidebar={handleOpenSidebar}
            hospital={hospitalProfile}
            doctor={doctorProfile}
            /* Clinic EDITS the same two rows every other surface reads —
               the prescription renderer among them — so a save updates the
               one cached copy here rather than minting a second. */
            onHospitalChange={(patch) =>
              setHospitalProfile((prev) => (prev ? { ...prev, ...patch } : prev))
            }
            onDoctorChange={(patch) =>
              setDoctorProfile((prev) => (prev ? { ...prev, ...patch } : prev))
            }
            onNavigate={handleSidebarNavigate}
            onOpenPrescriptionEditor={() => setPrescriptionEditorOpen(true)}
          />
        )
      ) : activePage === "support" ? (
        <SupportPage logoRef={logoRef} onOpenSidebar={handleOpenSidebar} />
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
          {/* ── The longitudinal band ──────────────────────────────────────
              Full width, above the two-column split, 2026-08-20.

              It has now been in all three possible places, and each move was
              a real answer to a real complaint:

                above `.cs-page`   original. Permanently ate ~200px out of a
                                   locked-height shell, on every consult, read
                                   or not.
                inside `.cs-work`  2026-08-17. Fixed that, and broke the shape:
                                   as the first child of the LEFT column it was
                                   two rows of cards in a 1fr gap, with the plan
                                   rail sitting alongside doing nothing.
                here               full width, one row, and — the part that
                                   makes it affordable — `.cs-shell` is a flex
                                   column, so when the band collapses to its
                                   header line the space is genuinely returned
                                   to `.cs-page` beneath it rather than left as
                                   a hole. The rail comes back up with it.

              Brief §10 and §14: longitudinal context without a dashboard. It
              still renders NOTHING for a patient with no history — not an
              empty frame — so a first consult is the screen it always was. */}
          <LongitudinalBand
            summary={trendSummary}
            pastVisits={meaningfulPastVisits}
            loading={pastVisitsLoading}
            carePlan={carePlan.plan}
            sessionNumbers={carePlan.sessionNumbers}
            onOpenVisit={(visit, x) => setActiveVisit({ visit, x })}
            onOpenTrend={setTrendDetail}
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
                  differs by profile. GeneralOpdInputs / PhysioInputs /
                  SoapInputs.tsx: see their headers for why the split stops
                  exactly here and does not reach into Possible Conditions or
                  the plan row below, which stay shared and unchanged. */}
              {usesPhysioInputs ? (
                <PhysioInputs
                  observables={observables}
                  onChartSet={onChartSet}
                  onObservableToggle={handleObservableToggle}
                  caseSheetEntries={caseSheetEntries}
                  onCaseSheetRemove={handleCaseSheetRemove}
                  onRetireCarried={handleRetireCarried}
                  intensities={selectedSymptomsWithIntensity}
                  onIntensityChange={handleIntensityChange}
                  relatedFindings={relatedFindings}
                  onBrowseFinding={() => setBrowse("finding")}
                  vitals={vitals}
                  onVitalsChange={setVitals}
                  defaultMeasureKeys={effectiveMeasureKeys}
                  relevantMeasureKeys={measureRelevance.keys}
                  relevantMeasureBecause={measureRelevance.because}
                  anatomicalMeasureKeys={anatomicalMeasureKeys}
                  pastVisits={pastVisits}
                  visitId={visitId}
                  hospitalId={identity.isReal ? identity.hospitalId : null}
                  patientId={patient?.id ?? null}
                  disabled={!patient}
                  searchRef={chartSearchRef}
                  measurementsRef={measurementsRef}
                  story={visitStory.story}
                  onStoryChange={visitStory.setStory}
                  goals={visitStory.goals}
                  lastGoalScores={visitStory.lastScores}
                  todayGoalScores={visitStory.todayScores}
                  onGoalScoreChange={visitStory.setTodayScore}
                  onAddGoal={visitStory.addGoal}
                  onRetireGoal={visitStory.retireGoal}
                  examination={examination}
                  markedRegions={markedExam.regions}
                  markedSides={markedExam.sides}
                  onOpenBodyMap={() => setOpenChart("joints")}
                />
              ) : usesCaseSheet ? (
                <GeneralOpdInputs
                  observables={observables}
                  onChartSet={onChartSet}
                  onObservableToggle={handleObservableToggle}
                  caseSheetEntries={caseSheetEntries}
                  onCaseSheetRemove={handleCaseSheetRemove}
                  /* "How long?" — asked here and NOT in PhysioInputs above,
                     because physiotherapy's Story composer already owns that
                     question (`story.ts`'s Duration dimension) and two boxes
                     asking it is the double-entry this screen exists to
                     remove. See GeneralOpdInputs' own prop doc. */
                  symptomDurations={chart.symptomDurations}
                  onSetSymptomDuration={chart.setSymptomDuration}
                  onRetireCarried={handleRetireCarried}
                  intensities={selectedSymptomsWithIntensity}
                  onIntensityChange={handleIntensityChange}
                  relatedFindings={relatedFindings}
                  onBrowseFinding={() => setBrowse("finding")}
                  vitals={vitals}
                  onVitalsChange={setVitals}
                  defaultMeasureKeys={effectiveMeasureKeys}
                  relevantMeasureKeys={measureRelevance.keys}
                  relevantMeasureBecause={measureRelevance.because}
                  pastVisits={pastVisits}
                  visitId={visitId}
                  hospitalId={identity.isReal ? identity.hospitalId : null}
                  patientId={patient?.id ?? null}
                  disabled={!patient}
                  searchRef={chartSearchRef}
                  measurementsRef={measurementsRef}
                  templates={templates}
                  onApplyTemplate={applyTemplate}
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
                  defaultMeasureKeys={effectiveMeasureKeys}
                  relevantMeasureKeys={measureRelevance.keys}
                  relevantMeasureBecause={measureRelevance.because}
                  pastVisits={pastVisits}
                  chartTools={chartTools}
                  onOpenChart={(key) => setOpenChart(key as ChartKind)}
                  chartSummaries={chartSummaries}
                  visitId={visitId}
                  hospitalId={identity.isReal ? identity.hospitalId : null}
                  patientId={patient?.id ?? null}
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
              {!usesRebuiltSurface && <div className="cs-phase">Assessment</div>}

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
                onRemove={removeAcceptedIntent}
                /* §4, 2026-08-24 — the Assessment free-text fallback. */
                onAddFreeText={(label) => handleAddFreeTerm(label, "finding")}
                freeTerms={synapse.data?.freeTerms ?? []}
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
                  /* Physiotherapy opens the body map from `ExamSummaryStrip`
                     in the input half — one entry point, beside the readings it
                     summarises. Without this exclusion the same modal has two
                     launchers on one screen, which is what Anmol hit: a strip
                     above the Assessment and a card beside it, both opening the
                     identical surface. */
                  hasSpecialtyExamSideSlot ? (
                    <SpecialtyExamCard
                      tools={chartTools}
                      onOpen={(key) => setOpenChart(key as ChartKind)}
                      summaries={chartSummaries}
                      disabled={!patient}
                    />
                  ) : showInvestigationSideSlot ? (
                    /* §10, 2026-08-24 — see `showInvestigationSideSlot`'s doc
                       comment. The SAME component Clinical Suggestions uses
                       below, scoped to one type: "same rule all sections
                       have" was the ask, and forking a second investigations
                       list here would be exactly the thing rule 7 exists to
                       prevent. `expanded`/`onToggleExpanded` are shared with
                       the panel below — both are vestigial props neither
                       reads today (every row renders unconditionally, see
                       SuggestionsCard's own header comment), so sharing them
                       costs nothing. */
                    <SuggestionsCard
                      className="cs-cond-side-sug"
                      types={["test"]}
                      title="Investigations"
                      // §3, 2026-08-24: this instance sits beside a SHORT
                      // neighbour (Assessment's ranked column), not the
                      // tall self-scrolling strip the other two placements
                      // live in — capped + "Show more" instead of an
                      // unbounded list, the same mechanism that column
                      // already uses.
                      capped={4}
                      byType={intelligence.byType}
                      topOfType={topOfType}
                      thinkingKey={intelligence.thinkingKey}
                      acceptedIntentIds={acceptedIntentIdSet}
                      acknowledged={acknowledgedIntents}
                      onAcknowledge={handleAcknowledge}
                      onAccept={handleAcceptIntent}
                      onRemove={removeAcceptedIntent}
                      freeTerms={synapse.data?.freeTerms ?? []}
                      onAddFreeText={handleAddFreeTerm}
                      selectedTests={selectedTests}
                      adviceLines={adviceLines}
                      onExplain={handleExplain}
                      ruleset={synapse.data?.ruleset ?? null}
                      activeSignals={intelligence.result?.activeSignals ?? []}
                      expanded={suggestionsExpanded}
                      onToggleExpanded={() => setSuggestionsExpanded((v) => !v)}
                      hasChart={intelligence.hasInput}
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
              {!usesRebuiltSurface && <div className="cs-phase">Plan</div>}

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
                    onRemove={removeAcceptedIntent}
                    isPinned={pins.isPinned}
                    onTogglePin={pins.toggle}
                    onOpenBrandSheet={handleOpenBrandSheet}
                    onExplain={handleExplain}
                    ruleset={synapse.data?.ruleset ?? null}
                    activeSignals={intelligence.result?.activeSignals ?? []}
                    hasChart={intelligence.hasInput}
                    searchRef={synapseSearchRef}
                    onOpenAddMedicine={setAddMedicineQuery}
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
                    // Message-3 follow-up, 2026-08-25: "apply this [cap +
                    // show more + THEN nested scroll] to literally every
                    // section which starts growing over 4-5 cards" —
                    // switching Clinical Suggestions' own tabs used to
                    // change how many rows this rendered with nothing
                    // bounding `.cs-list`'s height, so the card itself grew
                    // or shrank and shoved the whole page under it. Capped
                    // like every other instance now; only "Show all"
                    // actually grows it, and only into its own scroll box.
                    capped={5}
                    byType={intelligence.byType}
                    topOfType={topOfType}
                    thinkingKey={intelligence.thinkingKey}
                    acceptedIntentIds={acceptedIntentIdSet}
                    acknowledged={acknowledgedIntents}
                    onAcknowledge={handleAcknowledge}
                    onAccept={handleAcceptIntent}
                    onRemove={removeAcceptedIntent}
                    isPinned={pins.isPinned}
                    onTogglePin={pins.toggle}
                    freeTerms={synapse.data?.freeTerms ?? []}
                    onAddFreeText={handleAddFreeTerm}
                    selectedTests={selectedTests}
                    adviceLines={adviceLines}
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
                  // Same fix, same reason — see the sibling instance above.
                  capped={5}
                  byType={intelligence.byType}
                  topOfType={topOfType}
                  thinkingKey={intelligence.thinkingKey}
                  acceptedIntentIds={acceptedIntentIdSet}
                  acknowledged={acknowledgedIntents}
                  onAcknowledge={handleAcknowledge}
                  onAccept={handleAcceptIntent}
                  onRemove={removeAcceptedIntent}
                  isPinned={pins.isPinned}
                  onTogglePin={pins.toggle}
                  freeTerms={synapse.data?.freeTerms ?? []}
                  onAddFreeText={handleAddFreeTerm}
                  selectedTests={selectedTests}
                  adviceLines={adviceLines}
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
                preferredLabs={preferredLabs}
                selectedLabName={selectedLabName}
                onSelectLabName={setSelectedLabName}
                onManageLabs={() => handleSidebarNavigate("practice")}
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
                onSaveAsTemplate={() => setSaveTemplateOpen(true)}
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

          {/* Physiotherapy's own tool, not the derm body map relabelled — see
              `JointMapCard.tsx`. `observables` / `caseSheetEntries` /
              `handleObservableToggle` are the exact same three the Case Sheet
              itself is built on, so a chip lit from the joint map is lit
              there too. */}
          {specialty.charts.includes("joints") && (
            <JointMapCard
              presentation="modal"
              open={openChart === "joints"}
              onClose={() => setOpenChart(null)}
              visitId={visitId}
              doctorId={identity.isReal ? identity.doctorId : null}
              observables={observables}
              caseSheetEntries={caseSheetEntries}
              onObservableToggle={handleObservableToggle}
              examination={examination}
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

          {/* "Not found in ranking or search" — §5, 2026-08-24. Hands off
              into the sheet above unmodified: once `add_medicine` names the
              brand, it is just an accepted medicine like any other and
              `handleAcceptIntent` takes it from there (brand resolves via
              `brandHint`, the sheet above opens for dose/timing). */}
          <AddMedicineSheet
            open={addMedicineQuery != null}
            initialName={addMedicineQuery ?? ""}
            onCancel={() => setAddMedicineQuery(null)}
            onAccept={(payload) => { handleAcceptIntent(payload); setAddMedicineQuery(null); }}
            // The composition-request fallback is doctor-attributed — same
            // REAL-identity gate as `confirmCondition`'s standing-fact write.
            identity={identity.isReal ? { doctorId: identity.doctorId, hospitalId: identity.hospitalId } : null}
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

      {saveTemplateOpen && (
        <SaveAsTemplateModal
          doctorId={identity.doctorId}
          hospitalId={identity.hospitalId}
          items={[
            // The chart's own inputs first — plain chips only (`!origin`):
            // a 'confirmed'/'carried' one is THIS patient's standing history,
            // not something a reusable template should reintroduce for
            // every future patient it's applied to. See `applyTemplate`'s
            // own doc comment for the other half of this — charting these
            // back on apply is the whole reason they're captured here.
            ...caseSheetEntries
              .filter((e) => !e.origin)
              .map((e): PrescriptionTemplateItemInput | null => {
                const observableId = observableByLabel.get(e.label);
                return observableId == null ? null : { observableId, observableKind: e.kind };
              })
              .filter((it): it is PrescriptionTemplateItemInput => it != null),
            ...[...acceptedIntents.values()].map((p): PrescriptionTemplateItemInput => ({ intentId: p.intentId, type: p.type })),
          ]}
          onClose={() => setSaveTemplateOpen(false)}
          onSaved={setTemplates}
        />
      )}

      {toast && toastVariant === "resume" ? (
        <div className="fixed bottom-8 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-[10px] rounded-full border border-white/10 bg-[#161d29] px-5 py-3 text-[13.5px] font-semibold text-white shadow-[0_12px_32px_rgba(0,0,0,0.35)]">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[rgba(74,222,128,0.16)] text-[#4ade80]">
            <CheckCircle2 size={14} />
          </span>
          {toast}
        </div>
      ) : toast && <div className="toast">{toast}</div>}

      {
        !isFeaturePage && activeConsultGuardOpen && (
          <ActiveConsultGuard
            visitId={visitId!}  // ← ADD THIS LINE (the ! means "I promise it's not null")
            patientName={patient?.name ?? "this patient"}
            onDiscard={() => {
              resetConsultState();
              setActiveConsultGuardOpen(false);
              const run = pendingQueueAction.current;
              pendingQueueAction.current = null;
              run?.();
            }}
            onComplete={() => {
              // After saving as draft/referral, reset and continue whatever
              // asked to interrupt this consult — the queue action that
              // triggered the guard, or (nothing pending) Cortex's own
              // default of opening the new-patient modal.
              resetConsultState();
              setActiveConsultGuardOpen(false);
              const run = pendingQueueAction.current;
              pendingQueueAction.current = null;
              if (run) run();
              else setPatientModalOpen(true);
            }}
            onClose={() => { pendingQueueAction.current = null; setActiveConsultGuardOpen(false); }}
          />
        )
      }
      {/* ── The queue, on demand ──────────────────────────────────────────
          Opened from the dark header's Queue control, closed again. Not
          rendered at all in Cortex, where there is no front desk to have a
          queue. `isFeaturePage` is deliberately NOT a condition: a doctor
          reading Patients or Practice can still be asked to take the next
          patient, and `consultFromQueue` navigates back to the workspace
          itself. */}
      {workspace.isConsult && queueSheetOpen && (
        <QueueSheet
          waiting={queue.waiting}
          serving={queue.serving}
          previews={queue.previews}
          completedCount={queue.completedCount}
          loading={queue.loading}
          currentVisitId={visitId}
          onClose={() => setQueueSheetOpen(false)}
          onPick={consultFromQueue}
          onRegisterPatient={registerPatientDirectly}
          onManageAttachments={setAttachmentsVisit}
        />
      )}

      {/* ── The handover ──────────────────────────────────────────────────
          Opens on a successful save in Consult, over an already-cleared
          workspace. Owns its own 10-second continuation; everything it can
          decide it hands back through `consultFromQueue`, the same entry
          point the queue sheet uses. */}
      {workspace.isConsult && transition && (
        <TransitionModal
          waiting={queue.waiting}
          previews={queue.previews}
          completedCount={queue.completedCount}
          justCompleted={transition.justCompleted}
          onContinue={consultFromQueue}
          onRegisterPatient={registerPatientDirectly}
          onDismiss={() => setTransition(null)}
          onManageAttachments={setAttachmentsVisit}
        />
      )}

      {workspace.isConsult && attachmentsVisit && (
        <GatewaySessionsProvider>
          <VisitAttachmentsModal visit={attachmentsVisit} onClose={() => setAttachmentsVisit(null)} />
          <GatewayQrModal />
        </GatewaySessionsProvider>
      )}

      {
        // Consult adds one condition and changes nothing else: the modal shows
        // when the doctor asked for it, never as a default (see
        // `registerRequested`). Its close is also reachable unconditionally
        // there — in Cortex a patient-less workspace has nothing behind this
        // modal to go back to, which is why that branch still refuses to close;
        // in Consult there is a queue behind it.
        !isFeaturePage && patientModalOpen && (!workspace.isConsult || registerRequested) && (
          <PatientModal
            onClose={
              workspace.isConsult
                ? () => { setRegisterRequested(false); setPatientModalOpen(false); }
                : patient ? () => setPatientModalOpen(false) : () => { }
            }
            onConfirm={(p) => { setRegisterRequested(false); return handlePatientConfirm(p); }}
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
            saveLabel={workspace.isConsult ? "Complete & Next" : undefined}
            onEdit={() => setIsReviewOpen(false)}
            onSave={handleConfirmAndSave}
            onClose={() => setIsReviewOpen(false)}
            followUpDays={followUpDays}
            adviceNotes={reviewAdvice}
            therapyNotes={therapyNotes}
            exerciseLines={exercisePlan.map(formatLine)}
            storySummary={storySummaryLines}
            goalSummary={goalSummaryLines}
            visitId={visitId ?? undefined}
          />
        )
      }
    </div >
  );
}

export default App;
