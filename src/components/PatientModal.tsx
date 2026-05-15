import { Search, UserCheck, X, User, Phone, MapPin, Sparkles } from "lucide-react";
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

  // Phone handler: strip leading +91 or 0, then check for duplicates
  const handlePhoneChange = (raw: string) => {
    // Only allow digits
    const digits = raw.replace(/\D/g, "").slice(0, 10);
    setDraft((d) => ({ ...d, phone: digits }));
    if (digits.length === 10) {
      const match = patients.find((p) => p.phone.replace(/\D/g, "").slice(-10) === digits);
      setMatchedPatient(match ?? null);
    } else {
      setMatchedPatient(null);
    }
  };

  const handleConfirm = () => {
    const name = draft.name.trim();
    const phone = draft.phone.trim();
    if (!name || !phone || !draft.gender) return;
    onConfirm({ ...draft, name, phone });
  };

  const isFormValid = draft.name.trim() && draft.phone.length === 10 && draft.gender;

  return (
    <div className="pm-overlay" role="dialog" aria-modal="true" aria-label="Patient intake">
      <button className="pm-backdrop" type="button" onClick={onClose} aria-label="Close" />

      <div className="pm-card">

        {/* Decorative top stripe */}
        <div className="pm-top-stripe" />

        {/* Header */}
        <div className="pm-header">
          <div className="pm-header-left">
            <div className="pm-header-icon">
              <Sparkles size={14} />
            </div>
            <div>
              <p className="pm-eyebrow">Patient intake</p>
              <h3 className="pm-title">Find or create patient</h3>
            </div>
          </div>
          <button className="pm-close-btn" type="button" onClick={onClose} aria-label="Close">
            <X size={14} />
          </button>
        </div>

        {/* Mode toggle */}
        <div className="pm-toggle">
          <button
            type="button"
            className={`pm-toggle-btn ${mode === "search" ? "active" : ""}`}
            onClick={() => setMode("search")}
          >
            Search existing
          </button>
          <button
            type="button"
            className={`pm-toggle-btn ${mode === "create" ? "active" : ""}`}
            onClick={() => setMode("create")}
          >
            New patient
          </button>
        </div>

        {/* ── SEARCH MODE ── */}
        {mode === "search" && (
          <div className="pm-section">
            <div className="pm-search-box">
              <Search size={14} className="pm-search-icon" />
              <input
                autoFocus
                value={searchQuery}
                placeholder="Search by name or phone number…"
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pm-search-input"
              />
            </div>

            {searchQuery.length >= 2 && searchMatches.length === 0 && (
              <p className="pm-no-results">
                No patient found.{" "}
                <button type="button" className="pm-link-btn" onClick={() => setMode("create")}>
                  Create new patient →
                </button>
              </p>
            )}

            {searchMatches.length > 0 && (
              <div className="pm-match-list">
                {searchMatches.map((p) => (
                  <button
                    key={p.phone}
                    type="button"
                    className="pm-match-row"
                    onClick={() => onConfirm(p)}
                  >
                    <div className="pm-avatar">
                      {p.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                    </div>
                    <div className="pm-match-info">
                      <strong>{p.name}</strong>
                      <span>{p.age}y · {p.gender} · +91 {p.phone}</span>
                    </div>
                    <UserCheck size={14} className="pm-match-check" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── CREATE MODE ── */}
        {mode === "create" && (
          <div className="pm-section">

            {/* 1. Full name — FIRST */}
            <div className="pm-field">
              <label className="pm-label">
                <User size={12} className="pm-label-icon" />
                Full name <span className="pm-required">*</span>
              </label>
              <input
                autoFocus
                className="pm-input"
                value={draft.name}
                placeholder="Patient's full name"
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              />
            </div>

            {/* 2. Age + Sex row */}
            <div className="pm-row-two">
              <div className="pm-field">
                <label className="pm-label">
                  Age <span className="pm-required">*</span>
                </label>
                <input
                  className="pm-input"
                  inputMode="numeric"
                  maxLength={3}
                  value={draft.age}
                  placeholder="e.g. 34"
                  onChange={(e) => setDraft((d) => ({ ...d, age: e.target.value.replace(/\D/g, "") }))}
                />
              </div>
              <div className="pm-field">
                <label className="pm-label">
                  Sex <span className="pm-required">*</span>
                </label>
                <select
                  className="pm-input pm-select"
                  value={draft.gender}
                  onChange={(e) => setDraft((d) => ({ ...d, gender: e.target.value as Gender }))}
                >
                  <option value="">Select</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>

            {/* 3. Phone — with +91 prefix */}
            <div className="pm-field">
              <label className="pm-label">
                <Phone size={12} className="pm-label-icon" />
                Phone number <span className="pm-required">*</span>
              </label>
              <div className="pm-phone-row">
                <span className="pm-phone-prefix">+91</span>
                <input
                  className="pm-input pm-phone-input"
                  inputMode="tel"
                  maxLength={10}
                  value={draft.phone}
                  placeholder="10-digit mobile"
                  onChange={(e) => handlePhoneChange(e.target.value)}
                />
              </div>
            </div>

            {/* Duplicate warning */}
            {matchedPatient && (
              <div className="pm-duplicate-card">
                <p className="pm-duplicate-label">⚠ Patient already exists</p>
                <div className="pm-duplicate-row">
                  <div className="pm-avatar pm-avatar-warn">
                    {matchedPatient.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                  </div>
                  <div className="pm-match-info">
                    <strong>{matchedPatient.name}</strong>
                    <span>{matchedPatient.age}y · {matchedPatient.gender} · +91 {matchedPatient.phone}</span>
                  </div>
                </div>
                <div className="pm-duplicate-actions">
                  <button type="button" className="pm-btn-primary" onClick={() => onConfirm(matchedPatient)}>
                    Use this patient
                  </button>
                  <button type="button" className="pm-btn-ghost" onClick={() => setMatchedPatient(null)}>
                    Create new anyway
                  </button>
                </div>
              </div>
            )}

            {/* 4. Address — optional */}
            {!matchedPatient && (
              <>
                <div className="pm-field">
                  <label className="pm-label">
                    <MapPin size={12} className="pm-label-icon" />
                    Address <span className="pm-optional">optional</span>
                  </label>
                  <input
                    className="pm-input"
                    value={draft.address ?? ""}
                    placeholder="Street, locality, city"
                    onChange={(e) => setDraft((d) => ({ ...d, address: e.target.value }))}
                  />
                </div>

                {/* Actions */}
                <div className="pm-actions">
                  <button type="button" className="pm-btn-ghost" onClick={onClose}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="pm-btn-primary"
                    disabled={!isFormValid}
                    onClick={handleConfirm}
                  >
                    Start consult →
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