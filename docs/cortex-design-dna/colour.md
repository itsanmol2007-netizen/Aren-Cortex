# Colour

Part of the Cortex Design DNA set — see `README.md` for the pre-flight
checklist and how these files fit together. This pocket is §4 of that
file's original single-document form (2026-08-25), unchanged in content,
just moved.

---

**There are seven semantic colours, and colour never carries mood — only
meaning.** From `../aren-cortex-ui-doctrine.md` §5, the authoritative list:

| Token | Hex | Means |
|---|---|---|
| `--cs-blue` | `#1268e8` | the action |
| `--cs-rose` | `#e11d48` | reported (by the patient) |
| `--cs-teal` | `#0f766e` | examined (by the doctor) |
| `--cs-violet` | `#7c3aed` | the engine's own reading (Assessment) |
| `--cs-amber` | `#b45309` | soft guard |
| `--cs-red` | `#b42318` | hard guard |
| `--cs-green` | `#16a34a` | taken / added to the plan |

Every one of these has a `-soft` background pair (e.g. `--cs-blue-soft`)
for tinted fills. **There is no eighth colour.** A new panel needing an
accent picks the closest of the seven by meaning, not by what looks nice
next to its neighbours — Investigations' icon tile is recoloured to match
Assessment's violet specifically *because* it's the same family of output
(the engine's reading), not for visual harmony alone.

Neutrals: `--cs-ink` (headline text), `--cs-muted`/`--cs-label`/`--cs-faint`
(three steps of secondary text, darkest to lightest), `--cs-line`/
`--cs-line-strong` (hairlines), `--cs-page`/`--cs-card` (the two surfaces).

## Thread the tone through, don't re-pick blue everywhere (added 2026-08-28)

A page of several cards, each with its own tone (`.prac-glyph.is-teal`,
`.is-violet`, `.is-slate`…), still read as monochrome once every count
badge, every "Manage →" link, every bordered button on every card used
`--cs-blue` regardless of which tone that card's own icon carried — "do not
use the same pink/purple link accent for every model or action." The fix
is not a new colour per card; it's making every accent ON a card inherit
that SAME card's tone: `.prac-card--teal .prac-count`, `.prac-card--teal
.prac-foot-link`, `.prac-card--teal .prac-empty-action` all read teal,
because the card itself carries a `prac-card--{tone}` modifier class next
to its `.prac-glyph.is-{tone}`. Four tones in, four tones out — still no
eighth colour, just no longer flattening four into one by default.

The one deliberate exception: a count can mean something more specific
than "this card's tone" — Preferred Medicines' count is GREEN
(`--cs-green`, "taken/added to the plan") because every unit in it is a
medicine the practice actively marked preferred, not merely an echo of the
card's own teal icon. That's `PracticeCard`'s `countTone` prop overriding
the default — a named exception with a semantic reason, not a fifth tone
picked because it looked nice.
