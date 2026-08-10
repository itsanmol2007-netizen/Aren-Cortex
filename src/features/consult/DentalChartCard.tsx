// ---------------------------------------------------------------------------
// DENTAL CHART — a real odontogram, charted per surface.
//
// Rebuilt 2026-08-10 (second time tonight) after Anmol pushed back on the
// first attempt, correctly: it was 32 rectangles in two straight rows, and a
// dentist does not chart on rectangles. Two things were missing, and both
// are here now.
//
// 1. THE SHAPE. Two curved arches facing each other, teeth sized and spaced
//    by real crown width, each rotated to sit radially on its arch, cusps
//    marked. All of that geometry lives in lib/dental/anatomy.ts — this
//    component renders what that file computes and owns no anatomy itself.
//
// 2. THE UNIT OF RECORD. Caries is charted per SURFACE. A dentist writes
//    "36 MO", meaning the mesial and occlusal surfaces of the lower left
//    first molar — the tooth alone is not the record. So every tooth here is
//    five independently clickable surfaces, and dental_findings carries a
//    nullable `surface` column. Null is meaningful, not missing: mobility,
//    impaction, a missing tooth and a root canal are facts about the whole
//    tooth, and the chart only asks for a surface where one exists to be
//    asked about (see isSurfaceCondition).
//
// Still its own card, not folded into Attachments: a finding can exist with
// no image at all, and an X-ray, when one exists, is a property OF a
// finding, not the finding itself.
// ---------------------------------------------------------------------------

import { useEffect, useMemo, useState } from "react";
import { Smile, Loader2, Trash2, X, Maximize2 } from "lucide-react";
import { ChartSurface } from "./ChartSurface";
import { listDentalFindings, addDentalFinding, deleteDentalFinding } from "../../lib/db/dental";
import {
    UPPER_ARCH, LOWER_ARCH, TOOTH_BY_CODE, CHART_VIEWBOX, OCCLUSAL_Y,
    surfaceLabel, SURFACE_INITIAL,
} from "../../lib/dental/anatomy";
import type { ToothGeometry, ToothSurface } from "../../lib/dental/anatomy";
import {
    TOOTH_LABEL, DENTAL_CONDITIONS, DENTAL_CONDITION_LABEL,
    DENTAL_CONDITION_COLOR, isSurfaceCondition,
} from "../../lib/dental/types";
import type { DentalFinding, DentalCondition } from "../../lib/dental/types";

interface Props {
    visitId: string | null;
    doctorId?: string | null;
    disabled?: boolean;
}

interface Selection {
    code: string;
    surface: ToothSurface | null;
}

/** What colors each of a tooth's parts, once all its findings are considered. */
interface ToothPaint {
    /** surface -> condition, most recent finding wins */
    surfaces: Partial<Record<ToothSurface, DentalCondition>>;
    /** a whole-tooth finding, if any — paints the crown itself */
    whole: DentalCondition | null;
    count: number;
}

export function DentalChartCard({ visitId, doctorId, disabled = false }: Props) {
    const [items, setItems] = useState<DentalFinding[]>([]);
    const [sel, setSel] = useState<Selection | null>(null);
    const [condition, setCondition] = useState<DentalCondition>("caries");
    const [note, setNote] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [expanded, setExpanded] = useState(false);

    useEffect(() => {
        if (!visitId) { setItems([]); setSel(null); return; }
        let cancelled = false;
        listDentalFindings(visitId)
            .then((rows) => { if (!cancelled) setItems(rows); })
            .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); });
        return () => { cancelled = true; };
    }, [visitId]);

    // A new selection starts a fresh draft — the previous surface's note has
    // no business surviving onto this one.
    useEffect(() => { setNote(""); }, [sel?.code, sel?.surface]);

    const paint = useMemo(() => {
        const map = new Map<string, ToothPaint>();
        // Oldest first, so the newest finding on a given surface overwrites
        // the older one and ends up the color that shows.
        const ordered = [...items].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        for (const f of ordered) {
            const cur = map.get(f.toothNumber) ?? { surfaces: {}, whole: null, count: 0 };
            if (f.surface) cur.surfaces[f.surface] = f.condition;
            else cur.whole = f.condition;
            cur.count += 1;
            map.set(f.toothNumber, cur);
        }
        return map;
    }, [items]);

    const selectedTooth = sel ? TOOTH_BY_CODE[sel.code] : null;
    const selectedFindings = useMemo(() => {
        if (!sel) return [];
        return items
            .filter((f) => f.toothNumber === sel.code)
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }, [items, sel]);

    // The surface actually recorded: a whole-tooth condition ignores whichever
    // surface happened to be clicked, rather than filing mobility under "mesial".
    const effectiveSurface = sel && isSurfaceCondition(condition) ? sel.surface : null;

    const onPick = (code: string, surface: ToothSurface) => {
        if (disabled || !visitId) return;
        setSel((curr) =>
            curr && curr.code === code && curr.surface === surface ? null : { code, surface }
        );
    };

    const onAdd = async () => {
        if (!visitId || !sel) return;
        setSaving(true);
        setError(null);
        try {
            const finding = await addDentalFinding({
                visitId,
                toothNumber: sel.code,
                surface: effectiveSurface,
                condition,
                note: note.trim() || undefined,
                doctorId,
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

    const renderTooth = (t: ToothGeometry) => {
        const p = paint.get(t.code);
        const isSel = sel?.code === t.code;
        const wholeColor = p?.whole ? DENTAL_CONDITION_COLOR[p.whole] : null;
        // "Missing" is not a color — it is the absence of a tooth. Drawn as a
        // dashed ghost so the gap in the arch reads as a gap.
        const isMissing = p?.whole === "missing";

        return (
            <g key={t.code} className={`cs-odo-tooth${isSel ? " is-sel" : ""}`}>
                <g transform={`translate(${t.x.toFixed(1)},${t.y.toFixed(1)}) rotate(${t.rotate.toFixed(1)})`}>
                    {/* The surface zones are rectangles; the crown is not. Clipping
                        them to the outline lets the zone maths stay simple while the
                        fills still follow the real shape of the tooth. */}
                    <clipPath id={`cs-crown-${t.code}`}>
                        <path d={t.outline} />
                    </clipPath>
                    {/* crown body — painted by a whole-tooth finding, if any */}
                    <path
                        d={t.outline}
                        className={
                            "cs-odo-crown" +
                            (isMissing ? " is-missing" : wholeColor ? ` is-cond-${wholeColor}` : "")
                        }
                    />
                    <g clipPath={`url(#cs-crown-${t.code})`}>
                    {!isMissing && t.zones.map((z) => {
                        const cond = p?.surfaces[z.surface];
                        return (
                            <polygon
                                key={z.surface}
                                points={z.points}
                                data-tooth={t.code}
                                data-surface={z.surface}
                                className={
                                    "cs-odo-surface" +
                                    (cond ? ` is-cond-${DENTAL_CONDITION_COLOR[cond]}` : "") +
                                    (isSel && sel?.surface === z.surface ? " is-sel" : "")
                                }
                                onClick={() => onPick(t.code, z.surface)}
                            >
                                <title>{`${t.code} ${surfaceLabel(z.surface, t)}${cond ? ` — ${DENTAL_CONDITION_LABEL[cond]}` : ""}`}</title>
                            </polygon>
                        );
                    })}
                    </g>
                    {!isMissing && t.cusps.map((c, i) => (
                        <circle key={i} cx={c.cx} cy={c.cy} r={c.r} className="cs-odo-cusp" />
                    ))}
                    {/* outline drawn last so surface fills never cover the crown edge */}
                    <path d={t.outline} className={`cs-odo-edge${isMissing ? " is-missing" : ""}`} />
                </g>
                <text x={t.labelX.toFixed(1)} y={t.labelY.toFixed(1)} className="cs-odo-num">
                    {t.code}
                </text>
            </g>
        );
    };

    return (
        <section className="cs-card" aria-label="Dental chart">
            <div className="cs-card-head">
                <h2 className="cs-card-title">
                    <span className="cs-glyph is-slate"><Smile size={12} /></span>
                    Dental Chart
                    <em>
                        {items.length > 0
                            ? `${items.length} finding${items.length > 1 ? "s" : ""}`
                            : "FDI · charted per surface"}
                    </em>
                </h2>
                <button
                    type="button"
                    className="cs-chart-expand"
                    onClick={() => setExpanded(true)}
                    aria-label="Open the chart larger"
                    title="Open larger"
                >
                    <Maximize2 size={12} />
                </button>
            </div>

            <ChartSurface title="Dental chart" expanded={expanded} onClose={() => setExpanded(false)}>
            <div className="cs-attach-body">
                <div className={`cs-odo${disabled || !visitId ? " is-disabled" : ""}`}>
                    <svg viewBox={CHART_VIEWBOX} className="cs-odo-svg" role="img"
                        aria-label="Dental chart — click a tooth surface to record a finding">
                        {/* the occlusal plane, where the two arches meet */}
                        <line x1="14" y1={OCCLUSAL_Y} x2="446" y2={OCCLUSAL_Y} className="cs-odo-plane" />
                        <text x="16" y={OCCLUSAL_Y - 6} className="cs-odo-side">RIGHT</text>
                        <text x="444" y={OCCLUSAL_Y - 6} className="cs-odo-side" textAnchor="end">LEFT</text>
                        {UPPER_ARCH.map(renderTooth)}
                        {LOWER_ARCH.map(renderTooth)}
                    </svg>
                </div>

                <div className="cs-dchart-legend">
                    {DENTAL_CONDITIONS.map((c) => (
                        <span className="cs-dchart-legend-item" key={c}>
                            <i className={`cs-dchart-legend-dot is-cond-${DENTAL_CONDITION_COLOR[c]}`} />
                            {DENTAL_CONDITION_LABEL[c]}
                        </span>
                    ))}
                </div>

                {sel && selectedTooth ? (
                    <div className="cs-dchart-panel">
                        <div className="cs-dchart-panel-head">
                            <span className="cs-dchart-panel-title">
                                {TOOTH_LABEL[sel.code]}
                                {sel.surface && (
                                    <i className="cs-odo-surfacetag">
                                        {surfaceLabel(sel.surface, selectedTooth)}
                                    </i>
                                )}
                            </span>
                            <button
                                type="button"
                                className="cs-dchart-panel-close"
                                onClick={() => setSel(null)}
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
                                    <span className="cs-attach-label">
                                        {DENTAL_CONDITION_LABEL[f.condition]}
                                        <i className="cs-attach-tagbadge">
                                            {f.surface
                                                ? `${f.toothNumber} ${SURFACE_INITIAL[f.surface]}`
                                                : "Whole tooth"}
                                        </i>
                                    </span>
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
                            <p className="cs-odo-scope">
                                {effectiveSurface
                                    ? `Records as ${sel.code} ${SURFACE_INITIAL[effectiveSurface]} — ${surfaceLabel(effectiveSurface, selectedTooth).toLowerCase()} surface.`
                                    : `Records against the whole of tooth ${sel.code} — ${DENTAL_CONDITION_LABEL[condition].toLowerCase()} is not a surface finding.`}
                            </p>
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
                        Click a tooth surface to chart it — mesial, distal, buccal, lingual or
                        occlusal, the way a finding is actually written down. Patient's right
                        is on the left, as you face them.
                    </p>
                )}

                {error && <p className="cs-attach-error">{error}</p>}
            </div>
            </ChartSurface>
        </section>
    );
}
