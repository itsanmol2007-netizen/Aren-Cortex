import { useEffect, useState } from "react";
import type { RefObject } from "react";
import {
    AlertCircle,
    ArrowLeft,
    Calendar,
    ChevronDown,
    ClipboardList,
    FlaskConical,
    Phone,
    Pill,
    Plus,
    Printer,
    Share2,
    Stethoscope,
    TrendingDown,
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

// ── Helpers ───────────────────────────────────────────────────────────────────

function initials(name: string): string {
    return name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString("en-IN", {
        day: "numeric", month: "short", year: "numeric",
    });
}

function formatDateShort(iso: string): string {
    return new Date(iso).toLocaleDateString("en-IN", {
        day: "numeric", month: "short", year: "numeric",
    });
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
    if (months < 12) return `${months}mo ago`;
    return `${Math.floor(months / 12)}y ago`;
}

function computeVisitPattern(visits: RealVisit[]): {
    lastVisitDays: number | null;
    avgGapDays: number | null;
    mostActiveMonth: string | null;
} {
    if (!visits.length) return { lastVisitDays: null, avgGapDays: null, mostActiveMonth: null };

    const sorted = [...visits].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    const lastVisitDays = Math.floor(
        (Date.now() - new Date(sorted[0].created_at).getTime()) / 86400000
    );

    let avgGapDays: number | null = null;
    if (sorted.length > 1) {
        let totalGap = 0;
        for (let i = 0; i < sorted.length - 1; i++) {
            totalGap +=
                new Date(sorted[i].created_at).getTime() -
                new Date(sorted[i + 1].created_at).getTime();
        }
        avgGapDays = Math.round(totalGap / (sorted.length - 1) / 86400000);
    }

    const monthCount = new Map<string, number>();
    for (const v of sorted) {
        const key = new Date(v.created_at).toLocaleDateString("en-IN", {
            month: "long", year: "numeric",
        });
        monthCount.set(key, (monthCount.get(key) ?? 0) + 1);
    }
    const mostActiveMonth = [...monthCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

    return { lastVisitDays, avgGapDays, mostActiveMonth };
}

// ── Avatar ────────────────────────────────────────────────────────────────────

function AvatarCircle({ name, size = 52 }: { name: string; size?: number }) {
    return (
        <div className="prec-avatar-lg" style={{ width: size, height: size, fontSize: size * 0.34 }}>
            {initials(name)}
        </div>
    );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function RecordSkeleton() {
    return (
        <>
            <div className="prec-skeleton-identity">
                <div className="prec-skeleton-identity-left">
                    <div className="prec-skeleton prec-skeleton-avatar" />
                    <div>
                        <div className="prec-skeleton prec-skeleton-name" />
                        <div className="prec-skeleton prec-skeleton-meta" />
                    </div>
                </div>
                <div className="prec-skeleton-stats">
                    {[0, 1, 2, 3].map((i) => (
                        <div key={i} className="prec-skeleton-stat" />
                    ))}
                </div>
            </div>
            <div className="prec-record-two-col">
                <div className="prec-record-main">
                    <div className="prec-skeleton-summary">
                        {[0, 1, 2].map((i) => (
                            <div key={i} className="prec-skeleton-summary-col">
                                <div className="prec-skeleton prec-skeleton-line-sm prec-skeleton-w-60" />
                                <div className="prec-skeleton prec-skeleton-line-md prec-skeleton-w-full" />
                                <div className="prec-skeleton prec-skeleton-line-md prec-skeleton-w-80" />
                                <div className="prec-skeleton prec-skeleton-line-md prec-skeleton-w-60" />
                            </div>
                        ))}
                    </div>
                    <div className="prec-skeleton-snapshot">
                        <div className="prec-skeleton-snapshot-header" />
                        <div className="prec-skeleton-snapshot-body">
                            {[0, 1, 2, 3, 4].map((i) => (
                                <div key={i} className="prec-skeleton-snapshot-col">
                                    <div className="prec-skeleton prec-skeleton-line-sm prec-skeleton-w-60" />
                                    <div className="prec-skeleton prec-skeleton-line-md prec-skeleton-w-full" />
                                    <div className="prec-skeleton prec-skeleton-line-md prec-skeleton-w-80" />
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="prec-skeleton-timeline-header">
                        <div className="prec-skeleton prec-skeleton-timeline-title" />
                        <div className="prec-skeleton-timeline-line" />
                    </div>
                    <div className="prec-skeleton-rows">
                        {[0, 1, 2, 3, 4].map((i) => (
                            <div key={i} className="prec-skeleton-row">
                                <div className="prec-skeleton prec-skeleton-row-date" />
                                <div className="prec-skeleton prec-skeleton-row-badge" />
                                <div className="prec-skeleton prec-skeleton-row-chips" />
                                <div className="prec-skeleton prec-skeleton-row-pills" />
                            </div>
                        ))}
                    </div>
                </div>
                <div className="prec-record-sidebar">
                    <div className="prec-skeleton-summary" style={{ flexDirection: "column" }}>
                        {[0, 1, 2, 3, 4].map((i) => (
                            <div key={i} className="prec-skeleton prec-skeleton-line-md prec-skeleton-w-full" style={{ marginBottom: 6 }} />
                        ))}
                    </div>
                </div>
            </div>
        </>
    );
}

// ── Summary Panel ─────────────────────────────────────────────────────────────

interface SummaryData {
    complaints: { name: string; count: number }[];
    medicines: { name: string; count: number }[];
    tests: { name: string; count: number }[];
}

function deriveSummary(visits: RealVisit[]): SummaryData {
    const cMap = new Map<string, number>();
    const mMap = new Map<string, number>();
    const tMap = new Map<string, number>();
    for (const v of visits) {
        for (const s of v.symptoms) cMap.set(s, (cMap.get(s) ?? 0) + 1);
        for (const m of v.medicines) mMap.set(m.name, (mMap.get(m.name) ?? 0) + 1);
        for (const t of (v as any).tests ?? []) {
            const name = typeof t === "string" ? t : t.test_name ?? t.name ?? "";
            if (name) tMap.set(name, (tMap.get(name) ?? 0) + 1);
        }
    }
    const sort = (m: Map<string, number>) =>
        Array.from(m.entries()).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));
    return {
        complaints: sort(cMap).slice(0, 6),
        medicines: sort(mMap).slice(0, 5),
        tests: sort(tMap).slice(0, 4),
    };
}

function deriveVisitFrequency(visits: RealVisit[]): { bars: { label: string; count: number }[]; summary: string } {
    if (!visits.length) return { bars: [], summary: "" };
    const sorted = [...visits].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
    const first = new Date(sorted[0].created_at);
    const last = new Date(sorted[sorted.length - 1].created_at);
    const spanDays = Math.max(1, (last.getTime() - first.getTime()) / 86400000);

    if (spanDays < 14) {
        return { bars: [], summary: `${visits.length} total visits` };
    }

    const useMonthly = spanDays > 60;
    const buckets = new Map<string, number>();

    for (const v of visits) {
        const d = new Date(v.created_at);
        const key = useMonthly
            ? d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" })
            : `W${Math.ceil((d.getDate()) / 7)} ${d.toLocaleDateString("en-IN", { month: "short" })}`;
        buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }

    const bars = Array.from(buckets.entries()).slice(-7).map(([label, count]) => ({ label, count }));
    const spanLabel = useMonthly
        ? `${Math.round(spanDays / 30)} months`
        : `${Math.round(spanDays / 7)} weeks`;

    return { bars, summary: `${visits.length} visits in last ${spanLabel}` };
}

function deriveSignals(visits: RealVisit[]): { label: string; color: "blue" | "pink" | "amber" }[] {
    const s = deriveSummary(visits);
    const signals: { label: string; color: "blue" | "pink" | "amber" }[] = [];

    if (s.complaints.length > 0) {
        const top = s.complaints[0];
        if (top.count >= 2) signals.push({ label: `Recurrent ${top.name} episodes`, color: "blue" });
    }
    if (s.medicines.length > 0) {
        const top = s.medicines[0];
        if (top.count >= 2) signals.push({ label: `Frequent ${top.name} use`, color: "pink" });
    }
    if (visits.length >= 3) {
        const gaps: number[] = [];
        const sorted = [...visits].sort(
            (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
        for (let i = 0; i < sorted.length - 1; i++) {
            gaps.push(
                (new Date(sorted[i].created_at).getTime() - new Date(sorted[i + 1].created_at).getTime()) / 86400000
            );
        }
        const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length;
        const label = avg < 14 ? "High visit frequency pattern" : avg < 45 ? "Occasional fever episodes" : "Infrequent visit pattern";
        signals.push({ label, color: "amber" });
    }
    return signals.slice(0, 3);
}

function VisitFrequencyChart({ visits }: { visits: RealVisit[] }) {
    const { bars, summary } = deriveVisitFrequency(visits);
    if (!bars.length) {
        return (
            <div className="prec-freq-fallback">
                <span className="prec-freq-big">{visits.length}</span>
                <span className="prec-freq-big-label">Total Visits</span>
            </div>
        );
    }
    const max = Math.max(...bars.map((b) => b.count), 1);
    return (
        <div className="prec-freq-chart">
            <div className="prec-freq-bars">
                {bars.map((b) => (
                    <div key={b.label} className="prec-freq-bar-col">
                        <div
                            className="prec-freq-bar"
                            style={{ height: `${Math.max(10, (b.count / max) * 48)}px` }}
                        />
                    </div>
                ))}
            </div>
            <div className="prec-freq-summary">{summary}</div>
        </div>
    );
}

function PatientSummaryPanel({ visits }: { visits: RealVisit[] }) {
    const s = deriveSummary(visits);
    const signals = deriveSignals(visits);
    if (!s.complaints.length && !s.medicines.length) return null;

    return (
        <div className="prec-summary-panel-v2">
            {/* Label strip */}
            <div className="prec-summary-panel-label">
                <Stethoscope size={14} />
                <span>PATIENT<br />SUMMARY</span>
            </div>

            {/* Frequent Complaints */}
            {s.complaints.length > 0 && (
                <div className="prec-summary-panel-col">
                    <div className="prec-summary-panel-col-title">Frequent Complaints</div>
                    <div className="prec-summary-panel-chips">
                        {s.complaints.slice(0, 4).map((c) => (
                            <span key={c.name} className="prec-symptom-chip">{c.name}</span>
                        ))}
                        {s.complaints.length > 4 && (
                            <span className="prec-symptom-more">+{s.complaints.length - 4} more</span>
                        )}
                    </div>
                </div>
            )}

            {/* Common Medicines */}
            {s.medicines.length > 0 && (
                <div className="prec-summary-panel-col">
                    <div className="prec-summary-panel-col-title">Common Medicines</div>
                    <div className="prec-summary-panel-med-list">
                        {s.medicines.map((m) => (
                            <div key={m.name} className="prec-summary-panel-med-row">
                                <span className="prec-summary-panel-med-name">{m.name}</span>
                                <span className="prec-summary-panel-med-count">{m.count}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Investigations */}
            {s.tests.length > 0 && (
                <div className="prec-summary-panel-col">
                    <div className="prec-summary-panel-col-title">
                        Investigations <span className="prec-summary-panel-col-sub">(Frequent)</span>
                    </div>
                    <div className="prec-summary-panel-test-list">
                        {s.tests.map((t) => (
                            <span key={t.name} className="prec-summary-panel-test-name">{t.name}</span>
                        ))}
                    </div>
                </div>
            )}

            {/* Visit Frequency */}
            <div className="prec-summary-panel-col prec-summary-panel-col--freq">
                <div className="prec-summary-panel-col-title">Visit Frequency</div>
                <VisitFrequencyChart visits={visits} />
            </div>

            {/* Clinical Signals */}
            {signals.length > 0 && (
                <div className="prec-summary-panel-col prec-summary-panel-col--signals">
                    <div className="prec-summary-panel-col-title">Clinical Signals</div>
                    <div className="prec-signals-list">
                        {signals.map((sig) => (
                            <div key={sig.label} className="prec-signal-row">
                                <span className={`prec-signal-dot prec-signal-dot--${sig.color}`} />
                                <span className="prec-signal-label">{sig.label}</span>
                            </div>
                        ))}
                    </div>
                    <button type="button" className="prec-signals-view-all">View all</button>
                </div>
            )}
        </div>
    );
}

// ── Clinical Snapshot ─────────────────────────────────────────────────────────

function ClinicalSnapshot({ visits }: { visits: RealVisit[] }) {
    const last = visits[0];
    if (!last) return null;
    const abnormal = last.findings.filter((f) => f.is_abnormal);
    const normal = last.findings.filter((f) => !f.is_abnormal);
    const allF = [...abnormal, ...normal];
    const tests = (last as any).tests ?? [];

    return (
        <div className="prec-snapshot-card-v2">
            <div className="prec-snapshot-header-v2">
                <div className="prec-snapshot-title-v2">
                    <Stethoscope size={12} />
                    <span>Recent Clinical Snapshot</span>
                </div>
                <span className="prec-snapshot-timestamp">
                    {timeAgo(last.created_at)} ({formatDate(last.created_at)})
                </span>
            </div>

            <div className="prec-snapshot-cols">
                {/* Last Visit */}
                <div className="prec-snapshot-col prec-snapshot-col--date">
                    <div className="prec-snapshot-col-label">Last Visit</div>
                    <div className="prec-snapshot-col-date-val">
                        <Calendar size={10} />
                        <span>{formatDateShort(last.created_at)}</span>
                    </div>
                    <span className="prec-snapshot-col-ago">{timeAgo(last.created_at)}</span>
                </div>

                {/* Symptoms */}
                <div className="prec-snapshot-col">
                    <div className="prec-snapshot-col-label">Symptoms</div>
                    {last.symptoms.length > 0 ? (
                        <div className="prec-snapshot-chips">
                            {last.symptoms.slice(0, 3).map((s) => (
                                <span key={s} className="prec-symptom-chip">{s}</span>
                            ))}
                            {last.symptoms.length > 3 && (
                                <span className="prec-symptom-more">+{last.symptoms.length - 3}</span>
                            )}
                        </div>
                    ) : <span className="prec-snapshot-empty">Not recorded</span>}
                </div>

                {/* Clinical Findings */}
                <div className="prec-snapshot-col">
                    <div className="prec-snapshot-col-label">Clinical Findings</div>
                    {allF.length > 0 ? (
                        <div className="prec-snapshot-chips">
                            {allF.slice(0, 3).map((f) => (
                                <span key={f.name} className={`prec-finding-chip ${f.is_abnormal ? "is-abnormal" : ""}`}>
                                    {f.is_abnormal && <AlertCircle size={8} style={{ marginRight: 2 }} />}
                                    {f.name}
                                </span>
                            ))}
                            {allF.length > 3 && <span className="prec-symptom-more">+{allF.length - 3}</span>}
                        </div>
                    ) : <span className="prec-snapshot-empty">No findings</span>}
                </div>

                {/* Prescription */}
                <div className="prec-snapshot-col">
                    <div className="prec-snapshot-col-label">Prescription</div>
                    {last.medicines.length > 0 ? (
                        <div className="prec-snapshot-rx">
                            {last.medicines.slice(0, 3).map((m) => (
                                <div key={m.medicine_id} className="prec-snapshot-rx-row">
                                    <Pill size={9} className="prec-snapshot-rx-icon" />
                                    <span className="prec-snapshot-rx-name">{m.name}</span>
                                    {m.dosage_mg && <span className="prec-snapshot-rx-dose">{m.dosage_mg}mg</span>}
                                    {m.frequency && <span className="prec-snapshot-rx-freq">{freqSlotToLabel(m.frequency)}</span>}
                                </div>
                            ))}
                            {last.medicines.length > 3 && (
                                <span className="prec-snapshot-empty">+{last.medicines.length - 3} more</span>
                            )}
                        </div>
                    ) : <span className="prec-snapshot-empty">No medicines</span>}
                </div>

                {/* Investigations */}
                <div className="prec-snapshot-col prec-snapshot-col--last">
                    <div className="prec-snapshot-col-label">Investigations Ordered</div>
                    {tests.length > 0 ? (
                        <div className="prec-snapshot-test-list">
                            {tests.slice(0, 3).map((t: any) => {
                                const name = typeof t === "string" ? t : t.test_name ?? t.name ?? "";
                                return (
                                    <span key={name} className="prec-snapshot-test-name">
                                        <FlaskConical size={9} />{name}
                                    </span>
                                );
                            })}
                            {tests.length > 3 && <span className="prec-snapshot-empty">+{tests.length - 3}</span>}
                        </div>
                    ) : <span className="prec-snapshot-empty">None ordered</span>}
                </div>
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
    const abnormal = visit.findings.filter((f) => f.is_abnormal);
    const tests = (visit as any).tests ?? [];
    const hasTests = tests.length > 0;
    const visitType = hasMeds ? "Prescription" : hasFindings ? "Examination" : "Consultation";
    const isFirst = index === 0;

    return (
        <div className="prec-visit-spine-row">
            <div className="prec-visit-spine-left">
                <div className={`prec-visit-dot ${isFirst ? "prec-visit-dot--active" : ""}`} />
                <div className="prec-visit-spine-line" />
            </div>
            <div className={`prec-visit-card ${expanded ? "is-expanded" : ""}`} data-type={visitType}>
                <button type="button" className="prec-visit-header" onClick={() => setExpanded((e) => !e)}>
                    <div className="prec-visit-date-block">
                        <span className="prec-visit-date-main">{formatDateShort(visit.created_at)}</span>
                        <span className="prec-visit-date-ago">{timeAgo(visit.created_at)}</span>
                    </div>

                    <span className="prec-visit-type-badge" data-type={visitType}>{visitType.toUpperCase()}</span>

                    {!expanded && hasSymptoms && (
                        <div className="prec-visit-preview-text">
                            {visit.symptoms.slice(0, 4).join(", ")}
                            {visit.symptoms.length > 4 && (
                                <span className="prec-visit-preview-more"> +{visit.symptoms.length - 4}</span>
                            )}
                        </div>
                    )}

                    <div className="prec-visit-header-right">
                        <div className="prec-visit-stats">
                            {hasMeds && (
                                <span className="prec-visit-stat prec-visit-stat--med">
                                    <span>{visit.medicines.length}</span>
                                    <span className="prec-visit-stat-label">Medicines</span>
                                </span>
                            )}
                            {hasFindings && (
                                <span className={`prec-visit-stat ${abnormal.length > 0 ? "prec-visit-stat--abnormal" : "prec-visit-stat--finding"}`}>
                                    <span>{visit.findings.length}</span>
                                    <span className="prec-visit-stat-label">{abnormal.length > 0 ? "Findings" : "Findings"}</span>
                                </span>
                            )}
                            {hasTests && (
                                <span className="prec-visit-stat prec-visit-stat--test">
                                    <span>{tests.length}</span>
                                    <span className="prec-visit-stat-label">Test</span>
                                </span>
                            )}
                        </div>
                        {hasTests && (
                            <div className="prec-visit-test-names">
                                {tests.slice(0, 2).map((t: any) => {
                                    const name = typeof t === "string" ? t : t.test_name ?? t.name ?? "";
                                    return <span key={name}>{name}</span>;
                                })}
                            </div>
                        )}
                        <ChevronDown size={13} className={`prec-visit-chevron ${expanded ? "is-open" : ""}`} />
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
                                                <span key={f.name} className={`prec-finding-chip ${f.is_abnormal ? "is-abnormal" : ""}`}>
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
                            <div className="prec-visit-section">
                                <div className="prec-visit-section-label">Prescription</div>
                                <div className="prec-med-list">
                                    {visit.medicines.map((m) => (
                                        <div key={m.medicine_id} className="prec-med-row">
                                            <div className="prec-med-left">
                                                <Pill size={10} className="prec-med-icon" />
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
                        {hasTests && (
                            <div className="prec-visit-section">
                                <div className="prec-visit-section-label">Tests Ordered</div>
                                <div className="prec-visit-chips">
                                    {tests.map((t: any) => {
                                        const name = typeof t === "string" ? t : t.test_name ?? t.name ?? "";
                                        return (
                                            <span key={name} className="prec-test-chip">
                                                <FlaskConical size={9} />{name}
                                            </span>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                        {!hasSymptoms && !hasFindings && !hasMeds && !hasTests && (
                            <div className="prec-visit-empty">No clinical data recorded for this visit.</div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

// ── Right Sidebar ─────────────────────────────────────────────────────────────

interface SidebarProps {
    onStartConsult: () => void;
    onNavigatePrescriptions?: () => void;
    visits: RealVisit[];
}

function RecordSidebar({ onStartConsult, visits }: SidebarProps) {
    const pattern = computeVisitPattern(visits);

    const actions = [
        { icon: <Plus size={14} />, label: "Start New Consult", color: "blue" as const, onClick: onStartConsult },
        { icon: <ClipboardList size={14} />, label: "View Prescriptions", color: "purple" as const, onClick: undefined },
        { icon: <FlaskConical size={14} />, label: "View Lab Reports", color: "green" as const, onClick: undefined },
        { icon: <Printer size={14} />, label: "Print Summary", color: "gray" as const, onClick: undefined },
        { icon: <Share2 size={14} />, label: "Share Record", color: "gray" as const, onClick: undefined },
    ];

    return (
        <div className="prec-sidebar">
            {/* Quick Actions */}
            <div className="prec-sidebar-card">
                <div className="prec-sidebar-card-title">
                    <Plus size={11} />
                    <span>Quick Actions</span>
                </div>
                <div className="prec-quick-action-list">
                    {actions.map((a) => (
                        <button
                            key={a.label}
                            type="button"
                            className={`prec-quick-action-row prec-quick-action-row--${a.color}`}
                            onClick={a.onClick}
                        >
                            <span className={`prec-quick-action-icon prec-quick-action-icon--${a.color}`}>
                                {a.icon}
                            </span>
                            <span className="prec-quick-action-label">{a.label}</span>
                            <ChevronDown size={10} style={{ transform: "rotate(-90deg)", marginLeft: "auto", color: "#c0cce0" }} />
                        </button>
                    ))}
                </div>
            </div>

            {/* Visit Pattern */}
            {visits.length > 0 && (
                <div className="prec-sidebar-card">
                    <div className="prec-sidebar-card-title">
                        <Calendar size={11} />
                        <span>Visit Pattern</span>
                    </div>
                    <div className="prec-visit-pattern">
                        {pattern.lastVisitDays !== null && (
                            <div className="prec-visit-pattern-row">
                                <span className="prec-visit-pattern-label">Last visit</span>
                                <span className="prec-visit-pattern-val">
                                    {pattern.lastVisitDays === 0 ? "Today" : `${pattern.lastVisitDays}d ago`}
                                </span>
                            </div>
                        )}
                        {pattern.avgGapDays !== null && (
                            <div className="prec-visit-pattern-row">
                                <span className="prec-visit-pattern-label">Avg. gap</span>
                                <span className="prec-visit-pattern-val">{pattern.avgGapDays}d between visits</span>
                            </div>
                        )}
                        {pattern.mostActiveMonth && (
                            <div className="prec-visit-pattern-row">
                                <span className="prec-visit-pattern-label">Most active</span>
                                <span className="prec-visit-pattern-val">{pattern.mostActiveMonth}</span>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

// ── PatientRecord ─────────────────────────────────────────────────────────────

const INITIAL_VISIBLE = 5;

interface PatientRecordProps {
    row: PatientRecordRow;
    onBack: () => void;
    onStartConsult: (patient: Patient) => void;
    logoRef: RefObject<HTMLDivElement>;
    onOpenSidebar: () => void;
}

export function PatientRecord({ row, onBack, onStartConsult, logoRef, onOpenSidebar }: PatientRecordProps) {
    const [visits, setVisits] = useState<RealVisit[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAll, setShowAll] = useState(false);

    useEffect(() => {
        setLoading(true);
        setShowAll(false);
        fetchPatientVisits(row.patient_id)
            .then(setVisits)
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [row.patient_id]);

    const completedVisits = visits.filter((v) => v.status === "completed");
    const lastVisit = completedVisits[0];
    const lastRxName = lastVisit?.medicines?.[0]?.name ?? null;
    const recentSymptoms = lastVisit?.symptoms?.slice(0, 2).join(", ") ?? null;
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

    return (
        <div className="prec-record-view">
            <WorkspaceHeader
                logoRef={logoRef}
                onOpenSidebar={onOpenSidebar}
                title="Patient Records"
                subtitle="Clinical History & Continuity"
            />

            {/* Topbar */}
            <div className="prec-record-topbar">
                <button type="button" className="prec-back-btn" onClick={onBack}>
                    <ArrowLeft size={13} />
                    <span>All Patients</span>
                </button>
                <div className="prec-topbar-right">
                    <button type="button" className="prec-start-consult-btn--topbar" onClick={handleStartConsult}>
                        <Plus size={12} />
                        New Consult
                    </button>
                    <button type="button" className="prec-topbar-more">⋮</button>
                </div>
            </div>

            <div className="prec-record-body">
                {loading ? (
                    <RecordSkeleton />
                ) : (
                    <>
                        {/* Identity Card */}
                        <div className="prec-identity-card">
                            <div className="prec-identity-left">
                                <AvatarCircle name={row.patient_name} size={52} />
                                <div>
                                    <div className="prec-identity-name">{row.patient_name}</div>
                                    <div className="prec-identity-meta">
                                        {row.age > 0 && (
                                            <span className="prec-identity-pill">{row.age} yrs</span>
                                        )}
                                        {row.gender && (
                                            <span className="prec-identity-pill">{row.gender}</span>
                                        )}
                                        {row.phone && (
                                            <span className="prec-identity-meta-item">
                                                <Phone size={10} />{row.phone}
                                            </span>
                                        )}
                                        {row.patient_id && (
                                            <span className="prec-identity-meta-item prec-identity-id">
                                                ID: CTX-{String(row.patient_id).padStart(6, "0")}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="prec-identity-stats">
                                <div className="prec-identity-stat">
                                    <div className="prec-identity-stat-icon prec-identity-stat-icon--blue">
                                        <User size={12} />
                                    </div>
                                    <span className="prec-identity-stat-value">{completedVisits.length}</span>
                                    <span className="prec-identity-stat-label">Total Visits</span>
                                </div>
                                <div className="prec-identity-stat">
                                    <div className="prec-identity-stat-icon prec-identity-stat-icon--blue">
                                        <Pill size={12} />
                                    </div>
                                    <span className="prec-identity-stat-value prec-identity-stat-value--rx">{lastRxName ?? "—"}</span>
                                    <span className="prec-identity-stat-label">Last Prescription</span>
                                </div>
                                <div className="prec-identity-stat">
                                    <div className="prec-identity-stat-icon prec-identity-stat-icon--pink">
                                        <Stethoscope size={12} />
                                    </div>
                                    <span className="prec-identity-stat-value prec-identity-stat-value--sym">{recentSymptoms ?? "—"}</span>
                                    <span className="prec-identity-stat-label">Recent Complaints</span>
                                </div>
                                <div className="prec-identity-stat">
                                    <div className="prec-identity-stat-icon prec-identity-stat-icon--green">
                                        <Calendar size={12} />
                                    </div>
                                    <span className="prec-identity-stat-value">{lastVisit ? timeAgo(lastVisit.created_at) : "—"}</span>
                                    <span className="prec-identity-stat-label">Last Visit</span>
                                </div>
                            </div>
                        </div>

                        {/* Two-column layout */}
                        <div className="prec-record-two-col">
                            <div className="prec-record-main">
                                {completedVisits.length > 0 && (
                                    <PatientSummaryPanel visits={completedVisits} />
                                )}

                                {completedVisits.length > 0 && (
                                    <ClinicalSnapshot visits={completedVisits} />
                                )}

                                <div className="prec-timeline-header">
                                    <span className="prec-timeline-title">Visit Timeline</span>
                                    <span className="prec-timeline-count">
                                        {completedVisits.length} visit{completedVisits.length !== 1 ? "s" : ""}
                                    </span>
                                </div>

                                {completedVisits.length === 0 ? (
                                    <div className="prec-empty-visits">
                                        <FlaskConical size={24} />
                                        <p>No completed visits on record.</p>
                                        <span>Start a new consult to begin building this patient's history.</span>
                                    </div>
                                ) : (
                                    <>
                                        <div className="prec-visit-list">
                                            {visibleVisits.map((v, i) => (
                                                <VisitCard key={v.id} visit={v} index={i} />
                                            ))}
                                        </div>
                                        {completedVisits.length > INITIAL_VISIBLE && (
                                            <button
                                                type="button"
                                                className="prec-view-all-btn"
                                                onClick={() => setShowAll((s) => !s)}
                                            >
                                                {showAll
                                                    ? <>Show Less <ChevronDown size={12} style={{ transform: "rotate(180deg)" }} /></>
                                                    : <>View All Visits ({hiddenCount} more) <ChevronDown size={12} /></>
                                                }
                                            </button>
                                        )}
                                    </>
                                )}
                            </div>

                            <div className="prec-record-sidebar-col">
                                <RecordSidebar
                                    onStartConsult={handleStartConsult}
                                    visits={completedVisits}
                                />
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}