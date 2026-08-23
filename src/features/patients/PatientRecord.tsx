// ---------------------------------------------------------------------------
// PATIENT RECORD — one patient's full clinical history.
//
// Rebuilt 2026-08-23 onto the same visual language as the Overview rebuild
// (`.prec-panel-card`/`.prec-summary-grid`/`.prec-snapshot-*`/`.prec-avatar`/
// `.prec-status-pill`, the `.prec-page-body` main+304px-sidebar shell) rather
// than the older, separately-themed `patients-detail-*.css` this replaced —
// Anmol: "same visual language... which I like". A 2/3-column grid throughout
// rather than one long stacked column, per the same request.
//
// The trend graphs reuse `buildTrendSummary`/`Sparkline`/`visitForLastReading`
// from the consult screen's longitudinal band (`features/consult/trend.ts`,
// `LongitudinalBand.tsx`) rather than forking that math — see the export
// notes on those functions. This page is a second, specialty-agnostic
// SURFACE for the same real signals, not a second implementation of them.
//
// Specialty-awareness on this page is real, not fabricated: the identity
// stat row and Clinical Snapshot read `snapshotFor()`/the specialty-tagged
// fields on `PatientRecordRow` (already computed for the Overview table),
// and the trend cards read `specialty.trend` — the same configuration
// `LongitudinalBand` reads in the consult screen. No specialty branch is
// invented here that doesn't already exist upstream.
// ---------------------------------------------------------------------------

import { useEffect, useMemo, useState } from "react";
import type { RefObject } from "react";
import {
    AlertCircle,
    ArrowLeft,
    ArrowDown,
    ArrowLeftRight,
    ArrowRight,
    ArrowUp,
    Calendar,
    ChevronDown,
    FileText,
    FlaskConical,
    MessageCircle,
    Phone,
    Pill,
    Plus,
    Stethoscope,
    TrendingUp,
    User,
} from "lucide-react";
import {
    fetchHospital,
    fetchPatientVisits,
    fetchPrescriptionRenderData,
    freqSlotToLabel,
    type DBHospital,
    type PatientRecordRow,
    type PrescriptionRenderData,
    type RealVisit,
} from "../../lib/db";
import type { Patient } from "../../types";
import { WorkspaceHeader } from "../../components/WorkspaceHeader";
import { PastVisitCard } from "../../components/PastVisitCard";
import ReviewModal from "../../components/ReviewModal";
import { useClinicalIdentity } from "../../hooks/useClinicalIdentity";
import type { SpecialtyProfile } from "../synapse/specialtyProfile";
import { snapshotFor, visitNoun, type SnapshotChip } from "../synapse/patientSnapshot";
import { deriveRanked, RankedBarList } from "./RankedBarList";
import { CompareVisitsModal } from "./CompareVisitsModal";
import { buildWhatsAppLink } from "../../lib/whatsapp";
import {
    buildTrendSummary,
    formatDelta,
    formatValue,
    type TrendSeries,
    type TrendVerdict,
} from "../consult/trend";
import { Sparkline, visitForLastReading, formatSpan } from "../consult/LongitudinalBand";
import { toast } from "sonner";

// ── Helpers ───────────────────────────────────────────────────────────────────

function initials(name: string): string {
    return name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

function formatDateShort(iso: string): string {
    return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function timeAgo(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    const hrs = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (mins < 2) return "just now";
    if (mins < 60) return `${mins}m ago`;
    if (hrs < 24) return `${hrs}h ago`;
    if (days === 1) return "Yesterday";
    if (days < 30) return `${days}d ago`;
    const months = Math.floor(days / 30);
    return months < 12 ? `${months}mo ago` : `${Math.floor(months / 12)}y ago`;
}

/** Last visit / average gap between visits / the month this patient came in
 *  most — real arithmetic over the visits actually fetched, nothing inferred
 *  beyond that. */
function computeVisitPattern(visits: RealVisit[]): {
    lastVisitDays: number | null;
    avgGapDays: number | null;
    mostActiveMonth: string | null;
} {
    if (!visits.length) return { lastVisitDays: null, avgGapDays: null, mostActiveMonth: null };
    const sorted = [...visits].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
    const lastVisitDays = Math.floor((Date.now() - +new Date(sorted[0].created_at)) / 86400000);

    let avgGapDays: number | null = null;
    if (sorted.length > 1) {
        let totalGap = 0;
        for (let i = 0; i < sorted.length - 1; i++) {
            totalGap += +new Date(sorted[i].created_at) - +new Date(sorted[i + 1].created_at);
        }
        avgGapDays = Math.round(totalGap / (sorted.length - 1) / 86400000);
    }

    const monthCount = new Map<string, number>();
    for (const v of sorted) {
        const key = new Date(v.created_at).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
        monthCount.set(key, (monthCount.get(key) ?? 0) + 1);
    }
    const mostActiveMonth = [...monthCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

    return { lastVisitDays, avgGapDays, mostActiveMonth };
}

// ── Skeleton — same shimmer language as the Overview list ───────────────────

function SkelBlock({ width, height = 12, style }: { width: string | number; height?: number; style?: React.CSSProperties }) {
    return <div className="prec-skeleton" style={{ width, height, borderRadius: 4, ...style }} />;
}

function DetailSkeleton() {
    return (
        <>
            <div className="prec-panel-card prec-detail-identity">
                <div className="prec-detail-identity-left">
                    <div className="prec-skeleton prec-skeleton--circle" style={{ width: 56, height: 56 }} />
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        <SkelBlock width={160} height={18} />
                        <SkelBlock width={200} height={12} />
                    </div>
                </div>
                <div className="prec-summary-grid">
                    {[0, 1, 2, 3].map((i) => (
                        <div key={i} className="prec-summary-cell">
                            <SkelBlock width={40} height={20} />
                            <SkelBlock width="70%" height={9} />
                        </div>
                    ))}
                </div>
            </div>
            <div className="prec-panel-card">
                <div className="prec-panel-card-body" style={{ display: "flex", gap: 10 }}>
                    {[0, 1, 2].map((i) => <SkelBlock key={i} width={150} height={110} />)}
                </div>
            </div>
            <div className="prec-panel-card">
                <div className="prec-panel-card-body" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {[0, 1, 2, 3].map((i) => <SkelBlock key={i} width="100%" height={48} />)}
                </div>
            </div>
        </>
    );
}

// ── Trend mini-card — reuses Sparkline's math/SVG, new light styling ───────

const VERDICT_LABEL: Record<TrendVerdict, (rising: boolean, delta: number) => string> = {
    improving: () => "Improving",
    worsening: () => "Worse",
    steady: () => "Steady",
    neutral: (rising, delta) => (rising ? "Up" : delta < 0 ? "Down" : "Steady"),
};

function TrendVerdictIcon({ verdict, rising }: { verdict: TrendVerdict; rising: boolean }) {
    if (verdict === "steady") return <ArrowRight size={12} aria-hidden="true" />;
    return rising ? <ArrowUp size={12} aria-hidden="true" /> : <ArrowDown size={12} aria-hidden="true" />;
}

function TrendMiniCard({ series, onOpen }: { series: TrendSeries; onOpen?: () => void }) {
    const rising = series.delta > 0;
    const label = VERDICT_LABEL[series.verdict](rising, series.delta);
    const body = (
        <>
            <p className="prec-trend-label">
                {series.label}
                {series.unit && <span className="prec-trend-unit"> {series.unit}</span>}
            </p>
            <p className="prec-trend-values">
                <span className="prec-trend-from">{formatValue(series.first)}</span>
                <ArrowRight size={12} className="prec-trend-to-arrow" aria-hidden="true" />
                <span className="prec-trend-now">{formatValue(series.last)}</span>
            </p>
            <p className="prec-trend-delta">
                <TrendVerdictIcon verdict={series.verdict} rising={rising} />
                <span>{formatDelta(series.delta)}</span>
                <span className="prec-trend-verdict">{label}</span>
            </p>
            <Sparkline series={series} />
            <p className="prec-trend-foot">{series.sessions} readings · {formatSpan(series.spanDays)}</p>
        </>
    );
    if (!onOpen) return <div className={`prec-trend-card is-${series.verdict}`}>{body}</div>;
    return (
        <button type="button" className={`prec-trend-card is-${series.verdict} is-clickable`} onClick={onOpen}>
            {body}
        </button>
    );
}

// ── Visit timeline row ───────────────────────────────────────────────────────

function VisitRow({
    visit, isFirst, compareMode, compareSelected, onToggleCompare, onViewPrescription, onSendWhatsApp,
}: {
    visit: RealVisit;
    isFirst: boolean;
    compareMode: boolean;
    compareSelected: boolean;
    onToggleCompare: () => void;
    onViewPrescription: (prescriptionId: string) => void;
    onSendWhatsApp: (visit: RealVisit) => void;
}) {
    const [expanded, setExpanded] = useState(false);
    const hasMeds = visit.medicines.length > 0;
    const hasSymptoms = visit.symptoms.length > 0;
    const hasFindings = visit.findings.length > 0;
    const hasBodySites = visit.body_sites.length > 0;
    const hasExercises = visit.exercise_names.length > 0;
    const hasImpairments = visit.impairment_names.length > 0;
    const hasStory = Boolean(visit.story_duration || visit.story_mechanism);
    const abnormal = visit.findings.filter((f) => f.is_abnormal);
    const visitType = hasMeds ? "Prescription" : hasFindings ? "Examination" : "Consultation";

    return (
        <div className="prec-tl-row">
            <div className="prec-tl-spine">
                {compareMode ? (
                    <button
                        type="button"
                        className={`prec-tl-compare-check${compareSelected ? " is-selected" : ""}`}
                        onClick={onToggleCompare}
                        aria-label={compareSelected ? "Remove from comparison" : "Add to comparison"}
                        aria-pressed={compareSelected}
                    />
                ) : (
                    <div className={`prec-tl-dot${isFirst ? " is-latest" : ""}`} />
                )}
                <div className="prec-tl-line" />
            </div>
            <div className={`prec-tl-card${expanded ? " is-expanded" : ""}${compareSelected ? " is-compare-selected" : ""}`}>
                <button type="button" className="prec-tl-header" onClick={() => (compareMode ? onToggleCompare() : setExpanded((e) => !e))}>
                    <div className="prec-tl-date-block">
                        <span className="prec-tl-date">{formatDateShort(visit.created_at)}</span>
                        <span className="prec-tl-ago">{timeAgo(visit.created_at)}</span>
                    </div>
                    <span className="prec-tl-type-badge">{visitType}</span>
                    {!expanded && hasSymptoms && (
                        <div className="prec-tl-preview">
                            {visit.symptoms.slice(0, 4).join(", ")}
                            {visit.symptoms.length > 4 && <span className="prec-tl-preview-more"> +{visit.symptoms.length - 4}</span>}
                        </div>
                    )}
                    <div className="prec-tl-header-right">
                        {hasMeds && <span className="prec-tl-stat"><b>{visit.medicines.length}</b> meds</span>}
                        {hasFindings && (
                            <span className={`prec-tl-stat${abnormal.length ? " is-abnormal" : ""}`}>
                                <b>{visit.findings.length}</b> findings
                            </span>
                        )}
                        {!compareMode && <ChevronDown size={13} className={`prec-tl-chevron${expanded ? " is-open" : ""}`} />}
                    </div>
                </button>

                {expanded && !compareMode && (
                    <div className="prec-tl-body">
                        {visit.prescription_id && (
                            <div className="prec-tl-actions">
                                <button
                                    type="button"
                                    className="prec-tl-action-btn"
                                    onClick={() => onViewPrescription(visit.prescription_id!)}
                                >
                                    <FileText size={11} />
                                    View Prescription
                                </button>
                                <button
                                    type="button"
                                    className="prec-tl-action-btn prec-tl-action-btn--whatsapp"
                                    onClick={() => onSendWhatsApp(visit)}
                                >
                                    <MessageCircle size={11} />
                                    Send via WhatsApp
                                </button>
                            </div>
                        )}
                        {(hasSymptoms || hasFindings) && (
                            <div className="prec-tl-two-col">
                                {hasSymptoms && (
                                    <div>
                                        <div className="prec-tl-section-label">Complaints</div>
                                        <div className="prec-snapshot-chips">
                                            {visit.symptoms.map((s) => <span key={s} className="prec-symptom-chip">{s}</span>)}
                                        </div>
                                    </div>
                                )}
                                {hasFindings && (
                                    <div>
                                        <div className="prec-tl-section-label">Findings</div>
                                        <div className="prec-snapshot-chips">
                                            {visit.findings.map((f) => (
                                                <span key={f.name} className={`prec-finding-chip${f.is_abnormal ? " is-abnormal" : ""}`}>
                                                    {f.is_abnormal && <AlertCircle size={8} style={{ marginRight: 2 }} />}
                                                    {f.name}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                        {/* Physio-specific, real per-visit data — same tables the
                            Overview table's snapshot already reads, just newly
                            selected here too (see RealVisit's own header). Only
                            renders what this particular visit actually has. */}
                        {(hasBodySites || hasImpairments) && (
                            <div className="prec-tl-two-col">
                                {hasBodySites && (
                                    <div>
                                        <div className="prec-tl-section-label">Body Site</div>
                                        <div className="prec-snapshot-chips">
                                            {visit.body_sites.map((s) => <span key={s} className="prec-symptom-chip">{s}</span>)}
                                        </div>
                                    </div>
                                )}
                                {hasImpairments && (
                                    <div>
                                        <div className="prec-tl-section-label">Functional Limitation</div>
                                        <div className="prec-snapshot-chips">
                                            {visit.impairment_names.map((s) => <span key={s} className="prec-symptom-chip">{s}</span>)}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                        {hasStory && (
                            <div>
                                <div className="prec-tl-section-label">Patient's Account</div>
                                <div className="prec-tl-story">
                                    {visit.story_duration && <span className="prec-tl-story-duration">{visit.story_duration}</span>}
                                    {visit.story_mechanism && <span className="prec-tl-story-text">{visit.story_mechanism}</span>}
                                </div>
                            </div>
                        )}
                        {hasMeds && (
                            <div>
                                <div className="prec-tl-section-label">Prescription</div>
                                <div className="prec-tl-med-list">
                                    {visit.medicines.map((m) => (
                                        <div key={m.medicine_id} className="prec-tl-med-row">
                                            <Pill size={10} className="prec-tl-med-icon" />
                                            <span className="prec-tl-med-name">{m.name}</span>
                                            <span className="prec-tl-med-detail">
                                                {m.dosage_mg && `${m.dosage_mg}mg`}
                                                {m.frequency && ` · ${freqSlotToLabel(m.frequency)}`}
                                                {m.duration_days && ` · ${m.duration_days}d`}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                        {hasExercises && (
                            <div>
                                <div className="prec-tl-section-label">Exercises Prescribed</div>
                                <div className="prec-tl-med-list">
                                    {visit.exercise_names.map((label) => (
                                        <div key={label} className="prec-tl-med-row">
                                            <TrendingUp size={10} className="prec-tl-med-icon" />
                                            <span className="prec-tl-med-name">{label}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                        {!hasSymptoms && !hasFindings && !hasMeds && !hasBodySites && !hasImpairments && !hasExercises && !hasStory && (
                            <div className="prec-tl-empty">No clinical data recorded for this visit.</div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

// ── PatientRecord ─────────────────────────────────────────────────────────────

const INITIAL_VISIBLE = 5;

interface PatientRecordProps {
    row: PatientRecordRow;
    specialty: SpecialtyProfile;
    onBack: () => void;
    onStartConsult: (patient: Patient) => void;
    logoRef: RefObject<HTMLDivElement>;
    onOpenSidebar: () => void;
}

export function PatientRecord({ row, specialty, onBack, onStartConsult, logoRef, onOpenSidebar }: PatientRecordProps) {
    const identity = useClinicalIdentity();
    const [visits, setVisits] = useState<RealVisit[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAll, setShowAll] = useState(false);
    const [activeVisit, setActiveVisit] = useState<{ visit: RealVisit; x: number } | null>(null);

    // The prescription viewer — same ReviewModal/fetchPrescriptionRenderData
    // pipeline Print RX and Consult already use (rule 6: one prescription
    // renderer). `rxError` surfaces a failed fetch rather than leaving the
    // "View Prescription" click looking like it did nothing.
    const [hospital, setHospital] = useState<DBHospital | null>(null);
    const [rxDetail, setRxDetail] = useState<PrescriptionRenderData | null>(null);

    // Compare mode — select up to 2 visits from the timeline, then diff them.
    const [compareMode, setCompareMode] = useState(false);
    const [compareIds, setCompareIds] = useState<string[]>([]);
    const [comparing, setComparing] = useState<{ a: RealVisit; b: RealVisit } | null>(null);

    useEffect(() => {
        setLoading(true);
        setShowAll(false);
        fetchPatientVisits(row.patient_id)
            .then(setVisits)
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [row.patient_id]);

    // The letterhead needs the full `hospitals` row (address/phone/logo),
    // same reason Print RX fetches it — the auth identity doesn't carry it.
    useEffect(() => {
        if (!identity.hospitalId) return;
        fetchHospital(identity.hospitalId).then(setHospital).catch(() => setHospital(null));
    }, [identity.hospitalId]);

    const completedVisits = useMemo(() => visits.filter((v) => v.status === "completed"), [visits]);
    const lastVisit = completedVisits[0];
    const isPhysio = specialty.id === "physiotherapy";
    const noun = visitNoun(specialty);

    const snapshot = useMemo(() => snapshotFor(specialty, row), [specialty, row]);

    // Real signals, no invented ones — see trend.ts's own header for what
    // "generated algorithmically from stored signals" means here.
    const trendSummary = useMemo(
        () => buildTrendSummary({ trend: specialty.trend, visits: completedVisits, todayVitals: null }),
        [specialty.trend, completedVisits]
    );

    const frequentComplaints = useMemo(
        () => deriveRanked(completedVisits, (v) => v.symptoms),
        [completedVisits]
    );
    const commonMedicines = useMemo(
        () => deriveRanked(completedVisits, (v) => v.medicines.map((m) => m.name)),
        [completedVisits]
    );
    const pattern = useMemo(() => computeVisitPattern(completedVisits), [completedVisits]);

    const visibleVisits = showAll ? completedVisits : completedVisits.slice(0, INITIAL_VISIBLE);
    const hiddenCount = completedVisits.length - INITIAL_VISIBLE;

    const handleStartConsult = () => {
        onStartConsult({
            id: row.patient_id,
            name: row.patient_name,
            age: String(row.age),
            gender: row.gender as Patient["gender"],
            phone: row.phone,
        });
    };

    const openVisitPopover = (visit: RealVisit, x: number) => setActiveVisit({ visit, x });

    const openPrescription = (prescriptionId: string) => {
        toast.promise(fetchPrescriptionRenderData(prescriptionId), {
            loading: "Loading prescription…",
            success: (detail) => {
                setRxDetail(detail);
                return "Prescription loaded";
            },
            error: (e) => (e instanceof Error ? e.message : "Could not load this prescription."),
        });
    };

    // Placeholder integration — see lib/whatsapp.ts's header. Builds the
    // message from data already on screen (no extra fetch) and opens
    // WhatsApp Web/the app with it pre-filled; nothing is sent automatically.
    const sendVisitWhatsApp = (visit: RealVisit) => {
        const lines = [`Hi ${row.patient_name}, here's your prescription from ${formatDateShort(visit.created_at)}:`];
        for (const m of visit.medicines) {
            const detail = [
                m.dosage_mg ? `${m.dosage_mg}mg` : null,
                m.frequency ? freqSlotToLabel(m.frequency) : null,
                m.duration_days ? `${m.duration_days} days` : null,
            ].filter(Boolean).join(", ");
            lines.push(`• ${m.name}${detail ? ` (${detail})` : ""}`);
        }
        const link = buildWhatsAppLink(row.phone, lines.join("\n"));
        if (link) window.open(link, "_blank", "noopener,noreferrer");
        else toast.error("No usable phone number on file for this patient.");
    };

    const toggleCompareVisit = (visitId: string) => {
        setCompareIds((prev) => {
            if (prev.includes(visitId)) return prev.filter((id) => id !== visitId);
            // Keeps the selection at 2 by dropping the older pick rather than
            // refusing the click — picking a 3rd visit reads as "swap the
            // first one out", not as an error to explain.
            if (prev.length >= 2) return [prev[1], visitId];
            return [...prev, visitId];
        });
    };

    const openCompare = () => {
        if (compareIds.length !== 2) return;
        const a = completedVisits.find((v) => v.id === compareIds[0]);
        const b = completedVisits.find((v) => v.id === compareIds[1]);
        if (a && b) setComparing({ a, b });
    };

    const exitCompareMode = () => {
        setCompareMode(false);
        setCompareIds([]);
    };

    return (
        <div className="prec-page">
            <WorkspaceHeader
                logoRef={logoRef}
                onOpenSidebar={onOpenSidebar}
                title="Patient Record"
                subtitle="Clinical History & Continuity"
            />

            <div className="prec-page-header">
                <button type="button" className="prec-back-btn" onClick={onBack}>
                    <ArrowLeft size={13} />
                    <span>All Patients</span>
                </button>
                <div style={{ flex: 1 }} />
                <button type="button" className="prec-start-consult-btn--topbar" onClick={handleStartConsult}>
                    <Plus size={12} />
                    New Consult
                </button>
            </div>

            <div className="prec-page-body">
                <div className="prec-main-col">
                    {loading ? (
                        <DetailSkeleton />
                    ) : (
                        <>
                            {/* Identity + quick stats */}
                            <div className="prec-panel-card prec-detail-identity">
                                <div className="prec-detail-identity-left">
                                    <div className="prec-avatar" style={{ width: 56, height: 56, fontSize: 20 }}>
                                        {initials(row.patient_name)}
                                    </div>
                                    <div>
                                        <div className="prec-detail-name">{row.patient_name}</div>
                                        <div className="prec-detail-meta">
                                            {row.age > 0 && <span className="prec-identity-pill">{row.age} yrs</span>}
                                            {row.gender && <span className="prec-identity-pill">{row.gender}</span>}
                                            {row.phone && (
                                                <span className="prec-detail-meta-item">
                                                    <Phone size={10} />{row.phone}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div className="prec-summary-grid">
                                    <div className="prec-summary-cell">
                                        <User size={13} className="prec-summary-cell-icon" />
                                        <span className="prec-summary-value">{row.visit_count ?? completedVisits.length}</span>
                                        <span className="prec-summary-label">Total {noun}{(row.visit_count ?? completedVisits.length) === 1 ? "" : "s"}</span>
                                    </div>
                                    <div className="prec-summary-cell">
                                        {isPhysio ? <TrendingUp size={13} className="prec-summary-cell-icon" /> : <Pill size={13} className="prec-summary-cell-icon" />}
                                        <span className="prec-summary-value" style={{ fontSize: 14 }}>
                                            {isPhysio ? (row.exercise_names[0] ?? "—") : (lastVisit?.medicines[0]?.name ?? "—")}
                                        </span>
                                        <span className="prec-summary-label">{isPhysio ? "Last Exercise" : "Last Prescription"}</span>
                                    </div>
                                    <div className="prec-summary-cell">
                                        <Stethoscope size={13} className="prec-summary-cell-icon" />
                                        <span className="prec-summary-value" style={{ fontSize: 14 }}>
                                            {snapshot.chips[0]?.label ?? "—"}
                                        </span>
                                        <span className="prec-summary-label">Recent Complaint</span>
                                    </div>
                                    <div className="prec-summary-cell">
                                        <Calendar size={13} className="prec-summary-cell-icon" />
                                        <span className="prec-summary-value prec-summary-value--time">
                                            {lastVisit ? timeAgo(lastVisit.created_at) : "—"}
                                        </span>
                                        <span className="prec-summary-label">Last Visit</span>
                                    </div>
                                </div>
                            </div>

                            {/* Specialty-aware Clinical Snapshot — same chips/detail shape
                                as the Overview table's snapshot cell, same source of truth. */}
                            {(snapshot.chips.length > 0 || snapshot.detail) && (
                                <div className="prec-panel-card">
                                    <div className="prec-panel-card-header">
                                        <Stethoscope size={13} className="prec-panel-card-icon prec-panel-card-icon--pink" />
                                        <span className="prec-panel-card-title">Clinical Snapshot</span>
                                    </div>
                                    <div className="prec-panel-card-body">
                                        <div className="prec-snapshot-cell" style={{ gap: 8 }}>
                                            {snapshot.chips.length > 0 && (
                                                <div className="prec-snapshot-chips">
                                                    {snapshot.chips.map((chip: SnapshotChip, i: number) => (
                                                        <span key={i} className={`prec-snapshot-chip prec-snapshot-chip--${chip.tone}`} style={{ fontSize: 11, padding: "3px 9px" }}>
                                                            {chip.label}
                                                        </span>
                                                    ))}
                                                </div>
                                            )}
                                            {snapshot.detail && <div className="prec-snapshot-detail" style={{ fontSize: 12, whiteSpace: "normal" }}>{snapshot.detail}</div>}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Progress Trend and Visit Timeline are the tall, primary
                                content — full width of the main column. The shorter
                                summary cards (care plan, complaints, medicines, visit
                                pattern) live in the persistent sidebar instead of a
                                second half-empty column: this page's main content
                                doesn't stack evenly with a 2-3 card side column the way
                                the trend/timeline pair does, and spreading real content
                                thin across three regions read as "mostly empty" rather
                                than organized — Anmol, 2026-08-23. The sidebar is denser
                                for it, matching how the Overview page itself is actually
                                shaped (one flowing main column + one packed sidebar, not
                                three). The trend row is still a real multi-column grid
                                on its own. */}
                            <div className="prec-panel-card">
                                <div className="prec-panel-card-header">
                                    <TrendingUp size={13} className="prec-panel-card-icon prec-panel-card-icon--blue" />
                                    <span className="prec-panel-card-title">Progress Trend</span>
                                </div>
                                <div className="prec-panel-card-body">
                                    {trendSummary.series.length > 0 ? (
                                        <div className="prec-trend-grid">
                                            {trendSummary.series.map((s) => {
                                                const visit = visitForLastReading(s, completedVisits);
                                                return (
                                                    <TrendMiniCard
                                                        key={s.key}
                                                        series={s}
                                                        onOpen={visit ? () => openVisitPopover(visit, window.innerWidth / 2) : undefined}
                                                    />
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        <p className="prec-trend-none">
                                            No measurement has been recorded twice yet — a trend needs two visits with
                                            the same reading.
                                        </p>
                                    )}
                                </div>
                            </div>

                            <div className="prec-panel-card">
                                <div className="prec-panel-card-header">
                                    <Calendar size={13} className="prec-panel-card-icon" />
                                    <span className="prec-panel-card-title">Visit Timeline</span>
                                    <span className="prec-section-count" style={{ marginLeft: "auto" }}>
                                        {completedVisits.length}
                                    </span>
                                    {completedVisits.length > 1 && (
                                        <button
                                            type="button"
                                            className={`prec-tl-compare-toggle${compareMode ? " is-active" : ""}`}
                                            onClick={() => (compareMode ? exitCompareMode() : setCompareMode(true))}
                                        >
                                            <ArrowLeftRight size={11} />
                                            {compareMode ? "Cancel" : "Compare"}
                                        </button>
                                    )}
                                </div>
                                <div className="prec-panel-card-body">
                                    {completedVisits.length === 0 ? (
                                        <div className="prec-empty-section">
                                            <FlaskConical size={22} />
                                            <p>No completed visits on record.</p>
                                        </div>
                                    ) : (
                                        <>
                                            {compareMode && (
                                                <div className="prec-tl-compare-bar">
                                                    <span>
                                                        {compareIds.length === 0 && "Select 2 visits to compare"}
                                                        {compareIds.length === 1 && "Select 1 more visit"}
                                                        {compareIds.length === 2 && "2 visits selected"}
                                                    </span>
                                                    <button
                                                        type="button"
                                                        className="prec-tl-compare-go"
                                                        disabled={compareIds.length !== 2}
                                                        onClick={openCompare}
                                                    >
                                                        Compare Selected
                                                    </button>
                                                </div>
                                            )}
                                            <div className="prec-tl-list">
                                                {visibleVisits.map((v, i) => (
                                                    <VisitRow
                                                        key={v.id}
                                                        visit={v}
                                                        isFirst={i === 0}
                                                        compareMode={compareMode}
                                                        compareSelected={compareIds.includes(v.id)}
                                                        onToggleCompare={() => toggleCompareVisit(v.id)}
                                                        onViewPrescription={openPrescription}
                                                        onSendWhatsApp={sendVisitWhatsApp}
                                                    />
                                                ))}
                                            </div>
                                            {completedVisits.length > INITIAL_VISIBLE && (
                                                <button type="button" className="prec-tl-view-all" onClick={() => setShowAll((s) => !s)}>
                                                    {showAll
                                                        ? <>Show Less <ChevronDown size={12} style={{ transform: "rotate(180deg)" }} /></>
                                                        : <>View All Visits ({hiddenCount} more) <ChevronDown size={12} /></>}
                                                </button>
                                            )}
                                        </>
                                    )}
                                </div>
                            </div>
                        </>
                    )}
                </div>

                <aside className="prec-right-col">
                    <div className="prec-panel-section">
                        <div className="prec-panel-card">
                            <div className="prec-panel-card-header">
                                <Plus size={13} className="prec-panel-card-icon prec-panel-card-icon--green" />
                                <span className="prec-panel-card-title">Quick Actions</span>
                            </div>
                            <div className="prec-quick-actions">
                                <button type="button" className="prec-quick-action-btn" onClick={handleStartConsult}>
                                    <span className="prec-quick-action-icon-wrap"><Plus size={14} /></span>
                                    <span className="prec-quick-action-label">Start New Consult</span>
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Everything below reads `visits` — which starts empty while the
                        fetch is in flight — except the Care Plan card, which reads
                        `row.care_plan_progress` directly (already loaded with the row
                        itself). Skeleton the rest rather than let them just not
                        appear and pop in a moment later: the same "silently missing,
                        not loading" problem just fixed on the Overview sidebar. */}
                    {row.care_plan_progress && (
                        <div className="prec-panel-section">
                            <div className="prec-panel-card">
                                <div className="prec-panel-card-header">
                                    <TrendingUp size={13} className="prec-panel-card-icon prec-panel-card-icon--blue" />
                                    <span className="prec-panel-card-title">Care Plan</span>
                                </div>
                                <div className="prec-panel-card-body">
                                    <div className="prec-careplan-label">{row.care_plan_session_label}</div>
                                    <div className="prec-careplan-bar">
                                        <span style={{
                                            width: `${Math.min(100, Math.round((row.care_plan_progress.sessionsCompleted / row.care_plan_progress.targetSessions) * 100))}%`,
                                        }} />
                                    </div>
                                    <div className="prec-careplan-sub">
                                        {Math.max(0, row.care_plan_progress.targetSessions - row.care_plan_progress.sessionsCompleted)} sessions remaining
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {loading ? (
                        [0, 1, 2].map((i) => (
                            <div className="prec-panel-section" key={i}>
                                <div className="prec-panel-card">
                                    <div className="prec-panel-card-body" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                        {[0, 1, 2].map((j) => <SkelBlock key={j} width={`${85 - j * 10}%`} />)}
                                    </div>
                                </div>
                            </div>
                        ))
                    ) : (
                        <>
                            {frequentComplaints.length > 0 && (
                                <div className="prec-panel-section">
                                    <div className="prec-panel-card">
                                        <div className="prec-panel-card-header">
                                            <Stethoscope size={13} className="prec-panel-card-icon" />
                                            <span className="prec-panel-card-title">Frequent Complaints</span>
                                        </div>
                                        <div className="prec-panel-card-body">
                                            <RankedBarList items={frequentComplaints} />
                                        </div>
                                    </div>
                                </div>
                            )}

                            {commonMedicines.length > 0 && (
                                <div className="prec-panel-section">
                                    <div className="prec-panel-card">
                                        <div className="prec-panel-card-header">
                                            <Pill size={13} className="prec-panel-card-icon prec-panel-card-icon--blue" />
                                            <span className="prec-panel-card-title">Common Medicines</span>
                                        </div>
                                        <div className="prec-panel-card-body">
                                            <RankedBarList items={commonMedicines} />
                                        </div>
                                    </div>
                                </div>
                            )}

                            {completedVisits.length > 0 && (
                                <div className="prec-panel-section">
                                    <div className="prec-panel-card">
                                        <div className="prec-panel-card-header">
                                            <Calendar size={13} className="prec-panel-card-icon prec-panel-card-icon--pink" />
                                            <span className="prec-panel-card-title">Visit Pattern</span>
                                        </div>
                                        <div className="prec-panel-card-body" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                            {pattern.lastVisitDays !== null && (
                                                <div className="prec-pattern-row">
                                                    <span>Last visit</span>
                                                    <b>{pattern.lastVisitDays === 0 ? "Today" : `${pattern.lastVisitDays}d ago`}</b>
                                                </div>
                                            )}
                                            {pattern.avgGapDays !== null && (
                                                <div className="prec-pattern-row">
                                                    <span>Avg. gap</span>
                                                    <b>{pattern.avgGapDays}d between visits</b>
                                                </div>
                                            )}
                                            {pattern.mostActiveMonth && (
                                                <div className="prec-pattern-row">
                                                    <span>Most active</span>
                                                    <b>{pattern.mostActiveMonth}</b>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </aside>
            </div>

            {/* The one shared past-visit detail — same component the consult
                screen's longitudinal band opens. Reused, not forked. */}
            {activeVisit && (
                <PastVisitCard
                    visit={activeVisit.visit}
                    x={activeVisit.x}
                    onClose={() => setActiveVisit(null)}
                />
            )}

            {/* The prescription viewer — same ReviewModal Consult and Print RX
                use, in read-only "print" mode. One prescription renderer. */}
            {rxDetail && (
                <ReviewModal
                    mode="print"
                    patient={rxDetail.patient}
                    visitId={rxDetail.visitId}
                    prescriptionRef={rxDetail.prescriptionRef ?? undefined}
                    symptoms={rxDetail.symptoms}
                    findings={rxDetail.findings}
                    prescription={rxDetail.medicines}
                    tests={rxDetail.tests}
                    followUpDays={rxDetail.followUpDays}
                    adviceNotes={rxDetail.adviceNotes ?? undefined}
                    doctor={rxDetail.doctor}
                    hospital={hospital}
                    vitals={rxDetail.vitals ?? undefined}
                    date={new Date(rxDetail.createdAt)}
                    onClose={() => setRxDetail(null)}
                />
            )}

            {comparing && (
                <CompareVisitsModal
                    visitA={comparing.a}
                    visitB={comparing.b}
                    onClose={() => setComparing(null)}
                />
            )}
        </div>
    );
}
