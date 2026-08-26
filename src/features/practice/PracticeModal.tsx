// ---------------------------------------------------------------------------
// PRACTICE MODAL — the one modal shape every "Manage" / "View all" surface
// on this page uses, per docs/aren-modal-design.md: blurred backdrop, white
// rounded card, 4px accent stripe, icon+eyebrow+title header, body, and a
// Cancel + primary-action footer. What changes between call sites is only
// the accent (`teal` for medicine, `blue` for declared clinic defaults,
// `violet` for doctor-authored content, `amber` for the labs directory) —
// never the chrome itself. This is the ONE modal family Practice needs; it
// does not get a parallel component per card the way `.cs-addmed-*` earned
// its own class family in Consult — every Practice modal is short list +
// simple form, which this shape already covers.
// ---------------------------------------------------------------------------

import { useEffect } from "react";
import type { ReactNode } from "react";
import { X } from "lucide-react";
import "./practiceModal.css";

export type PracticeModalAccent = "teal" | "blue" | "violet" | "amber";

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
