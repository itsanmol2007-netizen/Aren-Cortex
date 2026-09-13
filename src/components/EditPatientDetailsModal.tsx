// Edit an EXISTING patient's demographics — name, age, sex, phone, date of
// birth. Nothing clinical; same fields Front Desk's own EditPatientModal
// already lets a receptionist fix (`features/frontdesk/components/patients/
// EditPatientModal.tsx`), same `updatePatient` write underneath, just reached
// from Cortex's own surfaces instead of Front Desk's Patients page.
//
// Added 2026-09-13 after a beta tester (Anmol's own words) finalized a
// consult with the wrong sex on file and found there was NO way back short
// of Front Desk's Patients page — "a very hard way and very terrible thing"
// for a solo doctor with no receptionist to walk there for them. Two doors
// open this, both passing only a `patientId`:
//   · The active-consult header (`PatientHeader`'s pencil, next to the name)
//   · Patient Record's identity card (`features/patients/PatientRecord.tsx`)
//
// Deliberately takes just an id and fetches the row itself (`fetchPatientById`)
// rather than trusting whatever shape each caller already has in hand — the
// header's `Patient` (string age, no date_of_birth) and Patient Record's
// `PatientRecordRow` (number age, no date_of_birth either) are both missing a
// field this form edits, so a caller-supplied draft would silently blank the
// date of birth on save. One fetch, one shape, one save path.
//
// Styled with the SAME `.pm-*` classes `PatientModal` (intake) already uses —
// this is Cortex's own modal language, not Front Desk's `ModalShell`/Tailwind
// system, because this modal only ever opens inside Cortex.

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Cake, Loader2, Phone, User, UserRoundPen, X } from "lucide-react";
import { fetchPatientById, searchPatients, updatePatient, type DBPatient } from "../lib/db";
import type { Gender } from "../types";
import { ageInYears, dobMattersFor, todayIso } from "../lib/growth/age";

type Props = {
    patientId: string;
    onClose: () => void;
    /** The fresh row, straight from `updatePatient`'s own `.select()` — callers
     *  patch whatever local state they're holding (the active `Patient`, a
     *  `PatientRecordRow`) from this rather than re-fetching. */
    onSaved: (fresh: DBPatient) => void;
};

export function EditPatientDetailsModal({ patientId, onClose, onSaved }: Props) {
    const [loading, setLoading] = useState(true);
    const [loadFailed, setLoadFailed] = useState(false);
    const [original, setOriginal] = useState<DBPatient | null>(null);

    const [name, setName] = useState("");
    const [age, setAge] = useState("");
    const [dateOfBirth, setDateOfBirth] = useState("");
    const [gender, setGender] = useState<Gender>("");
    const [phone, setPhone] = useState("");

    const [errors, setErrors] = useState<Record<string, boolean>>({});
    const [phoneOwner, setPhoneOwner] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    const formRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        let alive = true;
        fetchPatientById(patientId)
            .then((p) => {
                if (!alive) return;
                if (!p) { setLoadFailed(true); return; }
                setOriginal(p);
                setName(p.name);
                setAge(p.age > 0 ? String(p.age) : "");
                setDateOfBirth(p.date_of_birth ?? "");
                setGender((p.gender as Gender) ?? "");
                setPhone(p.phone ?? "");
            })
            .catch(() => { if (alive) setLoadFailed(true); })
            .finally(() => { if (alive) setLoading(false); });
        return () => { alive = false; };
    }, [patientId]);

    const phoneOk = /^\d{10}$/.test(phone);

    const handleSave = async () => {
        if (saving || !original) return;
        const nextErrors: Record<string, boolean> = {};
        if (!name.trim()) nextErrors.name = true;
        if (!age.trim()) nextErrors.age = true;
        if (!gender) nextErrors.gender = true;
        if (!phoneOk) nextErrors.phone = true;
        setErrors(nextErrors);
        setPhoneOwner(null);
        if (Object.keys(nextErrors).length) return;

        setSaving(true);
        try {
            // Same guard Front Desk's EditPatientModal runs: a corrected number
            // must not silently collide with a DIFFERENT patient's record.
            if (phone !== original.phone) {
                const clashes = await searchPatients(phone);
                const other = clashes.find((c) => c.phone === phone && c.id !== original.id);
                if (other) {
                    setPhoneOwner(other.name);
                    setErrors((e) => ({ ...e, phone: true }));
                    setSaving(false);
                    return;
                }
            }
            const fresh = await updatePatient(original.id, {
                name: name.trim(),
                age: Number(age) || 0,
                gender,
                phone,
                date_of_birth: dateOfBirth || null,
            });
            toast.success("Patient details updated");
            onSaved(fresh);
        } catch (err: any) {
            toast.error(`Could not update patient: ${err.message}`);
            setSaving(false);
        }
    };

    const advance = (e: React.KeyboardEvent<HTMLElement>) => {
        if (e.key !== "Enter") return;
        e.preventDefault();
        const fields = Array.from(formRef.current?.querySelectorAll<HTMLElement>("input, select") ?? []);
        const i = fields.indexOf(e.currentTarget as HTMLElement);
        const next = fields[i + 1];
        if (next) { next.focus(); return; }
        handleSave();
    };

    return (
        <div className="pm-overlay" role="dialog" aria-modal="true" aria-label="Edit patient details">
            <button className="pm-backdrop" type="button" onClick={onClose} aria-label="Close" />
            <div className="pm-card" onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}>
                <div className="pm-top-stripe" />

                <div className="pm-header">
                    <div className="pm-header-left">
                        <div className="pm-header-icon"><UserRoundPen size={14} /></div>
                        <div>
                            <p className="pm-eyebrow">Patient record</p>
                            <h3 className="pm-title">Edit details</h3>
                        </div>
                    </div>
                    <button className="pm-close-btn" type="button" onClick={onClose} aria-label="Close">
                        <X size={14} />
                    </button>
                </div>

                {loading ? (
                    <div className="pm-section" style={{ alignItems: "center", padding: "32px 20px" }}>
                        <Loader2 size={20} className="animate-spin" style={{ color: "#a855f7" }} />
                    </div>
                ) : loadFailed || !original ? (
                    <div className="pm-section" style={{ padding: "20px" }}>
                        <p className="pm-no-results">Could not load this patient's record.</p>
                        <div className="pm-actions">
                            <button type="button" className="pm-btn-ghost" style={{ flex: 1 }} onClick={onClose}>Close</button>
                        </div>
                    </div>
                ) : (
                    <div
                        className="pm-section pm-tab-content"
                        ref={formRef}
                        onKeyDown={(e) => { if (e.key === "Enter" && !e.defaultPrevented) { e.preventDefault(); handleSave(); } }}
                    >
                        <div className="pm-field">
                            <label className="pm-label">
                                <User size={12} className="pm-label-icon" />
                                Full name <span className="pm-required">*</span>
                            </label>
                            <input
                                autoFocus
                                className="pm-input"
                                style={errors.name ? { borderColor: "#f472b6" } : undefined}
                                value={name}
                                placeholder="Patient's full name"
                                onChange={(e) => { setName(e.target.value); if (e.target.value.trim()) setErrors((er) => ({ ...er, name: false })); }}
                                onKeyDown={advance}
                            />
                        </div>

                        <div className="pm-row-two">
                            <div className="pm-field">
                                <label className="pm-label">Age <span className="pm-required">*</span></label>
                                <input
                                    className="pm-input"
                                    style={errors.age ? { borderColor: "#f472b6" } : undefined}
                                    inputMode="numeric"
                                    maxLength={3}
                                    value={age}
                                    placeholder="e.g. 34"
                                    onChange={(e) => {
                                        const v = e.target.value.replace(/\D/g, "");
                                        setAge(v);
                                        if (v) setErrors((er) => ({ ...er, age: false }));
                                    }}
                                    onKeyDown={advance}
                                />
                            </div>
                            <div className="pm-field">
                                <label className="pm-label">Sex <span className="pm-required">*</span></label>
                                <select
                                    className="pm-input pm-select"
                                    style={errors.gender ? { borderColor: "#f472b6" } : undefined}
                                    value={gender}
                                    onChange={(e) => { setGender(e.target.value as Gender); setErrors((er) => ({ ...er, gender: false })); }}
                                    onKeyDown={advance}
                                >
                                    <option value="">Select</option>
                                    <option value="Male">Male</option>
                                    <option value="Female">Female</option>
                                    <option value="Other">Other</option>
                                </select>
                            </div>
                        </div>

                        {/* Same amber "needed for growth charts" nudge intake uses —
                            editing is also where a DOB missing since before this column
                            existed normally gets filled in. */}
                        <div className="pm-field">
                            <label className="pm-label">
                                <Cake size={12} className="pm-label-icon" />
                                Date of birth{" "}
                                {dobMattersFor(Number.parseInt(age, 10))
                                    ? <span className="pm-dob-needed">needed for growth charts</span>
                                    : <span className="pm-optional">OPTIONAL</span>}
                            </label>
                            <input
                                className={`pm-input${dobMattersFor(Number.parseInt(age, 10)) && !dateOfBirth ? " pm-input-wanted" : ""}`}
                                type="date"
                                max={todayIso()}
                                value={dateOfBirth}
                                onChange={(e) => {
                                    const dob = e.target.value;
                                    setDateOfBirth(dob);
                                    const derived = ageInYears(dob);
                                    if (derived !== null) {
                                        setAge(String(derived));
                                        setErrors((er) => ({ ...er, age: false }));
                                    }
                                }}
                                onKeyDown={advance}
                            />
                        </div>

                        <div className="pm-field">
                            <label className="pm-label">
                                <Phone size={12} className="pm-label-icon" />
                                Phone number <span className="pm-required">*</span>
                            </label>
                            <div className="pm-phone-row" style={errors.phone ? { borderColor: "#f472b6" } : undefined}>
                                <span className="pm-phone-prefix">+91</span>
                                <input
                                    className="pm-input pm-phone-input"
                                    inputMode="tel"
                                    maxLength={10}
                                    value={phone}
                                    placeholder="10-digit mobile"
                                    onChange={(e) => {
                                        const digits = e.target.value.replace(/\D/g, "").slice(0, 10);
                                        setPhone(digits);
                                        setPhoneOwner(null);
                                        if (/^\d{10}$/.test(digits)) setErrors((er) => ({ ...er, phone: false }));
                                    }}
                                    onKeyDown={advance}
                                />
                            </div>
                            {errors.phone && (
                                <p className="pm-error-text">
                                    {phoneOwner ? `Already used by ${phoneOwner}` : "Enter a valid 10-digit number"}
                                </p>
                            )}
                        </div>

                        <div className="pm-actions">
                            <button type="button" className="pm-btn-ghost" onClick={onClose}>Cancel</button>
                            <button type="button" className="pm-btn-primary" disabled={saving} onClick={handleSave}>
                                {saving ? "Saving…" : "Save changes"}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
