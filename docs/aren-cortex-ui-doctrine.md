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

Held loosely — this is a direction, not a spec, and it needs Anmol's
judgement before anyone builds it.

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

## 8. Further reading

- `docs/temp/Cortex_Ref2.png` — the visual target. Language, not pixels.
- `docs/Aren cortex visual philosophy.md` — the original doctrine.
- `aren-cortex-atlas.md` §14.14 — what actually changed in this session, and
  the `search_intents` catalogue bug (46% of products were unreachable).
- `aren-frontdesk-source-of-truth.md` — the reception half's design reasoning,
  which is further along than this one and worth reading for tone.

*This document exists because a session of visual work failed to fix a
structural problem. If the next session begins by adjusting tokens, it will
fail the same way.*
