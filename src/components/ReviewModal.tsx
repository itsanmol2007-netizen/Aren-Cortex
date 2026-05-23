import { X, Printer, MessageCircle, CheckCircle, ChevronLeft, Loader2, AlertCircle } from "lucide-react";
import type { DBFinding, DBHospital } from "../lib/db";
import type { Patient, PrescriptionMedicine, Vitals } from "../types";

type ReviewDoctor = {
  name: string;
  specialization: string | null;
  qualification: string | null;
  registration_number: string | null;
};

type ReviewModalProps = {
  patient: Patient;
  doctor: ReviewDoctor;
  hospital: DBHospital | null;
  vitals: Vitals;
  symptoms: string[];
  findings: string[];
  allFindings: DBFinding[];
  prescription: PrescriptionMedicine[];
  tests: string[];
  isSaving: boolean;
  onEdit: () => void;
  onSave: () => Promise<void>;
  onClose: () => void;
};

function buildWhatsAppText(
  patient: Patient,
  doctor: ReviewDoctor,
  hospital: DBHospital | null,
  symptoms: string[],
  findings: string[],
  prescription: PrescriptionMedicine[],
  tests: string[]
): string {
  const today = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
  const lines: string[] = [];

  lines.push(`*${hospital?.name ?? "Clinic"} — Prescription*`);
  lines.push(`Dr. ${doctor.name}${doctor.qualification ? `, ${doctor.qualification}` : ""}`);
  lines.push(`Date: ${today}`);
  lines.push(`Patient: ${patient.name}, ${patient.age}y, ${patient.gender}`);
  lines.push("");

  if (symptoms.length) {
    lines.push(`*Symptoms:* ${symptoms.join(", ")}`);
  }
  if (findings.length) {
    lines.push(`*Findings:* ${findings.join(", ")}`);
  }
  if (symptoms.length || findings.length) lines.push("");

  if (prescription.length) {
    lines.push("*Rx*");
    prescription.forEach((m, i) => {
      lines.push(`${i + 1}. ${m.name}`);
      const parts = [m.dosage, m.frequency, m.duration].filter(Boolean);
      lines.push(`   ${parts.join(" · ")}`);
      if (m.notes) lines.push(`   _(${m.notes})_`);
    });
  }

  if (tests.length) {
    lines.push("");
    lines.push(`*Investigations:* ${tests.join(", ")}`);
  }

  lines.push("");
  lines.push(`_Powered by AREN Node_`);
  return lines.join("\n");
}

export function ReviewModal({
  patient, doctor, hospital, vitals,
  symptoms, findings, allFindings, prescription, tests,
  isSaving, onEdit, onSave, onClose,
}: ReviewModalProps) {
  const today = new Date().toLocaleDateString("en-IN", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  const findingObjects = findings
    .map((name) => allFindings.find((f) => f.name === name))
    .filter(Boolean) as DBFinding[];

  const abnormalFindings = findingObjects.filter((f) => f.is_abnormal);
  const normalFindings = findingObjects.filter((f) => !f.is_abnormal);

  const clinicName = hospital?.name ?? "Clinic";
  const clinicCity = [hospital?.city, hospital?.state].filter(Boolean).join(", ");
  const clinicContact = [hospital?.phone, hospital?.email].filter(Boolean).join("  ·  ");
  const tagline = hospital?.tagline ?? null;
  const initials = clinicName.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();

  const handleWhatsApp = () => {
    const text = buildWhatsAppText(patient, doctor, hospital, symptoms, findings, prescription, tests);
    const phone = patient.phone.replace(/\D/g, "");
    window.open(`https://wa.me/91${phone}?text=${encodeURIComponent(text)}`, "_blank");
  };

  const handlePrint = () => window.print();

  const hasVitals = Object.values(vitals).some((v) => v.trim() !== "");

  return (
    <div className="rx-modal-overlay" role="dialog" aria-modal="true" aria-label="Prescription review">
      <div className="rx-modal-backdrop" onClick={onClose} />

      <div className="rx-modal-shell">
        {/* ── Modal header bar ── */}
        <div className="rx-modal-bar">
          <button className="rx-modal-back-btn" type="button" onClick={onEdit}>
            <ChevronLeft size={15} />
            Edit
          </button>
          <span className="rx-modal-bar-title">Prescription Review</span>
          <button className="rx-modal-close-btn" type="button" onClick={onClose} aria-label="Close">
            <X size={15} />
          </button>
        </div>

        {/* ── Scrollable prescription body ── */}
        <div className="rx-modal-scroll">
          {/* This entire block is what gets printed */}
          <div className="rx-print-area" id="rx-print-area">

            {/* ══ LETTERHEAD ══════════════════════════════════════ */}
            <div className="rx-letterhead">
              <div className="rx-letterhead-strip">
                {/* Logo / initials */}
                <div className="rx-clinic-logo">
                  {hospital?.logo_url
                    ? <img src={hospital.logo_url} alt={clinicName} className="rx-clinic-logo-img" />
                    : <span className="rx-clinic-logo-initials">{initials}</span>
                  }
                </div>
                {/* Clinic identity */}
                <div className="rx-clinic-identity">
                  <h1 className="rx-clinic-name">{clinicName}</h1>
                  {tagline && <p className="rx-clinic-tagline">{tagline}</p>}
                  {clinicCity && <p className="rx-clinic-address">{clinicCity}</p>}
                  {clinicContact && <p className="rx-clinic-contact">{clinicContact}</p>}
                </div>
              </div>

              {/* Doctor bar */}
              <div className="rx-doctor-bar">
                <div className="rx-doctor-left">
                  <span className="rx-doctor-name">Dr. {doctor.name}</span>
                  {doctor.qualification && (
                    <span className="rx-doctor-qual">{doctor.qualification}</span>
                  )}
                </div>
                <div className="rx-doctor-right">
                  {doctor.registration_number && (
                    <span className="rx-doctor-reg">Reg: {doctor.registration_number}</span>
                  )}
                  {doctor.specialization && (
                    <span className="rx-doctor-spec">{doctor.specialization.charAt(0).toUpperCase() + doctor.specialization.slice(1)}</span>
                  )}
                </div>
              </div>

              {/* Patient row */}
              <div className="rx-patient-row">
                <div className="rx-patient-field">
                  <span className="rx-field-label">Patient</span>
                  <span className="rx-field-value">{patient.name}</span>
                </div>
                {patient.age && (
                  <div className="rx-patient-field">
                    <span className="rx-field-label">Age</span>
                    <span className="rx-field-value">{patient.age}y</span>
                  </div>
                )}
                {patient.gender && (
                  <div className="rx-patient-field">
                    <span className="rx-field-label">Sex</span>
                    <span className="rx-field-value">{patient.gender}</span>
                  </div>
                )}
                {patient.phone && (
                  <div className="rx-patient-field">
                    <span className="rx-field-label">Phone</span>
                    <span className="rx-field-value">+91 {patient.phone}</span>
                  </div>
                )}
                <div className="rx-patient-field rx-patient-field--date">
                  <span className="rx-field-label">Date</span>
                  <span className="rx-field-value">{today}</span>
                </div>
              </div>

              {/* Vitals row — only if any vitals entered */}
              {hasVitals && (
                <div className="rx-vitals-row">
                  {vitals.bp && <span className="rx-vital-chip"><span className="rx-vital-label">BP</span>{vitals.bp}</span>}
                  {vitals.pulse && <span className="rx-vital-chip"><span className="rx-vital-label">Pulse</span>{vitals.pulse}</span>}
                  {vitals.temp && <span className="rx-vital-chip"><span className="rx-vital-label">Temp</span>{vitals.temp}°F</span>}
                  {vitals.spo2 && <span className="rx-vital-chip"><span className="rx-vital-label">SpO₂</span>{vitals.spo2}%</span>}
                  {vitals.weight && <span className="rx-vital-chip"><span className="rx-vital-label">Wt</span>{vitals.weight}</span>}
                </div>
              )}
            </div>

            {/* ══ BODY ════════════════════════════════════════════ */}
            <div className="rx-body">

              {/* Symptoms */}
              {symptoms.length > 0 && (
                <div className="rx-section">
                  <div className="rx-section-head">
                    <span className="rx-section-label">Presenting Complaints</span>
                    <div className="rx-section-rule" />
                  </div>
                  <p className="rx-symptom-text">{symptoms.join("  ·  ")}</p>
                </div>
              )}

              {/* Findings */}
              {findingObjects.length > 0 && (
                <div className="rx-section">
                  <div className="rx-section-head">
                    <span className="rx-section-label">Clinical Findings</span>
                    <div className="rx-section-rule" />
                  </div>
                  <div className="rx-findings-list">
                    {abnormalFindings.map((f) => (
                      <span key={f.id} className="rx-finding-chip rx-finding-chip--abnormal">
                        <AlertCircle size={10} />
                        {f.name}
                      </span>
                    ))}
                    {normalFindings.map((f) => (
                      <span key={f.id} className="rx-finding-chip rx-finding-chip--normal">
                        {f.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Rx — Medicines */}
              {prescription.length > 0 && (
                <div className="rx-section">
                  <div className="rx-section-head">
                    <span className="rx-rx-symbol">Rx</span>
                    <div className="rx-section-rule" />
                  </div>
                  <div className="rx-medicine-list">
                    {prescription.map((m, i) => (
                      <div key={m.id} className="rx-medicine-row">
                        <span className="rx-medicine-num">{i + 1}</span>
                        <div className="rx-medicine-body">
                          <div className="rx-medicine-top">
                            <span className="rx-medicine-name">{m.name}</span>
                            {m.route && m.route !== "oral" && (
                              <span className="rx-medicine-route">{m.route}</span>
                            )}
                            {m.is_sos && <span className="rx-sos-badge">SOS</span>}
                          </div>
                          <div className="rx-medicine-dosage">
                            {m.dosage && <span>{m.dosage}</span>}
                            {m.frequency && <><span className="rx-dot">·</span><span>{m.frequency}</span></>}
                            {m.duration && <><span className="rx-dot">·</span><span>{m.duration}</span></>}
                          </div>
                          {(m.notes || m.instructions) && (
                            <p className="rx-medicine-notes">
                              {[m.notes, m.instructions].filter(Boolean).join("  ·  ")}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Investigations */}
              {tests.length > 0 && (
                <div className="rx-section">
                  <div className="rx-section-head">
                    <span className="rx-section-label">Investigations</span>
                    <div className="rx-section-rule" />
                  </div>
                  <div className="rx-tests-list">
                    {tests.map((t) => (
                      <span key={t} className="rx-test-chip">{t}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Empty state */}
              {prescription.length === 0 && tests.length === 0 && symptoms.length === 0 && (
                <div className="rx-empty-state">
                  <p>No medicines, tests, or symptoms recorded yet.</p>
                  <button type="button" className="rx-empty-edit-btn" onClick={onEdit}>← Go back to edit</button>
                </div>
              )}

              {/* Signature + footer */}
              <div className="rx-footer">
                <div className="rx-signature-area">
                  <div className="rx-signature-line" />
                  <span className="rx-signature-label">Dr. {doctor.name}</span>
                </div>
                <div className="rx-powered-by">Powered by AREN Node</div>
              </div>

            </div>
          </div>
        </div>

        {/* ── Sticky action bar ── */}
        <div className="rx-modal-actions">
          <button type="button" className="rx-action-btn rx-action-btn--ghost" onClick={onEdit}>
            <ChevronLeft size={14} />
            Edit
          </button>

          <div className="rx-action-group">
            <button type="button" className="rx-action-btn rx-action-btn--secondary" onClick={handlePrint}>
              <Printer size={14} />
              Print
            </button>
            <button type="button" className="rx-action-btn rx-action-btn--secondary" onClick={handleWhatsApp} disabled={!patient.phone}>
              <MessageCircle size={14} />
              WhatsApp
            </button>
            <button
              type="button"
              className="rx-action-btn rx-action-btn--primary"
              onClick={onSave}
              disabled={isSaving}
            >
              {isSaving
                ? <><Loader2 size={14} className="rx-spin" />Saving…</>
                : <><CheckCircle size={14} />Confirm &amp; Save</>
              }
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}