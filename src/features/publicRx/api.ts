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
}

export interface PublicRxData {
    ref: string | null;
    date: string;
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
    findings: string[];
    diagnosisText: string | null;
    vitals: Record<string, unknown> | null;
    medicines: PublicRxMedicine[];
    tests: string[];
    advice: string[];
    followUpDays: number | null;
    footerNote: string | null;
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
