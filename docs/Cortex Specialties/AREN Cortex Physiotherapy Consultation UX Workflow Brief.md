    title: "AREN Cortex — Physiotherapy Consultation UX & Workflow Brief"
    date: "20 August 2026"

# AREN Cortex — Physiotherapy Consultation UX & Workflow Brief

## Purpose

This brief defines the intended clinical workflow, UI philosophy, and interaction direction for the Physiotherapy workspace in AREN Cortex.

It is not an implementation specification. The implementation agent should determine the appropriate components, state model, data flow, and technical approach.

The objective is simple:

> Make a physiotherapist's consultation feel like clinical work, not like filling out a digital form.

## 1. Core UX Problem

The physiotherapy model contains useful information across story, onset, duration, aggravating/easing factors, 24-hour pattern, irritability, settling time, goals, findings, measurements, examination, assessment, exercises, treatment, investigations, attachments, and longitudinal progress.

All of these may be clinically useful, but they should not all be visible simultaneously.

The interface must avoid becoming a prettier paper form:

> "Here are 50 things. Please fill whichever apply."

The preferred interaction is:

> Search → select → confirm → continue.

Search/fuzzy matching should be the primary discovery mechanism wherever possible. Chips should mainly act as compact confirmation/display rather than as a giant checkbox collection.

## 2. Core Philosophy: Cortex Knows More Than It Shows

The system may support a deep clinical vocabulary and many physiotherapy observations.

The default interface should expose only what is relevant to the current patient, complaint, anatomical site, and stage of consultation.

Examples:

* A knee complaint can surface knee-relevant examination options.
* A shoulder complaint can surface shoulder-relevant movement options.
* A selected finding can make a relevant measurement discoverable.
* Less frequently required information can remain behind expansion/search.
* Unrelated measurements and examination fields should not occupy the default workspace.

The system should support breadth without displaying breadth.

## 3. Story: One Unified Clinical Input

Story should not be a fixed questionnaire containing permanent rows for duration, onset, worse with, better with, pattern, irritability, and settling time.

These are clinical dimensions, not mandatory UI sections.

Use one primary interaction:

> Add to story…

The interaction should use the existing observable/search architecture. No voice transcription or LLM sentence interpretation is assumed.

The intended behavior is guided autocomplete:
    Add to story...
    → Knee pain

    Knee pain
    → 3 weeks

    Knee pain · 3 weeks
    → Gradual onset

    Knee pain · 3 weeks · Gradual onset
    → Worse downstairs

    Knee pain · 3 weeks · Gradual onset · Worse downstairs
    → Better with rest

The resulting story can be displayed compactly as:

> Knee pain · 3 weeks · gradual onset · worse downstairs · better with rest

The clinician does not type the complete sentence. The system constructs a structured clinical statement through search and selection.

The clinician must be able to stop at any point. Do not force completion of every Story dimension.

## 4. Story and Case Sheet

Story and Case Sheet should not compete as two separate ways of entering the same information.

**Story** represents how the patient describes the problem and its behavior.

Example:

> Knee pain → 3 weeks → worse downstairs → better with rest.

**Case Sheet** represents structured clinical evidence accumulated during the consultation.

Example:

> Knee painRestricted ROMQuadriceps weaknessSwellingTenderness

Both surfaces may activate the same underlying clinical observables/signals where appropriate. The clinician should not enter the same fact twice merely because it was discovered through a different surface.

## 5. Goals

Patient goals should appear early because they provide context for rehabilitation.

Examples:

* return to running;
* climb stairs without pain;
* sit on the floor;
* return to sport;
* walk to work.

Goals are patient-authored clinical context. Record them and connect them to rehabilitation progress, but do not treat them as diagnostic ranking signals.

## 6. Measurements: General vs Anatomical

General measurements can remain lightweight and broadly visible where appropriate:

* BP;
* pulse;
* temperature;
* SpO₂;
* weight.

Joint-specific physiotherapy measurements should not permanently sit beside these.

Examples:

* knee flexion;
* knee extension;
* shoulder abduction;
* shoulder rotation;
* MMT;
* grip strength;
* girth.

These belong to the relevant anatomical examination.

A generic "ROM" card is ambiguous when a patient has, for example, a left shoulder problem and a right knee problem.

Therefore:

> General Measurements = general patient measurements.

> Body Map / Examination = anatomical measurements and examination findings.

## 7. Body Map: Contextual Tool

The full SVG body map should not permanently occupy consultation space.

The default consultation should show only a compact summary/widget, for example:

> Body map & examinationRight knee · 2 ROM · 1 strength · 2 tests

Selecting it opens the detailed body-map/examination interface.

Within that context, the clinician can:

* select anatomical site;
* select laterality;
* record symptoms/findings;
* access relevant ROM;
* record strength/MMT;
* perform relevant special tests;
* record other site-specific findings.

After completion, the main consultation returns to the compact summary.

The body map is an anatomical context switch, not another permanent dashboard section.

## 8. Assessment

Assessment remains a distinct clinical reasoning area containing ranked conditions/clinical impressions, ranked impairments, relevant findings, and clinician confirmation.

Synapse should continue ranking from meaningful combinations of evidence.

Not every Story datum should automatically become a ranking signal.

Three roles remain distinct:

**Rank** — information with a credible discriminatory or clinically useful relationship to a ranked intent.

**Guard** — information that justifies a caution/flag on an intervention without changing its ranking. The current `intent_guards` mechanism is the basis for this and currently flags rather than modifying dose or hiding recommendations.

**Record** — clinically useful information that should remain in the record without automatically influencing ranking.

## 9. Plan and Exercise Plan

Assessment and today's plan should sit close together because the clinician naturally moves from:

> What do I think is happening?

to:

> What am I doing about it?

Exercise Plans remain a first-class treatment object.

The plan may include exercises, therapy/modalities, advice, and relevant referrals/investigations.

## 10. Longitudinal Summary

Longitudinal information is valuable in physiotherapy but should not dominate the consultation.

The top should behave as a compact recovery context strip showing only important trends such as pain, functional score, relevant ROM, and care-plan/session progress.

Detailed history remains available when opened.

The goal is immediate longitudinal awareness without turning the consultation into a dashboard.

## 11. Secondary Information

Investigations and attachments are important but should not compete with the primary consultation flow. Keep them compact and expandable.

Attachments are supporting evidence, not a major step in the clinical reasoning sequence.

Clinical Suggestions can provide a searchable/ranked pool of tests, referrals, advice, and other relevant actions without flooding the primary surface.

## 12. Progressive Disclosure Rules

1. Do not show a field merely because the system supports it.
2. Use clinical context to surface relevant information.
3. Use search as the primary discovery mechanism.
4. Use chips as confirmation, not as giant checkbox collections.
5. Keep anatomical detail behind body-site context.
6. Keep general measurements separate from anatomical measurements.
7. Allow clinicians to stop without completing every available dimension.
8. Keep secondary information discoverable but visually quiet.
9. Prefer one compact summary over a permanent detailed panel.
10. Never make documentation completeness more important than consultation speed.

## 13. Target Experience

The consultation should feel approximately like:

> Patient story↓Relevant structured context appears↓Goal↓Clinical evidence↓Relevant examination through body/site context↓Assessment↓Treatment / exercise plan↓Progress tracked longitudinally

The clinician should never feel that Cortex is asking:

> "Which form section do you want to fill next?"

It should instead feel like:

> "What is relevant to this patient right now?"

## 14. Reference Image: Use for Direction, Not as a Fixed Layout

The provided physiotherapy reference image should be reviewed alongside this brief when refining the UI.

It is a **design reference, not a specification or pixel-perfect target**.

Some aspects of the reference demonstrate the intended direction well:

* compact clinical cards;
* strong information hierarchy;
* search-first input;
* progressive disclosure;
* compact body-map/examination summary;
* clear separation between assessment and treatment;
* restrained visual density.

Other aspects should **not** be copied blindly.

In particular, the large longitudinal summary at the top should not permanently consume two full rows of consultation space. The longitudinal context is useful, but it should become more compact and may eventually fold into or extend toward the sidebar/context area. The sidebar can therefore begin slightly lower if that creates more useful consultation space.

The current reference also contains a consultation-progress structure such as:

> Story → Examination → Assessment → Plan → Review & Print

This is useful as a possible workflow concept, but it is **not yet a settled requirement**. Evaluate whether this structure genuinely helps the physiotherapist navigate the consultation or simply adds another layer of visual UI. The same applies to other reference-image sections whose permanent visibility may not justify their screen space.

The reference should therefore be read as:

> **"This demonstrates some promising interaction and visual ideas."**

not:

> **"Reproduce this exact arrangement."**

The implementation should preserve the agreed clinical and UX principles even when that requires changing the reference layout.

## 15. Open UI Decisions

Some UI decisions should remain deliberately open while the interaction is refined.

Questions to evaluate include:

* Should the consultation-progress rail remain permanently visible, become collapsible, or disappear entirely?
* How much longitudinal information should remain visible by default versus moving into the sidebar or an expandable context view?
* Which sections deserve permanent visual weight, and which should become compact summaries?
* Should Attachments remain a visible section or become a quieter utility?
* Should Clinical Suggestions remain beside Assessment/Plan or become an expandable contextual surface?
* How much of the Story should be visible after capture before it collapses into a compact summary?
* When should the Body Map open as a modal/context view versus an inline expansion?

These are **UX validation questions, not predetermined implementation requirements**.

The guiding criterion for each decision is:

> **Does this help the clinician understand or act on the current patient, or does it merely expose functionality that happens to exist?**

## 14. Final Design Principle

The Physiotherapy workspace should not attempt to make the entire clinical model visible.

It should make the next useful clinical action obvious.

> Deep underneath. Minimal on the surface.

Cortex can know the full physiotherapy vocabulary, but the clinician should see only the small subset that matters at that moment.

That is the intended UX direction for the next iteration.
