-- Fixes a real bug hit in live testing: `requestPhotoHandoff` does
-- `.insert({...}).select("token").single()`, and Postgres requires an
-- INSERT ... RETURNING to also satisfy a SELECT policy on the table --
-- not just the INSERT policy's WITH CHECK. The original migration
-- deliberately left no SELECT policy for `authenticated` ("only
-- service_role reads a row again"), not realizing that also blocks the
-- INSERT's own RETURNING, which is how the client learns the token it
-- just minted. Confirmed live: the same insert succeeds without
-- `RETURNING` and fails with it -- exactly the reported error, "new row
-- violates row-level security policy for table doctor_photo_handoffs".
--
-- Narrowest possible fix: let a doctor read back rows tied to their own
-- doctor_id only -- the same ownership check the INSERT policy already
-- uses. Still no update/delete policy for authenticated, so the token
-- stays effectively write-once from the client; service_role (the
-- landing page's Edge Function) is still the only thing that can mark a
-- token used/expired.
create policy doctor_photo_handoffs_select_own on doctor_photo_handoffs
    for select to authenticated
    using (
        doctor_id in (select id from doctors where user_id = auth.uid())
    );
