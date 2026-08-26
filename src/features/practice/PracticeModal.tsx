// ---------------------------------------------------------------------------
// PRACTICE MODAL — ONE modal family, not a theme per feature.
//
// 2026-08-26 correction: the first version let `accent` recolour the whole
// modal — stripe, primary button, focus rings, all of it — per call site.
// Four features meant four fully-themed modals (an orange one for Preferred
// Labs among them), which is exactly the "Christmas tree" mistake the
// design DNA warns against: every category does not get its own colour.
//
// Now the chrome is fixed for every modal: the stripe and the primary
// button are always Cortex's own signature gradient (`#f472b6 → #a855f7 →
// #6366f1`, the same one `.topbar-stripe` and `.action-button.primary` use
// elsewhere in this app) — not invented here, reused. `accent` controls
// exactly one thing, the small header icon tile, as a restrained semantic
// hint (teal for medicine, blue for a declared clinic default, violet for
// doctor-authored content, slate/neutral where nothing more specific
// applies) — never a second colour system layered on top of the first.
// ---------------------------------------------------------------------------

import { useEffect } from "react";
import type { ReactNode } from "react";
import { X } from "lucide-react";
import "./practiceModal.css";

export type PracticeModalAccent = "teal" | "blue" | "violet" | "slate";

export function PracticeModal({
    accent, icon, eyebrow, title, onClose, children, footer, wide,
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
}) {
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose]);

    return (
        <div
            className="prac-modal-overlay"
            onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
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
