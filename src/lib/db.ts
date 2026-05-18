import { supabase } from "./supabase";

// ── CONSTANTS ──────────────────────────────────────────────────────────────────
export const DOCTOR_ID = "5cd330d2-5a48-4098-b865-ed3393e08698";
export const DOCTOR_NAME = "SK Pandey";
export const DOCTOR_SPECIALIZATION = "general";
export const HOSPITAL_ID: string | null = null;

// ── TYPES ──────────────────────────────────────────────────────────────────────
export type DBSymptom = { id: number; name: string };
export type DBFinding = { id: number; name: string; group_name: string; is_abnormal: boolean };
export type DBPatient = { id: string; name: string; age: number; gender: string; phone: string };
export type DBVisit = { id: string; patient_id: string; assigned_doctor_id: string; status: string };

export type RankedMedicine = {
  medicine_id: number;
  medicine_name: string;
  composition_names: string;
  score: number;
  primary_composition_id: number;
  dosage_defaults: {
    dosage_mg: number | null;
    timesPerDay: number;
    duration_days: number;
    notes: string;
  } | null;
};

// ── SYMPTOMS ───────────────────────────────────────────────────────────────────
export async function fetchSymptoms(): Promise<DBSymptom[]> {
  const { data, error } = await supabase
    .from("symptoms")
    .select("id, name")
    .order("name");
  if (error) throw new Error(`fetchSymptoms: ${error.message}`);
  return data ?? [];
}

// ── FINDINGS ───────────────────────────────────────────────────────────────────
export async function fetchFindings(): Promise<DBFinding[]> {
  const { data, error } = await supabase
    .from("findings")
    .select("id, name, group_name, is_abnormal")
    .order("group_name");
  if (error) throw new Error(`fetchFindings: ${error.message}`);
  return data ?? [];
}

// ── PATIENTS ───────────────────────────────────────────────────────────────────
export async function searchPatients(query: string): Promise<DBPatient[]> {
  if (!query || query.length < 2) return [];
  const { data, error } = await supabase
    .from("patients")
    .select("id, name, age, gender, phone")
    .or(`name.ilike.%${query}%,phone.ilike.%${query}%`)
    .limit(5);
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
  symptomIds: number[]
): Promise<void> {
  if (!symptomIds.length) return;
  const rows = symptomIds.map((id) => ({
    visit_id: visitId,
    symptom_id: id,
    intensity: "moderate",
  }));
  const { error } = await supabase.from("visit_symptoms").insert(rows);
  if (error) throw new Error(`saveVisitSymptoms: ${error.message}`);
}

export async function replaceVisitSymptoms(
  visitId: string,
  symptomIds: number[]
): Promise<void> {
  await supabase.from("visit_symptoms").delete().eq("visit_id", visitId);
  if (symptomIds.length) await saveVisitSymptoms(visitId, symptomIds);
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

// ── MEDICINE RANKING ───────────────────────────────────────────────────────────
export async function rankMedicines(opts: {
  symptoms: { id: number; intensity: string }[];
  findingIds: number[];
}): Promise<RankedMedicine[]> {
  if (!opts.symptoms.length && !opts.findingIds.length) return [];

  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/rank-compositions`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        symptoms: opts.symptoms,
        findingIds: opts.findingIds,
        doctorId: DOCTOR_ID,
        specialization: DOCTOR_SPECIALIZATION,
      }),
    }
  );

  if (!res.ok) throw new Error(`rank-compositions: ${res.status}`);
  return res.json();
}

// ── SAVE PRESCRIPTION ──────────────────────────────────────────────────────────
export async function saveConsult(opts: {
  visitId: string;
  medicines: {
    medicine_id: number;
    composition_id: number;
    dosage: string;
    frequency: string;
    duration: string;
    notes: string;
  }[];
  tests: string[];
  vitals: Record<string, string>;
  findingsText: string;
}): Promise<void> {
  // 1. Save vitals to visit
  await supabase
    .from("visits")
    .update({ vitals: opts.vitals, status: "completed", completed_at: new Date().toISOString() })
    .eq("id", opts.visitId);

  // 2. Create prescription row
  const { data: rx, error: rxErr } = await supabase
    .from("prescriptions")
    .insert({
      visit_id: opts.visitId,
      assigned_doctor_id: DOCTOR_ID,
      findings_text: opts.findingsText,
    })
    .select("id")
    .single();
  if (rxErr) throw new Error(`createPrescription: ${rxErr.message}`);

  // 3. Prescription medicines
  if (opts.medicines.length) {
    const rows = opts.medicines.map((m) => ({
      prescription_id: rx.id,
      medicine_id: m.medicine_id,
      composition_id: m.composition_id,
    }));
    await supabase.from("prescription_medicines").insert(rows);
  }

  // 4. Diagnostic orders
  if (opts.tests.length) {
    const rows = opts.tests.map((name) => ({
      visit_id: opts.visitId,
      prescription_id: rx.id,
      test_name: name,
      status: "ordered",
    }));
    await supabase.from("diagnostic_orders").insert(rows);
  }
}
