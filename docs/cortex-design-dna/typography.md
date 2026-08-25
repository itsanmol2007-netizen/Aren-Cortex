# Typography & text density

Part of the Cortex Design DNA set — see `README.md` for the pre-flight
checklist and how these files fit together. This pocket is §3 of that
file's original single-document form (2026-08-25), unchanged in content,
just moved.

---

**Clinical, compact, purposeful. A label beats a sentence; a sentence
beats a paragraph; a paragraph never appears.**

- A panel's identity is its title (`.cs-card-title` / an `<h2>`), not a
  restated sentence under it. "RANKED CONDITIONS" already says the list is
  ranked; a full line underneath repeating *how* it's ranked is the kind
  of "useless text taking vertical space" that was cut on 2026-08-25 — the
  explanation moved to a native `title=""` tooltip on the label
  (`cursor: help`, `text-decoration: underline dotted` is the visible hint
  it's there), costing zero vertical space instead of one whole row.
- Empty-state copy is exactly two lines: a bold `<strong>` fact ("Nothing
  planned yet") and one short `<span>` next-action ("Search above to add
  one."). Never three sentences, never a restatement of the heading. See
  `empty-states.md`.
- Body/label type scale already exists — `.cs-ranked-label` (10.5px, 700,
  uppercase, tracked), `.cs-sug-name`/`.cs-ident-brand` (14px, 640-660),
  `.cs-faint`/`.cs-muted` for anything secondary. Reuse these; don't
  introduce a new size for a one-off string.
- If you're tempted to explain a UI concept in prose on the page itself,
  the actual fix is usually a **shorter label plus a tooltip**, not a
  well-written paragraph. Prose that explains the UI is a sign the UI
  itself needs a clearer label.
