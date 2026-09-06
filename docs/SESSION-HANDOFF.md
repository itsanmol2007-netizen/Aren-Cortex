# Session handoff — 2026-09-06 (Cortex payment rail + Consult blank-canvas — UNRESOLVED)

**Temporary, self-replacing. REWRITE THE WHOLE FILE.**

## Open, unresolved, top priority for next session

**Consult still shows a blank workspace on reload/re-login.** Reported
repeatedly this session; NOT fixed despite three attempted fixes (removed a
`queue.loading` wait, added a standing invariant effect, added a 1.5s
watchdog). User confirms: persists after a dev-server restart AND after a
full logout/login — rules out stale cache/HMR as the cause. This is a real
code bug not yet found.

**What's been verified, so the next session doesn't re-walk it:**
- `RequireAuth` gates the entire app behind a splash (`GateScreen`) until
  `auth.status === "authed"` — App.tsx cannot mount before then.
- `loadIdentity()` (`lib/auth.ts`) fetches the hospital row (`clinic_mode`
  included) and resolves it BEFORE `setState({status:"authed",...})` fires
  (both the live path and `adoptIdentity`, used by `LoginPage`) — so
  `workspace.isConsult` should be correct from App.tsx's first render, not a
  "cortex" fallback that later flips.
- `main.tsx`'s route tree: `/app/cortex` sits behind `RequireAuth` then
  `RequireRole allow={["doctor"]}` — no other gate in between.
- App.tsx has no top-level early-return loading gate of its own.
- The queue-open invariant's own render condition
  (`workspace.isConsult && queueSheetOpen`) has nothing else blocking it.
- Confirmed working via manual triggers (the "Register a patient" button
  from an empty queue correctly shows PatientModal + payment rail, per a
  user screenshot this session) — so the MECHANISM works, only the
  automatic-on-idle path is suspect.

**What's now in place to actually catch it, since I ran out of static-
analysis leads:** a TEMPORARY debug box, `App.tsx` (search
`blankCanvasDetected`) — renders bottom-left, dark red, only after the
"should be impossible" state (Consult, ready, no active consult, no
patient-modal/transition/queue-sheet, not on a feature page) has persisted
for 2+ full seconds (debounced specifically so it can't be a normal one-
frame flash during a working load). If the user sees this box, screenshot
it — that's confirmation the invariant effects are not firing and exactly
which one to instrument next. If they DON'T see it but still see blank
canvas, the bug is in a DIFFERENT condition than the four this box checks
(e.g. `hasActiveConsult` reading true from a stale/bad draft, or the render
condition for `QueueSheet` itself) — instrument that branch next.

**Remove the debug box (and its `blankCanvasDetected` state/effect) once
this is actually closed** — it's diagnostic-only, not a feature.

**Do not re-attempt another blind timing fix without the debug box's
output first** — three rounds of that already burned real trust this
session. Get the screenshot, then fix the specific thing it names.

## What else this session did (all believed working, unverified live)

1. **Cortex/Consult self-register payment rail** — `PatientModal.tsx` now
   carries a payment rail (`PatientPaymentRail.tsx`) as a real column
   inside its own single card (NOT a second floating card — that was a
   real regression, found and fixed mid-session: it used to be
   `flex-wrap`, read as two unrelated cards, wrapped below the modal
   instead of beside it, and silently ate clicks wherever it overlapped).
   Wired for both Cortex (always) and Consult's "Register a patient"
   escape hatch (same situation — doctor doing their own intake).
2. **Payment decision required before confirming a NEW patient** —
   Start consult / Use this patient now require Collect or Mark-as-unpaid
   first when a real fee is configured; the rail highlights itself rather
   than silently defaulting to pending. Existing-patient search-row clicks
   stay one-click, untouched.
3. **"Collected ₹X" reworded** — read as a completed, already-recorded
   transaction for a decision that writes nothing until a patient is
   confirmed. Now "Will collect ₹X — once you confirm a patient", plus a
   permanent footer note on the rail: "Nothing is recorded until you
   confirm a patient."
4. **GlobalLogoTrigger** — two real bugs: didn't know about the queue
   sheet/handover modal (so the sidebar was genuinely unreachable while
   either was open — "the doctor literally can't do anything"), and had
   its own third hardcoded "AREN Cortex" string (missed by the 2026-09-05
   fix that caught the other two), rendered on top of the real header at
   z-index 9998 — in Consult this read as "Consult"/"Cortex" stacked and
   garbled. Both fixed.
5. **Queue sheet / handover modal locking** — `ConsultModal` gained a
   `dismissable` prop; both surfaces are locked (no ×, Escape/backdrop
   inert) while no consult is active, so closing them can't land on a
   blank header. `handleSidebarNavigate` now tears both down when leaving
   the consult screen (was missing before — SESSION-HANDOFF from earlier
   this session already covers the detail).
6. **Queue detail panel** — thinned (~65/35), gained a quick-facts strip
   (visit count/last-seen/payment status), fixed a real off-by-one bug
   (`last_visit_at`/`visit_count` used to include the visit being viewed
   itself), added entrance/cross-fade animation. Also affects front desk's
   own `VisitRow` tooltip (same underlying fix).
7. **"Search existing" idle state** — was genuinely blank under the search
   box until 2+ characters typed. Now shows an icon + short copy.
8. **Settings search** — indexed the Staff card (existed since 2026-09-03,
   was never searchable — no anchor, no registry row), added real fuzzy
   (character-subsequence) matching, fixed the deep-link highlight
   animation (was fighting a CSS `transition` on the same property as its
   own hover state, which is why it barely read as a highlight at all).

**Everything in this list has passed `npx tsc -b` + `npm run build` every
round, but NONE of it has been seen rendering live by an agent in this
environment — that gap is now three sessions running.** The unresolved
item above is the direct, expensive cost of that gap: three rounds of
plausible-looking fixes for a bug that couldn't actually be reproduced to
verify against. Next session, if a live browser becomes available at any
point, spend it here first.

## Traps worth knowing before you edit

- **These files are CRLF.** A node script matching on `\n` silently does
  nothing. Read with `.replace(/\r\n/g,"\n")`, write back with the reverse.
- **`base.css` is unlayered and beats Tailwind utilities** — same for every
  legacy sheet in `styles/`. A Tailwind class fighting a legacy class on the
  SAME property loses regardless of source order; use an inline style to
  override a legacy property, or restructure the DOM instead.
- **A CSS `animation` and a `transition` on the same property fight** —
  found live this session (`.cx-setting-flash` vs `.prac-card`'s hover
  transition). `!important` on the animated property is the fix.
- **`React.StrictMode` double-invokes effects in dev** — noted while
  investigating the blank-canvas bug, ruled out as the cause, but worth
  remembering for the next timing-sensitive effect: dev-only double-run is
  expected and should still converge, not a bug on its own.
- **Supabase MCP refuses multi-statement writes.** Split them.
