import { ClipboardCheck, HeartPulse } from "lucide-react";
import { useMemo, useState } from "react";
import { doctors, existingPatients, findings as findingOptions, medicines, symptoms as symptomOptions, tests as testOptions } from "./data/mockData";
import { ChipSearchPanel } from "./components/ChipSearchPanel";
import { MedicineSuggestions } from "./components/MedicineSuggestions";
import { PatientHeader } from "./components/PatientHeader";
import { PatientModal } from "./components/PatientModal";
import { PrescriptionPanel } from "./components/PrescriptionPanel";
import { PreviewPanel } from "./components/PreviewPanel";
import { TestsPanel } from "./components/TestsPanel";
import { VitalsStrip } from "./components/VitalsStrip";
import type { Medicine, Patient, PrescriptionMedicine, Vitals } from "./types";

const initialPatient: Patient = {
  name: "Anmol Pandey",
  age: "18",
  gender: "Male",
  phone: "9876543210",
};

const initialVitals: Vitals = {
  bp: "120/80",
  pulse: "72",
  temp: "98.6",
  spo2: "98",
  weight: "65",
};

const initialPrescription: PrescriptionMedicine[] = medicines.slice(0, 6).map((medicine, index) => ({
  ...medicine,
  dosage: index === 0 ? "1 tab" : "1",
  frequency: ["BD", "TDS", "OD", "HS", "SOS", "BD"][index] ?? "BD",
  duration: ["5 days", "3 days", "7 days", "5 days", "2 days", "10 days"][index] ?? "5 days",
  notes: index % 2 === 0 ? "After food" : "",
}));

function App() {
  const [patient, setPatient] = useState(initialPatient);
  const [vitals, setVitals] = useState(initialVitals);
  const [selectedSymptoms, setSelectedSymptoms] = useState(["Bacterial Infection", "Parasitic Infection"]);
  const [selectedFindings, setSelectedFindings] = useState(["Abdomen tenderness", "Dehydration signs"]);
  const [findingsCollapsed, setFindingsCollapsed] = useState(false);
  const [prescription, setPrescription] = useState<PrescriptionMedicine[]>(initialPrescription);
  const [selectedMedicineId, setSelectedMedicineId] = useState<string | null>(null);
  const [selectedTests, setSelectedTests] = useState<string[]>([]);
  const [selectedLab, setSelectedLab] = useState("No preferred lab");
  const [toast, setToast] = useState("");
  const [patientModalOpen, setPatientModalOpen] = useState(false);

  const selectedMedicine = useMemo(
    () => prescription.find((medicine) => medicine.id === selectedMedicineId),
    [prescription, selectedMedicineId],
  );

  const saveDraft = () => {
    setToast("Consult saved locally for prototype review");
    window.setTimeout(() => setToast(""), 2200);
  };

  const resetConsultForPatient = (nextPatient: Patient) => {
    setPatient(nextPatient);
    setVitals({ bp: "", pulse: "", temp: "", spo2: "", weight: "" });
    setSelectedSymptoms([]);
    setSelectedFindings([]);
    setPrescription([]);
    setSelectedMedicineId(null);
    setSelectedTests([]);
    setSelectedLab("No preferred lab");
    setPatientModalOpen(false);
    setToast(`Consult started for ${nextPatient.name || "new patient"}`);
    window.setTimeout(() => setToast(""), 1800);
  };

  const addMedicine = (medicine: Medicine) => {
    if (prescription.some((item) => item.id === medicine.id)) {
      setSelectedMedicineId(medicine.id);
      return;
    }

    const nextMedicine: PrescriptionMedicine = {
      ...medicine,
      dosage: "1 tab",
      frequency: "BD",
      duration: "5 days",
      notes: "After food",
    };

    setPrescription((current) => [...current, nextMedicine]);
    setSelectedMedicineId(medicine.id);
  };

  const updateMedicine = (updatedMedicine: PrescriptionMedicine) => {
    setPrescription((current) => current.map((medicine) => (medicine.id === updatedMedicine.id ? updatedMedicine : medicine)));
  };

  const removeMedicine = (id: string) => {
    setPrescription((current) => current.filter((medicine) => medicine.id !== id));
    if (selectedMedicineId === id) {
      setSelectedMedicineId(null);
    }
  };

  return (
    <div className="app-shell">
      <PatientHeader
        patient={patient}
        doctor={doctors[0]}
        vitals={vitals}
        onVitalsChange={setVitals}
        onOpenPatientModal={() => setPatientModalOpen(true)}
        onReviewRx={() => setToast("Preview modal coming in Step 5")}
        onCancelConsult={resetConsultForPatient.bind(null, initialPatient)}
      />

      <main className="workflow">
        <div className="main-column">

          <div className="two-column-row">
            <ChipSearchPanel
              title="Symptoms"
              tone="blue"
              icon={<HeartPulse size={18} />}
              items={symptomOptions}
              selected={selectedSymptoms}
              onChange={setSelectedSymptoms}
            />
            <ChipSearchPanel
              title="Findings"
              tone="pink"
              icon={<ClipboardCheck size={18} />}
              items={findingOptions}
              selected={selectedFindings}
              collapsed={findingsCollapsed}
              onToggleCollapsed={() => setFindingsCollapsed((current) => !current)}
              onChange={setSelectedFindings}
            />
          </div>

          <div className="medicine-workspace">
            <MedicineSuggestions medicines={medicines} selectedIds={prescription.map((medicine) => medicine.id)} onAdd={addMedicine} />
            <PrescriptionPanel
              medicines={prescription}
              selectedId={selectedMedicineId}
              selectedMedicine={selectedMedicine}
              symptoms={selectedSymptoms}
              findings={selectedFindings}
              onSelect={setSelectedMedicineId}
              onUpdate={updateMedicine}
              onRemove={removeMedicine}
              onCloseEditor={() => setSelectedMedicineId(null)}
            />
          </div>

          <TestsPanel tests={testOptions} selectedTests={selectedTests} selectedLab={selectedLab} onTestsChange={setSelectedTests} onLabChange={setSelectedLab} />
        </div>

        <PreviewPanel
          patient={patient}
          vitals={vitals}
          symptoms={selectedSymptoms}
          findings={selectedFindings}
          medicines={prescription}
          tests={selectedTests}
          lab={selectedLab}
          onSave={saveDraft}
        />
      </main>

      {toast && <div className="toast">{toast}</div>}
      {patientModalOpen && <PatientModal patients={existingPatients} onClose={() => setPatientModalOpen(false)} onConfirm={resetConsultForPatient} />}
    </div>
  );
}

export default App;
