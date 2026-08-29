# Animation & motion

Part of the Cortex Design DNA set — see `README.md` for the pre-flight
checklist and how these files fit together. This pocket is §6 of that
file's original single-document form (2026-08-25), unchanged in content,
just moved.

---

Built on `motion/react` (Framer Motion). Two hard rules:

1. **Every animation branches on `useReducedMotion()`** — `reduce ?
   { duration: 0 } : { type: "spring", ... }`. No exceptions; this is
   accessibility, not polish.
2. **A capped list's expand/collapse is a `motion.div` animating
   `maxHeight` on the list itself, not a `layout` prop on the whole card.**
   `layout` animates a subtree via a scale transform, which does not
   compose with a child that has its own `overflow: auto` — this was tried
   on 2026-08-25, reverted the same day, because it reintroduced exactly
   the "still overflowing when clicking show more" bug it was meant to fix.
   The local `maxHeight` tween (`{ type: "spring", stiffness: 260,
   damping: 32 }`, the shared config `ConditionsCard`/`SuggestionsCard`
   both use) is the correct mechanism — see `progressive-disclosure.md` for
   the row-height math it depends on.

Micro-interactions elsewhere (a card entering, a ring pulsing) use a
snappier `{ stiffness: 420–460, damping: 34 }` — reserve the slower
260/32 spring specifically for capped-list expand/collapse, so a doctor
reads "the list is growing" differently from "something just appeared."

Never animate a restructure of the whole page for a local interaction —
selecting a chip, expanding one card — should never visibly reflow
unrelated panels.

## The `maxHeight` target has to be a REAL number, not "big enough" (added 2026-08-29)

`CappedRows`' own expanded state (and, copying it, Practice's composition-
tree accordion) animated `maxHeight` toward an arbitrary flat `9999` on
the reasoning that the actual box would be bounded by something else
anyway (the card's fixed height, `flex:1`/`overflow-y:auto`) — true for
the FINAL rendered frame, but not for how the spring gets there. A spring
(`{ stiffness: 260, damping: 32 }`) eases toward its TARGET on a time-
based curve; when the target is 9999 and the real collapsed→expanded
distance is 50-200px, the box visually "arrives" (crosses into the range
where something else is already the binding constraint) after covering
under 2% of the spring's nominal travel — so it reads as a snap, not an
animation ("the animation of closing and opening a composition is rigged
… should feel smooth, not direct", 2026-08-29). Reproduced by sampling
`getComputedStyle(el).maxHeight` every ~40ms during the transition: the
value should climb through a real decelerating curve (0 → 11 → 20 → 26 →
30 → 32 → 33 → 34px, converging smoothly) — a flat 9999 target instead
produces most of that same visual distance in the first one or two
samples, then holds, which reads exactly like what it is: a cut, not a
tween.

The fix is a REAL, precisely-computed target every time, even when the
final rendered size is ultimately bounded by something else:

- Composition tree accordion: `visibleRows.length * TREE_ROW_H +
  (overflowing ? SHOW_MORE_H : 0)` — the actual pixel height of what's
  about to be visible, recomputed on every render (capped vs. fully
  shown), not a constant retuned by hand on each click.
- `CappedRows`' own "Show more": `Math.min(items.length,
  EXPANDED_ROW_WINDOW) * rowH` — a bounded PEEK window (8 rows), not
  "everything" — long lists still end up scrollable via the existing
  `flex:1; overflow-y:auto` `.is-expanded` mechanism once they exceed the
  window, but the spring now has a real, finite distance to travel to
  reach it, so the growth itself is visible before the scroll cuts in.

**A flat "arbitrarily large" `maxHeight` target only looks identical to a
real one in the FINAL frame — sample the animation mid-flight (a
`getComputedStyle` poll, not a single before/after screenshot) before
trusting that it reads as smooth, whenever something else besides the
animated property is also going to bound the box's real size.**
