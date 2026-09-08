// admin-staff — mints a real Supabase Auth sign-in for a new doctor,
// receptionist, or admin, created BY a clinic admin FROM INSIDE the app,
// rather than that person registering themselves.
//
// MIGRATED 2026-09-08 from server/admin/routes.js (a separate Express
// process) to a Supabase Edge Function — same project everything else
// already lives in, one platform instead of two, and the
// SUPABASE_SERVICE_ROLE_KEY this needs is injected automatically here
// (every Edge Function gets SUPABASE_URL / SUPABASE_ANON_KEY /
// SUPABASE_SERVICE_ROLE_KEY for free) instead of needing its own .env.
//
// Two Supabase clients, on purpose, same split `attachment-upload-url`
// (the other function in this project) uses for its own reason:
//   - `callerClient` carries the CALLER's own Authorization header, so
//     every read through it is subject to the exact same RLS every other
//     table read in this app already goes through. Resolving "who is this
//     and what hospital are they at" through RLS IS the authorization
//     check — it cannot be spoofed by anything in the request body.
//   - `adminClient` uses the service-role key, ONLY for the two things RLS
//     is deliberately not allowed to do from the browser: minting a new
//     Auth user, and writing `users`/`doctors` rows under an id that isn't
//     the caller's own (`users`' INSERT policy is `WITH CHECK id =
//     auth.uid()` — see lib/db/staff.ts).
//
// `phoneToStaffAuthEmail` here MUST stay byte-identical to the copy in
// `src/lib/auth.ts` — same strip, same `@aren-staff.internal` domain — or
// an account minted here derives an address the frontend's login retry
// (LoginPage.tsx) never tries, and the person it was created for can never
// sign in. That domain is deliberately different from self-registration's
// `<digits>@aren.internal`: Anmol wanted a way to tell, just by looking at
// the Auth email, whether an account was self-registered or created by a
// clinic from inside AREN — this domain IS that marker, no new column.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ALLOWED_ROLES = new Set(['admin', 'doctor', 'reception']);

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

function phoneToStaffAuthEmail(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return `${digits}@aren-staff.internal`;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return jsonResponse({ ok: false, error: 'not_authenticated', message: 'Sign in again to continue.' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const callerClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userErr } = await callerClient.auth.getUser();
    if (userErr || !userData?.user) {
      return jsonResponse({ ok: false, error: 'not_authenticated', message: 'Sign in again to continue.' }, 401);
    }

    // Resolved through RLS as the caller themselves — this is the whole
    // authorization check, not a formality before one. `users`' own ALL
    // policy (scoped to current_user_hospital_id()) is what lets this read
    // succeed for their own row and nobody else's.
    const { data: me, error: meErr } = await callerClient
      .from('users')
      .select('id, hospital_id, role, is_active')
      .eq('id', userData.user.id)
      .maybeSingle();
    if (meErr || !me || !me.is_active) {
      return jsonResponse({ ok: false, error: 'not_authenticated', message: 'Your account could not be verified.' }, 401);
    }

    let allowed = me.role === 'admin' || me.role === 'owner';
    if (!allowed) {
      const { data: doc } = await callerClient
        .from('doctors')
        .select('is_clinic_admin')
        .eq('user_id', userData.user.id)
        .maybeSingle();
      allowed = !!doc?.is_clinic_admin;
    }
    if (!allowed) {
      return jsonResponse({ ok: false, error: 'not_admin', message: 'Only a clinic admin can add staff.' }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const { fullName, phone, password, role } = body ?? {};
    const digits = String(phone || '').replace(/\D/g, '');
    const name = String(fullName || '').trim();

    if (digits.length !== 10) {
      return jsonResponse({ ok: false, error: 'bad_phone', message: 'Enter a 10-digit phone number.' }, 400);
    }
    if (!name) {
      return jsonResponse({ ok: false, error: 'bad_name', message: 'Enter their name.' }, 400);
    }
    if (!password || String(password).length < 8) {
      return jsonResponse({ ok: false, error: 'bad_password', message: 'Use a password of at least 8 characters.' }, 400);
    }
    if (!ALLOWED_ROLES.has(role)) {
      return jsonResponse({ ok: false, error: 'bad_role', message: 'Choose a role for this person.' }, 400);
    }

    const adminClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const hospitalId = me.hospital_id;

    // A phone already on file at THIS clinic is a named conflict, not a
    // generic failure — the admin almost certainly means to edit that
    // person's existing row (PeoplePage), not create a second one.
    const { data: dupe } = await adminClient
      .from('users')
      .select('id')
      .eq('hospital_id', hospitalId)
      .eq('phone', digits)
      .maybeSingle();
    if (dupe) {
      return jsonResponse({ ok: false, error: 'phone_in_use', message: 'Someone at this clinic already has that phone number on file.' }, 409);
    }

    const authEmail = phoneToStaffAuthEmail(digits);

    const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
      email: authEmail,
      password: String(password),
      email_confirm: true,
    });
    if (createErr || !created?.user) {
      const msg = createErr?.message || '';
      if (/already.*registered|already exists/i.test(msg)) {
        return jsonResponse({ ok: false, error: 'phone_in_use', message: 'That phone number already has a sign-in created this way.' }, 409);
      }
      console.error('[admin-staff] auth.admin.createUser failed:', msg);
      return jsonResponse({ ok: false, error: 'auth_create_failed', message: 'Could not create that sign-in. Try again.' }, 502);
    }
    const newUserId = created.user.id;

    const { error: userRowErr } = await adminClient.from('users').insert({
      id: newUserId,
      hospital_id: hospitalId,
      full_name: name,
      phone: digits,
      role,
      is_active: true,
    });
    if (userRowErr) {
      // Best-effort cleanup: an Auth user with no `users` row can never
      // sign in anywhere (loadIdentity() fails closed on "no-user-row"),
      // but leaving it behind is still a stray, unreachable credential.
      await adminClient.auth.admin.deleteUser(newUserId).catch(() => {});
      console.error('[admin-staff] users insert failed:', userRowErr.message);
      return jsonResponse({ ok: false, error: 'user_row_failed', message: 'Could not finish setting up that account.' }, 502);
    }

    if (role === 'doctor') {
      const { error: docErr } = await adminClient.from('doctors').insert({
        user_id: newUserId,
        hospital_id: hospitalId,
        name,
        phone: digits,
        is_clinic_admin: false,
      });
      if (docErr) {
        // The sign-in and `users` row are already good — a missing
        // `doctors` row degrades to "no clinical profile yet", the same
        // fallback loadIdentity() already has for it. Logged, not rolled
        // back.
        console.error('[admin-staff] doctors insert failed (non-fatal):', docErr.message);
      }
    }

    // ── Cortex → Consult, the moment a front desk actually exists ─────────
    // `lib/workspace/mode.ts` derives the whole doctor-vs-desk workspace
    // split from `hospitals.clinic_mode` and is explicit that this is READ,
    // never chosen — but nothing else in the app ever WROTE it after
    // registration, so a solo clinic that hired a receptionist from in here
    // stayed rendered as Cortex forever (no queue, no Consult chrome) even
    // though a receptionist now exists and is registering patients. This is
    // the one write: adding the first reception hire promotes `solo` (or an
    // unset clinic_mode) to `solo_reception`. Never touches `multi_doctor`
    // (already a front-desk mode) and never touches anything on a `doctor`/
    // `admin` hire — only reception staff turns a solo practice into a desk.
    // Best-effort/non-fatal, same as the `doctors` insert above: the staff
    // account is already good even if this one read+write fails.
    if (role === 'reception') {
      try {
        const { data: hosp } = await adminClient
          .from('hospitals')
          .select('clinic_mode')
          .eq('id', hospitalId)
          .maybeSingle();
        const mode = hosp?.clinic_mode ?? null;
        if (mode === null || mode === 'solo') {
          const { error: modeErr } = await adminClient
            .from('hospitals')
            .update({ clinic_mode: 'solo_reception' })
            .eq('id', hospitalId);
          if (modeErr) console.error('[admin-staff] clinic_mode promotion failed (non-fatal):', modeErr.message);
        }
      } catch (e) {
        console.error('[admin-staff] clinic_mode promotion threw (non-fatal):', e instanceof Error ? e.message : e);
      }
    }

    return jsonResponse({ ok: true, userId: newUserId, authEmail });
  } catch (err) {
    console.error('[admin-staff]', err);
    return jsonResponse({ ok: false, error: 'server_error', message: err instanceof Error ? err.message : 'Something went wrong.' }, 500);
  }
});
