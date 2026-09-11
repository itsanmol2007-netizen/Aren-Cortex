# Practice customization, done on the doctor's behalf — source of truth

For whoever builds the Master Control side of "a doctor asks us to set up
their preferred medicines / labs / templates for them." The UI/UX for all of
this is already solved on the Cortex side — this doc is the map so it isn't
re-solved from scratch.

**Not the Clinic page.** "Adding labs, medicines, configurations" is the
**Practice** page (`src/features/practice/PracticePage.tsx`) — "how do I
practise." Clinic (`src/features/clinic/ClinicPage.tsx`) is identity, Rx
template, hours, six things and nothing else; it has no medicine/lab
surfaces. Read Practice's own file header — the first 56 lines are already a
tight spec of what's real, mapped table-by-table.

## What a doctor self-configures, and where it lives

| Doctor-facing card | Table | Shape |
|---|---|---|
| Preferred Medicines | `clinic_brand_preference` | PK `(hospital_id, composition_id, medicine_id)` — several preferred brands per composition is normal, not an edge case |
| Preferred Labs | `doctor_preferred_labs` | `doctor_id`, `lab_name`, `sort_order`, one `is_default` |
| Prescription Templates | `prescription_templates` / `prescription_template_items` | a template is a named list of accept-shaped items |
| Add New Medicine | `medicines` (+ `medicine_composition_map`) | `hospital_id` NULL = global catalogue, set = this clinic's own private add |
| Clinical Companions | `hospital_companion_preference` | curates/extends Synapse's authored `intent_companions` edges — never a parallel pipeline |
| Your Clinical Terms | `doctor_free_terms` | free-text vocabulary Cortex remembers back to the doctor |
| Consultation Defaults | `doctors.preferred_measure_keys` (write); `hospitals.specialty_profile` (read-only here) | |

All RLS-on. Master Control writes these the same way it writes anything
else — service role, never the doctor's own session.

## The one rule that matters: never mint a composition

**Standing rule 22.** A medicine always attaches to an EXISTING row in
`compositions` (~284 molecules). "Import these 100 medicines" is a matching
problem — name / manufacturer / strength → resolve to a composition — not a
free-for-all insert. `addMedicine` (`lib/db/synapse.ts:952`) is the
composition-anchored write path already built for this (Consult's
`AddMedicineSheet` and Practice's own "Add New Medicine" both call it); a
bulk importer should call the same RPC per row, not a hand-rolled INSERT.
When nothing matches, the existing flow is `composition_requests` (a request
queue, never a live mint) — same rule, see `cortex-data-model.md`.

`medicines.name` has no search index — see
`MASTER-CONTROL-PLAN.md` §7 on the `pg_trgm` index this already needs for
the global catalogue editor. A bulk-import matcher hits the exact same wall
and wants the exact same fix.

## The UI is already a solved system — reuse it, don't reinvent

- **`PracticeCard`** (`PracticePage.tsx:362`) — the one card shape every
  card on the page shares: icon + title + optional count badge + subtitle +
  body + an optional tone-matched "Manage →" foot link. Four tones only
  (`blue`/`teal`/`violet`/`slate`) — this codebase has twice been told its
  cards read like "a mixture of colour... like a rainbow" and corrected back
  to a small fixed palette. Don't invent a fifth.
- **`PracticeModal`** (`PracticeModal.tsx`) — ONE modal family, four accent
  values (teal/blue/violet/slate), same stripe/button/eyebrow treatment for
  all of them. The exact history of why (two prior "Christmas tree" corrections)
  is in its own file header — worth reading before adding a fifth accent.
- **Preferred Medicines' own tree** (`PreferredMedicinesCard`,
  `groupByComposition`, line 513) is the reference for "many rows, grouped by
  composition, brand chips underneath" — the shape a bulk import's *review*
  screen wants, already built.
- **`CappedRows`** (line 142) — the shared "show N, `+3 more`" list primitive
  every card's body uses.
- **Add New Medicine vs. Preferred Medicines are deliberately different
  jobs** (PracticePage.tsx:1462's own comment): one says "this doesn't exist
  yet," the other says "this existing one is preferred here." A bulk importer
  is two passes for that reason — resolve/create the medicine row, THEN mark
  it preferred — not one conflated step.

## What "import 100 medicines, mark preferred" concretely is

1. Doctor hands over a list (name, maybe manufacturer/strength/brand).
2. For each: resolve to an existing `compositions` row (fuzzy match once the
   `pg_trgm` index exists), or queue as a `composition_requests` row if it
   genuinely doesn't exist yet — never invent one.
3. Resolve/create the `medicines` row via `addMedicine`, scoped to this
   clinic's `hospital_id` unless it's a legitimate global add.
4. Insert `clinic_brand_preference(hospital_id, composition_id, medicine_id)`
   — this is the "preferred" step, and it's the ENTIRE thing that makes a
   medicine show up in Consult's Preferred Medicines tree. No separate flag.
5. Show the doctor the same composition-grouped review Practice already
   renders, before committing — the format doctors will already recognise
   from their own Practice page.

## Not now

- No bulk CSV path exists yet even on the Cortex side — Anmol's rough
  importer lives in a separate repo (`arennode`); the parsing/matching design
  is explicitly deferred in `MASTER-CONTROL-PLAN.md` §7/§9. Master Control's
  version can be the first real one, but the matching problem (not the UI) is
  the hard part — budget for it.
- Preferred Labs, Templates, Companions and Clinical Terms are much smaller
  jobs (short row, few columns, no catalogue-matching problem) — same
  service-role write pattern, no separate design needed.
