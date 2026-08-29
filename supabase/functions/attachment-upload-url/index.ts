// attachment-upload-url — mints a short-lived, single-use presigned PUT URL
// for a doctor to upload a clinical attachment (X-ray, lab report, photo)
// directly to object storage, without the storage secret key ever reaching
// the browser.
//
// MIGRATED 2026-08-29 from Backblaze B2 to real AWS S3 (bucket
// `arenode-patient-orbit-uploads`, region `ap-south-1`; the same bucket the
// new patient-phone gateway upload uses). Reads AWS_ACCESS_KEY_ID /
// AWS_SECRET_ACCESS_KEY / AWS_REGION / AWS_BUCKET_NAME — the AWS SDK's own
// standard env var names, already set as Supabase function secrets. Real AWS
// needs the bucket's ACTUAL region (never `'auto'`, which is a Cloudflare
// R2/Backblaze-S3-compat convenience real AWS rejects) and no custom
// `endpoint` override (AWS derives the right host from `region` alone; B2/R2
// needed an override because they are other companies' servers speaking the
// S3 protocol, not AWS itself). visit_attachments.storage_provider now
// records `aws_s3` for new uploads — existing `b2` rows are untouched
// historical data, not migrated by this change. See README.md.
//
// Authorization works through the CALLER'S OWN Supabase session (the
// Authorization header this function is invoked with), not a body-supplied
// id. A Supabase client created with that header is subject to the exact
// same RLS policies protecting every other table in this app — asking "does
// this visit exist" through that client IS the authorization check: if RLS
// returns no row, the visit either doesn't exist or isn't at this doctor's
// hospital, and both cases get the same 403. (rank-compositions, the other
// edge function in this project, instead trusts a body-supplied doctorId
// with no ownership check — not repeating that pattern here, since this
// function grants write access to storage.)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { S3Client, PutObjectCommand } from 'npm:@aws-sdk/client-s3@3';
import { getSignedUrl } from 'npm:@aws-sdk/s3-request-presigner@3';

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
const ALLOWED_TYPE = new Set(['xray', 'lab_report', 'photo', 'scan', 'other']);
// Backstop, not the target. Client-side compression (300–600KB for photos,
// up to ~2MB for xray/scan types where detail matters) should keep real
// uploads well under this — this just refuses anything absurd.
const MAX_BYTES = 8 * 1024 * 1024;
const URL_TTL_SECONDS = 300; // 5 minutes to actually perform the PUT

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

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return jsonResponse({ error: 'not authenticated' }, 401);

    const body = await req.json();
    const { visitId, fileName, mimeType, sizeBytes, attachmentType } = body ?? {};

    if (!visitId || !fileName || !mimeType) {
      return jsonResponse({ error: 'visitId, fileName and mimeType are required' }, 400);
    }
    if (!ALLOWED_MIME.has(mimeType)) {
      return jsonResponse({ error: `unsupported file type: ${mimeType}` }, 400);
    }
    if (attachmentType && !ALLOWED_TYPE.has(attachmentType)) {
      return jsonResponse({ error: `unknown attachment type: ${attachmentType}` }, 400);
    }
    if (typeof sizeBytes === 'number' && sizeBytes > MAX_BYTES) {
      return jsonResponse({ error: `file too large (${sizeBytes} bytes, max ${MAX_BYTES})` }, 400);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: visit, error: visitErr } = await supabase
      .from('visits')
      .select('id')
      .eq('id', visitId)
      .maybeSingle();
    if (visitErr) return jsonResponse({ error: visitErr.message }, 500);
    if (!visit) return jsonResponse({ error: 'visit not found, or not yours' }, 403);

    const { data: userData } = await supabase.auth.getUser();
    const { data: doctor } = await supabase
      .from('doctors')
      .select('id')
      .eq('user_id', userData?.user?.id ?? '')
      .maybeSingle();

    // A random path component, not the original file name — a predictable
    // path would let someone probe for other patients' files even against a
    // private bucket.
    const ext = (String(fileName).split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
    const storagePath = `visits/${visitId}/${crypto.randomUUID()}.${ext}`;

    // `.trim()` on every one of these: the real AWS_REGION secret in this
    // project carries a leading tab character (a copy-paste artifact from
    // however it was set) — `region="\tap-south-1"` fails AWS's hostname
    // validation with an error that gives no hint the problem is whitespace,
    // not a wrong value. Trimming defends against that class of secret-store
    // artifact without needing write access to fix the secret itself.
    const s3 = new S3Client({
      region: Deno.env.get('AWS_REGION')!.trim(),
      credentials: {
        accessKeyId: Deno.env.get('AWS_ACCESS_KEY_ID')!.trim(),
        secretAccessKey: Deno.env.get('AWS_SECRET_ACCESS_KEY')!.trim(),
      },
    });

    const uploadUrl = await getSignedUrl(
      s3,
      new PutObjectCommand({
        Bucket: Deno.env.get('AWS_BUCKET_NAME')!.trim(),
        Key: storagePath,
        ContentType: mimeType,
      }),
      { expiresIn: URL_TTL_SECONDS }
    );

    return jsonResponse({
      uploadUrl,
      storagePath,
      uploadedByDoctorId: doctor?.id ?? null,
      expiresInSeconds: URL_TTL_SECONDS,
    });
  } catch (err) {
    console.error('[attachment-upload-url]', err);
    return jsonResponse({ error: err instanceof Error ? err.message : 'unknown error' }, 500);
  }
});
