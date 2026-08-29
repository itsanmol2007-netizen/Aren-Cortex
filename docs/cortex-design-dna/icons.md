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

## A page-level background watermark needs its own shape, not a blown-up logo (added 2026-08-29)

A large, faint decorative SVG behind a whole page's cards (Practice's
corner watermark) is neither of the two sources above — it's canvas
texture, not an icon — but the trap is specific enough to write down: the
first attempt reused `ArenMark` (the login screen's small "A" constellation
letterform) blown up to 520px and cropped at the corner, and it read as
"trash... not even looking properly" once actually rendered at that scale.
A letterform is drawn to be LEGIBLE at a small size, straight strokes
spelling a specific shape — scaled 9× and cropped, the strokes are no
longer readable as the letter, so all that's left is a handful of
arbitrary-looking diagonal lines. It doesn't survive the crop because it
was never built for one.

`PracticeCanvasArt` (`PracticePage.tsx`) is the corrected version: a loose
SCATTER of nodes and connecting lines (no letterform, no single "correct"
reading), a few starred nodes for visual interest, hand-placed denser
toward the corner it bleeds off of. A scatter has no shape to break —
crop it anywhere and it still reads as "a scatter of nodes," which is
exactly why it's the right shape for a decoration whose whole point is to
bleed off an edge at a size nobody designed a fixed viewBox to accommodate.
**Before scaling any existing mark up for a background/watermark use, ask
whether the mark's legibility depends on being seen at roughly its
original size — if it does, it needs a purpose-built scatter/texture
instead, not a bigger `<svg>` of the same paths.**
