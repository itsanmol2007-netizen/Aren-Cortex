// ---------------------------------------------------------------------------
// The consult, without a mouse.
//
// The target is a doctor who never lifts their hands from the keyboard between
// "next patient" and "save". This hook is the GLOBAL half of that: it moves
// focus between surfaces and owns the handful of actions that belong to the
// whole screen. What happens INSIDE a surface belongs to the surface — see the
// two rules below.
//
// Every chord it dispatches is declared in `lib/keyboard/keymap.ts`, which is
// also what `ShortcutsSheet` prints. Nothing is matched by a bare string here;
// if a key is not in that table it does not exist, which is what stops the help
// and the behaviour drifting apart the way they had by 2026-08-15.
//
// ── Two things this hook deliberately does NOT do ──────────────────────────
//
//  * It does not own list navigation. Arrows, Enter-to-take and the severity
//    digits belong to the component that owns the list, because only that
//    component knows what is on screen. This hook moves focus BETWEEN
//    surfaces; each surface handles what happens inside it. `useRovingList` is
//    the shared mechanism they use, not a thing this file reaches into.
//
//  * It does not act while an overlay is up. An overlay owns the keyboard for
//    as long as it is up, and the ONE exception is the shortcuts sheet itself:
//    "what can I press" has to be answerable from inside the modal that
//    prompted the question.
//
//    This is a change from the version before 2026-08-15, which kept Ctrl+N
//    and Ctrl+Enter live over every overlay. That was a real bug, not a
//    preference: Ctrl+Enter in the review modal means "confirm and save", and
//    the global handler was catching it first and RE-OPENING the review it was
//    already showing, so the one key that finishes a consult did nothing.
// ---------------------------------------------------------------------------

import { useEffect, useRef } from "react";
import { firedChord, matches } from "../lib/keyboard/keymap";

type El = HTMLElement | HTMLInputElement | null;

interface UseConsultKeyboardProps {
    /** the case sheet search — where a consult begins */
    chartRef: React.RefObject<HTMLInputElement | null>;
    /** the Assessment card's search */
    assessmentRef: React.RefObject<HTMLInputElement | null>;
    /** the medicine recommendations search */
    synapseRef: React.RefObject<HTMLInputElement | null>;
    /** the plan panel; its first line takes focus */
    planRef: React.RefObject<HTMLElement | null>;
    medicineCount: number;
    onNewPatient: () => void;
    onReviewRx: () => void;
    onToggleShortcuts: () => void;
    /**
     * Alt+1/2/3 on the most recently recorded symptom.
     *
     * The chart's own chips carry a click target for this, but a doctor typing
     * their way through an intake never has their hands near it, and severity
     * entered a second later is severity entered at the wrong moment.
     */
    onSeverity: (intensity: "mild" | "moderate" | "severe") => void;
    isAnyModalOpen: boolean;
}

/**
 * The Tab order, and it is the order a consultation is built in: what the
 * patient tells you, what you conclude, what you prescribe, what you have
 * taken. Assessment was missing from this list until 2026-08-15 — Tab jumped
 * straight from the case sheet to the medicines, so the one panel where a
 * condition is confirmed was reachable only by mouse.
 */
const STOPS = ["chart", "assessment", "synapse", "plan"] as const;
type Stop = typeof STOPS[number];

export function useConsultKeyboard({
    chartRef, assessmentRef, synapseRef, planRef,
    medicineCount, onNewPatient, onReviewRx, onToggleShortcuts, onSeverity,
    isAnyModalOpen,
}: UseConsultKeyboardProps) {
    const activeStop = useRef<Stop>("chart");

    useEffect(() => {
        const focusStop = (stop: Stop) => {
            activeStop.current = stop;
            let el: El = null;
            if (stop === "chart") el = chartRef.current;
            else if (stop === "assessment") el = assessmentRef.current;
            else if (stop === "synapse") el = synapseRef.current;
            else {
                // The plan holds lines, not a search box: land on the first one
                // so Enter opens its dose editor and arrows walk the list.
                el = planRef.current?.querySelector<HTMLElement>("[data-cx-planline]")
                    ?? planRef.current?.querySelector<HTMLElement>("button, [tabindex='0']")
                    ?? null;
            }
            el?.focus();
        };

        const step = (dir: 1 | -1) => {
            const i = STOPS.indexOf(activeStop.current);
            focusStop(STOPS[(i + dir + STOPS.length) % STOPS.length]);
        };

        const handler = (e: KeyboardEvent) => {
            const take = () => { e.preventDefault(); e.stopPropagation(); };

            // ── the one binding that outranks an overlay ───────────────────
            if (matches(e, "shortcuts")) {
                take();
                onToggleShortcuts();
                return;
            }

            // Everything else belongs to whatever is on top. See the header.
            if (isAnyModalOpen) return;

            if (matches(e, "newPatient")) {
                take();
                onNewPatient();
                return;
            }

            if (matches(e, "review")) {
                take();
                // Ctrl+P has a browser default worth cancelling even when there
                // is nothing to review: printing the raw workspace is never
                // what the doctor meant, and the OS dialog is slow to dismiss.
                if (medicineCount > 0) onReviewRx();
                return;
            }

            if (matches(e, "focusChart")) {
                take();
                focusStop("chart");
                return;
            }

            if (matches(e, "prevStop")) { take(); step(-1); return; }
            if (matches(e, "nextStop")) { take(); step(1); return; }

            const severity = firedChord(e, "severity");
            if (severity) {
                take();
                onSeverity(
                    severity.key === "1" ? "mild"
                        : severity.key === "2" ? "moderate"
                            : "severe"
                );
                return;
            }

            if (matches(e, "escape")) {
                // Not `take()`. Escape has meaning inside the field too —
                // clearing a half-typed query — and the surface that owns the
                // field gets first refusal on it. Blurring is only what
                // Escape means once nothing else has claimed it.
                const el = document.activeElement as HTMLElement | null;
                if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) el.blur();
                return;
            }

            // Just start typing. The case sheet takes focus and the character
            // lands in it — no shortcut to remember, which is the whole point:
            // the fastest path to "fever" is typing "fever".
            //
            // Guarded on `key.length === 1` and no modifier, so it fires for
            // printable characters only: an unbound Ctrl+B or F5 must reach the
            // browser untouched.
            if (
                e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey &&
                !(document.activeElement && (
                    document.activeElement.tagName === "INPUT" ||
                    document.activeElement.tagName === "TEXTAREA" ||
                    document.activeElement.tagName === "SELECT" ||
                    (document.activeElement as HTMLElement).isContentEditable
                ))
            ) {
                focusStop("chart");
            }
        };

        // Capture, so a chord we have claimed is decided before the focused
        // field or the browser gets to interpret it.
        window.addEventListener("keydown", handler, true);
        return () => window.removeEventListener("keydown", handler, true);
    }, [
        chartRef, assessmentRef, synapseRef, planRef,
        medicineCount, isAnyModalOpen,
        onNewPatient, onReviewRx, onToggleShortcuts, onSeverity,
    ]);

    // Keep the Tab cursor honest when focus moves by click.
    useEffect(() => {
        const onFocus = (e: FocusEvent) => {
            const t = e.target as HTMLElement;
            if (t === chartRef.current) activeStop.current = "chart";
            else if (t === assessmentRef.current) activeStop.current = "assessment";
            else if (t === synapseRef.current) activeStop.current = "synapse";
            else if (planRef.current?.contains(t)) activeStop.current = "plan";
        };
        window.addEventListener("focusin", onFocus);
        return () => window.removeEventListener("focusin", onFocus);
    }, [chartRef, assessmentRef, synapseRef, planRef]);
}
