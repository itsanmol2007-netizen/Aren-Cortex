AREN Cortex — Consultation Visual Philosophy
============================================

Version: 1.1Status: Design FoundationChangelog: v1.1 incorporates decisions from the Cortex mockup review — vitals/measurements merge, medicine identity (brand + composition), contraindication placement, companion/habit recommendations, frequency indicator, match representation.

* * *

Purpose
=======

AREN Cortex is not a Hospital Management System.

It is a Consultation Operating System.

The interface should never feel like a collection of forms, dashboards, or reports.Instead, it should feel like a calm clinical workspace that assists thinking without competing for attention.

The UI exists to reduce cognitive load—not to showcase features.

* * *

Core Philosophy
===============

Every visual decision must answer one question:

> "Does this help the clinician think faster and with greater confidence?"

If the answer is no,it does not belong in Cortex.

* * *

Design Principles
=================

1. Workspace, not Dashboard

---------------------------

Cortex is a workspace.

It is not an analytics dashboard.

Avoid:

* Dense KPI cards
* Decorative widgets
* Large statistic tiles
* Empty visual fillers
* Marketing-style layouts

Everything on screen should contribute directly to the consultation.

**Applied decision:** the vitals strip and the Measurements panel showed the same four numbers twice. The strip is dropped. Measurements is the single source for BP, Pulse, SpO2, Temp, and Weight — entered once, referenced once.

* * *

2. Clinical Flow over Visual Symmetry

-------------------------------------

The layout should follow the consultation process,not perfect grid symmetry.

Clinical flow:

Patient↓

History / Context↓

Symptoms↓

Findings↓

Measurements

↓

Synapse Recommendations

↓

Consultation Plan

↓

Finalize & Print

The doctor should naturally scan downward.

* * *

3. Stable Layout

----------------

The interface should not visually "jump."

Panels should maintain their positions throughout the consultation.

Doctors build muscle memory.

Consistency is more valuable than visual creativity.

* * *

4. Progressive Disclosure

-------------------------

Show only what is useful now.

Avoid overwhelming clinicians.

Advanced information appears only when relevant.

Never expose complexity before it is needed.

* * *

5. One Primary Action

---------------------

Every section should communicate exactly one purpose.

Examples:

History

Purpose:Understand patient context.

Symptoms

Purpose:Capture patient complaints.

Findings

Purpose:Record examination.

Primary Recommendation

Purpose:Accept recommendations.

Consultation Plan

Purpose:Build today's treatment.

Nothing should have multiple conflicting goals.

* * *

Visual Hierarchy
================

Priority 1

Patient identity

Current visit

Critical alerts

Primary action

* * *

Priority 2

Clinical inputs

Recommendations

Consultation plan

* * *

Priority 3

Supporting metadata

Model version

Caching

Keyboard shortcuts

Visit IDs

Developer information

* * *

AREN Layout Philosophy
======================

The workspace is built from fixed primitives.

Specialties never introduce new layouts.

They only replace content inside existing placeholders.

Example

General OPD

Primary Recommendation↓

Medicines

Physiotherapy

Primary Recommendation↓

Exercise Plans

Dentistry

Primary Recommendation↓

Procedures

Future specialties should configure the workspace,never redesign it.

**Applied decision — Primary Recommendation is a per-specialty configuration, set once at onboarding:** The Synapse engine treats all intent types (medicine, test, exercise, referral, finding, advice) as equal peers and never changes. What changes is which intent type the UI elevates into the "Primary Recommendation" placeholder for a given facility. General OPD elevates Medicines; a future physiotherapy or cardiology profile may elevate Exercise Plans or Investigations instead. This is a one-time configuration choice per facility (five facilities supported today — five one-time setups, done by the clinic owner during onboarding, not inferred or relearned by the engine at runtime).

* * *

Synapse Philosophy
==================

Synapse is invisible.

Doctors should not feel like they are interacting with an AI.

They should feel like the software naturally understands the consultation.

Recommendations appear as part of the workflow,not as a chatbot or assistant.

Synapse supports.

Doctors decide.

**Applied decision — no raw scores, ever:** Ranking confidence is never shown as a number or percentage (e.g. "92% match"). A number reads as false precision the engine cannot honestly back. Relative rank is communicated visually — a proportional bar or fill, not a figure — so the doctor reads _order_, not a score they might mistake for a diagnosis confidence.

* * *

Consultation Plan Philosophy
============================

The Consultation Plan is the destination of the consultation.

It is not merely a prescription.

It represents today's clinical decisions.

Depending on specialty it may contain:

* Medicines
* Exercises
* Procedures
* Investigations
* Referrals
* Advice
* Follow-up

The structure remains identical.

Only the content changes.

**Applied decision — companion and habit-based recommendations attach to the triggering item, not to the panel:** Some medicines naturally travel with others — clinically authored pairings (e.g. an NSAID prompting a PPI) and, separately, a specific doctor's own prescribing habits (e.g. this doctor always adds a B-complex alongside a particular painkiller, regardless of what rule fired). Both belong in exactly one place: a small, indented, dismissible suggestion line directly beneath the medicine that triggered it inside the Consultation Plan — never a separate section, never a modal, never blocking. Each suggestion carries a small source tag ("Common pairing" for authored companions, "Your pattern" for doctor-habit-learned ones) so the doctor can tell what's driving it without needing to ask. Ignoring a suggestion must never block finishing the consultation — these are nudges, not gates.

* * *

Specialty Philosophy
====================

The workspace never asks:

"What specialty is this?"

Instead it loads a Specialty Profile.

A profile defines:

* Measurements
* Primary Recommendation
* Supported Recommendation Types
* Clinical terminology
* Validation rules

The UI remains unchanged.

* * *

Medicine Identity
=================

A medicine recommendation always displays two lines, never one:

* **Brand name** (what the doctor recognizes and writes) — primary line, larger weight
* **Composition** (what it's made of) — secondary line, smaller weight, directly beneath

Doctors think and prescribe in brand names. Composition is supporting context, shown for verification, never the primary label. This applies everywhere a medicine appears — recommendations, search results, the Consultation Plan, and print.

* * *

Contraindication Display
========================

Contraindications are never shown as a floating, disconnected banner.

A guarded medicine is styled inline, on its own row, wherever it appears in the ranked list or the Consultation Plan — red treatment, a visible reason, the accept action disabled and the brand picker withheld until the doctor explicitly acknowledges it. Acknowledgment is per-consultation and reversible. Nothing is ever hidden outright; the item stays visible at its real rank, only gated until acknowledged.

* * *

Frequency Indicator
===================

A doctor's own most-frequently-prescribed medicines are surfaced as a distinct, unscored signal — visually tiered (not a binary on/off marker) so "prescribed fifty times" reads differently from "prescribed once." This indicator is deliberately kept separate from ranking and from clinical suggestions: it is a record of habit, not a recommendation, and must never be styled or labeled in a way that could be mistaken for clinical advice.

* * *

Visual Language
===============

Calm.

Professional.

Confident.

Minimal.

No visual noise.

Whitespace is intentional.

Animations are subtle.

Rounded corners should communicate approachability,not consumer software.

The interface should feel closer to modern medical equipment than productivity software.

* * *

Information Density
===================

High information density.

Low visual density.

This means:

Many meaningful data points.

Very little decoration.

The doctor should see more information,not more UI.

* * *

Interaction Philosophy
======================

Everything should feel immediate.

Keyboard-first.

Minimal clicks.

Search before browsing.

Accept before configuring.

Never interrupt thought.

* * *

Empty States
============

Every empty state should guide the consultation.

Instead of saying:

"No data."

Say:

"Start adding observations to activate Synapse."

The interface should always communicate the next meaningful action.

* * *

Success Metric
==============

A successful Cortex interface should make clinicians say:

"I didn't have to think about the software."

Their attention should remain entirely on the patient.

When the software disappears,the design has succeeded.

* * *

AREN Design Law
===============

A new specialty must never require a new layout.

Only new content inside existing primitives.

If a specialty requires redesigning the interface,

the architecture is wrong.

* * *

Scope Note
==========

This document governs UI/visual decisions only. The underlying data model, engine logic, and personalization pipelines (doctor-local rule learning, brand preference, companion/habit detection, guard mechanics) live in the Synapse engine and database layer, and are specified separately. A model implementing against this file should treat it as the visual contract; engine and schema changes are driven by separate prompts against the connected Supabase project.
