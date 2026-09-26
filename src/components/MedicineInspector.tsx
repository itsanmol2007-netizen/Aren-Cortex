import { Check, FlaskConical, Stethoscope, X } from "lucide-react";
import { useEffect } from "react";
import type { PrescriptionMedicine } from "../types";
import { freqLabelToKeys, keysToFreqLabel } from "../lib/db";

type Props = {
  medicine: PrescriptionMedicine;
  symptoms: string[];
  findings: string[];
  isStaging?: boolean;
  onUpdate: (medicine: PrescriptionMedicine) => void;
  onConfirmStaged?: () => void;
  onClose: () => void;
};

// Same four slots MedicineAddSheet's "When" row uses, same words — this is
// the second place a doctor sets a medicine's timing, and it should not
// teach a different notation than the first (docs/aren-modal-design.md).
const SLOTS = [
  { key: "M", label: "Morning" },
  { key: "A", label: "Afternoon" },
  { key: "E", label: "Evening" },
  { key: "N", label: "Night" },
];

export function MedicineInspector({
  medicine, symptoms, findings, isStaging,
  onUpdate, onConfirmStaged, onClose,
}: Props) {
  // Derived from the SAME map the save path uses, so what the buttons show and
  // what the prescription stores cannot disagree (see lib/db/reference.ts).
  const activeSlots = freqLabelToKeys(medicine.frequency);

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
    onUpdate({ ...medicine, frequency: keysToFreqLabel(next) });
  };

  return (
    <div className="cs-addmed" role="dialog" aria-modal="true" aria-label={`Edit ${medicine.name}`}>
      <button className="cs-addmed-scrim" type="button" onClick={onClose} aria-label="Close" />
      <div className="cs-addmed-panel cs-addmed-inspector">
        <div className="cs-addmed-topstripe" />

        <div className="cs-addmed-head">
          <span className="cs-glyph is-teal"><FlaskConical size={16} /></span>
          <div className="cs-addmed-title">
            <span className="cs-addmed-eyebrow">{isStaging ? "Review before adding" : "Medicine Editor"}</span>
            <strong>{medicine.name}</strong>
          </div>
          <button className="cs-addmed-x" type="button" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="cs-addmed-compband">
          <FlaskConical size={12} />
          <span className="cs-addmed-compband-label">Composition</span>
          <span className="cs-addmed-compband-value">{medicine.composition}</span>
          <span className="cs-addmed-tag">{medicine.category}</span>
        </div>

        {(symptoms.length > 0 || findings.length > 0) && (
          <div className="cs-addmed-ctxband">
            <Stethoscope size={12} />
            {symptoms.length > 0 && (
              <div className="cs-addmed-ctx-group">
                <span className="cs-addmed-ctx-label">Symptoms</span>
                <span className="cs-addmed-ctx-chips">
                  {symptoms.map((s) => <span key={s} className="cs-addmed-ctx-chip">{s}</span>)}
                </span>
              </div>
            )}
            {symptoms.length > 0 && findings.length > 0 && <div className="cs-addmed-ctx-sep" />}
            {findings.length > 0 && (
              <div className="cs-addmed-ctx-group">
                <span className="cs-addmed-ctx-label">Findings</span>
                <span className="cs-addmed-ctx-chips">
                  {findings.map((f) => <span key={f} className="cs-addmed-ctx-chip">{f}</span>)}
                </span>
              </div>
            )}
          </div>
        )}

        <div className="cs-addmed-body">
          <div className="cs-addmed-grid">
            <section className="cs-addmed-sec">
              <span className="cs-addmed-label">Dosage</span>
              <input
                className="cs-addmed-input"
                value={medicine.dosage}
                placeholder="e.g. 1 tablet"
                onChange={(e) => onUpdate({ ...medicine, dosage: e.target.value })}
              />
            </section>
            <section className="cs-addmed-sec">
              <span className="cs-addmed-label">Duration</span>
              <input
                className="cs-addmed-input"
                value={medicine.duration}
                placeholder="e.g. 5 days"
                onChange={(e) => onUpdate({ ...medicine, duration: e.target.value })}
              />
            </section>
          </div>

          <section className="cs-addmed-sec">
            <span className="cs-addmed-label">Frequency</span>
            <div className="cs-addmed-circles" role="group" aria-label="Dose timing">
              {SLOTS.map((slot) => {
                const on = activeSlots.includes(slot.key);
                return (
                  <button
                    key={slot.key}
                    type="button"
                    className={`cs-addmed-circle${on ? " is-on" : ""}`}
                    aria-pressed={on}
                    title={slot.label}
                    onClick={() => toggleSlot(slot.key)}
                  >
                    <span className="cs-addmed-circle-mark" aria-hidden="true" />
                    <span className="cs-addmed-circle-label">{slot.label}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="cs-addmed-sec">
            <span className="cs-addmed-label">Notes</span>
            <textarea
              className="cs-addmed-input cs-addmed-textarea"
              value={medicine.notes}
              placeholder="After food, avoid driving..."
              rows={2}
              onChange={(e) => onUpdate({ ...medicine, notes: e.target.value })}
            />
          </section>
        </div>

        <div className="cs-addmed-foot">
          <button className="cs-addmed-cancel" type="button" onClick={onClose}>
            Cancel
          </button>
          {isStaging ? (
            <button className="cs-addmed-confirm" type="button" onClick={onConfirmStaged}>
              <Check size={15} />
              Add to Prescription
            </button>
          ) : (
            <button className="cs-addmed-confirm" type="button" onClick={onClose}>
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
