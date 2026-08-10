// ---------------------------------------------------------------------------
// CHART SURFACE — lets a chart live in the card and, on demand, in a modal.
//
// The odontogram and the body map are the two places in this screen where the
// doctor is aiming at a target rather than reading a list, and both are
// squeezed into a card column that was sized for text. Charting "36 MO" on a
// 25px-wide tooth is a mis-tap waiting to happen.
//
// So the same chart renders in two places without being written twice: inline
// by default, and — when the doctor asks — inside a modal over a blurred
// backdrop, where it gets the room the interaction actually needs. The
// children are identical in both, so there is no second copy of the chart to
// keep in sync, and no state to hand across: the card owns the state either
// way, this only decides where the DOM lands.
// ---------------------------------------------------------------------------

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

interface Props {
    title: string;
    expanded: boolean;
    onClose: () => void;
    children: React.ReactNode;
}

export function ChartSurface({ title, expanded, onClose, children }: Props) {
    // Escape closes, matching every other overlay in this app.
    useEffect(() => {
        if (!expanded) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [expanded, onClose]);

    if (!expanded) return <>{children}</>;

    return createPortal(
        <div className="cs-chartmodal" role="dialog" aria-modal="true" aria-label={title}>
            <div className="cs-chartmodal-scrim" onClick={onClose} />
            <div className="cs-chartmodal-panel">
                <div className="cs-chartmodal-head">
                    <span className="cs-chartmodal-title">{title}</span>
                    <button type="button" className="cs-chartmodal-close" onClick={onClose} aria-label="Close">
                        <X size={15} />
                    </button>
                </div>
                <div className="cs-chartmodal-body">{children}</div>
            </div>
        </div>,
        document.body
    );
}
