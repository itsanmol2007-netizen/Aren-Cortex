# Check the rendered page, not the stylesheet

Part of the Cortex Design DNA set — see `README.md` for the pre-flight
checklist and how these files fit together. This pocket is §10 of that
file's original single-document form (2026-08-25), unchanged in content,
just moved.

---

This is the single most expensive mistake this codebase has made on UI
work, and it is being written down here explicitly so it stops recurring:
**do not reason about box models, selector specificity, or animation
timing from reading CSS/JSX alone and call it fixed.** `../SESSION-HANDOFF.md`
(2026-08-25 entry) documents three consecutive passes that each *believed*
they'd fixed the Assessment/Investigations panel from pure code reading,
and each one made it visibly worse — the actual root causes (a descendant
selector accidentally matching a nested card two levels down; an
`overflow: visible` rule fighting a same-specificity `overflow: hidden`
rule elsewhere in the same file) were only found once someone ran the app,
took a screenshot, and used `getBoundingClientRect()` on the live DOM.

If you have a way to run the app and look at it, use it before claiming
anything is fixed. If you don't, say so plainly instead of guessing.
