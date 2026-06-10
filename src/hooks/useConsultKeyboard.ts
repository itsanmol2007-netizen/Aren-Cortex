import { useEffect, useRef } from "react";

type UseConsultKeyboardProps = {
    symptomsRef: React.RefObject<HTMLInputElement | null>;
    findingsRef: React.RefObject<HTMLInputElement | null>;
    medicinesRef: React.RefObject<HTMLInputElement | null>;
    testsRef: React.RefObject<HTMLInputElement | null>;
    medicineCount: number;
    onNewPatient: () => void;
    onReviewRx: () => void;
    onUndoSnapshot: () => void;
    isAnyModalOpen: boolean;
};

const PANEL_ORDER = ["symptoms", "findings", "medicines", "tests"] as const;
type PanelName = typeof PANEL_ORDER[number];

export function useConsultKeyboard({
    symptomsRef,
    findingsRef,
    medicinesRef,
    testsRef,
    medicineCount,
    onNewPatient,
    onReviewRx,
    onUndoSnapshot,
    isAnyModalOpen,
}: UseConsultKeyboardProps) {
    const activePanelRef = useRef<PanelName>("symptoms");

    const focusPanel = (panel: PanelName) => {
        activePanelRef.current = panel;
        switch (panel) {
            case "symptoms": symptomsRef.current?.focus(); break;
            case "findings": findingsRef.current?.focus(); break;
            case "medicines": medicinesRef.current?.focus(); break;
            case "tests": testsRef.current?.focus(); break;
        }
    };

    const nextPanel = () => {
        const idx = PANEL_ORDER.indexOf(activePanelRef.current);
        focusPanel(PANEL_ORDER[(idx + 1) % PANEL_ORDER.length]);
    };

    const prevPanel = () => {
        const idx = PANEL_ORDER.indexOf(activePanelRef.current);
        focusPanel(PANEL_ORDER[(idx - 1 + PANEL_ORDER.length) % PANEL_ORDER.length]);
    };

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {

            // ── Ctrl shortcuts — always active, capture before browser ──
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
                if ((e.key === "z" || e.key === "Z") && activePanelRef.current === "symptoms") {
                    e.preventDefault();
                    e.stopPropagation();
                    onUndoSnapshot();
                    return;
                }
            }

            // ── Alt+M — toggle favourites (always active) ──
            if (e.altKey && (e.key === "m" || e.key === "M")) {
                e.preventDefault();
                e.stopPropagation();
                window.dispatchEvent(new CustomEvent("aren:toggle-favourites"));
                return;
            }

            // ── Everything below blocked when a modal is open ──
            if (isAnyModalOpen) return;

            // ── Tab — panel cycling ──
            if (e.key === "Tab") {
                e.preventDefault();
                e.stopPropagation();
                if (e.shiftKey) {
                    prevPanel();
                } else {
                    nextPanel();
                }
                return;
            }

            // ── Esc — clear focus back to symptoms ──
            if (e.key === "Escape") {
                const active = document.activeElement as HTMLElement;
                if (active && active.tagName === "INPUT") {
                    active.blur();
                }
                return;
            }
        };

        // capture: true means we see the event BEFORE the browser handles it
        // This is what prevents Ctrl+N opening a new browser tab
        window.addEventListener("keydown", handler, true);
        return () => window.removeEventListener("keydown", handler, true);
    }, [
        medicineCount,
        isAnyModalOpen,
        onNewPatient,
        onReviewRx,
        onUndoSnapshot,
    ]);

    // Track which panel is active based on focus events
    useEffect(() => {
        const onFocus = (e: FocusEvent) => {
            const t = e.target as HTMLElement;
            if (t === symptomsRef.current) activePanelRef.current = "symptoms";
            else if (t === findingsRef.current) activePanelRef.current = "findings";
            else if (t === medicinesRef.current) activePanelRef.current = "medicines";
            else if (t === testsRef.current) activePanelRef.current = "tests";
        };
        window.addEventListener("focusin", onFocus);
        return () => window.removeEventListener("focusin", onFocus);
    }, [symptomsRef, findingsRef, medicinesRef, testsRef]);
}