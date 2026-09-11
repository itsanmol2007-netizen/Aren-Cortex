import { useEffect, useState } from "react";
import { accentPalette, type AccentPalette } from "../../lib/brand/accent";
import { RxWatermark, RxMonogram, RxRule } from "../../components/RxMarks";
import { freqLabelToSlot, freqSlotToLabel } from "../../lib/db";
import type { DBDoctor, DBHospital } from "../../lib/db";
import type { PrescriptionMedicine, Vitals } from "../../types";
import { MEASURE_FIELDS } from "../consult/measures";
import type { PrintFormat } from "./usePrintFormat";
import { DEFAULT_PRESCRIPTION_CONFIG, type PrescriptionConfig } from "../../lib/db/clinic";
import { rxLabels, hiName, localizeTiming, localizeMeasureLabel, type RxLanguage } from "../../lib/i18n/prescriptionLabels";
import arenLogo from "../../assets/aren-logo-w.png";

/**
 * The one clinic accent, for every clinic. This used to read
 * `hospital.accent_color` — a clinic could pick white and the entire
 * letterhead border, section rules and watermark would vanish into the
 * white page (Anmol, 2026-09-11: "a useless complexity"). One fixed,
 * tested-legible blue removes both the picker and the failure mode; nothing
 * below reads `hospital.accent_color` any more.
 */
const FIXED_ACCENT = "#1268e8";

/**
 * A fixed, deliberately hue-less ramp for `config.printMode === "monochrome"`
 * — NOT `accentPalette("#000000")`. That function's saturation floor
 * (`Math.max(0.35, …)`, there to stop a genuinely near-grey BRAND colour from
 * producing a "boring" ramp) reads pure black as hue 0 at 35% saturation and
 * hands back a dusty ROSE-grey, not neutral — the opposite of what a
 * black-and-white printer needs. Every accent usage in `StandardDocument`
 * reads through `rx`/`accentColor`, so swapping the source here is the whole
 * fix — no per-usage edits below.
 */
const MONOCHROME_PALETTE: AccentPalette = {
    base: "#171717", ink: "#171717", mid: "#4b5563",
    tint: "#f3f4f6", veil: "#fafafa", onBase: "#ffffff",
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface DoctorShape {
    name: string;
    /** Devanagari name, confirmed once — see lib/i18n/prescriptionLabels.ts's `hiName()`. */
    name_hi?: string | null;
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
    /** delivered in the clinic today — printed as its own section */
    therapyNotes?: string;
    /** the home programme, one formatted line each */
    exerciseLines?: string[];
    doctor?: DoctorShape | null;
    hospital?: DBHospital | null;
    vitals?: Vitals;
    format: PrintFormat;
    // Document date — defaults to today. Reprints (Print RX) pass the
    // original prescription date so the paper stays historically true.
    date?: Date;
    /**
     * Which language the document's own chrome (section headings, the
     * M/A/E/N legend, the QR caption, the footer line) renders in. Defaults
     * to English. Never touches the doctor's own words — advice notes,
     * therapy notes, medicine and patient names print exactly as typed in
     * every language. See `lib/i18n/prescriptionLabels.ts`.
     */
    language?: RxLanguage;
    /**
     * The clinic's own prescription configuration — what the Prescription
     * Editor (features/clinic/PrescriptionEditorPage.tsx) writes into
     * `prescription_settings`. THIS is the "rendering system ≠ editing
     * system" split the Clinic brief is strict about: the editor never draws
     * a prescription of its own, it produces this object and hands it to the
     * one renderer.
     *
     * Optional, and its default (`DEFAULT_PRESCRIPTION_CONFIG`) reproduces
     * this document EXACTLY as it rendered before the config existed — so a
     * caller that hasn't been taught about it, and a clinic that never opened
     * the editor, both print what they always printed.
     */
    config?: PrescriptionConfig;
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
    therapyNotes,
    exerciseLines = [],
    doctor,
    hospital,
    vitals,
    format,
    date,
    language,
    config = DEFAULT_PRESCRIPTION_CONFIG,
}: PrescriptionDocumentProps) {
    const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
    const lang: RxLanguage = language ?? "en";
    const t = rxLabels(lang);
    // Typography — a first-class design requirement for Hindi, not a fallback
    // font substitution. Arial has no real Devanagari shaping; whatever the
    // OS falls back to renders conjuncts/matras badly and compresses the
    // line-height. Noto Sans Devanagari (loaded in index.html) gets proper
    // shaping, and Devanagari genuinely needs MORE vertical room than Latin
    // text at the same font-size — matras and conjuncts extend above and
    // below the baseline further than Latin ascenders/descenders do, so a
    // line-height tuned for Arial clips them. Never compress Hindi to fit
    // the English layout; the container adapts, not the script.
    const isDevanagari = lang === "hi";
    const docFontFamily = isDevanagari
        ? "'Noto Sans Devanagari', 'Arial', sans-serif"
        : "'Arial', sans-serif";
    const docLineHeight = isDevanagari ? 1.6 : 1.3;
    const monochrome = config.printMode === "monochrome";
    const accentColor = monochrome ? MONOCHROME_PALETTE.base : FIXED_ACCENT;
    /**
     * The one clinic accent, as a usable ramp. THIS is the document the
     * patient actually receives: it renders off-screen and feeds print, PDF
     * and WhatsApp. The on-screen review preview is a different component,
     * and styling that one alone changed nothing a patient ever sees.
     *
     * `ink` is contrast-clamped against white — see lib/brand/accent.ts.
     * `accentPalette()` with no argument already resolves to `FIXED_ACCENT`
     * (its own fallback), called bare here rather than passed the constant
     * so there is exactly one definition of "the accent" in this file.
     *
     * In `monochrome` mode the whole ramp is swapped for a fixed neutral one
     * (see `MONOCHROME_PALETTE`'s own comment for why that isn't simply
     * `accentPalette("#000000")`) — every render below reads the colour
     * through `rx`/`accentColor`, so this one swap is the entire effect.
     */
    const rx = monochrome ? MONOCHROME_PALETTE : accentPalette();
    const today = formatDate(date);

    // Devanagari names, confirmed once by the doctor/admin (Clinic page) and
    // stored on `doctors.name_hi` / `hospitals.name_hi` — never guessed at
    // render time. `hiName` falls back to the Latin name outside Hindi, and
    // inside Hindi when nothing has been confirmed yet.
    const doctorName = hiName(lang, doctor?.name ?? "Doctor", doctor?.name_hi);
    const doctorQual = doctor?.qualification ?? "";
    const doctorReg = doctor?.registration_number ?? "";
    const doctorSpec = doctor?.specialization ?? "";
    const clinicName = hiName(lang, hospital?.name ?? "Clinic", hospital?.name_hi);
    const clinicAddress = hospital?.address ?? "";
    const clinicPhone = hospital?.phone ?? "";
    const signatureUrl = doctor?.signature_image_url;
    const clinicLogo = hospital?.logo_url;
    const doctorAvatar = doctor?.avatar_url;
    const isBranded = hospital?.is_branded !== false;

    // ── What the clinic chose to print ──────────────────────────────────
    // Every flag below resolves to `true` under DEFAULT_PRESCRIPTION_CONFIG,
    // which is what an un-configured clinic gets — the document below is
    // unchanged for them, byte for byte.
    const showClinicIdentity = config.identityMode !== "doctor";
    const showDoctorIdentity = config.identityMode !== "clinic";
    // The letterhead image is a SELECTION between two images the clinic and
    // doctor profiles already own — never an upload or a crop surface here.
    // In `monochrome` mode the actual photo/logo is forced OFF regardless of
    // that selection: a detailed colour image halftones badly on a plain
    // black-and-white printer, so the initials crest below (already the
    // "missing image" fallback) becomes the letterhead mark instead — never
    // silently, only ever when the clinic explicitly chose monochrome.
    const headerImage = monochrome ? null
        : config.profileImage === "clinic_logo" ? clinicLogo
            : config.profileImage === "doctor_photo" ? doctorAvatar
                : null;
    // The initials crest still stands in when the chosen image is missing,
    // exactly as before — but not when the clinic deliberately chose "none".
    const showHeaderImage = config.profileImage !== "none";
    const clinicEmail = hospital?.email ?? "";
    const clinicWebsite = hospital?.website ?? "";

    // ── Neutral-safe colour picks ──────────────────────────────────────────
    // Everything above (`rx`, `accentColor`) already swaps for monochrome
    // because every OTHER usage in this file reads through those two. These
    // five spots don't — they were hardcoded brand-ish hues (a pale lilac
    // investigations pill, an amber follow-up badge, a light-blue table
    // header/patient strip, a hardcoded blue dosage dot) that were never
    // driven by the clinic's own accent in the first place, so the top-level
    // swap above can't reach them. A pale fill like `#d8b4fe` or `#fcd34d`
    // converts to a barely-visible near-white grey on a real monochrome
    // laser — legible on a colour screen, close to invisible once actually
    // printed — so monochrome gets its own well-tested neutral values here
    // rather than trusting the printer to convert them well.
    const tableHeadBg = monochrome ? "#f3f4f6" : "#f0f4ff";
    const stripBg = monochrome ? "#f7f7f7" : "#f5f8ff";
    const stripBorder = monochrome ? "#dddddd" : "#dce8ff";
    const pillBorder = monochrome ? "#999999" : "#d8b4fe";
    const pillText = monochrome ? "#111111" : "#6d28d9";
    const pillBg = monochrome ? "#f2f2f2" : "#f5f3ff";
    const followUpText = monochrome ? "#111111" : "#92400e";
    const followUpBg = monochrome ? "#f2f2f2" : "#fffbeb";
    const followUpBorder = monochrome ? "#999999" : "#fcd34d";
    const dotColor = monochrome ? "#171717" : "#1268e8";

    const pageStyle: React.CSSProperties =
        format === "a4"
            ? { width: "210mm", minHeight: "297mm", padding: "16mm 18mm" }
            : { width: "148mm", minHeight: "210mm", padding: "10mm 12mm" };

    // Devanagari reads visibly smaller/lighter than Latin at the same pixel
    // size — lower x-height ratio, thinner default stroke contrast in most
    // sans faces. A ~12% bump is what makes Hindi text carry the same visual
    // WEIGHT as the Latin headline sizes these were tuned for, rather than
    // reading as a smaller, secondary script next to it.
    const scale = (px: number) => `${isDevanagari ? Math.round(px * 1.12) : px}px`;
    const headingSize = scale(format === "a4" ? 22 : 18);
    const bodySize = scale(format === "a4" ? 11 : 9.5);
    const smallSize = scale(format === "a4" ? 9 : 8);

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
                fontFamily: docFontFamily,
                lineHeight: docLineHeight,
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
                {/* The identity image — WHICH image is the clinic's choice
                    (`config.profileImage`); the images themselves are managed
                    from the clinic and doctor profiles, never from here. */}
                {showHeaderImage && (
                    <div style={{ flexShrink: 0 }}>
                        {headerImage ? (
                            <img src={headerImage} alt={config.profileImage === "doctor_photo" ? doctorName : clinicName}
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
                                <span style={{ position: "relative" }}>
                                    {initials(config.profileImage === "doctor_photo" ? doctorName : clinicName)}
                                </span>
                            </div>
                        )}
                    </div>
                )}

                {/* Clinic info */}
                {showClinicIdentity && (
                    <div style={{ flex: 1 }}>
                        <div style={{ fontSize: headingSize, fontWeight: 900, letterSpacing: isDevanagari ? "normal" : "-0.01em", color: "#0d1b35", lineHeight: isDevanagari ? 1.4 : 1.15 }}>
                            {clinicName}
                        </div>
                        {/* The one deliberate SVG flourish on the page: a
                            short accent rule fading to nothing, the same
                            `RxRule` mark every clinic-coloured section divider
                            elsewhere in this codebase already uses (never a
                            new mark invented for this one spot). Fixed narrow
                            width so it reads as an underline accent under the
                            NAME specifically, not a full-width bar competing
                            with the 3px accent border the whole letterhead
                            already has. */}
                        <div style={{ width: 46, marginTop: 3 }}>
                            <RxRule color={rx.mid} />
                        </div>
                        {config.showClinicAddress && clinicAddress && (
                            <div style={{ fontSize: smallSize, color: "#555", marginTop: 3 }}>{clinicAddress}</div>
                        )}
                        {config.showClinicPhone && clinicPhone && (
                            <div style={{ fontSize: smallSize, color: "#555", marginTop: 2 }}>Ph: {clinicPhone}</div>
                        )}
                        {config.showClinicEmail && clinicEmail && (
                            <div style={{ fontSize: smallSize, color: "#555", marginTop: 2 }}>{clinicEmail}</div>
                        )}
                        {config.showWebsite && clinicWebsite && (
                            <div style={{ fontSize: smallSize, color: "#555", marginTop: 2 }}>{clinicWebsite}</div>
                        )}
                    </div>
                )}

                {/* Vertical rule — only ever between two identities. With one
                    of them switched off it would be a stray line hanging off
                    the end of the letterhead. */}
                {showClinicIdentity && showDoctorIdentity && (
                    <div style={{ width: 1, alignSelf: "stretch", background: "#e0e0e0", margin: "0 8px" }} />
                )}

                {/* Doctor info — right-aligned beside the clinic, left-aligned
                    and filling the row when it IS the letterhead. */}
                {showDoctorIdentity && (
                    <div style={showClinicIdentity
                        ? { textAlign: "right", flexShrink: 0 }
                        : { textAlign: "left", flex: 1 }}>
                        <div style={{ fontSize: format === "a4" ? "16px" : "13px", fontWeight: 900, color: "#0d1b35" }}>
                            {doctorName}
                        </div>
                        {config.showQualification && doctorQual && (
                            <div style={{ fontSize: bodySize, fontWeight: 700, color: rx.ink, marginTop: 2 }}>
                                {doctorQual}
                            </div>
                        )}
                        {config.showSpecialty && doctorSpec && (
                            <div style={{ fontSize: smallSize, color: "#777", marginTop: 2 }}>{doctorSpec}</div>
                        )}
                        {config.showRegistration && doctorReg && (
                            <div style={{ fontSize: smallSize, color: "#999", marginTop: 2 }}>{t.regNo} {doctorReg}</div>
                        )}
                        {/* A doctor-only letterhead still has to say where this
                            was prescribed from — the clinic's contact block is
                            gone, so its enabled lines fold in here rather than
                            silently vanishing with the clinic's name. */}
                        {!showClinicIdentity && config.showClinicAddress && clinicAddress && (
                            <div style={{ fontSize: smallSize, color: "#555", marginTop: 3 }}>{clinicAddress}</div>
                        )}
                        {!showClinicIdentity && config.showClinicPhone && clinicPhone && (
                            <div style={{ fontSize: smallSize, color: "#555", marginTop: 2 }}>Ph: {clinicPhone}</div>
                        )}
                    </div>
                )}
            </div>

            {/* ── Patient strip ── */}
            <div style={{
                display: "flex", flexWrap: "wrap", gap: "14px",
                background: stripBg, border: `1px solid ${stripBorder}`,
                borderRadius: 8, padding: "8px 12px", marginBottom: 10,
            }}>
                <PatientCell label={t.patient} value={patient.name} bold />
                <PatientCell label={t.ageSex} value={`${patient.age}Y / ${patient.gender}`} />
                {patient.phone && <PatientCell label={t.phone} value={patient.phone} />}
                <PatientCell label={t.date} value={today} />
                {prescriptionRef && <PatientCell label={t.ref} value={prescriptionRef} mono />}
            </div>

            {/* ── Vitals ── */}
            {vitals && Object.values(vitals).some(Boolean) && (
                <div style={{ display: "flex", gap: 16, marginBottom: 10, flexWrap: "wrap" }}>
                    {/* Read from the catalogue — see the note on the twin
                        block in ReviewModal for why these two lists stopped
                        being hand-maintained on 2026-08-16. `rxLabel` rather
                        than `printLabel` is what keeps this surface's shorter
                        vocabulary: FBS and RBS are what an Indian prescription
                        says, and what the test catalogue itself calls them. */}
                    {MEASURE_FIELDS.map((f) => {
                        const value = vitals[f.key];
                        return value ? (
                            <VitalItem key={f.key} label={localizeMeasureLabel(f.key, f.rxLabel, lang)} value={value} unit={f.unit} labelColor={rx.ink} />
                        ) : null;
                    })}
                </div>
            )}

            {/* ── Complaints & Findings ── */}
            {(symptoms.length > 0 || findings.length > 0) && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
                    {symptoms.length > 0 && (
                        <div style={{ border: "1px solid #e5e7eb", borderRadius: 6, padding: "6px 10px" }}>
                            <div style={{ fontSize: smallSize, fontWeight: 700, color: rx.ink, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>
                                {t.complaints}
                            </div>
                            {symptoms.map((s) => (
                                <div key={s} style={{ fontSize: bodySize, color: "#333", marginBottom: 2 }}>• {s}</div>
                            ))}
                        </div>
                    )}
                    {findings.length > 0 && (
                        <div style={{ border: "1px solid #e5e7eb", borderRadius: 6, padding: "6px 10px" }}>
                            <div style={{ fontSize: smallSize, fontWeight: 700, color: rx.ink, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>
                                {t.findings}
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
                        ℞ {t.prescription}
                    </div>

                    {/* Medicine table */}
                    <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 10, fontSize: bodySize }}>
                        <thead>
                            <tr style={{ background: tableHeadBg }}>
                                <th style={thStyle}>#</th>
                                <th style={{ ...thStyle, textAlign: "left" }}>{t.colMedicine}</th>
                                <th style={thStyle}>M</th>
                                <th style={thStyle}>A</th>
                                <th style={thStyle}>E</th>
                                <th style={thStyle}>N</th>
                                <th style={thStyle}>{t.colDuration}</th>
                                <th style={{ ...thStyle, textAlign: "left" }}>{t.colInstructions}</th>
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
                                        <td style={dotTd}><Dot active={m} color={dotColor} /></td>
                                        <td style={dotTd}><Dot active={a} color={dotColor} /></td>
                                        <td style={dotTd}><Dot active={e} color={dotColor} /></td>
                                        <td style={dotTd}><Dot active={n} color={dotColor} /></td>
                                        {/* Duration + instructions are SYSTEM-GENERATED, STRUCTURED
                                            values — never doctor free text (see the file header) —
                                            so they compose from the raw data (duration_days; the
                                            4-value timing enum) instead of printing the pre-formatted
                                            English string. */}
                                        <td style={{ ...tdStyle, textAlign: "center", whiteSpace: "nowrap" }}>
                                            {med.duration_days != null ? t.durationDays(med.duration_days) : med.duration}
                                        </td>
                                        <td style={tdStyle}>
                                            <span style={{ color: "#555", fontStyle: "italic" }}>{localizeTiming(med.instructions, lang)}</span>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>

                    <div style={{ fontSize: smallSize, color: "#999", marginBottom: 10 }}>
                        {t.freqLegend} &nbsp;|&nbsp; {t.dotLegend}
                    </div>
                </>
            )}

            {/* ── Investigations ── */}
            {tests.length > 0 && (
                <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: smallSize, fontWeight: 700, color: rx.ink, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>
                        {t.investigations}
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {tests.map((t) => (
                            <span key={t} style={{
                                fontSize: bodySize, padding: "2px 10px", borderRadius: 999,
                                border: `1px solid ${pillBorder}`, color: pillText, background: pillBg,
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
                {/* Signature. `showSignature: false` drops the image and the
                    ruled line, never the prescriber's NAME — an unsigned
                    prescription is a real thing, an anonymous one is not. */}
                <div>
                    {config.showSignature && (
                        signatureUrl ? (
                            <img src={signatureUrl} alt="Signature"
                                style={{ height: format === "a4" ? 56 : 44, objectFit: "contain", objectPosition: "left", display: "block", marginBottom: 4 }} />
                        ) : (
                            <div style={{ height: format === "a4" ? 56 : 44, borderBottom: "1.5px solid #555", marginBottom: 4 }} />
                        )
                    )}
                    <div style={{ fontSize: format === "a4" ? "12px" : "10px", fontWeight: 900, color: "#111" }}>{doctorName}</div>
                    {config.showQualification && doctorQual && <div style={{ fontSize: smallSize, fontWeight: 700, color: rx.ink }}>{doctorQual}</div>}
                    {config.showRegistration && doctorReg && <div style={{ fontSize: smallSize, color: "#999" }}>{t.regNo} {doctorReg}</div>}
                </div>

                {/* QR + Follow-up. The QR itself is a bordered box now,
                    rather than floating loose — a bordered frame is what
                    reads as "this is meant to be scanned" rather than "an
                    image that happened to render here". The QR's own pixels
                    are already pure black/white regardless of `monochrome` —
                    that is how the format works — so only the frame's
                    border/caption need the neutral-safe colour. */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
                    <div style={{
                        padding: 5, border: `1px solid ${rx.mid}`, borderRadius: 6,
                        display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                        {qrDataUrl ? (
                            <img src={qrDataUrl} alt="QR" style={{ width: 66, height: 66, display: "block" }} />
                        ) : (
                            <div style={{
                                width: 66, height: 66,
                                display: "flex", alignItems: "center", justifyContent: "center",
                                fontSize: "8px", color: "#aaa",
                            }}>QR</div>
                        )}
                    </div>
                    {/* This QR encodes the prescription's own details for a
                        pharmacist/records check, NOT a link to a live web
                        page — there is no public per-prescription profile
                        page in this product yet, so the caption says only
                        what actually happens when it's scanned. */}
                    <div style={{ fontSize: "7.5px", color: "#999", textAlign: "center", lineHeight: 1.35 }}>
                        {t.qrCaption}
                    </div>
                    {followUpDays && (
                        <div style={{
                            fontSize: smallSize, fontWeight: 700, color: followUpText,
                            background: followUpBg, border: `1px solid ${followUpBorder}`,
                            borderRadius: 999, padding: "2px 10px", marginTop: 2,
                        }}>
                            {t.followUp(followUpDays)}
                        </div>
                    )}
                </div>

                {/* What the clinic did today, above what the patient takes
                    home. A physiotherapy session largely consists of these and
                    printing them under "Instructions" would misfile them. */}
                {therapyNotes && (
                    <div style={{ marginBottom: 8 }}>
                        <div style={{ fontSize: smallSize, fontWeight: 700, color: rx.ink, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>
                            {t.therapyPerformed}
                        </div>
                        {therapyNotes.split("\n").filter(Boolean).map((line, i) => (
                            <div key={i} style={{ fontSize: smallSize, color: "#444", marginBottom: 2 }}>› {line}</div>
                        ))}
                    </div>
                )}

                {/* The home programme. This IS the prescription for a
                    physiotherapy patient, so it prints as its own section
                    rather than as instructions. */}
                {exerciseLines.length > 0 && (
                    <div style={{ marginBottom: 8 }}>
                        <div style={{ fontSize: smallSize, fontWeight: 700, color: rx.ink, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>
                            {t.homeExercise}
                        </div>
                        {exerciseLines.map((line, i) => (
                            <div key={i} style={{ fontSize: smallSize, color: "#444", marginBottom: 2 }}>{i + 1}. {line}</div>
                        ))}
                    </div>
                )}

                {/* Advice — only the doctor's own words for THIS patient. The
                    clinic's canned standing lines (`config.defaultAdvice`)
                    used to print here as grey dots; they were noise on a
                    document whose whole value is what the prescriber actually
                    said, so they are gone (Anmol, 2026-09-09). The Prescription
                    Editor's "Default advice" field still exists — it just no
                    longer reaches paper, the patient page or the review screen.
                    The wrapper div stays even when empty so the bottom grid
                    keeps its cell count. */}
                <div>
                    {adviceNotes && adviceNotes.trim() && (
                        <>
                            <div style={{ fontSize: smallSize, fontWeight: 700, color: rx.ink, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>
                                {t.advice}
                            </div>
                            {adviceNotes.split("\n").map((l) => l.trim()).filter(Boolean).map((line, i) => (
                                <div key={i} style={{ fontSize: smallSize, color: "#333", marginBottom: 3, display: "flex", gap: 5, lineHeight: 1.4 }}>
                                    <span style={{ color: rx.mid, flexShrink: 0 }}>›</span>
                                    <span>{line}</span>
                                </div>
                            ))}
                        </>
                    )}
                </div>
            </div>

            {/* ── Footer ── */}
            {/* The clinic's own closing line — an emergency number, a timing
                note, a disclaimer. Sits ABOVE the generated/branding strip
                because it is the clinic speaking, not the product. */}
            {config.footerNote.trim() && (
                <div style={{
                    marginTop: 10, paddingTop: 8, borderTop: "1px solid #f0f0f0",
                    fontSize: smallSize, color: "#555", lineHeight: 1.5, whiteSpace: "pre-line",
                }}>
                    {config.footerNote.trim()}
                </div>
            )}
            {/* Deliberate product-branding line, not incidental page text —
                sits low, with room around it, and reads as a signature
                rather than a watermark. `aren-logo-w.png` is the light-
                background mark (no baked-in dark square); the dark-bg
                `aren-logo.png` would look like a stray tile on white paper. */}
            {isBranded && (
                <div style={{ marginTop: 22 }}>
                    {/* English: one line, mark beside it, vertically centered —
                        unchanged. Hindi/Hinglish: the mark sits ABOVE the
                        two-line quote as its own small lockup, both centered
                        as one block — a mark pinned beside just the FIRST of
                        two lines read as orphaned from the second; stacking
                        reads as one deliberate signature regardless of how
                        many lines the quote takes. */}
                    <div style={{
                        display: "flex", flexDirection: isDevanagari ? "column" : "row",
                        justifyContent: "flex-end", alignItems: "center",
                        gap: isDevanagari ? 4 : 7, marginBottom: 10,
                    }}>
                        <img src={arenLogo} alt="" style={{ width: 15, height: 15, objectFit: "contain" }} />
                        <span style={{
                            fontSize: isDevanagari ? "10px" : "8.5px", color: "#5b7fc7", fontWeight: 700,
                            letterSpacing: isDevanagari ? "normal" : "0.02em",
                            whiteSpace: "pre-line", lineHeight: isDevanagari ? 1.5 : 1.3,
                            textAlign: "center",
                        }}>
                            {t.footerCredit}
                        </span>
                    </div>
                    <div style={{ borderTop: "1px solid #eee" }} />
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
    therapyNotes,
    exerciseLines = [],
    doctor,
    hospital,
    date,
    language,
    config = DEFAULT_PRESCRIPTION_CONFIG,
}: PrescriptionDocumentProps) {
    const lang: RxLanguage = language ?? "en";
    const t = rxLabels(lang);
    const isDevanagari = lang === "hi";
    // Courier New has no Devanagari glyphs at all — the Latin characters in a
    // line stay monospace, Devanagari falls back to Noto Sans Devanagari for
    // proper shaping rather than whatever the OS happens to substitute.
    const thermalFontFamily = "'Courier New', 'Noto Sans Devanagari', monospace";
    const today = formatDate(date);
    const doctorName = hiName(lang, doctor?.name ?? "Doctor", doctor?.name_hi);
    const doctorQual = doctor?.qualification ?? "";
    const doctorReg = doctor?.registration_number ?? "";
    const clinicName = hiName(lang, hospital?.name ?? "Clinic", hospital?.name_hi);
    const clinicPhone = hospital?.phone ?? "";
    const signatureUrl = doctor?.signature_image_url;
    // Thermal honours the SAME config, not a parallel set of rules — the
    // subset that a 76mm roll can express (there is no logo, no layout to
    // choose) but read from exactly one source.
    const showClinicIdentity = config.identityMode !== "doctor";
    const showDoctorIdentity = config.identityMode !== "clinic";

    const th: React.CSSProperties = {
        fontFamily: thermalFontFamily,
        fontSize: "9px",
        color: "#000",
        lineHeight: isDevanagari ? 1.7 : 1.5,
    };

    const divider = (
        <div style={{ borderTop: "1px dashed #000", margin: "6px 0" }} />
    );

    return (
        <div style={{
            width: "76mm",
            padding: "4mm 4mm",
            background: "#fff",
            fontFamily: thermalFontFamily,
            fontSize: "9px",
            lineHeight: isDevanagari ? 1.7 : 1.5,
            color: "#000",
            boxSizing: "border-box",
        }}>
            {/* Clinic */}
            {showClinicIdentity && (
                <div style={{ textAlign: "center", fontWeight: 900, fontSize: "12px", marginBottom: 2 }}>
                    {clinicName}
                </div>
            )}
            {config.showClinicPhone && clinicPhone && (
                <div style={{ textAlign: "center", fontSize: "8px", marginBottom: 2 }}>Ph: {clinicPhone}</div>
            )}
            {showDoctorIdentity && (
                <div style={{ textAlign: "center", fontWeight: 700, fontSize: "10px" }}>{doctorName}</div>
            )}
            {config.showQualification && doctorQual && <div style={{ textAlign: "center", fontSize: "8px" }}>{doctorQual}</div>}
            {config.showRegistration && doctorReg && <div style={{ textAlign: "center", fontSize: "8px" }}>{t.regNo} {doctorReg}</div>}
            {divider}

            {/* Patient */}
            <div style={th}><b>{t.patient}:</b> {patient.name}</div>
            <div style={th}><b>{t.ageSex}:</b> {patient.age}Y / {patient.gender}</div>
            {patient.phone && <div style={th}><b>{t.phone}:</b> {patient.phone}</div>}
            <div style={th}><b>{t.date}:</b> {today}</div>
            {prescriptionRef && <div style={th}><b>{t.ref}:</b> {prescriptionRef}</div>}
            {divider}

            {/* Complaints */}
            {symptoms.length > 0 && (
                <>
                    <div style={{ fontWeight: 700, fontSize: "8px", textTransform: "uppercase", marginBottom: 2 }}>{t.complaints}</div>
                    {symptoms.map((s) => <div key={s} style={th}>- {s}</div>)}
                    {divider}
                </>
            )}

            {/* Findings */}
            {findings.length > 0 && (
                <>
                    <div style={{ fontWeight: 700, fontSize: "8px", textTransform: "uppercase", marginBottom: 2 }}>{t.findings}</div>
                    {findings.map((f) => <div key={f} style={th}>! {f}</div>)}
                    {divider}
                </>
            )}

            {/* Rx — the ℞ code itself stays universal; the heading word does not. */}
            {prescription.length > 0 && (
                <>
                    <div style={{ fontWeight: 900, fontSize: "11px", fontStyle: "italic", marginBottom: 4 }}>℞ {t.prescription}</div>
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
                                    {slots} · {med.duration_days != null ? t.durationDays(med.duration_days) : med.duration}
                                    {med.instructions && ` · ${localizeTiming(med.instructions, lang)}`}
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
                    <div style={{ fontWeight: 700, fontSize: "8px", textTransform: "uppercase", marginBottom: 2 }}>{t.investigations}</div>
                    {tests.map((test) => <div key={test} style={th}>- {test}</div>)}
                    {divider}
                </>
            )}

            {/* Home programme, thermal format. */}
            {exerciseLines.length > 0 && (
                <>
                    {exerciseLines.map((line, i) => (
                        <div key={i} style={th}>{i + 1}. {line}</div>
                    ))}
                    {divider}
                </>
            )}

            {/* Therapy, then follow-up + advice. Thermal format. */}
            {therapyNotes && (
                <>
                    {therapyNotes.split("\n").filter(Boolean).map((line, i) => (
                        <div key={i} style={th}>+ {line}</div>
                    ))}
                    {divider}
                </>
            )}

            {/* Follow-up + advice */}
            {followUpDays && (
                <div style={{ fontWeight: 700, ...th }}>{t.followUp(followUpDays)}</div>
            )}
            {/* Doctor's own advice only — the clinic's canned `defaultAdvice`
                lines were dropped here too (Anmol, 2026-09-09). */}
            {adviceNotes && adviceNotes.split("\n").filter(Boolean).map((line, i) => (
                <div key={i} style={th}>* {line}</div>
            ))}
            {divider}

            {/* Signature */}
            <div style={{ marginTop: 8 }}>
                {config.showSignature && (
                    signatureUrl ? (
                        <img src={signatureUrl} alt="Sig" style={{ height: 36, objectFit: "contain", display: "block" }} />
                    ) : (
                        <div style={{ borderBottom: "1px solid #000", width: 80, marginBottom: 2 }} />
                    )
                )}
                <div style={{ fontSize: "9px", fontWeight: 700 }}>{doctorName}</div>
                {config.showQualification && doctorQual && <div style={{ fontSize: "8px" }}>{doctorQual}</div>}
            </div>
            {config.footerNote.trim() && (
                <div style={{ ...th, textAlign: "center", marginTop: 4 }}>{config.footerNote.trim()}</div>
            )}
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

function Dot({ active, color = "#1268e8" }: { active: boolean; color?: string }) {
    return (
        <div style={{
            width: 10, height: 10, borderRadius: "50%", margin: "0 auto",
            background: active ? color : "transparent",
            border: `1.5px solid ${active ? color : "#ccc"}`,
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

function VitalItem({ label, value, unit, labelColor = "#1268e8" }: { label: string; value: string; unit: string; labelColor?: string }) {
    return (
        <div style={{ display: "flex", alignItems: "baseline", gap: 3 }}>
            <span style={{ fontSize: "8px", fontWeight: 700, color: labelColor, textTransform: "uppercase" }}>{label}</span>
            <span style={{ fontSize: "11px", fontWeight: 700, color: "#111" }}>{value}</span>
            <span style={{ fontSize: "8px", color: "#999" }}>{unit}</span>
        </div>
    );
}