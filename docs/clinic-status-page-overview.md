# Clinic Status

## Product Philosophy, Workflow & Design Direction

> **IMPORTANT**
> 
> Before making any implementation decisions, read the following project documents:
> 
> - `/doc/aren-technical-atlas.md`
> - `/doc/aren-frontdesk-source-of-truth.md`
> 
> These define the existing architecture, product philosophy, workspace model and technical constraints.
> 
> Also use the following images only as **visual references**.
> 
> - `SYSTEM-HEALTH-MAINSCRN.PNG`
> - `SYSTEM-HEALTH-DETAILEDVIEW.PNG`
> 
> These are **directional references**, not pixel-perfect designs.
> 
> Do **NOT** recreate them literally.
> 
> Instead, preserve the philosophy behind them while improving layout, spacing, communication and interaction where appropriate.

---

# Philosophy

System Health is **not** a dashboard.

It is **not** infrastructure monitoring.

It is **not** a page full of system cards.

It is an operational assistant.

The receptionist should never have to diagnose software.

AREN should diagnose the software and explain the clinic's current operational situation.

This philosophy is called **Error Morphology**.

Technical failures are transformed into operational meaning before reaching the user.

The receptionist should understand what is happening without understanding how computers work.

---

# The First Screen

The first screen should **NOT** expose diagnostics.

The detailed diagnostic page already exists.

Instead, this screen exists to answer one question.

> **"Can I continue working?"**

Everything else is secondary.

---

# Purpose of the Main Screen

This page is an interpretation layer.

It summarizes the current operational condition of the clinic.

Think of it as a Chief Operations Officer speaking to the receptionist.

The receptionist should feel:

"I know exactly what's happening."

instead of

"I need to figure out what's happening."

---

# Information Hierarchy

The page should communicate information in this order.

1. Current operational situation.

2. What is affected.

3. Whether clinic work can continue.

4. Recommended action.

5. Link to detailed diagnostics.

Nothing else should compete with these priorities.

---

# Layout

The page should still feel substantial.

It should **not** look empty.

However, it should also avoid becoming another dashboard.

Maintain a clean two-column composition.

Example

Left (Primary)

- Operational Summary
- Current Situation
- Recommended Action
- Helpful Context

Right (Secondary)

- Small contextual information
- Clinic information
- Current operator
- Last system check
- View Detailed Diagnostics CTA

The right column should never overpower the operational summary.

---

# Main Hero Card

This is the heart of the page.

Examples:

🟢 Everything is operating normally.

All clinic operations are working as expected.

You can continue registering patients and consulting as usual.

Last checked just now.

or

🟡 Prescription printing needs your attention.

Patients are still reaching the doctor.

Only printed prescriptions are affected.

Try reconnecting the clinic printer.

The message should feel conversational.

Not robotic.

---

# Dynamic Illustration

Avoid stock illustrations.

Avoid receptionist cartoons.

Avoid doctor cartoons.

Instead use abstract SVG illustrations.

Examples

Healthy

- calm gradients
- soft circles
- subtle shield
- connected nodes
- flowing network
- positive green accents

Warning

- amber gradients
- subtle interruption
- disconnected node
- missing connection
- reduced glow

Critical

- muted reds
- fractured connection
- broken pathway
- stronger contrast
- still elegant
- never alarming

The illustration should communicate emotional state.

Not literal people.

---

# Operational Context

Below the main message, provide a small contextual section.

Examples

Current Workspace

Reception Workspace

Current User

Ramesh Sharma

Clinic

Anmol Homeo Clinics

Current Mode

Front Desk

System Check

4 seconds ago

These provide confidence without creating cognitive overload.

---

# Helpful Information

Instead of activity feeds,

show helpful operational context.

Examples

Today's Operations

Patients Registered

26

Queue Status

Running Normally

Doctor Workspace

Connected

Printing

Available

These should be high-level summaries.

Not diagnostics.

No timestamps.

No logs.

No technical wording.

---

# Avoid Recent Activity

Do NOT show:

Printer disconnected

Database restored

Authentication refreshed

Realtime reconnected

These are implementation events.

They create unnecessary questions.

History belongs inside the detailed diagnostics page.

Not here.

---

# Error Morphology

Every technical failure should first be translated.

Example

Internal

Printer timeout

↓

USB unavailable

↓

Driver unavailable

↓

Spooler failure

↓

User sees

Printing needs your attention.

Printed prescriptions are temporarily unavailable.

Patients can continue consulting normally.

Try reconnecting the printer.

This translation layer is mandatory.

---

# Recovery

Every issue should immediately suggest recovery.

Examples

Printing

Check printer power.

Check cable.

Retry.

Doctor Workspace

Ensure the doctor's workspace is open.

Retry connection.

Internet

Verify clinic internet.

Retry synchronization.

Recovery always comes before support.

---

# Detailed Diagnostics

This page should NOT replace the existing diagnostics page.

Instead,

provide a strong CTA.

Examples

View Complete Diagnostics

Open Detailed System Status

View Operational Details

The existing detailed dashboard becomes Level 2.

The new summary page becomes Level 1.

---

# Progressive Disclosure

System Health now has three layers.

Level 1

Operational Summary

↓

Level 2

Detailed System Health

↓

Level 3

Diagnostics & Technical Logs

Every layer reveals more technical information.

The receptionist should rarely need Level 2.

Almost never need Level 3.

---

# Design Language

The page should feel

calm

confident

supportive

minimal

premium

Never

technical

busy

dashboard-like

server-monitoring

enterprise admin

The experience should feel closer to

Apple System Status

Notion

Linear

Stripe

than

Grafana

Prometheus

Windows Event Viewer

---

# Future Behaviour

Eventually the page should become intelligent.

Examples

"Everything is operating normally."

↓

"Printing needs your attention."

↓

"Doctor workspace is reconnecting."

↓

"Internet has been restored."

↓

"Cloud synchronization completed."

The SVG,

accent colors,

status icon,

headline,

recommended actions,

and page atmosphere

should all adapt automatically based on the current operational state.

The receptionist should understand the clinic's situation within **2–3 seconds** without opening any additional screens.

That is the purpose of System Health.
