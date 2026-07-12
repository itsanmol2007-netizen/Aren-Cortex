# AREN — SESSION 36 HANDOFF (The Bhor modal surface + catalog symptom picker)

Date: 2026-07-12
Read alongside `docs/aren-architecture-handoff.md` (frozen architecture),
`docs/aren-frontdesk-brief.md` (frozen layout/inventory),
`docs/aren-frontdesk-design-direction.md` (v2 "Bhor"), and
`docs/aren-session35-handoff.md`. This session **amends the direction's §10.2
(modals)** — everything else in the direction still stands. Trust this doc
over session 35 for anything modal-related.

====================================================
## 1. WHAT THIS SESSION WAS
====================================================

Anmol's brief: modals were functionally correct but "a white form inside a
popup." Using the Cortex patient-intake screenshot
(`docs/Patient intake model ss.png`) as the craftsmanship reference — inherit
the craft, not the layout — every Front Desk modal now shares one premium
surface, and the symptom field became a catalog picker instead of a
type-first search box. Workflow, DB contracts, and status semantics:
untouched.

====================================================
## 2. THE BHOR MODAL SURFACE (new `ModalShell.tsx`)
====================================================

**All Front Desk modals — current and future (confirmations, doctor pickers,
whatever comes) — must render inside `ModalShell`.** It owns:

- Panel: 580px max, **radius 18**, deep two-layer shadow (ink + faint violet).
- **Dawn thread at full strength with glow** on the top edge (2.5px). This
  amends §3.2's "65%, no glow" for modals — the modal is a formal surface and
  now wears the thread like the ink band does.
- **Header zone**: faint dawn radials (violet top-right, apricot top-left)
  over a `#fcfbff→#fff` wash; the **corner-arcs watermark** (the DawnArcs
  motif folded into the top-right corner: three pastel quarter-arcs + apricot
  sun dot, pure SVG, pointer-events-none); a **40px brand-gradient icon tile**
  (`155deg #7c5cf0→#2f6bed` + violet glow, same object as the header mark and
  launcher `+`); a **violet eyebrow micro-label** (10.5px/800/+0.09em,
  `#8b5cf6` — brighter than structural `#837bb2` because it's the brand
  moment); Manrope 17px title beneath; **ghost X close button** top-right
  (replaces the old "Back" pill — footer Cancel / Escape / backdrop click
  still work; `back` key is now the X's aria-label).
- Body `px-6 py-5` (paper — decoration stays in the frame, §2.3 doctrine).
- Optional **footer band**: `#fafbfc` with top hairline, right-aligned actions.
- Escape-to-close + backdrop click + `role="dialog"` live here, not in
  the modals.

Shared section device (both modals): violet micro-label + **fading violet
hairline** (`linear-gradient(90deg,#e9e6f5,transparent)`) stretching to the
right — the grouping line for PATIENT DETAILS / TODAY'S VISIT / SYMPTOMS /
ASSIGNED DOCTOR / CHANGE STATUS / RECENT VISITS.

====================================================
## 3. FIELD SYSTEM UPGRADE (`FrontDeskStyles.tsx`)
====================================================

`fd-field` is now the **soft-filled premium treatment** (screenshot-
inherited): 46px, radius 11, rest = `#f7f8fb` fill + `#e9ebf2` border; focus
= lifts to white, **violet border `#7c5cf0`** + `rgba(99,102,241,0.22)` ring;
error = red border + `#fffafa` fill. The launcher search (`.fd-bare` in a div
wrapper) is unaffected.

New unlayered label ornament classes (the Tailwind v4 layer trap from s35 §3
applies to spans inside labels too — `label span` element rules beat
utilities):
- `.fd-ico` — 13px lucide icon before the label text, `#8b5cf6` @ 85%
  (UserRound / Cake / Users / Phone / Thermometer / Stethoscope).
- `.fd-tag` — the small uppercase **OPTIONAL** tag (Age, Gender).

Rule from s35 stands: never style `input`/`select`/`textarea`/`label` with
utilities in Front Desk; use/extend fd-* classes.

====================================================
## 4. PATIENT INTAKE (`CreateVisitModal.tsx`, redesigned)
====================================================

- Eyebrow **PATIENT INTAKE** (`intakeEyebrow`), Sparkles icon tile, title
  unchanged (`registerVisit` / `newVisit`).
- New-patient form is grouped: **PATIENT DETAILS** (Full Name full-width →
  Age + Gender half-row → Phone full-width) then **TODAY'S VISIT** (Symptoms,
  Doctor). Existing-patient path shows the upgraded identity card (blue
  gradient tint — patient identity stays in the data vocabulary) then
  TODAY'S VISIT.
- Labels: 12.5px bold `#3b4453` + fd-ico icon; required = 4px violet dot
  (unchanged system, NOT the screenshot's red asterisk); optional = fd-tag.
- Footer: Cancel ghost + **Save Visit in the brand gradient with an
  ArrowRight** — registration is a *front door* (§7 doctrine), not a status
  change, so it wears the brand like the launcher `+`. Status-changing
  buttons everywhere else stay strictly semantic.

====================================================
## 5. THE SYMPTOM PICKER IS NOW A CATALOG (functional change)
====================================================

Symptoms remain structured entities (s35 §2e — never regress to free text).
The interaction changed from "type, then see matches" to **"focus, see the
whole clinical catalog"**:

- **Focusing (or clicking) the field immediately opens the catalog panel** —
  all unselected symptoms as `+ name` chips, alphabetical, count badge on the
  SYMPTOM CATALOG micro-label, max-height scroll, rendered **in-flow**
  (still no overlay → nothing clips).
- **Typing filters with typo tolerance**: prefix beats substring beats
  fuzzy. Fuzzy = Levenshtein ≤1 (queries ≤5 chars) / ≤2 (longer) against
  each word of the name *and* its query-length prefix — **"feber" surfaces
  fever** (verified live). Queries under 3 chars don't fuzz.
- **The top match wears the violet focus ring** (structural affordance, not
  data color) and **Enter picks it**. Picking keeps the panel open for fast
  multi-select, clears the query, refocuses.
- Selected symptoms are chips **inside the field well** (white, neutral —
  chosen symptoms are data, they take no brand color), each with an X;
  Backspace on empty query removes the last one.
- **Escape closes the catalog first, the modal second** — implemented as a
  document-level *capture* keydown listener while open, which beats
  ModalShell's bubble listener. Outside-click also closes it.
- Persistence unchanged: `symptomIds: number[]` → `saveVisitSymptoms`.

====================================================
## 6. VISIT DETAILS (`VisitDetailModal.tsx`)
====================================================

Same shell: eyebrow **VISIT DETAILS** (`detEyebrow`), ClipboardList tile,
token `#005`-style as title. Sections gained 13px icons at 70% + the fading
hairline. Symptom chips match the picker's neutral chip object. Recent-visit
rows sit on `#fafbfc` @ radius 10 (status dot kept). Status buttons: radius
10, semantics byte-for-byte unchanged. Doctor select still native (carried
item).

====================================================
## 7. i18n
====================================================

New keys (en + hinglish; `hi` auto-stubs): `intakeEyebrow`, `detEyebrow`,
`secPatient` ("Patient Details" / "Patient ki Details"), `secVisit`
("Today's Visit" / "Aaj ka Visit"), `optional`, `symCatalog` ("Symptom
Catalog" / "Symptom List"). `phSymp` unchanged. `back` now labels the X.

====================================================
## 8. VERIFICATION DONE THIS SESSION
====================================================

- `npx tsc -b` — zero new errors (same pre-existing legacy errors only).
- Live headless-Chrome CDP run (Node driver in session scratchpad; nothing
  committed) against the real dev server + real Supabase data:
  launcher `+` → intake modal renders the full new surface → **plain focus
  on the symptom field opened the 51-chip catalog** (needed
  `Emulation.setFocusEmulationEnabled` — headless quirk, real browsers fire
  focus normally) → typed "feber" → **fever ranked top with the violet
  ring** → Enter → chip in the well, panel stayed open → **first Escape
  closed only the catalog, second closed the modal** → clicked queue row
  \#005 → Visit Details rendered on the shell with semantic status buttons.
- **No DB writes were made** — nothing was saved, so no cleanup was needed.
- NOT verified live: error states (red field/`errSymptom`), Hinglish pass of
  the new keys, existing-patient identity card variant. All low-risk; worth
  an eyeball next session.

====================================================
## 9. OPEN ITEMS (carried + new)
====================================================

1. Carried: `npm run build` blocked by legacy tsc errors; no auth; Cortex
   "Next Patient" button missing; `clinic_mode` unread; Devanagari stubbed;
   shared Toaster exception; consider re-layering legacy CSS if a restyle
   ever happens.
2. Carried from s34: doctor `<select>` is still native in both modals — now
   the single most visible non-premium element inside otherwise polished
   modals; a rich picker needs sign-off.
3. New: the design-direction doc still describes §10.2's pre-s36 modal
   treatment; if the direction is ever re-frozen, fold §2–§5 of this doc in.
4. New: future modals must use `ModalShell` — do not hand-roll modal chrome
   again.
