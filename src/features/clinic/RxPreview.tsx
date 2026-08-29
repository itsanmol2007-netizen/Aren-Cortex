// ---------------------------------------------------------------------------
// The prescription preview — a REAL page, scaled to fit.
//
// This is not a picture of a prescription and not a second, simplified
// rendering of one: it mounts `PrescriptionDocument` itself (standing rule 6,
// "one prescription renderer") at its true paper width and scales the whole
// thing down with a transform. What a doctor sees here is, pixel for pixel and
// modulo the scale factor, what comes out of the printer.
//
// Why a measured scale rather than a fixed one: the same component renders
// inside a dashboard card (~330px wide) and inside the editor's main column
// (~600px). A hardcoded factor would either overflow one or waste half of the
// other, and a `width: 100%` approach doesn't work at all here — the document
// declares its width in millimetres because it has to.
// ---------------------------------------------------------------------------

import { useEffect, useRef, useState } from "react";
import PrescriptionDocument from "../prescription/PrescriptionDocument";
import type { PrintFormat } from "../prescription/usePrintFormat";
import type { DBDoctor, DBHospital } from "../../lib/db";
import type { PrescriptionConfig } from "../../lib/db/clinic";
import {
    SAMPLE_FINDINGS, SAMPLE_FOLLOW_UP_DAYS, SAMPLE_MEDICINES, SAMPLE_PATIENT,
    SAMPLE_REF, SAMPLE_SYMPTOMS, SAMPLE_TESTS,
} from "./samplePrescription";

/** CSS px per millimetre at the 96dpi the browser assumes — the same constant
 *  that makes `width: 148mm` in `PrescriptionDocument` resolve to 559.37px. */
const PX_PER_MM = 96 / 25.4;

const PAGE_MM: Record<PrintFormat, { w: number; h: number }> = {
    a5: { w: 148, h: 210 },
    a4: { w: 210, h: 297 },
    // A thermal roll has no fixed page height — it is as long as the
    // prescription is. 210mm here is a viewing window, not a page edge.
    thermal: { w: 76, h: 210 },
};

export function RxPreview({
    hospital, doctor, config, format = "a5", maxHeight, frameClass = "",
}: {
    hospital: DBHospital | null;
    doctor: DBDoctor | null;
    config: PrescriptionConfig;
    format?: PrintFormat;
    /**
     * A ceiling on the rendered sheet, in px.
     *
     * Scaling on width ALONE is wrong the moment the column is wide: a 700px
     * column renders A5 at 994px tall, which is a card nothing on the page can
     * sit beside honestly (measured live 2026-08-29 — the Clinic Hours card
     * next to it inherited ~500px of dead space through `items-stretch`). With
     * a ceiling the sheet scales on whichever axis binds first and stays a
     * modest portrait page, centred in whatever room it has.
     */
    maxHeight?: number;
    /** Extra classes on the paper frame — how the dashboard's doorway paints
     *  its hover/focus state on the sheet itself rather than on a wrapper. */
    frameClass?: string;
}) {
    const boxRef = useRef<HTMLDivElement>(null);
    const [scale, setScale] = useState(0);

    const page = PAGE_MM[format];
    const pageW = page.w * PX_PER_MM;
    const pageH = page.h * PX_PER_MM;

    // Measured, not assumed. `ResizeObserver` rather than a one-shot read on
    // mount because this sits in a responsive grid — the editor's own column
    // changes width when the window does, and a stale scale factor would
    // leave the page either clipped or floating in dead space.
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
               the measurement above, so no card around it ever has to guess. */
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
                    <PrescriptionDocument
                        patient={SAMPLE_PATIENT}
                        prescriptionRef={SAMPLE_REF}
                        symptoms={SAMPLE_SYMPTOMS}
                        findings={SAMPLE_FINDINGS}
                        prescription={SAMPLE_MEDICINES}
                        tests={SAMPLE_TESTS}
                        followUpDays={SAMPLE_FOLLOW_UP_DAYS}
                        doctor={doctor}
                        hospital={hospital}
                        format={format}
                        config={config}
                    />
                </div>
            )}
        </div>
        </div>
    );
}
