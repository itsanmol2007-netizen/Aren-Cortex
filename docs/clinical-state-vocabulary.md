# Clinical state vocabulary (proposed, 2026-09-25)

For the "ongoing clinical state" record: what a fracture, a cast or a
planned action is *doing* between visits. Three kinds, each mapped onto the
HL7 FHIR status set that already governs that kind of thing, so the words
are recognisable and exportable, with clinician-facing labels on top.

## 1. Assessments (FHIR Condition.clinicalStatus)

FHIR: `active` (children `recurrence`, `relapse`) · `inactive` (children
`remission`, `resolved`).

| Shown to the doctor | Stored | Meaning |
|---|---|---|
| Active | active | Present, being treated |
| Healing / Improving | active + progress `healing` | Getting better, not done. "Healing" for fractures and wounds, "Improving" for everything else |
| Resolved | resolved | Gone, negligible risk of return |
| In remission | remission | Quiet, may return (inflammatory arthritis, gout) |
| Recurred | recurrence | Back after being resolved |

Fracture-specific progress terms, as orthopaedic notes use them:
**Healing**; **Clinically united** (no pain, tenderness or movement at the
site, typically 6-8 weeks); **Radiologically united** (bridging on X-ray).
**Delayed union** (no union by the expected time: roughly 3-6 months,
bone-dependent) and **Non-union** (no progress over 3 consecutive months,
fracture at least 9 months old) are *new assessments* in the catalogue that
the fracture links to, not statuses.

Chronic conditions (knee OA) default to Active and never auto-resolve.

## 2. Interventions that stay in place (FHIR DeviceUseStatement.status)

FHIR: `active` · `completed` · `intended` · `stopped` · `on-hold` ·
`entered-in-error`.

| Shown | Stored | Applies to |
|---|---|---|
| In place | active | Cast, splint/brace, strapping, sutures/staples, dressing |
| Removed | completed | Ended by its removal (linked through `removes_id`) |
| Changed | completed | Replaced by a new one (dressing change, recast) |
| Removed early | stopped | Removed before the planned date (complication, intolerance) |

Which families persist, and which family ends them, comes from
`interventionFamilies.ts` (`removableFamilies`), not from a hard-coded
cast rule.

## 3. Planned next actions (FHIR RequestStatus)

FHIR: `draft` · `active` · `on-hold` · `revoked` · `completed` ·
`entered-in-error`.

| Shown | Stored | Meaning |
|---|---|---|
| Due / Due today | active | Planned, date not passed |
| Overdue | active (derived) | Due date passed, not done. Never stored |
| Done | completed | Performed (the performing row links via `fulfils_id`) |
| Deferred | on-hold | Pushed to a later visit |
| Cancelled | revoked | No longer needed |

Applies to planned interventions (removal, dressing change), repeat
investigations (repeat X-ray) and reviews (wound review, reassess ROM).

## Sources
- HL7 FHIR R4 Condition clinical status: https://hl7.org/fhir/R4/valueset-condition-clinical.html
- HL7 FHIR R4 RequestStatus: https://hl7.org/fhir/R4/valueset-request-status.html
- HL7 FHIR R4 DeviceUseStatement status: https://hl7.org/fhir/R4/valueset-device-statement-status.html
- Concepts of fracture union, delayed union and nonunion (Clin Orthop Relat Res): https://pubmed.ncbi.nlm.nih.gov/9917623/
- RCH fracture clinic guideline, humeral shaft (clinical vs radiological union): https://www.rch.org.au/clinicalguide/guideline_index/fractures/Humeral_shaft_fractures_Outpatient_fracture_clinics/
