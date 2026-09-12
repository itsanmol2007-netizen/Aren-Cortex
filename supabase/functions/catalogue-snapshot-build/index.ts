// catalogue-snapshot-build — builds the doctor-device medicine catalogue
// snapshot and uploads it to the arenode-catalogue-cdn S3 bucket (fronted by
// CloudFront once that's set up — see docs/context/offline-security.md).
//
// Processes ONE table per invocation (`{ table: "medicines" | "compositions"
// | "medicine_composition_map" }` in the POST body) — each table's rows are
// paginated out of Postgres via the service-role client (bypasses RLS
// entirely; this never runs as any particular doctor), built into ONE
// gzip-compressed JSON file, and uploaded. Keeping each invocation to one
// table bounds its memory/time to that table's own size rather than all
// ~525k rows at once — call it three times (see the deploy notes this
// function's README section — no README written per file yet, see
// docs/context/offline-security.md instead) to build a full snapshot.
//
// Row-array format, not row-object — see docs/context/offline-security.md's
// design discussion: 213k+ repetitions of the same three or four key names
// is wasted bytes before compression even starts, and wasted CPU decoding
// them back into objects the client never wanted anyway. Each file's first
// line-equivalent is a `columns` array naming what each row array holds.
//
// `medicines` is filtered to `hospital_id IS NULL` — the GLOBAL catalogue
// only. A hospital's own pending doctor-added medicines (`addMedicine` in
// lib/db/synapse.ts) are deliberately NOT part of this shared, CDN-cached
// snapshot: they're hospital-specific, usually few, and the client fetches
// them with a small live query instead (same `hospital_id IS NULL OR =
// p_hospital_id` split `composition_brands()` already does online).
//
// verify_jwt OFF — same footing as attachment-configure-cors: an infra job,
// not a doctor-facing endpoint, touching no patient data (the medicine
// catalogue is not sensitive). Safe to re-run any time; each run replaces
// that table's snapshot object and bumps catalogue_meta accordingly.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { S3Client, PutObjectCommand } from 'npm:@aws-sdk/client-s3@3';

const CATALOGUE_BUCKET = 'arenode-catalogue-cdn';
// PostgREST silently caps any unbounded/over-sized `.range()` request at
// 1000 rows regardless of what's asked for (same ceiling `fetchObservables`
// in lib/db/synapse.ts already documents hitting) — this MUST match that
// real cap exactly, or the "did we get a full page" check below breaks: a
// short first page reads as "that was everything" instead of "PostgREST
// truncated me," which is exactly the bug this comment is here to prevent
// reintroducing (caught live: a first run silently stopped at 1000 of
// 213,149 medicines).
const PAGE_SIZE = 1000;

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

type TableName = 'medicines' | 'compositions' | 'medicine_composition_map';

const TABLE_CONFIG: Record<TableName, { columns: string[]; filter?: (q: any) => any; snapshotUrlField: string }> = {
  medicines: {
    // strength_mg is required — it's part of composition_brands()'s own
    // output (via mv_composition_brand), read by the offline ranking
    // replica in lib/offline/offlineBrands.ts. Missing on first cut of this
    // snapshot; caught while reading that RPC's real source before building
    // the replica.
    columns: ['id', 'name', 'manufacturer', 'strength_mg'],
    filter: (q) => q.is('hospital_id', null),
    snapshotUrlField: 'snapshot_medicines_url',
  },
  compositions: {
    columns: ['id', 'name', 'specialization_scope'],
    snapshotUrlField: 'snapshot_compositions_url',
  },
  medicine_composition_map: {
    columns: ['medicine_id', 'composition_id', 'is_primary', 'route'],
    snapshotUrlField: 'snapshot_map_url',
  },
};

async function gzip(text: string): Promise<Uint8Array> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const region = Deno.env.get('AWS_REGION')?.trim();
  const accessKeyId = Deno.env.get('AWS_ACCESS_KEY_ID')?.trim();
  const secretAccessKey = Deno.env.get('AWS_SECRET_ACCESS_KEY')?.trim();
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!region || !accessKeyId || !secretAccessKey || !supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ ok: false, error: 'missing AWS_* or SUPABASE_* secrets' }, 500);
  }

  let body: { table?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ ok: false, error: 'expected JSON body {"table": "medicines"|"compositions"|"medicine_composition_map"}' }, 400);
  }

  const table = body.table as TableName;
  const config = TABLE_CONFIG[table];
  if (!config) {
    return jsonResponse({ ok: false, error: `unknown table "${body.table}" — expected one of ${Object.keys(TABLE_CONFIG).join(', ')}` }, 400);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const startedAt = Date.now();

  // catalogue_meta.current_version is the version this snapshot will claim
  // to cover — read it BEFORE paginating, so any row that changes mid-build
  // shows up again on the next delta pull rather than being silently missed.
  const { data: meta, error: metaErr } = await supabase
    .from('catalogue_meta')
    .select('current_version')
    .eq('id', true)
    .single();
  if (metaErr) return jsonResponse({ ok: false, step: 'read catalogue_meta', error: metaErr.message }, 500);
  const version: number = meta.current_version;

  const rows: unknown[][] = [];
  let offset = 0;
  for (;;) {
    let query = supabase.from(table).select(config.columns.join(',')).order('id', { ascending: true });
    if (config.filter) query = config.filter(query);
    const { data, error } = await query.range(offset, offset + PAGE_SIZE - 1);
    if (error) return jsonResponse({ ok: false, step: `read ${table}`, offset, error: error.message }, 500);
    if (!data || data.length === 0) break;
    for (const r of data as Record<string, unknown>[]) {
      rows.push(config.columns.map((c) => r[c] ?? null));
    }
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  const payload = JSON.stringify({ version, columns: config.columns, rows });
  let gzipped: Uint8Array;
  try {
    gzipped = await gzip(payload);
  } catch (e) {
    return jsonResponse({ ok: false, step: 'gzip', error: e instanceof Error ? e.message : String(e) }, 500);
  }

  const key = `snapshots/v${version}/${table}.json.gz`;
  const s3 = new S3Client({ region, credentials: { accessKeyId, secretAccessKey } });
  try {
    await s3.send(new PutObjectCommand({
      Bucket: CATALOGUE_BUCKET,
      Key: key,
      Body: gzipped,
      ContentType: 'application/json',
      ContentEncoding: 'gzip',
      // Immutable — this exact key never changes content once written (a new
      // catalogue version gets a new `v{version}` prefix instead), so it's
      // safe for CloudFront/browsers to cache indefinitely.
      CacheControl: 'public, max-age=31536000, immutable',
    }));
  } catch (e) {
    return jsonResponse({ ok: false, step: 'put', bucket: CATALOGUE_BUCKET, key, error: e instanceof Error ? e.message : String(e) }, 502);
  }

  const url = `https://${CATALOGUE_BUCKET}.s3.${region}.amazonaws.com/${key}`;
  const { error: updateErr } = await supabase
    .from('catalogue_meta')
    .update({
      [config.snapshotUrlField]: url,
      snapshot_version: version,
      snapshot_generated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', true);
  if (updateErr) return jsonResponse({ ok: false, step: 'update catalogue_meta', error: updateErr.message }, 500);

  return jsonResponse({
    ok: true,
    table,
    version,
    rowCount: rows.length,
    gzippedBytes: gzipped.byteLength,
    url,
    tookMs: Date.now() - startedAt,
  });
});
