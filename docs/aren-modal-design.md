# How a modal in Aren looks

One visual language, one CSS shape, reused by every modal in the app —
so "the medicine adder model wtf bro" never happens again because a modal
was built from scratch instead of from this.

The reference implementation is `PatientModal.tsx` (`.pm-*` in
`src/styles/components-modals.css`) — the Patient Intake modal. It is not
being touched or generalised into a shared component; it stays exactly as
it is and stays the example every other modal is built to match. This doc
is what "match it" means in practice, and what changes between modals
(the accent colour, the icon) versus what never does (everything else).

## The shape (never changes)

Every modal is: a blurred backdrop, a white rounded card, a 4px gradient
stripe across the very top, a header with an icon tile + eyebrow + title +
close button, then body sections, then a footer with Cancel + a solid
primary action.

| Layer | Spec |
|---|---|
| Overlay | `position: fixed; inset: 0`, centered content, `rgba(8,16,35,0.45)` scrim, `backdrop-filter: blur(10px) saturate(1.4)` |
| Card | `width: min(420–520px, 100%)`, `border-radius: 20px` (or 18px for a wider panel), `background: rgba(255,255,255,0.97)`, layered shadow (`0 2px 4px … / 0 8px 24px … / 0 32px 80px …`), `overflow: hidden` |
| Top stripe | `height: 4px`, full width, matches the card's top radius, **the accent gradient** (see below) |
| Header | icon tile (30px, 8px radius, soft gradient bg in the accent family) + eyebrow (10px, uppercase, bold, accent colour) + title (15px, bold, `#0f172a`) on the left; a round ghost close button on the right |
| Search / input | 40px tall, 11px radius, `rgba(248,250,252,0.9)` background, hairline border, **accent-coloured focus ring** (`0 0 0 3px` at 12% opacity) |
| Primary button | full-width or paired with Cancel, 42px tall, 12px radius, **accent gradient background**, white bold text, soft accent-tinted shadow |
| Ghost button | 42px tall, 12px radius, `rgba(0,0,0,0.03)` background, hairline border, slate text |

Nothing above is optional per-modal styling — it is the shape. What
changes between modals is one thing: **the accent**.

## The accent

Every modal picks ONE accent colour family. It shows up in exactly four
places, always the same four:

1. the top stripe gradient
2. the header icon tile's icon colour (+ its soft gradient background)
3. the eyebrow text colour
4. the primary button's gradient + focus rings

| Domain | Accent | Stripe gradient |
|---|---|---|
| Patient (identity, intake) | Pink → purple | `#f472b6 → #a855f7 → #6366f1` (`.pm-*`, unchanged, the reference) |
| Medicine (brand, dose, timing) | Teal | `#2dd4bf → #0f766e → #115e59` |

Teal for medicine is deliberate, not arbitrary: it is already this app's
colour for "medicine" — the Medicine Recommendations card glyph is teal
(`--cs-teal`) — and it is neither green (already means *taken/added* —
`.cs-added`) nor blue (already means *the primary action* generically,
`--cs-blue`). Reusing either would make a medicine modal's own accent
collide with a state colour it sits right next to.

A future domain gets its own accent the same way: pick a colour not
already claimed by a state meaning (taken=green, action=blue, warning=
amber, danger=red/pink-as-required-marker) or another domain, derive a
3-stop gradient from it, and that is the whole decision.

## The shared classes — `.cs-addmed-*`

The medicine modals (`MedicineAddSheet`, `AddMedicineSheet`) do not get a
parallel `.pm-*`-style class family of their own. They already had one —
`.cs-addmed-*` (plus `.cs-newmed-*` for the few things only the
"add a brand" sheet needs) — built before this pass, functionally
complete, wired to real keyboard navigation
(`MedicineAddSheet.tsx`'s brand/strength/slot/SOS shortcuts). That
JSX and its logic is untouched by this pass; only what those classes
*look like* changed, to match the shape above:

- `.cs-addmed-panel` — card sizing/radius/shadow to match `.pm-card`
- `.cs-addmed-topstripe` — new, the 4px teal gradient (first child of the panel)
- `.cs-addmed-head` — icon tile + eyebrow + title, `.pm-header`'s proportions
- `.cs-addmed-eyebrow` — new, the small caps accent line above the title
- `.cs-addmed-input` / `.cs-field` — `.pm-input`'s sizing, radius, focus ring, in teal
- `.cs-addmed-confirm` — `.pm-btn-primary`'s shape, teal gradient
- `.cs-addmed-cancel` — `.pm-btn-ghost`'s shape

If a third modal needs this shape, the same move applies: reuse
`.cs-addmed-*` if it is close enough in structure, or add a class family
following this doc if it is not — never invent a one-off look.

## Fallback / "add your own" rows, everywhere

Unrelated to modal chrome but the same "one shape, reused" idea: a
free-text or "not in the catalogue" fallback option is never a link,
never has an em dash, and never sits visually apart from the list it
extends. It renders as a normal ranked row (icon + name + subtitle +
action), just with a violet accent instead of the section's usual colour,
and it lives *inside* the same list the catalogue hits render into — see
`FreeMatchRow` / `FreeConditionRow` / `FreeSuggestionRow` in
`ConditionsCard.tsx` / `SuggestionsCard.tsx`.
