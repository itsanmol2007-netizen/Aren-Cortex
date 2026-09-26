// ---------------------------------------------------------------------------
// LAB ORDERS — an investigation order handed to a preferred lab.
//
// The doctor's session writes the order (lab_order_handoffs, hospital RLS)
// with everything the lab's page shows; `messaging-send` (purpose
// lab_order) then sends the approved `lab_investigation_order` template to
// the lab's WhatsApp number, one credit like any message. The lab opens
// /lab-orders/:token, read by the public `lab-order-preview` function.
// ---------------------------------------------------------------------------

import { supabase } from "../supabase";

export type LabPriority = "routine" | "urgent" | "stat";

export const LAB_PRIORITY_LABEL: Record<LabPriority, string> = {
    routine: "Routine",
    urgent: "Urgent",
    stat: "STAT",
};

export interface LabOrderTest {
    /** "X-Ray Hand / Wrist" */
    name: string;
    /** "Left wrist", when the order names a place */
    site: string | null;
    /** left / right / both, when it does */
    side: string | null;
}

export interface NewLabOrder {
    hospitalId: string;
    doctorId: string | null;
    patientId: string;
    visitId: string | null;
    prescriptionId: string | null;
    labName: string;
    labPhone: string | null;
    priority: LabPriority;
    indication: string;
    context: string;
    tests: LabOrderTest[];
}

export async function createLabOrder(o: NewLabOrder): Promise<{ id: string; shareToken: string }> {
    const { data, error } = await supabase
        .from("lab_order_handoffs")
        .insert({
            hospital_id: o.hospitalId,
            doctor_id: o.doctorId,
            patient_id: o.patientId,
            visit_id: o.visitId,
            prescription_id: o.prescriptionId,
            lab_name: o.labName,
            lab_phone: o.labPhone,
            priority: o.priority,
            indication: o.indication.trim() || null,
            context: o.context.trim() || null,
            tests: o.tests,
        })
        .select("id, share_token")
        .single();
    if (error) throw new Error(`Could not save the lab order: ${error.message}`);
    return { id: data.id as string, shareToken: data.share_token as string };
}

export type SendLabOrderResult =
    | { ok: true; balance: number }
    | { ok: false; message: string };

/** Sends the saved order to the lab over WhatsApp (one credit). */
export async function sendLabOrder(handoffId: string): Promise<SendLabOrderResult> {
    const { data, error } = await supabase.functions.invoke("messaging-send", {
        body: { purpose: "lab_order", handoffId },
    });
    if (error) return { ok: false, message: "Could not reach WhatsApp. Check the connection and try again." };
    if (!data?.ok) return { ok: false, message: data?.message ?? "The order could not be sent." };
    return { ok: true, balance: Number(data.balance ?? 0) };
}

/** Where the lab opens the order. */
export function labOrderUrl(shareToken: string): string {
    return `${window.location.origin}/lab-orders/${shareToken}`;
}
