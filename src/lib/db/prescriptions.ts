import { supabase } from "../supabase";
import type { PrescriptionMedicine, Vitals } from "../../types";

// ── PRINT RX — PRESCRIPTION QUEUE ──────────────────────────────────────────────
// The receptionist's document workspace reads prescriptions that already exist
// (created by Consult's saveConsult) — never a parallel print store. Hydration
// happens client-side over a handful of queries, the same pattern as
// fetchTodayVisits / fetchPatientDirectory: the clinic-MVP dataset is small.

export type PrintQueueRx = {
    prescription_id: string;
    created_at: string; // when the doctor finalized it
    follow_up_days: number | null;
    visit_id: string;
    visit_created_at: string | null;
    token_number: number | null;
    prescription_ref: string | null;
    patient_id: string;
    patient_name: string;
    age: number;
    gender: string;
    phone: string;
    doctor_id: string | null;
    doctor_name: string | null;
    medicine_count: number;
    test_count: number;
};

// Recent prescriptions, newest first. The window (default 150) comfortably
// covers weeks of a small clinic's output; anything older is reachable via the
// selected patient's prescription history. Not filtered by hospital_id —
// legacy visit rows often carry null there (same decision as
// fetchPatientDirectory / searchPatients).
export async function fetchPrintQueue(limit = 150): Promise<PrintQueueRx[]> {
    const { data: rxRows, error } = await supabase
        .from("prescriptions")
        .select("id, visit_id, assigned_doctor_id, created_at, follow_up_days")
        .order("created_at", { ascending: false })
        .limit(limit);
    if (error) throw new Error(`fetchPrintQueue: ${error.message}`);
    if (!rxRows || rxRows.length === 0) return [];

    const visitIds = [...new Set(rxRows.map((r: any) => r.visit_id).filter(Boolean))];
    const rxIds = rxRows.map((r: any) => r.id);

    const { data: visits, error: visitErr } = await supabase
        .from("visits")
        .select("id, patient_id, token_number, created_at, prescription_ref")
        .in("id", visitIds);
    if (visitErr) throw new Error(`fetchPrintQueue (visits): ${visitErr.message}`);
    const visitMap = new Map<string, any>();
    (visits ?? []).forEach((v: any) => visitMap.set(v.id, v));

    const patientIds = [...new Set((visits ?? []).map((v: any) => v.patient_id).filter(Boolean))];
    const patMap = new Map<string, any>();
    if (patientIds.length) {
        const { data: patients } = await supabase
            .from("patients")
            .select("id, name, age, gender, phone")
            .in("id", patientIds);
        (patients ?? []).forEach((p: any) => patMap.set(p.id, p));
    }

    const doctorIds = [...new Set(rxRows.map((r: any) => r.assigned_doctor_id).filter(Boolean))];
    const doctorMap = new Map<string, string>();
    if (doctorIds.length) {
        const { data: docs } = await supabase.from("doctors").select("id, name").in("id", doctorIds);
        (docs ?? []).forEach((d: any) => doctorMap.set(d.id, d.name));
    }

    const medCount = new Map<string, number>();
    const { data: pmRows } = await supabase
        .from("prescription_medicines")
        .select("prescription_id")
        .in("prescription_id", rxIds);
    (pmRows ?? []).forEach((r: any) => medCount.set(r.prescription_id, (medCount.get(r.prescription_id) ?? 0) + 1));

    const testCount = new Map<string, number>();
    const { data: doRows } = await supabase
        .from("diagnostic_orders")
        .select("prescription_id")
        .in("prescription_id", rxIds);
    (doRows ?? []).forEach((r: any) => {
        if (!r.prescription_id) return;
        testCount.set(r.prescription_id, (testCount.get(r.prescription_id) ?? 0) + 1);
    });

    return rxRows.map((r: any) => {
        const visit = visitMap.get(r.visit_id) ?? {};
        const pat = patMap.get(visit.patient_id) ?? {};
        return {
            prescription_id: r.id,
            created_at: r.created_at,
            follow_up_days: r.follow_up_days ?? null,
            visit_id: r.visit_id,
            visit_created_at: visit.created_at ?? null,
            token_number: visit.token_number ?? null,
            prescription_ref: visit.prescription_ref ?? null,
            patient_id: visit.patient_id ?? "",
            patient_name: pat.name ?? "Unknown",
            age: pat.age ?? 0,
            gender: pat.gender ?? "",
            phone: pat.phone ?? "",
            doctor_id: r.assigned_doctor_id ?? null,
            doctor_name: r.assigned_doctor_id ? (doctorMap.get(r.assigned_doctor_id) ?? null) : null,
            medicine_count: medCount.get(r.id) ?? 0,
            test_count: testCount.get(r.id) ?? 0,
        };
    });
}

// ── PRINT RX — ONE PRESCRIPTION, RENDER-READY ──────────────────────────────────
// Everything ReviewModal / PrescriptionDocument need to reproduce the document
// exactly as Consult would print it. This is a *read* shaped for the one
// existing rendering pipeline — Print RX never re-renders prescriptions itself.

export type PrescriptionRenderData = {
    prescriptionId: string;
    visitId: string;
    prescriptionRef: string | null;
    createdAt: string;
    patient: { id: string; name: string; age: number; gender: string; phone: string };
    symptoms: string[];
    findings: string[];
    medicines: PrescriptionMedicine[];
    tests: string[];
    followUpDays: number | null;
    adviceNotes: string | null;
    vitals: Vitals | null;
    doctor: {
        name: string;
        specialization: string | null;
        qualification: string | null;
        registration_number: string | null;
        signature_image_url: string | null;
        avatar_url: string | null;
    } | null;
};

export async function fetchPrescriptionRenderData(prescriptionId: string): Promise<PrescriptionRenderData> {
    const { data: rx, error: rxErr } = await supabase
        .from("prescriptions")
        .select("id, visit_id, assigned_doctor_id, created_at, follow_up_days, advice_notes")
        .eq("id", prescriptionId)
        .single();
    if (rxErr) throw new Error(`fetchPrescriptionRenderData: ${rxErr.message}`);

    const { data: visit, error: visitErr } = await supabase
        .from("visits")
        .select("id, patient_id, vitals, prescription_ref")
        .eq("id", rx.visit_id)
        .single();
    if (visitErr) throw new Error(`fetchPrescriptionRenderData (visit): ${visitErr.message}`);

    const { data: patient, error: patErr } = await supabase
        .from("patients")
        .select("id, name, age, gender, phone")
        .eq("id", visit.patient_id)
        .single();
    if (patErr) throw new Error(`fetchPrescriptionRenderData (patient): ${patErr.message}`);

    let doctor: PrescriptionRenderData["doctor"] = null;
    if (rx.assigned_doctor_id) {
        const { data: doc } = await supabase
            .from("doctors")
            .select("name, specialization, qualification, registration_number, signature_image_url, avatar_url")
            .eq("id", rx.assigned_doctor_id)
            .maybeSingle();
        doctor = doc ?? null;
    }

    // Presenting complaints + findings, resolved to names (structured entities).
    const { data: vsRows } = await supabase
        .from("visit_symptoms")
        .select("symptom_id")
        .eq("visit_id", rx.visit_id);
    const symptomIds = [...new Set((vsRows ?? []).map((r: any) => Number(r.symptom_id)))];
    let symptoms: string[] = [];
    if (symptomIds.length) {
        const { data: symps } = await supabase.from("symptoms").select("id, name").in("id", symptomIds);
        symptoms = (symps ?? []).map((s: any) => s.name).filter(Boolean);
    }

    const { data: vfRows } = await supabase
        .from("visit_findings")
        .select("finding_id")
        .eq("visit_id", rx.visit_id);
    const findingIds = [...new Set((vfRows ?? []).map((r: any) => Number(r.finding_id)))];
    let findings: string[] = [];
    if (findingIds.length) {
        const { data: finds } = await supabase.from("findings").select("id, name").in("id", findingIds);
        findings = (finds ?? []).map((f: any) => f.name).filter(Boolean);
    }

    // Medicines with names + composition labels, in the doctor's order.
    const { data: pmRows } = await supabase
        .from("prescription_medicines")
        .select("id, medicine_id, composition_id, composition_ids, dosage_mg, frequency, duration_days, route, notes, instructions, is_sos, sort_order")
        .eq("prescription_id", prescriptionId)
        .order("sort_order", { ascending: true });

    const medIds = [...new Set((pmRows ?? []).map((r: any) => Number(r.medicine_id)))];
    const medNameById = new Map<number, string>();
    if (medIds.length) {
        const { data: meds } = await supabase.from("medicines").select("id, name").in("id", medIds);
        (meds ?? []).forEach((m: any) => medNameById.set(m.id, m.name));
    }

    const compIds = [...new Set((pmRows ?? []).flatMap((r: any) => (r.composition_ids ?? []).map(Number)))];
    const compNameById = new Map<number, string>();
    if (compIds.length) {
        const { data: comps } = await supabase.from("compositions").select("id, name").in("id", compIds);
        (comps ?? []).forEach((c: any) => compNameById.set(c.id, c.name));
    }

    const medicines: PrescriptionMedicine[] = (pmRows ?? []).map((pm: any, i: number) => ({
        id: `printrx-${pm.id}`,
        medicine_id: Number(pm.medicine_id),
        composition_ids: (pm.composition_ids ?? []).map(Number),
        primary_composition_id: pm.composition_id != null ? Number(pm.composition_id) : 0,
        name: medNameById.get(Number(pm.medicine_id)) ?? "Unknown medicine",
        category: "",
        use: "",
        match: 0,
        composition: (pm.composition_ids ?? [])
            .map((id: number) => compNameById.get(Number(id)))
            .filter(Boolean)
            .join(" + "),
        dosage: pm.dosage_mg ? `${pm.dosage_mg}mg` : "",
        // Slot strings ("1-0-1-0") pass through untouched — the renderer
        // resolves them; unknown/null frequencies degrade to blank dots.
        frequency: pm.frequency ?? "",
        duration: pm.duration_days ? `${pm.duration_days} days` : "—",
        notes: pm.notes ?? "",
        dosage_mg: pm.dosage_mg ?? null,
        duration_days: pm.duration_days ?? null,
        route: pm.route ?? "oral",
        instructions: pm.instructions ?? "",
        is_sos: !!pm.is_sos,
        sort_order: pm.sort_order ?? i,
    }));

    const { data: doRows } = await supabase
        .from("diagnostic_orders")
        .select("test_name")
        .eq("prescription_id", prescriptionId);
    const tests = (doRows ?? []).map((r: any) => r.test_name).filter(Boolean) as string[];

    return {
        prescriptionId: rx.id,
        visitId: rx.visit_id,
        prescriptionRef: visit.prescription_ref ?? null,
        createdAt: rx.created_at,
        patient: {
            id: patient.id,
            name: patient.name ?? "Unknown",
            age: patient.age ?? 0,
            gender: patient.gender ?? "",
            phone: patient.phone ?? "",
        },
        symptoms,
        findings,
        medicines,
        tests,
        followUpDays: rx.follow_up_days ?? null,
        adviceNotes: rx.advice_notes ?? null,
        vitals: (visit.vitals as Vitals | null) ?? null,
        doctor,
    };
}
