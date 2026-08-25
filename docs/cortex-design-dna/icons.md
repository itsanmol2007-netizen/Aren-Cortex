# Icons & SVGs

Part of the Cortex Design DNA set — see `README.md` for the pre-flight
checklist and how these files fit together. This pocket is §5 of that
file's original single-document form (2026-08-25), unchanged in content,
just moved.

---

**No emoji. No decorative icon dropped in because it was handy.** Two
approved sources only:

1. **`lucide-react`**, for functional/interactive icons (buttons, row
   glyphs, card-head tiles) — reuse the SAME icon for the same meaning
   everywhere it appears (e.g. `FlaskConical` always means "investigation",
   never reused for something else on the same screen).
2. **`BlankArt.tsx`**, for empty-state illustrations *only* — see
   `empty-states.md`. Every member of that family is inline SVG, drawn to
   one shared recipe (see that file's own header comment): one line weight
   (1.5–1.7px), one corner radius, 44–62px, palette from `colour.md` at its
   lightest, and the subject is always *the thing that will fill this
   panel, at rest* — never a magnifying glass, a sad face, or a shrug. A
   raw `lucide-react` icon dropped straight into an empty state (as
   `PlanCard`'s `ClipboardList` was, until 2026-08-25) is a Design DNA
   violation even if it "looks fine" — it breaks the family's line weight
   and doesn't share the subject-at-rest rule.

Adding a new empty state means adding a new `Blank*Art` function to
`BlankArt.tsx`, not reaching for a generic icon.
