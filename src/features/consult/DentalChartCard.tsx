// ---------------------------------------------------------------------------
// DENTAL CHART — a real clickable odontogram, not a dropdown pretending to
// be one. Rebuilt 2026-08-10 after Anmol's direct question: "have you made
// the dental chart seriously? You click on it and see the tooth chart and
// all" — the answer was no (a list-and-form was the deliberate 2026-08-08
// backbone scope), so here is the real thing.
//
// Two arches, drawn the way a dentist draws one: patient's right shown
// first, split at the midline, upper over lower — see TOOTH_CHART_ROWS in
// lib/dental/types.ts, which owns the layout so this component only renders
// it. Click a tooth to select it; the panel below shows that tooth's
// findings and a quick-add form with the tooth already fixed — no dropdown
// needed once the diagram exists to click on directly. A flagged tooth
// colors by its most recent finding's condition, with a count badge when
// more than one finding exists (e.g. caries, then filled, both on record).
//
// Still its own card, not folded into Attachments: a finding can exist with
// no image at all (most caries/mobility findings never get photographed),
// and an X-ray, when one exists, is a property OF a finding, not the
// finding itself.
// ---------------------------------------------------------------------------

import { useEffect, useMemo, useState } from "react";
import { Smile, Loader2, Trash2, X } from "lucide-react";
import { listDentalFindings, addDentalFinding, deleteDentalFinding } from "../../lib/db/dental";
import {
    TOOTH_CHART_ROWS,
    TOOTH_LABEL,
    DENTAL_CONDITIONS,
    DENTAL_CONDITION_LABEL,
    DENTAL_CONDITION_COLOR,
} from "../../lib/dental/types";
import type { DentalFinding, DentalCondition } from "../../lib/dental/types";

interface Props {
    visitId: string | null;
    doctorId?: string | null;
    disabled?: boolean;
}

export function DentalChartCard({ visitId, doctorId, disabled = false }: Props) {
    const [items, setItems] = useState<DentalFinding[]>([]);
    const [selectedTooth, setSelectedTooth] = useState<string | null>(null);
    const [condition, setCondition] = useState<DentalCondition>("caries");
    const [note, setNote] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!visitId) { setItems([]); setSelectedTooth(null); return; }
        let cancelled = false;
        listDentalFindings(visitId)
            .then((rows) => { if (!cancelled) setItems(rows); })
            .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); });
        return () => { cancelled = true; };
    }, [visitId]);

    // A fresh selection starts a fresh quick-add draft — the previous
    // tooth's note has no business surviving onto this one.
    useEffect(() => {
        setCondition("caries");
        setNote("");
    }, [selectedTooth]);

    // tooth code -> its findings, most-recent first, computed once per
    // render rather than filtering `items` inside every tooth cell.
    const byTooth = useMemo(() => {
        const map = new Map<string, DentalFinding[]>();
        for (const f of items) {
            const list = map.get(f.toothNumber) ?? [];
            list.push(f);
            map.set(f.toothNumber, list);
        }
        for (const list of map.values()) {
            list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        }
        return map;
    }, [items]);

    const selectedFindings = selectedTooth ? (byTooth.get(selectedTooth) ?? []) : [];

    const onSelect = (code: string) => {
        if (disabled || !visitId) return;
        setSelectedTooth((curr) => (curr === code ? null : code));
    };

    const onAdd = async () => {
        if (!visitId || !selectedTooth) return;
        setSaving(true);
        setError(null);
        try {
            const finding = await addDentalFinding({
                visitId, toothNumber: selectedTooth, condition, note: note.trim() || undefined, doctorId,
            });
            setItems((curr) => [finding, ...curr]);
            setNote("");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Could not save finding");
        } finally {
            setSaving(false);
        }
    };

    const onDelete = async (f: DentalFinding) => {
        setItems((curr) => curr.filter((i) => i.id !== f.id));
        try {
            await deleteDentalFinding(f.id);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Delete failed");
            setItems((curr) => [f, ...curr]);
        }
    };

    return (
        <section className="cs-card" aria-label="Dental chart">
            <div className="cs-card-head">
                <h2 className="cs-card-title">
                    <span className="cs-glyph is-slate"><Smile size={12} /></span>
                    Dental Chart
                </h2>
            </div>

            <div className="cs-attach-body">
                <div className={`cs-dchart${disabled || !visitId ? " is-disabled" : ""}`}>
                    {TOOTH_CHART_ROWS.map((row, rowIdx) => (
                        <div className="cs-dchart-arch" key={rowIdx}>
                            {row.map((t, i) => {
                                const findings = byTooth.get(t.code) ?? [];
                                const flagged = findings.length > 0;
                                const colorKey = flagged ? DENTAL_CONDITION_COLOR[findings[0].condition] : null;
                                return (
                                    <button
                                        key={t.code}
                                        type="button"
                                        className={
                                            `cs-dchart-tooth` +
                                            (flagged ? ` is-flagged is-cond-${colorKey}` : "") +
                                            (selectedTooth === t.code ? " is-selected" : "") +
                                            (i === 7 ? " is-quad-end" : "")
                                        }
                                        title={TOOTH_LABEL[t.code]}
                                        aria-label={`Tooth ${t.code}${flagged ? `, ${findings.length} finding${findings.length > 1 ? "s" : ""}` : ""}`}
                                        aria-pressed={selectedTooth === t.code}
                                        onClick={() => onSelect(t.code)}
                                    >
                                        {t.code}
                                        {findings.length > 1 && (
                                            <i className="cs-dchart-count">{findings.length}</i>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    ))}
                </div>

                <div className="cs-dchart-legend">
                    {DENTAL_CONDITIONS.map((c) => (
                        <span className="cs-dchart-legend-item" key={c}>
                            <i className={`cs-dchart-legend-dot is-cond-${DENTAL_CONDITION_COLOR[c]}`} />
                            {DENTAL_CONDITION_LABEL[c]}
                        </span>
                    ))}
                </div>

                {selectedTooth ? (
                    <div className="cs-dchart-panel">
                        <div className="cs-dchart-panel-head">
                            <span className="cs-dchart-panel-title">
                                {TOOTH_LABEL[selectedTooth]}
                            </span>
                            <button
                                type="button"
                                className="cs-dchart-panel-close"
                                onClick={() => setSelectedTooth(null)}
                                aria-label="Close"
                            >
                                <X size={13} />
                            </button>
                        </div>

                        {selectedFindings.map((f) => (
                            <div key={f.id} className="cs-attach-row">
                                <span className="cs-attach-icon">
                                    <i className={`cs-dchart-dot is-cond-${DENTAL_CONDITION_COLOR[f.condition]}`} />
                                </span>
                                <span className="cs-attach-meta">
                                    <span className="cs-attach-label">{DENTAL_CONDITION_LABEL[f.condition]}</span>
                                    {f.note && <span className="cs-attach-size">{f.note}</span>}
                                </span>
                                <button
                                    type="button"
                                    className="cs-attach-action is-danger"
                                    onClick={() => onDelete(f)}
                                    aria-label="Remove finding"
                                    title="Remove"
                                >
                                    <Trash2 size={13} />
                                </button>
                            </div>
                        ))}

                        <div className="cs-attach-tagpanel">
                            <div className="cs-attach-tagrow">
                                {DENTAL_CONDITIONS.map((c) => (
                                    <button
                                        key={c}
                                        type="button"
                                        className={`cs-attach-chip${condition === c ? " is-on" : ""}`}
                                        onClick={() => setCondition(c)}
                                    >
                                        {DENTAL_CONDITION_LABEL[c]}
                                    </button>
                                ))}
                            </div>
                            <div className="cs-attach-tagrow">
                                <input
                                    className="cs-attach-region-input"
                                    placeholder="Note — optional"
                                    value={note}
                                    onChange={(e) => setNote(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === "Enter") onAdd(); }}
                                />
                                <button type="button" className="cs-attach-tagsave" disabled={saving} onClick={onAdd}>
                                    {saving ? <Loader2 size={13} className="cs-spin" /> : "Add finding"}
                                </button>
                            </div>
                        </div>
                    </div>
                ) : (
                    <p className="cs-attach-empty">
                        Click a tooth above to add or review findings — FDI numbering, patient's
                        right shown first. Not needed for a simple toothache with nothing else
                        to record.
                    </p>
                )}

                {error && <p className="cs-attach-error">{error}</p>}
            </div>
        </section>
    );
}
