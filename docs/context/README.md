# Context pockets — read one, not everything

**The problem this solves:** a cold start used to mean "read the whole
atlas" — dental, frontdesk, auth, dermatology, all of it — even for a task
that touches one corner. That's why sessions were burning huge context on
work that never needed most of it.

**The rule now:** read `SESSION-HANDOFF.md` first (always, it's short —
what happened last, what's next). Then match your task below and read
**only that file.** Don't open `aren-technical-atlas.md` or
`aren-cortex-ui-doctrine.md` directly unless a pocket tells you to, or your
task doesn't fit any pocket.

| Working on... | Read | Skip |
|---|---|---|
| A specialty (physio, cardiology, next one) — profile config, its own input screen, phases | `specialties.md` | frontdesk, auth, engine internals unless the pocket says to |
| Synapse itself — signals, intents, rules, guards, ranking | `engine.md` | frontdesk, specialty UI detail |
| The consult screen's own architecture — hooks, keyboard, layout doctrine | `consult-ui.md` | engine internals, frontdesk |
| Cortex's own "current state" doc (what it is, file tree, data model, standing rules, change map, open work, gotchas) — **2026-08-24: this used to be one ~830-line file, now split** | `cortex-overview.md` / `cortex-data-model.md` / `cortex-intelligence-summary.md` / `cortex-standing-rules.md` / `cortex-change-map.md` / `cortex-open-physio.md` / `cortex-open-crosscutting.md` / `cortex-gotchas.md` — start from `../aren-cortex-context.md`'s own index table if unsure which one | the other `cortex-*.md` pockets you don't need |
| Front desk / patient queue / clinic status | `../aren-frontdesk-source-of-truth.md` + `../aren-frontdesk-brief.md` | everything above |
| Auth / login / roles | `../Login Screen Implementation.md` | everything above |
| Something none of these cover, or you need the full history of a decision | `../aren-technical-atlas.md` (search for the section, don't read start to finish) | — |

**Each pocket is self-contained** — current state, the load-bearing rules,
the traps, pointers to real files. It is deliberately NOT the full history;
if a pocket doesn't answer your question, that's the signal to go to the
atlas for that one thing, not to read the atlas generally "to be safe."

**Keeping this in sync:** when a session does real work in one of these
areas, it updates that pocket (short — what changed, what's the state now)
instead of only writing an atlas entry. The atlas stays the permanent
record; the pocket stays the fast path in.
