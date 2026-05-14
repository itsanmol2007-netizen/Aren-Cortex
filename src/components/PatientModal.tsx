import { Search, UserCheck, X } from "lucide-react";
import { useMemo, useState } from "react";
import type { Gender, Patient } from "../types";

type PatientModalProps = {
  patients: Patient[];
  onClose: () => void;
  onConfirm: (patient: Patient) => void;
};

const emptyDraft: Patient = {
  name: "",
  age: "",
  gender: "",
  phone: "",
  address: "",
};

export function PatientModal({ patients, onClose, onConfirm }: PatientModalProps) {
  const [draft, setDraft] = useState<Patient>(emptyDraft);
  const [matchedPatient, setMatchedPatient] = useState<Patient | null>(null);
  const [mode, setMode] = useState<"search" | "create">("search");
  const [searchQuery, setSearchQuery] = useState("");

  const searchMatches = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q || q.length < 2) return [];
    return patients
      .filter((p) => p.name.toLowerCase().includes(q) || p.phone.includes(q))
      .slice(0, 5);
  }, [patients, searchQuery]);

  const handlePhoneChange = (phone: string) => {
    setDraft((d) => ({ ...d, phone }));
    const match = patients.find((p) => p.phone === phone.trim());
    setMatchedPatient(match ?? null);
  };

  const handleConfirm = () => {
    const name = draft.name.trim();
    const phone = draft.phone.trim();
    if (!name || !phone) return;
    onConfirm({ ...draft, name, phone });
  };

  return (
    <div className="patient-modal-overlay" role="dialog" aria-modal="true" aria-label="Patient intake">
      <button className="overlay-backdrop" type="button" onClick={onClose} aria-label="Close" />

      <div className="patient-modal">

        {/* Header */}
        <div className="patient-modal-head">
          <div>
            <span className="modal-eyebrow">Patient intake</span>
            <h3>Find or create patient</h3>
          </div>
          <button className="patient-modal-close" type="button" onClick={onClose}>
            <X size={15} />
          </button>
        </div>

        {/* Mode toggle */}
        <div className="modal-mode-toggle">
          <button
            type="button"
            className={mode === "search" ? "active" : ""}
            onClick={() => setMode("search")}
          >
            Search existing
          </button>
          <button
            type="button"
            className={mode === "create" ? "active" : ""}
            onClick={() => setMode("create")}
          >
            Create new
          </button>
        </div>

        {/* SEARCH MODE */}
        {mode === "search" && (
          <div className="modal-section">
            <div className="modal-search-box">
              <Search size={15} />
              <input
                autoFocus
                value={searchQuery}
                placeholder="Search by name or phone number..."
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            {searchQuery.length >= 2 && searchMatches.length === 0 && (
              <p className="modal-no-results">
                No patient found.{" "}
                <button type="button" onClick={() => setMode("create")}>
                  Create new patient
                </button>
              </p>
            )}

            {searchMatches.length > 0 && (
              <div className="modal-match-list">
                {searchMatches.map((p) => (
                  <button
                    key={p.phone}
                    type="button"
                    className="modal-match-row"
                    onClick={() => onConfirm(p)}
                  >
                    <div className="modal-match-avatar">
                      {p.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                    </div>
                    <div className="modal-match-info">
                      <strong>{p.name}</strong>
                      <span>{p.age}y · {p.gender} · {p.phone}</span>
                    </div>
                    <UserCheck size={15} className="modal-match-icon" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* CREATE MODE */}
        {mode === "create" && (
          <div className="modal-section">

            {/* Phone first — duplicate detection */}
            <div className="modal-field-group">
              <label className="modal-field">
                <span>Phone number <em>*</em></span>
                <input
                  autoFocus
                  inputMode="tel"
                  maxLength={10}
                  value={draft.phone}
                  placeholder="10-digit mobile number"
                  onChange={(e) => handlePhoneChange(e.target.value)}
                />
              </label>
            </div>

            {/* Duplicate warning */}
            {matchedPatient && (
              <div className="modal-duplicate-card">
                <div className="duplicate-label">Patient already exists</div>
                <div className="duplicate-patient-row">
                  <div className="modal-match-avatar">
                    {matchedPatient.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                  </div>
                  <div className="modal-match-info">
                    <strong>{matchedPatient.name}</strong>
                    <span>{matchedPatient.age}y · {matchedPatient.gender} · {matchedPatient.phone}</span>
                  </div>
                </div>
                <div className="duplicate-actions">
                  <button type="button" className="btn-use-existing" onClick={() => onConfirm(matchedPatient)}>
                    Use this patient
                  </button>
                  <button type="button" className="btn-create-anyway" onClick={() => setMatchedPatient(null)}>
                    Create new anyway
                  </button>
                </div>
              </div>
            )}

            {/* Rest of fields — only show if no duplicate blocking */}
            {!matchedPatient && (
              <>
                <div className="modal-field-row">
                  <label className="modal-field">
                    <span>Full name <em>*</em></span>
                    <input
                      value={draft.name}
                      placeholder="Patient full name"
                      onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                    />
                  </label>
                </div>

                <div className="modal-field-row two-col">
                  <label className="modal-field">
                    <span>Age <em>*</em></span>
                    <input
                      inputMode="numeric"
                      maxLength={3}
                      value={draft.age}
                      placeholder="e.g. 34"
                      onChange={(e) => setDraft((d) => ({ ...d, age: e.target.value }))}
                    />
                  </label>
                  <label className="modal-field">
                    <span>Sex <em>*</em></span>
                    <select
                      value={draft.gender}
                      onChange={(e) => setDraft((d) => ({ ...d, gender: e.target.value as Gender }))}
                    >
                      <option value="">Select</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                    </select>
                  </label>
                </div>

                <div className="modal-field-row">
                  <label className="modal-field">
                    <span>Address <span className="optional-tag">optional</span></span>
                    <input
                      value={draft.address ?? ""}
                      placeholder="Street, locality, city"
                      onChange={(e) => setDraft((d) => ({ ...d, address: e.target.value }))}
                    />
                  </label>
                </div>

                <div className="modal-actions">
                  <button type="button" className="btn-modal-cancel" onClick={onClose}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn-modal-confirm"
                    disabled={!draft.name.trim() || !draft.phone.trim() || !draft.gender}
                    onClick={handleConfirm}
                  >
                    Start consult
                  </button>
                </div>
              </>
            )}
          </div>
        )}

      </div>
    </div>
  );
}