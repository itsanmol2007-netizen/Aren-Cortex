import { useEffect, useState } from "react";
import { accentPalette } from "../../lib/brand/accent";
import { RxWatermark, RxMonogram } from "../../components/RxMarks";
import { freqLabelToSlot, freqSlotToLabel } from "../../lib/db";
import type { DBDoctor, DBHospital } from "../../lib/db";
import type { PrescriptionMedicine, Vitals } from "../../types";
import type { PrintFormat } from "./usePrintFormat";

// ─── Types ────────────────────────────────────────────────────────────────────

interface DoctorShape {
    name: string;
    specialization: string | null;
    qualification: string | null;
    registration_number: string | null;
    signature_image_url: string | null;
    avatar_url: string | null;
}

export interface PrescriptionDocumentProps {
    patient: {
        name: string;
        age: string | number;
        gender: string;
        phone?: string;
    };
    visitId?: string;
    prescriptionRef?: string;
    symptoms?: string[];
    findings?: string[];
    prescription?: PrescriptionMedicine[];
    tests?: string[];
    followUpDays?: number | null;
    adviceNotes?: string;
    doctor?: DoctorShape | null;
    hospital?: DBHospital | null;
    vitals?: Vitals;
    format: PrintFormat;
    // Document date — defaults to today. Reprints (Print RX) pass the
    // original prescription date so the paper stays historically true.
    date?: Date;
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
    if (isSlotString(frequency)) return freqSlotToLabel(frequency);
    return frequency;
}

function formatDate(d = new Date()): string {
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
}

function initials(name: string): string {
    return name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
}

// ─── A5 / A4 Document ─────────────────────────────────────────────────────────

function StandardDocument({
    patient,
    prescriptionRef,
    symptoms = [],
    findings = [],
    prescription = [],
    tests = [],
    followUpDays,
    adviceNotes,
    doctor,
    hospital,
    vitals,
    format,
    date,
}: PrescriptionDocumentProps) {
    const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
    const accentColor = hospital?.accent_color ?? "#1268e8";
    /**
     * The clinic's colour as a usable ramp. THIS is the document the patient
     * actually receives: it renders off-screen and feeds print, PDF and
     * WhatsApp. The on-screen review preview is a different component, and
     * styling that one alone changed nothing a patient ever sees.
     *
     * `ink` is contrast-clamped against white, because this lands on cheap
     * stock out of a clinic laser printer and a pale brand colour must not
     * produce unreadable headings. See lib/brand/accent.ts.
     */
    const rx = accentPalette(hospital?.accent_color);
    const today = formatDate(date);

    const doctorName = doctor?.name ?? "Doctor";
    const doctorQual = doctor?.qualification ?? "";
    const doctorReg = doctor?.registration_number ?? "";
    const doctorSpec = doctor?.specialization ?? "";
    const clinicName = hospital?.name ?? "Clinic";
    const clinicAddress = hospital?.address ?? "";
    const clinicPhone = hospital?.phone ?? "";
    const signatureUrl = doctor?.signature_image_url;
    const clinicLogo = hospital?.logo_url;
    const doctorAvatar = doctor?.avatar_url;
    const isBranded = hospital?.is_branded !== false;

    const pageStyle: React.CSSProperties =
        format === "a4"
            ? { width: "210mm", minHeight: "297mm", padding: "16mm 18mm" }
            : { width: "148mm", minHeight: "210mm", padding: "10mm 12mm" };

    const headingSize = format === "a4" ? "18px" : "15px";
    const bodySize = format === "a4" ? "11px" : "9.5px";
    const smallSize = format === "a4" ? "9px" : "8px";

    useEffect(() => {
        async function gen() {
            try {
                const QRCode = await import("qrcode");
                const lines = [
                    "AREN Healthcare",
                    `${doctorName} — ${clinicName}`,
                    `Patient: ${patient.name}, ${patient.age}y/${patient.gender}`,
                    `Date: ${today}  Ref: ${prescriptionRef ?? ""}`,
                    "---",
                    symptoms.length ? `Complaints: ${symptoms.join(", ")}` : "",
                    findings.length ? `Findings: ${findings.join(", ")}` : "",
                    "---",
                    "Rx:",
                    ...prescription.map((m, i) => `${i + 1}. ${m.name} — ${resolveLabel(m.frequency)} — ${m.duration}`),
                    tests.length ? `Investigations: ${tests.join(", ")}` : "",
                    followUpDays ? `Follow up: ${followUpDays} days` : "",
                ].filter(Boolean).join("\n");
                const url = await QRCode.toDataURL(lines, { width: 80, margin: 1 });
                setQrDataUrl(url);
            } catch { /* silently skip */ }
        }
        gen();
    }, [prescriptionRef]);

    return (
        <div
            style={{
                ...pageStyle,
                backgroundColor: "#ffffff",
                fontFamily: "'Arial', sans-serif",
                color: "#111111",
                boxSizing: "border-box",
                position: "relative",
            }}
        >
            {/* ── The clinic's watermark ──────────────────────────────────
                Held at 3.5% so it is present at arm's length and invisible
                under text. Stroke-drawn rather than filled, because a filled
                shape at low opacity is the first thing a toner-starved clinic
                printer renders as a grey smear across the dosage column.
                Pinned behind everything and non-interactive. */}
            <RxWatermark
                color={rx.base}
                className="rx-doc-watermark"
            />

            {/* ── Letterhead ── */}
            <div
                style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "12px",
                    borderBottom: `3px solid ${accentColor}`,
                    paddingBottom: "10px",
                    marginBottom: "10px",
                }}
            >
                {/* Logo */}
                <div style={{ flexShrink: 0 }}>
                    {clinicLogo ? (
                        <img src={clinicLogo} alt={clinicName}
                            style={{ width: 52, height: 52, objectFit: "cover", borderRadius: 8, border: `2px solid ${accentColor}` }} />
                    ) : doctorAvatar ? (
                        <img src={doctorAvatar} alt={doctorName}
                            style={{ width: 52, height: 52, objectFit: "cover", borderRadius: 8, border: `2px solid ${accentColor}` }} />
                    ) : (
                        /* The fallback crest: initials over the clinic's colour
                           with the monogram behind them, so a clinic with no
                           uploaded logo still gets a mark of its own instead of
                           a coloured square. */
                        <div style={{
                            width: 52, height: 52, borderRadius: 8, background: rx.base,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 18, fontWeight: 900, color: rx.onBase,
                            position: "relative", overflow: "hidden",
                        }}>
                            <RxMonogram
                                color={rx.onBase}
                                className="rx-crest-mark"
                            />
                            <span style={{ position: "relative" }}>{initials(clinicName)}</span>
                        </div>
                    )}
                </div>

                {/* Clinic info */}
                <div style={{ flex: 1 }}>
                    <div style={{ fontSize: headingSize, fontWeight: 900, color: "#0d1b35", lineHeight: 1.2 }}>
                        {clinicName}
                    </div>
                    {clinicAddress && (
                        <div style={{ fontSize: smallSize, color: "#555", marginTop: 3 }}>{clinicAddress}</div>
                    )}
                    {clinicPhone && (
                        <div style={{ fontSize: smallSize, color: "#555", marginTop: 2 }}>Ph: {clinicPhone}</div>
                    )}
                </div>

                {/* Vertical rule */}
                <div style={{ width: 1, alignSelf: "stretch", background: "#e0e0e0", margin: "0 8px" }} />

                {/* Doctor info */}
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ fontSize: format === "a4" ? "16px" : "13px", fontWeight: 900, color: "#0d1b35" }}>
                        {doctorName}
                    </div>
                    {doctorQual && (
                        <div style={{ fontSize: bodySize, fontWeight: 700, color: rx.ink, marginTop: 2 }}>
                            {doctorQual}
                        </div>
                    )}
                    {doctorSpec && (
                        <div style={{ fontSize: smallSize, color: "#777", marginTop: 2 }}>{doctorSpec}</div>
                    )}
                    {doctorReg && (
                        <div style={{ fontSize: smallSize, color: "#999", marginTop: 2 }}>Reg. No. {doctorReg}</div>
                    )}
                </div>
            </div>

            {/* ── Patient strip ── */}
            <div style={{
                display: "flex", flexWrap: "wrap", gap: "14px",
                background: "#f5f8ff", border: "1px solid #dce8ff",
                borderRadius: 8, padding: "8px 12px", marginBottom: 10,
            }}>
                <PatientCell label="Patient" value={patient.name} bold />
                <PatientCell label="Age / Sex" value={`${patient.age}Y / ${patient.gender}`} />
                {patient.phone && <PatientCell label="Phone" value={patient.phone} />}
                <PatientCell label="Date" value={today} />
                {prescriptionRef && <PatientCell label="Ref" value={prescriptionRef} mono />}
            </div>

            {/* ── Vitals ── */}
            {vitals && Object.values(vitals).some(Boolean) && (
                <div style={{ display: "flex", gap: 16, marginBottom: 10, flexWrap: "wrap" }}>
                    {vitals.bp && <VitalItem label="BP" value={vitals.bp} unit="mmHg" />}
                    {vitals.pulse && <VitalItem label="Pulse" value={vitals.pulse} unit="bpm" />}
                    {vitals.respRate && <VitalItem label="RR" value={vitals.respRate} unit="/min" />}
                    {vitals.temp && <VitalItem label="Temp" value={vitals.temp} unit="°F" />}
                    {vitals.spo2 && <VitalItem label="SpO₂" value={vitals.spo2} unit="%" />}
                    {vitals.weight && <VitalItem label="Wt" value={vitals.weight} unit="kg" />}
                    {vitals.height && <VitalItem label="Ht" value={vitals.height} unit="cm" />}
                    {vitals.bloodGroup && <VitalItem label="Blood Grp" value={vitals.bloodGroup} unit="" />}
                    {/* FBS / RBS are what an Indian prescription says, and what
                        the test catalogue itself calls them. */}
                    {vitals.glucoseFasting && <VitalItem label="FBS" value={vitals.glucoseFasting} unit="mg/dL" />}
                    {vitals.glucoseRandom && <VitalItem label="RBS" value={vitals.glucoseRandom} unit="mg/dL" />}
                    {vitals.hba1c && <VitalItem label="HbA1c" value={vitals.hba1c} unit="%" />}
                    {vitals.painVas && <VitalItem label="Pain" value={vitals.painVas} unit="/10" />}
                    {vitals.romPct && <VitalItem label="ROM" value={vitals.romPct} unit="%" />}
                    {/* See the note in ReviewModal — these two were recorded but
                        printed nowhere until 2026-08-11. */}
                    {vitals.lmp && <VitalItem label="LMP" value={vitals.lmp} unit="" />}
                    {vitals.gpla && <VitalItem label="G-P-L-A" value={vitals.gpla} unit="" />}
                </div>
            )}

            {/* ── Complaints & Findings ── */}
            {(symptoms.length > 0 || findings.length > 0) && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
                    {symptoms.length > 0 && (
                        <div style={{ border: "1px solid #e5e7eb", borderRadius: 6, padding: "6px 10px" }}>
                            <div style={{ fontSize: smallSize, fontWeight: 700, color: rx.ink, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>
                                Presenting Complaints
                            </div>
                            {symptoms.map((s) => (
                                <div key={s} style={{ fontSize: bodySize, color: "#333", marginBottom: 2 }}>• {s}</div>
                            ))}
                        </div>
                    )}
                    {findings.length > 0 && (
                        <div style={{ border: "1px solid #e5e7eb", borderRadius: 6, padding: "6px 10px" }}>
                            <div style={{ fontSize: smallSize, fontWeight: 700, color: rx.ink, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>
                                Clinical Findings
                            </div>
                            {findings.map((f) => (
                                <div key={f} style={{ fontSize: bodySize, color: "#c0392b", marginBottom: 2 }}>⚠ {f}</div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* ── Rx Header ── */}
            {prescription.length > 0 && (
                <>
                    <div style={{
                        fontSize: format === "a4" ? "14px" : "12px",
                        fontWeight: 900, color: "#0d1b35", fontStyle: "italic",
                        borderBottom: `2px solid ${accentColor}`, paddingBottom: 4, marginBottom: 8,
                    }}>
                        ℞ Prescription
                    </div>

                    {/* Medicine table */}
                    <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 10, fontSize: bodySize }}>
                        <thead>
                            <tr style={{ background: "#f0f4ff" }}>
                                <th style={thStyle}>#</th>
                                <th style={{ ...thStyle, textAlign: "left" }}>Medicine</th>
                                <th style={thStyle}>M</th>
                                <th style={thStyle}>A</th>
                                <th style={thStyle}>E</th>
                                <th style={thStyle}>N</th>
                                <th style={thStyle}>Duration</th>
                                <th style={{ ...thStyle, textAlign: "left" }}>Instructions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {prescription.map((med, idx) => {
                                const [m, a, e, n] = resolveSlot(med.frequency);
                                return (
                                    <tr key={idx} style={{ background: idx % 2 === 1 ? "#fafafa" : "#fff", borderBottom: "1px solid #eee" }}>
                                        <td style={{ ...tdStyle, textAlign: "center", fontWeight: 700, color: rx.ink }}>{idx + 1}</td>
                                        <td style={{ ...tdStyle }}>
                                            <div style={{ fontWeight: 700, color: "#111" }}>{med.name}</div>
                                            {(med.composition || med.dosage_mg) && (
                                                <div style={{ fontSize: smallSize, color: "#999" }}>
                                                    {[med.composition, med.dosage_mg ? `${med.dosage_mg}mg` : ""].filter(Boolean).join(" · ")}
                                                </div>
                                            )}
                                        </td>
                                        <td style={dotTd}><Dot active={m} /></td>
                                        <td style={dotTd}><Dot active={a} /></td>
                                        <td style={dotTd}><Dot active={e} /></td>
                                        <td style={dotTd}><Dot active={n} /></td>
                                        <td style={{ ...tdStyle, textAlign: "center", whiteSpace: "nowrap" }}>{med.duration}</td>
                                        <td style={tdStyle}>
                                            <span style={{ color: "#555", fontStyle: "italic" }}>{med.instructions}</span>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>

                    <div style={{ fontSize: smallSize, color: "#999", marginBottom: 10 }}>
                        M = Morning · A = Afternoon · E = Evening · N = Night &nbsp;|&nbsp; ● = Take &nbsp; ○ = Skip
                    </div>
                </>
            )}

            {/* ── Investigations ── */}
            {tests.length > 0 && (
                <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: smallSize, fontWeight: 700, color: rx.ink, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>
                        Investigations
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {tests.map((t) => (
                            <span key={t} style={{
                                fontSize: bodySize, padding: "2px 10px", borderRadius: 999,
                                border: "1px solid #d8b4fe", color: "#6d28d9", background: "#f5f3ff",
                            }}>
                                {t}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {/* ── Bottom block: Signature | QR | Instructions ── */}
            <div style={{
                display: "grid", gridTemplateColumns: "1fr auto 1fr",
                gap: 16, marginTop: 16, paddingTop: 12,
                borderTop: "1px solid #e5e7eb", alignItems: "end",
            }}>
                {/* Signature */}
                <div>
                    {signatureUrl ? (
                        <img src={signatureUrl} alt="Signature"
                            style={{ height: format === "a4" ? 56 : 44, objectFit: "contain", objectPosition: "left", display: "block", marginBottom: 4 }} />
                    ) : (
                        <div style={{ height: format === "a4" ? 56 : 44, borderBottom: "1.5px solid #555", marginBottom: 4 }} />
                    )}
                    <div style={{ fontSize: format === "a4" ? "12px" : "10px", fontWeight: 900, color: "#111" }}>{doctorName}</div>
                    {doctorQual && <div style={{ fontSize: smallSize, fontWeight: 700, color: rx.ink }}>{doctorQual}</div>}
                    {doctorReg && <div style={{ fontSize: smallSize, color: "#999" }}>Reg. {doctorReg}</div>}
                </div>

                {/* QR + Follow-up */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                    {qrDataUrl ? (
                        <img src={qrDataUrl} alt="QR" style={{ width: 72, height: 72 }} />
                    ) : (
                        <div style={{
                            width: 72, height: 72, border: "1.5px dashed #ccc",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: "8px", color: "#aaa", borderRadius: 4,
                        }}>QR</div>
                    )}
                    <div style={{ fontSize: "8px", color: "#aaa", textAlign: "center" }}>Scan to view</div>
                    {followUpDays && (
                        <div style={{
                            fontSize: smallSize, fontWeight: 700, color: "#92400e",
                            background: "#fffbeb", border: "1px solid #fcd34d",
                            borderRadius: 999, padding: "2px 10px", marginTop: 2,
                        }}>
                            Follow-up in {followUpDays} days
                        </div>
                    )}
                </div>

                {/* Instructions */}
                <div>
                    <div style={{ fontSize: smallSize, fontWeight: 700, color: rx.ink, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>
                        Instructions
                    </div>
                    {adviceNotes && adviceNotes.split("\n").filter(Boolean).map((line, i) => (
                        <div key={i} style={{ fontSize: smallSize, color: "#444", marginBottom: 2 }}>› {line}</div>
                    ))}
                    <div style={{ fontSize: smallSize, color: "#777", marginBottom: 2 }}>• Take medicines as prescribed.</div>
                    <div style={{ fontSize: smallSize, color: "#777", marginBottom: 2 }}>• Complete the full course.</div>
                    <div style={{ fontSize: smallSize, color: "#777", marginBottom: 2 }}>• Consult if symptoms worsen.</div>
                </div>
            </div>

            {/* ── Footer ── */}
            {isBranded && (
                <div style={{
                    marginTop: 12, paddingTop: 8, borderTop: "1px solid #f0f0f0",
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                }}>
                    <div style={{ fontSize: "8px", color: "#bbb" }}>Generated: {today}</div>
                    <div style={{ fontSize: "8px", color: "#bbb", fontWeight: 700, letterSpacing: "0.1em" }}>
                        Powered by AREN CORTEX
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── Thermal Document ─────────────────────────────────────────────────────────

function ThermalDocument({
    patient,
    prescriptionRef,
    symptoms = [],
    findings = [],
    prescription = [],
    tests = [],
    followUpDays,
    adviceNotes,
    doctor,
    hospital,
    date,
}: PrescriptionDocumentProps) {
    const today = formatDate(date);
    const doctorName = doctor?.name ?? "Doctor";
    const doctorQual = doctor?.qualification ?? "";
    const doctorReg = doctor?.registration_number ?? "";
    const clinicName = hospital?.name ?? "Clinic";
    const clinicPhone = hospital?.phone ?? "";
    const signatureUrl = doctor?.signature_image_url;

    const th: React.CSSProperties = {
        fontFamily: "'Courier New', monospace",
        fontSize: "9px",
        color: "#000",
        lineHeight: 1.5,
    };

    const divider = (
        <div style={{ borderTop: "1px dashed #000", margin: "6px 0" }} />
    );

    return (
        <div style={{
            width: "76mm",
            padding: "4mm 4mm",
            background: "#fff",
            fontFamily: "'Courier New', monospace",
            fontSize: "9px",
            color: "#000",
            boxSizing: "border-box",
        }}>
            {/* Clinic */}
            <div style={{ textAlign: "center", fontWeight: 900, fontSize: "12px", marginBottom: 2 }}>
                {clinicName}
            </div>
            {clinicPhone && (
                <div style={{ textAlign: "center", fontSize: "8px", marginBottom: 2 }}>Ph: {clinicPhone}</div>
            )}
            <div style={{ textAlign: "center", fontWeight: 700, fontSize: "10px" }}>{doctorName}</div>
            {doctorQual && <div style={{ textAlign: "center", fontSize: "8px" }}>{doctorQual}</div>}
            {doctorReg && <div style={{ textAlign: "center", fontSize: "8px" }}>Reg: {doctorReg}</div>}
            {divider}

            {/* Patient */}
            <div style={th}><b>Patient:</b> {patient.name}</div>
            <div style={th}><b>Age/Sex:</b> {patient.age}Y / {patient.gender}</div>
            {patient.phone && <div style={th}><b>Phone:</b> {patient.phone}</div>}
            <div style={th}><b>Date:</b> {today}</div>
            {prescriptionRef && <div style={th}><b>Ref:</b> {prescriptionRef}</div>}
            {divider}

            {/* Complaints */}
            {symptoms.length > 0 && (
                <>
                    <div style={{ fontWeight: 700, fontSize: "8px", textTransform: "uppercase", marginBottom: 2 }}>Complaints</div>
                    {symptoms.map((s) => <div key={s} style={th}>- {s}</div>)}
                    {divider}
                </>
            )}

            {/* Findings */}
            {findings.length > 0 && (
                <>
                    <div style={{ fontWeight: 700, fontSize: "8px", textTransform: "uppercase", marginBottom: 2 }}>Findings</div>
                    {findings.map((f) => <div key={f} style={th}>! {f}</div>)}
                    {divider}
                </>
            )}

            {/* Rx */}
            {prescription.length > 0 && (
                <>
                    <div style={{ fontWeight: 900, fontSize: "11px", fontStyle: "italic", marginBottom: 4 }}>Rx</div>
                    {prescription.map((med, idx) => {
                        const [m, a, e, n] = resolveSlot(med.frequency);
                        const slots = [m && "M", a && "A", e && "E", n && "N"].filter(Boolean).join("-");
                        return (
                            <div key={idx} style={{ marginBottom: 6 }}>
                                <div style={{ fontWeight: 700, fontSize: "10px" }}>{idx + 1}. {med.name}</div>
                                {/* Composition on its own line even on the compact
                                    format. A medicine is two lines everywhere it is
                                    rendered — the pharmacist reading this needs the
                                    molecule as much as the doctor writing it did. */}
                                {med.composition && med.composition !== med.name && (
                                    <div style={{ fontSize: "8px", paddingLeft: 10, opacity: 0.75, textTransform: "capitalize" }}>
                                        {med.composition}
                                    </div>
                                )}
                                <div style={{ fontSize: "8px", paddingLeft: 10 }}>
                                    {slots} · {med.duration}
                                    {med.instructions && ` · ${med.instructions}`}
                                </div>
                            </div>
                        );
                    })}
                    {divider}
                </>
            )}

            {/* Tests */}
            {tests.length > 0 && (
                <>
                    <div style={{ fontWeight: 700, fontSize: "8px", textTransform: "uppercase", marginBottom: 2 }}>Investigations</div>
                    {tests.map((t) => <div key={t} style={th}>- {t}</div>)}
                    {divider}
                </>
            )}

            {/* Follow-up + advice */}
            {followUpDays && (
                <div style={{ fontWeight: 700, ...th }}>Follow-up: {followUpDays} days</div>
            )}
            {adviceNotes && adviceNotes.split("\n").filter(Boolean).map((line, i) => (
                <div key={i} style={th}>* {line}</div>
            ))}
            {divider}

            {/* Signature */}
            <div style={{ marginTop: 8 }}>
                {signatureUrl ? (
                    <img src={signatureUrl} alt="Sig" style={{ height: 36, objectFit: "contain", display: "block" }} />
                ) : (
                    <div style={{ borderBottom: "1px solid #000", width: 80, marginBottom: 2 }} />
                )}
                <div style={{ fontSize: "9px", fontWeight: 700 }}>{doctorName}</div>
                {doctorQual && <div style={{ fontSize: "8px" }}>{doctorQual}</div>}
            </div>
            {divider}
            <div style={{ textAlign: "center", fontSize: "7px", color: "#888" }}>AREN CORTEX</div>
        </div>
    );
}

// ─── Exported wrapper ─────────────────────────────────────────────────────────

export default function PrescriptionDocument(props: PrescriptionDocumentProps) {
    if (props.format === "thermal") {
        return <ThermalDocument {...props} />;
    }
    return <StandardDocument {...props} />;
}

// ─── Tiny inline helpers ──────────────────────────────────────────────────────

const thStyle: React.CSSProperties = {
    padding: "4px 6px",
    textAlign: "center",
    fontWeight: 700,
    fontSize: "8px",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    color: "#444",
    borderBottom: "1px solid #e0e0e0",
};

const tdStyle: React.CSSProperties = {
    padding: "5px 6px",
    verticalAlign: "middle",
    fontSize: "9px",
};

const dotTd: React.CSSProperties = {
    ...tdStyle,
    textAlign: "center",
};

function Dot({ active }: { active: boolean }) {
    return (
        <div style={{
            width: 10, height: 10, borderRadius: "50%", margin: "0 auto",
            background: active ? "#1268e8" : "transparent",
            border: `1.5px solid ${active ? "#1268e8" : "#ccc"}`,
        }} />
    );
}

function PatientCell({ label, value, bold, mono }: { label: string; value: string; bold?: boolean; mono?: boolean }) {
    return (
        <div>
            <div style={{ fontSize: "7px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#888", marginBottom: 1 }}>
                {label}
            </div>
            <div style={{
                fontSize: bold ? "13px" : "10px",
                fontWeight: bold ? 900 : 600,
                color: "#111",
                fontFamily: mono ? "monospace" : "inherit",
            }}>
                {value}
            </div>
        </div>
    );
}

function VitalItem({ label, value, unit }: { label: string; value: string; unit: string }) {
    return (
        <div style={{ display: "flex", alignItems: "baseline", gap: 3 }}>
            <span style={{ fontSize: "8px", fontWeight: 700, color: "#1268e8", textTransform: "uppercase" }}>{label}</span>
            <span style={{ fontSize: "11px", fontWeight: 700, color: "#111" }}>{value}</span>
            <span style={{ fontSize: "8px", color: "#999" }}>{unit}</span>
        </div>
    );
}