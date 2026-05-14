import { Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { fuzzyFilter } from "../utils/filter";
import { Tag } from "./Tag";

type ChipSearchPanelProps = {
  title: string;
  tone: "blue" | "pink";
  icon: React.ReactNode;
  items: string[];
  selected: string[];
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  onChange: (items: string[]) => void;
};

export function ChipSearchPanel({ title, tone, icon, items, selected, collapsed, onToggleCollapsed, onChange }: ChipSearchPanelProps) {
  const [query, setQuery] = useState("");
  const filteredItems = useMemo(() => fuzzyFilter(items, query, (item) => item).slice(0, 8), [items, query]);

  const addItem = (value: string) => {
    const normalized = value.trim();
    if (!normalized || selected.includes(normalized)) {
      return;
    }
    onChange([...selected, normalized]);
    setQuery("");
  };

  return (
    <section className={`panel chip-panel ${collapsed ? "collapsed" : ""}`}>
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
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addItem(query || filteredItems[0] || "");
                }
                if (event.key === "Escape") {
                  setQuery("");
                }
              }}
            />
            <button type="button" onClick={() => addItem(query || filteredItems[0] || "")} aria-label={`Add ${title}`}>
              <Plus size={18} />
            </button>
          </div>

          <div className="tag-row">
            {selected.map((item) => (
              <Tag key={item} label={item} tone={tone} onRemove={() => onChange(selected.filter((selectedItem) => selectedItem !== item))} />
            ))}
          </div>

          <div className="compact-chip-row">
            {filteredItems
              .filter((item) => !selected.includes(item))
              .map((item) => (
                <button key={item} type="button" onClick={() => addItem(item)}>
                  {item}
                </button>
              ))}
          </div>
        </>
      )}
    </section>
  );
}
