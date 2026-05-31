import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import {
    Activity,
    ArrowLeft,
    Calendar,
    ChevronDown,
    ChevronRight,
    Clock,
    FileText,
    FlaskConical,
    Phone,
    Plus,
    Search,
    User,
    X,
    Stethoscope,
    Pill,
    AlertCircle,
    Users,
    CheckCircle,
    Timer,
    Zap,
    LayoutTemplate,
} from "lucide-react";
import {
    fetchTodayPatients,
    fetchRecentPatients,
    fetchPatientVisits,
    searchPatients,
    freqSlotToLabel,
    type PatientRecordRow,
    type RealVisit,
} from "../../lib/db";
import type { Patient } from "../../types";
import { WorkspaceHeader } from "../../components/WorkspaceHeader";
import "./patients.css";

// ── Helpers ──────────────────────────────────────────────────────────────────

function initials(name: string): string {
    return name
        .split(" ")
        .map((w) => w[0])
        .slice(0, 2)
        .join("")
        .toUpperCase();
}

function formatDate(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function formatTime(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

function timeAgo(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    const hrs = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (mins < 2) return "just now";
    if (mins < 60) return `${mins}m ago`;
    if (hrs < 24) return `${hrs}h ago`;
    if (days === 1) return "yesterday";
    if (days < 30) return `${days}d ago`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months}mo ago`;
    return `${Math.floor(months / 12)}y ago`;
}

// ── Types ────────────────────────────────────────────────────────────────────

type View = "list" | "record";

interface Props {
    onStartConsult: (patient: Patient) => void;
    logoRef: RefObject<HTMLDivElement>;
    onOpenSidebar: () => void;
}

// ── Sub-components ───────────────────────────────────────────────────────────

function StatusPill({ status }: { status: string }) {
    const isActive = status === "serving" || status === "active" || status === "in_progress";
    return (
        <span className={`prec-status-pill ${isActive ? "is-active" : "is-done"}`}>
            {isActive ? "Active" : "Completed"}
        </span>
    );
}

function AvatarCircle({ name, size = 40 }: { name: string; size?: number }) {
    return (
        <div
            className="prec-avatar"
            style={{ width: size, height: size, fontSize: size * 0.36 }}
        >
            {initials(name)}
        </div>
    );
}

// ── Header right slot (stats pills for dark WorkspaceHeader) ─────────────────

function PatientHeaderStats({
    total,
    active,
    completed,
}: {
    total: number;
    active: number;
    completed: number;
}) {
    return (
        <>
            <div className="ws-stat-pill">
                <span className="ws-stat-value">{total}</span>
                <span className="ws-stat-label">Today</span>
            </div>
            {active > 0 && (
                <div className="ws-stat-pill ws-stat-pill--active">
                    <span className="ws-active-dot" />
                    <span className="ws-stat-value">{active}</span>
                    <span className="ws-stat-label">Active</span>
                </div>
            )}
            <div className="ws-stat-pill">
                <span className="ws-stat-value">{completed}</span>
                <span className="ws-stat-label">Done</span>
            </div>
        </>
    );
}

// ── Right Operational Panel ───────────────────────────────────────────────────
//
// Data sources:
//   todayRows  — fetched, real data. Drives Today's Summary + Common Complaints.
//   recentRows — fetched, real data. Also contributes complaint counts.
//   medicines  — placeholder data until 19B wires real prescription aggregation.
//
// NOTE: Common Complaints are derived from symptom_names across todayRows +
// recentRows. This is a best-effort count from PatientRecordRow (one symptom
// set per patient per row). Full historical aggregation comes in 19B.

const PLACEHOLDER_MEDICINES = [
    { name: "Dolo 650", count: 6 },
    { name: "Pantocid 40", count: 5 },
    { name: "Azithromycin 500", count: 4 },
    { name: "Levocet 5", count: 3 },
    { name: "Calpol 650", count: 3 },
];

function deriveComplaints(rows: PatientRecordRow[]): { name: string; count: number }[] {
    const map = new Map<string, number>();
    for (const row of rows) {
        for (const s of row.symptom_names) {
            map.set(s, (map.get(s) ?? 0) + 1);
        }
    }
    return Array.from(map.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, count]) => ({ name, count }));
}

function RightPanel({
    todayRows,
    recentRows,
    onNewPatient,
    onManageTemplates,
}: {
    todayRows: PatientRecordRow[];
    recentRows: PatientRecordRow[];
    onNewPatient: () => void;
    onManageTemplates: () => void;
}) {
    const totalToday = todayRows.length;
    const activeConsults = todayRows.filter(
        (r) => r.visit_status === "serving" || r.visit_status === "active" || r.visit_status === "in_progress"
    ).length;
    const completed = todayRows.filter((r) => r.visit_status === "completed").length;

    // Avg visit time — placeholder until db exposes duration.
    // Using "1h 42m" consistent with mock in design reference.
    const avgTime = "1h 42m";

    // Common complaints from all rows seen today + recently
    const allRows = [...todayRows, ...recentRows];
    const complaints = deriveComplaints(allRows);
    const maxComplaint = complaints[0]?.count ?? 1;

    const maxMed = PLACEHOLDER_MEDICINES[0]?.count ?? 1;

    return (
        <aside className="prec-right-col">

            {/* ── Today's Summary ── */}
            <div className="prec-panel-section">
                <div className="prec-panel-card">
                    <div className="prec-panel-card-header">
                        <Activity size={13} className="prec-panel-card-icon prec-panel-card-icon--pink" />
                        <span className="prec-panel-card-title">Today's Summary</span>
                    </div>
                    <div className="prec-panel-card-body">
                        <div className="prec-summary-grid">
                            <div className="prec-summary-cell">
                                <Users size={13} className="prec-summary-cell-icon" />
                                <span className="prec-summary-value">{totalToday}</span>
                                <span className="prec-summary-label">Patients Seen</span>
                            </div>
                            <div className="prec-summary-cell">
                                <Zap size={13} className="prec-summary-cell-icon" />
                                <span className={`prec-summary-value ${activeConsults > 0 ? "prec-summary-value--green" : ""}`}>
                                    {activeConsults}
                                </span>
                                <span className="prec-summary-label">Active Consults</span>
                            </div>
                            <div className="prec-summary-cell">
                                <CheckCircle size={13} className="prec-summary-cell-icon" />
                                <span className="prec-summary-value prec-summary-value--blue">
                                    {completed}
                                </span>
                                <span className="prec-summary-label">Completed</span>
                            </div>
                            <div className="prec-summary-cell">
                                <Timer size={13} className="prec-summary-cell-icon" />
                                <span className="prec-summary-value prec-summary-value--time">
                                    {avgTime}
                                </span>
                                <span className="prec-summary-label">Avg. Visit Time</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Common Complaints — ranked list, no chart ── */}
            <div className="prec-panel-section">
                <div className="prec-panel-card">
                    <div className="prec-panel-card-header">
                        <Stethoscope size={13} className="prec-panel-card-icon" />
                        <span className="prec-panel-card-title">Common Complaints</span>
                    </div>
                    <div className="prec-panel-card-body">
                        {complaints.length > 0 ? (
                            <div className="prec-complaint-list">
                                {complaints.map((c, i) => (
                                    <div key={c.name} className="prec-complaint-row">
                                        <span className="prec-complaint-rank">{i + 1}</span>
                                        <span className="prec-complaint-name">{c.name}</span>
                                        <div className="prec-complaint-bar-wrap">
                                            <div
                                                className="prec-complaint-bar-fill"
                                                style={{ width: `${Math.round((c.count / maxComplaint) * 100)}%` }}
                                            />
                                        </div>
                                        <span className="prec-complaint-count">{c.count}</span>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <span style={{ fontSize: 12, color: "#94a3b8" }}>No data yet today.</span>
                        )}
                    </div>
                </div>
            </div>

            {/* ── Top Prescribed Medicines ── */}
            <div className="prec-panel-section">
                <div className="prec-panel-card">
                    <div className="prec-panel-card-header">
                        <Pill size={13} className="prec-panel-card-icon prec-panel-card-icon--blue" />
                        <span className="prec-panel-card-title">Top Prescribed Medicines</span>
                    </div>
                    <div className="prec-panel-card-body">
                        <div className="prec-medicine-list">
                            {PLACEHOLDER_MEDICINES.map((m) => (
                                <div key={m.name} className="prec-medicine-row">
                                    <span className="prec-medicine-name">{m.name}</span>
                                    <div className="prec-medicine-bar-wrap">
                                        <div
                                            className="prec-medicine-bar-fill"
                                            style={{ width: `${Math.round((m.count / maxMed) * 100)}%` }}
                                        />
                                    </div>
                                    <span className="prec-medicine-count">{m.count}</span>
                                </div>
                            ))}
                        </div>
                        <p className="prec-medicine-placeholder-note">
                            Live data in next update
                        </p>
                    </div>
                </div>
            </div>

            {/* ── Quick Actions — New Patient + Manage Templates only ── */}
            <div className="prec-panel-section">
                <div className="prec-panel-card">
                    <div className="prec-panel-card-header">
                        <Zap size={13} className="prec-panel-card-icon prec-panel-card-icon--green" />
                        <span className="prec-panel-card-title">Quick Actions</span>
                    </div>
                    <div className="prec-quick-actions">
                        <button
                            type="button"
                            className="prec-quick-action-btn"
                            onClick={onNewPatient}
                        >
                            <span className="prec-quick-action-icon-wrap">
                                <Plus size={14} />
                            </span>
                            <span className="prec-quick-action-label">New Patient</span>
                            <ChevronRight size={13} className="prec-quick-action-arrow" />
                        </button>
                        <button
                            type="button"
                            className="prec-quick-action-btn"
                            onClick={onManageTemplates}
                        >
                            <span className="prec-quick-action-icon-wrap">
                                <LayoutTemplate size={14} />
                            </span>
                            <span className="prec-quick-action-label">Manage Templates</span>
                            <ChevronRight size={13} className="prec-quick-action-arrow" />
                        </button>
                    </div>
                </div>
            </div>

        </aside>
    );
}

// ── Patient row (list) ───────────────────────────────────────────────────────

function PatientRow({
    row,
    onClick,
}: {
    row: PatientRecordRow;
    onClick: () => void;
}) {
    const ts = row.started_at ? timeAgo(row.started_at) : "";
    const isActive =
        row.visit_status === "serving" ||
        row.visit_status === "active" ||
        row.visit_status === "in_progress";

    return (
        <button type="button" className="prec-patient-row" onClick={onClick}>
            <AvatarCircle name={row.patient_name} />
            <div className="prec-row-main">
                <div className="prec-row-name">
                    <span>{row.patient_name}</span>
                    {isActive && <span className="prec-active-dot" title="Active consult" />}
                </div>
                <div className="prec-row-meta">
                    {row.age > 0 && <span>{row.age}y</span>}
                    {row.gender && <span className="prec-row-meta-sep" />}
                    {row.gender && <span>{row.gender}</span>}
                    {row.phone && <span className="prec-row-meta-sep" />}
                    {row.phone && (
                        <span className="prec-row-phone">
                            <Phone size={11} />
                            {row.phone}
                        </span>
                    )}
                </div>
                {row.symptom_names.length > 0 && (
                    <div className="prec-row-symptoms">
                        {row.symptom_names.slice(0, 3).map((s) => (
                            <span key={s} className="prec-symptom-chip">{s}</span>
                        ))}
                        {row.symptom_names.length > 3 && (
                            <span className="prec-symptom-more">+{row.symptom_names.length - 3}</span>
                        )}
                    </div>
                )}
            </div>
            <div className="prec-row-right">
                <StatusPill status={row.visit_status} />
                <span className="prec-row-time">{ts}</span>
                <ChevronRight size={14} className="prec-row-arrow" />
            </div>
        </button>
    );
}

// ── Today's card ─────────────────────────────────────────────────────────────

function TodayCard({
    row,
    onClick,
}: {
    row: PatientRecordRow;
    onClick: () => void;
}) {
    const isActive =
        row.visit_status === "serving" ||
        row.visit_status === "active" ||
        row.visit_status === "in_progress";
    const time = row.started_at ? formatTime(row.started_at) : "";

    return (
        <button type="button" className="prec-today-card" onClick={onClick}>
            <div className="prec-today-card-top">
                <AvatarCircle name={row.patient_name} size={34} />
                {isActive && <span className="prec-active-dot prec-active-dot--card" />}
            </div>
            <div className="prec-today-name">{row.patient_name}</div>
            <div className="prec-today-sub">
                {row.age > 0 ? `${row.age}y` : ""}
                {row.age > 0 && row.gender ? " · " : ""}
                {row.gender || ""}
            </div>
            {row.symptom_names.length > 0 ? (
                <div className="prec-today-chief">{row.symptom_names[0]}</div>
            ) : (
                <div className="prec-today-chief prec-today-chief--empty">No symptoms logged</div>
            )}
            <div className="prec-today-time">
                <Clock size={10} />
                {time}
            </div>
        </button>
    );
}

// ── Recent Clinical Snapshot ──────────────────────────────────────────────────

function ClinicalSnapshot({ visits }: { visits: RealVisit[] }) {
    const completed = visits.filter((v) => !v.id.includes("serving"));
    const last = completed[0];

    if (!last) return null;

    const recentSymptoms = last.symptoms.slice(0, 4);
    const recentMeds = last.medicines.slice(0, 3);
    const abnormalFindings = last.findings.filter((f) => f.is_abnormal);
    const normalFindings = last.findings.filter((f) => !f.is_abnormal).slice(0, 2);
    const prev = completed[1];

    return (
        <div className="prec-snapshot-card">
            <div className="prec-snapshot-header">
                <div className="prec-snapshot-title">
                    <Stethoscope size={13} />
                    <span>Recent Clinical Snapshot</span>
                </div>
                <span className="prec-snapshot-date">{formatDate(last.created_at)}</span>
            </div>

            <div className="prec-snapshot-grid">
                <div className="prec-snapshot-block">
                    <div className="prec-snapshot-block-label">Presenting Complaints</div>
                    {recentSymptoms.length > 0 ? (
                        <div className="prec-snapshot-chips">
                            {recentSymptoms.map((s) => (
                                <span key={s} className="prec-symptom-chip">{s}</span>
                            ))}
                            {last.symptoms.length > 4 && (
                                <span className="prec-symptom-more">+{last.symptoms.length - 4}</span>
                            )}
                        </div>
                    ) : (
                        <span className="prec-snapshot-empty">Not recorded</span>
                    )}
                </div>

                <div className="prec-snapshot-block">
                    <div className="prec-snapshot-block-label">Last Prescription</div>
                    {recentMeds.length > 0 ? (
                        <div className="prec-snapshot-rx">
                            {recentMeds.map((m) => (
                                <div key={m.medicine_id} className="prec-snapshot-rx-row">
                                    <Pill size={10} className="prec-snapshot-rx-icon" />
                                    <span className="prec-snapshot-rx-name">{m.name}</span>
                                    {m.dosage_mg && (
                                        <span className="prec-snapshot-rx-dose">{m.dosage_mg}mg</span>
                                    )}
                                    {m.frequency && (
                                        <span className="prec-snapshot-rx-freq">
                                            {freqSlotToLabel(m.frequency)}
                                        </span>
                                    )}
                                </div>
                            ))}
                            {last.medicines.length > 3 && (
                                <span className="prec-snapshot-empty">
                                    +{last.medicines.length - 3} more
                                </span>
                            )}
                        </div>
                    ) : (
                        <span className="prec-snapshot-empty">No medicines prescribed</span>
                    )}
                </div>

                {(abnormalFindings.length > 0 || normalFindings.length > 0) && (
                    <div className="prec-snapshot-block">
                        <div className="prec-snapshot-block-label">Clinical Findings</div>
                        <div className="prec-snapshot-chips">
                            {abnormalFindings.map((f) => (
                                <span key={f.name} className="prec-finding-chip is-abnormal">
                                    <AlertCircle size={9} style={{ marginRight: 3 }} />
                                    {f.name}
                                </span>
                            ))}
                            {normalFindings.map((f) => (
                                <span key={f.name} className="prec-finding-chip">{f.name}</span>
                            ))}
                        </div>
                    </div>
                )}

                {prev && (
                    <div className="prec-snapshot-block prec-snapshot-block--prev">
                        <div className="prec-snapshot-block-label">Previous Visit</div>
                        <span className="prec-snapshot-prev-date">{formatDate(prev.created_at)}</span>
                        {prev.symptoms.length > 0 && (
                            <div className="prec-snapshot-chips" style={{ marginTop: 4 }}>
                                {prev.symptoms.slice(0, 3).map((s) => (
                                    <span key={s} className="prec-symptom-chip prec-symptom-chip--faded">{s}</span>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

// ── VisitCard ─────────────────────────────────────────────────────────────────

function VisitCard({ visit, index }: { visit: RealVisit; index: number }) {
    const [expanded, setExpanded] = useState(false);

    const hasMeds = visit.medicines.length > 0;
    const hasSymptoms = visit.symptoms.length > 0;
    const hasFindings = visit.findings.length > 0;
    const abnormalFindings = visit.findings.filter((f) => f.is_abnormal);
    const hasTests = (visit as any).tests?.length > 0;

    const visitType = hasMeds
        ? "Prescription"
        : hasFindings
            ? "Examination"
            : "Consultation";

    return (
        <div
            className={`prec-visit-card ${expanded ? "is-expanded" : ""}`}
            data-type={visitType}
        >
            <button
                type="button"
                className="prec-visit-header"
                onClick={() => setExpanded((e) => !e)}
            >
                <div className="prec-visit-timeline-dot" />
                <div className="prec-visit-header-left">
                    <div className="prec-visit-date-block">
                        <Calendar size={12} />
                        <span>{formatDate(visit.created_at)}</span>
                    </div>
                    <span className="prec-visit-type-badge" data-type={visitType}>
                        {visitType}
                    </span>
                    {!expanded && hasSymptoms && (
                        <div className="prec-visit-preview-chips">
                            {visit.symptoms.slice(0, 2).map((s) => (
                                <span key={s} className="prec-symptom-chip">{s}</span>
                            ))}
                            {visit.symptoms.length > 2 && (
                                <span className="prec-symptom-more">+{visit.symptoms.length - 2}</span>
                            )}
                        </div>
                    )}
                </div>
                <div className="prec-visit-header-right">
                    <div className="prec-visit-stats">
                        {hasMeds && (
                            <span className="prec-visit-stat prec-visit-stat--med">
                                <Pill size={10} />
                                {visit.medicines.length}
                            </span>
                        )}
                        {abnormalFindings.length > 0 && (
                            <span className="prec-visit-stat prec-visit-stat--abnormal">
                                <AlertCircle size={10} />
                                {abnormalFindings.length}
                            </span>
                        )}
                        {hasTests && (
                            <span className="prec-visit-stat prec-visit-stat--test">
                                <FlaskConical size={10} />
                                {(visit as any).tests.length}
                            </span>
                        )}
                    </div>
                    <ChevronDown
                        size={14}
                        className={`prec-visit-chevron ${expanded ? "is-open" : ""}`}
                    />
                </div>
            </button>

            {expanded && (
                <div className="prec-visit-body">
                    {(hasSymptoms || hasFindings) && (
                        <div className="prec-visit-two-col">
                            {hasSymptoms && (
                                <div className="prec-visit-section">
                                    <div className="prec-visit-section-label">Complaints</div>
                                    <div className="prec-visit-chips">
                                        {visit.symptoms.map((s) => (
                                            <span key={s} className="prec-symptom-chip">{s}</span>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {hasFindings && (
                                <div className="prec-visit-section">
                                    <div className="prec-visit-section-label">Findings</div>
                                    <div className="prec-visit-chips">
                                        {visit.findings.map((f) => (
                                            <span
                                                key={f.name}
                                                className={`prec-finding-chip ${f.is_abnormal ? "is-abnormal" : ""}`}
                                            >
                                                {f.is_abnormal && <AlertCircle size={9} style={{ marginRight: 3 }} />}
                                                {f.name}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {hasMeds && (
                        <div className="prec-visit-section">
                            <div className="prec-visit-section-label">Prescription</div>
                            <div className="prec-med-list">
                                {visit.medicines.map((m) => (
                                    <div key={m.medicine_id} className="prec-med-row">
                                        <div className="prec-med-left">
                                            <Pill size={11} className="prec-med-icon" />
                                            <div className="prec-med-name">{m.name}</div>
                                        </div>
                                        <div className="prec-med-detail">
                                            {m.dosage_mg && <span>{m.dosage_mg}mg</span>}
                                            {m.frequency && <span>{freqSlotToLabel(m.frequency)}</span>}
                                            {m.duration_days && <span>{m.duration_days}d</span>}
                                            {m.route && m.route !== "oral" && (
                                                <span className="prec-med-route">{m.route}</span>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {!hasSymptoms && !hasFindings && !hasMeds && (
                        <div className="prec-visit-empty">No clinical data recorded for this visit.</div>
                    )}
                </div>
            )}
        </div>
    );
}

// ── Patient Record (detail view) ──────────────────────────────────────────────

function PatientRecord({
    row,
    onBack,
    onStartConsult,
    logoRef,
    onOpenSidebar,
}: {
    row: PatientRecordRow;
    onBack: () => void;
    onStartConsult: (patient: Patient) => void;
    logoRef: RefObject<HTMLDivElement>;
    onOpenSidebar: () => void;
}) {
    const [visits, setVisits] = useState<RealVisit[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        fetchPatientVisits(row.patient_id)
            .then(setVisits)
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [row.patient_id]);

    const completedVisits = visits.filter((v) => !v.id.includes("serving"));
    const lastVisit = completedVisits[0];

    const lastRxName = lastVisit?.medicines?.[0]?.name ?? null;
    const recentSymptoms = lastVisit?.symptoms?.slice(0, 2).join(", ") ?? null;

    const handleStartConsult = () => {
        const patient: Patient = {
            id: row.patient_id,
            name: row.patient_name,
            age: String(row.age),
            gender: row.gender as Patient["gender"],
            phone: row.phone,
        };
        onStartConsult(patient);
    };

    return (
        <div className="prec-record-view">
            <WorkspaceHeader
                logoRef={logoRef}
                onOpenSidebar={onOpenSidebar}
                title="Patient Records"
                subtitle="Clinical History & Continuity"
            />

            <div className="prec-record-topbar">
                <button type="button" className="prec-back-btn" onClick={onBack}>
                    <ArrowLeft size={14} />
                    <span>All Patients</span>
                </button>
                <button
                    type="button"
                    className="prec-start-consult-btn prec-start-consult-btn--topbar"
                    onClick={handleStartConsult}
                >
                    <Plus size={13} />
                    New Consult
                </button>
            </div>

            <div className="prec-record-body">
                <div className="prec-identity-card">
                    <div className="prec-identity-left">
                        <AvatarCircle name={row.patient_name} size={52} />
                        <div>
                            <div className="prec-identity-name">{row.patient_name}</div>
                            <div className="prec-identity-meta">
                                {row.age > 0 && <span>{row.age} yrs</span>}
                                {row.gender && <span className="prec-identity-sep">·</span>}
                                {row.gender && <span>{row.gender}</span>}
                                {row.phone && <span className="prec-identity-sep">·</span>}
                                {row.phone && (
                                    <span className="prec-identity-phone">
                                        <Phone size={12} />
                                        {row.phone}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="prec-stats-strip">
                    <div className="prec-stat-block">
                        <div className="prec-stat-value">{completedVisits.length}</div>
                        <div className="prec-stat-label">Total Visits</div>
                    </div>
                    <div className="prec-stat-divider" />
                    <div className="prec-stat-block prec-stat-block--wide">
                        <div className="prec-stat-value prec-stat-value--rx">
                            {lastRxName ?? "—"}
                        </div>
                        <div className="prec-stat-label">Last Rx</div>
                    </div>
                    <div className="prec-stat-divider" />
                    <div className="prec-stat-block prec-stat-block--wide">
                        <div className="prec-stat-value prec-stat-value--sym">
                            {recentSymptoms ?? "—"}
                        </div>
                        <div className="prec-stat-label">Recent Complaints</div>
                    </div>
                    <div className="prec-stat-divider" />
                    <div className="prec-stat-block">
                        <div className="prec-stat-value">
                            {lastVisit ? timeAgo(lastVisit.created_at) : "—"}
                        </div>
                        <div className="prec-stat-label">Last Visit</div>
                    </div>
                </div>

                {!loading && completedVisits.length > 0 && (
                    <ClinicalSnapshot visits={visits} />
                )}

                <div className="prec-timeline-header">
                    <div className="prec-timeline-title">Visit Timeline</div>
                    <div className="prec-timeline-count">
                        {completedVisits.length} visit{completedVisits.length !== 1 ? "s" : ""}
                    </div>
                </div>

                {loading ? (
                    <div className="prec-loading-visits">
                        <div className="prec-loading-dot" />
                        <div className="prec-loading-dot" />
                        <div className="prec-loading-dot" />
                        <span>Loading visit history…</span>
                    </div>
                ) : completedVisits.length === 0 ? (
                    <div className="prec-empty-visits">
                        <FlaskConical size={26} />
                        <p>No completed visits on record.</p>
                        <span>Start a new consult to begin building this patient's history.</span>
                    </div>
                ) : (
                    <div className="prec-visit-list">
                        {completedVisits.map((v, i) => (
                            <VisitCard key={v.id} visit={v} index={i} />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function PatientsPage({ onStartConsult, logoRef, onOpenSidebar }: Props) {
    const [view, setView] = useState<View>("list");
    const [selectedRow, setSelectedRow] = useState<PatientRecordRow | null>(null);

    const [todayRows, setTodayRows] = useState<PatientRecordRow[]>([]);
    const [recentRows, setRecentRows] = useState<PatientRecordRow[]>([]);
    const [searchResults, setSearchResults] = useState<PatientRecordRow[] | null>(null);

    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");

    const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        setLoading(true);
        Promise.all([fetchTodayPatients(), fetchRecentPatients()])
            .then(([today, recent]) => {
                setTodayRows(today);
                setRecentRows(recent);
            })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => {
        if (!searchQuery.trim()) {
            setSearchResults(null);
            return;
        }
        if (searchTimer.current) clearTimeout(searchTimer.current);
        searchTimer.current = setTimeout(async () => {
            try {
                const results = await searchPatients(searchQuery.trim());
                const mapped: PatientRecordRow[] = results.map((p) => ({
                    patient_id: p.id,
                    patient_name: p.name,
                    age: p.age,
                    gender: p.gender,
                    phone: p.phone,
                    visit_id: "",
                    visit_status: "completed",
                    started_at: null,
                    completed_at: null,
                    symptom_names: [],
                }));
                setSearchResults(mapped);
            } catch (e) {
                console.error(e);
            }
        }, 280);
        return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
    }, [searchQuery]);

    const openRecord = useCallback((row: PatientRecordRow) => {
        setSelectedRow(row);
        setView("record");
    }, []);

    const goBack = useCallback(() => {
        setView("list");
        setSelectedRow(null);
    }, []);

    const completedToday = todayRows.filter((r) => r.visit_status === "completed").length;
    const activeToday = todayRows.filter(
        (r) =>
            r.visit_status === "serving" ||
            r.visit_status === "active" ||
            r.visit_status === "in_progress"
    ).length;

    // ── Record view ──────────────────────────────────────────────────────────

    if (view === "record" && selectedRow) {
        return (
            <PatientRecord
                row={selectedRow}
                onBack={goBack}
                onStartConsult={onStartConsult}
                logoRef={logoRef}
                onOpenSidebar={onOpenSidebar}
            />
        );
    }

    // ── List view ────────────────────────────────────────────────────────────

    const displayRows = searchResults ?? recentRows;
    const isSearching = searchQuery.trim().length > 0;

    return (
        <div className="prec-page">

            <WorkspaceHeader
                logoRef={logoRef}
                onOpenSidebar={onOpenSidebar}
                title="Patient Records"
                subtitle="Clinical History & Continuity"
                rightSlot={
                    <PatientHeaderStats
                        total={todayRows.length}
                        active={activeToday}
                        completed={completedToday}
                    />
                }
            />

            {/* Sub-header: search only */}
            <div className="prec-page-header">
                <div className="prec-search-wrap">
                    <Search size={15} className="prec-search-icon" />
                    <input
                        type="text"
                        className="prec-search-input"
                        placeholder="Search patients by name or phone…"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        autoComplete="off"
                    />
                    {searchQuery && (
                        <button
                            type="button"
                            className="prec-search-clear"
                            onClick={() => setSearchQuery("")}
                        >
                            <X size={12} />
                        </button>
                    )}
                </div>
            </div>

            {/* Two-column body */}
            <div className="prec-page-body">

                {/* ── Left column: main content ── */}
                <div className="prec-main-col">
                    {loading ? (
                        <div className="prec-loading-state">
                            <div className="prec-loading-dot" />
                            <div className="prec-loading-dot" />
                            <div className="prec-loading-dot" />
                            <span>Loading records…</span>
                        </div>
                    ) : isSearching ? (
                        <div className="prec-list-section">
                            <div className="prec-section-header">
                                <span className="prec-section-title">
                                    {searchResults && searchResults.length > 0
                                        ? `${searchResults.length} result${searchResults.length !== 1 ? "s" : ""}`
                                        : `No results for "${searchQuery}"`}
                                </span>
                            </div>
                            {searchResults && searchResults.length > 0 ? (
                                <div className="prec-patient-list">
                                    {searchResults.map((row) => (
                                        <PatientRow
                                            key={row.patient_id}
                                            row={row}
                                            onClick={() => openRecord(row)}
                                        />
                                    ))}
                                </div>
                            ) : (
                                <div className="prec-empty-section">
                                    <User size={22} />
                                    <p>No patients found.</p>
                                </div>
                            )}
                        </div>
                    ) : (
                        <>
                            {todayRows.length > 0 && (
                                <div className="prec-list-section">
                                    <div className="prec-section-header">
                                        <span className="prec-section-title">Today's Patients</span>
                                        <span className="prec-section-count">{todayRows.length}</span>
                                    </div>
                                    <div className="prec-today-scroll">
                                        {todayRows.map((row) => (
                                            <TodayCard
                                                key={row.visit_id || row.patient_id}
                                                row={row}
                                                onClick={() => openRecord(row)}
                                            />
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="prec-list-section">
                                <div className="prec-section-header">
                                    <span className="prec-section-title">All Patients</span>
                                    <span className="prec-section-count">{recentRows.length}</span>
                                </div>
                                {recentRows.length > 0 ? (
                                    <div className="prec-patient-list">
                                        {recentRows.map((row) => (
                                            <PatientRow
                                                key={row.patient_id}
                                                row={row}
                                                onClick={() => openRecord(row)}
                                            />
                                        ))}
                                    </div>
                                ) : (
                                    <div className="prec-empty-section">
                                        <User size={22} />
                                        <p>No past patients found.</p>
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>

                {/* ── Right column: operational panel ── */}
                {/* Hidden during search so it doesn't distract */}
                {!isSearching && (
                    <RightPanel
                        todayRows={todayRows}
                        recentRows={recentRows}
                        onNewPatient={() => { /* wire to new patient flow in 19B */ }}
                        onManageTemplates={() => { /* wire to templates page in 19B */ }}
                    />
                )}

            </div>
        </div>
    );
}