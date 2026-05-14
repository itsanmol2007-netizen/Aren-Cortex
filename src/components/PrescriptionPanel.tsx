import { GripVertical, Pill, Plus, Trash2, X } from "lucide-react";
import type { PrescriptionMedicine } from "../types";

type PrescriptionPanelProps = {
  medicines: PrescriptionMedicine[];
  selectedId: string | null;
  selectedMedicine: PrescriptionMedicine | undefined;
  symptoms: string[];
  findings: string[];
  onSelect: (id: string) => void;
  onUpdate: (medicine: PrescriptionMedicine) => void;
  onRemove: (id: string) => void;
  onCloseEditor: () => void;
};

const frequencySlots = [
  { key: "M", label: "Morning" },
  { key: "A", label: "Afternoon" },
  { key: "E", label: "Evening" },
  { key: "N", label: "Night" },
];

function frequencyToSlots(frequency: string) {
  const normalized = frequency.toUpperCase();
  if (normalized.includes("TDS")) {
    return ["M", "A", "N"];
  }
  if (normalized.includes("BD")) {
    return ["M", "N"];
  }
  if (normalized.includes("HS")) {
    return ["N"];
  }
  if (normalized.includes("OD")) {
    return ["M"];
  }

  return frequencySlots.map((slot) => slot.key).filter((slot) => normalized.includes(slot));
}

function slotsToFrequency(slots: string[]) {
  if (slots.length === 0) {
    return "SOS";
  }

  return slots.join("-");
}

export function PrescriptionPanel({
  medicines,
  selectedId,
  selectedMedicine,
  symptoms,
  findings,
  onSelect,
  onUpdate,
  onRemove,
  onCloseEditor,
}: PrescriptionPanelProps) {
  const activeFrequencySlots = selectedMedicine ? frequencyToSlots(selectedMedicine.frequency) : [];

  const toggleFrequencySlot = (slot: string) => {
    if (!selectedMedicine) {
      return;
    }

    const nextSlots = activeFrequencySlots.includes(slot)
      ? activeFrequencySlots.filter((activeSlot) => activeSlot !== slot)
      : [...activeFrequencySlots, slot];

    onUpdate({ ...selectedMedicine, frequency: slotsToFrequency(nextSlots) });
  };

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
            <div className={`prescription-row ${selectedId === medicine.id ? "selected" : ""}`} key={medicine.id}>
              <button type="button" className="medicine-select" onClick={() => onSelect(medicine.id)}>
                <GripVertical size={16} />
                <span>
                  <strong>{medicine.name}</strong>
                  <small>{medicine.dosage || "Dose"} · {medicine.frequency || "Frequency"} · {medicine.duration || "Duration"}</small>
                </span>
              </button>
              <button className="icon-button danger-icon" type="button" onClick={() => onRemove(medicine.id)} aria-label={`Remove ${medicine.name}`}>
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

      {selectedMedicine && (
        <div className="medicine-modal-layer" role="dialog" aria-label={`Edit ${selectedMedicine.name}`}>
          <button className="overlay-backdrop" type="button" onClick={onCloseEditor} aria-label="Close medicine editor" />
          <section className="medicine-modal">
            <div className="modal-head">
              <div>
                <span>Medicine editor</span>
                <strong>{selectedMedicine.name}</strong>
              </div>
              <button className="icon-button" type="button" onClick={onCloseEditor} aria-label="Close medicine editor">
                <X size={16} />
              </button>
            </div>

            <div className="context-band">
              <ContextGroup label="Symptoms" items={symptoms} />
              <ContextGroup label="Findings" items={findings} />
            </div>

            <div className="medicine-modal-grid">
              <label>
                <span>Dosage</span>
                <input value={selectedMedicine.dosage} placeholder="1 tab" onChange={(event) => onUpdate({ ...selectedMedicine, dosage: event.target.value })} />
              </label>
              <label>
                <span>Duration</span>
                <input value={selectedMedicine.duration} placeholder="5 days" onChange={(event) => onUpdate({ ...selectedMedicine, duration: event.target.value })} />
              </label>
            </div>

            <div className="frequency-editor">
              <span>Frequency</span>
              <div>
                {frequencySlots.map((slot) => (
                  <button
                    className={activeFrequencySlots.includes(slot.key) ? "active" : ""}
                    key={slot.key}
                    type="button"
                    onClick={() => toggleFrequencySlot(slot.key)}
                    aria-label={slot.label}
                  >
                    {slot.key}
                  </button>
                ))}
              </div>
              <small>{selectedMedicine.frequency || "Select timing circles"}</small>
            </div>

            <label>
              <span>Notes</span>
              <textarea value={selectedMedicine.notes} placeholder="After food, warning, substitution..." onChange={(event) => onUpdate({ ...selectedMedicine, notes: event.target.value })} />
            </label>

            <div className="modal-actions">
              <button type="button" onClick={onCloseEditor}>Done</button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}

function ContextGroup({ label, items }: { label: string; items: string[] }) {
  return (
    <div>
      <strong>{label}</strong>
      <p>{items.length ? items.slice(0, 5).join(", ") : "None selected"}</p>
    </div>
  );
}
