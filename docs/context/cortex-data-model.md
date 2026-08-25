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

RPC surface: `composition_brands` (SQL, invoker), `search_intents` (SQL, security definer,
brand-priority over label-priority), and `add_medicine` (PL/pgSQL, security definer —
attaches a new BRAND to an EXISTING composition only, raises if the composition
id doesn't already exist; see rule 22 in `cortex-standing-rules.md`).

**What's NOT covered here:** table schemas in full (read the migration or
`list_tables`/`execute_sql` directly), which file reads/writes which table (→
`cortex-change-map.md`), the engine's own pure-TypeScript types built FROM
this data (→ `engine.md`).
