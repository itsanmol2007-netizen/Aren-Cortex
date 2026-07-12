import { HeartPulse, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { testGroups } from "./data/mockData";
import { ChipSearchPanel } from "./components/ChipSearchPanel";
import { FindingsPanel } from "./components/FindingsPanel";
import { FrequentPicksPanel } from "./components/FrequentPicksPanel";
import { MedicineInspector } from "./components/MedicineInspector";
import { MedicineSuggestions } from "./components/MedicineSuggestions";
import { PatientHeader } from "./components/PatientHeader";
import { PatientModal } from "./components/PatientModal";
import { ActiveConsultGuard } from "./components/ActiveConsultGuard";
import { PreviewPanel } from "./components/PreviewPanel";
import ReviewModal from "./components/ReviewModal";
import { SelectedMedicinesBar } from "./components/SelectedMedicinesBar";
import { Sidebar } from "./features/sidebar/Sidebar";
import { GlobalLogoTrigger } from "./components/GlobalLogoTrigger";
import type { SidebarPage } from "./features/sidebar/SidebarNav";
import type { SelectedSymptom, Medicine, Patient, PrescriptionMedicine, Vitals } from "./types";
import { PatientsPage } from "./features/patients/PatientsPage";
import { ComingSoonPage } from "./components/ComingSoonPage";
import { useConsultKeyboard } from "./hooks/useConsultKeyboard";
import {
  DOCTOR_ID, DOCTOR_NAME, DOCTOR_SPECIALIZATION,
  fetchSymptoms, fetchFindings,
  createPatient, findPatientByPhone, createVisit,
  replaceVisitSymptoms, replaceVisitFindings,
  rankMedicines, saveConsult, runLearningLoop,
  fetchFrequentPicks, logCoprescriptionObservations,
  freqSlotToLabel, freqLabelToSlot,
  fetchPatientVisits,
  fetchDoctorFavourites,
  fetchFavouriteMedicines,
  toggleFavouriteMedicine,
  fetchDoctor, fetchHospital, fetchSnapshotSuggestions,
  type DBSymptom, type DBFinding, type RankedMedicine,
  type SaveConsultMedicine, type RealVisit, type FrequentPick,
  type DBDoctor, type DBHospital, type ClinicalSnapshot,
} from "./lib/db";

const DOCTOR = { id: DOCTOR_ID, name: DOCTOR_NAME, specialty: DOCTOR_SPECIALIZATION };
const emptyVitals: Vitals = { bp: "", pulse: "", temp: "", spo2: "", weight: "" };

// Title + subtitle for every coming-soon feature page
const COMING_SOON_META: Record<string, { title: string; subtitle: string }> = {
  prescriptions: { title: "Prescriptions", subtitle: "Rx history & templates" },
  investigations: { title: "Investigations", subtitle: "Lab orders & results" },
  communication: { title: "Communication", subtitle: "Patient messages & follow-ups" },
  practice: { title: "Practice", subtitle: "Preferences & clinical tools" },
  clinic: { title: "Clinic", subtitle: "Staff, schedule & operations" },
  settings: { title: "Settings", subtitle: "Account & configuration" },
  support: { title: "Support", subtitle: "Help & documentation" },
};

function toUIMedicine(r: RankedMedicine, maxScore: number): Medicine & {
  _dosageDefaults: RankedMedicine["dosage_defaults"];
  _dosage_mg: number | null;
  _duration_days: number | null;
  _route: string;
} {
  const defaults = r.dosage_defaults;
  const compositionIds: number[] = (r as any).compositions?.length
    ? (r as any).compositions
    : [r.primary_composition_id].filter(Boolean);

  return {
    id: String(r.medicine_id),
    medicine_id: r.medicine_id,
    composition_ids: compositionIds,
    primary_composition_id: r.primary_composition_id,
    name: r.medicine_name,
    category: r.composition_names,
    use: "",
    match: maxScore > 0 ? Math.round((r.score / maxScore) * 100) : 50,
    composition: r.composition_names,
    _dosageDefaults: defaults,
    _dosage_mg: defaults?.dosage_mg ?? null,
    _duration_days: defaults?.duration_days ?? null,
    _route: defaults?.route ?? "oral",
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
  const symptomsSearchRef = useRef<HTMLInputElement>(null) as React.RefObject<HTMLInputElement>;
  const findingsSearchRef = useRef<HTMLInputElement>(null) as React.RefObject<HTMLInputElement>;
  const medicinesSearchRef = useRef<HTMLInputElement>(null) as React.RefObject<HTMLInputElement>;
  const testsSearchRef = useRef<HTMLInputElement>(null) as React.RefObject<HTMLInputElement>;

  const [allSymptoms, setAllSymptoms] = useState<DBSymptom[]>([]);
  const [allFindings, setAllFindings] = useState<DBFinding[]>([]);
  const [dbReady, setDbReady] = useState(false);
  const [doctorProfile, setDoctorProfile] = useState<DBDoctor | null>(null);
  const [hospitalProfile, setHospitalProfile] = useState<DBHospital | null>(null);

  const [patient, setPatient] = useState<Patient | null>(null);
  const [visitId, setVisitId] = useState<string | null>(null);
  const [vitals, setVitals] = useState<Vitals>(emptyVitals);
  const [selectedSymptoms, setSelectedSymptoms] = useState<string[]>([]);
  const [selectedSymptomsWithIntensity, setSelectedSymptomsWithIntensity] = useState<SelectedSymptom[]>([]);
  const [selectedFindings, setSelectedFindings] = useState<string[]>([]);
  const [prescription, setPrescription] = useState<PrescriptionMedicine[]>([]);
  const [selectedMedicineId, setSelectedMedicineId] = useState<string | null>(null);
  const [selectedTests, setSelectedTests] = useState<string[]>([]);
  const [selectedLab, setSelectedLab] = useState("No preferred lab");

  const [rankedMedicines, setRankedMedicines] = useState<Medicine[]>([]);
  const [rankedCompositionIds, setRankedCompositionIds] = useState<number[]>([]);
  const [rankLoading, setRankLoading] = useState(false);

  const [favouriteIds, setFavouriteIds] = useState<Set<number>>(new Set());
  const [favouritePicks, setFavouritePicks] = useState<FrequentPick[]>([]);

  const [frequentPicks, setFrequentPicks] = useState<FrequentPick[]>([]);
  const [picksLoading, setPicksLoading] = useState(false);
  const [activeTagIds, setActiveTagIds] = useState<number[]>([]);
  const picksTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
  const [lastSnapshot, setLastSnapshot] = useState<{ symptoms: string[]; findings: string[] } | null>(null);
  const [recentSnapshots, setRecentSnapshots] = useState<ClinicalSnapshot[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activePage, setActivePage] = useState<SidebarPage | null>(null);

  const rankTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useConsultKeyboard({
    symptomsRef: symptomsSearchRef,
    findingsRef: findingsSearchRef,
    medicinesRef: medicinesSearchRef,
    testsRef: testsSearchRef,
    medicineCount: prescription.length,
    onNewPatient: () => setPatientModalOpen(true),
    onReviewRx: () => setIsReviewOpen(true),
    onUndoSnapshot: handleUndoSnapshot,
    isAnyModalOpen: patientModalOpen || isReviewOpen || activeConsultGuardOpen,
  });

  const symptomNameToId = useMemo(() => {
    const map = new Map<string, number>();
    allSymptoms.forEach((s) => map.set(s.name, s.id));
    return map;
  }, [allSymptoms]);

  const findingNameToId = useMemo(() => {
    const map = new Map<string, number>();
    allFindings.forEach((f) => map.set(f.name, f.id));
    return map;
  }, [allFindings]);

  const symptomNames = useMemo(() => allSymptoms.map((s) => s.name), [allSymptoms]);

  useEffect(() => {
    Promise.all([
      fetchSymptoms(),
      fetchFindings(),
      fetchDoctorFavourites(DOCTOR_ID),
      fetchFavouriteMedicines(DOCTOR_ID),
      fetchDoctor(DOCTOR_ID),
      fetchHospital("38bd8da3-0dd2-43a5-ad09-2d3194c95ba9"),
      fetchSnapshotSuggestions("fever"),
    ])
      .then(([symptoms, findings, favs, favPicks, doctor, hospital, snapshots]) => {
        setAllSymptoms(symptoms);
        setAllFindings(findings);
        setFavouriteIds(new Set(favs.map((f) => f.medicine_id)));
        setFavouritePicks(favPicks);
        setDoctorProfile(doctor);
        setHospitalProfile(hospital);
        setRecentSnapshots((snapshots as ClinicalSnapshot[]).slice(0, 3));
        setDbReady(true);
      })
      .catch((err) => showToast(`DB load failed: ${err.message}`));
  }, []);

  useEffect(() => {
    if (!visitId) return;
    if (rankTimer.current) clearTimeout(rankTimer.current);

    rankTimer.current = setTimeout(async () => {
      const symptomPayload = selectedSymptoms
        .map((name) => symptomNameToId.get(name))
        .filter((id): id is number => id !== undefined)
        .map((id) => {
          const name = [...symptomNameToId.entries()].find(([, v]) => v === id)?.[0];
          const intensity = selectedSymptomsWithIntensity.find((s) => s.name === name)?.intensity ?? "moderate";
          return { id, intensity: intensity as "mild" | "moderate" | "severe" };
        });

      const findingPayload = selectedFindings
        .map((name) => findingNameToId.get(name))
        .filter((id): id is number => id !== undefined);

      replaceVisitSymptoms(visitId, symptomPayload.map((s) => s.id), symptomPayload.map((s) => s.intensity)).catch(() => { });
      replaceVisitFindings(visitId, findingPayload).catch(() => { });

      if (!symptomPayload.length && !findingPayload.length) {
        setRankedMedicines([]);
        setRankedCompositionIds([]);
        setActiveTagIds([]);
        return;
      }

      setRankLoading(true);
      try {
        const results = await rankMedicines({ symptoms: symptomPayload, findingIds: findingPayload });
        const maxScore = results[0]?.score ?? 1;
        setRankedMedicines(results.map((r) => toUIMedicine(r, maxScore)));
        setRankedCompositionIds(results.map((r) => r.primary_composition_id));
        const sIds = symptomPayload.map((s) => s.id);
        setActiveTagIds(sIds);
      } catch (err: any) {
        showToast(`Ranking failed: ${err.message}`);
      } finally {
        setRankLoading(false);
      }
    }, 300);

    return () => { if (rankTimer.current) clearTimeout(rankTimer.current); };
  }, [selectedSymptoms, selectedSymptomsWithIntensity, selectedFindings, visitId, symptomNameToId, findingNameToId]);

  useEffect(() => {
    if (!visitId) return;
    if (picksTimer.current) clearTimeout(picksTimer.current);

    picksTimer.current = setTimeout(async () => {
      if (!rankedCompositionIds.length && !selectedSymptoms.length) {
        setFrequentPicks([]);
        return;
      }

      const symptomIds = selectedSymptoms
        .map((name) => symptomNameToId.get(name))
        .filter((id): id is number => id !== undefined);

      if (!symptomIds.length) { setFrequentPicks([]); return; }

      const { supabase } = await import("./lib/supabase");
      const { data: tagRows } = await supabase
        .from("symptom_tag_map")
        .select("tag_id")
        .in("symptom_id", symptomIds);

      const tagIds = [...new Set((tagRows ?? []).map((r: any) => Number(r.tag_id)))];
      if (!tagIds.length) { setFrequentPicks([]); return; }

      setPicksLoading(true);
      try {
        const picks = await fetchFrequentPicks({
          activeTagIds: tagIds,
          excludeCompositionIds: rankedCompositionIds,
          doctorId: DOCTOR_ID,
        });
        setFrequentPicks(picks);
      } catch (err: any) {
        console.warn("fetchFrequentPicks (non-fatal):", err.message);
        setFrequentPicks([]);
      } finally {
        setPicksLoading(false);
      }
    }, 500);

    return () => { if (picksTimer.current) clearTimeout(picksTimer.current); };
  }, [rankedCompositionIds, selectedSymptoms, visitId, symptomNameToId]);

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
    setSelectedLab("No preferred lab");
    setRankedMedicines([]);
    setRankedCompositionIds([]);
    setFrequentPicks([]);
    setActiveTagIds([]);
    setPastVisits([]);
    setRepeatRxBanner(null);
    setFollowUpDays(null);
    setAdviceNotes("");
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

  const handleStartConsultFromRecord = useCallback(async (incomingPatient: Patient) => {
    try {
      const visit = await createVisit(incomingPatient.id!);
      setVisitId(visit.id);
      setSelectedSymptomsWithIntensity([]);
      setPatient(incomingPatient);
      setVitals(emptyVitals);
      setSelectedSymptoms([]);
      setSelectedFindings([]);
      setPrescription([]);
      setSelectedMedicineId(null);
      setSelectedTests([]);
      setSelectedLab("No preferred lab");
      setRankedMedicines([]);
      setRankedCompositionIds([]);
      setFrequentPicks([]);
      setActiveTagIds([]);
      setRepeatRxBanner(null);
      setFollowUpDays(null);
      setAdviceNotes("");
      setActivePage(null);
      setSidebarOpen(false);
      showToast(`Consult started for ${incomingPatient.name}`);

      setPastVisitsLoading(true);
      fetchPatientVisits(incomingPatient.id!)
        .then(setPastVisits)
        .catch(() => { })
        .finally(() => setPastVisitsLoading(false));
    } catch (err: any) {
      showToast(`Error starting consult: ${err.message}`);
    }
  }, []);

  const handleToggleFavourite = useCallback(async (medicine: Medicine) => {
    const medId = medicine.medicine_id;
    const compId = medicine.primary_composition_id ?? medicine.composition_ids?.[0] ?? 0;
    if (!medId || !compId) return;

    const isFav = favouriteIds.has(medId);
    const next = new Set(favouriteIds);
    if (isFav) next.delete(medId); else next.add(medId);
    setFavouriteIds(next);

    try {
      await toggleFavouriteMedicine({
        doctorId: DOCTOR_ID,
        medicineId: medId,
        compositionId: compId,
        setFav: !isFav,
      });
    } catch (err: any) {
      setFavouriteIds(favouriteIds);
      showToast(`Favourite update failed: ${err.message}`);
    }
  }, [favouriteIds]);

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
          };
        } else {
          const created = await createPatient({
            name: incoming.name,
            age: Number(incoming.age),
            gender: incoming.gender,
            phone: incoming.phone,
          });
          dbPatient = {
            ...created,
            age: String(created.age),
            gender: created.gender as Patient["gender"],
          };
        }
      }

      const visit = await createVisit(dbPatient.id!);
      setVisitId(visit.id);
      setPatient(dbPatient);
      setVitals(emptyVitals);
      setSelectedSymptoms([]);
      setSelectedSymptomsWithIntensity([]);
      setSelectedFindings([]);
      setPrescription([]);
      setSelectedMedicineId(null);
      setSelectedTests([]);
      setSelectedLab("No preferred lab");
      setRankedMedicines([]);
      setRankedCompositionIds([]);
      setFrequentPicks([]);
      setActiveTagIds([]);
      setRepeatRxBanner(null);
      setFollowUpDays(null);
      setAdviceNotes("");
      setPatientModalOpen(false);
      setActivePage(null);
      showToast(`Consult started for ${dbPatient.name}`);

      setPastVisitsLoading(true);
      fetchPatientVisits(dbPatient.id!)
        .then(setPastVisits)
        .catch(() => { })
        .finally(() => setPastVisitsLoading(false));
    } catch (err: any) {
      showToast(`Error: ${err.message}`);
    }
  }, []);

  const handleSuggestionClick = (medicine: Medicine) => {
    if (prescription.some((m) => m.id === medicine.id)) {
      setSelectedMedicineId(medicine.id);
      return;
    }
    const ext = medicine as ReturnType<typeof toUIMedicine>;
    const defaults = ext._dosageDefaults;
    const staged: PrescriptionMedicine = {
      ...medicine,
      dosage: defaults?.dosage_mg ? `${defaults.dosage_mg}mg` : "1 tab",
      frequency: defaults?.frequency ? freqSlotToLabel(defaults.frequency) : "Morning and Night",
      duration: defaults?.duration_days ? `${defaults.duration_days} days` : "5 days",
      notes: defaults?.notes ?? "After food",
      dosage_mg: defaults?.dosage_mg ?? null,
      duration_days: defaults?.duration_days ?? null,
      route: defaults?.route ?? "oral",
      instructions: "",
      is_sos: false,
      sort_order: prescription.length,
    };
    setStagedMedicine(staged);
  };

  const handlePickAdd = (pick: FrequentPick) => {
    const existingId = String(pick.medicine_id);
    if (prescription.some((m) => m.id === existingId)) {
      setSelectedMedicineId(existingId);
      return;
    }
    const staged: PrescriptionMedicine = {
      id: existingId,
      medicine_id: pick.medicine_id,
      composition_ids: [pick.composition_id],
      primary_composition_id: pick.composition_id,
      name: pick.medicine_name,
      category: pick.composition_name,
      use: "",
      match: 0,
      composition: pick.composition_name,
      dosage: "1 tab",
      frequency: "Morning and Night",
      duration: "5 days",
      notes: "After food",
      dosage_mg: null,
      duration_days: null,
      route: "oral",
      instructions: "",
      is_sos: false,
      sort_order: prescription.length,
    };
    setStagedMedicine(staged);
  };

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

  const removeMedicine = (id: string) => {
    setPrescription((curr) => curr.filter((m) => m.id !== id));
    if (selectedMedicineId === id) setSelectedMedicineId(null);
  };

  const handleRepeatRx = (visit: RealVisit) => {
    const validSymptoms = visit.symptoms.filter((s) =>
      allSymptoms.some((a) => a.name === s)
    );
    const validFindings = visit.findings
      .map((f) => f.name)
      .filter((name) => allFindings.some((a) => a.name === name));

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
        findingsText: selectedFindings.join(", "),
        followUpDays,
        adviceNotes,
      });

      const tagSignature = allSymptoms
        .filter((s) => selectedSymptoms.includes(s.name))
        .map((s) => s.id)
        .sort((a, b) => a - b)
        .join("-");

      // Build {medicineId, compositionId} pairs — one entry per medicine added.
      // For combos (e.g. Augmentin), we use primary_composition_id as the signal.
      const selectedMedicinesForLoop = prescription
        .filter((m) => m.medicine_id && (m.primary_composition_id || m.composition_ids?.length))
        .map((m) => ({
          medicineId: m.medicine_id,
          compositionId: m.primary_composition_id ?? m.composition_ids?.[0] ?? 0,
        }))
        .filter((m) => m.compositionId > 0);

      // rankedMedicines is already sorted by score — map to medicine_id order.
      const rankedMedicineIds = rankedMedicines
        .map((m) => m.medicine_id)
        .filter(Boolean);
      runLearningLoop({
        tagSignature,
        symptoms: selectedSymptomsWithIntensity,
        findingIds: selectedFindings.map((f) => f.id),
        selectedMedicines: selectedMedicinesForLoop,
        rankedMedicineIds,
      }).catch((e) => console.warn("Learning loop failed (non-fatal):", e));

      logCoprescriptionObservations({
        visitId,
        doctorId: DOCTOR_ID,
        tagSignature,
        compositionIds: [...new Set(prescriptionCompositionIds)],
      }).catch((e) => console.warn("logCoprescriptionObservations (non-fatal):", e));

      setIsReviewOpen(false);
      resetConsultState();
      showToast("Prescription saved ✓");
    } catch (err: any) {
      showToast(`Save failed: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

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

  function handleSnapshotSelect(snapshot: ClinicalSnapshot) {
    // Save current state so Ctrl+Z can undo the whole bundle
    setLastSnapshot({
      symptoms: snapshot.symptoms.map((s) => s.name),
      findings: snapshot.findings.map((f) => f.name),
    });

    // Merge snapshot symptoms into selected (no duplicates)
    const newSymptomNames = snapshot.symptoms.map((s) => s.name);
    setSelectedSymptoms((curr) => [...new Set([...curr, ...newSymptomNames])]);
    setSelectedSymptomsWithIntensity((curr) => {
      const existing = new Set(curr.map((s) => s.name));
      const toAdd = newSymptomNames
        .filter((name) => !existing.has(name))
        .map((name) => ({ name, intensity: "moderate" as const }));
      return [...curr, ...toAdd];
    });

    // Merge snapshot findings into selected (no duplicates)
    const newFindingNames = snapshot.findings.map((f) => f.name);
    setSelectedFindings((curr) => [...new Set([...curr, ...newFindingNames])]);

    showToast(`${snapshot.name} applied — ${newSymptomNames.length} symptoms added`);
  }

  function handleUndoSnapshot() {
    if (!lastSnapshot) return;
    setSelectedSymptoms((curr) => curr.filter((s) => !lastSnapshot.symptoms.includes(s)));
    setSelectedSymptomsWithIntensity((curr) => curr.filter((s) => !lastSnapshot.symptoms.includes(s.name)));
    setSelectedFindings((curr) => curr.filter((f) => !lastSnapshot.findings.includes(f)));
    setLastSnapshot(null);
  }

  if (!dbReady) {
    return (
      <div className="app-shell" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
        <div style={{ textAlign: "center", color: "var(--muted)" }}>
          <div style={{ fontSize: 28, marginBottom: 12 }}>⚕</div>
          <p style={{ fontSize: 14 }}>Connecting to AREN database…</p>
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
          vitals={vitals}
          onVitalsChange={setVitals}
          onOpenPatientModal={() => {
            if (patient && visitId) {
              setActiveConsultGuardOpen(true);
            } else {
              setPatientModalOpen(true);
            }
          }}
          onReviewRx={() => setIsReviewOpen(true)}
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
      ) : isFeaturePage && comingSoonMeta ? (
        <ComingSoonPage
          logoRef={logoRef}
          onOpenSidebar={handleOpenSidebar}
          title={comingSoonMeta.title}
          subtitle={comingSoonMeta.subtitle}
        />
      ) : (
        /* Consult workspace */
        <div className="app-shell-body">
          <main className="workflow">
            <div className="main-column">
              <div className="two-column-row">
                <ChipSearchPanel
                  className="symptoms-panel"
                  title="Symptoms"
                  tone="blue"
                  icon={<HeartPulse size={18} />}
                  items={symptomNames}
                  selected={selectedSymptoms}
                  onChange={setSelectedSymptoms}
                  selectedWithIntensity={selectedSymptomsWithIntensity}
                  onChangeWithIntensity={setSelectedSymptomsWithIntensity}
                  searchRef={symptomsSearchRef}
                  onSnapshotSelect={handleSnapshotSelect}
                  recentSnapshots={recentSnapshots}
                />
                <FindingsPanel
                  findings={allFindings}
                  selected={selectedFindings}
                  onChange={setSelectedFindings}
                  selectedSymptoms={selectedSymptoms}
                  symptomIds={selectedSymptomsWithIntensity.map(s =>
                    allSymptoms.find(sym => sym.name === s.name)?.id
                  ).filter(Boolean) as number[]}
                  searchRef={findingsSearchRef}
                />
              </div>

              <div className="medicine-workspace">
                <div className="medicine-zone">
                  <MedicineSuggestions
                    medicines={rankedMedicines}
                    selectedIds={prescription.map((m) => m.id)}
                    loading={rankLoading}
                    onAdd={handleSuggestionClick}
                    favouriteIds={favouriteIds}
                    onToggleFavourite={handleToggleFavourite}
                    searchRef={medicinesSearchRef}
                  />
                  <FrequentPicksPanel
                    picks={frequentPicks}
                    loading={picksLoading}
                    addedCompositionIds={[...rankedCompositionIds, ...prescriptionCompositionIds]}
                    onAdd={handlePickAdd}
                    favouritePicks={favouritePicks}
                  />
                </div>
              </div>

              <SelectedMedicinesBar
                medicines={prescription}
                selectedId={selectedMedicineId}
                onSelect={setSelectedMedicineId}
                onRemove={removeMedicine}
              />
            </div >

            <PreviewPanel
              testGroups={testGroups}
              selectedTests={selectedTests}
              selectedLab={selectedLab}
              onTestsChange={setSelectedTests}
              onLabChange={setSelectedLab}
              onReviewRx={() => setIsReviewOpen(true)}
              searchRef={testsSearchRef}
            />
          </main >
        </div >
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
            allFindings={allFindings}
            prescription={prescription}
            tests={selectedTests}
            isSaving={isSaving}
            onEdit={() => setIsReviewOpen(false)}
            onSave={handleConfirmAndSave}
            onClose={() => setIsReviewOpen(false)}
            followUpDays={followUpDays}
            adviceNotes={adviceNotes}
            visitId={visitId ?? undefined}
          />
        )
      }
    </div >
  );
}

export default App;