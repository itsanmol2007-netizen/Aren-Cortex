import { supabase } from "./supabase";

// ═══════════════════════════════════════════════════════════════════════════
//  AUTH — real Supabase Auth, not a new design
//
//  The schema already had this fully worked out before this session touched
//  it: public.users.id -> auth.users(id), users.hospital_id, users.role
//  (owner/admin/doctor/reception/lab/pharmacist), doctors.user_id -> users.id,
//  and RLS policies for self-registration already in place. There are 11 real
//  accounts in auth.users and a real, successful sign-in 4 days before this
//  was written — this wires a frontend onto infrastructure that already
//  works, it does not invent a new auth model.
//
//  Login is by phone number; Supabase Auth here is configured for email/
//  password, so the client translates phone -> `{phone}@aren.internal`
//  before calling signInWithPassword. Confirmed against real data: 5 of 6
//  doctors currently linked to an auth account have exactly this email
//  shape, built from their own doctors.phone.
// ═══════════════════════════════════════════════════════════════════════════

const EMAIL_DOMAIN = "aren.internal";

function phoneToEmail(phone: string): string {
    return `${phone.replace(/\D/g, "")}@${EMAIL_DOMAIN}`;
}

export async function signInWithPhone(phone: string, password: string): Promise<void> {
    const { error } = await supabase.auth.signInWithPassword({
        email: phoneToEmail(phone),
        password,
    });
    if (error) throw new Error(error.message);
}

export async function signOut(): Promise<void> {
    await supabase.auth.signOut();
}

export type AuthedContext = {
    userId: string;
    hospitalId: string;
    role: string;
    doctorId: string;
    doctorName: string;
    doctorSpecialization: string;
};

export type ResolveResult =
    | { kind: "doctor"; context: AuthedContext }
    /** Signed in, has a `users` row, but no linked `doctors` row — a real
     *  account (reception/admin/lab/pharmacist, or a doctor whose
     *  registration never finished) that this workspace has nothing built
     *  for yet. Carries the role so the UI can say something specific. */
    | { kind: "not-a-doctor"; role: string }
    /** Auth succeeded but there's no `users` row at all — registration
     *  never completed for this account. */
    | { kind: "no-profile" };

/** Resolves a signed-in auth.users id into the doctor/hospital identity the
 *  rest of the app needs. */
export async function resolveAuthedContext(userId: string): Promise<ResolveResult> {
    const { data: userRow, error: userErr } = await supabase
        .from("users")
        .select("hospital_id, role")
        .eq("id", userId)
        .maybeSingle();
    if (userErr) throw new Error(`resolveAuthedContext (users): ${userErr.message}`);
    if (!userRow) return { kind: "no-profile" };

    const { data: doctorRow, error: doctorErr } = await supabase
        .from("doctors")
        .select("id, name, specialization")
        .eq("user_id", userId)
        .maybeSingle();
    if (doctorErr) throw new Error(`resolveAuthedContext (doctors): ${doctorErr.message}`);
    if (!doctorRow) return { kind: "not-a-doctor", role: userRow.role };

    return {
        kind: "doctor",
        context: {
            userId,
            hospitalId: userRow.hospital_id,
            role: userRow.role,
            doctorId: doctorRow.id,
            doctorName: doctorRow.name ?? "Doctor",
            doctorSpecialization: doctorRow.specialization ?? "general",
        },
    };
}
