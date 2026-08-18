# Specialties — the pocket for adding or modifying one

Self-contained. Read this and `SESSION-HANDOFF.md`; you don't need the
frontdesk docs, auth docs, or the engine internals to do specialty work
unless you're adding new signal/rule content, in which case also read
`engine.md`.

---

## The model

`src/features/synapse/specialtyProfile.ts` — one `SpecialtyProfile` object
per specialty, four axes plus two more added for physiotherapy:

- `primary` / `sections` — which intent type is elevated, what the rest are called
- `measurements` — which fields show by default (membership only, not order)
- `charts` — which specialty chart mounts (`dental` | `body` | `growth` | `joints`)
- `trend` — priority list the longitudinal band reads down (added 2026-08-16)
- `inputLayout` — **the one sanctioned branch in the render tree**:
  `"case-sheet"` | `"physio"` | `"soap"` (add a value here when a specialty
  earns its own screen)

**The test for earning `inputLayout`'s own value** (doctrine §5, amended
2026-08-17): not "does the input half look different" — every specialty's
fields differ a little — but **"does this clinician reason in a different
order?"** Dentistry/dermatology/paediatrics need a different *instrument*
inside the same shape (still `"soap"` today, could become `"case-sheet"`
without earning their own file). Physiotherapy starts with how the symptom
*behaves* and what the patient wants back, before any chip — a different
first step, not an extra field. That earned `PhysioInputs.tsx`.

## Where the 8 profiles stand (as of 2026-08-18)

| Profile | `inputLayout` | Status |
|---|---|---|
| General OPD | `case-sheet` | Purpose-built |
| **Physiotherapy** | `physio` | **All 6 phases built** — see below |
| Cardiology | `soap` | Fallback only, no chart — cheapest next candidate |
| Diagnostics | `soap` | Fallback only, no chart |
| Gynaecology | `soap` | Fallback only, no chart |
| Paediatrics | `soap` | Fallback + growth chart |
| Dentistry | `soap` | Fallback + odontogram |
| Dermatology | `soap` | Fallback + body map |

## The six-phase pattern (physiotherapy is the template)

Built and shipped 2026-08-17/18. Full reasoning per phase is in
`aren-cortex-atlas.md` §14.27–§14.31 and
`Cortex Specialties/physiotherapy-phase-1-plan.md` /
`-phase-2-plan.md` — read those only if replicating a phase for the next
specialty and the summary below isn't enough.

1. **Story + Goals** — the specialty's own Subjective input, chip-first,
   progressive disclosure (`core` / `revealWhen`, same shape as
   `RELEVANT_FIELDS`). Files: `story.ts`, `StoryCard.tsx`, `GoalsCard.tsx`,
   `PhysioInputs.tsx` (copy `GeneralOpdInputs.tsx`, don't fork it).
2. **Measurement foundation** — only build this if the specialty needs to
   qualify a reading (side/method/context). **Do not assume
   `visit_measurements` can replace `visits.vitals`** — it's the engine's
   *normalized* view (units converted), not a copy of what was typed. Check
   real rows before proposing to promote it.
3. **Examination** — deep catalogue (`examination.ts` pattern: regions →
   movements/muscle-groups/tests), one region shown at a time, chosen from
   what a chart/chip already marked.
4. **Impairments/impression** — new intent type only if the specialty's
   output genuinely isn't a pathology (physio: `impairment`, precedent
   `modality`). Engine never changes — `tsc` finds the two exhaustive maps
   (`engine.ts groupByType`, `useConsultIntelligence`'s `EMPTY_BY_TYPE`)
   that need the new member.
5. **Response/re-test** — only if the specialty has a "treat, then
   re-measure, same visit" loop. Needs phase 2's `context` column.
6. **Outcomes** — `mcid` sibling property to `trendNoise` on `MeasureField`,
   not a new subsystem. Only add instruments in actual routine use.

## Doctrine additions from this build (in `aren-cortex-ui-doctrine.md` §5)

- The `inputLayout` test above, stated as law.
- **"Cortex should know a lot, but show little."** Every new field: does it
  change reasoning, dosing, or meaningful outcome — for essentially every
  patient who has it? If not, it's reachable, never default.

## Traps specific to this area

- **A boolean guard's meaning can silently narrow when the enum it's built
  on gains a value**, and `tsc` won't catch it — `usesCaseSheet` meant "not
  soap" until a third `inputLayout` value existed. Grep `App.tsx` for
  `usesCaseSheet`/similar before adding a 4th `inputLayout` value.
- **Check a signal exists in Postgres before writing a `signalId`** into
  new catalogue content. Most of physio's "should rank" list turned out to
  have zero signal content — real distinctions, unranked until someone
  writes the content.
- **`intent_guards` only warns/warn_hards — never hides, reorders, or
  modifies a number.** If a specialty needs "reduce the suggested dose,"
  that needs a structured dosage field to exist first; the guard mechanism
  itself can't do it.

## What's NOT covered here

Front desk, auth, the medicine/brand catalogue, attachments, dental/derm
detail — see the other pockets or the atlas directly.
