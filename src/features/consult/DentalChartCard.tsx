// ---------------------------------------------------------------------------
// DENTAL CHART — the real per-tooth record, not a metadata tag on a photo.
//
// Backend/backbone only, per explicit scope agreed with Anmol (2026-08-08):
// this is a plain list-and-form, not a clickable tooth diagram. tooth_number
// (FDI notation) is already the addressable unit a real diagram would click
// on — nothing about the data model changes when that gets built, only this
// component gets replaced.
//
// Deliberately its own card, not folded into Attachments: a finding can
// exist with no image at all (most caries/mobility findings never get
// photographed), and an X-ray, when one exists, is a property OF a finding,
// not the finding itself.
// ---------------------------------------------------------------------------

import { useEffect, useState } from "react";
import { Smile, Loader2, Trash2 } from "lucide-react";
import { listDentalFindings, addDentalFinding, deleteDentalFinding } from "../../lib/db/dental";
import { TOOTH_OPTIONS, DENTAL_CONDITIONS, DENTAL_CONDITION_LABEL } from "../../lib/dental/types";
import type { DentalFinding, DentalCondition } from "../../lib/dental/types";

interface Props {
    visitId: string | null;
    doctorId?: string | null;
    disabled?: boolean;
}

export function DentalChartCard({ visitId, doctorId, disabled = false }: Props) {
    const [items, setItems] = useState<DentalFinding[]>([]);
    const [formOpen, setFormOpen] = useState(false);
    const [tooth, setTooth] = useState(TOOTH_OPTIONS[0].code);
    const [condition, setCondition] = useState<DentalCondition>("caries");
    const [note, setNote] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!visitId) { setItems([]); return; }
        let cancelled = false;
        listDentalFindings(visitId)
            .then((rows) => { if (!cancelled) setItems(rows); })
            .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); });
        return () => { cancelled = true; };
    }, [visitId]);

    const onAdd = async () => {
        if (!visitId) return;
        setSaving(true);
        setError(null);
        try {
            const finding = await addDentalFinding({
                visitId, toothNumber: tooth, condition, note: note.trim() || undefined, doctorId,
            });
            setItems((curr) => [finding, ...curr].sort((a, b) => a.toothNumber.localeCompare(b.toothNumber)));
            setNote("");
            setFormOpen(false);
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
                {items.length === 0 && !formOpen && (
                    <p className="cs-attach-empty">
                        Per-tooth findings — FDI numbering. Not needed for a simple
                        toothache; use it when more than one tooth is involved.
                    </p>
                )}

                {items.map((f) => (
                    <div key={f.id} className="cs-attach-row">
                        <span className="cs-attach-icon cs-dental-tooth">{f.toothNumber}</span>
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

                {formOpen ? (
                    <div className="cs-attach-tagpanel">
                        <div className="cs-attach-tagrow">
                            <select className="cs-dental-select" value={tooth} onChange={(e) => setTooth(e.target.value)}>
                                {TOOTH_OPTIONS.map((t) => (
                                    <option key={t.code} value={t.code}>{t.label}</option>
                                ))}
                            </select>
                        </div>
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
                                {saving ? <Loader2 size={13} className="cs-spin" /> : "Add"}
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="cs-attach-add">
                        <button
                            type="button"
                            className="cs-meas-add"
                            disabled={disabled || !visitId}
                            onClick={() => setFormOpen(true)}
                        >
                            <Smile size={13} />
                            <span className="cs-meas-label">Add finding</span>
                        </button>
                    </div>
                )}

                {error && <p className="cs-attach-error">{error}</p>}
            </div>
        </section>
    );
}
