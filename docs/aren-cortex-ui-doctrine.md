# AREN CORTEX — UI DOCTRINE

*What shape the consult screen should be, why the old one was wrong, and what
not to try again.*

Owns **one thing**: the architecture of the doctor-facing interface and the
reasoning behind it. No auth, no Supabase, no edge functions, no RLS — those
live in `aren-cortex-context.md`. This is the file that explains what the
screen is supposed to **BE**, not how it's wired.

---

## 0. The core judgement

> **The consult screen's problem was never that it looked wrong. It was that
> it asked the doctor for too much, in the wrong order, before it had earned
> the right to ask for anything.**

A whole session of visual polishing — type scale, grey ramp, spacing scale,
gradients, dividers — did not fix the screen. Structure did. Anmol's verdict,
proven correct: *"No amount of visual polishing can fix it because it's a
structural problem."*

**Do not reach for a border-radius, a token, or a grid ratio to fix a
structural complaint.** Check §2 first — is this actually one of the four
faults below wearing a visual costume?

---

## 1. The root cause: SOAP is a documentation format, not a workflow

SOAP (Subjective → Objective → Assessment → Plan) is how a clinical note is
**written down afterwards** and **read back later**. It is not how a
consultation is conducted. Making the record's structure the screen's
structure turns an encounter into a form, filled in the order the archive
wants rather than the order the conversation happens.

**The engine does not share the distinction.** `consultInput.ts` flattens
history, symptoms and findings into one set of observations — the engine
cannot tell which card a chip came from. So splitting the input into three
cards (History/Symptoms/Findings) buys the doctor nothing analytically. What
it costs is a decision — *"is this a symptom or a finding?"* — the doctor
must make before typing anything, which the observable's own `kind` already
answers for them.

That splitting is friction invented, defended in comments, then made
prettier. Everything below falls out of collapsing it.

---

## 2. The four structural faults

### 2.1 Measurements must be inverted, not tuned

The visible measurement field set is computed as a **union**: specialty
defaults ∪ chart-relevant fields ∪ doctor-added ∪ anything with a value.
Because specialty defaults are unioned in, they are always on, and relevance
can only ever *add* to a set that's already too big — a dentist gets blood
pressure on every patient because `DENTISTRY.measurements` lists it.

**The fix: replace, not union.** Default to zero visible fields. Let the
chart raise them (`measureRelevance` already does this correctly). Keep "Add
Measurement" for everything else.

### 2.2 Specialty is the wrong gate

Specialty is a property of the **facility**. What should decide what's on
screen is the **encounter**. A dentist draining an abscess wants temperature
and pulse; the same dentist doing a filling wants neither — same facility,
same profile, opposite needs. Gating on `specialty.charts` /
`specialty.measurements` is a category error, not a tuning problem: the
variable it keys on doesn't vary with the thing that matters. The right gate
is what the chart says (§3).

### 2.3 The output must not be at the bottom

Page length is every SOAP phase stacked full width, so the prescription — the
thing the consultation exists to produce — was last. For a workflow whose
output is a prescription, that's the wrong end of the page.

*Standing note:* the plan used to sit **beside** the work and was moved below
on instruction mid-session, which made the scroll problem worse. The correct
response to "put the plan at the bottom" is "that doubles the scroll to reach
medicines — here's what it will look like," not silent compliance.

### 2.4 Nothing should be visible until it's earned

Attachments, specialty examination, eight measurement cells, four chip
pickers, two ranked panels — all present on an empty consultation, before the
doctor has typed a character. The stated philosophy is **progressive
disclosure**; an old build was the opposite of it. An empty consult should be
close to blank.

---

## 3. The engine for progressive disclosure

`src/lib/synapse/examSuggestions.ts` ranks **what's worth examining for**
given the symptoms already entered — the cascade: symptoms suggest what to
examine → doctor confirms → engine re-runs → ranks Possible Conditions →
doctor confirms → engine re-runs → medicines/tests. It is wired and consumed
as **Related Findings** (`App.tsx` builds `relatedFindings` off it, passed to
`CaseSheet`'s `related` prop).

This is the general mechanism for §2.4, not just a findings feature: one
symptom in, and the system knows enough to say what's worth asking,
examining, measuring. The screen can start as a single search box and **grow
itself**.

`signal_finding_suggestions` currently holds several hundred active rules
across most of the signal catalogue (check `aren-cortex-context.md` for the
current count). What remains open is a content-**quality** question — are
those rules any good, has the batch been audited — not a wiring one.

---

## 4. The test for any future change

1. **One input surface, not four.** The chip vocabulary is already unified
   (`observables`). A single search takes history, symptoms and findings;
   entries self-classify by their own `kind` and group visually after the
   fact. The doctor never decides which box a thing goes in.
2. **Nothing else visible until the chart earns it.** No measurements, no
   specialty examination, no attachments on an empty consult — each appears
   because the chart asked for it (§3's engine), not the facility profile.
3. **The plan stays in view.** Beside the work, persistent, never below it.
4. **Attachments are an action, not a section.** Supporting evidence —
   "structured first, artifact when necessary" — a permanent panel
   contradicts that.
5. **Specialty examination is the same** — an affordance that appears when
   relevant, opening the real instrument in a modal (`ChartSurface`).

**The test for any future change: does an empty consultation get shorter?**
If no, it's polish, and polish alone doesn't fix a structural complaint.

---

## 5. Standing rules (do not relitigate)

- **Brand is primary. Always.** In every surface, the brand name is the
  headline and the composition is the subtitle — never the reverse. The
  doctor prescribes a product; the patient buys a product. A search for
  "Acenac-P" that answers "aceclofenac" makes the doctor doubt the thing they
  typed exists.
- **Colour carries meaning, never mood.** blue = the action · rose = reported
  · teal = examined · violet = the engine's reading · amber = soft guard ·
  red = hard guard · green = taken.
- **Guards warn, never hide.**
- **Ranking is a safety property, never a verdict.** A condition shown at
  rank 1 beside three alternatives is honest; the same label shown alone
  reads as a diagnosis. Nothing is ever presented as the cause.
- **The engine never decides which diagnosis is primary.** That judgement is
  entirely the doctor's.
- **Module height is content-driven.** No floors, no reserved space. This has
  been violated by more than one stray `min-height` rule — check for it.
- **A per-specialty branch in the render tree is forbidden — UNLESS the
  clinical reasoning itself is a different shape, not merely the fields.**
  The law holds where a specialty needs a different INSTRUMENT inside the
  same consultation shape (dentistry's odontogram, dermatology's body map,
  paediatrics' growth curve) — same shape, different tool, share the file.
  It does **not** hold where the clinician reasons in a genuinely different
  ORDER — physiotherapy starts with how the symptom behaves and what the
  patient wants back, before the chip-based intake every other profile opens
  with; that's not an extra field, it's a different first step. The test
  before copying `GeneralOpdInputs.tsx` for a new profile is **"does this
  clinician reason in a different order?"**, not "does the input half look
  different" — every specialty's fields differ a little. A profile that
  answers yes earns its own input file (`PhysioInputs.tsx` is the precedent).
  A profile that answers no keeps sharing one.
- **Cortex should know a lot, but show little.** Depth is not the same
  permission as visibility. Every clinical field proposed for the DEFAULT
  consultation surface must pass one test: **does it change clinical
  reasoning, treatment/dosing, or meaningful progress/outcome — for
  essentially every patient who has it, not just plausibly?** If not, it's
  reachable (search, "More", a chip the doctor can add) but never on by
  default. A field merely TRUE about the patient doesn't earn space; "true
  and load-bearing" does. This is progressive disclosure as LAW, the same
  discipline `RELEVANT_FIELDS` applies to measurements, generalised to every
  specialty's deep catalogue.
- **Reordering, not revealing, for INPUTS.** The system may hide what it has
  nothing to say about. It may never hide what the doctor might want to say.
  An empty ranked list is safe to hide; a measurement field is not.
- **Relevance marks by ADDING, never by dimming its neighbours.** Same size,
  same position, same weight, and the mark clears the moment a value lands.
- **Blue tint means "worth taking"; amber means "the value you entered is out
  of range."** Two different states — sharing a colour blurs "please measure
  this" into "this reading is bad."
- **Relevance in words, never numbers.** A percentage is a verdict; a word is
  a reading.
- **Blank states are drawn, not apologised for.** `BlankArt.tsx`: inline SVG,
  one line weight, palette only from the colour rule at its lightest, subject
  is always the thing that will fill the panel, at rest. Never a magnifying
  glass, never a sad face.
- **Gloss on the objects, flat paper for the ground.** If the card were
  glossy too, nothing would read as foreground. (Narrow, deliberate exception
  to "no gradients.")
- **An empty panel should be SHORT, and centred in what is left.** Reserve
  nothing. Where a void genuinely can't be removed (height-locked to a
  neighbour), FILL it rather than float a small drawing in the middle — a
  62px illustration in a 300px well reads as an accident.
- **A hierarchy in which every level is the top level is a list.** Emphasis
  is only visible where something else is de-emphasised.
- **Check the rendered page, not the stylesheet declaration.** A type ramp,
  a grey token, a contrast ratio — all of them are claims until you've looked
  at the actual browser. Font weights not loaded by `index.html` silently
  collapse to the nearest cut that is; darkened greys can still "read grey"
  if structural labels and ornament share one rung instead of being split.

---

## 6. Keep the medicine confirm sheet

`MedicineAddSheet` stages a medicine instead of committing it — confirms
brand, strength, dose, timing slots, duration and food instruction in one
place, before it lands on the plan. Before this existed, `+` committed
whatever brand the resolver returned at whatever dose the composition
defaulted to — a 250mg suspension and a 650mg tablet are not interchangeable
just because they share a molecule. **Anmol likes this shape and it stays.**

Be honest about the cost: it adds a step, in a product whose thesis is
removing them. The right refinement is to interrupt only on genuine ambiguity
(several strengths, no clinic default) and otherwise commit on one key with
the choices visible and correctable afterward.

---

## 7. General OPD's shape, as built

`CaseSheet.tsx` + `BlankArt.tsx` + `useDismiss.ts`; `ConditionsCard` as two
columns; behind `isGeneralOpd` in `App.tsx`.

**The law "no per-specialty branch anywhere in the render tree" was broken
here, deliberately** — configuration can change what goes INSIDE a module,
it can never remove a module another profile requires, and removing modules
was the entire task. Every other profile keeps the shared SOAP column
untouched until its own turn, so no profile regresses while another is
rebuilt.

**The shape:** a page-level command bar; a fixed-height row of Case Sheet
beside Measurements over Attachments; a two-column Assessment (ranked left,
confirmed right); then the plan panels. Nothing in row 1 grows —
`ROW_BUDGET` gives each chip group a budget in rows, overflow goes to the
browse modal, never down the page, because the panel directly below that row
is the Assessment and pushing it off screen defeats the whole rebuild. Row
height is DERIVED from bounded content, never hardcoded.

**Hiding the empty ranked panels was tried and reverted the same day** — each
panel carries the search box that reaches something the engine never ranked,
so hiding the panel hides the only way in. Ranking decides what's OFFERED,
never what's REACHABLE; tidiness doesn't outrank that. Empty states were made
compact and illustrated instead — which is where the blank-states rule in §5
comes from.

**Naming matters.** The input surface is the **Case Sheet** — named after the
doctor's own artefact, never the software's function ("master search" is a
feature name, and that's exactly what makes it grate). The exam suggestions
are **Related Findings**, not "worth examining for" — worth is a verdict the
software shouldn't issue; a relationship is a fact.

---

## 8. Further reading

- `docs/temp/Cortex_Ref2.png` — the visual target. Language, not pixels.
- `docs/Aren cortex visual philosophy.md` — the original doctrine.
- `aren-cortex-context.md` — wiring, data model, file tree, open items.
- `aren-frontdesk-source-of-truth.md` — the reception half's design
  reasoning, further along than this one and worth reading for tone.

*This document exists because a session of visual work failed to fix a
structural problem. If work on this screen begins by adjusting tokens before
checking §2, it will fail the same way.*
