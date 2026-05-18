import { ChevronDown, ChevronUp, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import type { DBFinding } from "../lib/db";
import { Tag } from "./Tag";

type Props = {
    findings: DBFinding[];
    selected: string[];
    collapsed?: boolean;
    onToggleCollapsed?: () => void;
    onChange: (items: string[]) => void;
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

// Pick quick findings: up to 3 abnormal per key group, prioritizing abnormal
const QUICK_GROUPS = ["General", "Respiratory", "GI / Abdomen", "ENT", "Cardiovascular"];
const QUICK_PER_GROUP = 3;

export function FindingsPanel({
    findings, selected, collapsed, onToggleCollapsed, onChange,
}: Props) {
    const [query, setQuery] = useState("");
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

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

    // Quick findings: take up to QUICK_PER_GROUP abnormal-first from each quick group
    const quickFindings = useMemo(() => {
        const result: DBFinding[] = [];
        QUICK_GROUPS.forEach((groupName) => {
            const groupFindings = groups.get(groupName) ?? [];
            const abnormal = groupFindings.filter((f) => f.is_abnormal);
            const normal = groupFindings.filter((f) => !f.is_abnormal);
            const picked = [...abnormal, ...normal].slice(0, QUICK_PER_GROUP);
            result.push(...picked);
        });
        return result;
    }, [groups]);

    const searchResults = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return null;
        return findings.filter((f) => f.name.toLowerCase().includes(q));
    }, [findings, query]);

    const toggle = (name: string) => {
        if (selected.includes(name)) {
            onChange(selected.filter((s) => s !== name));
        } else {
            onChange([...selected, name]);
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

    const renderChip = (f: DBFinding) => {
        const isSelected = selected.includes(f.name);
        return (
            <button
                key={f.id}
                type="button"
                className={[
                    "finding-chip",
                    f.is_abnormal ? "finding-abnormal" : "finding-normal",
                    isSelected ? "finding-selected" : "",
                ].filter(Boolean).join(" ")}
                onClick={() => toggle(f.name)}
            >
                <span className={`finding-dot ${f.is_abnormal ? "abnormal-dot" : "normal-dot"}`} />
                {f.name}
                {isSelected && <X size={9} style={{ marginLeft: 3, opacity: 0.7 }} />}
            </button>
        );
    };

    return (
        <section className={`panel chip-panel findings-panel ${collapsed ? "collapsed" : ""}`.trim()}>
            <div className="section-head">
                <div className="panel-title">
                    <span style={{ fontSize: 15 }}>🔬</span>
                    <h2>Findings</h2>
                </div>
                <button className="selected-count" type="button" onClick={onToggleCollapsed}>
                    {selected.length} selected
                </button>
            </div>

            {!collapsed && (
                <>
                    <div className="search-box">
                        <Search size={17} />
                        <input
                            value={query}
                            placeholder="Search findings..."
                            onChange={(e) => setQuery(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Escape") setQuery(""); }}
                        />
                        {query && (
                            <button type="button" onClick={() => setQuery("")}
                                style={{ background: "none", border: "none", cursor: "pointer", padding: "0 4px", color: "var(--muted)" }}>
                                <X size={13} />
                            </button>
                        )}
                    </div>

                    {selected.length > 0 && (
                        <div className="findings-selected-strip">
                            {selected.map((name) => {
                                const f = findings.find((x) => x.name === name);
                                return (
                                    <Tag
                                        key={name}
                                        label={name}
                                        tone={f?.is_abnormal ? "pink" : "blue"}
                                        onRemove={() => toggle(name)}
                                    />
                                );
                            })}
                        </div>
                    )}

                    {searchResults ? (
                        <div className="findings-chip-row">
                            {searchResults.length === 0
                                ? <span className="findings-no-results">No findings match "{query}"</span>
                                : searchResults.filter((f) => !selected.includes(f.name)).map(renderChip)
                            }
                        </div>
                    ) : (
                        <>
                            <div className="findings-section-label">Quick access</div>
                            <div className="findings-chip-row">
                                {quickFindings.filter((f) => !selected.includes(f.name)).map(renderChip)}
                            </div>

                            <button
                                type="button"
                                className="findings-advanced-btn"
                                onClick={() => setShowAdvanced((v) => !v)}
                            >
                                {showAdvanced ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                {showAdvanced ? "Hide advanced" : "Advanced findings"}
                            </button>

                            {showAdvanced && (
                                <div className="findings-advanced-body">
                                    {Array.from(groups.entries()).map(([groupName, groupFindings]) => {
                                        const unselected = groupFindings.filter((f) => !selected.includes(f.name));
                                        if (!unselected.length) return null;
                                        const isExpanded = expandedGroups.has(groupName);
                                        return (
                                            <div key={groupName} className="findings-group">
                                                <button
                                                    type="button"
                                                    className="findings-group-header"
                                                    onClick={() => toggleGroup(groupName)}
                                                >
                                                    <span className="findings-group-label">{groupName}</span>
                                                    <span className="findings-group-meta">
                                                        <span className="findings-group-count">{unselected.length}</span>
                                                        {isExpanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                                                    </span>
                                                </button>
                                                {isExpanded && (
                                                    <div className="findings-chip-row">
                                                        {unselected.map(renderChip)}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </>
                    )}
                </>
            )}
        </section>
    );
}