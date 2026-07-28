// ---------------------------------------------------------------------------
// The consult, without a mouse.
//
// Spec: docs/aren-cortex-workspace-design.md §7.
//
// The target is a doctor who never lifts their hands from the keyboard between
// "next patient" and "save". Everything below exists to serve that, and the
// arrangement follows the workspace: three columns, three Tab stops, left to
// right in the order a consultation is actually built.
//
// Two things this hook deliberately does NOT do:
//
//  * It does not own list navigation. Arrow keys, Enter-to-add and the
//    severity digits belong to the component that owns the list, because only
//    that component knows what is on screen. This hook moves focus BETWEEN
//    surfaces; each surface handles what happens inside it.
//
//  * It does not swallow keys while a modal is open. An overlay owns the
//    keyboard for as long as it is up.
// ---------------------------------------------------------------------------

import { useEffect, useRef } from "react";

type El = HTMLElement | HTMLInputElement | null;

interface UseConsultKeyboardProps {
    /** the chart search — where a consult begins */
    chartRef: React.RefObject<HTMLInputElement | null>;
    /** the suggestions search */
    synapseRef: React.RefObject<HTMLInputElement | null>;
    /** the plan panel; its first line takes focus */
    planRef: React.RefObject<HTMLElement | null>;
    medicineCount: number;
    onNewPatient: () => void;
    onReviewRx: () => void;
    onToggleShortcuts: () => void;
    isAnyModalOpen: boolean;
}

const STOPS = ["chart", "synapse", "plan"] as const;
type Stop = typeof STOPS[number];

/** True when the keystroke belongs to whatever the doctor is typing into. */
function isTyping(target: EventTarget | null): boolean {
    const el = target as HTMLElement | null;
    if (!el) return false;
    const tag = el.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

/** A single printable character, with no modifier holding it hostage. */
function isPrintable(e: KeyboardEvent): boolean {
    return e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey;
}

export function useConsultKeyboard({
    chartRef, synapseRef, planRef,
    medicineCount, onNewPatient, onReviewRx, onToggleShortcuts, isAnyModalOpen,
}: UseConsultKeyboardProps) {
    const activeStop = useRef<Stop>("chart");

    useEffect(() => {
        const focusStop = (stop: Stop) => {
            activeStop.current = stop;
            let el: El = null;
            if (stop === "chart") el = chartRef.current;
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
            // ── always available, even over an overlay ──
            if (e.ctrlKey && !e.altKey) {
                if (e.key === "n" || e.key === "N") {
                    e.preventDefault();
                    e.stopPropagation();
                    onNewPatient();
                    return;
                }
                if (e.key === "Enter") {
                    e.preventDefault();
                    e.stopPropagation();
                    if (medicineCount > 0) onReviewRx();
                    return;
                }
                // Ctrl+K — the search convention every doctor already knows
                // from every other application they use.
                if (e.key === "k" || e.key === "K") {
                    e.preventDefault();
                    e.stopPropagation();
                    if (!isAnyModalOpen) focusStop("chart");
                    return;
                }
            }

            // An overlay owns the keyboard while it is up.
            if (isAnyModalOpen) return;

            if (e.key === "Tab") {
                e.preventDefault();
                e.stopPropagation();
                step(e.shiftKey ? -1 : 1);
                return;
            }

            if (e.key === "Escape") {
                const el = document.activeElement as HTMLElement | null;
                if (isTyping(el)) el?.blur();
                return;
            }

            // Everything below is for a doctor whose hands are NOT in a field.
            if (isTyping(e.target)) return;

            if (e.key === "?") {
                e.preventDefault();
                onToggleShortcuts();
                return;
            }

            if (e.key === "/") {
                e.preventDefault();
                focusStop("chart");
                return;
            }

            // Just start typing. The chart search takes focus and the character
            // lands in it — no shortcut to remember, which is the whole point:
            // the fastest path to "fever" is typing "fever".
            if (isPrintable(e)) {
                focusStop("chart");
            }
        };

        window.addEventListener("keydown", handler, true);
        return () => window.removeEventListener("keydown", handler, true);
    }, [
        chartRef, synapseRef, planRef,
        medicineCount, isAnyModalOpen, onNewPatient, onReviewRx, onToggleShortcuts,
    ]);

    // Keep the Tab cursor honest when focus moves by click.
    useEffect(() => {
        const onFocus = (e: FocusEvent) => {
            const t = e.target as HTMLElement;
            if (t === chartRef.current) activeStop.current = "chart";
            else if (t === synapseRef.current) activeStop.current = "synapse";
            else if (planRef.current?.contains(t)) activeStop.current = "plan";
        };
        window.addEventListener("focusin", onFocus);
        return () => window.removeEventListener("focusin", onFocus);
    }, [chartRef, synapseRef, planRef]);
}
