# Session handoff — 2026-08-25 (Cortex open-bugs arc, STOPPED — read this first)

**Temporary, self-replacing.** Rewrite or delete when the next session ends.

## Latest — Design DNA doc split into pocket files (2026-08-25)

`docs/cortex-design-dna/README.md` was a single 322-line file (added the
same day as the arc below, then left unfinished — its own README existed
but the topic split it implied never happened). It's now split the same
way `docs/context/` is: `README.md` is a short router (§0's pre-flight
checklist, one row per topic) and each topic is its own file —
`layout-composition.md`, `panel-structure.md`, `typography.md`,
`colour.md`, `icons.md`, `motion.md`, `progressive-disclosure.md`,
`responsive-grid.md`, `empty-states.md`, `verification.md`. No rule content
changed, only where it lives. `docs/README-Cortex.md`'s pointer to
`cortex-design-dna/README.md` (added the same day) still resolves
correctly — it now lands on the router instead of the monolith.

## ⚠ Read this before touching ConditionsCard.tsx / SuggestionsCard.tsx again

Three passes today went at the Assessment/Investigations symmetry problem
and the capped-list "show more" mechanism **blind — no screenshots, no
running app, CSS and JSX edited from reasoning about selectors alone.**
Each pass believed it fixed the last one's regression. Anmol's own words
after the third: **"you're breaking everything, just at every single
point... you followed the cheap path by matching a CSS element when the
underlying thing behind it was not same, and now they are clashing even
harder."** That is the accurate diagnosis, not "one more CSS tweak will
close it" — take it as the starting assumption, not as something to
re-litigate.

**Reported broken right now, unverified by any screenshot from this
session:**
1. The Investigations "Show more" button is not visible at all (was meant
   to sit below the capped list as a sibling — `.cs-sug-cap-toggle` in
   `SuggestionsCard.tsx`/`consult.css`; something in the grid/flex chain
   around `.cs-cond-side-sug` most likely clips or collapses it, but this
   was never actually looked at rendered).
2. Assessment and Investigations are STILL not symmetric, after two
   separate attempts (matching the header row, then adding a shared
   `.cs-ranked-head`/`.cs-ranked-label`/`.cs-ranked-count` subheader).
   Matching class names/CSS was treated as the fix; the actual DATA SHAPES
   the two panels render from remain different (Assessment: a ranked list
   + a separate confirmed-diagnoses concept; Investigations: one flat
   ranked/capped list with no second concept) — that is very likely why
   visually matching the wrapper markup still "clashes" instead of
   resolving. The symmetry problem may need a real shared component, or a
   deliberate decision that these two panels are allowed to differ in
   places, not another round of copying class names.
3. Empty states: this session shortened their TEXT (fewer sentences) but
   did not touch icon usage, and apparently made things read as MORE
   text-heavy with FEWER icons in practice — Anmol: "less text there,
   only those texts which are really important... you added more text and
   removed all the SVG elements." Worth checking directly: `ConditionsCard`'s
   ranked-list empty state (`"No condition ranks for this chart"`) has
   **never had an icon/art component**, unlike `RecommendationsCard`'s
   (`<BlankMedicineArt/>`) and `SuggestionsCard`'s (`<BlankTestArt/>`) —
   that inconsistency predates this session and was never actually fixed;
   confirm what's really on screen before changing text again.

**Why this happened, plainly:** every fix this session was authored by
reading source and CSS and reasoning about box models — never by running
the app and looking at it. That works for logic; for "does this look
right", it doesn't, and three consecutive blind passes making it worse is
the proof. **Do not repeat that pattern.** Whatever picks this up next
needs an actual render loop: run the dev server, open the consult screen
with a real/seeded chart that has both ranked conditions AND ranked
investigations (so both panels have real content, not just empty
states), screenshot it, make ONE change, screenshot again, compare before
claiming anything is fixed. If no browser/screenshot tool is available in
that session, say so up front rather than doing another blind pass.

**A live suggestion, not an instruction:** given three blind passes have
now made this WORSE each time, it may be faster to `git diff` (or
`git log -p`) `ConditionsCard.tsx`, `SuggestionsCard.tsx` and the
`.cs-ranked-*`/`.cs-cond-side-sug`/`.cs-list`/`.cs-sug-cap-toggle` rules
in `consult.css` across today's three commits on
`claude/aren-cortex-open-bugs-vdirkm`, and consider reverting to
whichever commit actually looked right in a real screenshot (possibly
before this arc's "same template" pass entirely) rather than layering a
fourth patch on top of three unverified ones.

---

**Read order for a cold start:** `docs/README-Cortex.md` first if you
haven't already (2026-08-25: the actual entry point now — one page,
tells you to read this file next) → this file → `docs/context/README.md`
(routes to one scoped pocket) → `docs/aren-cortex-context.md` (2026-08-24:
now a short index — it routes further into `docs/context/cortex-*.md`,
don't read it expecting the full picture in one file any more).

**This pass, 2026-08-25 — layout/motion fixes + one deliberately-punted
item:**

- Assessment/Investigations restructured so both start on the same grid
  row with their own scoped header+search, instead of Assessment's search
  bar spanning full width above Investigations (read as "Investigation is
  a subsection of Assessment"). Both "Show more" controls now live at the
  bottom, same class (`cs-card-foot-more cs-sug-cap-toggle`), instead of
  one top-right and one bottom.
- `SuggestionsCard`'s two main-body instances (not just the Investigations
  side-slot) now pass `capped={5}` — switching Clinical Suggestions' own
  tabs used to change an UNBOUNDED list's height and shove the whole page;
  every instance is bounded now.
- `ConditionsCard`/`SuggestionsCard`'s outer sections gained Motion's
  `layout` prop so a height change (tab switch, show more/less, entering
  search) tweens instead of snapping — "clicking anything is just
  repositioning the whole page."
- `LongitudinalBand` now renders a skeleton (`LongitudinalSkeleton`) while
  `pastVisitsLoading` is true instead of nothing, so a patient WITH history
  no longer pops the whole band in a couple of seconds after paint and
  shoves `.cs-page` down.
- Medicine-name truncation fixed: `.cs-ident-brand` now wraps instead of
  squeezing the name span down to a couple of letters when a row carries
  "Safety" + "Check" + the info button together.
- `.cs-rec.is-hard`'s full-row red wash softened to a left-edge accent —
  the row was carrying five separate red signals at once (wash, rank
  badge, flag pill, reason heading, ack button); nothing is hidden, one
  redundant layer came off.
- `CarePlanSheet` (the "Add a longitudinal plan" modal) and the two
  medicine sheets restyled to `docs/aren-modal-design.md`'s shape with
  more generous padding — message-3 called both "cramped."

**Fourth pass, same day — the third pass's `layout` fix was itself a bug,
and the symmetry fix needed to be a shared class, not shared numbers:**

- Reverted `layout={!reduce}` on `ConditionsCard`'s/`SuggestionsCard`'s
  outer sections. Motion's `layout` animates a whole subtree via a scale
  transform, which does not compose with a child that has its OWN
  `overflow: auto` scroll box — that combination is exactly what was
  reported as "still overflowing when you are clicking show more."
  Removed; the fluid feel now comes only from the list's own local
  `motion.div` height animation (see next point), which is what
  `ConditionsCard` was already doing correctly before the `layout` prop
  was added on top of it.
- `SuggestionsCard`'s capped list rebuilt to be `ConditionsCard`'s ranked-
  list mechanism verbatim: a `motion.div` animating `maxHeight` between
  `capped * ROW_H` and a 4.5-row scroll box, "Show more" as a sibling
  BELOW the box rather than the box's own last row. The old CSS-class
  toggle (`.is-capped-scroll`) is gone.
- New shared classes `.cs-ranked-head` / `.cs-ranked-label` /
  `.cs-ranked-count` (consult.css) replace `ConditionsCard`'s one-off
  Tailwind string for "RANKED CONDITIONS · 4 of 11" and are now also used
  by `SuggestionsCard` for the equivalent "RANKED SUGGESTIONS" row it did
  not have before — Assessment and Investigations were still visually
  uneven below the search box even after the third pass's alignment fix,
  because only one of the two panels had this row at all. Literally the
  same class in both files this time, not matching numbers kept in sync
  by hand.
- Empty-state copy shortened across ConditionsCard, SuggestionsCard,
  RecommendationsCard and CaseSheet's Findings panel — one line each, no
  em dashes, dropped the sentence that only restated what the heading
  already said ("Cortex files each entry in the right place" etc).

**Deliberately NOT done — flagged, not silently skipped:** the request to
make a guard respect an ALREADY-CONFIRMED diagnosis (a malaria-confirmed
patient still sees "confirm with RDT or blood smear before starting an
antimalarial" on the antimalarial guard, which reads as if malaria were
still unconfirmed) needs a real link between `diagnoses` (the doctor's
confirmed Assessment picks, plain strings in `useConsultPlan`) and guard
evaluation in the Synapse engine — confirmed diagnoses are not fed back
into `activeSignals`/the ruleset at all today. That is an engine-level,
clinical-safety-sensitive change and was not attempted as a quick UI
patch; it needs its own scoped pass (probably: a signal a confirmed
diagnosis contributes, and a rule-authoring convention for "downgrade/
suppress this guard once that signal is active").

**Where this arc actually is:** Patients Overview is done and Anmol-confirmed
against Ekanki's live data. **Anmol has now actually opened the app and
checked it — first real checkpoint of this whole arc reached.** His verdict:
"most of the things are great" (Overview, sidebar, Practice — no changes
requested there; explicitly asked that their design/color/layout language be
reused for future pages too), but Patient Record read as "trash" and Compare
Visits as too thin. Root-caused and fixed both this pass — see the
seventh-pass note below and §1.

**Seventh-pass note — Anmol's live feedback, root-caused, not guessed at:**
"The patient report page is actually trash... maybe because we don't have
actually anything there" (his own diagnosis, correct) — traced with SQL to
his OWN test patients ("Anmol" x2, "Test") being exactly the ones with the
most visits stuck `serving` (see the 86-stuck-visits entry, §1/context.md
§7) — `fetchPatientVisits` used to hard-filter to `status="completed"`, so
opening one of THOSE patients showed a full, populated header stat row (from
a different query, `row.visit_count`, that counts every status) sitting
directly above a completely empty timeline/trend section — a real,
unexplained mismatch, not a design problem. Fixed at the data layer (now
fetches every non-discarded status, reusing `visitStatusKind` — rule 19) and
surfaced honestly in the UI: an amber "N visits not yet finished in Consult"
notice instead of silence. **Still didn't touch the stuck-visit rows
themselves — not authorized, not needed to fix the actual complaint.**
Compare Visits enriched: a meta strip (visit type + doctor per side, above
the fold) and a "days apart" line address "saying very less information";
section labels now carry icons matching the rest of the app, and a fixed
visit-type-badge gap (exercise-only visits used to read as generic
"Consultation" — new `visitTypeLabel()` in `visitStatus.ts`, shared, not
duplicated across the timeline and compare). All verified via the standard
fixture-screenshot method before pushing; fixtures deleted after.

Anmol's previous-pass frustration ("wtf do you mean by clean up 86 stuck
visits, you completely forgot what i prompted you earlier", re-pasting his
whole prescription-viewer/compare/WhatsApp/sidebar spec) turned out to be
exactly what this pass suspected: he hadn't yet SEEN that work (commits
`b4a025c`, `8c1c4d5`, both before his message) — once he actually opened the
app this pass, he confirmed it was there and good. Lesson banked: don't
re-explain "it's already built" as text again if this recurs — get him
looking at the running page instead.

**Important correction to earlier passes of this file: Supabase MCP direct
SQL access WORKS in this session** (confirmed live, `mcp__Supabase__
execute_sql` etc.) — it's a separate path from the blocked browser (§3) and
was used this pass to definitively resolve two of the three physio wiring
gaps and unblock the Practice page. Only driving the actual React app in a
browser is blocked; querying the live database directly is not. Don't
re-doc this as "no live access" — check §3 for exactly what is and isn't
blocked before assuming either way.

---

## 0. What this arc is

Rebuild `src/features/patients/` (Overview + Detail) — then, once Anmol saw
it working, more in the same thread: prescription viewer, visit comparison,
WhatsApp placeholder on Detail; a full sidebar redesign (fewer destinations,
matching visual language, then icon depth after he flagged the first pass
as flat/emoji-like); and, this pass, using newly-confirmed live DB access
to actually resolve three documented-but-unverified physio data gaps
instead of leaving them as open questions.

**Governing instruction from Anmol, said more than once:** "don't mold a
doctor into our architecture, mold our architecture into theirs" — when the
UI wants a clinical concept the schema doesn't support yet, do real schema
work + an honest empty/zero state + a documented gap, never a heuristic
standing in for missing data. Extended this pass: when a documented gap
turns out to be checkable with a tool you have, check it — don't leave
"needs live DB access" sitting in the docs once you have live DB access.

## 1. What's DONE and committed (pushed to
`claude/patients-overview-css-testing-j4g1vq`)

Commits: `f24191a`, `638d02c`, `c40c536`, `9f2a6fc`, `1274c62`, `c3fc911`,
`b4a025c`, `8c1c4d5`, `202bfa7`, `ba87454`, plus one more pending push for
this pass (empty/sparse-patient fix + Compare Visits enrichment — see §2).
Check `git status`.

**Patients Overview** — Anmol-confirmed against live data. **No changes
requested — he said reuse this page's design/color/layout for future
pages too.**

**Sidebar, Practice page** — Anmol-confirmed this pass, "most of the things
are great." No further action unless he raises something new.

**Patient Record** — same visual language as Overview, dense sidebar,
prescription viewer (reuses `ReviewModal` mode `"print"`), "Send via
WhatsApp" (`lib/whatsapp.ts`, explicit placeholder per Anmol), Compare
Visits (`CompareVisitsModal.tsx`, reuses `trend.ts`'s field/verdict logic).
Anmol checked this pass and called it "trash" — root-caused (see the
seventh-pass note above) to `fetchPatientVisits` silently excluding any
visit not yet `completed`, which made his own most-tested patients (the
ones with the most stuck-`serving` visits) look empty below a populated
header. Fixed: fetches every non-discarded status now, surfaces the ones
still in progress with an honest notice instead of hiding them. Compare
Visits enriched with a meta strip (visit type + doctor) and a days-apart
line, addressing "saying very less information". **Not yet re-checked by
Anmol post-fix — that's the next real checkpoint for this page.**

**Doctor name investigation** — Anmol reported seeing "Ekanki" (the clinic
name) where the doctor's name should show. Checked live: `doctors.name`,
`users.full_name`, and the `doctors.user_id → users.id` join all correctly
say "Dr Anmol Pandey" for Ekanki Solo Clinic; `App.tsx`'s `DOCTOR` object
(passed to `Sidebar`) reads straight from that chain, nothing hardcoded.
**Could not reproduce "Ekanki" as a doctor name from data or code** — told
Anmol this points at something client-side (stale cached login, a
different/older tab) rather than an app bug, asked him to hard-refresh and
report back exactly where on screen it recurs if it does. **Unresolved —
if he reports it again, don't re-walk this same chain; ask what he actually
sees and where, this session already proved the identity chain itself is
correct.**

**Three physio wiring gaps — all resolved this pass with direct SQL,
correcting earlier same-day entries that were reasoning from browser
screenshots alone:**
- **`care_plans`**: genuinely working. 5 real active plans, 5–7 visits each
  actually linked, oldest from 2026-06-20. The original "never used"
  finding was simply wrong. No further action needed.
- **Visit-count discrepancy (24 vs 6 on Rohan Malhotra)**: test-data noise,
  not a bug. 86 visits stuck in `serving` status, concentrated in only 5
  patients, all created 2026-08-12 through today (Rohan: 18, including 11
  in one day) — reads as manual testing of the physio consult screen, not
  a broken save path (75 OTHER visits completed normally across 17
  patients through the same window). **Not fixed — needs Anmol's go-ahead**
  before any bulk status change on real rows. Full write-up + the exact
  question to ask him is in `docs/context/cortex-open-physio.md`.
- **`fetchPatientVisits` missing physio fields** — RESOLVED this pass (6th).
  `RealVisit` now carries body_sites/exercise_names/impairment_names/
  story_duration/story_mechanism, same tables `buildPatientRecordRows`
  already used. Wired into the Visit Timeline's expanded body and into
  Compare Visits. Verified live: 70/82 completed visits have exercise data,
  5 have body sites, 3 have a story — real signal, was write-only before.

**Practice page — built for real, same day it was documented as blocked.**
The blocker ("no standalone query resolves a pinned intent to a name")
dissolved on inspection: `intents.label` already IS the display name.
`fetchPinnedMedicineDetails()` in `lib/db/synapse.ts`,
`features/practice/PracticePage.tsx`, wired into `App.tsx`. Shows an honest
empty state today (Dr Anmol Pandey has never pinned a medicine — 0 rows in
`doctor_pinned_intent`, verified live, not assumed).

**`tsc -b` passes clean.**

## 2. What's NOT done — pick up here, in order

1. **Push this pass's commit** (Patient Record empty/sparse-patient fix,
   Compare Visits enrichment, `visitTypeLabel()` shared helper, docs
   updated) — check `git status` first.
2. **Get Anmol to re-check Patient Record and Compare Visits specifically**
   — that's the real next checkpoint. Everything else he already confirmed
   this pass (Overview, sidebar, Practice).
3. **Ask Anmol** whether the 86 stuck `serving` visits (5 patients,
   2026-08-12 onward, concentrated in his own "Anmol"/"Test" accounts) are
   safe to clean up — see the full write-up in `docs/context/cortex-open-physio.md`.
   Don't touch the data without his answer. Note: this pass's fix means the
   UI no longer LOOKS broken because of these rows, so this is now purely a
   test-data-hygiene question, not urgent — but still his call, not ours.
4. **If "Ekanki" as a doctor name recurs**, ask Anmol exactly where on
   screen and get a fresh screenshot/description — the identity-resolution
   chain (`doctors`/`users`/`loadIdentity()`/`App.tsx`'s `DOCTOR` object)
   is confirmed correct end-to-end this session, so re-tracing it from
   scratch is very unlikely to find anything new.
5. **Status filter dropdown** (Overview page) — not built, think about
   whether it's meaningful first (`fetchRecentPatients` only ever returns
   completed visits).
6. **Communication and Clinic pages** — genuinely complex (new data
   models), reasonable to leave for a session with Anmol's input on scope.

## 3. What's actually blocked in this session vs. what isn't

**Blocked**: driving the real React app in a browser. Every outbound HTTPS
call from a scripted headless Chromium to `ieimvjprtltancxapuzg.supabase.co`
resets after ~12.5s regardless of proxy/cert config, while
`registry.npmjs.org`/`api.anthropic.com` load instantly from the same
browser. Matches a limitation flagged in
`docs/context/cortex-open-crosscutting.md` from an earlier session. All CSS/layout verification this arc used temporary
local-only static HTML fixtures over the real CSS, screenshotted over
loopback only — proves rendering, not product correctness with real data.

**NOT blocked, confirmed this pass**: direct Supabase queries via the
`mcp__Supabase__*` tools (`execute_sql`, `list_tables`, `get_project`, etc.)
— a completely different path (MCP server infrastructure, not the
sandboxed Chromium's network stack). Used this pass to query `visits`,
`care_plans`, `doctors`, `users`, `intents`, `doctor_pinned_intent` live
and get real answers instead of documenting more open questions. **Use
this** for any future gap that's answerable with a read query — don't
assume "no live access" applies to database work just because it applies
to the browser.

## 4. If resuming in a fresh conversation with no prior context

Paste this to the new session:

> Read `docs/SESSION-HANDOFF.md` in full (it corrects itself on the browser-
> vs-database access distinction — §3 matters), then `docs/aren-cortex-
> context.md` §7 (Physiotherapy + Cross-cutting sections, several dated
> 2026-08-23 entries, some correct earlier same-day ones). Patients Overview
> is Anmol-confirmed; everything else built this session (Patient Record's
> new features, the sidebar, Practice) has not been checked by him yet —
> that's the next step once the pending commit is pushed. `tsc` passes
> clean. Direct Supabase SQL access works this session; driving the app in
> a browser does not — don't conflate the two.

## 5. Environment (unchanged from prior arcs)

- No `supabase/migrations/`; schema changes apply live via Supabase MCP.
  Project `ieimvjprtltancxapuzg` (org `arenod`, `ap-south-1`).
- Dev server `npm run dev` → `http://127.0.0.1:5173`.
- Ekanki Solo Clinic (`hospital_id 64c26e24-3668-49c6-8b99-6ddb8c14883e`) is
  the real physiotherapy test account, doctor **Dr Anmol Pandey**
  (`40aa12a6-54f2-4b49-9100-8a2f8de0254d`) — use this to verify against,
  not synthetic data. Login is phone + password (see
  `docs/Login Screen Implementation.md`); ask Anmol for current credentials.
- `main` and `master` are unrelated histories in the original repo; this
  session's work is on `claude/patients-overview-css-testing-j4g1vq`
  (branched from `master`).
