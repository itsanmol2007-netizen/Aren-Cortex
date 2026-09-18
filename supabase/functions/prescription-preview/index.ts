// ---------------------------------------------------------------------------
// prescription-preview — the entire backend for the public, patient-facing
// prescription page (`/prescriptions/:token` in this app).
//
// Built HERE, in Aren-Cortex, rather than the older `aren-landing-page`
// repo's own `rx-preview` (docs/whatsapp-prescription-link-handoff.md) —
// that version was a stopgap from before this app had its own public domain
// (was on Vercel; this app now deploys to Cloudflare). Nothing from that
// repo is imported; this reads straight off Aren-Cortex's own schema.
//
// Same model as `visit-gateway`/the old `rx-preview`: `verify_jwt` MUST be
// OFF for this function (deploy with `--no-verify-jwt`) — the patient
// carries no Supabase session at all, and the random `token` in the request
// body (`prescriptions.share_token`, minted on every insert — see migration
// `20260909_prescription_share_token.sql`) IS the credential. This function
// runs with the service-role key (injected automatically) and only ever
// READS, returning only the fields the page renders — never a phone number,
// never another patient's/prescription's data, never anything the doctor
// wrote for internal use only (no canned standing advice — see
// docs/prescription-render-spec.md's "Advice vs instructions": only THIS
// visit's own `advice_notes` ever reaches a rendered surface).
//
// Route:  POST /functions/v1/prescription-preview   { token }
// Reply:  { ok: true, rx: {...} }  |  { ok: false, error: "not_found" | ... }
// ---------------------------------------------------------------------------

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

function admin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "bad_request" }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "bad_request" }, 400);
  }

  const token = String(body.token ?? "").trim();
  // Real tokens are 32 hex chars (share_token's own default: a stripped
  // uuid). Anything wildly off that length is a probe, not a real link.
  if (token.length < 16 || token.length > 128) {
    return json({ ok: false, error: "not_found" }, 404);
  }

  const db = admin();

  try {
    const { data: rx } = await db
      .from("prescriptions")
      .select("id, visit_id, assigned_doctor_id, hospital_id, created_at, follow_up_days, advice_notes, findings_text")
      .eq("share_token", token)
      .maybeSingle();
    if (!rx) return json({ ok: false, error: "not_found" }, 404);

    const [visitRes, doctorRes, hospitalRes, settingsRes, pmRes, doRes, vsRes, vfRes] =
      await Promise.all([
        db.from("visits").select("patient_id, vitals, prescription_ref").eq("id", rx.visit_id).maybeSingle(),
        rx.assigned_doctor_id
          ? db.from("doctors")
              .select("name, name_hi, specialization, qualification, registration_number, signature_image_url")
              .eq("id", rx.assigned_doctor_id).maybeSingle()
          : Promise.resolve({ data: null }),
        db.from("hospitals")
          .select("name, name_hi, tagline, address, city, state, phone, email, website, logo_url, accent_color")
          .eq("id", rx.hospital_id).maybeSingle(),
        db.from("prescription_settings")
          .select("show_qualification, show_specialty, show_registration, show_clinic_address, show_clinic_phone, show_clinic_email, show_website, show_signature, footer_note")
          .eq("hospital_id", rx.hospital_id).maybeSingle(),
        db.from("prescription_medicines")
          .select("medicine_id, composition_ids, dosage_mg, frequency, duration_days, route, instructions, is_sos, sort_order")
          .eq("prescription_id", rx.id).order("sort_order", { ascending: true }),
        db.from("diagnostic_orders").select("test_name").eq("prescription_id", rx.id),
        db.from("visit_symptoms").select("symptom_id").eq("visit_id", rx.visit_id),
        db.from("visit_findings").select("finding_id").eq("visit_id", rx.visit_id),
      ]);

    const visit = visitRes.data;
    if (!visit) return json({ ok: false, error: "not_found" }, 404);

    const doctor = doctorRes.data as {
      name: string; name_hi: string | null; specialization: string | null; qualification: string | null;
      registration_number: string | null; signature_image_url: string | null;
    } | null;
    const hospital = hospitalRes.data as {
      name: string; name_hi: string | null; tagline: string | null; address: string | null; city: string | null;
      state: string | null; phone: string | null; email: string | null; website: string | null;
      logo_url: string | null; accent_color: string | null;
    } | null;
    const s = settingsRes.data as {
      show_qualification: boolean; show_specialty: boolean; show_registration: boolean;
      show_clinic_address: boolean; show_clinic_phone: boolean; show_clinic_email: boolean;
      show_website: boolean; show_signature: boolean; footer_note: string | null;
    } | null;
    const pmRows = (pmRes.data ?? []) as {
      medicine_id: number; composition_ids: number[] | null; dosage_mg: number | null;
      frequency: string | null; duration_days: number | null; route: string | null;
      instructions: string | null; is_sos: boolean; sort_order: number;
    }[];

    const medIds = [...new Set(pmRows.map((r) => Number(r.medicine_id)).filter(Boolean))];
    const compIds = [...new Set(pmRows.flatMap((r) => (r.composition_ids ?? []).map(Number)))];
    const symptomIds = [...new Set(((vsRes.data ?? []) as { symptom_id: number }[]).map((r) => Number(r.symptom_id)))];
    const findingIds = [...new Set(((vfRes.data ?? []) as { finding_id: number }[]).map((r) => Number(r.finding_id)))];

    const [patientRes, medRes, compRes, sympRes, findRes] = await Promise.all([
      db.from("patients").select("name, age, gender").eq("id", visit.patient_id).maybeSingle(),
      medIds.length ? db.from("medicines").select("id, name").in("id", medIds) : Promise.resolve({ data: [] }),
      compIds.length ? db.from("compositions").select("id, name").in("id", compIds) : Promise.resolve({ data: [] }),
      symptomIds.length ? db.from("symptoms").select("id, name").in("id", symptomIds) : Promise.resolve({ data: [] }),
      findingIds.length ? db.from("findings").select("id, name").in("id", findingIds) : Promise.resolve({ data: [] }),
    ]);

    const patient = patientRes.data as { name: string; age: number | null; gender: string | null } | null;
    const medName = new Map<number, string>(((medRes.data ?? []) as { id: number; name: string }[]).map((m) => [m.id, m.name]));
    const compName = new Map<number, string>(((compRes.data ?? []) as { id: number; name: string }[]).map((c) => [c.id, c.name]));

    const adviceLines = String(rx.advice_notes ?? "")
      .split(/\r?\n/).map((l: string) => l.trim()).filter(Boolean);

    const rxOut = {
      ref: (visit as { prescription_ref?: string | null }).prescription_ref ?? null,
      date: rx.created_at,
      clinic: {
        name: hospital?.name ?? "Clinic",
        nameHi: hospital?.name_hi ?? null,
        tagline: hospital?.tagline ?? null,
        address: (s?.show_clinic_address ?? true)
          ? [hospital?.address, hospital?.city, hospital?.state].filter(Boolean).join(", ") || null
          : null,
        phone: (s?.show_clinic_phone ?? true) ? hospital?.phone ?? null : null,
        email: (s?.show_clinic_email ?? false) ? hospital?.email ?? null : null,
        website: (s?.show_website ?? false) ? hospital?.website ?? null : null,
        logoUrl: hospital?.logo_url ?? null,
        accentColor: hospital?.accent_color ?? "#1268e8",
      },
      doctor: doctor
        ? {
            name: doctor.name ?? "",
            nameHi: doctor.name_hi ?? null,
            qualification: (s?.show_qualification ?? true) ? doctor.qualification ?? null : null,
            specialization: (s?.show_specialty ?? true) ? doctor.specialization ?? null : null,
            registrationNumber: (s?.show_registration ?? true) ? doctor.registration_number ?? null : null,
            signatureUrl: (s?.show_signature ?? true) ? doctor.signature_image_url ?? null : null,
          }
        : null,
      patient: {
        name: patient?.name ?? "Patient",
        age: patient?.age ?? null,
        gender: patient?.gender ?? null,
      },
      symptoms: ((sympRes.data ?? []) as { name: string }[]).map((x) => x.name).filter(Boolean),
      findings: ((findRes.data ?? []) as { name: string }[]).map((x) => x.name).filter(Boolean),
      diagnosisText: rx.findings_text ?? null,
      vitals: (visit.vitals && typeof visit.vitals === "object") ? visit.vitals : null,
      medicines: pmRows.map((pm) => ({
        name: medName.get(Number(pm.medicine_id)) ?? "Medicine",
        composition: (pm.composition_ids ?? [])
          .map((id: number) => compName.get(Number(id))).filter(Boolean).join(" + "),
        dosageMg: pm.dosage_mg ?? null,
        // "1-0-1-0" (Morning-Afternoon-Evening-Night) — passed through
        // untouched, same convention `lib/db/reference.ts`'s
        // freqSlotToLabel/freqLabelToSlot already use. The page parses this
        // itself into the M/A/E/N chip row rather than a pre-formatted
        // English sentence, so it stays language-neutral data.
        frequencySlot: pm.frequency ?? null,
        durationDays: pm.duration_days ?? null,
        route: pm.route ?? "oral",
        // One of the 4 closed TimingInstruction values (features/consult/
        // dosing.ts) in practice — see src/lib/i18n/prescriptionLabels.ts's
        // localizeTiming, which the page reuses to localize this.
        instructions: pm.instructions ?? "",
        isSos: !!pm.is_sos,
      })),
      tests: ((doRes.data ?? []) as { test_name: string }[]).map((x) => x.test_name).filter(Boolean),
      // Doctor's own advice for THIS visit only — never the clinic's canned
      // standing advice (prescription_settings.default_advice). See
      // docs/prescription-render-spec.md's "Advice vs instructions": that
      // fallback was deliberately removed from every rendered surface
      // 2026-09-09, and this new surface does not reintroduce it.
      advice: adviceLines,
      followUpDays: rx.follow_up_days ?? null,
      footerNote: s?.footer_note ?? null,
    };

    return json({ ok: true, rx: rxOut });
  } catch (e) {
    console.error("[prescription-preview]", e);
    return json({ ok: false, error: "server_error" }, 500);
  }
});
