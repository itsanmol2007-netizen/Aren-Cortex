// Clinic staff. `users` has an ALL policy scoped to current_user_hospital_id(),
// so a signed-in doctor can read and edit their own clinic's people. INSERT is
// registration-only (with_check id = auth.uid()), so a new login cannot be
// minted from here — staff join by registering against the clinic.
//
// `createStaffMember` below is the one exception, and it deliberately does
// NOT touch `users` directly for that reason: it is an HTTP call to
// `server/admin/routes.js`, which holds the service-role key needed to both
// mint the Supabase Auth account and then write its `users`/`doctors` rows
// under one identity the client could never construct on its own.
import { supabase } from "../supabase";
import { postAuthed } from "../apiClient";

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

// ── Add staff (2026-09-08) ──────────────────────────────────────────────────
//
// "Setting the email, number, and password is possible" — Anmol wanted a
// clinic admin to be able to mint a real sign-in for a new doctor,
// receptionist, or admin from inside the app, rather than that person
// registering themselves against the clinic. The `users` INSERT policy
// above is exactly why this can't be a plain client-side write: it has to
// cross into `server/`, which alone holds the service-role key.

export type NewStaffRole = "admin" | "doctor" | "reception";

export interface NewStaffInput {
    fullName: string;
    /** 10 digits, no country code — same shape the login screen collects. */
    phone: string;
    password: string;
    role: NewStaffRole;
}

export interface NewStaffResult {
    userId: string;
    /** The `<digits>@aren-staff.internal` address this account signs in
     *  with under the hood — shown once, for the admin's own note-taking;
     *  never something anyone types in, since login still only asks for the
     *  phone number (see phoneToStaffAuthEmail's doc comment). */
    authEmail: string;
}

export function createStaffMember(input: NewStaffInput): Promise<NewStaffResult> {
    return postAuthed<NewStaffResult>("/api/admin/staff", input);
}
