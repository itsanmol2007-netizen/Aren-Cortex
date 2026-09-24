import { Check, FlaskConical, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { InterventionSide } from "../features/consult/interventionPlan";
import { AnatomyFigure, SiteField } from "../features/consult/AnatomyPicker";
import { clinicalSiteLabel, siteFromLabel, type SiteRef } from "../lib/body/clinicalSite";
import { useOverlayFocus } from "../hooks/useOverlayFocus";

type Props = {
    label: string;
    /** pre-filled from the visit's own marked body sites when one exists —
     *  see App.tsx's `handleAcceptIntent`. Still a normal editable field:
     *  Synapse's guess is a starting point, never the only way in. */
    initialSite?: string;
    onConfirm: (draft: { site: string; side: InterventionSide | null; notes: string }) => void;
    onCancel: () => void;
};

/**
 * The confirm step between "this intervention is ranked" and "this is on the
 * plan" — same slot in the flow as MedicineAddSheet, same shell
 * (`.cs-addmed-*`) and the same teal accent, not a colour of its own:
 * colour.md is explicit that there is no eighth colour, and teal's actual
 * meaning — "examined (by the doctor)" — fits a procedure the doctor
 * performs at least as well as it fits a prescription.
 *
 * Site is chosen on the shared anatomy picker (AnatomyPicker.tsx) — click
 * the figure or type — so it is always a real, clinically named place
 * ("Left forearm", "Lumbar spine"), never free text. Notes is the catch-all
 * until the per-family fields (cast material, drug injected…) land.
 */
export function InterventionInspector({ label, initialSite = "", onConfirm, onCancel }: Props) {
    const [site, setSite] = useState<SiteRef | null>(() => siteFromLabel(initialSite));
    // No separate Left/Right question: the site already carries its side
    // ("Right knee") wherever a side exists, and the spine has none.
    const side: InterventionSide | null = null;
    const [notes, setNotes] = useState("");
    const siteText = site ? clinicalSiteLabel(site) : "";

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
                if (tag === "TEXTAREA" || tag === "INPUT") return;
                e.preventDefault();
                onConfirm({ site: siteText, side, notes: notes.trim() });
            }
        };
        window.addEventListener("keydown", onKey, true);
        return () => window.removeEventListener("keydown", onKey, true);
    }, [onCancel, onConfirm, siteText, side, notes]);

    return (
        <div className="cs-addmed" role="dialog" aria-modal="true" aria-label={`Record ${label}`}>
            <button className="cs-addmed-scrim" type="button" onClick={onCancel} aria-label="Close" />
            <div className="cs-addmed-panel cs-addmed-inspector cs-addmed-anat" ref={panelRef} tabIndex={-1}>
                <div className="cs-addmed-topstripe" />

                <div className="cs-addmed-head">
                    <span className="cs-glyph is-teal"><FlaskConical size={16} /></span>
                    <div className="cs-addmed-title">
                        <span className="cs-addmed-eyebrow">Record intervention</span>
                        <strong>{label}</strong>
                    </div>
                    <button className="cs-addmed-x" type="button" onClick={onCancel} aria-label="Cancel">
                        <X size={16} />
                    </button>
                </div>

                <div className="cs-addmed-body">
                    <div className="cs-anat-layout">
                        <AnatomyFigure value={site} onChange={setSite} />
                        <div className="cs-anat-side">
                            <section className="cs-addmed-sec">
                                <span className="cs-addmed-label">Site</span>
                                <SiteField value={site} onChange={setSite} />
                            </section>

                            <section className="cs-addmed-sec">
                                <span className="cs-addmed-label">Notes</span>
                                <textarea
                                    className="cs-addmed-input cs-addmed-textarea"
                                    value={notes}
                                    placeholder="Plaster type, drug injected, anything else…"
                                    rows={3}
                                    onChange={(e) => setNotes(e.target.value)}
                                />
                            </section>
                        </div>
                    </div>
                </div>

                <div className="cs-addmed-foot">
                    <button className="cs-addmed-cancel" type="button" onClick={onCancel}>
                        Cancel
                    </button>
                    <button
                        className="cs-addmed-confirm"
                        type="button"
                        onClick={() => onConfirm({ site: siteText, side, notes: notes.trim() })}
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
