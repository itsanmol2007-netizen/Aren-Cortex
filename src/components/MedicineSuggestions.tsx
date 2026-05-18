import { Loader2, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import type { Medicine } from "../types";
import { fuzzyFilter } from "../utils/filter";

type Props = {
  medicines: Medicine[];
  selectedIds: string[];
  loading?: boolean;
  onAdd: (medicine: Medicine) => void;
};

export function MedicineSuggestions({ medicines, selectedIds, loading, onAdd }: Props) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(
    () => fuzzyFilter(medicines, query, (m) => m.name).slice(0, 7),
    [medicines, query]
  );

  return (
    <section className="panel suggestions-panel">
      <div className="section-head">
        <div className="panel-title">
          <span className="ranked-rx-badge">Rx</span>
          <h2>Ranked Medicines</h2>
        </div>
        <span className="microcopy">
          {loading ? "Updating…" : medicines.length > 0 ? `${medicines.length} matched` : "Select symptoms"}
        </span>
      </div>

      <div className="search-box medicine-search">
        <Search size={17} />
        <input
          value={query}
          placeholder="Search by name or composition..."
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && filtered[0]) {
              e.preventDefault();
              onAdd(filtered[0]);
              setQuery("");
            }
            if (e.key === "Escape") setQuery("");
          }}
        />
      </div>

      <div className="medicine-suggestion-list">
        {loading ? (
          // Loading skeleton
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="suggestion-skeleton">
              <div className="skel-rank" />
              <div className="skel-body">
                <div className="skel-line skel-name" />
                <div className="skel-line skel-sub" />
              </div>
              <div className="skel-bar" />
            </div>
          ))
        ) : medicines.length === 0 ? (
          <div className="suggestions-empty">
            <span className="suggestions-empty-icon">Rx</span>
            <p>Add symptoms to see ranked medicines</p>
          </div>
        ) : (
          filtered.map((medicine, index) => {
            const added = selectedIds.includes(medicine.id);
            return (
              <button
                key={medicine.id}
                className={`suggestion-row ${added ? "already-added" : ""}`}
                type="button"
                onClick={() => !added && onAdd(medicine)}
                disabled={added}
              >
                <span className="rank">{index + 1}</span>
                <span className="suggestion-copy">
                  <strong>{medicine.name}</strong>
                  <small>{medicine.category}</small>
                </span>
                <span className="match">
                  <span>{medicine.match}%</span>
                  <i style={{ width: `${medicine.match}%` }} />
                </span>
                {added ? (
                  <span className="added-indicator">✓</span>
                ) : (
                  <span className="add-icon"><Plus size={18} /></span>
                )}
              </button>
            );
          })
        )}
      </div>
    </section>
  );
}