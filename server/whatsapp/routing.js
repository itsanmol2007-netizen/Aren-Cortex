// ---------------------------------------------------------------------------
// WHO IS THIS, AND WHOSE CLINIC ARE THEY TEXTING?
//
// Every clinic shares one AREN WhatsApp number (founder decision, 2026-09-04
// — see docs/whatsapp-two-way.md). That buys clinics zero setup and costs us
// exactly one thing: the inbound message doesn't say which clinic it's for.
// This module is the answer to that.
//
// The resolution is entirely in `patients`. A patient row is per-clinic —
// `patients.hospital_id` is NOT NULL in practice and RLS scopes it — so the
// same human attending two clinics has TWO patient rows sharing one phone.
// That makes "which clinic" a lookup, not a guess:
//
//   0 rows  -> a stranger. Not an error: people text businesses. We log it
//              with a null hospital_id (invisible to every clinic) and reply
//              with something honest rather than pretending to know them.
//   1 row   -> the common case. Done.
//   2+ rows -> genuinely ambiguous. We ASK rather than pick, because picking
//              wrong routes a patient's appointment to the wrong clinic —
//              a worse failure than one extra tap.
// ---------------------------------------------------------------------------

import { getSupabase } from "./supabaseClient.js";

/**
 * WhatsApp hands you "91XXXXXXXXXX" (country code + number, no "+"). Every
 * phone in this product is the bare 10-digit number — verified against the
 * live table: all 43 patient rows are length 10, and `phone_normalized`
 * matches `phone` exactly. So matching means stripping a leading "91".
 */
export function stripCountryCode(waPhone) {
    return waPhone.length === 12 && waPhone.startsWith("91") ? waPhone.slice(2) : waPhone;
}

/**
 * @typedef {object} Identity
 * @property {string}  phone       as WhatsApp sent it, E.164 without "+"
 * @property {string}  barePhone   10-digit, what `patients.phone` stores
 * @property {Array<{patientId: string, hospitalId: string, name: string, hospitalName: string}>} candidates
 * @property {string|null} patientId    resolved, only when unambiguous
 * @property {string|null} hospitalId   resolved, only when unambiguous
 * @property {boolean} isKnown      matched at least one patient
 * @property {boolean} isAmbiguous  matched patients across 2+ clinics
 */

/**
 * Resolves an inbound WhatsApp phone number to a patient and a clinic.
 *
 * Never throws for "not found" — an unknown sender is a normal state this
 * returns (`isKnown: false`), not an exception. It throws only if the
 * database itself is unreachable, which the caller treats as fatal because
 * replying blind would be worse than staying silent.
 *
 * @param {string} waPhone  E.164 without "+", as WhatsApp sends it
 * @returns {Promise<Identity>}
 */
export async function resolveIdentity(waPhone) {
    const barePhone = stripCountryCode(waPhone);
    const supabase = getSupabase();

    const { data, error } = await supabase
        .from("patients")
        .select("id, name, hospital_id, hospitals ( name )")
        .eq("phone", barePhone);

    if (error) throw new Error(`resolveIdentity: ${error.message}`);

    // A patient row with a null hospital_id can't be routed anywhere, so it
    // is not a candidate — including it would let a message resolve to a
    // clinic of "null" and vanish from every inbox.
    const candidates = (data ?? [])
        .filter((row) => row.hospital_id)
        .map((row) => ({
            patientId: row.id,
            hospitalId: row.hospital_id,
            name: row.name,
            hospitalName: row.hospitals?.name ?? "your clinic",
        }));

    // Distinct clinics, not distinct rows: one clinic holding two duplicate
    // patient records for the same phone is a data-quality problem, not an
    // ambiguity worth interrupting the patient over. Pick the first and move on.
    const hospitalIds = [...new Set(candidates.map((c) => c.hospitalId))];
    const unambiguous = hospitalIds.length === 1 ? candidates[0] : null;

    return {
        phone: waPhone,
        barePhone,
        candidates,
        patientId: unambiguous?.patientId ?? null,
        hospitalId: unambiguous?.hospitalId ?? null,
        isKnown: candidates.length > 0,
        isAmbiguous: hospitalIds.length > 1,
    };
}

/**
 * The clinic's own display details, for message copy. A patient should read
 * "Dr Sharma's clinic will confirm", never "AREN will confirm" — we are the
 * pipe, not the party they have a relationship with.
 */
export async function fetchClinicIdentity(hospitalId) {
    if (!hospitalId) return null;
    const { data, error } = await getSupabase()
        .from("hospitals")
        .select("id, name, phone, address")
        .eq("id", hospitalId)
        .maybeSingle();
    if (error) {
        console.error("[whatsapp] fetchClinicIdentity failed:", error.message);
        return null;
    }
    return data;
}

/**
 * Per-clinic WhatsApp settings, with the global default folded in.
 *
 * A MISSING row is the expected case, not an error — see the table comment
 * in the migration. Every clinic currently rides the shared number, so "no
 * config row" means "enabled, booking on, use server/.env's number", and
 * that is exactly what this returns.
 */
export async function fetchWhatsAppConfig(hospitalId) {
    const fallback = {
        enabled: true,
        bookingEnabled: true,
        phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID ?? null,
        displayName: null,
        greeting: null,
    };
    if (!hospitalId) return fallback;

    const { data, error } = await getSupabase()
        .from("hospital_whatsapp_config")
        .select("enabled, booking_enabled, phone_number_id, display_name, greeting")
        .eq("hospital_id", hospitalId)
        .maybeSingle();

    if (error) {
        // Config is an optimisation, never a gate: a clinic must not stop
        // receiving messages because one settings read failed.
        console.error("[whatsapp] fetchWhatsAppConfig failed, using defaults:", error.message);
        return fallback;
    }
    if (!data) return fallback;

    return {
        enabled: data.enabled,
        bookingEnabled: data.booking_enabled,
        phoneNumberId: data.phone_number_id ?? fallback.phoneNumberId,
        displayName: data.display_name,
        greeting: data.greeting,
    };
}
