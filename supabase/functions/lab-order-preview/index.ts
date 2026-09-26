// ---------------------------------------------------------------------------
// lab-order-preview — the backend of the page a lab opens from the WhatsApp
// order (`/lab-orders/:token`).
//
// Same model as prescription-preview: `verify_jwt` OFF, the random token in
// the body (`lab_order_handoffs.share_token`) is the credential, service
// role, read-only, and only the fields the order page renders: who the
// patient is and how to reach them (the lab schedules the test), what is
// ordered with its place and side, how urgently, why, today's minimal
// story, and the ordering doctor on the clinic's letterhead. Never the
// patient's history, medicines or billing.
//
// Route:  POST /functions/v1/lab-order-preview   { token }
// Reply:  { ok: true, order: {...} }  |  { ok: false, error: "not_found" | ... }
// ---------------------------------------------------------------------------

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS } });
}

function admin() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "bad_request" }, 405);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ ok: false, error: "bad_request" }, 400); }
  const token = String(body.token ?? "").trim();
  if (token.length < 16 || token.length > 128) return json({ ok: false, error: "not_found" }, 404);

  const db = admin();
  try {
    const { data: h } = await db
      .from("lab_order_handoffs")
      .select("id, hospital_id, doctor_id, patient_id, visit_id, lab_name, priority, indication, context, tests, status, sent_at, created_at")
      .eq("share_token", token)
      .maybeSingle();
    if (!h) return json({ ok: false, error: "not_found" }, 404);

    const [patientRes, doctorRes, hospitalRes, settingsRes, visitRes] = await Promise.all([
      db.from("patients").select("name, age, gender, phone").eq("id", h.patient_id).maybeSingle(),
      h.doctor_id
        ? db.from("doctors").select("name, specialization, qualification, registration_number, signature_image_url").eq("id", h.doctor_id).maybeSingle()
        : Promise.resolve({ data: null }),
      db.from("hospitals").select("name, tagline, address, city, state, phone, email, logo_url").eq("id", h.hospital_id).maybeSingle(),
      db.from("prescription_settings").select("show_qualification, show_registration, show_signature").eq("hospital_id", h.hospital_id).maybeSingle(),
      h.visit_id ? db.from("visits").select("prescription_ref").eq("id", h.visit_id).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    const p = patientRes.data as { name: string | null; age: number | null; gender: string | null; phone: string | null } | null;
    const d = doctorRes.data as {
      name: string | null; specialization: string | null; qualification: string | null;
      registration_number: string | null; signature_image_url: string | null;
    } | null;
    const c = hospitalRes.data as {
      name: string | null; tagline: string | null; address: string | null; city: string | null; state: string | null;
      phone: string | null; email: string | null; logo_url: string | null;
    } | null;
    const s = settingsRes.data as { show_qualification: boolean; show_registration: boolean; show_signature: boolean } | null;

    return json({
      ok: true,
      order: {
        ref: (visitRes.data as { prescription_ref?: string | null } | null)?.prescription_ref ?? null,
        orderedAt: h.sent_at ?? h.created_at,
        labName: h.lab_name,
        priority: h.priority,
        indication: h.indication ?? null,
        context: h.context ?? null,
        tests: Array.isArray(h.tests) ? h.tests : [],
        patient: {
          name: p?.name ?? "Patient",
          age: p?.age ?? null,
          gender: p?.gender ?? null,
          phone: p?.phone ?? null,
        },
        clinic: {
          name: c?.name ?? "Clinic",
          tagline: c?.tagline ?? null,
          address: [c?.address, c?.city, c?.state].filter(Boolean).join(", ") || null,
          phone: c?.phone ?? null,
          email: c?.email ?? null,
          logoUrl: c?.logo_url ?? null,
        },
        doctor: d
          ? {
              name: d.name ?? "",
              specialization: d.specialization ?? null,
              qualification: (s?.show_qualification ?? true) ? d.qualification ?? null : null,
              registrationNumber: (s?.show_registration ?? true) ? d.registration_number ?? null : null,
              signatureUrl: (s?.show_signature ?? true) ? d.signature_image_url ?? null : null,
            }
          : null,
      },
    });
  } catch (e) {
    console.error("[lab-order-preview]", e);
    return json({ ok: false, error: "server_error" }, 500);
  }
});
