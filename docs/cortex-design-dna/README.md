# Cortex Design DNA

*What the doctor-facing screen must look and feel like — read this before
you write a line of CSS or JSX for Cortex, not after.*

**This is a pre-flight reference, not an optional style guide.** If you are
about to create or touch any Cortex page, card, panel or empty state, read
§0 below and the pocket file(s) it points you to, before you write code.
Nothing here is a suggestion you can weigh against your own taste — it is
the accumulated cost of getting these things wrong, paid for once already
(§10 names the sessions that paid it) so the next one doesn't have to.

**Scope.** This set of files owns the *visual and structural DNA* — layout
composition, spacing, typography, colour, icons, motion, progressive
disclosure, empty states. It does not re-explain:
- **why the screen is shaped like a consult, not a form** — that is
  `../aren-cortex-ui-doctrine.md`, the architecture doctrine;
- **the founding aspirational principles** ("calm clinical workspace",
  "high information density, low visual density") — that is
  `../Aren cortex visual philosophy.md`, still true, still worth reading
  once;
- **modal/sheet specifics** (sizing, accent colour, header shape) — that is
  `../aren-modal-design.md`;
- **the technical stack, file tree, or data model** — that is
  `../aren-technical-atlas.md` (and its `../context/` pockets), the
  technical source of truth for Cortex. This set complements that
  document; it does not duplicate it.

Read the pocket file for the concrete, load-bearing rule; each one points
back to the doctrine file if you need the reasoning behind it.

---

## 0. Pre-flight checklist — match your task, read that file

Before shipping any Cortex UI change, answer these. If you can't answer
one, go read the matching file — don't guess.

| # | Question | If you can't answer it, read |
|---|---|---|
| 1 | Does this give one component the whole horizontal canvas? If yes, that's very rarely correct here. | `layout-composition.md` |
| 2 | Does every card on this row use `.cs-card` (or a documented variant) and the shared spacing tokens (`--cs-s1`…`--cs-s5`)? | `panel-structure.md` |
| 3 | Is there a sentence of UI prose where a short label plus a tooltip would do? — the single most common regression. | `typography.md` |
| 4 | Did you pick a colour, or reuse one of the seven semantic ones? There is no eighth colour. | `colour.md` |
| 5 | Is every icon inline SVG from the existing family, or a `lucide-react` icon already used elsewhere for the same meaning? No new icon files, no emoji, ever. | `icons.md` |
| 6 | If this animates, does it use the shared spring config and respect `useReducedMotion()`? | `motion.md` |
| 7 | If a list can grow past ~5 rows, is it capped with "Show more" rather than dumped in full? | `progressive-disclosure.md` |
| 8 | If two panels sit side by side, will their header height, row height and "Show more" controls land on the same pixel when both are populated — and both empty? | `responsive-grid.md` |
| 9 | Does the empty state say the minimum true thing, once, with the family's SVG — not a fresh icon, not three sentences? | `empty-states.md` |
| 10 | Have you actually looked at this rendered, not just read the CSS? Getting this backwards is documented at length in `../SESSION-HANDOFF.md`'s 2026-08-25 entry. | `verification.md` |

Each pocket file is self-contained (the concrete rule, the real bug or
complaint it traces to, pointers to the actual files it governs) — read
only the one(s) your task needs, the same way `../context/README.md`
routes the rest of `docs/`.

---

## 10. Where this came from

Every rule in every pocket file traces to a real, dated complaint or a
real, dated bug — not a taste preference invented for this document. The
fullest single account is `../SESSION-HANDOFF.md`'s "STOP, read this"
section dated 2026-08-25, plus the git history on `master` for that date
(search `git log --oneline` around commits `a21a1cf`…`4b7304b` and after).
When you add a new rule to one of these files, anchor it the same way —
what broke, what the actual root cause was, what the rule now prevents —
so the next reader can tell a real constraint from a preference.
