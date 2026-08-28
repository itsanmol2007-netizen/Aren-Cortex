# Panel / card structure

Part of the Cortex Design DNA set — see `README.md` for the pre-flight
checklist and how these files fit together. This pocket started as §2 of
that file's original single-document form (2026-08-25, moved unchanged);
the secondary-controls ordering below was added the same day, once
`SuggestionsCard`'s actual controls row moved to match it — see that
file's own doc comments for the concrete change.

---

Every panel is `.cs-card` (`display:flex; flex-direction:column`, one
border, one radius, one shadow — all three from tokens, never hand-rolled).
Inside it, the recipe is always:

```
.cs-card-head            — icon tile (26px, .cs-glyph) + title ONLY, one row
.cs-rec-search            — the search box, IntentSearchField, everywhere —
                              the one control that is ALWAYS prominent
  [optional secondary controls row — sort label / category tabs]
.cs-ranked-head            — "RANKED X" label + "N of M" count, ONLY when
                              there is something to rank (see empty-states.md)
.cs-list (motion.div)     — the capped/scrollable body (see progressive-disclosure.md)
.cs-card-foot-more        — "Show more", a SIBLING below the list, never
                              the list's own last row
```

The secondary controls row (sort label, category tabs when a panel covers
more than one intent type) sits BELOW the search field, not above it —
search is the one control a doctor always needs; sort/filter is a
convenience that only earns space once there is something to sort or
filter. Gate the ENTIRE row on real content (`SuggestionsCard`'s
`anyContent`: something ranked in ANY category this instance covers, not
just the one currently in view) — an empty chart has nothing for a sort
label or a row of category tabs to describe, and showing them anyway is
exactly what broke this panel's empty-state alignment against its
neighbour before (2026-08-25, see `responsive-grid.md`). Within that row,
gate the CATEGORY TABS a second time on which categories actually have
content (`nonEmptySections`, not the caller's full type list) — a facility
whose chart only ever produces investigations has no business showing a
"Referral"/"Advice"/"Exercise" tab that leads nowhere.

This is not four components that happen to look similar — `ConditionsCard`
and `SuggestionsCard` are required to share the literal CSS classes for
this recipe (`.cs-ranked-head`, `.cs-ranked-label`, `.cs-ranked-count`,
`.cs-card-foot-more`), specifically so the two cannot drift apart the way
they did across three separate passes on 2026-08-25 before this document
existed. **When you build a new ranked panel, reuse these classes — do not
invent a new one that merely looks the same today.**

Spacing inside a card comes from `--cs-s1`…`--cs-s5` (3/6/9/12/15px), never
a bespoke pixel value chosen by eye.

---

## A card declares `max-height`, never `height` (added 2026-08-27)

Cards in a row must line up (`responsive-grid.md`) — but the way to get
that is **`align-items: stretch` on the grid**, so the row is as tall as
its tallest card's REAL content. It is never a constant height written
onto the cards themselves.

A hard `height` looks fine the day you pick it, against the data you
happened to have. Measured on the Practice page with a real (sparse)
account: 396px cards holding one row each, **295px of dead space** under
Preferred Labs, 275px under Templates, and a 121px Consultation Defaults
sitting in the same row — a jagged row of empty rectangles. Switching to
`max-height` plus grid `stretch` produced 163px cards with 42–62px of
slack from the identical markup.

So:

- **`max-height`** on the card, derived from its own parts (head +
  subtitle + search row + N rows at the list's measured row height +
  padding), written down in the comment next to it.
- **`align-items: stretch`** on the grid for row parity.
- Growth past the ceiling is the list's problem, not the card's — it
  scrolls internally (`layout-composition.md`).

A card is allowed to be short when its content is short. That is honest,
and `empty-states.md` has forbidden the alternative since 2026-08-25:
*"a 62px illustration in a 300px well reads as an accident."*

## Resting shadow gets a hover state (added 2026-08-27, tone-matched 2026-08-28)

`--cs-shadow` alone (`0 1px 1px rgba(16,28,46,.03)`) is correct at rest —
but a page of otherwise-identical cards asked for "visual weight" reads as
flat, not calm, until something responds to the pointer. `.prac-card`
(and any card built on this recipe) gets a `transition` on
`box-shadow`/`border-color`/`transform`, and a `:hover` state: a 1px lift
plus a soft glow at low opacity. The glow was one flat `--cs-blue` tint
for every card at first (2026-08-27) — corrected the next round to match
each card's OWN tone (`.prac-card--teal:hover`, `--violet:hover`, …, see
colour.md's "thread the tone through" note), so seven cards glow in (up
to) four different colours instead of one. Guard it with
`@media (prefers-reduced-motion: reduce)` same as every other transform on
this page (motion.md), and the `.prac-glyph` icon riding along with a
slightly faster lift+scale is the same guard. Do not invent a heavier lift
or a stronger tint "to make sure it reads" — the resting shadow was 0.03
opacity; ~0.08–0.10 on hover is already a large relative jump.

## The footer link — one shape, tone-coloured, for every populated card (added 2026-08-28)

Every primary card that has a fuller management surface elsewhere (a
modal, or simply "focus the search field") carries ONE persistent link at
its foot: `PracticeCard`'s `foot` prop, rendered as `FootLink` (label +
`ChevronRight`, `.prac-card-foot` — its own bordered-top row, outside
`.prac-card-body`, never a fifth row inside the list). Never per-card
bespoke — a "Manage" text link on one card and a dashed "+ Add another"
box on its neighbour is the exact "this symmetry doesn't match" complaint
from 2026-08-27, just relocated to the card's foot. Gate it on the card
actually having content (`items.length > 0`) — an empty state already
carries its own call to action, a second one below it is noise.

Also: the page's own section heading (`.prac-group-head`/`-title`/`-sub`,
"Clinical Defaults / What Cortex reaches for first…") was CUT on
2026-08-27 on the reasoning that the dark `WorkspaceHeader` above it
already said enough, then REINSTATED on 2026-08-28 once an actual
reference image was given as the explicit source of truth and it drew the
heading back in. Neither round was wrong given what it knew — the
takeaway isn't "always keep a heading" or "always cut it", it's that a
literal reference image overrides a prior round's own reasoning, even
reasoning that was sound in isolation and is still recorded in this file.
Check the CURRENT reference before repeating an old argument.

## A binary-toggle row's whole surface is the button (added 2026-08-28)

If a row exists to represent ONE clear yes/no state a click flips (a
composition's brand marked preferred or not, a search hit added or not),
the icon that shows the state is not the only place that click should
land — "clicking anywhere on the medicine row should toggle it... the
heart should remain as a visual state indicator, not the only clickable
target." Wrap the ROW in the interactive element (`<button
className="prac-tree-row">`, not a `<div>` with a nested `<button>`
heart) and give the heart's own `onClick` an `e.stopPropagation()` (the
reused `PinButton` already has one) so clicking the heart directly still
fires exactly once, not twice. This is NOT a licence to make every row
a giant click target regardless of what's on it — a row with several
independent actions (Preferred Labs: star-default, remove, reorder) keeps
each its own control; this only applies where the row really does
represent one single toggle.

## Correction: a toggle row is not symmetric once removal has weight (added 2026-08-29)

The rule directly above ("wrap the ROW in the interactive element… clicking
anywhere toggles it") was right for what it was tested against — a search
hit or catalogue row where "add" and "remove" are the same low-stakes
action. It is wrong once the row being clicked represents something
already committed (a medicine already marked preferred, sitting in the
tree): *"clicking on it should add it, but for removing there should be a
button, a cross button… removing it should not be that much easy because
you randomly click on it and that it is removed."* Same visual row, two
different real-world stakes — adding costs nothing to undo, removing
quietly drops a clinical default a doctor was relying on.

The fix keeps the row a plain, non-interactive container once it's already
preferred (`<div className="prac-tree-row">`, no onClick, no
`stopPropagation` needed because there's nothing to propagate past) and
moves removal to `RemoveBtn` — the same small X control every other
card already uses for delete (`LabsModal`'s rows, `CompanionsModal`'s
authored edges) — with a static heart glyph (`fill="currentColor"`, no
`PinButton`) as a pure state indicator, no longer a control. The
"whole-row-click adds" half of the original rule still holds, and still
matters, but only on rows that AREN'T yet committed: a search hit, or a
catalogue drill-down row under a composition group — `const add = () => {
if (!pinned) togglePreferred(...) }`, deliberately a no-op once already
pinned rather than a second path back to instant removal. **The dividing
line is "does this click undo something the doctor already chose", not
"is this conceptually a toggle"** — a row can look identical before and
after crossing that line and still need a different interaction contract
on each side of it.

## A capped-preference table hides a second column until you query for it (added 2026-08-29)

`clinic_brand_preference`'s primary key is `(hospital_id, composition_id,
medicine_id)` — one row per medicine, keyed to exactly ONE composition,
even when the medicine actually contains several (a combination product
like "Pantocoat DSR" = pantoprazole + domperidone has two rows in
`medicine_composition_map` but only ever gets ONE `clinic_brand_preference`
row, keyed to whichever ingredient the doctor searched through to find it).
Grouping the UI by that table's own `composition_id` silently merges a
combination brand into its plain single-salt neighbour's group — exactly
the bug reported three times in a row: *"paracetamol and a medicine
containing paracetamol and aceclofenac is not necessarily the same
thing… that should be separated."* The fix is client-side: fetch each
preferred medicine's FULL ingredient list from `medicine_composition_map`
(keyed by `medicine_id`, not filtered to the one composition the
preference row happens to reference), and group by that full sorted list —
a synthetic `combo:${names.join("+")}` key when there's more than one
ingredient, the real `compositionId` otherwise — tagging the combo group
visibly (`COMBINATION` pill) so it reads as its own category, not a
sub-item of either ingredient alone.

The trap on the FIRST attempt at this fix: fetching composition *names*
only for the ids that `clinic_brand_preference` itself mentions (still too
narrow — that's the same one-composition-per-row limit, one join away)
silently drops a combo medicine's second ingredient's name, which a
`if (!name) return` guard then quietly excludes from the grouping key —
so the combo tag never appears and nothing errors. Caught only by
screenshotting the live result and seeing "Pantoprazole (1)" where
"Domperidone + Pantoprazole · COMBINATION" was expected — reading the code
back gave no reason to suspect it was wrong. When a fetch is scoped to
"the ids this table mentions", check whether a downstream JOIN table can
reference MORE ids than that — fetch the union, not the seed set.

## Two tables, two different FK conventions for a column named the same thing (added 2026-08-29)

`clinic_brand_preference.set_by` and `hospital_companion_preference.set_by`
read as the same field (who set this preference) and are NOT the same FK
target: the former references `users.id`, the latter `doctors.id` —
confirmed via `information_schema`, not assumption, after a doctor-facing
`AddMedicineModal` passed a `doctors.id` into the former and got `insert or
update on table "clinic_brand_preference" violates foreign key constraint
"clinic_brand_preference_set_by_fkey"`. `useClinicalIdentity()` now
resolves both — `doctorId` (a `doctors.id`, for anything keyed like
`hospital_companion_preference`) and `userId` (a `users.id`, nullable
until the session is ready, for anything keyed like
`clinic_brand_preference`) — so a call site picks the one its OWN table's
FK actually points at, rather than reaching for whichever id happens to be
in scope. **A same-named column on two tables is not evidence they share a
convention** — check the actual constraint before wiring a new write path
to one, especially when copying a pattern from a sibling table that looks
identical.

## A silent write can still leave the doctor asking "did that work?" (added 2026-08-29)

The FK violation above surfaced a second, independent gap: the medicine
record itself was created successfully (the `add_medicine` RPC call that
doesn't touch `clinic_brand_preference` had already committed) before the
*second*, preference-setting call threw — so the doctor's medicine was
real and searchable, but the UI never told them so, only surfaced the
stack trace from the failed second step. **A multi-step submit needs to
report success for the steps that succeeded, not just failure for the one
that didn't.** `AddMedicineModal` now fires `onMedicineAdded(...)`
unconditionally the moment the medicine record exists, before branching on
whether "mark as preferred" was also requested — so a doctor sees their
new medicine land in "View added" and the running counter beside it even
on a run where the preference step separately fails.

## A modal doesn't lose a draft to a stray click (added 2026-08-28)

Click-outside-to-close is right for a modal that's just a list (nothing
to lose) and wrong for one mid-form (a name half-typed, a composition
picked, a pairing half-built) — a stray click on the backdrop shouldn't
silently discard it. `PracticeModal`'s new `dirty` prop is the switch:
omit it and a modal closes on outside-click same as always (`LabsModal`'s
own list, `CompanionsModal`'s curated toggles — both save/act instantly,
nothing to lose); pass `dirty={true}` once the modal's OWN state has
something a click would throw away, computed locally by each modal
(`AddMedicineModal`: `!!name.trim() || compositions.length > 0 || …`;
`MeasurementsModal`: the checked set differs from what it opened with).
Escape and the × close button always work regardless — both are an
explicit "I want to leave", never a stray click.

## A collapsed list's own trigger was suppressed everywhere it existed (added 2026-08-29)

`CappedRows` (this file's own row-list primitive) always had a working
"Show more" — cap N rows, grow into a bounded scroll on click. Every real
call site (Preferred Labs, Prescription Templates, Clinical Companions)
passed `hideTrigger` anyway, on the reasoning that a persistent `FootLink`
("View all labs →") already opened a full management modal, and showing
both would be "two controls doing the same job". That reasoning held right
up until a doctor actually hit the cap: *"Not more than 3 labs are being
shown right now even though there is a clear space for it... show it with
overflow protection... a 'show more' button... unlocks the nested scroll
with smooth animation"* — the exact mechanism `hideTrigger` was hiding,
requested back almost verbatim. The two controls are not actually
redundant: "Show more" answers "let me glance at the rest right here",
"View all" answers "let me go edit/reorder/manage them" — different jobs,
both worth keeping. Preferred Labs' cap went 3→4 and `hideTrigger` came
off; Templates/Companions were left as-is (not reported, no reason to
guess their own right cap without the same complaint).

Preferred Medicines' composition tree had the identical gap one level
down: a GROUP's own children (`.prac-tree-children`) rendered every row it
had, uncapped — sparse groups never noticed, a group with many preferred
brands just grew until `.prac-tree`'s own outer scroll caught it, with
nothing on screen saying there was more. Same fix, same shape, one level
lower: `GROUP_ROW_CAP` rows visible per open group, a `.prac-tree-more`
button (styled as `.prac-foot-more`, not a bespoke control) appears only
when a group's `rows.length > GROUP_ROW_CAP`, and a single `childrenExpanded`
flag (reset whenever the accordion switches to a different group) tracks
whether the currently-open group is capped or fully shown — one flag, not
a Set, because only one group is ever open at a time.

**The trap this surfaced**: bumping Preferred Labs to 4 rows + a visible
button did not just need a CSS number changed — at the existing 320px
card height, `.prac-fill`'s flex-shrink (default `flex: 0 1 auto` on
`.prac-rows` in its collapsed state) was silently squeezing the row list
BELOW its own `216px` (4×54) `max-height` target to make room for the
button, and the 4th row rendered visibly cut off mid-line. `max-height`
on a flex item is a ceiling, not a guarantee — a flex container that's
genuinely out of room will shrink a child past it if that child hasn't
been told `flex-shrink: 0`. Caught by comparing a row's own
`getBoundingClientRect()` height against `.prac-rows`' actual rendered
height (176.6px, well under its own 216px ceiling), not by eye — a
partially-clipped row at this font size reads as "slightly tight
line-height", not "obviously broken". Fixed by re-deriving `.prac-card.is-
fixed`'s height from the real component budget (360px, replacing a stale
320px whose own derivation comment hadn't matched the applied value for
at least one prior round — check the comment against the actual CSS value
before trusting either).

## A parent group and its children need visibly different weight (added 2026-08-29)

Preferred Medicines' composition-group header (`.prac-tree-head`, e.g.
"Paracetamol") and the concrete medicine rows under it (`.prac-tree-row`,
e.g. "Dolo 650 Tablet") shared the exact same `.prac-row-label` size,
weight, and color — *"literally the same font, same size and same color
and even same horizontal placing"*. A composition name is a category
label; the brand underneath it is the actual content a doctor is scanning
for, and the two need to read as different levels of a hierarchy on
sight, not merely be told apart by which line happens to have a chevron
next to it. Fixed with the same weight/color tokens this design system
already uses for exactly this contrast elsewhere (never a second font
family — `typography.md`'s scale is size/weight/color, not typeface):
the group header stepped down to `--cs-label` (muted) at 620 weight, the
medicine row stepped up to `--cs-ink` (full dark) at 700 weight. Every row
that shares this recipe now ALSO gets its own hover feedback
(`translateY(-1px)` + a tone-tinted background, the same small lift
`.prac-card:hover` already gives the whole card, scaled down to row size)
— rows across Preferred Medicines, Preferred Labs/Templates/Companions,
and every modal's own pick-row previously had either a flat background
swap or nothing at all: *"There is a hover animation when going on a
card but the individual items inside it, they still need some
animation."* Guarded by `prefers-reduced-motion` alongside the card-level
transform this mirrors.
