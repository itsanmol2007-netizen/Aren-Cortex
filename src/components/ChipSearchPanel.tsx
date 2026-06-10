import { Plus, Search } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { fuzzyFilter } from "../utils/filter";
import { Tag } from "./Tag";
import type { SelectedSymptom } from "../types";

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
    className?: string;
    searchRef?: React.RefObject<HTMLInputElement>;
};

const INITIAL_SHOW = 8;

export function ChipSearchPanel({
    title, tone, icon, items, selected,
    selectedWithIntensity,
    collapsed, onToggleCollapsed, onChange,
    onChangeWithIntensity,
    className = "",
    searchRef,
}: Props) {
    const [query, setQuery] = useState("");
    const internalRef = useRef<HTMLInputElement>(null);
    const inputRef = (searchRef ?? internalRef) as React.RefObject<HTMLInputElement>;
    const [showAll, setShowAll] = useState(false);

    const filtered = useMemo(
        () => fuzzyFilter(items, query, (item) => item),
        [items, query]
    );

    const unselected = filtered.filter((item) => !selected.includes(item));
    const visible = query ? unselected : (showAll ? unselected : unselected.slice(0, INITIAL_SHOW));
    const hasMore = !query && !showAll && unselected.length > INITIAL_SHOW;

    const addItem = (value: string) => {
        const v = value.trim();
        if (!v || selected.includes(v)) return;

        if (onChangeWithIntensity && selectedWithIntensity) {
            onChangeWithIntensity([...selectedWithIntensity, { name: v, intensity: "moderate" }]);
        }
        onChange([...selected, v]);
        setQuery("");

        setTimeout(() => {
            const el = document.getElementById(`chip-${v}`);
            if (el) {
                el.classList.add("chip-selected-anim");
                setTimeout(() => el.classList.remove("chip-selected-anim"), 250);
            }
        }, 10);
    };

    const removeItem = (value: string) => {
        if (onChangeWithIntensity && selectedWithIntensity) {
            onChangeWithIntensity(selectedWithIntensity.filter((s) => s.name !== value));
        }
        onChange(selected.filter((s) => s !== value));
    };

    const updateIntensity = (name: string, intensity: SelectedSymptom["intensity"]) => {
        if (!onChangeWithIntensity || !selectedWithIntensity) return;
        onChangeWithIntensity(
            selectedWithIntensity.map((s) => s.name === name ? { ...s, intensity } : s)
        );
    };

    return (
        <section className={`panel chip-panel ${className} ${collapsed ? "collapsed" : ""}`.trim()}>
            <div className="section-head">
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
                    <div className="search-box">
                        <Search size={17} />
                        <input
                            value={query}
                            ref={inputRef}
                            placeholder={`Search ${title.toLowerCase()}...`}
                            onChange={(e) => setQuery(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                    e.preventDefault();
                                    if (filtered[0]) addItem(filtered[0]);
                                }
                                if (e.key === "Escape") setQuery("");
                            }}
                        />
                        <button type="button" onClick={() => addItem(query || filtered[0] || "")} aria-label={`Add ${title}`}>
                            <Plus size={18} />
                        </button>
                    </div>
                    <div className="tag-row">
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
                    <div className="compact-chip-row">
                        {visible.map((item) => (
                            <button key={item} type="button" onClick={() => addItem(item)}>
                                {item}
                            </button>
                        ))}
                        {hasMore && (
                            <button type="button" className="show-more-chip" onClick={() => setShowAll(true)}>
                                +{unselected.length - INITIAL_SHOW} more
                            </button>
                        )}
                        {showAll && !query && (
                            <button type="button" className="show-less-chip" onClick={() => setShowAll(false)}>
                                Show less
                            </button>
                        )}
                    </div>
                </>
            )}
        </section>
    );
}