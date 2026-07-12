# AREN Front Desk — Design Direction v2

**Codename: "Bhor"** (भोर — daybreak). Supersedes v1 ("Suprabhat").
Status: **FROZEN creative direction.** The implementer executes this document; they do not make design decisions. Anything not covered here follows the doctrine in §2, not personal taste.

This document respects everything marked FROZEN in `aren-frontdesk-brief.md` and `aren-architecture-handoff.md`. It changes no layout, component inventory, row anatomy, workflow, DB call, or string. It redefines how the product *looks and feels* — because v1, faithfully executed, still read as a conventional light-blue hospital dashboard. The diagnosis and the cure are below.

---

## 1. What v1 got wrong (and what Cortex knows)

Study the Cortex screenshots (`docs/Screenshot 2026-06-17 *.png`) and its chrome CSS (`src/styles/layout.css`) and the craft pattern is unmistakable, and it is **not** violet-used-sparingly:

1. **Cortex is framed in ink.** A near-black indigo band — `linear-gradient(135deg, #0d1b35, #120f28 38%, #170d27 62%, #0b1525)` with faint pink/violet atmospheric radials breathing inside it — frames the top of every screen. The working canvas below is light and disciplined, but you never forget whose product you're in, because the *frame* carries the identity.
2. **A glowing gradient thread runs through everything important.** A 3px `#f472b6 → #a855f7 → #6366f1` stripe with a soft glow crowns the Cortex top bar; the same thread reappears on its dark modals and on the prescription letterhead. It's the brand's signature line — literally a thread stitching surfaces together.
3. **Violet labels structure, semantic color labels data.** Cortex's uppercase micro-labels ("GASTRIC COVER", "PRESENTING COMPLAINTS") are violet; its clinical data (abnormal findings, status chips, ranked percentages) is semantic red/green/blue. Two vocabularies, never mixed.
4. **Ink surfaces mark the moments that matter.** The past-consultation popover and the prescription letterhead are dark ink cards inside a light context — the product's "formal register" for its most important artifacts.

v1 gave Front Desk none of these. It confined the brand to five whispers (a 38px logo tile, focus rings, a 6%-alpha wash) on an otherwise white-card-on-gray-page layout — which is exactly the recipe for "generic enterprise admin panel." The discipline was right; the frame was missing.

## 1.1 The design story

> **Cortex is the night shift of the brand. Front Desk is its morning.**

Both products live under the same ink sky, stitched by the same gradient thread. Cortex runs at midnight — electric, dense, blue-violet. Front Desk runs at daybreak: the same ink chrome, but its atmospherics warm toward pink and apricot, and its thread carries a sunrise stop. The thread sits at the **bottom** edge of Front Desk's ink band — the horizon where dawn breaks — where Cortex wears it at the top like a crown.

Below the horizon, the day happens on paper: a warm, calm canvas where queue rows, forms, and stats stay near-monochrome and semantic, exactly as v1 ratified. The day still has its three-act arc (morning welcome → invisible midday interface → evening sign-off), unchanged.

One sentence to test every choice against: **ink frames, thread stitches, paper works.**

---

## 2. Doctrine (the tie-breaker for anything unspecified)

1. **Three vocabularies, never mixed.**
   - *Ink* (the frame): header band, Now Serving card, toast. Dark, atmospheric, carries the thread at full strength.
   - *Paper* (the work): every white surface. Near-monochrome; decoration limited to what this doc explicitly grants (thread hairlines on surface edges, micro-labels, watermarks).
   - *Semantic color* (the data): amber/blue/green/red mean waiting/consulting/done/danger and nothing else. Violet/pink **never** color data — not a status, not a numeral, not a patient-facing action.
2. **Violet labels structure.** Micro-labels, focus rings, the brand mark, the launcher's aura, empty-state illustrations, required-field marks. If it tells her *where she is or what a region is*, it may be violet. If it tells her *about a patient or a visit*, it may not.
3. **She's scanning, not admiring.** Inside populated rows and open dropdowns, legibility beats identity. No thread, no violet, no decoration inside row content — the queue's interior is the most protected surface in the product.
4. **Warmer, not cooler** — in copy first, color second, motion last.
5. **Nothing moves unless touched**, with the two ambient exceptions in §9 (launcher breath, request pulse). Glows are static; the thread does not animate.

---

## 3. The chrome (new — the biggest single change)

### 3.1 The ink band

The header is no longer a white card floating on the page — it is a **full-bleed dark band**, edge to edge, the same physical chrome as Cortex's top bar:

- Base: `linear-gradient(135deg, #0d1b35 0%, #120f28 38%, #170d27 62%, #0b1525 100%)` — **identical to Cortex's ink**. Same sky.
- Atmosphere (the "different hour"): three faint radials breathing inside the band, warmed toward dawn —
  `radial-gradient(ellipse 340px 150px at 15% -30%, rgba(242,169,134,0.12), transparent 70%)` (apricot),
  `radial-gradient(ellipse 420px 200px at 55% 130%, rgba(244,114,182,0.10), transparent 65%)` (pink),
  `radial-gradient(ellipse 280px 160px at 90% -15%, rgba(139,92,246,0.10), transparent 60%)` (violet).
  Cortex's equivalents lean pink/violet/indigo; Front Desk's lean apricot/pink/violet. Static, never animated.
- Shadow: `0 4px 28px rgba(8,16,44,0.28), 0 6px 40px rgba(139,92,246,0.05)`.
- Height ≈ 62px (content `py`≈12px + 38px mark) — the §11 vertical budget is unchanged. Not sticky (unchanged scroll behavior).
- Inner content constrained to the page's `max-w-[1480px] px-6` grid.

### 3.2 The dawn thread

The signature line, shared with Cortex but with a sunrise head:

> `linear-gradient(90deg, #f2a986 0%, #f472b6 32%, #a855f7 68%, #6366f1 100%)`

Apricot flowing into Cortex's exact pink→purple→indigo. Same thread, one more stop — that's the kinship mechanic in a single asset.

**Where it appears (closed list):**

| Surface | Placement | Weight |
|---|---|---|
| Ink band | bottom edge (the horizon — dawn breaks *under* the night) | 2px, full strength, glow `0 1px 10px rgba(168,85,247,0.45), 0 2px 20px rgba(244,114,182,0.18)` |
| Now Serving ink card (§10) | top edge | 2px, full strength, same glow |
| Queue panel | top edge | 2px, **55% opacity, no glow** (paper speaks softly) |
| Both modals | top edge of the panel | 2px, 65% opacity, no glow |

Nowhere else. Not on stat cards, not on sidebar white cards (they keep the 1px `white/60` glass edge), not inside rows. Four appearances is a motif; ten is wallpaper.

### 3.3 Wordmark & header contents

- Brand mark: existing 38px gradient tile (`linear-gradient(155deg, #7c5cf0, #2f6bed)`, violet melting into Front Desk blue) with its glow — now sitting on ink, where it finally reads as a jewel instead of an icon.
- Wordmark, two-tone like Cortex's ("AREN" white / "Cortex" blue): **"AREN" in white**, **"Front Desk" in dawn pink `#f0abc8`**, both 16px Manrope 800. Split the translated `appTitle` on its first space (the string is identical in every language). Subtitle 11.5px in lavender-gray `rgba(199,195,224,0.62)`.
- Right cluster on ink: clinic name `rgba(255,255,255,0.92)` semibold · hairline dividers `white/10` · date/time `rgba(255,255,255,0.55)` tabular · language trigger as a dark ghost (border `white/15`, text `#c7c3e0`, hover border `white/30` + bg `white/5`; its floating menu stays white/unchanged) · user chip `bg-[rgba(99,102,241,0.28)] text-[#c7d2fe]`.

### 3.4 The canvas atmosphere

Page background warms from `#f5f6f9` to `#f4f4f8`, keeps the 22px dot grid, and gains a **dawn residue**: three large, very faint radials bleeding down from under the horizon (violet 0.05 left, pink 0.04 center, apricot 0.05 right, each fading out within ~240px). At a glance the page is neutral; against v1 side-by-side it is unmistakably warmer. Layered as multiple `background-image`s with per-layer `background-size`/`repeat` so the dot grid still tiles.

---

## 4. Micro-label system (new)

Cortex's most copyable craft habit. An AREN micro-label is: **10.5–11px, weight 700–800, uppercase, tracking +0.07em**, in muted structural violet **`#837bb2`**, optionally preceded by a 12–13px lucide icon at 70% opacity.

Used for: sidebar card titles (Summary/Doctors/Requests, with icons), modal section labels (Symptoms / Assigned Doctor / Change Status / Recent Visits), the launcher dropdown's "Existing Patients" caption, the Now Serving caption (on ink: lavender `#b9b4d6` instead of `#837bb2`), and stat-card labels (**exception: stat labels stay neutral gray `#8a91a0`** — they sit next to semantic numerals, and violet there would mix vocabularies).

Form-field labels inside CreateVisitModal are *not* micro-labels — they stay 12px sentence-case `#5a6472` (she reads them as questions, not as regions).

---

## 5. Color

### 5.1 Paper foundation (~88% of every screen)

Page `#f4f4f8` + dot grid `rgba(20,30,50,0.045)`. Surfaces `#ffffff` / `#fafbfc`. Borders `#e4e7ee` / `#eef0f5` / `#d5dae4`. Text ladder `#161d29` → `#5a6472` → `#8a91a0` → `#a8aeba`. All unchanged from v1.

### 5.2 Ink (new, ~6%)

The Cortex ink gradient (§3.1) plus its text ladder: white → `#c7d2fe` (blue-lavender data) → `#b9b4d6` (lavender labels) → `rgba(255,255,255,0.35)` (muted/asleep). The toast (`#161d29` pill) is honorary ink.

### 5.3 Semantic (~5% — frozen, byte-for-byte as `statusStyle.ts`)

Blue `#2f6bed`/`#1d51c9` · Amber `#c9791a` · Green `#1c8a4d` · Red `#d23b34`, muted text variants `#a9741f`/`#3a5da8`/`#347d55`, row tints and stripes exactly as implemented. Ratified untouched.

### 5.4 Brand aura (~1%)

Anchors: violet `#7c5cf0` (+`#6366f1` focus companion, `#a855f7` thread stop), dawn pink `#f0abc8`/`#f472b6`, apricot `#f2a986` (thread + sun dot only), structural violet-gray `#837bb2`.

**Closed list of aura appearances:** the thread (§3.2's four spots) · brand mark + its glow · wordmark's "Front Desk" · micro-labels (§4) · focus rings app-wide (`rgba(99,102,241,0.28)`, 4px launcher / 3px elsewhere) · launcher dawn wash + search-icon halo · **launcher `+` button** (§7) · empty-state arcs + glow (§8) · required-field marks (§10.2). Violet/pink still never colors a status, a stat numeral, a tab, a row, or any patient-data element.

### 5.5 The zero rule (unchanged, extended to ink)

A stat value of 0 renders muted `#a8aeba` (icon chip keeps its tint). On ink, an asleep value renders `rgba(255,255,255,0.35)`. Dashes are never colored.

---

## 6. Typography, surfaces, spacing (ratified from v1, unchanged)

Manrope (display, 700–800) + Inter (UI, 400–700); the full frozen scale from v1 §3 stands, including 28px stat numerals, tabular numerals everywhere numeric, and the hierarchy law (one loud element per surface). Radii 13/9/7, the three shadow levels, 14px gutters, 16–18px card padding, 1480px max width, ≥44px touch targets, blur only on modal overlays. On ink surfaces the glass edge is replaced by the thread or by nothing — never both.

---

## 7. The Patient Launcher — the front door

Everything from v1 §6 stands (64px height, dawn wash breathing ±6%/8s, focus brightens the wash and stops the breath, violet search halo, dropdown stays operational-neutral inside). One change:

**The `+` button joins the brand.** It was flat blue; it becomes the same violet→blue gradient as the brand mark (`linear-gradient(155deg, #7c5cf0, #2f6bed)`) with glow `0 3px 12px rgba(124,92,240,0.32)`, brightening on hover, `active:scale-0.92` kept. Rationale: this button doesn't act on a patient's *state* — it opens the door to AREN. The mark in the header and the `+` in the launcher are the same object at two sizes: the product's two front doors, wearing the brand. Every button that changes a visit's status stays strictly semantic.

---

## 8. Empty states (system unchanged, one warmth added)

The three-part dawn-arcs system from v1 §7 is ratified: MorningWelcome (arcs + greeting + one line + arrow-up, no button), TabEmpty (20px icon + one line, no color), DayDone (green-hued arcs, a nod not a celebration). One addition: **the morning arcs gain a static dawn halo** — a `radial-gradient(closest-side, rgba(240,171,200,0.16), transparent)` ellipse (~220×120px) behind the SVG, so the illustration sits in light instead of on blank white. DayDone gets the same at `rgba(28,138,77,0.10)`. No new motion; `aren-rise` entrance only.

---

## 9. Motion & sound (unchanged)

The v1 §9 table is ratified in full: ease-out family, 100–150ms surface transitions, the two ambient animations only (launcher breath, request pulse), fade-only toasts, no spinners, no slides, everything dead under `prefers-reduced-motion`. The thread and all glows are static. The two-note chime remains the only sound.

---

## 10. Canvas surfaces

### 10.1 Stats, queue, rows

- **Stat cards:** unchanged geometry, ghost-circle watermark kept; labels become uppercase micro-format but in neutral `#8a91a0` (§4). Numerals/zero-rule unchanged.
- **Queue panel:** gains the soft thread on its top edge (§3.2). Title, tabs, sort, skeletons, keyboard-ready roles — all unchanged.
- **Rows:** untouched. v1's restraint here was correct and is re-frozen: stripe + ambient tint, quiet status text, always-visible 40% kebab, no motion, no decoration.

### 10.2 Modals

Structure and behavior frozen; the least-designed surfaces of v1 get the frame treatment, nothing more:

- Both modal panels: `overflow-hidden` + the thread at 65% on the top edge.
- Section labels → violet micro-labels (§4).
- **Symptoms are structured entities, never free text** (product correction, ratified). They live in the `symptoms` table and feed Cortex, medicine ranking, and future specialty logic. CreateVisitModal uses a **symptom picker**: search input (44px, standard field treatment) → in-flow suggestion list filtered from the catalog (`fetchSymptoms()`, loaded once per modal) → selected symptoms as removable chips; the visit stores symptom IDs via `saveVisitSymptoms`. Enter picks the top suggestion; Backspace on an empty query removes the last chip. At least one symptom is required (`errSymptom`). Everywhere symptoms display (picker chips, VisitDetailModal), they render as neutral chips — `bg-[#f5f6f9]`, border `#e4e7ee`, radius 7, 12.5px `#374151` — the same object language as Cortex's chips, in paper-zone neutrals (a chosen symptom has no state, so it takes no color).
- **Recent Visits rows** gain a 6px status dot (from `tintFor(pv.status)`) before the date line — past visits had states too.
- **Required fields** (name, phone, symptoms) mark themselves upfront: a 4px violet dot at 45% opacity after the label. Structural violet, not an error color; the red-border+helper error treatment is unchanged.
- Patient name colored by status, segmented status bar, native doctor select, footer buttons, error/saving states: all unchanged.

### 10.3 Sidebar

- Card titles → icon + violet micro-labels (Activity / Stethoscope / Bell at 13px, 70% opacity).
- **Now Serving becomes the sidebar's ink moment.** Inside SummaryCard, the Current Token row is replaced by a small ink card (radius 11, the §3.1 ink + one faint pink radial, thread at full strength on its top edge): micro-label caption (`currentToken` key, lavender `#b9b4d6`), token number 26px Manrope 800 white tabular, and — when someone is in consultation — the patient's name 11.5px `#c7d2fe` beneath. Empty state: `—` at `rgba(255,255,255,0.35)`, no name line. This is Front Desk's echo of Cortex's dark letterhead: the one place the day's "current moment" is formally framed.
- Average Wait stays a plain white-zone row below the ink card. Doctors and Requests cards otherwise unchanged (avatars, rings, amber active treatment, dashed simulate button, pulse + chime).

### 10.4 Header details & toast

Language dropdown menu, its "soon" tag, and selection behavior unchanged (trigger restyled for ink, §3.3). Toast stays as shared `<Toaster>` for now — carried-over exception, revisit only if Front Desk gets its own instance.

---

## 11. Responsive (unchanged budgets)

1366×768 and 1920×1080 blessed. The ink band replaces the header card at the same ≈62px; the first queue row must stay above ~340px at 1366×768. ≤1040px collapse behavior, truncation rules, morning-welcome padding reduction: all per v1 §11.

---

## 12. Copy (frozen — zero changes)

The complete EN/Hinglish table from v1 §12 is carried forward and lives in code at `src/features/frontdesk/i18n/strings.ts`, which is the normative copy source. `currentToken` captions the Now Serving card. The symptom picker required three copy changes: `phSymp` becomes "Search symptoms…" / "Symptom search karo…", plus new keys `noSymptomMatch` ("No matching symptom" / "Koi symptom nahi mila") and `errSymptom` ("Add at least one symptom" / "Kam se kam ek symptom chuno"). Everything else is byte-for-byte v1. Doctrine unchanged: workflow nouns English, Hindi connective tissue, Roman script, `hi` stubbed, everything through `t()`.

---

## 13. What the implementer must NOT do

- No violet/pink outside §5.4's closed list; no thread outside §3.2's four surfaces.
- No decoration inside populated rows, open dropdowns, or form fields; the queue interior stays untouched.
- No new fonts, radii, or shadow values beyond §3's ink shadows; no emoji in product copy (⚡ simulate stays grandfathered).
- No animation beyond the v1 §9 table — the thread, halos, and atmospherics are static.
- No fake delays, spinners, or confirm dialogs where undo works; no layout changes; no hardcoded strings.
- Do not "extend the kinship" by borrowing more of Cortex (numbered badges, meter bars, dark canvas): Front Desk is dawn, not midnight.

---

*Direction frozen. Ink frames, thread stitches, paper works. Ties go to §2, in order.*
