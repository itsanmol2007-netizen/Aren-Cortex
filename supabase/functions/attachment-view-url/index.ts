// attachment-view-url — mints a short-lived presigned GET URL for viewing a
// previously-uploaded attachment. The bucket is private by design (no public
// URLs), so every view goes through this, the same way every upload goes
// through attachment-upload-url.
//
// MIGRATED 2026-08-29 to real AWS S3 — see attachment-upload-url's header for
// the full reasoning (region must be real, no endpoint override). Same
// AWS_* env vars as every other function here.
//
// Authorization: ask the CALLER's own RLS-scoped client whether a
// visit_attachments row with this path exists at all.
// visit_attachments.hospital_isolation (via the visit's hospital_id) already
// does the real check — if the row doesn't come back, either it doesn't
// exist or it isn't this doctor's to see, and both get the same 404.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { S3Client, GetObjectCommand } from 'npm:@aws-sdk/client-s3@3';
import { getSignedUrl } from 'npm:@aws-sdk/s3-request-presigner@3';

const URL_TTL_SECONDS = 300;

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
    const { storagePath } = body ?? {};
    if (!storagePath) return jsonResponse({ error: 'storagePath is required' }, 400);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: row, error } = await supabase
      .from('visit_attachments')
      .select('id, storage_path')
      .eq('storage_path', storagePath)
      .maybeSingle();
    if (error) return jsonResponse({ error: error.message }, 500);
    if (!row) return jsonResponse({ error: 'attachment not found, or not yours' }, 404);

    const s3 = new S3Client({
      region: Deno.env.get('AWS_REGION')!.trim(),
      credentials: {
        accessKeyId: Deno.env.get('AWS_ACCESS_KEY_ID')!.trim(),
        secretAccessKey: Deno.env.get('AWS_SECRET_ACCESS_KEY')!.trim(),
      },
    });

    const viewUrl = await getSignedUrl(
      s3,
      new GetObjectCommand({ Bucket: Deno.env.get('AWS_BUCKET_NAME')!.trim(), Key: storagePath }),
      { expiresIn: URL_TTL_SECONDS }
    );

    return jsonResponse({ viewUrl, expiresInSeconds: URL_TTL_SECONDS });
  } catch (err) {
    console.error('[attachment-view-url]', err);
    return jsonResponse({ error: err instanceof Error ? err.message : 'unknown error' }, 500);
  }
});
