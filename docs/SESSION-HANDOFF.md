# Session handoff — 2026-09-03b (Cortex → Consult: mode, queue, handover, durations)

**Temporary, self-replacing. REWRITE THE WHOLE FILE.** `cortex-design-dna/*.md`
and `context/*.md` are stable reference — touch them only when a rule in them
is actually wrong.

## ⚠ HOW TO VERIFY IN THIS ENVIRONMENT

- `npm install`, `npx tsc --version` must say **5.9.3**, `npm run build` passes
  clean (0 errors). Chunk-size warning is pre-existing.
- **The sandbox browser cannot reach Supabase.** Confirmed again this session:
  the login screen renders and the auth call dies in the app's "Can't reach
  AREN" branch. Chromium IS available at
  `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`; drive it with
  `playwright-core` and **`proxy: { server: HTTPS_PROXY, bypass:
  "127.0.0.1,localhost" }`** or every local request dies as
  `ERR_CONNECTION_RESET` against the agent proxy.
- So visual verification is a throwaway harness (`preview.html` +
  `src/__preview.tsx`, both deleted afterwards) mounting the new components
  against mock `TodayVisit` / `IntakePreview` data on `vite --port 5200`.
  Screenshots + `getBoundingClientRect` were taken that way this session.

## What this session did

### 1. Cortex vs Consult is a MODE, derived not chosen
`src/lib/workspace/mode.ts` + `hooks/useWorkspaceMode.ts`. Reads
`hospitals.clinic_mode` (already written by registration):
`solo_reception`/`multi_doctor` → **Consult**, everything else and anything
unrecognised → **Cortex**. `WorkspaceHeader` and `PatientHeader` READ the hook
rather than taking a prop, so all twelve pages say the right product name for
free. **Anmol Homeo Clinics (Dr SK Pandey, 9559951905) is now
`solo_reception`** — that account serves Consult; every other clinic is
untouched and still Cortex.

### 2. Front desk → Consult handoff — and a real data-loss bug it closes
`lib/db/intake.ts` (`fetchVisitIntake`, `fetchIntakePreviews`,
`logOperationalEvent`) + `features/consult/useIntakePrefill.ts`. Reception's
symptoms/history/measurements/attachments land on the doctor's chart when the
consult opens, marked `'reception'` and fully editable.

**The bug:** `persistVisitInput` DELETEs a visit's `visit_observations` and
re-inserts from the doctor's chart on a 600ms debounce. With an empty chart,
the doctor's first keystroke silently erased everything the desk had entered.
The prefill runs **before `session.setVisitId`** — no visit id, no persist
effect, no race. Every start path in `useConsultLifecycle` now reads
`resolve → clear → prefill → set the id`; **a new start path must too.**
The same read restores a RESUMED consult's chart (the gap `resumeConsult`'s
own header used to list).

### 3. Queue, in the dark header
`features/consult/queue/` — `useConsultQueue` (wraps the front desk's own
`useQueue`, filters to this doctor, previews the first 10 intakes in ONE round
trip), `QueueSheet`, `TransitionModal`, `ConsultModal` (shell), `queueParts`.
Header control is `.tb-queue-btn` in `layout.css`, third member of the existing
`.tb-review-btn`/`.tb-cancel-btn` family. **In Consult the `+ Patient` button is
replaced by Queue**; registering directly moved into the queue sheet's footer
(receptionist away / walk-in) and is NOT gone.

### 4. Complete & Next
`PatientHeader`'s Review button says "Complete & Next" in Consult and
`ReviewModal` takes a `saveLabel` prop (NOT a fork — rule 6). On a successful
save `useConsultLifecycle` fires the new `onConsultSaved`, App opens
`TransitionModal`: next patient's prepared intake, compact 5-row queue, **10s
auto-continue that stops permanently on any real interaction**, override →
progressive "Continue ahead of queue?" (Back | Continue with X), full-queue
view and back. An override writes `operational_events` (new table, hospital
RLS) naming who was taken AND who was skipped.

### 5. Duration — any number, both sides
`features/consult/duration.ts` + `scripts/duration-catalogue.mjs`
(`npm run check:duration`). Physio's duration slot had 18 hard-coded terms so
"4 days"/"17 days" could not be entered; `story.ts` now synthesises the exact
answer and derives the ranked bucket (`durationBucket`). General OPD gained the
same question in its command bar for ~90 curated complaints — Space skips, a
bare number offers days/weeks/months. Crossing a threshold **offers** a
catalogue chip that already exists (18d fever → "Fever over 2 weeks"), one
click, never applied silently. The front desk asks it too, on the chip
(`ObservablePicker`'s `DurationBox`); symptom chips there are now rose and
history violet, matching the Case Sheet.
Storage: `visit_observations.duration_days`, re-supplied by `persistVisitInput`
on every write so its delete-and-reinsert cannot destroy it.

### 6. Staff management
`lib/db/staff.ts` + `features/clinic/StaffModal.tsx` + a Staff card on
`ClinicPage`. List, rename, change role, activate/deactivate; you cannot demote
or deactivate yourself. **Creating a login is deliberately absent** — `users`
INSERT is gated on `id = auth.uid()` (registration only), so that button would
always fail; the modal says where people actually join from.

## Schema added (live, via MCP — no migrations folder in this repo)
- `operational_events` (hospital-scoped RLS) — durable clinic audit, distinct
  from the front desk's localStorage `eventLog.ts`.
- `visit_observations.duration_days` (nullable int).
- `visit_observations_source_check` widened with `'reception'`.
- `hospitals.clinic_mode` for Anmol Homeo Clinics set to `solo_reception`.

## Flagged / not done
- **Not verified against live Supabase.** Layout and interaction were verified
  in a browser against mock data; the end-to-end flow (real login → real queue
  → save → handover → next patient) has NOT been run, because this sandbox
  cannot reach Supabase from a browser. **Run that first next session.**
- `useConsultQueue` polls through `useQueue`'s 25s interval; the transition
  modal reads the queue as of the last poll plus one refetch on save.
- Attachments from reception appear via `AttachmentsCard` (same `visitId`) —
  not separately re-surfaced in the consult body beyond the count on the
  handover card.
- Cortex is untouched behaviourally: same header buttons, same cold start, same
  save. Worth a regression pass on a `solo` clinic anyway.
