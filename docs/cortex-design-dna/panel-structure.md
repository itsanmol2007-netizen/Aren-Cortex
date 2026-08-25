# Panel / card structure

Part of the Cortex Design DNA set — see `README.md` for the pre-flight
checklist and how these files fit together. This pocket is §2 of that
file's original single-document form (2026-08-25), unchanged in content,
just moved.

---

Every panel is `.cs-card` (`display:flex; flex-direction:column`, one
border, one radius, one shadow — all three from tokens, never hand-rolled).
Inside it, the recipe is always:

```
.cs-card-head            — icon tile (26px, .cs-glyph) + title, one row
  [optional tabs / filter row]
.cs-rec-search            — the search box, IntentSearchField, everywhere
.cs-ranked-head            — "RANKED X" label + "N of M" count, ONLY when
                              there is something to rank (see empty-states.md)
.cs-list (motion.div)     — the capped/scrollable body (see progressive-disclosure.md)
.cs-card-foot-more        — "Show more", a SIBLING below the list, never
                              the list's own last row
```

This is not four components that happen to look similar — `ConditionsCard`
and `SuggestionsCard` are required to share the literal CSS classes for
this recipe (`.cs-ranked-head`, `.cs-ranked-label`, `.cs-ranked-count`,
`.cs-card-foot-more`), specifically so the two cannot drift apart the way
they did across three separate passes on 2026-08-25 before this document
existed. **When you build a new ranked panel, reuse these classes — do not
invent a new one that merely looks the same today.**

Spacing inside a card comes from `--cs-s1`…`--cs-s5` (3/6/9/12/15px), never
a bespoke pixel value chosen by eye.
