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

## Resting shadow gets a hover state (added 2026-08-27)

`--cs-shadow` alone (`0 1px 1px rgba(16,28,46,.03)`) is correct at rest —
but a page of otherwise-identical cards asked for "visual weight" reads as
flat, not calm, until something responds to the pointer. `.prac-card`
(and any card built on this recipe) gets a `transition` on
`box-shadow`/`border-color`/`transform`, and a `:hover` state: a 1px lift
plus a soft shadow tinted with `--cs-blue` at low opacity (the action
colour, not a new one — colour.md's rule for every accent applies to a
hover glow too). Guard it with `@media (prefers-reduced-motion: reduce)`
same as every other transform on this page (motion.md). Do not invent a
heavier lift or a stronger tint "to make sure it reads" — the resting
shadow was 0.03 opacity; 0.08 on hover is already a large relative jump.
