import { Search, Plus, X, ChevronUp, ChevronDown } from "lucide-react";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { fuzzyFilter } from "../utils/filter";
import { fetchSnapshotSuggestions } from "../lib/db";
import { Tag } from "./Tag";
import type { SelectedSymptom } from "../types";
import type { ClinicalSnapshot } from "../lib/db";

type Props = {
    title: string;
    tone: "blue" | "pink";
    icon: React.ReactNode;
    items: string[];
    selected: string[];
    selectedWithIntensity?: SelectedSymptom[];
    collapsed?: boolean;
    onToggleCollapsed?: () => void;
    onChange: (items: string[]) => void;
    onChangeWithIntensity?: (items: SelectedSymptom[]) => void;
    onSnapshotSelect?: (snapshot: ClinicalSnapshot) => void;
    className?: string;
    searchRef?: React.RefObject<HTMLInputElement>;
    recentSnapshots?: ClinicalSnapshot[];
};

const INITIAL_SHOW = 10;
const PANEL_HEIGHT = 280;

const IdleSVG = () => (
    <svg width="120" height="28" viewBox="0 0 120 28" fill="none" xmlns="http://www.w3.org/2000/svg"
        style={{ opacity: 0.10, pointerEvents: "none", display: "block" }}>
        <path d="M0 14 L20 14 L25 5 L30 23 L35 1 L40 27 L46 14 L65 14 L70 9 L75 19 L80 14 L120 14"
            stroke="#f43f5e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);

const SnapshotIcon = () => (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
        <path d="M2 3h8M2 6h5M2 9h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
);

export function ChipSearchPanel({
    title, tone, icon, items, selected,
    selectedWithIntensity,
    collapsed, onToggleCollapsed, onChange,
    onChangeWithIntensity,
    onSnapshotSelect,
    className = "",
    searchRef,
    recentSnapshots = [],
}: Props) {
    const [query, setQuery] = useState("");
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const [showAll, setShowAll] = useState(false);
    const [queriedSnapshots, setQueriedSnapshots] = useState<ClinicalSnapshot[]>([]);
    const [dropdownRect, setDropdownRect] = useState<DOMRect | null>(null);
    const [appliedSnapshot, setAppliedSnapshot] = useState<string | null>(null);

    const internalRef = useRef<HTMLInputElement>(null);
    const inputRef = (searchRef ?? internalRef) as React.RefObject<HTMLInputElement>;
    const panelRef = useRef<HTMLElement>(null);
    const searchBoxRef = useRef<HTMLDivElement>(null);

    const updateRect = useCallback(() => {
        if (searchBoxRef.current) {
            setDropdownRect(searchBoxRef.current.getBoundingClientRect());
        }
    }, []);

    useEffect(() => {
        if (!dropdownOpen) return;
        updateRect();
        window.addEventListener("resize", updateRect);
        window.addEventListener("scroll", updateRect, true);
        return () => {
            window.removeEventListener("resize", updateRect);
            window.removeEventListener("scroll", updateRect, true);
        };
    }, [dropdownOpen, updateRect]);

    useEffect(() => {
        if (dropdownOpen) updateRect();
    }, [selected.length, dropdownOpen, updateRect]);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            const portal = document.getElementById("chip-dropdown-portal");
            if (
                panelRef.current && !panelRef.current.contains(e.target as Node) &&
                !(portal && portal.contains(e.target as Node))
            ) {
                setDropdownOpen(false);
            }
        };
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === "Escape") { setDropdownOpen(false); setQuery(""); }
        };
        document.addEventListener("mousedown", handleClickOutside);
        document.addEventListener("keydown", handleEscape);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
            document.removeEventListener("keydown", handleEscape);
        };
    }, []);

    // Only fetch when actually querying — idle state uses recentSnapshots prop
    useEffect(() => {
        if (!query) { setQueriedSnapshots([]); return; }
        let cancelled = false;
        fetchSnapshotSuggestions(query).then((r) => { if (!cancelled) setQueriedSnapshots(r); });
        return () => { cancelled = true; };
    }, [query]);

    const filtered = useMemo(() => fuzzyFilter(items, query, (i) => i), [items, query]);

    const chipList = useMemo(() => {
        if (query) {
            const sel = filtered.filter(i => selected.includes(i));
            const unsel = filtered.filter(i => !selected.includes(i));
            return [...sel, ...unsel];
        }
        return showAll ? items : items.slice(0, INITIAL_SHOW);
    }, [filtered, items, selected, query, showAll]);

    const hasMore = !query && !showAll && items.length > INITIAL_SHOW;
    // When dropdown is open, use query results; when idle use recentSnapshots passed from parent
    const activeSnapshots = query ? queriedSnapshots : recentSnapshots;

    const addItem = (value: string) => {
        const v = value.trim();
        if (!v) return;
        if (selected.includes(v)) { removeItem(v); return; }
        if (onChangeWithIntensity && selectedWithIntensity) {
            onChangeWithIntensity([...selectedWithIntensity, { name: v, intensity: "moderate" }]);
        }
        onChange([...selected, v]);
        setQuery("");
    };

    const removeItem = (value: string) => {
        if (onChangeWithIntensity && selectedWithIntensity) {
            onChangeWithIntensity(selectedWithIntensity.filter((s) => s.name !== value));
        }
        onChange(selected.filter((s) => s !== value));
    };

    const updateIntensity = (name: string, intensity: SelectedSymptom["intensity"]) => {
        if (!onChangeWithIntensity || !selectedWithIntensity) return;
        onChangeWithIntensity(selectedWithIntensity.map((s) => s.name === name ? { ...s, intensity } : s));
    };

    const handleSnapshotClick = (snapshot: ClinicalSnapshot) => {
        onSnapshotSelect?.(snapshot);
        setAppliedSnapshot(snapshot.name);
        setDropdownOpen(false);
        setQuery("");
    };

    const showDropdown = dropdownOpen && !collapsed;

    // ── Shared chip style ────────────────────────────────────────────────────
    const makeChipStyle = (isSelected: boolean): React.CSSProperties => ({
        display: "inline-flex", alignItems: "center", gap: 4,
        minHeight: 27, padding: "0 10px", borderRadius: 999,
        fontSize: 12, fontWeight: isSelected ? 700 : 600,
        cursor: "pointer", transition: "all 0.13s",
        border: "1px solid",
        background: isSelected ? "rgba(237,246,255,0.9)" : "rgba(241,245,249,0.90)",
        borderColor: isSelected ? "rgba(18,104,232,0.35)" : "rgba(0,0,0,0.08)",
        color: isSelected ? "#1268e8" : "#334155",
    });

    // ── Snapshot card ────────────────────────────────────────────────────────
    const renderSnapshotCard = (snap: ClinicalSnapshot) => (
        <button
            key={snap.id}
            type="button"
            onClick={() => handleSnapshotClick(snap)}
            style={{
                display: "flex", alignItems: "center", gap: 9,
                width: "100%", padding: "6px 8px", borderRadius: 7,
                background: "rgba(250,245,255,0.8)",
                border: "1px solid rgba(216,180,254,0.3)",
                cursor: "pointer", textAlign: "left",
                transition: "background 0.12s, border-color 0.12s",
            }}
            onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.background = "rgba(243,232,255,0.95)";
                (e.currentTarget as HTMLElement).style.borderColor = "rgba(192,132,252,0.5)";
            }}
            onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.background = "rgba(250,245,255,0.8)";
                (e.currentTarget as HTMLElement).style.borderColor = "rgba(216,180,254,0.3)";
            }}
        >
            <span style={{
                flexShrink: 0, width: 24, height: 24, borderRadius: 6,
                background: "rgba(168,85,247,0.10)",
                border: "1px solid rgba(168,85,247,0.18)",
                display: "grid", placeItems: "center", color: "#a855f7",
            }}>
                <SnapshotIcon />
            </span>
            <span style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0, flex: 1 }}>
                <span style={{
                    fontSize: 12, fontWeight: 700, color: "#1e293b",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                    {snap.name}
                </span>
                <span style={{ fontSize: 10, color: "#94a3b8" }}>
                    {snap.symptoms.length} symptoms · {snap.description.slice(0, 36)}{snap.description.length > 36 ? "…" : ""}
                </span>
            </span>
        </button>
    );

    // ── Portal dropdown ──────────────────────────────────────────────────────
    const dropdown = showDropdown && dropdownRect ? createPortal(
        <div
            id="chip-dropdown-portal"
            style={{
                position: "fixed",
                top: dropdownRect.bottom + 3,
                left: dropdownRect.left,
                width: dropdownRect.width,
                zIndex: 9999,
                background: "white",
                border: "1px solid rgba(191,205,226,0.6)",
                borderRadius: 10,
                boxShadow: "0 8px 28px rgba(20,35,66,0.14), 0 2px 8px rgba(20,35,66,0.07)",
                display: "flex",
                flexDirection: "column",
                maxHeight: 340,
                overflow: "hidden",
            }}
        >
            {/* Snapshots */}
            {activeSnapshots.length > 0 && (
                <div style={{ flexShrink: 0 }}>
                    <div style={{
                        padding: "7px 10px 4px",
                        fontSize: 9, fontWeight: 800,
                        letterSpacing: "0.09em", textTransform: "uppercase",
                        color: "#94a3b8",
                    }}>
                        Clinical Snapshots
                    </div>
                    <div style={{ padding: "0 8px 6px", display: "flex", flexDirection: "column", gap: 3 }}>
                        {activeSnapshots.map(renderSnapshotCard)}
                    </div>
                    <div style={{ height: 1, background: "rgba(191,205,226,0.4)", margin: "0 8px 4px" }} />
                </div>
            )}

            {/* Show less pinned at TOP when expanded — so you never scroll to collapse */}
            {showAll && !query && (
                <div style={{ flexShrink: 0, padding: "4px 8px 2px" }}>
                    <button
                        type="button"
                        onClick={() => setShowAll(false)}
                        style={{
                            display: "inline-flex", alignItems: "center", gap: 4,
                            height: 22, padding: "0 9px", borderRadius: 999,
                            fontSize: 10, fontWeight: 700,
                            cursor: "pointer", background: "rgba(241,245,249,0.8)",
                            border: "1.5px solid rgba(148,163,184,0.4)",
                            color: "#64748b", transition: "all 0.13s",
                        }}
                        onMouseEnter={e => {
                            (e.currentTarget as HTMLElement).style.borderColor = "rgba(245, 138, 204, 0.7)";
                            (e.currentTarget as HTMLElement).style.background = "rgba(165, 219, 237, 0.8)";
                        }}
                        onMouseLeave={e => {
                            (e.currentTarget as HTMLElement).style.borderColor = "rgba(117, 179, 251, 0.9)";
                            (e.currentTarget as HTMLElement).style.background = "rgba(225, 232, 240, 0.8)";
                        }}
                    >
                        <ChevronUp size={10} />
                        Show less
                    </button>
                </div>
            )}

            {/* Symptom chips — scrollable */}
            <div style={{ overflowY: "auto", flex: 1, padding: "4px 8px 8px" }}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5, alignItems: "center" }}>
                    {chipList.map((item) => {
                        const isSelected = selected.includes(item);
                        return (
                            <button
                                key={item}
                                type="button"
                                onClick={() => addItem(item)}
                                style={makeChipStyle(isSelected)}
                                onMouseEnter={e => {
                                    if (!isSelected) {
                                        const el = e.currentTarget as HTMLElement;
                                        el.style.background = "rgba(237,246,255,0.75)";
                                        el.style.borderColor = "rgba(37,99,235,0.22)";
                                        el.style.color = "#1268e8";
                                    }
                                }}
                                onMouseLeave={e => {
                                    if (!isSelected) {
                                        const el = e.currentTarget as HTMLElement;
                                        el.style.background = "rgba(241,245,249,0.90)";
                                        el.style.borderColor = "rgba(0,0,0,0.08)";
                                        el.style.color = "#334155";
                                    }
                                }}
                            >
                                {isSelected && (
                                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ flexShrink: 0 }}>
                                        <path d="M1.5 5L3.8 7.5L8.5 2.5" stroke="#1268e8" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                )}
                                {item}
                            </button>
                        );
                    })}

                    {/* +N more — clearly smaller and distinct */}
                    {hasMore && (
                        <button
                            type="button"
                            onClick={() => setShowAll(true)}
                            style={{
                                display: "inline-flex", alignItems: "center", gap: 3,
                                height: 22, padding: "0 9px", borderRadius: 999,
                                fontSize: 10, fontWeight: 700, letterSpacing: "0.02em",
                                cursor: "pointer", background: "transparent",
                                border: "1.5px dashed rgba(18,104,232,0.35)",
                                color: "#7aabde", transition: "all 0.13s",
                            }}
                            onMouseEnter={e => {
                                const el = e.currentTarget as HTMLElement;
                                el.style.borderColor = "rgba(18,104,232,0.6)";
                                el.style.color = "#1268e8";
                                el.style.background = "rgba(237,246,255,0.5)";
                            }}
                            onMouseLeave={e => {
                                const el = e.currentTarget as HTMLElement;
                                el.style.borderColor = "rgba(18,104,232,0.35)";
                                el.style.color = "#7aabde";
                                el.style.background = "transparent";
                            }}
                        >
                            <ChevronDown size={10} />
                            {items.length - INITIAL_SHOW} more
                        </button>
                    )}
                </div>
            </div>

            {/* Selected chips pinned at bottom — always visible while browsing */}
            {selected.length > 0 && (
                <>
                    <div style={{ height: 1, background: "rgba(191,205,226,0.4)", margin: "0 8px" }} />
                    <div style={{ padding: "5px 8px 8px", flexShrink: 0 }}>
                        <div style={{
                            fontSize: 9, fontWeight: 800, letterSpacing: "0.08em",
                            textTransform: "uppercase", color: "#94a3b8", marginBottom: 5,
                        }}>
                            {selected.length} selected
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                            {selected.map((item) => {
                                const intensityData = selectedWithIntensity?.find((s) => s.name === item);
                                return (
                                    <Tag
                                        key={`sel-${item}`}
                                        id={`chip-sel-${item}`}
                                        label={item}
                                        tone={tone}
                                        intensity={intensityData?.intensity}
                                        onIntensityChange={intensityData ? (i) => updateIntensity(item, i) : undefined}
                                        onRemove={() => removeItem(item)}
                                    />
                                );
                            })}
                        </div>
                    </div>
                </>
            )}
        </div>,
        document.body
    ) : null;

    // ── Panel — fixed height ─────────────────────────────────────────────────
    return (
        <section
            ref={panelRef}
            className={`panel chip-panel ${className} ${collapsed ? "collapsed" : ""}`.trim()}
            style={{
                display: "flex", flexDirection: "column",
                height: collapsed ? undefined : PANEL_HEIGHT,
                minHeight: "unset", overflow: "hidden",
            }}
        >
            <div className="section-head" style={{ flexShrink: 0 }}>
                <div className="panel-title">
                    {icon}
                    <h2>{title}</h2>
                </div>
                <button className="selected-count" type="button" onClick={onToggleCollapsed}>
                    {selected.length} selected
                </button>
            </div>

            {!collapsed && (
                <>
                    {/* Search bar — always at top, never moves */}
                    <div ref={searchBoxRef} className="search-box" style={{ flexShrink: 0 }}>
                        <Search size={17} />
                        <input
                            ref={inputRef}
                            value={query}
                            placeholder={`Search ${title.toLowerCase()}...`}
                            onChange={(e) => { setQuery(e.target.value); setDropdownOpen(true); }}
                            onFocus={() => { setDropdownOpen(true); updateRect(); }}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                    e.preventDefault();
                                    if (filtered[0]) addItem(filtered[0]);
                                }
                                if (e.key === "Escape") { setDropdownOpen(false); setQuery(""); }
                            }}
                        />
                        {query ? (
                            <button type="button" onClick={() => setQuery("")} aria-label="Clear">
                                <X size={14} />
                            </button>
                        ) : (
                            <button type="button" onClick={() => addItem(filtered[0] || "")} aria-label={`Add ${title}`}>
                                <Plus size={18} />
                            </button>
                        )}
                    </div>

                    {/* Body — fills remaining fixed height */}
                    <div style={{ flex: 1, overflow: "hidden", marginTop: 10, position: "relative" }}>

                        {/* IDLE — nothing selected, dropdown closed */}
                        {selected.length === 0 && !dropdownOpen && (
                            <div style={{ height: "100%", display: "flex", flexDirection: "column", gap: 5 }}>
                                {recentSnapshots.length > 0 ? (
                                    <>
                                        <div style={{
                                            fontSize: 9, fontWeight: 800, letterSpacing: "0.09em",
                                            textTransform: "uppercase", color: "#d1d5db",
                                        }}>
                                            Quick select
                                        </div>
                                        {recentSnapshots.slice(0, 2).map(renderSnapshotCard)}
                                    </>
                                ) : (
                                    <div style={{ fontSize: 11, color: "#d1d5db", fontWeight: 500 }}>
                                        Search or focus to browse symptoms
                                    </div>
                                )}
                                <div style={{ marginTop: "auto", display: "flex", justifyContent: "flex-end" }}>
                                    <IdleSVG />
                                </div>
                            </div>
                        )}

                        {/* ACTIVE — chips selected */}
                        {selected.length > 0 && (
                            <div style={{ height: "100%", overflowY: "auto" }}>
                                {appliedSnapshot && (
                                    <div style={{
                                        display: "inline-flex", alignItems: "center", gap: 5,
                                        marginBottom: 7, padding: "2px 7px 2px 5px",
                                        borderRadius: 999,
                                        background: "rgba(250,245,255,0.9)",
                                        border: "1px solid rgba(216,180,254,0.35)",
                                        fontSize: 10, fontWeight: 650, color: "#9333ea",
                                    }}>
                                        <SnapshotIcon />
                                        <span>{appliedSnapshot}</span>
                                        <button
                                            type="button"
                                            onClick={() => setAppliedSnapshot(null)}
                                            style={{ background: "none", border: "none", cursor: "pointer", color: "#c4b5fd", padding: 0, lineHeight: 1, display: "grid" }}
                                        >
                                            <X size={9} />
                                        </button>
                                    </div>
                                )}
                                <div className="tag-row" style={{ marginTop: 0 }}>
                                    {selected.map((item) => {
                                        const intensityData = selectedWithIntensity?.find((s) => s.name === item);
                                        return (
                                            <Tag
                                                key={item}
                                                id={`chip-${item}`}
                                                label={item}
                                                tone={tone}
                                                intensity={intensityData?.intensity}
                                                onIntensityChange={intensityData ? (i) => updateIntensity(item, i) : undefined}
                                                onRemove={() => removeItem(item)}
                                            />
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Dropdown open, nothing selected yet */}
                        {dropdownOpen && selected.length === 0 && (
                            <p style={{ fontSize: 11, color: "#d1d5db", margin: 0 }}>
                                Pick symptoms from the list below
                            </p>
                        )}
                    </div>
                </>
            )}

            {dropdown}
        </section>
    );
}