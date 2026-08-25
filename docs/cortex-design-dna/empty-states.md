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
