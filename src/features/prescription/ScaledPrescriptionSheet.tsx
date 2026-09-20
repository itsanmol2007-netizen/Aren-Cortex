// ---------------------------------------------------------------------------
// SCALED PRESCRIPTION SHEET — a real page, scaled to fit.
//
// Extracted from `features/clinic/RxPreview.tsx` (2026-09-20) so a second
// caller (`ReviewModal`'s on-screen preview) can reuse the exact same
// measure-and-scale mechanism without a second, hand-rolled copy of it —
// rule 19: two places computing "what scale makes this page fit its box"
// independently is a shape that drifts the first time one of them is
// tuned and the other isn't. `RxPreview` itself is now a thin wrapper: the
// Clinic dashboard card and Prescription Editor's live preview render
// exactly as they did before this split, just through this shared shell.
//
// This is not a picture of a prescription and not a second, simplified
// rendering of one (standing rule 6, "one prescription renderer") — it
// mounts whatever `PrescriptionDocument` element it's given at its true
// paper width and scales the whole thing down with a transform. What a
// doctor sees here is, pixel for pixel and modulo the scale factor, what
// comes out of the printer.
// ---------------------------------------------------------------------------

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { PrintFormat } from "./usePrintFormat";

/** CSS px per millimetre at the 96dpi the browser assumes — the same constant
 *  that makes `width: 148mm` in `PrescriptionDocument` resolve to 559.37px. */
const PX_PER_MM = 96 / 25.4;

export const PAGE_MM: Record<PrintFormat, { w: number; h: number }> = {
    a5: { w: 148, h: 210 },
    a4: { w: 210, h: 297 },
    // A thermal roll has no fixed page height — it is as long as the
    // prescription is. 210mm here is a viewing window, not a page edge.
    thermal: { w: 76, h: 210 },
};

export function ScaledPrescriptionSheet({
    format, maxHeight, frameClass = "", children,
}: {
    format: PrintFormat;
    /**
     * A ceiling on the rendered sheet, in px.
     *
     * Scaling on width ALONE is wrong the moment the column is wide: a 700px
     * column renders A5 at 994px tall, which is a card nothing on the page can
     * sit beside honestly (measured live 2026-08-29 — the Clinic Hours card
     * next to it inherited ~500px of dead space through `items-stretch`). With
     * a ceiling the sheet scales on whichever axis binds first and stays a
     * modest portrait page, centred in whatever room it has. Omit it (as
     * `ReviewModal`'s preview does) when the sheet already sits in its own
     * scrolling region — there a tall page just scrolls, the same way a real
     * printed page would.
     */
    maxHeight?: number;
    /** Extra classes on the paper frame — how the dashboard's doorway paints
     *  its hover/focus state on the sheet itself rather than on a wrapper. */
    frameClass?: string;
    /** The `<PrescriptionDocument .../>` element to render at true size and
     *  scale down — never a second layout, never a mock-up. */
    children: ReactNode;
}) {
    const boxRef = useRef<HTMLDivElement>(null);
    const [scale, setScale] = useState(0);

    const page = PAGE_MM[format];
    const pageW = page.w * PX_PER_MM;
    const pageH = page.h * PX_PER_MM;

    // Measured, not assumed. `ResizeObserver` rather than a one-shot read on
    // mount because this sits in a responsive layout — the editor's own
    // column (or the review modal's own width, at the format picker) changes
    // width, and a stale scale factor would leave the page either clipped or
    // floating in dead space.
    useEffect(() => {
        const el = boxRef.current;
        if (!el) return;
        const measure = () => {
            const w = el.clientWidth;
            if (w <= 0) return;
            const byWidth = w / pageW;
            setScale(maxHeight ? Math.min(byWidth, maxHeight / pageH) : byWidth);
        };
        measure();
        const ro = new ResizeObserver(measure);
        ro.observe(el);
        return () => ro.disconnect();
    }, [pageW, pageH, maxHeight]);

    return (
        <div ref={boxRef} className="flex w-full justify-center">
            <div
                aria-label="Prescription preview"
                /* Paper, on a page. The resting shadow is what says "this is a
                   sheet", which is the whole reason it renders portrait rather
                   than as a landscape dashboard tile. Both dimensions come from
                   the measurement above, so no container around it ever has to
                   guess. */
                className={
                    "relative overflow-hidden rounded-[var(--cs-radius-sm)] border " +
                    "border-[var(--cs-line)] bg-white shadow-[0_1px_3px_rgba(16,28,46,0.06)] " +
                    frameClass
                }
                style={{ width: scale ? pageW * scale : "100%", height: scale ? pageH * scale : 0 }}
            >
                {scale > 0 && (
                    <div
                        className="origin-top-left bg-white"
                        style={{ width: pageW, height: pageH, transform: `scale(${scale})` }}
                    >
                        {children}
                    </div>
                )}
            </div>
        </div>
    );
}
