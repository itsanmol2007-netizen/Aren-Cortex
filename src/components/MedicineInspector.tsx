import { FlaskConical, Stethoscope, X } from "lucide-react";
import { useEffect } from "react";
import type { PrescriptionMedicine } from "../types";

type Props = {
  medicine: PrescriptionMedicine;
  symptoms: string[];
  findings: string[];
  isStaging?: boolean;
  onUpdate: (medicine: PrescriptionMedicine) => void;
  onConfirmStaged?: () => void;
  onClose: () => void;
};

const SLOTS = [
  { key: "M", label: "Morn" },
  { key: "A", label: "Noon" },
  { key: "E", label: "Eve" },
  { key: "N", label: "Night" },
];

function toSlots(frequency: string): string[] {
  const v = frequency.toUpperCase();
  if (v.includes("FOUR TIMES")) return ["M", "A", "E", "N"];
  if (v.includes("THREE TIMES")) return ["M", "A", "N"];
  if (v.includes("TWICE")) return ["M", "N"];
  if (v.includes("BEDTIME")) return ["N"];
  if (v.includes("ONCE DAILY (MORNING)")) return ["M"];
  if (v.includes("ONCE DAILY (AFTERNOON)")) return ["A"];
  if (v.includes("ONCE DAILY (EVENING)")) return ["E"];
  if (v.includes("TDS")) return ["M", "A", "N"];
  if (v.includes("BD")) return ["M", "N"];
  if (v.includes("HS")) return ["N"];
  if (v.includes("OD")) return ["M"];
  return ["M", "A", "E", "N"].filter((k) => v.includes(k));
}

function fromSlots(slots: string[]): string {
  const sorted = ["M", "A", "E", "N"].filter((k) => slots.includes(k));
  if (sorted.length === 0) return "SOS";
  if (sorted.length === 4) return "Four times a day";
  if (sorted.length === 3) return "Three times a day";
  if (sorted.includes("M") && sorted.includes("N") && sorted.length === 2) return "Twice a day";
  if (sorted.length === 2) return "Twice a day";
  if (sorted[0] === "N") return "At bedtime";
  if (sorted[0] === "M") return "Once daily (Morning)";
  if (sorted[0] === "A") return "Once daily (Afternoon)";
  if (sorted[0] === "E") return "Once daily (Evening)";
  return sorted.join("-");
}

export function MedicineInspector({
  medicine, symptoms, findings, isStaging,
  onUpdate, onConfirmStaged, onClose,
}: Props) {
  const activeSlots = toSlots(medicine.frequency);

  // Escape closes the inspector
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
      // Enter on staging confirms and adds
      if (e.key === "Enter" && isStaging && onConfirmStaged) {
        const tag = (e.target as HTMLElement).tagName;
        // Don't intercept Enter inside textarea or slot buttons
        if (tag === "TEXTAREA" || tag === "BUTTON") return;
        e.preventDefault();
        onConfirmStaged();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, isStaging, onConfirmStaged]);

  const toggleSlot = (key: string) => {
    const next = activeSlots.includes(key)
      ? activeSlots.filter((s) => s !== key)
      : [...activeSlots, key];
    onUpdate({ ...medicine, frequency: fromSlots(next) });
  };

  return (
    <div className="mi-overlay" role="dialog" aria-modal="true" aria-label={`Edit ${medicine.name}`}>
      <button className="mi-backdrop" type="button" onClick={onClose} aria-label="Close" />
      <div className="mi-card">
        <div className="mi-stripe" />

        <div className="mi-header">
          <div className="mi-header-left">
            <div className="mi-header-icon"><FlaskConical size={15} /></div>
            <div>
              <p className="mi-eyebrow">{isStaging ? "Review before adding" : "Medicine Editor"}</p>
              <h3 className="mi-name">{medicine.name}</h3>
            </div>
          </div>
          <button className="mi-close" type="button" onClick={onClose} aria-label="Close">
            <X size={15} />
          </button>
        </div>

        <div className="mi-composition-band">
          <FlaskConical size={12} />
          <span className="mi-composition-label">Composition</span>
          <span className="mi-composition-value">{medicine.composition}</span>
          <span className="mi-category-pill">{medicine.category}</span>
        </div>

        {(symptoms.length > 0 || findings.length > 0) && (
          <div className="mi-context-band">
            <Stethoscope size={12} />
            {symptoms.length > 0 && (
              <div className="mi-context-group">
                <span className="mi-context-label">Symptoms</span>
                <span className="mi-context-chips">
                  {symptoms.map((s) => <span key={s} className="mi-context-chip">{s}</span>)}
                </span>
              </div>
            )}
            {symptoms.length > 0 && findings.length > 0 && <div className="mi-context-sep" />}
            {findings.length > 0 && (
              <div className="mi-context-group">
                <span className="mi-context-label">Findings</span>
                <span className="mi-context-chips">
                  {findings.map((f) => <span key={f} className="mi-context-chip">{f}</span>)}
                </span>
              </div>
            )}
          </div>
        )}

        <div className="mi-form">
          <div className="mi-row-two">
            <div className="mi-field">
              <label className="mi-label">Dosage</label>
              <input
                className="mi-input"
                value={medicine.dosage}
                placeholder="e.g. 1 tablet"
                onChange={(e) => onUpdate({ ...medicine, dosage: e.target.value })}
              />
            </div>
            <div className="mi-field">
              <label className="mi-label">Duration</label>
              <input
                className="mi-input"
                value={medicine.duration}
                placeholder="e.g. 5 days"
                onChange={(e) => onUpdate({ ...medicine, duration: e.target.value })}
              />
            </div>
          </div>

          <div className="mi-field">
            <label className="mi-label">Frequency</label>
            <div className="mi-slot-row">
              {SLOTS.map((slot) => {
                const on = activeSlots.includes(slot.key);
                return (
                  <button
                    key={slot.key}
                    type="button"
                    aria-label={slot.label}
                    aria-pressed={on}
                    onClick={() => toggleSlot(slot.key)}
                    className={`mi-slot-btn ${on ? "mi-slot-on" : ""}`}
                  >
                    <span className="mi-slot-key">{slot.key}</span>
                    <span className="mi-slot-label">{slot.label}</span>
                  </button>
                );
              })}
              <span className="mi-freq-display">{medicine.frequency || "Select timing"}</span>
            </div>
          </div>

          <div className="mi-field">
            <label className="mi-label">Notes</label>
            <textarea
              className="mi-input mi-textarea"
              value={medicine.notes}
              placeholder="After food, avoid driving..."
              rows={2}
              onChange={(e) => onUpdate({ ...medicine, notes: e.target.value })}
            />
          </div>
        </div>

        <div className="mi-footer">
          <button className="mi-btn-ghost" type="button" onClick={onClose}>
            Cancel
          </button>
          {isStaging ? (
            <button className="mi-btn-primary" type="button" onClick={onConfirmStaged}>
              Add to Prescription →
            </button>
          ) : (
            <button className="mi-btn-primary" type="button" onClick={onClose}>
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
}