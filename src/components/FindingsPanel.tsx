import { ChevronDown, ChevronUp, Search, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import type { DBFinding } from "../lib/db";

type Props = {
    findings: DBFinding[];
    selected: string[];
    onChange: (items: string[]) => void;
    selectedSymptoms?: string[];
    searchRef?: React.RefObject<HTMLInputElement>;
};

const GROUP_ORDER = [
    "General",
    "Respiratory",
    "GI / Abdomen",
    "ENT",
    "Cardiovascular",
    "Neurological",
    "Skin / Musculoskeletal",
];

// ── Stethoscope SVG — proper clinical icon, not a dot ─────────────────────────
function StethoscopeIcon() {
    return (
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="14" cy="14" r="13" fill="rgba(13,148,136,0.08)" stroke="rgba(13,148,136,0.18)" strokeWidth="1" />
            <path
                d="M9 8v5a5 5 0 0 0 10 0V8"
                stroke="#0d9488" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
            />
            <path
                d="M9 8h-.5A1.5 1.5 0 0 0 7 9.5v0A1.5 1.5 0 0 0 8.5 11H9"
                stroke="#0d9488" strokeWidth="1.5" strokeLinecap="round"
            />
            <path
                d="M19 8h.5A1.5 1.5 0 0 1 21 9.5v0A1.5 1.5 0 0 1 19.5 11H19"
                stroke="#0d9488" strokeWidth="1.5" strokeLinecap="round"
            />
            <path
                d="M19 13a5 5 0 0 1-5 5v0a5 5 0 0 1-4.9-4"
                stroke="#0d9488" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="0"
            />
            <path
                d="M14 18v2.5"
                stroke="#0d9488" strokeWidth="1.5" strokeLinecap="round"
            />
            <circle cx="14" cy="22" r="1.5" fill="#0d9488" opacity="0.7" />
        </svg>
    );
}

export function FindingsPanel({
    findings,
    selected,
    onChange,
    selectedSymptoms = [],
    searchRef,
}: Props) {
    const [query, setQuery] = useState("");
    const [showBrowse, setShowBrowse] = useState(false);
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
    const internalRef = useRef<HTMLInputElement>(null);
    const inputRef = (searchRef ?? internalRef) as React.RefObject<HTMLInputElement>;

    const selectedFindings = useMemo(
        () => findings.filter((f) => selected.includes(f.name)),
        [findings, selected]
    );

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
        return findings
            .filter((f) => f.name.toLowerCase().includes(q) && !selected.includes(f.name))
            .slice(0, 10);
    }, [findings, query, selected]);

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
            if (next.has(group)) next.delete(group);
            else next.add(group);
            return next;
        });
    };

    const renderFindingRow = (f: DBFinding) => (
        <button
            key={f.id}
            type="button"
            onClick={() => toggle(f.name)}
            className={[
                "flex items-center gap-2 w-full px-2 py-1.5 rounded-lg text-[12px] font-medium text-left transition-all duration-100",
                f.is_abnormal
                    ? "hover:bg-red-50 text-gray-700 hover:text-red-800"
                    : "hover:bg-[#edf5ff]/70 text-gray-700 hover:text-[#1268e8]",
            ].join(" ")}
        >
            <span className={[
                "w-[5px] h-[5px] rounded-full shrink-0 mt-px",
                f.is_abnormal ? "bg-red-400" : "bg-teal-500",
            ].join(" ")} />
            <span className="flex-1">{f.name}</span>
            {f.is_abnormal && (
                <span className="text-[9px] font-bold uppercase tracking-wider text-red-400 bg-red-50 border border-red-100 px-1.5 py-0.5 rounded-full">
                    abn
                </span>
            )}
        </button>
    );

    return (
        <section className="panel chip-panel findings-panel">

            {/* ── Header — identical to ChipSearchPanel section-head ── */}
            <div className="section-head">
                <div className="panel-title">
                    {/* Teal scope icon — matches HeartPulse on symptoms in color role */}
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

            {/* ── Search box — exact same .search-box class as ChipSearchPanel ── */}
            <div className="search-box">
                <Search size={17} />
                <input
                    ref={inputRef}
                    value={query}
                    placeholder="Search findings..."
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Escape") setQuery(""); }}
                />
                {/* No + button for findings — search only, no free-text add */}
                <span />
            </div>

            {/* ── Selected finding tags — teal tone ── */}
            {selectedFindings.length > 0 && (
                <div className="tag-row" style={{ marginTop: 8 }}>
                    {selectedFindings.map((f) => (
                        <span
                            key={f.id}
                            className={`tag ${f.is_abnormal ? "tag-red" : "tag-teal"}`}
                            style={{ display: "inline-flex", alignItems: "center", gap: 5 }}
                        >
                            <span style={{
                                width: 5, height: 5, borderRadius: "50%", flexShrink: 0,
                                background: f.is_abnormal ? "#f43f5e" : "#0d9488"
                            }} />
                            {f.name}
                            <button
                                type="button"
                                onClick={() => toggle(f.name)}
                                style={{ opacity: 0.45, lineHeight: 1, background: "none", border: "none", cursor: "pointer", padding: 0 }}
                                onMouseEnter={e => (e.currentTarget.style.opacity = "0.85")}
                                onMouseLeave={e => (e.currentTarget.style.opacity = "0.45")}
                            >
                                <X size={10} />
                            </button>
                        </span>
                    ))}
                </div>
            )}

            {/* ── Body ── */}
            <div style={{ marginTop: selectedFindings.length > 0 ? 10 : 8 }}>

                {/* Search results */}
                {searchResults !== null ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                        {searchResults.length === 0 ? (
                            <p className="findings-no-results">No findings match "{query}"</p>
                        ) : (
                            searchResults.map(renderFindingRow)
                        )}
                    </div>

                ) : selectedSymptoms.length > 0 ? (
                    /* ── Probable findings stub (symptoms selected, no DB yet) ── */
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        <p className="findings-section-label">Probable findings</p>
                        <div style={{
                            display: "flex", flexDirection: "column", gap: 2,
                            padding: "8px 10px",
                            borderRadius: 8,
                            background: "rgba(13,148,136,0.04)",
                            border: "1px dashed rgba(13,148,136,0.18)",
                        }}>
                            <p style={{ fontSize: 11.5, color: "var(--muted)", margin: 0, fontWeight: 600 }}>
                                Symptom-linked findings coming soon
                            </p>
                            <p style={{ fontSize: 11, color: "var(--faint)", margin: 0 }}>
                                DB wiring pending — see Handoff #0B
                            </p>
                        </div>
                        <button
                            type="button"
                            className="findings-advanced-btn"
                            onClick={() => setShowBrowse(v => !v)}
                        >
                            {showBrowse ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                            {showBrowse ? "Hide all findings" : "Browse all findings"}
                        </button>
                    </div>

                ) : (
                    /* ── Empty state (no symptoms selected) ── */
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "18px 0 12px" }}>
                        <StethoscopeIcon />
                        <div style={{ textAlign: "center" }}>
                            <p style={{ fontSize: 12, color: "var(--muted)", margin: 0, fontWeight: 600 }}>
                                No findings added yet
                            </p>
                            <p style={{ fontSize: 11, color: "var(--faint)", margin: "3px 0 0" }}>
                                Search above or browse by category
                            </p>
                        </div>
                        <button
                            type="button"
                            className="findings-advanced-btn"
                            onClick={() => setShowBrowse(v => !v)}
                        >
                            {showBrowse ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                            {showBrowse ? "Hide categories" : "Browse by category"}
                        </button>
                    </div>
                )}

                {/* Browse categories — shown via button in both states */}
                {searchResults === null && showBrowse && (
                    <div className="findings-advanced-body">
                        {Array.from(groups.entries()).map(([groupName, groupFindings]) => {
                            const unselected = groupFindings.filter((f) => !selected.includes(f.name));
                            if (!unselected.length) return null;
                            const isExpanded = expandedGroups.has(groupName);
                            const abnormal = unselected.filter((f) => f.is_abnormal);
                            const normal = unselected.filter((f) => !f.is_abnormal);

                            return (
                                <div key={groupName} className="findings-group">
                                    <button
                                        type="button"
                                        className="findings-group-header"
                                        onClick={() => toggleGroup(groupName)}
                                    >
                                        <span className="findings-group-label">{groupName}</span>
                                        <span className="findings-group-meta">
                                            {abnormal.length > 0 && (
                                                <span style={{
                                                    fontSize: 9, fontWeight: 700, color: "#d94040",
                                                    background: "rgba(217,64,64,0.08)",
                                                    border: "1px solid rgba(217,64,64,0.18)",
                                                    borderRadius: 999, padding: "1px 6px", marginRight: 4,
                                                }}>
                                                    {abnormal.length} abn
                                                </span>
                                            )}
                                            <span className="findings-group-count">{unselected.length}</span>
                                        </span>
                                        {isExpanded
                                            ? <ChevronUp size={11} />
                                            : <ChevronDown size={11} />
                                        }
                                    </button>

                                    {isExpanded && (
                                        <div style={{ paddingLeft: 4, paddingBottom: 4 }}>
                                            {abnormal.map(renderFindingRow)}
                                            {abnormal.length > 0 && normal.length > 0 && (
                                                <div style={{ height: 1, background: "var(--line-soft)", margin: "4px 8px" }} />
                                            )}
                                            {normal.map(renderFindingRow)}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </section>
    );
}