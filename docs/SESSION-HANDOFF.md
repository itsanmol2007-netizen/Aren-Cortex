# Session handoff — 2026-09-08 (four bugs from live use, found by reading code, not verified live)

**Temporary, self-replacing. REWRITE THE WHOLE FILE.**

Follow-up round to 2026-09-06's Overview/admin rewrite and Create-New-Patient
work. Anmol tried it live and reported four real problems. **This round could
not get a browser working against this sandbox's proxy** (see "Live
verification" below) — every fix here is from reading the code end to end,
not from clicking through it. Treat that as real risk, not a formality.

## What shipped, in order

### 1. Payment lock showed the WRONG reason on an existing patient

`CreateVisitModal`'s Paid/Not Paid lock (built 2026-09-06) always said
"Complete the patient's name, phone, age and sex to continue" — flatly wrong
for an EXISTING (already-selected) patient who just hadn't picked a symptom
yet, since none of those fields apply to them. A locked control with a
reason that doesn't match the screen reads as broken, which is very likely
what "you can't actually create any visit... unless you verify payment
status" was describing.

Fixed: `PaymentRail`'s `locked: boolean` prop is now `lockReason?: string`,
computed in `CreateVisitModal` from what's ACTUALLY still missing (existing
patient missing only a symptom now sees "Add the patient's symptoms to
continue.", nothing about name/phone/age/sex). Mechanically, the underlying
gate (`formComplete`) is unchanged — only the message was wrong.

**Not ruled out:** a genuinely separate hard failure on the existing-patient
path, if one exists — I could not click through it to check. If the fixed
message still doesn't explain what's on screen, that's the next thing to
chase, not a re-read of this same code.

### 2. WhatsApp auto-sent on every "Complete Consult" — now explicit only

`useConsultLifecycle.ts`'s `handleConfirmAndSave` fired `sendPrescription`
unconditionally on every save with a patient phone on file — by design,
per its own old comment ("consultation completed → prescription generated →
send"). Anmol: *"there is a dedicated message for whatsapp, it should not be
automatic."* That dedicated action already existed in the UI —
`ReviewModal`'s green "WhatsApp" button — it just had **no `onClick` at
all**, a dead button sitting next to a save action that quietly did its job
for it.

Fixed: `handleConfirmAndSave(opts?: { sendWhatsApp?: boolean })` — the send
only fires when `sendWhatsApp: true`. Plain "Confirm & Save" (`onSave`,
keyboard shortcut included) passes nothing → no send, ever. The WhatsApp
button now calls `onSendWhatsApp` → `handleConfirmAndSave({ sendWhatsApp:
true })` → same save, plus the send. A patient with no phone now gets its
own toast when the button is clicked (used to fail silently, fine when this
was an automatic side effect nobody consciously triggered — wrong now that
it's an explicit click that visibly does nothing otherwise).

### 3. Communication page never showed the actual template wording

Nowhere in the product showed the real "Prescription Ready" copy (header/
body/button) to a doctor — it only existed in server code
(`server/whatsapp/client.js`, `server/messaging/providers/meta.js`) and this
repo's own docs. Added a "Message templates" card to `CommunicationPage.tsx`
(new `WhatsAppTemplatePreview` in `parts.tsx`) rendering the real header/
body/button in a WhatsApp-bubble shape, static content matching the send
path exactly. Follow-up's card is an honest placeholder — that copy was
never designed (see `communication-credits.md`), so it says "not finalized
yet" rather than inventing wording.

### 4. Discarding an active consult from the queue silently did nothing visible

Reported: opening a new patient from the queue while a consult is active
shows `ActiveConsultGuard` ("what do you want to do with this current
visit?"); clicking Discard (or Save as draft/referral) DOES write the DB
change (`updateVisitStatus`) but the card never disappears and the new
consult never opens.

Root cause, found by tracing `App.tsx`: `pendingQueueAction.current` was set
to `() => consultFromQueue(visit, aheadOfQueue)` — i.e. it re-invoked the
SAME guarded function it was called FROM. `onDiscard`/`onComplete` call
`resetConsultState()` (schedules state updates, doesn't apply them
synchronously) and then immediately run `pendingQueueAction.current()` in
the same tick — so the re-invoked `consultFromQueue` still read its OWN
closed-over `hasActiveConsult` as `true` (the value from when the pending
action was captured, not yet re-rendered), took the "guard again" branch,
and called `setActiveConsultGuardOpen(true)` — landing in the SAME React
batch as the `setActiveConsultGuardOpen(false)` that had just run, netting
to `true` and no visible change. Classic stale-closure-on-a-ref bug.

Fixed by splitting both `consultFromQueue` and `registerPatientDirectly`
into a guarded wrapper (checks `hasActiveConsult`, unchanged) plus an
unguarded core (`startConsultForQueueVisit` /
`registerPatientDirectlyNow`) — `pendingQueueAction` now always stores the
CORE, which never re-checks `hasActiveConsult` and so cannot re-trigger the
guard it was just dismissed from. Also removed a stray leftover comment on
that render (`// ← ADD THIS LINE (the ! means...)`) that had no business
being in committed code.

### 5. Communication's chat preview, corrected (not the standalone card from earlier)

Anmol: the "Message templates" card added earlier this round was wrong on
its own terms — he wanted the EXISTING conversation/chat preview updated to
show the real template, not a new standalone card. Reverted that card;
`WhatsAppTemplatePreview` (`parts.tsx`) now renders INLINE in
`ConversationPanel`'s message thread, replacing the plain "Prescription for
X" bubble for any outbound `purpose === "prescription"` message — real
header/body/button, with the actual patient name, the sending doctor's name
(`doctor_id` looked up via `fetchDoctorsByHospital`) and the clinic's name
(`fetchHospitalCached`) substituted in. The button is live: "View
Prescription" opens the SAME `ReviewModal` (`mode="print"`) pipeline Print
RX's reprint door uses, via `fetchPrescriptionRenderData(prescription_id)`
— never a second renderer.

### 6. The SAME "payment decided before a patient exists" bug, in the OTHER intake modal

Round 1 of this handoff only fixed front desk's `CreateVisitModal`/
`PaymentRail`. There is a SECOND, separate "find or create patient + pay"
implementation — `PatientModal.tsx` + `PatientPaymentRail.tsx` — mounted
once in `App.tsx` and used by BOTH Cortex and Consult (the doctor's own
direct-intake door, not the front-desk receptionist's). Anmol's screenshot:
"Search existing" tab, nothing typed, and the rail already showing a
confirmed "Will collect ₹472 · Cash — once you confirm a patient." Missed
it entirely in round 1 by assuming "Consult" meant the front-desk modal
specifically — should have checked both search-and-create-patient surfaces
from the start.

Note this one never actually WROTE anything prematurely — `PatientPaymentRail`
only ever builds a plan `onConfirm` applies once a real patient is
established, unlike front desk's old bug. Still reads as broken regardless
of what is or isn't written underneath, so fixed the same way: added
`lockReason` (mirroring front desk's), computed in `PatientModal.tsx` from
the SAME identity-validity rule the modal already used for its own confirm
button (`isFormValid`, or a matched duplicate) — plain "Search existing"
mode locks unconditionally, since a result row there confirms in one click
and was never gated on this rail's decision at all (that's an existing,
deliberate, UNCHANGED behavior — see `paymentError`'s own doc comment in
`PatientModal.tsx`). The existing `needsDecision` reactive nudge (fires if
`Confirm`/`Start consult` is pressed with identity valid but fee still
undecided) is untouched and still fires as a defense-in-depth on top of the
new proactive lock.

## Live verification — what happened and why it's still not done

Tried hard this round: started the vite dev server, got Playwright's
Chromium loading the app and even completing plain `GET`s to Supabase
through the sandbox's agent proxy (confirmed via a hand-rolled local Node
CONNECT relay — `curl`/Node's own TLS client complete the handshake fine
through the proxy, including POST + HTTP/2 + TLS 1.3). **Chromium's own TLS
client specifically cannot** — every CONNECT tunnel for Chromium's traffic
(to Supabase, Google, fonts.googleapis.com, everything) gets reset by the
upstream side after ~6s having sent a ClientHello and received zero bytes
back, disabling QUIC/ECH/etc. didn't change it. This matches the PRIOR
session's own note about a Chromium-specific TLS limitation in this sandbox,
which apparently had a workaround ("a local Node relay via undici's
ProxyAgent") that was never committed anywhere — it doesn't exist in this
checkout or git history, so it couldn't be reused, only rediscovered, and
rediscovering it burned real time this round without success. **Next
session: don't re-attempt the from-scratch investigation — either the user
provides whatever made it work before, or accept static code review as the
verification method and say so upfront.**

## Next, in the order I'd do it

1. **Get eyes on this live** — a human clicking through beats any amount of
   static reading. All four fixes above are reasoned through carefully but
   NONE have been clicked.
2. If #1's existing-patient lock message is still wrong or still blocks
   incorrectly once seen live, that's a real second bug to find, not a
   repeat of this round's fix.
3. Everything from the 2026-09-06 handoff that was still open stays open:
   SK Pandey's 76-credit test state, `RC_2`'s pending recharge, the
   follow-up-message scheduler, real Meta template submission, an admin UI
   for `approve_credit_recharge`.

## Traps worth knowing before you edit (carried forward + this round's)

- **Chromium cannot complete a TLS handshake through this sandbox's agent
  proxy** — confirmed again, harder, this round. `curl`/Node's own `https`
  DO work through it (proven with GET, POST, HTTP/2, TLS1.3). Don't
  rediscover this from scratch again; ask whether a working relay script
  exists somewhere outside this repo before spending time on it.
- **`doctors.is_clinic_admin` is NOT `users.role`.** Never write `role:
  'admin'` to promote a doctor.
- **`button:disabled` in this codebase is not decoration-safe** —
  `styles/base.css`'s unlayered rule beats every Tailwind override.
- **`input, select { padding: 0 9px }`**, same file — icon-in-input layouts
  need the Tailwind `!` bang on padding.
- Supabase MCP's `execute_sql` refuses multi-statement writes;
  `apply_migration` handles a whole file fine.
- `node_modules` starts empty in a fresh container; `npm install` first.
