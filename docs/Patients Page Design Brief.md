# AREN Front Desk — Patients Page Design Brief

## What this is

The Patients page is the receptionist's archive.

Unlike Front Desk, which is focused entirely on today's operational workflow, this page exists whenever the receptionist needs information that the live queue cannot provide.

This is **not** a dashboard.

This is **not** a medical record viewer.

This is **not** a clinical timeline.

It is a calm, searchable workspace for finding patients, verifying demographic information, understanding basic visit history, and quickly performing reception-related actions.

The receptionist should never feel overwhelmed by medical information. She should immediately understand **who the patient is**, **when they visited**, and **what she can do next**.

---

# Read before designing

Before implementing this page, carefully read:

`/docs/aren-frontdesk-source-of-truth.md`

That document defines the visual identity, spacing philosophy, interaction language, colors, typography, gradients, shadows, motion and overall AREN personality.

This page should feel like another room inside the same product.

Do **not** recreate Front Desk.

Do **not** redesign AREN.

Instead, extend the existing design language naturally.

---

# Purpose

Front Desk answers:

> "What is happening today?"

Patients answers:

> "Tell me about this patient."

Everything on this page should support that single goal.

---

# Users

Primary user:

Receptionist

Secondary user:

Occasionally clinic admin.

Doctors generally will not use this page.

Receptionists usually arrive here because someone asks something like:

- "My phone number changed."
- "I visited here before."
- "Doctor asked for my contact number."
- "Can you create another visit?"
- "Please update my address."

Design around these workflows.

---

# Philosophy

Assume the receptionist spends almost the entire day inside Front Desk.

Opening Patients is an intentional action.

She already knows why she is here.

Usually she is looking for one patient.

Not browsing hundreds.

Therefore the page should feel:

- Calm
- Searchable
- Structured
- Fast
- Confidence inspiring

Never analytical.

Never overwhelming.

---

# Layout

Continue the same overall AREN layout language.

Navigation Sidebar

↓

Patient Browser

↓

Patient Workspace

Do not create giant full-width tables.

Do not make the page feel like Excel.

The AREN design language favors bounded surfaces, generous spacing, and clearly defined workspaces.

The page should preserve the same calm rhythm established by Front Desk.

---

# Left Workspace

The left panel is the Patient Browser.

Purpose:

Finding the correct patient.

Prioritize:

- Search
- Lightweight filters
- Fast recognition
- Internal scrolling

The patient list should scroll independently.

Avoid pagination.

Do not use page numbers.

This page is designed for continuous searching rather than browsing.

---

# Patient Rows

Rows should prioritize recognition.

Display:

- Patient Name
- Phone Number (full number, never masked)
- Gender
- Age
- Last Visit

Do **not** display UHID.

Although searching by UHID should still work internally, receptionists almost never identify patients using UHID.

Avoid unnecessary visual noise.

Name should remain the strongest visual element.

Phone number comes next.

Gender, age and last visit are supporting information.

---

# Search

Searching is the primary interaction.

Unlike Front Desk, however, it should not dominate the interface.

The receptionist already knows why she came here.

Keep search visible, accessible and lightweight.

---

# Filters

Keep filters intentionally simple.

Avoid enterprise-style filter builders.

Support only realistic receptionist workflows.

---

# Right Workspace

Initially display a thoughtful empty state encouraging the receptionist to select a patient.

Once selected, this becomes the patient's operational workspace.

This area intentionally avoids medical information.

The receptionist should quickly understand:

- Who the patient is
- Contact details
- Registration information
- Visit frequency
- Recent visits
- Available actions

---

# Patient Header

The header should feel more human than technical.

Display:

- Avatar
- Patient Name
- Phone Number
- Gender
- Age
- Registration / First Visit
- Returning Patient badge (if applicable)

Small contextual badges like:

- New Patient
- Returning Patient

are encouraged.

Avoid exposing UHID prominently.

---

# Summary Cards

Keep lightweight operational information such as:

- Total Visits
- Last Visit
- First Visit
- Primary Doctor

These should remain compact.

Avoid oversized KPI cards.

---

# Visit Timeline

Include a lightweight visual timeline.

Its purpose is not analytics.

Its purpose is helping reception instantly recognize visit frequency.

The timeline should display approximately the latest 8–9 visits within the selected time window.

Spacing between points should represent actual chronological distance.

Example:

Visits on:

5 Jun

7 Jun

10 Jun

should appear close together.

A visit on:

28 Jun

should appear noticeably farther away.

Avoid evenly spacing every point.

The visualization should communicate real visit rhythm.

---

# Timeline Overflow

If additional visits exist beyond those displayed, show a small indicator such as:

"+12 earlier visits"

Clicking this should open a dedicated Visit Timeline modal.

---

# Visit Timeline Modal

The timeline modal should feel premium.

Avoid traditional enterprise dialogs.

The modal should resemble modern Apple-quality interfaces rather than older enterprise software.

Design goals:

- Large rounded corners
- Beautiful soft shadows
- Elegant purple ambient gradients
- Smooth spacing
- Rich but minimal presentation
- Calm typography
- Plenty of breathing room

The modal should display the patient's complete visit timeline.

Include:

- Full chronological timeline
- Accurate proportional spacing
- Dates
- Visit type
- Doctor
- Visit status

This modal exists purely for exploration.

No editing happens here.

---

# Recent Visits

Display a compact list of recent visits.

Compress vertical spacing slightly to maximize information density.

Use internal scrolling if necessary.

Avoid allowing the entire page height to grow.

Each visit should communicate:

- Date
- Visit Type
- Doctor
- Status

without unnecessary decoration.

---

# Quick Actions

Keep only receptionist-relevant actions.

Examples:

- Copy Phone Number
- Send WhatsApp
- View in Print Queue

Do not duplicate actions already available elsewhere.

For example:

Do not include:

- Edit Patient Details
- Create New Visit

if those actions already exist in the page header.

---

# Permissions

Receptionists may:

- Search patients
- Edit demographics
- Update phone number
- Update address
- Create new visits
- View operational visit history

Receptionists may NOT access:

- Diagnosis
- SOAP
- Prescriptions
- Doctor Notes
- Clinical Findings
- Internal consultation data

This page intentionally separates operational workflows from medical workflows.

---

# Empty State

Treat the empty state as a first-class design problem.

Avoid blank white panels.

The experience should feel welcoming while subtly encouraging the receptionist to search for a patient.

Maintain the warm personality established by Front Desk.

---

# Visual Language

Maintain the same visual identity established by Front Desk.

Continue using:

- Calm neutral surfaces
- Soft purple brand accents
- Blue primary actions
- Gentle gradients
- Rounded cards
- Clean typography
- Light shadows
- Spacious layouts

This page should immediately feel like AREN.

Not like another admin dashboard.

Purple should remain a restrained brand accent.

Use it thoughtfully in:

- Selected patient states
- Timeline
- Focus states
- Hover interactions
- Decorative gradients
- Empty states

Avoid overusing it.

---

# Component Architecture

Build reusable UI primitives.

Examples:

- Panel
- Section
- Timeline
- Information Row
- Empty State
- Search Input
- Action Button
- Status Badge

Avoid repeating identical styling throughout feature components.

---

# Theme Architecture

The page should inherit global design primitives rather than hardcoding styles.

Global updates such as:

- Colors
- Border Radius
- Shadows
- Typography
- Motion
- Spacing

should be possible from shared design tokens.

At the same time, individual feature components should remain independently customizable when needed.

We want:

Global consistency.

Local flexibility.

---

# Scrolling Philosophy

The page itself should remain visually stable.

Content-heavy areas should scroll internally.

Examples:

- Patient Browser
- Recent Visits
- Future Visit Lists

Avoid layouts that continuously grow vertically as content increases.

---

# Accessibility

Continue following the accessibility standards established by Front Desk.

Maintain:

- Keyboard-friendly structure
- Clear focus states
- Readable typography
- Strong hierarchy
- Minimum touch targets

---

# Language

Continue using the shared localization system.

Support:

- English
- Hinglish
- Hindi (placeholder)

No hardcoded strings.



---
# Implementation Notes

These notes are implementation-specific and should be followed alongside the design brief.

## Reference Screenshot

Use the following reference image for visual inspiration:

`/docs/Frontdesk-Patient-Page (Frozen).png`

This screenshot represents the current approved layout direction.

Do **not** recreate it pixel-for-pixel.

Instead:

- Preserve the overall layout philosophy.
- Preserve the visual identity.
- Improve the UX where appropriate.
- Improve spacing, hierarchy and interaction quality using your own design judgement.

Treat the screenshot as the baseline rather than the final design.

---

## Sidebar

The sidebar architecture is already complete.

Do **not** redesign or restructure it.

The screenshot shows the **expanded sidebar only as a visual reference.**

The application's normal state remains the collapsed sidebar.

Do not change this behavior.

Only make the following improvements:

- Adjust icon vertical alignment so the navigation icons sit slightly lower, matching the overall visual balance.
- Update the Patients icon if a better icon fits the design language.
- Replace the existing "Print Queue" navigation item with:

**Print RX**

Use an icon that clearly communicates prescriptions or printing while remaining visually consistent with the rest of the navigation.

Do not modify the sidebar interaction or animations.

---

## Navigation

The sidebar should now contain:

- Front Desk
- Patients
- Print RX
- Settings

No additional navigation items.

---

## Print RX

Rename every occurrence of:

"Print Queue"

to

"Print RX"

The purpose of this page is handling finalized prescriptions waiting to be printed.

The page may later support additional printable medical documents, but for V1 it represents the receptionist's prescription printing workflow.

---

## Design Freedom

The Patients page already has a strong approved direction.

Avoid redesigning it from scratch.

Instead:

- polish spacing
- improve information hierarchy
- improve interaction quality
- improve typography rhythm
- improve visual balance
- improve empty states
- improve motion
- improve accessibility

Small improvements are preferred over large visual changes.

The objective is to make the existing concept feel more refined rather than noticeably different.

---

# Final Objective

Do not think of this page as a patient database.

Think of it as:

> **The receptionist's patient workspace.**

The receptionist should find the correct patient within seconds, immediately understand the patient's operational history, perform simple demographic updates if necessary, and return to Front Desk without feeling like she entered another application.

The page should feel calm, premium, modern and unmistakably AREN.

If Front Desk feels like the clinic's live reception desk, Patients should feel like opening a beautifully organized patient folder—clean, trustworthy and effortless to navigate.
