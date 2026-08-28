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
