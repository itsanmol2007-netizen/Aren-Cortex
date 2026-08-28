# Empty states

Part of the Cortex Design DNA set — see `README.md` for the pre-flight
checklist and how these files fit together. This pocket is §9 of that
file's original single-document form (2026-08-25), unchanged in content,
just moved.

---

**Useful, restrained, visually aligned — never information-heavy.**

- Exactly `<BlankXArt /> <strong>fact</strong> <span>next action</span>` —
  see `typography.md` and `icons.md`. No third line.
- The `.cs-empty` wrapper centres its content in *whatever space is
  actually available* (`align-items:center; justify-content:center`,
  `.cs-empty` block). That only produces visually aligned illustrations
  across two neighbouring panels if **the space available is the same on
  both sides** — which means: don't render a header/label row above one
  panel's empty state that the other panel's empty state doesn't also get.
  If a panel has nothing to show, hide its *entire* pre-list chrome
  (`.cs-ranked-head` included), the same way both `ConditionsCard` and
  `SuggestionsCard` gate it on "is there anything at all to show" — not
  just the list body.
- Never reserve a fixed height for an empty state "to be safe" — a small
  drawing floating in a large empty well reads as a bug, not restraint
  (ui-doctrine §5: *"a 62px illustration in a 300px well reads as an
  accident"*).

## The state between empty and full also needs to be designed (added 2026-08-28)

Zero items gets `BlankXArt` centred, front and large. A FULL list has no
dead space to fill. The state in between — 1-3 items in a card whose fixed
height (`.prac-card.is-fixed`) has room for 4+ — was landing as a short
list of rows followed by flat, undesigned air, which reads as unfinished
even though the empty-state rule technically doesn't apply (there IS
content). Fixed on Practice with `.prac-fill-art`: the SAME small mark
(`BlankLabArt`, `BlankTemplateArt`, …) the card's own zero-state already
uses, reused (not duplicated) at low opacity in the corner, behind the
real rows (`z-index:0` under `.prac-rows`/`.prac-tree`/`.prac-setting-
list`'s `z-index:1`). It only appears below the card's own "still sparse"
threshold (Labs/Templates: ≤3 of a 4-row cap; Companions: ≤2 of 3) — once
a list is at or past its cap there is no dead space left for it to
answer, and showing it anyway would read as clutter, not polish.

The art must belong to what the card DOES, not be a generic decoration —
reusing the card's own empty-state drawing guarantees that for free; never
reach for a new illustration or a different one than the zero-state
already committed to for the same card.
