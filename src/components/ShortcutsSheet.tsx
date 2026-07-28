import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

/**
 * The keyboard map, said out loud.
 *
 * Cortex has had shortcuts since the first version and no way to discover them
 * — Ctrl+N, Ctrl+Enter and Tab existed but were written down nowhere a doctor
 * would look. A workspace that claims to be keyboard-first has to answer "what
 * can I press" from inside itself.
 */

const GROUPS: { title: string; keys: [string, string][] }[] = [
    {
        title: "Getting around",
        keys: [
            ["type anything", "jump to the chart and start writing"],
            ["/  or  Ctrl K", "focus the chart search"],
            ["Tab  ·  Shift Tab", "chart → suggestions → plan"],
            ["Esc", "close, clear, or leave the field"],
        ],
    },
    {
        title: "Building the chart",
        keys: [
            ["↑ ↓", "move through results"],
            ["Enter", "add what is highlighted"],
            ["← →", "move between chips"],
            ["1 · 2 · 3", "mild · moderate · severe"],
            ["Delete", "remove the focused chip"],
        ],
    },
    {
        title: "Prescribing",
        keys: [
            ["Enter", "prescribe the default brand"],
            ["← →", "move between brands"],
            ["Ctrl Enter", "review the prescription"],
            ["Ctrl N", "next patient"],
        ],
    },
];

export function ShortcutsSheet({ onClose }: { onClose: () => void }) {
    // The sheet owns the keyboard while it is up, so it has to hand Esc back.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape" || e.key === "?") {
                e.preventDefault();
                e.stopPropagation();
                onClose();
            }
        };
        window.addEventListener("keydown", onKey, true);
        return () => window.removeEventListener("keydown", onKey, true);
    }, [onClose]);

    return createPortal(
        <div className="cx-browse" role="dialog" aria-label="Keyboard shortcuts" onClick={onClose}>
            <div
                className="cx-browse-sheet cx-keys-sheet"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="cx-browse-head">
                    <div className="cx-keys-title">
                        <h2>Keyboard</h2>
                        <p>The whole consultation, without a mouse.</p>
                    </div>
                    <button
                        type="button"
                        className="cx-browse-close"
                        onClick={onClose}
                        aria-label="Close"
                    ><X size={16} /></button>
                </div>

                <div className="cx-keys-body">
                    {GROUPS.map((g) => (
                        <section key={g.title} className="cx-keys-group">
                            <h3>{g.title}</h3>
                            {g.keys.map(([k, what]) => (
                                <div key={k} className="cx-keys-row">
                                    <kbd>{k}</kbd>
                                    <span>{what}</span>
                                </div>
                            ))}
                        </section>
                    ))}
                </div>

                <div className="cx-browse-foot">
                    Press <kbd>?</kbd> any time to bring this back.
                </div>
            </div>
        </div>,
        document.body
    );
}
