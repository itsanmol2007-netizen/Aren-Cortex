# Layout & composition

Part of the Cortex Design DNA set — see `README.md` for the pre-flight
checklist and how these files fit together. This pocket is §1 of that
file's original single-document form (2026-08-25), unchanged in content,
just moved.

---

**Rule: a page is a composition of panels, not one component stretched to
fill the canvas.** The workspace is built from a small set of fixed
primitives — a two/three-column entry row, the Assessment+Investigations
pair, the Plan row, the summary rail — and every specialty configures what
goes *inside* those primitives. It never invents a new one for itself (see
the "AREN Design Law" in the visual philosophy doc: *"a new specialty must
never require a new layout, only new content inside existing
primitives"*).

Concretely:
- Default to a **2–3 column grid** for any row of related panels
  (`grid-template-columns`, or the `.cs-row`/`.cs-row-plan` pattern already
  in `consult.css`), not a single full-width block with internal tabs
  standing in for what should be visually separate panels.
- A panel that is conceptually "the same row" as its neighbour (Assessment
  / Investigations is the reference pair) starts on the **same grid row**,
  with its own header + search at the same height as its neighbour's — not
  stacked so one reads as a subsection of the other. This was a real,
  reported bug (2026-08-25: "Investigation is not a subsection of
  Assessment, they are two sections living side by side").
- The overall page is a column of these rows (`.cs-page`), each row bounded
  in height by its content, never by an arbitrary `min-height` (see §5 of
  the ui-doctrine's standing rules: *"module height is content-driven"*).
- The summary/plan rail runs the full column height by design (it is the
  one exception) — don't generalise "full height" from it to other panels.
