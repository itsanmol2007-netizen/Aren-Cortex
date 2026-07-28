# AREN Cortex — Workspace Visual Design Spec

*Written 2026-07-28. This is the **complete build blueprint** for the doctor-workspace
redesign. It exists so that implementation sessions (including smaller/cheaper models)
can build directly from it without re-deriving any decision. Every layout, component,
state, class name, interaction and data source is specified here.*

**Read order for an implementing session:**
1. This file, fully.
2. `docs/aren-cortex-atlas.md` — the technical map (where every file lives).
3. `referance (synapsev2)/Synapse v2 handoff .md` §14 + §16 — the safety doctrine.

**Companion file:** `docs/aren-cortex-redesign-plan.md` — step tracker. Update its
log after every phase.

---

## 0. Philosophy — carved into every decision below

> **Doctors treat patients. Software handles the rest.**

- **Minimum clicks.** Prescribing the default brand of the top-ranked medicine is
  ONE click (or one Enter). Everything common is one interaction; everything rare
  is at most a search away.
- **Keyboard-first.** The entire consult must be completable without touching the
  mouse. Every list is arrow-navigable, every action has a key.
- **Never lose context.** Nothing the doctor needs disappears behind a tab, a
  modal, or a collapsed drawer. **TABS ARE BANNED in the consult workspace.**
  Medicines, tests, impression, advice — each gets its own permanent, always-
  visible space. If the screen feels crowded, the answer is hierarchy and
  density, never a tab.
- **Specialty is a data lens** (Universal Cortex). Nothing hardcodes OPD. Physio /
  cardio / dentist arrive as different chip domains, measure groups and section
  content — zero layout changes.

### The seven Synapse rules (handoff §16 — violating any of these is a bug)

1. **No guard ever hides a suggestion.** `warn_hard` = red + acknowledge-to-prescribe.
2. **Search reaches everything**, but out-of-list picks render their guard verdict at full strength.
3. `searched_accepted` / `override_accepted` are **never** logged as plain `accepted`.
4. **Rank order is the engine's** — never re-sort intents in a component.
5. **Findings are intents** — but see §1b below for what the data actually supports today.
6. **Brands are a lookup after ranking** — never rank a brand.
7. **A molecule with no brand renders as the molecule**, not an error.

Plus the house rules: engine files (`src/lib/synapse/*`) stay pure (no React, no
Supabase); all DB calls in `src/lib/db/*`; symptoms/findings/history are
structured `observables` — never free text into a visit record; zero new `tsc`
errors; targeted edits only.

---

## 1. Verified data facts (queried live, 2026-07-28 — do NOT re-derive)

### 1a. The context catalogue: 22 history-kind observables exist

`select slug, label from observables where kind='history' and is_active`:

| slug | label | context-bar treatment |
|---|---|---|
| `pregnancy` | Pregnant | **pinned** (hide when `patient.gender === "male"`) |
| `known_diabetes` | Known diabetic | **pinned** |
| `known_hypertension` | Known hypertensive | **pinned** |
| `drug_allergy` | Known drug allergy | **pinned** |
| `smoker` | Smoker | **pinned** |
| `alcohol_dependence` | Alcohol dependence | **pinned** |
| `renal_impairment` | Known kidney impairment | **pinned** |
| `hepatic_impairment` | Known liver impairment | **pinned** |
| `immunocompromised` | Immunocompromised | **pinned** |
| `elderly` | Elderly (65+) | **auto badge** from age — never manual when age known |
| `pediatric` | Child (under 12) | **auto badge** from age — never manual when age known |
| `tb_contact`, `head_injury`, `food_allergy`, `trauma_recent`, `recent_surgery`, `travel_history`, `allergy_recurrent`, `recurrent_resp_infection`, `recurrent_infections`, `substance_use`, `infertility` | … | behind **“+ More”** popover |

Age derivation (handoff §16 translator 1): `elderly: age >= 65`, `pediatric: age < 12`.
When `patient.age` is known, the auto badge renders and the manual chip is
removed from the pickable list — a 34-year-old must not be markable as elderly.

### 1b. The Impression loop — what the data supports TODAY

**Verified: 0 of the 68 `finding`-type intents have a label matching any
observable.** Finding intents are *clinical interpretations* — “Acute coronary
syndrome”, “Mechanical low back pain” — not exam-finding chips. Therefore:

- **DO NOT build** “confirm finding → writes observation → engine re-runs”. It
  cannot work by label matching, and there is no intent→observable map in the DB.
  (Future DB backlog, out of UI scope: an `intents.observable_id` column would
  enable the true loop.)
- **DO build** the Impression flow (§5.3): a finding intent is accepted **as the
  working diagnosis** — it lands on the Plan as the Dx line, feeds
  `saveConsult.findingsText`, and is logged as a normal intent accept (fixing
  today’s gap where finding accepts are silently no-op’d in `handleAcceptIntent`).
- “Findings suggested after symptoms” is served in the **Chart column** by
  body-system relevance over `kind='finding'` observables (§4.4) — pure
  client-side, no engine change, honest.

### 1c. Brands are already in memory

`useConsultIntelligence` already fetches brands for every ranked composition:
`intelligence.brands : Map<compositionId, CompositionBrands>` where
`.brands: Medicine[]` is **already in resolveBrands order** (learned → clinic
default → most prescribed → catalogue rank → alphabetical). The medicine card
(§5.5) renders `brands.get(refId).brands.slice(0, 5)` — **no new fetch, no new
RPC.** `.combinationCount`/total fields on that object say how many combination
products also contain the molecule (check the exact field name in
`src/lib/synapse/brands.ts` before rendering).

---

## 2. The canvas

Desktop only (`min-width: 1120px`). PatientHeader (dark strip: identity, vitals,
past visits) is **out of scope — do not touch it.** Below it:

```
┌─ PatientHeader ──────────────────────────────────────────────────────────────┐
├─ CONTEXT BAR (full width, one row, ~46px) ───────────────────────────────────┤
│  CONTEXT   [⚕ Elderly]   ( Pregnant )( Known diabetic )( Smoker )…   + More  │
├──────────────────┬──────────────────────────────────┬────────────────────────┤
│ 1 · CHART        │ 2 · SYNAPSE                      │ 3 · PLAN               │
│ what you know    │ what it suggests                 │ what you're issuing    │
│                  │                                  │                        │
│ [ search… ]      │ [ search everything… ]           │ Dx  Viral URI          │
│                  │ ── reading 6 signals ▸ ──        │ ── MEDICINES ──        │
│ REPORTED (3)     │ ▓ hard-warn ledger (if any) ▓    │ Calpol 500 · paraceta… │
│ (Fever ●●○)(…)   │                                  │  1 tab · M-N · 5 days  │
│                  │ IMPRESSION                       │ ── INVESTIGATIONS ──   │
│ ON EXAM (1)      │  ◉ Viral URI    [Use as Dx]      │ CBC                ×   │
│ (Throat congest…)│  ○ also: Strep pharyngitis       │ ── ADVICE ──           │
│ likely on exam:  │ INVESTIGATIONS                   │ Plenty of fluids   ×   │
│ (+ Crepitations) │  CBC — for Fever            [+]  │ ── FOLLOW-UP ──        │
│ (+ Wheeze) …     │ REFERRALS                        │ (None)(3d)(5d)(7d)     │
│                  │  — none ranked —                 │                        │
│ HISTORY → in     │ MEDICINES                        │                        │
│ context bar ↑    │ ┌ Paracetamol — for Fever ┐      │                        │
│                  │ │ [Calpol ✓][Dolo][Crocin]│      │                        │
│ Browse all 374 ▸ │ │ [2 more ▾]              │      │                        │
│                  │ └─────────────────────────┘      │                        │
│                  │ EXERCISES (physio — when ranked) │                        │
│                  │ ADVICE                           │                        │
│                  │  Steam inhalation           [+]  │ ┌────────────────────┐ │
│                  │ ── often goes with ──            │ │ Review Rx   Ctrl ↵ │ │
│                  │ ── YOUR FREQUENT (idle only) ──  │ └────────────────────┘ │
└──────────────────┴──────────────────────────────────┴────────────────────────┘
```

**Grid** (already live in `src/styles/workspace.css` after Step 1):

```css
.workflow.cx-grid {
  grid-template-columns: minmax(270px,0.95fr) minmax(370px,1.35fr) minmax(285px,1fr);
}
```
Context bar sits INSIDE `.workflow`, spanning all three columns
(`grid-column: 1 / -1`), first row. Centre + right columns are sticky
(`top: 12px; max-height: calc(100vh - 26px)`) and scroll internally; chart
column flows naturally.

Breakpoints: ≤1440px tighten minmaxes (already in workspace.css); ≤1120px
single column stack, sticky released.

---

## 3. Design language — “Aren glass”

Authored **only** in `src/styles/workspace.css` under the `cx-` prefix. Plain
global CSS, class-based selectors only (never bare `input`/`h2` — base.css owns
those unlayered and will fight you). No Tailwind here. No inline styles except
measured coordinates (portals).

### Tokens (exist in workspace.css `:root` — reuse, don’t invent)

```
--cx-glass: rgba(255,255,255,0.66)     panel fill (over app gradient)
--cx-glass-strong: rgba(255,255,255,0.85)
--cx-hairline: rgba(121,143,177,0.18)  ALL internal dividers
--cx-radius: 16px                      panels · 10px rows · 999px chips
--cx-shadow: 0 1px 2px rgba(20,35,66,.05), 0 12px 32px rgba(20,35,66,.07)
--cx-amber/#b45309 + --cx-amber-bg     soft guard
--cx-red/#b42318  + --cx-red-bg        hard guard
--cx-violet #7c3aed                    plan accents
plus base tokens: --blue --text --muted --faint --line --line-soft --green
```

Glass = `background: var(--cx-glass); backdrop-filter: blur(22px) saturate(160%)`
(+ `-webkit-` twin) — the `.cx-panel` class already does this; every new panel
uses it.

### Type ramp (match exactly — this is the Apple-ness)

| role | spec |
|---|---|
| panel title | 17px / 680 / letter-spacing −0.015em / no uppercase |
| row / card name | 13.5–14px / 620 / −0.01em |
| “why” line (signals) | 12px / 500 / `--muted`, prefix word in `--faint` |
| micro section label | 10.5px / 700 / +0.07em / UPPERCASE / `--faint` |
| meta pill | 10.5px / 600 in 999px pill, `--line-soft` border |
| body microcopy | 11.5–12px / 450–500 / `--faint` |

### Colour discipline

Ink and grey everywhere. Colour ONLY for meaning: **blue** = the one action /
selection; **amber** = soft guard; **red** = hard guard; **green** = added/done;
**violet** = plan focus glow. Never decorative colour, never gradients except
the single blue CTA. Focus-glow doctrine per column: chart pink, synapse blue,
plan violet (`.cx-*:focus-within` — chart/plan exist; keep).

### Motion

120–160ms ease transitions on background/border/opacity only. `:active`
buttons `transform: translateY(1px)` or `scale(0.94)`. Everything wrapped in
the existing `@media (prefers-reduced-motion: reduce)` reset. Nothing animates
position; lists never reflow-animate (a re-ranked list snaps — the doctor is
reading, not watching).

---

## 4. Component spec — CONTEXT BAR + CHART column

### 4.1 Context bar (`src/components/ContextBar.tsx` — new)

One row, full grid width, glass panel (`.cx-panel .cx-context`, radius 12,
padding 8px 14px, flex-wrap).

```
CONTEXT   [⚕ Elderly 68y]   (Pregnant)(Known diabetic)(Smoker)(Drug allergy)… (+ More)
```

- Leading micro-label “Context” (10.5 uppercase faint). 
- **Auto badges**: from `patient.age` — `Elderly · 68y` or `Child · 7y`.
  Style: filled `--blue-soft` pill, blue text, small shield/star icon, NOT
  clickable, `title="Derived from age — Synapse already knows"`.
- **Pinned toggle chips** (§1a list, in that order): 999px pill, 12px/600,
  default = white bg + `--line` border + `--muted` text; **on** = `--blue-soft`
  bg + blue border/text + leading ✓. Hide `pregnancy` when
  `patient.gender === "male"`. One click toggles.
- **“+ More”** ghost chip → `createPortal` popover (max-h 320px, scroll, search
  input at top) listing the remaining history observables. Same toggle
  behaviour. Esc closes. (Reuse the portal-dropdown pattern from
  `ChipSearchPanel` — measured `DOMRect`, stacking by DOM position.)
- **Wiring — zero new state.** A context chip toggles its observable **label**
  in/out of the existing `selectedSymptoms` string[] in `App.tsx` (history
  chips already flow through it into `chartObservableIds` → engine, and into
  the v1 compatibility write). Selected-chip rails in the Chart column must
  **filter out** labels whose observable `kind === 'history'` so context chips
  render in exactly one place.
- When a context chip changes guard outcomes (Pregnant → NSAIDs go red in the
  medicines section) nothing extra is needed — the engine re-runs synchronously.
- Empty/no-patient state: bar renders with chips disabled at 0.5 opacity.

### 4.2 Chart panel (`src/components/ChartPanel.tsx` — new; replaces BOTH `ChipSearchPanel` and `FindingsPanel`)

One glass panel, title **“Chart”**, subtitle “what you observed”. Keeps the
exact state interface App already owns — `selectedSymptoms: string[]`,
`selectedFindings: string[]`, `selectedSymptomsWithIntensity` — so App.tsx
wiring barely changes and the v1 compatibility write keeps working untouched.

Internal layout, top to bottom:

1. **One search input** (`.cx-chart-search`), placeholder
   *“Add anything — fever, बुखार, crepitations…”*, autofocused on consult start.
2. **REPORTED zone** — selected symptom chips.
3. **ON EXAMINATION zone** — selected finding chips + “likely on exam” ghosts.
4. **Browse-all door** — “Browse all 374 ▸” text button.

### 4.3 Search behaviour (the fuzzy matching)

Pool = ALL active observables (every kind — the zone routes itself; the doctor
never chooses a target). Ranking tiers, exactly translator 1 plus a typo tier:

```
0  label starts with query
1  label contains query
2  search_text contains query        ← Hindi/colloquial aliases live here
3  slug contains query
4  subsequence match on label (every query char in order) — typo tolerance
```

Sort by tier, then label. Cap 12 results. Render as a dropdown portal under the
input: each result row = chip label + right-aligned zone tag (“Reported” /
“On exam” / “Context”), grouped headers omitted (the zone tag is enough at 12
rows). **Keyboard: ↑↓ move, Enter adds** (routes by `kind`: symptom→
selectedSymptoms, finding→selectedFindings, history→selectedSymptoms/context
bar), input clears, stays focused — chips chain with zero mouse. Already-
selected results show ✓ and Enter removes them (toggle).

### 4.4 “Likely on exam” — findings surfaced from symptoms (the §1b answer)

Below the selected finding chips, when ≥1 symptom is on the chart:

- Compute `activeSystems = Set(system of every selected symptom observable)`.
- Ghost chips = `kind='finding'` observables with `system ∈ activeSystems`,
  minus already-selected, ordered by `SYSTEM_LABELS_IN_ORDER`
  (`src/lib/synapse/systems.ts`) then label. Cap 8, “show more” reveals the rest
  of the set inline.
- Ghost chip style: dashed `--line` border, `--muted` text, leading +. Click /
  Enter = becomes a real selected finding chip (solid).
- Micro-label above them: “LIKELY ON EXAM — from the systems on this chart”.
- Chart empty → zone shows nothing but the micro-hint “Findings appear after
  the first symptom, or search any time.”

### 4.5 Chips, intensity, keyboard

- Selected chip: 999px pill, white bg, `--line` border, 12.5px/600 ink; × on
  hover (reuse `.cx-x` pattern). Symptom chips additionally render the
  intensity dot-triplet (● mild ●● moderate ●●● severe, `--faint`→`--blue`).
- **Intensity**: click the dots to cycle, or with the chip focused press
  `1 / 2 / 3`. Default moderate. (State: `selectedSymptomsWithIntensity` — keep
  today’s shape.)
- Chips are focusable (`tabindex=0`); Delete/Backspace removes; ←→ move between
  chips in a zone.

### 4.6 Browse-all overlay

“Browse all 374 ▸” opens a **full-workspace glass sheet** (portal over the three
columns, NOT a route change): 18 body systems as columns of chips, system order
from `systems.ts`, search box at top that filters in place. Esc or × closes.
Selecting doesn’t close (multi-pick), matching today’s behaviour. This replaces
both panels’ separate browse doors.

### 4.7 Deletions

After ChartPanel lands and App compiles: delete `ChipSearchPanel.tsx`,
`FindingsPanel.tsx`; their CSS lives in `components-base.css` /
`components-panels.css` — leave those files (other classes live there), but
note dead selectors in the plan-doc log for the cleanup phase.

---

## 5. Component spec — SYNAPSE column (the engine’s voice — NO TABS)

Rewrite `src/features/synapse/SuggestionsPanel.tsx` as one continuous scrolling
column of **permanent sections in clinical reading order** (TYPE_ORDER — what
could this be → what confirms it → who else should see it → management):

```
search · signals · hard-warn ledger
IMPRESSION → INVESTIGATIONS → REFERRALS → MEDICINES → EXERCISES → ADVICE
often-goes-with · your-frequent
```

Panel: `.cx-panel`, title “Synapse”, sticky, internal scroll (`.cx-syn-scroll`).
Section headers are sticky-within-scroll (`position: sticky; top: 0`), micro
uppercase style, with count (“MEDICINES · 4”). **Human labels only** — never the
raw type: finding→Impression, test→Investigations, referral→Referrals,
medicine→Medicines, exercise→Exercises, advice→Advice. Verbs: Consider / Order /
Refer / Prescribe / Prescribe / Advise.

A section with no ranked intents renders **nothing** (no empty header noise) —
EXCEPT when a section previously had content this consult (count went to zero
because everything was accepted): then show the header + “all taken ✓” line.
Chart empty → whole column shows the idle state (§5.8).

### 5.1 Search (top, always)

Existing `searchIntents()` flow, unchanged mechanics: 2+ chars, 220ms debounce,
match by molecule / brand / symptom-it-treats, result rows say *why* they
matched (“treats Fever”, “sold as Dolo 650”). Results **overlay the sections as
a single list** while active (this is a search overlay, not a tab). Out-of-list
picks compute + render their guard verdict at full strength (rule 2) and log
`viaSearch: true` (rule 3). Esc clears back to sections.

### 5.2 Signals readout + hard-warn ledger

- “Reading 6 signals ▸” quiet toggle row → wrapping pill list (existing
  behaviour, restyled `.cx-signal`).
- Hard-warn ledger: when ≥1 `warn_hard` intent is unacknowledged — red-tinted
  card pinned under search, NON-collapsible, listing each hard-warned label +
  one-line reason + read/unread state. This is §14’s summary panel; it never
  hides anything, it indexes what needs reading below.

### 5.3 IMPRESSION section (finding intents)

Top 3 finding intents (`byType.finding`), rendered as a quiet reading, not rows:

```
IMPRESSION
◉ Viral upper respiratory infection        [Use as Dx]
   for Fever · Sore throat
○ also considering  Strep pharyngitis · Allergic rhinitis
```

- Primary = rank 1: name at 14px/620 + why-line + **[Use as Dx]** ghost button.
- Alternatives = ranks 2–3 inline, each clickable → swaps into primary position
  visually (does NOT re-rank data — pure presentation) so its [Use as Dx] is
  reachable. (Rule 4 note: the engine’s order is never changed in state; this
  is a focus affordance only.)
- **[Use as Dx]** → `handleAcceptIntent({type:'finding', …})`. App changes
  (small, in `App.tsx`): new state `diagnoses: string[]`; the `finding` case
  appends the label (dedup) instead of today’s no-op — so the accept is finally
  **logged** to the decision model; Plan column shows a Dx line (§6); on save,
  `findingsText` becomes `[...diagnoses, ...selectedFindings].join(", ")` — no
  DB change. Removing the Dx line releases the intent (`releaseIntent`).
- NO chart write-back (§1b — verified impossible today; don’t attempt).

### 5.4 INVESTIGATIONS + REFERRALS + ADVICE + EXERCISES sections

Simple intent rows (`.cx-int-row`, hairline-separated like Plan lines):

```
CBC                                   [+]
  for Fever · Rigors
```

- Row name 13.5/620, why-line 12/500 (top 2 contributors via `signalLabels`).
- Right side: movement chip (↑n, green, only when personalisation moved it),
  guard flag if any, add button `[+]` (28px, blue-soft→blue on hover).
- Click row or `[+]` or Enter-when-focused = accept → lands on Plan. Added →
  row stays, right side becomes green ✓ (context preserved, rule: nothing
  disappears). Soft `warn` = amber flag + reason line under the row.
  `warn_hard` = red treatment identical to medicines (§5.6).
- Exercises section only exists when `byType.exercise.length > 0` (physio lens
  arrives free).

### 5.5 MEDICINES section — composition CARDS with brand chips (the big change)

**The molecule row dies. Each ranked composition renders as a card whose brands
are the primary interface** — a doctor prescribes Calpol, not “paracetamol +
open dropdown”.

```
┌────────────────────────────────────────────────────────┐
│ Paracetamol                              ↑2  ⚠ Caution │
│ for Fever · Body ache                                  │
│                                                        │
│ (Calpol 500 ✓)(Dolo 650)(Crocin Adv)(P-250 Syr)(Pacimol)│
│ 3 more ▾            8,246 combination products contain │
│                     this molecule — search to use one  │
└────────────────────────────────────────────────────────┘
```

- Card: `.cx-med-card` — 12px radius, hairline border, white-glass, 12px pad;
  cards separated by 8px (denser than panel gaps — they’re siblings).
- Header row: molecule (capitalize, 14/620) + movement + guard flags.
- Why-line.
- **Brand chip row**: `intelligence.brands.get(intent.refId).brands.slice(0,5)`
  — already in preference order (§1c). Chip = 999px pill, 12px/600; **chip[0]
  is visually pre-selected** (blue border) = the default. Clinic-pinned brand
  shows tiny pin glyph; doctor’s learned brand shows tiny ★ (`title` explains).
  - **Click any chip = prescribe that brand NOW** (one click). Internally:
    `onAccept({ …, medicine: thatBrand })`; a non-default chip click also
    records the deliberate brand choice (existing `chosenBrands` map — never
    record the default as chosen, §12 of the handoff).
  - **Enter on a focused card = chip[0].** `←→` move chip focus, Enter takes.
  - After accept: card compresses to one line — “✓ Calpol 500 on plan · change”
    (“change” reopens the chips inline).
- **“n more ▾”** → the existing `BrandSheet` portal (full fetched list, filter
  input added at top — client-side filter; keep the clinic-pin control exactly
  as is).
- Brands still loading: chip row = 3 shimmer pills (no layout jump). Brand load
  failed: molecule name + “brands unavailable — ranking unaffected” note
  (exists today, keep copy).
- **No single-molecule brand** (rule 7): no chips; line reads “No standalone
  product — N combination products contain this molecule” + [search products]
  button that pre-fills the Synapse search with the molecule name.
- **Companions** (“OFTEN GOES WITH — what you added”): after the medicines
  section, same card treatment but smaller (companion suggestions from
  `intelligence.companions`, guard-checked already by the hook).

### 5.6 Guard rendering (identical across ALL sections — rule 1)

- `warn` (soft): amber `⚠ Caution` flag on the row/card + one amber reason line
  beneath. Nothing gated.
- `warn_hard`: card/row gets `--cx-red-bg` tint + red hairline; flag
  `🛡 Contraindicated — read before prescribing`; reason block always expanded;
  brand chips / add buttons **disabled** until the doctor clicks
  **“I’ve read this — allow prescribing”** (red ghost button). Acknowledge is
  per-consultation, reversible (clicking again un-acknowledges and, if it was
  accepted, releases the accept). Accepting after acknowledge logs
  `overridden: true` (existing plumbing — keep).
- The ledger (§5.2) mirrors unread hard warns. **Blocking-the-save**: on
  Review/save, if any *accepted* intent is hard-warned and unacknowledged,
  block with a toast naming it (App-level check in `handleConfirmAndSave`).

### 5.7 Scores

Never print a score. Rank order + movement chip carry the information; raw
score stays in `title` for calibration (existing decision — keep).

### 5.8 Idle state (chart empty) — “YOUR FREQUENT”

Replaces today’s generic empty text. Section header:
**“YOUR FREQUENT — your own history · not a suggestion”** (this exact framing —
handoff §13.5 requires the disclaimer). List = `synapse.data.frequent` top 8:
brand-or-molecule name + prescribe count, one-click add (accept path =
searched? NO — a frequent pick of an unranked intent when the chart is empty is
`viaSearch: true` in the accept payload — it did not come from a ranking).
Below it the quiet hint: “Suggestions appear as the chart fills.”

### 5.9 Deletions

`SynapseStyles.tsx` dies — all `syn-*` rules move into `workspace.css` as
`cx-*` equivalents during the rewrite (fourth styling vocabulary eliminated).
`BrandSheet.tsx` survives restyled (`cx-` classes, filter input added).

---

## 6. Component spec — PLAN column (built in Step 1 — refinements only)

`src/components/PlanPanel.tsx` exists (glass panel: Medicines / Investigations /
Advice & referrals / Follow-up chips / Review CTA, remove-releases-intent
wiring done). Add, in this order:

1. **Dx line at top** (from §5.3): `Dx — Viral URI ×` above the Medicines
   section, violet-tinted micro-label, removable (releases the finding intent).
2. **Inline dose editing** — clicking a medicine line currently opens
   `MedicineInspector`; keep that as the “full editor”, but the three meta
   pills (dosage / frequency / duration) become click-to-edit **popover
   steppers** on the line itself: dosage free-text short input, frequency =
   the 6 slot toggles (M/A/E/N + SOS + custom label), duration = − n days +.
   All keyboard: Tab between the three, ↑↓ steps, Esc closes, changes write
   through `updateMedicine` (exists in App).
3. **SOS toggle** on the line (small pill button, amber when on — sets
   `is_sos`).
4. **Brand swap from the line**: the line’s sub-text (molecule) gets a trailing
   “⌄” — opens the same BrandSheet anchored to the line
   (`handleChangeBrand(intent_id, …)` exists; only works for lines carrying
   `intent_id` — repeat-Rx imports don’t, hide the ⌄ there).
5. **Accepting a medicine must NOT auto-open MedicineInspector** — change in
   `App.tsx` `handleAcceptIntent` medicine case: drop the
   `setSelectedMedicineId(String(brand.id))` line. Defaults land silently
   (1 tab · Morning and Night · 5 days · After food); the doctor edits only
   exceptions. This is the single biggest click-saver in the redesign.

---

## 7. Keyboard model (final target — wire in the last phase)

Rewrite `useConsultKeyboard.ts` against this table; delete the Alt+M dead
shortcut and the `testsSearchRef` stop.

| key | context | action |
|---|---|---|
| just type / `/` / `Ctrl+K` | anywhere (no modal, no input focused) | focus Chart search |
| `Tab` / `Shift+Tab` | workspace | cycle Chart search → Synapse search → Plan (first line) |
| `↑ ↓` | any list/dropdown/section | move focus |
| `Enter` | focused result/row/card | add (card = default brand) |
| `← →` | focused medicine card / chip rail | move brand-chip / chip focus |
| `1 2 3` | focused symptom chip | intensity mild/moderate/severe |
| `Delete`/`Backspace` | focused chip / plan line | remove |
| `Esc` | overlay → search → focus | close / clear / blur (in that order) |
| `Ctrl+Enter` | anywhere | Review prescription (exists) |
| `Ctrl+N` | anywhere | new patient (exists) |
| `?` | workspace | shortcut overlay (small glass sheet listing this table) |

Footer of each column shows its two most useful hints in 10.5px faint
(`kbd` styling exists in base.css) — discoverability without a manual.

---

## 8. Data wiring map (everything already exists — DO NOT create new fetches)

| need | source (verified) |
|---|---|
| catalogue | `useSynapse().data.observables` — `{id, slug, label, kind, domains, searchText, system}` |
| system order/labels | `src/lib/synapse/systems.ts` (the ONE place) |
| ranked intents by type | `useConsultIntelligence(...).byType` — keys: `medicine test exercise referral finding advice` |
| hard-warned subset | `intelligence.hardWarned` (same objects as in lists) |
| active signals + labels | `intelligence.signals`, `synapse.data.signalLabels` |
| brands per composition | `intelligence.brands: Map<compositionId, {brands: Medicine[], …}>` — already preference-ordered |
| companions | `intelligence.companions` |
| frequent quick-list | `synapse.data.frequent` |
| search everything | `searchIntents({query, limit})` — `src/lib/db/synapse.ts` |
| accept / release | `handleAcceptIntent(AcceptPayload)`, `releaseIntent(intentId)` — `App.tsx` |
| brand change / clinic pin | `handleChangeBrand`, `handlePinClinicBrand` — `App.tsx` |
| dose edit | `updateMedicine(PrescriptionMedicine)` — `App.tsx` |
| save + learning write | `handleConfirmAndSave` → `saveConsult` + `commitConsultation` (do not touch the logging semantics) |
| chart state | `selectedSymptoms/selectedFindings: string[]` + `selectedSymptomsWithIntensity` — labels; ids derived in `chartObservableIds` |

`AcceptPayload` = `{intentId, type, label, refTable, refId, medicine, viaSearch,
overridden}` — defined in SuggestionsPanel today; move it to a shared
`src/features/synapse/types.ts` when rewriting.

---

## 9. Build phases (small, stoppable, resumable — one phase per session is fine)

Every phase ends with: `npx tsc -b` clean → `npm run build` clean → plan-doc
log updated. Files marked ✋ must not be touched in any phase: `PatientHeader`,
`PatientModal`, `ActiveConsultGuard`, `ReviewModal`, `PrescriptionDocument`,
everything under `lib/synapse/` and `lib/db/` (except where §5.3 says App.tsx),
`features/frontdesk/**`.

- **Phase A — Context bar.** New `ContextBar.tsx` + `.cx-context*` styles +
  App wiring (render between topbar and grid, `grid-column: 1/-1`). Chart
  panels filter history chips out of their selected rails. ✅ when: toggling
  “Pregnant” turns NSAID suggestions red without any other click; age 70
  patient shows the Elderly badge and no manual elderly chip anywhere.
- **Phase B — Chart panel.** `ChartPanel.tsx` per §4.2–4.6, delete the two old
  pickers. ✅ when: “bukhar” finds Fever; a symptom’s system surfaces likely
  exam findings; whole chart buildable with keyboard only; v1 compat write
  still fires (network tab: `visit_symptoms` upsert).
- **Phase C — Synapse sections + medicine cards.** Rewrite SuggestionsPanel per
  §5, kill tabs + `SynapseStyles.tsx`, add `diagnoses` state + finding-accept
  in App, hard-warn save gate. ✅ when: no tab anywhere; fever chart →
  paracetamol card shows ≥3 clickable brand chips and ONE click puts Calpol on
  the Plan; dengue chart + antibiotic search shows the red verdict on the
  result; Impression “Use as Dx” lands a Dx line on the Plan and in the saved
  `findingsText`.
- **Phase D — Plan refinements.** §6 items 1–5. ✅ when: dose/freq/duration
  editable without opening MedicineInspector; accepting a medicine no longer
  opens the inspector; SOS togglable on the line.
- **Phase E — Keyboard + cleanup + atlas.** §7 table, delete dead shortcut/ref,
  purge dead CSS selectors (old picker + `syn-*` + `.smb-*`/`.fp-*` leftovers
  in `components-medicines.css` etc.), update `aren-cortex-atlas.md`
  §7/§12/§13, end-to-end browser test with the demo doctor account. ✅ when: a
  full consult (patient → context → chart → accept 2 meds 1 test → follow-up →
  review → save) completes with zero mouse touches.

---

## 10. Out of scope (do not drift into these)

PatientHeader/vitals strip redesign · modals (Patient, Guard, Review/print) ·
sidebar + feature pages · reception queue integration (atlas §10.3) · engine or
rule-base changes · intent→observable mapping (DB backlog noted in §1b) ·
negated chips UI · mobile.
