import { useRef, useState } from "react";
import { toast } from "sonner";
import { Cake, Phone, UserRound, UserRoundPen, Users } from "lucide-react";
import { searchPatients, updatePatient, type DBPatient, type PatientDirectoryEntry } from "@/lib/db";
import { useT } from "../../i18n/i18n";
import { ageInYears, dobMattersFor, todayIso } from "@/lib/growth/age";
import { ModalShell } from "../ModalShell";
import { AgeInput, Field, GenderControl, PhoneInput, SectionLabel } from "../fields";

// Demographic corrections — the receptionist's most common Patients-page task
// ("my number changed"). Same Bhor field system as intake; nothing clinical.
// Saving is a plain data fix, not a status change and not a front door, so
// the confirm button is semantic blue rather than the brand gradient.

type Props = {
    patient: PatientDirectoryEntry;
    onClose: () => void;
    onSaved: (fresh: DBPatient) => void;
};

export function EditPatientModal({ patient, onClose, onSaved }: Props) {
    const t = useT();
    const [name, setName] = useState(patient.name);
    const [age, setAge] = useState(patient.age > 0 ? String(patient.age) : "");
    const [dateOfBirth, setDateOfBirth] = useState(patient.date_of_birth ?? "");
    const [gender, setGender] = useState(patient.gender);
    const [phone, setPhone] = useState(patient.phone);
    const [errors, setErrors] = useState<Record<string, boolean>>({});
    const [phoneOwner, setPhoneOwner] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    const nameRef = useRef<HTMLInputElement>(null);
    const ageRef = useRef<HTMLInputElement>(null);
    const genderRef = useRef<HTMLDivElement>(null);
    const phoneRef = useRef<HTMLInputElement>(null);

    const phoneOk = /^\d{10}$/.test(phone);

    const handleSave = async () => {
        if (saving) return;
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
            // Guard: a corrected number must not silently collide with another
            // patient's record — that is how twins are born.
            if (phone !== patient.phone) {
                const clashes = await searchPatients(phone);
                const other = clashes.find((c) => c.phone === phone && c.id !== patient.id);
                if (other) {
                    setPhoneOwner(other.name);
                    setErrors((e) => ({ ...e, phone: true }));
                    setSaving(false);
                    return;
                }
            }
            const fresh = await updatePatient(patient.id, {
                name: name.trim(),
                age: Number(age) || 0,
                gender,
                phone,
                date_of_birth: dateOfBirth || null,
            });
            onSaved(fresh);
        } catch (err: any) {
            toast.error(`Could not update patient: ${err.message}`);
            setSaving(false);
        }
    };

    return (
        <ModalShell
            eyebrow={t("editEyebrow")}
            title={t("editTitle")}
            icon={<UserRoundPen size={19} strokeWidth={2.2} />}
            onClose={onClose}
            footer={
                <>
                    <button
                        onClick={onClose}
                        className="h-10 rounded-[10px] border-[1.5px] border-[#e6e3f1] bg-white px-[18px] text-[13.5px] font-bold text-[#5a6472] transition-colors hover:border-[#d5cfec] hover:bg-[#f8f7fd]"
                    >
                        {t("cancel")}
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="h-10 rounded-[10px] bg-[#2f6bed] px-5 text-[13.5px] font-bold text-white shadow-[0_3px_12px_rgba(47,107,237,0.28)] transition-[filter,box-shadow] duration-100 hover:brightness-110 hover:shadow-[0_3px_16px_rgba(47,107,237,0.4)] disabled:opacity-50 disabled:hover:brightness-100"
                    >
                        {saving ? t("saving") : t("saveChanges")}
                    </button>
                </>
            }
        >
            <div onKeyDown={(e) => { if (e.key === "Enter" && !e.defaultPrevented) { e.preventDefault(); handleSave(); } }}>
                <SectionLabel text={t("secPatient")} />
                <div className="grid grid-cols-[120px_1fr] gap-x-3 gap-y-3">
                    <Field className="col-span-2" icon={<UserRound size={13} />} label={t("fldName")} required error={errors.name ? t("errRequired") : undefined}>
                        <input
                            ref={nameRef}
                            value={name}
                            onChange={(e) => { setName(e.target.value); if (e.target.value.trim()) setErrors((er) => ({ ...er, name: false })); }}
                            placeholder={t("phName")}
                            className={`fd-field ${errors.name ? "fd-field-error" : ""}`}
                        />
                    </Field>
                    <Field icon={<Cake size={13} />} label={t("fldAge")} required error={errors.age ? t("errRequired") : undefined}>
                        <AgeInput
                            inputRef={ageRef}
                            value={age}
                            onChange={(v) => { setAge(v); if (v) setErrors((er) => ({ ...er, age: false })); }}
                            error={!!errors.age}
                            placeholder={t("phAge")}
                        />
                    </Field>
                    {/* Editing is where a missing date of birth actually gets
                        filled in — every patient created before this column
                        existed has none, and this is the receptionist's normal
                        correction surface. Same rule as intake: optional
                        always, flagged for an under-five. */}
                    <Field
                        icon={<Cake size={13} />}
                        label={
                            dobMattersFor(Number.parseInt(age, 10))
                                ? `${t("fldDob")} — ${t("fldDobNeeded")}`
                                : t("fldDob")
                        }
                    >
                        <input
                            type="date"
                            className="fd-field"
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
                        />
                    </Field>
                    <Field icon={<Users size={13} />} label={t("fldGender")} required error={errors.gender ? t("errRequired") : undefined}>
                        <GenderControl
                            groupRef={genderRef}
                            value={gender}
                            onChange={(v) => { setGender(v); setErrors((er) => ({ ...er, gender: false })); }}
                            error={!!errors.gender}
                        />
                    </Field>
                    <Field
                        className="col-span-2"
                        icon={<Phone size={13} />}
                        label={t("fldPhone")}
                        required
                        error={errors.phone ? (phoneOwner ? t("dupPhone", { name: phoneOwner }) : t("errPhone10")) : undefined}
                    >
                        <PhoneInput
                            inputRef={phoneRef}
                            value={phone}
                            onChange={(digits) => {
                                setPhone(digits);
                                setPhoneOwner(null);
                                if (/^\d{10}$/.test(digits)) setErrors((er) => ({ ...er, phone: false }));
                            }}
                            error={!!errors.phone}
                            placeholder={t("phPhone")}
                        />
                    </Field>
                </div>
            </div>
        </ModalShell>
    );
}
