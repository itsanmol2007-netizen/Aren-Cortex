import { Search, X, ChevronDown, ChevronUp } from "lucide-react";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import type { DBFinding, ProbableFinding } from "../lib/db";
import { fetchProbableFindings } from "../lib/db";

type Props = {
    findings: DBFinding[];
    selected: string[];
    onChange: (items: string[]) => void;
    selectedSymptoms?: string[];
    symptomIds?: number[];
    searchRef?: React.RefObject<HTMLInputElement>;
};

const PANEL_HEIGHT = 280;

const GROUP_ORDER = [
    "General",
    "Respiratory",
    "GI / Abdomen",
    "ENT",
    "Cardiovascular",
    "Neurological",
    "Skin / Musculoskeletal",
];

function SignalIcon() {
    return (
        <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
            <circle cx="5.5" cy="5.5" r="1.6" fill="#0d9488" />
            <path d="M5.5 1v1.4M5.5 8.6V10M10 5.5H8.6M2.4 5.5H1" stroke="#0d9488" strokeWidth="1.1" strokeLinecap="round" />
            <path d="M8.36 2.14 7.37 3.13M3.63 7.87 2.64 8.86M8.36 8.86 7.37 7.87M3.63 3.13 2.64 2.14"
                stroke="#0d9488" strokeWidth="1" strokeLinecap="round" opacity="0.5" />
        </svg>
    );
}

function StethoscopeIcon() {
    return (
        <svg width="26" height="26" viewBox="0 0 28 28" fill="none">
            <circle cx="14" cy="14" r="13" fill="rgba(13,148,136,0.06)" stroke="rgba(13,148,136,0.15)" strokeWidth="1" />
            <path d="M9 8v5a5 5 0 0 0 10 0V8" stroke="#0d9488" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M9 8h-.5A1.5 1.5 0 0 0 7 9.5v0A1.5 1.5 0 0 0 8.5 11H9" stroke="#0d9488" strokeWidth="1.5" strokeLinecap="round" />
            <path d="M19 8h.5A1.5 1.5 0 0 1 21 9.5v0A1.5 1.5 0 0 1 19.5 11H19" stroke="#0d9488" strokeWidth="1.5" strokeLinecap="round" />
            <path d="M14 18v2.5" stroke="#0d9488" strokeWidth="1.5" strokeLinecap="round" />
            <circle cx="14" cy="22" r="1.5" fill="#0d9488" opacity="0.7" />
        </svg>
    );
}

export function FindingsPanel({
    findings,
    selected,
    onChange,
    symptomIds = [],
    searchRef,
}: Props) {
    const [query, setQuery] = useState("");
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
    const [probableFindings, setProbableFindings] = useState<ProbableFinding[]>([]);
    const [loadingProbable, setLoadingProbable] = useState(false);
    const [dropdownRect, setDropdownRect] = useState<DOMRect | null>(null);

    const internalRef = useRef<HTMLInputElement>(null);
    const inputRef = (searchRef ?? internalRef) as React.RefObject<HTMLInputElement>;
    const panelRef = useRef<HTMLElement>(null);
    const searchBoxRef = useRef<HTMLDivElement>(null);

    // ── Rect tracking for portal dropdown ───────────────────────────────────
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

    // ── Click outside / escape ───────────────────────────────────────────────
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            const portal = document.getElementById("findings-dropdown-portal");
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

    // ── Probable findings fetch ──────────────────────────────────────────────
    useEffect(() => {
        if (!symptomIds.length) { setProbableFindings([]); return; }
        let cancelled = false;
        setLoadingProbable(true);
        fetchProbableFindings(symptomIds).then((results) => {
            if (!cancelled) { setProbableFindings(results); setLoadingProbable(false); }
        });
        return () => { cancelled = true; };
    }, [JSON.stringify(symptomIds)]);

    // ── Derived data ─────────────────────────────────────────────────────────
    const groups = useMemo(() => {
        const map = new Map<string, DBFinding[]>();
        GROUP_ORDER.forEach((g) => map.set(g, []));
        findings.forEach((f) => {
            const g = f.group_name || "General";
            if (!map.has(g)) map.set(g, []);
            map.get(g)!.push(f);
        });
        return map;
    }, [findings]);

    const searchResults = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return null;
        return findings.filter((f) => f.name.toLowerCase().includes(q)).slice(0, 12);
    }, [findings, query]);

    // Probable findings not yet confirmed — shown in panel body
    const unconfirmedProbable = probableFindings.filter((pf) => !selected.includes(pf.finding_name));
    const confirmedProbable = probableFindings.filter((pf) => selected.includes(pf.finding_name));

    // ── Toggle finding confirmed/unconfirmed ─────────────────────────────────
    const toggle = (name: string) => {
        if (selected.includes(name)) {
            onChange(selected.filter((s) => s !== name));
        } else {
            onChange([...selected, name]);
            setQuery("");
            inputRef.current?.focus();
        }
    };

    const toggleGroup = (group: string) => {
        setExpandedGroups((prev) => {
            const next = new Set(prev);
            if (next.has(group)) next.delete(group); else next.add(group);
            return next;
        });
    };

    // ── Probable finding row — confirmed-in-place ────────────────────────────
    const renderProbableRow = (pf: ProbableFinding) => {
        const isConfirmed = selected.includes(pf.finding_name);
        return (
            <button
                key={pf.finding_id}
                type="button"
                onClick={() => toggle(pf.finding_name)}
                style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 7,
                    width: "100%",
                    padding: "5px 7px",
                    borderRadius: 7,
                    border: isConfirmed
                        ? "1px solid rgba(13,148,136,0.25)"
                        : "1px solid transparent",
                    background: isConfirmed
                        ? "rgba(13,148,136,0.07)"
                        : "none",
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "all 0.12s",
                }}
                onMouseEnter={e => {
                    if (!isConfirmed)
                        (e.currentTarget as HTMLElement).style.background = "rgba(13,148,136,0.05)";
                }}
                onMouseLeave={e => {
                    if (!isConfirmed)
                        (e.currentTarget as HTMLElement).style.background = "none";
                }}
            >
                {/* Checkmark or dot */}
                {isConfirmed ? (
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0 }}>
                        <circle cx="6" cy="6" r="5.5" fill="rgba(13,148,136,0.15)" stroke="#0d9488" strokeWidth="1" />
                        <path d="M3 6l2 2 4-3.5" stroke="#0d9488" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                ) : (
                    <span style={{
                        width: 5, height: 5, borderRadius: "50%", flexShrink: 0,
                        background: pf.is_abnormal ? "#f43f5e" : "#0d9488",
                    }} />
                )}

                <span style={{
                    flex: 1, fontSize: 12, fontWeight: isConfirmed ? 700 : 500,
                    color: isConfirmed ? "#0d9488" : "var(--text)",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                    {pf.finding_name}
                </span>

                {pf.is_abnormal && (
                    <span style={{
                        fontSize: 9, fontWeight: 700, textTransform: "uppercase",
                        letterSpacing: "0.05em", color: "#d94040",
                        background: "rgba(217,64,64,0.07)",
                        border: "1px solid rgba(217,64,64,0.15)",
                        borderRadius: 999, padding: "1px 5px", flexShrink: 0,
                    }}>
                        abn
                    </span>
                )}

                {/* Confidence bar */}
                <span style={{
                    width: 24, height: 3, borderRadius: 2,
                    background: "rgba(0,0,0,0.07)", overflow: "hidden", flexShrink: 0,
                }}>
                    <span style={{
                        display: "block", height: "100%",
                        width: `${Math.min(100, (pf.score / 3) * 100)}%`,
                        background: pf.is_abnormal ? "#f43f5e" : "#0d9488",
                        borderRadius: 2,
                    }} />
                </span>
            </button>
        );
    };

    // ── Browse dropdown row ──────────────────────────────────────────────────
    const renderBrowseRow = (f: DBFinding) => {
        const isConfirmed = selected.includes(f.name);
        return (
            <button
                key={f.id}
                type="button"
                onClick={() => toggle(f.name)}
                style={{
                    display: "flex", alignItems: "center", gap: 7,
                    width: "100%", padding: "5px 7px", borderRadius: 6,
                    border: isConfirmed ? "1px solid rgba(13,148,136,0.2)" : "1px solid transparent",
                    background: isConfirmed ? "rgba(13,148,136,0.06)" : "none",
                    cursor: "pointer", textAlign: "left", transition: "all 0.1s",
                }}
                onMouseEnter={e => {
                    if (!isConfirmed) (e.currentTarget as HTMLElement).style.background = f.is_abnormal ? "rgba(244,63,94,0.05)" : "rgba(13,148,136,0.05)";
                }}
                onMouseLeave={e => {
                    if (!isConfirmed) (e.currentTarget as HTMLElement).style.background = "none";
                }}
            >
                {isConfirmed ? (
                    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0 }}>
                        <circle cx="6" cy="6" r="5.5" fill="rgba(13,148,136,0.12)" stroke="#0d9488" strokeWidth="1" />
                        <path d="M3 6l2 2 4-3.5" stroke="#0d9488" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                ) : (
                    <span style={{
                        width: 5, height: 5, borderRadius: "50%", flexShrink: 0,
                        background: f.is_abnormal ? "#f43f5e" : "#94a3b8",
                    }} />
                )}
                <span style={{
                    flex: 1, fontSize: 12, fontWeight: isConfirmed ? 700 : 500,
                    color: isConfirmed ? "#0d9488" : "#334155",
                }}>
                    {f.name}
                </span>
                {f.is_abnormal && (
                    <span style={{
                        fontSize: 9, fontWeight: 700, textTransform: "uppercase",
                        color: "#d94040", background: "rgba(217,64,64,0.07)",
                        border: "1px solid rgba(217,64,64,0.14)",
                        borderRadius: 999, padding: "1px 5px", flexShrink: 0,
                    }}>
                        abn
                    </span>
                )}
            </button>
        );
    };

    // ── Portal dropdown ──────────────────────────────────────────────────────
    const dropdown = dropdownOpen && dropdownRect ? createPortal(
        <div
            id="findings-dropdown-portal"
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
                maxHeight: 360,
                overflow: "hidden",
            }}
        >
            {/* Search results */}
            {searchResults !== null ? (
                <div style={{ overflowY: "auto", flex: 1, padding: "6px 8px 8px" }}>
                    {searchResults.length === 0 ? (
                        <p style={{ fontSize: 11.5, color: "var(--faint)", margin: "8px 4px", fontWeight: 500 }}>
                            No findings match "{query}"
                        </p>
                    ) : (
                        searchResults.map(renderBrowseRow)
                    )}
                </div>
            ) : (
                /* Browse by category */
                <>
                    {/* Selected confirmed findings pinned at top of dropdown */}
                    {selected.length > 0 && (
                        <>
                            <div style={{ padding: "7px 10px 4px", flexShrink: 0 }}>
                                <div style={{
                                    fontSize: 9, fontWeight: 800, letterSpacing: "0.09em",
                                    textTransform: "uppercase", color: "#94a3b8",
                                }}>
                                    {selected.length} confirmed
                                </div>
                            </div>
                            <div style={{ padding: "0 8px 4px", flexShrink: 0, display: "flex", flexWrap: "wrap", gap: 4 }}>
                                {selected.map((name) => (
                                    <span
                                        key={name}
                                        style={{
                                            display: "inline-flex", alignItems: "center", gap: 4,
                                            padding: "2px 7px 2px 5px", borderRadius: 999,
                                            background: "rgba(13,148,136,0.08)",
                                            border: "1px solid rgba(13,148,136,0.22)",
                                            fontSize: 11, fontWeight: 700, color: "#0d9488",
                                            cursor: "pointer",
                                        }}
                                        onClick={() => toggle(name)}
                                    >
                                        <svg width="9" height="9" viewBox="0 0 12 12" fill="none">
                                            <path d="M3 6l2 2 4-3.5" stroke="#0d9488" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                                        </svg>
                                        {name}
                                        <X size={9} style={{ opacity: 0.5 }} />
                                    </span>
                                ))}
                            </div>
                            <div style={{ height: 1, background: "rgba(191,205,226,0.4)", margin: "0 8px 4px" }} />
                        </>
                    )}

                    {/* Category list — scrollable */}
                    <div style={{ overflowY: "auto", flex: 1, padding: "4px 8px 8px" }}>
                        {Array.from(groups.entries()).map(([groupName, groupFindings]) => {
                            if (!groupFindings.length) return null;
                            const isExpanded = expandedGroups.has(groupName);
                            const abnormal = groupFindings.filter((f) => f.is_abnormal);
                            const confirmed = groupFindings.filter((f) => selected.includes(f.name));

                            return (
                                <div key={groupName} style={{ marginBottom: 3 }}>
                                    {/* Category header — strict left/right layout */}
                                    <button
                                        type="button"
                                        onClick={() => toggleGroup(groupName)}
                                        style={{
                                            width: "100%",
                                            display: "flex",
                                            alignItems: "center",
                                            padding: "7px 9px",
                                            background: isExpanded ? "rgba(13,148,136,0.05)" : "rgba(0,0,0,0.02)",
                                            border: "1px solid",
                                            borderColor: isExpanded ? "rgba(13,148,136,0.15)" : "rgba(0,0,0,0.06)",
                                            borderRadius: 7,
                                            cursor: "pointer",
                                            transition: "all 0.12s",
                                            gap: 0,
                                        }}
                                        onMouseEnter={e => {
                                            (e.currentTarget as HTMLElement).style.background = "rgba(13,148,136,0.05)";
                                            (e.currentTarget as HTMLElement).style.borderColor = "rgba(13,148,136,0.15)";
                                        }}
                                        onMouseLeave={e => {
                                            if (!isExpanded) {
                                                (e.currentTarget as HTMLElement).style.background = "rgba(0,0,0,0.02)";
                                                (e.currentTarget as HTMLElement).style.borderColor = "rgba(0,0,0,0.06)";
                                            }
                                        }}
                                    >
                                        {/* Group name — left */}
                                        <span style={{
                                            fontSize: 12, fontWeight: 650, color: "#334155",
                                            flex: 1, textAlign: "left",
                                        }}>
                                            {groupName}
                                        </span>

                                        {/* Right-side badges — pinned right, no scatter */}
                                        <span style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
                                            {confirmed.length > 0 && (
                                                <span style={{
                                                    fontSize: 9, fontWeight: 700,
                                                    color: "#0d9488",
                                                    background: "rgba(13,148,136,0.10)",
                                                    border: "1px solid rgba(13,148,136,0.2)",
                                                    borderRadius: 999, padding: "1px 6px",
                                                }}>
                                                    {confirmed.length} ✓
                                                </span>
                                            )}
                                            {abnormal.length > 0 && (
                                                <span style={{
                                                    fontSize: 9, fontWeight: 700,
                                                    color: "#d94040",
                                                    background: "rgba(217,64,64,0.07)",
                                                    border: "1px solid rgba(217,64,64,0.15)",
                                                    borderRadius: 999, padding: "1px 6px",
                                                }}>
                                                    {abnormal.length} abn
                                                </span>
                                            )}
                                            <span style={{
                                                fontSize: 10, fontWeight: 600, color: "#94a3b8",
                                                background: "rgba(0,0,0,0.05)",
                                                borderRadius: 999, padding: "1px 7px",
                                                minWidth: 22, textAlign: "center",
                                            }}>
                                                {groupFindings.length}
                                            </span>
                                            {isExpanded
                                                ? <ChevronUp size={11} style={{ color: "#94a3b8" }} />
                                                : <ChevronDown size={11} style={{ color: "#94a3b8" }} />
                                            }
                                        </span>
                                    </button>

                                    {isExpanded && (
                                        <div style={{ paddingLeft: 2, paddingTop: 3, paddingBottom: 2 }}>
                                            {/* Abnormal first */}
                                            {groupFindings.filter(f => f.is_abnormal).map(renderBrowseRow)}
                                            {/* Divider if both exist */}
                                            {groupFindings.some(f => f.is_abnormal) && groupFindings.some(f => !f.is_abnormal) && (
                                                <div style={{
                                                    height: 1,
                                                    background: "linear-gradient(90deg, transparent, rgba(0,0,0,0.06), transparent)",
                                                    margin: "4px 6px",
                                                }} />
                                            )}
                                            {/* Normal */}
                                            {groupFindings.filter(f => !f.is_abnormal).map(renderBrowseRow)}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </>
            )}
        </div>,
        document.body
    ) : null;

    // ── Panel body content ───────────────────────────────────────────────────
    const hasSymptoms = symptomIds.length > 0;

    return (
        <section
            ref={panelRef}
            className="panel chip-panel findings-panel"
            style={{
                display: "flex", flexDirection: "column",
                height: PANEL_HEIGHT, minHeight: "unset", overflow: "hidden",
            }}
        >
            {/* Header */}
            <div className="section-head" style={{ flexShrink: 0 }}>
                <div className="panel-title">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                        <circle cx="8" cy="8" r="3" fill="#0d9488" opacity="0.9" />
                        <circle cx="8" cy="8" r="6.5" stroke="#0d9488" strokeWidth="1" opacity="0.2" />
                        <circle cx="8" cy="8" r="5" stroke="#0d9488" strokeWidth="0.8" opacity="0.35" />
                    </svg>
                    <h2>Findings</h2>
                </div>
                <span className="selected-count" style={{ cursor: "default" }}>
                    {selected.length} selected
                </span>
            </div>

            {/* Search box */}
            <div
                ref={searchBoxRef}
                className="search-box"
                style={{ flexShrink: 0 }}
            >
                <Search size={17} />
                <input
                    ref={inputRef}
                    value={query}
                    placeholder="Search findings..."
                    onChange={(e) => { setQuery(e.target.value); setDropdownOpen(true); }}
                    onFocus={() => { setDropdownOpen(true); updateRect(); }}
                    onKeyDown={(e) => {
                        if (e.key === "Escape") { setDropdownOpen(false); setQuery(""); }
                    }}
                />
                {query ? (
                    <button type="button" onClick={() => setQuery("")} aria-label="Clear">
                        <X size={14} />
                    </button>
                ) : (
                    <span />
                )}
            </div>

            {/* Body — fills remaining fixed height */}
            <div style={{ flex: 1, overflow: "hidden", marginTop: 10, position: "relative" }}>

                {/* IDLE — no symptoms selected yet */}
                {!hasSymptoms && (
                    <div style={{
                        height: "100%", display: "flex", flexDirection: "column",
                        alignItems: "center", justifyContent: "center", gap: 8,
                    }}>
                        <StethoscopeIcon />
                        <div style={{ textAlign: "center" }}>
                            <p style={{ fontSize: 12, color: "var(--muted)", margin: 0, fontWeight: 600 }}>
                                No findings yet
                            </p>
                            <p style={{ fontSize: 11, color: "var(--faint)", margin: "3px 0 0" }}>
                                Add symptoms first, or search above
                            </p>
                        </div>
                        <button
                            type="button"
                            className="findings-advanced-btn"
                            onClick={() => { setDropdownOpen(true); updateRect(); }}
                            style={{ marginTop: 2 }}
                        >
                            <ChevronDown size={11} />
                            Browse by category
                        </button>
                    </div>
                )}

                {/* ACTIVE — symptoms present, show probable findings */}
                {hasSymptoms && (
                    <div style={{ height: "100%", display: "flex", flexDirection: "column", gap: 4 }}>
                        {/* Section label */}
                        <p style={{
                            display: "flex", alignItems: "center", gap: 5,
                            fontSize: 9, fontWeight: 800, letterSpacing: "0.09em",
                            textTransform: "uppercase", color: "#94a3b8",
                            margin: 0, flexShrink: 0,
                        }}>
                            <SignalIcon />
                            Probable findings
                        </p>

                        {/* Probable findings list — confirmed-in-place */}
                        <div style={{
                            flex: 1, overflowY: "auto",
                            padding: "3px 1px",
                            borderRadius: 8,
                            background: "rgba(13,148,136,0.025)",
                            border: "1px solid rgba(13,148,136,0.10)",
                        }}>
                            {loadingProbable ? (
                                <p style={{ fontSize: 11.5, color: "var(--faint)", margin: "8px 10px", fontWeight: 500 }}>
                                    Analysing symptoms…
                                </p>
                            ) : probableFindings.length === 0 ? (
                                <p style={{ fontSize: 11.5, color: "var(--faint)", margin: "8px 10px", fontWeight: 500 }}>
                                    No strong signal yet — add more symptoms
                                </p>
                            ) : (
                                probableFindings.map(renderProbableRow)
                            )}
                        </div>

                        {/* Browse button — always at bottom of panel, never moves */}
                        <button
                            type="button"
                            className="findings-advanced-btn"
                            onClick={() => { setDropdownOpen(v => !v); updateRect(); }}
                            style={{ flexShrink: 0 }}
                        >
                            {dropdownOpen
                                ? <><ChevronUp size={11} /> Hide all findings</>
                                : <><ChevronDown size={11} /> Browse all findings</>
                            }
                        </button>
                    </div>
                )}
            </div>

            {dropdown}
        </section>
    );
}