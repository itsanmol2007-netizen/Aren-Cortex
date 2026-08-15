import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import {
    BINDINGS, SCOPE_ORDER, SCOPE_TITLE, bindingLabel, type Scope,
} from "../lib/keyboard/keymap";

/**
 * The keyboard map, said out loud.
 *
 * Cortex has had shortcuts since the first version and no way to discover them
 * — Ctrl+N, Ctrl+Enter and Tab existed but were written down nowhere a doctor
 * would look. A workspace that claims to be keyboard-first has to answer "what
 * can I press" from inside itself.
 *
 * ── Why this file no longer contains a list ────────────────────────────────
 *
 * It used to hold its own hand-written table, and by 2026-08-15 four of the
 * eleven rows in it were fiction: arrow-key list navigation, the severity
 * digits, "Delete removes the focused chip" and "← → move between brands" were
 * all documented and none were implemented. Nobody wrote them down wrongly on
 * purpose — the table and the handler were two files that had to be edited
 * together, and the atlas's own §13 row for keyboard work says "keep both in
 * step", which is a rule that works right up until it doesn't.
 *
 * So the list is `lib/keyboard/keymap.ts` now and this file only renders it.
 * A binding that is not dispatched cannot appear here, because the handler
 * reads the same table.
 */
export function ShortcutsSheet({ onClose }: { onClose: () => void }) {
    // The sheet owns the keyboard while it is up, so it has to hand Esc back.
    // Ctrl+/ is deliberately NOT handled here: `useConsultKeyboard` registers
    // its capture listener first and toggles the sheet shut, and handling it in
    // both places would toggle twice and leave it open.
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

    const groups = SCOPE_ORDER
        .map((scope: Scope) => ({
            scope,
            title: SCOPE_TITLE[scope],
            items: BINDINGS.filter((b) => b.scope === scope),
        }))
        .filter((g) => g.items.length > 0);

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
                    {groups.map((g) => (
                        <section key={g.scope} className="cx-keys-group">
                            <h3>{g.title}</h3>
                            {g.items.map((b) => (
                                <div key={b.id} className="cx-keys-row">
                                    <kbd>{bindingLabel(b)}</kbd>
                                    <span>
                                        {b.what}
                                        {/* Said rather than hidden — see `note` in
                                            keymap.ts for why this is free text and not
                                            a flag. */}
                                        {b.note && <em className="cx-keys-note">{b.note}</em>}
                                    </span>
                                </div>
                            ))}
                        </section>
                    ))}
                </div>

                <div className="cx-browse-foot">
                    Press <kbd>?</kbd> or <kbd>Ctrl /</kbd> any time to bring this back.
                </div>
            </div>
        </div>,
        document.body
    );
}
