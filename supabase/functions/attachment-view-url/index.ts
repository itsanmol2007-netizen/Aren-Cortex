// attachment-view-url — mints a short-lived presigned GET URL for viewing a
// previously-uploaded attachment. The bucket is private by design (no public
// URLs), so every view goes through this, the same way every upload goes
// through attachment-upload-url.
//
// PROVIDER-NEUTRAL — see attachment-upload-url's header for the full
// reasoning. Same ATTACHMENTS_S3_* env vars, same AWS SDK v3 calls, works
// unchanged against Backblaze B2, Cloudflare R2, or any other S3-compatible
// provider.
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
      region: 'auto',
      endpoint: Deno.env.get('ATTACHMENTS_S3_ENDPOINT')!,
      credentials: {
        accessKeyId: Deno.env.get('ATTACHMENTS_S3_ACCESS_KEY_ID')!,
        secretAccessKey: Deno.env.get('ATTACHMENTS_S3_SECRET_ACCESS_KEY')!,
      },
    });

    const viewUrl = await getSignedUrl(
      s3,
      new GetObjectCommand({ Bucket: Deno.env.get('ATTACHMENTS_S3_BUCKET')!, Key: storagePath }),
      { expiresIn: URL_TTL_SECONDS }
    );

    return jsonResponse({ viewUrl, expiresInSeconds: URL_TTL_SECONDS });
  } catch (err) {
    console.error('[attachment-view-url]', err);
    return jsonResponse({ error: err instanceof Error ? err.message : 'unknown error' }, 500);
  }
});
