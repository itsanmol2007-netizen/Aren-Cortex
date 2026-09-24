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

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { MapPin, X } from "lucide-react";
import { BODY_ZONES, FIGURE_VIEWBOX } from "../../lib/body/anatomy";
import type { BodyAspect, BodyRegion } from "../../lib/body/anatomy";
import {
    CLINICAL_SITE_OPTIONS, clinicalSiteLabel, normalizeSite, regionName, sameSite, type SiteRef, type SiteSide,
} from "../../lib/body/clinicalSite";
import { Segmented } from "./DetailInput";

interface FigureProps {
    value: SiteRef | null;
    onChange: (site: SiteRef | null) => void;
    /** sites already established in this visit — drawn teal */
    known?: SiteRef[];
    /** when set, zones it rejects are dimmed and not clickable (e.g. knee-only) */
    allowed?: (site: SiteRef) => boolean;
    disabled?: boolean;
    /** show only these regions, zoomed — the region is known, the exact
     *  place is not ("USG Doppler (Lower Limb)") */
    zoomTo?: BodyRegion[];
}

export function AnatomyFigure({ value, onChange, known = [], allowed, disabled = false, zoomTo }: FigureProps) {
    const [aspect, setAspect] = useState<BodyAspect>(value?.aspect ?? "front");
    const svgRef = useRef<SVGSVGElement>(null);
    const [viewBox, setViewBox] = useState(FIGURE_VIEWBOX);

    // Zoom: frame the zones of the known region, measured from the drawing
    // itself so it never drifts from the geometry in anatomy.ts.
    useLayoutEffect(() => {
        if (!zoomTo?.length || !svgRef.current) { setViewBox(FIGURE_VIEWBOX); return; }
        const paths = Array.from(svgRef.current.querySelectorAll<SVGPathElement>("path[data-region]"))
            .filter((p) => zoomTo.includes(p.dataset.region as BodyRegion));
        if (!paths.length) return;
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (const p of paths) {
            const b = p.getBBox();
            x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y);
            x1 = Math.max(x1, b.x + b.width); y1 = Math.max(y1, b.y + b.height);
        }
        const pad = 14;
        setViewBox(`${x0 - pad} ${y0 - pad} ${x1 - x0 + pad * 2} ${y1 - y0 + pad * 2}`);
    }, [zoomTo?.join(","), aspect]);

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

            <svg
                ref={svgRef}
                viewBox={viewBox}
                className={`cs-body-svg${zoomTo?.length ? " is-zoomed" : ""}`}
                role="img"
                aria-label="Body map — click to choose the site"
            >
                {BODY_ZONES.map((z) => {
                    const site = normalizeSite({ region: z.region, side: z.side, aspect });
                    if (zoomTo?.length && !zoomTo.includes(z.region)) return null;
                    const ok = !allowed || allowed(site);
                    // "Both" lights up the joint on both sides.
                    const isSel = sameSite(site, value)
                        || (value?.side === "both" && value.region === site.region && site.side !== null);
                    const isKnown = known.some((k) => sameSite(k, site));
                    return (
                        <path
                            key={z.key}
                            d={z.path}
                            data-region={z.region}
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

    // The chosen site is already the pill above; offering it again as a
    // chip is noise.
    const chipChoices = askWhich ? knownChoices : knownChoices.filter((k) => !sameSite(k, value));
    const knownBlock = chipChoices.length > 0 && (
        <div className={`cs-anat-known${askWhich ? " is-ask" : ""}`}>
            <span>{askWhich ? "Which site?" : "In this visit"}</span>
            {chipChoices.map((k) => (
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

// ── Choosing the smallest site control for what is already known ───────────
//
//   nothing known         → the full body map        (Fracture)
//   a region, not a joint → the map, zoomed to it     (USG Doppler, lower limb)
//   the joint             → "Knee  [Left | Right]"    (Meniscal injury)
//   the spine             → [Cervical | Thoracic | Lumbar]
//
// And once a site is already established (pre-filled from the visit), the
// map starts folded away behind "Change site": the doctor confirms, not
// re-points.

export type SiteMode = "full" | "zoom" | "joint" | "spine";

export function siteModeFor(regions?: BodyRegion[], spineOnly?: boolean): SiteMode {
    if (spineOnly) return "spine";
    if (!regions?.length) return "full";
    return regions.length <= 3 ? "joint" : "zoom";
}

const SPINE: { region: BodyRegion; label: string }[] = [
    { region: "neck", label: "Cervical" },
    { region: "torso_upper", label: "Thoracic" },
    { region: "torso_lower", label: "Lumbar" },
];

/** A decorative line-art joint for the joint selector — never a control. */
export function JointArt({ className }: { className?: string }) {
    return (
        <svg viewBox="0 0 64 64" className={`cs-joint-art${className ? ` ${className}` : ""}`} aria-hidden="true" focusable="false">
            <path d="M24 4 C23 14 22 20 20 26 C18 31 22 34 32 34 C42 34 46 31 44 26 C42 20 41 14 40 4" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <ellipse cx="32" cy="27" rx="5.5" ry="6.5" fill="none" strokeWidth="1.6" opacity="0.55" />
            <path d="M19 39 C22 37 42 37 45 39 C44 44 42 48 41 60 M19 39 C20 44 22 48 23 60" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M26 36.2 L38 36.2" strokeWidth="1.2" strokeDasharray="2 2.5" opacity="0.6" />
        </svg>
    );
}

/** The joint is known: which one (when a name spans two) and which side. */
export function JointSite({
    regions, value, onChange, bilateral = false,
}: {
    regions: BodyRegion[];
    value: SiteRef | null;
    onChange: (site: SiteRef | null) => void;
    bilateral?: boolean;
}) {
    const region = value && regions.includes(value.region) ? value.region : regions[0];
    const side = value && regions.includes(value.region) ? value.side : null;
    const set = (r: BodyRegion, sd: SiteSide | null) =>
        onChange(sd ? { region: r, side: sd, aspect: "front" } : null);
    const title = regions.map((r) => regionName(r)).join(" / ");
    return (
        <div className="cs-joint">
            <JointArt />
            <div className="cs-joint-main">
                <strong className="cs-joint-name">{regions.length > 1 && side ? regionName(region) : title}</strong>
                {regions.length > 1 && (
                    <Segmented
                        label="Where"
                        options={regions.map((r) => ({ value: r, label: regionName(r) }))}
                        value={region}
                        onChange={(r) => set((r as BodyRegion) ?? regions[0], side ?? null)}
                    />
                )}
                <Segmented
                    label="Side"
                    options={[
                        { value: "left", label: "Left" },
                        { value: "right", label: "Right" },
                        ...(bilateral ? [{ value: "both", label: "Both" }] : []),
                    ]}
                    value={side ?? undefined}
                    onChange={(sd) => set(region, (sd as SiteSide | undefined) ?? null)}
                />
            </div>
        </div>
    );
}

/** The spine: a level, never a side. */
export function SpineSite({ value, onChange }: { value: SiteRef | null; onChange: (s: SiteRef | null) => void }) {
    const cur = value ? SPINE.find((x) => x.region === value.region)?.region : undefined;
    return (
        <Segmented
            label="Spine level"
            options={SPINE.map((x) => ({ value: x.region, label: x.label }))}
            value={cur}
            onChange={(r) => onChange(r ? { region: r as BodyRegion, side: null, aspect: "back" } : null)}
        />
    );
}

/**
 * The site area of a modal, sized to what is known, with the rest of the
 * modal's fields (`children`) beside or below it. Controlled `showMap` so
 * the modal can narrow its own panel when there is no figure to show.
 */
export function SiteLayout({
    mode, regions, bilateral, value, onChange, known = [], allowed, showMap, onShowMap, children,
}: {
    mode: SiteMode;
    regions?: BodyRegion[];
    bilateral?: boolean;
    value: SiteRef | null;
    onChange: (site: SiteRef | null) => void;
    known?: SiteRef[];
    allowed?: (site: SiteRef) => boolean;
    /** full/zoom only: whether the figure is out (folded when pre-filled) */
    showMap: boolean;
    onShowMap: () => void;
    children?: ReactNode;
}) {
    const knownFit = known.filter((k) => !allowed || allowed(k));
    if (mode === "joint" || mode === "spine") {
        return (
            <div className="cs-anat-single">
                <section className="cs-addmed-sec">
                    <span className="cs-addmed-label">Site</span>
                    {mode === "joint"
                        ? <JointSite regions={regions ?? []} value={value} onChange={onChange} bilateral={bilateral} />
                        : <SpineSite value={value} onChange={onChange} />}
                </section>
                {children}
            </div>
        );
    }
    if (!showMap) {
        return (
            <div className="cs-anat-single">
                <section className="cs-addmed-sec">
                    <span className="cs-addmed-label">Site</span>
                    <SiteField value={value} onChange={onChange} known={knownFit} allowed={allowed} />
                    <button type="button" className="cs-anat-showmap" onClick={onShowMap}>
                        <MapPin size={12} aria-hidden="true" /> {value ? "Change on the body map" : "Show the body map"}
                    </button>
                </section>
                {children}
            </div>
        );
    }
    return (
        <div className="cs-anat-layout">
            <AnatomyFigure
                value={value} onChange={onChange} known={known} allowed={allowed}
                zoomTo={mode === "zoom" ? regions : undefined}
            />
            <div className="cs-anat-side">
                <section className="cs-addmed-sec">
                    <span className="cs-addmed-label">Site</span>
                    <SiteField value={value} onChange={onChange} known={knownFit} allowed={allowed} />
                </section>
                {children}
            </div>
        </div>
    );
}
