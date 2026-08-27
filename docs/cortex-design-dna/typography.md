# Typography & text density

Part of the Cortex Design DNA set — see `README.md` for the pre-flight
checklist and how these files fit together. This pocket started as §3 of
that file's original single-document form (2026-08-25, moved unchanged);
the clinical-language rule below was added the same day.

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
- **Clinical language, not implementation language.** Cortex ranks/sorts
  suggestions internally, but a doctor-facing label should say what that
  means for THEM, not name the mechanism. "Sort by: Relevance" reads like a
  generic e-commerce list control; `.cs-sort`'s actual copy is now "Most
  relevant first" — same fact, no exposed verb like "sort" or "rank" doing
  the talking. Same test applies to any future label: if it would fit
  equally well on a shopping filter, it is not clinical language yet.

---

## Scale the heading to the page it heads (added 2026-08-27)

The type scale in this file is Consult's — a dense workspace of small
panels. Reused verbatim on a page of large cards, an 11px uppercase
section title reads as a caption that wandered in, not as the page's
heading. Reported on Practice as *"the main page heading and this section
should have more weightage and more bigger size"*.

A page-level section header (its title, its one-line description, and any
summary tiles beside it) is sized against the largest thing below it, not
copied from a denser screen. On Practice that landed at 14px/780 for the
title, 12.5px for the sub, and 22px numerals in the stat tiles — roughly
+3px on each step versus the Consult scale.

The rest of this file still holds: it is a *scale* change, not a licence
for a hero. Still one title, still one line under it, still no paragraph.
