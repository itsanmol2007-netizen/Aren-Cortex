# Edge functions

Deno functions running on Supabase. **These files are the source of truth for
what is deployed** — until 2026-08-11 they existed only on Supabase and in a
throwaway container, which meant the only copy of the attachment pipeline was
one `supabase functions delete` away from being gone. Now they are in git.

| Function | `verify_jwt` | Does |
|---|---|---|
| `attachment-upload-url` | ✅ | Validates mime / size / type, presigns a PUT, returns a random storage path |
| `attachment-view-url` | ✅ | Confirms the row is visible to the caller, presigns a GET |
| `attachment-delete` | ✅ | Deletes the metadata row first (that *is* the auth check), then the object |
| `attachment-configure-cors` | ✅ | One-time (or re-run-if-needed) infra action — sets the bucket's CORS policy. See below. |
| `rank-compositions` | ❌ | Pre-existing, not part of this pipeline, **not** mirrored here yet |

## Storage provider: AWS S3 (migrated 2026-08-29, was Backblaze B2)

Every function that touches object storage now talks to real AWS S3 —
bucket `arenode-patient-orbit-uploads`, region `ap-south-1` — the same
bucket the new patient-phone gateway upload (separate arenode.com codebase)
writes into, so clinical attachments and patient-uploaded documents share
one bucket, one region, one set of credentials. Two things changed in the
CODE, not just the secrets, because a real AWS account isn't just "another
S3-compatible endpoint":

- `region` is the bucket's real region (`ap-south-1`), never `'auto'` — AWS
  SigV4 signing is region-specific, and `'auto'` is a Cloudflare
  R2/Backblaze-S3-compat convenience real AWS rejects.
- No `endpoint` override. B2/R2 needed one (they're other companies'
  servers speaking the S3 protocol); AWS derives the right host from
  `region` alone, so passing a custom endpoint would silently misroute
  every request.

`visit_attachments.storage_provider` now records `aws_s3` for new uploads.
**14 pre-migration rows still say `b2`** — their `storage_path` points at
the old Backblaze bucket, which has NOT been touched by this migration and
still holds those files. Migrating those specific historical files is a
separate, deliberate task for whenever it's wanted — not attempted silently
here.

## Bucket CORS (fixed 2026-08-11 for B2, re-run 2026-08-29 for the new bucket)

The browser PUTs/GETs straight against the presigned URLs — that traffic
never touches Supabase, so it's the *bucket's* CORS policy that decides
whether the browser is allowed to see the response, independent of whether
the presigned URL itself is valid. A fresh bucket ships with no CORS rule at
all regardless of provider — true of the original B2 bucket
(`aren-packets-attachment`, 2026-08-11: every upload failed at the preflight
stage, `No 'Access-Control-Allow-Origin' header`) and equally true of the
new AWS bucket, which needed the same fix re-run against it during the
migration.

Fixed by `attachment-configure-cors`, invoked once per bucket
(`AllowedOrigins: ['*']` — the bucket is already private and every request
still needs a real 5-minute presigned URL, so a wide-open origin list costs
nothing and avoids re-editing this every time dev runs on a different port).
Re-invoke it any time this error resurfaces; it's idempotent.

## The authorization pattern, and why it looks like nothing

None of these functions take a doctor id, hospital id, or any other caller
identity from the request body. They build a Supabase client from the caller's
own `Authorization` header, which means every query they make is subject to the
same RLS policies as the rest of the app. Asking *"does this visit exist"*
through that client **is** the authorization check: if RLS returns no row, the
visit either does not exist or is not at this doctor's hospital, and both
answers get the same 403. There is no separate permission check to forget to
write, and no service-role key anywhere in these functions.

(`rank-compositions`, the older function, does trust a body-supplied
`doctorId`. That pattern was deliberately not repeated here, because these
functions grant write access to storage.)

## Deploying

Requires the Supabase CLI and a login with access to project
`ieimvjprtltancxapuzg`.

```bash
supabase functions deploy attachment-upload-url      --project-ref ieimvjprtltancxapuzg
supabase functions deploy attachment-view-url        --project-ref ieimvjprtltancxapuzg
supabase functions deploy attachment-delete          --project-ref ieimvjprtltancxapuzg
supabase functions deploy attachment-configure-cors  --project-ref ieimvjprtltancxapuzg
```

All three must keep `verify_jwt` enabled. With it off, the `Authorization`
header stops being validated and the entire authorization model above
evaporates silently — the code would still look correct.

## Secrets

Set as **Supabase function secrets**, never in this repo and never in `.env`
(which is committed on purpose — see the Atlas preamble — and holds only the
publishable anon key).

| Variable | Holds |
|---|---|
| `AWS_ACCESS_KEY_ID` | key id |
| `AWS_SECRET_ACCESS_KEY` | **the real secret** |
| `AWS_REGION` | `ap-south-1` |
| `AWS_BUCKET_NAME` | `arenode-patient-orbit-uploads` |

```bash
supabase secrets set AWS_ACCESS_KEY_ID=... --project-ref ieimvjprtltancxapuzg
# ...and so on. `supabase secrets list` shows names and digests, never values.
```

`SUPABASE_URL` and `SUPABASE_ANON_KEY` are injected by the platform; do not set
them.

**Pre-migration secrets, no longer read by any function here** (safe to
delete — `supabase secrets unset ATTACHMENTS_S3_ENDPOINT
ATTACHMENTS_S3_ACCESS_KEY_ID ATTACHMENTS_S3_SECRET_ACCESS_KEY
ATTACHMENTS_S3_BUCKET`): `ATTACHMENTS_S3_ENDPOINT`, `ATTACHMENTS_S3_ACCESS_KEY_ID`,
`ATTACHMENTS_S3_SECRET_ACCESS_KEY`, `ATTACHMENTS_S3_BUCKET`. These named the
generic S3-compatible client this project used against Backblaze B2 before
the 2026-08-29 AWS S3 migration — the code that read them no longer exists,
so leaving the secrets set is inert, not a live fallback path.

If the AWS secret ever leaks, rotate it in the AWS console and re-set it
here; no redeploy of the functions is needed, and no already-issued
presigned URL outlives its 5-minute TTL.
