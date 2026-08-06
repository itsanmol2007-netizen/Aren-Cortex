# Ordering a known investigation package

Date: 2026-08-06
Status: **design note — no implementation, no decision taken**
Related: `docs/aren-cortex-atlas.md` §4 (the engine), §5.3 (specialty profiles)

This note exists because of a question that came out of the Diagnostics
specialty work, and it deliberately does **not** propose a change to the
Synapse reasoning architecture. It records why, and what the actual shape of
the gap is, so the next person does not re-derive it.

---

## 1. The observation

Of the 36 investigation panels in the catalogue, 34 are now reachable from the
chart — a symptom or a vital causes them to be suggested and ranked. Two are
not, and cannot sensibly be:

- **Annual Health Checkup**
- **Pre-op Workup**

Every other panel answers a clinical question raised by something the doctor
observed. These two answer a question the *patient's visit* raised before any
observation was made. A patient attending for a routine checkup or pre-operative
clearance frequently has **no complaint at all**.

## 2. Why this is not a reasoning gap

The engine's contract is `active signal → ranked intent` (`engine.ts`,
"INPUTS → SIGNALS → ENGINE → INTENTS"). No complaint means no active signal,
and no active signal means nothing to rank. That is the engine behaving
correctly, not failing.

It would be possible to invent "reason for visit" signals so these panels rank
like everything else. **That was considered and rejected.** A stated
administrative purpose is not a clinical observation, and modelling it as one
would put a non-clinical input into the same table that carries genuine
diagnostic weight — including the safety-critical rules that are deliberately
exempt from personalisation. The knowledge base stays clinical.

The doctor ordering a pre-op workup is not asking the system what might be
wrong. **They already know exactly what they want.** The need is fast
retrieval, not inference.

## 3. The trap: pinning does not solve this

The obvious cheap fix — "let the doctor pin Annual Health Checkup" — does not
work, and it is worth being explicit about why, because the mechanism looks
like it should fit.

`doctor_pinned_intent (doctor_id, intent_id, hospital_id)` is type-agnostic at
the storage layer, so a panel could be pinned today with no schema change. But
pinning is a **reordering** of the ranked list, not an insertion into it —
`RecommendationsCard.tsx:124-129` partitions the intents the engine already
scored into `[pins, ...rest]`. An intent with no rules is never scored, so it
never enters that array, so a pin has nothing to lift.

Pinning makes a *ranked* thing easier to reach. It cannot make an *unranked*
thing reachable. Any solution here has to bypass ranking entirely.

## 4. Shape of a lightweight fix (not a recommendation, an option)

The pieces that already exist:

- The panels exist as intents with `ref_table = 'panels'` (36 of them).
- `resolvePanelTests(panelId)` (`lib/db/synapse.ts`) expands a panel into its
  member tests via `test_panel_map` — 261 mappings are already seeded.
- Accepting a panel already expands it into member tests (wired in
  `9c2f319`).

So the missing piece is only an **entry point that does not depend on the
chart**: somewhere in the Investigations area that lists the standard packages
directly from the catalogue and orders one in a click, independent of the
engine. Roughly a browse-sheet over `intents where ref_table = 'panels'`,
reusing the existing browse-everything surface rather than inventing a new one.

Open questions if this is ever picked up — all product calls, none clinical:

1. Does it list all 36 panels, or only the ones nothing on the chart would
   surface? (Listing all is simpler and probably right: the doctor who wants
   Fever Workup by name should not have to know it is also rankable.)
2. Does it live in the Investigations section for every specialty, or only
   where `primary: "test"`? Note the "configure, never redesign" law in
   `specialtyProfile.ts` — a per-specialty branch in the render tree would
   violate it, so this should be one surface everywhere.
3. Is the package ordered as a unit on the prescription, or dissolved into its
   member tests? (Accept already dissolves it; a checkup arguably reads better
   as a named package.)

## 5. What was actually done instead

The 12 orphaned panels that *do* answer an observed clinical question were
wired to signals already in the vocabulary — 57 rules, migration
`wire_panel_rules_batch2_orphaned_panels`. Those were a genuine content gap and
are now closed. Annual Health Checkup and Pre-op Workup were left unwired on
purpose; they are the subject of this note.
