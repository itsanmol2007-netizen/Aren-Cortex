# WhatsApp prescription link — full handoff

**Written 2026-09-09.** Everything needed to make the "View Your
Prescription" button in the `en_prescription_ready02` WhatsApp template open
a real, per-patient prescription page.

Two repos are involved:

| Repo | What changes | Who applies it |
|---|---|---|
| **`Aren-Cortex-master`** (this repo) | 1 migration, 2 small code edits — **already committed in this session** | you: run the migration |
| **`Aren LP/aren-landing-page`** (marketing site, Next.js) | 4 new files + 1 one-line edit — **written out in full in Part 3** | you: paste the files, deploy |
| **Meta WhatsApp Manager** | finish the template's button URL | you: Part 1, ~2 minutes |
| **Supabase** | deploy 1 edge function | you: Part 4, one command |

Nothing here sends a WhatsApp message. Cortex stays on `MESSAGING_PROVIDER=mock`
until Part 5.

---

## How it fits together

```
 Doctor taps "WhatsApp" in Consult
        │
        ▼
 server/messaging/service.js
   • looks up prescriptions.share_token  ← NEW column (Part 2)
   • passes it as the template button's {{1}}
        │
        ▼
 Fast2SMS → Meta → patient's WhatsApp
   "Hi Asha, Your Prescription is Ready …            [ View Your Prescription ]"
        │  (button base URL is stored on the template in Meta:
        │   https://www.arenode.com/prescriptions/{{1}} )
        ▼
 https://www.arenode.com/prescriptions/<share_token>
        │   app/prescriptions/[token]/page.tsx   ← NEW (Part 3)
        ▼
 POST  <supabase>/functions/v1/rx-preview   { token }
        │   supabase/functions/rx-preview/index.ts   ← NEW (Part 3)
        │   • service-role read, verify_jwt OFF
        │   • token is the only credential (same model as visit-gateway)
        │   • returns ONLY what the page renders — no phone, no other patients
        ▼
 Rendered prescription (clinic letterhead, meds, advice, follow-up)
```

The token is a **capability credential**, exactly like
`visit_gateways.token` behind `/portal/gateway/[token]`. It is random,
single-purpose, and only ever travels in the one WhatsApp message to the
one patient. No RLS policy is opened on `prescriptions` or any joined
table — the edge function is the only new read path.

---

## Part 1 — make the template button Dynamic (do this first, ~2 min)

**Why.** The currently-approved `en_prescription_ready02` has a **STATIC**
URL button — `https://www.arenode.com/prescriptions/axx334dxjss6d`, one
fixed link for every patient, and it 404s. The server sends a
per-prescription token that has to land in the URL, so the button must
become **Dynamic**. `npm run check:whatsapp` prints a ⚠ until this is done.

You're on **WhatsApp Manager -> Edit template -> `en_prescription_ready02`**,
**Call to action** section (your screenshot: you already set *URL type* to
*Dynamic*; the *Website URL* box is still empty). Set it like this:

| Field | Value |
|---|---|
| Type of action | **Visit website** |
| Button text | `View Your Prescription` |
| URL type | **Dynamic** |
| Website URL | `https://www.arenode.com/prescriptions/{{1}}` |
| Sample URL (the `{{1}}` box) | `https://www.arenode.com/prescriptions/9f2b7c4a1e5d4c8b9a0f1e2d3c4b5a6f` |

Notes, toddler-level:

1. In **Website URL**, type the address ending in **`/{{1}}`** — nothing
   after it. Meta appends the value you send at send-time in place of
   `{{1}}`.
2. The **Sample URL** is only for Meta's reviewer. Paste the example above
   (it's a fake 32-character token). "Do not use real customer
   information" — this is fake, you're fine.
3. It's also asking for **sample text** for the other variables. Fill:
   - Header `{{1}}` → `Asha` (patient's first name)
   - Body `{{1}}` → `Dr. Sharma` (the "prescription from …" name)
   - Body `{{2}}` → `Sunrise Clinic` (the "With care, …" name)
4. Leave "link tracking" checked — harmless.
5. Click **Submit for Review**. It goes back to *Pending* and typically
   re-approves within minutes to a few hours (UTILITY templates are fast).
   **The old approved version keeps working the whole time** — nothing
   breaks while it re-reviews.
6. When it flips back to **Approved**, `npm run check:whatsapp` in this
   repo will show it. Only then do Part 5.

> If you'd rather not re-submit at all: the currently-approved version
> already has a button. Open **Manage templates → `en_prescription_ready02`
> → View** (not Edit) and read its button's Website URL. If it already
> says `https://www.arenode.com/prescriptions/{{1}}`, skip this whole part —
> just build Part 3 at that path.

---

## Part 2 — Cortex side (already done in this repo; you run the migration)

### 2a. Migration — run it

File: `supabase/migrations/20260909_prescription_share_token.sql` (already
created). It adds `prescriptions.share_token` — a random 32-char value,
one per prescription, filled automatically on every insert (column
`DEFAULT`, no trigger) and back-filled onto existing rows.

Apply it with whichever you normally use:

```bash
supabase db push
```

or paste the file's contents into the Supabase SQL editor, or use the
Supabase MCP `apply_migration` tool.

Verify:

```sql
select id, share_token from prescriptions limit 3;
-- every row has a 32-char hex token, all different
```

### 2b. Code — already edited, nothing for you to do

- `server/messaging/service.js` — before a prescription send, reads
  `prescriptions.share_token` for the `prescriptionId` and passes it as the
  button parameter. If a row has no token, it sends the message **without**
  the button rather than failing.
- `server/messaging/providers/meta.js` — `buildComponents()` now emits the
  real `en_prescription_ready02` shape: **HEADER** `{{1}}` = patient,
  **BODY** `{{1}}` = doctor, `{{2}}` = clinic, plus the **URL button** when a
  token is present. Env `WHATSAPP_BUTTON_PARAM_STYLE=payload` switches the
  button-param encoding if Fast2SMS rejects Meta's native `text` form.
- `server/.env` — `WHATSAPP_TEMPLATE_PRESCRIPTION=en_prescription_ready02`,
  `WHATSAPP_TEMPLATE_LANG=en`, `FAST2SMS_API_KEY`, `WHATSAPP_PHONE_NUMBER_ID`
  (`1411150112074339`, the Connected number), `MESSAGING_PROVIDER=mock`.

---

## Part 3 — landing-page files (paste these into `aren-landing-page`)

Four new files, one one-line edit. They mirror the existing
`/portal/gateway/[token]` + `visit-gateway` pattern.

### File 1 — `supabase/functions/rx-preview/index.ts` (new)

```ts
/* ------------------------------------------------------------------
   rx-preview — the entire backend for the public prescription page.

   Deployed to the arenode Supabase project (NOT Vercel). Same model as
   visit-gateway: verify_jwt is OFF, the random `token` in the request
   body IS the credential (prescriptions.share_token, minted by Cortex),
   and this function runs with the service_role key (injected by
   Supabase, never configured by hand). It only ever *reads*, and only
   ever returns the fields the page renders — no phone number, no ids of
   other rows, no data for any prescription but the one the token names.

   Route:  POST /functions/v1/rx-preview   { token }
   Reply:  { ok: true, rx: {...} }  |  { ok: false, error: "not_found" }
------------------------------------------------------------------- */

import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function admin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

const DEFAULT_ADVICE = [
  "Take medicines as prescribed.",
  "Complete the full course.",
  "Consult if symptoms worsen.",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "bad_request" }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "bad_request" }, 400);
  }

  const token = String(body.token ?? "").trim();
  // The real tokens are 32 hex chars. Anything shorter is a probe.
  if (token.length < 16 || token.length > 128) {
    return json({ ok: false, error: "not_found" }, 404);
  }

  const db = admin();

  try {
    const { data: rx } = await db
      .from("prescriptions")
      .select(
        "id, visit_id, assigned_doctor_id, hospital_id, created_at, follow_up_days, advice_notes, findings_text",
      )
      .eq("share_token", token)
      .maybeSingle();

    if (!rx) return json({ ok: false, error: "not_found" }, 404);

    const [visitRes, doctorRes, hospitalRes, settingsRes, pmRes, doRes, vsRes, vfRes] =
      await Promise.all([
        db.from("visits").select("patient_id, vitals, prescription_ref").eq("id", rx.visit_id).maybeSingle(),
        rx.assigned_doctor_id
          ? db.from("doctors")
              .select("name, specialization, qualification, registration_number, signature_image_url")
              .eq("id", rx.assigned_doctor_id).maybeSingle()
          : Promise.resolve({ data: null }),
        db.from("hospitals")
          .select("name, tagline, address, city, state, phone, email, website, logo_url")
          .eq("id", rx.hospital_id).maybeSingle(),
        db.from("prescription_settings")
          .select("show_qualification, show_specialty, show_registration, show_clinic_address, show_clinic_phone, show_clinic_email, show_website, show_signature, footer_note, default_advice")
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

    const doctor = doctorRes.data;
    const hospital = hospitalRes.data;
    const s = settingsRes.data;
    const pmRows = pmRes.data ?? [];

    const medIds = [...new Set(pmRows.map((r: any) => Number(r.medicine_id)).filter(Boolean))];
    const compIds = [...new Set(pmRows.flatMap((r: any) => (r.composition_ids ?? []).map(Number)))];
    const symptomIds = [...new Set((vsRes.data ?? []).map((r: any) => Number(r.symptom_id)))];
    const findingIds = [...new Set((vfRes.data ?? []).map((r: any) => Number(r.finding_id)))];

    const [patientRes, medRes, compRes, sympRes, findRes] = await Promise.all([
      db.from("patients").select("name, age, gender").eq("id", visit.patient_id).maybeSingle(),
      medIds.length ? db.from("medicines").select("id, name").in("id", medIds) : Promise.resolve({ data: [] }),
      compIds.length ? db.from("compositions").select("id, name").in("id", compIds) : Promise.resolve({ data: [] }),
      symptomIds.length ? db.from("symptoms").select("id, name").in("id", symptomIds) : Promise.resolve({ data: [] }),
      findingIds.length ? db.from("findings").select("id, name").in("id", findingIds) : Promise.resolve({ data: [] }),
    ]);

    const patient = patientRes.data;
    const medName = new Map<number, string>((medRes.data ?? []).map((m: any) => [m.id, m.name]));
    const compName = new Map<number, string>((compRes.data ?? []).map((c: any) => [c.id, c.name]));

    const adviceLines = String(rx.advice_notes ?? "")
      .split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

    const rxOut = {
      ref: visit.prescription_ref ?? null,
      date: rx.created_at,
      clinic: {
        name: hospital?.name ?? "Clinic",
        tagline: hospital?.tagline ?? null,
        address: (s?.show_clinic_address ?? true)
          ? [hospital?.address, hospital?.city, hospital?.state].filter(Boolean).join(", ") || null
          : null,
        phone: (s?.show_clinic_phone ?? true) ? hospital?.phone ?? null : null,
        email: (s?.show_clinic_email ?? false) ? hospital?.email ?? null : null,
        website: (s?.show_website ?? false) ? hospital?.website ?? null : null,
        logoUrl: hospital?.logo_url ?? null,
      },
      doctor: doctor
        ? {
            name: doctor.name ?? "",
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
      symptoms: (sympRes.data ?? []).map((x: any) => x.name).filter(Boolean),
      findings: (findRes.data ?? []).map((x: any) => x.name).filter(Boolean),
      diagnosisText: rx.findings_text ?? null,
      vitals: (visit.vitals && typeof visit.vitals === "object") ? visit.vitals : null,
      medicines: pmRows.map((pm: any) => ({
        name: medName.get(Number(pm.medicine_id)) ?? "Medicine",
        composition: (pm.composition_ids ?? [])
          .map((id: number) => compName.get(Number(id))).filter(Boolean).join(" + "),
        dosage: pm.dosage_mg ? `${pm.dosage_mg} mg` : "",
        frequency: pm.frequency ?? "",
        duration: pm.duration_days ? `${pm.duration_days} days` : "",
        route: pm.route ?? "oral",
        instructions: pm.instructions ?? "",
        isSos: !!pm.is_sos,
      })),
      tests: (doRes.data ?? []).map((x: any) => x.test_name).filter(Boolean),
      advice: adviceLines.length ? adviceLines : ((s?.default_advice as string[] | null) ?? DEFAULT_ADVICE),
      followUpDays: rx.follow_up_days ?? null,
      footerNote: (s?.footer_note as string | null) ?? null,
    };

    return json({ ok: true, rx: rxOut });
  } catch (e) {
    console.error("[rx-preview]", e);
    return json({ ok: false, error: "server_error" }, 500);
  }
});
```

### File 2 — `components/rx/api.ts` (new)

```ts
/* Typed client for the rx-preview edge function. Same shape as
   components/portal/api.ts — the token is the credential, every failure
   collapses to an `error` code, never a raw message. */

import { getFunctionsUrl } from "@/lib/supabase";

export type RxErrorCode = "not_found" | "bad_request" | "server_error" | "network_error";

export interface RxMedicine {
  name: string;
  composition: string;
  dosage: string;
  frequency: string;
  duration: string;
  route: string;
  instructions: string;
  isSos: boolean;
}

export interface RxData {
  ref: string | null;
  date: string;
  clinic: {
    name: string;
    tagline: string | null;
    address: string | null;
    phone: string | null;
    email: string | null;
    website: string | null;
    logoUrl: string | null;
  };
  doctor: {
    name: string;
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
  medicines: RxMedicine[];
  tests: string[];
  advice: string[];
  followUpDays: number | null;
  footerNote: string | null;
}

type Ok = { ok: true; rx: RxData };
type Err = { ok: false; error: RxErrorCode };

export async function fetchPrescription(token: string): Promise<Ok | Err> {
  try {
    const res = await fetch(`${getFunctionsUrl()}/rx-preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    return (await res.json()) as Ok | Err;
  } catch {
    return { ok: false, error: "network_error" };
  }
}
```

### File 3 — `components/rx/RxView.tsx` (new)

```tsx
"use client";

import { useEffect, useState } from "react";
import { fetchPrescription, type RxData } from "./api";

/* The public prescription page. Paper-and-ink, hairline structure — the
   same design language as the rest of the site (DESIGN-SYSTEM.md §1), on
   the portal's rounder Jakarta face. Read-only; a patient glancing at
   their phone. No print button (they have the clinic's printout);
   "Handled securely by Arenode" is the only footer. */

export function RxView({ token }: { token: string }) {
  const [state, setState] = useState<
    { phase: "loading" } | { phase: "error" } | { phase: "ready"; rx: RxData }
  >({ phase: "loading" });

  useEffect(() => {
    let live = true;
    fetchPrescription(token).then((r) => {
      if (!live) return;
      setState(r.ok ? { phase: "ready", rx: r.rx } : { phase: "error" });
    });
    return () => {
      live = false;
    };
  }, [token]);

  if (state.phase === "loading") {
    return (
      <Shell>
        <div className="animate-pulse space-y-4">
          <div className="h-6 w-40 rounded bg-paper-3" />
          <div className="h-24 rounded-2xl bg-paper-2" />
          <div className="h-40 rounded-2xl bg-paper-2" />
        </div>
      </Shell>
    );
  }

  if (state.phase === "error") {
    return (
      <Shell>
        <div className="rounded-2xl border border-line p-8 text-center">
          <h1 className="text-lg font-semibold text-ink">This link isn’t valid</h1>
          <p className="mt-2 text-sm text-muted">
            It may have expired or been mistyped. Ask your clinic to send the
            prescription again, or use the printed copy.
          </p>
        </div>
      </Shell>
    );
  }

  const { rx } = state;
  const dateStr = new Date(rx.date).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  return (
    <Shell>
      {/* Letterhead */}
      <header className="flex items-start justify-between gap-4 border-b border-line pb-5">
        <div className="flex items-start gap-3">
          {rx.clinic.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={rx.clinic.logoUrl} alt="" className="h-12 w-12 rounded-lg object-contain" />
          ) : null}
          <div>
            <h1 className="text-xl font-bold tracking-tight text-ink">{rx.clinic.name}</h1>
            {rx.clinic.tagline ? (
              <p className="text-sm text-muted">{rx.clinic.tagline}</p>
            ) : null}
            <p className="mt-1 space-x-2 text-xs text-faint">
              {rx.clinic.address ? <span>{rx.clinic.address}</span> : null}
              {rx.clinic.phone ? <span>· {rx.clinic.phone}</span> : null}
              {rx.clinic.email ? <span>· {rx.clinic.email}</span> : null}
              {rx.clinic.website ? <span>· {rx.clinic.website}</span> : null}
            </p>
          </div>
        </div>
        {rx.doctor ? (
          <div className="text-right">
            <p className="font-semibold text-ink">{rx.doctor.name}</p>
            {rx.doctor.qualification ? (
              <p className="text-xs text-muted">{rx.doctor.qualification}</p>
            ) : null}
            {rx.doctor.specialization ? (
              <p className="text-xs text-muted">{rx.doctor.specialization}</p>
            ) : null}
            {rx.doctor.registrationNumber ? (
              <p className="text-xs text-faint">Reg. {rx.doctor.registrationNumber}</p>
            ) : null}
          </div>
        ) : null}
      </header>

      {/* Patient strip */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line py-3 text-sm">
        <div className="font-medium text-ink">
          {rx.patient.name}
          <span className="ml-2 font-normal text-muted">
            {[rx.patient.age != null ? `${rx.patient.age} yrs` : null, rx.patient.gender]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </div>
        <div className="text-faint">
          {rx.ref ? <span className="mr-3">#{rx.ref}</span> : null}
          {dateStr}
        </div>
      </div>

      {rx.symptoms.length ? (
        <Section title="Complaints">
          <p className="text-sm text-muted">{rx.symptoms.join(", ")}</p>
        </Section>
      ) : null}

      {(rx.findings.length || rx.diagnosisText) ? (
        <Section title="Findings">
          <p className="text-sm text-muted">
            {[rx.diagnosisText, ...rx.findings].filter(Boolean).join(" · ")}
          </p>
        </Section>
      ) : null}

      {rx.medicines.length ? (
        <Section title="Medicines">
          <ol className="divide-y divide-line">
            {rx.medicines.map((m, i) => (
              <li key={i} className="py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-medium text-ink">
                    {i + 1}. {m.name}
                    {m.isSos ? (
                      <span className="ml-2 rounded bg-accent-soft px-1.5 py-0.5 text-[11px] text-accent-ink">
                        SOS
                      </span>
                    ) : null}
                  </span>
                  <span className="shrink-0 text-xs text-faint">{m.route}</span>
                </div>
                {m.composition ? (
                  <p className="text-xs text-faint">{m.composition}</p>
                ) : null}
                <p className="mt-1 text-sm text-muted">
                  {[m.dosage, m.frequency, m.duration].filter(Boolean).join("  ·  ")}
                </p>
                {m.instructions ? (
                  <p className="text-xs text-muted">{m.instructions}</p>
                ) : null}
              </li>
            ))}
          </ol>
        </Section>
      ) : null}

      {rx.tests.length ? (
        <Section title="Investigations">
          <ul className="list-inside list-disc text-sm text-muted">
            {rx.tests.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        </Section>
      ) : null}

      {rx.advice.length ? (
        <Section title="Advice">
          <ul className="list-inside list-disc text-sm text-muted">
            {rx.advice.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </Section>
      ) : null}

      {rx.followUpDays ? (
        <Section title="Follow-up">
          <p className="text-sm text-muted">
            In {rx.followUpDays} day{rx.followUpDays === 1 ? "" : "s"}
          </p>
        </Section>
      ) : null}

      {rx.doctor?.signatureUrl ? (
        <div className="flex justify-end pt-4">
          <div className="text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={rx.doctor.signatureUrl} alt="" className="mx-auto h-12 object-contain" />
            <p className="mt-1 border-t border-line pt-1 text-xs text-faint">
              {rx.doctor.name}
            </p>
          </div>
        </div>
      ) : null}

      {rx.footerNote ? (
        <p className="border-t border-line pt-4 text-xs text-muted">{rx.footerNote}</p>
      ) : null}

      <p className="pt-6 text-center text-xs text-faint">Handled securely by Arenode.</p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-dvh bg-paper px-4 py-8">
      <div className="mx-auto max-w-2xl rounded-2xl border border-line bg-paper p-6 sm:p-8">
        {children}
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-line py-4 last:border-0">
      <h2 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-faint">
        {title}
      </h2>
      {children}
    </section>
  );
}
```

### File 4 — `app/prescriptions/[token]/page.tsx` (new)

```tsx
import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { RxView } from "@/components/rx/RxView";

/* The token in the path IS the access control — a capability credential,
   not a slug. noindex/nofollow here; matching Disallow in app/robots.ts
   (File 5). Same treatment as /portal/gateway/[token]. */
export const metadata: Metadata = {
  title: "Your prescription · Arenode",
  robots: { index: false, follow: false },
};

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export default async function PrescriptionPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return (
    <div className={jakarta.className}>
      <RxView token={token} />
    </div>
  );
}
```

### File 5 — `app/robots.ts` (one-line edit)

Add `/prescriptions/` next to every existing `/portal/gateway/` disallow:

```ts
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: ["/portal/gateway/", "/prescriptions/"] },
      { userAgent: "GPTBot", allow: "/", disallow: ["/portal/gateway/", "/prescriptions/"] },
      { userAgent: "ClaudeBot", allow: "/", disallow: ["/portal/gateway/", "/prescriptions/"] },
      { userAgent: "Google-Extended", allow: "/", disallow: ["/portal/gateway/", "/prescriptions/"] },
      { userAgent: "PerplexityBot", allow: "/", disallow: ["/portal/gateway/", "/prescriptions/"] },
    ],
    sitemap: "https://www.arenode.com/sitemap.xml",
  };
```

---

## Part 4 — deploy

From the **`aren-landing-page`** repo, with the Supabase CLI linked to the
arenode project (same one `visit-gateway` is deployed to):

```bash
supabase functions deploy rx-preview --no-verify-jwt
```

`--no-verify-jwt` is essential — the patient carries no Supabase session;
the token in the body is the credential (identical to how `visit-gateway`
is deployed).

Then push the site (Vercel auto-deploys on push to the production branch,
same as always):

```bash
git add app/prescriptions components/rx supabase/functions/rx-preview app/robots.ts
git commit -m "Public prescription page for the WhatsApp Rx link"
git push
```

Smoke-test the function directly (replace with a real token from
`select share_token from prescriptions limit 1;`):

```bash
curl -s -X POST "https://<PROJECT-REF>.supabase.co/functions/v1/rx-preview" \
  -H "Content-Type: application/json" \
  -d '{"token":"<REAL_TOKEN>"}' | head -c 400
```

Expect `{"ok":true,"rx":{...}}`. Then open
`https://www.arenode.com/prescriptions/<REAL_TOKEN>` in a browser — the
prescription should render.

---

## Part 5 — go live (Cortex), carefully

Only after: template shows **Approved** again, and the page above renders.

1. In this repo, `npm run check:whatsapp` — confirm number `CONNECTED`,
   `en_prescription_ready02` **Approved**, `var_count` shown.
2. `server/.env`: set `MESSAGING_PROVIDER=fast2sms`.
3. Restart `npm run server`.
4. From the app, send **one** prescription to **your own** WhatsApp number
   (a real completed consult, "WhatsApp" button).
5. Check, in order:
   - the message arrives, button says "View Your Prescription"
   - tapping it opens `arenode.com/prescriptions/<token>` and renders
   - `whatsapp_messages` row: `status` progresses, `wa_message_id` set
   - `messaging_credit_ledger`: one `MESSAGE_DEBIT`
6. If the send is **rejected on the button component** specifically
   (error mentions `button` / `parameter` / `url`), set
   `WHATSAPP_BUTTON_PARAM_STYLE=payload` in `server/.env`, restart, retry
   once. That switches the button param from Meta's `{type:"text"}` to
   Fast2SMS's documented `{type:"payload"}`.
7. Then, and only then, use it for real patients — a handful the first
   day, watch the number's Quality rating in Fast2SMS before ramping. The
   number was banned once for burst activity; treat the first week as a
   warm-up.

---

## Part 6 — webhook (later, not blocking)

Delivery receipts (`delivered` / `read` / `failed`) and patient replies
come back through `server/whatsapp/webhook.js`, which already parses
Meta's shape. When `server/` has a public URL, in the **Fast2SMS
dashboard → WhatsApp → Webhook**:

- Format: **META DIRECT**
- URL: `https://<server-host>/webhooks/whatsapp?token=aren_wh_bsp_c9ca458ed5b830fa28c3cb52`
  (that token is already in `server/.env` as `WHATSAPP_WEBHOOK_TOKEN`)
- Method: POST, Content-Type JSON

Until then, sends work and are logged; only the delivered/read ticks and
the async failed-delivery refund are missing.
