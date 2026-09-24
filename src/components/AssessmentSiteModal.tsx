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
import { AnatomyFigure, SiteField } from "../features/consult/AnatomyPicker";
import {
    composeAssessmentText, familyFor, imagingFamilyFor, optionsOf, pruneDetails, siteAllowed, visibleFields,
    type AssessmentDetails, type DetailField,
} from "../features/consult/assessmentFamilies";
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
    const [showDetails, setShowDetails] = useState(Object.keys(initialDetails).length > 0);

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
            if (e.key === "Enter") {
                const tag = (e.target as HTMLElement).tagName;
                if (tag === "TEXTAREA" || tag === "INPUT") return;
                e.preventDefault();
                confirm();
            }
        };
        window.addEventListener("keydown", onKey, true);
        return () => window.removeEventListener("keydown", onKey, true);
    });

    if (!family) return null;
    const fields = visibleFields(family, clean);
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
            <div className={`cs-addmed-panel cs-addmed-anat cs-site-modal${imaging ? "" : " cs-dx-modal"}`} ref={panelRef} tabIndex={-1}>
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
                    <div className="cs-anat-layout">
                        <AnatomyFigure value={site} onChange={setSite} known={knownSites} allowed={allowed} />
                        <div className="cs-anat-side">
                            <section className="cs-addmed-sec">
                                <span className="cs-addmed-label">Site</span>
                                <SiteField value={site} onChange={setSite} known={knownSites} allowed={allowed} />
                            </section>

                            {family.fields.length > 0 && (
                                showDetails ? (
                                    <section className="cs-addmed-sec cs-dx-details">
                                        <span className="cs-addmed-label">Details <em>optional</em></span>
                                        {fields.map((f) => (
                                            <DetailInput
                                                key={f.key}
                                                field={f}
                                                site={site}
                                                value={clean[f.key]}
                                                onChange={(v) => set(f.key, v)}
                                            />
                                        ))}
                                    </section>
                                ) : (
                                    <button type="button" className="cs-dx-adddetails" onClick={() => setShowDetails(true)}>
                                        <Plus size={14} /> Add details
                                    </button>
                                )
                            )}
                        </div>
                    </div>
                </div>

                <div className="cs-dx-preview" aria-live="polite">
                    <span>Will read</span>
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

function DetailInput({
    field, site, value, onChange,
}: {
    field: DetailField;
    site: SiteRef | null;
    value: string | boolean | undefined;
    onChange: (v: string | boolean | undefined) => void;
}) {
    if (field.kind === "flag") {
        return (
            <div className="cs-dx-field">
                <button
                    type="button"
                    className={`cs-dx-chip is-flag${value ? " is-on" : ""}`}
                    aria-pressed={!!value}
                    onClick={() => onChange(!value)}
                >
                    {value && <Check size={12} />}
                    {field.label}
                </button>
            </div>
        );
    }

    if (field.kind === "choice") {
        const opts = optionsOf(field, site);
        return (
            <div className="cs-dx-field">
                <span className="cs-dx-fieldlabel">{field.label}</span>
                <div className="cs-dx-chips" role="radiogroup" aria-label={field.label}>
                    {opts.map((o) => (
                        <button
                            key={o}
                            type="button"
                            role="radio"
                            aria-checked={value === o}
                            className={`cs-dx-chip${value === o ? " is-on" : ""}`}
                            // Picking the chosen one again clears it — every
                            // detail stays optional.
                            onClick={() => onChange(value === o ? undefined : o)}
                        >
                            {o}
                        </button>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <label className="cs-dx-field">
            <span className="cs-dx-fieldlabel">{field.label}</span>
            <span className="cs-dx-inputrow">
                <input
                    className={`cs-anat-input${field.kind === "number" ? " is-num" : ""}`}
                    value={typeof value === "string" ? value : ""}
                    inputMode={field.kind === "number" ? "decimal" : undefined}
                    placeholder={field.kind === "text" ? field.placeholder : "—"}
                    onChange={(e) => {
                        const v = field.kind === "number" ? e.target.value.replace(/[^0-9.]/g, "") : e.target.value;
                        onChange(v);
                    }}
                />
                {field.kind === "number" && <em>{field.unit}</em>}
            </span>
        </label>
    );
}
