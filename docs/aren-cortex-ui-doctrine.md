# AREN CORTEX — UI DOCTRINE

*What shape the consult screen should be, why the current one is wrong, and
what not to try again.*

Written 2026-08-12, at the end of a session that produced a lot of CSS and
very little progress. This document owns **one thing**: the architecture of
the doctor-facing interface and the reasoning behind it. No auth, no
Supabase, no edge functions, no RLS — those live in
`aren-technical-atlas.md` and `aren-cortex-atlas.md`. If you are reading this
to find out how something is wired, you are in the wrong file. This is the
file that tells you **what the screen is supposed to BE**.

---

## 0. Read this part even if you read nothing else

Over one session the consult screen received: a type-scale increase across
102 declarations, a whole-ramp darkening of the greys, a new spacing scale, a
2×2 quadrant, a SOAP column, an output strip, a summary rail, gradient cards,
glossy edges, a divider, and a slate ground.

**None of it worked.** Anmol's verdict after all of it: *"No amount of visual
polishing can fix it because it's a structural problem."*

He is right, and that judgement is the most valuable thing this session
produced. Write it on the wall:

> **The consult screen's problem is not that it looks wrong. It is that it
> asks the doctor for too much, in the wrong order, before it has earned the
> right to ask for anything.**

Every time you are tempted to fix this screen with a border-radius, a token,
or a grid ratio — stop. Those were tried. They failed. The failure was not in
the execution.

---

## 1. The root cause: SOAP is a documentation format, not a workflow

The screen is currently laid out as Subjective → Objective → Assessment →
Plan, top to bottom, each phase a full-width band of modules.

SOAP is how a clinical note is **written down afterwards** and **read back
later**. It is not how a consultation is conducted. By making the record's
structure the screen's structure, we turned an encounter into a form, to be
filled in the order the archive wants rather than the order the conversation
happens.

Everything else in this document falls out of that single inversion.

### The evidence that the split is fiction

This is not an aesthetic opinion. **The engine does not share the
distinction.** `consultInput.ts` flattens history, symptoms and findings into
one set of observations, and the engine cannot tell which card any chip came
from. `ConditionsCard`'s own header comment says so in as many words.

So the three-card division buys the doctor nothing analytically. What it
costs them is a decision — *"is this a symptom or a finding?"* — that they
must make **before they can type anything**, and that the observable's own
`kind` already answers.

That is friction we invented, defended in comments, and then spent a session
making prettier.

---

## 2. The four structural faults

### 2.1 Measurements are inverted

`MeasurementsCard` computes the visible field set as a **union**:

```
specialty defaults  ∪  chart-relevant fields  ∪  doctor-added  ∪  anything with a value
```

`measureRelevance` already works — ticking Fever surfaces Temperature. That
machinery is good and it is live. But because the specialty defaults are
unioned in, they are **always on**, and relevance can only ever *add* to a
set that is already too big. A dentist gets blood pressure on every single
patient because `DENTISTRY.measurements` lists it.

**The fix is one word: replace, not union.** Default to zero visible fields.
Let the chart raise them. Keep "Add Measurement" for everything else. No new
code, no new engine — invert an existing set operation.

Anmol, 2026-08-12: *"A dentist rarely measures blood pressure, and if he
wants to, he could just simply go and click add."*

### 2.2 Specialty is the wrong gate

`specialty.charts` and `specialty.measurements` gate what appears. Specialty
is a property of the **facility**. What should decide what is on screen is
the **encounter**.

A dentist draining an abscess wants temperature and pulse. The same dentist
doing a filling wants neither. Same facility, same profile, opposite needs.

This is a category error, not a tuning problem. No amount of editing
`specialtyProfile.ts` fixes it, because the variable it keys on does not vary
with the thing that matters. It is why a general OPD is currently showing a
tooth chart and a dental profile is showing blood pressure — both symptoms of
one wrong axis.

The right gate is what the chart says. See §3.

### 2.3 The output is at the bottom

The page length is the sum of every phase stacked full width. The
prescription — the thing the consultation exists to produce — is last.

For a workflow whose output is a prescription, that is the wrong end of the
page. The doctor scrolls past everything they have already entered to reach
the one thing they came for.

Note for the record: the plan used to sit **beside** the work. It was moved
below on instruction, mid-session, and it made the scroll problem worse. That
instruction should have been pushed back on rather than complied with — the
right response to "put the plan at the bottom" was "that will double the
scroll to reach medicines; here is what it will look like."

### 2.4 Everything is visible at once

Attachments, specialty examination, eight measurement cells, four chip
pickers, two ranked panels — all present on an empty consultation, before the
doctor has typed a single character.

The stated philosophy is **progressive disclosure**. The screen is the
opposite of it. An empty consult should be close to blank.

---

## 3. The asset we are not using

`src/lib/synapse/examSuggestions.ts` is a pure, working engine that ranks
**what is worth examining for** given the symptoms already entered. Its
header describes the exact cascade the product wants:

> symptoms suggest what to examine for → doctor confirms → engine re-runs →
> ranks Possible Conditions → doctor confirms → engine re-runs →
> medicines/tests

`useConsultIntelligence.ts` **computes it on every chart change and throws
the result away.** Nothing in the UI consumes `examSuggestions`. Verified by
grep, 2026-08-12.

This is the engine for progressive disclosure, and it is already built and
already running. It is not only for findings — it is the general principle. One
symptom in, and the system knows enough to say what is worth asking, worth
examining, worth measuring. The screen could start as a single search box and
**grow itself**.

**The blocker is content, not code.** `signal_finding_suggestions` holds
**10 active rules**. `signal_intent_rules` holds **1,577**. Wire it today and
it lights up for eight signals and looks broken everywhere else.

That ratio is the single highest-leverage number in this document. Closing it
is what would actually deliver the "reduce friction" promise. Everything else
in here is rearrangement; this is the thing that changes what the product
*is*.

---

## 4. What the screen should probably become

**Status: BUILT for General OPD, 2026-08-13.** Anmol's instruction was "one
specialty UI at a time, not all, not placeholder ... start with general OPD."
So this stopped being a direction and became a spec, but for one profile
only. See §8 for what shipped.

1. **One input surface, not four.** The chip vocabulary is already unified
   (`observables`). A single omni-search takes history, symptoms and findings;
   entries self-classify by their own `kind` and group visually after the
   fact. The doctor never decides which box a thing goes in.

2. **Nothing else visible until the chart earns it.** No measurements, no
   specialty examination, no attachments on an empty consult. Each appears
   because something in the chart asked for it — driven by `examSuggestions`
   and `measureRelevance`, not by the facility profile.

3. **The plan stays in view.** Beside the work, persistent, never below it.

4. **Attachments are an action, not a section.** A button in the chrome. They
   are supporting evidence — "structured first, artifact when necessary" —
   and a permanent panel contradicts the philosophy that named them
   secondary.

5. **Specialty examination is the same.** An affordance that appears when
   relevant, opening the real instrument in a modal. `ChartSurface` already
   does the modal half correctly.

The test for any future change: **does an empty consultation get shorter?**
If the answer is no, it is polish, and polish has already been tried.

---

## 5. Standing rules (do not relitigate)

- **Brand is primary. Always.** In every surface, the brand name is the
  headline and the composition is the subtitle — never the reverse. The
  doctor prescribes a product; the patient buys a product; the composition is
  what it happens to be made of. A search for "Acenac-P" that answers
  "aceclofenac" makes the doctor doubt the thing they typed exists.

- **Colour carries meaning, never mood.** blue = the action · rose = reported
  · teal = examined · amber = soft guard · red = hard guard · green = taken.

- **Guards warn, never hide.**

- **Ranking is a safety property, never a verdict.** A condition shown at
  rank 1 beside three alternatives is honest; the same label shown alone
  reads as a diagnosis. Nothing is ever presented as the cause.

- **The engine never decides which diagnosis is primary.** That is the one
  judgement in this workspace that is entirely the doctor's.

- **Module height is content-driven.** No floors, no reserved space. This has
  been violated twice by two *different* `min-height` rules; check for both.

---

## 6. Keep the medicine confirm sheet

`MedicineAddSheet` stages a medicine instead of committing it, and confirms
brand, strength, dose, timing slots, duration and food instruction in one
place. **Anmol likes this and it stays.** Before it, `+` committed whatever
brand the resolver returned at whatever dose the composition defaulted to —
a 250mg suspension and a 650mg tablet are not interchangeable because they
share a molecule.

But be honest about what it is: **it adds a step**, in a product whose thesis
is removing them. The refinement — not the removal — is to interrupt only
when there is genuine ambiguity (several strengths, no clinic default) and
otherwise commit on one key with the choices visible and correctable
afterwards.

It is **not browser-verified** as of 2026-08-12. It type-checks and builds.
Click a `+` before trusting it.

---

## 7. Mistakes made this session, recorded so they are not repeated

- **Optimised the wrong variable.** Asked to make things bigger, the type
  scale went up ~12% plus icons and hit targets. That fixed "grey and small"
  and directly worsened "too long", because the increase multiplies across
  eight vertically stacked modules. The answer to a cramped screen is *fewer
  things*, not *smaller things* — and the answer to an unreadable one is not
  necessarily *bigger things*.

- **Invented structure that was not in the reference.** The Assessment was
  built as a 47/53 two-column split with the engine's list beside the
  doctor's decision. The reference (`docs/temp/Cortex_Ref2.png`) shows one
  box: search → chip → one full-width ranked list. Read the reference before
  designing an improvement to it.

- **Four rounds of blind iteration.** Changes were reported as done without
  ever loading the page. Every round Anmol said it still looked wrong, and
  every round the reply was "not browser-verified." When the browser was
  finally opened, five real defects appeared inside twenty minutes — a second
  `min-height` floor, `overflow:hidden` silently killing `position:sticky`,
  placeholders indistinguishable from recorded vitals, disabled buttons that
  read as broken, and blood pressure clipping to `12(/ 80`.

  **Open the browser first.** Not last. None of those five were findable by
  reading code.

---

## 8. General OPD, as built

Built 2026-08-13, driven from the browser. `CaseSheet.tsx`, `BlankArt.tsx`,
`useDismiss.ts`; `ConditionsCard` rewritten to two columns; wired behind
`isGeneralOpd` in App.tsx.

### The law that was broken, on purpose

`specialtyProfile.ts`: "there is no per-specialty branch anywhere in the
render tree." Now false, deliberately. Configuration can change what goes
INSIDE a module. It can never remove a module another profile requires, and
removing modules was the entire task. Every other profile keeps the shared
SOAP column untouched until its own turn, so a dentist's screen cannot
regress while this one is rebuilt.

### The shape

A page-level command bar; a fixed-height row of Case Sheet beside
Measurements over Attachments; a two-column Assessment with ranked on the
left and confirmed on the right; then the plan panels.

**Nothing in row 1 grows.** `ROW_BUDGET` gives each group a budget in chip
rows (history 1, reported 2, examined 2, related 2) and overflow goes to the
browse modal, never down the page. The panel directly below that row is the
Assessment, and pushing it off screen exactly when the consultation gets
interesting is the failure this prevents.

The height is DERIVED, not decreed. A first attempt hard-set 268px on both
columns and sliced the BP and Pulse cells in half. The right column sizes to
its own bounded content and the left card stretches to match it.

### What reverted, and why it matters

Hiding the empty ranked panels was tried and **undone the same evening**.
Each of those panels carries the SEARCH BOX that reaches a medicine or a test
the engine never ranked, so hiding the panel hid the only way in. Ranking
decides what is OFFERED, never what is REACHABLE, and tidiness does not
outrank that. Empty states were made compact and illustrated instead.

### Rules this pass added

- **Reordering, not revealing, for INPUTS.** The system may hide what it has
  nothing to say about. It may never hide what the doctor might want to say.
  An empty ranked list is safe to hide; a measurement field is not.
- **Relevance marks by ADDING, never by dimming its neighbours.** Same size,
  same position, same weight, and the mark clears the moment a value lands.
- **Blue tint means "worth taking"; amber means "the value you entered is out
  of range".** Two different states. Sharing a colour would blur "please
  measure this" into "this reading is bad".
- **Relevance in words, never numbers.** A percentage is a verdict, a word is
  a reading. Ref2 dropped Ref1's percentage bars for exactly this reason.
- **Blank states are drawn, not apologised for.** `BlankArt.tsx` is one
  family: inline SVG, one line weight, palette only from the colour rule at
  its lightest, and the subject is always the thing that will fill the panel,
  at rest. Never a magnifying glass, never a sad face.
- **Gloss on the objects, flat paper for the ground.** This overrides
  consult.css's "no gradients" line, narrowly. If the card were glossy too,
  nothing would read as foreground.
- **History is violet, not blue.** Blue is the action colour and was being
  spent on a chip category.

### Naming

The input surface is the **Case Sheet**: named after the doctor's own
artefact, never after the software's function. "Master search" is a feature
name and that is precisely what makes it grate. The exam suggestions are
**Related findings**, not "worth examining for" — worth is a verdict the
software should not be issuing; a relationship is a fact.

---

## 8a. The visual pass that followed, and why it was allowed

2026-08-13, same day, after §8 shipped. §0 of this document says visual work
cannot fix this screen. That was true of the screen §0 described. Once the
structure was rebuilt, the remaining complaints — grey text, weak hierarchy,
dead white space — stopped being symptoms of the structural fault and became
the actual defects. Details in `aren-cortex-atlas.md` §14.16.

Four rules came out of it that belong here rather than in a changelog:

- **A stylesheet's type ramp is a claim, not a fact.** `consult.css` authored
  nine font weights; `index.html` loaded four static cuts, so six of the nine
  rendered as something else and the hierarchy the CSS described did not exist
  on screen. Check the rendered page, not the declaration.

- **"It still looks grey" after darkening the greys means the ramp has too few
  rungs, not the wrong values.** Two passes moved the tokens darker and both
  were rejected. The fault was that structural micro-labels and ornament shared
  one rung, so the words carrying the page's skeleton were rendered as
  decoration. A fourth rung fixed what two rounds of tuning could not.

- **A hierarchy in which every level is the top level is a list.** Six modules
  at one title treatment meant Attachments shouted as loudly as the Assessment.
  Emphasis is only visible where something else is de-emphasised.

- **An empty panel should be SHORT, and centred in what is left.** Reserve
  nothing. And where a void genuinely cannot be removed — the Case Sheet is
  height-locked to the column beside it — FILL it rather than float a small
  drawing in the middle of it. A 62px illustration in a 300px well is what
  makes the well read as an accident.

The test in §4 still stands and this pass passes it: an empty consultation got
**128px shorter**, and the Assessment header came above the fold.

---

## 9. Further reading

- `docs/temp/Cortex_Ref2.png` — the visual target. Language, not pixels.
- `docs/Aren cortex visual philosophy.md` — the original doctrine.
- `aren-cortex-atlas.md` §14.14 — what actually changed in this session, and
  the `search_intents` catalogue bug (46% of products were unreachable).
- `aren-frontdesk-source-of-truth.md` — the reception half's design reasoning,
  which is further along than this one and worth reading for tone.

*This document exists because a session of visual work failed to fix a
structural problem. If the next session begins by adjusting tokens, it will
fail the same way.*
