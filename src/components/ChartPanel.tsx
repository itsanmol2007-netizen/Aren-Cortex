// ---------------------------------------------------------------------------
// CHART — what you know about this patient, in one panel.
//
// Spec: docs/aren-cortex-workspace-design.md §4.2–4.6.
//
// This replaces two panels that were the same panel twice: a symptom picker and
// a findings picker, each with its own search box, its own browse door and its
// own idea of what a chip looks like. A doctor examining a patient does not
// think "this belongs in panel two"; they think "crepitations". So there is one
// search here, it spans the entire catalogue, and the chip routes ITSELF to the
// right zone by `kind` — reported, examined, or patient context (which lands on
// the ContextBar above).
//
// The state contract is deliberately unchanged: App still owns
// `selectedSymptoms` / `selectedFindings` / `selectedSymptomsWithIntensity` as
// arrays of LABELS, so the engine input, the v1 compatibility write and the
// review modal all keep working without knowing this panel was rewritten.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronRight, Search, Stethoscope, X } from "lucide-react";
import type { Observable } from "../lib/db/synapse";
import type { SelectedSymptom } from "../types";
import { systemLabel, systemRank } from "../lib/synapse/systems";

/** Past this the result list stops being a list and becomes a wall. */
const MAX_RESULTS = 12;
/** Ghost suggestions shown before the "show more" door. */
const MAX_GHOSTS = 8;

type Zone = "reported" | "examined" | "context";

const ZONE_OF: Record<Observable["kind"], Zone> = {
    symptom: "reported",
    finding: "examined",
    history: "context",
};

const ZONE_TAG: Record<Zone, string> = {
    reported: "Reported",
    examined: "On exam",
    context: "Context",
};

/** Every character of `q`, in order, somewhere in `text`. Cheap typo tolerance. */
function isSubsequence(q: string, text: string): boolean {
    let i = 0;
    for (let j = 0; j < text.length && i < q.length; j++) {
        if (text[j] === q[i]) i++;
    }
    return i === q.length;
}

/**
 * How well one chip answers a query. Lower is better; 99 is no match.
 *
 * The tier order is the point: `search_text` carries the colloquial and Hindi
 * terms ("bukhar", "nazla"), and it MUST beat a slug match, or a doctor typing
 * what the patient actually said gets a worse answer than one typing English.
 */
function rankOf(o: Observable, q: string): number {
    const label = o.label.toLowerCase();
    if (label.startsWith(q)) return 0;
    if (label.includes(q)) return 1;
    if ((o.searchText ?? "").toLowerCase().includes(q)) return 2;
    if (o.slug.includes(q)) return 3;
    if (isSubsequence(q, label)) return 4;
    return 99;
}

interface Props {
    /** the whole catalogue */
    observables: Observable[];
    /** complaint chips — history is excluded; the ContextBar owns that */
    symptoms: string[];
    onSymptomsChange: (next: string[]) => void;
    findings: string[];
    onFindingsChange: (next: string[]) => void;
    /** patient context already on the chart, for the ✓ in search results */
    context: string[];
    /** history-kind picks route here and surface on the ContextBar */
    onToggleContext: (label: string) => void;
    intensities: SelectedSymptom[];
    onIntensitiesChange: (next: SelectedSymptom[]) => void;
    searchRef?: React.RefObject<HTMLInputElement>;
}

export function ChartPanel({
    observables, symptoms, onSymptomsChange, findings, onFindingsChange,
    context, onToggleContext, intensities, onIntensitiesChange, searchRef,
}: Props) {
    const [query, setQuery] = useState("");
    const [active, setActive] = useState(0);
    const [rect, setRect] = useState<DOMRect | null>(null);
    const [browseOpen, setBrowseOpen] = useState(false);
    const [browseQuery, setBrowseQuery] = useState("");
    const [allGhosts, setAllGhosts] = useState(false);

    const internalRef = useRef<HTMLInputElement>(null);
    const inputRef = (searchRef ?? internalRef) as React.RefObject<HTMLInputElement>;
    const boxRef = useRef<HTMLDivElement>(null);
    const browseSearchRef = useRef<HTMLInputElement>(null);

    const byLabel = useMemo(() => {
        const m = new Map<string, Observable>();
        for (const o of observables) m.set(o.label, o);
        return m;
    }, [observables]);

    const selectedSet = useMemo(
        () => new Set([...symptoms, ...findings, ...context]),
        [symptoms, findings, context]
    );

    // ── toggling, routed by kind ────────────────────────────────────────────
    const toggle = useCallback((o: Observable) => {
        if (o.kind === "history") { onToggleContext(o.label); return; }

        if (o.kind === "finding") {
            onFindingsChange(
                findings.includes(o.label)
                    ? findings.filter((f) => f !== o.label)
                    : [...findings, o.label]
            );
            return;
        }

        if (symptoms.includes(o.label)) {
            onSymptomsChange(symptoms.filter((s) => s !== o.label));
            onIntensitiesChange(intensities.filter((i) => i.name !== o.label));
        } else {
            onSymptomsChange([...symptoms, o.label]);
            onIntensitiesChange([...intensities, { name: o.label, intensity: "moderate" }]);
        }
    }, [symptoms, findings, intensities, onSymptomsChange, onFindingsChange,
        onIntensitiesChange, onToggleContext]);

    const setIntensity = useCallback((label: string, intensity: SelectedSymptom["intensity"]) => {
        onIntensitiesChange(
            intensities.some((i) => i.name === label)
                ? intensities.map((i) => (i.name === label ? { ...i, intensity } : i))
                : [...intensities, { name: label, intensity }]
        );
    }, [intensities, onIntensitiesChange]);

    // ── search ──────────────────────────────────────────────────────────────
    const results = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return [];
        return observables
            .map((o) => ({ o, r: rankOf(o, q) }))
            .filter((x) => x.r < 99)
            .sort((a, b) => a.r - b.r || a.o.label.localeCompare(b.o.label))
            .slice(0, MAX_RESULTS)
            .map((x) => x.o);
    }, [observables, query]);

    const open = results.length > 0 && query.trim().length > 0;

    useEffect(() => { setActive(0); }, [query]);

    const updateRect = useCallback(() => {
        if (boxRef.current) setRect(boxRef.current.getBoundingClientRect());
    }, []);

    useEffect(() => {
        if (!open) return;
        updateRect();
        window.addEventListener("resize", updateRect);
        window.addEventListener("scroll", updateRect, true);
        return () => {
            window.removeEventListener("resize", updateRect);
            window.removeEventListener("scroll", updateRect, true);
        };
    }, [open, updateRect]);

    const take = (o: Observable) => {
        toggle(o);
        setQuery("");
        inputRef.current?.focus();
    };

    const onSearchKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((i) => Math.min(i + 1, results.length - 1));
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
        } else if (e.key === "Enter") {
            e.preventDefault();
            const pick = results[active];
            if (pick) take(pick);
        } else if (e.key === "Escape") {
            e.preventDefault();
            setQuery("");
        }
    };

    // ── likely on exam (§4.4) ───────────────────────────────────────────────
    // Not a ranking and not the engine: the findings catalogue filtered to the
    // body systems already on the chart. A doctor who has typed "cough" should
    // not have to search to reach "Crepitations".
    const ghosts = useMemo(() => {
        if (symptoms.length === 0) return [];
        const systems = new Set<string>();
        for (const label of symptoms) {
            const o = byLabel.get(label);
            if (o) systems.add(o.system);
        }
        if (systems.size === 0) return [];
        return observables
            .filter((o) => o.kind === "finding" && systems.has(o.system) && !findings.includes(o.label))
            .sort((a, b) => systemRank(a.system) - systemRank(b.system) || a.label.localeCompare(b.label));
    }, [observables, symptoms, findings, byLabel]);

    const shownGhosts = allGhosts ? ghosts : ghosts.slice(0, MAX_GHOSTS);

    // ── browse-all sheet (§4.6) ─────────────────────────────────────────────
    const browseGroups = useMemo(() => {
        const q = browseQuery.trim().toLowerCase();
        const pool = q
            ? observables.filter((o) => rankOf(o, q) < 99)
            : observables;
        const buckets = new Map<string, Observable[]>();
        for (const o of pool) {
            const list = buckets.get(o.system);
            if (list) list.push(o);
            else buckets.set(o.system, [o]);
        }
        return [...buckets.entries()]
            .sort((a, b) => systemRank(a[0]) - systemRank(b[0]))
            .map(([system, items]) => ({
                system,
                label: systemLabel(system),
                items: items.sort((a, b) => a.label.localeCompare(b.label)),
            }));
    }, [observables, browseQuery]);

    useEffect(() => {
        if (!browseOpen) { setBrowseQuery(""); return; }
        const t = window.setTimeout(() => browseSearchRef.current?.focus(), 0);
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") { e.stopPropagation(); setBrowseOpen(false); }
        };
        document.addEventListener("keydown", onKey);
        return () => {
            window.clearTimeout(t);
            document.removeEventListener("keydown", onKey);
        };
    }, [browseOpen]);

    // ── chips ───────────────────────────────────────────────────────────────
    const chipKeys = (
        e: React.KeyboardEvent<HTMLSpanElement>,
        opts: { onRemove: () => void; onIntensity?: (i: SelectedSymptom["intensity"]) => void }
    ) => {
        const el = e.currentTarget;
        if (e.key === "Delete" || e.key === "Backspace") {
            e.preventDefault();
            opts.onRemove();
            return;
        }
        if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
            e.preventDefault();
            const zone = el.closest("[data-cx-zone]");
            if (!zone) return;
            const chips = [...zone.querySelectorAll<HTMLElement>("[data-cx-chip]")];
            const i = chips.indexOf(el);
            chips[e.key === "ArrowLeft" ? i - 1 : i + 1]?.focus();
            return;
        }
        if (opts.onIntensity && (e.key === "1" || e.key === "2" || e.key === "3")) {
            e.preventDefault();
            opts.onIntensity(e.key === "1" ? "mild" : e.key === "2" ? "moderate" : "severe");
        }
    };

    const renderChip = (
        label: string,
        tone: "reported" | "examined",
        intensity?: SelectedSymptom["intensity"]
    ) => {
        const o = byLabel.get(label);
        const remove = () => {
            if (o) toggle(o);
            else if (tone === "examined") onFindingsChange(findings.filter((f) => f !== label));
            else onSymptomsChange(symptoms.filter((s) => s !== label));
        };
        const cycle = () => {
            const next: SelectedSymptom["intensity"] =
                intensity === "mild" ? "moderate" : intensity === "moderate" ? "severe" : "mild";
            setIntensity(label, next);
        };

        return (
            <span
                key={label}
                className={`cx-chip cx-chip--${tone}`}
                data-cx-chip=""
                tabIndex={0}
                onKeyDown={(e) =>
                    chipKeys(e, {
                        onRemove: remove,
                        onIntensity: intensity ? (i) => setIntensity(label, i) : undefined,
                    })
                }
            >
                {intensity && (
                    <button
                        type="button"
                        className={`cx-dots is-${intensity}`}
                        onClick={cycle}
                        tabIndex={-1}
                        aria-label={`Severity: ${intensity}. Click to change, or press 1, 2 or 3.`}
                        title={`${intensity} — click to change (1 / 2 / 3)`}
                    >
                        <i /><i /><i />
                    </button>
                )}
                <span className="cx-chip-label">{label}</span>
                <button
                    type="button"
                    className="cx-x"
                    tabIndex={-1}
                    aria-label={`Remove ${label}`}
                    onClick={remove}
                >×</button>
            </span>
        );
    };

    const dropdown = open && rect ? createPortal(
        <div
            className="cx-chart-drop"
            style={{ top: rect.bottom + 5, left: rect.left, width: rect.width }}
            role="listbox"
        >
            {results.map((o, i) => {
                const on = selectedSet.has(o.label);
                return (
                    <button
                        key={o.id}
                        type="button"
                        role="option"
                        aria-selected={i === active}
                        className={`cx-drop-row${i === active ? " is-active" : ""}${on ? " is-on" : ""}`}
                        onMouseEnter={() => setActive(i)}
                        onClick={() => take(o)}
                    >
                        <span className="cx-drop-name">
                            {on && <span className="cx-drop-tick">✓</span>}
                            {o.label}
                        </span>
                        <span className="cx-drop-zone">{ZONE_TAG[ZONE_OF[o.kind]]}</span>
                    </button>
                );
            })}
        </div>,
        document.body
    ) : null;

    const browse = browseOpen ? createPortal(
        <div className="cx-browse" role="dialog" aria-label="Browse the catalogue">
            <div className="cx-browse-sheet">
                <div className="cx-browse-head">
                    <div className="cx-browse-search">
                        <Search size={15} />
                        <input
                            ref={browseSearchRef}
                            value={browseQuery}
                            placeholder={`Filter ${observables.length} entries…`}
                            onChange={(e) => setBrowseQuery(e.target.value)}
                            aria-label="Filter the catalogue"
                        />
                    </div>
                    <button
                        type="button"
                        className="cx-browse-close"
                        onClick={() => setBrowseOpen(false)}
                        aria-label="Close"
                    ><X size={16} /></button>
                </div>

                <div className="cx-browse-body">
                    {browseGroups.length === 0 ? (
                        <p className="cx-browse-empty">Nothing matches “{browseQuery.trim()}”</p>
                    ) : (
                        browseGroups.map((g) => (
                            <section key={g.system} className="cx-browse-group">
                                <h3 className="cx-browse-group-label">
                                    {g.label}
                                    <span>{g.items.length}</span>
                                </h3>
                                <div className="cx-browse-chips">
                                    {g.items.map((o) => {
                                        const on = selectedSet.has(o.label);
                                        return (
                                            <button
                                                key={o.id}
                                                type="button"
                                                className={`cx-browse-chip${on ? " is-on" : ""}`}
                                                onClick={() => toggle(o)}
                                            >
                                                {on && <span className="cx-drop-tick">✓</span>}
                                                {o.label}
                                            </button>
                                        );
                                    })}
                                </div>
                            </section>
                        ))
                    )}
                </div>

                <div className="cx-browse-foot">
                    Picks land in the right place on their own — reported, on exam,
                    or patient context. <kbd>Esc</kbd> to close.
                </div>
            </div>
        </div>,
        document.body
    ) : null;

    const onChart = symptoms.length + findings.length;

    return (
        <section className="cx-panel cx-chart-panel" aria-label="Chart">
            <div className="cx-chart-head">
                <div>
                    <h2 className="cx-chart-title">Chart</h2>
                    <p className="cx-chart-sub">what you observed</p>
                </div>
                {onChart > 0 && <span className="cx-chart-count">{onChart} on chart</span>}
            </div>

            <div ref={boxRef} className="cx-chart-search">
                <Search size={15} />
                <input
                    ref={inputRef}
                    value={query}
                    placeholder="Add anything — fever, बुखार, crepitations…"
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={onSearchKey}
                    aria-label="Search the catalogue"
                />
                {query && (
                    <button
                        type="button"
                        className="cx-chart-clear"
                        onClick={() => { setQuery(""); inputRef.current?.focus(); }}
                        aria-label="Clear"
                    >×</button>
                )}
            </div>

            <div className="cx-chart-body">
                <section className="cx-zone" data-cx-zone="reported" aria-label="Reported">
                    <div className="cx-zone-label">
                        Reported {symptoms.length > 0 && <span>{symptoms.length}</span>}
                    </div>
                    {symptoms.length === 0 ? (
                        <p className="cx-zone-hint">
                            What the patient came in with. Type above — Hindi works too.
                        </p>
                    ) : (
                        <div className="cx-chips">
                            {symptoms.map((label) =>
                                renderChip(
                                    label,
                                    "reported",
                                    intensities.find((i) => i.name === label)?.intensity ?? "moderate"
                                )
                            )}
                        </div>
                    )}
                </section>

                <section className="cx-zone" data-cx-zone="examined" aria-label="On examination">
                    <div className="cx-zone-label">
                        On examination {findings.length > 0 && <span>{findings.length}</span>}
                    </div>

                    {findings.length > 0 && (
                        <div className="cx-chips">
                            {findings.map((label) => renderChip(label, "examined"))}
                        </div>
                    )}

                    {ghosts.length > 0 ? (
                        /* A tray, visibly separate from the record above it.
                           These are offers, not findings — a doctor must never
                           have to look twice to tell what they actually
                           examined from what the software is proposing. */
                        <div className="cx-ghost-tray">
                            <div className="cx-ghost-label">
                                <Stethoscope size={10} />
                                Likely on exam — from the systems on this chart
                            </div>
                            <div className="cx-chips">
                                {shownGhosts.map((o) => (
                                    <button
                                        key={o.id}
                                        type="button"
                                        className="cx-ghost"
                                        onClick={() => toggle(o)}
                                        title={`Record ${o.label}`}
                                    >
                                        <span className="cx-ghost-plus">+</span>
                                        {o.label}
                                    </button>
                                ))}
                                {ghosts.length > MAX_GHOSTS && (
                                    <button
                                        type="button"
                                        className="cx-ghost is-more"
                                        onClick={() => setAllGhosts((v) => !v)}
                                    >
                                        {allGhosts ? "Show fewer" : `${ghosts.length - MAX_GHOSTS} more`}
                                    </button>
                                )}
                            </div>
                        </div>
                    ) : findings.length === 0 ? (
                        <p className="cx-zone-hint">
                            Findings appear here once there is a symptom — or search for
                            one any time.
                        </p>
                    ) : null}
                </section>
            </div>

            <button
                type="button"
                className="cx-browse-door"
                onClick={() => setBrowseOpen(true)}
            >
                Browse all {observables.length}
                <ChevronRight size={13} />
            </button>

            {dropdown}
            {browse}
        </section>
    );
}
