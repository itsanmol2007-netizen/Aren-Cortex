# Cortex gotchas worth remembering (one-liners only)

Part of the `aren-cortex-context.md` split, 2026-08-24. This pocket is §8 of
that file, unchanged in content, just moved.

---

- `.app-shell` (App.tsx) has no height of its own — a feature page's root
  must use `min-height: 100vh`, never `height: 100%`, or it silently
  collapses to its own content height instead of filling the screen.
  Chromium in this sandbox can reach the app's own dev/preview server but
  not Supabase, so a login-gated screen can't be driven end-to-end here —
  a plain HTML file loading the built CSS bundle against the real class
  names is how the fix above was actually confirmed, not guessed.
- BP is one UI field but must become two measurements (`BP_SYS`/`BP_DIA`) or the
  BP rule never fires.
- The rule base is in Celsius; the UI takes Fahrenheit — conversion happens in
  `consultInput.ts`.
- A `MeasurementRow` with a text value (e.g. blood group) must be filtered out
  before reaching the engine, or it passes NaN as a silent wrong answer.
- `.ilike()` on the 213k-row `medicines` table times out; use `.eq()` for exact
  match — `search_intents` already returns the row's own name.
- A bare anon key returns **zero rows, no error** on Synapse's RLS-protected
  tables — don't mistake that for "nothing matched" in a check script.
- The `postgres` role bypasses RLS entirely — never use it to verify isolation;
  use a real `authenticated` session instead.
- `mv_composition_brand` must be refreshed manually after any composition/brand
  change — nothing does it automatically, and a stale view looks correct.
  (This is exactly why `AddMedicineSheet`'s new-brand handoff uses
  `brandHint` → `resolveProductByName`, a live `medicines` read, instead of
  waiting on this view.)
- A new Backblaze B2 bucket ships with no CORS rule — `curl` against a presigned
  URL won't reveal this; only a real browser PUT/GET will.
- Prescription insert needs `hospital_id` set explicitly or RLS's WITH CHECK
  silently rejects it (403) — this can leave a visit marked completed with no
  prescription attached.
- Vitals dependency arrays for the engine memo must key on the whole object
  (`JSON.stringify(vitals)`), not an enumerated field list — new measurement
  fields silently fail to trigger a re-rank otherwise.
- `is_primary` on `medicine_composition_map` cannot be trusted for combination
  products — infer the characteristic composition by rarity (fewest brands)
  instead.
- Mirroring one drug's rules does not mean inheriting its pregnancy/other gates
  — check class membership explicitly per molecule.
- Reserving visual space for an empty state creates a void, not breathing room —
  empty panels should be short and centred in whatever space is left. **Caveat
  found 2026-08-24**: this applies to a panel whose neighbours are TALL (the
  void reads as intentional whitespace). A page that is SHORT ALL OVER
  (Support/Communication/Clinic, one hero + a couple of cards) centred inside
  a full `min-height: 100vh` reads as a broken/half-loaded page instead —
  top-align those, don't centre them. The difference is whether there's a
  tall sibling to read the centring against.
- A component harness that doesn't run the real build pipeline (Vite+Tailwind)
  can only check structure, never real layout — esbuild-only harnesses have
  produced false failures more than once.
- `visits.vitals` and `visit_measurements` are NOT interchangeable, even for the
  same reading — `vitals` is the doctor's record (what was typed, in the units
  typed, e.g. Fahrenheit); `visit_measurements` is the engine's normalised record
  (Celsius). Reading trend data off the wrong one draws a confident, wrong arrow.
  `visit_measurements` carries additive `side`/`method`/`context`/`qualifier`
  columns (`context` defaults to `'baseline'`; a physio re-test writes
  `'post_intervention'` on the same row-shape so an in-session retest can never
  contaminate a between-visit trend).
- A boolean guard derived from an enum (e.g. `usesCaseSheet` meaning "not the old
  SOAP fallback") silently narrows in meaning the moment a new enum value is
  added — `tsc` cannot catch it because every value involved is still a valid
  boolean. Name the predicate for what it actually means
  (`usesRebuiltSurface = inputLayout !== "soap"`), not for the one case that was
  true when it was written.
