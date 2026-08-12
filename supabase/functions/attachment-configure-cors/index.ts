// attachment-configure-cors — sets the bucket-level CORS policy on the
// attachments bucket so a browser can PUT (upload) and GET (view) directly
// against presigned URLs.
//
// WHY THIS HAS TO EXIST AT ALL. attachment-upload-url and attachment-view-url
// only mint presigned URLs; the actual PUT/GET the browser performs against
// those URLs goes straight from the browser to the S3-compatible endpoint,
// never through Supabase (see lib/db/attachments.ts — "PUT directly to
// storage"). A presigned URL authorizes the request; it says nothing about
// whether the browser's CORS preflight is allowed to happen at all. That's a
// bucket-level setting, off by default on a new Backblaze B2 bucket, and it
// was never set for `aren-packets-attachment` — hence every upload failing
// preflight with "No 'Access-Control-Allow-Origin' header is present",
// 2026-08-11.
//
// This is a one-time (or re-run-if-ever-needed) infrastructure action, not
// part of the per-visit attachment flow. It reuses the same
// ATTACHMENTS_S3_* secrets as the other three functions rather than asking
// anyone to click through the B2 web console by hand.
//
// Authorization: verify_jwt only — any signed-in account, no doctor-row or
// hospital check. There is nothing hospital-scoped here (CORS is a
// bucket-wide setting, not a row), so the ordinary "must have a real
// Supabase session" bar this platform already enforces is the right one.
// Calling it twice is harmless — it just re-applies the same policy.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { S3Client, PutBucketCorsCommand, GetBucketCorsCommand } from 'npm:@aws-sdk/client-s3@3';

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

    const s3 = new S3Client({
      region: 'auto',
      endpoint: Deno.env.get('ATTACHMENTS_S3_ENDPOINT')!,
      credentials: {
        accessKeyId: Deno.env.get('ATTACHMENTS_S3_ACCESS_KEY_ID')!,
        secretAccessKey: Deno.env.get('ATTACHMENTS_S3_SECRET_ACCESS_KEY')!,
      },
    });
    const Bucket = Deno.env.get('ATTACHMENTS_S3_BUCKET')!;

    // Origin left wide open ("*"), matching this function's own CORS header
    // above. This does not weaken access control: a browser still needs a
    // real, doctor-minted, 5-minute presigned URL to PUT or GET anything —
    // CORS only decides whether the BROWSER will let the response through,
    // never whether the bucket accepts the request. A specific origin list
    // would just mean re-editing this every time dev runs on a different
    // port or a production domain gets added, for no real safety gain on a
    // bucket that is already private and presigned-URL-only.
    await s3.send(new PutBucketCorsCommand({
      Bucket,
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedOrigins: ['*'],
            AllowedMethods: ['GET', 'PUT', 'HEAD'],
            AllowedHeaders: ['*'],
            ExposeHeaders: ['ETag'],
            MaxAgeSeconds: 3600,
          },
        ],
      },
    }));

    const readBack = await s3.send(new GetBucketCorsCommand({ Bucket }));

    return jsonResponse({ ok: true, bucket: Bucket, corsRules: readBack.CORSRules });
  } catch (err) {
    console.error('[attachment-configure-cors]', err);
    return jsonResponse({ error: err instanceof Error ? err.message : 'unknown error' }, 500);
  }
});
