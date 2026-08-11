// attachment-delete — removes an attachment from both object storage and the
// visit_attachments metadata row. Same provider-neutral, RLS-scoped pattern
// as attachment-upload-url and attachment-view-url (see that file's header
// for the full reasoning) — repeated here only where it differs.
//
// Order matters: delete the METADATA row first, through the caller's own
// RLS-scoped client. That IS the authorization check — if the row isn't
// visible (not this doctor's hospital), the delete affects zero rows and
// this function stops there, never touching storage. Only after confirming
// a row was actually deleted does it delete the object from S3-compatible
// storage. Deleting storage first would risk destroying a file whose
// metadata delete then fails partway — leaving a dangling reference to
// nothing; this order can only ever leave a harmless orphaned object in
// storage, never a broken reference in the database doctors actually read.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { S3Client, DeleteObjectCommand } from 'npm:@aws-sdk/client-s3@3';

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

    // Deleting through the RLS-scoped client IS the authorization check.
    // .select() on the delete forces PostgREST to report which row(s) were
    // actually affected, so "not found" and "not yours" are indistinguishable
    // from the caller's side either way, same as attachment-view-url.
    const { data: deletedRows, error: dbErr } = await supabase
      .from('visit_attachments')
      .delete()
      .eq('storage_path', storagePath)
      .select('id');
    if (dbErr) return jsonResponse({ error: dbErr.message }, 500);
    if (!deletedRows || deletedRows.length === 0) {
      return jsonResponse({ error: 'attachment not found, or not yours' }, 404);
    }

    const s3 = new S3Client({
      region: 'auto',
      endpoint: Deno.env.get('ATTACHMENTS_S3_ENDPOINT')!,
      credentials: {
        accessKeyId: Deno.env.get('ATTACHMENTS_S3_ACCESS_KEY_ID')!,
        secretAccessKey: Deno.env.get('ATTACHMENTS_S3_SECRET_ACCESS_KEY')!,
      },
    });

    try {
      await s3.send(new DeleteObjectCommand({
        Bucket: Deno.env.get('ATTACHMENTS_S3_BUCKET')!,
        Key: storagePath,
      }));
    } catch (storageErr) {
      // The metadata row is already gone — from the doctor's point of view
      // the attachment is deleted, correctly. A storage-side failure here
      // becomes an orphaned object, not a broken reference, and is logged
      // rather than surfaced as a user-facing error the doctor can't act on.
      console.error('[attachment-delete] storage delete failed after DB delete succeeded', storageErr);
    }

    return jsonResponse({ deleted: true });
  } catch (err) {
    console.error('[attachment-delete]', err);
    return jsonResponse({ error: err instanceof Error ? err.message : 'unknown error' }, 500);
  }
});
