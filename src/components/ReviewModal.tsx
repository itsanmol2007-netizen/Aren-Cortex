import { useEffect, useRef, useState } from "react";
import { useReactToPrint } from "react-to-print";
import {
  X, Edit2, Printer, MessageCircle, CheckCircle,
  User, Calendar, AlertCircle, Sun, Sunrise, Sunset,
  Moon, MapPin, Phone, Shield, Lock, ChevronRight,
  FileText, Hash,
} from "lucide-react";
import { freqLabelToSlot, freqSlotToLabel } from "../lib/db";
import type { DBHospital, DBFinding } from "../lib/db";
import type { PrescriptionMedicine, Vitals } from "../types";
import PrescriptionDocument from "../features/prescription/PrescriptionDocument";
import PrintFormatSelector from "../features/prescription/PrintFormatSelector";
import { usePrintFormat } from "../features/prescription/usePrintFormat";
import { accentPalette } from "../lib/brand/accent";
import { RxMonogram, RxWatermark } from "./RxMarks";
import { matches } from "../lib/keyboard/keymap";
import { useOverlayFocus } from "../hooks/useOverlayFocus";

// ─── Types ────────────────────────────────────────────────────────────────────

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
  // Consult review flow (mode "review", the default). Optional so that
  // Print RX can open this same surface without wiring consult actions.
  onEdit?: () => void;
  onSave?: () => void;
  // "review": Consult's edit/confirm flow (default, unchanged).
  // "print":  Print RX's read-only reprint surface — no Edit, no Save; the
  //           primary action is printing. One rendering pipeline, two doors.
  mode?: "review" | "print";
  // Document date — defaults to today. Reprints of an old prescription must
  // carry the original prescription date, not the day of reprinting.
  date?: Date;
  // Fire the print flow as soon as the document is ready (Print RX's
  // one-click "Print Prescription" path).
  autoPrint?: boolean;
  // Called after the OS print dialog closes (react-to-print onAfterPrint).
  onPrinted?: () => void;
  patient: {
    id?: string;
    name: string;
    age: string | number;
    gender: string;
    phone?: string;
  };
  visitId?: string;
  prescriptionRef?: string;
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isSlotString(s: string): boolean {
  return /^[01]-[01]-[01]-[01]$/.test(s);
}
function parseSlot(slot: string): [boolean, boolean, boolean, boolean] {
  return slot.split("-").map((p) => p === "1") as [boolean, boolean, boolean, boolean];
}
function resolveSlot(frequency: string): [boolean, boolean, boolean, boolean] {
  const slot = isSlotString(frequency) ? frequency : freqLabelToSlot(frequency);
  return parseSlot(slot);
}
function resolveLabel(frequency: string): string {
  return isSlotString(frequency) ? freqSlotToLabel(frequency) : frequency;
}
function formatDate(d = new Date()): string {
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
}
function initials(name: string): string {
  return name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
}

const INSTRUCTION_GROUPS = {
  A: ["Take medicines exactly as prescribed.", "Complete the full course of medication.", "Do not stop medicines without consulting your doctor.", "Follow the prescribed dosage carefully."],
  B: ["Consult if symptoms worsen or persist.", "Seek attention if new symptoms develop.", "Attend your recommended follow-up visit.", "Contact your doctor if you miss multiple doses."],
  C: ["Stay adequately hydrated.", "Get adequate rest and sleep.", "Maintain a healthy and balanced diet.", "Avoid tobacco, alcohol, and harmful substances."],
  D: ["Keep this prescription for future reference.", "Carry previous prescriptions during follow-ups.", "Scan the QR code to access your visit summary.", "Share this with healthcare providers when required."],
};

function pickInstructions(visitId?: string): string[] {
  const seed = visitId
    ? visitId.replace(/-/g, "").split("").reduce((acc, c) => acc + c.charCodeAt(0), 0)
    : Math.floor(Date.now() / 1000);
  const groups = Object.values(INSTRUCTION_GROUPS);
  return groups.map((g, i) => g[(seed + i * 7) % g.length]);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function DosageDot({ active }: { active: boolean }) {
  return (
    <div className={`w-6 h-6 rounded-full border-2 transition-all flex-shrink-0 ${active
      ? "bg-blue-600 border-blue-600 shadow-[0_0_0_2px_rgba(37,99,235,0.2)]"
      : "bg-white border-gray-200"
      }`} />
  );
}

function SlotHeader({ icon: Icon, label, sub }: { icon: React.ElementType; label: string; sub: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <Icon className="w-3 h-3 text-gray-400" />
      <span className="text-[9px] font-bold text-gray-500 leading-none">{label}</span>
      <span className="text-[8px] text-gray-400 leading-none">({sub})</span>
    </div>
  );
}

function SectionTitle({ icon: Icon, title, accent = "blue" }: { icon: React.ElementType; title: string; accent?: "blue" | "purple" }) {
  const color = accent === "purple" ? "text-purple-600" : "text-blue-600";
  const bg = accent === "purple" ? "bg-purple-50" : "bg-blue-50/80";
  return (
    <div className={`flex items-center gap-2 ${color}`}>
      <div className={`p-1.5 rounded-lg ${bg}`}><Icon className="w-3.5 h-3.5" /></div>
      <h3 className="text-[12px] font-black tracking-widest uppercase">{title}</h3>
    </div>
  );
}

function PatientField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-[8px] font-black tracking-[0.12em] text-gray-400 uppercase leading-none mb-1">{label}</p>
      <p className={`text-gray-800 font-bold leading-tight ${mono ? "font-mono text-[11px] tracking-wider" : "text-[13px]"}`}>{value}</p>
    </div>
  );
}

function VitalChip({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="flex items-baseline gap-1">
      <span className="text-[9px] font-black text-blue-500 uppercase tracking-wider">{label}</span>
      <span className="text-[13px] font-bold text-gray-800">{value}</span>
      <span className="text-[9px] text-gray-400">{unit}</span>
    </div>
  );
}

function RxIcon() {
  return <span className="text-[13px] font-black italic text-blue-600 leading-none">Rx</span>;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ReviewModal({
  onClose, onEdit, onSave,
  patient, visitId, prescriptionRef,
  symptoms = [], findings = [], allFindings = [],
  prescription = [], tests = [],
  followUpDays, adviceNotes,
  doctor, hospital, vitals, isSaving,
  mode = "review", date, autoPrint, onPrinted,
}: ReviewModalProps) {

  const printRef = useRef<HTMLDivElement>(null);
  /**
   * Takes focus on the scrollable body, not the card — see
   * `useOverlayFocus.ts`. The body specifically, because with focus behind
   * the scrim Page Down and the arrows scrolled the WORKSPACE instead of the
   * prescription being read, which on a long Rx reads as the scroll being
   * broken.
   */
  const bodyRef = useRef<HTMLDivElement>(null);
  useOverlayFocus(bodyRef);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [logoError, setLogoError] = useState(false);
  const [showFormatPicker, setShowFormatPicker] = useState(false);

  const { format, remembered, choose } = usePrintFormat();
  const instructions = pickInstructions(visitId);
  const accentColor = hospital?.accent_color ?? "#1268e8";
  /**
   * The clinic's colour, as a usable ramp. One stored hex cannot serve a
   * heading, a hairline and a tinted band at once, and the clinic picks the
   * hex, so the tones have to be derived rather than chosen. `ink` is contrast
   * clamped against white: brand expression stops where legibility starts on a
   * document that gets printed. See lib/brand/accent.ts.
   */
  const rx = accentPalette(hospital?.accent_color);
  const isPrintMode = mode === "print";
  const today = formatDate(date);

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

  // QR generation
  useEffect(() => {
    async function generateQr() {
      try {
        const QRCode = await import("qrcode");
        const lines = [
          "AREN Healthcare",
          `${doctorName} — ${clinicName}`,
          `Patient: ${patient.name}, ${patient.age}y/${patient.gender}`,
          `Date: ${today}  Ref: ${prescriptionRef ?? visitId?.slice(0, 8) ?? ""}`,
          "---",
          symptoms.length ? `Complaints: ${symptoms.join(", ")}` : "",
          findings.length ? `Findings: ${findings.join(", ")}` : "",
          "---",
          "Rx:",
          ...prescription.map((m, i) => `${i + 1}. ${m.name} — ${resolveLabel(m.frequency)} — ${m.duration}`),
          tests.length ? `Investigations: ${tests.join(", ")}` : "",
          followUpDays ? `Follow up: ${followUpDays} days` : "",
        ].filter(Boolean).join("\n");
        const url = await QRCode.toDataURL(lines, { width: 96, margin: 1 });
        setQrDataUrl(url);
      } catch { /* skip */ }
    }
    generateQr();
  }, [visitId, prescriptionRef]);

  // Print handler
  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `${patient.name}_${prescriptionRef ?? visitId?.slice(0, 8) ?? "prescription"}`,
    onAfterPrint: () => onPrinted?.(),
    pageStyle: format === "thermal"
      ? `@page { size: 80mm auto; margin: 0; } body { margin: 0; }`
      : format === "a5"
        ? `@page { size: A5 portrait; margin: 0; } body { margin: 0; }`
        : `@page { size: A4 portrait; margin: 0; } body { margin: 0; }`,
  });

  function handlePrintClick() {
    if (remembered) {
      handlePrint();
    } else {
      setShowFormatPicker(true);
    }
  }

  // One-click printing from Print RX: fire the normal print flow once the
  // hidden document has had a moment to settle (QR arrives async — wait for
  // it briefly, but never hold the receptionist hostage to it).
  const autoPrintFired = useRef(false);
  useEffect(() => {
    if (!autoPrint || autoPrintFired.current) return;
    const delay = qrDataUrl ? 80 : 900;
    const t = setTimeout(() => {
      if (autoPrintFired.current) return;
      autoPrintFired.current = true;
      handlePrintClick();
    }, delay);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPrint, qrDataUrl]);

  function handleFormatConfirm(f: Parameters<typeof choose>[0], remember: boolean) {
    choose(f, remember);
    setShowFormatPicker(false);
    // Small delay so format state updates before print fires
    setTimeout(() => handlePrint(), 100);
  }

  /**
   * ── The last three keys of a consult ────────────────────────────────────
   *
   * This is the end of the keyboard path that starts at patient intake, and
   * until now it was where that path stopped: the doctor arrived here with
   * Ctrl+Enter and then had to reach for the mouse to press the button two
   * inches away. Worse, the global handler was catching Ctrl+Enter over this
   * modal and re-opening the review it was already showing, so the obvious
   * key did visibly nothing. `useConsultKeyboard` now stands down while an
   * overlay is up, which is what makes these three bindings reachable at all.
   *
   * Ctrl+P is claimed rather than left to the browser deliberately. The
   * browser's own print would render the MODAL — scrim, buttons and all —
   * instead of `PrescriptionDocument`, which is a wrong prescription on real
   * paper, so cancelling that default is a correctness fix and not a
   * convenience.
   *
   * Escape means "back to editing" rather than "discard": nothing here is
   * saved yet, `onEdit` returns the doctor to the workspace with the plan
   * intact, and in print mode there is no edit to go back to so it closes.
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // The format picker is a modal ON this modal and owns its own keys.
      if (showFormatPicker) return;

      if (matches(e, "reviewPrint")) {
        e.preventDefault();
        e.stopPropagation();
        handlePrintClick();
        return;
      }
      if (matches(e, "reviewSave")) {
        e.preventDefault();
        e.stopPropagation();
        // Print mode is a reprint of something already saved — there is no
        // `onSave` wired, and inventing one would write a second consult.
        if (!isPrintMode && onSave && !isSaving) onSave();
        return;
      }
      if (matches(e, "reviewBack")) {
        e.preventDefault();
        e.stopPropagation();
        if (!isPrintMode && onEdit) onEdit(); else onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showFormatPicker, isPrintMode, isSaving, onSave, onEdit, onClose, remembered, format]);

  return (
    <>
      {/* ── Print Format Picker ── */}
      {showFormatPicker && (
        <PrintFormatSelector
          current={format}
          remembered={remembered}
          onConfirm={handleFormatConfirm}
          onClose={() => setShowFormatPicker(false)}
        />
      )}

      {/* ── Hidden print document ── */}
      <div style={{ position: "absolute", left: "-9999px", top: 0, pointerEvents: "none" }}>
        <div ref={printRef}>
          <PrescriptionDocument
            patient={patient}
            visitId={visitId}
            prescriptionRef={prescriptionRef}
            symptoms={symptoms}
            findings={findings}
            prescription={prescription}
            tests={tests}
            followUpDays={followUpDays}
            adviceNotes={adviceNotes}
            doctor={doctor}
            hospital={hospital}
            vitals={vitals}
            format={format}
            date={date}
          />
        </div>
      </div>

      {/* ── Modal overlay ── */}
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4">
        <div className="relative w-full max-w-3xl max-h-[95vh] flex flex-col rounded-2xl overflow-hidden shadow-2xl bg-white">

          {/* Top bar */}
          <div className="flex items-center justify-between px-6 py-3.5 border-b border-gray-100 bg-white shrink-0">
            {isPrintMode ? (
              <div className="w-14" aria-hidden />
            ) : (
              <button onClick={onEdit}
                className="flex items-center gap-1.5 text-sm font-semibold text-gray-400 hover:text-blue-600 transition-colors">
                <Edit2 className="w-3.5 h-3.5" /> Edit
              </button>
            )}
            <h2 className="text-[15px] font-black text-gray-900 tracking-tight">
              {isPrintMode ? "Print Prescription" : "Review Prescription"}
            </h2>
            <button onClick={onClose}
              className="p-1.5 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Scrollable body. `tabIndex={-1}` is programmatic focus only —
              never a Tab stop. The focus ring IS shown, deliberately — see
              `.cx-kbd-surface` in consult.css for why an overlay's landing
              pad must stay visible rather than being suppressed. This
              component is Tailwind end to end, so the equivalent ring is
              built from utilities here instead of that shared class
              (doctrine rule 7 — don't mix styling vocabularies in one file). */}
          <div
            ref={bodyRef}
            tabIndex={-1}
            className="overflow-y-auto flex-1 bg-gray-50/80 outline-none focus:ring-[3px] focus:ring-blue-100 focus:ring-inset focus:shadow-[inset_0_0_0_1px_#1268e8]"
          >
            <div className="m-4 rounded-2xl overflow-hidden shadow-lg border border-gray-200/80 bg-white">

              {/* ══ Letterhead ══ */}
              <div
                className="relative px-8 py-6 overflow-hidden"
                style={{ background: "linear-gradient(135deg, #060d1f 0%, #0d1b35 40%, #120f28 75%, #1a0730 100%)" }}
              >
                {/* Decorative orbs */}
                <div className="absolute -top-8 -right-8 w-48 h-48 rounded-full opacity-[0.12]"
                  style={{ background: "radial-gradient(circle, #7c3aed 0%, transparent 70%)" }} />
                <div className="absolute -bottom-6 left-1/4 w-40 h-40 rounded-full opacity-[0.08]"
                  style={{ background: "radial-gradient(circle, #ec4899 0%, transparent 70%)" }} />
                <div className="absolute top-1/2 -translate-y-1/2 left-1/2 w-64 h-64 rounded-full opacity-[0.04]"
                  style={{ background: "radial-gradient(circle, #1268e8 0%, transparent 60%)" }} />

                <div className="relative flex items-center gap-6">
                  {/* Logo */}
                  <div className="shrink-0">
                    {clinicLogo && !logoError ? (
                      <img src={clinicLogo} alt={clinicName} onError={() => setLogoError(true)}
                        className="w-16 h-16 rounded-xl object-cover border-2 shadow-xl"
                        style={{ borderColor: "rgba(255,255,255,0.2)" }} />
                    ) : doctorAvatar ? (
                      <img src={doctorAvatar} alt={doctorName}
                        className="w-16 h-16 rounded-xl object-cover border-2 shadow-xl"
                        style={{ borderColor: "rgba(255,255,255,0.2)" }} />
                    ) : (
                      /* The fallback crest. Initials over the clinic's own
                         colour, with the monogram behind them, so a clinic
                         that has not uploaded a logo still gets a mark that is
                         theirs rather than a coloured square. */
                      <div className="w-16 h-16 rounded-xl flex items-center justify-center relative overflow-hidden shadow-xl"
                        style={{ background: rx.base }}>
                        <RxMonogram
                          color={rx.onBase}
                          className="absolute inset-0 w-full h-full opacity-20"
                        />
                        <span className="relative text-xl font-black" style={{ color: rx.onBase }}>
                          {initials(clinicName)}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Clinic info */}
                  <div className="flex-1 min-w-0">
                    <h1 className="text-[22px] font-black text-white leading-tight tracking-tight">
                      {clinicName}
                    </h1>
                    {clinicAddress && (
                      <div className="flex items-start gap-1.5 mt-2">
                        <MapPin className="w-3 h-3 mt-0.5 shrink-0" style={{ color: "rgba(255,255,255,0.45)" }} />
                        <p className="text-[11px] leading-relaxed" style={{ color: "rgba(255,255,255,0.55)" }}>
                          {clinicAddress}
                        </p>
                      </div>
                    )}
                    {clinicPhone && (
                      <div className="flex items-center gap-1.5 mt-1">
                        <Phone className="w-3 h-3 shrink-0" style={{ color: "rgba(255,255,255,0.45)" }} />
                        <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.55)" }}>{clinicPhone}</p>
                      </div>
                    )}
                  </div>

                  {/* Divider */}
                  <div className="w-px self-stretch mx-2 shrink-0" style={{ background: "rgba(255,255,255,0.12)" }} />

                  {/* Doctor info */}
                  <div className="shrink-0 text-right min-w-[155px]">
                    <p className="text-[21px] font-black text-white leading-tight tracking-tight">{doctorName}</p>
                    {doctorQual && (
                      <p className="text-[14px] font-bold mt-1" style={{ color: accentColor }}>{doctorQual}</p>
                    )}
                    {doctorReg && (
                      <p className="text-[10px] font-medium mt-1" style={{ color: "rgba(255,255,255,0.50)" }}>
                        Reg. No. {doctorReg}
                      </p>
                    )}
                    {doctorSpec && (
                      /* Was hardcoded pink, on every clinic's sheet. It takes
                         the clinic's own colour now. */
                      <span className="inline-block mt-2 px-3 py-1 rounded-full text-[10px] font-black tracking-wide"
                        style={{
                          color: rx.tint,
                          background: `${rx.base}2e`,
                          border: `1px solid ${rx.base}66`,
                        }}>
                        {doctorSpec}
                      </span>
                    )}
                  </div>
                </div>

                {/* ── The accent line ──────────────────────────────────────
                    This blended the clinic's colour into hardcoded #7c3aed and
                    #ec4899, so a clinic that chose forest green got green
                    fading through purple into pink, and every clinic's
                    prescription came out looking like the same violet house
                    style. The stored colour is now the only hue in it. */}
                <div className="absolute bottom-0 left-0 right-0 h-[2px]"
                  style={{
                    background:
                      `linear-gradient(90deg, ${rx.base}00 0%, ${rx.base} 18%, ` +
                      `${rx.base} 62%, ${rx.base}00 100%)`,
                  }} />
              </div>

              {/* ══ Patient strip ══ */}
              <div className="px-8 py-5 border-b border-gray-100 bg-gradient-to-b from-blue-50/40 to-white">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 rounded-xl bg-blue-100/80">
                    <User className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-[9px] font-black tracking-[0.14em] text-blue-500 uppercase leading-none mb-1">Patient</p>
                    <h3 className="text-[22px] font-black text-gray-900 leading-tight tracking-tight">{patient.name}</h3>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-x-8 gap-y-3 pl-[52px]">
                  <PatientField label="Age / Sex" value={`${patient.age}Y / ${patient.gender}`} />
                  {patient.phone && <PatientField label="Phone" value={patient.phone} />}
                  <PatientField label="Date" value={today} />
                  {prescriptionRef ? (
                    <div>
                      <p className="text-[8px] font-black tracking-[0.12em] text-gray-400 uppercase leading-none mb-1">Ref</p>
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-600 text-white font-mono text-[12px] font-bold tracking-wider shadow-sm">
                        <Hash className="w-3 h-3" />
                        {prescriptionRef}
                      </span>
                    </div>
                  ) : visitId ? (
                    <PatientField label="Ref" value={"#" + visitId.slice(0, 8).toUpperCase()} mono />
                  ) : null}
                </div>
              </div>

              {/* ══ Vitals ══ */}
              {vitals && Object.values(vitals).some(Boolean) && (
                <div className="px-8 py-3 border-b border-blue-100/60 bg-blue-50/40 flex flex-wrap gap-6">
                  {vitals.bp && <VitalChip label="BP" value={vitals.bp} unit="mmHg" />}
                  {vitals.pulse && <VitalChip label="Pulse" value={vitals.pulse} unit="bpm" />}
                  {vitals.respRate && <VitalChip label="Resp Rate" value={vitals.respRate} unit="/min" />}
                  {vitals.temp && <VitalChip label="Temp" value={vitals.temp} unit="°F" />}
                  {vitals.spo2 && <VitalChip label="SpO₂" value={vitals.spo2} unit="%" />}
                  {vitals.weight && <VitalChip label="Weight" value={vitals.weight} unit="kg" />}
                  {vitals.height && <VitalChip label="Height" value={vitals.height} unit="cm" />}
                  {vitals.bloodGroup && <VitalChip label="Blood Group" value={vitals.bloodGroup} unit="" />}
                  {vitals.glucoseFasting && <VitalChip label="Fasting Glucose" value={vitals.glucoseFasting} unit="mg/dL" />}
                  {vitals.glucoseRandom && <VitalChip label="Random Glucose" value={vitals.glucoseRandom} unit="mg/dL" />}
                  {vitals.hba1c && <VitalChip label="HbA1c" value={vitals.hba1c} unit="%" />}
                  {vitals.painVas && <VitalChip label="Pain" value={vitals.painVas} unit="/10" />}
                  {vitals.romPct && <VitalChip label="ROM" value={vitals.romPct} unit="%" />}
                  {/* Added 2026-08-11. These two shipped with §14.8 the day
                      before and never reached either print surface — the same
                      defect §10.6 had already found and fixed once for
                      height / blood group / pain / ROM. Every field added to
                      MEASURE_FIELDS has to be added here and in
                      PrescriptionDocument, or it is recorded and invisible. */}
                  {vitals.lmp && <VitalChip label="LMP" value={vitals.lmp} unit="" />}
                  {vitals.gpla && <VitalChip label="G-P-L-A" value={vitals.gpla} unit="" />}
                </div>
              )}

              {/* ══ Clinical Summary ══ */}
              {(symptoms.length > 0 || findings.length > 0) && (
                <div className="px-8 py-5 border-b border-gray-100">
                  <SectionTitle icon={FileText} title="Clinical Summary" />
                  <div className="mt-3 grid grid-cols-2 gap-4">
                    {symptoms.length > 0 && (
                      <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-4">
                        <p className="text-[9px] font-black tracking-[0.12em] text-blue-600 uppercase mb-3">
                          Presenting Complaints
                        </p>
                        <ul className="space-y-2">
                          {symptoms.map((s) => (
                            <li key={s} className="flex items-center gap-2 text-[12px] text-gray-700 font-medium">
                              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />{s}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {findings.length > 0 && (
                      <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-4">
                        <p className="text-[9px] font-black tracking-[0.12em] text-purple-600 uppercase mb-3">
                          Clinical Findings
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {findings.map((f) => (
                            <span key={f}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-red-50 text-red-700 border border-red-200">
                              <AlertCircle className="w-3 h-3" />{f}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ══ Prescription table ══ */}
              {prescription.length > 0 && (
                <div className="px-8 py-5 border-b border-gray-100 relative">
                  {/* The watermark. Held at 4% and pinned behind the table, in
                      the clinic's colour, so the sheet is recognisably theirs
                      at arm's length. Stroke-drawn rather than filled so a
                      printer that renders it heavy still leaves the dosage
                      text on top readable. `pointer-events-none` so it can
                      never intercept a click on a row. */}
                  <RxWatermark
                    color={rx.base}
                    className="pointer-events-none absolute right-6 top-8 w-[132px] h-[132px] opacity-[0.04]"
                  />
                  <div className="relative">
                    <SectionTitle icon={() => <RxIcon />} title="Prescription" />
                  </div>

                  <div className="relative mt-3 rounded-xl border border-gray-200/80 overflow-hidden">
                    {/* Header */}
                    <div className="bg-gray-50/80 border-b border-gray-200">
                      <div className="grid items-center"
                        style={{ gridTemplateColumns: "32px 1fr 168px 88px 1fr" }}>
                        <div className="px-3 py-3 text-center text-[9px] font-black tracking-wider text-blue-600 uppercase">#</div>
                        <div className="px-3 py-3 text-[9px] font-black tracking-wider text-blue-600 uppercase">
                          Medicine<br />
                          <span className="text-gray-400 font-normal normal-case tracking-normal text-[9px]">(Generic)</span>
                        </div>
                        <div className="px-2 py-2 text-[9px] font-black tracking-wider text-blue-600 uppercase">
                          <div className="text-center mb-2">Dosage</div>
                          <div className="grid grid-cols-4 text-center">
                            <SlotHeader icon={Sunrise} label="Morn" sub="M" />
                            <SlotHeader icon={Sun} label="Noon" sub="A" />
                            <SlotHeader icon={Sunset} label="Eve" sub="E" />
                            <SlotHeader icon={Moon} label="Night" sub="N" />
                          </div>
                        </div>
                        <div className="px-3 py-3 text-center text-[9px] font-black tracking-wider text-blue-600 uppercase">Duration</div>
                        <div className="px-3 py-3 text-[9px] font-black tracking-wider text-blue-600 uppercase">Instructions</div>
                      </div>
                    </div>

                    {/* Rows */}
                    {prescription.map((med, idx) => {
                      const [m, a, e, n] = resolveSlot(med.frequency);
                      return (
                        <div key={idx}
                          className={`grid items-center border-b border-gray-100 last:border-0 ${idx % 2 === 1 ? "bg-gray-50/40" : "bg-white"}`}
                          style={{ gridTemplateColumns: "32px 1fr 168px 88px 1fr" }}>
                          <div className="px-3 py-3.5 flex justify-center">
                            <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black text-white bg-blue-600">
                              {idx + 1}
                            </span>
                          </div>
                          <div className="px-3 py-3.5">
                            <p className="text-[13px] font-bold text-gray-900 leading-tight">{med.name}</p>
                            {(med.composition || med.dosage_mg) && (
                              <p className="text-[10px] text-gray-400 mt-0.5">
                                {[med.composition, med.dosage_mg ? `${med.dosage_mg}mg` : ""].filter(Boolean).join(" · ")}
                              </p>
                            )}
                          </div>
                          <div className="px-2 py-3.5">
                            <div className="grid grid-cols-4 gap-1 justify-items-center">
                              <DosageDot active={m} />
                              <DosageDot active={a} />
                              <DosageDot active={e} />
                              <DosageDot active={n} />
                            </div>
                          </div>
                          <div className="px-3 py-3.5 text-center">
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-gray-700">
                              <Calendar className="w-3 h-3 text-blue-400 shrink-0" />
                              {med.duration}
                            </span>
                          </div>
                          <div className="px-3 py-3.5">
                            {med.instructions && (
                              <p className="text-[10px] text-gray-500 leading-relaxed italic">{med.instructions}</p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex items-center gap-5 mt-2.5 px-1">
                    <div className="flex items-center gap-1.5 text-[10px] text-gray-500">
                      <div className="w-3 h-3 rounded-full bg-blue-600" /> = Take
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] text-gray-500">
                      <div className="w-3 h-3 rounded-full border-2 border-gray-300" /> = Skip
                    </div>
                    <span className="text-[10px] text-gray-400">M – Morning · A – Afternoon · E – Evening · N – Night</span>
                  </div>
                </div>
              )}

              {/* ══ Investigations ══ */}
              {tests.length > 0 && (
                <div className="px-8 py-5 border-b border-gray-100">
                  <SectionTitle icon={FileText} title="Investigations" accent="purple" />
                  <div className="flex flex-wrap gap-2 mt-3">
                    {tests.map((t) => (
                      <span key={t}
                        className="px-3 py-1.5 rounded-full text-[11px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* ══ Bottom: Signature | QR | Instructions ══ */}
              <div className="px-8 py-6 grid grid-cols-3 gap-6 border-b border-gray-100 items-end">

                {/* Signature block */}
                <div>
                  <div className="rounded-xl border border-gray-100 bg-gray-50/60 px-4 pt-4 pb-3">
                    {signatureUrl ? (
                      <img src={signatureUrl} alt="Signature"
                        className="h-14 w-full object-contain object-left mb-3" />
                    ) : (
                      <div className="h-14 border-b-2 border-gray-300 mb-3" />
                    )}
                    <div className="border-t border-gray-100 pt-2.5">
                      <p className="text-[14px] font-black text-gray-900 leading-tight">{doctorName}</p>
                      {doctorQual && (
                        <p className="text-[12px] font-bold leading-tight mt-0.5" style={{ color: accentColor }}>{doctorQual}</p>
                      )}
                      {doctorReg && (
                        <p className="text-[10px] text-gray-400 leading-tight mt-0.5">Reg. {doctorReg}</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* QR + follow-up */}
                <div className="flex flex-col items-center gap-2 self-center">
                  {qrDataUrl ? (
                    <img src={qrDataUrl} alt="QR Code" className="w-20 h-20 rounded-lg" />
                  ) : (
                    <div className="w-20 h-20 rounded-lg border-2 border-dashed border-gray-200 flex items-center justify-center">
                      <span className="text-[8px] text-gray-300 text-center leading-tight">QR</span>
                    </div>
                  )}
                  <p className="text-[9px] text-gray-400 text-center leading-tight">Scan to view<br />visit summary</p>
                  {followUpDays && (
                    <div className="px-3 py-1 rounded-full bg-amber-50 border border-amber-200 text-[11px] font-bold text-amber-700">
                      Follow-up in {followUpDays} days
                    </div>
                  )}
                </div>

                {/* Instructions */}
                <div>
                  <p className="text-[9px] font-black tracking-[0.12em] text-blue-600 uppercase mb-2.5">
                    Important Instructions
                  </p>
                  {adviceNotes && (
                    <div className="mb-2 space-y-1.5">
                      {adviceNotes.split("\n").filter(Boolean).map((line, i) => (
                        <p key={i} className="flex items-start gap-1.5 text-[11px] text-gray-700 font-medium">
                          <ChevronRight className="w-3 h-3 text-pink-400 mt-0.5 shrink-0" />{line}
                        </p>
                      ))}
                    </div>
                  )}
                  <div className="space-y-1.5">
                    {instructions.map((ins, i) => (
                      <p key={i} className="flex items-start gap-1.5 text-[10px] text-gray-500 leading-relaxed">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-300 mt-1.5 shrink-0" />{ins}
                      </p>
                    ))}
                  </div>
                </div>
              </div>

              {/* ══ Footer ══ */}
              <div className="px-8 py-4 bg-gradient-to-r from-gray-50 via-white to-gray-50 flex items-center justify-between border-t border-gray-100">
                <div className="flex items-center gap-3 text-[9px] text-gray-400">
                  <span className="flex items-center gap-1 px-2 py-1 rounded-md bg-white/80 border border-gray-100">
                    <Lock className="w-2.5 h-2.5" /> Secure
                  </span>
                  <span className="flex items-center gap-1 px-2 py-1 rounded-md bg-white/80 border border-gray-100">
                    <Shield className="w-2.5 h-2.5" /> Private
                  </span>
                </div>
                <p className="text-[9px] text-gray-400">Generated: {today}</p>
                {isBranded && (
                  <div className="flex items-center gap-2">
                    {!logoError ? (
                      <img src="/src/assets/aren-logo-w.png" alt="AREN"
                        className="w-6 h-6 object-contain" onError={() => setLogoError(true)} />
                    ) : (
                      <div className="w-6 h-6 rounded-lg flex items-center justify-center text-white text-[10px] font-black"
                        style={{ background: "linear-gradient(135deg, #1268e8, #7c3aed)" }}>A</div>
                    )}
                    <div className="text-right">
                      <p className="text-[11px] font-black text-gray-800 leading-none tracking-tight">AREN</p>
                      <p className="text-[8px] font-black leading-none tracking-widest uppercase"
                        style={{ background: "linear-gradient(135deg, #1268e8, #7c3aed)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                        CORTEX
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── Bottom action bar ── */}
          {isPrintMode ? (
            <div className="shrink-0 px-6 py-3.5 border-t border-gray-100 bg-white flex items-center gap-3">
              <p className="text-[11.5px] text-gray-400 leading-snug max-w-[320px]">
                The standard print window handles printer, paper size (A4, A5, Thermal) and copies.
              </p>
              <div className="flex-1" />

              <button onClick={onClose}
                className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors">
                Close
              </button>

              <button onClick={handlePrintClick}
                className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-bold text-white shadow-sm hover:opacity-90 active:scale-95 transition-all"
                style={{ background: "linear-gradient(135deg, #1268e8, #7c3aed)" }}>
                <Printer className="w-4 h-4" /> Print Prescription
              </button>
            </div>
          ) : (
            <div className="shrink-0 px-6 py-3.5 border-t border-gray-100 bg-white flex items-center gap-3">
              <button onClick={onEdit}
                className="flex items-center gap-1.5 text-sm font-semibold text-gray-400 hover:text-blue-600 transition-colors">
                <Edit2 className="w-3.5 h-3.5" /> Edit
              </button>
              <div className="flex-1" />

              <button onClick={handlePrintClick}
                className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors">
                <Printer className="w-4 h-4" /> Print / Save PDF
                {/* The chord, on the control it fires. This modal is Tailwind
                    end to end, so the key cap is built from utilities here
                    rather than borrowing consult.css's `.cs-kbd` — mixing the
                    two vocabularies in one component is doctrine rule 7. */}
                <kbd className="rounded border border-gray-200 bg-gray-50 px-1.5 text-[11px] font-semibold not-italic leading-5 text-gray-400">
                  Ctrl P
                </kbd>
              </button>

              <button
                className="flex items-center gap-2 px-4 py-2 rounded-xl border border-green-200 bg-green-50 text-sm font-semibold text-green-700 hover:bg-green-100 transition-colors">
                <MessageCircle className="w-4 h-4" /> WhatsApp
              </button>

              <button onClick={onSave} disabled={isSaving}
                className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-bold text-white shadow-sm hover:opacity-90 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ background: "linear-gradient(135deg, #1268e8, #7c3aed)" }}>
                <CheckCircle className="w-4 h-4" />
                {isSaving ? "Saving..." : "Confirm & Save"}
                <kbd className="rounded border border-white/25 bg-white/15 px-1.5 text-[11px] font-semibold not-italic leading-5 text-white/80">
                  Ctrl ⏎
                </kbd>
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}