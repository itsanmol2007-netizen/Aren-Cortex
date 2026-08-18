# Physiotherapy Phase 2 — the measurement foundation (for review)

**Status:** proposed, not built. Nothing applied. 2026-08-18.

**This plan opens by correcting `physiotherapy-implementation-decision.md`
§3, which was written from a row count and a grep rather than from the
data.** The correction does not change Phase 2's goal; it changes what
Phase 2 has to do to reach it, and it removes a step I had called simple.

---

## 1. What I got wrong, and what is actually true

The decision note said:

> "`visit_measurements` … is upserted on every save and **read by nothing**
> … Two homes for one fact, one of them write-only."

**Two homes for one fact was the wrong description.** They are the same
fact in two different encodings, and the encoding difference is the whole
problem:

| | `visits.vitals` | `visit_measurements` |
|---|---|---|
| Keyed by | **catalogue field key** — `kneeFlexR`, `painVas`, `bp` | **engine measure key** — `KNEE_FLEX_R`, `BP_SYS`, `AGE` |
| Shape | one JSON blob, one value per key | one row per measurement |
| Written by | `saveConsult` | `vitalsToMeasurements` → `synapse.ts:962` |
| Read by | `trend.ts`, `MeasurementsCard`, both print surfaces, `fetchPatientVisits` | **nothing** |

`bp` is one field and becomes `BP_SYS` + `BP_DIA`. `AGE` and `WAZ` are
derived and belong to no field at all. So `visit_measurements` cannot be
read back as "what the doctor entered" without a reverse mapping that does
not exist.

**What the live data actually looks like** (queried, not assumed):

- 154 rows total. **135 of them are `AGE`** — one per visit, derived from
  date of birth. Real clinical measurements: 7 `TEMP`, 5 `BP_SYS`, 4
  `BP_DIA`, 1 each of `RR` / `HR` / `WEIGHT`. Nineteen rows.
- **9 visits carry `vitals` but have no measurement rows at all**
  (2026-06-10 → 2026-08-15) — they predate the write, or it failed.
- 103 visits have rows but no vitals — those are the `AGE`-only ones.

So neither store is a superset of the other, and the one I proposed
promoting to source of truth contains almost no clinical data. Calling
that "adopt the table that already exists" was too easy an answer.

**What survives the correction:** the physio fields DO emit engine keys
(`PHYSIO_KEYS` in `consultInput.ts`, `kneeFlexR` → `KNEE_FLEX_R`), so the
pipe is real and complete — it has simply never carried a physiotherapy
visit, because none has been saved. The plumbing works; the store is
empty of the thing Phase 2 needs.

---

## 2. The actual constraint, restated

A measurement must be able to carry **AROM vs PROM** and **baseline vs
post-intervention**. `visits.vitals` is one value per key, so it physically
cannot hold both an active and a passive knee flexion for one visit. The
options are:

- **(A) Key explosion.** `kneeFlexR_arom`, `kneeFlexR_prom`,
  `kneeFlexR_arom_post`… 17 physio fields → ~68 catalogue entries, each
  needing its own label, warn range, trend direction and two print labels.
  This is the doubling that already happened once for side, run twice
  more. Rejected.
- **(B) Restructure `Vitals`** from `Record<key, string>` to a structured
  value. `Vitals` is threaded through `saveConsult`, both print surfaces,
  `trend.ts`, `MeasurementsCard`, `consultInput.ts` and the frontdesk. A
  type change there is the largest blast radius available.
- **(C) Qualified measurements live in rows; simple ones stay in the blob.**
  Row-per-measurement is the only shape that carries qualification, and
  `visit_measurements` is already that shape.

**(C), with one addition that (C) alone does not give you:** if two stores
both hold "measurements", every reader has to know which. So (C) is only
correct if `visit_measurements` becomes a genuine **superset** — every
measurement, qualified or not — and `visits.vitals` is demoted to what it
honestly is: the working draft of the current consult, not the record.

---

## 3. What Phase 2 does

**Step 1 — columns.** Additive, zero risk, no behaviour change.

```sql
alter table visit_measurements
  add column side      text check (side in ('left','right')),
  add column method    text check (method in ('active','passive','mmt','girth')),
  add column context   text not null default 'baseline'
                            check (context in ('baseline','post_intervention')),
  add column qualifier text;
```

`context` defaults to `'baseline'` so every existing row and every
non-physio write stays correct without touching a single call site.

**Step 2 — one mapping, in one direction, read both ways.** The
field↔measure-key relationship is currently hand-written in
`vitalsToMeasurements`'s `PHYSIO_KEYS` and the hardcoded `BP_SYS` /
`TEMP` / `AGE` pushes. Phase 2 does NOT add a second reverse table —
that is exactly the "two things a rule says to edit together" drift the
doctrine's trap 8 names. Instead the catalogue field gains its own
`measureKey`, and `vitalsToMeasurements` reads it, so the mapping has one
home and the reverse direction is a lookup rather than a copy.

**Step 3 — backfill the 9.** One-off, from `visits.vitals` through the
same `vitalsToMeasurements`, so the store becomes a true superset.
Verified by re-running the coverage query until `vitals_but_no_rows` is 0.

**Step 4 — `trend.ts` reads rows, and trends `baseline` only.** This is
the step that makes the within-session re-test possible in Phase 5,
because it is what stops a post-intervention reading being mistaken for
next session's progress. `collapseSameDay` stays exactly as it is for
baselines — it is still correct that two baselines on one day are one
point.

---

## 4. The risk, stated plainly

**Step 4 changes the read path of a working, shipped feature.**
`trend.ts` has 148 assertions and the longitudinal band is the piece Anmol
has seen and approved. The mitigation is that those 148 assertions are the
contract: they are written against `TrendVisit { id, created_at, vitals }`
and every one of them must still pass with rows behind it, which means the
work is "change the loader, keep the module" rather than "rewrite the
module."

If any assertion cannot be kept, **that is the signal to stop and re-plan,
not to edit the assertion.**

Steps 1–3 are independently safe and independently useful. **Step 4 is the
only one that can break something a doctor already relies on**, and it can
be held back behind the rest if you would rather see the store become
correct before the reader moves onto it.

---

## 5. What I need before building

1. **Steps 1–3 now, step 4 after?** — my recommendation. It gets the store
   correct and complete with zero risk to the band, and leaves the one
   risky change as its own reviewable commit.
2. **Authorisation for the `alter table`** (additive, four columns).
3. The backfill in step 3 writes to 9 existing visits' measurement rows.
   Nothing is deleted and `vitals` is untouched, but it is a write to real
   patient data and needs a yes.
