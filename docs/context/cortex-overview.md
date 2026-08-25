# Cortex overview — what it is, where things live

Part of the `aren-cortex-context.md` split, 2026-08-24 (see that file's header
for why: it had grown into one ~830-line file, expensive to read for a task
that only touches one section). This pocket is §1+§2 of that file, unchanged
in content, just moved.

---

## What Cortex is

The doctor's consult workspace: patient intake → chart (symptoms/findings/history) →
Synapse engine ranks possible conditions, medicines, tests, referrals, advice,
exercises, modalities, impairments → doctor accepts/searches/confirms → review & save
→ decision log feeds the learning loop.

Eight specialty profiles: General OPD (default), Physiotherapy, Diagnostics,
Cardiology, Pediatrics, Gynaecology, Dentistry, Dermatology. A profile is pure
**configuration** — which intent type is primary, which measurements default on,
which specialty charts render. It never changes the engine's ranking logic.

---

## File tree — where things live

```
src/
  App.tsx                          — shell only: boot, nav, toast, which overlay is open (~1,050 lines)
  hooks/
    useConsultChart.ts             — what was RECORDED (symptoms, findings, vitals)
    useAcceptLedger.ts             — which engine intent each plan item came from
    useConsultSession.ts           — who/which visit/which patient; v1 compat write
    useConsultIntelligence.ts      — runs the Synapse engine per chart change
    useConsultPlan.ts              — accept-to-plan pipeline; handleAcceptIntent (the one entry point)
    useConsultLifecycle.ts         — start/repeat/save/end; clearWorkspace()
    useClinicalIdentity.ts         — which doctor/clinic is signed in
    useLongitudinalRecord.ts       — patient history / trend data, between session and plan
    useRovingList.ts               — shared ↑↓/Enter keyboard nav over ranked lists (DOM-cursor based)
    useOverlayFocus.ts             — shared focus-trap/restore for all overlays
    useConsultKeyboard.ts          — global keyboard handler
    useDismiss.ts                  — outside-click close for menus
    usePinnedMedicines.ts          — doctor's pins (Supabase-backed, not localStorage)
  features/consult/
    GeneralOpdInputs.tsx           — General OPD's own input surface (Case Sheet + Measurements/Attachments)
    SoapInputs.tsx                 — shared fallback: 3 pickers (History/Symptoms/Findings) + Measurements
    PhysioInputs.tsx               — Physiotherapy's own input surface (Story+Goals ahead of command bar)
    CaseSheet.tsx                  — chip entry surface used by General OPD / Physio (ROW_BUDGET per group)
    StoryCard.tsx / GoalsCard.tsx  — Physiotherapy subjective intake + patient goals
    ConditionsCard.tsx             — Possible Conditions (engine's finding-type output)
    MeasurementsCard.tsx           — single source of truth for this visit's numbers
    AttachmentsCard.tsx            — X-rays/lab reports/photos, B2-backed
    RecommendationsCard.tsx        — ranked medicines, brand-first, combinations as alternates
    SuggestionsCard.tsx            — tests/referrals/advice as one ranked stream
    ExercisePlanCard.tsx           — physiotherapy exercise plan + Progressed/Same/Eased/Added badges
    PlanCard.tsx                   — the assembled consultation
    IntentSearch.tsx               — the ONE manual-search fallback for all output types
    AddMedicineSheet.tsx           — the composition-anchored "brand not in our catalogue" flow
    freeTerms.ts                   — shared matching for the free-text fallback (finding/test/referral/advice)
    ContributionSheet.tsx          — "why is this ranked here" (never a modal — no focus trap)
    DentalChartCard.tsx / BodyMapCard.tsx / JointMapCard.tsx / GrowthChartCard.tsx
                                    — specialty tools, gated per profile via SpecialtyProfile.charts
    LongitudinalBand.tsx           — trend/history strip, collapsible, scrolls with page
    measures.ts                    — MEASURE_FIELDS catalogue + RELEVANT_FIELDS (signal→field relevance)
    story.ts                       — physiotherapy Subjective vocabulary (factors, patterns)
    exercisePlan.ts                — exercise dose model (sets/reps/hold/side), comparePlans()
    examination.ts                 — physio exam regions/movements/MMT/special tests
    dosing.ts                      — static composition→food-instruction map
    parts.tsx                      — shared vocabulary (MedicineIdentity, RankBar, PinButton, GuardReason)
    types.ts                       — AcceptPayload, the one shape every accept takes
  lib/
    synapse/                       — the engine: PURE, no React/Supabase import, ever
      engine.ts                    — runEngine, guardIntent, guardCombination, medicineIntentIndex
      consultInput.ts              — vitals → engine input (BP split, °F→°C, age, text-row filtering)
      brands.ts                    — brand-family grouping, PEDIATRIC_FORMS, paediatric form-priority tier
      specialtyProfile.ts          — the 8 profiles; profileFor() reads hospitals.specialty_profile
      systems.ts                   — body-system order/labels, the one place
    keyboard/keymap.ts             — the ONE declaration of every keyboard binding
    dental/ · body/                — chart geometry (anatomy.ts, types.ts)
    growth/                        — WHO growth engine (whoStandards.ts, growth.ts, age.ts)
    db/
      synapse.ts                   — loadRuleset, commitConsultation, addMedicine, doctor free-text/composition-request I/O
      medicines.ts                 — fetchCombinationProducts (whole-product resolution)
      story.ts                     — Story/Goals persistence
      bodySites.ts                 — shared storage for BodyMapCard + JointMapCard
      intelligence.ts              — saveConsult
      reference.ts / patients.ts / prescriptions.ts
      — DB calls ONLY go here. db.ts is a barrel; never add functions there.
  components/
    ReviewModal.tsx                — the one shared review/print surface (Tailwind)
    PatientHeader.tsx / PatientModal.tsx / ActiveConsultGuard.tsx
    MedicineInspector.tsx / GlobalLogoTrigger.tsx / ShortcutsSheet.tsx
  features/prescription/PrescriptionDocument.tsx  — what the patient actually receives (print/PDF/WhatsApp)
  features/settings/SettingsPage.tsx  — specialty switch (doctor self-service, temporary) + logout
  features/patients/  — PatientsPage + PatientRecord (built). features/practice/PracticePage.tsx
    — pinned medicines, real. features/sidebar/ — Sidebar +
    SidebarNav, six real destinations (Consult action, Patients, Communication, Practice,
    Clinic, Settings) + Help & Support utility — "Prescriptions" and
    "Investigations" are deliberately NOT pages (see SidebarNav.tsx's header for why); their
    0-byte stub folders were deleted, not left as dead placeholders. features/communication/
    CommunicationPage.tsx and features/clinic/ClinicPage.tsx are dedicated
    coming-soon pages, own illustration + own copy — genuinely still not built (no data
    model behind either), just no longer the generic ComingSoonPage. features/support/
    SupportPage.tsx is real: mailto:/tel: cards, not a stub. App.tsx's
    COMING_SOON_META now stays empty, kept only as the fallback for a future destination
    with no page yet. See `cortex-open-crosscutting.md` for the full reasoning on all three.
  styles/
    consult.css   (cs-*)  — the consult screen. ALL new consult UI goes here.
    workspace.css (cx-*)  — legacy, mostly dead; 3 sheets + 1 selector hook still live
supabase/functions/   — edge functions, in git (attachment-upload-url, -view-url, -delete, -configure-cors)
```

**What's NOT covered here:** the data model (→ `cortex-data-model.md`), standing
rules (→ `cortex-standing-rules.md`), the "where do I change X" lookup (→
`cortex-change-map.md`), open work and gotchas (→ `cortex-open-*.md`,
`cortex-gotchas.md`). Deep engine/keyboard/consult-screen architecture already
has its own pockets — `engine.md` and `consult-ui.md` in this same directory.
