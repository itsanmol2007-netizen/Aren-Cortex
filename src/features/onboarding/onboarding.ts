// ---------------------------------------------------------------------------
// THE FIRST-RUN WALKTHROUGH — what it says, and where it points.
//
// Anmol, 2026-09-14: "a beautiful ui and ux walkthrough for the very first
// sign in of a new user, to guide what to do... without being overwhelming",
// "with actual pointing in ui to those buttons and all", "skippable if they
// want", and — scoping it — "for now just for doctors".
//
// ── WHY THIS IS NOT A TOUR ─────────────────────────────────────────────────
// The reflex answer is a dimmed overlay that spotlights one element at a
// time behind a Next button, six steps deep. That is the wrong shape for a
// tool a doctor opens a hundred times a day: it is a wall in front of the
// first patient, and it teaches the whole app at a moment when the doctor
// can only absorb the first thing.
//
// So there is no step counter, no forced order, no dimming. Each hint waits
// for the doctor's OWN action to make its target real — the Consult button
// hint when the rail is on screen, the case-sheet hint when a consult is
// actually open, the plan hint when there is something on the plan to print
// — and then appears once, alone, and never again. Skipping any of it is
// one click, permanently.
//
// ── WHAT IT DELIBERATELY DOES NOT EXPLAIN ──────────────────────────────────
// There is no hint on "the ranked lists are Synapse reasoning". The staged
// cascade and its blue sweep (see `cascade.ts`) were built to say exactly
// that, wordlessly, the first time a chip lands. A callout on top would be
// the app explaining its own animation — and would make the animation the
// thing being read rather than the thing being felt.
// ---------------------------------------------------------------------------

import { supabase } from "../../lib/supabase";

/** Progress, as stored in `doctors.onboarding_state` (jsonb, nullable). */
export interface OnboardingState {
    /** has seen — or skipped past — the welcome card */
    welcomed?: boolean;
    /** asked to be left alone. Nothing further ever fires. */
    skipped?: boolean;
    /** hint ids already shown, by `CoachStep.id` */
    seen?: string[];
}

export const EMPTY_ONBOARDING: OnboardingState = {};

/**
 * One hint.
 *
 * `anchor` is a `data-coach` attribute value, not a ref: these three targets
 * live in three unrelated component trees (the nav rail, the consult
 * composer, the plan rail), and threading refs up to a common owner would
 * put onboarding into the signature of every component in between. The
 * codebase already uses attribute hooks exactly this way for the roving
 * cursor (`data-cx-planline`, `data-cx-cursor`) — same trick, same reason.
 */
export interface CoachStep {
    id: string;
    /** the `data-coach` value to find in the DOM */
    anchor: string;
    title: string;
    body: string;
    /** which side of the target the callout sits on */
    placement: "right" | "top" | "left";
    /**
     * When set, the hint waits for this to be true as well as for the anchor
     * to exist — a hint pointing at a disabled button is an instruction the
     * doctor cannot follow.
     */
    requireEnabled?: boolean;
}

/**
 * In the order a first consult actually happens. The order matters only as a
 * tie-break: if two are somehow eligible at once (a doctor who opens a
 * consult before the rail hint ever had a frame to appear in), the earlier
 * one goes first and the other waits its turn rather than stacking.
 */
export const COACH_STEPS: CoachStep[] = [
    {
        id: "consult.start",
        anchor: "consult.start",
        title: "Start a consult here",
        body: "Every visit begins from this button — it opens the workspace with your patient loaded.",
        placement: "right",
    },
    {
        id: "case.search",
        anchor: "case.search",
        title: "Type what the patient tells you",
        body: "A symptom, a finding, how long it's been. Cortex ranks conditions, tests and medicines as you go — you never fill in a form.",
        placement: "top",
    },
    {
        id: "plan.review",
        anchor: "plan.review",
        title: "Finish here",
        body: "Review the prescription, print it, or send it straight to the patient on WhatsApp.",
        placement: "left",
        // Pointing at "Review & Print" while it is greyed out (an empty plan)
        // would be telling the doctor to press something that cannot be
        // pressed. It waits until there is a real prescription behind it.
        requireEnabled: true,
    },
];

/** Everything done — nothing left to show this doctor, ever. */
export function isFinished(state: OnboardingState): boolean {
    if (state.skipped) return true;
    if (!state.welcomed) return false;
    const seen = new Set(state.seen ?? []);
    return COACH_STEPS.every((s) => seen.has(s.id));
}

export async function loadOnboardingState(doctorId: string): Promise<OnboardingState> {
    const { data, error } = await supabase
        .from("doctors")
        .select("onboarding_state")
        .eq("id", doctorId)
        .maybeSingle();
    // A read failure must never block the workspace behind a walkthrough.
    // Treating it as "finished" is the safe direction: the cost is a doctor
    // not seeing hints, versus hints replaying over a doctor who has already
    // dismissed them, which is the more annoying of the two.
    if (error) {
        console.warn("[onboarding] could not read state:", error.message);
        return { skipped: true };
    }
    return ((data as { onboarding_state?: OnboardingState } | null)?.onboarding_state) ?? EMPTY_ONBOARDING;
}

/**
 * Best-effort write. A walkthrough that fails to save is a walkthrough that
 * repeats once — irritating, not broken — so nothing here is allowed to
 * surface an error into a consult.
 */
export async function saveOnboardingState(doctorId: string, state: OnboardingState): Promise<void> {
    const { error } = await supabase
        .from("doctors")
        .update({ onboarding_state: state })
        .eq("id", doctorId);
    if (error) console.warn("[onboarding] could not save state:", error.message);
}
