import { Plus, Stethoscope, X } from "lucide-react";
import { useState } from "react";
import type { Doctor, Patient } from "../types";
import { ActionButton } from "./ActionButton";

type PastVisit = {
  date: string;
  summary: string;
  diagnosis?: string;
  medicines?: string[];
};

type PatientHeaderProps = {
  patient: Patient;
  doctor: Doctor;
  onOpenPatientModal: () => void;
  onReviewRx: () => void;
  onCancelConsult: () => void;
  pastVisits?: PastVisit[];
};

const mockPastVisits: PastVisit[] = [
  {
    date: "22 Apr",
    summary: "Fever with chills, URI symptoms",
    diagnosis: "Viral URTI",
    medicines: ["Paracetamol 500mg", "Cetirizine 10mg", "Azithromycin 500mg"],
  },
  {
    date: "18 Apr",
    summary: "Follow-up, improving",
    diagnosis: "Resolving URTI",
    medicines: ["Paracetamol 500mg"],
  },
  {
    date: "2 Mar",
    summary: "Stomach pain, loose motions",
    diagnosis: "Acute gastroenteritis",
    medicines: ["ORS", "Metronidazole 400mg", "Domperidone"],
  },
  {
    date: "14 Jan",
    summary: "Routine checkup, BP elevated",
    diagnosis: "Hypertension - Stage 1",
    medicines: ["Amlodipine 5mg"],
  },
  {
    date: "3 Nov",
    summary: "Cough, cold, body ache",
    diagnosis: "Influenza",
    medicines: ["Paracetamol", "Levocetrizine", "Bromhexine syrup"],
  },
];

export function PatientHeader({
  patient,
  doctor,
  onOpenPatientModal,
  onReviewRx,
  onCancelConsult,
  pastVisits = mockPastVisits,
}: PatientHeaderProps) {
  const [cancelArmed, setCancelArmed] = useState(false);
  const [cancelTimer, setCancelTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  const [activeVisit, setActiveVisit] = useState<PastVisit | null>(null);

  const initials = patient.name
    ? patient.name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase()
    : "NP";

  const details = [
    patient.age && `${patient.age}y`,
    patient.gender,
    patient.phone,
  ]
    .filter(Boolean)
    .join(" · ");

  const handleCancelClick = () => {
    if (!cancelArmed) {
      setCancelArmed(true);
      const t = setTimeout(() => setCancelArmed(false), 3000);
      setCancelTimer(t);
    } else {
      if (cancelTimer) clearTimeout(cancelTimer);
      setCancelArmed(false);
      onCancelConsult();
    }
  };

  return (
    <>
      <header className="topbar">

        {/* Brand mark — left column */}
        <div className="brand-mark">
          <div className="logo-pill">AC</div>
          <div>
            <strong>AREN <span>Cortex</span></strong>
            <small>Phase 1 workflow</small>
          </div>
        </div>

        {/* Patient strip — middle column */}
        <section className="patient-card patient-strip" aria-label="Active patient">
          <span className="active-dot" aria-hidden="true" />

          <div className="avatar">{initials}</div>

          <div className="patient-identity">
            <span className="identity-label">Active consult</span>
            <strong>{patient.name || "No patient selected"}</strong>
            <span>{details || "Create or search a patient to begin"}</span>
          </div>

          {pastVisits.length > 0 && (
            <div className="past-visits-rail">
              <span className="past-visits-label">Past</span>
              <div className="past-visits-scroll">
                {pastVisits.map((visit) => (
                  <button
                    key={visit.date}
                    className="visit-chip"
                    type="button"
                    onClick={() => setActiveVisit(visit)}
                    title={visit.summary}
                  >
                    {visit.date}
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Action buttons — right column */}
        <div className="top-actions">
          <ActionButton icon={<Plus size={18} />} onClick={onOpenPatientModal}>
            Patient
          </ActionButton>

          <div className="doctor-pill">
            <Stethoscope size={16} />
            <span>{doctor.name}</span>
          </div>

          <button
            type="button"
            className={`cancel-consult-btn${cancelArmed ? " armed" : ""}`}
            onClick={handleCancelClick}
          >
            {cancelArmed ? "Sure? Click again" : "Cancel"}
          </button>

          <ActionButton variant="primary" onClick={onReviewRx}>
            Review Rx
          </ActionButton>
        </div>

      </header>

      {/* Past visit detail popup */}
      {activeVisit && (
        <div
          className="visit-popup-overlay"
          onClick={() => setActiveVisit(null)}
        >
          <div
            className="visit-popup"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="visit-popup-head">
              <div>
                <span className="visit-popup-date">{activeVisit.date}</span>
                <strong className="visit-popup-diagnosis">
                  {activeVisit.diagnosis}
                </strong>
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={() => setActiveVisit(null)}
              >
                <X size={15} />
              </button>
            </div>

            <p className="visit-popup-summary">{activeVisit.summary}</p>

            {activeVisit.medicines && activeVisit.medicines.length > 0 && (
              <div className="visit-popup-meds">
                <span className="visit-popup-meds-label">
                  Medicines prescribed
                </span>
                <ul>
                  {activeVisit.medicines.map((med) => (
                    <li key={med}>{med}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}