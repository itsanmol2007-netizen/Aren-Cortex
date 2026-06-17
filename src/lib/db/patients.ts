import { supabase } from "../supabase";
import { DOCTOR_ID, HOSPITAL_ID } from "./reference";
import type { DBSymptom, DBFinding } from "./reference";

// ── TYPES ──────────────────────────────────────────────────────────────────────
export type DBPatient = { id: string; name: string; age: number; gender: string; phone: string };
export type DBVisit = { id: string; patient_id: string; assigned_doctor_id: string; status: string };

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
export async function createVisit(patientId: string): Promise<DBVisit> {
    const { data, error } = await supabase
        .from("visits")
        .insert({
            patient_id: patientId,
            assigned_doctor_id: DOCTOR_ID,
            hospital_id: HOSPITAL_ID,
            status: "serving",
            started_at: new Date().toISOString(),
        })
        .select("id, patient_id, assigned_doctor_id, status")
        .single();
    if (error) throw new Error(`createVisit: ${error.message}`);
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
};

export async function fetchDoctor(doctorId: string): Promise<DBDoctor | null> {
    const { data, error } = await supabase
        .from("doctors")
        .select("id, name, specialization, qualification, registration_number, phone, signature_image_url, hospital_id")
        .eq("id", doctorId)
        .maybeSingle();
    if (error) throw new Error(`fetchDoctor: ${error.message}`);
    return data;
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
            symptoms: (vsRows ?? [])
                .filter((r: any) => r.visit_id === v.id)
                .map((r: any) => symptomById.get(Number(r.symptom_id)))
                .filter(Boolean) as string[],
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
        const symptomNames = (vsRows ?? [])
            .filter((r: any) => r.visit_id === v.id)
            .map((r: any) => symptomById.get(Number(r.symptom_id)))
            .filter(Boolean) as string[];
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
        const symptomNames = (vsRows ?? [])
            .filter((r: any) => r.visit_id === v.id)
            .map((r: any) => symptomById.get(Number(r.symptom_id)))
            .filter(Boolean) as string[];
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

// ── VISIT STATUS MANAGEMENT ────────────────────────────────────────────────────
export async function updateVisitStatus(
    visitId: string,
    status: 'draft' | 'referred' | 'discarded'
): Promise<void> {
    const { error } = await supabase
        .from("visits")
        .update({
            status: status
        })
        .eq("id", visitId);

    if (error) throw new Error(`updateVisitStatus: ${error.message}`);
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