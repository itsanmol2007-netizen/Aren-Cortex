import { Plus, Stethoscope, X, Pill, Calendar } from "lucide-react";
import { useState, useEffect, useRef } from "react";
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
  { date: "22 Apr", summary: "Fever with chills, URI symptoms", diagnosis: "Viral URTI", medicines: ["Paracetamol 500mg", "Cetirizine 10mg", "Azithromycin 500mg"] },
  { date: "18 Apr", summary: "Follow-up, improving", diagnosis: "Resolving URTI", medicines: ["Paracetamol 500mg"] },
  { date: "2 Mar", summary: "Stomach pain, loose motions", diagnosis: "Acute gastroenteritis", medicines: ["ORS", "Metronidazole 400mg", "Domperidone"] },
  { date: "14 Jan", summary: "Routine checkup, BP elevated", diagnosis: "Hypertension - Stage 1", medicines: ["Amlodipine 5mg"] },
  { date: "3 Nov", summary: "Cough, cold, body ache", diagnosis: "Influenza", medicines: ["Paracetamol", "Levocetrizine", "Bromhexine syrup"] },
];

const VITAL_FIELDS: {
  key: keyof Vitals;
  label: string;
  placeholder: string;
  warn?: (v: string) => boolean;
}[] = [
    { key: "bp", label: "BP", placeholder: "120/80", warn: (v) => { const s = parseInt(v.split("/")[0]); return !isNaN(s) && (s > 140 || s < 90); } },
    { key: "pulse", label: "Pulse", placeholder: "72", warn: (v) => { const n = parseInt(v); return !isNaN(n) && (n > 100 || n < 50); } },
    { key: "temp", label: "Temp", placeholder: "98.6", warn: (v) => { const n = parseFloat(v); return !isNaN(n) && (n > 99.5 || n < 96); } },
    { key: "spo2", label: "SpO₂", placeholder: "98", warn: (v) => { const n = parseInt(v); return !isNaN(n) && n < 95; } },
    { key: "weight", label: "Wt", placeholder: "65 kg" },
  ];

export function PatientHeader({ patient, doctor, vitals, onVitalsChange, onOpenPatientModal, onReviewRx, onCancelConsult, pastVisits = mockPastVisits }: PatientHeaderProps) {
  const [cancelArmed, setCancelArmed] = useState(false);
  const [cancelTimer, setCancelTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  const [activeVisit, setActiveVisit] = useState<PastVisit | null>(null);
  const [isStuck, setIsStuck] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Sticky detection — zero JS cost, IntersectionObserver fires only on state change
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const obs = new IntersectionObserver(
      ([entry]) => setIsStuck(!entry.isIntersecting),
      { threshold: 1.0 }
    );
    obs.observe(sentinel);
    return () => obs.disconnect();
  }, []);

  const initials = patient.name
    ? patient.name.split(" ").filter(Boolean).map((p) => p[0]).join("").slice(0, 2).toUpperCase()
    : "NP";

  const details = [patient.age && `${patient.age}y`, patient.gender, patient.phone].filter(Boolean).join(" · ");

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
      {/* Sentinel sits above the header — when it leaves viewport, header is "stuck" */}
      <div ref={sentinelRef} style={{ height: 1, marginBottom: -1 }} aria-hidden="true" />

      <header className={`topbar-unified${isStuck ? " is-stuck" : ""}`}>
        {/* ── Accent stripe ── */}
        <div className="topbar-stripe" aria-hidden="true" />

        {/* ── Atmospheric SVG layer — boosted visibility ── */}
        <svg className="topbar-atmo" aria-hidden="true" preserveAspectRatio="none" viewBox="0 0 1400 72" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <radialGradient id="bloom-a" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#f472b6" stopOpacity="0.32" />
              <stop offset="100%" stopColor="#f472b6" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="bloom-b" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#a855f7" stopOpacity="0.26" />
              <stop offset="100%" stopColor="#a855f7" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="bloom-c" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#6366f1" stopOpacity="0.24" />
              <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
            </radialGradient>
            <linearGradient id="arc-ribbon-1" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#f472b6" stopOpacity="0" />
              <stop offset="30%" stopColor="#a855f7" stopOpacity="0.30" />
              <stop offset="70%" stopColor="#6366f1" stopOpacity="0.22" />
              <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="arc-ribbon-2" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#a855f7" stopOpacity="0" />
              <stop offset="40%" stopColor="#f472b6" stopOpacity="0.20" />
              <stop offset="100%" stopColor="#f472b6" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="arc-ribbon-3" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#6366f1" stopOpacity="0" />
              <stop offset="50%" stopColor="#a855f7" stopOpacity="0.16" />
              <stop offset="100%" stopColor="#a855f7" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="gleam-h" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="white" stopOpacity="0" />
              <stop offset="35%" stopColor="white" stopOpacity="0.07" />
              <stop offset="65%" stopColor="white" stopOpacity="0.05" />
              <stop offset="100%" stopColor="white" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Ambient blooms — more opaque */}
          <ellipse cx="100" cy="-5" rx="160" ry="80" fill="url(#bloom-a)" />
          <ellipse cx="500" cy="95" rx="260" ry="110" fill="url(#bloom-b)" />
          <ellipse cx="1050" cy="10" rx="220" ry="85" fill="url(#bloom-c)" />
          <ellipse cx="1380" cy="85" rx="180" ry="80" fill="url(#bloom-a)" />

          {/* Spline ribbons — more visible */}
          <path d="M-20,58 C180,30 360,68 560,44 C760,20 920,62 1100,40 C1250,24 1350,44 1420,36"
            fill="none" stroke="url(#arc-ribbon-1)" strokeWidth="1.6" />
          <path d="M-20,64 C140,46 300,70 480,55 C660,40 820,66 1000,52 C1160,38 1300,58 1420,50"
            fill="none" stroke="url(#arc-ribbon-2)" strokeWidth="1.2" />
          <path d="M-20,68 C100,54 260,72 440,60 C620,48 780,70 960,58 C1120,46 1280,64 1420,56"
            fill="none" stroke="url(#arc-ribbon-3)" strokeWidth="1.0" />
          <path d="M0,22 C200,10 400,32 640,18 C880,4 1080,28 1300,14 C1360,10 1400,14 1420,12"
            fill="none" stroke="rgba(99,102,241,0.14)" strokeWidth="0.9" />

          {/* Fill volumes */}
          <path d="M0,54 C180,34 360,64 560,46 C760,28 920,60 1100,44 C1250,30 1340,48 1400,42 L1400,72 L0,72 Z"
            fill="rgba(168,85,247,0.055)" />
          <path d="M0,60 C140,46 300,68 480,56 C660,44 820,64 1000,54 C1160,44 1300,60 1400,54 L1400,72 L0,72 Z"
            fill="rgba(244,114,182,0.038)" />

          {/* Neural mesh — patient identity zone, boosted */}
          <circle cx="268" cy="14" r="1.8" fill="rgba(168,85,247,0.70)" />
          <circle cx="296" cy="38" r="1.5" fill="rgba(168,85,247,0.55)" />
          <circle cx="252" cy="55" r="1.7" fill="rgba(99,102,241,0.60)" />
          <circle cx="318" cy="20" r="1.3" fill="rgba(244,114,182,0.60)" />
          <circle cx="308" cy="60" r="1.2" fill="rgba(168,85,247,0.50)" />
          <circle cx="338" cy="42" r="1.6" fill="rgba(99,102,241,0.55)" />
          <circle cx="278" cy="30" r="1.1" fill="rgba(244,114,182,0.48)" />
          <circle cx="350" cy="18" r="1.4" fill="rgba(168,85,247,0.52)" />
          <circle cx="362" cy="54" r="1.2" fill="rgba(99,102,241,0.45)" />
          <circle cx="242" cy="32" r="1.3" fill="rgba(244,114,182,0.42)" />
          <line x1="268" y1="14" x2="296" y2="38" stroke="rgba(168,85,247,0.26)" strokeWidth="0.9" />
          <line x1="296" y1="38" x2="252" y2="55" stroke="rgba(99,102,241,0.22)" strokeWidth="0.9" />
          <line x1="296" y1="38" x2="338" y2="42" stroke="rgba(168,85,247,0.22)" strokeWidth="0.9" />
          <line x1="268" y1="14" x2="318" y2="20" stroke="rgba(244,114,182,0.20)" strokeWidth="0.8" />
          <line x1="318" y1="20" x2="338" y2="42" stroke="rgba(99,102,241,0.18)" strokeWidth="0.8" />
          <line x1="318" y1="20" x2="350" y2="18" stroke="rgba(168,85,247,0.18)" strokeWidth="0.75" />
          <line x1="252" y1="55" x2="308" y2="60" stroke="rgba(168,85,247,0.18)" strokeWidth="0.8" />
          <line x1="308" y1="60" x2="362" y2="54" stroke="rgba(99,102,241,0.16)" strokeWidth="0.75" />
          <line x1="278" y1="30" x2="268" y2="14" stroke="rgba(244,114,182,0.16)" strokeWidth="0.75" />
          <line x1="278" y1="30" x2="296" y2="38" stroke="rgba(168,85,247,0.16)" strokeWidth="0.75" />
          <line x1="242" y1="32" x2="252" y2="55" stroke="rgba(244,114,182,0.14)" strokeWidth="0.7" />
          <line x1="242" y1="32" x2="268" y2="14" stroke="rgba(168,85,247,0.14)" strokeWidth="0.7" />
          <line x1="338" y1="42" x2="362" y2="54" stroke="rgba(99,102,241,0.14)" strokeWidth="0.7" />
          <line x1="350" y1="18" x2="338" y2="42" stroke="rgba(168,85,247,0.14)" strokeWidth="0.7" />

          {/* Gleam bands */}
          <rect x="0" y="18" width="1400" height="1" fill="url(#gleam-h)" />
          <rect x="0" y="38" width="1400" height="0.6" fill="url(#gleam-h)" opacity="0.7" />

          {/* Avatar zone light column */}
          <rect x="195" y="0" width="55" height="72" fill="rgba(168,85,247,0.06)" />
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
          <div className="tb-identity-orb-2" aria-hidden="true" />
          <span className="tb-active-dot" aria-hidden="true" />

          {/* Avatar — rounded square, cool blue */}
          <div className="tb-avatar" aria-label={`Patient: ${patient.name}`}>
            <div className="tb-avatar-inner">{initials}</div>
            <div className="tb-avatar-ring" aria-hidden="true" />
            <div className="tb-avatar-glow" aria-hidden="true" />
          </div>

          <div className="tb-patient-info">
            <span className="tb-active-label">Active consult</span>
            <strong className="tb-patient-name">{patient.name || "No patient selected"}</strong>
            <span className="tb-patient-meta">{details || "Create or search a patient to begin"}</span>
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
                  {visit.diagnosis && <span className="tb-visit-diag">{visit.diagnosis}</span>}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Actions ── */}
        <div className="tb-actions">
          <ActionButton icon={<Plus size={15} />} onClick={onOpenPatientModal}>Patient</ActionButton>
          <div className="tb-doctor-pill">
            <Stethoscope size={14} />
            <span>{doctor.name}</span>
          </div>
          <button type="button" className={`tb-cancel-btn${cancelArmed ? " armed" : ""}`} onClick={handleCancelClick}>
            {cancelArmed ? "Sure? Click again" : "Cancel"}
          </button>
          <button type="button" className="tb-review-btn" onClick={onReviewRx}>Review Rx</button>
        </div>
      </header>

      {/* ── Vitals bar ── */}
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
                onChange={(e) => onVitalsChange({ ...vitals, [field.key]: e.target.value })}
                aria-label={field.label}
              />
              {i < VITAL_FIELDS.length - 1 && <span className="vital-sep" />}
            </div>
          );
        })}
      </div>

      {/* ── Past visit popup ── */}
      {activeVisit && (
        <div className="vp-overlay" onClick={() => setActiveVisit(null)}>
          <div className="vp-card" onClick={(e) => e.stopPropagation()}>
            <div className="vp-stripe" aria-hidden="true" />
            <div className="vp-orb" aria-hidden="true" />
            <div className="vp-header">
              <div className="vp-header-left">
                <div className="vp-icon-wrap"><Calendar size={14} /></div>
                <div>
                  <p className="vp-eyebrow">Past consultation</p>
                  <h3 className="vp-diagnosis">{activeVisit.diagnosis || "Visit"}</h3>
                </div>
              </div>
              <button type="button" className="vp-close" onClick={() => setActiveVisit(null)} aria-label="Close">
                <X size={14} />
              </button>
            </div>
            <div className="vp-date-row">
              <span className="vp-date">{activeVisit.date}</span>
              <span className="vp-summary">{activeVisit.summary}</span>
            </div>
            {activeVisit.medicines && activeVisit.medicines.length > 0 && (
              <div className="vp-meds">
                <div className="vp-meds-header"><Pill size={11} /><span>Medicines prescribed</span></div>
                <ul className="vp-meds-list">
                  {activeVisit.medicines.map((med) => <li key={med}>{med}</li>)}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}