// Clinic staff. `users` has an ALL policy scoped to current_user_hospital_id(),
// so a signed-in doctor can read and edit their own clinic's people. INSERT is
// registration-only (with_check id = auth.uid()), so a new login cannot be
// minted from here — staff join by registering against the clinic.
import { supabase } from "../supabase";

export type StaffRole = "doctor" | "reception" | "admin" | "owner";

export interface StaffMember {
    id: string;
    full_name: string | null;
    phone: string | null;
    role: string | null;
    is_active: boolean;
    created_at: string;
}

export async function fetchStaff(hospitalId: string): Promise<StaffMember[]> {
    const { data, error } = await supabase
        .from("users")
        .select("id, full_name, phone, role, is_active, created_at")
        .eq("hospital_id", hospitalId)
        .order("created_at", { ascending: true });
    if (error) throw new Error(`fetchStaff: ${error.message}`);
    return (data ?? []) as StaffMember[];
}

export async function updateStaffMember(
    userId: string,
    patch: { full_name?: string | null; role?: string; is_active?: boolean }
): Promise<void> {
    const { error } = await supabase.from("users").update(patch).eq("id", userId);
    if (error) throw new Error(`updateStaffMember: ${error.message}`);
}
