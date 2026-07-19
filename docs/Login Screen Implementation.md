# Main App (Cortex / Front Desk) — Login Screen Handoff

_For whoever builds the login screen in the main AREN app repo. Accounts are
created **only** by the landing site's registration wizard
(`/register` in the landing-page repo) — the main app never signs users up,
it only authenticates against what registration produced. Do not add any
signup/registration UI to the main app._

---

## 1. What an account looks like

Registration (codename "Vega") creates, per clinic:

- One **Supabase Auth** user per login, with email `{phone digits}@aren.internal`
  and a password the user chose at signup. There is no real inbox behind
  these addresses — email confirmation is disabled project-wide, and no
  email-based flow (confirmation, magic link, email reset) will ever work.
- A `users` row whose **`id` equals the Auth user's id**, with:
  `hospital_id` (FK → `hospitals`), `full_name`, `phone` (the 10-digit
  number as typed, digits only), `role` (`'doctor'` | `'reception'`),
  `is_active` (boolean).
- For doctors only: a `doctors` row (`user_id` = same auth id) carrying the
  clinical profile — `name`, `specialization`, `qualification`,
  `registration_number`, `avatar_url`, `signature_image_url`.
- One `hospitals` row (`clinic_mode`: `'solo' | 'solo_reception' | 'multi_doctor'`,
  plus `name`, `logo_url`, contact fields).

Image URLs (`logo_url`, `avatar_url`, `signature_image_url`) are public
Supabase Storage URLs in the `clinic-assets` bucket — plain `<img src>`
works, no signed URLs needed. Avatars are 512×512 WebP with transparent
background; signatures are transparent PNGs.

## 2. The login call

The screen collects **phone + password**. Convert phone to the auth email
with exactly this function (it must stay byte-identical to the one in the
landing repo's `lib/supabase.ts` — same strip, same domain):

```ts
function phoneToAuthEmail(phone: string): string {
  const digits = phone.replace(/\D/g, ''); // strip non-digits
  return `${digits}@aren.internal`;
}

const { data, error } = await supabase.auth.signInWithPassword({
  email: phoneToAuthEmail(phone),
  password,
});
```

Recommended input behavior (mirrors registration, keeps the derived email
consistent): numeric-only field, max 10 digits, strip non-digits as typed.
Users registered with the 10-digit number **without** country code — if
someone types `+91…`, the leading `91` would derive a different email, so
either strip a leading `91` when 12 digits are entered or cap the field at
10 digits like registration does.

## 3. After sign-in

1. Fetch the app user: `from('users').select('*').eq('id', session.user.id).single()`.
2. **Check `is_active`** — if false, sign out and show "account disabled,
   contact your clinic admin".
3. Route by `role`:
   - `'doctor'` → Cortex. Load their profile via
     `from('doctors').select('*').eq('user_id', session.user.id)`.
   - `'reception'` → Front Desk.
   - Treat any other value (`'admin'`/`'owner'` may exist later) explicitly —
     don't crash on unknown roles.
4. Load the clinic via `users.hospital_id` → `hospitals` (name, `logo_url`,
   `accent_color`, `clinic_mode` for any UI branching).

## 4. Error handling

- `Invalid login credentials` — wrong phone or password, or the phone was
  never registered. One generic message covers all three; don't leak which.
- A successful Auth login with **no matching `users` row** means a
  registration was interrupted partway. Sign the session out and show a
  "contact support" message (arenode.core@gmail.com) rather than a broken app.
- **Password reset:** there is no email reset path (no inboxes). Until an
  admin-driven reset flow exists, resets are manual via Supabase dashboard —
  the login screen should say "Forgot password? Contact arenode.core@gmail.com".

## 5. Things not to do

- No signup UI, no clinic-creation logic — that's the landing site's job.
- Don't generate or accept UUIDs for `users.id` anywhere — it is always the
  Supabase Auth id.
- Don't build phone-OTP/SMS auth — "phone login" here is only the
  email-derivation trick above on top of ordinary password auth.
- Use the anon key only; RLS is the security boundary.
