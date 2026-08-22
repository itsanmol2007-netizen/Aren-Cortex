import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import {
    Activity,
    CheckCircle,
    ChevronRight,
    LayoutTemplate,
    Pill,
    Plus,
    Stethoscope,
    Timer,
    Users,
    Zap,
} from "lucide-react";
import {
    fetchTodayPatients,
    fetchRecentPatients,
    searchPatients,
    type PatientRecordRow,
} from "../../lib/db";
import type { Patient } from "../../types";
import { useClinicalIdentity } from "../../hooks/useClinicalIdentity";
import { WorkspaceHeader } from "../../components/WorkspaceHeader";
import { PatientRecord } from "./PatientRecord";
import { PatientsList, PatientsSearchBar } from "./PatientsList";
import "./patients.css";

// ── Types ─────────────────────────────────────────────────────────────────────

type View = "list" | "record";

interface Props {
    onStartConsult: (patient: Patient) => void;
    logoRef: RefObject<HTMLDivElement>;
    onOpenSidebar: () => void;
}

// ── Header stats pills ────────────────────────────────────────────────────────

function PatientHeaderStats({ total, active, completed }: { total: number; active: number; completed: number }) {
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
    const avgTime = "1h 42m";

    const allRows = [...todayRows, ...recentRows];
    const complaints = deriveComplaints(allRows);
    const maxComplaint = complaints[0]?.count ?? 1;
    const maxMed = PLACEHOLDER_MEDICINES[0]?.count ?? 1;

    return (
        <aside className="prec-right-col">

            {/* Today's Summary */}
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
                                <span className="prec-summary-value prec-summary-value--blue">{completed}</span>
                                <span className="prec-summary-label">Completed</span>
                            </div>
                            <div className="prec-summary-cell">
                                <Timer size={13} className="prec-summary-cell-icon" />
                                <span className="prec-summary-value prec-summary-value--time">{avgTime}</span>
                                <span className="prec-summary-label">Avg. Visit Time</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Common Complaints — ranked list, no chart */}
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

            {/* Top Prescribed Medicines */}
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
                        <p className="prec-medicine-placeholder-note">Live data in next update</p>
                    </div>
                </div>
            </div>

            {/* Quick Actions — New Patient + Manage Templates only */}
            <div className="prec-panel-section">
                <div className="prec-panel-card">
                    <div className="prec-panel-card-header">
                        <Zap size={13} className="prec-panel-card-icon prec-panel-card-icon--green" />
                        <span className="prec-panel-card-title">Quick Actions</span>
                    </div>
                    <div className="prec-quick-actions">
                        <button type="button" className="prec-quick-action-btn" onClick={onNewPatient}>
                            <span className="prec-quick-action-icon-wrap"><Plus size={14} /></span>
                            <span className="prec-quick-action-label">New Patient</span>
                            <ChevronRight size={13} className="prec-quick-action-arrow" />
                        </button>
                        <button type="button" className="prec-quick-action-btn" onClick={onManageTemplates}>
                            <span className="prec-quick-action-icon-wrap"><LayoutTemplate size={14} /></span>
                            <span className="prec-quick-action-label">Manage Templates</span>
                            <ChevronRight size={13} className="prec-quick-action-arrow" />
                        </button>
                    </div>
                </div>
            </div>

        </aside>
    );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function PatientsPage({ onStartConsult, logoRef, onOpenSidebar }: Props) {
    const identity = useClinicalIdentity();
    const [view, setView] = useState<View>("list");
    const [selectedRow, setSelectedRow] = useState<PatientRecordRow | null>(null);

    const [todayRows, setTodayRows] = useState<PatientRecordRow[]>([]);
    const [recentRows, setRecentRows] = useState<PatientRecordRow[]>([]);
    const [searchResults, setSearchResults] = useState<PatientRecordRow[] | null>(null);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");

    const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Both queries are scoped to the signed-in doctor. Until identity resolves
    // there is no id to ask for, and asking with the wrong one is what used to
    // render another clinic's records — so this waits rather than guessing.
    useEffect(() => {
        if (!identity.ready) return;
        setLoading(true);
        Promise.all([
            fetchTodayPatients(identity.doctorId),
            fetchRecentPatients(identity.doctorId),
        ])
            .then(([today, recent]) => {
                setTodayRows(today);
                setRecentRows(recent);
            })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [identity.ready, identity.doctorId]);

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
                    finding_names: [],
                    medicine_names: [],
                    test_names: [],
                    visit_count: 1,
                    last_visit_at: null,
                    // Search hits a patient, not a visit — no per-visit physio
                    // fields to show. The snapshot renders its empty state.
                    body_sites: [],
                    exercise_names: [],
                    impairment_names: [],
                    story_duration: null,
                    story_mechanism: null,
                    care_plan_session_label: null,
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
        (r) => r.visit_status === "serving" || r.visit_status === "active" || r.visit_status === "in_progress"
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

            <div className="prec-page-header">
                <PatientsSearchBar value={searchQuery} onChange={setSearchQuery} />
            </div>

            <div className="prec-page-body">
                <div className="prec-main-col">
                    <PatientsList
                        todayRows={todayRows}
                        recentRows={recentRows}
                        searchResults={searchResults}
                        searchQuery={searchQuery}
                        loading={loading}
                        onSelectPatient={openRecord}
                    />
                </div>

                {!isSearching && (
                    <RightPanel
                        todayRows={todayRows}
                        recentRows={recentRows}
                        onNewPatient={() => { /* wire in next session */ }}
                        onManageTemplates={() => { /* wire in next session */ }}
                    />
                )}
            </div>
        </div>
    );
}