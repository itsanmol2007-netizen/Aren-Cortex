// device-key-escrow — the server side of the PIN lock's dual-wrapped Device
// Encryption Key.
//
// The DEK (see src/lib/security/deviceKey.ts) is wrapped TWO independent
// ways: once locally under a doctor's own PIN (that wrap never reaches this
// function), and once here, under a key only this function derives and only
// ever holds in memory for the duration of one request. A forgotten PIN
// recovers via `retrieve`, called only after a fresh password
// re-authentication — it is never reachable from an already-unlocked
// session, which has no reason to ask the server for a key it already has.
//
// No new secret to configure: the wrapping key is derived via HKDF-SHA256
// from `SUPABASE_SERVICE_ROLE_KEY`, which every Edge Function already gets
// automatically. That key is already the most sensitive secret this project
// has (it bypasses RLS outright); deriving a distinct, non-reversible key
// from it with a fixed `info` string is a standard, safe use of HKDF and
// means this table's confidentiality rides on a secret that was already
// being protected at the highest tier, rather than a second one someone has
// to remember to configure and rotate.
//
// `device_key_escrow` (migration `device_key_escrow`) has no RLS policy for
// anybody — this function, via the service-role client, is the only reader
// or writer, same discipline as `support_requests`.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

function toB64(bytes: ArrayBuffer): string {
  let binary = '';
  const view = new Uint8Array(bytes);
  for (let i = 0; i < view.length; i++) binary += String.fromCharCode(view[i]);
  return btoa(binary);
}
function fromB64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

let cachedWrappingKey: CryptoKey | null = null;
async function getWrappingKey(): Promise<CryptoKey> {
  if (cachedWrappingKey) return cachedWrappingKey;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!serviceRoleKey) throw new Error('missing SUPABASE_SERVICE_ROLE_KEY');
  const ikm = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(serviceRoleKey), 'HKDF', false, ['deriveKey']
  );
  cachedWrappingKey = await crypto.subtle.deriveKey(
    {
      name: 'HKDF', hash: 'SHA-256',
      salt: new Uint8Array(0),
      info: new TextEncoder().encode('aren-device-key-escrow-v1'),
    },
    ikm,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
  return cachedWrappingKey;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return jsonResponse({ ok: false, message: 'Sign in again to continue.' }, 401);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const callerClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await callerClient.auth.getUser();
    if (userErr || !userData?.user) {
      return jsonResponse({ ok: false, message: 'Sign in again to continue.' }, 401);
    }
    const userId = userData.user.id;

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || '');
    const deviceKey = String(body?.deviceKey || '');
    if (!deviceKey) {
      return jsonResponse({ ok: false, message: 'Missing device identifier.' }, 400);
    }

    const adminClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // Re-verified here, independently of anything the client claims: a
    // device this account revoked (Settings → Devices → "Sign out") must
    // never be able to pull its escrowed key back out, even if it still
    // holds an otherwise-valid session token from before the revocation.
    const { data: deviceRow } = await adminClient
      .from('user_devices')
      .select('id, revoked_at')
      .eq('user_id', userId)
      .eq('device_key', deviceKey)
      .maybeSingle();
    if (!deviceRow || deviceRow.revoked_at) {
      return jsonResponse(
        { ok: false, message: 'This device is not recognized, or was signed out.' }, 403
      );
    }

    const wrappingKey = await getWrappingKey();

    if (action === 'store') {
      const dekB64 = String(body?.dek || '');
      if (!dekB64) return jsonResponse({ ok: false, message: 'Nothing to store.' }, 400);

      const iv = crypto.getRandomValues(new Uint8Array(12));
      const wrapped = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv }, wrappingKey, fromB64(dekB64)
      );
      const { error } = await adminClient.from('device_key_escrow').upsert(
        {
          user_id: userId, device_key: deviceKey,
          wrapped_dek: toB64(wrapped), iv: toB64(iv.buffer),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,device_key' }
      );
      if (error) throw error;
      return jsonResponse({ ok: true });
    }

    if (action === 'retrieve') {
      const { data: row, error } = await adminClient
        .from('device_key_escrow')
        .select('wrapped_dek, iv')
        .eq('user_id', userId)
        .eq('device_key', deviceKey)
        .maybeSingle();
      if (error) throw error;
      if (!row) {
        return jsonResponse(
          { ok: false, message: "No recovery is on file for this device yet." }, 404
        );
      }
      const plaintext = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: fromB64(row.iv) }, wrappingKey, fromB64(row.wrapped_dek)
      );
      return jsonResponse({ ok: true, dek: toB64(plaintext) });
    }

    return jsonResponse({ ok: false, message: 'Unknown action.' }, 400);
  } catch (err) {
    console.error('[device-key-escrow]', err);
    return jsonResponse(
      { ok: false, message: err instanceof Error ? err.message : 'Something went wrong.' }, 500
    );
  }
});
