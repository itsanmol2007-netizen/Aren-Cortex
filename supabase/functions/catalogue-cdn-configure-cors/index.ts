// catalogue-cdn-configure-cors — sets the bucket-level CORS policy on
// arenode-catalogue-cdn so a doctor's browser can actually READ the
// snapshot files it downloads directly from S3.
//
// WHY THIS HAS TO EXIST. catalogueSync.ts's downloadSnapshotFile() fetches
// straight from S3, never through Supabase — same "browser talks directly
// to storage" shape attachment-upload-url already established, and the
// same gap bit it the same way: a fresh bucket ships with NO CORS rule at
// all. The HTTP request itself succeeds (curl sees 200 with the real
// bytes) but the browser's fetch() silently refuses to hand the response
// body to JavaScript without an Access-Control-Allow-Origin header —
// confirmed live: `curl -H "Origin: https://example.com"` against a real
// snapshot file came back with NO access-control-* headers whatsoever.
// From the doctor's side this looks exactly like "stuck downloading
// forever," because the fetch() promise never settles the way the app
// expects — see docs/context/offline-security.md for the full story.
//
// Same footing as attachment-configure-cors (the identical fix for the
// OTHER bucket): a one-time (or re-run-if-ever-needed) infra action, not
// part of any per-request flow. verify_jwt OFF here (unlike that one) —
// this bucket holds no patient data, matching catalogue-cdn-healthcheck's
// and catalogue-snapshot-build's own footing, not the attachments
// pipeline's stricter one.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { S3Client, PutBucketCorsCommand, GetBucketCorsCommand } from 'npm:@aws-sdk/client-s3@3';

const CATALOGUE_BUCKET = 'arenode-catalogue-cdn';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const s3 = new S3Client({
      region: Deno.env.get('AWS_REGION')!.trim(),
      credentials: {
        accessKeyId: Deno.env.get('AWS_ACCESS_KEY_ID')!.trim(),
        secretAccessKey: Deno.env.get('AWS_SECRET_ACCESS_KEY')!.trim(),
      },
    });

    // Wide open, matching attachment-configure-cors' own reasoning: these
    // files are public read-only reference data (no patient data, no
    // write access granted by CORS itself — that's still gated by the
    // bucket policy), so a specific origin allowlist buys nothing and
    // would just need re-editing every time a preview/staging domain
    // changes.
    await s3.send(new PutBucketCorsCommand({
      Bucket: CATALOGUE_BUCKET,
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedOrigins: ['*'],
            AllowedMethods: ['GET', 'HEAD'],
            AllowedHeaders: ['*'],
            MaxAgeSeconds: 3600,
          },
        ],
      },
    }));

    const readBack = await s3.send(new GetBucketCorsCommand({ Bucket: CATALOGUE_BUCKET }));

    return jsonResponse({ ok: true, bucket: CATALOGUE_BUCKET, corsRules: readBack.CORSRules });
  } catch (err) {
    console.error('[catalogue-cdn-configure-cors]', err);
    return jsonResponse({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
