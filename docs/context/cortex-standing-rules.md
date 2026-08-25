# Cortex standing rules — do not relitigate

Part of the `aren-cortex-context.md` split, 2026-08-24. This pocket is §5 of
that file, unchanged in content, just moved — this is the single
most-referenced section, so it gets its own short file rather than being
buried in a long one.

Read this before any Cortex change, however small. Numbers are referenced
by number elsewhere (commit messages, other pockets, code comments) — don't
renumber, append.

---

1. **All DB calls go in `src/lib/db/*`.** `db.ts` is a barrel only.
2. **The engine (`lib/synapse/*.ts`) is pure.** No Supabase import, no React import, ever.
3. **Symptoms/findings/history are structured `observables`.** Never free text as the
   primary path — a chip always exists before a note does.
4. **Learning-loop and compatibility-write failures are non-fatal.** Always `.catch()`.
5. **Never redefine an existing CSS class** — `consult.css` owns everything under `cs-`.
6. **One prescription renderer, one review surface.** Don't fork `PrescriptionDocument`
   or `ReviewModal`. If you're changing what the *patient* sees, that's
   `PrescriptionDocument` — styling `ReviewModal` alone does nothing to print/PDF.
7. **One manual search** (`IntentSearch.tsx`) for every output category — give it a
   `types` array, don't fork it.
8. **No guard ever hides a suggestion.** Anything reached by search must compute and
   render the same guard verdict the ranked list would.
9. **Never print a score.** Proportional bars and relevance words only.
10. **Add zero new `tsc` errors.** `tsc -b` and `npm run build` both pass clean.
11. **Targeted edits only** — never silently rewrite a whole file.
12. **Never persist an alias, search term, or v1 name into a visit record.** The
    canonical identity of anything on the chart is its `observable.id`.
13. **Keyboard bindings: `lib/keyboard/keymap.ts` is the only declaration.** The
    handler dispatches from it, `ShortcutsSheet` prints from it — a binding that
    isn't dispatched can't be documented and vice versa.
14. **An overlay that binds any un-modified key MUST take focus when it opens**
    (`useOverlayFocus`), or those bindings are dead — focus something that isn't a
    text field.
15. **Ranked lists use a DOM-read cursor (`data-cx-cursor`), never a React state
    index** — these lists re-rank live under the doctor's cursor; an index is a claim
    about a list that has already changed.
16. **The per-specialty-branch law:** a profile earns its own render file only when
    *the clinician reasons in a different order*, not merely when the input surface
    looks different. Copy `GeneralOpdInputs.tsx` (rename, diverge) — never grow a
    specialty conditional inside a shared file, and never pre-split into near-identical
    placeholder copies "for later."
17. **"Cortex should know a lot, but show little."** Standing law, not a preference —
    apply progressive disclosure rather than surfacing every possible field.
18. **A fire-and-forget write plus a live CHECK constraint is a silent-failure trap.**
    Verify writes against Postgres directly, not just by trusting migration text.
19. **When two things must independently agree (a check, a constraint, a hand-maintained
    list), make one read the other rather than trusting both stay in sync by discipline.**
    This has broken multiple times (`hospitals_specialty_profile_check` vs `PROFILES`
    map; print surfaces vs `MEASURE_FIELDS`; `ShortcutsSheet` vs the keyboard handler).
20. **Anmol is non-technical:** literal, copy-paste-ready instructions; text/code in
    chat, no diagrams or HTML.
21. **`.env` is committed to this repo, deliberately.** Holds only the public anon
    key + Supabase URL. Do not delete it, do not re-gitignore it, do not "fix" this.
22. **Never mint a new composition from the UI/self-service path.** A doctor may
    attach a new *medicine* to an *existing* composition (`add_medicine` RPC); a new
    composition is a clinical decision requiring the full compositions → gates →
    rules pipeline. (2026-08-24: the composition-request fallback,
    `composition_requests` table, is the sanctioned way a doctor's "this salt is
    missing" ask reaches a human — a request queue, never a mint. See
    `cortex-data-model.md`.)
23. **The four-tier weight structure, Anmol's own words (2026-08-25): "symptoms
    should have full freedom to recommend assessment and even tests... but an
    assessment should carry super weight [for] the medicine or exercise."**
    Symptoms rank Possible Conditions and tests freely and always will — a
    differential is SUPPOSED to fire every plausible disease at once, that is
    what makes it a differential, not a bug. What must not happen is a
    *disease-specific* medicine (an antimalarial, an antibiotic aimed at one
    diagnosis) reading as confidently ranked off a symptom pattern that is
    itself ambiguous across several serious differentials — the doctor should
    see it move once they actually confirm which one it is, not before. Four
    tiers, by intent type, verified live 2026-08-25 across all 31 signals this
    session's `condition_observable_map` batches created: test 0.15–0.35
    (symptom-driven, unchanged — ordering a confirmatory test off a
    suspicious pattern is correct, not presumptive), referral ~0.45 (sits
    between test and medicine on purpose — lower stakes than a prescription),
    advice 0.35–0.55, medicine/exercise 0.55–0.85 (a floor clearly above any
    ordinary 1–2 signal symptom stack, capped so nothing saturates). This is
    an *approximation* of "confirming X means Y is no longer relevant" — the
    engine is purely additive (`lib/synapse/engine.ts`), nothing SUBTRACTS a
    competing diagnosis's weight, and no guard may ever hide a suggestion
    (rule 8) — so "super weight" is what actually available: the confirmed
    tier is engineered to outrank a merely-symptom-matched competitor in
    practice, not to suppress it. A genuinely competing mechanism (negative
    weights) would be a real engine change, not attempted. New content in this
    disease-differential shape (a symptom pattern several serious diagnoses
    share) should land in this same 4-tier structure from the start, not
    the flat single-tier weighting older content used — see
    `confirmed_diagnosis_dominant_weight_tier`/`malaria_medicines_require_
    confirmation_not_symptoms` migrations for the worked example. This is
    NOT retroactive across the ~1700 pre-existing rows — checked live,
    most of that content already ranks off a near-unambiguous single
    symptom (DYSURIA→nitrofurantoin, DENTAL_ABSCESS→amoxicillin,
    THROAT_EXUDATE→amoxicillin), a materially lower-risk pattern than
    fever+chills+rigors firing for malaria/dengue/typhoid/plain viral fever
    alike. A full audit for the same ambiguous-symptom shape elsewhere is
    real clinical review work, flagged not attempted.

**What's NOT covered here:** *why* each rule exists in narrative form beyond
the one-liner above (search the git history / `cortex-open-*.md` for the
session that established it), the engine's own internal doctrine (→
`engine.md`), consult-screen layout doctrine (→ `consult-ui.md`).
