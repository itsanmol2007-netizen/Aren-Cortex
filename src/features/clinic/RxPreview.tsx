// ---------------------------------------------------------------------------
// The prescription preview — a REAL page, scaled to fit.
//
// This is not a picture of a prescription and not a second, simplified
// rendering of one: it mounts `PrescriptionDocument` itself (standing rule 6,
// "one prescription renderer") through `ScaledPrescriptionSheet` — the shared
// measure-and-scale shell `ReviewModal`'s own on-screen preview now uses too
// (2026-09-20), so this page's specimen preview and a doctor's real
// prescription preview can never drift apart in HOW they scale, only in
// WHAT they render. What a doctor sees here is, pixel for pixel and modulo
// the scale factor, what comes out of the printer.
// ---------------------------------------------------------------------------

import PrescriptionDocument from "../prescription/PrescriptionDocument";
import { ScaledPrescriptionSheet } from "../prescription/ScaledPrescriptionSheet";
import type { PrintFormat } from "../prescription/usePrintFormat";
import type { DBDoctor, DBHospital } from "../../lib/db";
import type { PrescriptionConfig } from "../../lib/db/clinic";
import type { RxLanguage } from "../../lib/i18n/prescriptionLabels";
import {
    SAMPLE_FINDINGS, SAMPLE_FOLLOW_UP_DAYS, SAMPLE_MEDICINES, SAMPLE_PATIENT,
    SAMPLE_REF, SAMPLE_SYMPTOMS, SAMPLE_TESTS,
} from "./samplePrescription";

export function RxPreview({
    hospital, doctor, config, format = "a5", language = "en", maxHeight, frameClass = "",
}: {
    hospital: DBHospital | null;
    doctor: DBDoctor | null;
    config: PrescriptionConfig;
    format?: PrintFormat;
    /** Which of the 3 approved prescription languages to render the
     *  specimen in — preview-only, same as `format` (see the editor's own
     *  note: this never changes what a real consult prints, only what this
     *  sheet demonstrates). Defaults to English, `PrescriptionDocument`'s
     *  own default. */
    language?: RxLanguage;
    /** See `ScaledPrescriptionSheet`'s own doc comment. */
    maxHeight?: number;
    /** Extra classes on the paper frame — how the dashboard's doorway paints
     *  its hover/focus state on the sheet itself rather than on a wrapper. */
    frameClass?: string;
}) {
    return (
        <ScaledPrescriptionSheet format={format} maxHeight={maxHeight} frameClass={frameClass}>
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
                language={language}
            />
        </ScaledPrescriptionSheet>
    );
}
