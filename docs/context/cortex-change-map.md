# Where do I change X? — Cortex lookup table

Part of the `aren-cortex-context.md` split, 2026-08-24. This pocket is §6 of
that file, unchanged in content plus the rows added the same day for the
free-text and composition-request fallbacks.

---

| I want to change… | Open |
|---|---|
| Consult state, effects, handlers (the shell) | `src/App.tsx` |
| Anything about how the consult screen LOOKS | `src/styles/consult.css` (`cs-*`) |
| Chip entry, fuzzy search, browse-all | `PickerCard.tsx` (SOAP profiles) / `CaseSheet.tsx` (General OPD, Physio) |
| Possible Conditions (engine's reading) | `ConditionsCard.tsx` |
| Which measurement fields exist | `measures.ts` → `MEASURE_FIELDS` |
| Which measurements a facility shows by default | `specialtyProfile.ts` → `measurements` |
| Which symptom surfaces which measurement | `measures.ts` → `RELEVANT_FIELDS` (keyed on signal id) |
| Which joint surfaces which ROM field | `measures.ts` → `JOINT_RANGE_FIELDS` (separate map, physio-only) |
| Which intent type is primary for a profile | `specialtyProfile.ts` → `primary` |
| The manual search on any category | `IntentSearch.tsx` — the one place |
| The "why did this rank" panel | `ContributionSheet.tsx` |
| Prescription dose/frequency/duration editing | `PlanCard.tsx` (`DoseEditor`) |
| Freq ⇄ dose-slot conversion (M/A/E/N) | `lib/db/reference.ts` — the slot string is canonical, never parse the human label |
| A combination product's guard verdict | `lib/synapse/engine.ts` → `guardCombination` / `medicineIntentIndex` |
| Which combination products a molecule offers | `lib/db/medicines.ts` → `fetchCombinationProducts` |
| Keyboard shortcuts | `lib/keyboard/keymap.ts` — the one place |
| ↑↓/Enter over a ranked list | `hooks/useRovingList.ts` — don't fork it |
| Ranking/guards/personalisation/brands — the MATH | `src/lib/synapse/*.ts` (pure) |
| A paediatric consult's DEFAULT brand (syrup vs tablet) | `lib/synapse/brands.ts` → `resolveBrands`'s form-priority tier |
| Vitals → engine measurements | `lib/synapse/consultInput.ts` — the one place |
| Loading ruleset/catalogue/preference models | `src/lib/db/synapse.ts` |
| Which doctor/clinic is signed in | `src/hooks/useClinicalIdentity.ts` |
| What saving a consult writes | `lib/db/intelligence.ts` → `saveConsult` |
| The learning write | `lib/db/synapse.ts` → `commitConsultation` |
| Body-system order/labels | `lib/synapse/systems.ts` — the one place |
| A DB query | `lib/db/{reference,patients,intelligence,prescriptions,synapse,clinic}.ts` — never `lib/db.ts` |
| The Clinic page — cards, identity surface, layout | `src/features/clinic/ClinicPage.tsx` (Tailwind, no stylesheet) |
| A Clinic/Prescription-Editor visual primitive (card, toggle, field, tone) | `src/features/clinic/ui.tsx` — the one place |
| What a prescription PRINTS (letterhead, footer, standing advice) | `src/features/clinic/PrescriptionEditorPage.tsx` writes the config; `features/prescription/PrescriptionDocument.tsx` renders it. Never the other way round. |
| Clinic information / doctor profile / opening hours forms | `src/features/clinic/ClinicModals.tsx` |
| The specimen patient + medicines both Rx previews show | `src/features/clinic/samplePrescription.ts` — one file, both surfaces |
| How the config reaches a REAL printed prescription | `features/prescription/usePrescriptionConfig.ts`, loaded inside `ReviewModal` (the one door Consult / Patient Record / Print RX all print through) |
| Logo/photo compression before upload | `lib/image/compress.ts` — the one place |
| The shared logo/photo picker UI | `features/clinic/ui.tsx` → `ImagePicker` |
| Black & white printing | `PrescriptionConfig.printMode`, read in `PrescriptionDocument.tsx`'s `StandardDocument` (thermal is unaffected — already monochrome) |
| The one "back to parent page" button | `components/BackButton.tsx` — the one place, Cortex app only (not `frontdesk/`) |
| Undo/remove an accepted row in place | `useConsultPlan.ts` → `removeAcceptedIntent` (dispatches to the per-type remover) |
| A confirmed condition's silent Case-Sheet chip, and taking it back off | `useLongitudinalRecord.ts` → `confirmCondition` / `unconfirmCondition` |
| The free-text fallback (finding/test/referral/advice) — matching/scoring | `src/features/consult/freeTerms.ts` |
| The free-text fallback — persistence | `lib/db/synapse.ts` → `loadDoctorFreeTerms` / `saveDoctorFreeTerm`, `doctor_free_terms` table |
| The free-text fallback — chart-local add | `useConsultPlan.ts` → `addFreeDiagnosis` / `addFreeTest` / `addFreeReferral` / `addFreeAdvice` |
| Adding a brand not in the catalogue | `AddMedicineSheet.tsx` — forces an existing composition pick, hands off into `MedicineAddSheet` |
| Requesting a composition/salt not in the catalogue | `lib/db/synapse.ts` → `requestNewComposition`, `composition_requests` table (a request queue, never a live mint — rule 22) |

**What's NOT covered here:** WHY a file is shaped the way it is (read that
file's own header comment — this codebase over-comments on purpose), the
standing rules that constrain how you make the change (→
`cortex-standing-rules.md`), open/unfinished work in the area you're about to
touch (→ `cortex-open-physio.md` / `cortex-open-crosscutting.md`).
