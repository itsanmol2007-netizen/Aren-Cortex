import { Check, FlaskConical, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { InterventionSide } from "../features/consult/interventionPlan";
import { EXAM_REGIONS } from "../features/consult/examination";
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
 * Every site name a doctor could mean, so typing is picking rather than
 * inventing — Anmol, live: "he's not going to invent a new body part name by
 * himself... show them the result, like simple dropdown search." Built from
 * the SAME catalogue the body map's own examination sections use
 * (`examination.ts`), not a second vocabulary invented for this field, so a
 * "Right knee" here is the same string a "Right knee" from the body map
 * would be. A typed value with no match still submits as-is — the doctrine
 * rule this whole app follows for a free-text fallback (docs/aren-modal-
 * design.md): never a dead end, just unranked.
 */
const SITE_OPTIONS: string[] = EXAM_REGIONS.flatMap((r) =>
    r.paired ? [`Left ${r.label}`, `Right ${r.label}`] : [r.label]
);

/**
 * The confirm step between "this intervention is ranked" and "this is on the
 * plan" — same slot in the flow as MedicineAddSheet, same shell
 * (`.cs-addmed-*`) and the same teal accent, not a colour of its own:
 * colour.md is explicit that there is no eighth colour, and teal's actual
 * meaning — "examined (by the doctor)" — fits a procedure the doctor
 * performs at least as well as it fits a prescription.
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
    const [siteOpen, setSiteOpen] = useState(false);
    // No separate Left/Right question: the site already carries its side
    // ("Right knee") wherever a side exists, and the spine has none.
    const side: InterventionSide | null = null;
    const [notes, setNotes] = useState("");
    const siteWrapRef = useRef<HTMLDivElement>(null);

    const siteMatches = useMemo(() => {
        const q = site.trim().toLowerCase();
        if (!q) return SITE_OPTIONS.slice(0, 6);
        return SITE_OPTIONS.filter((s) => s.toLowerCase().includes(q)).slice(0, 6);
    }, [site]);

    // Close the dropdown on an outside click — the same pattern the Goals
    // search and every other inline picker in this app already uses.
    useEffect(() => {
        if (!siteOpen) return;
        const away = (e: MouseEvent) => {
            if (siteWrapRef.current && !siteWrapRef.current.contains(e.target as Node)) setSiteOpen(false);
        };
        document.addEventListener("mousedown", away);
        return () => document.removeEventListener("mousedown", away);
    }, [siteOpen]);

    const panelRef = useRef<HTMLDivElement>(null);
    useOverlayFocus(panelRef, true);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                e.preventDefault();
                if (siteOpen) { setSiteOpen(false); return; }
                onCancel();
                return;
            }
            if (e.key === "Enter") {
                const tag = (e.target as HTMLElement).tagName;
                if (tag === "TEXTAREA" || siteOpen) return;
                e.preventDefault();
                onConfirm({ site: site.trim(), side, notes: notes.trim() });
            }
        };
        window.addEventListener("keydown", onKey, true);
        return () => window.removeEventListener("keydown", onKey, true);
    }, [onCancel, onConfirm, site, side, notes, siteOpen]);

    return (
        <div className="cs-addmed" role="dialog" aria-modal="true" aria-label={`Record ${label}`}>
            <button className="cs-addmed-scrim" type="button" onClick={onCancel} aria-label="Close" />
            <div className="cs-addmed-panel cs-addmed-inspector" ref={panelRef} tabIndex={-1}>
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
                    <section className="cs-addmed-sec">
                        <span className="cs-addmed-label">Site</span>
                        <div className="cs-addmed-sitewrap" ref={siteWrapRef}>
                            <input
                                className="cs-addmed-input"
                                value={site}
                                placeholder="e.g. Right knee"
                                onChange={(e) => { setSite(e.target.value); setSiteOpen(true); }}
                                onFocus={() => setSiteOpen(true)}
                                autoFocus
                            />
                            {siteOpen && siteMatches.length > 0 && (
                                <div className="cs-addmed-siteresults" role="listbox">
                                    {siteMatches.map((s) => (
                                        <button
                                            key={s}
                                            type="button"
                                            role="option"
                                            className="cs-addmed-siteresult"
                                            onClick={() => { setSite(s); setSiteOpen(false); }}
                                        >
                                            {s}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </section>

                    <section className="cs-addmed-sec">
                        <span className="cs-addmed-label">Notes</span>
                        <textarea
                            className="cs-addmed-input cs-addmed-textarea"
                            value={notes}
                            placeholder="Plaster type, drug injected, anything else…"
                            rows={2}
                            onChange={(e) => setNotes(e.target.value)}
                        />
                    </section>
                </div>

                <div className="cs-addmed-foot">
                    <button className="cs-addmed-cancel" type="button" onClick={onCancel}>
                        Cancel
                    </button>
                    <button
                        className="cs-addmed-confirm"
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
