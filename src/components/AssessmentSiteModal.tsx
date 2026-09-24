// ---------------------------------------------------------------------------
// ASSESSMENT SITE MODAL — "where, and what else" for an assessment that
// happens somewhere on the body.
//
// Body map on the left, the chosen site on the right, then "+ Add details"
// with the fields that family offers (assessmentFamilies.ts). Only the site
// is asked for; every detail is optional and folded away until wanted.
// A live preview shows the exact line that will print.
//
// Violet, the Assessment card's own colour, on the shared `.cs-addmed`
// shell. Deliberately does NOT close on a click outside: a half-chosen
// fracture lost to a stray click is worse than one extra press of Cancel.
// ---------------------------------------------------------------------------

import { Check, FlaskConical, Plus, Stethoscope, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { SiteLayout, siteModeFor } from "../features/consult/AnatomyPicker";
import {
    composeAssessmentText, familyFor, imagingFamilyFor, pruneDetails, siteAllowed, visibleFields,
    type AssessmentDetails,
} from "../features/consult/assessmentFamilies";
import { DetailInput } from "../features/consult/DetailInput";
import type { SiteRef } from "../lib/body/clinicalSite";
import { useOverlayFocus } from "../hooks/useOverlayFocus";

type Props = {
    label: string;
    /** an assessment (violet, "Fracture") or an imaging order (teal, "X-Ray Knee") */
    kind?: "assessment" | "imaging";
    editing: boolean;
    /**
     * Take the visit's one known site without asking (Phase 3 site context).
     * Off for an edit and for "+ Another site", where the known site is by
     * definition not the one being asked about.
     */
    autoPrefill?: boolean;
    initialSite: SiteRef | null;
    initialDetails: AssessmentDetails;
    /** sites already established in this visit — offered as one-click chips */
    knownSites?: SiteRef[];
    onConfirm: (draft: { site: SiteRef | null; details: AssessmentDetails }) => void;
    onCancel: () => void;
};

export function AssessmentSiteModal({
    label, kind = "assessment", editing, autoPrefill = false, initialSite, initialDetails, knownSites = [],
    onConfirm, onCancel,
}: Props) {
    const imaging = kind === "imaging";
    const family = useMemo(() => (imaging ? imagingFamilyFor(label) : familyFor(label)), [label, imaging]);
    // Site context: one known place that this item can sit on is taken as
    // the answer; two or more become a "Which site?" choice (SiteField);
    // none leaves the body map. Always changeable — never locked.
    const [site, setSite] = useState<SiteRef | null>(() => {
        if (initialSite) return initialSite;
        if (!autoPrefill || !family) return null;
        const fits = knownSites.filter((k) => siteAllowed(family, k));
        return fits.length === 1 ? fits[0] : null;
    });
    const [details, setDetails] = useState<AssessmentDetails>(initialDetails);
    const mainKeys = new Set(family?.main ?? family?.fields.map((f) => f.key) ?? []);
    // Rare details stay folded unless an edit already carries one.
    const [showMore, setShowMore] = useState(Object.keys(initialDetails).some((k) => !mainKeys.has(k)));
    const mode = siteModeFor(family?.regions, family?.spineOnly);
    // The map is only for finding a place; a place already known (pre-filled
    // or being edited) starts folded behind "Change".
    const [showMap, setShowMap] = useState(() => site === null);

    const allowed = useMemo(
        () => (family ? (s: SiteRef) => siteAllowed(family, s) : undefined),
        [family],
    );

    // Anything the new site no longer allows goes (a knee ligament does not
    // survive the site moving to the ankle).
    const clean = family ? pruneDetails(family, site, details) : details;
    const preview = family ? composeAssessmentText(label, family, site, clean) : label;

    const confirm = () => onConfirm({ site, details: clean });

    const panelRef = useRef<HTMLDivElement>(null);
    useOverlayFocus(panelRef, true);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                e.preventDefault();
                onCancel();
                return;
            }
            if ((e.target as HTMLElement).closest?.("[data-popover-open]")) return;
            if (e.key === "Enter") {
                const tag = (e.target as HTMLElement).tagName;
                if (tag === "TEXTAREA" || tag === "INPUT" || tag === "BUTTON") return;
                e.preventDefault();
                confirm();
            }
        };
        window.addEventListener("keydown", onKey, true);
        return () => window.removeEventListener("keydown", onKey, true);
    });

    if (!family) return null;
    const fields = visibleFields(family, clean, site);
    const mainFields = fields.filter((f) => mainKeys.has(f.key));
    const moreFields = fields.filter((f) => !mainKeys.has(f.key));
    const wide = (mode === "full" || mode === "zoom") && showMap;
    const set = (key: string, v: string | boolean | undefined) =>
        setDetails((d) => {
            const next = { ...d };
            if (v === undefined || v === "" || v === false) delete next[key];
            else next[key] = v;
            return next;
        });

    return (
        <div className="cs-addmed" role="dialog" aria-modal="true" aria-label={`${label} — site and details`}>
            {/* Not a button: a click outside does nothing, on purpose. */}
            <div className="cs-addmed-scrim" aria-hidden="true" />
            <div className={`cs-addmed-panel cs-addmed-anat cs-site-modal${wide ? "" : " is-compact"}${imaging ? "" : " cs-dx-modal"}`} ref={panelRef} tabIndex={-1}>
                <div className={`cs-addmed-topstripe${imaging ? "" : " cs-dx-modal-stripe"}`} />

                <div className="cs-addmed-head">
                    {imaging
                        ? <span className="cs-glyph is-teal"><FlaskConical size={16} /></span>
                        : <span className="cs-glyph is-violet"><Stethoscope size={16} /></span>}
                    <div className="cs-addmed-title">
                        <span className={`cs-addmed-eyebrow${imaging ? "" : " cs-dx-modal-eyebrow"}`}>
                            {imaging ? "Order investigation" : editing ? "Edit assessment" : "Confirm assessment"}
                        </span>
                        <strong>{label}</strong>
                    </div>
                    <button className="cs-addmed-x" type="button" onClick={onCancel} aria-label="Cancel">
                        <X size={16} />
                    </button>
                </div>

                <div className="cs-addmed-body">
                    <SiteLayout
                        mode={mode}
                        regions={family.regions}
                        bilateral={family.bilateral}
                        value={site}
                        onChange={setSite}
                        known={knownSites}
                        allowed={allowed}
                        showMap={showMap}
                        onShowMap={() => setShowMap(true)}
                    >
                        {mainFields.length > 0 && (
                            <section className="cs-addmed-sec cs-dx-details">
                                <span className="cs-dx-sechead">
                                    Details <em>Optional</em>
                                </span>
                                {mainFields.map((f) => (
                                    <DetailInput key={f.key} field={f} site={site} value={clean[f.key]} onChange={(v) => set(f.key, v)} />
                                ))}
                            </section>
                        )}
                        {moreFields.length > 0 && (showMore ? (
                            <section className="cs-addmed-sec cs-dx-details">
                                {moreFields.map((f) => (
                                    <DetailInput key={f.key} field={f} site={site} value={clean[f.key]} onChange={(v) => set(f.key, v)} />
                                ))}
                            </section>
                        ) : (
                            <button type="button" className="cs-dx-adddetails" onClick={() => setShowMore(true)}>
                                <Plus size={14} /> More details
                            </button>
                        ))}
                    </SiteLayout>
                </div>

                <div className="cs-dx-preview" aria-live="polite">
                    <span>Will record</span>
                    <b>{preview}</b>
                </div>

                <div className="cs-addmed-foot">
                    <button className="cs-addmed-cancel" type="button" onClick={onCancel}>
                        Cancel
                    </button>
                    <button className={`cs-addmed-confirm${imaging ? "" : " cs-dx-modal-confirm"}`} type="button" onClick={confirm}>
                        <Check size={15} />
                        {imaging ? "Order" : editing ? "Save" : "Done"}
                        <span className="cs-kbd">Enter</span>
                    </button>
                </div>
            </div>
        </div>
    );
}
