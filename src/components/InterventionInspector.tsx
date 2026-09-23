import { Check, Waves, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { InterventionSide } from "../features/consult/interventionPlan";
import { useOverlayFocus } from "../hooks/useOverlayFocus";

type Props = {
    label: string;
    /** pre-filled when the doctor arrived via a body-map click — see
     *  JointMapCard. Empty today (that wiring is a fast-follow); the field
     *  is free text either way, so nothing about this component changes
     *  when it lands. */
    initialSite?: string;
    onConfirm: (draft: { site: string; side: InterventionSide | null; notes: string }) => void;
    onCancel: () => void;
};

const SIDES: { key: InterventionSide; label: string }[] = [
    { key: "left", label: "Left" },
    { key: "right", label: "Right" },
    { key: "both", label: "Bilateral" },
];

/**
 * The confirm step between "this intervention is ranked" and "this is on the
 * plan" — same slot in the flow as MedicineAddSheet, one accent lighter.
 * Orange: this modal family's own colour (docs/aren-modal-design.md) — not
 * teal (medicine's), not green (means TAKEN elsewhere), not blue (the
 * generic action colour every other primary button already uses).
 *
 * Deliberately three fields and no more. Site is what makes two simultaneous
 * procedures two lines instead of one blurred sentence (the multi-fracture
 * case this whole structure exists for); side is one tap for the common
 * "which one" question; notes is the catch-all for everything else — plaster
 * type, drug injected, a complication — so the field list never has to grow
 * again for a rare specific. No dosing grid: an intervention is a record of
 * something done, not a progressively-dosed prescription like a medicine or
 * an exercise.
 */
export function InterventionInspector({ label, initialSite = "", onConfirm, onCancel }: Props) {
    const [site, setSite] = useState(initialSite);
    const [side, setSide] = useState<InterventionSide | null>(null);
    const [notes, setNotes] = useState("");

    const panelRef = useRef<HTMLDivElement>(null);
    useOverlayFocus(panelRef, true);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                e.preventDefault();
                onCancel();
                return;
            }
            if (e.key === "Enter") {
                const tag = (e.target as HTMLElement).tagName;
                if (tag === "TEXTAREA") return;
                e.preventDefault();
                onConfirm({ site: site.trim(), side, notes: notes.trim() });
            }
        };
        window.addEventListener("keydown", onKey, true);
        return () => window.removeEventListener("keydown", onKey, true);
    }, [onCancel, onConfirm, site, side, notes]);

    return (
        <div className="cs-intv" role="dialog" aria-modal="true" aria-label={`Record ${label}`}>
            <button className="cs-intv-scrim" type="button" onClick={onCancel} aria-label="Close" />
            <div className="cs-intv-panel" ref={panelRef} tabIndex={-1}>
                <div className="cs-intv-topstripe" />

                <div className="cs-intv-head">
                    <span className="cs-glyph is-orange"><Waves size={16} /></span>
                    <div className="cs-intv-title">
                        <span className="cs-intv-eyebrow">Record intervention</span>
                        <strong>{label}</strong>
                    </div>
                    <button className="cs-intv-x" type="button" onClick={onCancel} aria-label="Cancel">
                        <X size={16} />
                    </button>
                </div>

                <div className="cs-intv-body">
                    <section className="cs-intv-sec">
                        <span className="cs-intv-label">Site</span>
                        <input
                            className="cs-intv-input"
                            value={site}
                            placeholder="e.g. right distal radius"
                            onChange={(e) => setSite(e.target.value)}
                            autoFocus
                        />
                    </section>

                    <section className="cs-intv-sec">
                        <span className="cs-intv-label">Side <em className="cs-intv-optional">optional</em></span>
                        <div className="cs-intv-sides">
                            {SIDES.map((s) => (
                                <button
                                    key={s.key}
                                    type="button"
                                    className={`cs-intv-side${side === s.key ? " is-on" : ""}`}
                                    aria-pressed={side === s.key}
                                    onClick={() => setSide((cur) => (cur === s.key ? null : s.key))}
                                >
                                    {s.label}
                                </button>
                            ))}
                        </div>
                    </section>

                    <section className="cs-intv-sec">
                        <span className="cs-intv-label">Notes</span>
                        <textarea
                            className="cs-intv-input cs-intv-textarea"
                            value={notes}
                            placeholder="Plaster type, drug injected, anything else…"
                            rows={2}
                            onChange={(e) => setNotes(e.target.value)}
                        />
                    </section>
                </div>

                <div className="cs-intv-foot">
                    <button className="cs-intv-cancel" type="button" onClick={onCancel}>
                        Cancel
                    </button>
                    <button
                        className="cs-intv-confirm"
                        type="button"
                        onClick={() => onConfirm({ site: site.trim(), side, notes: notes.trim() })}
                    >
                        <Check size={15} />
                        Add to Plan
                        <span className="cs-kbd">Enter</span>
                    </button>
                </div>
            </div>
        </div>
    );
}
