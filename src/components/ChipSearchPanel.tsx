import { Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { fuzzyFilter } from "../utils/filter";
import { Tag } from "./Tag";

type Props = {
  title: string;
  tone: "blue" | "pink";
  icon: React.ReactNode;
  items: string[];
  selected: string[];
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  onChange: (items: string[]) => void;
  className?: string;
};

const INITIAL_SHOW = 8;

export function ChipSearchPanel({
  title, tone, icon, items, selected,
  collapsed, onToggleCollapsed, onChange, className = "",
}: Props) {
  const [query, setQuery] = useState("");
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
              placeholder={`Search ${title.toLowerCase()}...`}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addItem(query || filtered[0] || "");
                }
                if (e.key === "Escape") setQuery("");
              }}
            />
            <button type="button" onClick={() => addItem(query || filtered[0] || "")} aria-label={`Add ${title}`}>
              <Plus size={18} />
            </button>
          </div>

          <div className="tag-row">
            {selected.map((item) => (
              <Tag
                key={item}
                id={`chip-${item}`}
                label={item}
                tone={tone}
                onRemove={() => onChange(selected.filter((s) => s !== item))}
              />
            ))}
          </div>

          <div className="compact-chip-row">
            {visible.map((item) => (
              <button key={item} type="button" onClick={() => addItem(item)}>
                {item}
              </button>
            ))}
            {hasMore && (
              <button
                type="button"
                className="show-more-chip"
                onClick={() => setShowAll(true)}
              >
                +{unselected.length - INITIAL_SHOW} more
              </button>
            )}
            {showAll && !query && (
              <button
                type="button"
                className="show-more-chip show-less"
                onClick={() => setShowAll(false)}
              >
                Show less
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}