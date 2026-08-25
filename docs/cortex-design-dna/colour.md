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
