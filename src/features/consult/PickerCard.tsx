// ---------------------------------------------------------------------------
// PICKER — History / Context, Symptoms, Findings.
//
// Three cards, one purpose each. They are separate rather than merged because
// the doctor's own sequence is separate: context is set once from the record,
// complaints are taken from the patient, findings come from the examination.
// The philosophy doc's "One Primary Action" rule is what this shape is.
//
// One component, three instances. What differs between them is a `kind` and a
// colour — never a layout — so a change to how a chip is added lands in all
// three at once and cannot half-apply.
//
// The catalogue is `observables`, split by `kind`. Search reads `search_text`
// as well as the label, so a doctor typing what the patient actually said
// ("bukhar", "बुखार") gets the same answer as one typing English.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Plus, Search } from "lucide-react";
import type { Observable } from "../../lib/db/synapse";
import type { SelectedSymptom } from "../../types";

export type PickerKind = "history" | "symptom" | "finding";

const TONE: Record<PickerKind, string> = {
    history: "history",
    symptom: "symptom",
    finding: "finding",
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
 * terms, and it MUST beat a slug match, or a doctor typing what the patient
 * said gets a worse answer than one typing English.
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

const MAX_RESULTS = 10;

interface Props {
    kind: PickerKind;
    title: string;
    /** the small parenthetical after the title, as the mock has on Findings */
    note?: string;
    glyph: React.ReactNode;
    glyphTone: "blue" | "rose" | "teal";
    placeholder: string;
    /** the whole catalogue — this card reads its own `kind` out of it */
    observables: Observable[];
    /** labels currently selected in THIS card */
    selected: string[];
    onToggle: (label: string) => void;
    /** every label on the chart, so a result already taken shows a tick */
    onChart: Set<string>;
    /** symptoms only: severity, cycled on the chip */
    intensities?: SelectedSymptom[];
    onIntensityChange?: (label: string, intensity: SelectedSymptom["intensity"]) => void;
    /** opens the browse-everything sheet */
    onBrowse: () => void;
    emptyHint: string;
    /**
     * Findings only: what the chart says is worth EXAMINING FOR, ranked.
     *
     * This is the output of `examSuggestions.ts` — the same additive scoring
     * as the main engine, pointed at observables instead of intents. It is a
     * prompt to look, never a claim that the sign is present: ticking one is
     * a new observation that re-runs the whole engine, which is the cascade
     * symptoms -> examine -> confirm -> conditions -> treatment.
     */
    suggestions?: string[];
    disabled?: boolean;
    searchRef?: React.RefObject<HTMLInputElement>;
}

export function PickerCard({
    kind, title, note, glyph, glyphTone, placeholder, observables, selected,
    onToggle, onChart, intensities, onIntensityChange, onBrowse, emptyHint,
    suggestions = [], disabled = false, searchRef,
}: Props) {
    const [query, setQuery] = useState("");
    const [active, setActive] = useState(0);
    const [rect, setRect] = useState<DOMRect | null>(null);

    const internalRef = useRef<HTMLInputElement>(null);
    const inputRef = (searchRef ?? internalRef) as React.RefObject<HTMLInputElement>;
    const boxRef = useRef<HTMLDivElement>(null);

    const pool = useMemo(
        () => observables.filter((o) => o.kind === kind),
        [observables, kind]
    );

    const results = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return [];
        return pool
            .map((o) => ({ o, r: rankOf(o, q) }))
            .filter((x) => x.r < 99)
            .sort((a, b) => a.r - b.r || a.o.label.localeCompare(b.o.label))
            .slice(0, MAX_RESULTS)
            .map((x) => x.o);
    }, [pool, query]);

    const open = query.trim().length > 0;

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
        onToggle(o.label);
        setQuery("");
        inputRef.current?.focus();
    };

    const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
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

    const dropdown = open && rect ? createPortal(
        <div
            className="cs-drop"
            style={{ top: rect.bottom + 5, left: rect.left, width: rect.width }}
            role="listbox"
        >
            {results.length === 0 ? (
                <p className="cs-drop-empty">Nothing matches “{query.trim()}”</p>
            ) : (
                results.map((o, i) => {
                    const on = onChart.has(o.label);
                    return (
                        <button
                            key={o.id}
                            type="button"
                            role="option"
                            aria-selected={i === active}
                            className={`cs-drop-row${i === active ? " is-active" : ""}${on ? " is-on" : ""}`}
                            onMouseEnter={() => setActive(i)}
                            onClick={() => take(o)}
                        >
                            <span>{on ? "✓ " : ""}{o.label}</span>
                            {o.system && <span className="cs-drop-zone">{o.system.replace(/_/g, " ")}</span>}
                        </button>
                    );
                })
            )}
        </div>,
        document.body
    ) : null;

    const cycle = (label: string, current: SelectedSymptom["intensity"]) => {
        const next: SelectedSymptom["intensity"] =
            current === "mild" ? "moderate" : current === "moderate" ? "severe" : "mild";
        onIntensityChange?.(label, next);
    };

    return (
        <section className="cs-card cs-picker" aria-label={title}>
            <div className="cs-card-head">
                <h2 className="cs-card-title">
                    <span className={`cs-glyph is-${glyphTone}`}>{glyph}</span>
                    {title}
                    {note && <em>({note})</em>}
                </h2>
                {selected.length > 0 && (
                    <span className="cs-count">{selected.length} selected</span>
                )}
            </div>

            <div className="cs-picker-search">
                <div ref={boxRef} className="cs-field">
                    <Search size={15} />
                    <input
                        ref={inputRef}
                        value={query}
                        placeholder={placeholder}
                        disabled={disabled}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={onKey}
                        aria-label={placeholder}
                    />
                </div>
                <button
                    type="button"
                    className="cs-sqbtn"
                    disabled={disabled}
                    onClick={onBrowse}
                    aria-label={`Browse all ${title.toLowerCase()}`}
                    title="Browse the whole catalogue"
                >
                    <Plus size={16} />
                </button>
            </div>

            {/* What the chart says is worth examining for. Sits ABOVE the
                empty hint, because once there is something to suggest, a
                generic hint is the less useful of the two. Never mixed in
                with the selected chips — a thing to check and a thing you
                found must not look alike. */}
            {suggestions.length > 0 && (
                <div className="cs-exam-hint">
                    <span className="cs-exam-hint-label">Worth examining for</span>
                    <div className="cs-chips">
                        {suggestions.map((label) => (
                            <button
                                key={label}
                                type="button"
                                className="cs-chip cs-chip--suggest"
                                disabled={disabled}
                                onClick={() => onToggle(label)}
                                title="Add this finding"
                            >
                                <Plus size={11} />
                                {label}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {selected.length === 0 ? (
                suggestions.length === 0 && <p className="cs-picker-hint">{emptyHint}</p>
            ) : (
                <div className="cs-chips">
                    {selected.map((label) => {
                        const intensity = intensities?.find((i) => i.name === label)?.intensity;
                        return (
                            <span key={label} className={`cs-chip cs-chip--${TONE[kind]}`}>
                                {intensity && onIntensityChange && (
                                    <button
                                        type="button"
                                        className={`cs-dots is-${intensity}`}
                                        onClick={() => cycle(label, intensity)}
                                        aria-label={`Severity: ${intensity}. Click to change.`}
                                        title={`${intensity} — click to change`}
                                    ><i /><i /><i /></button>
                                )}
                                {label}
                                <button
                                    type="button"
                                    className="cs-chip-x"
                                    onClick={() => onToggle(label)}
                                    aria-label={`Remove ${label}`}
                                >×</button>
                            </span>
                        );
                    })}
                </div>
            )}

            <button type="button" className="cs-picker-foot" onClick={onBrowse} disabled={disabled}>
                <Plus size={13} />
                Add more
            </button>

            {dropdown}
        </section>
    );
}
