# Start here

This is the one file a cold session reads first, before anything else in
`docs/`. Its only job is to send you to the right next file — not to
explain Aren Cortex itself (that's everything below).

## Read order

1. **This file.** One page, tells you where to go next.
2. **`SESSION-HANDOFF.md`** — short, "temporary, self-replacing": what the
   last session actually did, where the current arc stands, what's next.
   Always read this, every session, even if your task looks unrelated —
   it sometimes says a thing you're about to touch just changed.
3. **Touching any UI — a new page, a new component, or restyling an
   existing one? Read `cortex-design-dna/README.md` before you write a
   line of CSS or JSX.** This is not optional and not routed through the
   table below — it's a pre-flight checklist (layout, spacing, colour,
   icons, motion, empty states, progressive disclosure), the accumulated
   cost of getting those things wrong already paid for once (2026-08-25),
   so the next session doesn't pay it again.
4. **`context/README.md`** — the topic router. Match your task to one row
   in its table and read *only* the pocket file(s) it names. This is
   where "which of the 15 files in `docs/` do I actually need" gets
   answered — don't open `aren-technical-atlas.md` or
   `aren-cortex-ui-doctrine.md` cold; they're big, and the router will
   tell you if you actually need them.

That's the whole system. Everything past this point is context for why it
exists, not something you need to read to start working.

## What Aren Cortex is, in two sentences

A doctor-facing consult workspace — Assessment, Clinical Suggestions
(tests/referrals/advice/exercises/modalities), Medicine, Plan — driven by
a signal→intent ranking engine (`src/lib/synapse/engine.ts`) so what a
doctor sees is pre-sorted by relevance to the current patient, not a flat
catalogue. It sits alongside a front-desk queue app and shares the same
Supabase backend and design language.

## Why this file exists

Before this, a cold start meant guessing which of ~15 loose docs in
`docs/` mattered, or reading the biggest one (`aren-cortex-context.md`,
once ~830 lines) end to end "to be safe" — burning context on sections
that had nothing to do with the actual task. `context/README.md` already
solved the *topic* half of that (route to a pocket, not the whole atlas);
this file solves the *first step* half — `context/README.md` itself was
just one more file sitting among a dozen others in `docs/`, with nothing
telling a cold session to open it first. If you're an AI session starting
cold in this repo: this is that signal. Read the order above, then stop
reading this file.
