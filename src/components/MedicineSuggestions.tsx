import { Heart, Loader2, Plus, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { searchMedicinesDB, type DBMedicineSearchResult } from "../lib/db";
import type { Medicine } from "../types";
import { fuzzyFilter } from "../utils/filter";

type Props = {
  medicines: Medicine[];
  selectedIds: string[];
  loading?: boolean;
  onAdd: (medicine: Medicine) => void;
  favouriteIds: Set<number>;
  onToggleFavourite: (medicine: Medicine) => void;
  searchRef?: React.RefObject<HTMLInputElement>;
};

function dbResultToMedicine(r: DBMedicineSearchResult): Medicine {
  return {
    id: String(r.medicine_id),
    medicine_id: r.medicine_id,
    composition_ids: r.composition_ids,
    primary_composition_id: r.primary_composition_id,
    name: r.medicine_name,
    category: r.composition_names,
    use: "",
    match: 0,
    composition: r.composition_names,
  };
}

export function MedicineSuggestions({
  medicines, selectedIds, loading, onAdd, favouriteIds, onToggleFavourite, searchRef,
}: Props) {
  const [query, setQuery] = useState("");
  const [dbResults, setDbResults] = useState<Medicine[]>([]);
  const [dbLoading, setDbLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const internalRef = useRef<HTMLInputElement>(null);
  const inputRef = (searchRef ?? internalRef) as React.RefObject<HTMLInputElement>;

  const filteredRanked = useMemo(
    () => fuzzyFilter(medicines, query, (m) => m.name + " " + m.category),
    [medicines, query]
  );

  const rankedIds = useMemo(
    () => new Set(medicines.map((m) => m.id)),
    [medicines]
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < 2) { setDbResults([]); return; }

    debounceRef.current = setTimeout(async () => {
      setDbLoading(true);
      try {
        const raw = await searchMedicinesDB(query.trim());
        const deduped = raw
          .filter((r) => !rankedIds.has(String(r.medicine_id)))
          .map(dbResultToMedicine);
        setDbResults(deduped);
      } catch (e) {
        console.error("searchMedicinesDB failed:", e);
        setDbResults([]);
      } finally {
        setDbLoading(false);
      }
    }, 350);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, rankedIds]);

  useEffect(() => { if (!query) setDbResults([]); }, [query]);

  const hasQuery = query.trim().length > 0;
  const showRanked = !hasQuery || filteredRanked.length > 0;
  const showDbSection = hasQuery && (dbLoading || dbResults.length > 0);

  return (
    <section className="panel suggestions-panel">
      <div className="section-head">
        <div className="panel-title">
          <span className="ranked-rx-badge">Rx</span>
          <h2>Ranked Medicines</h2>
        </div>
        <span className="microcopy">
          {loading
            ? "Updating…"
            : medicines.length > 0
              ? `${medicines.length} matched`
              : "Select symptoms"}
        </span>
      </div>

      <div className="search-box medicine-search">
        <Search size={17} />
        <input
          ref={inputRef}
          value={query}
          placeholder="Search by name or composition..."
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setQuery("");
          }}
        />
        {hasQuery && (
          <button
            className="search-clear-btn"
            type="button"
            onClick={() => setQuery("")}
            aria-label="Clear search"
          >
            ×
          </button>
        )}
      </div>

      <div className={`medicine-suggestion-list${hasQuery ? " is-searching" : ""}`}>

        {loading ? (
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
        ) : medicines.length === 0 && !hasQuery ? (
          <div className="suggestions-empty">
            <span className="suggestions-empty-icon">Rx</span>
            <p>Add symptoms to see ranked medicines</p>
          </div>
        ) : showRanked ? (
          <>
            {hasQuery && filteredRanked.length > 0 && (
              <div className="med-section-label">Ranked matches</div>
            )}
            {filteredRanked.map((medicine, index) => {
              const added = selectedIds.includes(medicine.id);
              const isFav = favouriteIds.has(medicine.medicine_id);
              return (
                <MedicineRow
                  key={medicine.id}
                  medicine={medicine}
                  rank={index + 1}
                  added={added}
                  isFav={isFav}
                  showBar
                  onAdd={() => onAdd(medicine)}
                  onToggleFav={() => onToggleFavourite(medicine)}
                />
              );
            })}
          </>
        ) : null}

        {showDbSection && (
          <>
            <div className="med-section-label med-section-library">
              {dbLoading ? (
                <span className="med-lib-loading">
                  <Loader2 size={12} className="spin" /> Searching library…
                </span>
              ) : (
                `Library results (${dbResults.length})`
              )}
            </div>
            {!dbLoading && dbResults.map((medicine) => {
              const added = selectedIds.includes(medicine.id);
              const isFav = favouriteIds.has(medicine.medicine_id);
              return (
                <MedicineRow
                  key={medicine.id}
                  medicine={medicine}
                  rank={null}
                  added={added}
                  isFav={isFav}
                  showBar={false}
                  onAdd={() => onAdd(medicine)}
                  onToggleFav={() => onToggleFavourite(medicine)}
                />
              );
            })}
          </>
        )}

        {hasQuery && !loading && !dbLoading && filteredRanked.length === 0 && dbResults.length === 0 && (
          <div className="suggestions-empty">
            <p>No medicines found for "{query}"</p>
          </div>
        )}
      </div>
    </section>
  );
}

type RowProps = {
  medicine: Medicine;
  rank: number | null;
  added: boolean;
  isFav: boolean;
  showBar: boolean;
  onAdd: () => void;
  onToggleFav: () => void;
};

function MedicineRow({ medicine, rank, added, isFav, showBar, onAdd, onToggleFav }: RowProps) {
  return (
    <div
      className={`suggestion-row${added ? " already-added" : ""}${rank === null ? " lib-row" : ""}`}
      onClick={onAdd}
      role="button"
      tabIndex={-1}
      title={added ? "Already in prescription" : `Add ${medicine.name}`}
    >
      {rank !== null ? (
        <span className="rank">{rank}</span>
      ) : (
        <span className="rank rank-lib">○</span>
      )}
      <span className="suggestion-copy">
        <strong>{medicine.name}</strong>
        <small>{medicine.category}</small>
      </span>
      {showBar && (
        <span className="match">
          <span>{medicine.match}%</span>
          <i style={{ width: `${medicine.match}%` }} />
        </span>
      )}
      <div className="row-actions">
        <button
          className={`row-fav-btn${isFav ? " is-fav" : ""}`}
          type="button"
          onClick={(e) => { e.stopPropagation(); onToggleFav(); }}
          aria-label={isFav ? "Remove favourite" : "Add to favourites"}
          title={isFav ? "Remove favourite" : "Favourite"}
        >
          <Heart size={14} fill={isFav ? "currentColor" : "none"} />
        </button>
        {added ? (
          <span className="added-indicator" onClick={(e) => e.stopPropagation()}>✓</span>
        ) : (
          <button
            className="row-add-btn"
            type="button"
            onClick={(e) => { e.stopPropagation(); onAdd(); }}
            aria-label="Add medicine"
            title="Add to prescription"
          >
            <Plus size={15} />
          </button>
        )}
      </div>
    </div>
  );
}