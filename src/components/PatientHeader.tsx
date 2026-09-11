import { ChevronLeft, ChevronRight, ClipboardList, Dumbbell, Pill, Stethoscope, Plus, Users } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import type { Doctor, Patient } from "../types";
import { useClinicShape } from "../hooks/useClinicShape";
import { WorkspaceHeader } from "./WorkspaceHeader";
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
  /**
   * ── Front-desk controls (2026-09-03) ────────────────────────────────────
   *
   * All optional, all absent in Cortex, which is what keeps that header
   * byte-identical to what it always was. With a front desk:
   *
   *   · `onOpenQueue` puts a Queue control in the header. A doctor does not
   *     need to watch the queue while consulting — they need to be able to
   *     ask — so it is one quiet control that opens a sheet, not a live list
   *     pinned to the screen.
   *   · `queueCount` / `nextToken` are what that control says without being
   *     opened: how many are waiting, and who is next.
   *   · `onOpenPatientModal` STILL EXISTS with a front desk but is not wired
   *     to a header button — registering a patient moved into the queue
   *     sheet, where it belongs as the exception it is (receptionist away,
   *     walk-in). It is not removed; see `QueueSheet`'s header.
   */
  onOpenQueue?: () => void;
  queueCount?: number;
  nextToken?: string | null;
};

// The vitals strip that used to live here is gone. BP, Pulse, SpO2, Temp and
// Weight were rendered twice on one screen — read-only pills up here, editable
// cards in the workspace — and the mockup review ruled that out: two renderings
// of one number is how a consultation ends up with two different numbers.
// Measurements is now the single source of truth. See MeasurementsPanel.tsx.

export function PatientHeader({
  patient, doctor,
  onOpenPatientModal, onReviewRx, onCancelConsult,
  pastVisits = [], pastVisitsLoading = false,
  onOpenVisit, sessionLabels,
  onOpenQueue, queueCount = 0, nextToken,
}: PatientHeaderProps) {
  const { frontDesk } = useClinicShape();
  const [cancelArmed, setCancelArmed] = useState(false);
  const [cancelTimer, setCancelTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);

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
    <WorkspaceHeader
      /* Taller, because this header carries a patient and not a page name —
         and it ARRIVES at that height rather than appearing at it. See
         `tall` in WorkspaceHeader.tsx. */
      tall
      identitySlot={
        <>
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

        </>
      }
      centerSlot={
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
      }
      rightSlot={
        <div className="tb-actions">
          {/* Consult replaces "+ Patient" with the Queue. Cortex keeps it:
              in a solo clinic the doctor IS the front desk, and taking that
              button away would remove the only way to start a consultation. */}
          {frontDesk && onOpenQueue ? (
            <button
              type="button"
              className="tb-queue-btn"
              onClick={onOpenQueue}
              title={queueCount ? `${queueCount} waiting — next is ${nextToken ?? "—"}` : "Nobody waiting"}
            >
              <Users size={14} aria-hidden="true" />
              <span className="tb-queue-label">Queue</span>
              <span className={`tb-queue-count${queueCount ? "" : " is-empty"}`}>{queueCount}</span>
              {nextToken && <span className="tb-queue-next">next {nextToken}</span>}
            </button>
          ) : (
            <ActionButton icon={<Plus size={15} />} onClick={onOpenPatientModal}>Patient</ActionButton>
          )}
          <div className="tb-doctor-pill">
            <Stethoscope size={14} />
            <span>{doctor.name}</span>
          </div>
          <button type="button" className={`tb-cancel-btn${cancelArmed ? " armed" : ""}`} onClick={handleCancelClick}>
            {cancelArmed ? "Sure? Click again" : "Cancel"}
          </button>
          {/* Same button, same guard, same modal — it just says what actually
              happens next in a clinic with a queue behind the door. */}
          <button type="button" className="tb-review-btn" onClick={onReviewRx}>
            {frontDesk ? "Complete & Next" : "Review Rx"}
          </button>
        </div>
      }
    />
  );
}
