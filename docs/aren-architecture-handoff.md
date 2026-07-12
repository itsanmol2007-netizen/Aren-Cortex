# AREN Architecture Handoff
Version: Phase 1 MVP
Status: Frozen Architecture (Pre-Implementation)

---

# Vision

AREN is **not** a hospital management system.

AREN is a lightweight clinical operating system built for small and medium clinics that currently rely on paper or outdated software.

The philosophy is simple:

Reduce friction.

Reduce clicks.

Reduce cognitive load.

Every screen exists because someone is trying to complete a real task—not because dashboards look nice.

---

# Core Philosophy

AREN consists of two operational workspaces.

1. Front Desk
2. Cortex (Doctor Workspace)

Both operate on the same Visit object.

Everything revolves around the Visit.

Patient ≠ Visit.

One patient can have hundreds of visits.

Every interaction creates or modifies a Visit.

---

# Universal Workflow

Patient arrives

↓

Reception identifies or creates patient

↓

Visit is created

↓

Patient enters queue

↓

Doctor starts consultation

↓

Doctor completes consultation

↓

Prescription generated

↓

Visit completed

---

Nothing outside this flow should interrupt it.

---

# Workspace Philosophy

## Front Desk

Purpose:

Manage patient flow.

Receptionists never prescribe.

Receptionists never perform consultation.

Their job is only to create and manage Visits.

### Responsibilities

- Search patient
- Create patient
- Create visit
- Queue management
- Assign doctor
- Collect presenting symptoms
- Print token (future)
- Send patient to doctor
- Manage visit status

---

## Cortex

Purpose:

Clinical decision workspace.

Doctor should never manage queues manually.

Doctor should focus only on clinical thinking.

Responsibilities:

- Open patient
- Review history
- Record findings
- Add diagnosis
- Select medicines
- Order investigations
- Generate prescription
- Complete consultation

Nothing else.

---

# Solo Mode

Some clinics have no receptionist.

AREN supports both.

The architecture never changes.

Only the actor changes.

Reception tasks become available inside Cortex.

This is controlled through Clinic Configuration.

Configuration:

Reception Available = true

or

Reception Available = false

When false:

- New Patient button appears inside Cortex.
- Doctor can create Visit directly.

No second interface required.

---

# Visit Object

Everything revolves around Visit.

Contains:

Patient

Doctor

Visit Status

Symptoms

Findings

Medicines

Tests

Prescription

Timeline

Notes

Visit Status Flow

Waiting

↓

In Consultation

↓

Completed

Cancelled is terminal.

---

# Universal Cortex

AREN does not build separate applications for different specialties.

There is one Cortex.

Universal Cortex provides the common consultation engine.

Examples:

Symptoms

Findings

Diagnosis

Medicines

Investigations

Prescription

History

These exist for every specialty.

---

# Specialty Philosophy

Specialties are NOT separate products.

They extend Cortex.

Never fork Cortex.

Never duplicate Cortex.

New specialty requirements become reusable panels.

Example:

Physiotherapy

adds:

Pain Scale Panel

Session Counter

Exercise Plan

Cardiology

may later add:

ECG Panel

Ejection Fraction Panel

Psychiatry

may later add:

PHQ-9 Panel

GAD-7 Panel

These are additional panels.

The universal consultation flow never changes.

---

# Component Philosophy

Every major block should be independent.

Examples

Patient Launcher

Queue

Visit Row

Visit Modal

Doctor Card

Summary Card

Doctor Requests

Stat Card

Each component owns:

UI

State

Interactions

Rendering

Components communicate through shared application state.

Never directly manipulate another component.

---

# Patient Launcher

The Patient Launcher is the primary interaction point of Front Desk.

Everything starts here.

Functions:

Search patient

Find returning patient

Create new patient

Start visit

This replaces separate Search and Register workflows.

Workflow:

Type

↓

Matches appear

↓

Existing patient selected

OR

Create new patient

↓

Visit created

↓

Patient enters queue

---

# Queue Philosophy

The queue is the heart of Front Desk.

Everything else supports the queue.

Each row shows:

Token

Patient

Phone

Symptoms

Assigned Doctor

Last Visit

Status

Returning Badge

Only operational information.

No analytics.

No revenue.

No unnecessary metrics.

---

# Status Colors

Blue

Primary actions

In Consultation

Amber

Waiting

Green

Completed

Red

Only destructive actions.

Purple

Never used as a status.

Only subtle focus accents to connect visually with Cortex.

---

# Front Desk Sidebar

Sidebar is operational.

Not analytical.

Contains:

Today's Summary

Doctors

Doctor Requests

Nothing else.

---

# Doctor Requests

Future communication bridge.

Doctor sends small requests without leaving Cortex.

Examples:

Need wheelchair

Need previous file

Send next patient

Reception acknowledges.

No chat.

No messaging.

Task-oriented only.

---

# Interaction Principles

Single click everywhere.

No double click.

Hover provides additional information.

Tooltips explain hidden data.

Modal for editing.

Never inline expansion.

Undo instead of confirmation wherever safe.

Skeleton loading instead of spinners.

Minimal toast notifications.

---

# Language System

UI strings never live inside components.

All strings come from one central dictionary.

Current languages:

English

Hinglish

Architecture supports:

Hindi

Future languages

without changing components.

---

# Keyboard Philosophy

Not implemented in MVP.

Architecture must support it.

Future actions include:

Open launcher

Create patient

Search patient

Move queue

Save visit

Everything should eventually be keyboard accessible.

---

# Authentication

Single application.

Single authentication.

Role-based rendering.

Routes:

/frontdesk

/cortex

Same deployment.

Same session.

Clinic configuration determines visible workspaces.

---

# Design Philosophy

The interface is an operational workspace.

Not a dashboard.

Not analytics software.

Priority order:

Patient

↓

Current Task

↓

Queue

↓

Supporting Information

The UI should disappear while working.

Receptionists should stop thinking about software after one day.

---

# MVP Scope

Phase 1 includes:

✓ Front Desk

✓ Cortex

✓ Visit Management

✓ Universal Consultation Engine

✓ Solo Mode

✓ Multi-Doctor Clinics

✓ Queue

✓ Patient History

✓ Prescription Generation

Not included:

Billing

Inventory

Lab Integration

WhatsApp Automation

Realtime Sync

Appointments

Analytics

ABDM

Government integrations

Marketplace

Mobile apps

These are future phases.

---

# Final Philosophy

AREN should never become software that users "operate."

It should become infrastructure that quietly assists clinical work.

When receptionists describe AREN, the ideal response is:

"It just works."

Not:

"It has lots of features."

That is the product philosophy.