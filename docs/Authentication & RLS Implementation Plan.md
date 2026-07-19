AREN — Authentication & RLS Implementation Plan
===============================================

_Handoff for Claude Code. Written after a full database audit session (July 2026). Read this before touching auth or database code — it contains context not available anywhere else in the repo._

* * *

1. Where things actually stand right now

----------------------------------------

* The app currently has **zero authentication**. Every route is open. `src/lib/db/reference.ts` hardcodes `HOSPITAL_ID` and `DOCTOR_ID`, and the browser talks straight to Supabase with the anon key.
* **`users` table is empty. `auth.users` is empty.** No real accounts exist anywhere. This isn't a bug — auth was simply never built. The original architecture doc's "next engineering phase" (auth integration) is genuinely the next unstarted piece of work.
* **Row Level Security (RLS) has been designed and written for all 37 tables in the database, but is currently OFF on every table.** SQL for turning it on is ready (see §4) but must NOT be run until real login accounts exist — turning it on before that blocks 100% of app access, since there is no `auth.uid()` to check against.
* The database schema is significantly larger than any prior document described: **37 tables**, not the ~7 core tables the original architecture handoff covered. Full list and grouping in §3.
* One batch of pre-hospital-architecture test data (12 patients, 127 visits, and everything linked to them across `diagnostic_orders`, `prescriptions`, `prescription_medicines`, etc.) has already been identified and deleted. Root cause: these were created before the `hospitals`/`hospital_id` concept existed in the app (clean cutoff: 2026-06-09). Not a live bug — do not worry about recurrence.

* * *

2. The plan: phone + password login, backed by Supabase Auth

------------------------------------------------------------

**Decision made:** keep the phone-number-based login UX (matches the original product design), but implement it on top of Supabase Auth, which natively expects email+password.

**Mechanism:** convert phone number → a synthetic/fake email internally, e.g.
    9876543210 → 9876543210@aren.internal

This is purely an implementation detail. No user ever sees or types this. The login screen shows a phone number field; the code silently converts it before calling Supabase Auth.
    // Example helper — adapt to actual codebase conventions
    function phoneToAuthEmail(phone: string): string {
      const digits = phone.replace(/\D/g, ''); // strip non-digits
      return `${digits}@aren.internal`;
    }

Password: set at account-creation time (done manually/by admin for now — no public signup, matches "Accounts are created internally" decision in the original architecture doc).

* * *

3. Full database schema (ground truth, as of this audit)

--------------------------------------------------------

The schema splits into two categories that must be handled differently for RLS:

### 3a. Clinic-scoped tables (18) — must be filtered by `hospital_id`

Either they have `hospital_id` directly, or they reach it by joining through `visits`, `prescriptions`, or `doctors`.

`hospitals`, `users`, `doctors`, `patients`, `visits`, `prescriptions`, `medicines`, `hospital_medicine_preference`, `diagnostic_orders`, `coprescription_observations`, `doctor_logs`, `visit_findings`, `visit_symptoms`, `prescription_medicines`, `doctor_composition_bias`, `doctor_medicine_bias`, `user_node_access`

### 3b. Shared medical-knowledge tables (19) — same for every clinic, not hospital-scoped

This is the "Synapse" reference/knowledge layer — drug compositions, symptom/finding catalogs, test panels, clinical pattern snapshots. No `hospital_id` anywhere in their chain.

`compositions`, `tags`, `symptoms`, `findings`, `tests`, `panels`, `composition_tag_map`, `symptom_tag_map`, `finding_tag_map`, `test_tag_map`, `test_panel_map`, `medicine_composition_map`, `composition_dosage_defaults`, `composition_coprescription_hints`, `coprescription_promotions`, `symptom_cluster_test_hints`, `clinical_snapshots`, `snapshot_findings`, `snapshot_symptoms`

Read access: any logged-in user. Write access: admin/owner roles only.

### 3c. Internal-only (1)

`synapse_import_log` — internal log of medicine-data imports, admin-only, not clinic-scoped, currently mostly empty by design (cleared to save storage).

### Known gaps in the schema (do not assume these are wrong — just undocumented until now)

* `clinical_snapshots` has no foreign keys at all — just `id, name, description, tags[], created_at`. It's a standalone knowledge-layer concept.
* The original architecture handoff only described 7 tables. The other 30 (mostly the Synapse/`compositions`/`doctor_*_bias` layer) were discovered during this audit via `information_schema` queries, not from prior documentation. Treat this document as the current source of truth for schema shape, not the older handoff.

* * *

4. RLS policies — ready to apply, but ONLY after real accounts exist

--------------------------------------------------------------------

The policies below use a helper function that maps the logged-in Supabase Auth user to their `hospital_id` via the `users` table:
    CREATE OR REPLACE FUNCTION current_user_hospital_id()
    RETURNS uuid
    LANGUAGE sql
    SECURITY DEFINER
    STABLE
    AS $$
      SELECT hospital_id FROM users WHERE id = auth.uid();
    $$;

    CREATE OR REPLACE FUNCTION current_user_is_admin()
    RETURNS boolean
    LANGUAGE sql
    SECURITY DEFINER
    STABLE
    AS $$
      SELECT role IN ('owner', 'admin') FROM users WHERE id = auth.uid();
    $$;

**Critical dependency:** this assumes `users.id` is set to the same UUID as the corresponding `auth.users.id` (the standard Supabase pattern — when you create an account via `supabase.auth.admin.createUser()`, use the returned `id` as the `users.id` when inserting the app-level row, don't generate a separate one).

Full policy SQL for all 37 tables was written and validated against the real schema during this session (18 clinic-scoped tables with hospital-isolation policies, 19 shared tables with read-all/admin-write policies, 1 admin-only table). Ask the person for the migration files `012_rls_clinic_scoped_tables.sql` and `014_rls_shared_and_internal_tables.sql` if they aren't already in the repo — apply those verbatim rather than re-deriving them, they were checked against every foreign key in the live database.

**Sequencing — do not skip steps or reorder:**

1. Create real Supabase Auth accounts + matching `users` rows (§5)
2. Verify `auth.uid()` resolves correctly and matches `users.id` for a real logged-in session
3. Only then apply the RLS migration files
4. Test login end-to-end before considering this done — if patient data disappears after enabling RLS, the most likely cause is `users.id` not matching `auth.users.id` (check this first, it's happened before in this project)

* * *

5. Accounts to create right now (test/trial phase)

--------------------------------------------------

Two accounts needed immediately:

* **One doctor** — replaces the hardcoded `DOCTOR_ID = 5cd330d2-5a48-4098-b865-ed3393e08698` (Dr. SK Pandey). Create the Supabase Auth account, then a `users` row with `role = 'doctor'`, `hospital_id` matching the existing hardcoded `HOSPITAL_ID = 38bd8da3-0dd2-43a5-ad09-2d3194c95ba9`, then link a `doctors` row via `user_id`.
* **One receptionist** — new `users` row with `role = 'reception'`, same `hospital_id`.

Use the existing hardcoded `HOSPITAL_ID` value for both, so existing test data (patients, visits already in the DB under that hospital) stays connected and visible after the auth switch.

* * *

6. Build order for Claude Code

------------------------------

1. **Login screen** — phone + password fields, converts phone to fake email, calls `supabase.auth.signInWithPassword()`.
2. **Session/identity loading** — after successful login, fetch the `users` row for the logged-in `auth.uid()`. If `role === 'doctor'`, also fetch the linked `doctors` row.
3. **Workspace router** — based on `users.role`: `doctor` → Cortex (`/app/cortex`), `reception` → Front Desk (`/app/frontdesk`), `owner`/`admin` → admin area (not yet built — route to Cortex or a placeholder for now).
4. **Replace hardcoded references** — every import of `HOSPITAL_ID` / `DOCTOR_ID` from `src/lib/db/reference.ts` needs to instead read from the logged-in session's loaded identity. Grep the codebase for both constants to find every call site before starting — do this as a full sweep, not incrementally, since a partially-migrated app (some routes using session data, others still hardcoded) will produce confusing bugs.
5. **Logout + session persistence** — matches "Persistent sessions" requirement from the original architecture doc.
6. **Apply RLS migrations** (§4) — last step, only after 1–5 are working and tested.
7. **System Health page** — separate, later piece of work (see original architecture doc's "System Health Philosophy" section — it's a status-aggregation page, not a settings page, covering Database/Auth/Storage/WhatsApp/Printer/ABHA/Backup/Internet/Queue subsystems). Not blocking on auth work; sequence after.

* * *

7. Things NOT to do

-------------------

* Don't rename `hospitals` to `clinics` — existing code depends on the name.
* Don't build a memberships/permissions/organizations/tenants table — deliberately kept simple, roles are a flat `TEXT + CHECK` column on `users`.
* Don't add public signup — accounts are created internally only, by design.
* Don't re-run the pre-hospital test-data cleanup — it's already done (§1).
* Don't guess at foreign keys or table purposes if they're not in this document — query `information_schema` directly, the same way this document's data was gathered. Two mistakes happened during this audit from assuming rather than checking (a delete migration failed on an undocumented table, and an RLS policy was nearly written for a table with unknown columns) — both were caught by checking first. Keep that habit.



8. Identity Model

-----------------

Supabase Auth is responsible **only** for authentication.

Application identity lives in the `users` table.

Relationship:
    auth.users
        │
        ▼
    users
        │
        ├── hospital_id
        ├── role
        │
        ▼
    doctors (optional)

Rules:

* `auth.users` answers **who logged in**.

* `users` answers **who this person is inside AREN**.

* `doctors` stores the doctor's clinical profile (specialization, registration number, signature, etc.).

* Every authenticated request should first resolve the corresponding `users` record before accessing any business data.

* Business logic should never depend directly on `auth.users`.

* * *

9. Hospital Ownership Principle

-------------------------------

AREN is designed around a single ownership rule:

> **Every operational record belongs to exactly one hospital.**

Hospital-scoped entities include:

* Users

* Doctors

* Patients

* Visits

* Prescriptions

* Diagnostic Orders

* Medicine Preferences

* Doctor Bias Tables

* Visit Data

* Any future operational records

Hospital isolation is enforced through **Row Level Security (RLS)**.

No authenticated user should ever be able to read or modify another hospital's operational data.

This principle should remain true for every future feature.

* * *

10. Login & Identity Lifecycle

------------------------------

Authentication flow:
    Phone Number
            │
            ▼
    Convert to internal auth email
            │
            ▼
    Supabase Authentication
            │
            ▼
    Resolve auth.uid()
            │
            ▼
    Load users row
            │
            ▼
    Resolve hospital_id
            │
            ▼
    Resolve role
            │
            ▼
    Load doctor profile (if role = doctor)
            │
            ▼
    Open correct workspace
            │
            ▼
    Application Ready

If any step fails, the login should stop with a meaningful error instead of continuing with partial identity information.

* * *

11. Single Source of Truth

--------------------------

Responsibility ownership inside AREN:

| Responsibility       | Source of Truth                  |
| -------------------- | -------------------------------- |
| Authentication       | `auth.users`                     |
| Application Identity | `users`                          |
| Doctor Profile       | `doctors`                        |
| Hospital Ownership   | `hospital_id`                    |
| Permissions          | `users.role` + application logic |
| Data Isolation       | PostgreSQL RLS                   |

Avoid duplicating these responsibilities elsewhere.

* * *

12. Application Authorization vs Database Isolation

---------------------------------------------------

These are separate responsibilities.

### Application Authorization

Determines **what a logged-in user is allowed to do**.

Examples:

* Can access Front Desk

* Can open Cortex

* Can edit prescriptions

* Can manage staff

* Can view System Health

This is controlled by:

* `users.role`

* Future application permissions

* * *

### Database Isolation (RLS)

Determines **which rows the user is allowed to access**.

Examples:

* Only patients belonging to Hospital A

* Only visits belonging to Hospital A

* Never expose Hospital B's records

RLS protects data.

Application permissions control features.

These two systems should remain independent.

* * *

13. Future Expansion (Not Phase 1)

----------------------------------

The current architecture intentionally stays simple.

Possible future additions include:

* Multiple hospitals per user

* Doctor-specific patient visibility

* Fine-grained permission system

* Staff invitation flow

* Password reset workflow

* Two-factor authentication

* Audit trail

* Session management dashboard

* Temporary staff access

* Department-based permissions

These are **future enhancements only**.

Do not implement them during Phase 1 unless they become necessary.

*  
