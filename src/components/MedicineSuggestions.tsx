import { Plus, Search, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import type { Medicine } from "../types";
import { fuzzyFilter } from "../utils/filter";

type MedicineSuggestionsProps = {
  medicines: Medicine[];
  selectedIds: string[];
  onAdd: (medicine: Medicine) => void;
};

export function MedicineSuggestions({ medicines, selectedIds, onAdd }: MedicineSuggestionsProps) {
  const [query, setQuery] = useState("");
  const filteredMedicines = useMemo(() => fuzzyFilter(medicines, query, (medicine) => medicine.name).slice(0, 7), [medicines, query]);

  return (
    <section className="panel suggestions-panel">
      <div className="section-head">
        <div className="panel-title">
          <Sparkles size={18} />
          <h2>Suggestions</h2>
        </div>
        <span className="microcopy">Ranked by relevance</span>
      </div>

      <div className="search-box medicine-search">
        <Search size={17} />
        <input
          value={query}
          placeholder="Search medicines..."
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && filteredMedicines[0]) {
              event.preventDefault();
              onAdd(filteredMedicines[0]);
              setQuery("");
            }
            if (event.key === "Escape") {
              setQuery("");
            }
          }}
        />
      </div>

      <div className="medicine-suggestion-list">
        {filteredMedicines.map((medicine, index) => {
          const alreadyAdded = selectedIds.includes(medicine.id);
          return (
            <button className="suggestion-row" key={medicine.id} type="button" onClick={() => onAdd(medicine)} disabled={alreadyAdded}>
              <span className="rank">{index + 1}</span>
              <span className="suggestion-copy">
                <strong>{medicine.name}</strong>
                <small>{medicine.category} · {medicine.use}</small>
              </span>
              <span className="match">
                <span>{medicine.match}% match</span>
                <i style={{ width: `${medicine.match}%` }} />
              </span>
              <span className="add-icon">
                <Plus size={18} />
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
