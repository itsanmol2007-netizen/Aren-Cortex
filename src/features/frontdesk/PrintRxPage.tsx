import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import {
    fetchDoctorsByHospital,
    fetchHospital,
    fetchPrescriptionRenderData,
    HOSPITAL_ID,
    type DBDoctor,
    type DBHospital,
    type PrescriptionRenderData,
    type PrintQueueRx,
} from "@/lib/db";
import ReviewModal from "@/components/ReviewModal";
import { WorkspaceShell } from "./components/WorkspaceShell";
import { PrintQueuePanel } from "./components/printrx/PrintQueuePanel";
import { PrintWorkspace } from "./components/printrx/PrintWorkspace";
import { usePrintQueue } from "./hooks/usePrintQueue";
import { recordPrint, usePrintLog } from "./printLog";
import { timeAgo } from "./utils";
import { I18nProvider, useT } from "./i18n/i18n";

// Print RX — the receptionist's document workspace. Front Desk asks "what is
// happening today?", Patients asks "tell me about this patient", this room
// asks "which prescriptions need my attention?" Find the paper, print it,
// hand it over, go back. Rendering and printing are delegated wholesale to
// Consult's ReviewModal pipeline — one prescription renderer in the product.
export function PrintRxPage() {
    return (
        <I18nProvider>
            <PrintRxInner />
        </I18nProvider>
    );
}

function PrintRxInner() {
    const t = useT();
    const queue = usePrintQueue();
    const printLog = usePrintLog();
    const [doctors, setDoctors] = useState<DBDoctor[]>([]);
    const [hospital, setHospital] = useState<DBHospital | null>(null);
    const [selectedId, setSelectedId] = useState<string | null>(null);

    // The full render payload for the selected prescription — fetched the
    // moment a row is selected so Print is (nearly) instant when pressed.
    const [detail, setDetail] = useState<PrescriptionRenderData | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [detailFailed, setDetailFailed] = useState(false);

    // Which door into the shared ReviewModal: "print" fires the print flow on
    // open; "preview" lets her look first and print from inside.
    const [modal, setModal] = useState<null | "print" | "preview">(null);

    const [now, setNow] = useState(() => new Date());

    useEffect(() => {
        fetchDoctorsByHospital(HOSPITAL_ID)
            .then(setDoctors)
            .catch((err) => console.warn("fetchDoctorsByHospital failed (non-fatal):", err));
        fetchHospital(HOSPITAL_ID)
            .then(setHospital)
            .catch((err) => console.warn("fetchHospital failed (non-fatal):", err));
        const timer = setInterval(() => setNow(new Date()), 20000);
        return () => clearInterval(timer);
    }, []);

    const selected = useMemo(
        () => queue.entries.find((e) => e.prescription_id === selectedId) ?? null,
        [queue.entries, selectedId]
    );

    const patientHistory = useMemo(
        () => (selected ? queue.entries.filter((e) => e.patient_id === selected.patient_id) : []),
        [queue.entries, selected]
    );

    const loadDetail = useCallback((prescriptionId: string) => {
        setDetail(null);
        setDetailFailed(false);
        setDetailLoading(true);
        let cancelled = false;
        fetchPrescriptionRenderData(prescriptionId)
            .then((d) => { if (!cancelled) setDetail(d); })
            .catch((err) => {
                console.warn("fetchPrescriptionRenderData failed:", err);
                if (!cancelled) setDetailFailed(true);
            })
            .finally(() => { if (!cancelled) setDetailLoading(false); });
        return () => { cancelled = true; };
    }, []);

    useEffect(() => {
        if (!selectedId) { setDetail(null); setDetailFailed(false); setDetailLoading(false); return; }
        return loadDetail(selectedId);
    }, [selectedId, loadDetail]);

    // ── Deep links ───────────────────────────────────────────────────────
    // Front Desk's completed rows arrive as ?visit=…, the Patients page's
    // quick action as ?patient=…. Applied once after the first load, then the
    // URL is cleaned so a refresh doesn't resurrect a stale selection.
    const [searchParams, setSearchParams] = useSearchParams();
    const deepLinkDone = useRef(false);
    useEffect(() => {
        if (deepLinkDone.current || queue.loading || queue.failed) return;
        const visitId = searchParams.get("visit");
        const patientId = searchParams.get("patient");
        deepLinkDone.current = true;
        if (!visitId && !patientId) return;

        let target: PrintQueueRx | undefined;
        if (visitId) {
            target = queue.entries.find((e) => e.visit_id === visitId);
            if (!target) toast.info(t("noRxForVisit"));
        } else if (patientId) {
            // Entries arrive newest-first, so this is the latest prescription.
            target = queue.entries.find((e) => e.patient_id === patientId);
            if (!target) toast.info(t("noRxForPatient"));
        }
        if (target) setSelectedId(target.prescription_id);
        setSearchParams({}, { replace: true });
    }, [queue.loading, queue.failed, queue.entries, searchParams, setSearchParams, t]);

    const handlePrinted = useCallback(() => {
        if (!selected) return;
        // Recorded when the OS print dialog closes. The browser cannot tell a
        // printed dialog from a cancelled one — worst case a prescription
        // lands in Recently Printed a print too early, where it stays one
        // click from being printed again. Cheap, honest failure mode.
        recordPrint(selected.prescription_id);
        toast.success(t("toastPrinted", { name: selected.patient_name }));
        // The one-click path closes itself once its job is done; an explicit
        // preview stays open — she asked to look at it.
        setModal((m) => (m === "print" ? null : m));
    }, [selected, t]);

    const updatedLabel = !queue.updatedAt
        ? null
        : now.getTime() - queue.updatedAt.getTime() < 45000
          ? t("printRxUpdatedNow")
          : t("printRxUpdatedAgo", { t: timeAgo(queue.updatedAt.toISOString()) });

    return (
        <WorkspaceShell>
            <div className="mx-auto flex min-h-0 w-full max-w-[1480px] flex-1 flex-col px-6 pb-5 pt-5">
                <div className="mb-4 flex shrink-0 items-end justify-between gap-4">
                    <div>
                        <h1 className="m-0 font-[Manrope,sans-serif] text-[22px] font-extrabold leading-[1.15] tracking-[-0.01em] text-[#161d29]">
                            {t("printRxTitle")}
                        </h1>
                        <p className="m-0 mt-[3px] text-[13px] font-medium text-[#8a91a0]">{t("printRxSub")}</p>
                    </div>

                    {/* The page keeps itself fresh (25s, silent); this strip just
                        says so — and offers an impatient receptionist a nudge. */}
                    <div className="flex shrink-0 items-center gap-[10px] pb-[2px]">
                        {updatedLabel && (
                            <span className="flex items-center gap-[7px] text-[12px] font-medium text-[#8a91a0]">
                                <span className="relative flex h-[7px] w-[7px]">
                                    <span className="absolute h-full w-full rounded-full bg-[#1c8a4d] opacity-90" />
                                </span>
                                {updatedLabel}
                            </span>
                        )}
                        <button
                            type="button"
                            onClick={queue.refetch}
                            title={t("printRxRefresh")}
                            aria-label={t("printRxRefresh")}
                            className="flex h-8 w-8 items-center justify-center rounded-[8px] border border-[#e7e9f0] bg-white text-[#8a91a0] transition-colors hover:border-[#d5cfec] hover:bg-[#f8f7fd] hover:text-[#5a6472] focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_rgba(99,102,241,0.28)]"
                        >
                            <RefreshCw size={14} />
                        </button>
                    </div>
                </div>

                <div className="grid min-h-0 flex-1 grid-cols-[minmax(360px,440px)_minmax(0,1fr)] items-stretch gap-[14px] max-[1040px]:grid-cols-1">
                    <PrintQueuePanel
                        entries={queue.entries}
                        loading={queue.loading}
                        failed={queue.failed}
                        onRetry={queue.retry}
                        doctors={doctors}
                        printLog={printLog}
                        selectedId={selectedId}
                        onSelect={(rx) => setSelectedId(rx.prescription_id)}
                    />
                    <PrintWorkspace
                        entry={selected}
                        detail={detail}
                        detailLoading={detailLoading}
                        detailFailed={detailFailed}
                        onRetryDetail={() => { if (selectedId) loadDetail(selectedId); }}
                        printLog={printLog}
                        patientHistory={patientHistory}
                        onSelect={(rx) => setSelectedId(rx.prescription_id)}
                        onPrint={() => setModal("print")}
                        onPreview={() => setModal("preview")}
                    />
                </div>
            </div>

            {/* Consult's exact review/print pipeline, opened read-only. The
                document carries its original prescription date — a reprint is
                a faithful copy, not a new prescription. */}
            {modal && detail && (
                <ReviewModal
                    mode="print"
                    autoPrint={modal === "print"}
                    patient={detail.patient}
                    visitId={detail.visitId}
                    prescriptionRef={detail.prescriptionRef ?? undefined}
                    symptoms={detail.symptoms}
                    findings={detail.findings}
                    prescription={detail.medicines}
                    tests={detail.tests}
                    followUpDays={detail.followUpDays}
                    adviceNotes={detail.adviceNotes ?? undefined}
                    doctor={detail.doctor}
                    hospital={hospital}
                    vitals={detail.vitals ?? undefined}
                    date={new Date(detail.createdAt)}
                    onClose={() => setModal(null)}
                    onPrinted={handlePrinted}
                />
            )}
        </WorkspaceShell>
    );
}
