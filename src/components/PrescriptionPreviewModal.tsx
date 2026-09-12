// ---------------------------------------------------------------------------
// PRESCRIPTION PREVIEW — the read-only door into a prescription that already
// exists, opened from anywhere a doctor is looking at a LIST of prescriptions
// rather than a single patient's record: Communication's "View Prescription"
// button on a sent WhatsApp template, and Overview's "Prescriptions" activity
// list (2026-09-12).
//
// Extracted from CommunicationPage.tsx rather than left to grow a second,
// slightly different copy in DoctorOverviewPage.tsx — same reasoning this
// file's own contents already state: "Consult's exact review/print pipeline,
// opened read-only — the same door Print RX's reprint uses, never a second
// renderer" (standing rule 6). One fetch, one pair of shells (skeleton while
// loading, `ReviewModal` once it lands), one place that can drift.
// ---------------------------------------------------------------------------

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import ReviewModal from "./ReviewModal";
import { fetchPrescriptionRenderData, type DBHospital, type PrescriptionRenderData } from "../lib/db";

interface Props {
    /** `null` renders nothing — callers keep this as their own piece of
     *  state (e.g. `useState<string | null>`) rather than an `open` boolean,
     *  so there is only one flag for "which prescription, if any". */
    prescriptionId: string | null;
    hospital: DBHospital | null;
    onClose: () => void;
}

export function PrescriptionPreviewModal({ prescriptionId, hospital, onClose }: Props) {
    const [rxDetail, setRxDetail] = useState<PrescriptionRenderData | null>(null);

    useEffect(() => {
        if (!prescriptionId) { setRxDetail(null); return; }
        let cancelled = false;
        setRxDetail(null);
        fetchPrescriptionRenderData(prescriptionId)
            .then((d) => { if (!cancelled) setRxDetail(d); })
            .catch((e: unknown) => {
                console.error("[PrescriptionPreviewModal] fetchPrescriptionRenderData:", e);
                if (!cancelled) { toast.error("Could not open that prescription."); onClose(); }
            });
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [prescriptionId]);

    if (!prescriptionId) return null;

    if (rxDetail) {
        return (
            <ReviewModal
                mode="print"
                patient={rxDetail.patient}
                visitId={rxDetail.visitId}
                prescriptionRef={rxDetail.prescriptionRef ?? undefined}
                symptoms={rxDetail.symptoms}
                findings={rxDetail.findings}
                prescription={rxDetail.medicines}
                tests={rxDetail.tests}
                followUpDays={rxDetail.followUpDays}
                adviceNotes={rxDetail.adviceNotes ?? undefined}
                doctor={rxDetail.doctor}
                hospital={hospital}
                vitals={rxDetail.vitals ?? undefined}
                date={new Date(rxDetail.createdAt)}
                onClose={onClose}
            />
        );
    }

    // The wait between the click and `rxDetail` landing — was nothing at all
    // before this (2026-09-08, Communication: "there is a skeleton screen...
    // slowly you'll fill those things there"). Shaped like the document it
    // precedes rather than a generic spinner: same outer shell `ReviewModal`
    // itself renders (680px, up to 95vh), so opening a prescription is one
    // modal settling in, never two trading places.
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4">
            <div className="relative flex w-full max-w-[680px] max-h-[95vh] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
                <div className="flex shrink-0 items-center justify-between px-5 py-3 border-b border-gray-100">
                    <span className="h-[16px] w-[50px] animate-pulse rounded-[5px] bg-gray-100" />
                    <span className="text-[15px] font-black text-gray-300">Opening…</span>
                    <button
                        onClick={onClose}
                        className="rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>
                <div className="flex-1 overflow-hidden bg-gray-50/80 p-3">
                    <div className="flex flex-col gap-3 rounded-2xl border border-gray-200/80 bg-white p-4 shadow-lg">
                        {/* Letterhead */}
                        <div className="h-[100px] animate-pulse rounded-xl bg-gray-100" />
                        {/* Patient strip */}
                        <div className="flex items-center gap-3">
                            <span className="h-9 w-9 flex-none animate-pulse rounded-xl bg-gray-100" />
                            <span className="h-[18px] w-[40%] animate-pulse rounded-[6px] bg-gray-100" />
                        </div>
                        {/* Prescription table */}
                        <div className="flex flex-col gap-2">
                            <span className="h-[12px] w-[110px] animate-pulse rounded-[5px] bg-gray-100" />
                            <div className="h-[64px] animate-pulse rounded-xl bg-gray-100" />
                            <div className="h-[64px] animate-pulse rounded-xl bg-gray-100" />
                        </div>
                    </div>
                </div>
                <div className="flex shrink-0 items-center gap-3 border-t border-gray-100 px-5 py-3">
                    <span className="h-[16px] w-[70px] animate-pulse rounded-[5px] bg-gray-100" />
                    <div className="flex-1" />
                    <span className="h-9 w-[130px] animate-pulse rounded-xl bg-gray-100" />
                </div>
            </div>
        </div>
    );
}
