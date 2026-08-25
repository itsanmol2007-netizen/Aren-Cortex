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
