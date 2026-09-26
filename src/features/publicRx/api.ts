// ---------------------------------------------------------------------------
// Typed client for the `prescription-preview` edge function — the public,
// patient-facing prescription page's only data source. See that function's
// own header (supabase/functions/prescription-preview/index.ts) for the
// full contract; this file just mirrors its reply shape and calls it.
//
// A plain `fetch()`, deliberately NOT `supabase.functions.invoke` (unlike
// `sendPrescription`/`notifySupport` in lib/db/messaging.ts): the JS client
// treats any non-2xx response as a thrown `FunctionsHttpError` and drops
// the parsed body, so a real, meaningful `{ ok: false, error: "not_found" }`
// (404 — an expired or mistyped link) would collapse into the same generic
// failure as an actual network error, and this page needs to tell a patient
// those two apart. Works identically whether or not anyone is signed in on
// this device, which is the point: a patient opening this link has no
// account at all — only the anon apikey travels, same as it does before any
// login on the rest of this app.
// ---------------------------------------------------------------------------

const FUNCTIONS_URL = `${(import.meta.env.VITE_SUPABASE_URL as string).replace(/\/$/, "")}/functions/v1`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export type PublicRxErrorCode = "not_found" | "bad_request" | "server_error" | "network_error";

export interface PublicRxMedicine {
    name: string;
    composition: string;
    dosageMg: number | null;
    /** "1-0-1-0" (Morning-Afternoon-Evening-Night), or null/"0-0-0-0" for
     *  an SOS-only medicine with no fixed slots. */
    frequencySlot: string | null;
    durationDays: number | null;
    route: string;
    /** One of the 4 TimingInstruction values (features/consult/dosing.ts),
     *  in practice — localized client-side via localizeTiming. */
    instructions: string;
    isSos: boolean;
    /** Per-medicine dispensing billing (opt-in) — null for every clinic
     *  that has never turned this on, in which case the Billing card's
     *  medicine line stays a single lump total. */
    quantityDispensed: number | null;
    unitPrice: number | null;
}

export interface PublicRxBilling {
    /** Net of front-desk's own intake-time discount. Null when this visit
     *  never had a consultation fee at all. */
    consultationFee: number | null;
    feeGstAmount: number;
    medicineTotal: number;
    medicineGstAmount: number;
    additionalCharges: { label: string; amount: number }[];
    discountPercent: number | null;
    discountAmount: number;
    total: number;
}

export interface PublicRxData {
    ref: string | null;
    date: string;
    /** The language the doctor actually sent this prescription in
     *  (en/hi/hi-Latn) — the page opens here by default; the switcher can
     *  still change it. Always one of the three, never null (the edge
     *  function falls back to "en" itself when nothing was ever sent in a
     *  specific language). */
    defaultLanguage: "en" | "hi" | "hi-Latn";
    clinic: {
        name: string;
        nameHi: string | null;
        tagline: string | null;
        address: string | null;
        phone: string | null;
        email: string | null;
        website: string | null;
        logoUrl: string | null;
        accentColor: string | null;
    };
    doctor: {
        name: string;
        nameHi: string | null;
        qualification: string | null;
        specialization: string | null;
        registrationNumber: string | null;
        signatureUrl: string | null;
    } | null;
    patient: { name: string; age: number | null; gender: string | null };
    symptoms: string[];
    /** asked about and absent ("Fever") — older pages send none */
    negatives?: string[];
    findings: string[];
    diagnosisText: string | null;
    /** structured assessments with place and details (newer visits); preferred over diagnosisText */
    assessments?: string[];
    /** results of earlier investigations read at this visit */
    results?: { name: string; text: string }[];
    /** procedures done today, or planned with a due date (yyyy-mm-dd) */
    procedures?: { text: string; status: "performed" | "planned"; due: string | null }[];
    /** the home programme, one formatted line each */
    exercises?: string[];
    vitals: Record<string, unknown> | null;
    medicines: PublicRxMedicine[];
    tests: string[];
    /** the lab the tests were ordered from, and how to get there (2026-09-27) */
    lab?: { name: string; address: string | null; mapsUrl: string | null } | null;
    advice: string[];
    followUpDays: number | null;
    footerNote: string | null;
    /** The same figures the printed prescription's own Billing card shows —
     *  null when this visit never had a fee, medicine billing or an
     *  additional charge (the vast majority; most clinics show nothing
     *  here, exactly as before this existed). */
    billing: PublicRxBilling | null;
}

type Ok = { ok: true; rx: PublicRxData };
type Err = { ok: false; error: PublicRxErrorCode };

export async function fetchPublicPrescription(token: string): Promise<Ok | Err> {
    try {
        const res = await fetch(`${FUNCTIONS_URL}/prescription-preview`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                apikey: ANON_KEY,
                Authorization: `Bearer ${ANON_KEY}`,
            },
            body: JSON.stringify({ token }),
        });
        return (await res.json()) as Ok | Err;
    } catch {
        return { ok: false, error: "network_error" };
    }
}
