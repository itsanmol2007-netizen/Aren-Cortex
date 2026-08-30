// ---------------------------------------------------------------------------
// CONSULT DRAFT — surviving a reload or a dropped connection mid-consult.
//
// Anmol, first pass: "preserve the last consult, maybe locally cache what
// was selected and all, and show that screen automatically, resume from
// there." Then, once that first pass turned out to only restore WHICH
// patient/visit, not what had actually been typed or ticked: "measurement,
// prescribed medicine, notes and everything... those populated things also
// should be saved... the whole page should survive how it was before."
//
// So this now snapshots the three pieces of consult state that live ONLY in
// React memory until the doctor hits Save (`commitConsultation`/`saveConsult`
// write them all at once, at the end — see useConsultLifecycle's
// `handleConfirmAndSave`): the chart, the prescription plan, and the story.
// Debounced-persisted from App.tsx (`useConsultDraftPersistence`) on every
// change, restored the same way on the next mount for the same doctor.
//
// Deliberately NOT in here — because it's already safe without this file:
//   - Examination readings (ROM/MMT/special tests) and marked body sites.
//     `useExamination`/App.tsx's `markedExam` effect both re-fetch from the
//     DB keyed on `visitId` alone, because those writes go straight to
//     `visit_body_sites`/exam tables AS THEY'RE ENTERED (see
//     useExamination.ts's own header) — restoring the correct `visitId`
//     (which this file's `patient`/`visitId` fields still do) is the whole
//     fix for those; snapshotting them a second time here would just be a
//     second, staler copy of what the DB already has.
//   - The accept-ledger (which brand was chosen, which suggestion was
//     dismissed) — recommendation-engine bookkeeping, not clinical content;
//     losing it means a suggestion might reappear that was already acted on,
//     not that any recorded data disappears.
//
// "Done, discarded, or referred — don't worry about that" (Anmol): a consult
// that ends normally already flows through `useConsultLifecycle
// .resetConsultState()` (Save & Close, a new patient picked, etc.), which
// clears this draft as a side effect of `patient` going back to `null`.
//
// Logging out is the one INTENTIONAL exit this must not survive (Anmol:
// "except literally logging out... means intentional") — `useLogout.ts`
// calls `clearAllConsultDrafts` for exactly that.
// ---------------------------------------------------------------------------

import type { Patient, PrescriptionMedicine, SelectedSymptom, Vitals } from "../types";
import type { ChipOrigin } from "../hooks/useConsultChart";
import type { ExerciseLine } from "../features/consult/exercisePlan";
import type { Story } from "../features/consult/story";

const PREFIX = "aren-cortex:consult-draft:";
/** A draft older than this is more likely stale than useful — a doctor who
 *  hasn't touched this patient in over a day almost certainly moved on, and
 *  resuming a day-old in-progress consult unprompted would be more
 *  surprising than helpful. */
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** `useConsultChart`'s raw state, everything `replaceChart` (Repeat Rx)
 *  deliberately does NOT touch plus everything it does — a resume is not a
 *  repeat, it needs all of it back exactly as it was. `chipOrigins`, a Map
 *  in memory, travels here as entries (`JSON.stringify` drops a Map's
 *  contents silently — it serializes to `{}`). */
export interface ChartDraft {
    vitals: Vitals;
    selectedSymptoms: string[];
    selectedSymptomsWithIntensity: SelectedSymptom[];
    selectedFindings: string[];
    chipOrigins: [string, ChipOrigin][];
}

/** `useConsultPlan`'s own in-progress-only fields — the ones its `reset()`
 *  clears. `selectedMedicineId`/`stagedMedicine`/`pendingMedicine` are
 *  deliberately excluded: transient mid-pick UI state (a medicine search
 *  result highlighted, a dose being configured before "Accept"), not
 *  recorded content — losing them costs re-opening one picker, not a
 *  recorded reading. */
export interface PlanDraft {
    prescription: PrescriptionMedicine[];
    selectedTests: string[];
    selectedLabName: string | null;
    diagnoses: string[];
    followUpDays: number | null;
    adviceNotes: string;
    therapyNotes: string;
    exercisePlan: ExerciseLine[];
    visitNotes: string;
}

/** `useVisitStory`'s own draft fields. `goals`/`scoreHistory` aren't here —
 *  those are the PATIENT's standing goals, fetched fresh by patient id
 *  regardless of which visit is open, not this visit's own unsaved work. */
export interface StoryDraft {
    story: Story;
    /** goalId -> today's score, entries (see `chipOrigins` above for why) */
    todayScores: [number, number][];
}

export interface ConsultDraft {
    patient: Patient;
    visitId: string | null;
    savedAt: string;
    chart: ChartDraft;
    plan: PlanDraft;
    story: StoryDraft;
}

function key(doctorId: string): string {
    return `${PREFIX}${doctorId}`;
}

export function saveConsultDraft(doctorId: string, draft: Omit<ConsultDraft, "savedAt">): void {
    try {
        const full: ConsultDraft = { ...draft, savedAt: new Date().toISOString() };
        localStorage.setItem(key(doctorId), JSON.stringify(full));
    } catch {
        // Private browsing / storage full / disabled — resuming is a nicety,
        // never something the consult itself depends on.
    }
}

export function loadConsultDraft(doctorId: string): ConsultDraft | null {
    try {
        const raw = localStorage.getItem(key(doctorId));
        if (!raw) return null;
        const draft = JSON.parse(raw) as ConsultDraft;
        if (!draft?.patient?.id || !draft.savedAt) return null;
        if (Date.now() - new Date(draft.savedAt).getTime() > MAX_AGE_MS) {
            localStorage.removeItem(key(doctorId));
            return null;
        }
        return draft;
    } catch {
        return null;
    }
}

export function clearConsultDraft(doctorId: string): void {
    try { localStorage.removeItem(key(doctorId)); } catch { /* see saveConsultDraft */ }
}

/** Every doctor's draft, wherever this browser is signed out from — see this
 *  file's own header for why `useLogout.ts` needs this rather than the
 *  single-doctor `clearConsultDraft`. */
export function clearAllConsultDrafts(): void {
    try {
        for (let i = localStorage.length - 1; i >= 0; i--) {
            const k = localStorage.key(i);
            if (k?.startsWith(PREFIX)) localStorage.removeItem(k);
        }
    } catch { /* see saveConsultDraft */ }
}
