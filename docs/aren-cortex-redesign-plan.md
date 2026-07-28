# AREN Cortex — Workspace Redesign Plan

*Started 2026-07-28. This document is the resumable source of truth for the
doctor-workspace redesign. Any session can pick up from the step marked
`IN PROGRESS`. Read `docs/aren-cortex-atlas.md` first for the technical map,
and `referance (synapsev2)/Synapse v2 handoff .md` §14 + §16 for the seven
rules the UI must honour.*

---

## What we're building

The consult workspace redesigned as a **left-to-right story**, replacing the
current congested layout (two pickers up top, a tabbed suggestions panel with
35% dead whitespace beside it, a dead tests panel on the right):

```
┌─ PatientHeader (UNTOUCHED — out of scope) ────────────────────────────────┐
├────────────────┬───────────────────────────────┬──────────────────────────┤
│ 1 · CHART      │ 2 · SYNAPSE                   │ 3 · PLAN                 │
│ what you know  │ what it suggests              │ what you're issuing      │
│                │                               │                          │
│ one fuzzy      │ NO TABS — one scrolling       │ Medicines (lines with    │
│ search over    │ column, sections in clinical  │  brand + dose chips)     │
│ all 374 chips, │ reading order:                │ Investigations (tests    │
│ routed by kind │  · Impression (findings —     │  land HERE, right side)  │
│ into zones:    │    tap to confirm onto chart, │ Advice & referrals       │
│  · Reported    │    engine re-runs)            │ Follow-up (quick chips)  │
│  · Examined    │  · Tests                      │                          │
│  · History     │  · Referrals                  │ [Review Prescription]    │
│ system browse  │  · Medicines (brand picker)   │                          │
│ intensity via  │  · Advice & exercises         │ column IS the live Rx —  │
│ keyboard       │ hard-warn ledger pinned top   │ what saves on confirm    │
│                │ companions strip              │                          │
│                │ frequent quick-list when      │                          │
│                │ chart is empty                │                          │
└────────────────┴───────────────────────────────┴──────────────────────────┘
```

**Why this shape:** the doctor's eye never backtracks — observe left, decide
middle, verify right. Tests stop being a tab (they were invisible unless the
doctor clicked the Tests tab); every intent type gets its own always-visible
section. The Plan column is the live prescription, so "what am I actually
giving this patient" is answerable at a glance without opening the review
modal.

## Design language — the one deliberate decision (atlas §10.6 / rule 7)

The redesign is authored as **plain global CSS in `src/styles/workspace.css`
under a `cx-` prefix** — the same mechanism as the dominant legacy vocabulary,
in the visual language of `SynapseStyles.tsx` (which the atlas calls the
closest preview of a restyled Cortex): generous whitespace, hairline dividers,
ink-and-grey with colour only for meaning, 16px radii, glass surfaces with
`backdrop-filter`. All class-based selectors, so no Tailwind layer-trap
exposure. `SynapseStyles.tsx` gets folded into this vocabulary in Step 3,
taking Cortex from four styling vocabularies toward two.

Colour keeps meaning only: blue = the one action, amber = soft guard,
red = hard guard, green = added/done. Per-column focus glow doctrine carries
over: chart pink, synapse blue, plan violet.

## Specialty readiness (physio / cardio / dentist, coming weeks)

Nothing in the new UI hardcodes OPD. Zones come from `observables.kind`
(handoff §16 translator 1), sections from `TYPE_ORDER` (translator 2),
vitals from `measures.ts`-style definitions (translator 3). A specialty is a
data lens: different `domains` filter, different measure group, an Exercises
section that simply has content. No layout change required.

## The seven rules the UI must honour (handoff §16 — verbatim, non-negotiable)

1. No guard ever hides a suggestion; `warn_hard` = red + acknowledge-to-prescribe.
2. Search reaches everything, but out-of-list picks render their guard verdict at full strength.
3. `searched_accepted` / `override_accepted` are never logged as plain `accepted`.
4. Rank order is the engine's — never re-sort in a component.
5. Findings are intents: confirming one writes it back as an observation and re-runs the engine.
6. Brands are a lookup after ranking; never rank a brand.
7. A molecule with no brand is shown as the molecule, not an error.

---

## Steps (each shippable — build green, app usable at every boundary)

### Step 1 — New 3-column shell + Plan column · **IN PROGRESS**
- `src/styles/workspace.css` (new, `cx-*`) imported in `main.tsx`; glass tokens.
- `App.tsx` consult branch → `Chart | Synapse | Plan` grid (old pickers stacked
  in the chart column for now; SuggestionsPanel as-is in the centre).
- New `src/components/PlanPanel.tsx` = live Rx column: medicine lines
  (click → MedicineInspector), ordered tests, advice/referral lines
  (removable), follow-up quick chips (3/5/7/14 d — first time follow-up is
  actually settable anywhere), Review CTA.
- Delete `PreviewPanel.tsx`, `SelectedMedicinesBar.tsx`; drop orphaned
  `components-picks.css` + `components-bar.css` imports.
- `tsc -b` + `npm run build` clean.

### Step 2 — Unified Chart column · PENDING
- One `ChartPanel` replaces `ChipSearchPanel` + `FindingsPanel`.
- Single search across all observables (label → search_text incl. Hindi
  aliases → slug; subsequence/typo-tolerant), results routed by `kind` into
  Reported / Examined / History zones automatically — the doctor never picks
  a target panel.
- Keyboard-first: type → arrows → Enter adds; intensity cycling on the chip.
- System browse redesigned (18 systems, `lib/synapse/systems.ts` order).
- Selected chips grouped by zone; the v1 compatibility write keeps working
  (labels in `selectedSymptoms`/`selectedFindings` state stay the interface).

### Step 3 — Synapse column without tabs · PENDING
- Sectioned continuous scroll in `TYPE_ORDER`: Impression → Tests →
  Referrals → Medicines → Exercises → Advice. Human headers ("Investigations",
  never the raw `type`), counts, always rendered when non-empty.
- Impression rows get "confirm onto chart" (rule 5 — the loop that makes
  findings suggestions real).
- Hard-warn ledger pinned at top (§14 list), acknowledge flow unchanged.
- Companions strip; frequent-medicines quick-list as the empty/chart-less
  state ("your own history · not a suggestion").
- `SynapseStyles.tsx` folded into `workspace.css`.

### Step 4 — Plan column refinement · PENDING
- Inline dose/frequency/duration editing on the line (chip → popover or
  stepper), SOS toggle, brand swap from the plan line.
- MedicineInspector demoted to the "more detail" path, not the only editor.

### Step 5 — Keyboard flow + polish + cleanup · PENDING
- Full keyboard map: `/` or `Ctrl+K` focus chart search, Tab cycles columns,
  Enter accepts focused suggestion, Ctrl+Enter review (exists), visible
  shortcut hints; remove dead `testsSearchRef` stop + Alt+M.
- Delete orphaned CSS (`components-picks.css`, `components-bar.css`, dead
  selectors in `components-medicines.css`).
- Browser-test end-to-end with the demo doctor account.
- Update `aren-cortex-atlas.md` §7 / §12 / §13.

## Out of scope (explicitly, per Anmol)

PatientHeader (dark patient strip + vitals), all modals (PatientModal,
ActiveConsultGuard), ReviewModal / Rx preview / print pipeline, sidebar,
feature pages, the engine and DB layer (done), reception queue gap (§10.3).

## Log

- **2026-07-28 · Step 1 started.** Layout decision recorded above.
- **2026-07-28 · Step 1 shipped.** 3-column shell live (`workspace.css`,
  `PlanPanel.tsx`); PreviewPanel, SelectedMedicinesBar, components-picks.css,
  components-bar.css deleted; follow-up days settable for the first time;
  removing anything from the Plan releases its intent. `tsc -b` + build clean.
- **2026-07-28 · DESIGN SPEC WRITTEN — read it before building anything
  further:** `docs/aren-cortex-workspace-design.md`. It supersedes the step
  list below with **Phases A–E** (context bar · chart panel · synapse sections
  + medicine brand-cards · plan refinements · keyboard/cleanup). Key
  Anmol-driven decisions baked in: a full-width patient-context bar (pregnant/
  diabetic/smoker… one-click toggles over the 22 real history observables);
  tabs are banned — every intent type gets permanent space; medicines render
  as composition cards whose 5 brand chips ARE the interface (one click =
  prescribed); findings surface as Impression→Dx (verified: 0/68 finding
  intents can write back to the chart today) plus system-relevant "likely on
  exam" ghosts in the chart column.
- **2026-07-28 · PHASE A SHIPPED — context bar.** `src/components/ContextBar.tsx`
  + `.cx-ctx-*` in `workspace.css` + App wiring. Verified live against the
  "Test (Delete)" patient (age 99): Elderly badge derives from age and is not a
  toggle; `elder` in the symptom picker now returns nothing; **one click on
  Pregnant took the engine from 2 → 3 signals and turned Aceclofenac /
  Diclofenac / Tolperisone red with "8 suggestions need your acknowledgement"
  and no add button until acknowledged** — §14 doctrine intact with zero other
  interaction. More popover: search-focused, Esc closes, excludes the two
  age-derived chips. Test visit row + its observations deleted afterwards.
  - *Implementation notes for later phases:* `selectedSymptoms` is still the
    ONE chart array — it is only split for rendering (`symptomChips` /
    `contextChips` in App). The picker's `onChange` goes through
    `handleSymptomsChange`, which re-appends the context half; a picker edit
    must never be allowed to drop context. History chips are out of
    `symptomObservables` (picker now says "Browse all 280", not 374), and
    `handleRepeatRx` validates against `reportableLabels` so a repeated Rx
    still carries "Known diabetic" forward.
  - *One addition the spec implied but did not spell out:* a context chip
    ticked from the More popover also renders inline on the bar (after the
    pinned ones). The chart rails filter history out, so otherwise it would be
    visible nowhere and unremovable without reopening More.
- **2026-07-28 · PHASE B SHIPPED — unified Chart panel.**
  `src/components/ChartPanel.tsx` + `.cx-chart-*` / `.cx-chip` / `.cx-ghost` /
  `.cx-browse-*` in `workspace.css`. `ChipSearchPanel.tsx` and
  `FindingsPanel.tsx` are **deleted**. Verified live end to end:
  - **"bukhar" → Fever** (tier-2 `search_text` match, ahead of slug), and
    "khansi" → Cough. Both chips were added by typing + Enter with **no mouse
    at all** — App now focuses the chart search when a consult starts, so the
    doctor lands where the consult begins.
  - **Likely on exam** surfaced Crepitations on chest / Noisy breathing from
    the systems of Fever + Cough; clicking one promoted it to a real finding
    and moved the Impression from "Viral fever, undifferentiated" to
    **"Community acquired pneumonia"** (4 signals).
  - Browse-all sheet: 374 chips by system, filter narrows in place, Esc closes,
    selections show ✓.
  - **v1 compatibility write intact** — one chart produced 3 `visit_observations`,
    2 `visit_symptoms` ("fever, cough") and 1 `visit_finding`.
  - *Design correction made during verification:* the browse sheet was built
    with CSS `columns`, which flows each system to the bottom of a column before
    starting the next — in a vertically scrolling sheet that put Respiratory
    beside Eyes beside Endocrine and scrambled the browse order as you scrolled.
    Replaced with a CSS grid so systems read left-to-right in `SYSTEM_ORDER`.
    Ragged row bottoms are the accepted price; see the comment in the CSS.
  - *Newly orphaned, for the Phase E cleanup:* `src/components/Tag.tsx` and
    `src/utils/filter.ts` (both were used only by the deleted pickers), plus the
    now-dead `.chip-panel` / `.search-box` / `.findings-*` selectors in
    `components-base.css` and `components-panels.css`, and the
    `.symptoms-panel` / `.findings-panel` focus rules in `base.css`.
  - *Known, deferred to Phase E as scoped:* `findingsSearchRef` is still passed
    to `useConsultKeyboard` but no longer attached to an input, so the Tab cycle
    has two dead stops (findings + tests) until the keyboard model is rewritten.
- **2026-07-28 · PHASE C SHIPPED — Synapse sections, no tabs.**
  `SuggestionsPanel.tsx` rewritten; `SynapseStyles.tsx` **deleted** (its `syn-*`
  rules moved into `workspace.css` as `cx-*`, and `BrandSheet` was renamed onto
  the same vocabulary) — **Cortex is down from four styling vocabularies to
  two**: `cx-*` for the redesigned workspace, the legacy stylesheets for
  everything not yet touched.
  - Sections are permanent and in clinical order: Impression → Investigations →
    Referrals → Medicines → Exercises → Advice → Often goes with. Verified live:
    a low-back-pain chart showed Investigations, Referrals (Physiotherapy) and
    Medicines all at once, no tab anywhere.
  - **Medicines are cards whose brand chips are the interface.** Paracetamol
    rendered Calpol / Crocin / Dolo 500 / A 250 Suspension / A Mol 650 + "1785
    more"; **one click on Calpol put it on the Plan** with defaults (1 tab ·
    Morning and Night · 5 days) and **did not open the dose editor** — that
    auto-open was removed, it was the largest click cost in the old workspace.
  - Impression: primary + "also considering" alternates that swap into the
    primary slot on click (presentation only — the engine's order is never
    re-sorted), and **[Use as Dx]** now records a real accept. Finding accepts
    used to be a silent no-op, so the decision log never saw which impression
    the doctor agreed with; they now land on the Plan as a Dx line and lead
    `saveConsult.findingsText`.
  - §14 doctrine preserved and strengthened: guard reasons inline, acknowledge
    to unlock, a non-collapsible ledger of unread contraindications, and a new
    **save gate** — review refuses to open while a hard-warned intent the doctor
    is actually prescribing is unread (covers search/frequent picks, which have
    no accept button to lock). Un-acknowledging withdraws the accept it allowed.
  - Brand learning corrected: only a **deliberate** brand pick (a non-default
    chip, or a swap in the sheet) is fed to `commitConsultation` — recording the
    default as "chosen" would train the model on its own output (handoff §12).
  - Idle state is the doctor's frequent list, labelled "your own history · not a
    suggestion" per handoff §13.5.
- **2026-07-28 · Vitals strip refined** (`PatientHeader` + `components-base.css`).
  The strip previously showed `120/80`, `98.6` etc. as placeholders that sat in
  the same position and near-enough colour as real readings, so an unrecorded
  vital read as a recorded one — and these feed the engine. Empty pills are now
  **dashed and light**; a filled one goes solid, blue-tinted and bold, so
  recorded vs not-recorded is a difference in shape, not shade. Units are fixed
  suffixes (`mmHg` `bpm` `°F` `%` `kg`) — **°F is load-bearing**, since the rule
  base is Celsius and `consultInput.ts` reconciles by magnitude heuristic.
  Amber warnings now carry a `title` saying which threshold was crossed, and
  Enter walks to the next vital.
- **2026-07-28 · FIXED: the old prefilled-dosage bug (3 in the editor, 2 on the
  card).** Root cause was two disagreeing frequency vocabularies.
  `MedicineInspector` parsed the human LABEL with a substring test, so the
  default "Morning and Night" lit three buttons — M from "**M**ORNING", A from
  "**A**ND", N from "**N**IGHT" — while the save path mapped the same label to
  `1-0-0-1`, two doses. **A second, worse half:** ticking Morning+Night produced
  "Twice a day", which `freqLabelToSlot` mapped to `1-0-1-0` = *Morning and
  Evening*, so the printed schedule silently differed from the one ticked.
  Fixed by making the slot string canonical: `slotStringToKeys` /
  `keysToSlotString` / `freqLabelToKeys` / `keysToFreqLabel` in
  `lib/db/reference.ts`, with the editor deriving from the same map the save
  path uses; `"Twice a day"` corrected to `1-0-0-1` and `SOS`/`0-0-0-0` added so
  all 16 combinations round-trip. Verified in the browser: M+N shows two slots,
  adding Noon reads "Morning, Afternoon & Night", removing it returns exactly.
- **2026-07-28 · PHASE D SHIPPED + three corrections from Anmol's review.**
  1. **The "electricity bill" scroll — a real regression, now fixed.** The rule
     that capped the centre column's height and made it scroll internally
     targeted `.syn`; Phase C renamed the panel to `.cx-syn`, so the cap
     silently stopped applying, the column grew to fit every section, and the
     page scrolled for screens while the two short columns sat as dead white
     space beside it. **All three columns are now sticky, viewport-height panes
     that scroll inside themselves** — the page does not scroll at all, so a
     long ranked list can never strand the columns next to it again.
     Reinforced by **per-section caps** (`SECTION_CAP`: 4 medicines, 4 tests,
     3 others) with a "N more ranked" expander; anything already accepted is
     always shown regardless of the cap.
  2. **Medicines are named by the product, not the molecule.** The card
     headline is now the default brand — "Myocom 150 Tablet" — with
     *"Tolperisone · for Low back pain"* as the subtitle, and alternatives
     after a quiet "or". Same hierarchy already held on the Plan line. The
     molecule is still what the engine ranked and still what is stored; it is
     just no longer what the doctor reads first.
  3. **On-examination hierarchy.** Recorded findings are now filled teal chips
     (a fact the doctor established); the "likely on exam" suggestions sit in
     their own inset **tray**, so proposals can never be mistaken for the
     record.
  - Also fixed while verifying: the sticky section header was letting card text
    bleed through it. The list body is now opaque "paper" (white) with solid
    headers; the glass stays on the panel chrome above.
  - **Phase D proper:** dose, frequency, duration and SOS are edited **on the
    plan line** — DOSE field, DAYS stepper, M/A/E/N + SOS toggles, all deriving
    from the shared slot map so they cannot drift from what is saved.
    `MedicineInspector` survives one click away ("Notes & details…") for notes
    and clinical context. Brand swap after accepting is on the Synapse card
    ("change brand"), where the BrandSheet is already wired. Verified live:
    stepper took 5 → 8 days with the pill updating as it went.
- **2026-07-28 · PHASE E SHIPPED — the redesign is complete.**
  - **Keyboard model rewritten** (`useConsultKeyboard.ts`). Three Tab stops
    matching the three columns (chart → suggestions → plan); `/` or `Ctrl+K`
    focuses the chart; **just typing anywhere jumps to the chart and the
    characters land there**; `?` opens a shortcut sheet; `Esc` blurs; `Ctrl+N`
    and `Ctrl+Enter` unchanged. The hook deliberately does NOT own list
    navigation — arrows, Enter-to-add and the severity digits belong to the
    component that owns the list. **Dead shortcuts removed:** Alt+M (fired an
    event nothing had listened for since `MedicineSuggestions` was deleted) and
    the `findings`/`tests` Tab stops that pointed at deleted panels.
  - **`ShortcutsSheet.tsx`** — the map, in the product. Cortex has had
    shortcuts since v1 with no way to discover them; a workspace that claims to
    be keyboard-first has to answer "what can I press" from inside itself.
    Reachable by `?` or the hint under the Review button.
  - **Dead code purged**, each verified unreferenced first:
    `components/Tag.tsx`, `utils/filter.ts`, **`styles/components-medicines.css`**
    (507 lines; 29 of its 33 classes dead, and `.spin` turned out to be
    unused — `ActiveConsultGuard` uses Tailwind's `animate-spin`).
    **`styles/components-panels.css` trimmed 582 → 60 lines**: only the
    `.mi-overlay`/`.pm-overlay` backdrop fix and the `.finding-chip*` rules
    (still used by `features/patients/PatientRecord.tsx`) survived — that one
    live consumer is why the file was trimmed rather than deleted.
    `base.css` lost its four dead per-panel focus rules.
  - **Atlas updated** — `aren-cortex-atlas.md` §7 carries a superseded banner,
    §12 records the four-vocabularies-to-two decision, and §13
    ("where do I change X") is rewritten for the new components.
  - Verified live: typing with no field focused jumped to the chart and wrote
    there; `?` opened and `Esc` closed the sheet; `Tab` moved chart →
    suggestions, where "amoxi" found Amoxicillin and Cefixime *sold as* Amoxim.

## Status: all five phases shipped

What remains is **out of scope by design**, not unfinished: the reception-queue
disconnect (atlas §10.3), the modals and print pipeline, the sidebar and
feature-page stubs, and the ~1,099 clinically-unreviewed rules (handoff §8.10 —
still the largest risk in the product and nothing to do with the UI).
