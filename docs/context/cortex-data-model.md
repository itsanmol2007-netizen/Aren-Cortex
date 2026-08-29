# Cortex data model — the tables that matter

Part of the `aren-cortex-context.md` split, 2026-08-24. This pocket is §3 of
that file (see `cortex-overview.md`'s header for why the split happened),
plus the two tables added the same day for the free-text and
composition-request fallbacks.

---

| Table | What |
|---|---|
| `observables` | the catalogue — every pickable symptom/finding/history chip |
| `observable_signals` / `signals` | chip → engine vocabulary |
| `measurement_rules` | numeric threshold → signal |
| `intents` | every possible output (medicine/finding/test/referral/advice/exercise/modality/impairment) |
| `signal_intent_rules` | **the knowledge base** — what ranks against what |
| `intent_guards` / `intent_classes` / `intent_class_map` | warn / warn_hard gating |
| `compositions` | the molecule catalogue — what the engine actually ranks |
| `medicines` | products (213k+ rows collapsing to ~284 molecules); read only via `composition_brands` RPC |
| `intent_companions` | intent → companion intent, authored |
| `visit_observations` / `visit_measurements` | the permanent engine-shaped record of a visit |
| `decision_log` | the learning write, gated on a real identity |
| `patient_conditions` / `condition_observable_map` | durable chronic facts carried forward across visits |
| `visit_story` / `patient_goals` / `visit_goal_scores` | physiotherapy subjective intake + goals |
| `visit_body_sites` | dermatology body map + physiotherapy joint map (shared storage) |
| `prescription_exercises` | structured exercise plan rows |
| `care_plans` | session-count tracking for physiotherapy courses |
| `visit_attachments` | X-rays/lab reports, B2-backed |
| `doctor_pinned_intent` | doctor's pins, RLS-scoped, follows them across machines |
| `clinic_brand_preference` / `doctor_signal_intent_rules` | clinic/doctor personalisation overlays |
| `doctor_free_terms` | **added 2026-08-24** — the free-text fallback's memory: a doctor-typed term (finding/test/referral/advice) that missed the catalogue, remembered against that consult's active signals AND its other accepted intents (`accepted_intent_ids`) for future matching. Doctor-scoped, `hospital_isolation` RLS. Never touches `intents`/`signal_intent_rules` — a doctor-local convenience list, not knowledge-base content. See `src/features/consult/freeTerms.ts` for the matching/scoring logic. |
| `composition_requests` | **added 2026-08-24** — the composition-adding fallback: a doctor's ask for a salt/molecule not in `compositions`, logged with `status='pending'`. Deliberately NOT a path to a live composition (rule 22) — nothing reads this table to produce a rankable/guardable composition; promoting one is the clinical-review pipeline rule 22 describes, done by a person. Feeds the admin approval queue noted as "not built" in `cortex-open-crosscutting.md`. |

| `clinic_hours` | **added 2026-08-29** — clinic operating hours, ONE ROW PER OPEN SESSION (a clinic that runs 10:00-14:00 and 17:00-20:00 on Monday has two Monday rows). A weekday with zero rows IS closed — deliberately no `is_closed` boolean, so there is nothing to keep in sync (rule 19). `day_of_week` is 0=Monday…6=Sunday, NOT Postgres' Sunday-first `dow`. Unique on `(hospital_id, day_of_week, opens_at)` and CHECKed `closes_at > opens_at`; the Clinic Hours modal mirrors both client-side so the doctor gets a sentence instead of a 409. Written whole-week-at-a-time by `replaceClinicHours`. |
| `prescription_settings` | **added 2026-08-29** — the Prescription Editor's structured configuration, one row per clinic. This is the EDITING model in the brief's "rendering system ≠ editing system" split: `PrescriptionDocument` stays the one renderer (rule 6) and CONSUMES this. It stores no prescription content beyond the two things that exist only to be printed (`footer_note`, `default_advice`); everything else it holds is a decision about whether data the clinic/doctor profile already owns appears. **A missing row is normal, not an error** — `DEFAULT_PRESCRIPTION_CONFIG` (`lib/db/clinic.ts`) reproduces the renderer's pre-existing output exactly, including the three advice lines it used to hardcode, so an un-configured clinic prints what it always printed. |
| `hospitals.website` / `.clinic_type` / `.facility_type` | **added 2026-08-29** — the Clinic page identity card's own fields. `facility_type` is the doctor's own words ("Dermatology & Aesthetic Medicine") and is NOT `specialty_profile`, which configures the engine and must stay a controlled value. |

| `prescription_settings.print_mode` | **added 2026-08-29** — `'color' \| 'monochrome'`. NOT a `PrintFormat`; a clinic-wide colour axis independent of paper size (a5/a4/thermal). Read only by `StandardDocument`; thermal was already monochrome by construction. |
| `storage` (`clinic-assets`, `doctor-assets` buckets) | **RLS completed 2026-08-29** — both buckets pre-existed but `storage.buckets` had RLS enabled with zero policies (silent block on ANY upload) and `storage.objects` had no SELECT policy (silently broke every `upsert:true` call specifically, since that compiles to `INSERT ... ON CONFLICT DO UPDATE`, which needs SELECT to detect the conflict at all). Final shape: one `storage.buckets` SELECT policy naming both bucket ids, plus select/insert/update/delete on `storage.objects` × both buckets, all scoped by `(storage.foldername(name))[1] = current_user_hospital_id()::text`. See SESSION-HANDOFF's "the real bug this round found" for the debugging method — a SQL simulation of the policy expression cannot catch a gap in a DIFFERENT table's policy. |

RPC surface: `composition_brands` (SQL, invoker), `search_intents` (SQL, security definer,
brand-priority over label-priority), and `add_medicine` (PL/pgSQL, security definer —
attaches a new BRAND to an EXISTING composition only, raises if the composition
id doesn't already exist; see rule 22 in `cortex-standing-rules.md`).

**What's NOT covered here:** table schemas in full (read the migration or
`list_tables`/`execute_sql` directly), which file reads/writes which table (→
`cortex-change-map.md`), the engine's own pure-TypeScript types built FROM
this data (→ `engine.md`).
