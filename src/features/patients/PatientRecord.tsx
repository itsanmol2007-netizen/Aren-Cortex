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
    ArrowRight,
    ArrowUp,
    Calendar,
    ChevronDown,
    FlaskConical,
    Phone,
    Pill,
    Plus,
    Stethoscope,
    TrendingUp,
    User,
} from "lucide-react";
import {
    fetchPatientVisits,
    freqSlotToLabel,
    type PatientRecordRow,
    type RealVisit,
} from "../../lib/db";
import type { Patient } from "../../types";
import { WorkspaceHeader } from "../../components/WorkspaceHeader";
import { PastVisitCard } from "../../components/PastVisitCard";
import type { SpecialtyProfile } from "../synapse/specialtyProfile";
import { snapshotFor, visitNoun, type SnapshotChip } from "../synapse/patientSnapshot";
import { deriveRanked, RankedBarList } from "./RankedBarList";
import {
    buildTrendSummary,
    formatDelta,
    formatValue,
    type TrendSeries,
    type TrendVerdict,
} from "../consult/trend";
import { Sparkline, visitForLastReading, formatSpan } from "../consult/LongitudinalBand";

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
            <div className="prec-detail-grid">
                <div className="prec-detail-main">
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
                </div>
                <div className="prec-detail-side">
                    <div className="prec-panel-card">
                        <div className="prec-panel-card-body" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            {[0, 1, 2].map((i) => <SkelBlock key={i} width={`${85 - i * 10}%`} />)}
                        </div>
                    </div>
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

function VisitRow({ visit, isFirst }: { visit: RealVisit; isFirst: boolean }) {
    const [expanded, setExpanded] = useState(false);
    const hasMeds = visit.medicines.length > 0;
    const hasSymptoms = visit.symptoms.length > 0;
    const hasFindings = visit.findings.length > 0;
    const abnormal = visit.findings.filter((f) => f.is_abnormal);
    const visitType = hasMeds ? "Prescription" : hasFindings ? "Examination" : "Consultation";

    return (
        <div className="prec-tl-row">
            <div className="prec-tl-spine">
                <div className={`prec-tl-dot${isFirst ? " is-latest" : ""}`} />
                <div className="prec-tl-line" />
            </div>
            <div className={`prec-tl-card${expanded ? " is-expanded" : ""}`}>
                <button type="button" className="prec-tl-header" onClick={() => setExpanded((e) => !e)}>
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
                        <ChevronDown size={13} className={`prec-tl-chevron${expanded ? " is-open" : ""}`} />
                    </div>
                </button>

                {expanded && (
                    <div className="prec-tl-body">
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
                        {!hasSymptoms && !hasFindings && !hasMeds && (
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
    const [visits, setVisits] = useState<RealVisit[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAll, setShowAll] = useState(false);
    const [activeVisit, setActiveVisit] = useState<{ visit: RealVisit; x: number } | null>(null);

    useEffect(() => {
        setLoading(true);
        setShowAll(false);
        fetchPatientVisits(row.patient_id)
            .then(setVisits)
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [row.patient_id]);

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

                            {/* 2-column detail grid: trend + timeline (main) | patient summary (side) */}
                            <div className="prec-detail-grid">
                                <div className="prec-detail-main">
                                    <div className="prec-panel-card">
                                        <div className="prec-panel-card-header">
                                            <TrendingUp size={13} className="prec-panel-card-icon prec-panel-card-icon--blue" />
                                            <span className="prec-panel-card-title">Progress Trend</span>
                                            {row.care_plan_session_label && (
                                                <span className="prec-trend-careplan-chip">{row.care_plan_session_label}</span>
                                            )}
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
                                        </div>
                                        <div className="prec-panel-card-body">
                                            {completedVisits.length === 0 ? (
                                                <div className="prec-empty-section">
                                                    <FlaskConical size={22} />
                                                    <p>No completed visits on record.</p>
                                                </div>
                                            ) : (
                                                <>
                                                    <div className="prec-tl-list">
                                                        {visibleVisits.map((v, i) => (
                                                            <VisitRow key={v.id} visit={v} isFirst={i === 0} />
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
                                </div>

                                <div className="prec-detail-side">
                                    <div className="prec-panel-card">
                                        <div className="prec-panel-card-header">
                                            <Stethoscope size={13} className="prec-panel-card-icon" />
                                            <span className="prec-panel-card-title">Frequent Complaints</span>
                                        </div>
                                        <div className="prec-panel-card-body">
                                            <RankedBarList items={frequentComplaints} />
                                        </div>
                                    </div>
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
        </div>
    );
}
