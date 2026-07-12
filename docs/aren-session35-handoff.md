# AREN — SESSION 35 HANDOFF (Design direction v2 "Bhor" + structured symptoms)

Date: 2026-07-12
Read alongside `docs/aren-architecture-handoff.md` (frozen architecture),
`docs/aren-frontdesk-brief.md` (frozen layout/inventory), and
`docs/aren-frontdesk-design-direction.md` — which this session **rewrote**
(v2, codename **"Bhor"**, superseding v1 "Suprabhat") and then executed.
Trust this doc over session 34 for anything visual and for the symptoms
workflow; session 34 remains accurate on i18n architecture, hooks, and DB
data flow.

====================================================
## 1. WHY v1 WAS REPLACED
====================================================

Anmol's verdict on the v1-executed build: functionally correct but "still
feels like a conventional hospital dashboard." Diagnosis (from studying the
Cortex screenshots + `src/styles/layout.css`): Cortex's identity comes from
being **framed in ink** — a dark indigo chrome band with a glowing
pink→purple→indigo gradient stripe — with violet labeling *structure* and
semantic color labeling *data*. v1 confined the brand to five whispers on a
white-card-on-gray-page layout, which is the recipe for "generic admin
panel." v2's story: **Cortex is the night shift of the brand; Front Desk is
its morning.** One test sentence: *ink frames, thread stitches, paper works.*
Layout, workflow, row anatomy, DB contracts: all still frozen and untouched.

====================================================
## 2. WHAT WAS BUILT (all under src/features/frontdesk/)
====================================================

### a) The ink chrome (`FrontDeskPage.tsx`)
- Header is now a **full-bleed dark band** using Cortex's exact ink gradient
  (`linear-gradient(135deg,#0d1b35,#120f28 38%,#170d27 62%,#0b1525)`) with
  dawn-warmed atmospheric radials (apricot/pink/violet vs Cortex's
  pink/violet/indigo). Not sticky. Inner content stays on the 1480px grid.
- **The dawn thread** — `linear-gradient(90deg,#f2a986,#f472b6 32%,#a855f7
  68%,#6366f1)` (Cortex's stripe + an apricot sunrise stop) — sits at the
  band's **bottom** edge with glow (Cortex wears it on top). It reappears in
  exactly three more places: queue panel top (55% opacity, no glow), both
  modal top edges (65%), Now Serving card top (full + glow). Closed list.
- Two-tone wordmark: "AREN" white / "Front Desk" dawn pink `#f0abc8` (split
  of `t("appTitle")` on first space — identical string in all languages).
- Language trigger restyled as dark ghost; menu unchanged white. User chip
  indigo-on-ink.
- Page bg `#f4f4f8` + dot grid + three faint "dawn residue" radials fading
  within ~240px of the horizon.

### b) Micro-label system (§4 of the direction)
Uppercase 10.5–11px / 700–800 / +0.07em tracking in structural violet
`#837bb2`: sidebar card titles (now icon + label: Activity / Stethoscope /
Bell), modal section labels, launcher dropdown caption. Stat-card labels use
the same format but stay neutral gray (they sit next to semantic numerals).

### c) Now Serving ink card (`SummaryCard.tsx`, rewritten)
Current Token row replaced by a small ink card (Cortex ink + one pink
radial + full-strength thread): lavender micro-caption (`currentToken`
key), 26px white Manrope token, serving patient's name in `#c7d2fe` beneath
when someone is in consultation; `—` at white/35% when asleep. Average Wait
stays a plain white-zone row below.

### d) Launcher (`PatientLauncher.tsx`)
The `+` button now wears the brand gradient
(`linear-gradient(155deg,#7c5cf0,#2f6bed)`) + violet glow — same object as
the header mark ("the product's two front doors"). Doctrine holds: any
button that changes a visit's *status* stays strictly semantic. Dawn wash /
breath / focus behavior unchanged.

### e) SYMPTOMS ARE NOW STRUCTURED (functional correction from Anmol)
**Free-text symptoms were wrong** — symptoms are entities in the `symptoms`
table (id, name) feeding Cortex/ranking/specialty logic. This was
misunderstood in multiple past sessions; do not regress it.
- New **SymptomPicker** inside `CreateVisitModal.tsx`: loads the catalog
  once per modal open (`fetchSymptoms()`), search input filters in-memory,
  suggestions render **in-flow** (no overlay → nothing clips), click or
  Enter picks (Enter = top suggestion), Backspace on empty query removes the
  last chip, selected symptoms are removable neutral chips. ≥1 symptom
  required (new `errSymptom` copy).
- `useVisitActions.createNewVisit` signature changed: `symptomsText: string`
  → **`symptomIds: number[]`**, persisted via existing `saveVisitSymptoms`
  (best-effort, non-fatal). The old `matchAndSaveSymptoms` fuzzy-matcher was
  deleted.
- i18n: `phSymp` repurposed ("Search symptoms…" / "Symptom search karo…"),
  new keys `noSymptomMatch`, `errSymptom` (en + hinglish; `hi` auto-stubs).
- `VisitDetailModal` renders `symptom_names` as neutral chips; Recent Visits
  rows gained a status dot from `tintFor(pv.status)`.

### f) Modals
Both gained the thread top edge + violet section micro-labels. Required
fields (name/phone/symptoms) show a 4px violet dot after the label —
structural, distinct from red error treatment (unchanged). Gender select is
now full-width (fills the old half-row hole). Everything else structural
unchanged.

### g) Empty states
Dawn-arc system untouched; morning arcs gained a static pink radial halo,
DayDone a green one. No new motion.

====================================================
## 3. THE TAILWIND v4 LAYERING TRAP (critical for future sessions)
====================================================

**Tailwind here is v4** (`@import "tailwindcss"` in `src/styles.css`):
utilities live in CSS cascade **layers**. Cortex's legacy CSS
(`src/styles/base.css` etc., imported unlayered in `main.tsx`) styles raw
`input`, `select`, `textarea`, `label` **elements** — and unlayered CSS
beats layered CSS regardless of specificity. Consequence: Tailwind
utilities like `h-11`, `bg-transparent`, `border-[1.5px]`, `flex` on those
elements in Front Desk were **silently losing** (fields were actually 31px
tall with Cortex's blue focus ring; session 34 never noticed).

Fix (surgical, Cortex untouched): `FrontDeskStyles.tsx` now defines
unlayered, class-based field styles that outrank the element rules:
- `.fd-bare` (+ `.fd-bare-lg`) — chromeless inputs (launcher, symptom
  picker; the wrapper div carries the visual chrome — divs are unaffected
  by the leak, utilities work there).
- `.fd-field` / `.fd-field-error` — the standard 44px modal field incl.
  hover/focus/error states.
- `.fd-label` — counters `label { display:grid }` + uppercase `label span`.

**Rule going forward: in Front Desk, never style an `input`/`select`/
`textarea`/`label` element with Tailwind utilities — use/extend the fd-*
classes.** Re-layering the legacy CSS imports would be the real fix but
risks Cortex-wide visual changes; deliberately not done.

====================================================
## 4. VERIFICATION DONE THIS SESSION
====================================================

- `npx tsc -b` — zero new errors (same ~46 pre-existing legacy errors).
- Headless Chrome screenshots at 1366×768 and 1920×1080, English and
  Hinglish, populated queue (real DB data was present all day).
- Interactive verification via a PowerShell CDP driver (no npm automation
  package exists; scripts lived in the session scratchpad only):
  launcher `+` → Register Patient modal → typed "fe" → picked "fever" from
  the real catalog → chip rendered → saved → **row #009 appeared with the
  symptom persisted and read back from the DB**; Hinglish toast interpolated
  the real token ("Test Patient FD add ho gaya · #009" + Wapas undo).
- Test data (patient/visit/visit_symptoms for phone 9999000111) deleted via
  Supabase REST afterward — DB left clean; language reset to English.
- NOT verified live: MorningWelcome/DayDone halos (real visits existed all
  day, so the states were unreachable; change is a static CSS radial behind
  the existing verified SVG — low risk). Worth an eyeball on a fresh morning.

====================================================
## 5. OPEN ITEMS (carried + new)
====================================================

1. Carried from 33/34, still true: `npm run build` blocked by legacy tsc
   errors; no auth; Cortex "Next Patient" button missing (top functional
   gap); `clinic_mode` unread.
2. Toast is still the shared bottom-right `<Toaster>` (Cortex-shared);
   direction §10.4 keeps this as the acknowledged exception.
3. Devanagari `hi` still stubbed/disabled.
4. VisitDetailModal's doctor `<select>` is still native (flagged in s34 §8;
   a rich doctor-picker matching DoctorsCard would need sign-off).
5. If dark mode or a Cortex restyle ever happens, consider properly layering
   the legacy CSS imports (§3 above) instead of extending fd-* classes.
