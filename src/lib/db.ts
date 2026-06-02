import { supabase } from "./supabase";

// ── CONSTANTS ──────────────────────────────────────────────────────────────────
export const DOCTOR_ID = "5cd330d2-5a48-4098-b865-ed3393e08698";
export const DOCTOR_NAME = "Anmol Pandey";
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
    frequency: string;       // raw slot string e.g. "1-0-1-0"
    duration_days: number;
    route: string;
    notes: string;
  } | null;
};

// Frequency slot string → human label
// Format: morning-afternoon-evening-night (each 0 or 1)
export function freqSlotToLabel(slot: string): string {
  const map: Record<string, string> = {
    "1-1-1-1": "Four times a day",
    "1-1-1-0": "Morning, Afternoon & Evening",
    "1-1-0-1": "Morning, Afternoon & Night",
    "1-0-1-1": "Morning, Evening & Night",
    "0-1-1-1": "Afternoon, Evening & Night",
    "1-1-0-0": "Morning and Afternoon",
    "1-0-1-0": "Morning and Evening",
    "1-0-0-1": "Morning and Night",
    "0-1-0-1": "Afternoon and Night",
    "0-0-1-1": "Evening and Night",
    "1-0-0-0": "Once daily (Morning)",
    "0-1-0-0": "Once daily (Afternoon)",
    "0-0-1-0": "Once daily (Evening)",
    "0-0-0-1": "Once daily (Night)",
    "0-1-1-0": "Afternoon and Evening",
  };
  return map[slot] ?? slot;
}

// Human label → slot string (for saving back)
export function freqLabelToSlot(label: string): string {
  const map: Record<string, string> = {
    "Four times a day": "1-1-1-1",
    "Morning, Afternoon & Evening": "1-1-1-0",
    "Morning, Afternoon & Night": "1-1-0-1",
    "Morning, Evening & Night": "1-0-1-1",
    "Afternoon, Evening & Night": "0-1-1-1",
    "Morning and Afternoon": "1-1-0-0",
    "Morning and Evening": "1-0-1-0",
    "Morning and Night": "1-0-0-1",
    "Afternoon and Night": "0-1-0-1",
    "Evening and Night": "0-0-1-1",
    "Once daily (Morning)": "1-0-0-0",
    "Once daily (Afternoon)": "0-1-0-0",
    "Once daily (Evening)": "0-0-1-0",
    "Once daily (Night)": "0-0-0-1",
    "Afternoon and Evening": "0-1-1-0",
    "Twice a day": "1-0-1-0",
    "Three times a day": "1-1-0-1",
  };
  return map[label] ?? label;
}

// All frequency options for the inspector dropdown
export const FREQUENCY_OPTIONS = [
  "Once daily (Morning)",
  "Once daily (Night)",
  "Once daily (Evening)",
  "Morning and Night",
  "Morning and Evening",
  "Morning, Afternoon & Evening",
  "Four times a day",
  "Morning, Afternoon & Night",
  "Afternoon and Evening",
  "Afternoon and Night",
  "Evening and Night",
];

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
export type SaveConsultMedicine = {
  medicine_id: number;
  composition_ids: number[];     // all composition IDs (1 for single, 2+ for combos)
  dosage_mg: number | null;
  frequency: string;             // slot string e.g. "1-0-1-0"
  duration_days: number | null;
  route: string;
  notes: string;
  instructions: string;
  is_sos: boolean;
  sort_order: number;
};

export async function saveConsult(opts: {
  visitId: string;
  medicines: SaveConsultMedicine[];
  tests: string[];
  vitals: Record<string, string>;
  findingsText: string;
  followUpDays?: number | null;
  adviceNotes?: string | null;
}): Promise<{ prescriptionId: string }> {
  // 1. Save vitals + mark visit completed
  const { error: visitErr } = await supabase
    .from("visits")
    .update({
      vitals: opts.vitals,
      status: "completed",
      completed_at: new Date().toISOString(),
    })
    .eq("id", opts.visitId);
  if (visitErr) throw new Error(`updateVisit: ${visitErr.message}`);

  // 2. Create prescription row
  const { data: rx, error: rxErr } = await supabase
    .from("prescriptions")
    .insert({
      visit_id: opts.visitId,
      assigned_doctor_id: DOCTOR_ID,
      findings_text: opts.findingsText,
      follow_up_days: opts.followUpDays ?? null,
      advice_notes: opts.adviceNotes ?? null,
    })
    .select("id")
    .single();
  if (rxErr) throw new Error(`createPrescription: ${rxErr.message}`);

  // 3. Prescription medicines — full dosage data
  if (opts.medicines.length) {
    const rows = opts.medicines.map((m) => ({
      prescription_id: rx.id,
      medicine_id: m.medicine_id,
      composition_ids: m.composition_ids,          // integer[] array column
      composition_id: m.composition_ids[0] ?? null, // keep legacy column as primary
      dosage_mg: m.dosage_mg,
      frequency: m.frequency,
      duration_days: m.duration_days,
      route: m.route,
      notes: m.notes,
      instructions: m.instructions,
      is_sos: m.is_sos,
      sort_order: m.sort_order,
    }));
    const { error: medErr } = await supabase
      .from("prescription_medicines")
      .insert(rows);
    if (medErr) throw new Error(`insertPrescriptionMedicines: ${medErr.message}`);
  }

  // 4. Diagnostic orders
  if (opts.tests.length) {
    const rows = opts.tests.map((name) => ({
      visit_id: opts.visitId,
      prescription_id: rx.id,
      test_name: name,
      status: "ordered",
    }));
    const { error: testErr } = await supabase
      .from("diagnostic_orders")
      .insert(rows);
    if (testErr) throw new Error(`insertDiagnosticOrders: ${testErr.message}`);
  }

  return { prescriptionId: rx.id };
}

// ── LEARNING LOOP ──────────────────────────────────────────────────────────────
export async function runLearningLoop(opts: {
  visitId: string;
  tagSignature: string;
  selectedCompositionIds: number[];   // all composition IDs across all selected medicines
  rankedCompositionIds: number[];
}): Promise<void> {
  if (!opts.selectedCompositionIds.length && !opts.rankedCompositionIds.length) return;

  const now = new Date().toISOString();

  // Upsert bias for each selected composition
  for (const compositionId of opts.selectedCompositionIds) {
    const { error } = await supabase
      .from("doctor_composition_bias")
      .upsert(
        {
          doctor_id: DOCTOR_ID,
          tag_signature: opts.tagSignature,
          composition_id: compositionId,
          bias_score: 1.0,
          selection_count: 1,
          skip_count: 0,
          updated_at: now,
        },
        {
          onConflict: "doctor_id,tag_signature,composition_id",
          ignoreDuplicates: false,
        }
      );
    if (error) console.warn(`learningLoop upsert bias: ${error.message}`);
  }

  // Log to doctor_logs
  const logRows = opts.selectedCompositionIds.map((compositionId) => ({
    doctor_id: DOCTOR_ID,
    visit_id: opts.visitId,
    selected_composition_id: compositionId,
    selected_medicine_id: null,
    composition_rank_at_selection: opts.rankedCompositionIds.indexOf(compositionId) + 1,
    total_compositions_shown: opts.rankedCompositionIds.length,
  }));

  if (logRows.length) {
    const { error: logErr } = await supabase.from("doctor_logs").insert(logRows);
    if (logErr) console.warn(`learningLoop doctor_logs: ${logErr.message}`);
  }
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

// ── MEDICINE LIBRARY SEARCH ────────────────────────────────────────────────────
export type DBMedicineSearchResult = {
  medicine_id: number;
  medicine_name: string;
  composition_names: string;   // "Amoxicillin + Clavulanic Acid" for combos
  composition_ids: number[];   // all composition IDs
  primary_composition_id: number;
};

export async function searchMedicinesDB(query: string): Promise<DBMedicineSearchResult[]> {
  if (!query || query.trim().length < 2) return [];
  const q = query.trim();

  const { data, error } = await supabase
    .from("medicines")
    .select(`
      id,
      name,
      medicine_composition_map(
        composition_id,
        is_primary,
        compositions(id, name)
      )
    `)
    .ilike("name", `%${q}%`)
    .limit(20);

  if (error) throw new Error(`searchMedicinesDB: ${error.message}`);

  return (data ?? []).map((row: any) => {
    const maps: any[] = Array.isArray(row.medicine_composition_map)
      ? row.medicine_composition_map
      : [];
    // Prefer primary composition for dosage lookup; fall back to first available
    const primary = maps.find((m) => m.is_primary) ?? maps[0];
    return {
      medicine_id: row.id,
      medicine_name: row.name,
      composition_names: maps
        .map((m: any) => m.compositions?.name)
        .filter(Boolean)
        .join(" + "),
      composition_ids: maps
        .map((m: any) => m.composition_id)
        .filter(Boolean),
      primary_composition_id: primary?.composition_id ?? 0,
    };
  });
}

// ── SYNAPSE: FREQUENT PICKS ────────────────────────────────────────────────────
export type FrequentPick = {
  medicine_id: number;
  medicine_name: string;
  composition_id: number;
  composition_name: string;
  hint_label: string;
  clinical_reason: string;
  source: "hint" | "personal";
};

export async function fetchFrequentPicks(opts: {
  activeTagIds: number[];
  excludeCompositionIds: number[];
  doctorId: string;
}): Promise<FrequentPick[]> {
  if (!opts.activeTagIds.length) return [];

  const { data: hints, error: hintErr } = await supabase
    .from("composition_coprescription_hints")
    .select("hint_composition_id, hint_label, clinical_reason, priority")
    .in("trigger_tag_id", opts.activeTagIds)
    .eq("is_global", true)
    .order("priority", { ascending: true });

  if (hintErr) {
    console.warn("fetchFrequentPicks hints:", hintErr.message);
    return [];
  }
  if (!hints || hints.length === 0) return [];

  const seen = new Set<number>(opts.excludeCompositionIds);
  const deduped: { composition_id: number; hint_label: string; clinical_reason: string }[] = [];
  for (const h of hints) {
    if (!seen.has(h.hint_composition_id)) {
      seen.add(h.hint_composition_id);
      deduped.push({
        composition_id: h.hint_composition_id,
        hint_label: h.hint_label,
        clinical_reason: h.clinical_reason ?? "",
      });
    }
  }
  if (!deduped.length) return [];

  const compIds = deduped.map((d) => d.composition_id);
  const { data: comps } = await supabase
    .from("compositions")
    .select("id, name")
    .in("id", compIds);
  const compNameById = new Map<number, string>();
  (comps ?? []).forEach((c: any) => compNameById.set(c.id, c.name));

  const results: FrequentPick[] = [];

  for (const item of deduped) {
    let medicine_id: number | null = null;

    const { data: biasRow } = await supabase
      .from("doctor_medicine_bias")
      .select("medicine_id")
      .eq("doctor_id", opts.doctorId)
      .eq("composition_id", item.composition_id)
      .order("selection_count", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (biasRow?.medicine_id) {
      medicine_id = biasRow.medicine_id;
    } else {
      const { data: mcmRow } = await supabase
        .from("medicine_composition_map")
        .select("medicine_id")
        .eq("composition_id", item.composition_id)
        .eq("is_primary", true)
        .limit(1)
        .maybeSingle();
      if (mcmRow?.medicine_id) medicine_id = mcmRow.medicine_id;
    }

    if (!medicine_id) continue;

    const { data: medRow } = await supabase
      .from("medicines")
      .select("name")
      .eq("id", medicine_id)
      .maybeSingle();

    if (!medRow?.name) continue;

    results.push({
      medicine_id,
      medicine_name: medRow.name,
      composition_id: item.composition_id,
      composition_name: compNameById.get(item.composition_id) ?? "",
      hint_label: item.hint_label,
      clinical_reason: item.clinical_reason,
      source: "hint",
    });

    if (results.length >= 8) break;
  }

  return results;
}

// ── SYNAPSE: LOG CO-PRESCRIPTION OBSERVATIONS ─────────────────────────────────
export async function logCoprescriptionObservations(opts: {
  visitId: string;
  doctorId: string;
  tagSignature: string;
  compositionIds: number[];
}): Promise<void> {
  if (opts.compositionIds.length < 2) return;

  const rows: {
    doctor_id: string;
    visit_id: string;
    primary_composition_id: number;
    coprescribed_composition_id: number;
    tag_signature: string;
  }[] = [];

  for (let i = 0; i < opts.compositionIds.length; i++) {
    for (let j = i + 1; j < opts.compositionIds.length; j++) {
      rows.push({
        doctor_id: opts.doctorId,
        visit_id: opts.visitId,
        primary_composition_id: opts.compositionIds[i],
        coprescribed_composition_id: opts.compositionIds[j],
        tag_signature: opts.tagSignature,
      });
    }
  }

  const { error } = await supabase
    .from("coprescription_observations")
    .insert(rows);

  if (error) console.warn("logCoprescriptionObservations (non-fatal):", error.message);
}

// ── SYNAPSE: DYNAMIC TEST HINTS ────────────────────────────────────────────────
export type DynamicTestHint = {
  test_name: string;
  test_group: string;
  clinical_reason: string;
  priority: number;
};

export async function fetchDynamicTests(activeTagIds: number[]): Promise<DynamicTestHint[]> {
  if (!activeTagIds.length) return [];

  const { data, error } = await supabase
    .from("symptom_cluster_test_hints")
    .select("test_name, test_group, clinical_reason, priority")
    .in("trigger_tag_id", activeTagIds)
    .eq("is_global", true)
    .order("priority", { ascending: true })
    .limit(20);

  if (error) {
    console.warn("fetchDynamicTests (non-fatal):", error.message);
    return [];
  }

  const seen = new Map<string, DynamicTestHint>();
  for (const row of (data ?? [])) {
    if (!seen.has(row.test_name)) seen.set(row.test_name, row as DynamicTestHint);
  }

  return Array.from(seen.values());
}

// ── FAVOURITES ─────────────────────────────────────────────────────────────────
export async function fetchDoctorFavourites(
  doctorId: string
): Promise<{ medicine_id: number; composition_id: number }[]> {
  const { data, error } = await supabase
    .from("doctor_medicine_bias")
    .select("medicine_id, composition_id")
    .eq("doctor_id", doctorId)
    .eq("is_favourite", true);
  if (error) {
    console.warn("fetchDoctorFavourites (non-fatal):", error.message);
    return [];
  }
  return (data ?? []).map((r: any) => ({
    medicine_id: Number(r.medicine_id),
    composition_id: Number(r.composition_id),
  }));
}

export async function toggleFavouriteMedicine(opts: {
  doctorId: string;
  medicineId: number;
  compositionId: number;
  setFav: boolean;
}): Promise<void> {
  const { error } = await supabase
    .from("doctor_medicine_bias")
    .upsert(
      {
        doctor_id: opts.doctorId,
        medicine_id: opts.medicineId,
        composition_id: opts.compositionId,
        is_favourite: opts.setFav,
        selection_count: opts.setFav ? 999 : 1,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "doctor_id,composition_id,medicine_id" }
    );
  if (error) throw new Error(`toggleFavouriteMedicine: ${error.message}`);
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

  // patients
  const { data: patients } = await supabase
    .from("patients")
    .select("id, name, age, gender, phone")
    .in("id", patientIds);
  const patMap = new Map<string, any>();
  (patients ?? []).forEach((p: any) => patMap.set(p.id, p));

  // visit count per patient (all time)
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

  // symptoms
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

  // findings
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

  // medicines
  // prescriptions → prescription_medicines (no visit_id on pm table)
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

  // tests
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

  // patients
  const { data: patients } = await supabase
    .from("patients")
    .select("id, name, age, gender, phone")
    .in("id", patientIds);
  const patMap = new Map<string, any>();
  (patients ?? []).forEach((p: any) => patMap.set(p.id, p));

  // visit count per patient (all time)
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

  // symptoms
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

  // findings
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

  // prescriptions → prescription_medicines (no visit_id on pm table)
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

  // tests
  const { data: doRows } = await supabase
    .from("diagnostic_orders")
    .select("visit_id, test_name")
    .in("visit_id", visitIds);

  // deduplicate: keep only most recent completed visit per patient
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