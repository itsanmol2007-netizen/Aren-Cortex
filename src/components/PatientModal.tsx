import { Search, UserCheck, User, Phone, MapPin, Sparkles, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { searchPatients, findPatientByPhone, type DBPatient } from "../lib/db";
import type { Gender, Patient } from "../types";

type PatientModalProps = {
  onClose: () => void;
  onConfirm: (patient: Patient) => void;
};

const emptyDraft: Patient = { name: "", age: "", gender: "", phone: "", address: "" };

function dbToUiPatient(p: DBPatient): Patient {
  return { id: p.id, name: p.name, age: String(p.age), gender: p.gender as Gender, phone: p.phone };
}

export function PatientModal({ onClose, onConfirm }: PatientModalProps) {
  const [draft, setDraft] = useState<Patient>(emptyDraft);
  const [matchedPatient, setMatchedPatient] = useState<DBPatient | null>(null);
  const [mode, setMode] = useState<"search" | "create">("search");

  // Search mode state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<DBPatient[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");

  // Phone duplicate check state
  const [phoneCheckLoading, setPhoneCheckLoading] = useState(false);

  // Live search — 300ms debounce
  useEffect(() => {
    if (searchQuery.trim().length < 2) {
      setSearchResults([]);
      setSearchError("");
      return;
    }
    setSearchLoading(true);
    setSearchError("");
    const timer = setTimeout(async () => {
      try {
        const results = await searchPatients(searchQuery.trim());
        setSearchResults(results);
      } catch (err: any) {
        setSearchError("Search failed. Check connection.");
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Phone change — strip non-digits, check duplicate at 10 digits
  const handlePhoneChange = async (raw: string) => {
    const digits = raw.replace(/\D/g, "").slice(0, 10);
    setDraft((d) => ({ ...d, phone: digits }));
    setMatchedPatient(null);
    if (digits.length === 10) {
      setPhoneCheckLoading(true);
      try {
        const existing = await findPatientByPhone(digits);
        if (existing) setMatchedPatient(existing);
      } catch {
        // non-fatal — just skip duplicate check
      } finally {
        setPhoneCheckLoading(false);
      }
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
        <div className="pm-top-stripe" />

        {/* Header — no close button: patient intake is mandatory, not dismissable */}
        <div className="pm-header">
          <div className="pm-header-left">
            <div className="pm-header-icon"><Sparkles size={14} /></div>
            <div>
              <p className="pm-eyebrow">Patient intake</p>
              <h3 className="pm-title">Find or create patient</h3>
            </div>
          </div>
        </div>

        {/* Mode toggle */}
        <div className="pm-toggle">
          <button type="button" className={`pm-toggle-btn ${mode === "search" ? "active" : ""}`} onClick={() => setMode("search")}>
            Search existing
          </button>
          <button type="button" className={`pm-toggle-btn ${mode === "create" ? "active" : ""}`} onClick={() => setMode("create")}>
            New patient
          </button>
        </div>

        {/* ── SEARCH MODE ── */}
        {mode === "search" && (
          <div className="pm-section">
            <div className="pm-search-box">
              {searchLoading
                ? <Loader2 size={14} className="pm-search-icon pm-spin" />
                : <Search size={14} className="pm-search-icon" />
              }
              <input
                autoFocus
                value={searchQuery}
                placeholder="Search by name or phone number…"
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pm-search-input"
              />
            </div>

            {searchError && (
              <p className="pm-no-results" style={{ color: "#f87171" }}>{searchError}</p>
            )}

            {!searchLoading && searchQuery.length >= 2 && searchResults.length === 0 && !searchError && (
              <p className="pm-no-results">
                No patient found.{" "}
                <button type="button" className="pm-link-btn" onClick={() => setMode("create")}>
                  Create new patient →
                </button>
              </p>
            )}

            {searchResults.length > 0 && (
              <div className="pm-match-list">
                {searchResults.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="pm-match-row"
                    onClick={() => onConfirm(dbToUiPatient(p))}
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

            <div className="pm-row-two">
              <div className="pm-field">
                <label className="pm-label">Age <span className="pm-required">*</span></label>
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
                <label className="pm-label">Sex <span className="pm-required">*</span></label>
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
                {phoneCheckLoading && <Loader2 size={13} className="pm-spin" style={{ color: "#6b7280", marginLeft: 6 }} />}
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
                  <button type="button" className="pm-btn-primary" onClick={() => onConfirm(dbToUiPatient(matchedPatient))}>
                    Use this patient
                  </button>
                  <button type="button" className="pm-btn-ghost" onClick={() => setMatchedPatient(null)}>
                    Create new anyway
                  </button>
                </div>
              </div>
            )}

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
                <div className="pm-actions">
                  <button type="button" className="pm-btn-ghost" onClick={onClose}>Cancel</button>
                  <button type="button" className="pm-btn-primary" disabled={!isFormValid} onClick={handleConfirm}>
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