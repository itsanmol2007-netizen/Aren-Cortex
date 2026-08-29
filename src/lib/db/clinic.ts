// ---------------------------------------------------------------------------
// CLINIC — the data layer behind the Clinic page.
//
// Three concerns, deliberately kept apart because the brief is strict about
// the boundary between them:
//
//  1. IDENTITY   — `hospitals` (the clinic) and `doctors` (the doctor). Two
//     rows, one identity surface on the page. Neither is invented here:
//     `fetchHospital`/`fetchDoctor` already live in `db/patients.ts` and stay
//     the only readers; this file adds the WRITES those two surfaces need,
//     plus the three columns the Clinic page introduced (website, clinic type,
//     facility type).
//  2. HOURS      — `clinic_hours`, one row per open SESSION. A weekday with no
//     rows is closed; there is no second boolean that could disagree with the
//     rows beside it (standing rule 19).
//  3. PRESCRIPTION CONFIG — `prescription_settings`, the Prescription Editor's
//     structured model. "Rendering system ≠ editing system": the editor writes
//     this, `PrescriptionDocument` reads it, and neither knows about the other.
//     A MISSING row is normal, not an error — `DEFAULT_PRESCRIPTION_CONFIG`
//     reproduces exactly what the renderer printed before this table existed.
//
// Standing rule 1: every Supabase call for the Clinic page is in this file.
// ---------------------------------------------------------------------------

import { supabase } from "../supabase";
import type { CompressedImage } from "../image/compress";

// ── CLINIC IDENTITY ────────────────────────────────────────────────────────────

/** The columns the Clinic page's identity card lets a doctor edit. Everything
 *  else on `hospitals` (accent_color, specialty_profile, is_branded…) is owned
 *  by another surface and is deliberately not reachable from here. */
export type ClinicProfilePatch = {
    name: string;
    clinic_type: string | null;
    facility_type: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    phone: string | null;
    email: string | null;
    website: string | null;
    tagline: string | null;
    /**
     * Present ONLY on a save that actually changed the logo (a new upload, or
     * an explicit remove) — see `EditClinicModal`. Omitted (not merely
     * `undefined`-valued; the key itself absent) on every other save, so a
     * doctor editing their phone number can never accidentally null out a
     * logo they never touched.
     */
    logo_url?: string | null;
};

export async function updateClinicProfile(
    hospitalId: string,
    patch: ClinicProfilePatch
): Promise<void> {
    const { error } = await supabase
        .from("hospitals")
        .update(patch)
        .eq("id", hospitalId);
    if (error) throw new Error(`updateClinicProfile: ${error.message}`);
}

/** The doctor half of the same identity surface. `name` is required for the
 *  same reason the clinic's is — a prescription with a blank prescriber is not
 *  a prescription. */
export type DoctorProfilePatch = {
    name: string;
    qualification: string | null;
    specialization: string | null;
    registration_number: string | null;
    phone: string | null;
    /** Same rule as `ClinicProfilePatch.logo_url` — present only when this
     *  save actually changed the photo. */
    avatar_url?: string | null;
};

export async function updateDoctorProfile(
    doctorId: string,
    patch: DoctorProfilePatch
): Promise<void> {
    const { error } = await supabase
        .from("doctors")
        .update(patch)
        .eq("id", doctorId);
    if (error) throw new Error(`updateDoctorProfile: ${error.message}`);
}

// ── LOGO / PHOTO UPLOAD ─────────────────────────────────────────────────────────
//
// The compression itself lives in `lib/image/compress.ts` — a pure browser
// concern, not a DB one. This is only the upload half: hand it an already-
// compressed image and get back the public URL to write onto `hospitals` /
// `doctors`. Both buckets are `public: true` (no signed-URL dance to read
// back) and RLS-scoped by a `{hospital_id}/...` path prefix, reusing the same
// `current_user_hospital_id()` every other `hospital_isolation` policy in
// this schema already calls — see the `clinic_and_doctor_asset_storage_
// policies` migration.
//
// `upsert: true` + a fresh timestamp in the key rather than a fixed
// `logo`/`avatar` filename: overwriting the SAME key would leave old copies
// unreachable but not deleted (Supabase Storage doesn't garbage-collect a
// replaced object on its own), so an ever-changing key at least makes each
// upload independently inspectable/removable later, at the cost of the old
// object lingering in the bucket until something cleans it up — no such
// cleanup exists yet, flagged rather than built speculatively here.

export async function uploadClinicLogo(
    hospitalId: string,
    image: CompressedImage
): Promise<string> {
    const path = `${hospitalId}/logo-${Date.now()}.${image.ext}`;
    const { error } = await supabase.storage
        .from("clinic-assets")
        .upload(path, image.blob, { contentType: image.blob.type, upsert: true });
    if (error) throw new Error(`uploadClinicLogo: ${error.message}`);
    return supabase.storage.from("clinic-assets").getPublicUrl(path).data.publicUrl;
}

export async function uploadDoctorAvatar(
    hospitalId: string,
    doctorId: string,
    image: CompressedImage
): Promise<string> {
    const path = `${hospitalId}/${doctorId}-${Date.now()}.${image.ext}`;
    const { error } = await supabase.storage
        .from("doctor-assets")
        .upload(path, image.blob, { contentType: image.blob.type, upsert: true });
    if (error) throw new Error(`uploadDoctorAvatar: ${error.message}`);
    return supabase.storage.from("doctor-assets").getPublicUrl(path).data.publicUrl;
}

// ── CLINIC HOURS ───────────────────────────────────────────────────────────────

/** 0 = Monday … 6 = Sunday. Monday-first, matching how the clinic's own week
 *  reads on the page — NEVER Postgres' `dow` (Sunday-first), which would
 *  silently disagree with the UI's ordering. */
export const WEEKDAYS = [
    "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
] as const;

export type ClinicSession = {
    /** `HH:MM`, 24h — what an `<input type="time">` produces and what Postgres
     *  `time` accepts unchanged. */
    opensAt: string;
    closesAt: string;
};

/** One entry per weekday, always seven, always in `WEEKDAYS` order. An empty
 *  `sessions` array IS "closed" — the caller never has to reconcile a boolean
 *  against a list. */
export type ClinicDayHours = {
    day: number;
    sessions: ClinicSession[];
};

export function emptyClinicHours(): ClinicDayHours[] {
    return WEEKDAYS.map((_, day) => ({ day, sessions: [] }));
}

/** Trims Postgres' `HH:MM:SS` back to the `HH:MM` an `<input type="time">`
 *  round-trips. Doing this at the boundary means nothing downstream has to
 *  know the two representations differ. */
function toInputTime(t: string): string {
    return t.slice(0, 5);
}

export async function fetchClinicHours(hospitalId: string): Promise<ClinicDayHours[]> {
    const { data, error } = await supabase
        .from("clinic_hours")
        .select("day_of_week, opens_at, closes_at")
        .eq("hospital_id", hospitalId)
        .order("day_of_week")
        .order("opens_at");
    if (error) throw new Error(`fetchClinicHours: ${error.message}`);

    const week = emptyClinicHours();
    for (const row of data ?? []) {
        const day = week[row.day_of_week as number];
        if (!day) continue;
        day.sessions.push({
            opensAt: toInputTime(row.opens_at as string),
            closesAt: toInputTime(row.closes_at as string),
        });
    }
    return week;
}

/**
 * Replaces the WHOLE week in one go — delete every row for this clinic, insert
 * what the modal produced. The alternative (diffing day by day) buys nothing
 * here: the modal edits all seven days at once behind a single Save, so a
 * partial write would be a state the UI never actually represents. The delete
 * and insert are two statements rather than one transaction, so the failure
 * mode is worth naming: an insert that fails after the delete leaves the clinic
 * with NO hours rather than its old ones. The caller surfaces the error and the
 * modal keeps the doctor's own edited draft on screen to retry from.
 */
export async function replaceClinicHours(
    hospitalId: string,
    week: ClinicDayHours[]
): Promise<void> {
    const { error: delError } = await supabase
        .from("clinic_hours")
        .delete()
        .eq("hospital_id", hospitalId);
    if (delError) throw new Error(`replaceClinicHours (clear): ${delError.message}`);

    const rows = week.flatMap((d) =>
        d.sessions.map((s) => ({
            hospital_id: hospitalId,
            day_of_week: d.day,
            opens_at: s.opensAt,
            closes_at: s.closesAt,
        }))
    );
    if (!rows.length) return;

    const { error } = await supabase.from("clinic_hours").insert(rows);
    if (error) throw new Error(`replaceClinicHours (insert): ${error.message}`);
}

// ── PRESCRIPTION CONFIG ────────────────────────────────────────────────────────

/**
 * What the Prescription Editor edits and `PrescriptionDocument` renders.
 *
 * This is the EDITING model. It holds no prescription content of its own
 * beyond the two things that exist only to be printed (`footerNote`,
 * `defaultAdvice`) — everything else it describes is data already owned by the
 * clinic or the doctor profile, and this only decides whether it appears.
 */
export type PrescriptionConfig = {
    identityMode: "clinic" | "doctor" | "both";
    profileImage: "clinic_logo" | "doctor_photo" | "none";
    /**
     * NOT a fourth `PrintFormat` alongside a5/a4/thermal — format is paper
     * geometry, colour is a separate axis a clinic sets once. `"monochrome"`
     * forces the a5/a4 renderer onto a fixed neutral grey/black palette and
     * drops the letterhead photo/logo for the initials crest (a detailed
     * colour image halftones badly on a plain black-and-white printer).
     * Thermal is unaffected — it was already monochrome by construction, and
     * stays the answer for a receipt-style slip rather than a full sheet.
     */
    printMode: "color" | "monochrome";
    showQualification: boolean;
    showSpecialty: boolean;
    showRegistration: boolean;
    showClinicAddress: boolean;
    showClinicPhone: boolean;
    showClinicEmail: boolean;
    showWebsite: boolean;
    showSignature: boolean;
    footerNote: string;
    defaultAdvice: string[];
};

/**
 * The un-configured clinic's prescription — chosen to reproduce EXACTLY what
 * `PrescriptionDocument` printed before this config existed, including the
 * three advice lines it used to hardcode. That is what makes the config safe to
 * thread through the live print path: a clinic that never opens the editor sees
 * no change on paper.
 */
export const DEFAULT_PRESCRIPTION_CONFIG: PrescriptionConfig = {
    identityMode: "both",
    profileImage: "clinic_logo",
    printMode: "color",
    showQualification: true,
    showSpecialty: true,
    showRegistration: true,
    showClinicAddress: true,
    showClinicPhone: true,
    showClinicEmail: false,
    showWebsite: false,
    showSignature: true,
    footerNote: "",
    defaultAdvice: [
        "Take medicines as prescribed.",
        "Complete the full course.",
        "Consult if symptoms worsen.",
    ],
};

export async function fetchPrescriptionConfig(hospitalId: string): Promise<PrescriptionConfig> {
    const { data, error } = await supabase
        .from("prescription_settings")
        // One string literal, never a concatenation: supabase-js infers the
        // row's type from the literal itself, and `a + b` erases that back to
        // `GenericStringError` (every field then reads as a type error).
        .select("identity_mode, profile_image, print_mode, show_qualification, show_specialty, show_registration, show_clinic_address, show_clinic_phone, show_clinic_email, show_website, show_signature, footer_note, default_advice")
        .eq("hospital_id", hospitalId)
        .maybeSingle();
    if (error) throw new Error(`fetchPrescriptionConfig: ${error.message}`);
    if (!data) return DEFAULT_PRESCRIPTION_CONFIG;

    return {
        identityMode: data.identity_mode as PrescriptionConfig["identityMode"],
        profileImage: data.profile_image as PrescriptionConfig["profileImage"],
        printMode: data.print_mode as PrescriptionConfig["printMode"],
        showQualification: data.show_qualification,
        showSpecialty: data.show_specialty,
        showRegistration: data.show_registration,
        showClinicAddress: data.show_clinic_address,
        showClinicPhone: data.show_clinic_phone,
        showClinicEmail: data.show_clinic_email,
        showWebsite: data.show_website,
        showSignature: data.show_signature,
        footerNote: data.footer_note ?? "",
        defaultAdvice: (data.default_advice as string[] | null) ?? [],
    };
}

export async function savePrescriptionConfig(
    hospitalId: string,
    config: PrescriptionConfig
): Promise<void> {
    const { error } = await supabase
        .from("prescription_settings")
        .upsert(
            {
                hospital_id: hospitalId,
                identity_mode: config.identityMode,
                profile_image: config.profileImage,
                print_mode: config.printMode,
                show_qualification: config.showQualification,
                show_specialty: config.showSpecialty,
                show_registration: config.showRegistration,
                show_clinic_address: config.showClinicAddress,
                show_clinic_phone: config.showClinicPhone,
                show_clinic_email: config.showClinicEmail,
                show_website: config.showWebsite,
                show_signature: config.showSignature,
                // An empty box is "no footer", stored as NULL rather than an
                // empty string — the renderer's own `if (footerNote)` guard
                // then reads the same either way.
                footer_note: config.footerNote.trim() || null,
                default_advice: config.defaultAdvice,
                updated_at: new Date().toISOString(),
            },
            { onConflict: "hospital_id" }
        );
    if (error) throw new Error(`savePrescriptionConfig: ${error.message}`);
}
