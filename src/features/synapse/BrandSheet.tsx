// ---------------------------------------------------------------------------
// Which brand of this molecule.
//
// The engine ranks COMPOSITIONS and never sees a brand. This is the layer
// underneath: once paracetamol is chosen, which paracetamol gets dispensed.
//
// Three tiers show here, and the order is the point:
//   YOURS   — learned from this doctor's own accepts. Moves in one or two
//             decisions, because picking a brand inside a molecule you have
//             already chosen is a habit, not a clinical judgement.
//   CLINIC  — declared by the clinic, shared by everyone working here.
//   neither — catalogue order, then name.
//
// A doctor's own habit outranks the clinic default deliberately: the clinic
// sets what is normally dispensed, the doctor keeps the last word on the
// prescription they are signing.
//
// Rendered through a portal — Cortex stacking is decided by DOM position, not
// z-index, and this has to escape the panel's stacking context.
// ---------------------------------------------------------------------------

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Pin, PinOff } from "lucide-react";
import type { Medicine } from "../../lib/synapse/brands";
import { brandKey, type BrandPreferenceModel } from "../../lib/synapse/brands";
import { clinicBrandKey, type ClinicBrandDefaults, type CompositionBrands } from "../../lib/db/synapse";

interface Props {
    anchor: DOMRect;
    composition: CompositionBrands;
    compositionLabel: string;
    currentMedicineId: number | null;
    brandPreferences: BrandPreferenceModel;
    clinicDefaults: ClinicBrandDefaults;
    onChoose: (m: Medicine) => void;
    onPinClinic: (m: Medicine, pinned: boolean) => void;
    onClose: () => void;
}

const SHEET_WIDTH = 306;
const MARGIN = 10;

export function BrandSheet({
    anchor, composition, compositionLabel, currentMedicineId,
    brandPreferences, clinicDefaults, onChoose, onPinClinic, onClose,
}: Props) {
    const ref = useRef<HTMLDivElement>(null);
    const [pos, setPos] = useState({ top: anchor.bottom + 6, left: anchor.right - SHEET_WIDTH });

    useLayoutEffect(() => {
        const h = ref.current?.offsetHeight ?? 320;
        let top = anchor.bottom + 6;
        // flip above when there is no room below
        if (top + h > window.innerHeight - MARGIN) {
            top = Math.max(MARGIN, anchor.top - h - 6);
        }
        const left = Math.min(
            Math.max(MARGIN, anchor.right - SHEET_WIDTH),
            window.innerWidth - SHEET_WIDTH - MARGIN
        );
        setPos({ top, left });
    }, [anchor]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        const onDown = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) onClose();
        };
        window.addEventListener("keydown", onKey);
        // `mousedown` in the capture phase, so a click that opens another sheet
        // closes this one first rather than leaving two on screen.
        window.addEventListener("mousedown", onDown, true);
        window.addEventListener("scroll", onClose, true);
        return () => {
            window.removeEventListener("keydown", onKey);
            window.removeEventListener("mousedown", onDown, true);
            window.removeEventListener("scroll", onClose, true);
        };
    }, [onClose]);

    const brands = composition.brands;

    return createPortal(
        <div
            ref={ref}
            className="cx-sheet"
            style={{ top: pos.top, left: pos.left }}
            role="listbox"
            aria-label={`Brands for ${compositionLabel}`}
        >
            <div className="cx-sheet-head">
                <div className="cx-sheet-title cx-cap">{compositionLabel}</div>
                <div className="cx-sheet-sub">
                    {composition.singleTotal > 0
                        ? `${brands.length} of ${composition.singleTotal} brands`
                        : "No single-molecule brand in the catalogue"}
                    {composition.combinationTotal > 0 &&
                        ` · ${composition.combinationTotal} combination${composition.combinationTotal === 1 ? "" : "s"} not offered`}
                </div>
            </div>

            <div className="cx-sheet-list">
                {brands.length === 0 ? (
                    <div className="cx-sheet-foot" style={{ border: 0 }}>
                        This molecule is rankable but not prescribable — nothing in the
                        catalogue contains it on its own.
                    </div>
                ) : (
                    brands.map((m) => {
                        const isCurrent = m.id === currentMedicineId;
                        const clinic = clinicDefaults.get(clinicBrandKey(m.compositionId, m.id));
                        const isClinic =
                            !!clinic && (clinic.form == null || clinic.form === m.form);
                        const pref = brandPreferences.get(brandKey(m.compositionId, m.id, m.form));
                        const isYours = !!pref && pref.preference > 0.15;

                        return (
                            <button
                                key={m.id}
                                type="button"
                                role="option"
                                aria-selected={isCurrent}
                                className={`cx-brandrow${isCurrent ? " is-current" : ""}`}
                                onClick={() => { onChoose(m); onClose(); }}
                            >
                                <span className="cx-brandrow-body">
                                    <span className="cx-brandrow-name">{m.name}</span>
                                    <span className="cx-brandrow-meta">
                                        {m.form ?? "form not recorded"}
                                    </span>
                                </span>
                                {isYours && <span className="cx-tag yours">Yours</span>}
                                {isClinic && <span className="cx-tag clinic">Clinic</span>}
                                <span
                                    role="button"
                                    tabIndex={-1}
                                    className="cx-sheet-pin"
                                    title={isClinic ? "Remove the clinic default" : "Make this the clinic default"}
                                    onClick={(e) => { e.stopPropagation(); onPinClinic(m, !isClinic); }}
                                >
                                    {isClinic ? <PinOff size={13} /> : <Pin size={13} />}
                                </span>
                                {isCurrent && <Check size={14} color="var(--blue)" />}
                            </button>
                        );
                    })
                )}
            </div>

            <div className="cx-sheet-foot">
                Your own picks reorder this list for you. Pinning sets the brand the
                whole clinic sees first.
            </div>
        </div>,
        document.body
    );
}
