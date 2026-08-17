# Physiotherapy is not General OPD with a body map

**Status:** research note, written 2026-08-17 in response to Anmol's call that
the physiotherapy build is "rigged — copy and paste of general OPD layout
without any major changes." Written to be compared against his own research
note rather than to pre-empt it. Where this document is confident it says so;
where it is guessing it says that too.

**Short version: he is right, the evidence is in our own code, and the cause
is not carelessness — it is `aren-cortex-ui-doctrine.md`'s central law
working as designed. That law is correct for dentistry and dermatology and
wrong for physiotherapy, and nothing inside the current architecture will fix
it, because the architecture is the thing that is wrong.**

---

## 1. The claim, tested against the code

Not argued from impression. Three checks:

| Check | Result |
|---|---|
| Physiotherapy branches in the render tree | **Zero.** `grep -rn "physiotherapy\|isPhysio" src/**/*.tsx` returns only comments. |
| Input surface | `inputLayout: "case-sheet"` → renders `GeneralOpdInputs.tsx`, the same file General OPD renders, unmodified. |
| What actually differs | Four configuration arrays: `measurements`, `sections`, `trend`, `charts`. |

So the whole of "physiotherapy" today is: a different set of default
measurement fields, a different panel order, a different trend list, and one
chart launcher. The *structure of the consultation* — what you are asked, in
what order, and what the screen concludes — is General OPD's, unchanged.

The atlas said this out loud on 2026-08-16 and treated it as a virtue:

> "its input half is genuinely identical, so the branch became configuration"

That sentence is the bug. It is true only if you accept that a physiotherapy
assessment and a GP consultation ask the same questions. They do not.

### What IS genuinely physiotherapy-shaped, and should survive any rewrite

This is not a "throw it all away" note. Three pieces are real and were built
against how physiotherapy actually works:

- **The longitudinal band** — a course-based specialty needs "is this
  working?" before anything else, and it answers that.
- **Exercise progression** (`exercisePlan.ts`) — sets/reps/hold/side as
  structured data, with a progressed/same/eased verdict against last session.
  The refusal to compare across units is genuinely careful work.
- **The care plan** — "session 4 of 12" is exactly right for a purchased
  package of sessions.

All three are about the *course*. Everything wrong is about the *session*.

---

## 2. Why it is structurally wrong, not cosmetically wrong

Cortex's engine is a **diagnostic ranker**: observables in → ranked
conditions out → treatment intents attached to those conditions. That is the
medical model. Find the disease, name it, treat it.

Physiotherapy does not reason that way, and this is not a stylistic
difference — it changes what the screen must capture.

### 2.1 The physio "diagnosis" is an impairment, not a pathology

The reasoning chain is **impairment → activity limitation → participation
restriction** (the ICF model): reduced knee flexion → can't climb stairs →
can't return to work. A physiotherapist frequently treats a patient whose
pathological diagnosis is already known, or is irrelevant to what they will
do on Tuesday.

Our screen's Assessment column is headed **"Ranked conditions"** and ranks
pathologies. Anmol's own mockup asked for **"Ranked impairments / functional
problems"** and the atlas has carried that as an unfixed "label" item since
§14.24. **It was never a label problem.** Renaming the heading over a list of
pathologies does not turn it into a list of impairments — the engine has no
impairment vocabulary to rank.

### 2.2 SINSS gates the entire session, and we do not capture it

Severity, Irritability, Nature, Stage, Stability — a formal clinical
reasoning framework taught as the structure of the subjective examination.
Its purpose is *not* record-keeping. **Irritability determines how much
examination and how much treatment the patient can tolerate today**: how much
activity provokes the symptoms, how severe they get, and how long they take
to settle.

This has no analogue anywhere in Cortex. It is the physiotherapy equivalent
of a contraindication check, and it runs on every single session. A screen
that cannot record irritability cannot safely dose treatment, and cannot
explain why session 5 was lighter than session 4.

### 2.3 Aggravating / easing factors and the 24-hour pattern are the diagnosis

"Worse in the morning, eases with movement, returns after sitting" is a
diurnal pattern that discriminates between diagnoses on its own. Aggravating
and easing *movements* point at the structure at fault.

Our Case Sheet records symptom chips with an intensity. It cannot record what
makes a symptom worse, what makes it better, or what it does over 24 hours.
For a GP consultation that is an acceptable simplification. For physiotherapy
it discards the primary diagnostic content of the interview.

### 2.4 "Treat, re-test, same session" — the asterisk sign

A physiotherapist establishes a **comparable sign** (Maitland's "asterisk
sign") at the start — a movement that reliably reproduces the problem —
treats, then **immediately re-tests that same sign** to see whether the
technique worked. The re-test is the evidence base for continuing or
abandoning the technique.

Cortex has no concept of measuring the same thing twice within one visit.
`saveConsult` writes one vitals blob per visit, and `trend.ts` explicitly
*collapses same-day readings to one point* — a design decision that is
correct for the longitudinal band and directly destroys the within-session
re-test. This is a genuine architectural conflict, not a missing field.

### 2.5 The patient names the goal, and we have no patient voice at all

The **Patient-Specific Functional Scale**: the patient nominates up to five
activities *they* cannot do, and rates each 0–10. It is used precisely
because it measures what matters to that person rather than what a
standardised questionnaire assumed.

Cortex has no patient-generated content anywhere in the data model. Every
chip, score and note is authored by the clinician. PSFS cannot be
represented — not because a table is missing, but because "a thing the
patient said, in their words, that we will re-score next visit" is not a
concept the schema has.

### 2.6 Strength is graded per muscle group, and we have nothing

Manual muscle testing grades 0–5 per muscle group. Our own check script
already flagged this in a comment quoted in atlas §14.23:

> "MMT is graded per muscle group, so a single box would be the same mistake
> as ROM_PCT."

We noticed, wrote it down, and then shipped seventeen ROM fields and zero MMT
fields. Strength is half of a musculoskeletal objective examination.

Related and equally absent: **AROM vs PROM**. The gap between what a patient
can move themselves and what the therapist can move for them is a primary
diagnostic discriminator — a large gap suggests weakness or neurological
involvement rather than a mechanical block. Our joint fields record a single
number per joint per side, with no way to say which kind of range it was.

### 2.7 Special tests are pass/fail and come in clusters

Lachman, McMurray, Neer, Hawkins-Kennedy, empty can, Spurling's, straight leg
raise. Each is positive or negative, and their diagnostic value is largely
**in combination** — clusters, where 3-of-5 positive changes the probability
meaningfully while any one alone does not.

Cortex can represent a special test only as a generic "finding" observable
with no laterality, no positive/negative semantics, and no cluster logic. The
engine ranks by weighted signals, which is *structurally* the right shape for
cluster reasoning — but no test content exists, and the observable model has
no boolean-per-side to hang it on.

### 2.8 Outcome measures are validated instruments with published MCIDs

NPRS, ODI (low back), NDI (neck), DASH/QuickDASH (upper limb), SPADI
(shoulder), WOMAC (hip/knee OA), LEFS (lower limb). Each is a defined
questionnaire producing a score, and each has a published **minimal
clinically important difference** — the change below which an improvement is
not clinically meaningful.

We have LEFS as a single number the doctor types, and pain VAS. There is no
questionnaire, no scoring, and — most importantly — **no MCID anywhere in
`trend.ts`.** Our trend module has `trendNoise` (measurement noise) but
nothing that knows a 6-point ODI change is real and a 4-point one is not.
That is exactly the kind of confident-wrong-answer the trend module's own
header says it exists to prevent, and it is currently making it.

---

## 3. The root cause: the doctrine did this on purpose

`specialtyProfile.ts` opens with the law, and it is unambiguous:

> "a specialty never introduces a new layout. It replaces the CONTENT inside
> an existing placeholder... There is no per-specialty branch anywhere in the
> render tree."

Physiotherapy was then measured against that law on 2026-08-16 and found not
to need its own file — **correctly, by the law's own terms.** The law asks
"does the input half look different?" It does not ask "does this clinician
reason differently?"

For dentistry and dermatology the law holds beautifully: those specialties
need a different *instrument* (odontogram, body chart) inside the same
consultation shape. A dermatologist still takes a history, forms a
differential, and prescribes.

**Physiotherapy is the first specialty where the consultation shape itself is
different**, and the law had no way to notice, because the law's test is
visual and the difference is epistemic. So the machine did what it was told
and produced General OPD with a body map. Anmol read the output and called it
rigged. Both are correct.

This is the finding I would most want checked against his research: *the
problem is not that someone skipped the work, it is that the doctrine
forbade it.*

---

## 4. What this implies

Three options, in increasing order of honesty and cost.

**A. Keep configuring.** Add MMT fields, special-test observables, SINSS
fields to the measurement catalogue. Cheap, ships fast, and leaves the
Assessment column still ranking pathologies from a GP's question set. This is
more of what produced the current state.

**B. Give physiotherapy its own input surface** — the copy of
`GeneralOpdInputs.tsx` the doctrine always said to make "the day a profile
earns its own layout." It has now earned it, by a mile. Subjective becomes
body chart + aggravating/easing + 24-hour pattern + irritability; Objective
becomes AROM/PROM + MMT + special tests; Assessment becomes ranked
impairments; the plan keeps what already works.

**C. Admit the engine needs a second mode.** Ranking impairments is not
ranking conditions. This is the largest, and I am *not* confident it is
needed yet — it may be that impairment observables plus the existing
weighted-signal ranker gets 80% of the way, since cluster reasoning is
already the shape the engine has. Worth testing before committing.

My recommendation is **B now, and prove or disprove C with real content**
before touching the engine. But this should be decided against Anmol's
research, not mine.

---

## 5. Open questions I could not settle from research alone

These need a practising physiotherapist, not another search:

1. **How much of the subjective exam does a busy Indian OPD physio actually
   record?** Everything above is the textbook. A clinic doing 30 sessions a
   day may record pain, ROM and what they did. Building the full SINSS
   interview would then be the *opposite* mistake — a beautiful form nobody
   fills in. This is the single most important unknown.
2. **Who is at the keyboard?** Atlas §14.24 notes sessions are often
   delivered by an assistant. The assessment screen and the session screen
   may need to be different screens with different rights.
3. **First visit vs follow-up are radically different consultations** — a
   45-minute assessment vs a 20-minute treatment session. We currently render
   one screen for both. This may matter more than every field listed above.
4. **Which outcome measures does this clinic actually use?** Picking two and
   implementing them properly (with MCID) beats offering seven.

---

## Sources

- [Severity, Irritability, Nature, Stage and Stability (SINSS) — Physiopedia](https://www.physio-pedia.com/Severity,_Irritability,_Nature,_Stage_and_Stability_(SINSS))
- [Patient Clinical History — Physiopedia](https://www.physio-pedia.com/Patient_Clinical_History)
- [Patient Specific Functional Scale — Physiopedia](https://www.physio-pedia.com/Patient_Specific_Functional_Scale)
- [The PSFS: Psychometrics, Clinimetrics, and Application as a Clinical Outcome Measure — JOSPT](https://www.jospt.org/doi/10.2519/jospt.2012.3727)
- [Minimum Important Differences for the PSFS, 4 Region-Specific Outcome Measures, and the NPRS — JOSPT](https://www.jospt.org/doi/10.2519/jospt.2014.5248)
- [MCID of the DASH and QuickDASH — JOSPT](https://www.jospt.org/doi/10.2519/jospt.2014.4893)
- [Assessing Range of Motion — Physiopedia](https://www.physio-pedia.com/Assessing_Range_of_Motion)
- [Range of Motion — Physiopedia](https://www.physio-pedia.com/Range_of_Motion)
- [Outcome Measurement in Shoulder Diseases: Focus on SPADI](https://www.e-arm.org/journal/view.php?number=4333)
