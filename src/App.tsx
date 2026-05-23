import { HeartPulse } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { testGroups } from "./data/mockData";
import { ChipSearchPanel } from "./components/ChipSearchPanel";
import { FindingsPanel } from "./components/FindingsPanel";
import { MedicineInspector } from "./components/MedicineInspector";
import { MedicineSuggestions } from "./components/MedicineSuggestions";
import { PatientHeader } from "./components/PatientHeader";
import { PatientModal } from "./components/PatientModal";
import { PrescriptionPanel } from "./components/PrescriptionPanel";
import { PreviewPanel } from "./components/PreviewPanel";
import { ReviewModal } from "./components/ReviewModal";
import {
  DOCTOR_ID, DOCTOR_NAME, DOCTOR_SPECIALIZATION,
  fetchSymptoms, fetchFindings,
  createPatient, findPatientByPhone, createVisit,
  replaceVisitSymptoms, replaceVisitFindings,
  rankMedicines, saveConsult, runLearningLoop,
  freqSlotToLabel, freqLabelToSlot,
  fetchPatientVisits,
  type DBSymptom, type DBFinding, type RankedMedicine,
  type SaveConsultMedicine, type RealVisit,
} from "./lib/db";
import type { Medicine, Patient, PrescriptionMedicine, Vitals } from "./types";

const DOCTOR = { id: DOCTOR_ID, name: DOCTOR_NAME, specialty: DOCTOR_SPECIALIZATION };
const emptyVitals: Vitals = { bp: "", pulse: "", temp: "", spo2: "", weight: "" };

// ── Convert DB ranked result → UI Medicine shape ───────────────────────────────
function toUIMedicine(r: RankedMedicine, maxScore: number): Medicine & {
  _dosageDefaults: RankedMedicine["dosage_defaults"];
  _dosage_mg: number | null;
  _duration_days: number | null;
  _route: string;
} {
  const defaults = r.dosage_defaults;
  return {
    id: String(r.medicine_id),
    medicine_id: r.medicine_id,
    composition_id: r.primary_composition_id,
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

// ── App ───────────────────────────────────────────────────────────────────────
function App() {
  // ── DB bootstrap ────────────────────────────────────────────────────────────
  const [allSymptoms, setAllSymptoms] = useState<DBSymptom[]>([]);
  const [allFindings, setAllFindings] = useState<DBFinding[]>([]);
  const [dbReady, setDbReady] = useState(false);

  // ── Active consult ───────────────────────────────────────────────────────────
  const [patient, setPatient] = useState<Patient | null>(null);
  const [visitId, setVisitId] = useState<string | null>(null);
  const [vitals, setVitals] = useState<Vitals>(emptyVitals);
  const [selectedSymptoms, setSelectedSymptoms] = useState<string[]>([]);
  const [selectedFindings, setSelectedFindings] = useState<string[]>([]);
  const [findingsCollapsed, setFindingsCollapsed] = useState(false);
  const [prescription, setPrescription] = useState<PrescriptionMedicine[]>([]);
  const [selectedMedicineId, setSelectedMedicineId] = useState<string | null>(null);
  const [selectedTests, setSelectedTests] = useState<string[]>([]);
  const [selectedLab, setSelectedLab] = useState("No preferred lab");

  // ── Ranking ──────────────────────────────────────────────────────────────────
  const [rankedMedicines, setRankedMedicines] = useState<Medicine[]>([]);
  const [rankedCompositionIds, setRankedCompositionIds] = useState<number[]>([]);
  const [rankLoading, setRankLoading] = useState(false);

  // ── Past visits ──────────────────────────────────────────────────────────────
  const [pastVisits, setPastVisits] = useState<RealVisit[]>([]);
  const [pastVisitsLoading, setPastVisitsLoading] = useState(false);

  // ── UI state ─────────────────────────────────────────────────────────────────
  const [stagedMedicine, setStagedMedicine] = useState<PrescriptionMedicine | null>(null);
  const [toast, setToast] = useState("");
  const [patientModalOpen, setPatientModalOpen] = useState(false);
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const rankTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Derived maps ─────────────────────────────────────────────────────────────
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

  // ── Load symptoms + findings on mount ────────────────────────────────────────
  useEffect(() => {
    Promise.all([fetchSymptoms(), fetchFindings()])
      .then(([symptoms, findings]) => {
        setAllSymptoms(symptoms);
        setAllFindings(findings);
        setDbReady(true);
      })
      .catch((err) => showToast(`DB load failed: ${err.message}`));
  }, []);

  // ── Re-rank on symptom/finding change (300ms debounce) ───────────────────────
  useEffect(() => {
    if (!visitId) return;
    if (rankTimer.current) clearTimeout(rankTimer.current);

    rankTimer.current = setTimeout(async () => {
      const symptomPayload = selectedSymptoms
        .map((name) => symptomNameToId.get(name))
        .filter((id): id is number => id !== undefined)
        .map((id) => ({ id, intensity: "moderate" as const }));

      const findingPayload = selectedFindings
        .map((name) => findingNameToId.get(name))
        .filter((id): id is number => id !== undefined);

      replaceVisitSymptoms(visitId, symptomPayload.map((s) => s.id)).catch(() => { });
      replaceVisitFindings(visitId, findingPayload).catch(() => { });

      if (!symptomPayload.length && !findingPayload.length) {
        setRankedMedicines([]);
        setRankedCompositionIds([]);
        return;
      }

      setRankLoading(true);
      try {
        const results = await rankMedicines({ symptoms: symptomPayload, findingIds: findingPayload });
        const maxScore = results[0]?.score ?? 1;
        setRankedMedicines(results.map((r) => toUIMedicine(r, maxScore)));
        setRankedCompositionIds(results.map((r) => r.primary_composition_id));
      } catch (err: any) {
        showToast(`Ranking failed: ${err.message}`);
      } finally {
        setRankLoading(false);
      }
    }, 300);

    return () => { if (rankTimer.current) clearTimeout(rankTimer.current); };
  }, [selectedSymptoms, selectedFindings, visitId, symptomNameToId, findingNameToId]);

  // ── Helpers ──────────────────────────────────────────────────────────────────
  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(""), 2400);
  };

  const resetConsultState = () => {
    setPatient(null);
    setVisitId(null);
    setVitals(emptyVitals);
    setSelectedSymptoms([]);
    setSelectedFindings([]);
    setPrescription([]);
    setSelectedMedicineId(null);
    setSelectedTests([]);
    setSelectedLab("No preferred lab");
    setRankedMedicines([]);
    setRankedCompositionIds([]);
    setPastVisits([]);
  };

  // ── Patient confirm: find/create patient → create visit → load past visits ───
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
      setSelectedFindings([]);
      setPrescription([]);
      setSelectedMedicineId(null);
      setSelectedTests([]);
      setSelectedLab("No preferred lab");
      setRankedMedicines([]);
      setRankedCompositionIds([]);
      setPatientModalOpen(false);
      showToast(`Consult started for ${dbPatient.name}`);

      // Fetch past visits — non-blocking, non-fatal
      setPastVisitsLoading(true);
      fetchPatientVisits(dbPatient.id!)
        .then(setPastVisits)
        .catch(() => { })
        .finally(() => setPastVisitsLoading(false));

    } catch (err: any) {
      showToast(`Error: ${err.message}`);
    }
  }, []);

  // ── Medicine staging ─────────────────────────────────────────────────────────
  const handleSuggestionClick = (medicine: Medicine) => {
    // If already in prescription, just open inspector
    if (prescription.some((m) => m.id === medicine.id)) {
      setSelectedMedicineId(medicine.id);
      return;
    }
    const ext = medicine as ReturnType<typeof toUIMedicine>;
    const defaults = ext._dosageDefaults;
    const staged: PrescriptionMedicine = {
      ...medicine,
      // UI display fields (shown in inspector)
      dosage: defaults?.dosage_mg ? `${defaults.dosage_mg}mg` : "1 tab",
      frequency: defaults?.frequency ? freqSlotToLabel(defaults.frequency) : "Morning and Night",
      duration: defaults?.duration_days ? `${defaults.duration_days} days` : "5 days",
      notes: defaults?.notes ?? "After food",
      // DB persistence fields
      dosage_mg: defaults?.dosage_mg ?? null,
      duration_days: defaults?.duration_days ?? null,
      route: defaults?.route ?? "oral",
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

  // ── Save consult + learning loop ─────────────────────────────────────────────
  const handleConfirmAndSave = async () => {
    if (!visitId) { showToast("No active consult to save"); return; }
    setIsSaving(true);
    try {
      const medicineRows: SaveConsultMedicine[] = prescription.map((m, i) => ({
        medicine_id: m.medicine_id,
        composition_id: m.composition_id,
        dosage_mg: m.dosage_mg ?? null,
        frequency: freqLabelToSlot(m.frequency),  // label → slot string for DB
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
      });

      // Learning loop — fire and forget
      const tagSignature = allSymptoms
        .filter((s) => selectedSymptoms.includes(s.name))
        .map((s) => s.id)
        .sort((a, b) => a - b)
        .join("-");

      runLearningLoop({
        visitId,
        tagSignature,
        selectedCompositionIds: prescription.map((m) => m.composition_id),
        rankedCompositionIds,
      }).catch((e) => console.warn("Learning loop failed (non-fatal):", e));

      setIsReviewOpen(false);
      showToast("Prescription saved ✓");
    } catch (err: any) {
      showToast(`Save failed: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  // ── Derived inspector target ──────────────────────────────────────────────────
  const selectedMedicine = useMemo(
    () => prescription.find((m) => m.id === selectedMedicineId),
    [prescription, selectedMedicineId]
  );

  const inspectorMedicine = stagedMedicine
    ? stagedMedicine
    : selectedMedicineId && !stagedMedicine
      ? selectedMedicine
      : null;

  // ── Loading screen ────────────────────────────────────────────────────────────
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

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="app-shell">
      <PatientHeader
        patient={patient ?? { name: "—", age: "—", gender: "", phone: "" }}
        doctor={DOCTOR}
        vitals={vitals}
        onVitalsChange={setVitals}
        onOpenPatientModal={() => setPatientModalOpen(true)}
        onReviewRx={() => setIsReviewOpen(true)}
        onCancelConsult={resetConsultState}
        pastVisits={pastVisits}
        pastVisitsLoading={pastVisitsLoading}
      />

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
            />
            <FindingsPanel
              findings={allFindings}
              selected={selectedFindings}
              collapsed={findingsCollapsed}
              onToggleCollapsed={() => setFindingsCollapsed((c) => !c)}
              onChange={setSelectedFindings}
            />
          </div>

          <div className="medicine-workspace">
            <MedicineSuggestions
              medicines={rankedMedicines}
              selectedIds={prescription.map((m) => m.id)}
              loading={rankLoading}
              onAdd={handleSuggestionClick}
            />
            <PrescriptionPanel
              medicines={prescription}
              selectedId={selectedMedicineId}
              symptoms={selectedSymptoms}
              findings={selectedFindings}
              onSelect={setSelectedMedicineId}
              onRemove={removeMedicine}
              onCloseEditor={() => setSelectedMedicineId(null)}
            />
          </div>
        </div>

        <PreviewPanel
          patient={patient ?? { name: "—", age: "—", gender: "", phone: "" }}
          vitals={vitals}
          symptoms={selectedSymptoms}
          findings={selectedFindings}
          medicines={prescription}
          tests={selectedTests}
          lab={selectedLab}
          onSave={handleConfirmAndSave}
          testGroups={testGroups}
          selectedTests={selectedTests}
          selectedLab={selectedLab}
          onTestsChange={setSelectedTests}
          onLabChange={setSelectedLab}
          onReviewRx={() => setIsReviewOpen(true)}
        />
      </main>

      {inspectorMedicine && (
        <MedicineInspector
          medicine={inspectorMedicine}
          symptoms={selectedSymptoms}
          findings={selectedFindings}
          isStaging={!!stagedMedicine}
          onUpdate={updateMedicine}
          onConfirmStaged={confirmStagedMedicine}
          onClose={() => { setStagedMedicine(null); setSelectedMedicineId(null); }}
        />
      )}

      {toast && <div className="toast">{toast}</div>}

      {patientModalOpen && (
        <PatientModal
          onClose={() => setPatientModalOpen(false)}
          onConfirm={handlePatientConfirm}
        />
      )}

      {isReviewOpen && patient && (
        <ReviewModal
          patient={patient}
          doctor={{
            name: DOCTOR_NAME,
            specialization: DOCTOR_SPECIALIZATION,
            qualification: null,
            registration_number: null,
          }}
          hospital={null}
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
        />
      )}
    </div>
  );
}

export default App;