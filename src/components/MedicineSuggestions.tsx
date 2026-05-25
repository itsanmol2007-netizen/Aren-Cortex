import { Loader2, Plus, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { searchMedicinesDB, type DBMedicineSearchResult } from "../lib/db";
import type { Medicine } from "../types";
import { fuzzyFilter } from "../utils/filter";

type Props = {
  medicines: Medicine[];
  selectedIds: string[];
  loading?: boolean;
  onAdd: (medicine: Medicine) => void;
};

// Convert a DB search result into the Medicine UI shape
// score=0, match=0 since these aren't ranked
function dbResultToMedicine(r: DBMedicineSearchResult): Medicine {
  return {
    id: String(r.medicine_id),
    medicine_id: r.medicine_id,
    composition_id: r.primary_composition_id,
    name: r.medicine_name,
    category: r.composition_names,
    use: "",
    match: 0,
    composition: r.composition_names,
  };
}

export function MedicineSuggestions({ medicines, selectedIds, loading, onAdd }: Props) {
  const [query, setQuery] = useState("");
  const [dbResults, setDbResults] = useState<Medicine[]>([]);
  const [dbLoading, setDbLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Ranked results filtered by query (in-memory)
  const filteredRanked = useMemo(
    () => fuzzyFilter(medicines, query, (m) => m.name + " " + m.category),
    [medicines, query]
  );

  // IDs already in ranked results — used to deduplicate DB results
  const rankedIds = useMemo(
    () => new Set(medicines.map((m) => m.id)),
    [medicines]
  );

  // DB search — fires when query >= 2 chars, debounced 350ms
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (query.trim().length < 2) {
      setDbResults([]);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setDbLoading(true);
      try {
        const raw = await searchMedicinesDB(query.trim());
        // Exclude medicines already in ranked list
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

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, rankedIds]);

  // Clear DB results when query is cleared
  useEffect(() => {
    if (!query) setDbResults([]);
  }, [query]);

  const hasQuery = query.trim().length > 0;
  const showRanked = !hasQuery || filteredRanked.length > 0;
  const showDbSection = hasQuery && (dbLoading || dbResults.length > 0);

  // Flat list for Enter-key: ranked first, then DB
  const allVisible = [...filteredRanked, ...dbResults];

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
          value={query}
          placeholder="Search by name or composition..."
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && allVisible[0]) {
              e.preventDefault();
              if (!selectedIds.includes(allVisible[0].id)) {
                onAdd(allVisible[0]);
              }
              setQuery("");
            }
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

      <div className="medicine-suggestion-list">
        {/* ── RANKED RESULTS ───────────────────────────────── */}
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
              return (
                <MedicineRow
                  key={medicine.id}
                  medicine={medicine}
                  rank={index + 1}
                  added={added}
                  showBar
                  onAdd={() => !added && onAdd(medicine)}
                />
              );
            })}
          </>
        ) : null}

        {/* ── DB LIBRARY RESULTS ───────────────────────────── */}
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
            {!dbLoading &&
              dbResults.map((medicine) => {
                const added = selectedIds.includes(medicine.id);
                return (
                  <MedicineRow
                    key={medicine.id}
                    medicine={medicine}
                    rank={null}
                    added={added}
                    showBar={false}
                    onAdd={() => !added && onAdd(medicine)}
                  />
                );
              })}
          </>
        )}

        {/* ── NO RESULTS AT ALL ────────────────────────────── */}
        {hasQuery &&
          !loading &&
          !dbLoading &&
          filteredRanked.length === 0 &&
          dbResults.length === 0 && (
            <div className="suggestions-empty">
              <p>No medicines found for "{query}"</p>
            </div>
          )}
      </div>
    </section>
  );
}

// ── Sub-component: single medicine row ────────────────────────────────────────
type RowProps = {
  medicine: Medicine;
  rank: number | null;
  added: boolean;
  showBar: boolean;
  onAdd: () => void;
};

function MedicineRow({ medicine, rank, added, showBar, onAdd }: RowProps) {
  return (
    <button
      className={`suggestion-row ${added ? "already-added" : ""} ${rank === null ? "lib-row" : ""}`}
      type="button"
      onClick={onAdd}
      disabled={added}
    >
      {rank !== null ? (
        <span className="rank">{rank}</span>
      ) : (
        <span className="rank rank-lib">+</span>
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
      {added ? (
        <span className="added-indicator">✓</span>
      ) : (
        <span className="add-icon">
          <Plus size={18} />
        </span>
      )}
    </button>
  );
}