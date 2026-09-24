// ---------------------------------------------------------------------------
// ANATOMY PICKER — the shared "where on the patient" control.
//
// One figure, used by every surface that needs a site attached to a clinical
// item: an assessment ("Fracture — Left knee"), an intervention ("Cast —
// Left forearm"). Same drawing, same classes as the Joint Map
// (`lib/body/anatomy.ts` geometry, `.cs-body*` styling) so it looks like the
// body map the doctor already knows, not a second one.
//
// Two ways in, one value out:
//   • click a zone on the figure, or
//   • type in the site field ("left wr…") and pick from the list.
// Both produce the same `SiteRef`, named by `clinicalSiteLabel`.
//
// Known sites from earlier in the visit are drawn teal and offered as
// one-click chips, so a second item at the same place never makes the doctor
// point at the body again.
// ---------------------------------------------------------------------------

import { useEffect, useMemo, useRef, useState } from "react";
import { MapPin, X } from "lucide-react";
import { BODY_ZONES, FIGURE_VIEWBOX } from "../../lib/body/anatomy";
import type { BodyAspect } from "../../lib/body/anatomy";
import {
    CLINICAL_SITE_OPTIONS, clinicalSiteLabel, normalizeSite, sameSite, type SiteRef,
} from "../../lib/body/clinicalSite";

interface FigureProps {
    value: SiteRef | null;
    onChange: (site: SiteRef | null) => void;
    /** sites already established in this visit — drawn teal */
    known?: SiteRef[];
    /** when set, zones it rejects are dimmed and not clickable (e.g. knee-only) */
    allowed?: (site: SiteRef) => boolean;
    disabled?: boolean;
}

export function AnatomyFigure({ value, onChange, known = [], allowed, disabled = false }: FigureProps) {
    const [aspect, setAspect] = useState<BodyAspect>(value?.aspect ?? "front");

    // A site typed into the field ("Lumbar spine") lives on the back view —
    // turn the figure round so the doctor sees where it landed.
    useEffect(() => {
        if (value) setAspect(value.aspect);
    }, [value?.aspect, value?.region, value?.side]);

    return (
        <div className={`cs-body cs-anat-figure${disabled ? " is-disabled" : ""}`}>
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

            <svg viewBox={FIGURE_VIEWBOX} className="cs-body-svg" role="img" aria-label="Body map — click to choose the site">
                {BODY_ZONES.map((z) => {
                    const site = normalizeSite({ region: z.region, side: z.side, aspect });
                    const ok = !allowed || allowed(site);
                    const isSel = sameSite(site, value);
                    const isKnown = known.some((k) => sameSite(k, site));
                    return (
                        <path
                            key={z.key}
                            d={z.path}
                            className={
                                "cs-body-zone" +
                                (isKnown ? " is-marked" : "") +
                                (isSel ? " is-sel" : "") +
                                (ok ? "" : " is-off")
                            }
                            onClick={() => {
                                if (disabled || !ok) return;
                                onChange(isSel ? null : site);
                            }}
                        >
                            <title>{clinicalSiteLabel(site)}</title>
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
    );
}

interface FieldProps {
    value: SiteRef | null;
    onChange: (site: SiteRef | null) => void;
    known?: SiteRef[];
    allowed?: (site: SiteRef) => boolean;
    disabled?: boolean;
}

/**
 * The typed half of the picker, plus the known-site chips. Selected site
 * shows as a filled pill; typing replaces it.
 */
export function SiteField({ value, onChange, known = [], allowed, disabled = false }: FieldProps) {
    const [query, setQuery] = useState("");
    const [open, setOpen] = useState(false);
    const [active, setActive] = useState(0);
    const wrapRef = useRef<HTMLDivElement>(null);

    const options = useMemo(() => {
        const q = query.trim().toLowerCase();
        const pool = CLINICAL_SITE_OPTIONS.filter((o) => !allowed || allowed(o.site));
        if (!q) return [];
        // Starts-with first ("kn" → Knee before Unknown), then contains.
        const starts = pool.filter((o) => o.label.toLowerCase().split(" ").some((w) => w.startsWith(q)));
        const rest = pool.filter((o) => !starts.includes(o) && o.label.toLowerCase().includes(q));
        return [...starts, ...rest].slice(0, 7);
    }, [query, allowed]);

    useEffect(() => { setActive(0); }, [query]);

    useEffect(() => {
        if (!open) return;
        const away = (e: MouseEvent) => {
            if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener("mousedown", away);
        return () => document.removeEventListener("mousedown", away);
    }, [open]);

    const pick = (site: SiteRef) => {
        onChange(site);
        setQuery("");
        setOpen(false);
    };

    const knownChoices = known.filter((k) => !allowed || allowed(k));
    // Two or more places already in this visit and none chosen: the question
    // is "which of these?", so they lead, above the search.
    const askWhich = !value && knownChoices.length >= 2;

    const knownBlock = knownChoices.length > 0 && (
        <div className={`cs-anat-known${askWhich ? " is-ask" : ""}`}>
            <span>{askWhich ? "Which site?" : "In this visit"}</span>
            {knownChoices.map((k) => (
                <button
                    key={clinicalSiteLabel(k)}
                    type="button"
                    className={`cs-anat-knownchip${sameSite(k, value) ? " is-on" : ""}`}
                    disabled={disabled}
                    onClick={() => onChange(k)}
                >
                    {clinicalSiteLabel(k)}
                </button>
            ))}
        </div>
    );

    return (
        <div className="cs-anat-field" ref={wrapRef}>
            {askWhich && knownBlock}
            {value ? (
                <div className="cs-anat-selected">
                    <MapPin size={14} aria-hidden="true" />
                    <span>{clinicalSiteLabel(value)}</span>
                    {!disabled && (
                        <button type="button" onClick={() => onChange(null)} aria-label="Clear site" title="Change site">
                            <X size={13} />
                        </button>
                    )}
                </div>
            ) : (
                <div className="cs-anat-search">
                    <input
                        className="cs-anat-input"
                        value={query}
                        disabled={disabled}
                        placeholder={askWhich ? "Or another site — click the body, or type…" : "Click the body, or type a site…"}
                        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
                        onFocus={() => setOpen(true)}
                        onKeyDown={(e) => {
                            if (!options.length) return;
                            if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(i + 1, options.length - 1)); }
                            else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
                            else if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); pick(options[active].site); }
                        }}
                    />
                    {open && options.length > 0 && (
                        <div className="cs-anat-results" role="listbox">
                            {options.map((o, i) => (
                                <button
                                    key={o.label}
                                    type="button"
                                    role="option"
                                    aria-selected={i === active}
                                    className={`cs-anat-result${i === active ? " is-active" : ""}`}
                                    onMouseEnter={() => setActive(i)}
                                    onClick={() => pick(o.site)}
                                >
                                    {o.label}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}
            {!askWhich && knownBlock}
        </div>
    );
}
