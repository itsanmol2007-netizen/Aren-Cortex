# Session handoff — 2026-09-06 (Cortex gets its own fee capture)

**Temporary, self-replacing. REWRITE THE WHOLE FILE.** `cortex-design-dna/*.md`
and `context/*.md` are stable reference — touch them only when a rule in them
is actually wrong.

## What this session did

### Cortex's own payment rail — the open question from 2026-09-05, answered
Last session's handoff flagged this as open: *"Cortex's own patient entry has
no fee UI… is the fee captured at registration or at the end of the
consult?"* Answered: **at registration, same moment Consult's front desk
decides it** — `PatientModal.tsx` (`components/PatientModal.tsx`) now carries
a persistent payment rail beside its search/create surface, built in Tailwind
(`components/PatientPaymentRail.tsx`, new file), reusing `lib/db/payments.ts`
unchanged (that module was already generic, not front-desk-specific).

- **Not a copy of front desk's `PaymentRail`.** Same job (visit type → fee →
  collect-or-not → discount, one decision on screen at a time) and the exact
  same fee maths, but Cortex's own skin: `PatientModal`'s existing pink→violet
  gradient language (`#f472b6` → `#a855f7`, `.pm-*` in
  `components-modals.css`) rather than front desk's flat indigo `#5b4fe9`.
  No doctor picker either — a Cortex visit is always the one signed-in
  doctor, so the rail only ever shows one doctor's numbers.
- **Gated on `billing` (App.tsx: `workspace.isConsult ? undefined : {...}`).**
  Pure Cortex only. Consult's own manual-register escape hatch
  (`registerRequested`, Ctrl+N while a doctor has a front desk) renders the
  same `PatientModal` with no `billing` — front desk already owns that
  clinic's money, so it gets no rail and behaves exactly as before (the
  wrapper div collapses to `display:contents` in that case — zero layout
  diff).
- **Zero added clicks.** The rail is a persistent companion, not a gate —
  whatever it's currently set to when a search row is clicked, a duplicate is
  adopted, or "Start consult" is pressed IS what gets recorded (undecided →
  pending, same "never record an unanswered question as money collected"
  rule front desk's rail follows). Confirming a patient was already one
  click; it still is.
- **Follow-up default, scoped down from front desk's version.** Front desk
  auto-defaults visit type from the ONE patient in its form. Cortex's search
  mode shows several candidates before any one is chosen, so there's no
  single patient to default a toggle to — visit type stays a plain manual
  control (default "New") until a specific patient is actually clicked, at
  which point `defaultVisitType` + a batched `fetchPatientVisitStats` (fired
  whenever the search list changes) decide the CHARGED type silently, unless
  the doctor already touched the toggle themselves. The duplicate-detected
  path in "New patient" mode (`matchedPatient`) DOES get the same live
  auto-default front desk has, because that path — like front desk's own
  form — already has one specific, identified patient.
- **The write itself** lives in `useConsultLifecycle.handlePatientConfirm`,
  fire-and-forget after `resolveVisitForConsult` (rule 4 — a fee that fails
  to write must never fail a visit that's already committed), via the same
  `recordVisitPayment` front desk calls. New shared type,
  `payments.ts`'s `ConfirmedPayment` — what a fully-resolved intake surface
  hands its caller, decoupled from the `visitId`/`hospitalId`/`doctorId`/
  `actor` only the caller knows.
- **No `lib/db/payments.ts` changes beyond the new `ConfirmedPayment` type.**
  Confirms it was built generically the first time.

Files: `src/components/PatientPaymentRail.tsx` (new), `PatientModal.tsx`,
`hooks/useConsultLifecycle.ts`, `lib/db/payments.ts`, `App.tsx`. `npx tsc -b`
and `npm run build` both pass clean (pre-existing ~1.86MB chunk-size warning,
unchanged in kind).

## What is NOT done

1. **Visual verification.** Same standing gap as last session — nothing
   behind login has been seen rendered by an agent in this environment.
   Measure this rail against a live sign-in before trusting the pixel
   choices above.
2. **The search-mode "no default until clicked" tradeoff above** is a
   judgement call, not a limitation forced by the data — `fetchPatientVisitStats`
   is already batched per search result, so a future pass COULD surface a
   small "usually follow-up" hint per row before the click, if that's ever
   asked for.
3. **Collecting payment later from a Cortex visit** has the same gap front
   desk's rail already names in its own copy — no visit-page surface exists
   yet to revisit an "unpaid" decision after the fact, in either workspace.

## Traps worth knowing before you edit

- **These files are CRLF.** A node script matching on `\n` silently does
  nothing. Read with `.replace(/\r\n/g,"\n")`, write back with the reverse.
- **Bash heredocs mangle box-drawing characters and `₹`.** Use the Write tool
  for anything containing them, or a `.cjs` file written via Write.
- **`base.css` is unlayered and beats Tailwind utilities** — and so is every
  other legacy sheet in `styles/` (`components-modals.css`'s `.pm-*`
  included). A Tailwind width/layout utility on an element that already
  carries a legacy class from one of these sheets will silently lose to it
  regardless of source order or specificity math — don't fight it with more
  Tailwind, either restructure the DOM (this session's `display:contents`
  trick) or fall back to an inline style.
- **Supabase MCP refuses multi-statement writes.** Split them.
