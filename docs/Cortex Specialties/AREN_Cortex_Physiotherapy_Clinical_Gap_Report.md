---
date: 17 August 2026
title: AREN Cortex --- Physiotherapy Clinical Gap & Requirements Report
---

# AREN Cortex --- Physiotherapy Clinical Gap & Requirements Report

## Purpose

This document defines **what is still clinically missing from AREN
Cortex for physiotherapy**.

It deliberately does **not** prescribe the technical implementation,
database design, component architecture, UI solution, ranking algorithm,
or development plan.

The question here is purely clinical:

> **What does a physiotherapist actually need to capture, reason
> through, reassess, and manage during a real rehabilitation episode ---
> and which of those things does Cortex currently fail to represent?**

The current Cortex physiotherapy experience already has a useful
foundation: a General OPD-style case sheet, a body/joint map,
dynamically surfaced measurements, ranked assessment, therapy and
exercise plans, longitudinal trends, exercise progression, and care
plans.

The central finding is that the remaining gap is **not primarily a lack
of physiotherapy-specific fields**.

The deeper gap is that the current consultation model still represents
the encounter primarily as:

> **observables → signals → ranked conditions → treatment**

Whereas physiotherapy is more accurately represented as:

> **patient story → functional problem → clinical hypothesis → targeted
> examination → findings/measures → clinical interpretation →
> intervention → immediate response → reassessment → progression toward
> patient goals**

Cortex therefore needs a more physiotherapy-native **clinical reasoning
model**, not merely a larger set of physiotherapy inputs.

------------------------------------------------------------------------

# 1. Current Clinical State of Cortex

A current first visit can approximately proceed as follows:

1.  Patient is selected and physiotherapy is the active
    facility/specialty profile.
2.  Consultation opens in the General OPD case-sheet layout.
3.  The clinician searches history, symptoms, and findings.
4.  Relevant items become chips/observables.
5.  The body/joint map localizes a complaint and exposes related
    observations.
6.  Measurements become contextually relevant.
7.  Assessment produces ranked clinical possibilities.
8.  Therapy and exercise plans are selected.
9.  Exercises are prescribed with dose information.
10. A care plan can be attached to the episode.
11. Subsequent visits can show longitudinal trends.
12. Exercise dosage can be compared between visits.

This is already enough to create a **usable physiotherapy-flavored
consultation workflow**.

The strongest existing pieces are:

-   longitudinal patient tracking;
-   exercise prescription and progression;
-   care-plan/session tracking;
-   anatomical localization;
-   contextually surfaced measurements;
-   basic trend visualization;
-   integration with the existing clinical search/observable model.

The problem is that the **clinical meaning between those pieces is still
thin**.

------------------------------------------------------------------------

# 2. The Core Clinical Difference

General outpatient medicine often revolves around:

> What symptoms and findings does the patient have, what condition could
> explain them, and what should be prescribed?

Physiotherapy has a broader functional question:

> What is limiting this person's movement or function, why is it
> happening, how irritable is it, what can be demonstrated on
> examination, what can be changed, and is the patient actually
> progressing toward a meaningful functional goal?

A physiotherapy encounter therefore cannot be adequately represented as
a list of:

-   symptoms;
-   findings;
-   numbers;
-   diagnoses;
-   exercises.

The relationship between them matters.

For example:

**Patient statement**

> "I can walk for about ten minutes before my knee starts hurting."

is clinically different from:

> "Knee pain."

The first contains:

-   symptom;
-   activity;
-   aggravating threshold;
-   functional limitation;
-   tolerance.

Likewise:

> "Pain is worse for about 30 minutes after getting out of bed, then
> settles."

contains information about:

-   24-hour behavior;
-   irritability;
-   symptom settling time;
-   temporal pattern.

These are currently not represented adequately.

------------------------------------------------------------------------

# 3. The Missing Clinical Model

The major missing layer can be summarized as:

## Patient story → hypothesis → examination → response

A real physiotherapist does not simply collect every available
measurement.

The therapist begins with a story and develops hypotheses.

Those hypotheses determine what should be examined.

The findings then change the therapist's confidence in those hypotheses.

Treatment can then produce an immediate response.

That response may further change the therapist's interpretation or
treatment direction.

Therefore the clinical process is iterative.

### Current Cortex model

> Observable → signal → ranked intent → treatment

### Required physiotherapy model

> Patient story\
> ↓\
> Symptoms + behavior + function + goals\
> ↓\
> Clinical hypotheses\
> ↓\
> Targeted examination\
> ↓\
> Findings + measurements\
> ↓\
> Clinical interpretation\
> ↓\
> Intervention\
> ↓\
> Immediate response / re-test\
> ↓\
> Updated interpretation\
> ↓\
> Plan and home program\
> ↓\
> Follow-up reassessment

The missing pieces are therefore not merely "more fields."

They are **relationships between clinical observations**.

------------------------------------------------------------------------

# 4. Gap: Symptom Behavior

## What is missing

The current model can represent that the patient has knee pain.

It does not adequately represent **how the pain behaves**.

A physiotherapist commonly needs to understand:

-   aggravating activities;
-   easing activities;
-   movement or load sensitivity;
-   symptom onset threshold;
-   symptom settling time;
-   morning behavior;
-   evening behavior;
-   night symptoms;
-   rest symptoms;
-   intermittent versus constant symptoms;
-   activity tolerance;
-   irritability;
-   whether symptoms are predictable or variable.

### Example

> Walking is comfortable for 10 minutes, then pain rises from 2/10 to
> 6/10 and takes approximately 20 minutes of rest to settle.

This is clinically richer than:

> Knee pain = 6/10.

The system needs to represent the **behavior of the symptom**, not only
its presence and intensity.

------------------------------------------------------------------------

# 5. Gap: Irritability

Irritability is particularly important because it influences how
aggressively a therapist can examine and treat a patient.

A patient with:

-   high pain;
-   very low aggravation threshold;
-   rapid symptom escalation;
-   prolonged settling time;

is clinically different from a patient with the same pain score who
tolerates substantial loading.

The important concept is not merely:

> Pain = 7/10.

It is:

> **How easily can this patient's symptoms be provoked, and how long do
> they take to settle?**

The system therefore needs a clinical representation of symptom
irritability and/or equivalent symptom-response characteristics.

This should not necessarily become a rigid questionnaire.

The clinical requirement is that the record can capture enough
information for the therapist to understand **dosing tolerance and
symptom behavior**.

------------------------------------------------------------------------

# 6. Gap: 24-Hour Pattern

The current model lacks a proper representation of temporal symptom
behavior.

A physiotherapist may need to know:

-   morning stiffness duration;
-   night pain;
-   sleep disturbance;
-   symptoms after prolonged sitting;
-   symptoms after prolonged activity;
-   symptoms later the same day after treatment;
-   next-day response to exercise.

This becomes particularly important when determining whether a treatment
load was appropriate.

A longitudinal record should eventually be capable of distinguishing:

> "Pain was lower immediately after treatment."

from:

> "Pain was lower immediately after treatment but significantly worse
> the following morning."

Those are clinically different responses.

------------------------------------------------------------------------

# 7. Gap: Functional Limitation

This is one of the largest current gaps.

A symptom is not the same thing as a functional limitation.

Examples:

**Symptom**

> Right knee pain.

**Functional limitation**

> Cannot climb stairs normally.

**Activity tolerance**

> Can walk approximately 10 minutes before symptoms increase.

**Participation problem**

> Cannot sit on the floor with family.

Physiotherapy is heavily concerned with what the patient **cannot do**,
what they can do with difficulty, and what they want to return to doing.

The record therefore needs a first-class concept for:

-   activity limitation;
-   functional capacity;
-   activity tolerance;
-   participation restriction;
-   task-specific difficulty.

------------------------------------------------------------------------

# 8. Gap: Patient-Nominated Goal

A rehabilitation plan should not be defined solely by measurements.

The patient may care about:

-   walking to work;
-   climbing stairs;
-   returning to sport;
-   sitting on the floor;
-   lifting a child;
-   returning to a job;
-   sleeping without pain;
-   independently performing daily activities.

The system currently has care-plan structure, but it does not adequately
represent the patient's own desired functional outcome.

A clinically meaningful rehabilitation record should be able to answer:

> **What does this patient actually want to be able to do again?**

The goal should be connected conceptually to:

-   the patient's limitation;
-   baseline status;
-   treatment;
-   progress;
-   eventual outcome.

------------------------------------------------------------------------

# 9. Gap: Physiotherapy Examination

The current system has findings, but a physiotherapy examination is more
structured than a generic finding list.

The clinical record may need to distinguish:

## Observation

-   posture;
-   swelling;
-   deformity;
-   asymmetry;
-   muscle wasting;
-   guarding;
-   movement pattern;
-   gait.

## Palpation

-   tenderness;
-   tissue sensitivity;
-   temperature;
-   swelling;
-   spasm;
-   specific anatomical tenderness.

## Movement

-   active range of motion;
-   passive range of motion;
-   painful range;
-   end-feel;
-   movement quality;
-   movement compensation.

## Strength

-   manual muscle testing;
-   graded strength;
-   muscle performance;
-   endurance where relevant.

## Neurological examination

Where clinically indicated:

-   sensation;
-   myotomes;
-   reflexes;
-   neural tension;
-   neurological signs.

## Functional examination

Depending on the case:

-   squat;
-   sit-to-stand;
-   gait;
-   stairs;
-   balance;
-   lifting;
-   reaching;
-   task-specific movement.

## Special / clinical tests

The system needs to distinguish an actual examination/test from a
generic statement.

For example:

> Lachman test --- right knee --- positive

is structurally different from:

> "Knee instability."

The clinical record should preserve that distinction.

------------------------------------------------------------------------

# 10. Gap: AROM vs PROM

Range of motion cannot remain simply:

> Knee flexion = 95°.

Clinically, the therapist may need to distinguish:

-   active ROM;
-   passive ROM;
-   side;
-   movement;
-   pain during movement;
-   end-feel;
-   limitation type;
-   change from previous measurement.

For example:

> Right knee AROM flexion: 95°\
> Right knee PROM flexion: 110°

contains much more clinical information than a single number.

The requirement is therefore not simply "more ROM fields."

It is **semantically meaningful movement measurement**.

------------------------------------------------------------------------

# 11. Gap: Strength / MMT

The current model does not adequately represent muscle strength
examination.

Manual muscle testing can involve:

-   muscle/group;
-   side;
-   grade;
-   pain during testing;
-   comparison with opposite side;
-   change over time.

Example:

> Right quadriceps --- MMT 4/5\
> Left quadriceps --- MMT 5/5

This is a clinically different object from:

> Quadriceps weakness.

Both should be possible.

One is an **objective measurement**.

The other is an **interpreted finding/impairment**.

That distinction is important.

------------------------------------------------------------------------

# 12. Gap: Special Test Semantics

Special tests cannot remain generic text findings forever.

A proper examination result may need:

-   test name;
-   anatomical region;
-   side;
-   result;
-   possibly grade;
-   interpretation;
-   date/session;
-   relationship to the clinical hypothesis.

For example:

> Test: Lachman\
> Side: Right\
> Result: Positive

The clinical requirement is to preserve the **test-result
relationship**, rather than only storing a textual finding.

------------------------------------------------------------------------

# 13. Gap: Clinical Hypothesis vs Final Diagnosis

The current assessment ranking is oriented toward conditions such as:

-   ligament sprain;
-   meniscal injury;
-   osteoarthritis.

That can be useful, but it should not become the entire physiotherapy
assessment model.

A physiotherapy assessment often needs to express:

## Clinical impression

What the therapist believes is happening.

## Impairments

Examples:

-   reduced ROM;
-   weakness;
-   reduced balance;
-   altered movement control;
-   pain;
-   swelling.

## Activity limitations

Examples:

-   difficulty climbing stairs;
-   difficulty squatting;
-   reduced walking tolerance.

## Participation restrictions

Examples:

-   unable to return to sport;
-   difficulty performing work;
-   unable to participate in desired activities.

## Possible underlying condition / differential

Where clinically relevant.

Cortex should therefore be able to represent the **problem
representation**, not just rank a disease label.

------------------------------------------------------------------------

# 14. Gap: Examination Should Be Hypothesis-Driven

This is a major clinical distinction.

A physiotherapist should not necessarily perform every available test.

The initial history generates hypotheses.

The hypotheses determine which examinations are useful.

The examination then changes the hypothesis.

Therefore:

> **Clinical context should determine which examination information is
> relevant.**

This is already partially reflected in Cortex through context-sensitive
measurement surfacing.

That direction is clinically sound.

The missing requirement is to extend the same principle beyond
measurements to the broader examination process.

------------------------------------------------------------------------

# 15. Gap: Within-Session Re-Test

This is one of the most important missing concepts.

Longitudinal trend:

> Visit 1 → Visit 2 → Visit 3

is useful.

But physiotherapy also frequently involves:

> **Baseline → intervention/test → immediate re-test**

Example:

> Knee flexion before intervention: 70°\
> Intervention performed\
> Knee flexion after intervention: 88°

Or:

> Pain with squat: 7/10\
> Movement modification/manual intervention\
> Pain with squat: 4/10

This is not simply a second measurement.

It is a **response to an intervention or test**.

The record needs to preserve:

-   baseline;
-   intervention/test;
-   immediate response;
-   post-intervention measurement;
-   interpretation.

The current longitudinal trend model is designed for cross-visit trends
and therefore does not adequately represent this relationship.

------------------------------------------------------------------------

# 16. Gap: Treatment Response

Treatment should not be treated as a one-way event:

> Exercise prescribed → saved.

The clinical record should eventually be able to answer:

> What happened after the intervention?

Possible responses include:

-   improved immediately;
-   unchanged;
-   worsened;
-   tolerated well;
-   symptom reproduced;
-   movement improved;
-   movement worsened;
-   delayed aggravation;
-   next-day response.

This is particularly important because physiotherapy is iterative.

The patient's response can influence the next treatment decision.

------------------------------------------------------------------------

# 17. Gap: Outcome Measures

The current trend system is useful but should not be confused with
validated outcome measurement.

A raw trend such as:

> Pain 7 → 4

is not equivalent to a validated patient-reported outcome.

Depending on the clinical area, physiotherapists may use standardized
measures such as:

-   Oswestry Disability Index;
-   WOMAC;
-   LEFS;
-   DASH/QuickDASH;
-   KOOS;
-   PSFS;
-   other condition-specific or general outcome measures.

The clinical requirement is not to support every possible questionnaire
immediately.

The requirement is to have an **outcome-measure concept** that can
represent:

-   instrument;
-   score;
-   date;
-   baseline;
-   subsequent score;
-   clinically meaningful change.

------------------------------------------------------------------------

# 18. Gap: Patient-Specific Functional Scale / Patient-Authored Outcomes

A particularly important example is the PSFS-style concept.

The patient identifies activities that matter to them and rates their
ability.

For example:

> "Climb two flights of stairs" --- 3/10\
> "Sit on the floor" --- 2/10\
> "Walk to work" --- 5/10

This is different from a predefined symptom chip.

It is **patient-authored clinical information**.

The current model does not have a meaningful home for patient-authored
goals/outcomes.

This should eventually become a first-class clinical concept.

------------------------------------------------------------------------

# 19. Gap: Meaningful Change / MCID

Trend visualization can show that a value changed.

Clinical interpretation asks a harder question:

> **Was the change meaningful?**

A change from 7 to 6 may be numerically real but clinically
insignificant.

A change in a validated outcome score may have a known minimal
clinically important difference.

Therefore the clinical model eventually needs to distinguish:

-   measurement noise;
-   numerical change;
-   meaningful clinical change.

The existing trend noise-floor logic is useful for avoiding false visual
signals, but it is not equivalent to clinical significance.

------------------------------------------------------------------------

# 20. Gap: Rehabilitation Dosing

Exercise progression is already one of the stronger areas of Cortex.

The missing clinical context is **why the dose was progressed,
maintained, or reduced**.

A therapist may change dosage because:

-   symptoms are well tolerated;
-   symptoms are too irritable;
-   strength improved;
-   movement quality improved;
-   patient is ready for progression;
-   exercise was too difficult;
-   adherence was poor;
-   next-day symptoms increased.

Therefore:

> **Dose + response + rationale**

is clinically richer than:

> **Dose changed from 3×10 to 3×12.**

The existing progression engine is a good foundation; the clinical
context surrounding progression is what remains missing.

------------------------------------------------------------------------

# 21. Gap: Adherence

Home exercise is not simply prescribed.

The therapist needs to know whether the patient actually did it.

Relevant information can include:

-   completed as prescribed;
-   partially completed;
-   not performed;
-   too painful;
-   too difficult;
-   forgot;
-   equipment unavailable;
-   exercise misunderstood;
-   exercise easy and ready to progress.

Adherence can explain why an apparently appropriate treatment plan did
or did not produce improvement.

This is clinically relevant longitudinal information.

------------------------------------------------------------------------

# 22. Gap: Education and Advice

The plan should not be limited to exercises and physical modalities.

Physiotherapy management can include:

-   activity modification;
-   ergonomic advice;
-   pacing;
-   education;
-   movement advice;
-   precautions;
-   self-management;
-   assistive-device education.

These are part of the treatment plan even though they are not
"exercises."

------------------------------------------------------------------------

# 23. Gap: Red Flags / Referral Context

A physiotherapy consultation also needs to recognize when the
presentation does not fit routine rehabilitation.

The clinical model should be capable of representing relevant warning
signs and escalation/referral decisions.

The purpose is not to make Cortex diagnose emergencies.

The purpose is to preserve the clinical fact that:

> **The therapist identified something requiring a different pathway.**

This belongs to the broader clinical reasoning layer.

------------------------------------------------------------------------

# 24. What Is Already Strong

The existing architecture should not be regarded as a failed
physiotherapy design.

Several pieces are already aligned with real rehabilitation workflows.

## Longitudinal band

Showing:

> pain 7 → 4\
> ROM 70° → 95°

is exactly the kind of longitudinal context that becomes valuable in
rehabilitation.

## Exercise progression

Comparing exercise dose across visits and respecting units is a strong
foundation.

## Care plans

A multi-session rehabilitation episode is much closer to physiotherapy
reality than isolated prescriptions.

## Anatomical localization

The joint/body map is valuable because physiotherapy is highly spatial
and movement-oriented.

## Context-sensitive measurements

Surfacing relevant measurements based on the active clinical picture is
directionally correct.

## Exercise plans as a first-class treatment object

This is much better than treating exercises as generic text.

------------------------------------------------------------------------

# 25. The Most Important Conceptual Shift

The goal should not be:

> "Make the General OPD screen contain more physiotherapy fields."

The goal should be:

> **Make the clinical record capable of representing the
> physiotherapist's reasoning process.**

That means Cortex should eventually be able to reconstruct:

### What the patient said

> "My knee hurts after 10 minutes of walking."

### What matters to the patient

> "I want to walk to work."

### What the therapist suspected

> "Load-related mechanical knee problem."

### What the therapist examined

> ROM, strength, movement, functional task, relevant clinical tests.

### What was found

> Restricted flexion, quadriceps weakness, painful loaded flexion.

### What was measured

> ROM, pain, strength, function.

### What was done

> Exercise/manual intervention/education/etc.

### What happened

> Immediate response and later response.

### What changed

> Pain, ROM, strength, function, outcome score.

### What happens next

> Progress, maintain, regress, reassess, refer, or discharge.

That is the clinically meaningful unit.

------------------------------------------------------------------------

# 26. Required Clinical Capabilities --- Summary

The remaining clinical requirements can be grouped into ten broad areas.

## A. Patient story

The system must represent:

-   onset;
-   mechanism;
-   symptom behavior;
-   aggravating factors;
-   easing factors;
-   24-hour pattern;
-   irritability;
-   activity tolerance;
-   relevant history.

## B. Anatomy

The system must represent:

-   site;
-   laterality;
-   anatomical region;
-   symptom localization;
-   relationships between sites.

## C. Function

The system must represent:

-   activity limitation;
-   participation limitation;
-   task tolerance;
-   functional capacity.

## D. Patient goals

The system must represent:

-   patient-nominated goals;
-   desired activities;
-   meaningful outcomes.

## E. Examination

The system must represent:

-   observation;
-   palpation;
-   AROM;
-   PROM;
-   strength/MMT;
-   neurological findings where relevant;
-   special tests;
-   functional tests;
-   gait/balance/movement assessment.

## F. Measurement

The system must represent:

-   value;
-   unit;
-   side;
-   movement;
-   method/context;
-   baseline;
-   subsequent measurement.

## G. Clinical reasoning

The system must represent:

-   hypotheses;
-   impairments;
-   functional problems;
-   clinical impression;
-   differential considerations;
-   confidence/relevance where appropriate.

## H. Intervention and response

The system must represent:

-   treatment;
-   exercise;
-   dose;
-   education;
-   intervention response;
-   immediate re-test;
-   delayed/next-day response.

## I. Rehabilitation progression

The system must represent:

-   progression;
-   regression;
-   maintenance;
-   tolerance;
-   adherence;
-   rationale for dose changes.

## J. Outcomes

The system must represent:

-   functional goals;
-   outcome measures;
-   patient-reported outcomes;
-   meaningful change;
-   discharge/goal completion.

------------------------------------------------------------------------

# 27. What the Finished Physiotherapy Clinical Record Should Be Able to Tell

At the end of a good consultation, Cortex should eventually be capable
of answering these questions:

1.  **Why did the patient come?**
2.  **Where are the symptoms?**
3.  **How do the symptoms behave?**
4.  **What activities provoke them?**
5.  **What activities are limited?**
6.  **What does the patient want to get back to?**
7.  **What did the therapist observe?**
8.  **What did the therapist physically test?**
9.  **What objective measurements were obtained?**
10. **What clinical impression emerged?**
11. **What impairments and functional problems were identified?**
12. **What was done during the session?**
13. **How did the patient respond immediately?**
14. **What was prescribed for home?**
15. **Was the home program followed?**
16. **What happened between visits?**
17. **What changed objectively?**
18. **What changed functionally?**
19. **Was the change meaningful?**
20. **What should happen next?**

If Cortex cannot answer these questions from the clinical record, it is
still primarily a General OPD system with physiotherapy extensions.

If it can, it has become a genuine physiotherapy clinical workspace.

------------------------------------------------------------------------

# 28. Final Assessment

AREN Cortex is **not starting from zero**.

The current implementation already contains a credible rehabilitation
skeleton:

> anatomical localization + contextual measurements + exercise
> prescription + progression + care plans + longitudinal tracking.

That is valuable.

The remaining problem is concentrated in the **clinical middle of the
consultation**.

The biggest missing pieces are:

1.  symptom behavior;
2.  irritability;
3.  aggravating/easing factors;
4.  24-hour pattern;
5.  functional limitations;
6.  patient-nominated goals;
7.  structured physiotherapy examination;
8.  AROM vs PROM;
9.  strength/MMT;
10. meaningful special-test semantics;
11. clinical hypothesis/problem representation;
12. within-session re-test;
13. treatment response;
14. adherence;
15. validated/patient-specific outcome measures;
16. meaningful clinical change;
17. treatment-dose rationale;
18. red-flag/referral context.

The central conclusion is therefore:

> **Cortex currently knows that physiotherapy happened. It does not yet
> fully know what the physiotherapist was thinking.**

That is the gap to close.

The next stage of the product should therefore be driven by **clinical
representation**, not by adding a larger collection of
specialty-specific UI controls.

The implementation strategy can be decided separately. The clinical
requirement is simply that the resulting system must preserve the chain:

> **Patient → problem → function → hypothesis → examination →
> measurement → interpretation → intervention → response → progression →
> outcome.**

That chain is the clinical backbone of a real physiotherapy episode of
care.

------------------------------------------------------------------------

# References / Clinical Basis

The clinical framing in this document is aligned with established
physiotherapy patient-management concepts, including history,
examination, tests and measures, evaluation, diagnosis/clinical
impression, prognosis, intervention, re-examination and outcomes.

Primary reference:

-   American Physical Therapy Association (APTA), Patient/Client
    Management Model and Initial Examination guidance.

Additional clinical reference:

-   Ministry of Health & Family Welfare, Government of India --- Model
    Curriculum Handbook for Physiotherapy.

A useful Indian outpatient orthopedic physiotherapy assessment template
is also available through JSS Academy of Higher Education & Research.

These references support the distinction between subjective history,
objective examination, tests/measures, clinical interpretation,
intervention, re-examination and outcomes.
