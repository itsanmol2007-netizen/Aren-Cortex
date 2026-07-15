# Print RX — Philosophy

## What this is

Print RX is the receptionist's document workspace.

Front Desk manages today's patient flow.

Patients manages patient information.

Print RX manages finalized prescriptions that require operational action.

It exists after the doctor has completed the consultation and before the patient leaves the clinic.

---

## Purpose

Front Desk answers:

> "Who needs attention?"

Patients answers:

> "Tell me about this patient."

Print RX answers:

> "Which prescriptions require my attention?"

Everything on this page should support that single question.

---

## Who uses it

The receptionist.

The same receptionist who spends most of the day inside Front Desk.

She is not reviewing prescriptions.

She trusts the doctor's work.

Her responsibility begins only after the prescription has already been finalized.

Her goal is simple:

- Find the correct prescription.
- Print it.
- Hand it to the patient.
- Return to Front Desk.

The page should optimize for confidence and speed rather than medical review.

---

## Relationship with Consult

Prescriptions are created inside Consult.

Print RX never edits or recreates prescriptions.

When the receptionist chooses to print, the application should reuse the exact same prescription rendering pipeline already used by Consult (`ReviewModal.tsx`).

There should be only one source of truth for prescription rendering throughout the entire product.

Future branding changes, clinic logo updates, prescription layout improvements or printing fixes should automatically apply everywhere without maintaining multiple versions.

---

## Design Philosophy

Print RX should feel like another room inside AREN.

Use the same visual language established by Front Desk and Patients.

Do not redesign the product.

Continue the same spacing philosophy, rounded surfaces, typography, soft purple accents and calm visual rhythm.

The page should immediately feel familiar to someone already using Front Desk.

The reference direction is provided in:

`/docs/Frontdesk-PrintRX-Page.png`

Treat this image as the visual direction rather than something to recreate pixel-for-pixel.

Improve the UX while preserving the same overall feeling.

---

## Workflow Philosophy

Printing should feel almost effortless.

The receptionist should never wonder whether she is opening the wrong screen or performing a dangerous action.

The interface should communicate confidence rather than complexity.

Avoid unnecessary confirmations, complicated workflows or technical language.

The software should quietly guide the receptionist through the printing process with minimal thinking required.

---

## Preview Philosophy

This page is not a prescription reader.

Avoid dedicating large portions of the interface to prescription preview.

The receptionist does not need to inspect medicines before printing.

Instead, provide a simple, action-focused workspace.

When the receptionist chooses to print, open the existing prescription rendering workflow already used inside Consult (`ReviewModal.tsx`), allowing Windows' normal print flow to handle printer selection, paper size and final preview.

Do not create another prescription rendering system for this page.

---

## Empty State

The empty state should feel warm and reassuring.

Avoid blank screens or technical messages.

If there are no prescriptions waiting, the interface should calmly communicate that everything has been printed or that new prescriptions will appear here automatically as doctors finish consultations.

The goal is to reduce anxiety for first-time users and make the page feel friendly rather than inactive.

---

# Workflow

Doctor completes consultation.

↓

Doctor finalizes prescription.

↓

Prescription automatically appears in Print RX.

↓

Receptionist opens Print RX when a patient requests their prescription or when managing completed consultations.

↓

The receptionist selects the correct prescription from the queue.

↓

Choosing **Print** opens the existing Consult printing workflow (`ReviewModal.tsx`).

↓

The normal Windows print dialog handles printer selection, paper size (A4, A5, Thermal) and printing.

↓

Once printing is completed, the prescription moves into Recently Printed while remaining easy to find for future reprints or searches.

The workflow should remain simple, predictable and fast.

Receptionists should spend their time serving patients—not learning software.



---
# Additional Implementation Notes

## Visual Reference

Use the following image as the primary visual direction for this page:

`/docs/Frontdesk-PrintRX-Page (Frozen).png`

Treat it as a design reference rather than something to recreate pixel-for-pixel.

Preserve its overall layout philosophy while improving UX where appropriate.

---

## Dynamic Right Workspace

The lower portion of the right workspace should be context-sensitive.

When **no prescription is selected**, this area should display a friendly empty state.

Its purpose is to reassure first-time users and communicate that finalized prescriptions will automatically appear here as doctors complete consultations.

Avoid technical language.

The empty state should feel warm, calm and confidence-inspiring rather than instructional.

---

When **a prescription is selected**, the empty state should disappear completely.

Instead, this area should be replaced by the patient's prescription history.

This section should display previous printable prescriptions associated with the patient, allowing the receptionist to quickly locate and print an older prescription when requested.

This is an important workflow.

Receptionists frequently need to print prescriptions that were generated days or weeks earlier, not only today's consultation.

The interface should support this naturally without forcing the receptionist to leave Print RX or perform unnecessary searches.

The current prescription remains the primary focus, while previous printable prescriptions act as supporting context.

---

## Prescription Rendering

Do not build another prescription renderer.

Carefully inspect the existing prescription review and printing implementation already used by Consult.

Reuse that implementation as the single source of truth.

Visual layout, branding, prescription formatting, paper layouts (A4, A5, Thermal), printing behavior and future branding changes should automatically remain consistent across the entire application.

Print RX should integrate with the existing prescription rendering workflow rather than duplicating it.

When the receptionist chooses **Print Prescription**, the existing review/printing workflow should open naturally, allowing the standard operating system print dialog to handle the final printing process.

There should only be one prescription rendering implementation within AREN.

---

## Design Philosophy Reminder

The receptionist is not reviewing prescriptions.

She is completing an operational task.

Keep the interface focused on confidence, clarity and speed.

Whenever making design decisions, prioritize reducing hesitation over exposing more information.

If a UI element does not directly help the receptionist identify, print or retrieve a prescription, it probably does not belong on this page.



---
## Front Desk Integration

Print RX should integrate naturally with the existing Front Desk workflow.

Once a patient's consultation is completed and a prescription exists, the completed patient row in Front Desk should expose a lightweight **Print RX** action.

This should appear as a small contextual action beside the completed status, using an appropriate printing-related icon that fits naturally within the existing AREN design language.

Do not make this action visually dominant.

It should feel like the obvious next step after consultation completion rather than another primary button.

When clicked, the receptionist should be taken directly to the Print RX page with that patient's prescription already selected and focused.

The receptionist should never have to search for the patient again after clicking from Front Desk.

This creates a seamless workflow:

Doctor completes consultation

↓

Receptionist clicks **Print RX** from the completed patient row

↓

Print RX opens with the correct prescription already selected

↓

Receptionist clicks **Print Prescription**

↓

The existing Consult prescription review/printing workflow opens

↓

Operating system print dialog

↓

Prescription printed

↓

Patient receives prescription

---

## Existing Prescription Data

Do not create placeholder data or a separate printing database.

Print RX should build upon the existing prescription data already available in the application.

Even before full Consult integration is complete, the page should be designed around reading existing prescription records rather than introducing duplicate storage.

The implementation should naturally support:

- Newly generated prescriptions appearing in the Ready queue.
- Previously generated prescriptions being searchable.
- Previous prescriptions appearing in the patient's prescription history.
- Future real-time updates without requiring architectural changes.

Allow the implementation to determine the most appropriate technical approach while preserving this workflow philosophy.

Reuse existing architecture wherever possible.
