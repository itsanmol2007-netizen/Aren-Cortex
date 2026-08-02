import { supabase } from "../supabase";
import { DOCTOR_ID, HOSPITAL_ID } from "./reference";
import type { DBSymptom, DBFinding } from "./reference";

// ── TYPES ──────────────────────────────────────────────────────────────────────
export type DBPatient = { id: string; name: string; age: number; gender: string; phone: string };
export type DBVisit = { id: string; patient_id: string; assigned_doctor_id: string; status: string; token_number?: number | null };

// ── PATIENTS ───────────────────────────────────────────────────────────────────
export async function searchPatients(query: string): Promise<DBPatient[]> {
    if (!query || query.trim().length < 2) return [];
    const q = query.trim();
    const { data, error } = await supabase
        .from("patients")
        .select("id, name, age, gender, phone")
        .or(`name.ilike.%${q}%,phone.ilike.%${q}%`)
        .limit(8);
    if (error) throw new Error(`searchPatients: ${error.message}`);
    return data ?? [];
}

export async function findPatientByPhone(phone: string): Promise<DBPatient | null> {
    const { data, error } = await supabase
        .from("patients")
        .select("id, name, age, gender, phone")
        .eq("phone", phone)
        .maybeSingle();
    if (error) throw new Error(`findPatientByPhone: ${error.message}`);
    return data;
}

export async function createPatient(p: {
    name: string;
    age: number;
    gender: string;
    phone: string;
}): Promise<DBPatient> {
    const { data, error } = await supabase
        .from("patients")
        .insert({ ...p, hospital_id: HOSPITAL_ID })
        .select("id, name, age, gender, phone")
        .single();
    if (error) throw new Error(`createPatient: ${error.message}`);
    return data;
}

// ── VISITS ─────────────────────────────────────────────────────────────────────
// initialStatus defaults to "serving" to preserve existing Solo Mode behaviour
// (doctor registers + consults in one motion, no queue). Front Desk explicitly
// passes "waiting" instead, since a receptionist-created visit isn't being
// consulted yet — it just joins the queue until a doctor calls "Next Patient".
// doctorId defaults to DOCTOR_ID to preserve every existing call site; Front
// Desk passes the receptionist-selected doctor explicitly.
//
// token_number has no DB default (confirmed: column_default is null), so it is
// computed here as (highest token_number for this hospital today) + 1. Applies
// to every visit, not just Front Desk ones, since it's a general visit property.
export async function createVisit(
    patientId: string,
    initialStatus: "serving" | "waiting" = "serving",
    doctorId: string = DOCTOR_ID
): Promise<DBVisit> {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const { data: latestToday, error: tokenErr } = await supabase
        .from("visits")
        .select("token_number")
        .eq("hospital_id", HOSPITAL_ID)
        .gte("created_at", todayStart.toISOString())
        .order("token_number", { ascending: false, nullsFirst: false })
        .limit(1);
    if (tokenErr) throw new Error(`createVisit (token lookup): ${tokenErr.message}`);
    const nextToken = (latestToday?.[0]?.token_number ?? 0) + 1;

    const insertPayload: Record<string, unknown> = {
        patient_id: patientId,
        assigned_doctor_id: doctorId,
        hospital_id: HOSPITAL_ID,
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
};

export async function fetchHospital(hospitalId: string): Promise<DBHospital | null> {
    const { data, error } = await supabase
        .from("hospitals")
        .select("id, name, city, state, phone, email, address, tagline, logo_url, accent_color, is_branded")
        .eq("id", hospitalId)
        .maybeSingle();
    if (error) throw new Error(`fetchHospital: ${error.message}`);
    return data;
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
};

export async function fetchPatientVisits(patientId: string): Promise<RealVisit[]> {
    const { data: visits, error: visitErr } = await supabase
        .from("visits")
        .select("id, created_at, assigned_doctor_id, status")
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
};

export async function fetchTodayPatients(): Promise<PatientRecordRow[]> {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const { data: visits, error } = await supabase
        .from("visits")
        .select("id, patient_id, status, started_at, completed_at")
        .eq("assigned_doctor_id", DOCTOR_ID)
        .gte("started_at", todayStart.toISOString())
        .order("started_at", { ascending: false });

    if (error) throw new Error(`fetchTodayPatients: ${error.message}`);
    if (!visits || visits.length === 0) return [];

    const patientIds = [...new Set(visits.map((v: any) => v.patient_id))];
    const visitIds = visits.map((v: any) => v.id);

    const { data: patients } = await supabase
        .from("patients")
        .select("id, name, age, gender, phone")
        .in("id", patientIds);
    const patMap = new Map<string, any>();
    (patients ?? []).forEach((p: any) => patMap.set(p.id, p));

    const { data: allVisitCounts } = await supabase
        .from("visits")
        .select("patient_id, started_at")
        .in("patient_id", patientIds)
        .eq("assigned_doctor_id", DOCTOR_ID)
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
    }

    const { data: doRows } = await supabase
        .from("diagnostic_orders")
        .select("visit_id, test_name")
        .in("visit_id", visitIds);

    return visits.map((v: any) => {
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

        return {
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
        };
    });
}

// ── PATIENT RECORDS PAGE — ALL RECENT PATIENTS ────────────────────────────────
export async function fetchRecentPatients(limit = 40): Promise<PatientRecordRow[]> {
    const { data: visits, error } = await supabase
        .from("visits")
        .select("id, patient_id, status, started_at, completed_at")
        .eq("assigned_doctor_id", DOCTOR_ID)
        .eq("status", "completed")
        .order("started_at", { ascending: false })
        .limit(limit);

    if (error) throw new Error(`fetchRecentPatients: ${error.message}`);
    if (!visits || visits.length === 0) return [];

    const patientIds = [...new Set(visits.map((v: any) => v.patient_id))];
    const visitIds = visits.map((v: any) => v.id);

    const { data: patients } = await supabase
        .from("patients")
        .select("id, name, age, gender, phone")
        .in("id", patientIds);
    const patMap = new Map<string, any>();
    (patients ?? []).forEach((p: any) => patMap.set(p.id, p));

    const { data: allVisitCounts } = await supabase
        .from("visits")
        .select("patient_id, started_at")
        .in("patient_id", patientIds)
        .eq("assigned_doctor_id", DOCTOR_ID)
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
    }

    const { data: doRows } = await supabase
        .from("diagnostic_orders")
        .select("visit_id, test_name")
        .in("visit_id", visitIds);

    const seenPatients = new Set<string>();
    const deduped: PatientRecordRow[] = [];

    for (const v of visits) {
        if (seenPatients.has(v.patient_id)) continue;
        seenPatients.add(v.patient_id);

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

        deduped.push({
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
        });
    }

    return deduped;
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
        .select("id, name, age, gender, phone, abha_id, created_at")
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
    fields: { name: string; age: number; gender: string; phone: string }
): Promise<DBPatient> {
    const { data, error } = await supabase
        .from("patients")
        .update(fields)
        .eq("id", patientId)
        .select("id, name, age, gender, phone")
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
        .select("id, name, age, gender, phone")
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