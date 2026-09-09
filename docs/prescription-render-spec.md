# Prescription render spec — the shared contract

**Written 2026-09-09.** The prescription is rendered on **three** surfaces.
They are not one shared component (this project's rule is *copy, don't share
modules*), so this file is the contract that keeps them looking like one
document. Change the document → change this file → change all three.

| # | Surface | File | Sizing |
|---|---|---|---|
| 1 | Print / PDF / WhatsApp image | `src/features/prescription/PrescriptionDocument.tsx` (`StandardDocument` A4/A5, `ThermalDocument`) | fixed `mm` |
| 2 | Doctor's on-screen review | `src/components/ReviewModal.tsx` (in-modal preview; also mounts #1 hidden for actual printing) | fluid, in a ~680px modal |
| 3 | Public patient page `arenode.com/prescriptions/<token>` | `Aren LP/aren-landing-page/components/rx/RxView.tsx` + `supabase/functions/rx-preview` | fluid, mobile-first |

**Consistency rule:** same **visual hierarchy, section list, section order,
clinic accent, and QR treatment** on all three. Device-appropriate differences
are fine and expected — fixed `mm` vs fluid width, font scale, a light motion
on the web page, thermal dropping what a 76mm roll can't show.

---

## Section order (top → bottom)

1. **Letterhead** — white. Clinic logo/crest, clinic name in dark ink, a short
   accent rule under the name (`RxRule`), clinic contact lines; doctor block
   (name, qualification, specialty, registration) right-aligned beside it or
   filling the row when it *is* the letterhead. Solid **3px clinic-accent
   bottom border**. No dark panel, no gradient, no decorative orbs, no
   coloured specialty pill — Anmol: *"not like a gaming PC RGB bill."*
2. **Patient strip** — name, age/sex, (phone on #1/#2 only, never the patient
   page), date, ref.
3. **Measurements** — every non-empty `visits.vitals` key, labelled from the
   catalogue, **in catalogue order** (see below). Omit the section when none.
4. **Complaints** (presenting symptoms).
5. **Findings** (clinical findings + `findings_text` diagnosis).
6. **Medicines** — numbered. Name, composition/strength, **M/A/E/N slot dots**,
   duration, route, per-row instructions, SOS tag. A one-line legend
   (`M · A · E · N … ● take ○ skip`) under the list.
7. **Investigations** — ordered tests.
8. **Advice** — **the doctor's own `advice_notes` only.** See the rule below.
9. **Therapy performed** (physiotherapy) — what the clinic did this visit
   (`prescriptions.therapy_notes`).
10. **Home exercise programme** (physiotherapy) — `prescription_exercises`
    rows, numbered.
11. **QR** — see treatment below. **Follow-up** pill beneath it.
12. **Signature** — image or ruled line + name + creds. `showSignature:false`
    drops the image and line, never the name.
13. **Footer** — the clinic's `footer_note` (if any), then the single
    provenance line *"Generated with care, through Arenode"* when the clinic
    is branded (`hospitals.is_branded !== false`).

---

## QR treatment — centered, bordered

The QR sits in a **thin bordered frame**, **centered** in its column, with a
one-line caption under it and the follow-up pill under that. This is the
Windows print-preview treatment Anmol asked to replicate everywhere ("centered
with a border, looked beautiful") — not "QR floating on the right".

- #1 print + #2 review: the QR encodes the **prescription's own details**
  (clinic, patient, meds, date). Caption: **"Scan to verify this
  prescription."**
- #3 patient page: the QR encodes **this page's own URL**, so it can be handed
  to a pharmacist/family without forwarding the WhatsApp. Caption: **"Scan to
  open this prescription."**

Border colour: the accent's `mid` tone (#1/#2, via `accentPalette`) or
`${accent}66` (#3). The QR's own pixels are always pure black/white.

---

## Advice vs instructions

- **Printed / shown to the patient = the doctor's `advice_notes` for THIS
  visit only.** Richer, chevron-led lines (`›`), not tiny grey dots.
- **Removed from every rendered surface (2026-09-09):** the clinic's canned
  standing advice — `prescription_settings.default_advice` /
  `DEFAULT_PRESCRIPTION_CONFIG.defaultAdvice` — and any
  template/library-seeded advice. The Prescription Editor field still exists;
  it simply no longer reaches paper, the review screen, or the patient page.
  `rx-preview` no longer falls back to it either.
- **Kept:** the **per-medicine** `instructions` string on a medicine row
  ("after food", "with water") — that is dosing detail, not canned advice.

---

## Measurements

Source: `visits.vitals` (a key→value bag). **Not** `visit_measurements` rows —
see the open question in `docs/SESSION-HANDOFF.md`.

Render every key whose value is non-empty, labelled and ordered by the
catalogue **`MEASURE_FIELDS`** in `src/features/consult/measures.ts`
(`rxLabel` + `unit`, catalogue order = print order). #1 and #2 import that
file directly. #3 (the landing repo) carries a **mirror** — `MEASURE_LABELS`
in `supabase/functions/rx-preview/index.ts`, `{ key, label, unit }` only, in
the same order. **When a measurement is added to `MEASURE_FIELDS`, add it to
that mirror in the same position.** `npm run check:measures` guards #1/#2.

---

## Colour — the clinic accent

One stored hex (`hospitals.accent_color`, default `#1268e8`) turned into a
ramp by **`src/lib/brand/accent.ts` `accentPalette()`**:

- `base` — solid fills / logo border / 3px letterhead border.
- `ink` — headings, values, section labels; **contrast-clamped ≥ 4.5:1 on
  white** (a pale brand colour must not yield unreadable headings).
- `mid` — hairlines, the QR frame border, secondary labels, `RxRule`.
- `tint` / `veil` — section bands, zebra rows, the 3–4% watermark.

#3 does not run `accentPalette`; it uses the raw accent plus alpha suffixes
(`${accent}66`, `${accent}1a`, `${accent}14`). If #3 ever needs the clamped
`ink`, port `accentPalette` rather than eyeballing a darker hex.

**#1 and #3 are white only — no dark mode.** #3 forces light by overriding the
`--color-*` tokens on its shell regardless of the visitor's OS/site theme.
#2 lives in the app and may keep app-chrome greys around the document, but the
document band itself is white.

---

## Typography scale

| | Heading | Body | Small |
|---|---|---|---|
| #1 A4 | 22px | 11px | 9px |
| #1 A5 | 18px | 9.5px | 8px |
| #1 thermal | 12px | 9px | 8px (mono) |
| #2 review | ~20px clinic / ~17px doctor | 11–13px | 9–10px |
| #3 patient | `text-xl` clinic | `text-sm` | `text-xs` / `text-[11px]` |

Font family: `Arial, sans-serif` on #1 (print-safe); the app/site face on
#2/#3.

---

## When you change the document

1. Edit `PrescriptionDocument.tsx` (both `StandardDocument` and
   `ThermalDocument` if the change is content, not just A4/A5 layout).
2. Mirror the visual change in `ReviewModal.tsx`'s in-modal preview.
3. Mirror it in the landing repo — `RxView.tsx`, and `rx-preview/index.ts` if
   the change needs new data.
4. Update this file's section list / rules.
5. `npm run check:measures` (Cortex). Deploy `rx-preview` with
   `--no-verify-jwt`. Eyeball the three side by side for one real Rx.
