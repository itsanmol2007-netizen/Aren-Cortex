# AREN FRONT DESK — SINGLE SOURCE OF TRUTH (through Part K · 2026-08-23)

Last consolidated: 2026-08-23 · Branch: `master` · Routes: `/app/frontdesk`,
`/app/patients`, `/app/printrx`, `/app/clinicstatus` (+ `/login`)

> Reading order: Parts A–D are the frozen product/architecture/rules —
> authoritative, execute don't re-litigate. Part E is the file tree/DB call
> map (reference, keep current). Part F is state/open items. Part G folds
> everything that shipped between sessions 37–2026-08-06 (Patients page,
> Clinic Status + operational layer, auth persistence, the identity/tenancy
> fix) into compact facts — the old per-session narrative write-ups were
> cache, not truth, and were collapsed here on 2026-08-23. **Part K (today)
> is newest and wins on anything about Front Desk's resting/empty-state
> visuals.** For pure file-level "what is this code", pair this with
> `docs/aren-technical-atlas.md`.

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
     ├─ useQueue(hospitalId)          → fetchTodayVisits every 25s (silent), owns visits[]
     │     hospitalId = useHospitalId(), read off the signed-in auth identity —
     │     NOT the HOSPITAL_ID constant this diagram showed before 2026-08-06.
     │     See Part J.
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
| Empty-state illustration/copy | `components/EmptyStates.tsx` (`MorningMark`, inline SVG — `DawnArcs.tsx` no longer exists) |
| Queue refresh cadence / what loads | `hooks/useQueue.ts` |
| Status-change / create logic | `hooks/useVisitActions.ts` |
| A DB query / new table access | `src/lib/db/patients.ts` (or `reference.ts`) |

---

---

# PART G — CONSOLIDATED HISTORY (sessions 37 → 2026-08-06)

Everything that shipped across sessions 37, 39, the Clinic Status build, and
the 2026-08-06 identity fix, folded from separate narrative addenda into flat
facts on 2026-08-23 (the investigation prose is gone; what's still true isn't).

**Modal-save regression (s37), fixed and still in the code:** `ModalShell`'s
backdrop-close requires mousedown *and* click to both land on the overlay
(`pressedOnBackdrop` ref); `SymptomPicker`'s catalog dismisses on outside
`click`, not `mousedown`. Don't revert either half.

**Intake modal:** field order Name → Age → Gender → Phone → Symptoms →
Doctor; `+91` phone hard-capped at 10 digits; Age clamped 0–120 (arrows/wheel
step); Gender is a keyboard-first segmented radiogroup (M/F/O); Enter
advances field to field then saves. Smart dedupe: typing name/phone silently
searches patients (350ms debounce), a violet banner offers "create visit for
this patient", same phone+different name blocks until resolved.

**Navigation rail** (`components/NavRail.tsx`): collapsible icon rail ↔
sidebar, toggled by the header logo, state in localStorage
`aren.frontdesk.nav`. `NAV_ITEMS` registry: Front Desk, Patients (`BookUser`),
Print RX (`Printer`, still no page), Clinic Status (`HeartPulse`) — adding a
page is one registry entry + a route + a label.

**Patients page** (`/app/patients` → `PatientsPage.tsx`): left Patient
Browser (search + Gender/Doctor/Sort filters) / right Patient Workspace
(header card, summary strip, proportional Visit Timeline, Recent Visits,
Quick Actions — Copy Phone, WhatsApp deep link, Print RX disabled-soon).
Timeline overflow opens `components/patients/TimelineModal.tsx`; edits go
through `components/patients/EditPatientModal.tsx` (phone-dedupe guarded,
same as intake). New DB layer `src/lib/db/patients.ts`:
`fetchPatientDirectory()`, `fetchPatientHistory(patientId)`,
`updatePatient(patientId, fields)` — demographics only, never clinical.
`patients` has no address column; "Update address" in the original design
brief has no backing field.

**Shared-chrome extraction:** the ink header, nav rail, language dropdown,
and dawn background live in `components/WorkspaceShell.tsx` — both Front
Desk and Patients render it, so header/rail changes are made once. Shared
form fields (`SectionLabel`, `Field`, `AgeInput`, `GenderControl`,
`PhoneInput`) live in `components/fields.tsx`, used by both
`CreateVisitModal` and `EditPatientModal`. `ModalShell` takes an optional
`maxWidth` (default 580). `.fd-field-sm` (34px filter select) lives in
`FrontDeskStyles.tsx`.

**Clinic Status** (`/app/clinicstatus` → `ClinicStatusPage.tsx`, brief:
`docs/clinic-status-page-overview.md`): an operational assistant, not a
dashboard — answers "can I keep working?" in three progressive layers (L1
summary hero, L2 Core Operations vs Supporting Services + event log, L3 one
service's impact→recovery→diagnostics). Every technical failure is
translated to plain operational language by the single translator
`clinicStatus/model.ts` (`buildClinicStatus`) before it reaches reception.
Logout lives here now (buried in the L1 Session card, always confirms via
`LogoutConfirmModal`) — it left the NavRail.

**Reception operational layer** (`src/features/frontdesk/operational/`):
`useOnline.ts` is the one real connectivity signal, surfaced by
`OperationalBanner.tsx` (mounted in `WorkspaceShell`, every reception page).
`referenceCache.ts` caches doctors + symptoms in localStorage (cache-first,
refetch on reconnect, doctors also every 45s for live presence) so intake
dropdowns never go empty offline. `eventLog.ts` is a local-only (not DB)
connectivity ring buffer feeding the L2 timeline. Doctor presence is a real
heartbeat (`doctors.last_seen`, written every ~30s by
`src/hooks/useDoctorHeartbeat.ts`, read as Online/Away/Offline by
`DoctorsCard` — "busy" from an active visit always wins). Doctor Requests
are real: `useDoctorRequests` reads the `doctor_requests` table via Realtime
+ 25s poll fallback, auto-disables if the table is absent.

**Auth persistence:** losing Wi-Fi no longer logs reception out. Identity
failures split by kind — a network-unreachable check with a valid cached
session (`aren.identity.v1`) admits `{status:"authed", offline:true}`; only
a definitive rejection (inactive user/hospital) fails closed. Reconnect
re-verifies automatically.

**Identity/tenancy fix (2026-08-06):** every reception page used to read the
hardcoded `HOSPITAL_ID` constant instead of the signed-in clinic — harmless
under RLS (queries just came back empty for 11 of 12 clinics) but broke the
product for everyone except the one seed clinic. Fixed via
`features/frontdesk/hooks/useHospitalId.ts`, a read off the already-verified
auth identity, no fallback to the constant (an absent tenancy id shows an
empty state; a guessed one would show the wrong clinic's data). A related
bug in the same path — the intake doctor `<select>` had no placeholder, so
an unlisted `defaultDoctorId` rendered as the first option while still
submitting that unlisted id — is fixed by reconciling `doctorId` state
against the live `doctors` prop.

**Open items still standing** (superseded items dropped): Print RX page
(nav entry exists, disabled, no route/component); Patients page has no
address field to edit (`patients` table has none); Patient Browser's doctor
filter is "most-visited doctor", not "ever seen by"; offline write-queue for
create-while-offline is a separate future project; `clinic_mode`/Solo Mode
and Cortex's "Next Patient" button remain unbuilt; Devanagari (`hi`) still
ships as empty English-fallback stubs; native doctor `<select>` in both
modals is still the least-premium visible element.

---

# PART K — SESSION 2026-08-23 (resting-state visual polish)

Scope: Front Desk's **resting/empty state** was flat and the whole workspace
read oversized on a 13–14" laptop. Visual-only — no architecture, DB, or
workflow changes; every file below is a Front Desk component.

- **`EmptyStates.tsx`** — `MorningWelcome` (all-tabs, zero-visits-today) got
  a small hand-drawn `MorningMark` inline SVG (orbit ring in the dawn thread
  + a planet with a medical cross + telescope + sparkle stars,
  near-monochrome violet) replacing the old bare-typographic treatment, a
  real greeting (`"{greeting}, {name}"` off `useAuth`, **no emoji anywhere
  in this feature**), and an `onAddPatient` CTA button that opens
  `CreateVisitModal` — wired through `QueuePanel` → `FrontDeskPage`.
  `TabEmpty` (a filter empty mid-day) keeps its quiet one-icon-one-line
  doctrine but the icon now sits in a small neutral gray circle instead of
  floating bare.
- **`StatStrip.tsx`** — icon chips are flat single-tone tint + one soft
  tone-colored shadow (a multi-layer gradient/inset version was tried and
  read as busy at 30px — reverted to flat). Waiting = `Clock`, Completed =
  `BadgeCheck` (was `CheckCircle2`).
- **`PatientLauncher.tsx`** — the ambient violet glow around the search bar
  was invisible because the bar had `overflow-hidden` on the same element
  as its `box-shadow` (overflow clips the box's own shadow). Fixed by
  moving the dawn-wash gradient into its own inner `overflow-hidden` layer
  so the outer bar can carry its shadow/glow uncut. **Do not put
  `overflow-hidden` and an ambient `box-shadow` on the same element in this
  feature again** — nest the clipped content instead.
- **`QueuePanel.tsx`** — the empty/loading/skeleton branches now render
  *inside* the same `overflow-y-auto` scroll wrapper as the row list (they
  used to sit outside it, under the panel's own `overflow-hidden`, so on a
  short viewport the morning illustration + CTA could be clipped with no
  way to scroll to the rest). `ColumnHeaders`/`VisitRow`/`SkeletonRows`
  grid templates were resized together — keep those three in sync (§14.1
  already says "mirrors VisitRow exactly"; the same now applies to
  `SkeletonRows`).
- **Density pass** — Header, `NavRail` (68px→58px rail, 228px→200px
  drawer), `PatientLauncher`, `StatStrip`, `QueuePanel` chrome,
  `SummaryCard`, `DoctorsCard`, `DoctorRequestsCard`, and the page's outer
  padding/grid gap were all shrunk roughly one density step (for a 13–14"
  laptop, without the receptionist manually zooming Chrome to 80%). **A
  `document.documentElement.style.zoom` hack was tried first and
  reverted** — `vh`/`dvh` (used throughout this feature's scroll-height
  clamps and `WorkspaceShell`'s `h-dvh`) don't rescale consistently under a
  zoomed root, producing cropped cards and dead space. Real Tailwind value
  reductions are the only sound way to resize this feature; don't reach
  for `zoom` here again. `VisitRow`'s `min-h-[44px]` touch target (rule
  §C.6) was deliberately left untouched.

Not touched: `CreateVisitModal.tsx`, `VisitDetailModal.tsx`,
`ModalShell.tsx`, `clinicstatus/`, `patients/` — none are part of the
resting Front Desk dashboard this session scoped to.

---

# PART L — SESSION 2026-08-29 (visit-gateway QR pipeline + AWS S3 migration)

Scope: the patient-phone document-upload QR handoff, end to end on this
app's side (token+QR generation/management, live status back to staff) —
never the upload interface itself, which is the separate arenode.com
landing-page codebase. Plus, as an explicit prerequisite the same session
asked for: migrating this app's existing attachment storage from Backblaze
B2 to real AWS S3, since the new gateway feature and the existing
attachment pipeline now share one bucket.

## Storage migration: Backblaze B2 → AWS S3

The attachment edge functions (`supabase/functions/attachment-{upload-url,
view-url,delete,configure-cors}`) were already provider-neutral by design
(generic `ATTACHMENTS_S3_*` secret names, plain AWS SDK v3 calls — see the
functions' own README) — migrating was a secrets-and-two-lines change, not
a rewrite:
- Read `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`/`AWS_REGION`/
  `AWS_BUCKET_NAME` (the AWS SDK's own standard names) instead of
  `ATTACHMENTS_S3_*`.
- `region` is the bucket's real region (`ap-south-1`), never `'auto'` (a
  Cloudflare R2/Backblaze-S3-compat convenience real AWS rejects — signing
  fails with an opaque error, not an auth error).
- No `endpoint` override — AWS derives its own host from `region`; B2/R2
  needed one because they're other companies' servers speaking S3.
- Every `Deno.env.get('AWS_*')!` call is `.trim()`ed — **the real
  `AWS_REGION` secret in this project carries a leading tab character**
  (a copy-paste artifact), which fails AWS hostname validation with an
  error that gives zero indication the problem is whitespace. Found live,
  fixed defensively rather than by editing the secret (no tool access to
  secret values here).
- `visit_attachments.storage_provider` now records `aws_s3` for new
  uploads. **14 pre-migration rows still say `b2`** — untouched, per
  explicit instruction not to migrate historical files silently.
- All four functions redeployed (see git history / Supabase function
  versions). Old `ATTACHMENTS_S3_*` secrets are no longer read by any
  function — safe to delete, not done here (no secret-management tool
  access).

**Not completed — real external blocker, needs the AWS account owner**:
`attachment-configure-cors` (needed once per bucket — a fresh bucket ships
with no CORS rule, so the browser's preflight blocks every PUT/GET even
with a valid presigned URL) fails with `User:
arn:aws:iam::941399479350:user/arenode-storage-service is not authorized
to perform: s3:PutBucketCORS`. Confirmed live: an actual file upload
through `VisitAttachmentsModal` hangs indefinitely at "Uploading…" (the
browser silently blocks the PUT at its own CORS preflight) — the same
failure class the original B2 bucket had on 2026-08-11, now against the
new bucket. **Needs**: add `s3:PutBucketCORS` + `s3:GetBucketCORS` to the
`arenode-storage-service` IAM user's policy (bucket
`arenode-patient-orbit-uploads`), then re-invoke
`attachment-configure-cors` once. Until that happens, **no attachment
upload works in this app at all** — not just the new gateway feature, the
pre-existing "upload from this computer" path too, since both go through
the same bucket now. Worth also confirming that IAM user's object-level
permissions (`s3:PutObject`/`GetObject`/`DeleteObject`) once CORS is fixed
and a real upload can actually reach AWS to test against.

## The visit-gateway feature

New table `visit_gateways` (migration `add_visit_gateways`) — one row per
VISIT for its whole lifecycle (`visit_id` is UNIQUE; expiring or
cancelling never inserts a second row, it reactivates the same one).
Columns roughly as specced: `token` (256-bit, `crypto.getRandomValues`,
base64url, generated client-side — never derived from patient/visit id),
`status` (`active`/`expired`/`discarded`), `expires_at`, `extension_count`
(capped at 2 in the app layer, not a DB constraint — see below),
`documents_uploaded_count`, `patient_marked_done`, `revoked`. Denormalized
`hospital_id` (not in the original sketch, added deliberately — every
other reception-scoped table here, `doctor_requests`/`doctors`, is scoped
this same direct-column way, and the clinic-wide badge needs to filter/
subscribe on it without a join). RLS: `hospital_isolation_{select,insert,
update}` scoped to `current_user_hospital_id()`, same shape as
`doctor_requests` — no delete policy, "discarded" is the soft-delete
state. Added to the `supabase_realtime` publication (same as
`doctor_requests`; `doctors.last_seen` presence is polling-only, not
actually realtime, despite reading like a precedent for it).

**"Expired" is a computed fact, not a column a cron flips.** Nothing here
runs a scheduled job. `isEffectivelyExpired(g)` (`lib/db/gateways.ts`) is
`status==='active' && expires_at <= now()` — every reader (the badge list,
the open QR modal) treats that as expired regardless of what `status`
literally says, the same way a JWT is dead the instant its `exp` passes,
not when something gets around to revoking it. The badge/list refetches on
Realtime + a 30s poll (mirroring `doctor_requests`'s pattern exactly) so a
session that just quietly timed out with nothing else happening still
drops off the list within 30s, "silently, no toast" per the brief. An open
QR modal additionally re-checks its OWN session's expiry every 5s
(`useIsExpired` in `GatewayQrModal.tsx`) for snappier feedback on the one
session someone is actually looking at.

**`ensureActiveGatewaySession` does NOT auto-resume.** First implementation
did (silently reactivating an expired/discarded row and returning a live
one) — caught live in testing: the brief's flow is explicitly two steps
("show 'This QR session expired. Resume?' ... on click, flip status back
to active"), so an expired/discarded row is now returned to the UI AS-IS,
and only the explicit "Resume"/"Start a new session" button (wired to
`resumeGatewaySession`) ever reactivates it. Get this backwards again and
the resume prompt silently never shows.

**Extension cap (2), verified live**: each resume increments
`extension_count`; `canResume(g)` is `extensionCount < 2`. Past the cap,
the modal offers "Start a new session" instead of "Resume" — same
underlying reactivation, but resets `extension_count` back to 0 (a
deliberate product decision made here, not in the brief: the alternative
of a hard dead-end past 2 resumes had no described fallback, and
"one row per visit forever" rules out ever inserting a fresh one).
`resumeGatewaySession` deliberately does NOT reset `documents_uploaded_count`
(real files already there under a now-dead token shouldn't have their count
zeroed) but DOES reset `patient_marked_done` to false (resuming means "more
to upload").

### Entry points

1. **Queue row → kebab menu → Attachments** (`VisitAttachmentsModal.tsx`) —
   the fully-turnkey entry point: a visit already exists, so "Upload from
   phone" calls `openForVisit` directly. Shows "An upload link is already
   active for this visit" beneath the button when
   `sessionForVisit(visit.visit_id)` finds one — the live proof the two
   entry points share state, not two competing sessions.
2. **Create/Edit Patient modal** (`CreateVisitModal.tsx` →
   `IntakeAttachmentsField.tsx`) — genuinely harder: `IntakeAttachmentsField`
   only ever runs pre-Save, no `visit_id` exists yet. Decided live with
   Anmol (asked rather than guessed): clicking "Upload from phone" runs the
   IDENTICAL validation/dedupe `handleSave` does, then calls
   `gateway.beginCreatingVisit(patientLabel)` (shows the QR modal
   immediately in a loading state — spinner + a rotating word picked from
   `useCachedIntakeChips()`, the SAME cached symptom catalogue already in
   memory, per "use hardcoded medical-friendly words during loading" — see
   `gateway/loadingWords.ts`) and passes an `onSuccess` callback through
   `onCreate` (widened `useVisitActions.createNewVisit`'s existing
   `onSuccess` hook — previously `{patientName, visitId}`, now also
   `patientId`, needed for `ensureActiveGatewaySession`) that calls
   `gateway.openForVisit(...)` with the real visit id the instant
   `createNewVisit`'s background attempt lands. The intake modal itself
   closes immediately, same as a normal Save.

### Where the state actually lives

`GatewaySessionsProvider` (`components/gateway/`) is mounted ONCE by
`WorkspaceShell` — every reception page (`FrontDeskPage`, `PatientsPage`,
…) renders its own `WorkspaceShell`, so the provider remounts per page
navigation, but that's fine: the active-sessions LIST is a straight
Supabase read (refetched on mount), and "minimized" just means nothing is
rendered — there's no client state to lose, reopening from the badge
re-reads the DB-backed truth regardless of which page you're on. The
actual `GatewayQrModal` renders once at the `WorkspaceShell` level, a
sibling of `{children}` — NOT inside `CreateVisitModal`/
`VisitAttachmentsModal`, which is where the two buttons live — specifically
so minimizing survives whichever modal launched it closing.

`ModalShell` gained a `preventDismiss` prop (default false, every existing
modal unaffected) — disables backdrop-click and Escape entirely, leaving
only the header X wired to `onClose`. First and so-far-only use:
`GatewayQrModal`, per the brief's "closeable only via an explicit X
button — clicking outside the modal does nothing." X calls `minimize()`,
never touches the DB (verified live: `updated_at` unchanged after
minimize/reopen).

Header badge (`GatewaySessionsBadge.tsx`, in `WorkspaceShell`'s `Header`,
next to the language dropdown): violet, not semantic-colored (§7.1 — this
counts sessions clinic-wide, it isn't one patient's status) and NOT
animated. The brief says "pulse", but the one ambient "needs attention"
animation this feature already has (`.aren-pulse`) is hardcoded amber
(the "waiting" status color) — reusing it here would borrow that meaning
for an unrelated structural badge, and the frozen motion doctrine (§9)
caps ambient animation at the two loops that already exist, not a third.
Used a static violet glow instead (same treatment the header logo button
already wears for "important"). Flag this trade-off if a real pulse is
wanted — it would need a new keyframe and a §9 amendment, not something to
add unilaterally.

### Verified live (Ekanki Solo Clinic hospital, temporary reception test
account — created via direct `auth.users`/`public.users` SQL insert with
`crypt()`/pgcrypto since no reception login existed for that hospital and
resetting a real user's password wasn't an option; deleted after)

Full state machine exercised end to end with real screenshots: none→create
(QR renders, encodes `https://arenode.com/portal/gateway/<token>`)→badge
shows 1→reopen from popover (same token)→backdrop click & Escape both
no-op→X minimizes (DB untouched)→kebab-menu entry point shows the
"already active" hint and reopens the SAME session→Cancel this link
(`discarded`+`revoked`, same row)→reopening a discarded row shows "This QR
session expired. Resume?" (not an auto-resumed QR — this is what caught
the auto-resume bug above)→Resume (fresh token, extension_count 1→2)→cap
reached shows "Start a new session" (extension_count resets to 0)→a raw
SQL write to `documents_uploaded_count`/`patient_marked_done` while the
modal sat open propagated live via Realtime with no reload, and
`patient_marked_done` correctly reset to false on the resume that
happened to land around the same time (confirms the "resume resets
done, keeps count" rule live, not just in code). `tsc -b`/`npm run build`
clean throughout. Real file upload could NOT be verified end-to-end — see
the AWS IAM blocker above.

**One live discovery worth flagging**: while cleaning up test data, a
SECOND `visit_gateways` row was found for a different `hospital_id`, with
a token in a different format (plain lowercase hex, not this app's
base64url) — almost certainly the arenode.com team already exercising the
shared table independently and concurrently. Left untouched (not this
session's data to delete) — a good sign the two sides are already
converging on the same schema in practice, worth a direct conversation
with that team to confirm the column shapes actually match before either
side relies on it further.

### Files touched

New: `src/lib/db/gateways.ts`; `src/features/frontdesk/components/gateway/`
(`GatewaySessionsProvider.tsx`, `GatewayQrModal.tsx`,
`GatewaySessionsBadge.tsx`, `UploadFromPhoneButton.tsx`,
`loadingWords.ts`). Changed: `ModalShell.tsx` (`preventDismiss`),
`WorkspaceShell.tsx` (provider + badge + modal mount), `CreateVisitModal.tsx`
+ `IntakeAttachmentsField.tsx` (entry point 1), `VisitAttachmentsModal.tsx`
(entry point 2), `useVisitActions.ts` (`onSuccess` gained `patientId`),
`i18n/strings.ts` (`en`+`hinglish` — ~28 new `gw*`/`uploadFrom*` keys),
`lib/db/attachments.ts` + all four `supabase/functions/attachment-*`
(the S3 migration).

---

*This document supersedes the styling guidance in sessions 33–34 and the
modal guidance in the design direction §10.2. Architecture and creative
direction are frozen. Tie-breaker order when in doubt: **Part L** (today's
gateway feature + storage migration) → **Part K** (resting-state visuals)
→ **Part G** (identity/tenancy + everything it folds in) → this doc →
session 36 → session 35 → design direction → brief → architecture.*
