# Session handoff — 2026-08-21

**Temporary, self-replacing.** Rewrite or delete when the next session ends.

**Read order for a cold start:** this file → `docs/context/README.md` (routes
to one scoped pocket) → `docs/aren-cortex-context.md` only if the task needs
the full picture.

---

## 0. Status: physio rebuild is IMPLEMENTED on `master`, NEVER SEEN RENDERED

Branch `master` @ `a53c97b`. Six commits this arc, all pushed, tree clean:

```
a53c97b Restore the topbar; ask what happened before asking how long
6689b90 Composer, curved body map, and the unit NOT NULL fix
5aee949 Fix the missing styles, the sentence flow, and the topbar clipping
9f88c1f Physio rebuild: one input, one record, one site context
d2117c9 Handoff: record the Story/Goals rewrite and density pass as unverified
86a8a5c Density pass: fit a 14-inch panel at 100% zoom, not 75%
```

**The one fact that governs everything below:** every commit in this arc was
written blind. The agent that made them has no working browser in its
container — Chromium there has no outbound network, and even when a dev
server was reachable, a patient-intake modal blocked getting to the consult
screen without writing throwaway data. So each round was: read code, reason
about layout from CSS/Tailwind source, ship, and wait for Anmol's screenshot
to say what was actually wrong. That loop worked but it was slow and it
produced real misses — twice (see §2) a change shipped broken because nobody,
human or model, had looked at it.

**Anmol is now moving this session to his own machine** specifically so the
next round of work can be developed against a real, visible browser instead
of blind + screenshot + fix. That is the reason this handoff exists mid-arc
rather than at a natural stopping point — the work is not finished, but the
*method* is changing, and that is worth a fresh cold-start.

## 1. What actually shipped, in order

### 86a8a5c — Density pass
`consult.css` tokens (spacing scale, icon sizes, hit target, radii, engine
height) taken down ~20-25% so the CONSULT WORKSPACE fits a 14-inch panel at
100% browser zoom — Anmol had been running the browser at 75-80% zoom to fit
it, which was silently sub-11px text throughout. This pass is good and
**should not be touched** without a specific complaint about it.

### 9f88c1f — The physio structural rebuild
This is the big one, answering a brief re-read after a prior session's
partial attempt was rejected as "General OPD with physio fields added":

- **Story stopped being a card.** `StoryCard.tsx` deleted outright.
  `ClinicalCommandBar` (in `CaseSheet.tsx`) now searches the observable
  catalogue AND `story.ts`'s vocabulary in one box and routes the answer
  itself — no "is this Story or Case Sheet?" decision for the clinician.
- **`visit_story.duration_text`** column added (migration applied live via
  Supabase MCP) so duration reads back as "3 weeks", not the ranking
  bucket's own label ("2-6 weeks"). `story.ts` gained `DURATION_TERMS`
  (natural phrases → bucket), `storyClauses()` (sentence rendering with
  connectives — "for", "worse with", "better with"), `openStoryDimensions()`,
  `itemsForDimension()`, `DIMENSION_PROMPT`.
- **Pain and ROM left General Measurements.** `SpecialtyProfile` gained an
  `anatomical` axis (`specialtyProfile.ts`) — physio sets
  `anatomical: ["painVas", "romPct"]`. `MeasurementsCard` now suppresses
  those keys from its default list, its `RELEVANT_FIELDS` union, AND its Add
  menu (suppression at only the default level was tried and found
  insufficient — `RELEVANT_FIELDS.KNEE_PAIN` re-lights `painVas`/`romPct`
  the instant a knee-pain chip lands, so the axis has to suppress the
  relevance path too).
- **Examination moved inside the body map.** `ExaminationCard.tsx`'s old
  permanent card is gone; it now exports `RegionExam` (rendered inside
  `JointMapCard`'s modal, scoped to the clicked joint+side) and `examCounts`
  (for the summary). New `examination.ts` export `regionPainKey` — pain is
  now per-site, per-side, sitting beside the range/strength/test readings for
  that joint. New component `ExamSummaryStrip.tsx` is the ONE line the
  consult itself shows ("Right knee · Pain 7/10 · 2 ROM · 1 strength"); click
  opens the map. `App.tsx` suppresses `SpecialtyExamCard` for this profile
  (`usesPhysioInputs`) so there are not two buttons opening the same modal.
- **Recording a reading marks the site.** `JointMapCard.tsx` gained an effect
  that auto-inserts a `visit_body_sites` row the first time a reading lands
  at a selected joint, guarded by an in-flight ref (`autoMarking`) against a
  double-insert race. Previously the flow (open map → click knee → type
  numbers → close) left the summary strip empty unless "Mark site" was also
  pressed.
- **Longitudinal band went full-width.** Moved from inside `.cs-work`
  (competing with the input column) to a direct child of `.cs-shell`, above
  the two-column split — brief said "not two full rows"; one row, spans the
  workspace AND the plan rail now. Collapse uses a `grid-template-rows:
  1fr → 0fr` fold (`.cs-lt-fold` in consult.css) so the space is genuinely
  returned, not just hidden — `.cs-page` beneath is `flex: 1` so the rail
  rises back up.

### 5aee949 — Fixing what shipped broken (round 1)
Anmol's screenshot after 9f88c1f showed the new strip and pain scale
rendering as **unstyled run-on text** ("Body map & examinationLeft
kneePain0123456789100/10..."). Root cause, stated so it does not recur: a
shell heredoc meant to write new CSS read already-consumed stdin and wrote an
**empty string**. The old CSS block got deleted; nothing replaced it. The
"replaced 8491 chars" logged at the time was measuring the deletion, not
confirming the write — that is the exact failure mode to guard against going
forward: **verify a CSS/content write by grepping the class name back out of
the built bundle, never by trusting a byte-count log.**

Fixed by moving `ExamSummaryStrip` and the pain-scale portion of
`ExaminationCard` to Tailwind-in-component (no `consult.css` rules to fall
out of). Also in this commit: story sentence rendering (`storyClauses`,
chips→sentence in `CaseSheet.tsx`), spring/bounce animation replaced with a
flat 120ms fade (Anmol: "unserious"), a duplicate body-map launcher removed,
an exam-grid bug where a `false`-rendering cell shifted every column left
inside a `display: contents` grid, topbar clipping from the density pass
reaching too far, and a `Dr. Dr <name>` double-honorific bug (new
`doctorName()` helper in `src/lib/format.ts`).

### 6689b90 — Composer, curved body map, unit constraint
- **`visit_measurements.unit` NOT NULL constraint dropped** (migration
  applied live) — special-test results and MMT grades have no unit and the
  client was already sending `null`; only the DB blocked it.
- **The intake composer.** Sentence-in-box: story tokens render *inside* the
  search input (not in a card below it), so the suggestion dropdown opening
  underneath can never occlude the sentence being built. Slot model added:
  `slot` names the current open dimension, shown as a pill + skippable via
  Space/Tab (empty-box only) or a visible Skip button; Backspace on empty
  removes the last token. Order is still never enforced for typing — only
  what an *empty* box suggests.
- **Examination controls rewritten in Tailwind** — pain as one segmented
  0-10 track (not loose buttons), range as a real table, strength as a
  segmented MMT control, tests as tri-state pills. Verified present in the
  built CSS bundle this time (grepped, not trusted).
- **Body map redrawn with bezier curves.** Every `BODY_ZONES` segment in
  `lib/body/anatomy.ts` was a straight-line polygon (Anmol: "looks like
  paper"). Redrawn as cubic beziers — `mirror()` extended to accept `C` (safe:
  all three points in a C command are absolute coordinate pairs, so negating
  x reflects exactly; arcs still barred because `rx,ry` are radii and would
  mirror wrong, not fail). Verified the mirror is exact (knee 72-96 →
  104-128) via a standalone esbuild+import check, not by eye.

### a53c97b — Reverting an overreach, fixing the flow order
Two corrections from Anmol's next screenshot:

1. **The dark topbar should never have been touched.** 5aee949's "fix" for
   topbar clipping shrank the bar itself (72px→60px) and its contents
   (avatar 42→34px, three font sizes, chip padding) to fit — but Anmol's
   actual ask was always "make the CONSULT fit a 14-inch screen," never the
   topbar. `git checkout fc865e9 -- src/styles/layout.css` — reverted to
   **byte-identical** with the pre-density-pass file. Verified with
   `git diff fc865e9 -- src/styles/layout.css` returning nothing.
2. **The composer opened on "how long" before any complaint existed.**
   Wrong clinical order — nobody asks a patient duration before asking what
   happened. `slot` is now gated: `null` until `leadComplaint` (first
   REPORTED entry) exists, so the box asks "What happened? Start with the
   complaint…" first and offers no story dimension until it's answered. The
   complaint itself now leads the token strip in rose (Reported-chip
   colour), with no × of its own — removing it must happen from the Case
   Sheet, not the composer, or it would silently drop a symptom.
   Also: hover-reveal × on story tokens was `opacity-0` (still occupies
   width → phantom space before every comma, "for 2 days , sudden onset ,")
   → changed to `hidden`. Composer strip now auto-scrolls to keep the caret
   in view as the sentence outgrows the box.

## 2. The standing failure mode — read this before touching CSS again

Twice in this arc, a change was reported as done and was not, because the
verification was "the tool said N characters were written/replaced" rather
than "the class name is actually present in the output." The fix that
stuck: after any CSS or Tailwind change, `npx vite build` then grep the
built `dist/assets/index-*.css` for the specific class names just
added/changed — not just that the build succeeded. Tailwind arbitrary-value
classes (`w-[30px]`, `group/tok`) need their brackets/slashes escaped or
matched as fixed strings, not naive regex, or the grep itself lies.

## 3. What has NEVER been visually verified (the whole arc)

Nothing in commits 86a8a5c through a53c97b has been seen rendering by
anyone with a working browser until Anmol moves this session to his own
machine. Everything below is inferred from source, not observed:

- Composer box height/wrapping with a long story (6+ tokens) — does the
  box grow, or does horizontal scroll actually work well with a mouse/
  trackpad, not just via the auto-scroll-to-end effect?
- The body-map figure's actual proportions at real render size — bezier
  control points were chosen by reasoning about the coordinate space, not
  by looking at a rendered curve.
- `ExamSummaryStrip`'s wrapping behavior with 3+ marked sites.
- The composer's dropdown positioning relative to the box now that the box
  itself has grown (tokens inside it) — `updateRect()` reads `boxRef`'s
  `getBoundingClientRect()`, which should track a taller box automatically,
  but this has not been watched happen.
- Whether `.cs-lt-fold`'s grid-rows collapse animation is smooth or janky
  in a real browser — CSS-grid-rows transitions have known engine quirks.
- The Skip pill / Space-to-skip discoverability in practice — does a real
  first-time user notice it, or is the affordance too quiet?

## 4. Constraints that still bind

Same as before, plus one new one from this arc:

- Rule 16 (per-specialty branch), 17 ("know a lot, show little"), 5 (never
  redefine a `cs-` class), 9 (never print a raw score), 10 (zero new `tsc`
  errors), 11 (targeted edits, no wholesale rewrites), 20 (Anmol is
  non-technical — literal instructions, no diagrams).
- **New: prefer Tailwind-in-component over new `consult.css` rules for
  anything component-local.** Anmol's explicit direction this arc — a
  component-local surface has no business in a 7000-line stylesheet it can
  silently fall out of (see §2). `consult.css` still owns shared tokens
  (`:root`), shared card chrome (`.cs-card`, `.cs-shell`, `.cs-page`,
  `.cs-work`, `.cs-summary`), and anything genuinely reused across many
  components. A one-off surface's own look goes in its `.tsx` file.
- **`layout.css` (the dark topbar) is out of scope** for any "make things
  fit" work unless a complaint specifically names the topbar. It was
  reverted once this arc for exactly this reason.

## 5. First move next session (now that a real browser exists)

1. `npm run dev`, open the physio consult on an actual 14-inch-equivalent
   viewport (devtools device toolbar or a real small window), with a real
   patient.
2. Walk the §3 list above in order — each one is a specific, checkable
   claim this handoff makes without evidence. Confirm or refute each one.
3. Run through the brief's own §12 "final test" scenario (knee → 3 weeks →
   gradual → downstairs → open body map → click right knee → record
   pain/flexion/extension/quadriceps → close → check the summary strip →
   check Assessment) end to end, with eyes open, and fix whatever is
   actually wrong rather than what source-reading predicted would be wrong.
4. Only then move on to what's still untouched: `LongitudinalBand.tsx`'s
   tile sizing at full width was resized by estimate (§0 of the previous
   handoff flagged this and it was never rechecked), `GoalsCard.tsx`'s own
   Tailwind styling has not been looked at since the arc started, and the
   brief's §15 open questions (progress rail permanence, Attachments
   visibility, modal-vs-inline body map — already answered "modal" here,
   worth confirming that's still the right call once seen) are still
   genuinely open.

## 6. Environment

- No `supabase/migrations/`; schema changes apply live via Supabase MCP.
  Project `ieimvjprtltancxapuzg` (org `arenod`, `ap-south-1`). Two migrations
  landed this arc: `add_visit_story_duration_text`,
  `visit_measurements_unit_nullable`.
- Dev server `npm run dev` → `http://127.0.0.1:5173`.
- Checks: `npm run check:story`, `check:measures`, `check:examination` all
  pass as of `a53c97b`. `check:combos` needs `AREN_CHECK_EMAIL` /
  `AREN_CHECK_PASSWORD` env vars to do anything (anonymous client sees zero
  rows in the catalogue tables — cannot distinguish "empty" from
  "permission denied" without them).
- `main` and `master` are unrelated histories. The physio work is on
  `master`.
