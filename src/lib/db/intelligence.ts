import { supabase } from "../supabase";
import { DOCTOR_ID, DOCTOR_SPECIALIZATION } from "./reference";

// ── TYPES ──────────────────────────────────────────────────────────────────────
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
    tagSignature: string;
    symptoms: { id: number; intensity: string }[];
    findingIds: number[];
    selectedMedicines: { medicineId: number; compositionId: number }[];
    rankedMedicineIds: number[];
    hospitalId?: string | null;
}): Promise<void> {
    if (!opts.selectedMedicines.length) return;

    const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/rank-compositions`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            },
            body: JSON.stringify({
                action: "learn",
                doctorId: DOCTOR_ID,
                hospitalId: opts.hospitalId ?? null,
                tagSignature: opts.tagSignature,
                symptoms: opts.symptoms,
                findingIds: opts.findingIds,
                selectedMedicines: opts.selectedMedicines,
                rankedMedicineIds: opts.rankedMedicineIds,
            }),
        }
    );

    if (!res.ok) {
        const text = await res.text().catch(() => res.status.toString());
        throw new Error(`runLearningLoop: ${text}`);
    }
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

export async function fetchFavouriteMedicines(doctorId: string): Promise<FrequentPick[]> {
    const { data, error } = await supabase
        .from("doctor_medicine_bias")
        .select(`
      medicine_id,
      composition_id,
      medicines!inner(name),
      compositions!inner(name)
    `)
        .eq("doctor_id", doctorId)
        .eq("is_favourite", true)
        .order("selection_count", { ascending: false });

    if (error || !data) return [];

    return data.map((row: any) => ({
        medicine_id: row.medicine_id,
        medicine_name: row.medicines.name,
        composition_id: row.composition_id,
        composition_name: row.compositions.name,
        hint_label: "Favourite",
        clinical_reason: "",
        source: "personal" as const,
    }));
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
                updated_at: new Date().toISOString(),
            },
            { onConflict: "doctor_id,composition_id,medicine_id" }
        );
    if (error) throw new Error(`toggleFavouriteMedicine: ${error.message}`);
}