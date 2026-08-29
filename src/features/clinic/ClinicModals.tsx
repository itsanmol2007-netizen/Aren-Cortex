// ---------------------------------------------------------------------------
// The Clinic page's three edit surfaces.
//
// All three are MODALS, not pages, and that is the brief's own rule: "Simple
// data → modal. Complex configuration → dedicated page." Clinic information,
// the doctor's profile and a week of opening hours are each a bounded form
// over data the doctor already knows — none of them earns a route.
//
// They mount `PracticeModal` for the CHROME (backdrop, stripe, header, footer,
// and the `dirty` guard that stops a stray backdrop click from throwing away a
// half-typed form). That is a shared React component, and reusing it is what
// docs/aren-modal-design.md means by "one modal family, never a one-off look".
// Everything INSIDE the modal — this file's own markup — is Tailwind, sized to
// the same values the app's other modal bodies use so the two are
// indistinguishable side by side.
// ---------------------------------------------------------------------------

import { useState } from "react";
import { Building2, Clock, Plus, Stethoscope } from "lucide-react";
import { PracticeModal } from "../practice/PracticeModal";
import { Field, FieldRow, FormError, FormNote, RemoveButton } from "./ui";
import {
    WEEKDAYS, replaceClinicHours, updateClinicProfile, updateDoctorProfile,
    type ClinicDayHours, type ClinicProfilePatch, type DoctorProfilePatch,
} from "../../lib/db/clinic";
import type { DBDoctor, DBHospital } from "../../lib/db";

/** Empty box → NULL, never `""`. Every consumer downstream (the prescription
 *  renderer's `{clinicAddress && …}` guards among them) already treats null as
 *  "not set"; an empty string would render as a blank line instead. */
function orNull(v: string): string | null {
    const t = v.trim();
    return t ? t : null;
}

/** The modal footer both forms share: a ghost Cancel and one solid primary.
 *  `.prac-modal-btn` is `PracticeModal`'s own chrome, not styling authored
 *  here — the buttons belong to the shell, the body does not. */
function FormFooter({
    onCancel, onSubmit, disabled, busy, label,
}: {
    onCancel: () => void;
    onSubmit: () => void;
    disabled: boolean;
    busy: boolean;
    label: string;
}) {
    return (
        <>
            <button type="button" className="prac-modal-btn is-ghost" onClick={onCancel}>Cancel</button>
            <button type="button" className="prac-modal-btn is-primary" disabled={disabled} onClick={onSubmit}>
                {busy ? "Saving…" : label}
            </button>
        </>
    );
}

// ── CLINIC INFORMATION ─────────────────────────────────────────────────────

export function EditClinicModal({
    hospitalId, hospital, onClose, onSaved,
}: {
    hospitalId: string;
    hospital: DBHospital | null;
    onClose: () => void;
    onSaved: (patch: ClinicProfilePatch) => void;
}) {
    const [name, setName] = useState(hospital?.name ?? "");
    const [clinicType, setClinicType] = useState(hospital?.clinic_type ?? "");
    const [facilityType, setFacilityType] = useState(hospital?.facility_type ?? "");
    const [tagline, setTagline] = useState(hospital?.tagline ?? "");
    const [address, setAddress] = useState(hospital?.address ?? "");
    const [city, setCity] = useState(hospital?.city ?? "");
    const [state, setState] = useState(hospital?.state ?? "");
    const [phone, setPhone] = useState(hospital?.phone ?? "");
    const [email, setEmail] = useState(hospital?.email ?? "");
    const [website, setWebsite] = useState(hospital?.website ?? "");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const dirty =
        name !== (hospital?.name ?? "") ||
        clinicType !== (hospital?.clinic_type ?? "") ||
        facilityType !== (hospital?.facility_type ?? "") ||
        tagline !== (hospital?.tagline ?? "") ||
        address !== (hospital?.address ?? "") ||
        city !== (hospital?.city ?? "") ||
        state !== (hospital?.state ?? "") ||
        phone !== (hospital?.phone ?? "") ||
        email !== (hospital?.email ?? "") ||
        website !== (hospital?.website ?? "");

    const submit = async () => {
        if (!name.trim() || busy) return;
        const patch: ClinicProfilePatch = {
            name: name.trim(),
            clinic_type: orNull(clinicType),
            facility_type: orNull(facilityType),
            tagline: orNull(tagline),
            address: orNull(address),
            city: orNull(city),
            state: orNull(state),
            phone: orNull(phone),
            email: orNull(email),
            website: orNull(website),
        };
        setBusy(true);
        setError(null);
        try {
            await updateClinicProfile(hospitalId, patch);
            onSaved(patch);
            onClose();
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setBusy(false);
        }
    };

    return (
        <PracticeModal
            accent="blue"
            icon={<Building2 size={15} />}
            eyebrow="Clinic"
            title="Clinic information"
            wide
            dirty={dirty}
            onClose={onClose}
            footer={
                <FormFooter
                    onCancel={onClose} onSubmit={submit}
                    disabled={!name.trim() || busy} busy={busy} label="Save clinic"
                />
            }
        >
            <div className="flex flex-col gap-[9px]">
                <Field id="clin-name" label="Clinic name" value={name} onChange={setName} />
                <FieldRow>
                    <Field
                        id="clin-type" label="Clinic type" value={clinicType}
                        placeholder="e.g. Specialist Clinic" onChange={setClinicType}
                    />
                    <Field
                        id="clin-facility" label="Practice area" value={facilityType}
                        placeholder="e.g. Dermatology" onChange={setFacilityType}
                    />
                </FieldRow>
                <Field
                    id="clin-tagline" label="Tagline" value={tagline}
                    placeholder="One line, shown under the clinic name" onChange={setTagline}
                />
                <Field id="clin-address" label="Address" value={address} onChange={setAddress} />
                <FieldRow>
                    <Field id="clin-city" label="City" value={city} onChange={setCity} />
                    <Field id="clin-state" label="State" value={state} onChange={setState} />
                </FieldRow>
                <FieldRow>
                    <Field id="clin-phone" label="Phone" value={phone} onChange={setPhone} />
                    <Field id="clin-email" label="Email" value={email} onChange={setEmail} />
                </FieldRow>
                <Field
                    id="clin-website" label="Website" value={website}
                    placeholder="Optional" onChange={setWebsite}
                />
                {/* The logo is NOT here. It is a stored asset, not a text
                    field, and an upload surface is its own piece of work — a
                    dropzone that did nothing would be exactly the fake
                    configuration surface the brief's §9 forbids. */}
                {error && <FormError message={error} />}
            </div>
        </PracticeModal>
    );
}

// ── DOCTOR PROFILE ─────────────────────────────────────────────────────────

export function EditDoctorModal({
    doctorId, doctor, onClose, onSaved,
}: {
    doctorId: string;
    doctor: DBDoctor | null;
    onClose: () => void;
    onSaved: (patch: DoctorProfilePatch) => void;
}) {
    const [name, setName] = useState(doctor?.name ?? "");
    const [qualification, setQualification] = useState(doctor?.qualification ?? "");
    const [specialization, setSpecialization] = useState(doctor?.specialization ?? "");
    const [registration, setRegistration] = useState(doctor?.registration_number ?? "");
    const [phone, setPhone] = useState(doctor?.phone ?? "");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const dirty =
        name !== (doctor?.name ?? "") ||
        qualification !== (doctor?.qualification ?? "") ||
        specialization !== (doctor?.specialization ?? "") ||
        registration !== (doctor?.registration_number ?? "") ||
        phone !== (doctor?.phone ?? "");

    const submit = async () => {
        if (!name.trim() || busy) return;
        const patch: DoctorProfilePatch = {
            name: name.trim(),
            qualification: orNull(qualification),
            specialization: orNull(specialization),
            registration_number: orNull(registration),
            phone: orNull(phone),
        };
        setBusy(true);
        setError(null);
        try {
            await updateDoctorProfile(doctorId, patch);
            onSaved(patch);
            onClose();
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setBusy(false);
        }
    };

    return (
        <PracticeModal
            accent="violet"
            icon={<Stethoscope size={15} />}
            eyebrow="Doctor"
            title="Doctor profile"
            dirty={dirty}
            onClose={onClose}
            footer={
                <FormFooter
                    onCancel={onClose} onSubmit={submit}
                    disabled={!name.trim() || busy} busy={busy} label="Save profile"
                />
            }
        >
            <div className="flex flex-col gap-[9px]">
                <Field id="clin-doc-name" label="Name" value={name} onChange={setName} />
                <Field
                    id="clin-doc-qual" label="Qualification" value={qualification}
                    placeholder="e.g. MBBS, MD" onChange={setQualification}
                />
                <Field
                    id="clin-doc-spec" label="Specialty" value={specialization}
                    placeholder="e.g. Dermatologist" onChange={setSpecialization}
                />
                <FieldRow>
                    <Field
                        id="clin-doc-reg" label="Registration no." value={registration}
                        onChange={setRegistration}
                    />
                    <Field id="clin-doc-phone" label="Phone" value={phone} onChange={setPhone} />
                </FieldRow>
                <FormNote>
                    Qualification, specialty and registration number are what the
                    prescription's letterhead prints. Which of them actually appears is
                    the Prescription Editor's decision, not this form's.
                </FormNote>
                {error && <FormError message={error} />}
            </div>
        </PracticeModal>
    );
}

// ── CLINIC HOURS ───────────────────────────────────────────────────────────

/** A day with no sessions is closed — the same model the table uses, so the
 *  modal never holds a state the database cannot represent. Re-opening a day
 *  restores one default session rather than an empty row the doctor would then
 *  have to fill twice. */
const DEFAULT_SESSION = { opensAt: "10:00", closesAt: "14:00" };

const toMinutes = (hhmm: string) => {
    const [h, m] = hhmm.split(":").map(Number);
    return (Number.isNaN(h) ? 0 : h) * 60 + (Number.isNaN(m) ? 0 : m);
};

const toHHMM = (mins: number) => {
    const clamped = Math.max(0, Math.min(23 * 60 + 59, Math.round(mins)));
    return `${String(Math.floor(clamped / 60)).padStart(2, "0")}:${String(clamped % 60).padStart(2, "0")}`;
};

/**
 * The slot "+ Session" proposes for a day that already has one.
 *
 * It cannot simply be `DEFAULT_SESSION` again: `clinic_hours` is unique on
 * `(hospital_id, day_of_week, opens_at)`, so a second 10:00 start is a 409
 * from Postgres the moment the doctor hits Save — caught live 2026-08-29 by
 * adding a second Monday session and watching the insert come back Conflict.
 * A clinic that runs two sessions runs the second one AFTER the first, so the
 * honest default is an hour past the last close, three hours long: the
 * morning/evening shape an Indian OPD actually keeps.
 */
function nextSession(sessions: ClinicDayHours["sessions"]) {
    if (!sessions.length) return { ...DEFAULT_SESSION };
    const lastClose = Math.max(...sessions.map((s) => toMinutes(s.closesAt)));
    let start = lastClose + 60;
    // Every start on a day must differ; nudge past any that is already taken
    // rather than handing back a row that cannot be saved.
    const taken = new Set(sessions.map((s) => toMinutes(s.opensAt)));
    while (taken.has(start) && start < 23 * 60) start += 30;
    return { opensAt: toHHMM(start), closesAt: toHHMM(Math.min(start + 180, 23 * 60 + 59)) };
}

// `w-[124px]` is not cosmetic: base.css carries an unscoped
// `input { width: 100% }`, so a time field with no width of its own
// stretches to fill the row and pushes its pair off the end.
const TIME_INPUT_CLASS =
    "h-[34px]! w-[124px]! flex-none rounded-[9px]! border! border-[var(--cs-line)]! bg-[rgba(248,250,252,0.9)]! px-[10px]! " +
    "text-[12.5px]! tabular-nums text-[var(--cs-ink)] outline-none transition-shadow " +
    "focus:border-[var(--cs-blue)]! focus:shadow-[0_0_0_3px_var(--cs-blue-soft)]!";

export function ClinicHoursModal({
    hospitalId, week, onClose, onSaved,
}: {
    hospitalId: string;
    week: ClinicDayHours[];
    onClose: () => void;
    onSaved: (week: ClinicDayHours[]) => void;
}) {
    const [draft, setDraft] = useState<ClinicDayHours[]>(() =>
        week.map((d) => ({ day: d.day, sessions: d.sessions.map((s) => ({ ...s })) }))
    );
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const edit = (day: number, fn: (sessions: ClinicDayHours["sessions"]) => ClinicDayHours["sessions"]) => {
        setDraft((curr) => curr.map((d) => (d.day === day ? { ...d, sessions: fn(d.sessions) } : d)));
    };

    // Sent to the server only if every session is internally consistent. Both
    // checks mirror a real constraint on `clinic_hours` rather than inventing
    // a second, softer rule that could drift from it — `closes_at > opens_at`
    // is a CHECK, and one start per day is the `(hospital_id, day_of_week,
    // opens_at)` unique index. Catching them here is what turns a Postgres
    // error string into a sentence the doctor can act on.
    const invalid = ((): { day: number; why: string } | null => {
        for (const d of draft) {
            const bad = d.sessions.find((s) => s.closesAt <= s.opensAt);
            if (bad) return { day: d.day, why: "closes before it opens" };
            const starts = d.sessions.map((s) => s.opensAt);
            if (new Set(starts).size !== starts.length) {
                return { day: d.day, why: "has two sessions starting at the same time" };
            }
        }
        return null;
    })();

    const submit = async () => {
        if (invalid || busy) return;
        setBusy(true);
        setError(null);
        try {
            await replaceClinicHours(hospitalId, draft);
            onSaved(draft);
            onClose();
        } catch (e) {
            // The draft stays on screen — `replaceClinicHours` clears before
            // it inserts, so a failed insert is exactly the case where the
            // doctor's own edited week is the only surviving copy.
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setBusy(false);
        }
    };

    return (
        <PracticeModal
            accent="slate"
            icon={<Clock size={15} />}
            eyebrow="Clinic"
            title="Clinic hours"
            wide
            dirty
            onClose={onClose}
            footer={
                <FormFooter
                    onCancel={onClose} onSubmit={submit}
                    disabled={!!invalid || busy} busy={busy} label="Save hours"
                />
            }
        >
            <div className="flex flex-col gap-[6px]">
                {draft.map((d) => {
                    const closed = d.sessions.length === 0;
                    return (
                        <div
                            key={d.day}
                            className={
                                "flex flex-col gap-[6px] rounded-[10px] border border-[var(--cs-line)] px-[9px] py-[6px] " +
                                (closed ? "bg-[var(--cs-page)]" : "bg-transparent")
                            }
                        >
                            <div className="flex items-center gap-[6px]">
                                <span className="flex-1 text-[12.5px] font-semibold text-[var(--cs-ink)]">
                                    {WEEKDAYS[d.day]}
                                </span>
                                <button
                                    type="button"
                                    aria-pressed={!closed}
                                    onClick={() => edit(d.day, (s) => (s.length ? [] : [{ ...DEFAULT_SESSION }]))}
                                    className={
                                        "cursor-pointer rounded-full border px-[12px] py-[4px] text-[11px] font-semibold transition-colors " +
                                        (closed
                                            ? "border-[var(--cs-line-strong)] bg-[var(--cs-card)] text-[var(--cs-label)]"
                                            : "border-[var(--cs-green)] bg-[var(--cs-green-soft)] text-[var(--cs-green)]")
                                    }
                                >
                                    {closed ? "Closed" : "Open"}
                                </button>
                                {!closed && (
                                    <button
                                        type="button"
                                        onClick={() => edit(d.day, (s) => [...s, nextSession(s)])}
                                        className={
                                            "inline-flex cursor-pointer items-center gap-[4px] rounded-full border " +
                                            "border-[var(--cs-line-strong)] bg-transparent px-[10px] py-[4px] " +
                                            "text-[11px] font-semibold text-[var(--cs-blue)] transition-colors " +
                                            "hover:border-transparent hover:bg-[var(--cs-blue-soft)]"
                                        }
                                    >
                                        <Plus size={12} /> Session
                                    </button>
                                )}
                            </div>
                            {d.sessions.map((s, i) => (
                                <div key={i} className="flex items-center gap-[6px]">
                                    <input
                                        type="time"
                                        className={TIME_INPUT_CLASS}
                                        value={s.opensAt}
                                        aria-label={`${WEEKDAYS[d.day]} session ${i + 1} opens at`}
                                        onChange={(e) => edit(d.day, (list) =>
                                            list.map((x, j) => (j === i ? { ...x, opensAt: e.target.value } : x)))}
                                    />
                                    <span className="text-[12px] text-[var(--cs-faint)]">–</span>
                                    <input
                                        type="time"
                                        className={TIME_INPUT_CLASS}
                                        value={s.closesAt}
                                        aria-label={`${WEEKDAYS[d.day]} session ${i + 1} closes at`}
                                        onChange={(e) => edit(d.day, (list) =>
                                            list.map((x, j) => (j === i ? { ...x, closesAt: e.target.value } : x)))}
                                    />
                                    <RemoveButton
                                        label={`Remove ${WEEKDAYS[d.day]} session ${i + 1}`}
                                        onClick={() => edit(d.day, (list) => list.filter((_, j) => j !== i))}
                                    />
                                </div>
                            ))}
                        </div>
                    );
                })}
                {invalid && <FormError message={`${WEEKDAYS[invalid.day]} ${invalid.why}.`} />}
                {error && <FormError message={error} />}
            </div>
        </PracticeModal>
    );
}
