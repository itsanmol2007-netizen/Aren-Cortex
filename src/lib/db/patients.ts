import { supabase } from "../supabase";
import type { DBSymptom, DBFinding } from "./reference";
import { siteLabel, type BodyAspect, type BodyRegion, type BodySide } from "../body/anatomy";

// ── TYPES ──────────────────────────────────────────────────────────────────────
export type DBPatient = {
    id: string; name: string; age: number; gender: string; phone: string;
    /**
     * Optional, ISO yyyy-mm-dd. When present it is the source of truth for
     * exact age; `age` remains required and is what everything else reads.
     *
     * It exists because paediatric growth standards are indexed per MONTH and
     * an integer year cannot express that — a 3-month-old and an 11-month-old
     * are both `age: 0`, while WHO's median weight runs 3.35kg to 9.4kg
     * across that same span. See lib/growth/growth.ts, which declines to
     * score rather than guessing when this is absent.
     */
    date_of_birth?: string | null;
};
export type DBVisit = { id: string; patient_id: string; assigned_doctor_id: string; status: string; token_number?: number | null };

// ── PATIENTS ───────────────────────────────────────────────────────────────────
export async function searchPatients(query: string): Promise<DBPatient[]> {
    if (!query || query.trim().length < 2) return [];
    const q = query.trim();
    const { data, error } = await supabase
        .from("patients")
        .select("id, name, age, gender, phone, date_of_birth")
        .or(`name.ilike.%${q}%,phone.ilike.%${q}%`)
        .limit(8);
    if (error) throw new Error(`searchPatients: ${error.message}`);
    return data ?? [];
}

export async function findPatientByPhone(phone: string): Promise<DBPatient | null> {
    const { data, error } = await supabase
        .from("patients")
        .select("id, name, age, gender, phone, date_of_birth")
        .eq("phone", phone)
        .maybeSingle();
    if (error) throw new Error(`findPatientByPhone: ${error.message}`);
    return data;
}

// `hospitalId` is REQUIRED and has no fallback, deliberately. It used to be the
// `HOSPITAL_ID` constant, which meant every workspace wrote new patients into
// one specific clinic no matter who was signed in. RLS on `patients` is
// `hospital_id = current_user_hospital_id()`, so for any other clinic that
// insert is not merely wrong — it is rejected outright (PostgREST 403), which
// is how this was finally caught. Pass the signed-in clinic: `identity.hospitalId`
// in Cortex, `useHospitalId()` in Front Desk.
export async function createPatient(
    p: {
        name: string;
        age: number;
        gender: string;
        phone: string;
        /** ISO yyyy-mm-dd, optional — see DBPatient.date_of_birth */
        date_of_birth?: string | null;
    },
    hospitalId: string
): Promise<DBPatient> {
    const { data, error } = await supabase
        .from("patients")
        .insert({ ...p, date_of_birth: p.date_of_birth || null, hospital_id: hospitalId })
        .select("id, name, age, gender, phone, date_of_birth")
        .single();
    if (error) throw new Error(`createPatient: ${error.message}`);
    return data;
}

// ── VISITS ─────────────────────────────────────────────────────────────────────
// initialStatus defaults to "serving" to preserve existing Solo Mode behaviour
// (doctor registers + consults in one motion, no queue). Front Desk explicitly
// passes "waiting" instead, since a receptionist-created visit isn't being
// consulted yet — it just joins the queue until a doctor calls "Next Patient".
//
// `hospitalId` and `doctorId` are REQUIRED — see createPatient above for why the
// constants were removed. This takes an options object rather than positional
// arguments on purpose: patientId, hospitalId and doctorId are all `string`, so
// a positional signature would let `createVisit(id, "waiting", doctorId)` put
// the status into the hospital slot and still typecheck.
//
// token_number has no DB default (confirmed: column_default is null), so it is
// computed here as (highest token_number for this hospital today) + 1. Applies
// to every visit, not just Front Desk ones, since it's a general visit property.
// Note this lookup is also hospital-scoped by RLS; passing the wrong clinic
// silently restarts numbering at 1 rather than erroring.
export async function createVisit(opts: {
    patientId: string;
    hospitalId: string;
    doctorId: string;
    initialStatus?: "serving" | "waiting";
}): Promise<DBVisit> {
    const { patientId, hospitalId, doctorId, initialStatus = "serving" } = opts;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const { data: latestToday, error: tokenErr } = await supabase
        .from("visits")
        .select("token_number")
        .eq("hospital_id", hospitalId)
        .gte("created_at", todayStart.toISOString())
        .order("token_number", { ascending: false, nullsFirst: false })
        .limit(1);
    if (tokenErr) throw new Error(`createVisit (token lookup): ${tokenErr.message}`);
    const nextToken = (latestToday?.[0]?.token_number ?? 0) + 1;

    const insertPayload: Record<string, unknown> = {
        patient_id: patientId,
        assigned_doctor_id: doctorId,
        hospital_id: hospitalId,
        status: initialStatus,
        token_number: nextToken,
    };
    if (initialStatus === "serving") {
        insertPayload.started_at = new Date().toISOString();
    }

    const { data, error } = await supabase
        .from("visits")
        .insert(insertPayload)
        .select("id, patient_id, assigned_doctor_id, status, token_number")
        .single();
    if (error) throw new Error(`createVisit: ${error.message}`);
    return data;
}

export async function markVisitServing(visitId: string): Promise<DBVisit> {
    const { data, error } = await supabase
        .from("visits")
        .update({
            status: "serving",
            started_at: new Date().toISOString(),
        })
        .eq("id", visitId)
        .select("id, patient_id, assigned_doctor_id, status")
        .single();
    if (error) throw new Error(`markVisitServing: ${error.message}`);
    return data;
}

export async function reassignVisitDoctor(visitId: string, doctorId: string): Promise<void> {
    const { error } = await supabase
        .from("visits")
        .update({ assigned_doctor_id: doctorId })
        .eq("id", visitId);
    if (error) throw new Error(`reassignVisitDoctor: ${error.message}`);
}

// Front Desk may already have this patient queued today. Cortex used to ignore
// that entirely and mint a fresh visit + token for every consult start, so a
// patient checked in at the counter got a second, disconnected visit the
// moment the doctor picked them up (§10.1 in the technical atlas). This is the
// read side of the fix: find today's still-open queue entry, if any, so the
// caller can resume it with markVisitServing instead of calling createVisit.
export async function findQueuedVisit(patientId: string, hospitalId: string): Promise<DBVisit | null> {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const { data, error } = await supabase
        .from("visits")
        .select("id, patient_id, assigned_doctor_id, status, token_number")
        .eq("patient_id", patientId)
        .eq("hospital_id", hospitalId)
        .eq("status", "waiting")
        .gte("created_at", todayStart.toISOString())
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
    if (error) throw new Error(`findQueuedVisit: ${error.message}`);
    return data;
}

// ── VISIT SYMPTOMS ─────────────────────────────────────────────────────────────
export async function saveVisitSymptoms(
    visitId: string,
    symptomIds: number[],
    intensities?: string[]
): Promise<void> {
    if (!symptomIds.length) return;
    const rows = symptomIds.map((id, index) => ({
        visit_id: visitId,
        symptom_id: id,
        intensity: intensities?.[index] ?? "moderate",
    }));
    const { error } = await supabase.from("visit_symptoms").insert(rows);
    if (error) throw new Error(`saveVisitSymptoms: ${error.message}`);
}

/**
 * Intake, stored the v2 way.
 *
 * `visit_observations` is the canonical record — it can hold any of the 374
 * observables, which is what lets the front desk enter whatever the patient
 * actually reported. `visit_symptoms` is written too, for the subset that has a
 * v1 row, because the queue row, the visit detail and every existing patient
 * record still read it. The second write dies with the v1 teardown.
 */
export async function saveVisitObservations(
    visitId: string,
    observableIds: number[]
): Promise<void> {
    if (!observableIds.length) return;
    const { error } = await supabase.from("visit_observations").insert(
        observableIds.map((observable_id) => ({
            visit_id: visitId,
            observable_id,
            is_negated: false,
            source: "doctor",
        }))
    );
    if (error) throw new Error(`saveVisitObservations: ${error.message}`);
}

/**
 * What was reported at intake, per visit, read from the CANONICAL record.
 *
 * `visit_symptoms` can only hold the 51 observables that have a v1 row; the
 * catalogue is 374. Reading the queue from it alone would mean a receptionist
 * enters "High grade fever", it saves correctly, and then vanishes from the
 * row — stored but invisible, which is worse than refusing it.
 *
 * Only symptom- and history-kind observables come back: this fills the
 * "Symptoms" column, and an examination finding is not one.
 */
export async function observationNamesByVisit(
    visitIds: string[]
): Promise<Map<string, string[]>> {
    const out = new Map<string, string[]>();
    if (!visitIds.length) return out;

    const { data: rows, error } = await supabase
        .from("visit_observations")
        .select("visit_id, observable_id")
        .in("visit_id", visitIds);
    if (error || !rows?.length) return out;

    const ids = [...new Set(rows.map((r: any) => Number(r.observable_id)))];
    const { data: obs } = await supabase
        .from("observables")
        .select("id, label, kind")
        .in("id", ids);

    const labelById = new Map<number, string>();
    for (const o of obs ?? []) {
        if (o.kind === "symptom" || o.kind === "history") labelById.set(o.id, o.label);
    }

    for (const r of rows) {
        const label = labelById.get(Number(r.observable_id));
        if (!label) continue;
        const list = out.get(r.visit_id);
        if (list) list.push(label);
        else out.set(r.visit_id, [label]);
    }
    return out;
}

/** observable id -> legacy symptom id, for the v1 compatibility write. */
export async function legacySymptomIdsFor(observableIds: number[]): Promise<number[]> {
    if (!observableIds.length) return [];
    const { data, error } = await supabase
        .from("symptom_observable_map")
        .select("symptom_id, observable_id")
        .in("observable_id", observableIds);
    if (error) return [];
    return [...new Set((data ?? []).map((r: any) => Number(r.symptom_id)))];
}

export async function replaceVisitSymptoms(
    visitId: string,
    symptomIds: number[],
    intensities?: string[]
): Promise<void> {
    await supabase.from("visit_symptoms").delete().eq("visit_id", visitId);
    if (symptomIds.length) await saveVisitSymptoms(visitId, symptomIds, intensities);
}

// ── VISIT FINDINGS ─────────────────────────────────────────────────────────────
export async function replaceVisitFindings(
    visitId: string,
    findingIds: number[]
): Promise<void> {
    await supabase.from("visit_findings").delete().eq("visit_id", visitId);
    if (!findingIds.length) return;
    const rows = findingIds.map((id) => ({ visit_id: visitId, finding_id: id }));
    const { error } = await supabase.from("visit_findings").insert(rows);
    if (error) throw new Error(`replaceVisitFindings: ${error.message}`);
}

// ── DOCTOR PROFILE ─────────────────────────────────────────────────────────────
export type DBDoctor = {
    id: string;
    name: string;
    specialization: string | null;
    qualification: string | null;
    registration_number: string | null;
    phone: string | null;
    signature_image_url: string | null;
    hospital_id: string | null;
    avatar_url: string | null;
    availability_status: string | null;
    // Presence heartbeat (ISO timestamp). Optional until the DB column + the
    // doctor-side heartbeat exist — see docs/Supabase Wiring TODO.md. When the
    // column is added, include `last_seen` in DOCTOR_COLUMNS and reception
    // presence lights up automatically.
    last_seen?: string | null;
};

const DOCTOR_COLUMNS =
    "id, name, specialization, qualification, registration_number, phone, signature_image_url, hospital_id, avatar_url, availability_status, last_seen";

export async function fetchDoctor(doctorId: string): Promise<DBDoctor | null> {
    const { data, error } = await supabase
        .from("doctors")
        .select(DOCTOR_COLUMNS)
        .eq("id", doctorId)
        .maybeSingle();
    if (error) throw new Error(`fetchDoctor: ${error.message}`);
    return data;
}

export async function fetchDoctorsByHospital(hospitalId: string): Promise<DBDoctor[]> {
    const { data, error } = await supabase
        .from("doctors")
        .select(DOCTOR_COLUMNS)
        .eq("hospital_id", hospitalId)
        .order("name");
    if (error) throw new Error(`fetchDoctorsByHospital: ${error.message}`);
    return data ?? [];
}

// Presence heartbeat writer — the doctor's own app calls this every ~30s while
// open (RLS lets a doctor update only their own row). Best-effort: a failed
// beat (offline) is a no-op; the next one recovers presence.
export async function updateDoctorLastSeen(doctorId: string): Promise<void> {
    const { error } = await supabase
        .from("doctors")
        .update({ last_seen: new Date().toISOString() })
        .eq("id", doctorId);
    if (error) throw new Error(`updateDoctorLastSeen: ${error.message}`);
}

// ── DOCTOR REQUESTS ────────────────────────────────────────────────────────────
// Real communication bridge from the doctor's workspace to reception. The
// `doctor_requests` table may not exist yet in a given environment; these calls
// detect that (missing relation / not in schema cache) and report it so the UI
// can quietly stop polling rather than erroring every cycle. See
// docs/Supabase Wiring TODO.md for the table definition + realtime.
export type DoctorRequestRow = {
    id: string;
    doctor_name: string | null;
    message: string | null;
    status: string | null;
    created_at: string | null;
};

function isMissingRelation(err: { code?: string; message?: string }): boolean {
    const code = err.code ?? "";
    const msg = err.message ?? "";
    return (
        code === "42P01" || // undefined_table
        code === "PGRST205" || // PostgREST: table not found in schema cache
        /does not exist|could not find the table|schema cache/i.test(msg)
    );
}

export async function fetchDoctorRequests(
    hospitalId: string
): Promise<{ rows: DoctorRequestRow[]; unavailable: boolean }> {
    const { data, error } = await supabase
        .from("doctor_requests")
        .select("id, doctor_name, message, status, created_at")
        .eq("hospital_id", hospitalId)
        .eq("status", "pending")
        .order("created_at", { ascending: false });
    if (error) {
        return { rows: [], unavailable: isMissingRelation(error) };
    }
    return { rows: (data as DoctorRequestRow[]) ?? [], unavailable: false };
}

export async function acknowledgeDoctorRequest(id: string): Promise<void> {
    const { error } = await supabase
        .from("doctor_requests")
        .update({ status: "acknowledged", acknowledged_at: new Date().toISOString() })
        .eq("id", id);
    if (error && !isMissingRelation(error)) throw new Error(`acknowledgeDoctorRequest: ${error.message}`);
}

// Realtime subscription to this hospital's doctor_requests. `onChange` fires on
// any insert/update/delete so reception refreshes instantly (polling stays as a
// safety net). Returns an unsubscribe function; call it on unmount. Supabase
// channel names must be unique per subscription, hence the timestamp suffix.
export function subscribeDoctorRequests(hospitalId: string, onChange: () => void): () => void {
    const channel = supabase
        .channel(`doctor_requests:${hospitalId}:${Date.now()}`)
        .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "doctor_requests", filter: `hospital_id=eq.${hospitalId}` },
            () => onChange()
        )
        .subscribe();
    return () => {
        void supabase.removeChannel(channel);
    };
}

// ── HOSPITAL / CLINIC PROFILE ──────────────────────────────────────────────────
export type DBHospital = {
    id: string;
    name: string;
    city: string | null;
    state: string | null;
    phone: string | null;
    email: string | null;
    address: string | null;
    tagline: string | null;
    logo_url: string | null;
    accent_color: string | null;
    is_branded: boolean;
    /** The onboarding choice — see features/synapse/specialtyProfile.ts. Null means General OPD. */
    specialty_profile: string | null;
};

export async function fetchHospital(hospitalId: string): Promise<DBHospital | null> {
    const { data, error } = await supabase
        .from("hospitals")
        .select("id, name, city, state, phone, email, address, tagline, logo_url, accent_color, is_branded, specialty_profile")
        .eq("id", hospitalId)
        .maybeSingle();
    if (error) throw new Error(`fetchHospital: ${error.message}`);
    return data;
}

/**
 * Testing-phase specialty switch — Settings page only.
 *
 * `specialty_profile` is documented (features/synapse/specialtyProfile.ts) as
 * "set once at onboarding, per facility, never relearned at runtime". This
 * function is the deliberate, temporary exception: during solo piloting there
 * is no onboarding flow and no admin panel yet, so the doctor testing the app
 * needs a fast way to switch which specialty's workspace they're looking at.
 * `hospital_isolation` RLS (`id = current_user_hospital_id()`) is what makes a
 * plain client update safe here — the same policy every other hospital write
 * in this app relies on, no edge function needed.
 *
 * Once there's a real admin panel (§14.5 of the atlas), this same column is
 * still the target — only who's allowed to write it changes.
 */
export async function updateHospitalSpecialtyProfile(
    hospitalId: string,
    specialtyProfileId: string
): Promise<void> {
    const { error } = await supabase
        .from("hospitals")
        .update({ specialty_profile: specialtyProfileId })
        .eq("id", hospitalId);
    if (error) throw new Error(`updateHospitalSpecialtyProfile: ${error.message}`);
}

// ── PAST VISITS ────────────────────────────────────────────────────────────────
export type RealVisitMedicine = {
    medicine_id: number;
    name: string;
    dosage_mg: number | null;
    frequency: string | null;
    duration_days: number | null;
    route: string | null;
};

export type RealVisit = {
    id: string;
    created_at: string;
    status: string;
    doctor_name: string | null;
    symptoms: string[];
    findings: { name: string; is_abnormal: boolean }[];
    medicines: RealVisitMedicine[];
    /**
     * What was measured at that visit — the `visits.vitals` blob as written by
     * `saveConsultation`, keys matching `MeasureFieldKey`.
     *
     * Added 2026-08-16 and it is the reason the longitudinal band can exist at
     * all: this function was the only loader of a patient's history and it had
     * never selected the column, so every measurement the product has ever
     * recorded was write-only from the consult screen's point of view. Typed
     * loosely rather than as `Vitals` on purpose — these are rows written by
     * older builds of the app, so a key that is no longer in the catalogue, or
     * a value that is not a string, is a real possibility. `trend.ts` is the
     * one place that reads it and it treats every value as untrusted.
     */
    vitals: Record<string, unknown> | null;
};

export async function fetchPatientVisits(patientId: string): Promise<RealVisit[]> {
    const { data: visits, error: visitErr } = await supabase
        .from("visits")
        .select("id, created_at, assigned_doctor_id, status, vitals")
        .eq("patient_id", patientId)
        .eq("status", "completed")
        .order("created_at", { ascending: false })
        .limit(20);

    if (visitErr) throw new Error(`fetchPatientVisits: ${visitErr.message}`);
    if (!visits || visits.length === 0) return [];

    const visitIds = visits.map((v) => v.id);

    const doctorIds = [...new Set(visits.map((v) => v.assigned_doctor_id).filter(Boolean))];
    const doctorMap = new Map<string, string>();
    if (doctorIds.length) {
        const { data: docs } = await supabase
            .from("doctors").select("id, name").in("id", doctorIds);
        (docs ?? []).forEach((d: any) => doctorMap.set(d.id, d.name));
    }

    const { data: vsRows } = await supabase
        .from("visit_symptoms")
        .select("visit_id, symptom_id")
        .in("visit_id", visitIds);

    const allSymptomIds = [...new Set((vsRows ?? []).map((r: any) => Number(r.symptom_id)))];
    const symptomById = new Map<number, string>();
    if (allSymptomIds.length) {
        const { data: symps } = await supabase
            .from("symptoms").select("id, name").in("id", allSymptomIds);
        (symps ?? []).forEach((s: any) => symptomById.set(s.id, s.name));
    }

    // The canonical intake record, which the v1 join above cannot represent in full.
    const obsNamesByVisit = await observationNamesByVisit(visitIds);

    const { data: vfRows } = await supabase
        .from("visit_findings")
        .select("visit_id, finding_id")
        .in("visit_id", visitIds);

    const allFindingIds = [...new Set((vfRows ?? []).map((r: any) => Number(r.finding_id)))];
    const findingById = new Map<number, { name: string; is_abnormal: boolean }>();
    if (allFindingIds.length) {
        const { data: finds } = await supabase
            .from("findings").select("id, name, is_abnormal").in("id", allFindingIds);
        (finds ?? []).forEach((f: any) => findingById.set(f.id, { name: f.name, is_abnormal: f.is_abnormal }));
    }

    const { data: rxRows } = await supabase
        .from("prescriptions")
        .select("id, visit_id")
        .in("visit_id", visitIds);

    const rxByVisit = new Map<string, string>();
    (rxRows ?? []).forEach((r: any) => rxByVisit.set(r.visit_id, r.id));
    const rxIds = (rxRows ?? []).map((r: any) => r.id);

    const medsByRx = new Map<string, RealVisitMedicine[]>();
    if (rxIds.length) {
        const { data: pmRows } = await supabase
            .from("prescription_medicines")
            .select("prescription_id, medicine_id, dosage_mg, frequency, duration_days, route")
            .in("prescription_id", rxIds);

        const allMedIds = [...new Set((pmRows ?? []).map((r: any) => Number(r.medicine_id)))];
        const medNameById = new Map<number, string>();
        if (allMedIds.length) {
            const { data: meds } = await supabase
                .from("medicines").select("id, name").in("id", allMedIds);
            (meds ?? []).forEach((m: any) => medNameById.set(m.id, m.name));
        }

        for (const pm of (pmRows ?? [])) {
            const list = medsByRx.get(pm.prescription_id) ?? [];
            list.push({
                medicine_id: Number(pm.medicine_id),
                name: medNameById.get(Number(pm.medicine_id)) ?? "Unknown",
                dosage_mg: pm.dosage_mg,
                frequency: pm.frequency,
                duration_days: pm.duration_days,
                route: pm.route,
            });
            medsByRx.set(pm.prescription_id, list);
        }
    }

    return visits.map((v) => {
        const rxId = rxByVisit.get(v.id);
        return {
            id: v.id,
            created_at: v.created_at,
            status: v.status,
            doctor_name: doctorMap.get(v.assigned_doctor_id) ?? null,
            // Canonical first — see observationNamesByVisit. This drives Cortex's
            // past-visit rail and Repeat Rx, so a visit registered against the
            // full catalogue has to come back whole.
            symptoms: obsNamesByVisit.get(v.id)?.length
                ? obsNamesByVisit.get(v.id)!
                : ((vsRows ?? [])
                    .filter((r: any) => r.visit_id === v.id)
                    .map((r: any) => symptomById.get(Number(r.symptom_id)))
                    .filter(Boolean) as string[]),
            findings: (vfRows ?? [])
                .filter((r: any) => r.visit_id === v.id)
                .map((r: any) => findingById.get(Number(r.finding_id)))
                .filter(Boolean) as { name: string; is_abnormal: boolean }[],
            medicines: rxId ? (medsByRx.get(rxId) ?? []) : [],
            vitals: (v as { vitals?: Record<string, unknown> | null }).vitals ?? null,
        };
    });
}

// ── PATIENT RECORDS PAGE — TODAY'S PATIENTS ────────────────────────────────────
export type PatientRecordRow = {
    patient_id: string;
    patient_name: string;
    age: number;
    gender: string;
    phone: string;
    visit_id: string;
    visit_status: string;
    started_at: string | null;
    completed_at: string | null;
    symptom_names: string[];
    finding_names: string[];
    medicine_names: string[];
    test_names: string[];
    visit_count: number;
    last_visit_at: string | null;
    // ── Physio-relevant, added 2026-08-23 for the specialty-aware Patient
    // Overview (patientSnapshot.ts builds the display text from these; this
    // file only fetches and shapes the raw values). All real reads — no
    // field here is a fabricated stand-in. `impairment_names` will read empty
    // for every visit today: `visit_impairments` exists but has no write path
    // yet (see aren-cortex-context.md §7).
    /** e.g. "Right knee" — from visit_body_sites, this visit only. */
    body_sites: string[];
    /** exercise labels prescribed this visit, from prescription_exercises. */
    exercise_names: string[];
    /** functional-limitation labels this visit, from visit_impairments (empty until wired). */
    impairment_names: string[];
    /** visit_story.duration_text, e.g. "3 weeks". Null if no story recorded. */
    story_duration: string | null;
    /** visit_story.mechanism, the patient's own words on how it started. */
    story_mechanism: string | null;
    /**
     * "Session 4 of 12" — present ONLY when this visit is actually linked to
     * an active care_plan (visits.care_plan_id) with a target_visit_count.
     * Null for effectively every visit today (see aren-cortex-context.md §7 —
     * care_plans exists but nothing links to it yet); callers must fall back
     * to `visit_count` rather than treat null as zero sessions.
     */
    care_plan_session_label: string | null;
    /**
     * The same fact `care_plan_session_label` renders as text, kept structured
     * for callers that need to compute with it (e.g. the sidebar's
     * Reassessment Due count) rather than parse a display string back apart.
     */
    care_plan_progress: { sessionsCompleted: number; targetSessions: number } | null;
};

type RawVisitRow = {
    id: string;
    patient_id: string;
    status: string;
    started_at: string | null;
    completed_at: string | null;
    care_plan_id: string | null;
};

/**
 * Shared row-builder for `fetchTodayPatients` and `fetchRecentPatients` — same
 * doctor-scoped visits in, same enrichment out, only the initial `visits`
 * query differs between the two callers. Extracted 2026-08-23 rather than
 * copy-pasted a third time when the physio fields (body sites, exercises,
 * story, impairments, care-plan session) were added — see rule 19 in
 * aren-cortex-context.md (two things that must independently agree).
 *
 * `dedupePerPatient`: `fetchRecentPatients` wants one row per patient (most
 * recent visit only); `fetchTodayPatients` wants every visit today.
 */
async function buildPatientRecordRows(
    visits: RawVisitRow[],
    doctorId: string,
    dedupePerPatient: boolean
): Promise<PatientRecordRow[]> {
    if (!visits.length) return [];

    const patientIds = [...new Set(visits.map((v) => v.patient_id))];
    const visitIds = visits.map((v) => v.id);

    const { data: patients } = await supabase
        .from("patients")
        .select("id, name, age, gender, phone, date_of_birth")
        .in("id", patientIds);
    const patMap = new Map<string, any>();
    (patients ?? []).forEach((p: any) => patMap.set(p.id, p));

    const { data: allVisitCounts } = await supabase
        .from("visits")
        .select("patient_id, started_at")
        .in("patient_id", patientIds)
        .eq("assigned_doctor_id", doctorId)
        .order("started_at", { ascending: false });
    const visitCountMap = new Map<string, number>();
    const lastVisitMap = new Map<string, string>();
    (allVisitCounts ?? []).forEach((v: any) => {
        visitCountMap.set(v.patient_id, (visitCountMap.get(v.patient_id) ?? 0) + 1);
        if (!lastVisitMap.has(v.patient_id)) lastVisitMap.set(v.patient_id, v.started_at);
    });

    const { data: vsRows } = await supabase
        .from("visit_symptoms")
        .select("visit_id, symptom_id")
        .in("visit_id", visitIds);
    const allSymptomIds = [...new Set((vsRows ?? []).map((r: any) => Number(r.symptom_id)))];
    const symptomById = new Map<number, string>();
    if (allSymptomIds.length) {
        const { data: symps } = await supabase
            .from("symptoms").select("id, name").in("id", allSymptomIds);
        (symps ?? []).forEach((s: any) => symptomById.set(s.id, s.name));
    }

    // The canonical intake record, which the v1 join above cannot represent in full.
    const obsNamesByVisit = await observationNamesByVisit(visitIds);

    const { data: vfRows } = await supabase
        .from("visit_findings")
        .select("visit_id, finding_id")
        .in("visit_id", visitIds);
    const allFindingIds = [...new Set((vfRows ?? []).map((r: any) => Number(r.finding_id)))];
    const findingById = new Map<number, string>();
    if (allFindingIds.length) {
        const { data: finds } = await supabase
            .from("findings").select("id, name").in("id", allFindingIds);
        (finds ?? []).forEach((f: any) => findingById.set(f.id, f.name));
    }

    const { data: rxRows } = await supabase
        .from("prescriptions")
        .select("id, visit_id")
        .in("visit_id", visitIds);
    const rxByVisitId = new Map<string, string>();
    (rxRows ?? []).forEach((r: any) => rxByVisitId.set(r.visit_id, r.id));
    const rxIds = (rxRows ?? []).map((r: any) => r.id);

    const pmByVisitId = new Map<string, number[]>();
    const medById = new Map<number, string>();
    // Exercise labels are already text on prescription_exercises — no id
    // lookup needed, unlike medicines.
    const exByVisitId = new Map<string, string[]>();
    if (rxIds.length) {
        const { data: pmRows } = await supabase
            .from("prescription_medicines")
            .select("prescription_id, medicine_id")
            .in("prescription_id", rxIds);
        const allMedIds = [...new Set((pmRows ?? []).map((r: any) => Number(r.medicine_id)))];
        if (allMedIds.length) {
            const { data: meds } = await supabase
                .from("medicines").select("id, name").in("id", allMedIds);
            (meds ?? []).forEach((m: any) => medById.set(m.id, m.name));
        }
        for (const pm of (pmRows ?? [])) {
            const visitId = [...rxByVisitId.entries()].find(([, rxId]) => rxId === pm.prescription_id)?.[0];
            if (!visitId) continue;
            const list = pmByVisitId.get(visitId) ?? [];
            list.push(Number(pm.medicine_id));
            pmByVisitId.set(visitId, list);
        }

        const { data: peRows } = await supabase
            .from("prescription_exercises")
            .select("prescription_id, label, sort_order")
            .in("prescription_id", rxIds)
            .order("sort_order", { ascending: true });
        for (const pe of (peRows ?? [])) {
            const visitId = [...rxByVisitId.entries()].find(([, rxId]) => rxId === pe.prescription_id)?.[0];
            if (!visitId) continue;
            const list = exByVisitId.get(visitId) ?? [];
            list.push(pe.label);
            exByVisitId.set(visitId, list);
        }
    }

    const { data: doRows } = await supabase
        .from("diagnostic_orders")
        .select("visit_id, test_name")
        .in("visit_id", visitIds);

    const { data: bsRows } = await supabase
        .from("visit_body_sites")
        .select("visit_id, region, aspect, side")
        .in("visit_id", visitIds);
    const bodySitesByVisit = new Map<string, string[]>();
    for (const r of (bsRows ?? []) as { visit_id: string; region: BodyRegion; aspect: BodyAspect; side: BodySide | null }[]) {
        const list = bodySitesByVisit.get(r.visit_id) ?? [];
        const label = siteLabel(r.region, r.aspect, r.side);
        if (!list.includes(label)) list.push(label);
        bodySitesByVisit.set(r.visit_id, list);
    }

    const { data: impRows } = await supabase
        .from("visit_impairments")
        .select("visit_id, label")
        .in("visit_id", visitIds);
    const impairmentsByVisit = new Map<string, string[]>();
    for (const r of (impRows ?? []) as { visit_id: string; label: string }[]) {
        const list = impairmentsByVisit.get(r.visit_id) ?? [];
        list.push(r.label);
        impairmentsByVisit.set(r.visit_id, list);
    }

    const { data: storyRows } = await supabase
        .from("visit_story")
        .select("visit_id, duration_text, mechanism")
        .in("visit_id", visitIds);
    const storyByVisit = new Map<string, { duration: string | null; mechanism: string | null }>();
    for (const r of (storyRows ?? []) as { visit_id: string; duration_text: string | null; mechanism: string | null }[]) {
        storyByVisit.set(r.visit_id, { duration: r.duration_text, mechanism: r.mechanism });
    }

    // Care-plan session label — real ONLY when this visit is actually linked.
    // Bounded query count: one per DISTINCT care_plan_id in this batch, not
    // per visit or per patient. Today that is almost always zero rows (see
    // aren-cortex-context.md §7), so this loop runs 0-1 times in practice.
    const carePlanIds = [...new Set(visits.map((v) => v.care_plan_id).filter((id): id is string => !!id))];
    // Keyed `${carePlanId}:${patientId}`, structured rather than pre-formatted
    // — patientSnapshot.ts renders the label, the sidebar computes on the
    // number, neither should have to parse the other's string back apart.
    const progressByCarePlanAndPatient = new Map<string, { sessionsCompleted: number; targetSessions: number }>();
    for (const planId of carePlanIds) {
        const { data: plan } = await supabase
            .from("care_plans")
            .select("id, patient_id, target_visit_count, status")
            .eq("id", planId)
            .maybeSingle();
        if (!plan || !plan.target_visit_count) continue;
        const { count } = await supabase
            .from("visits")
            .select("id", { count: "exact", head: true })
            .eq("care_plan_id", planId)
            .eq("status", "completed");
        if (count == null) continue;
        progressByCarePlanAndPatient.set(`${planId}:${plan.patient_id}`, {
            sessionsCompleted: count,
            targetSessions: plan.target_visit_count,
        });
    }

    const rows: PatientRecordRow[] = [];
    const seenPatients = new Set<string>();

    for (const v of visits) {
        if (dedupePerPatient) {
            if (seenPatients.has(v.patient_id)) continue;
            seenPatients.add(v.patient_id);
        }

        const pat = patMap.get(v.patient_id) ?? {};
        // Canonical first: a visit written since the catalogue moved to
        //  has a complete observation record, and only older
        // visits fall back to the v1 join.
        const observed = obsNamesByVisit.get(v.id);
        const symptomNames = observed?.length
            ? observed
            : ((vsRows ?? [])
                .filter((r: any) => r.visit_id === v.id)
                .map((r: any) => symptomById.get(Number(r.symptom_id)))
                .filter(Boolean) as string[]);
        const findingNames = (vfRows ?? [])
            .filter((r: any) => r.visit_id === v.id)
            .map((r: any) => findingById.get(Number(r.finding_id)))
            .filter(Boolean) as string[];
        const medicineNames = (pmByVisitId.get(v.id) ?? [])
            .map((medId) => medById.get(medId))
            .filter(Boolean) as string[];
        const testNames = (doRows ?? [])
            .filter((r: any) => r.visit_id === v.id)
            .map((r: any) => r.test_name)
            .filter(Boolean) as string[];
        const story = storyByVisit.get(v.id);
        const progress = v.care_plan_id
            ? progressByCarePlanAndPatient.get(`${v.care_plan_id}:${v.patient_id}`) ?? null
            : null;

        rows.push({
            patient_id: v.patient_id,
            patient_name: pat.name ?? "Unknown",
            age: pat.age ?? 0,
            gender: pat.gender ?? "",
            phone: pat.phone ?? "",
            visit_id: v.id,
            visit_status: v.status,
            started_at: v.started_at,
            completed_at: v.completed_at,
            symptom_names: symptomNames,
            finding_names: findingNames,
            medicine_names: medicineNames,
            test_names: testNames,
            visit_count: visitCountMap.get(v.patient_id) ?? 1,
            last_visit_at: lastVisitMap.get(v.patient_id) ?? v.started_at,
            body_sites: bodySitesByVisit.get(v.id) ?? [],
            exercise_names: exByVisitId.get(v.id) ?? [],
            impairment_names: impairmentsByVisit.get(v.id) ?? [],
            story_duration: story?.duration ?? null,
            story_mechanism: story?.mechanism ?? null,
            care_plan_session_label: progress
                ? `Session ${progress.sessionsCompleted} of ${progress.targetSessions}`
                : null,
            care_plan_progress: progress,
        });
    }

    return rows;
}

// `doctorId` is required — it was the DOCTOR_ID constant, which meant this page
// asked for one specific doctor's visits regardless of who was signed in. Unlike
// the write paths that turned into a 403, this failed silently: RLS filtered the
// other clinic's rows away and the records page simply rendered empty forever.
export async function fetchTodayPatients(doctorId: string): Promise<PatientRecordRow[]> {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const { data: visits, error } = await supabase
        .from("visits")
        .select("id, patient_id, status, started_at, completed_at, care_plan_id")
        .eq("assigned_doctor_id", doctorId)
        .gte("started_at", todayStart.toISOString())
        .order("started_at", { ascending: false });

    if (error) throw new Error(`fetchTodayPatients: ${error.message}`);
    return buildPatientRecordRows((visits ?? []) as RawVisitRow[], doctorId, false);
}

// ── PATIENT RECORDS PAGE — ALL RECENT PATIENTS ────────────────────────────────
// `doctorId` required — same reason as fetchTodayPatients above.
export async function fetchRecentPatients(doctorId: string, limit = 40): Promise<PatientRecordRow[]> {
    const { data: visits, error } = await supabase
        .from("visits")
        .select("id, patient_id, status, started_at, completed_at, care_plan_id")
        .eq("assigned_doctor_id", doctorId)
        .eq("status", "completed")
        .order("started_at", { ascending: false })
        .limit(limit);

    if (error) throw new Error(`fetchRecentPatients: ${error.message}`);
    return buildPatientRecordRows((visits ?? []) as RawVisitRow[], doctorId, true);
}

// ── PATIENTS PAGE — DIRECTORY ──────────────────────────────────────────────────
// The receptionist's patient archive: every patient plus the operational
// aggregates the Patients page shows (visit counts, first/last visit, the
// doctor they usually see). Aggregation happens client-side over two queries,
// same pattern as fetchTodayVisits — the clinic-MVP dataset is small.
export type PatientDirectoryEntry = {
    id: string;
    name: string;
    age: number;
    /** optional, ISO yyyy-mm-dd — see DBPatient.date_of_birth */
    date_of_birth: string | null;
    gender: string;
    phone: string;
    abha_id: string | null;
    created_at: string;
    visit_count: number;
    first_visit_at: string | null;
    last_visit_at: string | null;
    primary_doctor_id: string | null;
    primary_doctor_name: string | null;
};

export async function fetchPatientDirectory(): Promise<PatientDirectoryEntry[]> {
    const { data: patients, error } = await supabase
        .from("patients")
        .select("id, name, age, gender, phone, abha_id, created_at, date_of_birth")
        .order("created_at", { ascending: false });
    if (error) throw new Error(`fetchPatientDirectory: ${error.message}`);
    if (!patients || patients.length === 0) return [];

    const { data: visits, error: visitErr } = await supabase
        .from("visits")
        .select("patient_id, created_at, assigned_doctor_id")
        .in("patient_id", patients.map((p: any) => p.id))
        .order("created_at", { ascending: true });
    if (visitErr) throw new Error(`fetchPatientDirectory (visits): ${visitErr.message}`);

    type Agg = { count: number; first: string; last: string; byDoctor: Map<string, number> };
    const aggs = new Map<string, Agg>();
    for (const v of visits ?? []) {
        let agg = aggs.get(v.patient_id);
        if (!agg) {
            agg = { count: 0, first: v.created_at, last: v.created_at, byDoctor: new Map() };
            aggs.set(v.patient_id, agg);
        }
        agg.count += 1;
        agg.last = v.created_at; // rows arrive ascending, so the last write wins
        if (v.assigned_doctor_id) {
            agg.byDoctor.set(v.assigned_doctor_id, (agg.byDoctor.get(v.assigned_doctor_id) ?? 0) + 1);
        }
    }

    const doctorIds = [...new Set([...aggs.values()].flatMap((a) => [...a.byDoctor.keys()]))];
    const doctorMap = new Map<string, string>();
    if (doctorIds.length) {
        const { data: docs } = await supabase.from("doctors").select("id, name").in("id", doctorIds);
        (docs ?? []).forEach((d: any) => doctorMap.set(d.id, d.name));
    }

    return patients.map((p: any) => {
        const agg = aggs.get(p.id);
        let primaryDoctorId: string | null = null;
        if (agg) {
            let best = 0;
            for (const [id, count] of agg.byDoctor) {
                if (count > best) { best = count; primaryDoctorId = id; }
            }
        }
        return {
            id: p.id,
            name: p.name ?? "Unknown",
            age: p.age ?? 0,
            date_of_birth: p.date_of_birth ?? null,
            gender: p.gender ?? "",
            phone: p.phone ?? "",
            abha_id: p.abha_id ?? null,
            created_at: p.created_at,
            visit_count: agg?.count ?? 0,
            first_visit_at: agg?.first ?? null,
            last_visit_at: agg?.last ?? null,
            primary_doctor_id: primaryDoctorId,
            primary_doctor_name: primaryDoctorId ? (doctorMap.get(primaryDoctorId) ?? null) : null,
        };
    });
}

// ── PATIENTS PAGE — OPERATIONAL VISIT HISTORY ──────────────────────────────────
// Every visit for one patient (any status), lightweight: date, status, doctor,
// token. This is the reception view — no clinical payload (symptoms, findings,
// prescriptions stay in fetchPatientVisits for surfaces that need them).
export type PatientHistoryVisit = {
    visit_id: string;
    created_at: string;
    status: string;
    token_number: number | null;
    doctor_name: string | null;
};

export async function fetchPatientHistory(patientId: string): Promise<PatientHistoryVisit[]> {
    const { data: visits, error } = await supabase
        .from("visits")
        .select("id, created_at, status, token_number, assigned_doctor_id")
        .eq("patient_id", patientId)
        .order("created_at", { ascending: false });
    if (error) throw new Error(`fetchPatientHistory: ${error.message}`);
    if (!visits || visits.length === 0) return [];

    const doctorIds = [...new Set(visits.map((v: any) => v.assigned_doctor_id).filter(Boolean))];
    const doctorMap = new Map<string, string>();
    if (doctorIds.length) {
        const { data: docs } = await supabase.from("doctors").select("id, name").in("id", doctorIds);
        (docs ?? []).forEach((d: any) => doctorMap.set(d.id, d.name));
    }

    return visits.map((v: any) => ({
        visit_id: v.id,
        created_at: v.created_at,
        status: v.status,
        token_number: v.token_number ?? null,
        doctor_name: v.assigned_doctor_id ? (doctorMap.get(v.assigned_doctor_id) ?? null) : null,
    }));
}

// ── PATIENTS PAGE — DEMOGRAPHIC UPDATES ────────────────────────────────────────
// Reception may correct demographics (name, age, gender, phone) — nothing
// clinical. Returns the fresh row so callers can patch state in place.
export async function updatePatient(
    patientId: string,
    fields: { name: string; age: number; gender: string; phone: string; date_of_birth?: string | null }
): Promise<DBPatient> {
    const { data, error } = await supabase
        .from("patients")
        // Empty string is not a date — normalise to null so clearing the field
        // clears the column rather than failing the insert.
        .update("date_of_birth" in fields ? { ...fields, date_of_birth: fields.date_of_birth || null } : fields)
        .eq("id", patientId)
        .select("id, name, age, gender, phone, date_of_birth")
        .single();
    if (error) throw new Error(`updatePatient: ${error.message}`);
    return data;
}

// ── VISIT STATUS MANAGEMENT ────────────────────────────────────────────────────
// Union widened to also cover Front Desk transitions (waiting/serving/completed).
// Existing Cortex call sites (ActiveConsultGuard) only ever pass 'draft' |
// 'referred' | 'discarded' — this is purely additive, no existing behaviour changes.
export async function updateVisitStatus(
    visitId: string,
    status: 'draft' | 'referred' | 'discarded' | 'waiting' | 'serving' | 'completed'
): Promise<void> {
    const payload: Record<string, unknown> = { status };
    if (status === 'completed') payload.completed_at = new Date().toISOString();

    const { error } = await supabase
        .from("visits")
        .update(payload)
        .eq("id", visitId);

    if (error) throw new Error(`updateVisitStatus: ${error.message}`);
}

// ── FRONT DESK — TODAY'S QUEUE ──────────────────────────────────────────────────
export type TodayVisit = {
    visit_id: string;
    patient_id: string;
    patient_name: string;
    age: number;
    gender: string;
    phone: string;
    token_number: number | null;
    status: string;
    created_at: string;
    started_at: string | null;
    completed_at: string | null;
    assigned_doctor_id: string | null;
    doctor_name: string | null;
    symptom_names: string[];
    visit_count: number;
    last_visit_at: string | null;
};

export async function fetchTodayVisits(hospitalId: string): Promise<TodayVisit[]> {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const { data: visits, error } = await supabase
        .from("visits")
        .select("id, patient_id, token_number, status, created_at, started_at, completed_at, assigned_doctor_id")
        .eq("hospital_id", hospitalId)
        .gte("created_at", todayStart.toISOString())
        .order("created_at", { ascending: true });
    if (error) throw new Error(`fetchTodayVisits: ${error.message}`);
    if (!visits || visits.length === 0) return [];

    const patientIds = [...new Set(visits.map((v: any) => v.patient_id))];
    const visitIds = visits.map((v: any) => v.id);
    const doctorIds = [...new Set(visits.map((v: any) => v.assigned_doctor_id).filter(Boolean))];

    const { data: patients } = await supabase
        .from("patients")
        .select("id, name, age, gender, phone, date_of_birth")
        .in("id", patientIds);
    const patMap = new Map<string, any>();
    (patients ?? []).forEach((p: any) => patMap.set(p.id, p));

    const doctorMap = new Map<string, string>();
    if (doctorIds.length) {
        const { data: docs } = await supabase
            .from("doctors").select("id, name").in("id", doctorIds);
        (docs ?? []).forEach((d: any) => doctorMap.set(d.id, d.name));
    }

    const { data: vsRows } = await supabase
        .from("visit_symptoms")
        .select("visit_id, symptom_id")
        .in("visit_id", visitIds);
    const allSymptomIds = [...new Set((vsRows ?? []).map((r: any) => Number(r.symptom_id)))];
    const symptomById = new Map<number, string>();
    if (allSymptomIds.length) {
        const { data: symps } = await supabase
            .from("symptoms").select("id, name").in("id", allSymptomIds);
        (symps ?? []).forEach((s: any) => symptomById.set(s.id, s.name));
    }

    // The canonical intake record, which the v1 join above cannot represent in full.
    const obsNamesByVisit = await observationNamesByVisit(visitIds);

    const { data: allVisitsForPatients } = await supabase
        .from("visits")
        .select("patient_id, created_at")
        .in("patient_id", patientIds)
        .eq("hospital_id", hospitalId)
        .order("created_at", { ascending: false });
    const visitCountMap = new Map<string, number>();
    const lastVisitMap = new Map<string, string>();
    (allVisitsForPatients ?? []).forEach((v: any) => {
        visitCountMap.set(v.patient_id, (visitCountMap.get(v.patient_id) ?? 0) + 1);
        if (!lastVisitMap.has(v.patient_id)) lastVisitMap.set(v.patient_id, v.created_at);
    });

    return visits.map((v: any) => {
        const pat = patMap.get(v.patient_id) ?? {};
        return {
            visit_id: v.id,
            patient_id: v.patient_id,
            patient_name: pat.name ?? "Unknown",
            age: pat.age ?? 0,
            gender: pat.gender ?? "",
            phone: pat.phone ?? "",
            token_number: v.token_number,
            status: v.status,
            created_at: v.created_at,
            started_at: v.started_at,
            completed_at: v.completed_at,
            assigned_doctor_id: v.assigned_doctor_id,
            doctor_name: v.assigned_doctor_id ? (doctorMap.get(v.assigned_doctor_id) ?? null) : null,
            // Canonical first — see observationNamesByVisit. Intake can enter any
            // of the 374 observables; only 51 have a v1 row, so reading the queue
            // from `visit_symptoms` alone would drop most of what was typed.
            symptom_names: obsNamesByVisit.get(v.id)?.length
                ? obsNamesByVisit.get(v.id)!
                : ((vsRows ?? [])
                    .filter((r: any) => r.visit_id === v.id)
                    .map((r: any) => symptomById.get(Number(r.symptom_id)))
                    .filter(Boolean) as string[]),
            visit_count: visitCountMap.get(v.patient_id) ?? 1,
            last_visit_at: lastVisitMap.get(v.patient_id) ?? v.created_at,
        };
    });
}

// ── FRONT DESK — PATIENT LOOKUP HELPERS ─────────────────────────────────────────
export type PatientVisitStats = {
    visit_count: number;
    last_visit_at: string | null;
};

export async function fetchPatientVisitStats(patientIds: string[]): Promise<Map<string, PatientVisitStats>> {
    const stats = new Map<string, PatientVisitStats>();
    if (!patientIds.length) return stats;

    const { data, error } = await supabase
        .from("visits")
        .select("patient_id, created_at")
        .in("patient_id", patientIds)
        .order("created_at", { ascending: false });
    if (error) throw new Error(`fetchPatientVisitStats: ${error.message}`);

    (data ?? []).forEach((v: any) => {
        const existing = stats.get(v.patient_id);
        if (existing) {
            existing.visit_count += 1;
        } else {
            stats.set(v.patient_id, { visit_count: 1, last_visit_at: v.created_at });
        }
    });
    return stats;
}

export async function fetchDraftVisits(doctorId: string): Promise<DBVisit[]> {
    const { data, error } = await supabase
        .from("visits")
        .select("id, patient_id, assigned_doctor_id, status, started_at")
        .eq("assigned_doctor_id", doctorId)
        .in("status", ['draft', 'referred'])
        .order("started_at", { ascending: false });

    if (error) throw new Error(`fetchDraftVisits: ${error.message}`);
    return data ?? [];
}

export async function fetchVisitWithDetails(visitId: string): Promise<{
    visit: DBVisit;
    symptoms: DBSymptom[];
    findings: DBFinding[];
}> {
    const { data: visit, error: visitErr } = await supabase
        .from("visits")
        .select("*")
        .eq("id", visitId)
        .single();
    if (visitErr) throw new Error(`fetchVisitWithDetails: ${visitErr.message}`);

    const { data: symptomRows, error: symErr } = await supabase
        .from("visit_symptoms")
        .select("symptom_id")
        .eq("visit_id", visitId);
    if (symErr) throw new Error(`fetchVisitWithDetails symptoms: ${symErr.message}`);

    const symptomIds = symptomRows?.map(s => s.symptom_id) ?? [];
    let symptoms: DBSymptom[] = [];
    if (symptomIds.length) {
        const { data: symData, error: symDataErr } = await supabase
            .from("symptoms")
            .select("id, name")
            .in("id", symptomIds);
        if (!symDataErr && symData) symptoms = symData;
    }

    const { data: findingRows, error: findErr } = await supabase
        .from("visit_findings")
        .select("finding_id")
        .eq("visit_id", visitId);
    if (findErr) throw new Error(`fetchVisitWithDetails findings: ${findErr.message}`);

    const findingIds = findingRows?.map(f => f.finding_id) ?? [];
    let findings: DBFinding[] = [];
    if (findingIds.length) {
        const { data: findData, error: findDataErr } = await supabase
            .from("findings")
            .select("id, name, group_name, is_abnormal")
            .in("id", findingIds);
        if (!findDataErr && findData) findings = findData;
    }

    return { visit, symptoms, findings };
}