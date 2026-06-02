import { useEffect, useRef, useState } from "react";
import {
  X,
  Edit2,
  Printer,
  MessageCircle,
  CheckCircle,
  User,
  Phone,
  Calendar,
  Hash,
  FileText,
  AlertCircle,
  Sun,
  Sunrise,
  Sunset,
  Moon,
  MapPin,
  Shield,
  Lock,
  ChevronRight,
} from "lucide-react";
import {
  freqLabelToSlot,
  freqSlotToLabel,
} from "../lib/db";
import type { DBDoctor, DBHospital, DBFinding } from "../lib/db";
import type { PrescriptionMedicine, Vitals } from "../types";

// ─── Types ────────────────────────────────────────────────────────────────────

// Matches the inline doctor shape App.tsx constructs from doctorProfile
interface DoctorShape {
  name: string;
  specialization: string | null;
  qualification: string | null;
  registration_number: string | null;
  signature_image_url: string | null;
  avatar_url: string | null;
}

interface ReviewModalProps {
  onClose: () => void;
  onEdit: () => void;
  onSave: () => void;
  patient: {
    id?: string;
    name: string;
    age: string | number;
    gender: string;
    phone?: string;
  };
  visitId?: string;
  symptoms?: string[];
  findings?: string[];
  allFindings?: DBFinding[];
  prescription?: PrescriptionMedicine[];
  tests?: string[];
  followUpDays?: number | null;
  adviceNotes?: string;
  doctor?: DoctorShape | null;
  hospital?: DBHospital | null;
  vitals?: Vitals;
  isSaving?: boolean;
}

// ─── Instruction library ──────────────────────────────────────────────────────

const INSTRUCTION_GROUPS = {
  MEDICATION_COMPLIANCE: [
    "Take medicines exactly as prescribed by your doctor.",
    "Complete the full course of medication unless advised otherwise.",
    "Do not stop medications without consulting your doctor.",
    "Follow the prescribed dosage and schedule carefully.",
  ],
  FOLLOWUP_AND_SAFETY: [
    "Consult your doctor if symptoms worsen or persist.",
    "Seek medical attention if new symptoms develop.",
    "Attend your recommended follow-up visit.",
    "Contact your doctor if you miss multiple doses.",
  ],
  GENERAL_HEALTH: [
    "Stay adequately hydrated throughout the day.",
    "Get adequate rest and sleep for recovery.",
    "Maintain a healthy and balanced diet.",
    "Avoid tobacco, alcohol, and harmful substances.",
  ],
  PRESCRIPTION_HANDLING: [
    "Keep this prescription for future reference.",
    "Carry previous prescriptions during follow-up visits.",
    "Scan the QR code to access your visit summary.",
    "Share this prescription with healthcare providers when required.",
  ],
};

/** Uses visitId characters as a deterministic seed — same visit always gets the
 *  same instructions, but different visits rotate through the groups. */
function pickInstructions(visitId?: string): string[] {
  const seed = visitId
    ? visitId.replace(/-/g, "").split("").reduce((acc, c) => acc + c.charCodeAt(0), 0)
    : Math.floor(Date.now() / 1000);

  const groups = Object.values(INSTRUCTION_GROUPS);
  return groups.map((group, i) => group[(seed + i * 7) % group.length]);
}

// ─── Slot helpers ─────────────────────────────────────────────────────────────

function isSlotString(s: string): boolean {
  return /^[01]-[01]-[01]-[01]$/.test(s);
}

function parseSlot(slot: string): [boolean, boolean, boolean, boolean] {
  const parts = slot.split("-");
  return parts.map((p) => p === "1") as [boolean, boolean, boolean, boolean];
}

function resolveSlot(frequency: string): [boolean, boolean, boolean, boolean] {
  const slot = isSlotString(frequency) ? frequency : freqLabelToSlot(frequency);
  return parseSlot(slot);
}

function resolveLabel(frequency: string): string {
  if (isSlotString(frequency)) return freqSlotToLabel(frequency);
  return frequency;
}

// ─── Initials helper ──────────────────────────────────────────────────────────

function initials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function formatDate(d = new Date()): string {
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function DosageDot({ active }: { active: boolean }) {
  return (
    <div
      className={`w-7 h-7 rounded-full border-2 transition-all ${active
        ? "bg-blue-600 border-blue-600 shadow-[0_0_0_3px_rgba(37,99,235,0.15)]"
        : "bg-white border-gray-300"
        }`}
    />
  );
}

function SlotHeader({
  icon: Icon,
  label,
  sub,
}: {
  icon: React.ElementType;
  label: string;
  sub: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <Icon className="w-4 h-4 text-gray-500" />
      <span className="text-[11px] font-semibold text-gray-700 leading-none">{label}</span>
      <span className="text-[10px] text-gray-400 leading-none">({sub})</span>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ReviewModal({
  onClose,
  onEdit,
  onSave,
  patient,
  visitId,
  symptoms = [],
  findings = [],
  allFindings = [],
  prescription = [],
  tests = [],
  followUpDays,
  adviceNotes,
  doctor,
  hospital,
  vitals,
  isSaving,
}: ReviewModalProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [logoError, setLogoError] = useState(false);

  const instructions = pickInstructions(visitId);
  const accentColor = hospital?.accent_color ?? "#1268e8";
  const today = formatDate();

  // QR generation (graceful fallback if qrcode not installed)
  useEffect(() => {
    async function generateQr() {
      try {
        const QRCode = await import("qrcode");
        const lines = [
          "AREN Healthcare",
          `${doctor?.name ?? "Doctor"} — ${hospital?.name ?? "Clinic"}`,
          `Patient: ${patient?.name ?? ""}, ${patient?.age}y/${patient?.gender}`,
          `Date: ${today}  Ref: ${visitId?.slice(0, 8) ?? ""}`,
          "---",
          symptoms.length ? `Complaints: ${symptoms.join(", ")}` : "",
          findings.length ? `Findings: ${findings.join(", ")}` : "",
          "---",
          "Rx:",
          ...prescription.map((m, i) => `${i + 1}. ${m.name} — ${resolveLabel(m.frequency)} — ${m.duration}`),
          tests.length ? `Investigations: ${tests.join(", ")}` : "",
          followUpDays ? `Follow up: ${followUpDays} days` : "",
        ]
          .filter(Boolean)
          .join("\n");

        const url = await QRCode.toDataURL(lines, { width: 96, margin: 1 });
        setQrDataUrl(url);
      } catch {
        // qrcode package not installed yet — skip silently
      }
    }
    generateQr();
  }, [visitId]);

  const doctorName = doctor?.name ?? "Dr. —";
  const doctorQual = doctor?.qualification ?? "";
  const doctorReg = doctor?.registration_number ?? "";
  const doctorSpec = doctor?.specialization ?? "";
  const clinicName = hospital?.name ?? "Clinic";
  const clinicAddress = hospital?.address ?? "";
  const clinicPhone = hospital?.phone ?? "";
  const clinicLogo = hospital?.logo_url;
  const doctorAvatar = doctor?.avatar_url;
  const signatureUrl = doctor?.signature_image_url;
  const isBranded = hospital?.is_branded !== false;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-3xl max-h-[95vh] flex flex-col rounded-2xl overflow-hidden shadow-2xl bg-white">

        {/* ── Top bar ── */}
        <div className="flex items-center justify-between px-6 py-3.5 border-b border-gray-100 bg-white shrink-0">
          <button
            onClick={onEdit}
            className="flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-blue-600 transition-colors"
          >
            <Edit2 className="w-4 h-4" />
            Edit
          </button>
          <h2 className="text-[15px] font-semibold text-gray-800 tracking-tight">
            Review Prescription
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── Scrollable body ── */}
        <div ref={scrollRef} className="overflow-y-auto flex-1 bg-gray-50">

          {/* ════ PRESCRIPTION CARD ════ */}
          <div className="m-4 rounded-2xl overflow-hidden shadow-md border border-gray-200 bg-white">

            {/* ── Letterhead ── */}
            <div
              className="relative px-8 py-6"
              style={{ background: "linear-gradient(135deg, #0d1b35 0%, #120f28 60%, #1a0a2e 100%)" }}
            >
              {/* Decorative blobs */}
              <div className="absolute top-0 right-0 w-40 h-40 rounded-full opacity-[0.07]"
                style={{ background: "radial-gradient(circle, #7c3aed 0%, transparent 70%)", transform: "translate(20%, -30%)" }} />
              <div className="absolute bottom-0 left-1/3 w-32 h-32 rounded-full opacity-[0.05]"
                style={{ background: "radial-gradient(circle, #ec4899 0%, transparent 70%)", transform: "translateY(40%)" }} />

              <div className="relative flex items-start gap-6">
                {/* Clinic logo / avatar */}
                <div className="shrink-0">
                  {clinicLogo ? (
                    <img src={clinicLogo} alt={clinicName}
                      className="w-16 h-16 rounded-xl object-cover border-2 border-white/20 shadow-lg" />
                  ) : doctorAvatar ? (
                    <img src={doctorAvatar} alt={doctorName}
                      className="w-16 h-16 rounded-xl object-cover border-2 border-white/20 shadow-lg" />
                  ) : (
                    <div className="w-16 h-16 rounded-xl flex items-center justify-center text-xl font-bold text-white shadow-lg"
                      style={{ background: accentColor }}>
                      {initials(clinicName)}
                    </div>
                  )}
                </div>

                {/* Clinic info */}
                <div className="flex-1 min-w-0">
                  <h1 className="text-[22px] font-bold text-white leading-tight tracking-tight">
                    {clinicName}
                  </h1>
                  {clinicAddress && (
                    <div className="flex items-start gap-1.5 mt-1.5">
                      <MapPin className="w-3.5 h-3.5 text-white/50 mt-0.5 shrink-0" />
                      <p className="text-[12px] text-white/60 leading-relaxed">{clinicAddress}</p>
                    </div>
                  )}
                  {clinicPhone && (
                    <div className="flex items-center gap-1.5 mt-1">
                      <Phone className="w-3.5 h-3.5 text-white/50 shrink-0" />
                      <p className="text-[12px] text-white/60">{clinicPhone}</p>
                    </div>
                  )}
                </div>

                {/* Vertical divider */}
                <div className="w-px self-stretch bg-white/15 mx-2 shrink-0" />

                {/* Doctor info - increased visual weight */}
                <div className="shrink-0 text-right min-w-[160px]">
                  <p className="text-[20px] font-extrabold text-white leading-tight tracking-tight">
                    {doctorName}
                  </p>
                  {doctorQual && (
                    <p className="text-[14px] font-bold mt-1" style={{ color: accentColor }}>
                      {doctorQual}
                    </p>
                  )}
                  {doctorReg && (
                    <p className="text-[11px] text-white/60 mt-1 font-medium">Reg. No. {doctorReg}</p>
                  )}
                  {doctorSpec && (
                    <span className="inline-block mt-2 px-3 py-1 rounded-full text-[11px] font-bold text-pink-200 bg-pink-500/20 border border-pink-400/30 shadow-sm shadow-pink-500/10">
                      {doctorSpec}
                    </span>
                  )}
                </div>
              </div>

              {/* Bottom accent line */}
              <div className="absolute bottom-0 left-0 right-0 h-0.5"
                style={{ background: `linear-gradient(90deg, transparent, ${accentColor}, #7c3aed, #ec4899, transparent)` }} />
            </div>

            {/* ── Patient strip - vertical layout with prominent name ── */}
            <div className="px-8 py-5 border-b border-gray-100 bg-gradient-to-b from-blue-50/60 to-white">
              {/* Patient name - large and prominent */}
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 rounded-xl bg-blue-100">
                  <User className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <p className="text-[10px] font-bold tracking-wider text-blue-500 uppercase leading-none mb-0.5">
                    Patient
                  </p>
                  <h3 className="text-[22px] font-extrabold text-gray-900 leading-tight tracking-tight">
                    {patient.name}
                  </h3>
                </div>
              </div>

              {/* Other details in a row */}
              <div className="flex flex-wrap items-center gap-x-8 gap-y-2 pl-[52px]">
                <PatientField
                  label="AGE / SEX"
                  value={`${patient.age}Y / ${patient.gender}`}
                />
                {patient.phone && (
                  <PatientField label="PHONE" value={patient.phone} />
                )}
                <PatientField label="DATE" value={today} />
                {visitId && (
                  <PatientField
                    label="VISIT ID"
                    value={visitId.slice(0, 8) + "…"}
                    mono
                  />
                )}
              </div>
            </div>

            {/* ── Vitals ── */}
            {vitals && Object.values(vitals).some(Boolean) && (
              <div className="px-8 py-3 bg-blue-50/60 border-b border-blue-100/80 flex flex-wrap gap-5">
                {vitals.bp && <VitalChip label="BP" value={vitals.bp} unit="mmHg" />}
                {vitals.pulse && <VitalChip label="Pulse" value={vitals.pulse} unit="bpm" />}
                {vitals.temp && <VitalChip label="Temp" value={vitals.temp} unit="°F" />}
                {vitals.spo2 && <VitalChip label="SpO₂" value={vitals.spo2} unit="%" />}
                {vitals.weight && <VitalChip label="Weight" value={vitals.weight} unit="kg" />}
              </div>
            )}

            {/* ── Clinical Summary ── */}
            {(symptoms.length > 0 || findings.length > 0) && (
              <div className="px-8 py-5 border-b border-gray-100">
                <SectionTitle icon={FileText} title="Clinical Summary" />
                <div className="mt-3 grid grid-cols-2 gap-4">
                  {symptoms.length > 0 && (
                    <div className="rounded-xl border border-gray-100 bg-gray-50/80 p-4">
                      <p className="text-[10px] font-bold tracking-wider text-blue-600 uppercase mb-2.5">
                        Presenting Complaints
                      </p>
                      <ul className="space-y-1.5">
                        {symptoms.map((s) => (
                          <li key={s} className="flex items-center gap-2 text-[13px] text-gray-700">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                            {s}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {findings.length > 0 && (
                    <div className="rounded-xl border border-gray-100 bg-gray-50/80 p-4">
                      <p className="text-[10px] font-bold tracking-wider text-purple-600 uppercase mb-2.5">
                        Clinical Findings
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {findings.map((f) => (
                          <span
                            key={f}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-red-50 text-red-700 border border-red-200"
                          >
                            <AlertCircle className="w-3 h-3" />
                            {f}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── Prescription table ── */}
            {prescription.length > 0 && (
              <div className="px-8 py-5 border-b border-gray-100">
                <SectionTitle icon={RxIcon} title="Prescription" />

                <div className="mt-3 rounded-xl border border-gray-200 overflow-hidden">
                  {/* Table header */}
                  <div className="bg-gray-50 border-b border-gray-200">
                    <div className="grid items-center text-[10px] font-bold tracking-wider text-blue-600 uppercase"
                      style={{ gridTemplateColumns: "36px 1fr 220px 100px 1fr" }}>
                      <div className="px-3 py-3 text-center">#</div>
                      <div className="px-3 py-3">Medicine<br /><span className="text-gray-400 font-normal normal-case tracking-normal">(Generic)</span></div>
                      <div className="px-3 py-3">
                        <div className="text-center mb-2">Dosage Schedule</div>
                        <div className="grid grid-cols-4 text-center gap-1">
                          <SlotHeader icon={Sunrise} label="Morn" sub="M" />
                          <SlotHeader icon={Sun} label="Noon" sub="A" />
                          <SlotHeader icon={Sunset} label="Eve" sub="E" />
                          <SlotHeader icon={Moon} label="Night" sub="N" />
                        </div>
                      </div>
                      <div className="px-3 py-3 text-center">Duration</div>
                      <div className="px-3 py-3">Instructions</div>
                    </div>
                  </div>

                  {/* Medicine rows */}
                  {prescription.map((med, idx) => {
                    const [m, a, e, n] = resolveSlot(med.frequency);
                    return (
                      <div
                        key={idx}
                        className={`grid items-center border-b border-gray-100 last:border-0 ${idx % 2 === 1 ? "bg-gray-50/50" : "bg-white"
                          }`}
                        style={{ gridTemplateColumns: "36px 1fr 220px 100px 1fr" }}
                      >
                        {/* # */}
                        <div className="px-3 py-3.5 flex justify-center">
                          <span className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold text-white bg-blue-600">
                            {idx + 1}
                          </span>
                        </div>

                        {/* Medicine name */}
                        <div className="px-3 py-3.5">
                          <p className="text-[13px] font-semibold text-gray-900 leading-tight">
                            {med.name}
                          </p>
                          {(med.generic || med.strength) && (
                            <p className="text-[11px] text-gray-400 mt-0.5">
                              {[med.generic, med.strength].filter(Boolean).join(" · ")}
                            </p>
                          )}
                        </div>

                        {/* Dot grid */}
                        <div className="px-3 py-3.5">
                          <div className="grid grid-cols-4 gap-1 justify-items-center">
                            <DosageDot active={m} />
                            <DosageDot active={a} />
                            <DosageDot active={e} />
                            <DosageDot active={n} />
                          </div>
                        </div>

                        {/* Duration */}
                        <div className="px-3 py-3.5 text-center">
                          <span className="inline-flex items-center gap-1 text-[12px] text-gray-700">
                            <Calendar className="w-3 h-3 text-blue-400 shrink-0" />
                            {med.duration}
                          </span>
                        </div>

                        {/* Instructions */}
                        <div className="px-3 py-3.5">
                          {med.instructions && (
                            <p className="text-[11px] text-gray-500 leading-relaxed italic">
                              {med.instructions}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Dot legend */}
                <div className="flex items-center gap-5 mt-2.5 px-1">
                  <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
                    <div className="w-3 h-3 rounded-full bg-blue-600" />
                    = Take
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
                    <div className="w-3 h-3 rounded-full border-2 border-gray-300" />
                    = Skip
                  </div>
                  <span className="text-[11px] text-gray-400">
                    M – Morning · A – Afternoon · E – Evening · N – Night
                  </span>
                </div>
              </div>
            )}

            {/* ── Investigations ── */}
            {tests.length > 0 && (
              <div className="px-8 py-5 border-b border-gray-100">
                <SectionTitle icon={FileText} title="Investigations" accent="purple" />
                <div className="flex flex-wrap gap-2 mt-3">
                  {tests.map((t) => (
                    <span
                      key={t}
                      className="px-3 py-1.5 rounded-full text-[12px] font-medium bg-purple-50 text-purple-700 border border-purple-200"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* ── Bottom block: signature + QR + instructions - properly aligned ── */}
            <div className="px-8 py-6 grid grid-cols-3 gap-6 border-b border-gray-100 items-end">
              {/* Signature - scaled up 2x, aligned bottom */}
              <div className="flex flex-col justify-end">
                {signatureUrl ? (
                  <img src={signatureUrl} alt="Signature" className="h-24 object-contain object-left mb-1" />
                ) : (
                  <div className="h-24 border-b-2 border-gray-400 w-36 mb-1" />
                )}
                <div className="mt-1">
                  <p className="text-[15px] font-extrabold text-gray-900 leading-tight">{doctorName}</p>
                  {doctorQual && <p className="text-[13px] font-bold text-blue-600 leading-tight">{doctorQual}</p>}
                  {doctorReg && <p className="text-[11px] text-gray-500 leading-tight">Reg. No. {doctorReg}</p>}
                </div>
              </div>

              {/* QR + follow-up - centered vertically */}
              <div className="flex flex-col items-center justify-center gap-2 self-center">
                {qrDataUrl ? (
                  <img src={qrDataUrl} alt="QR Code" className="w-20 h-20 rounded-lg" />
                ) : (
                  <div className="w-20 h-20 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center">
                    <span className="text-[9px] text-gray-400 text-center leading-tight px-1">QR<br />soon</span>
                  </div>
                )}
                <p className="text-[10px] text-gray-400 text-center leading-tight">
                  Scan to view<br />visit summary
                </p>
                {followUpDays && (
                  <div className="mt-1 px-3 py-1 rounded-full bg-amber-50 border border-amber-200 text-[11px] font-medium text-amber-700">
                    Follow-up in {followUpDays} days
                  </div>
                )}
              </div>

              {/* Important instructions - aligned bottom */}
              <div className="flex flex-col justify-end">
                <p className="text-[10px] font-bold tracking-wider text-blue-600 uppercase mb-2">
                  Important Instructions
                </p>
                {/* Doctor's own notes first, if present */}
                {adviceNotes && (
                  <div className="mb-2 space-y-1">
                    {adviceNotes
                      .split("\n")
                      .filter(Boolean)
                      .map((line, i) => (
                        <p key={i} className="flex items-start gap-1.5 text-[11px] text-gray-700">
                          <ChevronRight className="w-3 h-3 text-pink-400 mt-0.5 shrink-0" />
                          {line}
                        </p>
                      ))}
                  </div>
                )}
                {/* Rotating fallback instructions */}
                <div className="space-y-1.5">
                  {instructions.map((ins, i) => (
                    <p key={i} className="flex items-start gap-1.5 text-[11px] text-gray-700 leading-relaxed">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1.5 shrink-0" />
                      {ins}
                    </p>
                  ))}
                </div>
              </div>
            </div>

            {/* ── Footer colophon - AREN CORTEX with visual strength ── */}
            <div className="px-8 py-4 bg-gradient-to-r from-gray-50 via-white to-gray-50 flex items-center justify-between border-t border-gray-100">
              <div className="flex items-center gap-4 text-[10px] text-gray-400">
                <span className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-white/80">
                  <Lock className="w-3 h-3" /> Secure
                </span>
                <span className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-white/80">
                  <Shield className="w-3 h-3" /> Private
                </span>
                <span className="px-2 py-1 rounded-md bg-white/80">Encrypted</span>
              </div>
              <p className="text-[10px] text-gray-400">Generated on: {today}</p>
              {isBranded && (
                <div className="flex items-center gap-2.5">
                  {!logoError ? (
                    <img
                      src="/src/assets/aren-logo.png"
                      alt="AREN"
                      className="w-7 h-7 object-contain"
                      onError={() => setLogoError(true)}
                    />
                  ) : (
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-[11px] font-bold shadow-sm"
                      style={{ background: "linear-gradient(135deg, #1268e8, #7c3aed)" }}>A</div>
                  )}
                  <div className="text-right">
                    <p className="text-[11px] font-extrabold text-gray-800 leading-none tracking-tight">
                      AREN
                    </p>
                    <p className="text-[9px] font-bold leading-none tracking-widest uppercase"
                      style={{
                        background: "linear-gradient(135deg, #1268e8, #7c3aed)",
                        WebkitBackgroundClip: "text",
                        WebkitTextFillColor: "transparent"
                      }}>
                      CORTEX
                    </p>
                    <p className="text-[7px] text-gray-400 leading-none mt-0.5">Powered by AREN</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Bottom action bar ── */}
        <div className="shrink-0 px-6 py-3.5 border-t border-gray-100 bg-white flex items-center gap-3">
          <button
            onClick={onEdit}
            className="flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-blue-600 transition-colors"
          >
            <Edit2 className="w-4 h-4" />
            Edit
          </button>
          <div className="flex-1" />
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <Printer className="w-4 h-4" />
            Print
          </button>
          <button
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-green-200 bg-green-50 text-sm font-medium text-green-700 hover:bg-green-100 transition-colors"
          >
            <MessageCircle className="w-4 h-4" />
            WhatsApp
          </button>
          <button
            onClick={onSave}
            disabled={isSaving}
            className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold text-white shadow-sm hover:opacity-90 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: "linear-gradient(135deg, #1268e8, #7c3aed)" }}
          >
            <CheckCircle className="w-4 h-4" />
            {isSaving ? "Saving..." : "Confirm & Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Small helper components ──────────────────────────────────────────────────

function PatientField({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div>
        <p className="text-[9px] font-bold tracking-wider text-gray-400 uppercase leading-none mb-0.5">
          {label}
        </p>
        <p
          className={`leading-tight text-gray-700 font-semibold text-[13px] ${mono ? "font-mono text-[11px]" : ""}`}
        >
          {value}
        </p>
      </div>
    </div>
  );
}

function VitalChip({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] font-bold text-blue-500 uppercase tracking-wide">{label}</span>
      <span className="text-[13px] font-semibold text-gray-800">{value}</span>
      <span className="text-[10px] text-gray-400">{unit}</span>
    </div>
  );
}

function SectionTitle({
  icon: Icon,
  title,
  accent = "blue",
}: {
  icon: React.ElementType;
  title: string;
  accent?: "blue" | "purple";
}) {
  const color = accent === "purple" ? "text-purple-600" : "text-blue-600";
  return (
    <div className={`flex items-center gap-2 ${color}`}>
      <div className={`p-1.5 rounded-lg ${accent === "purple" ? "bg-purple-50" : "bg-blue-50"}`}>
        <Icon className="w-4 h-4" />
      </div>
      <h3 className="text-[13px] font-bold tracking-wide uppercase">{title}</h3>
    </div>
  );
}

function RxIcon({ className }: { className?: string }) {
  return (
    <div className={`flex items-center justify-center font-bold text-blue-600 ${className}`}>
      <span className="text-[13px] font-black italic leading-none">Rx</span>
    </div>
  );
}