# Session handoff — 2026-08-15, cloud → Anmol's PC

**This file is temporary.** It exists to move context from a cloud session to
a local one without re-deriving everything from scratch. Once the next
session has read it, fold anything durable into `aren-cortex-atlas.md` /
`aren-cortex-ui-doctrine.md` and delete this file — same convention the last
handoff followed (§14.17 in the atlas records that one being folded in and
removed). Trust this file's account of what's *live* over the atlas's,
because the atlas has a known gap this session didn't close — see §2 below.

Read order for a cold start: this file, then `aren-cortex-ui-doctrine.md`,
then `aren-cortex-atlas.md` §14 (the session log, newest entries at the
bottom — 14.17 and 14.18 are this week). Don't re-survey the repo from
scratch; both docs are current except where this file says otherwise.

---

## 0. Where things actually stand right now

`master` is up to date with everything through PR #1
("Medicine add sheet finish, combination ranking, and a Synapse motion
pass"), squash-merged 2026-08-15. Nothing is in flight, no open PR, no
uncommitted work. If a local checkout is behind, `git pull origin master`
first.

What shipped in that PR (all live-verified against the real running app
with real data, not just built — see atlas §14.17/§14.18 for the writeups):

- Medicine add sheet: dose-slot circles, dose/food-instruction prefill from
  the product name, blue confirm button (was green — doctrine's colour law:
  blue is action, green is a taken state, and confirming isn't taken yet).
- Combination products are now guarded/ranked by the worst status across
  *every* molecule they carry, not just the one composition search reached
  them through (`guardCombination` in `lib/synapse/engine.ts`).
- `search_intents` brand-priority fix (live DB function — see §1, this has
  no other record than atlas §14.17).
- Antimalarials had **zero** `signal_intent_rules` — Synapse could only ever
  rank paracetamol for a malaria picture. Fixed live (16 new rule rows); now
  ranks all four antimalarial compositions in the catalogue, tablet and
  injectable both, undifferentiated by design — see atlas §14.18 for exactly
  why and what's still open on it.
- A "Synapse is thinking" motion pass — a violet ring cue on Assessment/
  Medicines/Tests whenever the underlying signals change, plus animated
  reveal/collapse for alt-brand chips and guard reasons. Extends the
  existing `motion/react` patterns already in `CaseSheet.tsx`/
  `ConditionsCard.tsx`.
- The Consultation Plan rail is now completely immovable on scroll
  (`body.cs-locked-shell`) — it used to drift slightly before settling.
- **`App.tsx`'s `isGeneralOpd`-branched render block (~155 lines) is now
  `GeneralOpdInputs.tsx` / `SoapInputs.tsx`.** This is Stage 1 of the
  architecture conversation in §3 below — read that section before touching
  either file.
- Doc cleanup: five stale planning docs deleted, the previous handoff folded
  into the atlas, several stale claims in doctrine/atlas corrected.

## 1. Documentation gap this session didn't close

**The atlas was not updated for the `App.tsx` split.** It still says
"there is no per-specialty branch anywhere in the render tree" is false only
per §8's General OPD carve-out, and its own line count for `App.tsx` (§10.7,
"now 1,670 lines") is stale twice over — the file was ~2,300 before this
session's split and is 2,196 now. `GeneralOpdInputs.tsx`/`SoapInputs.tsx`
appear nowhere in the atlas. **First thing worth doing next**: add a
§14.19 entry recording the split (both new files already carry a full
header comment explaining what moved and why — lift from there) and correct
§10.7's line count.

Also stale: atlas §14.17's "Open" list says *"The add sheet's three
2026-08-14 additions... are not browser-verified"* — they now are, this
session, along with everything else in §0 above. Worth a one-line
correction alongside the §14.19 entry.

## 2. Architecture — Synapse, in one paragraph

`lib/synapse/*.ts` is pure: signals → `signal_intent_rules` → scored
intents → guards. No React or Supabase import anywhere in that directory —
enforced by convention, checked in `confirmed-conditions-investigation.md`
§1 as still true. Ranking decides what is *offered*; guards *warn*, they
never hide (doctrine's central law, tested against real content gaps twice
this week — search's brand-collision bug and malaria's missing rules were
both this same "something is unreachable, not badly ranked" shape). Colour
law: blue = action, green = taken, teal = examined, violet = the engine's
own reading, amber = soft guard, red = hard guard. There is no
`supabase/migrations/` directory — every live-DB change (both fixes above)
is documented in the atlas because that prose is the *only* record; if a
migrations directory ever gets introduced, the atlas's DB-change entries
need to be carried forward explicitly or that history is lost.

## 3. Stage 2 — splitting `App.tsx` further (not started, approved in principle)

Anmol's framing, verbatim from the conversation that led to Stage 1: 2,200
lines is "definitely now in something big category," multiple files per
specialty would scale better than "appending onto the same file," and
`App.tsx` should "just import them and not actually build the DOM."
Stage 1 (this session) deliberately stopped at the render-only split —
`GeneralOpdInputs.tsx`/`SoapInputs.tsx` take props, they own no state and no
handlers. Everything a real Stage 2 would move — `useState`, the effects,
`handleObservableToggle`, `handleAcceptIntent`, the whole accept-to-plan
pipeline — is still 100% in `App.tsx`.

**What Stage 2 actually is, concretely**: extract that state/handler layer
into a hook (something like `useConsultWorkspace.ts`, alongside the existing
`useConsultIntelligence.ts` and `useConsultKeyboard.ts` pattern already in
`src/hooks/`), so `App.tsx` becomes closer to "wire the hook to whichever
input component the profile needs" rather than owning ~2,000 lines of
mixed concerns itself. This is bigger and riskier than Stage 1 — nearly
everything in the file touches this state — and was explicitly deferred as
a separate task, not yet requested. Do not start it without asking; when it
does get picked up, the right first move is the same one that worked for
Stage 1: propose the specific boundary (what moves, what doesn't, why) and
get a "go ahead" before writing code.

## 4. Specialty-profile file architecture — the template exists, don't build 15 specialties

Anmol was explicit: *"I'm not saying you to write every specialty. I'm just
saying you to prepare the architecture."* Current state, accurately:

- `features/synapse/specialtyProfile.ts` already has **8 profiles**
  (General OPD, Physiotherapy, Diagnostics, Cardiology, Paediatrics,
  Gynaecology, Dentistry, Dermatology) — but every one of them is pure
  *configuration* (which intent type is primary, which measurements show by
  default, which of the two specialty charts render). None of them has its
  own input *layout* — they all still render through the one shared
  `SoapInputs.tsx`.
- General OPD is the **only** profile that earned its own render path
  (`GeneralOpdInputs.tsx`), because it's the only one whose input surface is
  structurally different (the Case Sheet replacing three pickers), and
  doctrine §8 explicitly overrode "no per-specialty branch in the render
  tree" to allow exactly that one carve-out — "configuration can change what
  goes INSIDE a module, it can never remove a module another profile
  requires."
- **`GeneralOpdInputs.tsx` is the template**, not a one-off. Its own header
  comment says as much: the day a second profile earns its own input layout
  the way General OPD did, copy that file, rename it, change what it
  renders, add one branch to the picker in `App.tsx`. `SoapInputs.tsx` stays
  the shared fallback for every profile that hasn't earned a divergence yet
  — it is deliberately not pre-split into seven near-identical copies,
  because that's the placeholder-building this file's own header warns
  against.
- What "prepare the architecture" should mean concretely, when it's picked
  up: Stage 2 (§3) is the actual prerequisite — a profile can't cleanly get
  its own input file *and* its own slice of state until the state layer is
  out of `App.tsx` too. Until then, the template pattern (copy
  `GeneralOpdInputs.tsx`) is real and usable, but a second profile adopting
  it would still be threading its handlers through `App.tsx` exactly like
  General OPD does today.
- Separately noted, for later, not now: specialty selection is currently a
  doctor-facing Settings toggle (a deliberate, temporary exception — see
  `specialtyProfile.ts`'s own header) that Anmol wants removed once every
  profile is tested, in favour of admin-driven assignment. Not blocking
  anything architectural; just don't be surprised the toggle exists.

## 5. Longitudinal record — a plan already exists, nothing is built

Before assuming this needs designing from zero: **read
`docs/confirmed-conditions-investigation.md` first.** It's a full,
already-checked-against-the-live-schema investigation (2026-07-30) into
exactly the durable-patient-fact problem Anmol raised again this session —
"the longitudinal record... you would have different files for that." Its
one-paragraph answer: the engine already re-runs safely on every chart
change; the actual gap is that a confirmed condition today has nowhere to
go (`diagnoses: string[]`, display-only) and zero of 68 finding intents
join to an observable, so nothing could be written back even if there were
somewhere to write it.

Proposed shape, already schema-checked, still unbuilt:
- `condition_observable_map` (intent → observable, plus `is_chronic`) —
  curation, not engineering; roughly a dozen of the 68 finding intents are
  genuinely chronic (diabetes, hypertension, asthma...), the rest are
  episodes and must not follow a patient forever.
- `patient_conditions` (patient_id, observable_id, status
  active/resolved/refuted, confirmed_at/by, source visit) — the actual
  durable fact, keyed on `observable_id` specifically so it re-enters the
  engine exactly like any other chart tick, no new engine concept.
- A 6-step incremental build order is already laid out in that doc's §4,
  independently revertible at each step. §5 lists exactly what needs a
  clinical (not engineering) decision before step 1 — mainly, which of the
  68 finding intents are chronic.

This is the concrete next step if/when "longitudinal record" moves from
"prepare for" to "build" — no fresh design needed, just a decision to start
and someone to do the chronic/episode split.

**Analytics/graph module** — mentioned once, in passing, as a further-out
idea sitting on top of the longitudinal record once it exists. Nothing
investigated, nothing designed. Don't invent a shape for this before the
longitudinal record itself is real; there's nothing to graph yet.

## 6. Other open items worth knowing about (pulled from atlas §14.17/§14.18, still true)

- Combinations are offered correctly now but not *ranked* higher for
  covering two active needs at once — the engine still scores the one
  composition it was reached through. Doctrine's ranking law says this is a
  proportional property of the engine itself, not the brand layer — a
  bigger change than this session's wiring fix. Flagged, not attempted.
- No guard content exists yet for quinine/hydroxychloroquine's real cardiac
  (QT) risk considerations — same class of gap §14.9's medicine-level
  guards cover for other drug classes. Needs real clinical input, not
  guessed guard text.
- Only 4 of the well-known antimalarial molecules are in the catalogue
  (missing lumefantrine, primaquine, mefloquine, atovaquone-proguanil,
  piperaquine). If lumefantrine gets added later (it usually ships combined
  with artemether as Coartem), it needs its own `signal_intent_rules` —
  this session's fix does not cover it, and this session's combination
  ranking fix means it wouldn't silently inherit artemether's rules either.
- `search_intents`'s fix shifts result *order* slightly for any query that
  used to collide (surviving row's score is now the brand match's, usually
  a bit lower) — not checked against `check:search`'s weak-match list
  beyond confirming zero terms went to no-result.

## 7. Environment notes for a fresh session

- No `supabase/migrations/` directory. Every schema/rule change is applied
  live via Supabase MCP tools and exists nowhere else but the atlas's prose
  — write it down or it's gone.
- **Don't write to the live Supabase DB without asking first.** Both live-DB
  fixes this week were explicitly authorized before being applied.
- Supabase project: `ieimvjprtltancxapuzg` (org `arenod`, region
  `ap-south-1`).
- Test-data convention: any patient/visit created for verification gets
  deleted afterward — don't leave throwaway records in the live DB. (11 were
  created and cleaned up this session; the DB is clean.)
- Branch discipline: `main` and `master` are two unrelated histories that
  happen to share a remote — `master` is where the atlas, doctrine, and
  everything real lives. If a new working branch ever gets cut from `main`
  by mistake, `git checkout -B <branch> origin/master` before doing
  anything else.

---

## Cold-start prompt

Paste this as the first message in the new local session:

> Read `docs/SESSION-HANDOFF.md` first — it's a temporary handoff from a
> cloud session, and its account of what's live is more current than the
> atlas in a couple of specific places it names. Then read
> `docs/aren-cortex-ui-doctrine.md` and `docs/aren-cortex-atlas.md` §14
> (skim to the newest entries, 14.17/14.18). Don't re-survey the codebase
> from scratch — trust those docs. Once you've read all three, tell me
> what you understand the current state to be and what you think the
> highest-value next step is, then wait for me before writing any code.
> First small thing to fix: the atlas §14.19 gap the handoff file describes
> in its own §1.
