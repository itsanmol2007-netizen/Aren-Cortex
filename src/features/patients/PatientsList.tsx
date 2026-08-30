import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
    CheckCircle2,
    ChevronLeft,
    ChevronRight,
    Clock,
    MoreVertical,
    Phone,
    Play,
    Search,
    User,
    X,
    XCircle,
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

// ── Today's Patients — horizontal scroller ─────────────────────────────────
// The row itself already scrolls (`.prec-today-scroll`, wheel/trackpad/drag);
// the native scrollbar is hidden by design (`scrollbar-width: none`) to keep
// the row visually quiet. That leaves a mouse-only doctor with no cue the row
// even holds more than what's visible — this wrapper is that cue, nothing
// else: an edge fade + chevron that appears only on the side there's more to
// see, and clears itself once scrolled there. Not a second scrollbar, not
// instructional text — see `cortex-design-dna/typography.md`'s "a label
// beats a sentence" rule.
function TodayPatientsScroller({ children }: { children: React.ReactNode }) {
    const scrollerRef = useRef<HTMLDivElement>(null);
    const [canScrollLeft, setCanScrollLeft] = useState(false);
    const [canScrollRight, setCanScrollRight] = useState(false);

    const updateEdges = () => {
        const el = scrollerRef.current;
        if (!el) return;
        setCanScrollLeft(el.scrollLeft > 4);
        setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
    };

    // Re-checks on mount/data-change too (ref callback fires once the row's
    // cards are actually in the DOM, so `scrollWidth` is real) — a row that
    // starts under-filled (few patients today) correctly shows no chevron.
    const setRef = (el: HTMLDivElement | null) => {
        scrollerRef.current = el;
        if (el) requestAnimationFrame(updateEdges);
    };

    const scrollBy = (dir: 1 | -1) => {
        const el = scrollerRef.current;
        if (!el) return;
        el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: "smooth" });
    };

    return (
        <div className="prec-today-scroll-wrap">
            <div
                ref={setRef}
                className="prec-today-scroll"
                onScroll={updateEdges}
            >
                {children}
            </div>
            {canScrollLeft && (
                <button
                    type="button"
                    className="prec-today-edge prec-today-edge--left"
                    aria-label="Scroll to earlier patients"
                    onClick={() => scrollBy(-1)}
                >
                    <ChevronLeft size={16} />
                </button>
            )}
            {canScrollRight && (
                <button
                    type="button"
                    className="prec-today-edge prec-today-edge--right"
                    aria-label="Scroll to more patients"
                    onClick={() => scrollBy(1)}
                >
                    <ChevronRight size={16} />
                </button>
            )}
        </div>
    );
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

/** Split from one combined `PatientsSkeleton` (2026-08-29) so each section
 *  can clear ITS OWN skeleton the moment its own fetch resolves — Today and
 *  Recent are two independent queries now (see `fetchTodayPatients`/
 *  `fetchRecentPatients`'s callers in `PatientsPage`), so a page that
 *  waited for the slower of the two before showing either was the "loading
 *  everything at once" complaint made real: whichever finished first sat
 *  fully built, invisible, behind a single shared flag. */
function TodaySkeleton() {
    return (
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
    );
}

function RecentSkeleton({ specialty }: { specialty: SpecialtyProfile }) {
    return (
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
    );
}

// ── Today Card ────────────────────────────────────────────────────────────────

/** The ⋮ menu itself — a portal so it draws above every other card in the
 *  scroller instead of being clipped by `TodayPatientsScroller`'s own
 *  `overflow-x: auto` (a dropdown that is a normal-flow child of a
 *  horizontally-scrolling strip gets cut at that strip's own edge the
 *  moment it would open past it). Same open/position/backdrop-close shape
 *  as frontdesk's `VisitRow` menu — not copied verbatim (different data,
 *  different actions), just the same mechanism for the same kind of
 *  problem. */
function TodayCardMenu({
    anchorRef, onClose, kind, onResume, onMarkCompleted, onDiscard,
}: {
    anchorRef: React.RefObject<HTMLButtonElement | null>;
    onClose: () => void;
    kind: ReturnType<typeof visitStatusKind>;
    /** "Resume consult" — active visits only. See `useConsultLifecycle
     *  .resumeConsult`'s own doc comment for what this can and can't restore. */
    onResume: () => void;
    onMarkCompleted: () => void;
    onDiscard: () => void;
}) {
    const rect = anchorRef.current?.getBoundingClientRect();
    if (!rect) return null;
    // Right-aligned to the trigger, flipped left of the viewport edge on a
    // narrow screen — the same clamp `VisitRow`'s menu uses. Also floored
    // at 8px: `VisitRow`'s own clamp only ever guards the RIGHT edge (its
    // rows span the full page width, so a card near the LEFT edge never
    // came up) — this card lives in a horizontal scroller, so the FIRST
    // card's trigger sits close to the viewport's left edge, and
    // `rect.right - 178` alone went negative there, pushing the menu
    // half off-screen (caught live, screenshotted: "...leted" was all
    // that was visible of "Mark as completed").
    const left = Math.max(8, Math.min(rect.right - 178, window.innerWidth - 190));

    // `stopPropagation` on every click inside this portal is load-bearing,
    // not defensive. `createPortal` moves the DOM node to `document.body`,
    // but React's synthetic events bubble through the REACT tree — this
    // component is still a JSX child of `TodayCard` — so without this, a
    // click ANYWHERE in here (a menu item, or the scrim while just closing
    // it) bubbles up to `TodayCard`'s own `onClick` and opens the patient,
    // regardless of where in the DOM it visually landed. Anmol: "whenever
    // you click on the three dot and you do whatever action... or even if
    // you don't do anything, you click outside of it and try to close the
    // three dot, automatically that patient page will open." The existing
    // `closest("[data-today-menu-btn]")` guard on `TodayCard` only ever
    // caught a click on the TRIGGER itself, never one on this portaled menu.
    return createPortal(
        <div onClick={(e) => e.stopPropagation()}>
            <div className="prec-menu-scrim" onClick={onClose} />
            <div className="prec-today-menu" style={{ top: rect.bottom + 4, left }}>
                {kind === "active" && (
                    <button type="button" className="prec-today-menu-item" onClick={() => { onResume(); onClose(); }}>
                        <Play size={14} /> Resume consult
                    </button>
                )}
                {kind !== "done" && (
                    <button type="button" className="prec-today-menu-item" onClick={() => { onMarkCompleted(); onClose(); }}>
                        <CheckCircle2 size={14} /> Mark as completed
                    </button>
                )}
                {kind !== "inactive" && (
                    <button type="button" className="prec-today-menu-item is-danger" onClick={() => { onDiscard(); onClose(); }}>
                        <XCircle size={14} /> Discard visit
                    </button>
                )}
            </div>
        </div>,
        document.body
    );
}

function TodayCard({
    row, specialty, onClick, onChangeStatus, onResumeConsult,
}: {
    row: PatientRecordRow;
    specialty: SpecialtyProfile;
    onClick: () => void;
    /** "Mark completed" / "Discard visit" from the card's own ⋮ menu — see
     *  `setVisitStatus`'s doc comment for why exactly these two statuses. */
    onChangeStatus: (status: "completed" | "discarded") => void;
    /** "Resume consult" — active visits only, from the same ⋮ menu. */
    onResumeConsult: (row: PatientRecordRow) => void;
}) {
    const kind = visitStatusKind(row.visit_status);
    const time = row.started_at ? formatTime(row.started_at) : "";
    const chief = snapshotFor(specialty, row).chips[0]?.label;
    const [menuOpen, setMenuOpen] = useState(false);
    const menuBtnRef = useRef<HTMLButtonElement>(null);

    return (
        // A `<div role="button">`, not a real `<button>` — the ⋮ trigger
        // below is its OWN real button, and a button can never contain
        // another (React: "<button> cannot be a descendant of <button>...
        // hydration error", hit live once a search turned up a card whose
        // heart was a nested button of the same shape — see `StaticPin`'s
        // doc comment in PracticePage.tsx for that fix). `data-today-menu-
        // btn` lets the card's own click handler tell "the doctor meant to
        // open this patient" apart from "the doctor meant the ⋮ menu",
        // same as `VisitRow`'s `data-row-menu-btn`.
        <div
            role="button"
            tabIndex={0}
            className={`prec-today-card is-${kind}`}
            onClick={(e) => {
                if ((e.target as HTMLElement).closest("[data-today-menu-btn]")) return;
                onClick();
            }}
            onKeyDown={(e) => {
                if (e.target !== e.currentTarget) return;
                if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); }
            }}
        >
            <div className="prec-today-card-topbar" aria-hidden="true" />

            <button
                type="button"
                ref={menuBtnRef}
                data-today-menu-btn
                className="prec-today-menu-btn"
                aria-label={`Change status for ${row.patient_name}`}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((v) => !v)}
            >
                <MoreVertical size={14} />
            </button>
            {/* Stacked directly below the ⋮ button now, both anchored to the
                CARD itself — it used to sit on the avatar's corner instead,
                the same corner the ⋮ button occupies, so an active patient's
                dot could sit flush against (and read as swallowing) the menu
                trigger. Anmol: "there is a dot, green dot there for active
                patients which can hide it again." */}
            {kind === "active" && <span className="prec-active-dot prec-active-dot--card" />}
            {menuOpen && (
                <TodayCardMenu
                    anchorRef={menuBtnRef}
                    kind={kind}
                    onClose={() => setMenuOpen(false)}
                    onResume={() => onResumeConsult(row)}
                    onMarkCompleted={() => onChangeStatus("completed")}
                    onDiscard={() => onChangeStatus("discarded")}
                />
            )}

            <div className="prec-today-card-top">
                <AvatarCircle name={row.patient_name} size={34} />
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
        </div>
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
    /** Independent flags, not one shared `loading` — `fetchTodayPatients`
     *  and `fetchRecentPatients` are two separate queries at different
     *  speeds; each section clears its own skeleton the moment ITS OWN
     *  data lands rather than both waiting on the slower one. */
    todayLoading: boolean;
    recentLoading: boolean;
    specialty: SpecialtyProfile;
    onSelectPatient: (row: PatientRecordRow) => void;
    /** Today's Patients' own ⋮ menu — "Mark completed"/"Discard visit",
     *  scoped to the two real terminal statuses (see `setVisitStatus`'s
     *  own doc comment for why not more). */
    onChangeStatus: (row: PatientRecordRow, status: "completed" | "discarded") => void;
    /** Today's Patients' own ⋮ menu — "Resume consult", active visits only. */
    onResumeConsult: (row: PatientRecordRow) => void;
}

export function PatientsList({
    todayRows,
    recentRows,
    searchResults,
    searchQuery,
    todayLoading,
    recentLoading,
    specialty,
    onChangeStatus,
    onResumeConsult,
    onSelectPatient,
}: PatientsListProps) {
    const isSearching = searchQuery.trim().length > 0;

    // A search in progress is its own view, unrelated to whether the
    // Today/Recent lists underneath have finished loading — no reason to
    // block it behind either.
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
            {todayLoading ? (
                <TodaySkeleton />
            ) : todayRows.length > 0 && (
                <div className="prec-list-section">
                    <div className="prec-section-header">
                        <span className="prec-section-title">Today's Patients</span>
                        <span className="prec-section-count">{todayRows.length}</span>
                    </div>
                    <TodayPatientsScroller>
                        {todayRows.map((row) => (
                            <TodayCard
                                key={row.visit_id || row.patient_id}
                                row={row}
                                specialty={specialty}
                                onClick={() => onSelectPatient(row)}
                                onChangeStatus={(status) => onChangeStatus(row, status)}
                                onResumeConsult={onResumeConsult}
                            />
                        ))}
                    </TodayPatientsScroller>
                </div>
            )}

            {recentLoading ? (
                <RecentSkeleton specialty={specialty} />
            ) : (
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
            )}
        </>
    );
}