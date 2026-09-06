# Session handoff — 2026-09-06 (Consult never goes blank, queue redesign, settings search fixed)

**Temporary, self-replacing. REWRITE THE WHOLE FILE.** `cortex-design-dna/*.md`
and `context/*.md` are stable reference — touch them only when a rule in them
is actually wrong.

## What this session did

### 1. Cortex's own payment rail (see previous round for the full write-up)
`PatientModal.tsx` now carries a persistent payment rail
(`PatientPaymentRail.tsx`, new, Tailwind, the modal's own pink→violet
palette) beside its search/create surface. Answers the open question from
2026-09-05: fee capture happens at registration, same moment front desk
decides it. Now wired for **both** workspaces — Consult's own
"Register a patient" escape hatch (front desk unavailable) is the identical
situation (the doctor doing intake themselves) and gets the same rail; it
was Cortex-only for about one commit before this session extended it.

### 2. Consult can no longer land on a blank workspace
The complaint: finish a consult (or open with an empty queue) and the dark
header shows nothing — no patient, no way back in except a reload.

- `ConsultModal` (the shell under `QueueSheet` and `TransitionModal`) gained
  a `dismissable` prop (default `true`, every existing caller unaffected).
  `false` hides the ×, and Escape/backdrop become no-ops — the same doctrine
  `PatientModal` already applies to itself while intake is mandatory.
- `QueueSheet`: `dismissable={hasActiveConsult}`. Locked while nobody's in
  the room; dismissable again once a consult is active (closing then just
  returns to that patient).
- `TransitionModal` (the "Complete & Next" handover) never has an active
  consult behind it BY CONSTRUCTION — it's always `dismissable={false}` now.
  "Not now"/"Done" (pure dismiss buttons) are gone; Continue and Register-a-
  patient are the only ways out, in both its populated and empty branches.
- App.tsx's queue-opening effect used to be a once-per-mount "cold start"
  check, and only fired when someone was actually waiting. It's now a
  standing invariant (re-evaluated on every relevant state change): whenever
  Consult has no active consult, the doctor isn't on a feature page
  (Patients/Practice/Settings stay freely reachable — this is NOT about
  trapping a doctor who's just browsing), and nothing else already covers
  the screen, the queue sheet opens — even with an empty queue, since its
  own empty state is a live, useful screen, not a modal for nothing.

### 3. Queue detail panel — thinner, richer, animated
`queueParts.tsx` / `QueueSheet.tsx`:
- Grid ratio ~54/46 → ~65/35 (queue : detail). The detail column is a
  glance, not a form.
- New `QuickFacts` strip (earlier-visit count, last-seen date, payment
  status/amount when the clinic has a fee configured) — all data already
  fetched onto `TodayVisit`, just never surfaced before now.
- **Found and fixed a real, pre-existing bug** while building this:
  `fetchTodayVisits`'s `last_visit_at`/`visit_count` included the visit
  being viewed itself, so a returning patient always read as last seen
  "Today" (their last visit before now doesn't matter, the query always
  found today's own row first) and the old "N previous visits" line under-
  counted by one in the wrong direction (`VisitDetailModal.tsx` right next
  door already does this correctly — `visit_count - 1` — `queueParts.tsx`
  was the one outlier). Fixed at the source in `lib/db/patients.ts`; front
  desk's own `VisitRow` "returning patient" tooltip was silently affected
  by the same bug and is fixed by the same change.
- Entrance animation on `ConsultModal` (spring, matching this app's
  existing "card entering" convention — was instant before) and a cross-
  fade on the detail panel when the shown patient changes.

**Not done, and said so rather than guessed:** a broader typography pass
("cleaner", "better separation") was NOT attempted beyond what's above —
this environment cannot render the app behind login (standing gap, see
every recent handoff), and guessing at more pixel changes with no way to
look at them is how `panel-structure.md`'s own "measure before trusting"
rule gets violated. Next session: get a human to look at the queue sheet
live before tuning type sizes further.

### 4. Staff management already existed — it just wasn't findable
Asked for as if new; it's real and has been since 2026-09-03 (`ClinicPage`'s
Staff card + `StaffModal.tsx` — list, rename, change role, deactivate/
reactivate, gated so nobody can lock themselves out). It rendered with no
DOM anchor and no row in `settingsRegistry.ts`, so the Settings search
could never find it — exactly the "some new things added and can't search
for them" complaint. Fixed: `id="clin-card-staff"` + a `clinic.staff` entry.

### 5. Settings search — fuzzy matching, and the highlight actually reads now
`settingsRegistry.ts`: audited every anchor against the pages that own them
(all were real DOM ids except Staff's, above — the search wasn't sending
doctors to broken links, it just had one whole card missing). Added real
fuzzy matching — a character-order subsequence pass over label/keywords,
gated to 3+ character queries, run only after substring/keyword/description
all miss, ranked below every exact hit. Deliberately not applied to the
free-text description (too long — a short query subsequence-matches almost
any sentence, which is noise, not fuzziness).

`settings.css`'s `.cx-setting-flash` (the "you're redirected AND the exact
setting is highlighted for a couple seconds" mechanism, `settingsFocus.ts`):
was a single subtle box-shadow ring at 0.42 peak opacity, sharing the
`box-shadow` property with `.prac-card`'s own hover `transition` — the two
were fighting, softening exactly the edges an eye needs to catch a flash.
Now three redundant compounding cues (`!important` background wash + a
bolder two-layer ring + a brief scale pop), so one being faint on a given
background doesn't mean the whole cue is invisible. `FLASH_MS` bumped to
match the new animation's real duration (was cutting the fade off mid-
motion).

Files touched this round: `App.tsx`, `PatientModal.tsx`,
`features/consult/queue/{ConsultModal,QueueSheet,TransitionModal,
queueParts}.tsx`, `lib/db/patients.ts`, `features/clinic/ClinicPage.tsx`,
`features/settings/{settingsRegistry.ts,settingsFocus.ts,settings.css}`.
`npx tsc -b` and `npm run build` both pass clean.

## What is NOT done

1. **Visual verification of all of the above.** Standing gap, top of next
   list, every session in a row now — get a human to sign in and look.
2. **Typography/spacing tuning on the queue sheet** beyond the thinning +
   facts strip above — deferred, see §3.
3. **Cortex's own patient entry payment rail** (previous round) has the
   same visual-verification gap.
4. Everything already listed as not-done in the payment-rail round
   (fee-later-from-visit-page surface, follow-up-fee "same complaint"
   logic, WhatsApp parked) is unchanged.

## Traps worth knowing before you edit

- **These files are CRLF.** A node script matching on `\n` silently does
  nothing. Read with `.replace(/\r\n/g,"\n")`, write back with the reverse.
- **Bash heredocs mangle box-drawing characters and `₹`.** Use the Write tool
  for anything containing them, or a `.cjs` file written via Write.
- **`base.css` is unlayered and beats Tailwind utilities** — and so is every
  other legacy sheet in `styles/` (`components-modals.css`'s `.pm-*`
  included). A Tailwind width/layout utility on an element that already
  carries a legacy class from one of these sheets will silently lose to it
  regardless of source order or specificity math.
- **A CSS `animation` and a `transition` on the SAME property fight** —
  found live this round (`.cx-setting-flash`'s box-shadow vs `.prac-card`'s
  own hover transition). `!important` on the animated property is the fix,
  not a longer duration or higher opacity.
- **A same-named field on two adjacent aggregate queries can mean two
  different things** — `TodayVisit.last_visit_at`/`.visit_count` (built
  fresh per today's queue, used to include the row itself) vs
  `PatientVisitStats` from `fetchPatientVisitStats` (built BEFORE a visit
  exists, so it never had this problem). Don't assume a field means the
  same thing everywhere it's spelled the same.
- **Supabase MCP refuses multi-statement writes.** Split them.
