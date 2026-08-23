// ---------------------------------------------------------------------------
// COMPARE VISITS — "what changed between session 3 and session 6", answered
// directly rather than making a doctor hold two expanded timeline rows in
// their head. Anmol, 2026-08-23 — asked for this alongside the prescription
// viewer, on the same page the longitudinal trend graphs already live.
//
// Reuses trend.ts's real field catalogue and direction/verdict logic
// (readValue/verdictFor/FIELD_BY_KEY) rather than a second "which way is
// better" table — a two-point comparison is exactly what buildSeries already
// computes for a whole series, just for 2 points instead of N. Symptoms/
// findings/medicines are a plain set diff: what's shared, what's new on the
// later visit, what dropped off since the earlier one.
// ---------------------------------------------------------------------------

import { useMemo, useRef } from "react";
import { ArrowDown, ArrowRight, ArrowUp, Pill, X } from "lucide-react";
import type { RealVisit } from "../../lib/db";
import { FIELD_BY_KEY } from "../consult/measures";
import { readValue, verdictFor, formatDelta, formatValue, type TrendVerdict } from "../consult/trend";
import { useOverlayFocus } from "../../hooks/useOverlayFocus";

function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

/** Which side is older/newer — the diff reads "what changed since the
 *  earlier visit", so order is fixed regardless of selection order. */
function orderByDate(a: RealVisit, b: RealVisit): [RealVisit, RealVisit] {
    return +new Date(a.created_at) <= +new Date(b.created_at) ? [a, b] : [b, a];
}

function setDiff(older: string[], newer: string[]) {
    const oldSet = new Set(older);
    const newSet = new Set(newer);
    return {
        shared: newer.filter((s) => oldSet.has(s)),
        added: newer.filter((s) => !oldSet.has(s)),
        resolved: older.filter((s) => !newSet.has(s)),
    };
}

interface MeasureRow {
    key: string;
    label: string;
    unit: string;
    from: number;
    to: number;
    verdict: TrendVerdict;
}

function buildMeasureRows(older: RealVisit, newer: RealVisit): MeasureRow[] {
    const rows: MeasureRow[] = [];
    for (const field of FIELD_BY_KEY.values()) {
        const from = readValue(field, older.vitals);
        const to = readValue(field, newer.vitals);
        if (from === null || to === null) continue;
        rows.push({
            key: field.key,
            label: field.shortLabel,
            unit: field.unit,
            from,
            to,
            verdict: verdictFor(field, field.betterWhen, from, to),
        });
    }
    return rows;
}

function VerdictIcon({ verdict, rising }: { verdict: TrendVerdict; rising: boolean }) {
    if (verdict === "steady") return <ArrowRight size={12} aria-hidden="true" />;
    return rising ? <ArrowUp size={12} aria-hidden="true" /> : <ArrowDown size={12} aria-hidden="true" />;
}

function ChipDiffSection({
    title, older, newer,
}: {
    title: string;
    older: string[];
    newer: string[];
}) {
    const { shared, added, resolved } = setDiff(older, newer);
    if (!shared.length && !added.length && !resolved.length) return null;
    return (
        <div className="prec-cmp-section">
            <div className="prec-cmp-section-label">{title}</div>
            <div className="prec-cmp-chips">
                {added.map((s) => <span key={`a-${s}`} className="prec-cmp-chip is-added">+ {s}</span>)}
                {shared.map((s) => <span key={`s-${s}`} className="prec-cmp-chip">{s}</span>)}
                {resolved.map((s) => <span key={`r-${s}`} className="prec-cmp-chip is-resolved">− {s}</span>)}
            </div>
        </div>
    );
}

export function CompareVisitsModal({
    visitA, visitB, onClose,
}: {
    visitA: RealVisit;
    visitB: RealVisit;
    onClose: () => void;
}) {
    const panelRef = useRef<HTMLDivElement>(null);
    useOverlayFocus(panelRef, true);

    const [older, newer] = useMemo(() => orderByDate(visitA, visitB), [visitA, visitB]);
    const measureRows = useMemo(() => buildMeasureRows(older, newer), [older, newer]);

    return (
        <div className="prec-modal-overlay" onClick={onClose}>
            <div
                ref={panelRef}
                className="prec-modal-card prec-cmp-card"
                tabIndex={-1}
                role="dialog"
                aria-modal="true"
                aria-label="Compare visits"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); onClose(); } }}
            >
                <div className="prec-modal-header">
                    <div>
                        <div className="prec-modal-eyebrow">Compare Visits</div>
                        <div className="prec-modal-title">{formatDate(older.created_at)} → {formatDate(newer.created_at)}</div>
                    </div>
                    <button type="button" className="prec-modal-close" onClick={onClose} aria-label="Close">
                        <X size={14} />
                    </button>
                </div>

                <div className="prec-modal-body">
                    {measureRows.length > 0 && (
                        <div className="prec-cmp-section">
                            <div className="prec-cmp-section-label">Measurements</div>
                            <div className="prec-cmp-measure-list">
                                {measureRows.map((r) => {
                                    const rising = r.to - r.from > 0;
                                    return (
                                        <div key={r.key} className={`prec-cmp-measure-row is-${r.verdict}`}>
                                            <span className="prec-cmp-measure-label">{r.label}{r.unit && ` (${r.unit})`}</span>
                                            <span className="prec-cmp-measure-values">
                                                {formatValue(r.from)} <ArrowRight size={11} /> {formatValue(r.to)}
                                            </span>
                                            <span className="prec-cmp-measure-delta">
                                                <VerdictIcon verdict={r.verdict} rising={rising} />
                                                {formatDelta(r.to - r.from)}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    <ChipDiffSection title="Complaints" older={older.symptoms} newer={newer.symptoms} />
                    <ChipDiffSection
                        title="Findings"
                        older={older.findings.map((f) => f.name)}
                        newer={newer.findings.map((f) => f.name)}
                    />

                    {(older.medicines.length > 0 || newer.medicines.length > 0) && (
                        <div className="prec-cmp-section">
                            <div className="prec-cmp-section-label">Prescription</div>
                            <div className="prec-cmp-columns">
                                <div>
                                    <div className="prec-cmp-col-date">{formatDate(older.created_at)}</div>
                                    {older.medicines.length ? older.medicines.map((m) => (
                                        <div key={m.medicine_id} className="prec-cmp-med-row">
                                            <Pill size={10} />{m.name}
                                        </div>
                                    )) : <span className="prec-cmp-empty">None</span>}
                                </div>
                                <div>
                                    <div className="prec-cmp-col-date">{formatDate(newer.created_at)}</div>
                                    {newer.medicines.length ? newer.medicines.map((m) => (
                                        <div key={m.medicine_id} className="prec-cmp-med-row">
                                            <Pill size={10} />{m.name}
                                        </div>
                                    )) : <span className="prec-cmp-empty">None</span>}
                                </div>
                            </div>
                        </div>
                    )}

                    {measureRows.length === 0 &&
                        !older.symptoms.length && !newer.symptoms.length &&
                        !older.findings.length && !newer.findings.length &&
                        !older.medicines.length && !newer.medicines.length && (
                            <p className="prec-cmp-empty" style={{ textAlign: "center", padding: "20px 0" }}>
                                Neither visit has enough recorded to compare.
                            </p>
                        )}
                </div>
            </div>
        </div>
    );
}
