// ---------------------------------------------------------------------------
// PRACTICE MODAL — ONE modal family, four restrained variations, never a
// theme per feature.
//
// 2026-08-26 correction: the first version let `accent` recolour the whole
// modal with whatever hue a call site picked — Four features meant four
// fully-themed modals (an orange one for Preferred Labs among them), which
// is exactly the "Christmas tree" mistake the design DNA warns against:
// every category does not get its own invented colour. That correction
// pinned the stripe/button/eyebrow to ONE fixed gradient for every modal,
// `accent` touching only the small header icon tile.
//
// 2026-08-28 correction: fixed everywhere on ONE hue read as "still
// overwhelmingly pink/blue" once seven modals sat side by side. The fix is
// not a colour per feature again — `accent` is still exactly the same four
// values (teal for medicine, blue for a declared clinic default, violet for
// doctor-authored content, slate/neutral where nothing more specific
// applies), the same domain hint the icon tile already carried. What
// changed is that the stripe, the primary button, and the eyebrow now
// pick up THAT SAME tone too (`.prac-modal.is-{accent} .prac-modal-stripe`
// etc. in practiceModal.css), so a modal reads as one coherent tone
// top-to-bottom instead of a tone-hinted icon sitting on otherwise-neutral
// chrome. Four gradients total, all built from colour.md's existing seven
// tokens — never an eighth colour, never a fifth accent value.
// ---------------------------------------------------------------------------

import { useEffect } from "react";
import type { ReactNode } from "react";
import { X } from "lucide-react";
import "./practiceModal.css";

export type PracticeModalAccent = "teal" | "blue" | "violet" | "slate";

export function PracticeModal({
    accent, icon, eyebrow, title, onClose, children, footer, wide, dirty,
}: {
    accent: PracticeModalAccent;
    icon: ReactNode;
    eyebrow: string;
    title: string;
    onClose: () => void;
    children: ReactNode;
    footer?: ReactNode;
    /** the wider card width, for a modal whose body is a form rather than a list */
    wide?: boolean;
    /**
     * True once the doctor has typed or picked something a click outside
     * would silently throw away. A click on the backdrop stops closing the
     * modal the instant this is true (2026-08-28: "do not close the modal
     * by outside-click when the user has already entered information") —
     * Escape and the × still always work, since both are an explicit "I
     * want to leave", not a stray click. Each stateful modal computes its
     * own `dirty` (a name typed, a composition picked, a pairing half-
     * built…); a modal that's just a list with nothing to lose (LabsModal,
     * CompanionsModal's curate list) never sets this and keeps the
     * original click-outside-to-close behaviour.
     */
    dirty?: boolean;
}) {
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose]);

    return (
        <div
            className="prac-modal-overlay"
            onMouseDown={(e) => { if (e.target === e.currentTarget && !dirty) onClose(); }}
        >
            <div
                className={`prac-modal is-${accent}${wide ? " is-wide" : ""}`}
                role="dialog"
                aria-modal="true"
                aria-label={title}
            >
                <div className="prac-modal-stripe" aria-hidden="true" />
                <div className="prac-modal-head">
                    <div className="prac-modal-headline">
                        <span className="prac-modal-icon">{icon}</span>
                        <div>
                            <div className="prac-modal-eyebrow">{eyebrow}</div>
                            <h3 className="prac-modal-title">{title}</h3>
                        </div>
                    </div>
                    <button type="button" className="prac-modal-close" aria-label="Close" onClick={onClose}>
                        <X size={16} />
                    </button>
                </div>
                <div className="prac-modal-body">{children}</div>
                {footer && <div className="prac-modal-foot">{footer}</div>}
            </div>
        </div>
    );
}
