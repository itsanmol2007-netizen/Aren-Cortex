# Responsive & grid rhythm

Part of the Cortex Design DNA set — see `README.md` for the pre-flight
checklist and how these files fit together. This pocket is §8 of that
file's original single-document form (2026-08-25), unchanged in content,
just moved.

---

Two side-by-side panels of the same conceptual weight (Assessment /
Investigations is the reference pair) must share:
- the **same header height** (icon size, title row, and any "Sort by"
  control — if one panel has it, so does its sibling, or neither does);
- the **same row height** for their ranked lists (`progressive-disclosure.md`'s
  shared constant);
- the **same collapsed and expanded box heights**, so "Show more" /
  "Show less" land at the same y on both sides.

When they visibly don't, the fix is almost never "add height X to close
the gap" — it's finding which of the two panels is carrying **extra
structural chrome the other doesn't** (a description line one panel has
and the other lacks; a header row rendered unconditionally on one side and
conditionally on the other) and making the two symmetric at the source,
not papering over the symptom with arbitrary spacing. (2026-08-25 shipped
three separate CSS passes trying the papering-over approach; all three
made it worse. The actual fix, once found, was two component-level gates
made to match — see git history on that date for the full account.)

A genuinely data-driven difference (one panel has doctor free-terms
matching this chart, the other doesn't) is not a layout bug and should not
be forced into artificial alignment by reserving dead space — that trades
a real, honest difference for a fake, static one.

Below `1180px`, the Assessment/side-slot pair stacks to one column
(`.cs-assess-body { grid-template-columns: 1fr; }` is the precedent) —
follow that breakpoint for any new side-by-side pair rather than picking a
new one.
