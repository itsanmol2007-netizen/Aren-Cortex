// catalogue-cdn-healthcheck — one-time (or re-run-if-needed) diagnostic:
// confirms the medicine-catalogue S3 bucket actually exists and the
// existing AWS credentials (already set as Supabase function secrets for
// the attachments pipeline — AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY/
// AWS_REGION) can write to, read from, and delete from it.
//
// Deliberately a SEPARATE bucket from AWS_BUCKET_NAME (the patient
// attachments bucket, `arenode-patient-orbit-uploads`) — see
// docs/context/offline-security.md: patient files are private, the
// catalogue is public/CDN-served, and mixing them under one bucket makes
// that separation harder to get right, not easier. The bucket name itself
// isn't sensitive (unlike the credentials), so it's a plain constant here
// rather than a new secret.
//
// verify_jwt OFF — same footing as attachment-configure-cors, a one-time
// infra check with no patient data involved, not a doctor-facing endpoint.
// Round-trips a small test object under `_healthcheck/` and deletes it
// again, so re-running this leaves nothing behind.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from 'npm:@aws-sdk/client-s3@3';

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

  const region = Deno.env.get('AWS_REGION')?.trim();
  const accessKeyId = Deno.env.get('AWS_ACCESS_KEY_ID')?.trim();
  const secretAccessKey = Deno.env.get('AWS_SECRET_ACCESS_KEY')?.trim();

  if (!region || !accessKeyId || !secretAccessKey) {
    return jsonResponse({ ok: false, step: 'secrets', error: 'AWS_REGION/AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY not all set' }, 500);
  }

  const s3 = new S3Client({ region, credentials: { accessKeyId, secretAccessKey } });
  const key = `_healthcheck/${crypto.randomUUID()}.json`;
  const body = JSON.stringify({ checkedAt: new Date().toISOString() });

  try {
    await s3.send(new PutObjectCommand({
      Bucket: CATALOGUE_BUCKET, Key: key, Body: body, ContentType: 'application/json',
    }));
  } catch (e) {
    return jsonResponse({
      ok: false, step: 'put', bucket: CATALOGUE_BUCKET, region,
      error: e instanceof Error ? e.message : String(e),
    }, 502);
  }

  try {
    const got = await s3.send(new GetObjectCommand({ Bucket: CATALOGUE_BUCKET, Key: key }));
    const text = await got.Body?.transformToString();
    if (text !== body) {
      return jsonResponse({ ok: false, step: 'get-mismatch', bucket: CATALOGUE_BUCKET }, 502);
    }
  } catch (e) {
    return jsonResponse({
      ok: false, step: 'get', bucket: CATALOGUE_BUCKET, region,
      error: e instanceof Error ? e.message : String(e),
    }, 502);
  }

  try {
    await s3.send(new DeleteObjectCommand({ Bucket: CATALOGUE_BUCKET, Key: key }));
  } catch (e) {
    // Put+Get already succeeded — report success but flag cleanup failed,
    // rather than a false negative over a harmless leftover test object.
    return jsonResponse({
      ok: true, bucket: CATALOGUE_BUCKET, region,
      warning: `test object left behind at ${key}: ${e instanceof Error ? e.message : String(e)}`,
    });
  }

  return jsonResponse({ ok: true, bucket: CATALOGUE_BUCKET, region });
});
