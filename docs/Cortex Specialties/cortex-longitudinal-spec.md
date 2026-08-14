# Cortex — Longitudinal Consultation Workflow

**Purpose of this document:** describe *what we want*, not how to build it. The coding agent should read the existing codebase and decide file structure, component boundaries, and data model. Sizing, colors, spacing and interaction polish are to be discussed separately once the agent has read the code.

---

## 1. Context

We are targeting clinics where **longitudinal records matter** — physiotherapy, cardiology, psychiatry, dentistry, dermatology, paediatrics. Field research showed general OPD clinics are largely satisfied with paper; specialty clinics either already use software or have tried and abandoned it.

The consequence for the product: **a single beautiful consultation screen is not enough.** These clinics' pain is not "recording today's visit" — it is "seeing what has changed since last time." That is currently the weakest part of Cortex.

**Standing design principle (applies to everything below):** never fight the doctor's ego. Nothing the software surfaces should read as an instruction. The doctor already knows what to do. We only make articulation and flow faster. Every ranking, hint, and surfaced measurement must be overridable, dismissable, and visually framed as a suggestion — never as a verdict.

---

## 2. What we already have

- **Unified input bar** — one search field for everything the doctor observes. No pre-classification required. The system tags each entry as history / symptom / finding and files it into the correct bucket, shown to the side. This is intentional: these categories correlate constantly in real speech, and forcing the doctor to decide the bucket first is friction.
- **Measurements panel** — contextually relevant fields auto-surface based on what has been entered (e.g. pregnancy-relevant fields for a female patient) without the doctor configuring a template. Auto-surfaced fields are visually distinct from manually added ones.
- **Clinical Assessment** — ranked possible conditions derived from the entered clinical inputs and measurements. Doctor can search and override at any time.
- **Medicine column** plus an adjacent column for tests and advice.
- **Attachments** — photos, X-rays, diagnostic reports. Backblaze storage, tiered compression (lighter compression for X-rays where clarity matters, heavier for ordinary photos and reports).
- **Specialty modules** — interactive dental chart (click a tooth, record what happened to it), dermatology body chart (mark affected territory), growth chart with input fields.
- **Visit history header** — currently shows how many times the patient has visited, on which dates, and one medicine per visit. Clicking a row expands that single past visit's detail.
- **Follow-up selector** — doctor picks 3 / 5 / 7 days or custom; this is written to the prescription pad.

---

## 3. What we still need to build

### 3.1 The trend header (highest priority)

The current visit history header answers *how many times* the patient came. It does not answer the only question that matters for a returning longitudinal patient: **is this working?**

What we want:

- Lives in the **top header of the consultation workspace**, not in a separate tab or page. The doctor must see it the moment a returning patient opens, before typing anything.
- **Collapsed summary by default, click to expand** into the existing per-visit detail view we already have. Do not build a second detail view.
- Shows the 2–3 measurements or values that actually matter **for that specialty**, not a generic list. This should be driven by the same per-facility specialty configuration that already decides which intent type gets the elevated slot and which measurement fields show by default — one generic component, configured per specialty, not separate versions per specialty.
- Shows **direction and delta**, not a table dump. "Pain 7 → 4 across 3 visits" is more useful than four rows of numbers.
- **Generated algorithmically from stored signals — no AI, no API round-trip.** Everything the doctor enters is already recorded as structured signals and numbers. This is aggregation and rendering, not inference.

### 3.2 Wire the follow-up reminder

The follow-up interval is captured but nothing is sent. We want an automated WhatsApp reminder to the patient **24 hours before** the follow-up date. This is in MVP scope.

### 3.3 Persistent care plan (attempt a light version)

A single visit's plan is a snapshot of today. A care plan is a **trajectory that spans visits** and gets adjusted rather than re-derived each time. Examples:

- Physiotherapy: "12-session protocol, currently session 4."
- Cardiology: "titrating beta-blocker upward, target dose by third visit."
- Dentistry: "root canal on tooth 36, stage 2 of 3."

Minimum useful version: a small persistent object attached to the patient — stated goal, expected number of visits or expected end point, current position in that sequence — visible in the header alongside the trend, editable by the doctor at any visit. It does not need to be elaborate. It needs to exist, persist, and be visible.

---

## 4. What we deliberately drop from MVP

- **AI analysis of attachments.** No image interpretation, no report reading.
- **OCR on uploaded reports.** Files are stored and viewed, not parsed.

These are deliberate exclusions, not oversights. Attachments in MVP are storage plus retrieval.

---

## 5. How each specialty actually works, and what the UI must do about it

This section exists so the interface is shaped by clinical reality rather than by what is convenient to build.

### Physiotherapy
Patients come in **courses, not episodes** — often two or three times a week for several weeks, frequently as a purchased package of sessions. The clinically meaningful data is a small set of numbers repeated at high frequency: pain rating (0–10), range of motion in degrees for specific joints, functional capacity, and adherence to home exercises. Treatment is progressive — the exercise prescription is supposed to get harder as the patient improves.

*UI implication:* the trend across sessions **is** the record. A physio opening session 9 needs pain and ROM movement visible instantly, plus what was prescribed last session so they can progress it rather than repeat it. Session count against the planned course is exactly why care plan matters here more than anywhere else.

### Cardiology
Visits are spaced weeks to months apart. What changes between visits is usually **not the drug but the dose**, and the values that matter (BP, pulse, weight, lipid values) are checked repeatedly over long spans. Patients routinely arrive carrying outside reports — an echo, a lipid panel, an ECG done elsewhere.

*UI implication:* the trend must span months, not just the last few visits, and dose changes need to be legible as a history, not just as today's prescription. Outside reports must be attachable and dated to the visit they belong to, even when the report predates the visit.

### Psychiatry
Long gaps between visits, slow titration, and improvement measured by symptom rating and functional change rather than by any physical measurement. Side effects are a primary reason for changing course.

*UI implication:* the "what did we try, at what dose, and what happened" history is the entire clinical value. Note that Synapse deliberately has no psychiatric medicine rules — the ranking layer stays quiet here, and the longitudinal record carries the weight instead.

### Dentistry
The **dental chart is itself the longitudinal record** — it is not a per-visit snapshot. A tooth's state persists and accumulates over years. Treatments frequently span multiple appointments (a root canal across three visits), so a tooth can legitimately be in an in-progress state when the patient walks out.

*UI implication:* the chart must carry state forward between visits and be able to represent "treatment started, not finished" on a specific tooth. The trend header for a dental clinic is less about numbers and more about what is currently open and unfinished.

### Dermatology
Progress is visual. The honest comparison is last visit's photo against today's, on the same site of the body.

*UI implication:* since we are not doing image analysis in MVP, the value we can deliver is **making the comparison easy** — prior photos for the same marked body region retrievable side by side with dates. The body chart is the index into the photo history.

### Paediatrics (growth)
Growth is only meaningful as a curve against age. A single height or weight in isolation says almost nothing.

*UI implication:* accurate date of birth is load-bearing, and the growth chart needs enough prior points to be worth showing. This is the clearest case where the trend view *is* the clinical tool.

---

## 6. Edge cases the build needs to handle

- **First visit / no history.** The trend header must degrade gracefully to something useful or disappear cleanly. It must never render an empty or broken frame on a new patient.
- **Sparse or missing measurements.** Some visits will not record the measurement being trended. Show gaps honestly; do not interpolate or invent a value between two real ones.
- **Direction of improvement varies by measurement.** Lower pain is better; higher range of motion is better. Each measurement needs to know which direction counts as improvement before we render any up/down indicator, or we will show a patient improving when they are deteriorating.
- **Long absence.** A patient returning after a year is clinically a different situation from one returning next week. The header should make the gap obvious rather than presenting old numbers as if they were recent.
- **Same-day repeat visit.** Should not create a misleading second point on a trend line.
- **Multiple clinicians in one clinic.** In physiotherapy especially, sessions are often delivered by an assistant while the record belongs to the clinic. The history must remain continuous for the patient regardless of who recorded each visit.
- **Unit inconsistency.** The same measurement entered in different units across visits must not silently produce a fake trend.
- **Outside/backdated reports.** A report belonging to an earlier date but uploaded today should sit correctly in the timeline.
- **Follow-up reminder failures.** Missing phone number, wrong number, or a patient who never opted in — the reminder must fail quietly and visibly to the clinic, never silently.
- **Care plan drift.** A doctor may abandon or change a plan mid-course. The plan must be editable and closable without leaving a stale "session 4 of 12" showing forever.

---

## 7. Sequencing

1. Trend header — the one genuinely missing MVP piece.
2. WhatsApp follow-up reminder wiring.
3. Light persistent care plan.

Build the trend header **once**, as a generic component driven by the specialty configuration. Do not build a General OPD version and then a physiotherapy version. The same discipline already applied to the engine — specialty is a configuration lens, not a separate application — applies here.
