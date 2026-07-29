// ---------------------------------------------------------------------------
// BROWSE — the whole catalogue for one picker, grouped by body system.
//
// Search is the primary way in; this is the door for the doctor who does not
// know what the entry is called. Grouping by system rather than alphabetically
// is the point: "Respiratory" is how a clinician narrows down, "C" is not.
// ---------------------------------------------------------------------------

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Search, X } from "lucide-react";
import type { Observable } from "../../lib/db/synapse";
import { systemLabel, systemRank } from "../../lib/synapse/systems";
import type { PickerKind } from "./PickerCard";

const TITLE: Record<PickerKind, string> = {
    history: "Patient history & context",
    symptom: "Symptoms",
    finding: "Findings on examination",
};

export function BrowseSheet({
    kind, observables, selected, onToggle, onClose,
}: {
    kind: PickerKind;
    observables: Observable[];
    selected: Set<string>;
    onToggle: (label: string) => void;
    onClose: () => void;
}) {
    const [query, setQuery] = useState("");
    const searchRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const t = window.setTimeout(() => searchRef.current?.focus(), 0);
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") { e.stopPropagation(); onClose(); }
        };
        document.addEventListener("keydown", onKey);
        return () => {
            window.clearTimeout(t);
            document.removeEventListener("keydown", onKey);
        };
    }, [onClose]);

    const groups = useMemo(() => {
        const q = query.trim().toLowerCase();
        const pool = observables.filter(
            (o) =>
                o.kind === kind &&
                (!q ||
                    o.label.toLowerCase().includes(q) ||
                    (o.searchText ?? "").toLowerCase().includes(q) ||
                    o.slug.includes(q))
        );
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
    }, [observables, kind, query]);

    const total = useMemo(
        () => observables.filter((o) => o.kind === kind).length,
        [observables, kind]
    );

    return createPortal(
        <div className="cs-browse" role="dialog" aria-label={TITLE[kind]} onMouseDown={onClose}>
            <div className="cs-browse-sheet" onMouseDown={(e) => e.stopPropagation()}>
                <div className="cs-browse-head">
                    <div className="cs-field">
                        <Search size={15} />
                        <input
                            ref={searchRef}
                            value={query}
                            placeholder={`Filter ${total} entries…`}
                            onChange={(e) => setQuery(e.target.value)}
                            aria-label={`Filter ${TITLE[kind]}`}
                        />
                    </div>
                    <button type="button" className="cs-sqbtn" onClick={onClose} aria-label="Close">
                        <X size={16} />
                    </button>
                </div>

                <div className="cs-browse-body">
                    {groups.length === 0 ? (
                        <p className="cs-drop-empty">Nothing matches “{query.trim()}”</p>
                    ) : (
                        groups.map((g) => (
                            <section key={g.system} className="cs-browse-group">
                                <h3>{g.label}<span>{g.items.length}</span></h3>
                                <div className="cs-browse-chips">
                                    {g.items.map((o) => {
                                        const on = selected.has(o.label);
                                        return (
                                            <button
                                                key={o.id}
                                                type="button"
                                                className={`cs-browse-chip${on ? " is-on" : ""}`}
                                                onClick={() => onToggle(o.label)}
                                            >
                                                {on && "✓ "}{o.label}
                                            </button>
                                        );
                                    })}
                                </div>
                            </section>
                        ))
                    )}
                </div>

                <div className="cs-browse-foot">
                    Picks land straight on the chart. <kbd>Esc</kbd> to close.
                </div>
            </div>
        </div>,
        document.body
    );
}
