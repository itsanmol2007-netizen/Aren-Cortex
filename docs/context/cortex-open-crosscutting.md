# Open / left to do — cross-cutting

Part of the `aren-cortex-context.md` split, 2026-08-24. This pocket is the
Cross-cutting half of §7 of that file (WhatsApp, sidebar, Practice, layout
bugs, the 2026-08-24 bug-fix batch, and anything not physio-specific),
unchanged in content, just moved.

For physiotherapy-specific open items, see `cortex-open-physio.md`.

---

**Cross-cutting:**
- **WhatsApp follow-up reminders**: still not built — the real API integration
  is still blocked on Anmol choosing a provider. **A placeholder now exists**
  (`lib/whatsapp.ts`, added 2026-08-23 for the Patient Record page's "Send via
  WhatsApp" prescription action, Anmol's own ask, explicitly framed as
  temporary): opens a `wa.me` deep link with the message pre-filled, no
  template system, no delivery tracking, no automated send. Every caller goes
  through `buildWhatsAppLink()` so swapping in the real API later doesn't mean
  hunting down every place that builds a wa.me URL by hand.
- **Sidebar rebuilt to six real destinations 2026-08-23** (Consult, Patients,
  Communication, Practice, Clinic, Settings + a Help & Support utility) —
  full reasoning in `SidebarNav.tsx`'s header.
- **Practice built for real the same day, hours after being documented as
  blocked.** The blocker was "no standalone query resolves a pinned
  `intent_id` to a display name without the full ruleset loader" — checked
  live with Supabase MCP direct SQL access (confirmed working this session,
  a separate path from the blocked browser — see SESSION-HANDOFF.md §3) and
  it turned out to be one join: `intents.label` already IS the display name
  for a medicine intent (verified: `id=390` → `label="omeprazole"`, matches
  `compositions.name` exactly). `fetchPinnedMedicineDetails(doctorId)` in
  `lib/db/synapse.ts`, `features/practice/PracticePage.tsx` built on it,
  wired into `App.tsx`. `doctor_pinned_intent` has 0 rows for this account
  today (Dr Anmol Pandey has never pinned a medicine) — the page correctly
  shows an honest empty state, not fabricated data. Preferred Labs and
  Prescription Templates stay explicitly "not built" within the same page
  (no schema exists for either — checked the live table list, not assumed).
  Communication and Clinic remain `ComingSoonPage` stubs — genuinely more
  complex (new data models: conversation/message storage, staff/hours/
  operational config), reasonable to leave for a session with Anmol's
  input on scope. Support's existing "Help & documentation" copy is fine
  as-is.
- **Confirmed-condition resolve/refute** (status active/resolved/refuted) only
  works on the Case Sheet surface (General OPD, Physio) — the 6 SOAP-fallback
  profiles still treat removal as silent and today-only.
- **Nothing surfaces a patient's retired (resolved/refuted) conditions** —
  they're recorded but invisible.
- `workspace.css` (2,794 lines, `cx-*`) is mostly dead — 24 classes still live
  (3 sheets + 1 selector hook). Migration to `cs-*` is a presentation decision,
  not mechanical.
- Combinations are offered as alternates but **not scored as combinations** —
  a product answering two active needs at once isn't ranked higher for it.
  Flagged as a bigger engine change, not attempted.
- No India-region data residency for attachments yet (Backblaze B2, US region) —
  acceptable for pilot, `storage_provider` column exists so migration is a
  secrets change later, not a rewrite. Get real legal counsel before scaling
  past a small consenting pilot.
- Admin panel (hospital activation, doctor credential reset, medicine-catalogue
  approval queue) — not built. The `add_medicine()` RPC it depends on IS built
  and verified. **2026-08-24: `composition_requests` (see `cortex-data-model.md`)
  is the first real piece of what this queue would read from** — a doctor's
  "this salt is missing" ask now lands somewhere, `status='pending'`, but
  nothing yet lists/approves/promotes those rows. That review-and-promote UI
  is still the same "not built" admin panel this bullet has always described.
- Specialty selection is still a doctor-facing Settings toggle (temporary,
  deliberate) rather than admin-assigned per facility.
- `App.tsx` line count and the state/render split (5 hooks) is the reference
  pattern now — if it starts growing again, ask which of the 5 hooks new state
  belongs in, not whether `App.tsx` can hold one more thing.
- **Everything in this codebase is built and verified against `tsc`/`vite build`/
  check scripts and Chromium component harnesses, but a recurring gap is that
  much of it (especially the physiotherapy rebuild, session 2026-08-17 onward)
  has NOT been driven against the actual live app** — the working environment's
  Chromium has no outbound network. Treat recent physiotherapy work as
  type-checked and structurally verified, not yet eyeballed in production.
- **A batch of eleven bugs Anmol filed 2026-08-24 ("Aren Cortex Open Bugs to
  fix"), fixed the same day — `tsc -b` and `npm run build` both clean, NOT
  yet eyeballed live (same Chromium/no-outbound-network gap as above).**
  Numbered against his own list:
  1. Measurements: the card head's "+" and the card-foot "More ▾" were two
     different controls for what read as one question. One "+" now, always
     opening the same modal; the "Add Measurement" surface inside it
     (`MeasurementSearch`, replacing `MeasurementPicker`) is a search box
     over the hidden fields rather than a categorised menu of the whole
     catalogue.
  2. `GuardReason` (`parts.tsx`) now shows only the first reason, clamped to
     two lines, with "Show N more" — checked live, the malaria guard alone
     carries two ~190-character WHO-guidance paragraphs when RIGORS and
     FEVER_RECURRENT are both active, which was genuinely burying the
     medicine's name under red text. Full text is one click away, never
     hidden (rule 8 intact).
  3. `SuggestionsCard`'s category filter was a `<select>` that only ever
     scoped an ACTIVE search and did nothing to the ranked list otherwise —
     replaced with tabs (`.cs-sug-filter`) that filter both.
  4. Assessment free-text fallback: new `doctor_free_findings` table
     (doctor-scoped, `hospital_isolation` RLS, never touches
     `intents`/`signal_intent_rules` — rule 22 territory) remembers a typed
     term against the visit's active signals; `ConditionsCard` surfaces a
     doctor's own matching terms both under a live search and, quietly, as
     a "Your terms" strip on the ranked view when today's signals overlap a
     remembered one. **Widened same day** (Anmol: "add that to test and all
     too... record other credentials with it too so it can be recommended
     with that kind of signals group") — see the follow-up entry below.
  5. `add_medicine()` RPC (built 2026-08-09, never wired to any screen)
     is now reachable: `AddMedicineSheet.tsx`, opened from a medicine
     search's "Add 'x' to your medicines" prompt. FORCES an existing
     composition pick (rule 22 — never mints one), dosage/form stay
     optional. Hands off into the existing `MedicineAddSheet` via
     `brandHint` (a live `medicines` table read, not the materialized
     view — the new brand is reachable immediately, no manual refresh
     wait).
  6. Dosage prefill (`doseFieldValue`, `MedicineAddSheet`) was already
     built and wired — verified, not touched.
  7. `resolveBrands` (`lib/synapse/brands.ts`) gained a form-priority tier:
     a paediatric consult's DEFAULT brand is now syrup/drops when one
     exists, reading the catalogue's structured `form` column rather than
     matching "syrup" in the product name (the exact trap flagged in the
     ask). Reuses the existing `PEDIATRIC` signal (age ≤ 12, per
     `measurement_rules`) rather than a new "under 8" cutoff — asked for
     8, but a second age boundary living only in the UI would drift from
     the one `isPediatric` already uses for brand-preference neutralisation
     (rule 19); flagged for Anmol rather than silently picked.
  8. A searched medicine (`.cs-sug.is-hit`) now renders as its own bordered
     card (`.is-medicine`) instead of a bare hairline list row — still
     honestly unranked (no colour, no rank badge, no relevance word; that
     rule is untouched).
  9. Every accepted row, ranked or searched, across all six intent types,
     now turns its checkmark into a click-to-remove (`removeAcceptedIntent`
     dispatcher, `useConsultPlan.ts`). Root-caused and fixed the specific
     complaint underneath it: confirming a mapped condition silently added
     an observable to the Case Sheet (`confirmCondition` →
     `addContextObservable`), and un-confirming it never took that chip
     back off (`useLongitudinalRecord.ts`'s new `unconfirmCondition` — safe
     against a chip shared by two confirmed diagnoses, and never touches a
     chip the doctor ticked by hand). Also dropped the Plan rail's
     "+ Add" buttons on Medicines/Investigations — they only ever moved
     focus to a search box already on screen.
  10. `ConditionsCard`'s second column, previously a confirmed-conditions
      list Anmol had already called "essentially a useless thing" (2026-08-16
      comment) on any profile with no specialty exam launcher, now runs a
      compact Investigations quick-list there instead (`SuggestionsCard`
      reused, not forked — rule 7). `planSlots` drops `test` from the main
      Clinical Suggestions listing when this is showing, so nothing ranks
      twice on one screen; excluded for a Diagnostics-primary profile,
      which already gets Investigations as its own full elevated slot.
  11. The "half-rendered" look on Support (and, checked, the same
      `justify-content: center` on Communication and Clinic) — technically
      correct per the empty-state doctrine (`cortex-gotchas.md`: "short and
      centred in whatever space is left") but centring three short lines of
      REAL content in a full `min-height: 100vh` box reads exactly like the
      collapsed-page bug that `min-height` fix was written to solve, one
      layer up. Top-aligned instead on all three pages. Settings and
      Practice were already top-aligned; untouched.
- **Same-day follow-up (2026-08-24, after the batch above shipped) — three
  more asks, all landed:**
  1. **Free-text fallback widened past Assessment.** `doctor_free_findings`
     renamed to `doctor_free_terms` (migration
     `widen_doctor_free_findings_to_free_terms`) — `intent_type` column
     (`finding | test | referral | advice`), unique per (doctor, type,
     label) instead of just (doctor, label). `SuggestionsCard` now offers
     the identical fallback for Test/Referral/Advice, gated on one category
     being unambiguously in view (`effectiveType` — a chosen tab, or the
     card's only section when it has just one, e.g. the Assessment
     side-slot's Investigations-only instance). Exercise/modality/
     impairment deliberately excluded — exercise's plan line is keyed on a
     real intent id in a way finding/test/referral/advice never were (their
     plan-side targets — `diagnoses`, `selectedTests`, advice/referral
     lines — have always been plain strings with no intent behind an
     entry, which is what made the original Assessment version safe to
     build in the first place); modality/impairment are physio-specific
     and lower-value for a first pass. `addFreeTest`/`addFreeReferral`/
     `addFreeAdvice` (`useConsultPlan.ts`) mirror `addFreeDiagnosis`
     exactly. `src/features/consult/freeTerms.ts` is the one place the
     matching/scoring logic lives now, shared by `ConditionsCard` and
     `SuggestionsCard` (rule 7 in spirit) — the two cards still render
     their own JSX (Tailwind vs plain `cs-*` CSS, an existing split, not a
     new one) but never re-derive the match.
  2. **"Best personalization" — accepted-intent overlap, not just signals.**
     `doctor_free_terms.accepted_intent_ids` (bigint[]) records every OTHER
     intent already accepted in the consult at the moment a term was typed
     or reused. `scoreFreeTerm` (`freeTerms.ts`) weighs an accepted-intent
     match at 2x a signal match — two consults sharing a symptom is common
     and weak evidence, two consults where the SAME OTHER MEDICINES/TESTS
     were also accepted is rarer and stronger evidence this doctor reaches
     for this term in THIS situation. Additive, not a replacement — same
     shape as rule 23's four-tier weighting, not a coincidence.
  3. **The composition-adding fallback.** "There should be a fallback to
     composition adding too, if a composition is not found in our db" ran
     straight into rule 22 (never mint a composition from the UI). Resolved
     as a REQUEST queue, not a mint: new `composition_requests` table
     (`status='pending'`, doctor+hospital attributed, `hospital_isolation`
     RLS) — `AddMedicineSheet.tsx`'s composition search, when it comes up
     empty, offers "Salt not in our library either? Request it be added",
     which logs the ask via `requestNewComposition` (`lib/db/synapse.ts`).
     This does NOT let the doctor finish adding the brand in the same flow
     — the salt still doesn't exist, so "Add & continue" stays disabled —
     it only tells the team. Promoting a request to a real, rankable
     composition is still the clinical-review pipeline rule 22 describes,
     done by a person; this table is the first real piece of the admin
     approval queue this file has long listed as "not built" (see the
     bullet above).
  4. **This doc split into pockets** (`docs/context/cortex-*.md`) — the ask
     that produced the file you're reading. `docs/aren-cortex-context.md`
     itself is now a short index pointing here; `docs/context/README.md`'s
     routing table was updated to include these alongside the existing
     `engine.md`/`consult-ui.md`/`specialties.md` pockets.
