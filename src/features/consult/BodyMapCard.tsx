// ---------------------------------------------------------------------------
// BODY MAP — where on the patient, pointed at rather than typed.
//
// The dermatology counterpart to the dental chart, built for the same reason
// and in the same shape. Attachments already carried a free-text "body region"
// box; that box is not the tool a dermatologist uses, and site is not merely
// documentation — a steroid strong enough for a plaque on the shin will thin
// the skin on an eyelid, and scabies is diagnosed largely by where it is.
//
// Front and back are one figure with a toggle, not two figures side by side:
// at the size this card gets, two half-scale bodies are harder to hit than one
// readable one, and a doctor knows which way they are looking at the patient.
//
// The engine never reads any of this (§14 — guards, signals and ranking are
// untouched). It is record and presentation, the same boundary drawn for
// specialty profiles and for attachment tags.
// ---------------------------------------------------------------------------

import { useEffect, useMemo, useState } from "react";
import { PersonStanding, Loader2, Trash2, X, Maximize2 } from "lucide-react";
import { ChartSurface } from "./ChartSurface";
import { listBodySites, addBodySite, deleteBodySite } from "../../lib/db/bodySites";
import type { BodySiteFinding } from "../../lib/db/bodySites";
import { BODY_ZONES, FIGURE_VIEWBOX, regionLabel, siteLabel } from "../../lib/body/anatomy";
import type { BodyAspect, BodyRegion, BodySide } from "../../lib/body/anatomy";

interface Props {
    visitId: string | null;
    doctorId?: string | null;
    disabled?: boolean;
}

interface Selection {
    region: BodyRegion;
    side: BodySide | null;
}

export function BodyMapCard({ visitId, doctorId, disabled = false }: Props) {
    const [items, setItems] = useState<BodySiteFinding[]>([]);
    const [aspect, setAspect] = useState<BodyAspect>("front");
    const [sel, setSel] = useState<Selection | null>(null);
    const [note, setNote] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [expanded, setExpanded] = useState(false);

    useEffect(() => {
        if (!visitId) { setItems([]); setSel(null); return; }
        let cancelled = false;
        listBodySites(visitId)
            .then((rows) => { if (!cancelled) setItems(rows); })
            .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); });
        return () => { cancelled = true; };
    }, [visitId]);

    // Turning the patient around clears the selection: the same zone means a
    // different place from the other side, so keeping it would be wrong.
    useEffect(() => { setSel(null); }, [aspect]);
    useEffect(() => { setNote(""); }, [sel?.region, sel?.side]);

    /** which zones are already marked on the side currently being shown */
    const marked = useMemo(() => {
        const s = new Set<string>();
        for (const f of items) {
            if (f.aspect === aspect) s.add(`${f.region}-${f.side ?? "mid"}`);
        }
        return s;
    }, [items, aspect]);

    const shown = useMemo(
        () => items.filter((f) => f.aspect === aspect),
        [items, aspect]
    );

    const onAdd = async () => {
        if (!visitId || !sel) return;
        setSaving(true);
        setError(null);
        try {
            const site = await addBodySite({
                visitId, region: sel.region, aspect, side: sel.side,
                note: note.trim() || undefined, doctorId,
            });
            setItems((curr) => [site, ...curr]);
            setNote("");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Could not save site");
        } finally {
            setSaving(false);
        }
    };

    const onDelete = async (f: BodySiteFinding) => {
        setItems((curr) => curr.filter((i) => i.id !== f.id));
        try {
            await deleteBodySite(f.id);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Delete failed");
            setItems((curr) => [f, ...curr]);
        }
    };

    return (
        <section className="cs-card" aria-label="Body map">
            <div className="cs-card-head">
                <h2 className="cs-card-title">
                    <span className="cs-glyph is-slate"><PersonStanding size={14} /></span>
                    Body Map
                    <em>{items.length > 0 ? `${items.length} site${items.length > 1 ? "s" : ""}` : "where on the body"}</em>
                </h2>
                <button
                    type="button"
                    className="cs-chart-expand"
                    onClick={() => setExpanded(true)}
                    aria-label="Open the map larger"
                    title="Open larger"
                >
                    <Maximize2 size={12} />
                </button>
            </div>

            <ChartSurface title="Body map" expanded={expanded} onClose={() => setExpanded(false)}>
            <div className="cs-attach-body">
                <div className="cs-attach-tagrow cs-body-aspect">
                    {(["front", "back"] as BodyAspect[]).map((a) => (
                        <button
                            key={a}
                            type="button"
                            className={`cs-attach-chip${aspect === a ? " is-on" : ""}`}
                            onClick={() => setAspect(a)}
                        >
                            {a === "front" ? "Front" : "Back"}
                        </button>
                    ))}
                </div>

                <div className={`cs-body${disabled || !visitId ? " is-disabled" : ""}`}>
                    <svg viewBox={FIGURE_VIEWBOX} className="cs-body-svg" role="img"
                        aria-label="Body map — click a region to record where a finding is">
                        {BODY_ZONES.map((z) => {
                            const isMarked = marked.has(`${z.region}-${z.side ?? "mid"}`);
                            const isSel = sel?.region === z.region && sel?.side === z.side;
                            return (
                                <path
                                    key={z.key}
                                    d={z.path}
                                    data-region={z.region}
                                    data-side={z.side ?? "mid"}
                                    className={
                                        "cs-body-zone" +
                                        (isMarked ? " is-marked" : "") +
                                        (isSel ? " is-sel" : "")
                                    }
                                    onClick={() => {
                                        if (disabled || !visitId) return;
                                        setSel((c) =>
                                            c && c.region === z.region && c.side === z.side
                                                ? null
                                                : { region: z.region, side: z.side }
                                        );
                                    }}
                                >
                                    <title>{siteLabel(z.region, aspect, z.side)}</title>
                                </path>
                            );
                        })}
                    </svg>
                    <span className="cs-body-orient">
                        {aspect === "front"
                            ? "Facing you — the patient's right is on your left"
                            : "From behind — the patient's right is on your right"}
                    </span>
                </div>

                {sel ? (
                    <div className="cs-dchart-panel">
                        <div className="cs-dchart-panel-head">
                            <span className="cs-dchart-panel-title">
                                {siteLabel(sel.region, aspect, sel.side)}
                            </span>
                            <button type="button" className="cs-dchart-panel-close"
                                onClick={() => setSel(null)} aria-label="Close">
                                <X size={13} />
                            </button>
                        </div>
                        <div className="cs-attach-tagrow">
                            <input
                                className="cs-attach-region-input"
                                placeholder="What is there — e.g. scaly plaque, 3cm"
                                value={note}
                                onChange={(e) => setNote(e.target.value)}
                                onKeyDown={(e) => { if (e.key === "Enter") onAdd(); }}
                            />
                            <button type="button" className="cs-attach-tagsave" disabled={saving} onClick={onAdd}>
                                {saving ? <Loader2 size={13} className="cs-spin" /> : "Mark site"}
                            </button>
                        </div>
                    </div>
                ) : (
                    <p className="cs-attach-empty">
                        Click where it is. Distribution is diagnostic — palms and soles,
                        flexures, sun-exposed areas each mean something — and site decides
                        how strong a topical can safely be.
                    </p>
                )}

                {shown.map((f) => (
                    <div key={f.id} className="cs-attach-row">
                        <span className="cs-attach-icon">
                            <i className="cs-dchart-dot is-cond-teal" />
                        </span>
                        <span className="cs-attach-meta">
                            <span className="cs-attach-label">
                                {siteLabel(f.region, f.aspect, f.side)}
                                <i className="cs-attach-tagbadge">{regionLabel(f.region, f.aspect)}</i>
                            </span>
                            {f.note && <span className="cs-attach-size">{f.note}</span>}
                        </span>
                        <button type="button" className="cs-attach-action is-danger"
                            onClick={() => onDelete(f)} aria-label="Remove site" title="Remove">
                            <Trash2 size={13} />
                        </button>
                    </div>
                ))}

                {items.length > shown.length && (
                    <p className="cs-odo-scope">
                        {items.length - shown.length} more marked on the{" "}
                        {aspect === "front" ? "back" : "front"}.
                    </p>
                )}

                {error && <p className="cs-attach-error">{error}</p>}
            </div>
            </ChartSurface>
        </section>
    );
}
