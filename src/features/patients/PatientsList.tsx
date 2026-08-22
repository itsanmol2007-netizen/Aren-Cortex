import { useState } from "react";
import {
    ChevronRight,
    Clock,
    Phone,
    Search,
    User,
    X,
} from "lucide-react";
import { type PatientRecordRow } from "../../lib/db";
import type { SpecialtyProfile } from "../synapse/specialtyProfile";
import { snapshotFor, visitNoun, type SnapshotChip } from "../synapse/patientSnapshot";
import { visitStatusKind, VISIT_STATUS_LABEL } from "./visitStatus";

// ── Helpers ──────────────────────────────────────────────────────────────────

function initials(name: string): string {
    return name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

function formatTime(iso: string): string {
    return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
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

function formatLastVisit(iso: string | null): { label: string; sub: string } {
    if (!iso) return { label: "—", sub: "" };
    const d = new Date(iso);
    const diff = Date.now() - d.getTime();
    const days = Math.floor(diff / 86400000);
    if (days === 0) return { label: "Today", sub: formatTime(iso) };
    if (days === 1) return { label: "Yesterday", sub: formatTime(iso) };
    return {
        label: d.toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
        sub: d.getFullYear() !== new Date().getFullYear() ? String(d.getFullYear()) : formatTime(iso),
    };
}

// ── Avatar ───────────────────────────────────────────────────────────────────

function AvatarCircle({ name, size = 40 }: { name: string; size?: number }) {
    return (
        <div className="prec-avatar" style={{ width: size, height: size, fontSize: size * 0.36 }}>
            {initials(name)}
        </div>
    );
}

// ── Skeleton Components ──────────────────────────────────────────────────────

function SkeletonBlock({ width, height, style }: { width?: string | number; height?: string | number; style?: React.CSSProperties }) {
    return (
        <div
            className="prec-skeleton"
            style={{
                width: width ?? "100%",
                height: height ?? "1em",
                borderRadius: 4,
                ...style,
            }}
        />
    );
}

function SkeletonAvatar({ size = 40 }: { size?: number }) {
    return (
        <div
            className="prec-skeleton prec-skeleton--circle"
            style={{
                width: size,
                height: size,
                borderRadius: "50%",
            }}
        />
    );
}

function SkeletonTodayCard() {
    return (
        <div className="prec-today-card prec-today-card--skeleton">
            <div className="prec-today-card-topbar" aria-hidden="true" />
            <div className="prec-today-card-top">
                <SkeletonAvatar size={34} />
            </div>
            <SkeletonBlock width="70%" height={16} style={{ marginTop: 12 }} />
            <SkeletonBlock width="50%" height={12} style={{ marginTop: 6 }} />
            <SkeletonBlock width="85%" height={12} style={{ marginTop: 8 }} />
            <div className="prec-today-footer" style={{ marginTop: 12 }}>
                <SkeletonBlock width={50} height={12} />
                <SkeletonBlock width={70} height={22} style={{ borderRadius: 11 }} />
            </div>
        </div>
    );
}

function SkeletonTableRow() {
    return (
        <tr className="prec-table-row prec-table-row--skeleton">
            <td className="prec-table-cell prec-table-cell--patient">
                <div className="prec-table-patient-inner">
                    <SkeletonAvatar size={32} />
                    <div className="prec-table-patient-info" style={{ gap: 4 }}>
                        <SkeletonBlock width={120} height={14} />
                        <SkeletonBlock width={80} height={11} />
                    </div>
                </div>
            </td>
            <td className="prec-table-cell prec-table-cell--snapshot">
                <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                    <SkeletonBlock width={70} height={20} style={{ borderRadius: 10 }} />
                    <SkeletonBlock width={60} height={20} style={{ borderRadius: 10 }} />
                    <SkeletonBlock width={50} height={20} style={{ borderRadius: 10 }} />
                </div>
                <SkeletonBlock width={140} height={11} />
            </td>
            <td className="prec-table-cell prec-table-cell--visit">
                <SkeletonBlock width={50} height={14} />
                <SkeletonBlock width={30} height={10} style={{ marginTop: 2 }} />
            </td>
            <td className="prec-table-cell prec-table-cell--count">
                <SkeletonBlock width={20} height={16} />
                <SkeletonBlock width={28} height={9} style={{ marginTop: 2 }} />
            </td>
            <td className="prec-table-cell prec-table-cell--status">
                <SkeletonBlock width={65} height={22} style={{ borderRadius: 11 }} />
                <SkeletonBlock width={40} height={10} style={{ marginTop: 2 }} />
            </td>
            <td className="prec-table-cell prec-table-cell--arrow">
                <SkeletonBlock width={14} height={14} />
            </td>
        </tr>
    );
}

function PatientsSkeleton({ specialty }: { specialty: SpecialtyProfile }) {
    return (
        <>
            {/* Today's Patients Skeleton */}
            <div className="prec-list-section">
                <div className="prec-section-header">
                    <SkeletonBlock width={130} height={18} />
                    <SkeletonBlock width={28} height={20} style={{ borderRadius: 10 }} />
                </div>
                <div className="prec-today-scroll">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <SkeletonTodayCard key={i} />
                    ))}
                </div>
            </div>

            {/* All Patients Table Skeleton */}
            <div className="prec-list-section">
                <div className="prec-section-header">
                    <SkeletonBlock width={100} height={18} />
                    <SkeletonBlock width={28} height={20} style={{ borderRadius: 10 }} />
                </div>
                <div className="prec-table-wrap">
                    <table className="prec-table">
                        <PatientsTableHead specialty={specialty} />
                        <tbody>
                            {Array.from({ length: 8 }).map((_, i) => (
                                <SkeletonTableRow key={i} />
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </>
    );
}

// ── Today Card ────────────────────────────────────────────────────────────────

function TodayCard({ row, specialty, onClick }: { row: PatientRecordRow; specialty: SpecialtyProfile; onClick: () => void }) {
    const kind = visitStatusKind(row.visit_status);
    const time = row.started_at ? formatTime(row.started_at) : "";
    const chief = snapshotFor(specialty, row).chips[0]?.label;

    return (
        <button
            type="button"
            className={`prec-today-card is-${kind}`}
            onClick={onClick}
        >
            <div className="prec-today-card-topbar" aria-hidden="true" />

            <div className="prec-today-card-top">
                <AvatarCircle name={row.patient_name} size={34} />
                {kind === "active" && <span className="prec-active-dot prec-active-dot--card" />}
            </div>
            <div className="prec-today-name">{row.patient_name}</div>
            <div className="prec-today-sub">
                {row.age > 0 ? `${row.age}y` : ""}
                {row.age > 0 && row.gender ? " · " : ""}
                {row.gender || ""}
            </div>
            {chief ? (
                <div className="prec-today-chief">{chief}</div>
            ) : (
                <div className="prec-today-chief prec-today-chief--empty">Nothing recorded yet</div>
            )}
            <div className="prec-today-footer">
                <div className="prec-today-time">
                    <Clock size={10} />
                    {time}
                </div>
                <span className={`prec-today-status-chip is-${kind}`}>
                    {kind === "active" ? "In Session" : kind === "waiting" ? "Waiting" : kind === "inactive" ? "Inactive" : "Done"}
                </span>
            </div>
        </button>
    );
}

// ── Status pill ───────────────────────────────────────────────────────────────

function StatusPill({ status }: { status: string }) {
    const kind = visitStatusKind(status);
    return (
        <span className={`prec-status-pill is-${kind}`}>
            {VISIT_STATUS_LABEL[kind]}
        </span>
    );
}

// ── Clinical Snapshot cell ───────────────────────────────────────────────────
// The one specialty-aware column, replacing the old fixed Symptoms/Findings/
// Medicines/Tests set. `snapshotFor` decides the content; this only renders
// it — chips first (primary complaint leads, tone controls color), then the
// one supporting detail line underneath, same two-line shape the brief's
// examples use ("Knee pain · ROM limitation · 4 sessions" / "Difficulty in
// squatting and stairs").

function SnapshotCell({ row, specialty }: { row: PatientRecordRow; specialty: SpecialtyProfile }) {
    const snapshot = snapshotFor(specialty, row);
    if (!snapshot.chips.length && !snapshot.detail) {
        return <span className="prec-table-nil">Nothing recorded yet</span>;
    }
    return (
        <div className="prec-snapshot-cell">
            {snapshot.chips.length > 0 && (
                <div className="prec-snapshot-chips">
                    {snapshot.chips.map((chip: SnapshotChip, i: number) => (
                        <span key={i} className={`prec-snapshot-chip prec-snapshot-chip--${chip.tone}`}>
                            {chip.label}
                        </span>
                    ))}
                </div>
            )}
            {snapshot.detail && <div className="prec-snapshot-detail">{snapshot.detail}</div>}
        </div>
    );
}

// ── Patient table row ─────────────────────────────────────────────────────────

function PatientTableRow({ row, specialty, onClick }: { row: PatientRecordRow; specialty: SpecialtyProfile; onClick: () => void }) {
    const kind = visitStatusKind(row.visit_status);
    const lastVisit = formatLastVisit(row.last_visit_at ?? row.started_at);
    const noun = visitNoun(specialty);

    return (
        <tr className={`prec-table-row is-${kind}`} onClick={onClick}>

            <td className="prec-table-cell prec-table-cell--patient">
                <div className="prec-table-patient-inner">
                    <div className="prec-table-avatar-wrap">
                        <AvatarCircle name={row.patient_name} size={32} />
                        {kind === "active" && <span className="prec-table-active-dot" />}
                    </div>
                    <div className="prec-table-patient-info">
                        <span className="prec-table-patient-name">{row.patient_name}</span>
                        <span className="prec-table-patient-meta">
                            {row.age > 0 && `${row.age}y`}
                            {row.age > 0 && row.gender && " · "}
                            {row.gender}
                            {row.phone && (
                                <>
                                    <span className="prec-table-meta-sep" />
                                    <Phone size={10} />
                                    {row.phone}
                                </>
                            )}
                        </span>
                    </div>
                </div>
            </td>

            <td className="prec-table-cell prec-table-cell--snapshot">
                <SnapshotCell row={row} specialty={specialty} />
            </td>

            <td className="prec-table-cell prec-table-cell--visit">
                <span className="prec-table-visit-label">{lastVisit.label}</span>
                {lastVisit.sub && (
                    <span className="prec-table-visit-sub">{lastVisit.sub}</span>
                )}
            </td>

            <td className="prec-table-cell prec-table-cell--count">
                <span className="prec-table-count">{row.visit_count ?? 1}</span>
                <span className="prec-table-count-label">{noun}{row.visit_count === 1 ? "" : "s"}</span>
            </td>

            <td className="prec-table-cell prec-table-cell--status">
                <div className="prec-table-status-wrap">
                    <StatusPill status={row.visit_status} />
                    {row.started_at && (
                        <span className="prec-table-time-ago">{timeAgo(row.started_at)}</span>
                    )}
                </div>
            </td>

            <td className="prec-table-cell prec-table-cell--arrow">
                <ChevronRight size={14} className="prec-table-arrow" />
            </td>
        </tr>
    );
}

// ── Search bar ────────────────────────────────────────────────────────────────

interface SearchBarProps {
    value: string;
    onChange: (v: string) => void;
}

export function PatientsSearchBar({ value, onChange }: SearchBarProps) {
    return (
        <div className="prec-search-wrap">
            <Search size={15} className="prec-search-icon" />
            <input
                type="text"
                className="prec-search-input"
                placeholder="Search patients by name or phone…"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                autoComplete="off"
            />
            {value && (
                <button type="button" className="prec-search-clear" onClick={() => onChange("")}>
                    <X size={12} />
                </button>
            )}
        </div>
    );
}

// ── Table head ────────────────────────────────────────────────────────────────

function PatientsTableHead({ specialty }: { specialty: SpecialtyProfile }) {
    const noun = visitNoun(specialty);
    return (
        <thead>
            <tr className="prec-table-head-row">
                <th className="prec-table-th prec-table-th--patient">Patient</th>
                <th className="prec-table-th prec-table-th--snapshot">Clinical Snapshot</th>
                <th className="prec-table-th">Last Visit</th>
                <th className="prec-table-th prec-table-th--center">{noun[0].toUpperCase()}{noun.slice(1)}s</th>
                <th className="prec-table-th">Care Status</th>
                <th className="prec-table-th prec-table-th--arrow" />
            </tr>
        </thead>
    );
}

// ── PatientsList ──────────────────────────────────────────────────────────────

interface PatientsListProps {
    todayRows: PatientRecordRow[];
    recentRows: PatientRecordRow[];
    searchResults: PatientRecordRow[] | null;
    searchQuery: string;
    loading: boolean;
    specialty: SpecialtyProfile;
    onSelectPatient: (row: PatientRecordRow) => void;
}

export function PatientsList({
    todayRows,
    recentRows,
    searchResults,
    searchQuery,
    loading,
    specialty,
    onSelectPatient,
}: PatientsListProps) {
    const isSearching = searchQuery.trim().length > 0;

    if (loading) {
        return <PatientsSkeleton specialty={specialty} />;
    }

    if (isSearching) {
        return (
            <div className="prec-list-section">
                <div className="prec-section-header">
                    <span className="prec-section-title">
                        {searchResults && searchResults.length > 0
                            ? `${searchResults.length} result${searchResults.length !== 1 ? "s" : ""}`
                            : `No results for "${searchQuery}"`}
                    </span>
                </div>
                {searchResults && searchResults.length > 0 ? (
                    <div className="prec-table-wrap">
                        <table className="prec-table">
                            <PatientsTableHead specialty={specialty} />
                            <tbody>
                                {searchResults.map((row) => (
                                    <PatientTableRow
                                        key={row.patient_id}
                                        row={row}
                                        specialty={specialty}
                                        onClick={() => onSelectPatient(row)}
                                    />
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="prec-empty-section">
                        <User size={22} />
                        <p>No patients found.</p>
                    </div>
                )}
            </div>
        );
    }

    return (
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
                                specialty={specialty}
                                onClick={() => onSelectPatient(row)}
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
                    <div className="prec-table-wrap">
                        <table className="prec-table">
                            <PatientsTableHead specialty={specialty} />
                            <tbody>
                                {recentRows.map((row) => (
                                    <PatientTableRow
                                        key={row.patient_id}
                                        row={row}
                                        specialty={specialty}
                                        onClick={() => onSelectPatient(row)}
                                    />
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="prec-empty-section">
                        <User size={22} />
                        <p>No past patients found.</p>
                    </div>
                )}
            </div>
        </>
    );
}