// ---------------------------------------------------------------------------
// Body sites — the Supabase boundary. Plain RLS-scoped table access, the same
// shape as lib/db/dental.ts: nothing here touches a storage secret, so no edge
// function is involved. hospital_isolation on visit_body_sites (via visit_id
// -> visits.hospital_id) does the same job it does everywhere else.
// ---------------------------------------------------------------------------

import { supabase } from "../supabase";
import type { BodyAspect, BodyRegion, BodySide } from "../body/anatomy";

const COLUMNS =
    "id, visit_id, region, aspect, side, note, attachment_id, created_by_doctor_id, created_at";

export interface BodySiteFinding {
    id: number;
    visitId: string;
    region: BodyRegion;
    aspect: BodyAspect;
    side: BodySide | null;
    note: string | null;
    attachmentId: number | null;
    createdByDoctorId: string | null;
    createdAt: string;
}

function fromRow(r: {
    id: number;
    visit_id: string;
    region: string;
    aspect: string;
    side: string | null;
    note: string | null;
    attachment_id: number | null;
    created_by_doctor_id: string | null;
    created_at: string;
}): BodySiteFinding {
    return {
        id: r.id,
        visitId: r.visit_id,
        region: r.region as BodyRegion,
        aspect: r.aspect as BodyAspect,
        side: r.side as BodySide | null,
        note: r.note,
        attachmentId: r.attachment_id,
        createdByDoctorId: r.created_by_doctor_id,
        createdAt: r.created_at,
    };
}

export async function listBodySites(visitId: string): Promise<BodySiteFinding[]> {
    const { data, error } = await supabase
        .from("visit_body_sites")
        .select(COLUMNS)
        .eq("visit_id", visitId)
        .order("created_at", { ascending: false });
    if (error) throw new Error(`listBodySites: ${error.message}`);
    return (data ?? []).map(fromRow);
}

export async function addBodySite(opts: {
    visitId: string;
    region: BodyRegion;
    aspect: BodyAspect;
    side?: BodySide | null;
    note?: string;
    attachmentId?: number;
    doctorId?: string | null;
}): Promise<BodySiteFinding> {
    const { data, error } = await supabase
        .from("visit_body_sites")
        .insert({
            visit_id: opts.visitId,
            region: opts.region,
            aspect: opts.aspect,
            side: opts.side ?? null,
            note: opts.note ?? null,
            attachment_id: opts.attachmentId ?? null,
            created_by_doctor_id: opts.doctorId ?? null,
        })
        .select(COLUMNS)
        .single();
    if (error) throw new Error(`addBodySite: ${error.message}`);
    return fromRow(data);
}

export async function deleteBodySite(id: number): Promise<void> {
    const { error } = await supabase.from("visit_body_sites").delete().eq("id", id);
    if (error) throw new Error(`deleteBodySite: ${error.message}`);
}
