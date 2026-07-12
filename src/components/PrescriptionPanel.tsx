import { GripVertical, Pill, Plus, Trash2 } from "lucide-react";
import type { PrescriptionMedicine } from "../types";

type PrescriptionPanelProps = {
  medicines: PrescriptionMedicine[];
  selectedId: string | null;
  symptoms: string[];
  findings: string[];
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onCloseEditor: () => void;
};

export function PrescriptionPanel({
  medicines,
  selectedId,
  symptoms,
  findings,
  onSelect,
  onRemove,
  onCloseEditor,
}: PrescriptionPanelProps) {
  return (
    <section className="panel prescription-panel">
      <div className="section-head">
        <div className="panel-title rx-title">
          <Pill size={18} />
          <h2>Prescription</h2>
        </div>
        <span className="selected-count">{medicines.length} medicines</span>
      </div>

      {medicines.length === 0 ? (
        <div className="empty-prescription">
          <div className="rx-empty-icon">Rx</div>
          <strong>Prescription is empty</strong>
          <span>Add medicines from suggestions or search manually</span>
        </div>
      ) : (
        <div className="prescription-list" aria-label="Selected medicines">
          {medicines.map((medicine) => (
            <div
              className={`prescription-row ${selectedId === medicine.id ? "selected" : ""}`}
              key={medicine.id}
            >
              <button
                type="button"
                className="medicine-select"
                onClick={() =>
                  selectedId === medicine.id ? onCloseEditor() : onSelect(medicine.id)
                }
              >
                <GripVertical size={16} />
                <span>
                  <strong>{medicine.name}</strong>
                  <small>
                    {medicine.dosage || "Dose"} · {medicine.frequency || "Frequency"} · {medicine.duration || "Duration"}
                  </small>
                </span>
              </button>
              <button
                className="icon-button danger-icon"
                type="button"
                onClick={() => onRemove(medicine.id)}
                aria-label={`Remove ${medicine.name}`}
              >
                <Trash2 size={17} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="shortcut-strip">
        <span><kbd>Enter</kbd> Add medicine</span>
        <span><kbd>Click</kbd> Edit dose</span>
        <span><kbd>Del</kbd> Remove</span>
        <span><Plus size={13} /> Stable rows</span>
      </div>
    </section>
  );
}