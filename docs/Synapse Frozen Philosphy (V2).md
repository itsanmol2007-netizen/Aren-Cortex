Synapse Architecture Philosophy
===============================

### Core reasoning engine of AREN Cortex

**Status:** Frozen — philosophy layer. Engineering work (interfaces, schemas, plugin APIs) builds on top of this without revisiting these decisions unless a real implementation blocker forces it.

* * *

1. What Synapse Is

------------------

* * *

Synapse or Systematic Yielding Neural Architecture for Recommendation and Suggestion Engine is a **deterministic decision-support and ranking engine**, not an autonomous prescriber.

> Doctors should treat patients. Software should handle the rest.

Synapse predicts, ranks, suggests, and prepares. It never silently decides. The doctor always confirms the final action. This principle governs every downstream design choice — explainability, learning, and validation all exist in service of it, not as goals in themselves.

Synapse is not fundamentally a medicine recommendation engine. It is a **reasoning engine that sits between a universal clinical input language and a universal clinical output language.** Medicine ranking is simply the first Intent Module built on top of it.

* * *

2. Design Goals

---------------

* * *

1. Deterministic and explainable (via reproducibility, not heavy snapshotting — see §7).
2. Modular and specialty-independent — the core engine never changes when a new specialty is added.
3. Learning personalizes ranking; it never alters medical knowledge.
4. Every module communicates only through the shared clinical language — no module talks directly to another.
5. Avoid enterprise-grade over-engineering before real code exists. Solve the problem in front of you; don't pre-build for hypothetical futures.

* * *

3. The Pipeline

---------------

* * *

    Universal Clinical Inputs
            ↓
    Specialty Plugins (Translators)
            ↓
    Universal Clinical Language (UCL)
            ↓
    Synapse Reasoning Engine (Knowledge Graph → Ranking)
            ↓
    Clinical Intents
            ↓
    Specialty Plugins (Renderers)
            ↓
    Learning Layer
            ↓
    Doctor Decision

This mirrors how modern LLMs handle multi-modal input: different raw inputs are translated into one common internal representation, reasoning happens on that representation, and outputs are rendered back into whatever form the context needs.

* * *

4. Universal Clinical Inputs

----------------------------

* * *

Symptoms and Observations are **core, not plugin-owned.** Every specialty consultation begins with them — a patient reporting "my shoulder hurts" is not specialty-specific data, it's universal.

There are three clinical input primitives — not four. (An earlier draft proposed a fourth, "Structured Assessments," for composite objects like an ECG or a dental chart. This was dropped: an ECG is just Observations + Measurements + an Attachment, collected together on one screen. Bundling multiple primitives onto a single input screen is a **UI/collection concern** owned by the plugin, not a distinct data type.)

The three primitives:

1. **Symptoms / Observations** — categorical, present/absent/unknown (fever, pedal edema, tenderness, scapular winging)
2. **Measurements** — name + value + unit (EF 35%, ROM 90°, BP 160/100, pain 7/10, HbA1c 8.4%)
3. **Attachments** — files (ECG PDF, X-ray, MRI, video)

**No specialty-specific database tables.** Cardiology, Physiotherapy, and Dentistry all read and write the same generic tables. The only thing that varies by specialty is the **UI** — which inputs get collected, on which screen, in what order.

* * *

5. Specialty Plugins

--------------------

* * *

A plugin has exactly three responsibilities:

1. **Collect** specialty-specific inputs (which of the three primitives to gather, in what UI flow).
2. **Translate** those inputs into the universal clinical language (UCL).
3. **Render** universal outputs (Clinical Intents) back into specialty-appropriate workflows.

A plugin never:

* Owns reasoning or ranking logic.
* Owns the learning/personalization logic.
* Communicates directly with another plugin.
* Stores data in a plugin-specific table.

The translation step (#2) is a **rule-based interpretation**, not a black box: `EF = 35% → Reduced Ejection Fraction` should be a traceable rule, not an opaque function, because the resulting Concepts feed a ranking engine that must remain explainable.

* * *

6. Universal Clinical Language (UCL)

------------------------------------

* * *

Every plugin translates its raw inputs into the Universal Clinical Language (UCL). The UCL is the shared internal representation understood by Synapse. Downstream, nothing cares where a concept came from—only what it means.

Examples: `Reduced Ejection Fraction`, `Bacterial Infection`, `Limited Shoulder Mobility`, `Muscle Spasm`, `Fluid Overload`, `Periodontitis`.

**Concepts are derived state, not persisted state.** Patient context (raw inputs) is what gets stored. Clinical Concepts are recomputed from that context whenever it changes — the same way a spreadsheet recalculates formulas. If a doctor removes "fever" from the record, the associated concepts simply disappear on next computation. There is no concept lifecycle to manage, no manual add/remove, no staleness to track.

* * *

7. Explainability & Audit — Reproducibility, Not Snapshotting

-------------------------------------------------------------

* * *

Synapse does not need to persist every intermediate Clinical Concept or full reasoning chain for every consultation. That level of audit trail is disproportionate to what Synapse actually is: a deterministic ranking assistant whose output the doctor always reviews before acting.

Instead, **reproducibility is sufficient.** Persist:

* The raw clinical inputs for that consultation.
* The doctor's final decisions.
* The version of the Synapse knowledge/ranking engine active at that time.

Given those three, any past ranking can be deterministically replayed later if it ever needs to be understood or audited — without paying the storage and complexity cost of snapshotting reasoning chains on every single request.

**Engine versioning** needs to exist as a real, trackable value (a version identifier on the ranking logic / tag rules / composition weights) — but it can remain invisible or semi-visible during active development. It only needs to be formally deployed and locked once Cortex is finalized and shipped. Until then, don't over-build the versioning mechanism itself.

* * *

8. Clinical Intents

-------------------

* * *

Synapse does not think in medicines, tests, or exercises. It reasons in Clinical Intents. A Clinical Intent represents what the engine believes should happen next, independent of how any particular specialty presents or executes that recommendation.

Clinical Intents are later rendered by specialty plugins into specialty-specific workflows. For a General OPD plugin, an intent may become a prescription. For Cardiology, it may become an investigation. For Physiotherapy, it may become an exercise protocol. The core engine never needs to know how an intent is ultimately presented.

Every Clinical Intent Module emits one or more Clinical Intents using a shared generic envelope. Each module may attach its own specialty-specific metadata, but the common envelope keeps the Learning Layer generic and the core engine independent of specialty-specific implementation.

* * *

9. Clinical Intent Modules

--------------------------

* * *

Instead of one Medicine Recommendation Engine, Synapse has multiple independent Clinical Intent Modules, all consuming the same UCL and none aware of each other's existence:
    Universal Clinical Language
            │
            ├── Medicine Intent
            ├── Test Intent
            ├── Referral Intent
            ├── Exercise Intent
            ├── Follow-up Intent
            ├── Patient Education Intent
            └── Future Intent Modules

Adding a new Clinical Intent Module should never require changing an existing one.

* * *

10. Validation — Two Layers

---------------------------

* * *

**Data Validation (Plugin-level):** field-level correctness, checked as close to input as possible. ROM must be 0–180°, EF cannot be negative, required fields cannot be empty, wrong units rejected. This is UI/plugin work, not engine work.

**Clinical Consistency Validation (Engine-level, post-MVP):** cross-field sanity checks across the whole patient context, not any single field. Example: age = 2 months with weight = 95kg; male + pregnant; EF = 35% alongside "normal ventricular function" noted elsewhere. This protects the reasoning engine from acting on internally contradictory input. Not an MVP blocker, but belongs in the architecture as a future engine-level responsibility, not something plugins should individually attempt.

* * *

11. Learning Layer

------------------

* * *

Learning is a separate module, not part of the Knowledge Engine. It adjusts ranking; it never touches medical knowledge itself.
    Knowledge Engine → Clinical Intent Modules → Learning Engine → Final Ranking

Because every Clinical Intent Module emits the same generic Clinical Intent envelope, the Learning Layer can remain **fully generic** across specialties — one shared mechanism for "how much does this doctor prefer this suggested intent, in this clinical context," regardless of whether the intent is a medicine, a test, or an exercise protocol. Learning should not require a separate bespoke bias structure per Clinical Intent Module.

Learning should adapt quickly — recent behavior weighted more than old behavior — while medical knowledge stays dominant and objective throughout.

* * *

12. Consultation Archetypes

---------------------------

* * *

Rather than designing separately for every specialty, specialties are grouped into patterns the core engine already supports:

* **Pattern 1 — Simple Symptom→Action:** General OPD
* **Pattern 2 — Measurement-heavy:** Cardiology, Nephrology, Endocrinology
* **Pattern 3 — Body-map specialties:** Dentistry, Dermatology, Orthopaedics
* **Pattern 4 — Longitudinal progress:** Physiotherapy, Psychiatry, Rehabilitation

Every specialty plugin fits one or more archetypes. The core engine does not change to accommodate any of them.

* * *

13. What Comes Next (Engineering, Not Architecture)

---------------------------------------------------

* * *

The philosophy above is frozen. The next phase is implementation-driven, pressure-tested by building the first two specialties end-to-end:

* Concrete `ClinicalConcept` interface (fields, not just the concept).
* Concrete `ClinicalIntent` envelope interface (§8) plus per-module metadata extensions.
* Measurement/Observation/Attachment table schemas (generic, specialty-agnostic).
* Formal plugin API/contract (collect / translate / render).
* Learning Layer's generic bias/scoring schema, built once against the Clinical Intent envelope.

Any architectural question that surfaces during this implementation phase should be resolved by asking: _does this decision keep the core engine unaware of specialties, or does it leak specialty knowledge into the core?_ If it leaks, redesign the boundary. If it doesn't, it's an implementation detail and doesn't require revisiting this document.

* * *

Final Terminology (Frozen)
--------------------------

* * *

* **UCL (Universal Clinical Language)** → the internal language understood by Synapse.
* **Clinical Concept** → an individual semantic unit within the UCL (e.g., Reduced Ejection Fraction, Muscle Spasm, Periodontitis).
* **Clinical Intent** → the universal output produced by Synapse before any specialty-specific rendering.
* **Specialty Plugin** → collects inputs, translates to UCL, and renders Clinical Intents into workflows.
