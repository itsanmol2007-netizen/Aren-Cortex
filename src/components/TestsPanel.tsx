import { FlaskConical, Plus } from "lucide-react";
import { labs } from "../data/mockData";
import { Tag } from "./Tag";

type TestsPanelProps = {
  tests: string[];
  selectedTests: string[];
  selectedLab: string;
  onTestsChange: (tests: string[]) => void;
  onLabChange: (lab: string) => void;
};

export function TestsPanel({ tests, selectedTests, selectedLab, onTestsChange, onLabChange }: TestsPanelProps) {
  const addTest = (test: string) => {
    if (!selectedTests.includes(test)) {
      onTestsChange([...selectedTests, test]);
    }
  };

  return (
    <section className="panel tests-panel">
      <div className="section-head">
        <div className="panel-title">
          <FlaskConical size={18} />
          <h2>Tests & Lab</h2>
        </div>
        <span className="selected-count">{selectedTests.length} selected</span>
      </div>

      <div className="compact-chip-row">
        {tests.map((test) => (
          <button key={test} type="button" onClick={() => addTest(test)} disabled={selectedTests.includes(test)}>
            <Plus size={13} />
            {test}
          </button>
        ))}
      </div>

      <div className="tag-row">
        {selectedTests.map((test) => (
          <Tag key={test} label={test} tone="violet" onRemove={() => onTestsChange(selectedTests.filter((selectedTest) => selectedTest !== test))} />
        ))}
      </div>

      <label className="lab-select">
        <span>Preferred lab</span>
        <select value={selectedLab} onChange={(event) => onLabChange(event.target.value)}>
          {labs.map((lab) => (
            <option key={lab}>{lab}</option>
          ))}
        </select>
      </label>
    </section>
  );
}
