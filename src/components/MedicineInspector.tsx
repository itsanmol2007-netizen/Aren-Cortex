import { SlidersHorizontal } from "lucide-react";
import type { PrescriptionMedicine } from "../types";

type MedicineInspectorProps = {
  medicine: PrescriptionMedicine | undefined;
  onUpdate: (medicine: PrescriptionMedicine) => void;
};

export function MedicineInspector({ medicine, onUpdate }: MedicineInspectorProps) {
  if (!medicine) {
    return (
      <section className="panel inspector-panel muted-panel">
        <div className="panel-title">
          <SlidersHorizontal size={18} />
          <h2>Medicine Inspector</h2>
        </div>
        <div className="empty-inspector">Select a prescription row to edit dosage, frequency, duration, and notes.</div>
      </section>
    );
  }

  return (
    <section className="panel inspector-panel">
      <div className="section-head">
        <div className="panel-title">
          <SlidersHorizontal size={18} />
          <h2>Medicine Inspector</h2>
        </div>
        <span className="microcopy">Separate editor</span>
      </div>
      <h3>{medicine.name}</h3>
      <div className="inspector-grid">
        <label>
          <span>Dosage</span>
          <input value={medicine.dosage} placeholder="1 tab" onChange={(event) => onUpdate({ ...medicine, dosage: event.target.value })} />
        </label>
        <label>
          <span>Frequency</span>
          <input value={medicine.frequency} placeholder="BD / TDS" onChange={(event) => onUpdate({ ...medicine, frequency: event.target.value })} />
        </label>
        <label>
          <span>Duration</span>
          <input value={medicine.duration} placeholder="5 days" onChange={(event) => onUpdate({ ...medicine, duration: event.target.value })} />
        </label>
        <label className="full-field">
          <span>Notes</span>
          <textarea value={medicine.notes} placeholder="After food, avoid driving..." onChange={(event) => onUpdate({ ...medicine, notes: event.target.value })} />
        </label>
      </div>
    </section>
  );
}
