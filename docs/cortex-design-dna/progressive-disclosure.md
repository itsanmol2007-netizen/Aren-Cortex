# Expansion & pagination — progressive disclosure

Part of the Cortex Design DNA set — see `README.md` for the pre-flight
checklist and how these files fit together. This pocket is §7 of that
file's original single-document form (2026-08-25), unchanged in content,
just moved.

---

**Show 4–6 by default; search or "Show more" reaches the rest. Never a
catalogue dump.** This applies uniformly:

- A ranked list caps at 4–5 rows (`capped` prop / `CAP` constant) with a
  "Show more" toggle below it, expanding into a *bounded, scrolling* box
  (`4.5 * ROW_H`, stopping mid-row on purpose so it visibly reads as a
  scroll box, not a clean second page) — never an unbounded list that
  grows the whole card and shoves the page under it.
- A picker/search modal with nothing typed shows a **small default set**
  (5–6 items, catalogue order), not everything — `MeasurementSearch`
  showed 20–30 pill chips before 2026-08-25's fix capped it to
  `DEFAULT_VISIBLE = 6` with a quiet "+N more — search to find them" line.
  The search field is what handles discovery of the rest; the default view
  is not a second catalogue one layer down from the first.
- **Row height for the capped/expand math is a shared constant**
  (`RANKED_ROW_H` in `parts.tsx`), not a number each card guesses
  separately — two cards guessing independently is exactly how
  `ConditionsCard` (53px, measured) and `SuggestionsCard` (58, then 79px,
  both guessed) ended up with different expanded heights side by side.
  When a row's real content differs (e.g. a kind-label line only some
  instances show), compute a *second*, still-measured constant for that
  case (`MULTI_TYPE_ROW_H`) — don't reuse the shared one for a visibly
  different row shape, and don't invent a third number without measuring.
