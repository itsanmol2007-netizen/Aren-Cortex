// ═══════════════════════════════════════════════════════════════════════════
//  VISIT DIFF PANEL — renders the output of visitCompare.ts
//
//  Pure presentation: two visits in, a read-only diff out. No callbacks —
//  this is a read view, not an editor. Lives inside PastVisitRxViewer's main
//  pane when the rail has two selections instead of one.
// ═══════════════════════════════════════════════════════════════════════════

import { ArrowRight, Minus, Plus, RefreshCw } from "lucide-react";
import type { RealVisit } from "../../lib/db";
import type { MedicineDiffField, MedicineDiffRow } from "./visitCompare";
import { diffFindings, diffMedicines, diffSymptoms, diffVitals } from "./visitCompare";
import { formatVisitDateLong } from "./visitAdapter";

interface VisitDiffPanelProps {
    /** Must already be in chronological order (older first). */
    older: RealVisit;
    newer: RealVisit;
}

const STATUS_META: Record<MedicineDiffRow["status"], { label: string; icon: typeof Plus; cls: string }> = {
    changed: { label: "Dose changed", icon: RefreshCw, cls: "is-changed" },
    added: { label: "Added", icon: Plus, cls: "is-added" },
    stopped: { label: "Stopped", icon: Minus, cls: "is-stopped" },
    unchanged: { label: "Unchanged", icon: RefreshCw, cls: "is-unchanged" },
};

function MedFields({ med, changedFields }: { med: { dosage: string; frequency: string; duration: string }; changedFields: MedicineDiffField[] }) {
    const cls = (f: MedicineDiffField) => `rxvc-field${changedFields.includes(f) ? " is-diff" : ""}`;
    return (
        <span className="rxvc-med-fields">
            <span className={cls("dosage")}>{med.dosage}</span>
            <span className="rxvc-dot">·</span>
            <span className={cls("frequency")}>{med.frequency}</span>
            <span className="rxvc-dot">·</span>
            <span className={cls("duration")}>{med.duration}</span>
        </span>
    );
}

function MedicineRow({ row }: { row: MedicineDiffRow }) {
    const meta = STATUS_META[row.status];
    const Icon = meta.icon;
    return (
        <li className={`rxvc-med-row ${meta.cls}`}>
            <span className="rxvc-med-tag"><Icon size={10} />{meta.label}</span>
            <span className="rxvc-med-name">{row.name}</span>
            {row.status === "added" && row.newer && <MedFields med={row.newer} changedFields={[]} />}
            {row.status === "stopped" && row.older && <MedFields med={row.older} changedFields={[]} />}
            {row.status === "unchanged" && row.newer && <MedFields med={row.newer} changedFields={[]} />}
            {row.status === "changed" && row.older && row.newer && (
                <span className="rxvc-med-compare">
                    <MedFields med={row.older} changedFields={row.changedFields} />
                    <ArrowRight size={11} className="rxvc-med-arrow" />
                    <MedFields med={row.newer} changedFields={row.changedFields} />
                </span>
            )}
        </li>
    );
}

function ChipGroup({ label, items, cls }: { label: string; items: string[]; cls: string }) {
    if (!items.length) return null;
    return (
        <div className="rxvc-chip-group">
            <span className="rxvc-chip-group-label">{label}</span>
            <div className="rxvc-chips">
                {items.map((s) => <span key={s} className={`rxvc-chip ${cls}`}>{s}</span>)}
            </div>
        </div>
    );
}

export default function VisitDiffPanel({ older, newer }: VisitDiffPanelProps) {
    const meds = diffMedicines(older, newer);
    const symptoms = diffSymptoms(older, newer);
    const findings = diffFindings(older, newer);
    const vitals = diffVitals(older, newer);

    const medsChangedCount = meds.filter((m) => m.status !== "unchanged").length;
    const unchangedMeds = meds.filter((m) => m.status === "unchanged");
    const changedMeds = meds.filter((m) => m.status !== "unchanged");

    const nothingChanged =
        medsChangedCount === 0 &&
        symptoms.added.length === 0 && symptoms.resolved.length === 0 &&
        findings.added.length === 0 && findings.resolved.length === 0;

    return (
        <div className="rxvc-panel">
            {/* ── Header: the two dates being compared ── */}
            <div className="rxvc-header">
                <span className="rxvc-header-date">{formatVisitDateLong(older.created_at)}</span>
                <ArrowRight size={14} className="rxvc-header-arrow" />
                <span className="rxvc-header-date is-newer">{formatVisitDateLong(newer.created_at)}</span>
            </div>

            {nothingChanged && (
                <p className="rxvc-empty">No changes to symptoms or the prescription between these visits.</p>
            )}

            {/* ── Prescription changes ── */}
            {meds.length > 0 && (
                <section className="rxvc-section">
                    <p className="rxvc-section-label">
                        Prescription {medsChangedCount > 0 ? `— ${medsChangedCount} change${medsChangedCount === 1 ? "" : "s"}` : "— unchanged"}
                    </p>
                    {changedMeds.length > 0 && (
                        <ul className="rxvc-med-list">
                            {changedMeds.map((row) => <MedicineRow key={row.medicine_id} row={row} />)}
                        </ul>
                    )}
                    {unchangedMeds.length > 0 && (
                        <details className="rxvc-unchanged-details">
                            <summary>{unchangedMeds.length} unchanged medicine{unchangedMeds.length === 1 ? "" : "s"}</summary>
                            <ul className="rxvc-med-list">
                                {unchangedMeds.map((row) => <MedicineRow key={row.medicine_id} row={row} />)}
                            </ul>
                        </details>
                    )}
                </section>
            )}

            {/* ── Symptoms ── */}
            {(symptoms.added.length > 0 || symptoms.resolved.length > 0 || symptoms.persisting.length > 0) && (
                <section className="rxvc-section">
                    <p className="rxvc-section-label">Symptoms</p>
                    <ChipGroup label="Resolved" items={symptoms.resolved} cls="is-resolved" />
                    <ChipGroup label="New" items={symptoms.added} cls="is-new" />
                    <ChipGroup label="Persisting" items={symptoms.persisting} cls="is-persisting" />
                </section>
            )}

            {/* ── Findings ── */}
            {(findings.added.length > 0 || findings.resolved.length > 0 || findings.persisting.length > 0) && (
                <section className="rxvc-section">
                    <p className="rxvc-section-label">Findings</p>
                    <ChipGroup label="Resolved" items={findings.resolved.map((f) => f.name)} cls="is-resolved" />
                    <ChipGroup label="New" items={findings.added.map((f) => f.name)} cls="is-new" />
                    <ChipGroup label="Persisting" items={findings.persisting.map((f) => f.name)} cls="is-persisting" />
                </section>
            )}

            {/* ── Vitals — magnitude only, never colour-coded as good/bad ── */}
            {vitals.length > 0 && (
                <section className="rxvc-section">
                    <p className="rxvc-section-label">Vitals</p>
                    <div className="rxvc-vitals-grid">
                        {vitals.map((v) => (
                            <div key={v.key} className="rxvc-vital-cell">
                                <span className="rxvc-vital-label">{v.label}</span>
                                <span className="rxvc-vital-values">
                                    <span>{v.older ?? "—"}</span>
                                    <ArrowRight size={10} />
                                    <span className="is-newer">{v.newer ?? "—"}</span>
                                    <span className="rxvc-vital-unit">{v.unit}</span>
                                </span>
                                {v.delta !== null && v.delta !== 0 && (
                                    <span className="rxvc-vital-delta">{v.delta > 0 ? "+" : ""}{v.delta}</span>
                                )}
                            </div>
                        ))}
                    </div>
                </section>
            )}
        </div>
    );
}
