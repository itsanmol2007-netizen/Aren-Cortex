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

## Bucket CORS (fixed 2026-08-11)

The browser PUTs/GETs straight against B2's presigned URLs — that traffic never
touches Supabase, so it's the *bucket's* CORS policy that decides whether the
browser is allowed to see the response, independent of whether the presigned
URL itself is valid. A new B2 bucket ships with no CORS rule at all, and
`aren-packets-attachment` never had one set, so every upload failed at the
preflight stage (`No 'Access-Control-Allow-Origin' header`) — a browser-only
failure; `curl` against the same presigned URL would have worked fine, which
is why this was easy to miss.

Fixed by `attachment-configure-cors`, invoked once (`AllowedOrigins: ['*']` —
the bucket is already private and every request still needs a real 5-minute
presigned URL, so a wide-open origin list costs nothing and avoids re-editing
this every time dev runs on a different port). Re-invoke it any time this
error resurfaces; it's idempotent.

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
| `ATTACHMENTS_S3_ENDPOINT` | S3-compatible endpoint URL |
| `ATTACHMENTS_S3_ACCESS_KEY_ID` | key id |
| `ATTACHMENTS_S3_SECRET_ACCESS_KEY` | **the real secret** |
| `ATTACHMENTS_S3_BUCKET` | bucket name |

```bash
supabase secrets set ATTACHMENTS_S3_ENDPOINT=... --project-ref ieimvjprtltancxapuzg
# ...and so on. `supabase secrets list` shows names and digests, never values.
```

`SUPABASE_URL` and `SUPABASE_ANON_KEY` are injected by the platform; do not set
them.

The names are deliberately generic rather than `B2_*`. Every S3-compatible
provider — Backblaze B2, Cloudflare R2, AWS itself — is reachable through the
identical AWS SDK v3 calls in these files, so **changing provider is a secrets
change, not a code change**. `visit_attachments.storage_provider` records where
each file actually landed, so a future migration can be partial without
anything breaking.

If the secret ever leaks, rotate it in the provider console and re-set it here;
no redeploy of the functions is needed, and no already-issued presigned URL
outlives its 5-minute TTL.
