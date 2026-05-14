import { CheckCircle2, Eye, MessageCircle, Printer, Save } from "lucide-react";
import { useState } from "react";
import type { Patient, PrescriptionMedicine, Vitals } from "../types";
import { ActionButton } from "./ActionButton";

type PreviewPanelProps = {
  patient: Patient;
  vitals: Vitals;
  symptoms: string[];
  findings: string[];
  medicines: PrescriptionMedicine[];
  tests: string[];
  lab: string;
  onSave: () => void;
};

export function PreviewPanel({ patient, vitals, symptoms, findings, medicines, tests, lab, onSave }: PreviewPanelProps) {
  const [previewOpen, setPreviewOpen] = useState(false);

  return (
    <aside className="preview-column">
      <section className="panel quick-actions">
        <div className="panel-title compact-title">
          <Eye size={16} />
          <h2>Output</h2>
        </div>
        <div className="action-grid">
          <ActionButton icon={<Printer size={18} />}>Print</ActionButton>
          <ActionButton icon={<MessageCircle size={18} />}>WhatsApp</ActionButton>
          <ActionButton icon={<Save size={18} />} onClick={onSave}>Save</ActionButton>
          <ActionButton variant="primary" icon={<CheckCircle2 size={18} />} onClick={onSave}>Complete</ActionButton>
        </div>
      </section>

      <section className="panel preview-panel">
        <div className="section-head">
          <div className="panel-title">
            <Eye size={18} />
            <h2>Consult Summary</h2>
          </div>
          <button className="selected-count" type="button" onClick={() => setPreviewOpen(true)}>Preview</button>
        </div>

        <div className="summary-metrics">
          <SummaryItem label="Symptoms" value={symptoms.length} />
          <SummaryItem label="Findings" value={findings.length} />
          <SummaryItem label="Medicines" value={medicines.length} />
          <SummaryItem label="Tests" value={tests.length} />
        </div>

        <div className="summary-patient">
          <strong>{patient.name || "New Patient"}</strong>
          <span>{[patient.age && `${patient.age}y`, patient.gender, patient.phone].filter(Boolean).join(" · ") || "Patient details pending"}</span>
        </div>
      </section>

      {previewOpen && (
        <div className="preview-overlay" role="dialog" aria-label="Prescription preview">
          <button className="overlay-backdrop" type="button" onClick={() => setPreviewOpen(false)} aria-label="Close preview" />
          <div className="preview-modal">
            <div className="section-head">
              <div className="panel-title">
                <Eye size={18} />
                <h2>Prescription Preview</h2>
              </div>
              <button className="selected-count" type="button" onClick={() => setPreviewOpen(false)}>Close</button>
            </div>
            <PreviewSheet patient={patient} vitals={vitals} symptoms={symptoms} findings={findings} medicines={medicines} tests={tests} lab={lab} />
          </div>
        </div>
      )}
    </aside>
  );
}

function SummaryItem({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

type PreviewSheetProps = Omit<PreviewPanelProps, "onSave">;

function PreviewSheet({ patient, vitals, symptoms, findings, medicines, tests, lab }: PreviewSheetProps) {
  return (
    <div className="preview-sheet">
      <header>
        <strong>{patient.name || "New Patient"}</strong>
        <span>{[patient.age && `${patient.age}y`, patient.gender, patient.phone].filter(Boolean).join(" · ") || "Patient details pending"}</span>
      </header>

      <PreviewLine label="Vitals" value={`BP ${vitals.bp || "-"}, Pulse ${vitals.pulse || "-"}, Temp ${vitals.temp || "-"}, SpO2 ${vitals.spo2 || "-"}`} />
      <PreviewLine label="Symptoms" value={symptoms.join(", ") || "-"} />
      <PreviewLine label="Findings" value={findings.join(", ") || "-"} />

      <div className="preview-block">
        <strong>Rx</strong>
        {medicines.length ? (
          medicines.map((medicine) => (
            <p key={medicine.id}>{medicine.name} - {medicine.dosage || "dose"} / {medicine.frequency || "frequency"} / {medicine.duration || "duration"}</p>
          ))
        ) : (
          <p>-</p>
        )}
      </div>

      <PreviewLine label="Tests" value={tests.join(", ") || "-"} />
      <PreviewLine label="Preferred lab" value={lab} />
    </div>
  );
}

function PreviewLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="preview-line">
      <strong>{label}</strong>
      <span>{value}</span>
    </div>
  );
}
