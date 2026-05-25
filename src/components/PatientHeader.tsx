import { ChevronLeft, ChevronRight, Calendar, Pill, Stethoscope, Plus, X, Activity, RefreshCw } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import logo from "../assets/aren-logo.png";
import type { Doctor, Patient, Vitals } from "../types";
import { ActionButton } from "./ActionButton";
import { freqSlotToLabel } from "../lib/db";
import type { RealVisit } from "../lib/db";

type PatientHeaderProps = {
  patient: Patient;
  doctor: Doctor;
  vitals: Vitals;
  onVitalsChange: (v: Vitals) => void;
  onOpenPatientModal: () => void;
  onReviewRx: () => void;
  onCancelConsult: () => void;
  pastVisits?: RealVisit[];
  pastVisitsLoading?: boolean;
  onRepeatRx?: (visit: RealVisit) => void;   // ← NEW
};

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

function formatVisitDate(isoString: string): string {
  const d = new Date(isoString);
  const day = d.getDate();
  const month = d.toLocaleString("en-IN", { month: "short" });
  const year = d.getFullYear();
  const thisYear = new Date().getFullYear();
  return year === thisYear ? `${day} ${month}` : `${day} ${month} ${year}`;
}

function buildMedDetail(med: RealVisit["medicines"][0]): string {
  const parts: string[] = [];
  if (med.dosage_mg) parts.push(`${med.dosage_mg}mg`);
  if (med.frequency) parts.push(freqSlotToLabel(med.frequency));
  if (med.duration_days) parts.push(`${med.duration_days}d`);
  return parts.join(" · ");
}

export function PatientHeader({
  patient, doctor, vitals, onVitalsChange,
  onOpenPatientModal, onReviewRx, onCancelConsult,
  pastVisits = [], pastVisitsLoading = false,
  onRepeatRx,
}: PatientHeaderProps) {
  const [cancelArmed, setCancelArmed] = useState(false);
  const [cancelTimer, setCancelTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  const [activeVisit, setActiveVisit] = useState<{ visit: RealVisit; x: number } | null>(null);
  const [isStuck, setIsStuck] = useState(false);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const sentinelRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

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

  const updateArrows = () => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
  };

  useEffect(() => { updateArrows(); }, [pastVisits]);

  const scrollBy = (dir: "left" | "right") => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir === "left" ? -160 : 160, behavior: "smooth" });
    setTimeout(updateArrows, 320);
  };

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

  const handleRepeatClick = () => {
    if (!activeVisit || !onRepeatRx) return;
    onRepeatRx(activeVisit.visit);
    setActiveVisit(null);
  };

  const hasImportable =
    activeVisit &&
    (activeVisit.visit.symptoms.length > 0 ||
      activeVisit.visit.findings.length > 0 ||
      activeVisit.visit.medicines.length > 0);

  return (
    <>
      <div ref={sentinelRef} style={{ height: 1, marginBottom: -1 }} aria-hidden="true" />

      <header className={`topbar-unified${isStuck ? " is-stuck" : ""}`}>
        <div className="topbar-stripe" aria-hidden="true" />

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
          <ellipse cx="100" cy="-5" rx="160" ry="80" fill="url(#bloom-a)" />
          <ellipse cx="500" cy="95" rx="260" ry="110" fill="url(#bloom-b)" />
          <ellipse cx="1050" cy="10" rx="220" ry="85" fill="url(#bloom-c)" />
          <ellipse cx="1380" cy="85" rx="180" ry="80" fill="url(#bloom-a)" />
          <path d="M-20,58 C180,30 360,68 560,44 C760,20 920,62 1100,40 C1250,24 1350,44 1420,36" fill="none" stroke="url(#arc-ribbon-1)" strokeWidth="1.6" />
          <path d="M-20,64 C140,46 300,70 480,55 C660,40 820,66 1000,52 C1160,38 1300,58 1420,50" fill="none" stroke="url(#arc-ribbon-2)" strokeWidth="1.2" />
          <path d="M-20,68 C100,54 260,72 440,60 C620,48 780,70 960,58 C1120,46 1280,64 1420,56" fill="none" stroke="url(#arc-ribbon-3)" strokeWidth="1.0" />
          <path d="M0,54 C180,34 360,64 560,46 C760,28 920,60 1100,44 C1250,30 1340,48 1400,42 L1400,72 L0,72 Z" fill="rgba(168,85,247,0.055)" />
          <path d="M0,60 C140,46 300,68 480,56 C660,44 820,64 1000,54 C1160,44 1300,60 1400,54 L1400,72 L0,72 Z" fill="rgba(244,114,182,0.038)" />
          <circle cx="268" cy="14" r="1.8" fill="rgba(168,85,247,0.70)" />
          <circle cx="296" cy="38" r="1.5" fill="rgba(168,85,247,0.55)" />
          <circle cx="252" cy="55" r="1.7" fill="rgba(99,102,241,0.60)" />
          <circle cx="318" cy="20" r="1.3" fill="rgba(244,114,182,0.60)" />
          <circle cx="308" cy="60" r="1.2" fill="rgba(168,85,247,0.50)" />
          <circle cx="338" cy="42" r="1.6" fill="rgba(99,102,241,0.55)" />
          <line x1="268" y1="14" x2="296" y2="38" stroke="rgba(168,85,247,0.26)" strokeWidth="0.9" />
          <line x1="296" y1="38" x2="252" y2="55" stroke="rgba(99,102,241,0.22)" strokeWidth="0.9" />
          <line x1="296" y1="38" x2="338" y2="42" stroke="rgba(168,85,247,0.22)" strokeWidth="0.9" />
          <line x1="318" y1="20" x2="338" y2="42" stroke="rgba(99,102,241,0.18)" strokeWidth="0.8" />
          <line x1="252" y1="55" x2="308" y2="60" stroke="rgba(168,85,247,0.18)" strokeWidth="0.8" />
          <rect x="0" y="18" width="1400" height="1" fill="url(#gleam-h)" />
          <rect x="195" y="0" width="55" height="72" fill="rgba(168,85,247,0.06)" />
        </svg>

        {/* Brand */}
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

        {/* Patient identity */}
        <div className="tb-patient-identity">
          <div className="tb-identity-orb" aria-hidden="true" />
          <div className="tb-identity-orb-2" aria-hidden="true" />
          <span className="tb-active-dot" aria-hidden="true" />
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

        {/* Past visits strip */}
        <div className="tb-visits-zone">
          <span className="tb-visits-label">Past visits</span>
          {pastVisitsLoading ? (
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.28)", fontStyle: "italic" }}>Loading…</span>
          ) : pastVisits.length === 0 ? (
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.22)", fontStyle: "italic" }}>No past visits</span>
          ) : (
            <>
              <button className="tb-visits-arrow" type="button" onClick={() => scrollBy("left")} disabled={!canScrollLeft} aria-label="Scroll left">
                <ChevronLeft size={13} />
              </button>
              <div ref={scrollRef} className="tb-visits-scroll" onScroll={updateArrows}>
                {pastVisits.map((visit, i) => (
                  <button
                    key={visit.id}
                    className={`tb-visit-chip${i === 0 ? " latest" : ""}`}
                    type="button"
                    onClick={(e) => {
                      const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                      setActiveVisit({ visit, x: rect.left + rect.width / 2 });
                    }}
                    title={visit.symptoms.slice(0, 3).join(", ") || "Visit details"}
                  >
                    <span className="tb-visit-date">{formatVisitDate(visit.created_at)}</span>
                    {visit.medicines.length > 0 && (
                      <span className="tb-visit-diag">{visit.medicines[0].name}</span>
                    )}
                  </button>
                ))}
              </div>
              <button className="tb-visits-arrow" type="button" onClick={() => scrollBy("right")} disabled={!canScrollRight} aria-label="Scroll right">
                <ChevronRight size={13} />
              </button>
            </>
          )}
        </div>

        {/* Actions */}
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

      {/* Vitals bar */}
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

      {/* Past visit popup */}
      {activeVisit && (
        <div className="pv-overlay" onClick={() => setActiveVisit(null)}>
          <div
            className="pv-card"
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "fixed",
              top: 90,
              left: Math.min(Math.max(activeVisit.x - 210, 12), window.innerWidth - 432),
            }}
          >
            <div className="pv-stripe" aria-hidden="true" />
            <div className="pv-orb" aria-hidden="true" />

            {/* Header */}
            <div className="pv-header">
              <div className="pv-header-left">
                <div className="pv-icon-wrap"><Calendar size={14} /></div>
                <div>
                  <p className="pv-eyebrow">Past consultation</p>
                  <h3 className="pv-title">
                    {activeVisit.visit.medicines.length > 0
                      ? `${activeVisit.visit.medicines.length} medicine${activeVisit.visit.medicines.length > 1 ? "s" : ""} prescribed`
                      : activeVisit.visit.symptoms.length > 0
                        ? activeVisit.visit.symptoms[0]
                        : "Visit record"}
                  </h3>
                </div>
              </div>
              <button type="button" className="pv-close" onClick={() => setActiveVisit(null)} aria-label="Close">
                <X size={14} />
              </button>
            </div>

            {/* Meta */}
            <div className="pv-meta">
              <span className="pv-date-badge">{formatVisitDate(activeVisit.visit.created_at)}</span>
              {activeVisit.visit.doctor_name && (
                <span className="pv-doctor">
                  <span className="pv-doctor-dot" />
                  Dr. {activeVisit.visit.doctor_name}
                </span>
              )}
            </div>

            {/* Scrollable body */}
            <div className="pv-body">
              {activeVisit.visit.symptoms.length > 0 && (
                <div>
                  <p className="pv-section-label">Symptoms noted</p>
                  <div className="pv-chips">
                    {activeVisit.visit.symptoms.map((s) => (
                      <span key={s} className="pv-chip">{s}</span>
                    ))}
                  </div>
                </div>
              )}

              {activeVisit.visit.findings.length > 0 && (
                <>
                  <hr className="pv-divider" />
                  <div>
                    <p className="pv-section-label">Clinical findings</p>
                    <div className="pv-chips">
                      {activeVisit.visit.findings.map((f) => (
                        <span key={f.name} className={`pv-chip ${f.is_abnormal ? "abnormal" : "normal"}`}>
                          {f.name}
                        </span>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {activeVisit.visit.medicines.length > 0 && (
                <>
                  <hr className="pv-divider" />
                  <div>
                    <p className="pv-section-label" style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <Pill size={10} style={{ opacity: 0.5 }} />
                      Medicines prescribed
                    </p>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {activeVisit.visit.medicines.map((med, i) => {
                        const detail = buildMedDetail(med);
                        return (
                          <div key={i} className="pv-med-row">
                            <span className="pv-med-name">{med.name}</span>
                            {detail && <span className="pv-med-detail">{detail}</span>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}

              {activeVisit.visit.symptoms.length === 0 &&
                activeVisit.visit.findings.length === 0 &&
                activeVisit.visit.medicines.length === 0 && (
                  <p className="pv-empty">No detailed records found for this visit.</p>
                )}
            </div>

            {/* ── Repeat Rx footer ── */}
            {hasImportable && onRepeatRx && (
              <div className="pv-footer">
                <button
                  type="button"
                  className="pv-repeat-btn"
                  onClick={handleRepeatClick}
                >
                  <RefreshCw size={13} />
                  Repeat Rx
                </button>
                <span className="pv-repeat-hint">
                  Pre-fills symptoms, medicines &amp; findings
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}