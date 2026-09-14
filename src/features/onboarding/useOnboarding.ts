// ---------------------------------------------------------------------------
// The walkthrough's one piece of state machinery: which hint, if any, is live
// right now — and where on screen its target currently sits.
//
// Deliberately dumb about the app. It does not know what a consult is, or
// when one opens; it watches for the ANCHOR to appear in the DOM, which is
// the same fact expressed without a dependency. That is what keeps the
// walkthrough out of App.tsx's own logic: adding a hint later means adding a
// `data-coach` attribute and a row in COACH_STEPS, never a new prop chain.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useRef, useState } from "react";
import {
    COACH_STEPS, EMPTY_ONBOARDING, isFinished, loadOnboardingState, saveOnboardingState,
    type CoachStep, type OnboardingState,
} from "./onboarding";

/** Where a target is, in viewport coordinates. */
export interface AnchorRect {
    top: number;
    left: number;
    width: number;
    height: number;
}

/**
 * How often the live target is re-measured.
 *
 * A poll rather than a MutationObserver: the thing being watched is not "did
 * the DOM change" but "is this element present, enabled, and where" — which
 * a single `querySelector` answers completely and cheaply, where an observer
 * would fire on every unrelated re-render of a workspace that re-renders on
 * every keystroke. 350ms is well inside the time it takes to look at a new
 * screen, and the cost is one selector call.
 */
const POLL_MS = 350;

function measure(step: CoachStep): AnchorRect | null {
    const el = document.querySelector<HTMLElement>(`[data-coach="${step.anchor}"]`);
    if (!el) return null;
    if (step.requireEnabled && el.matches(":disabled, [aria-disabled='true']")) return null;

    const r = el.getBoundingClientRect();
    // A target scrolled out of view, or collapsed to nothing, is not
    // something to point at — the arrow would aim off-screen.
    if (r.width === 0 || r.height === 0) return null;
    if (r.bottom < 0 || r.top > window.innerHeight) return null;
    return { top: r.top, left: r.left, width: r.width, height: r.height };
}

export interface Onboarding {
    /** true once state has loaded — nothing renders before this */
    ready: boolean;
    /** show the welcome card */
    showWelcome: boolean;
    /** the hint to draw, with its target's current position */
    active: { step: CoachStep; rect: AnchorRect } | null;
    /** welcome card: "Show me around" */
    acceptWelcome: () => void;
    /** welcome card or any hint: "Skip" / "×" — ends the walkthrough for good */
    skipAll: () => void;
    /** a hint's "Got it" */
    dismissStep: (id: string) => void;
    /**
     * "Replay the walkthrough" — Settings. Anmol: "some way to actually go
     * to walkthrough again." Wipes progress back to brand-new and lets the
     * normal welcome-then-hints flow run again from the top; there is no
     * separate "replay mode", because a doctor who asked to see it again
     * should see the exact same thing a new doctor sees, not a summary.
     */
    restart: () => void;
}

/**
 * @param doctorId  the signed-in doctor, or null while identity resolves
 * @param enabled   false for anyone who should never see this — a non-doctor
 *                  role, or an identity that hasn't really resolved yet (see
 *                  `useClinicalIdentity`'s `isReal`: the MVP fallback id
 *                  belongs to a different hospital, and writing a
 *                  walkthrough flag onto it would mark the wrong doctor).
 */
export function useOnboarding(doctorId: string | null, enabled: boolean): Onboarding {
    const [state, setState] = useState<OnboardingState>(EMPTY_ONBOARDING);
    const [ready, setReady] = useState(false);
    const [active, setActive] = useState<{ step: CoachStep; rect: AnchorRect } | null>(null);
    /** the id currently on screen, read by the poll without re-subscribing */
    const liveId = useRef<string | null>(null);

    // ---- load once per doctor -------------------------------------------
    useEffect(() => {
        let cancelled = false;
        if (!enabled || !doctorId) {
            setReady(false);
            return;
        }
        loadOnboardingState(doctorId).then((s) => {
            if (cancelled) return;
            setState(s);
            setReady(true);
        });
        return () => { cancelled = true; };
    }, [doctorId, enabled]);

    const persist = useCallback((next: OnboardingState) => {
        setState(next);
        if (doctorId) void saveOnboardingState(doctorId, next);
    }, [doctorId]);

    const acceptWelcome = useCallback(() => {
        persist({ ...state, welcomed: true });
    }, [persist, state]);

    const skipAll = useCallback(() => {
        liveId.current = null;
        setActive(null);
        persist({ ...state, welcomed: true, skipped: true });
    }, [persist, state]);

    const dismissStep = useCallback((id: string) => {
        liveId.current = null;
        setActive(null);
        const seen = new Set(state.seen ?? []);
        seen.add(id);
        persist({ ...state, seen: [...seen] });
    }, [persist, state]);

    const restart = useCallback(() => {
        liveId.current = null;
        setActive(null);
        persist(EMPTY_ONBOARDING);
    }, [persist]);

    const showWelcome = ready && !state.welcomed && !state.skipped;

    // ---- find and track the live hint ------------------------------------
    useEffect(() => {
        // Nothing hunts for targets until the welcome has been dealt with —
        // a callout pointing at the rail from behind the welcome card would
        // be two first impressions at once.
        if (!ready || showWelcome || isFinished(state)) {
            liveId.current = null;
            setActive(null);
            return;
        }

        const seen = new Set(state.seen ?? []);
        const pending = COACH_STEPS.filter((s) => !seen.has(s.id));

        const tick = () => {
            // Whatever is already on screen keeps the screen, as long as its
            // target is still there. Re-picking every tick would let a hint
            // jump to a different element mid-sentence.
            const current = pending.find((s) => s.id === liveId.current);
            if (current) {
                const rect = measure(current);
                if (rect) { setActive({ step: current, rect }); return; }
                liveId.current = null;
            }
            for (const step of pending) {
                const rect = measure(step);
                if (rect) {
                    liveId.current = step.id;
                    setActive({ step, rect });
                    return;
                }
            }
            setActive(null);
        };

        tick();
        const timer = window.setInterval(tick, POLL_MS);
        // Scroll and resize move a target between polls; re-measuring on
        // both keeps the ring welded to the element rather than drifting
        // behind it for a third of a second.
        window.addEventListener("scroll", tick, true);
        window.addEventListener("resize", tick);
        return () => {
            window.clearInterval(timer);
            window.removeEventListener("scroll", tick, true);
            window.removeEventListener("resize", tick);
        };
    }, [ready, showWelcome, state]);

    return { ready, showWelcome, active, acceptWelcome, skipAll, dismissStep, restart };
}
