import { ChevronLeft, ChevronRight, ClipboardList, Dumbbell, Pill, Stethoscope, Plus } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import logo from "../assets/aren-logo.png";
import type { Doctor, Patient } from "../types";
import { ActionButton } from "./ActionButton";
import { formatVisitDate } from "./PastVisitCard";
import type { RealVisit } from "../lib/db";
import { visitTypeLabel } from "../features/patients/visitStatus";

/**
 * The small glyph on each past-visit chip. Same ordering `visitTypeLabel`
 * already reasons in (features/patients/visitStatus.ts) — a chip that ALSO
 * has exercises but led with a prescription still reads as a prescription
 * visit, same as everywhere else that label appears.
 */
function VisitTypeIcon({ visit }: { visit: RealVisit }) {
  const label = visitTypeLabel(visit);
  const size = 10;
  if (label === "Prescription") return <Pill size={size} aria-hidden="true" />;
  if (label === "Exercise Plan") return <Dumbbell size={size} aria-hidden="true" />;
  if (label === "Examination") return <Stethoscope size={size} aria-hidden="true" />;
  return <ClipboardList size={size} aria-hidden="true" />;
}

type PatientHeaderProps = {
  patient: Patient;
  doctor: Doctor;
  onOpenPatientModal: () => void;
  onReviewRx: () => void;
  onCancelConsult: () => void;
  onOpenSidebar: () => void;
  isSidebarOpen: boolean;
  logoRef: React.RefObject<HTMLDivElement>;
  pastVisits?: RealVisit[];
  pastVisitsLoading?: boolean;
  /**
   * Opens the shared `PastVisitCard`, anchored at `x`.
   *
   * The card itself used to live in this file with its own local state. It
   * moved to `App.tsx` on 2026-08-16 because the longitudinal band's visit
   * timeline is a second way into the SAME view, and the spec is explicit
   * that there must not be two of them. See PastVisitCard's header.
   */
  onOpenVisit?: (visit: RealVisit, x: number) => void;
  /**
   * Session number to print on each chip, keyed by visit id. Supplied by the
   * care plan when one is running ("Session 4"); absent otherwise, in which
   * case the chips print the medicine they always did.
   */
  sessionLabels?: Map<string, string>;
};

// The vitals strip that used to live here is gone. BP, Pulse, SpO2, Temp and
// Weight were rendered twice on one screen — read-only pills up here, editable
// cards in the workspace — and the mockup review ruled that out: two renderings
// of one number is how a consultation ends up with two different numbers.
// Measurements is now the single source of truth. See MeasurementsPanel.tsx.

export function PatientHeader({
  patient, doctor,
  onOpenPatientModal, onReviewRx, onCancelConsult,
  onOpenSidebar, isSidebarOpen,
  pastVisits = [], pastVisitsLoading = false,
  onOpenVisit, sessionLabels,
  logoRef,
}: PatientHeaderProps) {
  const [cancelArmed, setCancelArmed] = useState(false);
  const [cancelTimer, setCancelTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
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

  return (
    <>
      <div ref={sentinelRef} style={{ height: 1, marginBottom: -1 }} aria-hidden="true" />

      <header className={`topbar-unified${isStuck ? " is-stuck" : ""}${isSidebarOpen ? " is-sidebar-open" : ""}`}>
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

        {/* Brand — purely visual here now. The actual click target that opens
            the sidebar is GlobalLogoTrigger (rendered at the App level), which
            tracks this element's position but lives outside this header's
            stacking context so it stays clickable under any overlay. */}
        <div className="tb-brand">
          <div
            ref={logoRef}
            className="tb-logo-pill"
            onClick={onOpenSidebar}
            role="button"
            tabIndex={0}
            aria-label="Open navigation menu"
            title="Open menu"
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onOpenSidebar(); }}
          >
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
                {pastVisits.map((visit, i) => {
                  // A running care plan renames these: "Session 3" tells a
                  // physiotherapist where they are in a course, which the name
                  // of a medicine does not. Falls back to what it always was
                  // whenever no plan is running — which is every profile that
                  // does not use one.
                  const session = sessionLabels?.get(visit.id);
                  // A fuller preview than just the first 3 symptoms — the
                  // chip itself only has room for one line, but the tooltip
                  // can say what the click will actually open into.
                  const tooltip = [
                    visit.symptoms.slice(0, 3).join(", "),
                    visit.findings.length > 0 ? `${visit.findings.length} finding${visit.findings.length > 1 ? "s" : ""}` : "",
                    visit.medicines.length > 0 ? `${visit.medicines.length} medicine${visit.medicines.length > 1 ? "s" : ""}` : "",
                    visit.exercise_names.length > 0 ? `${visit.exercise_names.length} exercise${visit.exercise_names.length > 1 ? "s" : ""}` : "",
                  ].filter(Boolean).join(" · ") || "Visit details";
                  return (
                    <button
                      key={visit.id}
                      className={`tb-visit-chip${i === 0 ? " latest" : ""}`}
                      type="button"
                      onClick={(e) => {
                        const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                        onOpenVisit?.(visit, rect.left + rect.width / 2);
                      }}
                      title={tooltip}
                    >
                      <span className="tb-visit-date">
                        <VisitTypeIcon visit={visit} />
                        {formatVisitDate(visit.created_at)}
                      </span>
                      {session ? (
                        <span className="tb-visit-diag">{session}</span>
                      ) : visit.medicines.length > 0 ? (
                        <span className="tb-visit-diag">{visit.medicines[0].name}</span>
                      ) : visit.exercise_names.length > 0 ? (
                        <span className="tb-visit-diag">{visit.exercise_names[0]}</span>
                      ) : null}
                    </button>
                  );
                })}
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

    </>
  );
}
