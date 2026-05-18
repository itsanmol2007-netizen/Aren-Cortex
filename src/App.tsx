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
import {
  DOCTOR_ID, DOCTOR_NAME, DOCTOR_SPECIALIZATION,
  fetchSymptoms, fetchFindings,
  createPatient, findPatientByPhone, createVisit,
  replaceVisitSymptoms, replaceVisitFindings,
  rankMedicines, saveConsult,
  type DBSymptom, type DBFinding, type RankedMedicine,
} from "./lib/db";
import type { Medicine, Patient, PrescriptionMedicine, Vitals } from "./types";

const DOCTOR = { id: DOCTOR_ID, name: DOCTOR_NAME, specialty: DOCTOR_SPECIALIZATION };
const emptyVitals: Vitals = { bp: "", pulse: "", temp: "", spo2: "", weight: "" };

// Convert DB ranked result → UI Medicine shape
function toUIMedicine(r: RankedMedicine, maxScore: number): Medicine & { _dosageDefaults: RankedMedicine["dosage_defaults"] } {
  return {
    id: String(r.medicine_id),
    medicine_id: r.medicine_id,
    composition_id: r.primary_composition_id,
    name: r.medicine_name,
    category: r.composition_names,
    use: "",
    match: maxScore > 0 ? Math.round((r.score / maxScore) * 100) : 50,
    composition: r.composition_names,
    _dosageDefaults: r.dosage_defaults,
  };
}

// Convert timesPerDay → frequency string for MedicineInspector slot system
function timesPerDayToFreq(n: number): string {
  if (n >= 4) return "Four times a day";
  if (n === 3) return "Three times a day";
  if (n === 2) return "Twice a day";
  return "Once daily (Morning)";
}

function App() {
  const [allSymptoms, setAllSymptoms] = useState<DBSymptom[]>([]);
  const [allFindings, setAllFindings] = useState<DBFinding[]>([]);
  const [dbReady, setDbReady] = useState(false);

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

  const [rankedMedicines, setRankedMedicines] = useState<Medicine[]>([]);
  const [rankLoading, setRankLoading] = useState(false);

  // Medicine being staged (clicked from suggestions, not yet in prescription)
  const [stagedMedicine, setStagedMedicine] = useState<PrescriptionMedicine | null>(null);

  const [toast, setToast] = useState("");
  const [patientModalOpen, setPatientModalOpen] = useState(false);

  const rankTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // Load symptoms + findings from DB on mount
  useEffect(() => {
    Promise.all([fetchSymptoms(), fetchFindings()])
      .then(([symptoms, findings]) => {
        setAllSymptoms(symptoms);
        setAllFindings(findings);
        setDbReady(true);
      })
      .catch((err) => showToast(`DB load failed: ${err.message}`));
  }, []);

  // Re-rank on symptom/finding change (300ms debounce)
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
        return;
      }

      setRankLoading(true);
      try {
        const results = await rankMedicines({ symptoms: symptomPayload, findingIds: findingPayload });
        const maxScore = results[0]?.score ?? 1;
        setRankedMedicines(results.map((r) => toUIMedicine(r, maxScore)));
      } catch (err: any) {
        showToast(`Ranking failed: ${err.message}`);
      } finally {
        setRankLoading(false);
      }
    }, 300);

    return () => { if (rankTimer.current) clearTimeout(rankTimer.current); };
  }, [selectedSymptoms, selectedFindings, visitId, symptomNameToId, findingNameToId]);

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(""), 2400);
  };

  const handlePatientConfirm = useCallback(async (incoming: Patient) => {
    try {
      let dbPatient: Patient;
      if (incoming.id) {
        dbPatient = incoming;
      } else {
        const existing = await findPatientByPhone(incoming.phone);
        if (existing) {
          dbPatient = { ...existing, age: String(existing.age), gender: existing.gender as Patient["gender"] };
        } else {
          const created = await createPatient({
            name: incoming.name,
            age: Number(incoming.age),
            gender: incoming.gender,
            phone: incoming.phone,
          });
          dbPatient = { ...created, age: String(created.age), gender: created.gender as Patient["gender"] };
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
      setPatientModalOpen(false);
      showToast(`Consult started for ${dbPatient.name}`);
    } catch (err: any) {
      showToast(`Error: ${err.message}`);
    }
  }, []);

  // Click on suggestion → open inspector in "staging" mode, not yet in prescription
  const handleSuggestionClick = (medicine: Medicine) => {
    if (prescription.some((m) => m.id === medicine.id)) {
      setSelectedMedicineId(medicine.id);
      return;
    }
    const defaults = (medicine as any)._dosageDefaults;
    const staged: PrescriptionMedicine = {
      ...medicine,
      dosage: defaults?.dosage_mg ? `${defaults.dosage_mg}mg` : "1 tab",
      frequency: defaults?.timesPerDay ? timesPerDayToFreq(defaults.timesPerDay) : "Twice a day",
      duration: defaults?.duration_days ? `${defaults.duration_days} days` : "5 days",
      notes: defaults?.notes ?? "After food",
    };
    setStagedMedicine(staged);
  };

  // Confirm from inspector when in staging mode → add to prescription
  const confirmStagedMedicine = () => {
    if (!stagedMedicine) return;
    setPrescription((curr) => [...curr, stagedMedicine]);
    setStagedMedicine(null);
    setSelectedMedicineId(null); // ensure inspector closes fully
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

  const saveDraft = async () => {
    if (!visitId) { showToast("No active consult to save"); return; }
    try {
      await saveConsult({
        visitId,
        medicines: prescription.map((m) => ({
          medicine_id: m.medicine_id,
          composition_id: m.composition_id,
          dosage: m.dosage,
          frequency: m.frequency,
          duration: m.duration,
          notes: m.notes,
        })),
        tests: selectedTests,
        vitals,
        findingsText: selectedFindings.join(", "),
      });
      showToast("Consult saved");
    } catch (err: any) {
      showToast(`Save failed: ${err.message}`);
    }
  };

  const selectedMedicine = useMemo(
    () => prescription.find((m) => m.id === selectedMedicineId),
    [prescription, selectedMedicineId]
  );

  // Inspector shows either staged medicine or selected prescription medicine
  const inspectorMedicine = stagedMedicine
    ? stagedMedicine
    : selectedMedicineId && !stagedMedicine
      ? selectedMedicine
      : null;

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

  return (
    <div className="app-shell">
      <PatientHeader
        patient={patient ?? { name: "—", age: "—", gender: "", phone: "" }}
        doctor={DOCTOR}
        vitals={vitals}
        onVitalsChange={setVitals}
        onOpenPatientModal={() => setPatientModalOpen(true)}
        onReviewRx={() => showToast("Review modal coming in Step 5")}
        onCancelConsult={() => {
          setPatient(null); setVisitId(null); setVitals(emptyVitals);
          setSelectedSymptoms([]); setSelectedFindings([]);
          setPrescription([]); setRankedMedicines([]); setSelectedTests([]);
        }}
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
          onSave={saveDraft}
          testGroups={testGroups}
          selectedTests={selectedTests}
          selectedLab={selectedLab}
          onTestsChange={setSelectedTests}
          onLabChange={setSelectedLab}
          onReviewRx={() => showToast("Review modal coming in Step 5")}
        />
      </main>

      {/* Inspector — staged (pre-add) or editing existing */}
      {inspectorMedicine && (
        <MedicineInspector
          medicine={inspectorMedicine}
          symptoms={selectedSymptoms}
          findings={selectedFindings}
          isStaging={!!stagedMedicine}
          onUpdate={updateMedicine}
          onConfirmStaged={confirmStagedMedicine}
          onClose={() => {
            setStagedMedicine(null);
            setSelectedMedicineId(null);
          }}
        />
      )}

      {toast && <div className="toast">{toast}</div>}

      {patientModalOpen && (
        <PatientModal
          patients={[]}
          onClose={() => setPatientModalOpen(false)}
          onConfirm={handlePatientConfirm}
        />
      )}
    </div>
  );
}

export default App;