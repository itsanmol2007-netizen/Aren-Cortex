# Synapse engine — the pocket for signals, intents, rules, guards

Self-contained for engine/content work. You don't need frontdesk or UI
detail to add a signal, a rule, or a guard.

## The pipeline

```
observables (kind: symptom | finding | history)
  -> observable_signals (which signal(s) an observable implies)
  -> signals (the weighted concept — "KNEE_PAIN", "PAIN_CHRONIC")
  -> signal_intent_rules (signal -> intent, weight, is_safety_critical)
  -> intents (type + label + optional ref to compositions/tests/exercises)
  -> ranked, scored ScoredIntent[], grouped by type for the renderers
```

Pure, synchronous, re-runs every frame a chip changes. `engine.ts` has the
types (`Signal`, `Intent`, `Guard`, `Ruleset`, `ScoredIntent`). Nothing here
is specialty-aware — `specialtyProfile.ts` only reorders which ranked
section gets the elevated slot, never touches a score.

## `IntentType` — currently 8

`medicine | test | exercise | modality | referral | finding | advice |
impairment`. Adding a 9th: one union member in `engine.ts`, content rows in
`intents`/`signal_intent_rules`/optionally `intent_guards`. `tsc` will find
every exhaustive `Record<IntentType, ...>` that needs the new key — that's
the whole safety net, trust it, don't grep for call sites by hand.

Precedents worth reading before adding a 10th: `modality` (§14.24 —
in-clinic treatment vs. home exercise) and `impairment` (§14.31 — what
limits the patient vs. what pathology is named).

## Guards — flag only, never modify

`Guard = { signalId, action: 'warn' | 'warn_hard', targetType/Class/Intent,
reason }`. **There is no hiding, reordering, or value-modifying action, on
purpose** — the system suggests, the doctor decides. An intent a guard
fires on stays exactly where it was ranked, with a caution label. If a
feature needs to actually change a number (e.g. "suggest a lower dose"),
guards can't do that — the number has to be a real structured field first.

## Traps, engine-specific

- **A CHECK constraint rejecting a fire-and-forget write is a silent data
  outage.** `visit_observations.source`, `patient_conditions.status`, etc.
  all have narrow allowed sets — a write with the wrong string rejects the
  *entire insert* and if the caller doesn't await/surface the error, the
  UI looks fine while nothing saved. Always await, always surface.
- **RLS enabled with zero policies is the same failure, silently.** A
  denied read returns an empty set, not an error. `care_plans` shipped this
  way once. Any new table: create its policy in the *same migration* as
  the table.
- **An intent/rule referencing a signal that doesn't exist displays and
  ranks nothing, silently.** Check `select id from signals where id = '...'`
  before writing `signal_intent_rules` content — don't assume from a
  plausible-sounding name.
- **`intent_guards_one_target`-style constraints** often allow exactly one
  of several target columns — check the constraint before writing a row.

## Verification pattern

Every content addition gets checked in Postgres directly (`select count(*)
... where not exists (rule for this intent)`, `... where rule names a
signal that doesn't exist`) before being called done — not just "the
migration succeeded." See `check:measures`, `check:trend`,
`check:examination`, `check:story` for the equivalent structural checks on
the TypeScript side, and their pattern of "confirmed non-vacuous by
breaking one thing and watching it fail."

## What's NOT covered here

Which fields render where (→ `consult-ui.md`), specialty-specific catalogue
shape (→ `specialties.md`), medicine/brand data (see atlas directly, it's
large and mostly static reference data).
