# AREN CORTEX — CONTEXT (index)

*The doctor-facing half of Arenode. Current state only — no session logs, no history.*

Scope: **Cortex only** (`src/features/consult/` + supporting hooks/lib). Front Desk
(`src/features/frontdesk/`) is a separate suite, out of scope here except where noted.

**Split into pockets 2026-08-24** — this file had grown to ~830 lines, all of
it read on every task even when only one section was relevant. Same problem
`docs/context/README.md` already solved once for the wider codebase
(specialties/engine/consult-ui pockets); this applies the identical fix to
this file specifically. **Read the one row below your task needs — not this
whole file, and not every pocket "to be safe."** Each pocket is
self-contained and says at its own foot what it does NOT cover and where
that lives instead.

| Working on… | Read |
|---|---|
| What Cortex is, the file tree — where things live | `context/cortex-overview.md` |
| The data model — which table holds what | `context/cortex-data-model.md` |
| How the Synapse engine is wired into Cortex (not engine internals — see below) | `context/cortex-intelligence-summary.md` |
| A rule you're not sure is still in force — **read this before any change, however small** | `context/cortex-standing-rules.md` |
| "Where do I change X" — a straight lookup table | `context/cortex-change-map.md` |
| Open/unfinished physiotherapy work | `context/cortex-open-physio.md` |
| Open/unfinished cross-cutting work (sidebar, WhatsApp, layout bugs, the running bug-fix log) | `context/cortex-open-crosscutting.md` |
| A one-liner trap worth knowing before you hit it | `context/cortex-gotchas.md` |
| Synapse internals — adding a signal/rule/guard, `IntentType`, the pipeline shape | `context/engine.md` |
| Consult screen architecture — hooks, keyboard, layout doctrine | `context/consult-ui.md` |
| A specialty profile — config, its own input screen, phases | `context/specialties.md` |
| Something none of the above covers | `context/README.md` routes the rest (front desk, auth, or "read the atlas for one thing, don't read it generally") |

**Keeping this in sync:** a session doing real work updates the ONE pocket
that changed, the same convention `context/README.md` already established —
never grow this index file back into a monolith. If a change touches more
than one pocket, update each one, briefly, in place.
