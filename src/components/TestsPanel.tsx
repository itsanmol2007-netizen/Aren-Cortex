import { FlaskConical, Search, X, ChevronDown } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { TEST_CATALOGUE, COMMON_TESTS, PREFERRED_LABS } from "../data/testsCatalogue";
import { Tag } from "./Tag";

type TestsPanelProps = {
  selectedTests: string[];
  selectedLab: string;
  onTestsChange: (tests: string[]) => void;
  onLabChange: (lab: string) => void;
  searchRef?: React.RefObject<HTMLInputElement | null>;
};

export function TestsPanel({ selectedTests, selectedLab, onTestsChange, onLabChange, searchRef }: TestsPanelProps) {
  const [query, setQuery] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [labOpen, setLabOpen] = useState(false);
  const internalRef = useRef<HTMLInputElement>(null);
  const inputRef = searchRef || internalRef;

  const filtered = useMemo(() => {
    if (!query.trim()) return COMMON_TESTS;
    const q = query.toLowerCase();
    return TEST_CATALOGUE.filter((t) =>
      t.name.toLowerCase().includes(q) || t.category.toLowerCase().includes(q)
    );
  }, [query]);

  const grouped = useMemo(() => {
    const map: Record<string, typeof filtered> = {};
    filtered.forEach((t) => {
      if (!map[t.category]) map[t.category] = [];
      map[t.category].push(t);
    });
    return map;
  }, [filtered]);

  const addTest = (name: string) => {
    if (!selectedTests.includes(name)) {
      onTestsChange([...selectedTests, name]);
    }
  };

  const removeTest = (name: string) => {
    onTestsChange(selectedTests.filter((t) => t !== name));
  };

  return (
    <section className="panel tests-panel" style={{ position: "relative" }}>
      {/* Header */}
      <div className="section-head">
        <div className="panel-title">
          <FlaskConical size={18} />
          <h2>Tests & Lab</h2>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {/* Preferred lab button */}
          <div style={{ position: "relative" }}>
            <button
              type="button"
              onClick={() => setLabOpen((v) => !v)}
              style={{
                fontSize: "11px",
                fontWeight: 600,
                color: "var(--muted)",
                background: "var(--bg)",
                border: "1px solid var(--line)",
                borderRadius: "6px",
                padding: "3px 8px",
                display: "flex",
                alignItems: "center",
                gap: "4px",
                cursor: "pointer",
              }}
            >
              {selectedLab || "Set lab"}
              <ChevronDown size={11} />
            </button>
            {labOpen && (
              <div style={{
                position: "absolute",
                top: "calc(100% + 4px)",
                right: 0,
                background: "var(--surface-solid)",
                border: "1px solid var(--line)",
                borderRadius: "8px",
                boxShadow: "var(--shadow-active)",
                zIndex: 50,
                minWidth: "160px",
                overflow: "hidden",
              }}>
                {PREFERRED_LABS.map((lab) => (
                  <button
                    key={lab}
                    type="button"
                    onClick={() => { onLabChange(lab); setLabOpen(false); }}
                    style={{
                      display: "block",
                      width: "100%",
                      textAlign: "left",
                      padding: "8px 12px",
                      fontSize: "12.5px",
                      background: selectedLab === lab ? "var(--blue-soft)" : "transparent",
                      color: selectedLab === lab ? "var(--blue)" : "var(--text)",
                      fontWeight: selectedLab === lab ? 600 : 400,
                      border: "none",
                      cursor: "pointer",
                    }}
                  >
                    {lab}
                  </button>
                ))}
              </div>
            )}
          </div>
          <span className="selected-count">{selectedTests.length} selected</span>
        </div>
      </div>

      {/* Search box */}
      <div className="search-box">
        <Search size={17} />
        <input
          ref={inputRef}
          value={query}
          placeholder="Search tests..."
          onChange={(e) => { setQuery(e.target.value); setDropdownOpen(true); }}
          onFocus={() => setDropdownOpen(true)}
          onKeyDown={(e) => { if (e.key === "Escape") { setDropdownOpen(false); setQuery(""); } }}
        />
        {query && (
          <button type="button" onClick={() => { setQuery(""); inputRef.current?.focus(); }} aria-label="Clear">
            <X size={16} />
          </button>
        )}
        {!query && <span />}
      </div>

      {/* Selected test chips */}
      {selectedTests.length > 0 && (
        <div className="tag-row">
          {selectedTests.map((test) => (
            <Tag key={test} label={test} tone="violet" onRemove={() => removeTest(test)} />
          ))}
        </div>
      )}

      {/* Floating dropdown */}
      {dropdownOpen && (
        <>
          {/* Backdrop to close */}
          <div
            style={{ position: "fixed", inset: 0, zIndex: 39 }}
            onClick={() => setDropdownOpen(false)}
          />
          <div style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            background: "var(--surface-solid)",
            border: "1px solid var(--line)",
            borderRadius: "10px",
            boxShadow: "var(--shadow-active)",
            zIndex: 40,
            maxHeight: "280px",
            overflowY: "auto",
            padding: "6px 0",
          }}>
            {Object.entries(grouped).map(([category, tests]) => (
              <div key={category}>
                <div style={{
                  padding: "6px 12px 4px",
                  fontSize: "10px",
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "var(--muted)",
                }}>
                  {category}
                </div>
                {tests.map((test) => {
                  const isSelected = selectedTests.includes(test.name);
                  return (
                    <button
                      key={test.id}
                      type="button"
                      onClick={() => { addTest(test.name); setQuery(""); }}
                      disabled={isSelected}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        width: "100%",
                        padding: "7px 12px",
                        fontSize: "13px",
                        background: isSelected ? "var(--blue-soft)" : "transparent",
                        color: isSelected ? "var(--blue)" : "var(--text)",
                        border: "none",
                        cursor: isSelected ? "default" : "pointer",
                        textAlign: "left",
                      }}
                    >
                      <span>{test.name}</span>
                      {isSelected && <span style={{ fontSize: "11px", color: "var(--blue)", fontWeight: 600 }}>✓ Added</span>}
                    </button>
                  );
                })}
              </div>
            ))}
            {filtered.length === 0 && (
              <div style={{ padding: "16px 12px", fontSize: "13px", color: "var(--muted)", textAlign: "center" }}>
                No tests found for "{query}"
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}