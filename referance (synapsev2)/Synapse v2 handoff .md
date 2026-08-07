Synapse v2 — Build Handoff
==========================

**Purpose of this document:** hand a new session (chat or Claude Code) everything needed to continue building Synapse without re-deriving decisions. Read it fully before writing code.

**Status at handoff (updated 2026-07-27):** database schema built and seeded; engine written **and verified against the live database**; sandbox UI built; `decision_log` wired with the **adaptive personalisation layer** on top (§10a) and the three learning layers above that (§10b). The **General OPD catalogue expansion** landed on 2026-07-26 — 117 → 373 chips, 114 → 280 signals, 290 → 844 rules (§11). **Brand resolution was wired into the UI on 2026-07-27** — the sandbox now shows a prescribable brand rather than a molecule name (§12). **Also on 2026-07-27:** the doctor-local rule threshold dropped 3 → 2, a `DENGUE_SUSPICION` guard was authored, search was added to all six intent types, and a flat per-doctor quick-list was built (§13). **Later the same day, guards stopped hiding anything (§14)** — every `block` became a hard, acknowledgment-gated warning, and the promotion ceiling in `learn_doctor_rules` became an explicit check. **Finally, §15 closed the medicine rule gap** — 52 → 177 of 263 medicine intents ruled, 844 → 1,099 rules. The v1 tag architecture is still untouched and still dead.

**Updated 2026-07-28:** the sandbox is being retired and the engine moved into the main codebase. **§16 is the packing list** — what moves, what stays, and the four UI translators that must travel with the engine even though the sandbox UI does not. Read it before copying anything.

Sections rewritten across those passes: §2.1, §3.1, §4, §7, §8, §9, §10a, §10b, and the new §11, §12, §13, §14 and §16.

> **Read §14 before acting on §4, §5, §10a, §10b, §12 or §13.** Those sections were written against a system in which a guard could hide a suggestion, and they still say *blocked* / *withheld* / *held back* in places. It cannot any more. §14 is a philosophy change, not a tuning tweak, and it is the authority wherever the two disagree.

> **Corrected 2026-08-06** (found while doing unrelated content work on
> `claude/cortex-atlas-summary-auycuc`, commit `63387da`). Two things, kept
> separate because they're different kinds of stale:
>
> **The numbers below are all outdated.** As of 2026-08-06: **393** active
> observables (not 373) · **300** signals (not 280) · **1,543** active rules
> (not 1,099) · **261** active medicine intents, **193** ruled (not 263 / 177).
> The philosophy sections (§0, §1–§9, §14) are unaffected — only counts.
>
> **A real bug, not staleness — this doc's own architecture predates ever
> retiring a catalogue row.** `loadRuleset`'s intents query (§9,
> `Synapse engine.ts:346` in this folder) selects
> `id, type, label, ref_table, ref_id` and never reads `is_active`; the
> `.filter(x => x)` beside it filters nothing. `search_intents` **does** filter
> `is_active`, so a retired intent that still carried rules would go on being
> **suggested while unsearchable** — the worst combination.
>
> Present from the original build — this reference file and the live
> `src/lib/synapse/engine.ts` were byte-for-byte identical apart from this one
> query before today. It was **latent, not live**: nothing had ever had
> `is_active = false` while still carrying rules before this session, so the
> failure mode had never actually fired. I fixed the loader before running the
> catalogue-dedup migrations that retire ruled intents, and those migrations
> deactivate an intent's rules in the same statement as the intent — so this
> specific bug never reached a served suggestion. (A *different*, unrelated bug
> did: two `compositions` rows — `glucosamine` and its salt form — were both
> **active** and both wired to the same two signals, so real duplicate
> suggestions were live in production before today. That's a catalogue-
> authoring duplicate, not an `is_active`-enforcement gap; see
> `docs/aren-cortex-atlas.md` §6.1–§6.2 for that one.)
>
> **Fixed in `src/lib/synapse/engine.ts`, deliberately left unfixed in the copy
> of `Synapse engine.ts` in this folder** — this folder is inert reference
> material nothing imports; the live file is the one that matters. Do not copy
> the intents-select pattern below without adding the `is_active` filter. Full
> account: `docs/aren-cortex-atlas.md` §6.0.

* * *

0. Read this first — non-negotiables

------------------------------------

1. **The engine must never know a specialty exists.** If adding dentistry would require editing engine code, a boundary leaked. Fix the boundary, not the engine.
2. **The v1 tag architecture is dead.** `tags`, `symptom_tag_map`, `finding_tag_map`, `composition_tag_map`, `test_tag_map`, `doctor_composition_bias`, `doctor_medicine_bias`, `symptom_cluster_test_hints`, `composition_coprescription_hints`, `coprescription_observations`, `coprescription_promotions`. These tables **still exist in the database** because Cortex v1 may still read them. Do not build on them, do not migrate them, do not drop them yet. They die after v2 proves out.
3. **Synapse suggests and ranks. It never decides.** The doctor confirms every action. This is not a diagnosis product.
4. **~200k `medicines` rows and ~213k medicine dataset rows are untouched and stay untouched.** The engine ranks _compositions_. Brands are a lookup after ranking, via `medicine_composition_map`.
5. **Anmol is a solo non-technical founder.** Break work into small executable steps. Do not hand over multi-phase roadmaps. One step, executed, then the next.
6. **Push back when something is wrong.** Several important corrections in this build came from Anmol catching over-engineering. Reciprocate.

* * *

1. The architecture in one page

-------------------------------

    INPUTS  →  SIGNALS  →  ENGINE  →  INTENTS  →  RENDER

Five layers. Each talks only to the next.

| Layer       | What it is                                                                                                                                                    |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Inputs**  | Exactly three shapes: observations (a chip was tapped), measurements (name + value + unit), attachments (files). No free text as primary input.               |
| **Signals** | Standardised internal tokens — `CHEST_PAIN`, `HIGH_BP`. The engine's entire vocabulary. It has no idea whether a signal came from a cardiologist or a physio. |
| **Engine**  | Pure scoring function. Zero medical knowledge. Zero tables.                                                                                                   |
| **Intents** | Every possible output, one catalogue: medicine, test, exercise, referral, finding, advice.                                                                    |
| **Render**  | Plugin code that draws intents of one type.                                                                                                                   |

**Everything is weighted and ranked, never boolean.** Multiple interpretations survive and propagate. A named clinical interpretation shown at 0.72 _alongside alternatives_ is honest; the same label shown alone as a verdict is not. Ranking is a safety property.

**Findings are intents.** Symptoms rank findings → doctor confirms one → it is written back as an observation → the engine re-runs → medicine/test intents. One engine, run twice. Not two pipelines.

**All medical knowledge lives in two places:** `observable_signals` + `measurement_rules` (what inputs mean) and `signal_intent_rules` (what to do about it). Everything else is plumbing.

* * *

2. Database

-----------

**Supabase project:** `arenod` — ref `ieimvjprtltancxapuzg`, region `ap-south-1`, Postgres 17. **Extension required:** `pg_trgm` (already enabled; used for fuzzy chip search).

### 2.1 Tables built for v2

| Table                 | Rows | Purpose                                                |
| --------------------- | ---- | ------------------------------------------------------ |
| `signals`             | 281  | The vocabulary + `idf_weight` (see §3.1 and §11)       |
| `observables`         | 374  | Every pickable chip (`kind`, `domains`, `system`, `search_text`) |
| `observable_signals`  | 503  | chip → signal, weighted                                |
| `measurement_rules`   | 29   | threshold → signal, weighted                           |
| `intents`             | 652  | Every possible output                                  |
| `signal_intent_rules` | 1099 | **The knowledge base.** signal → intent, weighted (§15) |
| `intent_classes`      | 6    | Grouping for gating only (`nsaid`, `spinal_load`, `muscle_relaxant`, `pregnancy_contraindicated`, `fluoroquinolone`, `antibiotic`) |
| `intent_class_map`    | 71   | intent → class (§15 added 8)                           |
| `intent_guards`       | 14   | Contraindication warnings — 9 hard, 5 soft, 0 hiding (§14) |
| `visit_observations`  | 0    | Raw input, permanent                                   |
| `visit_measurements`  | 0    | Raw input, permanent                                   |
| `visit_attachments`   | 0    | Raw input, permanent                                   |
| `decision_log`        | live | shown / accepted / skipped / searched_accepted / override_accepted — **feeds §10a** |
| `v_doctor_preference` | view | Derived preference model, per doctor (§10a)            |
| `v_doctor_brand_preference` | view | Fast brand model, per doctor (§10b)              |
| `intent_companions`   | 26   | intent → companion intent, authored (§10b)             |
| `doctor_signal_intent_rules` | live | Doctor-local learned rules, weight ≤ 0.5 (§10b) |
| `v_search_gap`        | view | Authoring backlog — what many doctors search for (§10b) |
| `mv_composition_brand` | matview | Brands per composition; the anon key's door past RLS (§12) |
| `v_doctor_frequent_medicine` | view | Flat per-doctor prescription count — the quick-list (§13) |

**Do not build on** `doctor_composition_bias`, `doctor_medicine_bias`, `hospital_medicine_preference`, `coprescription_*`. Those are v1 tag-era tables and remain dead per §0.2. The v2 preference layer is `decision_log` → `v_doctor_preference` and shares nothing with them.

### 2.2 Intent breakdown

| type     | count | source                                                      |
| -------- | ----- | ----------------------------------------------------------- |
| medicine | 263   | `compositions` (ref_table `compositions`)                   |
| test     | 249   | `tests` (ref_table `tests`) — 12 deactivated as duplicates  |
| finding  | 68    | hand-authored, pointer-less                                 |
| exercise | 33    | hand-authored, pointer-less — **label IS the prescription** |
| referral | 20    | hand-authored, pointer-less                                 |
| advice   | 19    | hand-authored, pointer-less                                 |

`panels` (36 rows) exists in the DB but has **no** intents yet. Adding them is a one-line insert and is probably worth doing — a single rule suggesting "LFT" beats five rules suggesting five liver tests.

### 2.3 Key schema details that will bite you

* **`intents.ref_table` is plain text with a CHECK constraint**, not a foreign key — you can't FK to a table name. Allowed values: `compositions`, `tests`, `panels`, `exercises`. (`exercises` table does not exist yet; exercise intents are pointer-less by design for MVP.)
* **`intents.ref_table` and `ref_id` are all-or-nothing** (CHECK constraint).
* **All rule weights are `numeric(4,3)` constrained to `[-1, 1]`.** Negative weights mean a signal argues _against_ an intent. Used for soft cases only — see §4 on guards.
* **`idf_weight` is `numeric(4,3)`, must be > 0.** 1.0 = neutral. Rarer signals score higher. `FATIGUE` is 0.9; `CAUDA_EQUINA_SIGNS` is 3.5.
* **`observables.domains` is `text[]`** — values `opd`, `physio`. **UI filter only. The engine never reads it.**
* **`observables.system` is text** — body-system grouping for the picker (`general`, `respiratory`, `gynaecology`, …). **Same status as `domains`: UI only, the engine never reads it.** Added in §11 because a flat list stops working at ~370 chips. Labels and display order live in `src/data/search.ts`, not the database.
* **`compositions.specialization_scope` is a JSON array** with values `general`, `gastro`, `pediatric`, `ortho`, `gynec`, `urology`. Note: **no `physio` value** — physio compositions are filed under `ortho`. The physio renderer needs to know this.
* **`decision_log.outcome`** allows `shown`, `accepted`, `skipped`, `searched_accepted`, `override_accepted`. `blocked` was removed in §14 — nothing is blocked, and it had zero rows. Only `accepted` and `skipped` feed `v_doctor_preference`.
* **`signal_intent_rules` has `reviewed_by` / `reviewed_at` columns** for clinician sign-off. These are **not blocking for MVP** by explicit decision. Rigorous testing is required before onboarding real clinics; line-by-line MBBS review of every rule is not.

### 2.4 Measurements — the thing most likely to break silently

Measurement rules match on `visit_measurements.value_num`. **Blood pressure must be split into two rows before insert** — `BP_SYS 170` and `BP_DIA 100`. If the app writes a single row with `value_text = '170/100'`, **BP silently never fires**. No error, no warning, just missing signals.

Measure keys currently defined: `BP_SYS`, `BP_DIA`, `HR`, `SPO2`, `TEMP` (Celsius), `RR`, `GLUCOSE_RANDOM`, `GLUCOSE_FASTING`, `HBA1C`, `AGE`, `PAIN_VAS`, `ROM_PCT`, `MMT`, `GRIP_KG`.

* **`AGE` is not typed by the doctor.** It comes from the patient record and the app must inject it as a measurement on every consultation, or `ELDERLY` / `PEDIATRIC` never fire.
* **`ROM_PCT` is generic, not per-joint** — the app computes "90° achieved out of 180° expected = 50%". The chip carries the location (`rom_restricted` + `shoulder_pain`); the measurement carries the degree. Deliberate trade to avoid thirty per-joint measure keys.
* **Range semantics: `min_value` inclusive, `max_value` exclusive.**

* * *

3. Signals

----------

115 tokens in three groups: shared (~45), General OPD (~35), physiotherapy (~35).

**The rule for adding a signal:** does it change what gets suggested, or is it descriptive detail? If two signals always co-occur and always point at the same intents, they are one signal. `CHEST_PAIN` is a signal; `CHEST_PAIN_MILD_LEFT_SIDED` is a chip pretending to be one.

**A deliberate asymmetry:** body regions are separate signals for physio (`SHOULDER_PAIN`, `KNEE_PAIN`, `ELBOW_PAIN`…) because they point at completely different exercise intents. They are _not_ separate for OPD — there is no `LEFT_CHEST_PAIN` — because region doesn't change the suggestion there. This is intentional, not an oversight.

### 3.1 The region-blindness correction (2026-07-24)

Three signals were **deleted** and replaced, because they merged body regions that point at completely different intents:

| deleted                   | why it was wrong                                                                  |
| ------------------------- | --------------------------------------------------------------------------------- |
| `PAIN_RADIATING`          | fed by *both* arm and leg radiation; its only rule was → Acute coronary syndrome, so a sciatica patient was shown a cardiac red flag |
| `NERVE_TENSION_POSITIVE`  | fed by SLR and slump (lower limb) **and** ULTT (upper limb)                        |
| `RADICULAR_PAIN`          | fed by all six of those chips; every rule pointed at lumbar intents                |

Net effect before the fix: neck pain + positive ULTT returned *"Lumbar disc herniation"* and *"Nerve gliding, **lower** limb"*.

Replaced by `RADICULOPATHY_CERVICAL` and `RADICULOPATHY_LUMBAR`, both `idf 2.200`. The provocation tests fold into their own region's signal at a higher weight (0.85) rather than becoming separate signals — they always co-occur with, and always point at, the same intents, which is the §3 test for "these are one signal".

**The ACS rule was deliberately not carried over to arm radiation.** Both radiating-pain chips are `physio`-domain only, and ACS stays fully reachable via `CHEST_PAIN` (5 rules) and `CHEST_TIGHTNESS`, which are dual-domain. Do not re-add a cardiac rule to a musculoskeletal radiation chip.

`STIFFNESS_POST_REST → Mechanical low back pain` was removed for the same reason — it made a knee patient look like a back patient. It is a qualifier, not a region; `LOW_BACK_PAIN` already carries that finding.

**The general rule this establishes:** a signal that can be produced by two different body regions must not carry a region-specific rule. Either split the signal or move the rule to the region signal.

**Two splits that were questioned and confirmed correct:**

* `STIFFNESS_MORNING` vs `STIFFNESS_POST_REST` — inflammatory vs mechanical, different management.
* `REFLEX_DIMINISHED` vs `REFLEX_EXAGGERATED` — root lesion vs upper motor neuron, opposite meanings. Originally one signal (`REFLEX_ALTERED`); splitting it was a mid-build correction.

**Verified invariants (both currently return zero rows):**
    -- dead chips: a doctor taps it and nothing happens
    select slug from observables o
    where not exists (select 1 from observable_signals os where os.observable_id = o.id);

    -- unreachable signals: nothing can produce it
    select id from signals s
    where not exists (select 1 from observable_signals os where os.signal_id = s.id)
      and not exists (select 1 from measurement_rules mr where mr.signal_id = s.id);

**Run both after any seed change.** They are the cheapest correctness check in the system.

* * *

4. Guards — contraindication handling

-------------------------------------

**This is an addition to the frozen v2 architecture doc.** It was added mid-build for a reason worth understanding.

### The problem

Contraindication via negative rule weights is `O(signals × intents)`. To stop the system suggesting exercises to a suspected cauda equina patient, you need one negative rule per exercise. 33 exercises today, 200 later, times ~15 dangerous signals. Miss one row and the system confidently suggests spinal loading to a patient who needs a surgeon — and it looks like a normal suggestion, not an error.

**This actually happened during the build.** Two of four exercises were suppressed, two weren't, because only two rules had been written. It was caught by running a test, not by reading the rules.

### The fix

Three tables. Gates, not weights.
    intent_classes    (id, slug, label, note)
    intent_class_map  (intent_id, class_id)
    intent_guards     (id, signal_id, action, target_type, target_class_id, target_intent_id, reason, is_active)

A guard fires when its `signal_id` is active and targets **exactly one** of:

* `target_type` — a whole intent type (`exercise`, `medicine`…)
* `target_class_id` — a named group of intents
* `target_intent_id` — one specific intent

`action` is `warn` or `warn_hard`. **Neither hides anything.** There is no hiding action, and there has not been one since 2026-07-27 — see §14, which changed this and is the section to read if any of the paragraphs below sound like they describe a system that withholds suggestions. A CHECK constraint enforces exactly-one-target.

### Why this is not v1 tags

It looks similar and the resemblance is worth stating plainly: **v1 tags were the ranking path** — symptom → tag → composition, with scoring flowing through them. That is why they became unmaintainable. **Intent classes never touch scoring.** The engine ranks identically with or without them; classes are read only afterwards, to decide what gets a warning attached (§14 — nothing gets hidden). Delete every class tomorrow and every score is unchanged.

### Currently seeded

Classes: `nsaid` (11 compositions), `spinal_load` (5 exercises), `muscle_relaxant` (4), `pregnancy_contraindicated` (9), `fluoroquinolone` (7), `antibiotic` (35). **Eight of those memberships were added in §15**, to close gates that drugs were about to be ruled into.

Twelve rows. **Seven `warn_hard`, five `warn`. Zero hidden.** The seven were `block` until 2026-07-27 (§14); the signal, target, class and reason text on every one of them are unchanged.

| signal                    | action      | target                            | level  |
| ------------------------- | ----------- | --------------------------------- | ------ |
| `CAUDA_EQUINA_SIGNS`      | `warn_hard` | type `exercise`                   | type   |
| `BILATERAL_NEURO_DEFICIT` | `warn`      | type `exercise`                   | type   |
| `SEVERE_HIGH_BP`          | `warn`      | type `exercise`                   | type   |
| `PREGNANCY`               | `warn_hard` | class `nsaid`                     | class  |
| `PREGNANCY`               | `warn_hard` | class `muscle_relaxant`           | class  |
| `PREGNANCY`               | `warn_hard` | class `pregnancy_contraindicated` | class  |
| `PREGNANCY`               | `warn`      | intent metronidazole              | intent |
| `RENAL_IMPAIRMENT`        | `warn`      | class `nsaid`                     | class  |
| `PEDIATRIC`               | `warn_hard` | class `muscle_relaxant`           | class  |
| `PEDIATRIC`               | `warn`      | class `fluoroquinolone`           | class  |
| `PEDIATRIC`               | `warn_hard` | intent nimesulide (comp 35)       | intent |
| `DENGUE_SUSPICION`        | `warn_hard` | class `antibiotic`                | class  |

**`pregnancy_contraindicated` is grouped by gate, not by pharmacology.** Albendazole and adapalene share no mechanism; what they share is that neither may be shown to a pregnant patient. A guard *is* a gate, so grouping by gate is correct — and resisting the urge to turn it into a drug taxonomy is exactly what stops it becoming v1 tags again.

**`fluoroquinolone` is a soft `warn` rather than `warn_hard`**, because compositions carry no route (§2.3) and the ophthalmic/otic preparations in this catalogue are routine paediatric use. A soft warning surfaces the question in passing; a hard one would demand a ritual acknowledgment for something that is usually correct, and a hard warning that fires on routine practice stops being read.

**That is now the whole of the `warn` / `warn_hard` decision, and it is a smaller decision than `block` / `warn` was.** Both actions show the intent and both attach the reason. The only question is whether this is a thing a doctor should be made to stop for. If the honest answer is "usually fine, worth a glance", it is `warn`. If it is "this could seriously hurt this specific patient", it is `warn_hard`. Nothing about the choice decides what the doctor may prescribe.

**Until composition rules existed (2026-07-24) the drug guards had never fired**, because nothing ever suggested a medicine for them to act on. They were untested code paths for the entire life of the project. Adding 42 composition rules is what made them real, and the first thing that surfaced was a gap: muscle relaxants had been given rules with no guard covering them, so `muscle_relaxant` was created in the same pass.

**Lesson worth keeping:** every time you author rules for a new drug family, ask what guards that family needs. Rules and guards are added together or the safety layer silently lags the knowledge layer.

> **This lesson paid out again in §15**, which found **eight** drugs whose family was guarded but which were in no gate — two NSAIDs, two muscle relaxants, two antibacterials and two teratogens — all harmless only because they were rule-less. The query that found them is in `db/2026-07-27_07_medicine_rule_coverage.sql`; **run it before every future drug batch.**

**Aspirin (composition 81) is deliberately excluded from the `nsaid` class.** It is chemically an NSAID but clinically two different drugs — low-dose aspirin is _prescribed_ in pregnancy for pre-eclampsia prophylaxis and is core to ACS management. The `compositions` table has one row with no dose attached, so the class cannot distinguish them. Excluding it is the safe default; flag at render if needed.

### Rule of thumb going forward

* **Guard** = "the ranking must not offer this on its own initiative, and the doctor must be told why." Categorical, safety.
* **Negative weight** = "this is less likely / less appropriate." Soft, e.g. `HEARTBURN → Acute coronary syndrome −0.15`.

Do not use negative weights to enforce safety. That is what broke.

The first bullet used to read *"this must not be shown."* The change is §14 and it is worth stating in one line: **a guard constrains what the system volunteers; it never constrains what the doctor can reach.**

* * *

5. The engine — `synapse-engine.ts`

-----------------------------------

Pure TypeScript. No framework. The only place that knows Supabase exists is `loadRuleset` at the bottom, which is separable.

### Exports

    runEngine(rs: Ruleset, input: EngineInput): EngineResult   // the engine
    resolveSignals(rs, input): ActiveSignal[]                  // step 1, exported for debugging
    guardIntent(rs, activeSignals, intent): GuardVerdict       // step 3, exported for companions + search (§14)
    loadRuleset(db, version?, doctorId?): Promise<Ruleset>     // Supabase loader (+ §10b overlay)
    groupByType(intents): Record<IntentType, ScoredIntent[]>   // render helper

### How to call it

    import { loadRuleset, runEngine, groupByType } from './synapse-engine';
    
    const ruleset = await loadRuleset(supabase, 'mvp-1');   // load once, cache it
    
    const result = runEngine(ruleset, {
      observations: [
        { observableId: 12, isNegated: false },
        { observableId: 47, isNegated: false },
      ],
      measurements: [
        { measureKey: 'BP_SYS', value: 170 },
        { measureKey: 'BP_DIA', value: 100 },
        { measureKey: 'AGE',    value: 68  },
      ],
    });
    
    result.activeSignals;   // what the inputs translated to
    result.intents;         // EVERYTHING scored, ranked. status 'ok' | 'warn' | 'warn_hard'
    result.hardWarned;      // the 'warn_hard' subset — the SAME objects, not copies (§14)

### Pipeline inside

1. **`resolveSignals`** — observations (negated chips emit nothing) and measurements → signals. When several inputs map to the same signal, the **highest** weight wins. `strength = weight × idf_weight`.
2. **`scoreIntents`** — for every active signal, every matching rule adds `strength × rule.weight` to that intent. Contributors are recorded per intent.
3. **`guardIntent`** — per intent, checks type / class / specific-intent targets against active signals. Any `warn_hard` wins over any `warn`. It attaches a status and reasons and **removes nothing**.
4. **Sort** — ranked by `rawScore` descending. Nothing is split out.

### Four things to know

* **A guard is not a filter (§14).** Everything scored is ranked and returned; what a guard changes is `status` and `guardReasons`, never whether the doctor sees it. The old "3 exercises hidden — suspected cauda equina" drawer is gone: those exercises are in the list, in red, needing acknowledgment. A doctor who can't see what was withheld can't disagree with it — the honest end of that argument is not to withhold it.
* **Every intent carries `contributors`** — which signals pushed it up, largest first. This is the explainability and debugging surface. When a ranking looks wrong you will see it's `NIGHT_PAIN −0.2` doing something unexpected rather than guessing.
* **`score` is `rawScore / totalStrength`.** Purely cosmetic — dividing every score by the same constant cannot change the order. **Rank on `rawScore`, display `score`.** If normalised numbers look odd later, that one line is safe to change.
* **`loadRuleset` pages at 1000 rows** to get past Supabase's default limit. Load once per session and cache; it is not cheap and the ruleset does not change mid-consultation.

### Not yet implemented

* Writing to `decision_log`. The engine returns everything needed (`intentId`, `score`, rank position, `activeSignals` for context, `rulesetVersion`) but nothing persists it. **This should be wired early** — §10 of the architecture doc defers the learning layer but requires the data exist from day one.
* Formal ruleset versioning. `loadRuleset` takes a version string defaulting to `'mvp-1'`; nothing enforces or increments it.
* Attachment interpretation. Deferred by design — for MVP the doctor ticks a chip.

* * *

6. Verified behaviour — regression baseline

-------------------------------------------

Both scenarios were run against the live database and produced these rankings. **Use them as regression tests.** If a rule change breaks either, something is wrong.

> **Important caveat:** these numbers came from the SQL simulation in §6.3, not from `synapse-engine.ts`. The TypeScript implements the same arithmetic but **has never been executed against the live database.** The first task in §9 is to run it and confirm it reproduces these exact numbers. If it doesn't, the engine is wrong, not the baseline.

### Chest pain + chest tightness + known diabetic + smoker

| type     | label                             | raw score |
| -------- | --------------------------------- | --------- |
| test     | ECG (12-lead)                     | 2.59      |
| finding  | Acute coronary syndrome           | 2.57      |
| test     | Troponin I                        | 0.99      |
| finding  | Gastro-oesophageal reflux disease | 0.54      |
| referral | Cardiology                        | 0.54      |

Test ranking above finding is correct: the system wants evidence before it wants a label. GERD surviving at 0.54 is the ranking-not-verdict property working.

### Low back pain + chronic + saddle numbness + bladder/bowel change

| type     | label                                   | raw score |
| -------- | --------------------------------------- | --------- |
| referral | Emergency / immediate hospital transfer | 3.33      |
| finding  | Cauda equina syndrome                   | 3.15      |
| test     | MRI Spine (Lumbar)                      | 2.98      |
| referral | Neurosurgery                            | 2.45      |
| finding  | Mechanical low back pain                | 0.94      |

One red-flag chip pair reorders the entire list. **This top five is unchanged by §14** — the exercise intents that used to be blocked by guard now rank in their own right at 0.66 and below, each carrying a hard warning, so they appear beneath *Mechanical low back pain* rather than in a drawer.

### The SQL used to simulate the engine

Useful for checking rankings without running the app:
    with picked as (select unnest(array['chest_pain','chest_tightness','known_diabetes','smoker']) as slug),
    sig as (
      select os.signal_id, max(os.weight) * s.idf_weight as strength
      from picked p
      join observables o on o.slug = p.slug
      join observable_signals os on os.observable_id = o.id
      join signals s on s.id = os.signal_id
      group by os.signal_id, s.idf_weight
    )
    select i.type, i.label,
           round(sum(sig.strength * r.weight)::numeric, 3) as raw_score,
           bool_or(r.is_safety_critical) as safety
    from sig
    join signal_intent_rules r on r.signal_id = sig.signal_id and r.is_active
    join intents i on i.id = r.intent_id
    group by i.type, i.label
    order by raw_score desc;

Note this SQL does **not** apply guards — it shows raw scoring only.

* * *

7. Rule authoring — how the seeds were written

----------------------------------------------

Every rule seed used a **staging table pattern** so that a mistyped intent label is _reported_ rather than silently dropped:
    create table _rule_seed (signal_id text, itype text, ilabel text, weight numeric(4,3), safety boolean);

    -- ... insert values ...

    insert into signal_intent_rules (signal_id, intent_id, weight, is_safety_critical)
    select r.signal_id, i.id, r.weight, r.safety
    from _rule_seed r
    join signals s on s.id = r.signal_id
    join intents i on i.type = r.itype and i.label = r.ilabel and i.is_active
    on conflict (signal_id, intent_id) do nothing;

    -- then, critically:
    select distinct r.itype, r.ilabel from _rule_seed r
    where not exists (select 1 from intents i where i.type = r.itype and i.label = r.ilabel and i.is_active);

    drop table _rule_seed;

**Use this pattern for every future rule batch.** A plain insert with a join silently drops non-matching rows, and you will not notice 40 missing rules until a doctor does.

**Coverage as of 2026-07-27 (after §15).** **1,099** active rules; **5** signals have none. By intent type: **354 medicine**, 354 test, 156 referral, 154 finding, 44 advice, 31 exercise. Medicine rules tripled in §15 and are now level with tests.

*Historical, for contrast — after §11 (2026-07-26):* 844 rules, of which only 105 pointed at a medicine.

*Historical, for contrast — as of 2026-07-24:* ~290 rules, 13 signals with none, weighted toward findings (121 finding, 47 test, 42 medicine). §11 shifted the balance decisively toward tests and referrals, which is the intended shape: the system should want evidence and a destination before it wants a label or a prescription.

Authored in that pass: both radiculopathies, all physio regions (shoulder, knee, neck, hip, ankle, elbow, wrist, balance, gait, soft tissue), diabetes, hypoglycaemia, the urinary tract, GI, headache, skin, ENT, eye, and composition-level medicine rules.

**The 5 signals with no rules are all correct.** `PREGNANCY`, `PEDIATRIC`, `DRUG_ALLERGY`, `IMMUNOCOMPROMISED`, `HEPATIC_IMPAIRMENT` are guard inputs — they gate, they do not suggest, and giving them rules would be a design error.

The eight genuinely thin signals this section used to list — `MALAISE`, `ABDOMINAL_PAIN`, `SWELLING_LOCALISED`, `NUMBNESS`, `PAIN_AT_REST`, `TRAUMA_HISTORY`, `BLEEDING`, `LOW_BP` — **were all filled in §11.**

One of them is worth remembering as a pattern: **`TRAUMA_HISTORY` was given advice rules only, no imaging.** It is region-blind — it can be produced by a head, knee or wrist injury — so under the §3.1 rule it must not carry a region-specific output like "X-Ray Knee". Region-blind signal, region-blind rules.

**Two authoring principles learned the hard way:**

* **Write rules symmetrically within a therapeutic class.** Pantoprazole was originally given two rules (`HEARTBURN` + `ABDOMINAL_PAIN_UPPER`) while the other PPIs got one. That is not clinical evidence, it is authoring asymmetry, and it produced a 1.02 score gap between interchangeable drugs — which in turn made the personalisation layer look broken when it could not close it. If a signal warrants a drug class, it warrants the class.
* **Fever carries no NSAID rule, deliberately.** Paracetamol only. Dengue is a live differential in this catalogue and NSAIDs are actively harmful there.

**Verification:** `scripts/scenarios.mts` runs 31 realistic consultations end to end and prints signals, ranking and guard warnings (soft and hard). Run it after every rule change. `scripts/verify.mts` checks the two §6 baselines specifically.

* * *

8. Known issues and open decisions

----------------------------------

1. **`tests` catalogue has duplicates.** 12 intents deactivated (ref_ids 3, 5, 19, 27, 57, 18, 36, 43, 44, 37, 127). The generic-vs-specific kills (43 CT Brain, 44 MRI Brain, 37 X-Ray Abdomen) were a judgement call — forcing the rule author to specify contrast/view rather than letting the doctor guess. Reversible. Not-duplicates deliberately kept: bilirubin Total/Direct/Indirect, Doppler Lower Limb/Carotid, MRI & X-Ray Spine Cervical/Lumbar, Chest PA/AP, Abdomen Erect/Supine, Brain Plain/Contrast.
2. **`Malaria Antigen / Smear` (test 16)** is a generic duplicating tests 72 and 73. Not yet deactivated.
3. **No `OBESE` signal.** A BMI measurement rule was drafted and deleted because there was nothing to map it to. Obesity changes drug dosing and physio load tolerance and probably deserves a signal.
4. **Guards are single-signal only.** "Warn on X when signal A **and** B" is not expressible. Workaround is a composite signal — which is exactly why `DENGUE_SUSPICION` exists (§13.3). Fine for MVP; note it.
5. **`panels` has no intents.** 36 rows sitting unused. Still true after §11.
6. ~~`decision_log` writes not implemented.~~ **Done** — see §10a.
7. ~~**Observable count is 117, not the 121 originally drafted.**~~ **Superseded by §11** — the catalogue was rebuilt to 373 chips and every seeded row was reconciled against a staging-table report, so the drafted list and the DB now agree exactly.
8. **Rules cannot express conjunction**, same as guards. `KNEE_PAIN → Knee OA` and `STIFFNESS_POST_REST → Knee OA` both fire independently and add; there is no way to say "knee pain **and** post-rest stiffness". Additive scoring gets the ranking right when both are present, at the cost of low-score noise when only the qualifier is. Accepted trade for MVP.
9. **Qualifier signals still leak a little.** `STIFFNESS_POST_REST` points at knee and hip OA at 0.20, so a shoulder patient sees hip OA at ~0.30. Ranks far below anything real, but it is the same class of problem as §3.1 and worth watching.
10. **The whole knowledge base is un-reviewed by a clinician.** Authored by an LLM against established practice, conservative choices preferred, cross-checked by scenario testing — not validated by an MBBS. `signal_intent_rules.reviewed_by` / `reviewed_at` are still empty on all **1,099** rows. **This is the single largest outstanding risk before any real clinic sees this.** §11 tripled it and §15 grew it another 29% — and §15's share is *medicines*, where being wrong costs more than an unnecessary investigation. Triage the medicine rules first.

* * *

9. Next steps, in order

-----------------------

Done since the original list: the sandbox UI, `decision_log`, composition rules, the personalisation layer (§10a), the three learning layers (§10b), and the General OPD catalogue expansion (§11). **The old step 4 — "fill the remaining thin signals" — is complete;** all eight are filled and only the five guard inputs have no rules.

What remains, in order:

1. **Clinical review of the knowledge base.** **1,099 rules, none reviewed.** Populate `reviewed_by` / `reviewed_at`. This is the top risk (§8.10) and it gates everything below. Triage rather than a line-by-line read: start with the ~90 `is_safety_critical` rules and the **354** rules pointing at a medicine — §15 tripled that number, and medicines are where being wrong costs most.
2. **Real doctor identity.** Replace the `localStorage` UUID in `src/data/decisions.ts` with the signed-in doctor, and add the FK to `doctors` that `decision_log` currently lacks. This now blocks more than it did — §10b keys brand preferences and doctor-local rules on that same id.
3. **Live-reload preferences** after closing a consultation instead of requiring a *Reload rules* click.
4. ~~**Medicine rule coverage.** 52 of 263 compositions have a rule.~~ **Done — see §15.** 177 of 263 (67%). The 86 still rule-less are deliberate skips, enumerated in §15 and in the migration footer.
5. **Add `panels` intents** — one rule suggesting "LFT" beats five suggesting five liver tests. 36 rows still unused.
6. **Prove end-to-end on General OPD**, then a second specialty to pressure-test the plugin boundary.
7. **Only then**, drop the v1 tag tables.

**Explicitly not now:** clinic- or specialty-level preference priors (§10a), clinical consistency validation, attachment interpretation, formal engine versioning.

### Scripts

| script                          | what it does                                                        |
| ------------------------------- | -------------------------------------------------------------------- |
| `scripts/verify.mts`            | the two §6 regression baselines                                      |
| `scripts/scenarios.mts`         | **31** realistic consultations + companions, full ranking + guards, the §13.2 doctor-local loop, and the §14 promotion ceiling. Run after any rule change |
| `scripts/personalization.mts`   | proves the §10a adaptive loop; cleans up its own simulated rows      |
| `scripts/brand-preference.mts`  | proves the §10b fast brand layer                                     |
| `scripts/doctor-rules.mts`      | proves the §10b doctor-local rule loop, and the §14 promotion ceiling in isolation |
| `scripts/dump-catalogue.mts`    | regenerates `db/catalogue_*.sql` from the live DB (§11)              |
| `scripts/brands.mts`            | proves the brand lookup: the RLS path, the combination filter, and that no rankable composition is brand-less (§12) |
| `scripts/search-and-frequent.mts` | `searched_accepted` on all six intent types, promotion on a non-medicine intent, and the flat quick-list (§13) |
| `scripts/medicine-coverage.mts`  | guard reach, drug leaks and rank burial for the §15 medicine rules. **Run after any drug-rule batch** |

**`db/` holds two kinds of file and they must not be confused:** hand-written schema migrations, and *generated* catalogue dumps. See `db/README.md`. Regenerate the dumps after any catalogue change or they become a note of intent rather than a record of fact.

* * *

10a. Adaptive ranking — the personalisation layer

---------------------------------------------------

**`decision_log` is not an analytics table.** It is the substrate for adaptive ranking, which has always been part of the product vision. Treating it as logging is the wrong mental model and will lead to the wrong decisions about what to record.

### The pipeline

    Clinical knowledge (global)
            ↓
    Engine ranking            ← identical for every doctor on earth
            ↓
    Doctor interaction        ← accept / skip in the UI
            ↓
    decision_log              ← one write per closed consultation
            ↓
    v_doctor_preference       ← derived model, per doctor
            ↓
    Personalised re-ranking   ← src/data/personalize.ts

### The one invariant

    finalScore = clinicalScore + preferenceAdjustment

**Never the other way around.** Clinical knowledge is global and shared; preferences are local to one doctor and must never alter what any other doctor sees. The engine is not involved in personalisation at all and does not know it exists — `synapse-engine.ts` was not modified.

### Three hard limits

1. **It can only reorder.** It cannot introduce an intent that has no clinical score.
2. **Safety-critical intents are exempt**, and **so are hard-warned ones (§14).** A doctor's habit must not be able to demote a red flag, nor to promote something a guard is warning about. Checked on `isSafetyCritical` and `status === 'warn_hard'`. The second half used to hold structurally — `personalize` never saw `result.blocked` — and now has to be stated in code, because it sees them.
3. **The adjustment is capped relative to its own intent type** — `PREFERENCE_CAP = 0.35` of the top score *within that type*. Medicines compete with medicines, tests with tests.

On (3): an absolute cap does not work, because raw scores are not on a common scale. 0.35 is decisive among medicines scoring ~0.5 and meaningless among findings scoring ~3.

### The model (`v_doctor_preference`)

Keyed on **(doctor, intent, context_key)**, where `context_key` is the signal that *drove* that intent — `contributors[0]`, which the engine already sorts largest-first. Without it, "this doctor prefers rabeprazole for heartburn" would leak into every unrelated presentation.

| term         | formula                       | purpose                                                    |
| ------------ | ----------------------------- | ---------------------------------------------------------- |
| weight       | `0.5 ^ (age_days / 60)`       | exponential decay, 60-day half-life                        |
| consistency  | `Σ(w·direction) / Σw` ∈ [−1,1]| +1 always accepted, −1 always skipped, ~0 contradictory     |
| confidence   | `Σw / (Σw + 3)`               | saturating: 1 → 0.25, 3 → 0.50, 9 → 0.75, 21 → 0.88         |
| **preference** | `consistency × confidence`  | model output ∈ [−1, 1]                                     |

Separating consistency from confidence is what makes the behaviour non-linear in the required way: **volume buys confidence, agreement buys direction, and you need both.** Twelve contradictory decisions produce confidence 0.70 but preference 0.03 — no reordering. Twelve consistent ones produce preference 0.70 and flip the list.

Decay falls out of the same weights: exposure shrinks as decisions age, so confidence shrinks with it and the preference fades if the behaviour stops. Nothing needs to expire rows.

### Verified behaviour — `scripts/personalization.mts`

Simulates a doctor who consistently chooses rabeprazole where the global ranking puts pantoprazole first, and asserts all four properties. Current output:

| stage                                  | result                                              |
| -------------------------------------- | --------------------------------------------------- |
| global ranking                          | pantoprazole 1.54 > rabeprazole 1.06                |
| Dr A, 12 consistent visits              | **rabeprazole 1.44 > pantoprazole 1.17** — flipped  |
| Dr B, taught nothing                    | unchanged — personalisation is local                |
| Dr A, sustained 40 visits               | 1.55 vs 1.06 — separation widens                    |
| same 12 decisions, 10 months old        | preference ±0.08 — clinical order returns           |
| 12 decisions, half each way             | preference ±0.03 — no reordering despite volume     |

### What gets written, and when

One insert per **closed** consultation, not per keystroke. An abandoned draft is not evidence, and streaming would poison the model with intents that appeared for half a second.

Recorded: `shown` for everything ranked, `accepted`/`skipped` for explicit clicks, `override_accepted` where the accept was of a hard-warned intent (§14), `searched_accepted` for anything reached from outside the list, plus **implicit skips**.

**Implicit skips matter more than they look.** Doctors will not click skip twenty times, but accepting one medicine and leaving four on screen *is* a choice against those four. Inferred only within an intent type where something was accepted — ordering no tests at all says nothing about any individual test — and never for safety-critical intents.

The logged `score` is always the **clinical** score, never the personalised one. Otherwise the model would learn from its own output and drift.

### Not yet done

* `doctorId()` is a UUID in `localStorage`. `decision_log` has no FK on `doctor_id`, so this proves the loop without auth. Swapping in the real signed-in doctor is a one-line change.
* Preferences load once per session; the UI needs a *Reload rules* click to pick up decisions just written.
* No cross-doctor aggregation (clinic-level or specialty-level priors). Deliberately out of scope — it reintroduces the global/local coupling that v1 tags got wrong.

* * *

10b. The three learning layers (2026-07-25)

-------------------------------------------------

Three layers built on top of §10a. **All three sit around the engine, never inside it.** `runEngine` is byte-for-byte untouched; the only engine edit is the sanctioned `loadRuleset` overlay described below. Delete every table, view and module named here and every clinical score is unchanged.

### Fast brand learning — `src/data/brands.ts`, `v_doctor_brand_preference`

A doctor prescribes a **brand**, not a composition. Once the engine has ranked the composition, this orders the brands beneath it for one doctor.

Same decay/consistency/confidence maths as `v_doctor_preference`, but the **confidence constant is 0.5, not 3** — one acceptance buys ~0.67 confidence, two buy ~0.80. That asymmetry is deliberate: choosing a brand *within an already-chosen composition* is a habit, not a clinical judgement, so it should feel near-instant. Composition-level preference stays slow for exactly the opposite reason.

Keyed on `(doctor, composition, medicine, form)`. Brand direction is derived without per-brand skip rows: within one composition+form the chosen brand is +1 and every other brand chosen there is −1, so `evidence = 2·Σw(brand) − Σw(total)`.

Fallback chain: learned → clinic default → most prescribed → alphabetical.

> **Schema gotcha.** There is **no `form` column on `medicines`** — the table is `(id, name, manufacturer, hospital_id, strength_mg)`. The real dosage form is **`medicine_composition_map.route`** (tablet / syrup / drops / …), which is what the paediatric tablet-vs-syrup rule keys on. No name-parsing.

### Co-prescription companions — `src/data/companions.ts`, `intent_companions`

An NSAID rides with a PPI, an antibiotic with a probiotic, isoniazid with pyridoxine. That is an **intent → intent** relationship, not signal → intent: the PPI is suggested because a *prescription* was made, not because of a symptom. So companions fire on **acceptance**, after scoring.

26 authored pairs seeded via the §7 staging pattern with zero unmatched rows: 9 NSAID→PPI, 10 antibiotic→probiotic, NSAID→muscle-relaxant, 2 steroid→PPI, tramadol→antiemetic, metformin→B12, isoniazid→B6, methotrexate→folate.

Companions are deduped across multiple triggers and **run through the guards before display** — a muscle-relaxant companion offered to a pregnant patient carries the same hard warning the engine would give it, on the same terms, and is offered rather than withheld (§14).

> **The maintenance point this section used to flag is closed.** `companions.ts` re-implemented the engine's private `applyGuards` from the same `Ruleset` data and had to stay in lockstep with it. `guardIntent` is exported now (§14) and the mirror is deleted.

### Doctor-local rules — `doctor_signal_intent_rules`, `v_search_gap`

Recovers from *misses*: the doctor searched for something the ranking never offered.

`learn_doctor_rules(threshold)` promotes repeated `searched_accepted` events into a doctor-local rule. The driver signal is the **highest-idf (rarest) signal** in the recurring context, so the learned rule stays specific rather than attaching to `FEVER`.

`loadRuleset(db, version, doctorId)` overlays them. **With no `doctorId` the ruleset is identical to the global one** — that is the invariant that keeps this local. Learned rules are capped at **weight ≤ 0.5** (authored rules reach 1.0) by a CHECK plus a clamp in the loader, and are never safety-critical.

**A guard still beats a learned rule, and since §14 it beats it earlier and harder:** `learn_doctor_rules` refuses to mint the rule at all if a guard was active against that intent in the context being learned from. See §14 — that promotion ceiling is the only place in the system where a guard is still absolute.

> **Superseded on 2026-07-27 — the threshold is now 2.** The paragraph below is kept because its reasoning is still the reasoning; only the number changed. See §13.1.

**Threshold = 3, and the reasoning matters.** `searched_accepted` is already strong evidence — the doctor bypassed the entire list — but one event can be a mis-tap and two a coincidence. A doctor-local rule *mints a new clinical score*, which is a bigger step than brand reordering (which flips on 1–2), so it should demand more evidence. Three independent consultations is still reachable within a week or two of real use.

`v_search_gap` is the **authoring backlog**: `(signal context, intent, distinct-doctor count)` where several doctors independently searched for the same thing. When many doctors want the same rule, that is a gap in the global knowledge base, not a personal preference — and it should be authored centrally rather than learned repeatedly.

### Scripts

`brand-preference.mts`, `scenarios.mts` (companion section), `doctor-rules.mts` — all green. Each cleans up its own simulated rows.

* * *

11. General OPD catalogue expansion (2026-07-26)

---------------------------------------------------

**Why:** the catalogue could not express what patients actually say. There was no `Cough` chip — only "Dry cough", "Cough with sputum", "Cough over 3 weeks", which forces a characterisation the doctor may not have yet. There was no `Body ache` at all, which is arguably the single commonest OPD complaint in India. Whole systems were missing: no gynaecology, no mental health, no male reproductive, no paediatric-specific, almost no ENT or eye.

| | before | after |
| ------------------- | ---- | ---- |
| `observables`       | 117  | 373  |
| `observable_signals`| 152  | 502  |
| `signals`           | 114  | 280  |
| `signal_intent_rules`| 290 | 844  |

### The four rules the import followed

1. **No grammatical duplicates.** "Stomach pain" was dropped: "Generalised abdominal pain" already exists on the same signal and already carries `stomach` in its `search_text`. Two chips that differ only in phrasing are a worse picker, not a richer one.

2. **Near-synonyms become separate CHIPS on a SHARED SIGNAL.** Bloating / gas / belching are three chips on one `GAS_BLOATING`. Cloudy urine and foul urine are two chips on `URINE_ABNORMAL_APPEARANCE`. Diplopia, ptosis and squint are three chips on `OCULAR_MOTOR_ABNORMALITY`.

   **This is what a "symptom cluster" is in this architecture, and it needs no `cluster_id` column.** A shared signal *is* the cluster, it is already the representation the engine understands, and it means the doctor's phrasing never changes the ranking. Adding a cluster table would have created a second, parallel grouping mechanism — which is precisely how v1 tags started.

3. **Multi-signal chips express conjunction at the input layer.** A rule cannot say "A **and** B" (§8.8), but a chip that emits both signals gets the same additive effect. `Fever with rash` emits `FEVER` + `RASH`; `Fever with joint pain` emits `FEVER` + `JOINT_PAIN` + `BODY_ACHE`. This is the cheapest available workaround for the conjunction gap and it required no engine change.

4. **A new signal must earn its keep.** The §3 test — does it change what gets suggested? Where two complaints pointed at the same place they were merged. Where urgency differed they were split: `PRESYNCOPE` is separate from `DIZZINESS`, `EXERTIONAL_SYNCOPE` from `SYNCOPE` (aortic stenosis is not a faint), `NECK_STIFFNESS` from `NECK_PAIN` (meningism is not a musculoskeletal complaint), `BACK_PAIN_UPPER` from `LOW_BACK_PAIN` (whose 14 lumbar rules must not fire for a thoracic complaint).

### Every new signal has rules

166 signals were added and all 166 have rules. Only **five** signals in the entire database now have none — `PREGNANCY`, `PEDIATRIC`, `DRUG_ALLERGY`, `IMMUNOCOMPROMISED`, `HEPATIC_IMPAIRMENT` — and those are guard inputs, which gate rather than suggest. Giving them rules would be a design error (§7).

The eight genuinely thin signals §7 flagged were also filled: `ABDOMINAL_PAIN`, `MALAISE`, `SWELLING_LOCALISED`, `NUMBNESS`, `PAIN_AT_REST`, `TRAUMA_HISTORY`, `BLEEDING`, `LOW_BP`. That backlog is now clear.

**A chip wired to a rule-less signal is not a dead chip and the §3.1 invariants will not catch it** — it passes both while producing nothing. The stricter check is worth keeping:

```sql
select o.slug from observables o
where o.is_active and not exists (
  select 1 from observable_signals os
  join signal_intent_rules r on r.signal_id = os.signal_id and r.is_active
  where os.observable_id = o.id);
```

It should return only the guard-input chips. (The UI already surfaces this per chip via `signalsWithRules` in `useSynapse.ts`, which is why the gap was visible rather than silent.)

### Deliberately conservative on drugs

New signals were routed mainly to **tests, findings, referrals and advice** — diagnostic and triage outputs, where being wrong costs an unnecessary investigation rather than a wrong prescription. Medicine rules were added only where uncontroversial (paracetamol for body ache, antihistamines for urticaria, albendazole for worms, clotrimazole for candidiasis).

**Three families were deliberately left without a drug rule** even though the compositions exist:

* **Erectile difficulty** → tests + Urology only. Sildenafil/tadalafil carry a fatal nitrate interaction and this catalogue cannot see concurrent medication.
* **Menorrhagia** → tests + gynaecology only, no tranexamic acid. It needs a cause first.
* **Everything psychiatric** → Psychiatry referral only. No SSRI, no benzodiazepine, at any weight.

### Two ranking errors this pass caught

Both were found by running the scenarios, not by reading the rules — the same way the guard gap was found in §4.

* **A steroid appeared in a stroke.** `FACIAL_WEAKNESS → prednisolone` was authored for Bell's palsy, but the chip feeding it (`facial_drooping`) also feeds `STROKE_SIGNS`, so a stroke picture surfaced a steroid. Rule deleted. Same class of error as §3.1: **a signal reachable from two very different pictures must not carry a rule specific to one of them.**
* **Neurology outranked Emergency in an acute stroke** (6.88 vs 3.23), because three signals stacked on Neurology while only `STROKE_SIGNS` reached Emergency. Pure authoring asymmetry, exactly the §7 lesson. Fixed by adding Emergency to `SPEECH_DISTURBANCE` and `FACIAL_WEAKNESS` and trimming their Neurology weights. Emergency now leads at 6.22.

### Verification

Both §6 baselines reproduce **byte-identically** — nothing in the expansion perturbed the existing rankings. `scripts/scenarios.mts` now runs 31 consultations (11 new in this pass), including two that assert the new guards. `personalization.mts`, `brand-preference.mts` and `doctor-rules.mts` all still pass; `tsc --noEmit` is clean.

### Still open

* The knowledge base remains **un-reviewed by a clinician** (§8.10), and this pass tripled it. The risk did not change in kind, but it did change in size.
* `panels` still has no intents (§8.5).
* ~~Medicine rule coverage is still thin in absolute terms: **52 of 263 compositions now have a rule, up from 21.**~~ **Closed by §15** — 177 of 263, with the remaining 86 enumerated there as deliberate skips.

* * *

12. Brand resolution wired into the UI (2026-07-27)

---------------------------------------------------

`resolveBrands` had existed since §10b and **nothing called it.** The sandbox showed composition names — `paracetamol`, `aceclofenac` — where a doctor expects a product. This pass connected the two halves.

### What changed

| | |
| ------------------------------------ | ------------------------------------------------- |
| `db/2026-07-27_01_composition_brands.sql` | `mv_composition_brand` — brands per composition, owner-run so the anon key can read through RLS |
| `db/2026-07-27_02_composition_brands_rpc.sql` | `composition_brands()` — top-N per composition, one round trip |
| `src/data/brandLookup.ts`            | fetch + hand off to `resolveBrands`               |
| `src/data/useBrands.ts`              | per-consultation lookup, session-cached           |
| `src/data/brands.ts`                 | one new fallback tier — `catalogueRank` (see below) |
| `src/components/Suggestions.tsx`     | brand is the headline, composition the subtitle   |
| `scripts/brands.mts`                 | proves the lookup, incl. the RLS path             |

**Why a materialised view rather than a plain one.** `mv_composition_brand` carries `ingredient_count`, and precomputing it is the whole point — see the combination trap below. It also had to be a database object at all: `medicines`, `medicine_composition_map` and `compositions` are RLS-protected with no anon policy, and the sandbox holds only the anon key. A view runs as its owner, so it is the door. **`scripts/brands.mts` asserts the tables themselves are still closed** — if that assertion ever starts failing, the RLS posture changed underneath.

**Refresh obligation:** nothing refreshes it. The catalogue is frozen (§0.4) so it is a one-time build, but a stale materialised view looks exactly like a correct one. `db/README.md` carries the command.

### The combination trap — the real finding of this pass

`medicine_composition_map` maps a combination product to **every one of its ingredients**. So "the brands of aceclofenac" naively includes `Acezen-SP`, which is aceclofenac + paracetamol + serratiopeptidase. **The engine ranked one molecule and the UI would have offered three** — a different prescription, rendered as if it were the ranked one.

It is not a rare edge. Combinations are the *majority* of rows for most compositions:

| composition | rows in `medicine_composition_map` | single-molecule | combination |
| ----------- | ---------------------------------- | --------------- | ----------- |
| doxylamine  | 569    | **7**   | 562    |
| chlorpheniramine | 3,730 | **46** | 3,684  |
| paracetamol | 17,184 | 1,790   | 15,394 |
| aceclofenac | 9,050  | 804     | 8,246  |

Only `ingredient_count = 1` is offered. Combinations are **counted and named as a total** — "8,246 combination products also contain this molecule" — rather than hidden, on the §5 principle that a doctor who cannot see what was withheld cannot disagree with it.

Three compositions are **combination-only**: `trypsin` (970 products, none alone), `oxetacaine` (669), `phenylpropanolamine` (289). All three are currently rule-less, so none is reachable — but the RPC returns a totals-only row for them so the UI can say *rankable, not prescribable* rather than render nothing.

### `catalogueRank` — a new tier in the fallback chain

The chain was `learned → clinic default → most prescribed → alphabetical`. **The last three tiers are all inert against this schema:** there is no popularity column (`prescription_medicines` has 4 rows), no clinic formulary table in v2 (`hospital_medicine_preference` is dead v1 and empty), so with nothing learned every comparison fell through to *alphabetical*, which made **"A 250 Suspension" the face of paracetamol, ahead of Calpol** — and silently discarded the paediatric form ordering along with it.

Pre-sorting the array and relying on `Array#sort` stability does **not** work, because the alphabetical tier is a real comparison, not a tie. So `Medicine.catalogueRank` was added, ranked above alphabetical and below the two evidence tiers, carrying the order the RPC chose:

1. brands this doctor already has history with — otherwise a preference learned on a brand 900 names down the alphabet could never surface it;
2. in a paediatric case, `syrup` / `drops` first;
3. `is_primary`, then name.

**`is_primary` is a weak proxy and should be treated as one.** It is set on only 3,761 of 312,240 rows, all with `medicine_id <= 5833` — an artefact of the original import, not a curated flag. It happens to put Calpol / Crocin / Dolo at the top of paracetamol, which is right, and does nothing at all for aceclofenac, whose top brand is still the alphabetical `A Extra 200mg Tablet SR`. **The honest fix is a real popularity source**, not a better sort.

### Every rankable composition has a brand

The question this pass was asked to answer: **zero.** All 263 medicine intents have brand rows, minimum 16; all 52 rankable ones have at least 7 single-molecule brands. Brand coverage is not the medicine gap — **rule coverage was** (§9.4), and §15 closed it: 177 of 263.

### Brand choice now feeds the model

`resolveBrands` orders brands, and `v_doctor_brand_preference` learns from `decision_log.chosen_medicine_id` — which nothing had ever written. Picking a brand in the expander now records it (and implies the accept, since nobody picks Dolo without prescribing paracetamol). **Only deliberate picks are recorded, never the default**: logging the default as if it were chosen would teach the model to reinforce its own output, the same drift §10a avoids by never logging the personalised score.

* * *

13. Search everywhere, a faster learning threshold, and the quick-list (2026-07-27)

------------------------------------------------------------------------------------

### 13.1 Promotion threshold: 3 → 2

`learn_doctor_rules(p_threshold)` now defaults to **2**. There is no CHECK constraint on the threshold — it lives in the function default and its callers, and `doctor-rules.mts` now asserts the function's *default* rather than only what the script passes, so the two cannot drift apart silently.

The original argument for 3 (§10b) was that one `searched_accepted` can be a mis-tap and two a coincidence, and a doctor-local rule mints a new clinical score. That is still true; 2 just prices it lower. **Every limit that makes the rule safe to learn is unchanged:** weight still capped at 0.5 by CHECK and by the loader clamp, still never safety-critical, a guard still beats it, and with no `doctorId` the ruleset is still byte-identical to the global one.

What genuinely rises is mis-tap risk — two mis-taps in one signal context now mint a rule where three were needed. That is recoverable (delete the row) and visible (`source = 'learned'`), which is why it is a tuning change and not a safety one.

### 13.2 The case that proves it — antibiotic for fever with chills

A named section in `scripts/scenarios.mts`, not a one-off. It was chosen because it is the layer's **hardest** case, not its easiest: antibiotic overprescription in undifferentiated fever is the most plausible bad habit this system could learn and then amplify.

No global rule points `FEVER` / `HIGH_FEVER` / `RIGORS` at any antibiotic — deliberately, per §7. The scenario simulates one doctor searching past the list and prescribing azithromycin, and asserts, in order:

| | |
| - | - |
| 0 | the global ranking offers **no** antibiotic here — the premise, checked rather than assumed |
| 1 | after **one** search, azithromycin still does not rank |
| 2 | at the **second**, a rule appears and it ranks — attached to `HIGH_FEVER` (idf 2.2), the rarest signal in context, not `FEVER` |
| 3 | it persists on the next consultation |
| 4 | Dr F is untouched: no rule, no azithromycin, and their **whole top-5 is identical to the global one** |
| 5 | with `dengue_suspected` ticked it is **hard-warned** — it still ranks, its learned score is intact, and the guard's reason is attached (this assertion was inverted by §14; it used to read *blocked*) |
| 6 | teach the same doctor cefixime too and **one** guard row catches both |
| 7 | **the promotion ceiling (§14):** a doctor who repeats the same prescription on five consecutive *dengue-suspected* patients is never promoted at all — and can still reach the drug by search, with the warning, on every one of them |

The signal context stored on each simulated row is computed from a real engine run, not hardcoded — `learn_doctor_rules` groups on that array, so a hand-typed context that drifted would make the whole proof vacuous by never grouping.

### 13.3 What had to be built to make (5) true

There was no dengue guard, so this pass authored one: a `DENGUE_SUSPICION` signal (idf 2.800), a `dengue_suspected` chip, six rules (NS1, CBC, IgM/IgG, the Dengue fever finding, two advice), an **`antibiotic` intent class** of 33 systemic antibacterials, and one guard between them.

**Three judgement calls, flagged rather than buried:**

* ~~**`block`, not `warn`.**~~ **Reversed the same day — see §14.** The original reasoning: §4 says warn when the system would otherwise be guessing, and here it is not guessing, because `DENGUE_SUSPICION` is only ever active because the doctor ticked a chip saying so. The paragraph then flagged its own cost — *"a dengue patient with a concurrent bacterial infection does need an antibiotic and this hides it. Flipping to `warn` is one word in one row."* That flag is what got pulled. The row is now `warn_hard`: the doctor is stopped and made to read the reason, and then prescribes if they judge it right. **The guard being certain about the dengue was never the same thing as it being certain about the antibiotic.**
* **A new signal, not a reused one.** Guards are single-signal (§8.4) and dengue suspicion is a conjunction. Reusing `BLEEDING_GUMS` would have been actively wrong — gingivitis is treated *with* metronidazole, so that guard would block the correct prescription. Same class of error as §3.1.
* **Two exclusions from the class**, in the spirit of aspirin being kept out of `nsaid`: **rifampicin** (antitubercular — blocking TB treatment over a dengue suspicion is a worse error than the one being prevented) and **chloramphenicol** (ophthalmic in this catalogue; compositions carry no route, §2.3).

`DENGUE_SUSPICION` is given rules, unlike `PREGNANCY` and `PEDIATRIC`. Those are pure context flags; a clinical *suspicion* should want confirmation. Conservative per §11 — tests, a finding and advice, no drugs.

### 13.4 Search on every intent type

`resolveBrands` was wired in on the same day (§12); `searched_accepted` had the same problem — `decisions.ts` had supported it since §10b and **nothing in the UI had ever written one.**

Every one of the six types now carries its own search (`src/components/IntentSearch.tsx`), and **every type section renders even when empty**, because a ranking that decides what is even reachable is the opposite of §0.3. Picking from any of them writes the same `searched_accepted` row — an exercise the ranking missed is exactly as much of a miss as a medicine. `scripts/search-and-frequent.mts` asserts all six types, and asserts the §10b promotion loop fires on a **non-medicine** intent, which is where a medicine-only assumption would have hidden.

Two deliberate rules in the search:

* **Picking something already ranked is an accept, not a miss.** Recording it as a miss would teach §10b the ranking failed when it did not, and mint a doctor-local rule for something already globally ruled.
* ~~**Blocked intents are excluded from the search pool.**~~ **Reversed by §14.** The rule was that a guard is a gate, not a ranking opinion, so letting search re-add something a guard withheld would route around the safety layer. Nothing is withheld now: guarded intents that score are *in* the ranked list and excluded by the ordinary "already on screen" rule, and a guarded intent that never scored is deliberately reachable. The safety layer it must not route around is the *reason*, not the availability — so `guardFor` computes the verdict for every out-of-list pick and it renders at full strength on the card. Reachable and explained, rather than withheld and explained.

### 13.5 The quick-list — `v_doctor_frequent_medicine`

**Deliberately the dumbest thing in the system.** A count of what this doctor prescribes, ordered by that count. No decay, no consistency, no confidence, no context key, no scoring — and it never reads a signal or the current consultation. It renders outside the `anyInput` branch precisely so that independence is visible.

It is a fourth thing, distinct from the three that already exist:

| | keyed on | learns | scope |
| - | - | - | - |
| `v_doctor_preference` | doctor + intent + **signal context** | consistency × confidence × decay | per doctor |
| `v_doctor_brand_preference` | doctor + composition + medicine + form | same maths, confidence constant 0.5 | per doctor |
| `intent_companions` | intent → intent | **nothing — authored** | **global, clinical** |
| `v_doctor_frequent_medicine` | doctor + intent | a count | per doctor |

**It is not `intent_companions`, and the UI wording carries that difference.** Companions are a pharmacological pairing — an NSAID rides with a PPI for every doctor on earth. The quick-list is one person's habit and means nothing to anyone else. Telling a doctor their personal shortlist was clinical advice would be the worst possible conflation, so the panel says *"your own history · not a suggestion"* and states that it does not read the consultation.

A quick-list that reordered itself by a model would be a fourth ranking to second-guess. Predictability is the entire value; `usual_brand` (statistical mode of `chosen_medicine_id`) makes the shortcut land on a prescription rather than a molecule.

* * *

15. Medicine rule coverage (2026-07-27)

--------------------------------------

**§9.4's "largest remaining data gap", closed.** 52 of 263 medicine intents had a rule; 177 do. Rules went 850 → **1,099**, and the medicine share went 105 → **354** — from a fifth of the test count to level with it.

| | before | after |
| ------------------------ | ---- | ----- |
| medicine intents with a rule | 52 / 263 (20%) | **177 / 263 (67%)** |
| active rules              | 850  | 1,099 |
| rules pointing at a medicine | 105 | 354  |
| `intent_guards`           | 12   | 14    |
| guarded-class memberships | 63   | 71    |

### The order of the migration is the finding

`db/2026-07-27_07_medicine_rule_coverage.sql` widens guard classes **before** it authors a single rule, because §4's lesson — *"rules and guards are added together or the safety layer silently lags the knowledge layer"* — turned out to have eight live instances:

| drug | family | gate it was missing |
| ---- | ------ | ------------------- |
| etodolac, lornoxicam | NSAID | `nsaid` — so no PREGNANCY warning |
| chlorzoxazone, tizanidine | muscle relaxant | `muscle_relaxant` — no PREGNANCY or PEDIATRIC warning |
| roxithromycin, rifaximin | systemic antibacterial | `antibiotic` — no DENGUE_SUSPICION warning |
| itraconazole, doxycycline | teratogenic | `pregnancy_contraindicated` — no gate at all |

Every one was harmless while it was rule-less. Authoring the rules first would have put an NSAID and a muscle relaxant in front of a pregnant patient with nothing attached. **The check that found them is one SQL query and it should be run before every future drug batch.**

Two **new guards** were needed for drugs that are the only member of their family here, so a class would have been a taxonomy of one:

* `PEDIATRIC` → doxycycline — tooth and enamel damage under 8.
* `PEDIATRIC` → aspirin — Reye's syndrome. §4 deliberately keeps aspirin *out* of the `nsaid` class (low-dose aspirin is prescribed in pregnancy, and `compositions` carries no dose to tell the two uses apart). That exclusion is still right, but it means aspirin sat in no gate at all — and this pass gave it its first rule, so it needed its own row.

### What was authored

Roughly 125 drugs across: respiratory (mucolytics, bronchodilators, inhaled and nasal steroids, decongestants), antihistamines, GI (acid suppression, prokinetics, laxatives, probiotic), oral antibiotics, topical and ophthalmic anti-infectives, antifungals, antiparasitics, NSAIDs and analgesia, OA adjuncts, muscle relaxants, proteolytic enzymes, corticosteroids, cardiovascular (antihypertensives, diuretics, antianginal, antiplatelet), nine oral antidiabetics, thyroxine, neuropathic-pain agents, urology, dermatology and supplements.

Weights stay in the established 0.20–0.55 medicine band and **nothing outranks the existing leaders** — paracetamol `FEVER` 0.75, metformin `HIGH_BLOOD_GLUCOSE` 0.55, amlodipine `HIGH_BP` 0.40 — because those are the drugs that should lead.

**§7's symmetry rule was applied literally**, including to an existing intent: fexofenadine carried 2 rules where cetirizine and levocetirizine carried 6–7. That is the pantoprazole-vs-the-other-PPIs artefact §7 describes, and it was corrected rather than left crooked. lansoprazole completing the PPI class is the same fix on the other side.

### Two rules worth singling out

* **Aspirin is scoped to `CHEST_PAIN_TYPICAL`, never plain `CHEST_PAIN`.** §3.1's rule — a signal reachable from two different pictures must not carry a rule specific to one — applied to a drug rather than a body region. Plain `CHEST_PAIN` is reachable from reflux and musculoskeletal presentations, and an antiplatelet on it would appear in every chest complaint. Asserted both ways in `medicine-coverage.mts`.
* **The dry/productive cough split.** There is no `COUGH_DRY` signal — the dry-cough chip feeds plain `COUGH` — so the antitussive takes the generic signal and the mucolytics take `COUGH_PRODUCTIVE`. When both fire, additive scoring puts the mucolytic ahead, which is the right answer without needing a signal that would not earn its keep (§11.4).

### Deliberately left rule-less — 86 intents

Carried over by explicit instruction and unchanged: **erectile difficulty**, **menorrhagia**, and **everything psychiatric**. amitriptyline and nortriptyline are skipped *with* the psychiatric group: low-dose TCAs are legitimate for neuropathic pain, but `compositions` carries no dose (§2.3) and cannot separate that from antidepressant use — pregabalin, gabapentin and methylcobalamin cover the indication without the ambiguity.

New skips, each for a stated reason (full list in the migration footer):

* **antimalarials** — the correct output for fever with rigors is the malaria *test*, which already ranks. Prescribing an artemisinin off a fever chip is the §13.2 failure mode with a resistance cost attached.
* **antituberculars** — programme-managed, never started from a symptom chip.
* **antiepileptics** — a neurologist's decision, and valproate is a major teratogen.
* **anticoagulants** — need an indication and monitoring the catalogue cannot represent.
* **parenteral / inpatient antibiotics** (carbapenems, antipseudomonals, aminoglycosides, linezolid, the injectable cephalosporins) — an OPD symptom chip is not evidence for a carbapenem, and suggesting one is how a ranking teaches bad stewardship.
* **not prescribable alone** — clavulanic acid and sulbactam are never single agents; **combination-only** compositions (trypsin, oxetacaine, phenylpropanolamine) were measured in §12 as having no single-molecule product, so a rule would surface a card that cannot be filled.
* **specialist-initiated** — methotrexate, tacrolimus, isotretinoin, donepezil, clomiphene, nandrolone, trihexyphenidyl, iron sucrose, timolol, acetazolamide.
* **obstetric hormones** — same reasoning as menorrhagia: needs a cause and a gestational age first.
* **codeine** (abuse potential; dextromethorphan covers it) and **formoterol** (LABA monotherapy carries a black-box warning and "only with an inhaled steroid" is not expressible).

### Two catalogue gaps this pass surfaced, flagged not fixed

* **No lipid signal.** atorvastatin, rosuvastatin and fenofibrate are left rule-less because nothing in the vocabulary means "dyslipidaemia". The honest fix is a signal, not a stretched rule onto `CLAUDICATION`. Same class of gap as the missing `OBESE` signal (§8.3).
* **nicotinamide and niacinamide are the same molecule** under two compositions. Only niacinamide is ruled. This is the §8.1 duplicate problem repeating in the drug catalogue; deactivating one is a review call.

### Verification

`scripts/medicine-coverage.mts` is new and asserts the three things this pass could plausibly have broken: **guard reach** (every newly-classed drug hard-warns in its family's picture, and the deliberate non-members — ketoconazole, chloramphenicol — still do not), **no leaks** (no steroid in a stroke or pneumonia, no antiplatelet in reflux, no antibiotic in an undifferentiated viral URI), and **no rank burial** (a test still outranks the first medicine in diabetes; findings still lead in hypertension; Emergency still leads cauda equina and stroke). 40 checks, all passing.

Both §6 baselines reproduce byte-identically. `scenarios.mts` (31 consultations + companions + doctor-local rules + the §14 ceiling), `doctor-rules.mts`, `search-and-frequent.mts`, `brands.mts`, `personalization.mts` and `brand-preference.mts` all pass; `tsc --noEmit` is clean. **Still un-reviewed by a clinician (§8.10) — and this pass grew the rule base by 29%, so the risk grew with it.**

* * *

14. Guards warn, they never hide — and the one ceiling that stays absolute (2026-07-27)

----------------------------------------------------------------------------------------

**This is a philosophy change, not a tuning tweak.** Sections 4, 5, 10a, 10b, 12 and 13 were all written against a system in which a guard could hide a suggestion. It cannot any more. Where an older paragraph says *blocked*, *withheld* or *held back*, this section is what actually happens now.

### The policy, in one line

> **Guards constrain ranking absolutely. They constrain the doctor never.**

Both halves are load-bearing and they pull in opposite directions on purpose. Enforce only the first and the system starts overruling clinicians. Enforce only the second and a doctor can teach the ranking to route around a contraindication.

### What changed — the doctor-facing half

`intent_guards.action` was `block` (hidden) or `warn` (shown with the reason). It is now `warn` or `warn_hard`. **There is no hiding action, and the CHECK constraint no longer permits one.** The seven rows that were `block` — cauda equina/exercise, pregnancy/NSAID, pregnancy/muscle-relaxant, pregnancy/`pregnancy_contraindicated`, paediatric/muscle-relaxant, paediatric/nimesulide, and the dengue/antibiotic guard authored the same week — became `warn_hard`. **Signal, target, class and reason text are byte-identical on every one.** The migration is `db/2026-07-27_06_guards_warn_only.sql`.

A `warn_hard` intent is:

* **in the ranked list**, at its real score, in its real position;
* **red**, bordered, and headed *"Contraindicated — read before prescribing"*, visibly worse than the amber note a soft `warn` gets;
* **not prescribable until acknowledged.** The accept button is present and disabled; the brand picker is withheld; a click on *"I've read this — prescribe anyway"* releases both. Acknowledgment is per-consultation and reversible, and un-acknowledging withdraws the accept it permitted;
* **listed in a non-collapsible panel at the top** of the suggestions, naming each item, its reason, and whether it has been read;
* **blocking the close of the consultation** while any hard-warned intent the doctor is actually prescribing is still unread — the second half of the gate, for intents reached by search or the quick-list, which have no accept button to lock.

### Why

§0.3 has always said *Synapse suggests and ranks. It never decides.* A hidden option is a decision the system took on the doctor's behalf and did not tell them about. Every one of the seven blocks had a real clinical case behind it that the block got wrong:

* the dengue guard hid antibiotics from a dengue patient with a concurrent bacterial infection — a case §13.3 named as a known cost when it was authored, and proposed fixing with exactly this one-word change;
* pregnancy has legitimate NSAID and muscle-relaxant indications, decided by trimester and severity, neither of which this catalogue can see;
* a cauda equina patient is rehabilitated eventually, by the same physiotherapist using the same catalogue;
* paediatric dosing is a judgement about weight and formulation, not an impossibility.

And the old presentation was weaker than it looked. A blocked item lived in a collapsed *"N suggestions held back for safety"* drawer, greyed and struck through. **A hard warning is louder than that block was** — it sits in the list, in red, with a required click, and the doctor can act on it.

**What is not lost:** nothing about the reason, the signal, the class, or the fact that a guard fired. `scripts/scenarios.mts` still prints which guards fire in which consultation; it says HARD WARN instead of BLOCKED.

### What changed — the ranking half

With blocks gone, **the promotion check in `learn_doctor_rules` is the only place left in the system where a guard is absolute**, so it is now written down rather than assumed.

    -- inside learn_doctor_rules, between `recurring` and `driver`
    eligible as (
      select r.* from recurring r
      where not exists (
        select 1 from intent_guards g
        join intents i on i.id = r.intent_id
        left join intent_class_map m on m.intent_id = r.intent_id
        where g.is_active
          and g.signal_id = any (r.signal_context)
          and (g.target_type = i.type
            or g.target_intent_id = r.intent_id
            or g.target_class_id  = m.class_id)))

**Repetition can surface something that was simply unranked. It must never surface something that is guarded.** There is no repetition count at which this changes: `searched_accepted` events inside a guarded picture accumulate in `decision_log` and promote nothing, forever.

**The check is against the recurring signal context, not the driver signal alone** — and note that "guarded" is a property of a *picture*, not of a molecule. Azithromycin carries a dengue guard, but a doctor prescribing it for plain fever is not being warned about anything, and that promotion is allowed; the guard then fires as a hard warning if dengue is later ticked. Checking the whole context rather than just the driver is the conservative side of that line: the driver is the rarest signal in the context, so a learned rule can fire in pictures the doctor never taught it in, and refusing whenever the guard was live in the circumstance being learned from cannot be gamed by which signal wins the idf tie-break.

**The doctor loses nothing to this ceiling.** The intent stays in the catalogue and out of the ranking — which is the definition of *in the search pool*. They can reach it by search on every one of those consultations, see the same hard warning, acknowledge it and prescribe. What they cannot do is teach the ranking to volunteer it inside a guarded picture.

### Three consequences that had to be made explicit

Each of these used to hold *structurally*, because guards hid things. They now hold only because something says so:

1. **`personalize()` skips hard-warned intents**, alongside safety-critical ones. §10a's first limit said a guard could never be personalised away because `personalize` never saw `result.blocked`. It sees them now, so a doctor's habit could otherwise promote something a guard is warning about. `src/data/personalize.ts`.
2. **Search no longer excludes anything for safety.** §13.4 kept blocked intents out of the search pool so that search could not route around the safety layer. Guarded intents are *in* the ranked list now, so the ordinary "already on screen" rule covers them, and anything guarded that never scored stays reachable — deliberately. What search must not do is reach them *silently*, so `guardFor` in `App.tsx` computes the verdict for every out-of-list pick and `SearchedCard` renders it at full strength.
3. **`decision_log.outcome` lost `blocked` and gained `override_accepted`** — an accept of a hard-warned intent. It is not a plain `accepted` because `v_doctor_preference` reads accepted/skipped, and an override must not teach the preference model to promote something a guard is warning about. The prescription happens; only the learning is withheld. `blocked` had zero rows, so it went rather than lingering as an outcome nothing can produce.

### `guardIntent` is now exported from the engine

§10b flagged a *"known maintenance point"*: `companions.ts` re-implemented the engine's private `applyGuards` from the same `Ruleset` data and the two had to stay in lockstep. Search picks needed the same predicate, which would have made three copies. `guardIntent(rs, activeSignals, intent)` is exported instead and the mirror is deleted.

This is not a specialty leak (§0.1). It reads `rs.guards` and `rs.intentClasses` and still has no idea what any of it means; only its visibility changed. `EngineResult.blocked` is gone, replaced by `hardWarned` — the *same objects* as the matching entries in `intents`, not copies, so there is no second list to keep in sync.

### Verified

`scripts/scenarios.mts` section 7 is the regression the policy demanded. Dr I searches past the list and prescribes azithromycin on **five consecutive dengue-suspected patients** — well past the threshold of 2, and past the 3 it used to be — and the assertions run after every single one:

| | |
| - | - |
| 1–5 | after each of five guarded consultations: **still not promoted** |
| | it never entered Dr I's ranked list |
| | it is still in the catalogue and out of the ranking — i.e. still in the search pool |
| | searching for it returns a **hard warning**, not a refusal, carrying the guard's own reason |
| | the same doctor, same drug, in an **unguarded** picture promotes on the second consultation — proving the refusal is the guard, not a dead layer |
| | and that learned rule, carried back into the dengue picture, shows as a hard warning rather than a removal |

`doctor-rules.mts` §5 is the same ceiling in isolation on a different guard (paediatric/nimesulide, six searches). Both §6 baselines reproduce unchanged — the cauda equina exercises now rank at 0.66 and below, under *Mechanical low back pain* at 0.94, each carrying its hard warning. `personalization.mts`, `brand-preference.mts`, `brands.mts` and `search-and-frequent.mts` all pass; `tsc --noEmit` is clean.

### The open question this leaves

**Alert fatigue is now the risk, and it is a real one.** Seven hard warnings across twelve guards is a reasonable ratio today because the guard set is small and every one of them is genuinely serious. It stops being reasonable the moment `warn_hard` becomes the default for anything a rule author feels uneasy about. The §4 test is the defence: hard-warn only what should make a doctor stop, and let everything else be a soft `warn`. If a doctor starts clicking through acknowledgments without reading them, the guard set is wrong — not the mechanism.

* * *

16. Migrating into the main codebase (2026-07-28)

---------------------------------------------------

The sandbox has done its job. The engine and the data layer move to the main codebase; the sandbox UI does not. This section is the packing list.

The thing that makes this less obvious than "copy two folders" is that **a small amount of UI-adjacent code is not UI.** The engine speaks in slugs, ids, types and signal tokens. None of that renders. Four maps stand between the engine's vocabulary and something a doctor can read, and they were built in the sandbox because that is where the catalogue was exercised. Leave them behind and the new UI reinvents them worse — an alphabetical list of 373 chips, `medicine` as a section header, blood pressure as one field. They are reproduced in full below so this document alone is enough.

### What moves

| From the sandbox | Where it goes | Notes |
| ---------------- | ------------- | ----- |
| `S_docs/Synapse engine.ts` | wherever `@engine` resolves | Pure scoring. Its only dependency is a `{ from(table) }`-shaped client, so it takes the main codebase's Supabase client unchanged. Zero medical knowledge, zero React. |
| `src/data/*` — all ten files | a `data/` peer of the engine | The data layer: ruleset loading, personalisation, brands, companions, decision logging, the quick-list. Only `useSynapse.ts` and `useBrands.ts` are React (two hooks); the other eight are plain functions. |
| `db/*.sql` | reference only | **Already applied to `arenod` (`ieimvjprtltancxapuzg`).** Same Supabase project, same tables. Do not re-run the migrations and do not re-seed the catalogue dumps. They travel as a record of what is live, nothing more. |
| `scripts/*.mts` | recommended | The regression suite (§8 baselines, 31 scenarios, guard reach, drug leaks, rank burial). It is the only thing that will tell you the migration did not quietly change behaviour. Run all seven after the move. |
| `exports/medicine-rules-review.{csv,md}` | wherever clinical review happens | The 354 medicine rules grouped by clinical area, for §9.1. Regenerate with `scripts/export-medicine-review.mts`. |

### What stays behind

`src/App.tsx`, `src/components/*`, `src/ui/icons.tsx`, `src/index.css`, `src/main.tsx`. Sandbox presentation, written to prove the engine, not to ship.

**One caveat before deleting it.** `Suggestions.tsx` is where §14 is actually enforced in the interface — the hard-warning styling, the acknowledgment gate that makes a `warn_hard` intent unprescribable until its reason is read, and the summary panel that replaced "N suggestions held back". The markup is disposable. **The behaviour is not**, and it does not live anywhere else. Read §14 and the "what the new UI must honour" list below before rebuilding that screen, or the safety layer silently degrades to a tooltip.

### Translator 1 — the chip picker (symptoms, findings, history)

`src/data/search.ts`, verbatim. This is the symptom and finding list: how ~373 chips are searched, grouped into body systems, and routed to the right zone of the consultation. `SYSTEM_ORDER` and `SYSTEM_LABEL` have no database equivalent — `observables.system` holds the bare key (`ent`, `neuro`), and the ordering and the human labels are here and only here.

```ts
import type { Observable } from './useSynapse'

// One ranking function, used by both the zone fields and the command palette,
// so a chip that is easy to find in one is equally easy to find in the other.
// search_text carries the colloquial terms (e.g. "nazla" for blocked nose) and
// must rank before a slug match.
export function rank(o: Observable, q: string): number {
  const label = o.label.toLowerCase()
  if (label.startsWith(q)) return 0
  if (label.includes(q)) return 1
  if ((o.searchText || '').toLowerCase().includes(q)) return 2
  if (o.slug.includes(q)) return 3
  return 99
}

// Body-system grouping for the picker. The engine has no concept of a system —
// this is the same status as `domains`, purely how the catalogue is browsed.
//
// It exists because a flat alphabetical list works at 117 chips and does not
// work at ~370: with no query, the doctor was shown the first 40 chips
// alphabetically, which is not a catalogue, it is an accident.
export const SYSTEM_ORDER = [
  'general', 'infection', 'respiratory', 'cardiovascular', 'gastrointestinal',
  'neuro', 'ent', 'eye', 'urinary', 'gynaecology', 'andrology',
  'musculoskeletal', 'skin', 'endocrine', 'allergy', 'psychiatry',
  'paediatrics', 'history',
] as const

export const SYSTEM_LABEL: Record<string, string> = {
  general: 'General',
  infection: 'Infection patterns',
  respiratory: 'Respiratory',
  cardiovascular: 'Cardiovascular',
  gastrointestinal: 'Gastrointestinal',
  neuro: 'Neurological',
  ent: 'ENT & mouth',
  eye: 'Eyes',
  urinary: 'Urinary',
  gynaecology: 'Gynaecology',
  andrology: 'Male reproductive',
  musculoskeletal: 'Musculoskeletal',
  skin: 'Skin',
  endocrine: 'Endocrine',
  allergy: 'Allergy',
  psychiatry: 'Mental health',
  paediatrics: 'Paediatric',
  history: 'History & risk',
}

const SYSTEM_RANK = new Map(SYSTEM_ORDER.map((s, i) => [s as string, i]))

export interface SystemGroup {
  system: string
  label: string
  items: Observable[]
}

/**
 * Bucket already-ranked results by system, preserving the incoming rank order
 * inside each bucket. Groups appear in SYSTEM_ORDER so the list reads the same
 * way every time — a picker whose section order moves under you is worse than
 * no sections at all.
 */
export function groupBySystem(results: Observable[]): SystemGroup[] {
  const buckets = new Map<string, Observable[]>()
  for (const o of results) {
    const key = o.system || 'general'
    const list = buckets.get(key)
    if (list) list.push(o)
    else buckets.set(key, [o])
  }
  return [...buckets.entries()]
    .sort((a, b) => (SYSTEM_RANK.get(a[0]) ?? 99) - (SYSTEM_RANK.get(b[0]) ?? 99))
    .map(([system, items]) => ({ system, label: SYSTEM_LABEL[system] ?? system, items }))
}

/** Rank-filter a pool against a query. Empty query returns the pool alphabetically. */
export function searchChips(pool: Observable[], query: string, limit = 40): Observable[] {
  const q = query.trim().toLowerCase()
  const scored = q
    ? pool.map((o) => ({ o, r: rank(o, q) })).filter((x) => x.r < 99)
    : pool.map((o) => ({ o, r: 0 }))
  scored.sort((a, b) => a.r - b.r || a.o.label.localeCompare(b.o.label))
  return scored.slice(0, limit).map((x) => x.o)
}

// Which zone a chip belongs to. The engine has no concept of zones — this is
// purely how the consultation is laid out, and it is what lets the command
// palette accept any chip and route it without the clinician choosing a target.
export type Zone = 'patient' | 'reported' | 'examined'

export const ZONE_OF: Record<Observable['kind'], Zone> = {
  history: 'patient',
  symptom: 'reported',
  finding: 'examined',
}

export const ZONE_LABEL: Record<Zone, string> = {
  patient: 'Patient',
  reported: 'Reported',
  examined: 'Examined',
}

// Age is entered as a number and injected as a measurement, which is what fires
// ELDERLY / PEDIATRIC. These two chips map to the same signals, so once an age
// is present they are derived from it rather than set by hand — otherwise a
// 34-year-old can be marked elderly and both are "true" at once.
export const AGE_DERIVED: Partial<Record<string, (age: number) => boolean>> = {
  elderly: (age) => age >= 65,
  pediatric: (age) => age < 12,
}
```

**`kind` is the symptom/finding split.** `observables.kind` is one of `symptom`, `finding`, `history`; `ZONE_OF` turns that into the three zones of the consultation. The sandbox filters `inDomain.filter(o => o.kind === 'symptom')` and `=== 'finding'` to build the two lists. There is no separate symptoms table — symptoms and findings are the same table distinguished by `kind`, and that is deliberate: a chip can be reported by the patient or observed on examination without becoming two rows.

### Translator 2 — intent types

`src/ui/intentType.tsx`, minus the icon imports (the main codebase will have its own icon set — keep the shape, swap the components). `TYPE_ORDER` is the reading order of a consultation and is a clinical decision, not a style one: what could this be, what confirms it, who else should see it, then management.

```ts
import type { IntentType } from '@engine'

interface TypeMeta {
  /** tag shown on a single suggestion */
  label: string
  /** how a doctor reads the action */
  verb: string
}

export const TYPE_META: Record<IntentType, TypeMeta> = {
  finding:  { label: 'Possible finding', verb: 'Consider' },
  test:     { label: 'Investigation',    verb: 'Order' },
  referral: { label: 'Referral',         verb: 'Refer' },
  medicine: { label: 'Medication',       verb: 'Prescribe' },
  exercise: { label: 'Exercise',         verb: 'Prescribe' },
  advice:   { label: 'Advice',           verb: 'Advise' },
}

// The order suggestions are grouped in when a doctor scans the page: what could
// this be, what confirms it, who else should see it, then management.
export const TYPE_ORDER: IntentType[] = [
  'finding', 'test', 'referral', 'medicine', 'exercise', 'advice',
]
```

Never show the raw `type` value. `medicine` as a heading is a database column leaking onto a doctor's screen.

### Translator 3 — measurement inputs

`src/data/measures.ts`, verbatim. The engine only ever receives `{ measureKey, value }`; every label, unit, range and grouping is here. Two traps are encoded in this file and both are covered in §2.4 — **blood pressure is one control but two measurements**, and **AGE is deliberately absent** because it is patient context injected on every run, not a field.

```ts
export type Specialty = 'opd' | 'physio'

export interface MeasureDef {
  key: string
  label: string
  unit: string
  /** which specialty views surface this input */
  show: Specialty[]
  group: 'vitals' | 'labs' | 'physio'
  min?: number
  max?: number
  step?: number
  /** short helper shown under the field, e.g. a threshold hint */
  hint?: string
}

// Blood pressure is one control but TWO measurements. If the app ever writes a
// single "170/100" it silently never fires a signal (§2.4). We emit BP_SYS and
// BP_DIA as separate rows, always.
export const BP_SYS = 'BP_SYS'
export const BP_DIA = 'BP_DIA'

export const MEASURES: MeasureDef[] = [
  { key: 'HR', label: 'Heart rate', unit: 'bpm', show: ['opd'], group: 'vitals', min: 20, max: 250 },
  { key: 'SPO2', label: 'SpO₂', unit: '%', show: ['opd'], group: 'vitals', min: 50, max: 100 },
  { key: 'TEMP', label: 'Temperature', unit: '°C', show: ['opd'], group: 'vitals', min: 34, max: 43, step: 0.1 },
  { key: 'RR', label: 'Respiratory rate', unit: '/min', show: ['opd'], group: 'vitals', min: 5, max: 60 },
  { key: 'GLUCOSE_RANDOM', label: 'Random glucose', unit: 'mg/dL', show: ['opd'], group: 'labs', min: 20, max: 800 },
  { key: 'GLUCOSE_FASTING', label: 'Fasting glucose', unit: 'mg/dL', show: ['opd'], group: 'labs', min: 20, max: 800 },
  { key: 'HBA1C', label: 'HbA1c', unit: '%', show: ['opd'], group: 'labs', min: 3, max: 18, step: 0.1 },

  { key: 'PAIN_VAS', label: 'Pain', unit: '/10', show: ['physio'], group: 'physio', min: 0, max: 10 },
  { key: 'ROM_PCT', label: 'Range of motion', unit: '%', show: ['physio'], group: 'physio', min: 0, max: 100, hint: 'Achieved ÷ expected' },
  { key: 'MMT', label: 'Muscle power (MMT)', unit: '/5', show: ['physio'], group: 'physio', min: 0, max: 5 },
  { key: 'GRIP_KG', label: 'Grip strength', unit: 'kg', show: ['physio'], group: 'physio', min: 0, max: 100 },
]

/**
 * Every measure key a specialty actually shows. Blood pressure is surfaced in
 * both views (physio needs it for exercise safety), so it is always included.
 * Used to discard values the doctor can no longer see after switching view —
 * an invisible input that still feeds the engine is a silent wrong answer.
 */
export function visibleMeasureKeys(specialty: Specialty): Set<string> {
  const keys = new Set<string>([BP_SYS, BP_DIA])
  for (const m of MEASURES) if (m.show.includes(specialty)) keys.add(m.key)
  return keys
}

/** Ordered groups for a specialty, ready to render. */
export function measureGroups(specialty: Specialty) {
  const groups: { key: MeasureDef['group']; title: string; items: MeasureDef[] }[] = [
    { key: 'vitals', title: 'Vitals', items: [] },
    { key: 'labs', title: 'Bedside labs', items: [] },
    { key: 'physio', title: 'Physical measures', items: [] },
  ]
  for (const m of MEASURES) {
    if (!m.show.includes(specialty)) continue
    groups.find((g) => g.key === m.group)!.items.push(m)
  }
  return groups.filter((g) => g.items.length > 0)
}
```

### Translator 4 — the `Observable` shape and the query that fills it

From `src/data/useSynapse.ts`. `search.ts` is typed against this, so it travels with it. Note `system` defaulting to `'general'` — a null there must not become an unlabelled group.

```ts
export interface Observable {
  id: number
  slug: string
  label: string
  kind: 'symptom' | 'finding' | 'history'
  domains: Specialty[]
  searchText: string
  /** body-system grouping for the picker. UI only — the engine never reads it. */
  system: string
}

const { data } = await supabase
  .from('observables')
  .select('id, slug, label, kind, domains, search_text, system')
  .eq('is_active', true)

const observables: Observable[] = (data ?? []).map((o) => ({
  id: o.id,
  slug: o.slug,
  label: o.label,
  kind: o.kind,
  domains: (o.domains ?? []) as Specialty[],
  searchText: o.search_text ?? '',
  system: o.system ?? 'general',
}))
```

`useSynapse.ts` also loads the ruleset, the signal labels (`signalId -> human label`, for the "why this ranked" explanation), rule-coverage sets, and the three learned models. Copy the hook whole; it is the single load point and everything downstream assumes it.

### What the new UI must honour

Rebuilding the screens is free. These behaviours are not, because each one is a decision that was argued for somewhere above and none of them is enforced by the engine:

1. **No guard ever hides a suggestion (§14).** A `warn_hard` intent is shown, styled as a red flag, and prescribable only after the doctor acknowledges the reason. There is no hiding action in the system and there must never be one.
2. **Search reaches everything (§13.4, §14).** All six intent types, including guarded ones — but an out-of-list pick must compute and render its guard verdict at full strength, never silently.
3. **A searched accept is not an accept.** `searched_accepted` says the ranking *missed*; `override_accepted` says a hard warning was overridden. Neither feeds `v_doctor_preference`. Writing either as a plain `accepted` corrupts the learning layer — see §10a and §14.
4. **Rank order is the engine's, not yours.** Personalisation already reordered the list (§10a) before the UI sees it. Re-sorting in a component throws that away.
5. **Findings are intents.** Confirming one writes it back as an observation and re-runs the engine. One pipeline, run twice — not a separate "diagnosis" screen.
6. **Brands are a lookup after ranking (§12).** The engine ranks compositions. Never rank a brand.
7. **Show a molecule with no brand as the molecule**, not as an error and not as an omission.

### Migration checklist

1. Copy `Synapse engine.ts` and `src/data/*`; point `@engine` and `@/lib/supabase` at their new homes.
2. Copy the four translators above into the new codebase's own UI layer.
3. Confirm `.env` carries `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` for **`arenod`**. Do not create a second project.
4. Run nothing in `db/`. It is already applied.
5. Run all seven scripts in §8 — `verify`, `scenarios`, `doctor-rules`, `brands`, `search-and-frequent`, `medicine-coverage`, `personalization`. All must pass before a line of new UI is written. If they pass in the main codebase, the migration is correct by definition; nothing else proves that.
6. `tsc --noEmit` clean.
7. Then rebuild the UI, against the seven rules above.

**Still open after the move, unchanged by it:** §9.1 — 1,099 rules, none clinically reviewed. Migrating does not make that less true, and the medicine export exists to start it.

* * *

10. The test for every future decision

--------------------------------------

> Does this keep the engine unaware of specialties?

Adding dentistry should mean: new chips (data), new rules (data), one renderer (isolated code). **Zero engine changes.**

* * *

Terminology
-----------

* **Observable** — a pickable input chip (symptom, finding, history)
* **Signal** — standardised input token; the engine's vocabulary
* **Intent** — a scored, typed output suggestion
* **Class** — a group of intents, used only for gating
* **Guard** — a contraindication warning on an intent, class, or type. `warn` (a note) or `warn_hard` (red, and prescribable only after the doctor acknowledges it). It never hides anything from the doctor, and it absolutely bars the *ranking* from learning to volunteer that intent (§14)
* **Engine** — the scoring function; contains no medical knowledge
* **Renderer** — plugin code that draws intents of one type
