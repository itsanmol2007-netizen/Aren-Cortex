import {
  CheckCircle2, PersonStanding, RefreshCw, Smile, TrendingUp,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MedicineInspector } from "./components/MedicineInspector";
import { InterventionInspector, type SiteAssessment } from "./components/InterventionInspector";
import {
  fetchEarlierInterventions, fetchPlannedInterventions, type EarlierIntervention, type PlannedIntervention,
} from "./lib/db/interventions";
import { interventionFamilyFor, removableFamilies } from "./features/consult/interventionFamilies";
import { followOnsFor, type FollowOn } from "./features/consult/followOns";
import { fetchInterventionPrices, interventionCharges, type InterventionPrice } from "./lib/db/interventionPricing";
import { AssessmentSiteModal } from "./components/AssessmentSiteModal";
import { ExerciseSheet } from "./components/ExerciseSheet";
import { fetchExerciseLibrary, setExerciseLibraryEntry, type ExerciseLibraryEntry } from "./lib/db/exerciseLibrary";
import { clinicalSiteLabel, sameSite, siteFromLabel, siteFromRegionKey, type SiteRef } from "./lib/body/clinicalSite";
import { siteSignalsOf } from "./lib/body/siteSignals";
import { ongoingFrom, type OngoingAction, type OngoingItem, type OngoingLocal } from "./features/consult/ongoing";
import { formatDue, formatLine as formatInterventionLine } from "./features/consult/interventionPlan";
import { NV_CHECKS, NV_REGIONS, nvKey } from "./features/consult/NeurovascularCheck";
import { dashText } from "./lib/clinicalText";
import { recordInvestigationResult, recordStateEvent, STATUS_LABEL } from "./lib/db/clinicalState";
import { ResultSheet, type ResultDraft } from "./features/consult/ResultSheet";
import { SendToLabSheet } from "./features/consult/SendToLabSheet";
import type { AssessmentLine } from "./features/consult/assessmentPlan";
import { searchIntents } from "./lib/db/synapse";
import { PatientHeader } from "./components/PatientHeader";
import { PatientModal } from "./components/PatientModal";
import { EditPatientDetailsModal } from "./components/EditPatientDetailsModal";
import { ActiveConsultGuard } from "./components/ActiveConsultGuard";
import { ShortcutsSheet } from "./components/ShortcutsSheet";
import ReviewModal from "./components/ReviewModal";
import { Sidebar } from "./features/sidebar/Sidebar";
import { NavRail } from "./features/sidebar/NavRail";
import { notePage } from "./lib/diagnostics/sessionTrace";
import type { SidebarPage } from "./features/sidebar/SidebarNav";
import { PatientsPage } from "./features/patients/PatientsPage";
import { SettingsPage } from "./features/settings/SettingsPage";
import { useSettingFocusRunner } from "./features/settings/settingsFocus";
import { PracticePage } from "./features/practice/PracticePage";
import { CommunicationPage } from "./features/communication/CommunicationPage";
import { DoctorOverviewPage } from "./features/overview/DoctorOverviewPage";
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
  AGGRAVATING_FACTORS, EASING_FACTORS, STORY_PATTERNS, storyNotes,
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
import { ResumeConsultPrompt } from "./features/consult/queue/ResumeConsultPrompt";
import { useClinicShape } from "./hooks/useClinicShape";
import { logOperationalEvent } from "./lib/db/intake";
import { GatewaySessionsProvider } from "./features/frontdesk/components/gateway/GatewaySessionsProvider";
import { GatewayQrModal } from "./features/frontdesk/components/gateway/GatewayQrModal";
import { VisitAttachmentsModal } from "./features/frontdesk/components/VisitAttachmentsModal";
import { padToken } from "./features/frontdesk/utils";
import type { TodayVisit } from "./lib/db";
import type { Patient } from "./types";
import { GeneralOpdInputs } from "./features/consult/GeneralOpdInputs";
import { detailWorthyLabels } from "./features/consult/conditionDetail";
import { PhysioInputs } from "./features/consult/PhysioInputs";
import { SoapInputs } from "./features/consult/SoapInputs";
import { DentalChartCard } from "./features/consult/DentalChartCard";
import { BodyMapCard } from "./features/consult/BodyMapCard";
import { JointMapCard } from "./features/consult/JointMapCard";
import { GrowthChartCard } from "./features/consult/GrowthChartCard";
import { RecommendationsCard } from "./features/consult/RecommendationsCard";
import { SuggestionsCard } from "./features/consult/SuggestionsCard";
import { ConditionsCard } from "./features/consult/ConditionsCard";
import { CASCADE_STAGE } from "./features/consult/cascade";
import { OnboardingLayer } from "./features/onboarding/OnboardingLayer";
import { useOnboarding } from "./features/onboarding/useOnboarding";
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
  fetchActiveConsult, updateVisitStatus,
  type DBDoctor, type DBHospital, type RealVisit,
} from "./lib/db";
import { fetchLastExercisePlan } from "./lib/db/exercises";
import { SignInPortal } from "./features/auth/SignInPortal";

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

/**
 * What a saved result was made of, read back from its text when the sheet's
 * own record of it is gone (the consult was reopened): the lines of today's
 * assessment it names, "No abnormality detected", and the rest as its note.
 */
function draftFromResult(text: string | null, lines: AssessmentLine[], diagnoses: string[]): ResultDraft | undefined {
  if (!text) return undefined;
  const parts = text.split("; ").map((p) => p.trim()).filter(Boolean);
  const linked: string[] = [];
  const plain: string[] = [];
  const rest: string[] = [];
  let normal = false;
  for (const p of parts) {
    const line = lines.find((l) => l.text === p);
    if (line) linked.push(line.id);
    else if (p === "No abnormality detected") normal = true;
    else if (diagnoses.includes(p)) plain.push(p);
    else if (p !== "Report attached") rest.push(p);
  }
  return { linked, owned: [], plain, normal, note: rest.join("; "), attachmentIds: [] };
}

function App() {
  // ★ The shape of this clinic — does somebody else do intake here? Read
  // from `hospitals.clinic_mode`, never chosen. It gates a queue and a
  // button, not a product: there is one workspace and it is Cortex. See
  // lib/workspace/clinicShape.ts.
  const clinic = useClinicShape();
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
  // The portal (SignInPortal.tsx, WAITING mode) draws in, holds, then exits
  // once `dbReady` turns true — `portalShown` is that "has it actually
  // finished handing off yet" flag, separate from `dbReady` itself so the
  // real app doesn't mount a frame early just because the fetch resolved
  // fast. `bootTimedOut` is the other way out: `SignInPortal`'s own
  // `timeoutMs` gives up if `dbReady` never arrives — a real gap the old
  // plain-text "Connecting to AREN database…" had no answer for at all.
  const [portalShown, setPortalShown] = useState(false);
  const [bootTimedOut, setBootTimedOut] = useState(false);
  const [doctorProfile, setDoctorProfile] = useState<DBDoctor | null>(null);
  const [hospitalProfile, setHospitalProfile] = useState<DBHospital | null>(null);

  // ★ The one answer to "which doctor, which clinic". Everything Synapse
  // learns is keyed on these, so they have to be the signed-in ones — a bias
  // row written under the wrong doctor cannot be untangled later.
  const identity = useClinicalIdentity();

  /**
   * The first-run walkthrough. Doctors only, and only once a REAL doctor row
   * has resolved — `isReal` is false while `useClinicalIdentity` is falling
   * back to the MVP constant, which belongs to a different hospital, and
   * marking that row as "walked through" would silence the walkthrough for
   * somebody else entirely.
   */
  const onboarding = useOnboarding(
    identity.isReal ? identity.doctorId : null,
    identity.isReal,
  );
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

  /* The header logo lights up while the panel hangs off it. A body class
     rather than a prop: twelve pages render `WorkspaceHeader`, and every one
     of them would otherwise have to thread the same boolean down to say the
     same thing. */
  useEffect(() => {
    document.body.classList.toggle("nav-open", sidebarOpen);
    return () => document.body.classList.remove("nav-open");
  }, [sidebarOpen]);
  /**
   * Where a doctor lands, and what "not on a feature page" means.
   *
   * `"overview"` since 2026-09-06, replacing `null` ("straight into the
   * consult workspace"). Two things follow from that, and both are
   * deliberate:
   *
   * 1. A doctor's first screen is their own numbers plus one large "Start
   *    consult" door, rather than a workspace that assumes the first thing
   *    they want is a patient.
   * 2. The standing "never a blank workspace" invariant below only fires
   *    while `activePage === null` — so a doctor sitting on Overview is
   *    simply not idle in the consult, the invariant does not fire, and
   *    nothing has to be narrowed or special-cased to accommodate the new
   *    landing page. Pressing "Start consult" sets this back to `null`,
   *    which is exactly when the invariant SHOULD take over.
   */
  const [activePage, setActivePage] = useState<SidebarPage | null>("overview");
  /**
   * Where "View patient" (Communication, Overview's activity lists) sends
   * the doctor — an exact record when the id resolves (the normal case
   * now, 2026-09-08), a name search as the fallback for the rare caller
   * with no id (an unlinked WhatsApp thread). See `PatientsPage`'s own
   * `initialPatientId`/`initialSearch` doc comments. Cleared by
   * `handleSidebarNavigate` so an ordinary trip to Patients is unfiltered.
   */
  const [patientRecordSeed, setPatientRecordSeed] = useState<{ id: string | null; name: string | null } | null>(null);

  /**
   * Same seed pattern as `patientRecordSeed` right above, for Clinic's Staff
   * card's own "Add staff" link (2026-09-13): that card cannot mint a login
   * itself (`StaffModal`'s own header explains why), but Overview's Team
   * modal already can — so this seed sends the doctor there and lands them
   * on `AddStaffForm`, already open, rather than a bare trip to Overview
   * that leaves them to find "Manage team" themselves. Cleared by
   * `handleSidebarNavigate` so an ordinary trip to Overview never re-opens it.
   */
  const [openTeamAddStaff, setOpenTeamAddStaff] = useState(false);

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
    if (clinic.frontDesk) return;
    window.setTimeout(() => chartSearchRef.current?.focus(), 0);
  }, [clinic.frontDesk]);

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
    patient, setPatient, visitId,
    pastVisits, pastVisitsLoading,
    repeatRxBanner, setRepeatRxBanner,
    isSaving, isReviewOpen, setIsReviewOpen,
    patientModalOpen, setPatientModalOpen,
    activeConsultGuardOpen, setActiveConsultGuardOpen,
    ageYears, ageMonths, patientSex, hasActiveConsult,
  } = session;

  // Edit the patient on screen mid-consult — the pencil beside their name in
  // the dark header (`PatientHeader`'s `onEditPatient`). See
  // `EditPatientDetailsModal`'s own header for why this exists.
  const [editPatientOpen, setEditPatientOpen] = useState(false);

  // ★ The longitudinal record — a confirmed condition becomes an engine input
  // and, when it is chronic, a fact that survives the visit. Sits between the
  // session and the plan because it needs the patient at render time and the
  // plan needs it at render time. See useLongitudinalRecord.ts.
  const { confirmCondition, unconfirmCondition, carryForwardFor, retireCondition, setConditionOnsetNote } = useLongitudinalRecord({
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
    multiDoctor: clinic.multiDoctor,
    enabled: clinic.frontDesk && identity.ready,
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
   * ── Why the patient modal needs a second flag with a front desk ─────────
   *
   * `session.patientModalOpen` starts TRUE and `session.reset()` sets it back
   * to true, because in Cortex "no patient" means "ask who the patient is" —
   * that modal is how a solo doctor begins, and on a cold start it is the
   * whole screen.
   *
   * With a front desk it is the wrong question twice over: on boot it is the
   * queue, and after a save it would open behind the handover modal. But
   * registering someone directly must stay reachable (receptionist away,
   * walk-in), so the flag cannot simply be forced off either.
   *
   * So Consult renders that modal only when the doctor ASKED for it. Cortex
   * ignores this entirely and behaves exactly as it always has.
   */
  const [registerRequested, setRegisterRequested] = useState(false);

  // ★ The front desk's intake, read back onto the
  // chart at the moment a consult starts. A no-op in Cortex (nobody else
  // touched the visit); with a front desk it is the whole handoff, and on a RESUMED
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

  /**
   * "Previous MI — since when?" — the write behind `CaseSheet`'s
   * `OnsetPrompt`, for the curated conditions `conditionDetail.ts` names.
   * Surfaced on failure like `handleRetireCarried` beside it: the doctor
   * just typed this, and a silent failure would leave the chip claiming a
   * date that never reached the record.
   */
  const handleSetOnsetNote = useCallback(
    (label: string, note: string) => {
      setConditionOnsetNote(label, note)
        .catch((e) => showToast(`Could not save "${note}" for ${label}: ${e?.message ?? e}`));
    },
    [setConditionOnsetNote, showToast]
  );

  /** Which of this chart's labels are worth an optional "since when" — see conditionDetail.ts. */
  const cardiacDetailWorthyLabels = useMemo(
    () => detailWorthyLabels(synapse.data?.observables ?? []),
    [synapse.data?.observables]
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

  const retryBoot = useCallback(() => {
    setBootTimedOut(false);
    setPortalShown(false);
    setBootAttempt((n) => n + 1);
  }, []);

  // The engine is a pure function over data already in memory, so ranking is
  // synchronous — the list re-ranks in the same frame the chip lands. The old
  // path posted every change to an edge function and waited 300 ms.
  // Region signals for the engine, from SITE CONTEXT below. Held as state
  // and set by an effect there, because the sites come from the plan, which
  // is built from this hook's own result — a memo here would be a cycle.
  const [engineSites, setEngineSites] = useState<string[]>([]);
  const intelligence = useConsultIntelligence({
    data: synapse.data,
    visitId,
    observableIds: chartObservableIds,
    observableSources: chart.observableSources,
    observableDurations: chart.observableDurations,
    observableSites: chart.observableSites,
    siteSignals: engineSites,
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
    actorUserId: identity.userId,
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
    adviceLines, interventionPlan, therapyNotes, exercisePlan, reviewAdvice, justAdded, unreadPrescribedWarnings,
    selectedMedicineId, setSelectedMedicineId, stagedMedicine, setStagedMedicine,
    pendingMedicine, setPendingMedicine, inspectorMedicine,
    confirmPendingMedicine, confirmStagedMedicine, medicineBilling,
    pendingIntervention, confirmPendingIntervention, cancelPendingIntervention,
    assessmentLines, pendingAssessment, confirmPendingAssessment, cancelPendingAssessment,
    editAssessmentLine, addAnotherAssessmentSite, addAssessmentAt, updateAssessmentDetails,
    handleAcceptIntent, handleAcknowledge, handleChangeBrand, handlePinClinicBrand,
    updateMedicine, removeMedicine, removeTest, removeDiagnosis,
    addFreeDiagnosis, addFreeTest, addFreeReferral, addFreeAdvice, removeAdviceLine,
    removeIntervention, addAnotherInterventionSite, performPlanned, openIntervention, openImagingAt,
    pendingExercise, confirmPendingExercise, cancelPendingExercise, editExercise, removeAcceptedIntent, updateExercise, removeExercise, duplicateExerciseForSide,
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
      !!pendingIntervention || !!pendingAssessment || !!pendingExercise ||
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
  // Filled in below once `resumeCandidate` state and `fetchActiveConsult` are
  // in scope. Lets `useConsultLifecycle` (declared here, before that state)
  // hand a "you already have a consult open" collision to the same
  // Resume/Discard prompt the app uses on cold start, instead of a dead-end
  // toast. Default is a no-op that reports "not handled".
  const activeConsultCollisionRef = useRef<() => Promise<boolean>>(() => Promise.resolve(false));

  const {
    handleStartConsultFromRecord, resumeConsult, handlePatientConfirm, handleRepeatRx,
    handleConfirmAndSave, closeReview, reviewSaved, sendReviewOnWhatsApp, whatsapp: whatsappSend,
    openReview, resetConsultState,
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
    onConsultSaved: clinic.frontDesk
      ? (name) => { queue.refetch(); setTransition({ justCompleted: name }); }
      : undefined,
    resetStory: () => { visitStory.reset(); examination.reset(); },
    showToast,
    onActiveConsultCollision: () => activeConsultCollisionRef.current(),
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
    lines.push(...storyNotes(s));
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
    // Every navigation clears the seed, INCLUDING one to Patients: a sidebar
    // click on Patients must not reopen somebody else's name in the search
    // box. The one caller that wants a seed sets it immediately AFTER this
    // returns, in the same batch, so its write is the one that lands.
    setPatientRecordSeed(null);
    setOpenTeamAddStaff(false);
    setActivePage(page);
    setSidebarOpen(false);
    setPrescriptionEditorOpen(false);
    // Any consult-only overlay must die the moment we leave the consult screen —
    // it has no business surviving on Patients/Prescriptions/etc. Missed
    // `queueSheetOpen`/`transition` until 2026-09-06: without this, either
    // one stayed mounted (full-screen, z-[70]) UNDER the page the doctor
    // just navigated to, and reused the exact "can't reach the sidebar to
    // leave" bug this same round fixed on `GlobalLogoTrigger` — this is the
    // other direction of that same promise, torn down rather than worked
    // around.
    setPatientModalOpen(false);
    setIsReviewOpen(false);
    setActiveConsultGuardOpen(false);
    setQueueSheetOpen(false);
    setTransition(null);
  };

  /** Clinic's Staff card "Add staff" link — see `openTeamAddStaff`'s own doc
   *  comment. Navigates first (clearing the seed like every other trip
   *  through `handleSidebarNavigate`), then sets it again right after, in
   *  the same batch, so this write is the one that lands. */
  const goAddStaffFromClinic = () => {
    handleSidebarNavigate("overview");
    setOpenTeamAddStaff(true);
  };

  const handleSidebarConsult = () => {
    setActivePage(null);
    setSidebarOpen(false);
    if (hasActiveConsult) return;
    if (!clinic.frontDesk) { setPatientModalOpen(true); return; }
    // Consult: just land on the consult screen. The entry-gate effect below
    // decides what opens — the resume prompt, the queue, or the register
    // screen — once it has resolved whether there's a consult to resume.
    // Forcing anything open here would race that and land on top of it.
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

  // The actual work of `consultFromQueue`, WITHOUT the active-consult check —
  // this is what `pendingQueueAction` stores. Storing `consultFromQueue`
  // itself (as this used to) was the bug: the guard's onDiscard/onComplete
  // call `resetConsultState()` and then immediately run the pending action in
  // the SAME synchronous tick, before React has re-rendered — so
  // `hasActiveConsult` inside a re-invoked `consultFromQueue` still closed
  // over its OLD value (`true`), and it would guard itself again, silently
  // reopening the same ActiveConsultGuard instead of starting the new visit.
  // Measured live 2026-09-08: the card never visibly changed because
  // `setActiveConsultGuardOpen(false)` and the re-triggered `(true)` landed
  // in the same React batch.
  const startConsultForQueueVisit = useCallback((visit: TodayVisit, aheadOfQueue: boolean) => {
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
  }, [identity.hospitalId, identity.userId, queue, handleStartConsultFromRecord]);

  const consultFromQueue = useCallback((visit: TodayVisit, aheadOfQueue: boolean) => {
    // Picking someone else while a consult is already open is exactly the
    // "start a new consult over an active one" case Cortex already guards —
    // the queue must not be a side door around it. `hasActiveConsult` is
    // false the moment TransitionModal's own onContinue calls this (the
    // workspace was already cleared by the save that opened it), so this
    // never fires there.
    if (hasActiveConsult) {
      pendingQueueAction.current = () => startConsultForQueueVisit(visit, aheadOfQueue);
      setQueueSheetOpen(false);
      setActiveConsultGuardOpen(true);
      return;
    }
    startConsultForQueueVisit(visit, aheadOfQueue);
  }, [hasActiveConsult, startConsultForQueueVisit]);

  // Same split, same reason: the core action never re-checks
  // `hasActiveConsult`, so storing it in `pendingQueueAction` cannot
  // re-trigger the guard it was just dismissed from.
  const registerPatientDirectlyNow = useCallback(() => {
    setQueueSheetOpen(false);
    setTransition(null);
    setActivePage(null);
    setRegisterRequested(true);
    setPatientModalOpen(true);
  }, [setActivePage, setPatientModalOpen]);

  /** The receptionist-unavailable path, from wherever it is offered. */
  const registerPatientDirectly = useCallback(() => {
    if (hasActiveConsult) {
      pendingQueueAction.current = registerPatientDirectlyNow;
      setQueueSheetOpen(false);
      setActiveConsultGuardOpen(true);
      return;
    }
    registerPatientDirectlyNow();
  }, [hasActiveConsult, registerPatientDirectlyNow]);

  /**
   * The consult screen must never sit blank.
   *
   * When the doctor is on the bare consult workspace (`activePage === null`)
   * with no consult in memory and nothing already covering it, exactly one
   * surface opens — IMMEDIATELY, no wait, no flash:
   *
   *   • someone waiting  → the queue sheet
   *   • nobody waiting   → the register-a-patient screen  (front desk only;
   *     Cortex's PatientModal is already its always-open default)
   *
   * Separately, in the background, the DATABASE is asked ONCE per session
   * whether this doctor left a `serving` / `draft` visit behind that
   * localStorage did not restore (a logout, another machine). If so,
   * `ResumeConsultPrompt` takes over — it renders last (on top) and closes
   * whatever opened above. "Resume on return" is once-per-session on purpose:
   * a consult parked later today is offered back on the NEXT app load.
   */
  type ResumeRow = Awaited<ReturnType<typeof fetchActiveConsult>>;
  const [resumeCandidate, setResumeCandidate] = useState<ResumeRow>(null);
  const resumeCheckedRef = useRef<string | null>(null);

  /**
   * Whether a consult overlay is genuinely on screen right now.
   *
   * `patientModalOpen` alone is NOT that: it defaults `true` (Cortex's "who
   * is this for?" opening state) and STAYS `true` with a front desk while the
   * modal is not rendered — only `registerRequested` makes it render there.
   * Checking the raw flag was the bug behind "blank consult screen until you
   * navigate away and come back" (navigating away happened to set it false).
   */
  const consultOverlayShowing =
    (patientModalOpen && (!clinic.frontDesk || registerRequested)) ||
    isReviewOpen || activeConsultGuardOpen || queueSheetOpen ||
    !!transition || !!resumeCandidate || !!attachmentsVisit;

  /**
   * The nav rail sits ABOVE the modals (see NavRail.tsx) so navigation is
   * never locked out. The cost of that is what this class pays: while a
   * full-screen overlay veils and blurs the workspace, an unveiled rail is
   * the only thing on screen still at full contrast, and it stops reading as
   * part of the app — it reads as pasted on top of a screenshot of the app.
   *
   * `consultOverlayShowing`, not the raw flags — it already knows that
   * `patientModalOpen` can be `true` while nothing is rendered (see its own
   * comment above). The nav panel is deliberately NOT in it: that panel is
   * the thing you are looking at, so veiling its own rail would be backwards.
   */
  /* Where the doctor has been, for a support request to carry. Page names
     only — never what was on the page. See sessionTrace.ts's own rules. */
  useEffect(() => {
    notePage(activePage ?? "consult");
  }, [activePage]);

  useEffect(() => {
    // `activePage === null` rather than `isFeaturePage`, which is declared
    // several hundred lines below this and would be read from the dependency
    // array during render — a temporal dead zone, not a style choice.
    const veiled = activePage === null && consultOverlayShowing;
    document.body.classList.toggle("overlay-open", veiled);
    return () => document.body.classList.remove("overlay-open");
  }, [activePage, consultOverlayShowing]);

  useEffect(() => {
    if (!clinic.frontDesk || !clinic.ready) return;
    if (hasActiveConsult || activePage !== null) return;
    if (consultOverlayShowing) return;
    // Wait for the queue's OWN real answer, not a cache guess or an empty
    // array that just hasn't loaded yet (see useQueue's `settled` — `loading`
    // alone flips false the instant a STALE cache seeds the list, which once
    // read as "3 people waiting" from last time the tab was open, opened the
    // queue sheet, then the live fetch landed ~200ms later with the truth —
    // nobody actually waiting — and there was no way back: this effect only
    // ever decides once, guarded by `consultOverlayShowing` above, so the
    // wrong overlay just sat there instead of the right one ever opening.
    // Waiting for `settled` means the one decision this effect ever makes is
    // made after the network — not before it, and not on a guess — corrected.
    if (!queue.settled) return;
    if (queue.waiting.length > 0) {
      setQueueSheetOpen(true);
    } else {
      setRegisterRequested(true);
      setPatientModalOpen(true);
    }
  }, [clinic.frontDesk, clinic.ready, hasActiveConsult, activePage,
      consultOverlayShowing, queue.waiting.length, queue.settled]);

  useEffect(() => {
    if (!clinic.ready || !identity.ready || !identity.doctorId) return;
    if (activePage !== null) return;                          // not on the consult screen yet
    if (resumeCheckedRef.current === identity.doctorId) return; // asked once already this session
    resumeCheckedRef.current = identity.doctorId;
    if (hasActiveConsult) return;   // localStorage already restored it — nothing to ask

    let cancelled = false;
    void fetchActiveConsult(identity.doctorId)
      .then((row) => {
        // A localStorage restore may have landed while we were asking.
        if (cancelled || !row || session.patient) return;
        setResumeCandidate(row);
        // Give way to the resume prompt — close whatever the rule above opened.
        setPatientModalOpen(false);
        setRegisterRequested(false);
        setQueueSheetOpen(false);
      })
      .catch((e) => console.warn("[consult] fetchActiveConsult failed (non-fatal):", e));
    return () => { cancelled = true; };
  }, [clinic.ready, identity.ready, identity.doctorId, hasActiveConsult, activePage, session.patient]);

  const resumeActiveConsult = useCallback(() => {
    const c = resumeCandidate;
    if (!c) return;
    setResumeCandidate(null);
    resumeConsult(
      {
        id: c.patient.id, name: c.patient.name, age: c.patient.age,
        gender: c.patient.gender as Patient["gender"], phone: c.patient.phone,
        dateOfBirth: c.patient.dateOfBirth,
      },
      c.visitId,
    );
  }, [resumeCandidate, resumeConsult]);

  const discardActiveConsult = useCallback(async () => {
    const c = resumeCandidate;
    if (!c) return;
    try { await updateVisitStatus(c.visitId, "discarded"); }
    catch (e) { console.warn("[consult] discard of resume candidate failed:", e); }
    setResumeCandidate(null);
    queue.refetch();
  }, [resumeCandidate, queue]);

  const handleCancelConsult = useCallback(async () => {
    const currentVisitId = visitId;
    if (currentVisitId) {
      try {
        await updateVisitStatus(currentVisitId, "discarded");
      } catch (err) {
        console.warn("[consult] Failed to discard visit on cancel:", err);
      }
    }
    if (resumeCandidate) {
      if (resumeCandidate.visitId !== currentVisitId) {
        try {
          await updateVisitStatus(resumeCandidate.visitId, "discarded");
        } catch (err) {
          console.warn("[consult] Failed to discard resume candidate on cancel:", err);
        }
      }
      setResumeCandidate(null);
    }
    resetConsultState();
    queue.refetch();
    showToast("Consult canceled");
  }, [visitId, resumeCandidate, resetConsultState, queue, showToast]);

  /**
   * A "start a consult" call was rejected because this doctor already has one
   * open (`ActiveConsultExistsError` from the one-serving-per-doctor rule).
   * Load that visit and raise the same `ResumeConsultPrompt` the app shows on
   * cold start, so the doctor gets Resume / Discard right here instead of a
   * toast telling them to "finish or cancel it" with no way to reach it — the
   * actual cause of "I can't create any visit" when a consult was abandoned
   * (tab closed, crash) leaving a stuck `serving` row. `useConsultLifecycle`
   * calls this through `activeConsultCollisionRef`. Returns whether it took
   * over (a prompt is now showing).
   */
  const offerActiveConsultResume = useCallback(async (): Promise<boolean> => {
    if (!identity.doctorId) return false;
    try {
      const row = await fetchActiveConsult(identity.doctorId);
      if (!row) return false;
      setResumeCandidate(row);
      // The prompt only renders on the consult screen (`!isFeaturePage`), so a
      // collision raised from the Patients page has to bring us there.
      setActivePage(null);
      setPatientModalOpen(false);
      setRegisterRequested(false);
      setQueueSheetOpen(false);
      return true;
    } catch (e) {
      console.warn("[consult] offerActiveConsultResume failed:", e);
      return false;
    }
  }, [identity.doctorId, setActivePage]);

  useEffect(() => {
    activeConsultCollisionRef.current = offerActiveConsultResume;
  }, [offerActiveConsultResume]);

  // ── The specialty profile ───────────────────────────────────────────────
  // Which intent type this facility elevates into the Primary Recommendation
  // slot. Read once from the facility, never inferred from what the doctor is
  // doing — see specialtyProfile.ts for why that distinction is load-bearing.
  const specialty = useMemo(
    () => profileFor(hospitalProfile?.specialty_profile),
    [hospitalProfile?.specialty_profile]
  );

  /**
   * `intelligence.byType`, with a referral to this facility's OWN specialty
   * dropped — "Refer to Cardiology" ranked for a cardiologist is nonsense the
   * engine has no way to know about; it ranks "Cardiology" as a referral
   * target the same way for every specialty, because a chest-pain patient
   * seeing a General OPD doctor genuinely should see it. Filtered here,
   * at the one place that already knows both the ranked intents and the
   * facility's own specialty, rather than teaching `useConsultIntelligence`
   * (specialty-agnostic by design) or `SuggestionsCard` (generic across
   * every facility) about this one case.
   */
  const filteredByType = useMemo(() => {
    const referrals = intelligence.byType.referral;
    if (!referrals?.length) return intelligence.byType;
    const trimmed = referrals.filter(
      (r) => r.label.trim().toLowerCase() !== specialty.label.trim().toLowerCase()
    );
    if (trimmed.length === referrals.length) return intelligence.byType;
    return { ...intelligence.byType, referral: trimmed };
  }, [intelligence.byType, specialty.label]);

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
    () => pastVisits.filter((v) => (v.isStub || visitStatusKind(v.status) === "done") && visitHasContent(v)),
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
  const [markedExam, setMarkedExam] = useState<{
    regions: string[];
    sides: Map<string, "left" | "right" | null>;
    /** every marked site, each side its own (a left and a right wrist are two) */
    sites: { region: string; side: "left" | "right" | null }[];
  }>({ regions: [], sides: new Map(), sites: [] });
  useEffect(() => {
    if (!visitId || !specialty.charts.includes("joints")) {
      setMarkedExam({ regions: [], sides: new Map(), sites: [] });
      return;
    }
    let cancelled = false;
    listBodySites(visitId)
      .then((sites) => {
        if (cancelled) return;
        const regions: string[] = [];
        const sides = new Map<string, "left" | "right" | null>();
        const all: { region: string; side: "left" | "right" | null }[] = [];
        // Oldest first, so the summary reads in the order sites were marked.
        for (const s of [...sites].reverse()) {
          if (!all.some((x) => x.region === s.region && x.side === s.side)) all.push({ region: s.region, side: s.side });
        }
        for (const s of sites) {
          if (!REGION_BY_KEY.has(s.region)) continue;
          if (!regions.includes(s.region)) regions.push(s.region);
          // First marking wins for the side — re-marking the other side is
          // a second site, and the card's own switcher is how you reach it.
          if (!sides.has(s.region)) sides.set(s.region, s.side);
        }
        setMarkedExam({ regions, sides, sites: all });
      })
      .catch(() => { if (!cancelled) setMarkedExam({ regions: [], sides: new Map(), sites: [] }); });
    return () => { cancelled = true; };
  }, [visitId, openChart, specialty.charts]);

  /**
   * SITE CONTEXT (Phase 3) — every place established in this visit, in the
   * order it became known: an assessment's site first ("Fracture — Left
   * knee"), then an intervention's, then the joints marked on the body map.
   * Every site-asking modal reads it: one place is pre-filled, two or more
   * become "Which site?", none leaves the body map. An intervention adds its
   * own site here but never invents a diagnosis for it.
   */
  const knownSites = useMemo<SiteRef[]>(() => {
    const out: SiteRef[] = [];
    const push = (x: SiteRef) => { if (!out.some((k) => sameSite(k, x))) out.push(x); };
    // "Bilateral knee" is two places for anything done to ONE of them (an
    // injection, a cast): offered as Left knee and Right knee, so it becomes
    // a "Which site?" choice instead of pre-filling "Bilateral".
    const add = (x: SiteRef | null) => {
      if (!x) return;
      if (x.side === "both") { push({ ...x, side: "left" }); push({ ...x, side: "right" }); }
      else push(x);
    };
    assessmentLines.forEach((l) => add(l.site));
    interventionPlan.forEach((l) => add(siteFromLabel(l.site)));
    chart.findingSites.forEach((sites) => sites.forEach(add));
    markedExam.regions.forEach((r) => add(siteFromRegionKey(r, markedExam.sides.get(r) ?? null)));
    return out;
  }, [assessmentLines, interventionPlan, chart.findingSites, markedExam]);

  // The same places, told to the engine (see `engineSites` above).
  useEffect(() => {
    const next = siteSignalsOf(knownSites);
    setEngineSites((prev) => (prev.join(",") === next.join(",") ? prev : next));
  }, [knownSites]);

  /**
   * A local finding charted from the case sheet or command bar. One place
   * known in this visit → it is found there ("Joint swelling / effusion ·
   * Right knee"), changeable on the chip; two or more → the chip asks
   * "Where?" at once; none → the chip offers "+ where?". Everything else
   * toggles exactly as before.
   */
  const [askSiteLabel, setAskSiteLabel] = useState<string | null>(null);
  const handleObservableToggleSited = useCallback((o: Observable, opts?: { deferSite?: boolean }) => {
    const adding = !onChartSet.has(o.label);
    // The command bar asks "where?" itself, in the box (its where-slot).
    if (opts?.deferSite || !adding || !o.localizable || knownSites.length === 0) {
      handleObservableToggle(o);
      return;
    }
    if (knownSites.length === 1) {
      chart.toggleObservableAt(o, knownSites[0]);
      return;
    }
    handleObservableToggle(o);
    setAskSiteLabel(o.label);
  }, [onChartSet, knownSites, handleObservableToggle, chart]);

  /** The command bar's where-slot: one place added to (or taken back from) a finding. */
  const handleSiteChange = useCallback((finding: string, site: SiteRef, on: boolean) => {
    const cur = chart.findingSites.get(finding) ?? [];
    const next = on
      ? (cur.some((s) => sameSite(s, site)) ? cur : [...cur, site])
      : cur.filter((s) => !sameSite(s, site));
    chart.setFindingSites(finding, next);
  }, [chart]);

  /** This visit's placed assessments — what an intervention at the same
   *  site treats (a reduction there defaults to "Fracture"). */
  const siteAssessments = useMemo<SiteAssessment[]>(
    () => assessmentLines.flatMap((l) => (l.site ? [{ site: l.site, family: l.family, text: l.text }] : [])),
    [assessmentLines],
  );

  /** This patient's earlier casts, sutures, dressings… — read only when a
   *  removal or dressing change opens, so it can point back at one. */
  const [earlierInterventions, setEarlierInterventions] = useState<EarlierIntervention[]>([]);
  useEffect(() => {
    const fam = pendingIntervention ? interventionFamilyFor(pendingIntervention.payload.label) : null;
    const pid = patient?.id;
    if (!fam || removableFamilies(fam.key).length === 0 || !pid) return;
    setEarlierInterventions([]);
    let cancelled = false;
    fetchEarlierInterventions(pid).then((rows) => { if (!cancelled) setEarlierInterventions(rows); });
    return () => { cancelled = true; };
  }, [pendingIntervention, patient?.id]);

  /** What earlier visits planned for this patient and nobody has done yet
   *  ("Suture removal, due 3 Oct") — offered on the plan rail to perform. */
  const [plannedEarlier, setPlannedEarlier] = useState<PlannedIntervention[]>([]);
  useEffect(() => {
    setPlannedEarlier([]);
    const pid = patient?.id;
    if (!pid) return;
    let cancelled = false;
    fetchPlannedInterventions(pid).then((rows) => { if (!cancelled) setPlannedEarlier(rows); });
    return () => { cancelled = true; };
  }, [patient?.id, visitId]);

  /**
   * A follow-on chip was clicked (followOns.ts). Catalogue items open their
   * own modal at the line's site; plain text lands the way a free-text term
   * does. Never auto-added — this runs only on the doctor's click.
   */
  const handleFollowOn = useCallback((f: FollowOn) => {
    const a = f.action;
    const payloadFor = (type: "modality" | "test", label: string): AcceptPayload | null => {
      const ruleset = synapse.data?.ruleset;
      if (!ruleset) return null;
      for (const [, i] of ruleset.intents) {
        if (i.type === type && i.label.toLowerCase() === label.toLowerCase()) {
          return { intentId: i.id, type, label: i.label, refTable: i.refTable, refId: i.refId, medicine: null, viaSearch: false, overridden: false };
        }
      }
      return null;
    };
    switch (a.kind) {
      case "intervention": {
        const payload = payloadFor("modality", a.label)
          ?? { intentId: 0, type: "modality", label: a.label, refTable: null, refId: null, medicine: null, viaSearch: false, overridden: false };
        openIntervention(payload, { site: a.site, status: a.status, dueDays: a.dueDays, details: a.details });
        break;
      }
      case "imaging": {
        const payload = payloadFor("test", a.label);
        if (payload) openImagingAt(payload, a.site);
        else addFreeTest(a.site ? `${a.label} - ${clinicalSiteLabel(a.site)}` : a.label);
        break;
      }
      case "test": addFreeTest(a.text); break;
      case "advice": addFreeAdvice(a.text); break;
      case "referral": addFreeReferral(a.text); break;
      case "followUp": setFollowUpDays(a.days); break;
      case "medicine": setAddMedicineQuery(a.query); break;
    }
  }, [synapse.data?.ruleset, openIntervention, openImagingAt, addFreeTest, addFreeAdvice, addFreeReferral, setFollowUpDays]);

  // ── ONGOING CARE LIFECYCLE (2026-09-25) ────────────────────────────────
  // What this visit has done about earlier visits' casts, plans and
  // conditions. States (healed, deferred…) are written at once as events
  // (clinical_state_events) and mirrored here so the card updates in the
  // same frame; a removal or a planned item carried out is part of today's
  // plan, read straight from it.
  const [ongoingStates, setOngoingStates] = useState<Pick<OngoingLocal, "conditions" | "plans">>(
    () => ({ conditions: new Map(), plans: new Map() }),
  );
  /** investigation results recorded during this visit (order id → text) */
  const [resultsToday, setResultsToday] = useState<Map<string, string>>(() => new Map());
  /** the awaited investigation whose result sheet is open */
  const [resultSheetFor, setResultSheetFor] = useState<OngoingItem | null>(null);
  /** "Send to lab" (Review): open, and the lab it went to this visit */
  const [labSheetOpen, setLabSheetOpen] = useState(false);
  const [labSentTo, setLabSentTo] = useState<string | null>(null);
  /** what each result recorded this visit was made of, so it reopens for editing */
  const [resultDrafts, setResultDrafts] = useState<Map<string, ResultDraft>>(() => new Map());
  const findResultAssessments = useCallback(
    (q: string) => searchIntents({ query: q, types: ["finding"], limit: 24 }).then((r) => r.hits),
    [],
  );
  /** whether the last visit has been carried forward onto today's sheet */
  const [continued, setContinued] = useState(false);
  useEffect(() => {
    setOngoingStates({ conditions: new Map(), plans: new Map() });
    setResultsToday(new Map());
    setResultDrafts(new Map());
    setResultSheetFor(null);
    setLabSheetOpen(false);
    setLabSentTo(null);
    setContinued(false);
  }, [patient?.id]);
  // A result read at THIS visit and saved already (the consult was reopened,
  // or the page reloaded) is still this visit's: it stays on the Ongoing
  // card as recorded today, with Edit result, rather than vanishing because
  // the order now reads as resulted.
  useEffect(() => {
    if (!visitId) return;
    const mine: [string, string][] = [];
    for (const v of meaningfulPastVisits) {
      for (const o of v.orders ?? []) {
        if (o.resultText && o.resultVisitId === visitId) mine.push([o.id, o.resultText]);
      }
    }
    if (!mine.length) return;
    setResultsToday((cur) => {
      if (mine.every(([id]) => cur.has(id))) return cur;
      const next = new Map(cur);
      for (const [id, text] of mine) if (!next.has(id)) next.set(id, text);
      return next;
    });
  }, [meaningfulPastVisits, visitId]);
  const ongoingLocal = useMemo<OngoingLocal>(() => ({
    ...ongoingStates,
    results: resultsToday,
    removedToday: new Set(interventionPlan.map((l) => l.removesId).filter(Boolean) as string[]),
    fulfilledToday: new Set(interventionPlan.map((l) => l.fulfilsId).filter(Boolean) as string[]),
  }), [ongoingStates, interventionPlan, resultsToday]);

  // ── What the printed prescription (and so the WhatsApp page) carries
  // beyond the chart: results read today, procedures split into done and
  // planned, what continues from earlier visits, and a neurovascular check.
  const printResults = useMemo(() => {
    const names = new Map<string, string>();
    for (const v of meaningfulPastVisits) for (const o of v.orders ?? []) names.set(o.id, o.name);
    return [...resultsToday].map(([id, text]) => ({ name: dashText(names.get(id) ?? "Investigation"), text }));
  }, [resultsToday, meaningfulPastVisits]);

  const printProcedures = useMemo(() => interventionPlan.map((l) => ({
    // formatLine tags a planned line "[planned, due …]"; the print gives
    // planned lines their own heading and due date instead.
    text: l.text ? (l.notes.trim() ? `${l.text} (${l.notes.trim()})` : l.text) : formatInterventionLine(l),
    status: (l.status ?? "performed") as "performed" | "planned",
    due: l.dueDate ? formatDue(l.dueDate) : null,
  })), [interventionPlan]);

  const printContinuing = useMemo(() => {
    const out: string[] = [];
    for (const it of ongoingFrom(meaningfulPastVisits, ongoingLocal)) {
      const what = `${it.title}${it.site ? ` - ${it.site}` : ""}`;
      if (it.kind === "in-place" && !it.today) out.push(`${what}: keep on, ${it.status.toLowerCase()}`);
      else if (it.kind === "condition" && it.state) out.push(`${what}: ${STATUS_LABEL[it.state].toLowerCase()}`);
    }
    return out;
  }, [meaningfulPastVisits, ongoingLocal]);

  const handleOngoingAction = useCallback((item: OngoingItem, action: OngoingAction) => {
    const p = item.procedure;
    const pid = patient?.id;
    if (action.type === "remove" && p) {
      const ruleset = synapse.data?.ruleset;
      let payload: AcceptPayload | null = null;
      if (ruleset) {
        for (const [, i] of ruleset.intents) {
          if (i.type === "modality" && i.label.toLowerCase() === "cast / splint / suture removal") {
            payload = { intentId: i.id, type: "modality", label: i.label, refTable: i.refTable, refId: i.refId, medicine: null, viaSearch: false, overridden: false };
            break;
          }
        }
      }
      openIntervention(
        payload ?? { intentId: 0, type: "modality", label: "Cast / splint / suture removal", refTable: null, refId: null, medicine: null, viaSearch: false, overridden: false },
        { site: item.siteRef, removesId: p.id },
      );
      return;
    }
    if (action.type === "do" && p) {
      performPlanned({ id: p.id, intentId: p.intentId ?? null, label: p.label, siteRef: p.site, details: p.details ?? {} });
      return;
    }
    if (action.type === "open-result") {
      setResultSheetFor(item);
      return;
    }
    if (action.type === "result" && item.order) {
      const order = item.order;
      setResultsToday((cur) => new Map(cur).set(order.id, action.text));
      recordInvestigationResult(order.id, action.text, visitId).catch((e) => {
        setResultsToday((cur) => { const n = new Map(cur); n.delete(order.id); return n; });
        showToast(`Could not save the result: ${e?.message ?? e}`);
      });
      return;
    }
    if (!pid) return;
    // A state: shown at once, written behind; a failed write is undone and said.
    const write = (
      apply: (s: Pick<OngoingLocal, "conditions" | "plans">) => Pick<OngoingLocal, "conditions" | "plans">,
      event: Parameters<typeof recordStateEvent>[0],
      what: string,
    ) => {
      let before: Pick<OngoingLocal, "conditions" | "plans"> | null = null;
      setOngoingStates((cur) => { before = cur; return apply(cur); });
      recordStateEvent(event).catch((e) => {
        if (before) setOngoingStates(before);
        showToast(`Could not save ${what}: ${e?.message ?? e}`);
      });
    };
    if (action.type === "status" && item.assessmentId) {
      const id = item.assessmentId;
      write(
        (cur) => ({ ...cur, conditions: new Map(cur.conditions).set(id, action.status) }),
        { patientId: pid, visitId, assessmentId: id, status: action.status },
        "the status",
      );
      return;
    }
    if (!p) return;
    if (action.type === "defer") {
      const base = p.planState?.status === "deferred" && p.planState.dueDate ? p.planState.dueDate : p.dueDate;
      const from = base && new Date(base) > new Date() ? new Date(base) : new Date();
      from.setDate(from.getDate() + action.days);
      const due = from.toISOString().slice(0, 10);
      write(
        (cur) => ({ ...cur, plans: new Map(cur.plans).set(p.id, { status: "deferred", dueDate: due }) }),
        { patientId: pid, visitId, interventionId: p.id, status: "deferred", dueDate: due },
        "the new date",
      );
    } else if (action.type === "cancel") {
      write(
        (cur) => ({ ...cur, plans: new Map(cur.plans).set(p.id, { status: "cancelled", dueDate: null }) }),
        { patientId: pid, visitId, interventionId: p.id, status: "cancelled" },
        "the cancellation",
      );
    } else if (action.type === "restore") {
      write(
        (cur) => ({ ...cur, plans: new Map(cur.plans).set(p.id, { status: "active", dueDate: null }) }),
        { patientId: pid, visitId, interventionId: p.id, status: "active" },
        "the change",
      );
    }
  }, [patient?.id, visitId, synapse.data?.ruleset, openIntervention, performPlanned, showToast]);

  /**
   * Follow-up → Continue: the last visit's complaints and examination
   * findings come onto today's sheet as CARRIED chips (the dashed "from last
   * time" look — confirm or remove each), each local finding at the place it
   * was found. Rebuilt from the saved record, not copied from a screen.
   */
  const handleContinue = useCallback(() => {
    const last = meaningfulPastVisits[0];
    if (!last) return;
    const byLower = new Map(observables.map((o) => [o.label.toLowerCase(), o]));
    const resolve = (text: string): { o: typeof observables[number]; site: SiteRef | null } | null => {
      const whole = byLower.get(text.toLowerCase());
      if (whole) return { o: whole, site: null };
      const i = text.lastIndexOf(" - ");
      if (i < 0) return null;
      const o = byLower.get(text.slice(0, i).toLowerCase());
      if (!o) return null;
      // "Right wrist, Left wrist" — the first place; the others are rare and
      // can be ticked on the chip.
      const site = siteFromLabel(text.slice(i + 3).split(",")[0].trim());
      return { o, site };
    };
    const picked = [...last.symptoms, ...(last.sitedFindings?.length ? last.sitedFindings : last.findings.map((f) => f.name))]
      .map(resolve)
      .filter((x): x is NonNullable<ReturnType<typeof resolve>> => !!x);
    if (!picked.length) { setContinued(true); return; }
    chart.seedIntake(picked.map(({ o }) => ({ label: o.label, kind: o.kind, durationDays: null, origin: "carried" as const })));
    for (const { o, site } of picked) if (site) chart.setFindingSites(o.label, [site]);
    setContinued(true);
    showToast(`Carried forward from ${new Date(last.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}: ${picked.length} item${picked.length === 1 ? "" : "s"}`);
  }, [meaningfulPastVisits, observables, chart, showToast]);

  /** This clinic's usual dose per exercise (Practice → Exercise Library) —
   *  where the exercise sheet starts. */
  const [exerciseLibrary, setExerciseLibrary] = useState<ExerciseLibraryEntry[]>([]);
  useEffect(() => {
    if (!identity.hospitalId) return;
    let cancelled = false;
    fetchExerciseLibrary(identity.hospitalId)
      .then((rows) => { if (!cancelled) setExerciseLibrary(rows); })
      .catch(() => { /* offline or none: the sheet starts from doseFor */ });
    return () => { cancelled = true; };
  }, [identity.hospitalId]);

  /** What this clinic charges for interventions (Phase 7) — empty = off. */
  const [interventionPrices, setInterventionPrices] = useState<InterventionPrice[]>([]);
  useEffect(() => {
    if (!identity.hospitalId) return;
    let cancelled = false;
    fetchInterventionPrices(identity.hospitalId).then((rows) => { if (!cancelled) setInterventionPrices(rows); });
    return () => { cancelled = true; };
  }, [identity.hospitalId, isReviewOpen]);

  /** Phase 3 examination state — layer 1, beside the story. */
  const examination = useExamination(visitId);

  // The lab order's "why" and "what happened", from today's consult only:
  // how it happened (with when), the working assessment; then the
  // complaints and findings with their places, pain and any neurovascular
  // abnormality. Never past history, medicines or billing.
  const labIndication = useMemo(() => {
    const s = visitStory.story;
    const how = s.mechanism.trim();
    const when = s.durationText?.trim() || (s.duration ? DURATION_LABEL[s.duration] : "");
    const mech = how ? `${how}${when ? `, ${when} ago` : ""}` : "";
    // Free story typed into the bar ("Fell from bike yesterday") says how it
    // happened when the structured mechanism does not; otherwise it is context.
    const notes = storyNotes(s).join(", ");
    return [mech || notes, ...diagnoses].filter(Boolean).join("; ");
  }, [visitStory.story, diagnoses]);

  const printNeuro = useMemo(() => {
    const out: { text: string; abnormal: boolean }[] = [];
    for (const m of markedExam.sites) {
      if (!NV_REGIONS.has(m.region)) continue;
      const vals = NV_CHECKS.map((c) => examination.getText(nvKey(c.key, m.region), m.side));
      if (vals.every((v) => !v)) continue;
      const ref = siteFromRegionKey(m.region, m.side);
      const where = ref ? clinicalSiteLabel(ref) : m.region;
      const off = NV_CHECKS
        .map((c, i) => (vals[i] && vals[i] !== c.normal ? `${c.label.toLowerCase()} ${vals[i]!.toLowerCase()}` : null))
        .filter(Boolean);
      out.push(off.length
        ? { text: `Neurovascular: ${off.join(", ")} - ${where}`, abnormal: true }
        : { text: `Neurovascular intact - ${where}`, abnormal: false });
    }
    return out;
  }, [markedExam.sites, examination]);

  const labContext = useMemo(() => {
    const pain = Number((vitals as Record<string, unknown> | null)?.painVas);
    const s = visitStory.story;
    return [
      ...(s.mechanism.trim() ? storyNotes(s) : []),
      ...chart.symptomsForRecord,
      ...chart.findingsForRecord,
      ...(Number.isFinite(pain) && pain > 0 ? [`Pain ${pain}/10`] : []),
      ...printNeuro.filter((n) => n.abnormal).map((n) => n.text),
    ].join("; ");
  }, [visitStory.story, chart.symptomsForRecord, chart.findingsForRecord, vitals, printNeuro]);



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


  // A real error (the fetch itself rejected) always wins over the portal —
  // no reason to sit through a 15s timeout when the answer already came
  // back. `bootTimedOut` is SignInPortal's own `onTimeout` firing instead:
  // `dbReady` never arrived within its `timeoutMs`, the one case the old
  // plain-text screen had no answer for at all (it would just sit on
  // "Connecting to AREN database…" forever).
  if (bootError || bootTimedOut) {
    return (
      <div className="app-shell" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
        <div style={{ textAlign: "center", color: "var(--muted)" }}>
          <div style={{ fontSize: 28, marginBottom: 12 }}>⚕</div>
          <p style={{ fontSize: 14, color: "var(--cs-red, #b42318)" }}>
            {bootError ? "Couldn't reach the AREN database." : "This is taking longer than expected."}
          </p>
          <p style={{ fontSize: 12, marginTop: 4, marginBottom: 16 }}>
            {bootError ?? "Check your connection and try again."}
          </p>
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
        </div>
      </div>
    );
  }

  // Not just "while !dbReady" — the portal itself decides when it's done
  // (never before its own MIN_MS, so a fetch resolving in 80ms still reads
  // as a considered moment rather than a flash), and `portalShown` is what
  // actually gates the real app rendering a frame early.
  if (!portalShown) {
    return (
      <SignInPortal
        waitFor={dbReady}
        holdMessage="Setting up your clinic…"
        name={identity.doctorName}
        onTimeout={() => setBootTimedOut(true)}
        onDone={() => setPortalShown(true)}
      />
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
    <div className={`app-shell ${isFeaturePage ? "is-feature" : "is-consult"}`}>

      {/* Portals to <body>, so its ring can sit over any panel without
          inheriting a stacking context from one of them. */}
      <OnboardingLayer
        showWelcome={onboarding.showWelcome}
        active={onboarding.active}
        doctorName={identity.doctorName}
        onAcceptWelcome={onboarding.acceptWelcome}
        onSkipAll={onboarding.skipAll}
        onDismissStep={onboarding.dismissStep}
      />

      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        activePage={activePage}
        onNavigate={handleSidebarNavigate}
        onConsult={handleSidebarConsult}
        doctor={DOCTOR}
        avatarUrl={doctorProfile?.avatar_url}
        onOpenProfile={() => handleSidebarNavigate("settings")}
      />

      {/* The permanent rail. Rendered next to the panel, not inside it: the
          panel comes and goes, the rail never does. */}
      <NavRail
        activePage={activePage}
        onNavigate={handleSidebarNavigate}
        onConsult={handleSidebarConsult}
        expanded={sidebarOpen}
        onOpenPanel={handleOpenSidebar}
        doctorName={DOCTOR.name}
        avatarUrl={doctorProfile?.avatar_url}
        onOpenProfile={() => handleSidebarNavigate("settings")}
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
          onCancelConsult={handleCancelConsult}
          pastVisits={meaningfulPastVisits}
          pastVisitsLoading={pastVisitsLoading}
          onOpenVisit={(visit, x) => setActiveVisit({ visit, x })}
          sessionLabels={carePlan.sessionLabels}
          // Front desk only — at a solo clinic these are undefined and the header keeps
          // its "+ Patient" button exactly as it was.
          onOpenQueue={clinic.frontDesk ? () => setQueueSheetOpen(true) : undefined}
          queueCount={queue.waiting.length}
          nextToken={queue.waiting[0] ? padToken(queue.waiting[0].token_number) : null}
          onEditPatient={patient?.id ? () => setEditPatientOpen(true) : undefined}
        />
      )}

      {editPatientOpen && patient?.id && (
        <EditPatientDetailsModal
          patientId={patient.id}
          onClose={() => setEditPatientOpen(false)}
          onSaved={(fresh) => {
            // Patch the patient in-flight — same shape `dbToUiPatient` builds
            // for the intake modal, so the header/chart/prescription all see
            // the correction immediately, no reload of the consult needed.
            setPatient((p) => (p ? {
              ...p,
              name: fresh.name,
              age: String(fresh.age),
              gender: fresh.gender as Patient["gender"],
              phone: fresh.phone,
              dateOfBirth: fresh.date_of_birth ?? "",
            } : p));
            setEditPatientOpen(false);
          }}
        />
      )}

      {/* The shared past-visit detail, opened by the header's chips AND by the
          band's Last Visit card / timeline rows. One view, two ways in — its
          dark tone (the default) is deliberately unchanged. */}
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
      {activePage === "overview" ? (
        <DoctorOverviewPage
          /* The sidebar's own Consult action, not a second path into the
             consult: it already knows a front-desk clinic opens the queue and a
             Cortex clinic opens the patient form. */
          onStartConsult={handleSidebarConsult}
          onNavigate={handleSidebarNavigate}
          specialty={specialty}
          onViewPatient={(patientId, name) => {
            handleSidebarNavigate("patients");
            setPatientRecordSeed({ id: patientId, name });
          }}
          /* Today's Queue mirrors the SAME read the queue sheet already
             polls (`useConsultQueue`, disabled entirely in Cortex) — never a
             second fetch of "who is waiting", which is exactly the mistake
             that hook's own file header warns against repeating. */
          queueWaiting={queue.waiting}
          queueLoading={queue.loading}
          onOpenQueue={() => setQueueSheetOpen(true)}
          onStartFromQueueRow={(visit) =>
            consultFromQueue(visit, visit.visit_id !== queue.waiting[0]?.visit_id)
          }
          openTeamAddStaff={openTeamAddStaff}
        />
      ) : activePage === "patients" ? (
        <PatientsPage
          onStartConsult={handleStartConsultFromRecord}
          onResumeConsult={resumeConsult}
          specialty={specialty}
          onNavigate={handleSidebarNavigate}
          initialPatientId={patientRecordSeed?.id}
          initialSearch={patientRecordSeed?.id ? null : patientRecordSeed?.name}
        />
      ) : activePage === "settings" ? (
        <SettingsPage
          hospitalId={identity.hospitalId}
          doctorId={identity.doctorId}
          hospitalProfile={hospitalProfile}
          doctorProfile={doctorProfile}
          doctorName={DOCTOR.name}
          onNavigate={handleSidebarNavigate}
          onAddStaff={goAddStaffFromClinic}
          onSpecialtyChanged={(id) =>
            setHospitalProfile((prev) => (prev ? { ...prev, specialty_profile: id } : prev))
          }
          // Same gate as the walkthrough itself — see `useOnboarding`'s own
          // call above. Absent (row hidden) for front desk/admin/anyone
          // whose identity hasn't resolved to a real doctor yet.
          onReplayWalkthrough={identity.isReal ? onboarding.restart : undefined}
        />
      ) : activePage === "practice" ? (
        <PracticePage
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
        <CommunicationPage
          /* Both scoped reads on this page (the inbox and the appointment
             request queue) are per-clinic under RLS, so the page cannot
             fetch anything until identity has resolved a hospital. */
          hospitalId={identity.hospitalId}
          /* Credits are per DOCTOR, not per clinic — the free allocation is
             "every doctor receives 5,000", and one bench draining another's
             balance would be a support ticket on day one. */
          doctorId={identity.doctorId}
          userId={identity.userId}
          onViewPatient={(patientId, name) => {
            // Order matters: `handleSidebarNavigate` clears the seed, so the
            // set has to come after it. Both land in one batch.
            handleSidebarNavigate("patients");
            setPatientRecordSeed({ id: patientId, name });
          }}
        />
      ) : activePage === "clinic" ? (
        prescriptionEditorOpen ? (
          <PrescriptionEditorPage
            hospitalId={identity.hospitalId}
            hospital={hospitalProfile}
            doctor={doctorProfile}
            onBack={() => setPrescriptionEditorOpen(false)}
          />
        ) : (
          <ClinicPage
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
            onOpenPrescriptionEditor={() => setPrescriptionEditorOpen(true)}
            onAddStaff={goAddStaffFromClinic}
          />
        )
      ) : activePage === "support" ? (
        <SupportPage
          /* Prefilled, not asked for: `doctors.email` is already on file, and
             a support form that makes a doctor type their own address is
             asking them for something AREN can see. Editable, because the
             address they want a REPLY at is not always the one on file. */
          doctorEmail={doctorProfile?.email}
          clinicName={hospitalProfile?.name}
        />
      ) : isFeaturePage && comingSoonMeta ? (
        <ComingSoonPage
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
            ongoingLocal={ongoingLocal}
            onOngoingAction={handleOngoingAction}
            onContinue={handleContinue}
            continued={continued}
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
                  preferSystems={specialty.preferSystems}
                  preferDomain={specialty.preferDomain}
                  onChartSet={onChartSet}
                  onObservableToggle={handleObservableToggleSited}
                  caseSheetEntries={caseSheetEntries}
                  onCaseSheetRemove={handleCaseSheetRemove}
                  onRetireCarried={handleRetireCarried}
                  knownSites={knownSites}
                  onSetFindingSites={chart.setFindingSites}
                  askSiteLabel={askSiteLabel}
                  onAskSiteHandled={() => setAskSiteLabel(null)}
                  onSiteChange={handleSiteChange}
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
                  markedSites={markedExam.sites}
                  siteAssessments={assessmentLines}
                  onOpenBodyMap={() => setOpenChart("joints")}
                />
              ) : usesCaseSheet ? (
                <GeneralOpdInputs
                  observables={observables}
                  onChartSet={onChartSet}
                  onObservableToggle={handleObservableToggleSited}
                  caseSheetEntries={caseSheetEntries}
                  onCaseSheetRemove={handleCaseSheetRemove}
                  knownSites={knownSites}
                  onSetFindingSites={chart.setFindingSites}
                  askSiteLabel={askSiteLabel}
                  onAskSiteHandled={() => setAskSiteLabel(null)}
                  onSiteChange={handleSiteChange}
                  /* "How long?" — asked here and NOT in PhysioInputs above,
                     because physiotherapy's Story composer already owns that
                     question (`story.ts`'s Duration dimension) and two boxes
                     asking it is the double-entry this screen exists to
                     remove. See GeneralOpdInputs' own prop doc. */
                  symptomDurations={chart.symptomDurations}
                  onSetSymptomDuration={chart.setSymptomDuration}
                  onRetireCarried={handleRetireCarried}
                  detailWorthyLabels={cardiacDetailWorthyLabels}
                  onSetOnsetNote={handleSetOnsetNote}
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
                  story={visitStory.story}
                  onStoryChange={visitStory.setStory}
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
                assessmentLines={assessmentLines}
                onEditAssessmentLine={editAssessmentLine}
                onAddAssessmentSite={addAnotherAssessmentSite}
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
                      byType={filteredByType}
                      topOfType={topOfType}
                      thinkingKey={intelligence.thinkingKey}
                      // Investigations sits BESIDE Assessment but is a step after it in
                      // the reasoning — what would confirm or rule out what was just
                      // ranked. Siblings on screen, sequential in thought.
                      cascadeStage={CASCADE_STAGE.investigations}
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
                    prescription={prescription}
                    onRemoveMedicine={removeMedicine}
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
                    onEdit={editExercise}
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
                    byType={filteredByType}
                    topOfType={topOfType}
                    thinkingKey={intelligence.thinkingKey}
                    // This instance IS the plan row's primary column on a chart whose
                    // primary type is neither medicine nor exercise — same beat as
                    // RecommendationsCard, which it stands in for.
                    cascadeStage={CASCADE_STAGE.plan}
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
                  // Orthopedics: procedures are the core output, so Clinical
                  // Actions opens on Interventions once any are ranked.
                  initialScope={specialty.id === "orthopedics" ? "modality" : null}
                  // Same fix, same reason — see the sibling instance above.
                  capped={5}
                  byType={filteredByType}
                  topOfType={topOfType}
                  thinkingKey={intelligence.thinkingKey}
                  // The trailing catch-all — referrals, advice, whatever the plan row
                  // did not take. Last beat of the cascade.
                  cascadeStage={CASCADE_STAGE.rest}
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
            onOpenShortcuts={() => setShortcutsOpen(true)}
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
                interventions={interventionPlan}
                exerciseLines={exercisePlan.map((l) => ({ id: l.id, text: formatLine(l) }))}
                onRemoveExercise={removeExercise}
                onRemoveAdviceLine={removeAdviceLine}
                onRemoveIntervention={removeIntervention}
                onAddAnotherInterventionSite={addAnotherInterventionSite}
                plannedEarlier={plannedEarlier}
                onPerformPlanned={performPlanned}
                followOnsFor={followOnsFor}
                onFollowOn={handleFollowOn}
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

          {/* `active`/`modelVersion`/`specialty` no longer go to StatusBar —
              it stopped rendering them 2026-09-11 (see its own header note);
              `synapse.status`/`specialty.label` are still computed above for
              everything else that reads them. */}
          <StatusBar
            degraded={!!synapse.data?.degraded}
            unidentified={!identity.isReal}
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
              onObservableToggleAt={chart.toggleObservableAt}
              examination={examination}
              assessmentLines={assessmentLines}
              onAddAssessmentAt={addAssessmentAt}
              onAssessmentDetails={updateAssessmentDetails}
              onRemoveAssessment={removeDiagnosis}
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
            billing={medicineBilling}
          />

          {/* Site + side confirmation, between "ranked" and "on the plan" —
              the same slot MedicineAddSheet occupies one line up. */}
          {/* Site and details for an assessment placed on the body. Keyed
              so a second site opens fresh, never on the last one's state. */}
          {pendingAssessment && (
            <AssessmentSiteModal
              key={pendingAssessment.editId ?? `new-${pendingAssessment.payload.label}`}
              label={pendingAssessment.payload.label}
              kind={pendingAssessment.kind}
              autoPrefill={!pendingAssessment.another}
              editing={pendingAssessment.editId !== null}
              initialSite={pendingAssessment.initialSite}
              initialDetails={pendingAssessment.initialDetails}
              knownSites={knownSites}
              onCancel={cancelPendingAssessment}
              onConfirm={confirmPendingAssessment}
            />
          )}

          {/* "The X-ray is back": what it showed (today's assessment, made at
              the order's site), the image (this visit's attachments) and a
              note, written onto the order. See ResultSheet.tsx. */}
          {resultSheetFor?.order && (
            <ResultSheet
              key={resultSheetFor.order.id}
              order={resultSheetFor.order}
              orderedAt={resultSheetFor.order.orderedAt}
              assessmentLines={assessmentLines}
              find={findResultAssessments}
              onAddAt={addAssessmentAt}
              onAccept={handleAcceptIntent}
              onDetails={updateAssessmentDetails}
              onRemove={removeDiagnosis}
              visitId={visitId}
              hospitalId={identity.isReal ? identity.hospitalId : null}
              patientId={patient?.id ?? null}
              initial={resultDrafts.get(resultSheetFor.order.id) ?? draftFromResult(
                resultsToday.get(resultSheetFor.order.id) ?? resultSheetFor.order.resultText ?? null, assessmentLines, diagnoses,
              )}
              // A result from an earlier visit opens as an update of it.
              editing={resultsToday.has(resultSheetFor.order.id) || !!resultSheetFor.order.resultText}
              onSave={(text, draft) => {
                const orderId = resultSheetFor.order!.id;
                setResultDrafts((cur) => new Map(cur).set(orderId, draft));
                handleOngoingAction(resultSheetFor, { type: "result", text });
                setResultSheetFor(null);
              }}
              onClose={() => setResultSheetFor(null)}
            />
          )}

          {/* The exercise dose sheet — side, sets × reps or hold, how often. */}
          {pendingExercise && (() => {
            const lib = exerciseLibrary.find((e) => e.intentId === pendingExercise.payload.intentId);
            return (
              <ExerciseSheet
                key={pendingExercise.editId ?? `new-${pendingExercise.payload.intentId}`}
                label={pendingExercise.payload.label}
                editing={pendingExercise.editId !== null}
                initial={pendingExercise.initial}
                clinicDefault={lib ? {
                  sets: lib.defaultSets, reps: lib.defaultReps, holdSeconds: lib.defaultHoldSeconds,
                  perDay: lib.defaultPerDay, notes: lib.notes,
                } : null}
                canSaveDefault={!!identity.hospitalId && pendingExercise.payload.intentId > 0}
                onCancel={cancelPendingExercise}
                onConfirm={(draft, saveAsDefault) => {
                  const intentId = pendingExercise.payload.intentId;
                  confirmPendingExercise(draft);
                  if (saveAsDefault && identity.hospitalId && intentId > 0) {
                    setExerciseLibraryEntry({
                      hospitalId: identity.hospitalId, intentId,
                      defaultSets: draft.sets, defaultReps: draft.reps, defaultHoldSeconds: draft.holdSeconds,
                      defaultPerDay: draft.perDay, notes: draft.notes, setBy: identity.userId,
                    })
                      .then((entry) => setExerciseLibrary((cur) => [entry, ...cur.filter((e) => e.intentId !== entry.intentId)]))
                      .catch((err) => showToast(`Added, but the clinic default did not save: ${err?.message ?? err}`));
                  }
                }}
              />
            );
          })()}

          {pendingIntervention && (
            <InterventionInspector
              key={`${pendingIntervention.payload.intentId}-${pendingIntervention.payload.label}`}
              label={pendingIntervention.payload.label}
              initialSite={pendingIntervention.initialSite}
              knownSites={knownSites}
              autoPrefill={!pendingIntervention.another}
              siteAssessments={siteAssessments}
              earlier={earlierInterventions}
              fromPlanned={pendingIntervention.fromPlanned ?? null}
              initialStatus={pendingIntervention.initialStatus}
              initialDueDays={pendingIntervention.initialDueDays ?? null}
              initialDetails={pendingIntervention.initialDetails}
              initialRemovesId={pendingIntervention.initialRemovesId ?? null}
              onCancel={cancelPendingIntervention}
              onConfirm={confirmPendingIntervention}
            />
          )}

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
            // Only rendered while activeConsultGuardOpen is true, which never
            // happens without a real active visit — see the three call sites
            // that set it.
            visitId={visitId!}
            doctorId={identity.doctorId}
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
      {clinic.frontDesk && queueSheetOpen && (
        <QueueSheet
          waiting={queue.waiting}
          serving={queue.serving}
          previews={queue.previews}
          completedCount={queue.completedCount}
          loading={queue.loading}
          currentVisitId={visitId}
          onClose={() => setQueueSheetOpen(false)}
          // Locked open while there is no active consult behind it — closing
          // here would leave the dark header with no patient in it at all.
          // Dismissable again the moment a consult IS active: closing then
          // just returns to that patient, never to a blank workspace.
          dismissable={hasActiveConsult}
          onPick={consultFromQueue}
          onRegisterPatient={registerPatientDirectly}
          onManageAttachments={setAttachmentsVisit}
        />
      )}

      {/* ── The handover ──────────────────────────────────────────────────
          Opens on a successful save with a front desk, over an already-cleared
          workspace. Owns its own 10-second continuation; everything it can
          decide it hands back through `consultFromQueue`, the same entry
          point the queue sheet uses. */}
      {clinic.frontDesk && transition && (
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

      {clinic.frontDesk && attachmentsVisit && (
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
        // with a front desk there is a queue behind it.
        !isFeaturePage && patientModalOpen && (!clinic.frontDesk || registerRequested) && (
          <PatientModal
            onClose={
              clinic.frontDesk
                ? () => { setRegisterRequested(false); setPatientModalOpen(false); }
                : patient ? () => setPatientModalOpen(false) : () => { }
            }
            // Clear `registerRequested` only when a consult actually started.
            // On a payment-undecided / duplicate-phone / RLS failure the modal
            // must STAY (the doctor sees the toast and retries or Cancels) —
            // clearing eagerly dropped them onto a blank screen the "never
            // blank" guard instantly re-covered with a fresh modal.
            onConfirm={async (p, payment) => {
              const started = await handlePatientConfirm(p, payment);
              if (started) setRegisterRequested(false);
            }}
            // Always on, in both workspaces (2026-09-06 — this used to be
            // solo-only). The `registerRequested` escape hatch is the
            // SAME "the doctor is doing their own intake" situation Cortex
            // always is — front desk isn't in this loop, by construction, any
            // time this modal is the one open — so it earns the same rail,
            // not a separate design decision.
            billing={{
              hospitalId: identity.hospitalId,
              doctorId: identity.doctorId,
              doctorName: identity.doctorName,
            }}
            // The "set up your fee" link on the no-fee notice — Overview is
            // where the fee control lives (Team management → Fees).
            onSetupFee={() => {
              setRegisterRequested(false);
              setPatientModalOpen(false);
              setActivePage("overview");
            }}
          />
        )
      }

      {/* ── Resume your consult ───────────────────────────────────────────
          The DB-backed entry gate: this doctor has a `serving` / `draft`
          visit that localStorage did not restore (a logout, another
          machine). Rendered LAST so it sits above the register screen / queue
          sheet if either opened in the gap before the DB answered. Both
          products. */}
      {!isFeaturePage && resumeCandidate && !hasActiveConsult && (
        <ResumeConsultPrompt
          patientName={resumeCandidate.patient.name}
          status={resumeCandidate.status}
          startedAt={resumeCandidate.startedAt}
          onResume={resumeActiveConsult}
          onDiscard={discardActiveConsult}
        />
      )}

      {
        !isFeaturePage && isReviewOpen && patient && (
          <ReviewModal
            patient={patient}
            seedCharges={interventionCharges(interventionPrices, interventionPlan)}
            doctor={{
              name: doctorProfile?.name ?? DOCTOR_NAME,
              name_hi: doctorProfile?.name_hi ?? null,
              specialization: doctorProfile?.specialization ?? DOCTOR_SPECIALIZATION,
              qualification: doctorProfile?.qualification ?? null,
              registration_number: doctorProfile?.registration_number ?? null,
              signature_image_url: doctorProfile?.signature_image_url ?? null,
              avatar_url: (doctorProfile as any)?.avatar_url ?? null,
            }}
            hospital={hospitalProfile}
            vitals={vitals}
            symptoms={chart.symptomsForRecord}
            findings={[...chart.findingsForRecord, ...printNeuro.filter((n) => n.abnormal).map((n) => n.text)]}
            examNotes={printNeuro.filter((n) => !n.abnormal).map((n) => n.text)}
            allFindings={findingsAsDb}
            prescription={prescription}
            tests={selectedTests}
            isSaving={isSaving}
            saveLabel={reviewSaved ? "Complete & Next" : (clinic.frontDesk ? "Complete & Next" : undefined)}
            // Saved-and-sending: the prescription is committed, the WhatsApp
            // message is on its way, and Review is held open on purpose.
            sent={reviewSaved}
            whatsappPhase={whatsappSend.phase}
            whatsappError={whatsappSend.message}
            onEdit={() => setIsReviewOpen(false)}
            onSave={(billing) => handleConfirmAndSave({ billing })}
            // The dedicated WhatsApp action. Saves + pushes the message and
            // DELIBERATELY leaves Review open — the doctor sees the
            // prescription and the send's outcome before the screen advances.
            // Closing (`closeReview`) is then the "Complete & Next". Later
            // presses retry only the push. Plain "Confirm & Save" never sends.
            onSendWhatsApp={sendReviewOnWhatsApp}
            onSendToLab={identity.isReal && identity.hospitalId ? () => setLabSheetOpen(true) : undefined}
            labSentTo={labSentTo}
            onClose={closeReview}
            followUpDays={followUpDays}
            adviceNotes={reviewAdvice}
            therapyNotes={therapyNotes}
            exerciseLines={exercisePlan.map(formatLine)}
            diagnoses={diagnoses}
            results={printResults}
            procedures={printProcedures.length ? printProcedures : undefined}
            continuingCare={printContinuing}
            storySummary={storySummaryLines}
            goalSummary={goalSummaryLines}
            visitId={visitId ?? undefined}
          />
        )
      }
      {!isFeaturePage && isReviewOpen && labSheetOpen && patient?.id && identity.hospitalId && (
        <SendToLabSheet
          tests={selectedTests}
          labs={preferredLabs}
          initialLabName={selectedLabName}
          patient={{ id: patient.id ?? "", name: patient.name, age: patient.age ?? null, gender: patient.gender ?? null }}
          hospitalId={identity.hospitalId}
          doctorId={identity.isReal ? identity.doctorId : null}
          visitId={visitId}
          prescriptionId={null}
          defaultIndication={labIndication}
          defaultContext={labContext}
          onLabsChanged={setPreferredLabs}
          onSent={(name) => setLabSentTo(name)}
          onClose={() => setLabSheetOpen(false)}
        />
      )}
    </div >
  );
}

export default App;
