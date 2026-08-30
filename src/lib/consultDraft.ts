// ---------------------------------------------------------------------------
// CONSULT DRAFT — surviving a reload or a dropped connection mid-consult.
//
// Anmol: "the problem of loosing a patient if connection drops or reloaded
// the page, you literally loose the last visit, and then forced to start a
// new one... preserve the last consult, maybe locally cache what was
// selected and all, and show that screen automatically, resume from there."
//
// What this is NOT: a general offline-drafting or auto-save system for
// everything typed on the chart. Every real finding/symptom/medicine is
// already written straight to the DB as it's entered (that's how the
// longitudinal record, the prescription and everything else on this screen
// works today) — the ONE thing that used to vanish on a reload was which
// PATIENT and which VISIT the doctor was even looking at, since that lived
// only in `useConsultSession`'s React state. This persists exactly those two
// facts — the patient (small, already-shaped `Patient` object) and the
// visit id — to `localStorage`, keyed per doctor so a shared clinic computer
// never resumes doctor A's consult into doctor B's session.
//
// "Done, discarded, or referred — don't worry about that" (Anmol): a consult
// that ends normally already flows through `useConsultSession.reset()` (a
// new patient picked, the encounter closed, etc.), which clears this draft
// as a side effect of `patient` going back to `null` — see the effect at
// this file's one call site (`App.tsx`). There's no separate "is this really
// done" flag to keep in sync; "no active patient in session state" already
// means the same thing here that it means everywhere else in this hook.
//
// Logging out is the one INTENTIONAL exit this must not survive (Anmol:
// "except literally logging out... means intentional") — `useLogout.ts`
// calls `clearAllConsultDrafts` for exactly that, since it doesn't know
// which doctor (if any) was signed in by the time it runs.
// ---------------------------------------------------------------------------

import type { Patient } from "../types";

const PREFIX = "aren-cortex:consult-draft:";
/** A draft older than this is more likely stale than useful — a doctor who
 *  hasn't touched this patient in over a day almost certainly moved on, and
 *  resuming a day-old in-progress consult unprompted would be more
 *  surprising than helpful. */
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export interface ConsultDraft {
    patient: Patient;
    visitId: string | null;
    savedAt: string;
}

function key(doctorId: string): string {
    return `${PREFIX}${doctorId}`;
}

export function saveConsultDraft(doctorId: string, patient: Patient, visitId: string | null): void {
    try {
        const draft: ConsultDraft = { patient, visitId, savedAt: new Date().toISOString() };
        localStorage.setItem(key(doctorId), JSON.stringify(draft));
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
