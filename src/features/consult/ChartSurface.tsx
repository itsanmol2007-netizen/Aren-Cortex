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
//
// ── The header, matched to `PatientModal`'s Apple-style treatment (2026-08-17)
//
// Anmol, on the body map specifically, but the fix belongs here rather than
// in one caller: "it doesn't have that purple [stripe] which most of the
// components of this thing have... take inspiration from that patient
// intake model." `PatientModal.tsx` (`.pm-*`) is that reference — a 4px
// pink→purple→indigo gradient stripe across the top of the card, and an
// icon badge + small purple "eyebrow" label sitting above the title instead
// of a bare uppercase heading alone.
//
// `icon` and `eyebrow` are both optional so this stays backward compatible,
// but every current caller now passes them (see each card's own header for
// which icon and words) — fixed ONCE here, same reasoning as
// `onEnterContent` two sessions ago: every chart built on this shell,
// present and future, gets the same premium treatment for free instead of
// each one reinventing its own header.
// ---------------------------------------------------------------------------

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useOverlayFocus } from "../../hooks/useOverlayFocus";

interface Props {
    title: string;
    /** small uppercase label above the title — "Dermatology", "Odontogram"... */
    eyebrow?: string;
    /** shown in the small gradient badge beside the eyebrow + title */
    icon?: React.ReactNode;
    expanded: boolean;
    onClose: () => void;
    children: React.ReactNode;
    /**
     * ArrowDown, but ONLY while the panel itself still has focus — the
     * instant after opening, before the doctor has moved anywhere. This is
     * the dedicated, discoverable way IN to whatever the modal holds.
     *
     * Added 2026-08-16 next to the fix above: taking focus on the PANEL
     * (a plain container) is a safe, always-correct landing spot, but it is
     * not a DESTINATION — a doctor who has just opened "More" and starts
     * pressing keys should not have to guess whether Tab, an arrow, or
     * something else is what moves them into the content. Optional, because
     * not every chart built on this shell has one obvious "first thing":
     * Measurements wires this to its first reading; the odontogram or the
     * body map, which have no equivalent single entry point, leave it unset
     * and Tab (in normal DOM order, from the close button onward) is the
     * doctor's way in instead — still a safe default, just not a signposted
     * one.
     */
    onEnterContent?: () => void;
}

export function ChartSurface({ title, eyebrow, icon, expanded, onClose, children, onEnterContent }: Props) {
    // Escape closes, matching every other overlay in this app.
    useEffect(() => {
        if (!expanded) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [expanded, onClose]);

    /**
     * Takes focus on open, hands it back on close — see `useOverlayFocus.ts`.
     * Added 2026-08-15b. Every consumer of this shell (Measurements' "More",
     * the dental chart, the body map, the growth chart — present and future,
     * since a new specialty's own chart tool has nowhere else to render its
     * expanded form) picks this up automatically: without it, opening "More"
     * left focus on the button underneath the modal, so Tab from there
     * walked into the PAGE BEHIND the overlay rather than the content in
     * front of the doctor.
     */
    const panelRef = useRef<HTMLDivElement>(null);
    useOverlayFocus(panelRef, expanded);

    if (!expanded) return <>{children}</>;

    return createPortal(
        <div className="cs-chartmodal" role="dialog" aria-modal="true" aria-label={title}>
            <div className="cs-chartmodal-scrim" onClick={onClose} />
            <div
                className="cs-chartmodal-panel cx-kbd-surface"
                ref={panelRef}
                tabIndex={-1}
                onKeyDown={(e) => {
                    // Only while the PANEL itself is what's focused — once the
                    // doctor has moved to an actual field, ArrowDown belongs to
                    // whatever that field does with it (MeasureCell's own
                    // fields don't use it, but a future chart's might).
                    if (e.key === "ArrowDown" && e.target === panelRef.current && onEnterContent) {
                        e.preventDefault();
                        onEnterContent();
                    }
                }}
            >
                <div className="cs-chartmodal-stripe" aria-hidden="true" />
                <div className="cs-chartmodal-head">
                    <div className="cs-chartmodal-head-left">
                        {icon && <span className="cs-chartmodal-icon">{icon}</span>}
                        <div>
                            {eyebrow && <p className="cs-chartmodal-eyebrow">{eyebrow}</p>}
                            <span className="cs-chartmodal-title">{title}</span>
                        </div>
                    </div>
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
