// ---------------------------------------------------------------------------
// JOINT FINDING FIELD — "what is at the left knee", on the body map panel.
//
// Replaces a wall of option chips (13 on a knee) with the pattern the rest
// of the product uses for anything past a handful of options:
//
//   Recorded here    only what IS recorded at this place, as removable
//                    tokens in the Case Sheet's own colours — data, not
//                    options
//   Add at …         one field; focusing it opens this place's findings as a
//                    list (the joint's own first: pain, swelling, bony
//                    tenderness…), typing filters it and reaches the rest
//                    of the local findings. ↑ ↓ Enter, Esc. It stays open
//                    after a pick, so three findings are three Enters.
//
// A local finding is recorded AT this place (`onToggleAt`); a complaint
// like "Knee pain" is a plain chart toggle. The list is portalled and fixed,
// so the panel's own scroll never crops it.
// ---------------------------------------------------------------------------

import { Check, MapPin, Plus, X } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Observable } from "../../lib/db/synapse";

interface Row {
    o: Observable;
    /** recorded at THIS place (or, for a complaint, on the chart) */
    here: boolean;
    /** recorded somewhere else — "at Right knee", "no place yet" */
    away: string | null;
}

const KIND_LABEL: Record<Observable["kind"], string> = {
    symptom: "Reported",
    finding: "On examination",
    history: "History",
};

export function JointFindingField({
    placeLabel, suggested, catalogue, isHere, awayNote, onToggle, disabled = false,
}: {
    /** "Left knee" — names the field and the empty state */
    placeLabel: string;
    /** this place's own findings, most likely first (regionFindings.ts) */
    suggested: Observable[];
    /** everything else that can be recorded at a place, reached by typing */
    catalogue: Observable[];
    isHere: (o: Observable) => boolean;
    awayNote: (o: Observable) => string | null;
    onToggle: (o: Observable) => void;
    disabled?: boolean;
}) {
    const [query, setQuery] = useState("");
    const [open, setOpen] = useState(false);
    const [active, setActive] = useState(0);
    const [pos, setPos] = useState<{ top: number; left: number; width: number; up: boolean } | null>(null);
    const fieldRef = useRef<HTMLDivElement>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const recorded = useMemo(
        () => [...suggested, ...catalogue]
            .filter((o, i, all) => all.findIndex((x) => x.id === o.id) === i && isHere(o))
            // Reported, then found: the case sheet's order.
            .sort((a, b) => (a.kind === "finding" ? 1 : 0) - (b.kind === "finding" ? 1 : 0)),
        [suggested, catalogue, isHere],
    );

    const rows = useMemo<Row[]>(() => {
        const q = query.trim().toLowerCase();
        const words = q.split(/\s+/).filter(Boolean);
        const hit = (o: Observable) => {
            const l = o.label.toLowerCase();
            return words.every((w) => l.split(/[\s/()-]+/).some((p) => p.startsWith(w)) || l.includes(w));
        };
        const seen = new Set<number>();
        const out: Row[] = [];
        const push = (o: Observable) => {
            if (seen.has(o.id)) return;
            seen.add(o.id);
            out.push({ o, here: isHere(o), away: awayNote(o) });
        };
        // This place's own list first, in its clinical order; typing then
        // reaches every other local finding.
        for (const o of suggested) if (!q || hit(o)) push(o);
        if (q) for (const o of catalogue) if (hit(o)) push(o);
        // What the patient reports, then what is found — the case sheet's
        // order, so each group heading appears once.
        const rank = (r: Row) => (r.o.kind === "finding" ? 1 : 0);
        return out
            .map((r, i) => ({ r, i }))
            .sort((a, b) => rank(a.r) - rank(b.r) || a.i - b.i)
            .map((x) => x.r)
            .slice(0, q ? 10 : 20);
    }, [query, suggested, catalogue, isHere, awayNote]);

    useEffect(() => { setActive(0); }, [query, open]);

    // Placed under the field, or above it when the window has no room below.
    useLayoutEffect(() => {
        if (!open) return;
        const place = () => {
            const r = fieldRef.current?.getBoundingClientRect();
            if (!r) return;
            const h = Math.min(listRef.current?.scrollHeight ?? 300, 300);
            const up = r.bottom + 6 + h > window.innerHeight - 8 && r.top - 6 - h > 8;
            setPos({ top: up ? r.top - 6 - h : r.bottom + 6, left: r.left, width: r.width, up });
        };
        place();
        window.addEventListener("resize", place);
        window.addEventListener("scroll", place, true);
        return () => {
            window.removeEventListener("resize", place);
            window.removeEventListener("scroll", place, true);
        };
    }, [open, rows.length]);

    useEffect(() => {
        if (!open) return;
        const away = (e: MouseEvent) => {
            const t = e.target as Node;
            if (fieldRef.current?.contains(t) || listRef.current?.contains(t)) return;
            setOpen(false);
        };
        document.addEventListener("mousedown", away);
        return () => document.removeEventListener("mousedown", away);
    }, [open]);

    // Keep the highlighted row in view while arrowing through the list.
    useEffect(() => {
        listRef.current?.querySelector<HTMLElement>(`[data-row="${active}"]`)?.scrollIntoView({ block: "nearest" });
    }, [active]);

    const pick = (r: Row) => {
        onToggle(r.o);
        setQuery("");
        inputRef.current?.focus();
    };

    // Rows grouped under the kind the case sheet uses, in list order.
    let lastKind: Observable["kind"] | null = null;

    return (
        <div className="cs-jf">
            {recorded.length > 0 && (
                <div className="cs-jf-tokens" aria-label={`Recorded at ${placeLabel.toLowerCase()}`}>
                    {recorded.map((o) => (
                        <span key={o.id} className={`cs-jf-token is-${o.kind}`}>
                            {o.label}
                            <button
                                type="button"
                                aria-label={`Remove ${o.label} from ${placeLabel.toLowerCase()}`}
                                disabled={disabled}
                                onClick={() => onToggle(o)}
                            >
                                <X size={12} />
                            </button>
                        </span>
                    ))}
                </div>
            )}

            <div
                ref={fieldRef}
                className={`cs-jf-field${open ? " is-open" : ""}`}
                onClick={() => { if (!disabled) { setOpen(true); inputRef.current?.focus(); } }}
            >
                <Plus size={15} aria-hidden="true" />
                <input
                    ref={inputRef}
                    className="cs-jf-input"
                    value={query}
                    disabled={disabled}
                    placeholder={`Add at ${placeLabel.toLowerCase()}: swelling, tenderness…`}
                    role="combobox"
                    aria-expanded={open}
                    aria-controls="cs-jf-list"
                    aria-label={`Add a finding at ${placeLabel.toLowerCase()}`}
                    onFocus={() => setOpen(true)}
                    onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
                    onKeyDown={(e) => {
                        if (e.key === "Escape") {
                            if (open) { e.preventDefault(); e.stopPropagation(); setOpen(false); }
                            return;
                        }
                        if (!open && (e.key === "ArrowDown" || e.key === "Enter")) { e.preventDefault(); setOpen(true); return; }
                        if (!rows.length) return;
                        if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(i + 1, rows.length - 1)); }
                        else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
                        else if (e.key === "Enter") { e.preventDefault(); pick(rows[active]); }
                    }}
                />
            </div>

            {open && createPortal(
                <div
                    ref={listRef}
                    id="cs-jf-list"
                    role="listbox"
                    className="cs-jf-list"
                    style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, width: pos?.width }}
                >
                    {!query.trim() && (
                        <p className="cs-jf-listhead">
                            <MapPin size={12} aria-hidden="true" /> Found at the {placeLabel.toLowerCase()}
                        </p>
                    )}
                    {rows.length === 0 ? (
                        <p className="cs-jf-none">Nothing matches “{query.trim()}”</p>
                    ) : rows.map((r, i) => {
                        const head = r.o.kind !== lastKind ? KIND_LABEL[r.o.kind] : null;
                        lastKind = r.o.kind;
                        return (
                            <div key={r.o.id}>
                                {head && <p className="cs-jf-group">{head}</p>}
                                <button
                                    type="button"
                                    role="option"
                                    data-row={i}
                                    aria-selected={i === active}
                                    className={`cs-jf-row is-${r.o.kind}${i === active ? " is-active" : ""}${r.here ? " is-here" : ""}`}
                                    onMouseEnter={() => setActive(i)}
                                    onMouseDown={(e) => { e.preventDefault(); pick(r); }}
                                >
                                    <span className="cs-jf-check" aria-hidden="true">{r.here && <Check size={12} strokeWidth={2.6} />}</span>
                                    <span className="cs-jf-rowlabel">{r.o.label}</span>
                                    {r.away && <em>{r.away}</em>}
                                </button>
                            </div>
                        );
                    })}
                </div>,
                document.body,
            )}
        </div>
    );
}
