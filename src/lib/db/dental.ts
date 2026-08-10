// ---------------------------------------------------------------------------
// The tooth chart — Supabase boundary. Plain RLS-scoped table access, no
// edge function needed: unlike attachments, nothing here touches a storage
// secret. hospital_isolation on dental_findings (via visit_id -> visits
// .hospital_id) does the same job current_user_hospital_id() does everywhere
// else in this schema.
// ---------------------------------------------------------------------------

import { supabase } from "../supabase";
import type { DentalCondition, DentalFinding } from "../dental/types";
import type { ToothSurface } from "../dental/anatomy";

const DENTAL_COLUMNS =
    "id, visit_id, tooth_number, surface, condition, note, attachment_id, created_by_doctor_id, created_at";

function fromRow(r: {
    id: number;
    visit_id: string;
    tooth_number: string;
    surface: string | null;
    condition: string;
    note: string | null;
    attachment_id: number | null;
    created_by_doctor_id: string | null;
    created_at: string;
}): DentalFinding {
    return {
        id: r.id,
        visitId: r.visit_id,
        toothNumber: r.tooth_number,
        surface: r.surface as ToothSurface | null,
        condition: r.condition as DentalCondition,
        note: r.note,
        attachmentId: r.attachment_id,
        createdByDoctorId: r.created_by_doctor_id,
        createdAt: r.created_at,
    };
}

export async function listDentalFindings(visitId: string): Promise<DentalFinding[]> {
    const { data, error } = await supabase
        .from("dental_findings")
        .select(DENTAL_COLUMNS)
        .eq("visit_id", visitId)
        .order("tooth_number", { ascending: true });
    if (error) throw new Error(`listDentalFindings: ${error.message}`);
    return (data ?? []).map(fromRow);
}

export async function addDentalFinding(opts: {
    visitId: string;
    toothNumber: string;
    /** omit or null for a whole-tooth finding (missing, mobile, impacted, root canal) */
    surface?: ToothSurface | null;
    condition: DentalCondition;
    note?: string;
    attachmentId?: number;
    doctorId?: string | null;
}): Promise<DentalFinding> {
    const { data, error } = await supabase
        .from("dental_findings")
        .insert({
            visit_id: opts.visitId,
            tooth_number: opts.toothNumber,
            surface: opts.surface ?? null,
            condition: opts.condition,
            note: opts.note ?? null,
            attachment_id: opts.attachmentId ?? null,
            created_by_doctor_id: opts.doctorId ?? null,
        })
        .select(DENTAL_COLUMNS)
        .single();
    if (error) throw new Error(`addDentalFinding: ${error.message}`);
    return fromRow(data);
}

export async function deleteDentalFinding(id: number): Promise<void> {
    const { error } = await supabase.from("dental_findings").delete().eq("id", id);
    if (error) throw new Error(`deleteDentalFinding: ${error.message}`);
}
