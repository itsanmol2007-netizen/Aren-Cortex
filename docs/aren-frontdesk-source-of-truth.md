# AREN FRONT DESK — SINGLE SOURCE OF TRUTH (through Part I · 2026-07-21)

Last consolidated: 2026-07-21 · Branch: `master` · Routes: `/app/frontdesk`,
`/app/patients`, `/app/printrx`, `/app/clinicstatus` (+ `/login`)

> Reading order: Parts A–H are the frozen product/architecture/design history.
> **Part I (Clinic Status + operational layer + auth persistence) is the newest
> — it wins on anything it covers.** For pure file-level "what is this code",
> pair this with `docs/aren-technical-atlas.md`.

## 0. How to read this document

This is the **one file to open first** for anything Front Desk. It folds together
five older docs and two handoffs into a single, current, non-contradictory
reference. Where two older docs disagreed, this file states the winning version
and the reason.

If you only read one thing: **Front Desk is a receptionist's visit-management
workspace, built as a Tailwind-only feature under `src/features/frontdesk/`,
sharing one app / one deployment / one Supabase DB with the doctor workspace
(Cortex). The queue is the product. Architecture and visual direction are both
FROZEN — execute them, don't redesign.**

### Source documents this consolidates (still on disk, for deep dives)

| Doc | What it still owns | Trust level |
|---|---|---|
| `aren-architecture-handoff.md` | Product philosophy, Visit model, Solo Mode, workspace split | FROZEN, authoritative |
| `aren-frontdesk-brief.md` | Layout inventory, what's frozen vs free, non-negotiables | FROZEN, authoritative |
| `aren-frontdesk-design-direction.md` | v2 "Bhor" visual system (ink/thread/paper) | FROZEN — **except §10.2 modals**, superseded by session 36 |
| `aren-session35-handoff.md` | Why v1→v2, structured symptoms, Tailwind layer trap | Current for everything except modal surface |
| `aren-session36-handoff.md` | ModalShell, catalog symptom picker, field system upgrade | **Newest — wins on anything modal-related** |
| `aren-frontdesk-inspiration.md` | Mood/reference notes | Background only |
| `design/aren-frontdesk-v2.html` | Workflow reference prototype | Workflow only — **do NOT copy its visuals** |
| `docs/Patient intake model ss.png` | Cortex intake screenshot — craftsmanship reference for modals | Craft, not layout |

Stale, do not trust on styling: `aren-session33-handoff.md`, `aren-session34-handoff.md`
(accurate only on early plumbing/i18n/hooks history).

---

# PART A — PRODUCT & ARCHITECTURE (frozen)

## 1. What AREN is

AREN is a lightweight **clinical operating system** for small/medium clinics —
not a hospital management system. Philosophy: reduce friction, reduce clicks,
reduce cognitive load. Every screen exists because someone is completing a real
task.

Two operational workspaces live in **one app, one deployment, one database**:

- **Cortex** (`/app/cortex`, `src/App.tsx`) — the doctor's clinical decision
  workspace (history, findings, diagnosis, medicines, prescription).
- **Front Desk** (`/app/frontdesk`, `src/features/frontdesk/FrontDeskPage.tsx`)
  — the receptionist's visit-management workspace.

Fixed identifiers (single-clinic MVP, hardcoded in `src/lib/db/reference.ts`):

- Hospital ID: `38bd8da3-0dd2-43a5-ad09-2d3194c95ba9`
- Doctor: **SK Pandey**, ID `5cd330d2-5a48-4098-b865-ed3393e08698`, specialization `general`

## 2. The Visit is everything

`Patient ≠ Visit`. One patient has many visits. Every interaction creates or
modifies a **Visit**. A Visit carries: patient, doctor, status, symptoms,
findings, medicines, tests, prescription, timeline, notes.

**Front Desk owns only the front half of a visit's life**: identify/create
patient → create visit → manage queue → assign doctor → collect presenting
symptoms → change status. Receptionists never prescribe, never consult.

## 3. Universal workflow (the loop)

```
Patient arrives
  → Reception identifies or creates patient        (Patient Launcher)
  → Visit created, status = waiting                 (CreateVisitModal → createVisit)
  → Patient enters queue                            (QueuePanel row)
  → Doctor starts consultation, status = serving    (markVisitServing)   ← see gap in §17
  → Doctor completes, status = completed            (updateVisitStatus)
  → Prescription generated (Cortex side)
  → Visit completed
```

`Cancelled` (stored as `discarded`) is terminal. Nothing outside this flow
should interrupt it.

## 4. Visit status vocabulary

Real values in `visits.status` (plain TEXT column, no DB enum):

| Stored value | UI label (en) | Tab? | Meaning |
|---|---|---|---|
| `waiting` | Waiting | yes | In queue, not yet called |
| `serving` | In Consultation | yes | With the doctor |
| `completed` | Completed | yes | Done |
| `discarded` | Cancelled | no (shows in "All" list only) | Terminal cancel |
| `referred` | Referred | no | Referred out (Cortex concept) |
| `draft` | — | no | Cortex-side working state; Front Desk never creates it |

Front Desk queue tabs surface only waiting / serving / completed (+ All).
`discarded`/`referred` still render correctly in "All" and in a row, they just
have no dedicated tab. Defined in `types/frontdesk.ts` + `statusStyle.ts`.

## 5. Solo Mode (architecture supports, not yet wired in Front Desk)

Some clinics have no receptionist. Controlled by clinic config
`Reception Available = true/false`. When false, reception tasks appear inside
Cortex (a "New Patient" button lets the doctor create the visit directly). The
architecture never changes — only the actor. **`clinic_mode` is currently
unread** (see §17). Panels never branch on `specialty`/`clinicMode` internally;
that decision happens at page/route level only.

---

# PART B — FROZEN LAYOUT & DESIGN

## 6. Layout inventory (FROZEN — do not redesign)

Top to bottom, the Front Desk page is:

1. **Ink header band** (full-bleed) — brand mark + wordmark, clinic name,
   date/time, language dropdown, user chip.
2. **Patient Launcher** — its own dedicated 64px row (search-or-create bar + `+`).
3. **Stat strip** — 4 cards: Today's Visits / Waiting / In Consultation / Completed.
4. **Two-column grid** (`1fr / 296px`, collapses to 1 col ≤1040px):
   - **Left — Queue panel**: title, tabs (All / Waiting / In Consultation /
     Completed with counts), sorted rows.
   - **Right — Sidebar**: Today's Summary card, Doctors card, Doctor Requests card.
5. **Modals** (portal): Visit Detail, Create Visit.

Row content order (frozen): token → name(+phone, returning badge) → symptoms →
doctor → last visit → status → kebab menu.

Frozen rules: single click everywhere (no double-click); modal for editing
(never inline expansion); undo instead of confirm where safe; skeleton loading
(no spinners); minimal toasts; Doctor Requests is **mock-only, no DB**.

## 7. Visual direction v2 — codename "Bhor" (भोर, daybreak) — FROZEN

The one-sentence test for every visual choice:
**"ink frames, thread stitches, paper works."**

The story: *Cortex is the night shift of the brand; Front Desk is its morning.*
Same ink sky and same gradient thread as Cortex, but warmed toward dawn
(apricot/pink/violet), with the thread at the **bottom** (horizon) instead of
the top (crown).

### 7.1 Three vocabularies — NEVER mixed

- **Ink** (the frame): header band, Now Serving card, toast. Dark, atmospheric,
  carries the thread at full strength.
- **Paper** (the work): every white surface. Near-monochrome; decoration only
  where this doc grants it.
- **Semantic color** (the data): amber = waiting, blue = consulting, green =
  done, red = danger. Nothing else. **Violet/pink NEVER color data** — not a
  status, not a numeral, not a patient-facing action.

Rule: violet **labels structure** (where you are / what a region is). Semantic
color **labels data** (about a patient/visit).

### 7.2 The ink band

`linear-gradient(135deg, #0d1b35, #120f28 38%, #170d27 62%, #0b1525)` (identical
to Cortex) + three faint dawn radials (apricot 15%, pink 55%, violet 90%).
Height ≈ 62px, not sticky. Shadow `0 4px 28px rgba(8,16,44,0.28)`.

### 7.3 The dawn thread (closed list — 4+ surfaces only)

`linear-gradient(90deg, #f2a986 0%, #f472b6 32%, #a855f7 68%, #6366f1 100%)`

| Surface | Placement | Weight |
|---|---|---|
| Ink band | bottom edge | 2px, full strength + glow |
| Now Serving card | top edge | 2px, full strength + glow |
| Queue panel | top edge | 2px, **55% opacity, no glow** |
| Modals (ModalShell) | top edge | **2.5px, full strength + glow** (s36 upgrade from 65%) |

Nowhere else. Four appearances is a motif; ten is wallpaper.

### 7.4 Micro-label system

10.5–11px / 700–800 / uppercase / +0.07em tracking, structural violet
`#837bb2`, optional 12–13px lucide icon at 70%. Used for: sidebar card titles,
modal section labels, launcher dropdown caption, Now Serving caption (lavender
`#b9b4d6` on ink). **Exception:** stat-card labels use the same format but
neutral gray `#8a91a0` (they sit next to semantic numerals — violet would mix
vocabularies).

### 7.5 The color anchors

- Paper: page `#f4f4f8` + dot grid; surfaces `#fff`/`#fafbfc`; text ladder
  `#161d29 → #5a6472 → #8a91a0 → #a8aeba`.
- Ink text ladder: white → `#c7d2fe` → `#b9b4d6` → `rgba(255,255,255,0.35)`.
- Semantic: blue `#2f6bed`, amber `#c9791a`, green `#1c8a4d`, red `#d23b34`.
- Brand aura: violet `#7c5cf0` (+`#6366f1` focus, `#a855f7` thread), dawn pink
  `#f0abc8`/`#f472b6`, apricot `#f2a986`, structural violet-gray `#837bb2`.
- Brand gradient (mark + launcher `+` + modal icon tile + Save button):
  `linear-gradient(155deg, #7c5cf0, #2f6bed)`.

### 7.6 The zero rule

A stat value of 0 renders muted `#a8aeba` (icon chip keeps its tint) so the
empty morning never looks broken. On ink, an asleep value = `rgba(255,255,255,0.35)`.
Dashes are never colored.

### 7.7 The two "front doors" wear the brand

The header mark and the launcher `+` are the same brand-gradient object at two
sizes. Registration's **Save Visit** button also wears the brand (it opens a
door, it doesn't change a visit's *status*). **Every button that changes a
visit's status stays strictly semantic** (blue/green/red).

### 7.8 Empty states — the "dawn arcs" system (first-class, per the morning problem)

- **MorningWelcome** (no visits at all today, All tab): dawn arcs + static pink
  halo + greeting (time-aware) + one line + arrow-up. No button.
- **TabEmpty** (a filter is empty mid-day): one 20px line icon + one line. No
  color, no illustration, no motion.
- **DayDone** (visits exist, none still waiting/serving): green-hued arcs + halo,
  a quiet sign-off, not a celebration.

### 7.9 Motion (§9 doctrine) — nothing moves unless touched, 2 exceptions

Only two ambient animations exist: launcher dawn-wash **breath** (8s) and the
unacked doctor-request **pulse** (1.4s). Plus `aren-rise` empty-state entrance
(300ms, once). Thread and all glows are **static**. Everything collapses to
`none` under `prefers-reduced-motion`. One two-note chime (Web Audio) is the
only sound.

## 8. Session-36 modal amendment (newest — overrides direction §10.2)

Every Front Desk modal now renders inside one shared **`ModalShell`** ("the Bhor
modal surface"): 580px max, radius 18, deep two-layer shadow, thread at full
strength + glow on the top edge, a header zone with dawn radials + corner-arc
watermark + 40px brand-gradient icon tile + violet eyebrow micro-label + Manrope
17px title + ghost X close, paper body, optional footer band. Escape / backdrop
click / `role="dialog"` live in the shell.

Field system upgraded to a **soft-filled premium treatment** (`fd-field`: 46px,
radius 11, `#f7f8fb` fill, violet focus ring). Symptom field is a **catalog
picker** (see §12). **Any future modal must use `ModalShell` — never hand-roll
modal chrome again.**

---

# PART C — RULES (the non-negotiables)

1. **All styling in Tailwind utility classes in `.tsx`.** No separate CSS files.
   Exceptions: row-tint gradients use inline `style=`; keyframes + the fd-*
   field classes live as an inline `<style>` in `FrontDeskStyles.tsx`.
2. **All DB calls stay in `src/lib/db/`.** Components never touch Supabase directly.
3. **Every user-facing string goes through `t('key')`** reading from
   `i18n/strings.ts`. Zero hardcoded English in components. `en` + `hinglish`
   populated; `hi` is empty stubs that fall back to English.
4. **Symptoms are structured entities, never free text** — see §12. This was
   misunderstood repeatedly; do not regress it.
5. **The Tailwind v4 layer trap** — see §13. Never style raw
   `input`/`select`/`textarea`/`label` elements with utilities in this feature;
   use/extend the `fd-*` classes.
6. Touch targets ≥ 44px. Must look right at 1366×768 and 1920×1080.
7. No violet/pink outside the §7.5 closed list; no thread outside the §7.3 four
   surfaces; no decoration inside populated rows / open dropdowns / form fields.
8. Language dropdown lives header top-right, default English.
9. Keyboard-ready architecture (don't build shortcuts, just don't block them):
   queue wrapper has `role="listbox"`, rows have `role="option"` + `data-token`;
   visit actions are standalone callables in `useVisitActions` (a future
   shortcut registry can call the same functions a click does).
10. Architecture and creative direction are **FROZEN**. Execute, don't re-litigate.

---

# PART D — TECHNICAL LAYER

## 9. Stack & entry points

- React 18 + TypeScript + Vite (esbuild dev, no typecheck), React Router,
  TanStack Query (present app-wide; Front Desk uses its own lightweight hooks
  instead), `sonner` toasts, `lucide-react` icons, Tailwind **v4**
  (`@import "tailwindcss"` in `src/styles.css`).
- Supabase JS client in `src/lib/supabase.ts` (reads `VITE_SUPABASE_URL` /
  `VITE_SUPABASE_ANON_KEY` from `.env`).
- Routing in `src/main.tsx`: `/app/cortex` → `App`, `/app/frontdesk` →
  `FrontDeskPage`, `/` and `/app` redirect to cortex. The global
  `<Toaster position="bottom-right" richColors>` is **shared with Cortex**
  (acknowledged exception — only toast *copy* is localized, not the Toaster config).
- Fonts: Manrope + Inter via a Google Fonts `<link>` in `index.html` (offline →
  system sans fallback).

## 10. Build / run / test

- Dev: `npm run dev` → `http://127.0.0.1:5173`. Routes above.
- `npm run build` = `tsc -b && vite build`. **`tsc -b` fails on ~46
  PRE-EXISTING type errors** in legacy files (`src/App.tsx`,
  `src/components/PreviewPanel.tsx`, `src/data/mockData.ts`) — NOT caused by
  Front Desk. Dev works fine via esbuild. Production `vite build` will stay
  blocked until those legacy errors are fixed (separate cleanup).
  Filter for relevant errors: `npx tsc -b 2>&1 | grep -iE 'frontdesk|lib/db'`.
- Headless verify (no browser npm pkg): drive system Chrome —
  `chrome.exe --headless=new --disable-gpu --no-sandbox --virtual-time-budget=8000 --dump-dom <url>`.

## 11. Data flow (how the page comes alive)

```
FrontDeskPage (I18nProvider wrapper)
 └─ FrontDeskInner
     ├─ useQueue(HOSPITAL_ID)         → fetchTodayVisits every 25s (silent), owns visits[]
     ├─ useVisitActions({visits,setVisits,refetch})
     │     → optimistic patch → DB call → rollback on failure → toast
     ├─ fetchDoctorsByHospital / fetchHospital (once, on mount)
     ├─ setInterval(now, 20s) for the header clock
     └─ renders Header, PatientLauncher, StatStrip, QueuePanel, Sidebar, + modals
```

- The open Visit Detail modal is kept in sync with the live queue via
  `liveOpenVisit = visits.find(...)` so its buttons reflect the current status.
- Optimistic actions patch in-memory state immediately; the 25s refresh
  self-corrects either way.

## 12. Structured symptoms (RULE #4, detailed)

Symptoms are rows in the `symptoms` table (`id`, `name`, ~51 entries) feeding
Cortex / Synapse / medicine ranking / future specialty logic. Front Desk must
let the user **search/select from the catalog and store symptom IDs** — never
arbitrary typed strings.

- Catalog source: `fetchSymptoms()` (`src/lib/db/reference.ts`).
- Reference implementation: `SymptomPicker` inside `CreateVisitModal.tsx`.
- Persistence: `saveVisitSymptoms(visitId, symptomIds)` → `visit_symptoms` rows.
- Since s36 the picker is a **catalog** (focus opens the full list as `+ name`
  chips) with typo-tolerant filtering (prefix > substring > Levenshtein fuzzy —
  "feber" surfaces fever); Enter picks the top match (violet focus ring);
  selected chips live inside the field well; Escape closes catalog first (capture
  listener), modal second.

## 13. The Tailwind v4 layer trap (RULE #5, detailed)

Tailwind v4 utilities live in CSS cascade **layers**. Cortex's legacy CSS
(`src/styles/base.css` etc., imported **unlayered** in `main.tsx`) styles raw
`input`/`select`/`textarea`/`label` **elements** (31px height, blue focus ring,
`label{display:grid}`, uppercased `label span`). **Unlayered CSS beats layered
CSS regardless of specificity**, so Tailwind utilities on those elements
silently lose (looks right in code, renders wrong).

Counterweight = unlayered class rules in `FrontDeskStyles.tsx`:
`.fd-bare`/`.fd-bare-lg` (chromeless inputs; put chrome on a wrapper div),
`.fd-field`/`.fd-field-error` (premium 46px field), `.fd-label`,
`.fd-ico`/`.fd-tag` (label ornaments). Divs/buttons are mostly safe. The real
fix (re-layering the legacy imports) was deliberately skipped to avoid
Cortex-wide regressions.

---

# PART E — FILE TREE (relevant code only)

Excludes: `node_modules`, `.git`, config/dependency files, and the mature Cortex
feature internals (summarized, not expanded). **Front Desk files carry long
descriptions** so you know exactly what to open for a given change.

## 14. Front Desk feature — `src/features/frontdesk/` (the codebase you'll edit)

```
src/features/frontdesk/
├── FrontDeskPage.tsx          ← page shell + Header + LanguageDropdown + nav state (s37)
├── statusStyle.ts             ← per-status colors/tints (single source)
├── utils.ts                   ← pure presentational helpers
├── types/
│   └── frontdesk.ts           ← feature types + status label maps
├── hooks/
│   ├── useQueue.ts            ← 25s silent queue polling
│   └── useVisitActions.ts     ← optimistic status/create actions
├── i18n/
│   ├── strings.ts             ← the entire copy dictionary (en/hinglish/hi)
│   └── i18n.tsx               ← I18nProvider / useT / useI18n
└── components/
    ├── NavRail.tsx            ← collapsible icon rail / sidebar (s37) — NAV_ITEMS registry
    ├── PatientLauncher.tsx    ← search-or-create bar (front door)
    ├── StatStrip.tsx          ← 4 stat cards
    ├── QueuePanel.tsx         ← tabs + sorting + row list + empty-state routing
    ├── VisitRow.tsx           ← one queue row + kebab menu
    ├── Sidebar.tsx            ← thin wrapper: Summary + Doctors + Requests
    ├── SummaryCard.tsx        ← Today's Summary + Now Serving ink card
    ├── DoctorsCard.tsx        ← per-doctor activity/queue count
    ├── DoctorRequestsCard.tsx ← MOCK doctor requests (no DB) + chime
    ├── EmptyStates.tsx        ← MorningWelcome / TabEmpty / DayDone
    ├── DawnArcs.tsx           ← the dawn-arcs SVG motif
    ├── ModalShell.tsx         ← shared Bhor modal surface (s36)
    ├── CreateVisitModal.tsx   ← intake form + SymptomPicker catalog
    ├── VisitDetailModal.tsx   ← visit detail + status buttons + recent visits
    └── FrontDeskStyles.tsx    ← inline <style>: fd-* field classes + keyframes
```

### 14.1 File-by-file (Front Desk — long descriptions)

**`FrontDeskPage.tsx`** — The feature root. `FrontDeskPage` just wraps
`FrontDeskInner` in `<I18nProvider>`. `FrontDeskInner` is the composition root:
calls `useQueue` + `useVisitActions`, fetches doctors/hospital once, runs the
20s header clock, holds modal open-state (`openVisit`, `createState`) **and nav
state** (`navOpen`, persisted to `localStorage aren.frontdesk.nav`; an
outside-mousedown listener folds the drawer back unless the target is
`data-nav-keep`). Lays out the page as a flex row: `NavRail` + a `main`
workspace (dawn-residue background, launcher, stat strip, the `1fr/296px` grid,
both modals). Also defines the **`Header`** (full-bleed ink band + `aren-nebula`
sky at 45%; the real **AREN logo** (`aren-logo.png`) is a button that toggles
the rail; two-tone wordmark, clinic/date/time, user chip, horizon thread) and
**`LanguageDropdown`**. *Open this to change:* overall page layout, header
contents, the nav toggle, the language switcher, what data loads on mount, modal
wiring. (The rail itself lives in `NavRail.tsx`.)

**`statusStyle.ts`** — The single lookup for status-domain styling. Exports
`STATUS_TINT` (per status: label, i18n `labelKey`, border/dot colors, text
class, chip bg, ambient row `background`/`backgroundHover` gradients) and
`tintFor(status)` (safe fallback to neutral). This is intrinsic queue styling,
**not** specialty/clinic branching. *Open this to change:* any status color,
row tint, or status label mapping — VisitRow, tabs, and both modals all read
from here so they stay in agreement.

**`utils.ts`** — Pure, side-effect-free presentational helpers: `timeAgo`,
`formatShortDate` (Today/Yesterday/date), `maskPhone` (first 4 digits + X's),
`initials`, `padToken` (3-digit zero-pad, `—` for null). Safe to import
anywhere. *Open this to change:* how times/phones/tokens/initials are formatted.

**`types/frontdesk.ts`** — Feature-local TypeScript types. Re-exports
`TodayVisit`/`DBPatient`/`DBDoctor` from the DB layer; defines `VisitStatus`
union, `STATUS_LABEL` map, `QueueTab`, `DoctorActivity`, `DoctorSummary`,
`DoctorRequest` (client-only — no DB table), `PatientMatch`,
`CreateVisitFormValues`. *Open this to change:* the status set, tab set, or the
shape of feature view-models.

**`hooks/useQueue.ts`** — Owns the live queue. On mount calls
`fetchTodayVisits(hospitalId)`, then re-polls every **25s silently** (failures
are non-fatal warnings; `loading` only flips on the first load). Returns
`{ visits, setVisits, loading, refetch }`. The `mounted` ref guards against
setState after unmount. *Open this to change:* refresh cadence, what the queue
loads, or to add realtime later.

**`hooks/useVisitActions.ts`** — All visit mutations as standalone callables
(keyboard-ready). Each does an **optimistic** in-memory `patch`, then the DB
call, then rolls back to the pre-action snapshot on error + shows a toast:
`startConsultation` (→ `markVisitServing`), `completeVisit`, `cancelVisit`
(supports `silent` for undo), `reassignDoctor`, and `createNewVisit` (finds/
creates patient → `createVisit(..., "waiting", doctorId)` → best-effort
`saveVisitSymptoms(symptomIds)` → `refetch` → success toast with an **Undo**
action that cancels the new visit). *Open this to change:* status-transition
logic, toast copy wiring, optimistic behavior, or the create flow. Note
`createNewVisit` takes `symptomIds: number[]` (structured symptoms).

**`i18n/strings.ts`** — The **normative copy source**. `en` object (every key +
English value; `StringKey` is derived from it), a fully populated `hinglish`
map, and `hi` as programmatic empty stubs (fall back to English at render).
`DICTS` bundles them; `LANGS` drives the header dropdown (`hi` flagged `soon`).
Interpolation uses `«token»` placeholders. Doctrine: workflow nouns English,
Hindi connective tissue, Roman script for Hinglish. *Open this to change:* ANY
user-facing string, or to fill in Devanagari.

**`i18n/i18n.tsx`** — The i18n engine: `I18nProvider` (holds `lang`, persists to
localStorage `aren.frontdesk.lang`, default `en`), `useI18n()`
(`{lang, setLang, t}`), `useT()`. `translate()` does empty→English fallback and
`«token»` substitution. *Open this to change:* language persistence, fallback
behavior, or interpolation syntax.

**`components/PatientLauncher.tsx`** — The primary interaction point ("the front
door"). A 64px bar: animated dawn wash (breathes while idle, brightens/stops on
focus), search input (`fd-bare`), and the brand-gradient `+`. Debounced (220ms)
`searchPatients` on ≥2 chars; results render in a **portal** dropdown positioned
by the bar's `getBoundingClientRect` (so it escapes `overflow-hidden`), with an
"Existing Patients" micro-label, patient rows, and a "Register new patient"
action. `onSelectExisting`/`onCreateNew` bubble up to open CreateVisitModal.
*Open this to change:* search behavior, the launcher's idle personality, the
create-new affordance.

**`components/StatStrip.tsx`** — Four stat cards (Today/Waiting/Consulting/
Completed) computed with `useMemo` over `visits` (Today excludes `discarded`).
Each card (V3, s38): tinted icon chip + sentence-case label on one line, big
Manrope numeral below, then a semantic subline ("Currently waiting" …). No
watermark. Implements the **zero rule** (0 → muted `#a8aeba`).
*Open this to change:* which metrics show, stat card treatment.

**`components/QueuePanel.tsx`** — The flagship surface. Owns the active `tab`,
computes tab `counts`, and builds `rows` (filter by tab, then sort by status
order waiting→serving→completed→other, then by `created_at`). Renders the thread
top edge (55%), the title, the `Tab` buttons (with count + colored dot), and
then routes to: `SkeletonRows` (loading), `MorningWelcome`/`TabEmpty`/`DayDone`
(empty, based on `hasVisitsToday` + `everyoneDone`), or the `role="listbox"` row
list. Since s38 the list is a **table**: a pinned `ColumnHeaders` strip (Token/
Patient/Symptoms/Doctor/Time/Status) and the rows **scroll inside the panel**
(`maxHeight: clamp(260px, 100vh−380px, 640px)`, `overscroll-contain`) so the
page never grows, with a "Showing n patient(s)" footer. Takes `now` (20s clock)
and passes it to each row. *Open this to change:* tabs, sorting, empty-state
routing, skeletons, column headers, scroll height.

**`components/VisitRow.tsx`** — One queue row (`role="option"`, `data-token`).
Grid columns (V3, s38): lavender **token chip** · name + Returning badge
(visit_count > 1, tooltip) + `phone · age · gender` subline · truncated symptoms
(first 2 + "+N" tooltip) · doctor · **Time** (created time + relative date) ·
**status pill** (dot + label from `tintFor`, and for `waiting` a live
"· «m» min" from the `now` prop) · always-present kebab (40% opacity → 100% on
hover). Left border stripe + ambient tint come from `statusStyle`. Kebab opens a
**portal** menu (Open / Move / Complete / Cancel). Whole row is a single-click
open; the kebab stops propagation. *Open this to change:* row anatomy, the row
menu, hover/selected treatment. (Row interior is the most protected surface — no
decoration here.)

**`components/Sidebar.tsx`** — Thin composition wrapper only: stacks
`SummaryCard`, `DoctorsCard`, `DoctorRequestsCard`. Passes `now` (20s clock)
through to `SummaryCard`. *Open this to change:* which sidebar cards exist /
their order.

**`components/SummaryCard.tsx`** — Today's Summary (rebuilt s38). Computes
current serving token + patient name (most recently started `serving` visit)
plus average wait, longest wait, and patients-seen — all ticking off the `now`
prop, not the queue refresh. Renders a **lavender Current Token box** (brand
violet = structure, `Radio` icon chip; asleep `—` in muted violet) followed by
three metric rows (`MetricRow`: Average Wait / Longest Wait / Patients Seen).
The old dark "Now Serving ink card" was removed here. *Open this to change:* the
summary metrics or the Current Token treatment.

**`components/DoctorsCard.tsx`** — Per-doctor rows computed from `doctors` +
`visits`: activity = off (availability_status ≠ active) / busy (has a `serving`
visit) / free; avatar (image or initials) with status ring + dot; label
(With #token / Free / Off duty); waiting-queue count. *Open this to change:*
doctor presence display, activity logic.

**`components/DoctorRequestsCard.tsx`** — **MOCK ONLY — no DB table exists.**
Session-local `requests[]`; a dashed "Simulate" button pushes a random request
from a hardcoded `POOL` and plays a two-note Web Audio **chime** (the only sound;
skipped under reduced motion). Acknowledge removes it + toasts. Unacked cards
wear the `aren-pulse` amber ring. *Open this to change:* the future
communication-bridge mock; wiring a real `doctor_requests` table would start here.

**`components/EmptyStates.tsx`** — The three-part dawn empty-state system:
`MorningWelcome` (time-aware greeting + arcs + pink halo, no visits today),
`TabEmpty` (quiet one-icon-one-line per tab, mid-day), `DayDone` (green arcs +
halo sign-off). *Open this to change:* the morning experience or any empty copy/icon.

**`components/DawnArcs.tsx`** — Pure SVG motif: three concentric arcs over a
horizon + a sun dot, re-hued per `variant` (`morning` violet/pink, `endOfDay`
green/blue). Used by the empty states. *Open this to change:* the illustration itself.

**`components/ModalShell.tsx`** — **The shared Bhor modal surface (s36).** Every
Front Desk modal renders here via portal. Owns: overlay (blur + click-to-close),
580px radius-18 panel, thread (2.5px full+glow), header zone (dawn radials +
`CornerArcs` watermark + brand-gradient icon tile + violet eyebrow + Manrope
title + ghost X), paper body, optional footer band, and Escape-to-close. Props:
`eyebrow`, `title`, `icon`, `onClose`, `footer`, `children`. **s37 hardening:**
backdrop-close fires only if the *mousedown AND click* both land on the overlay
(`pressedOnBackdrop` ref) — this killed the silent close-on-save regression (see
§21); the panel is overflow-visible with only the header clipping its own
decoration, so in-body dropdowns aren't cut off. *Open this to change:* anything
common to all modals, or to build a NEW modal (always use this).

**`components/CreateVisitModal.tsx`** — Patient intake (heavily reworked s37/
s38). New-patient path is a grouped form (PATIENT DETAILS: name / compact age +
gender / phone; then TODAY'S VISIT: symptoms + doctor); existing-patient path
shows a **violet** identity card + visit-stats then TODAY'S VISIT. Now **all of
name/age/gender/phone are required** (plus ≥1 symptom); Save wears the **brand
gradient**. Field system (s37): `AgeInput` (compact, digits 0–120, arrow-key +
mouse-wheel step), `GenderControl` (keyboard-first radiogroup — M/F/O select,
arrows cycle), a `+91`-prefixed phone cell hard-capped at 10 digits with a live
`n/10` counter, and an **Enter flow** that advances field-to-field then Saves
once complete. **Smart dedupe (s38):** typing name/phone silently
`searchPatients` (350ms debounce) → a violet banner offers "create visit for
this patient"; same phone+name reuses the existing patient (never mints a twin),
same phone under a different name blocks until resolved (`onUseExisting`
switches the open modal into existing-patient mode). Also contains the
**`SymptomPicker`** (catalog, typo-tolerant `matchScore`/`editDistance`; catalog
dismissed on outside *click*, not mousedown — see §21), `SectionLabel`, and
`Field`. *Open this to change:* the intake form, field layout, dedupe, or
symptom selection UX.

**`components/VisitDetailModal.tsx`** — Read + act on one visit. Header shows
token + status-colored patient name + demographics. Sections (each a violet
micro-label + fading hairline): Symptoms (neutral chips), Assigned Doctor
(native `fd-field` select → `onReassignDoctor`), Change Status (`StatusBar` —
semantic buttons that transition + close), Recent Visits (last 3 completed via
`fetchPatientVisits`, each with a status dot). *Open this to change:* the detail
view, status-change buttons, doctor reassignment, or recent-visit display.
(Note: the doctor `<select>` is still native — flagged as the most visible
non-premium element; a rich picker needs sign-off.)

**`components/FrontDeskStyles.tsx`** — A single inline `<style>` (no `.css`
file) mounted once by the page. Defines the **unlayered** `fd-*` field classes
that beat Cortex's legacy element rules (`fd-bare`, `fd-bare-lg`, `fd-field`,
`fd-field-error`, `fd-label`, `fd-ico`, `fd-tag`) and the three keyframes
(`aren-breath`, `aren-pulse`, `aren-rise`), all disabled under
`prefers-reduced-motion`. *Open this to change:* field styling or the feature's
keyframe motion. (See §13 — this is the layer-trap counterweight.)

## 15. Data layer — `src/lib/` (shared with Cortex; Front Desk depends on it)

```
src/lib/
├── supabase.ts        ← Supabase client (env-driven)
├── db.ts              ← barrel: re-exports ./db/*
└── db/
    ├── reference.ts   ← constants (IDs), symptoms/findings, ranking RPCs
    ├── patients.ts    ← patients, visits, doctors, hospital, queue, history
    └── intelligence.ts← Cortex clinical engine (not used by Front Desk)
```

- **`db.ts`** — barrel re-exporting all of `db/reference`, `db/patients`,
  `db/intelligence`, so `@/lib/db` imports keep working.
- **`db/reference.ts`** — Fixed IDs (`DOCTOR_ID`, `DOCTOR_NAME`,
  `HOSPITAL_ID`, `DOCTOR_SPECIALIZATION`), types `DBSymptom`/`DBFinding`,
  frequency-slot helpers, and Front Desk's **`fetchSymptoms()`** (catalog,
  ordered by name) + `fetchFindings()` + ranking RPCs (`fetchProbableFindings`,
  `fetchRankedPanels`, snapshots, dynamic tests — Cortex-only).
- **`db/patients.ts`** — The workhorse for Front Desk (see §16 for the call map):
  patient search/create, visit create/status/reassign, symptom persistence,
  doctor/hospital fetch, today's queue, patient history, visit stats.
- **`db/intelligence.ts`** — Cortex clinical engine; Front Desk does not import it.

## 16. Front Desk → DB call map

Every Supabase call Front Desk makes, and from where:

| DB function (`src/lib/db/`) | Called from | Tables touched | Notes |
|---|---|---|---|
| `fetchTodayVisits(hospitalId)` | `useQueue` | visits, patients, doctors, visit_symptoms | Today's queue, hydrated w/ names+symptoms+visit_count. Ordered by `created_at`. |
| `searchPatients(query)` | `PatientLauncher` | patients | ilike on name/phone, ≥2 chars, limit 8. |
| `findPatientByPhone(phone)` | `useVisitActions.createNewVisit` | patients | Dedup before create. |
| `createPatient({name,age,gender,phone})` | `useVisitActions.createNewVisit` | patients | Adds `hospital_id`. |
| `createVisit(patientId,"waiting",doctorId)` | `useVisitActions.createNewVisit` | visits | Front Desk passes `"waiting"`; computes `token_number` = max-today + 1. |
| `saveVisitSymptoms(visitId, symptomIds)` | `useVisitActions.createNewVisit` | visit_symptoms | Best-effort (non-fatal); default intensity "moderate". |
| `markVisitServing(visitId)` | `useVisitActions.startConsultation` | visits | status→serving + `started_at`. |
| `updateVisitStatus(visitId, status)` | `useVisitActions.completeVisit` / `cancelVisit` | visits | `completed` sets `completed_at`; cancel stores `discarded`. |
| `reassignVisitDoctor(visitId, doctorId)` | `useVisitActions.reassignDoctor` | visits | Updates `assigned_doctor_id`. |
| `fetchDoctorsByHospital(hospitalId)` | `FrontDeskPage` | doctors | Includes `avatar_url`, `availability_status`. |
| `fetchHospital(hospitalId)` | `FrontDeskPage` | hospitals | Header clinic name. |
| `fetchSymptoms()` | `CreateVisitModal.SymptomPicker` | symptoms | The ~51-row catalog. |
| `fetchPatientVisitStats([id])` | `CreateVisitModal` | visits | Existing-patient visit count/last visit. |
| `fetchPatientVisits(patientId)` | `VisitDetailModal` | visits, doctors, visit_symptoms, symptoms, findings, prescriptions, … | Recent completed visits (uses first 3). |

### Key DB tables (as used by Front Desk)

- **`patients`** — `id, name, age, gender, phone, hospital_id`.
- **`visits`** — `id, patient_id, assigned_doctor_id, hospital_id, status`
  (TEXT), `token_number` (computed in `createVisit`, no DB default),
  `created_at, started_at, completed_at`.
- **`visit_symptoms`** — join: `visit_id, symptom_id, intensity`.
- **`symptoms`** — `id, name` (~51). The structured catalog.
- **`doctors`** — profile incl. `avatar_url, availability_status, hospital_id`.
- **`hospitals`** — clinic profile (`name`, branding fields).
- (Cortex-side, read for history: `visit_findings`, `findings`, `prescriptions`,
  `prescription_medicines`, `medicines`, `diagnostic_orders`.)
- **No `doctor_requests` table** — that card is mock-only.

## 17. Cortex — `src/` (shared app; summarized, not Front Desk's concern)

Not expanded on purpose — mature and stable. Landmarks only:
`src/App.tsx` (Cortex consult page), `src/main.tsx` (routing + shared Toaster +
legacy CSS imports), `src/components/*` (consult panels: Findings, Medicines,
Prescription, Preview, etc.), `src/features/*` (patients, prescriptions,
settings, sidebar, …), `src/styles/*.css` (the **unlayered legacy CSS** behind
the §13 layer trap). Touch these only if a change is explicitly cross-workspace.

---

# PART F — STATE & OPEN ITEMS

## 18. Verified working (through s36)

Live headless-Chrome runs against the real dev server + real Supabase:
launcher search → create visit → row appears with token + persisted symptoms →
optimistic status changes → Visit Detail with semantic status buttons →
the s36 catalog symptom picker (focus opens 51 chips, "feber"→fever ranked top,
Enter picks, Escape closes catalog-then-modal). Hinglish toast interpolation
verified. `tsc -b` shows zero *new* errors.

## 19. Open items / not yet built (carried through s36)

1. **Cortex "Next Patient" button** — the top functional gap. Needs a Cortex-side
   control that reads `clinic_mode`, calls `markVisitServing`, to close the
   Register→Waiting→Serving→Complete loop end-to-end. Not built.
2. **No auth** on Front Desk yet (architecture expects one shared session /
   role-based rendering).
3. **`clinic_mode` unread** — Solo Mode branching not wired.
4. **`npm run build` blocked** by ~46 pre-existing legacy `tsc` errors.
5. **Devanagari (`hi`)** ships as empty stubs (falls back to English); disabled
   in the dropdown (`soon`).
6. **Shared Toaster** exception (bottom-right, Cortex-shared) — revisit only if
   Front Desk gets its own instance; direction wants a bottom-center ink pill.
7. **Native doctor `<select>`** in both modals is the most visible non-premium
   element; a rich picker needs Anmol's sign-off.
8. **Re-layering the legacy CSS** (the real fix for §13) is deliberately deferred
   — only worth it if a Cortex restyle / dark mode ever happens.
9. Design-direction doc still describes the pre-s36 modal treatment; if it's ever
   re-frozen, fold session 36 §2–§5 into it.

## 20. Quick "where do I change X?" index

| I want to change… | Open |
|---|---|
| A visible string / add a language | `i18n/strings.ts` |
| A status color or row tint | `statusStyle.ts` |
| Field look (inputs/selects) or keyframes | `components/FrontDeskStyles.tsx` |
| The header / page layout / language switcher | `FrontDeskPage.tsx` |
| The search-or-create bar | `components/PatientLauncher.tsx` |
| The queue: tabs, sorting, empty routing | `components/QueuePanel.tsx` |
| A queue row's anatomy / kebab menu | `components/VisitRow.tsx` |
| The intake form / symptom picker | `components/CreateVisitModal.tsx` |
| The visit detail / status buttons | `components/VisitDetailModal.tsx` |
| Anything common to all modals / a new modal | `components/ModalShell.tsx` |
| Sidebar cards | `components/SummaryCard.tsx` / `DoctorsCard.tsx` / `DoctorRequestsCard.tsx` |
| Empty-state illustration/copy | `components/EmptyStates.tsx` / `DawnArcs.tsx` |
| Queue refresh cadence / what loads | `hooks/useQueue.ts` |
| Status-change / create logic | `hooks/useVisitActions.ts` |
| A DB query / new table access | `src/lib/db/patients.ts` (or `reference.ts`) |

---

---

# PART G — SESSION 37 ADDENDUM (V3 refinement)

Visual reference frozen as `docs/Frontdesk V3 Refine inspiration.png` — refine
toward it, never away from it.

## 21. The "existing patient silently fails" regression — cause + fix

Root cause (proved with trusted-input CDP runs): the symptom catalog rendered
in-flow and was dismissed on **mousedown**. Clicking Save while the catalog was
open closed it on the press, the modal collapsed ~200px mid-click, the mouseup
landed on the overlay, and ModalShell's `target === currentTarget` check read
it as a backdrop click → modal closed, nothing saved, no error. The
existing-patient modal is short, so its Save button always sat in the collapse
zone. Two-layer fix (both required, keep both):

1. **ModalShell** — backdrop close now requires the *mousedown AND click* to
   both start on the overlay (`pressedOnBackdrop` ref).
2. **SymptomPicker** — catalog dismissal moved from `mousedown` to completed
   outside `click` (deferred one tick so the click that opens the modal can't
   self-close it; detached targets — a just-picked chip — count as inside).
   Layout is therefore stable for the full duration of any press: first click
   on Save both saves and dismisses.

## 22. Intake modal (amends §8 / s36 field details)

- Field order: Name → Age → Gender → Phone → Symptoms → Doctor.
- **Phone**: +91 prefix box (India assumed), digits-only input hard-capped at
  10, live `n/10` counter (green at 10), save validates `/^\d{10}$/`.
- **Age**: required, compact 128px column, digits only clamped 0–120,
  ArrowUp/Down steps, mouse wheel steps while focused (non-passive listener).
- **Gender**: required, segmented radiogroup, one tab stop; keys M/F/O select,
  arrows cycle; dotted underline under each first letter teaches the shortcut.
- **Enter flow**: Enter advances to the next field until every required field
  is complete, then Enter = Save from anywhere. The SymptomPicker consumes
  Enter only while it has a query + match.
- Autofocus: first empty field (existing patients → symptoms, catalog opens).

## 23. Queue rows: waiting time (amends §6 row order)

The 5th column is now created-time (`2:33 pm`) with, on waiting rows only, a
live amber `Waiting «m» min` / `Just arrived` line under it (ticks with the
20s page clock, passed down as `now`). The last-visit date moved out of the
row; it still lives in the Returning badge tooltip.

## 24. Navigation rail (new — replaces "future navigation" open item)

- `components/NavRail.tsx`: slim 68px icon rail → 228px sidebar; the **AREN
  logo in the header** (real `src/assets/aren-logo.png`, replacing the SVG
  house tile) toggles it; state persists in localStorage `aren.frontdesk.nav`.
- Animation: width interpolation + label fade/translateX(-8px), 200ms
  ease-out, icons anchored, `motion-reduce` safe. Content shares a flex row so
  it shifts naturally.
- `NAV_ITEMS` registry: Front Desk (active), Patients / Reports / Settings as
  disabled "Soon" placeholders. Adding a page = one entry + route in
  `main.tsx` + label in `strings.ts`.
- Header is now full-bleed (logo aligned over the rail) and carries the same
  `/aren-nebula.svg` sky as Cortex, at 45% opacity under the dawn radials.

## 25. V3 visual pass (s38 — matches the frozen inspiration image)

- **Stat cards**: tinted icon chip + sentence-case label on one line, big
  Manrope numeral, semantic subline ("Currently waiting" …). No watermark
  circles. Zero rule intact.
- **Queue = table**: "Patients Today" heading (a `div` — raw `h2` is eaten by
  the §13 layer trap), pinned uppercase column headers (Token/Patient/
  Symptoms/Doctor/Time/Status), lavender token chip, patient line carries
  `phone · age · gender`, TIME shows clock + "Today", STATUS is a tinted pill
  that carries the live wait ("Waiting · 18 min"). Rows keep the faint
  amber/blue/green ambient tints + left stripe. The row list scrolls INSIDE
  the panel (`clamp(260px, 100vh-380px, 640px)`) — the page never grows —
  with a "Showing n patient(s)" footer.
- **Launcher**: plain search glyph; Add Patient is a labelled deep-indigo
  gradient button INSIDE the bar.
- **Sidebar**: card titles are sentence-case ink + violet icon; Current Token
  is a lavender brand box (Radio icon chip); metric rows Average Wait /
  Longest Wait / Patients Seen tick with the 20s clock (`now` prop).
- **Nav drawer**: any outside mousedown folds it back (elements marked
  `data-nav-keep` are exempt).
- **Intake modal**: compacted (42px fields, tighter rhythm, violet-tinted
  fills/borders, +91 cell violet) and **duplicate-aware**: typing name/phone
  silently searches patients (350ms debounce); a violet banner offers
  "Create visit for this patient"; save with same phone+name silently reuses
  the existing patient (never mints a twin); same phone under a different
  name blocks with an explanatory error until resolved via the banner.

---

# PART H — SESSION 39 ADDENDUM (Patients page shipped)

## 26. The Patients page (new — `/app/patients`)

Built per `docs/Patients Page Design Brief.md` against the frozen reference
`docs/Frontdesk-Patient-Page (Frozen).png`. Same AREN room, different tempo:
Front Desk answers "what's happening today", Patients answers "tell me about
this patient." No diagnosis/SOAP/prescriptions/findings here — reception-only.

- **Route**: `/app/patients` → `src/features/frontdesk/PatientsPage.tsx`
  (registered in `main.tsx` alongside `/app/frontdesk`).
- **Layout**: left **Patient Browser** (search + Gender/Doctor/Sort filters,
  internally scrolling list, no pagination) / right **Patient Workspace**
  (header card with avatar + New/Returning badge + Edit Details + New Visit,
  a compact 4-cell summary strip, a proportional **Visit Timeline** strip,
  Recent Visits, Quick Actions). Empty state before selection uses the same
  dawn-arcs motif as Front Desk's `MorningWelcome`.
- **Visit Timeline**: dots placed at true chronological distance (not evenly
  spaced) — clusters read as clusters, gaps read as gaps. "+N earlier visits"
  opens a **Timeline modal** (`components/patients/TimelineModal.tsx`, Bhor
  `ModalShell` at `maxWidth={640}`, pure exploration — no editing).
- **Edit Patient Details** (`components/patients/EditPatientModal.tsx`):
  same Bhor field system as intake; blocks saving a phone number that
  already belongs to a different patient (dedupe guard, same spirit as
  CreateVisitModal's).
- **Quick Actions**: Copy Phone Number, Send WhatsApp (`wa.me` deep link),
  View in Print RX (disabled "Soon" — no Print RX page yet). Edit Details /
  New Visit are **not** duplicated here — they live in the header only, per
  the design brief.

### 26.1 Shared-chrome extraction

`FrontDeskPage.tsx`'s header/rail/background were pulled out into
**`components/WorkspaceShell.tsx`** so Front Desk and Patients render
identical chrome by construction. `FrontDeskPage.tsx` and `PatientsPage.tsx`
now only own their own data + content; `WorkspaceShell` owns the ink header,
`LanguageDropdown`, nav-rail open/close state, hospital fetch, and the dawn
background. *Open this to change:* the header, language switcher, or nav
toggle for **either** page.

### 26.2 Shared form fields extraction

`CreateVisitModal.tsx`'s field primitives were pulled into
**`components/fields.tsx`**: `SectionLabel`, `Field`, `AgeInput`,
`GenderControl`, `PhoneInput`. Both `CreateVisitModal` and
`EditPatientModal` import from here now — a form-field change should be made
once, in `fields.tsx`.

### 26.3 Navigation rail update (amends §24's registry)

`NAV_ITEMS` is now: **Front Desk** (active) / **Patients** (`BookUser` icon,
now live, no longer "Soon") / **Print RX** (renamed from "Reports"; `Printer`
icon; still "Soon" — no page built) / **Settings** (still "Soon"). Icon
column padding nudged (`pt-6` vs `pt-4`) per the design brief's "sit slightly
lower" note. i18n key `navReports` was replaced by `navPrintRx`.

### 26.4 New shared primitives

- `ModalShell` gained an optional `maxWidth` prop (default `580`, unchanged
  for existing modals; the Timeline modal uses `640`).
- `FrontDeskStyles.tsx` gained `.fd-field-sm` — a compact 34px filter-select
  class (same unlayered-CSS counterweight family as `.fd-field`) for the
  Patient Browser's Gender/Doctor/Sort filters.
- `utils.ts` gained `formatArchiveDate` — like `formatShortDate` but appends
  the year when a date falls outside the current year (Patients spans years;
  the queue never needs to).

### 26.5 New DB layer — `src/lib/db/patients.ts`

| DB function | Called from | Notes |
|---|---|---|
| `fetchPatientDirectory()` | `usePatientDirectory` | All patients + client-aggregated visit_count/first/last visit/primary doctor. Two queries (patients, visits), aggregated in memory — same pattern as `fetchTodayVisits`. Does **not** filter by `hospital_id` (many rows have it null; matches `searchPatients`'s existing behavior). |
| `fetchPatientHistory(patientId)` | `usePatientHistory` | Every visit for one patient, any status — date/status/doctor/token only, no clinical payload (kept separate from the clinical `fetchPatientVisits`). |
| `updatePatient(patientId, fields)` | `EditPatientModal` | Demographics only (name/age/gender/phone) — reception may correct these, never anything clinical. |

Confirmed via live Supabase schema probe: `patients` has `created_at`,
`abha_id`, `phone_normalized` columns; **no address column exists** (the
design brief's "Update address" workflow has no backing field yet — not
built, flagged here rather than silently dropped).

### 26.6 Verified working (s39)

Live headless-Chrome + trusted-CDP runs against the real dev server + real
Supabase: directory loads and renders (16 real patients), search narrows the
list, selecting a patient populates the full workspace (summary/timeline/
recent visits/quick actions), the Timeline modal opens with proportional
dot spacing, Edit Details opens and shows the correct pre-filled values, New
Visit reuses `useVisitActions.createNewVisit` unchanged. Front Desk
re-screenshotted after the `WorkspaceShell` extraction — pixel-identical,
zero regressions. `npx tsc -b` filtered to `frontdesk|lib/db|main.tsx`:
zero new errors (same 47 pre-existing legacy errors as before).

### 26.7 Open items added by this page

1. **Print RX page** — nav entry exists, disabled "Soon"; no route, no
   component yet.
2. **Address field** — design brief expects "Update address" but `patients`
   has no address column; Edit Details only covers name/age/gender/phone.
3. **Doctor filter in the Patient Browser** filters on `primary_doctor_id`
   (most-visited doctor), not "ever seen by" — a patient seen once by a
   second doctor won't surface under that doctor's filter. Acceptable for
   v1 (matches "Primary Doctor" elsewhere on the page) but worth a second
   look if reception reports it as confusing.

---

---

# PART I — CLINIC STATUS + OPERATIONAL LAYER + AUTH PERSISTENCE (2026-07-20 → 07-21)

The product design brief for this work is `docs/clinic-status-page-overview.md`
(Error Morphology philosophy, the three-screen model, illustration direction).
The database hand-off is `docs/Supabase Wiring TODO.md`. This part records what
shipped and the doctrine behind it.

## 27. Clinic Status — the operational assistant

The nav slot formerly called **Settings** is now officially **Clinic Status**
(`/app/clinicstatus` → `ClinicStatusPage.tsx`). It is **not** a dashboard and
**not** infrastructure monitoring — it is an operational assistant that answers
one question in 2–3 seconds: *"Can I keep working?"*

**Error Morphology (mandatory).** Every technical failure is translated into
operational meaning — headline, impact, recovery — *before* it reaches the
receptionist. The single translator is `clinicStatus/model.ts`
(`buildClinicStatus({demo, online})`), the one place service health becomes a
page model. Nothing user-facing ever shows a stack trace, a spooler error, or a
timeout code.

**Progressive disclosure — three layers, receptionist rarely leaves L1:**

- **L1 Summary** (`ClinicStatusSummary`): status hero (headline + state
  illustration + recommended action + last-checked), "today's operations", an
  "at a glance" context column, and the door down to L2. The buried **Session**
  card (logout) lives here.
- **L2 Detailed** (`ClinicStatusDetailed`): information architecture over table —
  **Core Operations** (a softly-lit panel of elevated cards with status spines +
  an "n/n operational" pill) read as heavier than **Supporting Services** (a flat,
  quiet list). Plus summary tiles, a "needs attention" panel, and the event-log
  timeline (§28).
- **L3 Service detail** (`ServiceDetailModal`, on ModalShell): one service —
  "why this matters" (`roleKey`) → impact → recovery steps → automatic-recovery
  progress → advanced diagnostics (folded away) → support. Recovery always before
  support.

**Reusable illustration language** (`StatusIllustration.tsx`): an integrity core
(shield motif) stitched by dawn-thread pathways to service nodes, with travelling
light along the connections (synchronisation). State-adaptive — healthy (threaded)
→ warning (an amber dashed disconnect) → critical (a fractured pathway + spark).
No stock art, no cartoons, no concentric-circle wallpaper. This is AREN's SVG
vocabulary for operational state; reuse it, don't reinvent per-screen.

**Logout moved here + always confirms.** Logout left the NavRail; it is now buried
in the L1 Session card and always passes through `LogoutConfirmModal` before
ending the session. The NavRail identity chip links here.

**Demo vs real:** `?demo=warning|critical` simulates only the printer (no live
probe). Internet health is **real** (§28).

## 28. The reception operational layer (`src/features/frontdesk/operational/`)

The real-behavior subsystem behind Clinic Status. Design rule: **react to actual
application state, not URL parameters, wherever a real signal exists.**

- **`useOnline.ts`** — `navigator.onLine` + online/offline events. The one true
  connectivity signal; drives the model and the banner.
- **`OperationalBanner.tsx`** (mounted in WorkspaceShell, so every reception page):
  proactive operational voice. Offline → a slim amber Error-Morphology band;
  reconnect → a transient green note; auto-clears. Copy is plain-language impact,
  never implementation.
- **`referenceCache.ts`** — doctors + symptoms cached in localStorage,
  **cache-first + always-fresh**: serve the last copy instantly (works offline),
  re-fetch on every online mount and on reconnect. Doctors additionally refresh
  every 45s so **presence** stays live. Wired into `CreateVisitModal` (symptoms)
  and `FrontDeskPage`/`PatientsPage` (doctors) — the intake dropdowns never empty
  during an outage. (Full offline *saving* of new patients is deliberately a
  future project — the form is usable offline but save needs the connection back.)
- **`eventLog.ts`** — a local operational history (localStorage ring buffer, **not
  the DB** — a clinic has no use for a server-side audit of connectivity blips).
  `logEvent`/`useEventLog`/`useConnectivityLog` record session-start / offline /
  online; the L2 timeline reads this (the old placeholder events were removed).
- **Doctor presence = heartbeat.** Cortex writes `doctors.last_seen` every ~30s
  via `src/hooks/useDoctorHeartbeat.ts` (mounted in `App.tsx`, cleans up on
  unmount/logout); reception derives **Online (<3m) / Away ("Seen X min", <15m) /
  Offline** in `DoctorsCard` (a doctor actively serving = "busy" always wins). No
  more dishonest always-online. DB writer: `updateDoctorLastSeen`.
- **Doctor Requests are real** — the simulator/mock is deleted. `useDoctorRequests`
  reads the `doctor_requests` table with a **Realtime** subscription
  (`subscribeDoctorRequests`, filtered by `hospital_id`) plus a 25s poll safety
  net; chime on genuine arrivals; acknowledge writes back. Auto-disables cleanly
  if the table is ever absent (`isMissingRelation`).

## 29. Auth persistence — losing Wi-Fi must never log you out

Root cause of the old bug: `AuthProvider` treated a *network* failure to
re-verify identity the same as a *rejection*, so an offline refresh ejected the
receptionist to /login. Fix (see also the atlas §8): identity failures are now
split by **kind**. A last-known-good identity is cached in localStorage
(`aren.identity.v1`); a `unreachable` result with a valid session + cache admits
an **offline-authed** state (`{status:"authed", offline:true}`) instead of
logging out; a definitive rejection (inactive user/hospital) still fails closed
and clears the cache. Reconnect (`window` "online" / `TOKEN_REFRESHED`)
re-verifies automatically. The Supabase session itself already survives offline
(`persistSession`, made explicit).

## 30. Modal refinement (ModalShell, applies to every reception modal)

`ModalShell` was refined once so the whole family benefits: a warm dawn backdrop
glow, deeper (8px) blur, crisper elevation with a pink-tinted shadow, and a gentle
lift-in entrance (`aren-modal-in` / `aren-overlay-in` keyframes in
`FrontDeskStyles`). Still ≤ 580 by default, comfortable on 13–15" laptops. Warm/
pink accents were introduced subtly to soften the purple. **All new modals still
use ModalShell** — never hand-roll chrome.

## 31. Quick fine-tunes (2026-07-21)

- The hardcoded **"RS"** placeholder (an old demo user) is gone: header + NavRail
  now show the **real signed-in person's** name + initials from `useAuth`
  identity (neutral person icon when no name). Clinic name on the ink band was
  enlarged.
- **Intake field order**: phone now sits **directly under name** so an existing
  patient surfaces from the silent dedupe before age/gender are asked.
- Clinic Status white-space was rebalanced (the healthy L2 right rail carries the
  integrity illustration rather than empty space).

## 32. Open items updated by this part

1. **Offline write-queue** (create patients/visits offline, sync on reconnect) —
   scoped as a separate future project (`Supabase Wiring TODO.md` §4). Today only
   the intake *form* is offline-usable.
2. **`clinic_mode`/Solo Mode** and the Cortex **"Next Patient"** button remain
   unbuilt (carried from §19).
3. **Reference-cache invalidation** by `updated_at`/version was **intentionally
   skipped** — symptoms/doctors change monthly, refresh-on-online suffices.
4. Session-identity sweep (pages still use hardcoded `HOSPITAL_ID`/`DOCTOR_ID`).

---

*This document supersedes the styling guidance in sessions 33–34 and the modal
guidance in the design direction §10.2. Architecture and creative direction are
frozen. When in doubt, the tie-breaker order is: this doc (incl. Part I) →
Part H → Part G → session 36 → session 35 → design direction → brief →
architecture.*
