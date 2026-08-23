import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import {
    Activity,
    CheckCircle,
    ChevronRight,
    Clock3,
    HeartPulse,
    LayoutTemplate,
    ListChecks,
    Pill,
    Plus,
    Stethoscope,
    Timer,
    Users,
    X,
    Zap,
} from "lucide-react";
import {
    fetchTodayPatients,
    fetchRecentPatients,
    searchPatients,
    type PatientRecordRow,
} from "../../lib/db";
import type { Patient } from "../../types";
import type { SpecialtyProfile } from "../synapse/specialtyProfile";
import { useClinicalIdentity } from "../../hooks/useClinicalIdentity";
import { WorkspaceHeader } from "../../components/WorkspaceHeader";
import { PatientRecord } from "./PatientRecord";
import { PatientsList, PatientsSearchBar } from "./PatientsList";
import { visitStatusKind } from "./visitStatus";
import { deriveRanked, RankedBarList } from "./RankedBarList";
import "./patients.css";

// ── Types ─────────────────────────────────────────────────────────────────────

type View = "list" | "record";

interface Props {
    onStartConsult: (patient: Patient) => void;
    logoRef: RefObject<HTMLDivElement>;
    onOpenSidebar: () => void;
    specialty: SpecialtyProfile;
}

/**
 * A sidebar card doubles as a filter lens over the same table rather than
 * opening a new page — the brief's own instruction ("keeps the user on
 * Patients, filters the list"). `label` is what the active-filter chip shows.
 */
type PatientFilter =
    | { kind: "reassessmentDue"; label: string }
    | { kind: "activeCare"; label: string }
    | { kind: "returning"; label: string }
    | { kind: "condition"; value: string; label: string };

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

// ── Shared aggregates — real, computed from rows actually on screen ─────────

/** "1h 42m" from real started_at/completed_at pairs; null when none finished today. */
function averageVisitMinutes(rows: PatientRecordRow[]): string | null {
    const durations = rows
        .filter((r) => r.started_at && r.completed_at)
        .map((r) => (new Date(r.completed_at as string).getTime() - new Date(r.started_at as string).getTime()) / 60000)
        .filter((mins) => mins > 0 && mins < 24 * 60); // guard against a bad clock producing a nonsense outlier
    if (!durations.length) return null;
    const avg = Math.round(durations.reduce((a, b) => a + b, 0) / durations.length);
    const h = Math.floor(avg / 60);
    const m = avg % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// ── Right Operational Panel ───────────────────────────────────────────────────

/** A skeleton block matching whatever width/height the caller needs — same
 *  shimmer as PatientsList.tsx's, not a second animation to keep in sync. */
function PanelSkeletonBlock({ width, height = 12 }: { width: string | number; height?: number }) {
    return <div className="prec-skeleton" style={{ width, height, borderRadius: 4 }} />;
}

/**
 * The sidebar's own loading state. Before this, RightPanel rendered on
 * empty arrays while `loading` was true upstream — every count read "0" and
 * every ranked list read "No data yet.", which looks like a patient-less
 * clinic rather than a page still loading. Shaped like the real panel
 * (same card titles, same is-physio branch) so the swap-in doesn't jump.
 */
function RightPanelSkeleton({ specialty }: { specialty: SpecialtyProfile }) {
    const isPhysio = specialty.id === "physiotherapy";
    return (
        <aside className="prec-right-col">
            <div className="prec-panel-section">
                <div className="prec-panel-card">
                    <div className="prec-panel-card-header">
                        <Activity size={13} className="prec-panel-card-icon prec-panel-card-icon--pink" />
                        <span className="prec-panel-card-title">Today's Practice</span>
                    </div>
                    <div className="prec-panel-card-body">
                        <div className="prec-summary-grid">
                            {[0, 1, 2, 3].map((i) => (
                                <div key={i} className="prec-summary-cell">
                                    <PanelSkeletonBlock width={24} height={20} />
                                    <PanelSkeletonBlock width="70%" height={9} />
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            <div className="prec-panel-section">
                <div className="prec-panel-card">
                    <div className="prec-panel-card-header">
                        {isPhysio
                            ? <HeartPulse size={13} className="prec-panel-card-icon prec-panel-card-icon--blue" />
                            : <Stethoscope size={13} className="prec-panel-card-icon" />}
                        <span className="prec-panel-card-title">{isPhysio ? "Active Care" : "Common Complaints"}</span>
                    </div>
                    <div className="prec-panel-card-body">
                        {isPhysio ? (
                            <div className="prec-activecare-grid">
                                {[0, 1, 2].map((i) => (
                                    <div key={i} className="prec-activecare-cell" style={{ cursor: "default" }}>
                                        <PanelSkeletonBlock width={20} height={18} />
                                        <PanelSkeletonBlock width="80%" height={8} />
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                                {[0, 1, 2].map((i) => (
                                    <PanelSkeletonBlock key={i} width={`${90 - i * 12}%`} />
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="prec-panel-section">
                <div className="prec-panel-card">
                    <div className="prec-panel-card-header">
                        <ListChecks size={13} className="prec-panel-card-icon" />
                        <span className="prec-panel-card-title">{isPhysio ? "Common Conditions" : "Top Prescribed Medicines"}</span>
                    </div>
                    <div className="prec-panel-card-body" style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                        {[0, 1, 2, 3].map((i) => (
                            <PanelSkeletonBlock key={i} width={`${88 - i * 10}%`} />
                        ))}
                    </div>
                </div>
            </div>

            {isPhysio && (
                <div className="prec-panel-section">
                    <div className="prec-panel-card">
                        <div className="prec-panel-card-header">
                            <Clock3 size={13} className="prec-panel-card-icon prec-panel-card-icon--green" />
                            <span className="prec-panel-card-title">Recent Activity</span>
                        </div>
                        <div className="prec-panel-card-body" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            {[0, 1, 2].map((i) => (
                                <div key={i} style={{ display: "flex", justifyContent: "space-between" }}>
                                    <PanelSkeletonBlock width={90} />
                                    <PanelSkeletonBlock width={60} />
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            <div className="prec-panel-section">
                <div className="prec-panel-card">
                    <div className="prec-panel-card-header">
                        <Zap size={13} className="prec-panel-card-icon prec-panel-card-icon--green" />
                        <span className="prec-panel-card-title">Quick Actions</span>
                    </div>
                    <div className="prec-panel-card-body" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        <PanelSkeletonBlock width="100%" height={28} />
                        <PanelSkeletonBlock width="100%" height={28} />
                    </div>
                </div>
            </div>
        </aside>
    );
}

function RightPanel({
    todayRows,
    recentRows,
    specialty,
    loading,
    activeFilter,
    onSetFilter,
    onNewPatient,
    onManageTemplates,
}: {
    todayRows: PatientRecordRow[];
    recentRows: PatientRecordRow[];
    specialty: SpecialtyProfile;
    loading: boolean;
    activeFilter: PatientFilter | null;
    onSetFilter: (f: PatientFilter | null) => void;
    onNewPatient: () => void;
    onManageTemplates: () => void;
}) {
    const allRows = useMemo(() => [...todayRows, ...recentRows], [todayRows, recentRows]);

    const activeToday = todayRows.filter((r) => visitStatusKind(r.visit_status) === "active").length;
    const completedToday = todayRows.filter((r) => visitStatusKind(r.visit_status) === "done").length;
    const avgTime = averageVisitMinutes(todayRows.filter((r) => visitStatusKind(r.visit_status) === "done"));

    const isPhysio = specialty.id === "physiotherapy";

    // ── Active Care — real aggregates only. Both numbers key off
    // care_plan_progress, which is genuinely null for nearly every visit
    // today because nothing creates a care_plan yet (aren-cortex-context.md
    // §7). Zero here is the correct, honest reading of that gap, not a bug —
    // it will start moving the moment the physio consult session wires it.
    const distinctByPatient = useCallback((rows: PatientRecordRow[]) => {
        const seen = new Set<string>();
        return rows.filter((r) => (seen.has(r.patient_id) ? false : (seen.add(r.patient_id), true)));
    }, []);
    const activeCarePatients = useMemo(
        () => distinctByPatient(allRows.filter((r) => r.care_plan_progress != null)),
        [allRows, distinctByPatient]
    );
    const reassessmentDue = useMemo(
        () => distinctByPatient(allRows.filter((r) => r.care_plan_progress && r.care_plan_progress.sessionsCompleted >= r.care_plan_progress.targetSessions)),
        [allRows, distinctByPatient]
    );
    // Real, not fabricated: a patient this list already knows has more than
    // one visit. Stands in for the mock's "Follow-ups Overdue" — that one has
    // no backing data anywhere in the schema (no scheduled-visit concept
    // exists; see aren-cortex-context.md §7) and is not invented here.
    const returningPatients = useMemo(
        () => distinctByPatient(recentRows.filter((r) => (r.visit_count ?? 1) > 1)),
        [recentRows, distinctByPatient]
    );

    const conditions = useMemo(
        () => deriveRanked(allRows, (r) => (isPhysio ? (r.body_sites.length ? r.body_sites : r.symptom_names.slice(0, 1)) : r.symptom_names)),
        [allRows, isPhysio]
    );
    const medicines = useMemo(() => deriveRanked(allRows, (r) => r.medicine_names.slice(0, 1)), [allRows]);

    const recentActivity = useMemo(
        () =>
            [...allRows]
                .filter((r) => r.started_at)
                .sort((a, b) => new Date(b.started_at as string).getTime() - new Date(a.started_at as string).getTime())
                .slice(0, 5),
        [allRows]
    );

    const toggle = (f: PatientFilter) => onSetFilter(activeFilter && activeFilter.kind === f.kind && ("value" in activeFilter ? activeFilter.value : "") === ("value" in f ? f.value : "") ? null : f);

    // All the above ran on empty arrays while the fetch was still in flight —
    // harmless (every derived value is just empty/zero) — but rendering that
    // as the real panel reads as "this clinic has no patients" rather than
    // "still loading". The skeleton goes after every hook above so hook order
    // stays unconditional.
    if (loading) return <RightPanelSkeleton specialty={specialty} />;

    return (
        <aside className="prec-right-col">

            {/* Today's Practice */}
            <div className="prec-panel-section">
                <div className="prec-panel-card">
                    <div className="prec-panel-card-header">
                        <Activity size={13} className="prec-panel-card-icon prec-panel-card-icon--pink" />
                        <span className="prec-panel-card-title">Today's Practice</span>
                    </div>
                    <div className="prec-panel-card-body">
                        <div className="prec-summary-grid">
                            <div className="prec-summary-cell">
                                <Users size={13} className="prec-summary-cell-icon" />
                                <span className="prec-summary-value">{todayRows.length}</span>
                                <span className="prec-summary-label">Patients Today</span>
                            </div>
                            <div className="prec-summary-cell">
                                <Zap size={13} className="prec-summary-cell-icon" />
                                <span className={`prec-summary-value ${activeToday > 0 ? "prec-summary-value--green" : ""}`}>
                                    {activeToday}
                                </span>
                                <span className="prec-summary-label">In Session</span>
                            </div>
                            <div className="prec-summary-cell">
                                <CheckCircle size={13} className="prec-summary-cell-icon" />
                                <span className="prec-summary-value prec-summary-value--blue">{completedToday}</span>
                                <span className="prec-summary-label">Completed</span>
                            </div>
                            <div className="prec-summary-cell">
                                <Timer size={13} className="prec-summary-cell-icon" />
                                <span className="prec-summary-value prec-summary-value--time">{avgTime ?? "—"}</span>
                                <span className="prec-summary-label">Avg. Visit Time</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {isPhysio ? (
                <>
                    {/* Active Care — filter lenses */}
                    <div className="prec-panel-section">
                        <div className="prec-panel-card">
                            <div className="prec-panel-card-header">
                                <HeartPulse size={13} className="prec-panel-card-icon prec-panel-card-icon--blue" />
                                <span className="prec-panel-card-title">Active Care</span>
                            </div>
                            <div className="prec-panel-card-body">
                                <div className="prec-activecare-grid">
                                    <button
                                        type="button"
                                        className={`prec-activecare-cell${activeFilter?.kind === "activeCare" ? " is-selected" : ""}`}
                                        onClick={() => toggle({ kind: "activeCare", label: "Active care plan" })}
                                        disabled={!activeCarePatients.length}
                                    >
                                        <span className="prec-activecare-value">{activeCarePatients.length}</span>
                                        <span className="prec-activecare-label">Active Patients</span>
                                    </button>
                                    <button
                                        type="button"
                                        className={`prec-activecare-cell prec-activecare-cell--warn${activeFilter?.kind === "reassessmentDue" ? " is-selected" : ""}`}
                                        onClick={() => toggle({ kind: "reassessmentDue", label: "Reassessment due" })}
                                        disabled={!reassessmentDue.length}
                                    >
                                        <span className="prec-activecare-value">{reassessmentDue.length}</span>
                                        <span className="prec-activecare-label">Reassessment Due</span>
                                    </button>
                                    <button
                                        type="button"
                                        className={`prec-activecare-cell${activeFilter?.kind === "returning" ? " is-selected" : ""}`}
                                        onClick={() => toggle({ kind: "returning", label: "Returning patients" })}
                                        disabled={!returningPatients.length}
                                    >
                                        <span className="prec-activecare-value">{returningPatients.length}</span>
                                        <span className="prec-activecare-label">Returning</span>
                                    </button>
                                </div>
                                {!activeCarePatients.length && (
                                    <p className="prec-medicine-placeholder-note">
                                        No active care plans linked yet — starts counting once sessions are grouped into a course.
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Common Conditions */}
                    <div className="prec-panel-section">
                        <div className="prec-panel-card">
                            <div className="prec-panel-card-header">
                                <ListChecks size={13} className="prec-panel-card-icon" />
                                <span className="prec-panel-card-title">Common Conditions</span>
                            </div>
                            <div className="prec-panel-card-body">
                                <RankedBarList
                                    items={conditions}
                                    onSelect={(name) => toggle({ kind: "condition", value: name, label: name })}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Recent Activity */}
                    <div className="prec-panel-section">
                        <div className="prec-panel-card">
                            <div className="prec-panel-card-header">
                                <Clock3 size={13} className="prec-panel-card-icon prec-panel-card-icon--green" />
                                <span className="prec-panel-card-title">Recent Activity</span>
                            </div>
                            <div className="prec-panel-card-body">
                                {recentActivity.length ? (
                                    <div className="prec-activity-list">
                                        {recentActivity.map((r) => {
                                            const kind = visitStatusKind(r.visit_status);
                                            const label = kind === "active" ? "Session in progress" : kind === "waiting" ? "Waiting" : kind === "inactive" ? "Inactive" : "Session completed";
                                            return (
                                                <div key={r.visit_id || r.patient_id} className="prec-activity-row">
                                                    <span className="prec-activity-name">{r.patient_name}</span>
                                                    <span className={`prec-activity-status is-${kind}`}>{label}</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <span style={{ fontSize: 12, color: "#94a3b8" }}>Nothing yet today.</span>
                                )}
                            </div>
                        </div>
                    </div>
                </>
            ) : (
                <>
                    {/* Common Complaints */}
                    <div className="prec-panel-section">
                        <div className="prec-panel-card">
                            <div className="prec-panel-card-header">
                                <Stethoscope size={13} className="prec-panel-card-icon" />
                                <span className="prec-panel-card-title">Common Complaints</span>
                            </div>
                            <div className="prec-panel-card-body">
                                <RankedBarList
                                    items={conditions}
                                    onSelect={(name) => toggle({ kind: "condition", value: name, label: name })}
                                />
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
                                <RankedBarList items={medicines} />
                            </div>
                        </div>
                    </div>
                </>
            )}

            {/* Quick Actions */}
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

export function PatientsPage({ onStartConsult, logoRef, onOpenSidebar, specialty }: Props) {
    const identity = useClinicalIdentity();
    const [view, setView] = useState<View>("list");
    const [selectedRow, setSelectedRow] = useState<PatientRecordRow | null>(null);

    const [todayRows, setTodayRows] = useState<PatientRecordRow[]>([]);
    const [recentRows, setRecentRows] = useState<PatientRecordRow[]>([]);
    const [searchResults, setSearchResults] = useState<PatientRecordRow[] | null>(null);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [filter, setFilter] = useState<PatientFilter | null>(null);

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
                    care_plan_progress: null,
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

    const completedToday = todayRows.filter((r) => visitStatusKind(r.visit_status) === "done").length;
    const activeToday = todayRows.filter((r) => visitStatusKind(r.visit_status) === "active").length;

    // A sidebar card is a lens over the SAME table, never a new page — apply
    // it to both sections rather than forking into a filtered-vs-unfiltered
    // pair of components.
    const applyFilter = useCallback(
        (rows: PatientRecordRow[]): PatientRecordRow[] => {
            if (!filter) return rows;
            switch (filter.kind) {
                case "activeCare":
                    return rows.filter((r) => r.care_plan_progress != null);
                case "reassessmentDue":
                    return rows.filter((r) => r.care_plan_progress && r.care_plan_progress.sessionsCompleted >= r.care_plan_progress.targetSessions);
                case "returning":
                    return rows.filter((r) => (r.visit_count ?? 1) > 1);
                case "condition":
                    return rows.filter(
                        (r) =>
                            r.symptom_names.includes(filter.value) ||
                            r.body_sites.includes(filter.value)
                    );
            }
        },
        [filter]
    );

    const filteredToday = useMemo(() => applyFilter(todayRows), [applyFilter, todayRows]);
    const filteredRecent = useMemo(() => applyFilter(recentRows), [applyFilter, recentRows]);

    // ── Record view ──────────────────────────────────────────────────────────

    if (view === "record" && selectedRow) {
        return (
            <PatientRecord
                row={selectedRow}
                specialty={specialty}
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
                title="Patients"
                subtitle="Clinical Overview & Patient Browser"
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
                {filter && (
                    <button type="button" className="prec-filter-chip" onClick={() => setFilter(null)}>
                        {filter.label}
                        <X size={12} />
                    </button>
                )}
            </div>

            <div className="prec-page-body">
                <div className="prec-main-col">
                    <PatientsList
                        todayRows={filteredToday}
                        recentRows={filteredRecent}
                        searchResults={searchResults}
                        searchQuery={searchQuery}
                        loading={loading}
                        specialty={specialty}
                        onSelectPatient={openRecord}
                    />
                </div>

                {!isSearching && (
                    <RightPanel
                        todayRows={todayRows}
                        recentRows={recentRows}
                        specialty={specialty}
                        loading={loading}
                        activeFilter={filter}
                        onSetFilter={setFilter}
                        onNewPatient={() => { /* wire in next session */ }}
                        onManageTemplates={() => { /* wire in next session */ }}
                    />
                )}
            </div>
        </div>
    );
}
