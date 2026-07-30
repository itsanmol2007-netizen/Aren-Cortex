# Confirmed conditions as durable input — investigation

*Findings and a proposed approach. Nothing in this document is built yet.*

Investigated: 2026-07-30 · Branch `master` · Live DB `arenod` (`ieimvjprtltancxapuzg`)

**The ask.** Confirming a Possible Condition today only accepts it as an output
of this consultation. It should instead become a durable fact about the patient
— visible in History/Context on this and every future visit — and it should
rerank *this* consultation once confirmed, not merely be logged as an accepted
intent.

Every claim below was checked against the running code or the live database.
Queries are included so they can be re-run.

---

## 0. The one-paragraph answer

The engine is not the obstacle. It already re-runs on every chart change, purely
and synchronously, and re-invoking it mid-consultation is the current normal
rather than a new capability. The obstacle is that **a confirmed condition has
nowhere to go**: it is held as a display label in `diagnoses: string[]`, and the
data path the architecture assumed — confirm a finding, write it back as an
observation, re-run — was designed but never seeded. **Zero of the 68 finding
intents have a matching observable**, so there is nothing to write back. And
there is no patient-level clinical fact anywhere in the schema: `visits.patient_id`
is the *only* `patient_id` column in the database.

So this is one small engine change, one bridge that has to be curated, and one
new table.

---

## 1. Does the engine run once per chart load, or can it be re-invoked safely?

**It already re-runs on every keystroke, and that is safe by construction.**

`useConsultIntelligence` (`src/hooks/useConsultIntelligence.ts:81`) runs
`runEngine` inside a `useMemo` keyed on the built input, which itself recomputes
whenever `observableIds`, any vitals field, or age changes. A consultation
already invokes the engine dozens of times. `runEngine` is pure — no Supabase
import, no React import, no I/O of any kind (handoff §5, enforced by convention
and true as of this pass).

The three things that happen *around* the engine, and whether a re-run disturbs
any of them:

| What | When | Safe to re-run? |
|---|---|---|
| `persistVisitInput` | 600 ms debounce after any input change | **Yes.** It deletes every `visit_observations` row for the visit and re-inserts, and upserts `visit_measurements` on `(visit_id, measure_key)`. Idempotent by construction. |
| `fetchCompositionBrands` | when the ranked composition set changes | **Yes.** Session-cached per `(pediatric, compositionId)`; a re-run that produces the same compositions costs no round trip. |
| `commitConsultation` | **once**, at consult close | Not re-run. It records `intelligence.result` — the object the doctor saw — and is deliberately never re-computed at save time. |
| `personalize` / `resolveCompanions` | inside the same memo chain | Pure. |

**What reranking live actually requires: one line.** The confirmed condition's
*observable id* has to join `chartObservableIds` (`src/App.tsx:363`). That memo
is the single point where chart labels become the engine's vocabulary; adding an
id to it re-ranks in the same frame, with no new plumbing, no debounce and no
loading state.

Two consequences worth stating before it is built, because neither is obvious:

1. **The decision log changes shape slightly, correctly.** `commitConsultation`
   logs the *final* `EngineResult`. After a mid-consult confirm, that result is
   the post-confirm ranking, so `shown` rows will include intents that only
   ranked once the condition was confirmed. That is the more accurate record —
   it is what was on screen when the doctor finished — but it means a row's
   `signal_context` will contain the confirmed condition's signal. Preference
   learning keys on `contributors[0]`, so this genuinely changes what is learned,
   and it should.
2. **`visit_observations.source` should say where it came from.** The column
   exists and defaults to `'doctor'`. A confirmed condition is not a chip the
   doctor tapped from the catalogue; writing it as `'confirmed'` keeps the
   permanent record honest and costs nothing (`persistVisitInput` currently
   hardcodes `'doctor'`, `src/lib/db/synapse.ts`).

---

## 2. Where should the durable fact live?

### What exists today

**The pattern already exists and it is `observables.kind = 'history'`.** Twenty-two
rows, each wired to a signal through `observable_signals`:

| observable | id | signal |
|---|---|---|
| Known diabetic | 32 | `DIABETIC` |
| Known hypertensive | 33 | `HYPERTENSIVE` |
| Known kidney impairment | 37 | `RENAL_IMPAIRMENT` |
| Pregnant | 34 | `PREGNANCY` |
| Immunocompromised | 40 | `IMMUNOCOMPROMISED` |

This is exactly the mechanism the ask describes — a standing fact about the
patient that reframes the whole consultation. It is what the History / Context
picker writes.

**But it is not durable.** It is stored in `visit_observations`, keyed on
`visit_id`. The doctor re-ticks "Known diabetic" at every single visit. Verified:

```sql
select table_name, column_name from information_schema.columns
where table_schema='public' and column_name='patient_id';
-- one row: visits.patient_id
```

There is no patient-level clinical fact in the schema at all. The only thing
that carries context between visits today is "Repeat Rx", which copies the
previous visit's chips forward on an explicit click (`src/App.tsx`, `handleRepeatRx`).

### The gap between a condition and an observable

```sql
select count(*) from intents i
where i.type='finding' and i.is_active
  and exists (select 1 from observables o
              where o.is_active and lower(o.label)=lower(i.label));
-- 0     (of 68 active finding intents)
```

68 finding intents, 72 finding observables, **no overlap**. The two catalogues
were authored for different jobs and never joined. Concretely:

* intent 19 *"Type 2 diabetes mellitus"* — an output the engine can rank
* observable 32 *"Known diabetic"* → `DIABETIC` — an input the engine can read

Same clinical fact. Two tables. No link. That link is the missing piece, and it
is *most* of the work.

### Proposal

**Two things, one of them curation.**

**(a) A bridge, matching the two that already exist.** `symptom_observable_map`
and `finding_observable_map` are already the established shape for "this row in
one catalogue is that row in another". Add a third:

```sql
create table condition_observable_map (
  intent_id    bigint primary key references intents(id),
  observable_id bigint not null references observables(id),
  -- a standing fact about the PATIENT vs. a fact about this EPISODE
  is_chronic   boolean not null default false
);
```

`is_chronic` is the load-bearing column and the reason this cannot be a blanket
join. Most finding intents are episodes, not patient facts: *Ankle sprain*,
*Acute appendicitis*, *Acute otitis media*, *Conjunctivitis*. Confirming one of
those should rerank today's consultation and appear in this visit's history —
it must **not** follow the patient forever as though they are permanently
appendicitic. A smaller set genuinely is durable: *Type 2 diabetes mellitus*,
*Essential hypertension*, *Asthma / reactive airway*, *COPD*, *Pulmonary
tuberculosis*, *Knee osteoarthritis*, *Iron deficiency anaemia*.

Seed it with the staging-table pattern from handoff §7, so a mistyped label is
*reported* rather than silently dropped.

**(b) The durable fact itself.**

```sql
create table patient_conditions (
  id            bigserial primary key,
  patient_id    uuid not null references patients(id),
  observable_id bigint not null references observables(id),
  status        text not null default 'active'
                check (status in ('active','resolved','refuted')),
  confirmed_at  timestamptz not null default now(),
  confirmed_by  uuid references doctors(id),
  -- which consultation confirmed it: provenance, and the row that proves it
  visit_id      uuid references visits(id),
  source        text not null default 'confirmed',
  note          text,
  unique (patient_id, observable_id)
);
```

**Why a new table rather than extending something.** The alternatives were
considered and each is worse:

* *A column on `patients`* — a condition is a list, not a field, and it needs a
  date, an author and a retraction path.
* *Reuse `visit_observations` and read the latest visit* — makes "is this
  patient diabetic" a scan over every visit they have ever had, and gives no way
  to say a condition was *resolved* without deleting history.
* *A new engine concept* — breaks handoff §0.1 and §1. See §3.

**Why `observable_id` and not `intent_id` is the key.** The durable fact's
identity has to be something the engine can already read. Storing the intent id
would mean every consumer — the engine input builder, History/Context, Front
Desk — has to know how to convert a condition into an input. Storing the
observable id means a confirmed condition *is* a chart entry, identical in kind
to a tapped chip, and everything downstream already handles it. This is the same
rule the atlas states for chips (§14.13): the canonical identity of anything on
the chart is its `observable.id`.

`status` rather than deletion, because a doctor who confirmed malaria and was
later proved wrong needs the record to say so, and `refuted` is a different fact
from never having been confirmed.

---

## 3. How should it feed the signal layer?

**Route it through the observable/signal pipeline like any other input. Do not
generate a signal directly.**

Four reasons, in descending order of how much they would cost to get wrong:

1. **The engine has exactly two input shapes** — observations and measurements
   (handoff §1). A third input that injects signals bypasses `resolveSignals`,
   which is where the "highest weight wins" rule and the negation handling live.
   Two ways into the signal layer means two places to fix any signal bug.
2. **Guards read signals, and guards are the safety layer.** Confirming *Dengue
   fever* should fire `DENGUE_SUSPICION` and hard-warn every systemic
   antibiotic. That already works — observable 374 `dengue_suspected` →
   `DENGUE_SUSPICION` → the §13.3 guard — *if* the confirmation arrives as an
   observable. A directly injected signal would have to re-implement nothing,
   but it would sit outside `visit_observations`, which is the next point.
3. **Reproducibility.** `visit_observations` is the permanent record of what the
   ranking actually ran on — the only thing that makes a past ranking
   re-derivable. A signal that reached the engine without a row there makes the
   decision log un-replayable, silently.
4. **The doctor must be able to take it back.** As an observable it is a chip:
   it can be un-ticked, it can be negated (`is_negated` already exists and the
   engine already honours it), and it renders in History/Context with no new UI.
   As an injected signal it is a thing the doctor can see the effect of and
   cannot reach.

### The flow, end to end

```
doctor clicks "Confirm" on a Possible Condition
        │
        ├─ condition_observable_map: intent → observable id
        │
        ├─ THIS visit:  add observable id to chartObservableIds
        │                 → engine re-runs in the same frame
        │                 → persistVisitInput writes visit_observations
        │                   (source: 'confirmed')
        │
        └─ if is_chronic:  upsert patient_conditions (status 'active')
                            │
                            ▼
              NEXT visit:  load patient_conditions for this patient
                            → pre-tick those chips in History / Context,
                              marked as carried-forward, removable
                            → engine reads them as ordinary observations
```

The next-visit half needs no engine work at all: it is a fetch on consult start
and a `setSelectedSymptoms` seed, in the same place `handleRepeatRx` already
seeds context chips.

**One thing to decide deliberately: carried-forward chips must be visibly
different from chips typed today.** A doctor looking at a chart needs to know
that "Known diabetic" came from a confirmation three visits ago rather than from
the patient in front of them — otherwise a wrong confirmation propagates forever
and looks fresh every time. A muted tone plus the confirmation date on hover is
enough; it is the same class of honesty as the "why this ranked" panel.

---

## 4. Suggested order of work

Small steps, each independently useful and independently revertible.

| # | Step | Size |
|---|---|---|
| 1 | `condition_observable_map` table + seed the **chronic** subset only, via the §7 staging pattern. Report unmatched rows. | half a day, mostly clinical curation |
| 2 | Confirm → add the mapped observable to `chartObservableIds`. Live rerank works, this visit only, nothing durable yet. | ~20 lines in `App.tsx` |
| 3 | `persistVisitInput` writes `source: 'confirmed'` for those ids. | 2 lines |
| 4 | `patient_conditions` table + write on confirm when `is_chronic`. | small |
| 5 | Load on consult start, pre-tick in History / Context with carried-forward styling. | small |
| 6 | Resolve / refute control, on the Patients page. | separate, later |

Steps 1–3 deliver the reranking half of the ask on their own. Steps 4–5 deliver
the durability half. Step 6 is not required for either.

## 5. What needs deciding before step 1

1. **Which finding intents are chronic.** 68 rows, and the split is a clinical
   judgement, not an engineering one. I can propose a draft split for review —
   the obvious chronic set is roughly a dozen rows and the rest are episodes.
2. **Whether a confirmed condition is editable outside a consultation** (a
   Patients-page control) or only ever from the consult that confirmed it. This
   decides whether step 6 exists.
3. **Whether confirming an *episode* condition should also carry forward as
   visible history** (not as a signal) — e.g. "had appendicitis, Jan 2026". That
   is a history-display question rather than an engine question, and
   `visit_observations` already holds the data for it.

---

## Appendix — unrelated finding, surfaced because it is a live exposure

Supabase's security advisor flags two tables with **RLS disabled**:
`public.prescription_counters` and `public.visit_attachments`. Both are readable
and writable by anyone holding the anon key. `visit_attachments` is empty today
and `prescription_counters` has no rows, so nothing has leaked, but the posture
is wrong and it will not stay empty. Remediation is deliberately **not** applied
here — enabling RLS with no policy blocks all access, so the policies have to be
written in the same change:

```sql
alter table public.prescription_counters enable row level security;
alter table public.visit_attachments     enable row level security;
-- then add policies before deploying, or both tables go dark.
```
