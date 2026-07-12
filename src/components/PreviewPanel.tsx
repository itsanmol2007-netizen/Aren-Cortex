import { useState, useMemo } from "react";
import { FlaskConical, Search, FileText, X, Plus } from "lucide-react";
import { Tag } from "./Tag";
import { labs } from "../data/mockData";
import type { TestGroup } from "../types";

type PreviewPanelProps = {
  testGroups: TestGroup[];
  selectedTests: string[];
  selectedLab: string;
  onTestsChange: (tests: string[]) => void;
  onLabChange: (lab: string) => void;
  onReviewRx: () => void;
  searchRef?: React.RefObject<HTMLInputElement | null>;
};

export function PreviewPanel({
  testGroups,
  selectedTests,
  selectedLab,
  onTestsChange,
  onLabChange,
  onReviewRx,
  searchRef,
}: PreviewPanelProps) {
  const [query, setQuery] = useState("");

  const toggleTest = (name: string) => {
    if (selectedTests.includes(name)) {
      onTestsChange(selectedTests.filter((t) => t !== name));
    } else {
      onTestsChange([...selectedTests, name]);
    }
  };

  // When searching: flatten all tests and filter
  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    const all = testGroups.flatMap((g) => g.tests);
    return all.filter((t) => t.name.toLowerCase().includes(q));
  }, [query, testGroups]);

  return (
    <aside className="sidebar-column">
      <section className="panel sidebar-tests-panel">

        {/* Header */}
        <div className="section-head">
          <div className="panel-title">
            <FlaskConical size={15} />
            <h2>Tests & Lab</h2>
          </div>
          {selectedTests.length > 0 && (
            <span className="selected-count">{selectedTests.length} selected</span>
          )}
        </div>

        {/* Search */}
        <div className="tests-search-box">
          <Search size={13} className="tests-search-icon" />
          <input
            ref={searchRef}
            className="tests-search-input"
            placeholder="Search tests..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button
              className="tests-search-clear"
              onClick={() => setQuery("")}
              type="button"
            >
              <X size={11} />
            </button>
          )}
        </div>

        {/* Groups or search results */}
        <div className="test-groups-scroll">
          {searchResults ? (
            // Search mode: flat filtered list, no group headers
            <div className="test-group">
              {searchResults.length === 0 ? (
                <p className="tests-no-results">No tests match "{query}"</p>
              ) : (
                <div className="tg-chip-row">
                  {searchResults.map((t) => {
                    const selected = selectedTests.includes(t.name);
                    return (
                      <button
                        key={t.name}
                        type="button"
                        className={`tg-chip${t.rare ? " rare" : ""}${selected ? " selected" : ""}`}
                        onClick={() => toggleTest(t.name)}
                      >
                        {selected ? <X size={9} /> : <Plus size={9} />}
                        {t.name}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            // Normal grouped mode
            testGroups.map((group) => (
              <div key={group.id} className="test-group">
                <div className="test-group-divider">
                  <span className="test-group-icon">{group.icon}</span>
                  <span className="test-group-label">{group.label}</span>
                </div>
                <div className="tg-chip-row">
                  {group.tests.map((t) => {
                    const selected = selectedTests.includes(t.name);
                    return (
                      <button
                        key={t.name}
                        type="button"
                        className={`tg-chip${t.rare ? " rare" : ""}${selected ? " selected" : ""}`}
                        onClick={() => toggleTest(t.name)}
                      >
                        {selected ? <X size={9} /> : <Plus size={9} />}
                        {t.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Selected tests as removable tags */}
        {selectedTests.length > 0 && (
          <div className="selected-tests-strip">
            <span className="selected-tests-label">Selected</span>
            <div className="tag-row" style={{ marginTop: 4 }}>
              {selectedTests.map((test) => (
                <Tag
                  key={test}
                  label={test}
                  tone="violet"
                  onRemove={() => onTestsChange(selectedTests.filter((t) => t !== test))}
                />
              ))}
            </div>
          </div>
        )}

        {/* Lab selector */}
        <div className="sidebar-lab-field">
          <label className="sidebar-lab-label">Preferred lab</label>
          <select
            className="sidebar-lab-select"
            value={selectedLab}
            onChange={(e) => onLabChange(e.target.value)}
          >
            {labs.map((lab) => (
              <option key={lab}>{lab}</option>
            ))}
          </select>
        </div>

      </section>

      {/* Review button */}
      <button type="button" className="review-rx-btn" onClick={onReviewRx}>
        <FileText size={15} />
        Review Prescription
      </button>
    </aside>
  );
}