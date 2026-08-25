# Cortex Design DNA

*What the doctor-facing screen must look and feel like, in checklist form —
read this before you write a line of CSS or JSX for Cortex, not after.*

**This is a pre-flight reference, not an optional style guide.** If you are
about to create or touch any Cortex page, card, panel or empty state, read
§0 and the section(s) that match what you're doing, before you write code.
Nothing here is a suggestion you can weigh against your own taste — it is
the accumulated cost of getting these things wrong, paid for once already
(§11 names the sessions that paid it) so the next one doesn't have to.

**Scope.** This file owns the *visual and structural DNA* — layout
composition, spacing, typography, colour, icons, motion, progressive
disclosure, empty states. It does not re-explain:
- **why the screen is shaped like a consult, not a form** — that is
  `../aren-cortex-ui-doctrine.md`, the architecture doctrine;
- **the founding aspirational principles** ("calm clinical workspace",
  "high information density, low visual density") — that is
  `../Aren cortex visual philosophy.md`, still true, still worth reading
  once;
- **modal/sheet specifics** (sizing, accent colour, header shape) — that is
  `../aren-modal-design.md`.

Read this file for the concrete, load-bearing rule; follow its pointer if
you need the reasoning behind it.

---

## 0. Pre-flight checklist

Before shipping any Cortex UI change, answer these. If you can't answer
one, go read the matching section below — don't guess.

1. **Does this give one component the whole horizontal canvas?** If yes,
   see §1 — that's very rarely correct here.
2. **Does every card on this row use `.cs-card` (or a documented variant)
   and the shared spacing tokens (`--cs-s1`…`--cs-s5`)?** See §2.
3. **Is there a sentence of UI prose where a short label plus a tooltip
   would do?** See §3 — this is the single most common regression.
4. **Did you pick a colour, or reuse one of the seven semantic ones?**
   There is no eighth colour. See §4.
5. **Is every icon inline SVG from the existing family, or a `lucide-react`
   icon already used elsewhere for the same meaning?** No new icon files,
   no emoji, ever. See §5.
6. **If this animates, does it use the shared spring config and respect
   `useReducedMotion()`?** See §6.
7. **If a list can grow past ~5 rows, is it capped with "Show more" rather
   than dumped in full?** See §7.
8. **If two panels sit side by side, will their header height, row height
   and "Show more" controls land on the same pixel when both are
   populated — and both empty?** See §8.
9. **Does the empty state say the minimum true thing, once, with the
   family's SVG — not a fresh icon, not three sentences?** See §9.
10. **Have you actually looked at this rendered, not just read the CSS?**
    See §10 — this is not optional, and getting it backwards is documented
    at length in `../SESSION-HANDOFF.md`'s 2026-08-25 entry.

---

## 1. Layout & composition

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

## 2. Panel / card structure

Every panel is `.cs-card` (`display:flex; flex-direction:column`, one
border, one radius, one shadow — all three from tokens, never hand-rolled).
Inside it, the recipe is always:

```
.cs-card-head            — icon tile (26px, .cs-glyph) + title, one row
  [optional tabs / filter row]
.cs-rec-search            — the search box, IntentSearchField, everywhere
.cs-ranked-head            — "RANKED X" label + "N of M" count, ONLY when
                              there is something to rank (see §9)
.cs-list (motion.div)     — the capped/scrollable body (see §7)
.cs-card-foot-more        — "Show more", a SIBLING below the list, never
                              the list's own last row
```

This is not four components that happen to look similar — `ConditionsCard`
and `SuggestionsCard` are required to share the literal CSS classes for
this recipe (`.cs-ranked-head`, `.cs-ranked-label`, `.cs-ranked-count`,
`.cs-card-foot-more`), specifically so the two cannot drift apart the way
they did across three separate passes on 2026-08-25 before this document
existed. **When you build a new ranked panel, reuse these classes — do not
invent a new one that merely looks the same today.**

Spacing inside a card comes from `--cs-s1`…`--cs-s5` (3/6/9/12/15px), never
a bespoke pixel value chosen by eye.

## 3. Typography & text density

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
  one."). Never three sentences, never a restatement of the heading. See §9.
- Body/label type scale already exists — `.cs-ranked-label` (10.5px, 700,
  uppercase, tracked), `.cs-sug-name`/`.cs-ident-brand` (14px, 640-660),
  `.cs-faint`/`.cs-muted` for anything secondary. Reuse these; don't
  introduce a new size for a one-off string.
- If you're tempted to explain a UI concept in prose on the page itself,
  the actual fix is usually a **shorter label plus a tooltip**, not a
  well-written paragraph. Prose that explains the UI is a sign the UI
  itself needs a clearer label.

## 4. Colour

**There are seven semantic colours, and colour never carries mood — only
meaning.** From `aren-cortex-ui-doctrine.md` §5, the authoritative list:

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

## 5. Icons & SVGs

**No emoji. No decorative icon dropped in because it was handy.** Two
approved sources only:

1. **`lucide-react`**, for functional/interactive icons (buttons, row
   glyphs, card-head tiles) — reuse the SAME icon for the same meaning
   everywhere it appears (e.g. `FlaskConical` always means "investigation",
   never reused for something else on the same screen).
2. **`BlankArt.tsx`**, for empty-state illustrations *only* — see §9. Every
   member of that family is inline SVG, drawn to one shared recipe (see
   that file's own header comment): one line weight (1.5–1.7px), one corner
   radius, 44–62px, palette from §4 at its lightest, and the subject is
   always *the thing that will fill this panel, at rest* — never a
   magnifying glass, a sad face, or a shrug. A raw `lucide-react` icon
   dropped straight into an empty state (as `PlanCard`'s `ClipboardList`
   was, until 2026-08-25) is a Design DNA violation even if it "looks
   fine" — it breaks the family's line weight and doesn't share the
   subject-at-rest rule.

Adding a new empty state means adding a new `Blank*Art` function to
`BlankArt.tsx`, not reaching for a generic icon.

## 6. Animation & motion

Built on `motion/react` (Framer Motion). Two hard rules:

1. **Every animation branches on `useReducedMotion()`** — `reduce ?
   { duration: 0 } : { type: "spring", ... }`. No exceptions; this is
   accessibility, not polish.
2. **A capped list's expand/collapse is a `motion.div` animating
   `maxHeight` on the list itself, not a `layout` prop on the whole card.**
   `layout` animates a subtree via a scale transform, which does not
   compose with a child that has its own `overflow: auto` — this was tried
   on 2026-08-25, reverted the same day, because it reintroduced exactly
   the "still overflowing when clicking show more" bug it was meant to fix.
   The local `maxHeight` tween (`{ type: "spring", stiffness: 260,
   damping: 32 }`, the shared config `ConditionsCard`/`SuggestionsCard`
   both use) is the correct mechanism — see §7 for the row-height math it
   depends on.

Micro-interactions elsewhere (a card entering, a ring pulsing) use a
snappier `{ stiffness: 420–460, damping: 34 }` — reserve the slower
260/32 spring specifically for capped-list expand/collapse, so a doctor
reads "the list is growing" differently from "something just appeared."

Never animate a restructure of the whole page for a local interaction —
selecting a chip, expanding one card — should never visibly reflow
unrelated panels.

## 7. Expansion & pagination — progressive disclosure

**Show 4–6 by default; search or "Show more" reaches the rest. Never a
catalogue dump.** This applies uniformly:

- A ranked list caps at 4–5 rows (`capped` prop / `CAP` constant) with a
  "Show more" toggle below it, expanding into a *bounded, scrolling* box
  (`4.5 * ROW_H`, stopping mid-row on purpose so it visibly reads as a
  scroll box, not a clean second page) — never an unbounded list that
  grows the whole card and shoves the page under it.
- A picker/search modal with nothing typed shows a **small default set**
  (5–6 items, catalogue order), not everything — `MeasurementSearch`
  showed 20–30 pill chips before 2026-08-25's fix capped it to
  `DEFAULT_VISIBLE = 6` with a quiet "+N more — search to find them" line.
  The search field is what handles discovery of the rest; the default view
  is not a second catalogue one layer down from the first.
- **Row height for the capped/expand math is a shared constant**
  (`RANKED_ROW_H` in `parts.tsx`), not a number each card guesses
  separately — two cards guessing independently is exactly how
  `ConditionsCard` (53px, measured) and `SuggestionsCard` (58, then 79px,
  both guessed) ended up with different expanded heights side by side.
  When a row's real content differs (e.g. a kind-label line only some
  instances show), compute a *second*, still-measured constant for that
  case (`MULTI_TYPE_ROW_H`) — don't reuse the shared one for a visibly
  different row shape, and don't invent a third number without measuring.

## 8. Responsive & grid rhythm

Two side-by-side panels of the same conceptual weight (Assessment /
Investigations is the reference pair) must share:
- the **same header height** (icon size, title row, and any "Sort by"
  control — if one panel has it, so does its sibling, or neither does);
- the **same row height** for their ranked lists (§7's shared constant);
- the **same collapsed and expanded box heights**, so "Show more" /
  "Show less" land at the same y on both sides.

When they visibly don't, the fix is almost never "add height X to close
the gap" — it's finding which of the two panels is carrying **extra
structural chrome the other doesn't** (a description line one panel has
and the other lacks; a header row rendered unconditionally on one side and
conditionally on the other) and making the two symmetric at the source,
not papering over the symptom with arbitrary spacing. (2026-08-25 shipped
three separate CSS passes trying the papering-over approach; all three
made it worse. The actual fix, once found, was two component-level gates
made to match — see git history on that date for the full account.)

A genuinely data-driven difference (one panel has doctor free-terms
matching this chart, the other doesn't) is not a layout bug and should not
be forced into artificial alignment by reserving dead space — that trades
a real, honest difference for a fake, static one.

Below `1180px`, the Assessment/side-slot pair stacks to one column
(`.cs-assess-body { grid-template-columns: 1fr; }` is the precedent) —
follow that breakpoint for any new side-by-side pair rather than picking a
new one.

## 9. Empty states

**Useful, restrained, visually aligned — never information-heavy.**

- Exactly `<BlankXArt /> <strong>fact</strong> <span>next action</span>` —
  see §3 and §5. No third line.
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

## 10. Check the rendered page, not the stylesheet

This is the single most expensive mistake this codebase has made on UI
work, and it is being written down here explicitly so it stops recurring:
**do not reason about box models, selector specificity, or animation
timing from reading CSS/JSX alone and call it fixed.** `SESSION-HANDOFF.md`
(2026-08-25 entry) documents three consecutive passes that each *believed*
they'd fixed the Assessment/Investigations panel from pure code reading,
and each one made it visibly worse — the actual root causes (a descendant
selector accidentally matching a nested card two levels down; an
`overflow: visible` rule fighting a same-specificity `overflow: hidden`
rule elsewhere in the same file) were only found once someone ran the app,
took a screenshot, and used `getBoundingClientRect()` on the live DOM.

If you have a way to run the app and look at it, use it before claiming
anything is fixed. If you don't, say so plainly instead of guessing.

---

## 11. Where this came from

Every rule above traces to a real, dated complaint or a real, dated bug —
not a taste preference invented for this document. The fullest single
account is `../SESSION-HANDOFF.md`'s "STOP, read this" section dated
2026-08-25, plus the git history on `master` for that date (search
`git log --oneline` around commits `a21a1cf`…`4b7304b` and after). When you
add a new rule here, anchor it the same way — what broke, what the actual
root cause was, what the rule now prevents — so the next reader can tell a
real constraint from a preference.
