import { Plus, Stethoscope, X, Pill, Calendar } from "lucide-react";
import { useState } from "react";
import logo from "../assets/aren-logo.png";
import type { Doctor, Patient, Vitals } from "../types";
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
  vitals: Vitals;
  onVitalsChange: (v: Vitals) => void;
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

const VITAL_FIELDS: {
  key: keyof Vitals;
  label: string;
  placeholder: string;
  warn?: (v: string) => boolean;
}[] = [
    {
      key: "bp",
      label: "BP",
      placeholder: "120/80",
      warn: (v) => {
        const sys = parseInt(v.split("/")[0]);
        return !isNaN(sys) && (sys > 140 || sys < 90);
      },
    },
    {
      key: "pulse",
      label: "Pulse",
      placeholder: "72",
      warn: (v) => {
        const n = parseInt(v);
        return !isNaN(n) && (n > 100 || n < 50);
      },
    },
    {
      key: "temp",
      label: "Temp",
      placeholder: "98.6",
      warn: (v) => {
        const n = parseFloat(v);
        return !isNaN(n) && (n > 99.5 || n < 96);
      },
    },
    {
      key: "spo2",
      label: "SpO₂",
      placeholder: "98",
      warn: (v) => {
        const n = parseInt(v);
        return !isNaN(n) && n < 95;
      },
    },
    {
      key: "weight",
      label: "Wt",
      placeholder: "65 kg",
    },
  ];

export function PatientHeader({
  patient,
  doctor,
  vitals,
  onVitalsChange,
  onOpenPatientModal,
  onReviewRx,
  onCancelConsult,
  pastVisits = mockPastVisits,
}: PatientHeaderProps) {
  const [cancelArmed, setCancelArmed] = useState(false);
  const [cancelTimer, setCancelTimer] =
    useState<ReturnType<typeof setTimeout> | null>(null);
  const [activeVisit, setActiveVisit] = useState<PastVisit | null>(null);

  const initials = patient.name
    ? patient.name
      .split(" ")
      .map((p) => p[0])
      .join("")
      .slice(0, 2)
      .toUpperCase()
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
      {/* ── Unified topbar ───────────────────────────────── */}
      <header className="topbar-unified">

        {/* Accent stripe */}
        <div className="topbar-stripe" aria-hidden="true" />

        {/* Atmospheric SVG — waveforms + neuron mesh */}
        <svg
          className="topbar-atmo"
          aria-hidden="true"
          preserveAspectRatio="none"
          viewBox="0 0 1400 72"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <radialGradient id="orb-pink" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#f472b6" stopOpacity="0.18" />
              <stop offset="100%" stopColor="#f472b6" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="orb-violet" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#a855f7" stopOpacity="0.15" />
              <stop offset="100%" stopColor="#a855f7" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="orb-indigo" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#6366f1" stopOpacity="0.13" />
              <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* Mesh orbs */}
          <ellipse cx="240" cy="-10" rx="180" ry="80" fill="url(#orb-pink)" />
          <ellipse cx="520" cy="90" rx="220" ry="90" fill="url(#orb-violet)" />
          <ellipse cx="1100" cy="20" rx="200" ry="70" fill="url(#orb-indigo)" />
          <ellipse cx="1360" cy="80" rx="160" ry="70" fill="url(#orb-pink)" />

          {/* Wave ribbon 1 — pink tint, slow */}
          <path
            d="M0,52 C120,38 240,62 400,48 C560,34 680,58 840,44 C1000,30 1140,56 1280,42 C1340,36 1380,40 1400,38 L1400,72 L0,72 Z"
            fill="rgba(244,114,182,0.04)"
          />
          {/* Wave ribbon 2 — violet */}
          <path
            d="M0,58 C100,44 220,66 380,54 C540,42 660,64 820,52 C980,40 1100,62 1260,50 C1340,44 1380,48 1400,46 L1400,72 L0,72 Z"
            fill="rgba(168,85,247,0.045)"
          />
          {/* Wave ribbon 3 — indigo */}
          <path
            d="M0,63 C80,51 200,68 360,58 C520,48 640,67 800,57 C960,47 1080,64 1240,55 C1330,49 1370,53 1400,51 L1400,72 L0,72 Z"
            fill="rgba(99,102,241,0.035)"
          />

          {/* Neuron network — right side of patient identity zone */}
          {/* Nodes */}
          <circle cx="330" cy="18" r="1.8" fill="rgba(168,85,247,0.5)" />
          <circle cx="354" cy="36" r="1.4" fill="rgba(168,85,247,0.35)" />
          <circle cx="312" cy="52" r="1.6" fill="rgba(99,102,241,0.4)" />
          <circle cx="372" cy="22" r="1.2" fill="rgba(244,114,182,0.4)" />
          <circle cx="344" cy="58" r="1.0" fill="rgba(168,85,247,0.3)" />
          <circle cx="388" cy="44" r="1.5" fill="rgba(99,102,241,0.35)" />
          <circle cx="320" cy="34" r="1.0" fill="rgba(244,114,182,0.3)" />
          {/* Axon lines connecting nodes */}
          <line x1="330" y1="18" x2="354" y2="36" stroke="rgba(168,85,247,0.18)" strokeWidth="0.8" />
          <line x1="354" y1="36" x2="312" y2="52" stroke="rgba(99,102,241,0.15)" strokeWidth="0.8" />
          <line x1="354" y1="36" x2="388" y2="44" stroke="rgba(168,85,247,0.15)" strokeWidth="0.8" />
          <line x1="330" y1="18" x2="372" y2="22" stroke="rgba(244,114,182,0.15)" strokeWidth="0.8" />
          <line x1="372" y1="22" x2="388" y2="44" stroke="rgba(99,102,241,0.13)" strokeWidth="0.8" />
          <line x1="312" y1="52" x2="344" y2="58" stroke="rgba(168,85,247,0.13)" strokeWidth="0.8" />
          <line x1="320" y1="34" x2="330" y2="18" stroke="rgba(244,114,182,0.12)" strokeWidth="0.7" />
          <line x1="320" y1="34" x2="354" y2="36" stroke="rgba(168,85,247,0.12)" strokeWidth="0.7" />

          {/* Gleam lines */}
          <rect x="0" y="20" width="1400" height="0.8" fill="rgba(255,255,255,0.03)" />
          <rect x="0" y="40" width="1400" height="0.5" fill="rgba(255,255,255,0.02)" />
        </svg>

        {/* ── Brand ── */}
        <div className="tb-brand">
          <div className="tb-logo-pill">
            <img src={logo} alt="AREN Logo" />
          </div>
          <div className="tb-brand-text">
            <strong>AREN <span>Cortex</span></strong>
            <small>Phase 1 workflow</small>
          </div>
        </div>

        <div className="tb-divider" aria-hidden="true" />

        {/* ── Patient identity ── */}
        <div className="tb-patient-identity">
          <div className="tb-identity-orb" aria-hidden="true" />
          <span className="tb-active-dot" aria-hidden="true" />

          {/* Improved avatar — gradient fill + glow ring */}
          <div className="tb-avatar" aria-label={`Patient: ${patient.name}`}>
            <div className="tb-avatar-inner">{initials}</div>
            <div className="tb-avatar-ring" aria-hidden="true" />
          </div>

          <div className="tb-patient-info">
            <span className="tb-active-label">Active consult</span>
            <strong className="tb-patient-name">
              {patient.name || "No patient selected"}
            </strong>
            <span className="tb-patient-meta">
              {details || "Create or search a patient to begin"}
            </span>
          </div>
        </div>

        <div className="tb-divider" aria-hidden="true" />

        {/* ── Past visits ── */}
        {pastVisits.length > 0 && (
          <div className="tb-visits-zone">
            <span className="tb-visits-label">Past visits</span>
            <div className="tb-visits-scroll">
              {pastVisits.map((visit, i) => (
                <button
                  key={visit.date}
                  className={`tb-visit-chip${i === 0 ? " latest" : ""}`}
                  type="button"
                  onClick={() => setActiveVisit(visit)}
                  title={visit.summary}
                >
                  <span className="tb-visit-date">{visit.date}</span>
                  {visit.diagnosis && (
                    <span className="tb-visit-diag">{visit.diagnosis}</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Actions ── */}
        <div className="tb-actions">
          <ActionButton icon={<Plus size={15} />} onClick={onOpenPatientModal}>
            Patient
          </ActionButton>

          <div className="tb-doctor-pill">
            <Stethoscope size={14} />
            <span>{doctor.name}</span>
          </div>

          <button
            type="button"
            className={`tb-cancel-btn${cancelArmed ? " armed" : ""}`}
            onClick={handleCancelClick}
          >
            {cancelArmed ? "Sure? Click again" : "Cancel"}
          </button>

          {/* Review Rx — toned down during active consult */}
          <button
            type="button"
            className="tb-review-btn"
            onClick={onReviewRx}
          >
            Review Rx
          </button>
        </div>
      </header>

      {/* ── Vitals bar ───────────────────────────────────── */}
      <div className="vitals-bar">
        <span className="vitals-bar-label">Vitals</span>
        {VITAL_FIELDS.map((field, i) => {
          const val = vitals[field.key];
          const isWarn = field.warn ? field.warn(val) : false;
          return (
            <div key={field.key} className={`vital-pill${isWarn ? " warn" : ""}`}>
              <span className="vital-pill-label">{field.label}</span>
              <input
                value={val}
                placeholder={field.placeholder}
                onChange={(e) =>
                  onVitalsChange({ ...vitals, [field.key]: e.target.value })
                }
                aria-label={field.label}
              />
              {i < VITAL_FIELDS.length - 1 && <span className="vital-sep" />}
            </div>
          );
        })}
      </div>

      {/* ── Past visit popup — redesigned ───────────────── */}
      {activeVisit && (
        <div
          className="vp-overlay"
          onClick={() => setActiveVisit(null)}
        >
          <div
            className="vp-card"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Top gradient stripe — matches topbar */}
            <div className="vp-stripe" aria-hidden="true" />

            {/* Atmospheric orb inside card */}
            <div className="vp-orb" aria-hidden="true" />

            <div className="vp-header">
              <div className="vp-header-left">
                <div className="vp-icon-wrap">
                  <Calendar size={14} />
                </div>
                <div>
                  <p className="vp-eyebrow">Past consultation</p>
                  <h3 className="vp-diagnosis">
                    {activeVisit.diagnosis || "Visit"}
                  </h3>
                </div>
              </div>
              <button
                type="button"
                className="vp-close"
                onClick={() => setActiveVisit(null)}
                aria-label="Close"
              >
                <X size={14} />
              </button>
            </div>

            <div className="vp-date-row">
              <span className="vp-date">{activeVisit.date}</span>
              <span className="vp-summary">{activeVisit.summary}</span>
            </div>

            {activeVisit.medicines && activeVisit.medicines.length > 0 && (
              <div className="vp-meds">
                <div className="vp-meds-header">
                  <Pill size={11} />
                  <span>Medicines prescribed</span>
                </div>
                <ul className="vp-meds-list">
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