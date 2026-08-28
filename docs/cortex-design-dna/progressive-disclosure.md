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

---

## A capped list must say how much it is holding (added 2026-08-27)

Capping without a count is indistinguishable from data loss. A companions
modal showing 5 of 26 pairings, with the rest behind an internal scroll
and nothing on screen saying so, was read as *"it's just showing 5, where
are the others?"* — a reasonable reading, because nothing contradicted it.

Every capped or internally-scrolling list carries its total, in the
section header, in the same `.cs-ranked-count` / `.prac-section-count`
shape Consult's ranked panels already use: **"5 of 26 · scroll for
more"**. Derive the visible number from a named constant that matches the
CSS window (`COMPANION_VISIBLE = 5` against a 232px box of 46px rows), so
the count cannot drift from what is actually on screen.

## An affordance gated behind another affordance can gate itself shut (added 2026-08-28)

`SuggestionsCard`'s free-text "add your own" row was, correctly, gated on
`effectiveType` — file a typed line under the wrong intent type and it's
wrong data, so the code refuses to guess which of Test/Referral/Advice a
line belongs to until a doctor has picked one via the category tabs.
Reasonable in isolation. But those SAME tabs are, also correctly, gated on
`nonEmptySections` — no tab for a category with nothing ranked in it yet
(`panel-structure.md`'s "chrome, not a filter" rule). On a fresh chart
both rules are individually right and their combination is a dead end: no
tab exists to pick a type, so `effectiveType` can never become non-null,
so the free-text row can never appear — a doctor typing their own advice
line before anything ranked got "Nothing matches… Try the name, or the
symptom you are treating" with zero action available. Reproduced live,
not spotted by reading either rule alone.

The fix doesn't touch either gate — the tab-visibility rule is still
exactly what `panel-structure.md` documents. It adds a THIRD state
alongside "type chosen" (pick from THAT type's matches) and "nothing typed
yet": when a query has NO catalogue hits and no type is in view, offer an
explicit "Add '<query>' as: [Referral] [Advice]" choice — one button per
free-text-capable type this instance actually covers — so the doctor
supplies the type by hand instead of the UI inferring nothing. When you
add a second gate to something that already has one, check what happens
when BOTH are simultaneously in their most-restrictive state, not just
each alone.
