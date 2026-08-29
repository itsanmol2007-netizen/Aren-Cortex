import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, QrCode, RotateCcw, UploadCloud } from "lucide-react";
import { canResume, isEffectivelyExpired, type VisitGateway } from "@/lib/db/gateways";
import { useT } from "../../i18n/i18n";
import { useCachedIntakeChips } from "../../operational/referenceCache";
import { ModalShell } from "../ModalShell";
import { useGatewaySessions } from "./GatewaySessionsProvider";
import { randomMedicalWord } from "./loadingWords";

// The portal URL the QR encodes. This app never renders what's behind it —
// see the brief: "this build's job ends at generating/managing the token
// and QR" — the separate arenode.com landing-page project owns everything
// past this URL.
const PORTAL_BASE = "https://arenode.com/portal/gateway/";

/** Rotates the loading-state word every ~1.1s so a slow connection doesn't
 *  leave the same word sitting there looking stuck — see loadingWords.ts. */
function useRotatingWord(active: boolean): string {
    const catalog = useCachedIntakeChips().data;
    const [word, setWord] = useState(() => randomMedicalWord(catalog));
    useEffect(() => {
        if (!active) return;
        const id = setInterval(() => setWord(randomMedicalWord(catalog)), 1100);
        return () => clearInterval(id);
    }, [active, catalog]);
    return word;
}

/** Re-evaluates "has this session's clock run out" on a short tick while the
 *  modal is open — Realtime only fires on a real DB write, never on time
 *  merely passing (see isEffectivelyExpired's own comment), so without this
 *  a session that quietly times out with the modal still open would keep
 *  showing a dead QR code with no visible sign anything changed. */
function useIsExpired(session: VisitGateway): boolean {
    const [, setTick] = useState(0);
    useEffect(() => {
        const id = setInterval(() => setTick((t) => t + 1), 5000);
        return () => clearInterval(id);
    }, []);
    return session.status !== "active" || isEffectivelyExpired(session);
}

export function GatewayQrModal() {
    const t = useT();
    const { modal, minimize, cancelCurrent, resumeCurrent } = useGatewaySessions();

    if (!modal) return null;

    if (modal.phase === "creating_visit" || modal.phase === "loading") {
        return (
            <LoadingShell
                patientLabel={modal.patientLabel}
                label={modal.phase === "creating_visit" ? t("gwCreatingVisit") : t("gwPreparing")}
                onMinimize={minimize}
            />
        );
    }

    if (modal.phase === "error") {
        return (
            <ModalShell eyebrow={t("gwEyebrow")} title={modal.patientLabel} icon={<QrCode size={19} strokeWidth={2.2} />} onClose={minimize}>
                <p className="py-4 text-center text-[13px] font-medium text-[#d23b34]">{modal.message || t("gwGenericError")}</p>
            </ModalShell>
        );
    }

    return (
        <ReadyModal
            session={modal.session}
            patientLabel={modal.patientLabel}
            visitLabel={modal.visitLabel}
            onMinimize={minimize}
            onCancel={cancelCurrent}
            onResume={resumeCurrent}
        />
    );
}

function LoadingShell({ patientLabel, label, onMinimize }: { patientLabel: string; label: string; onMinimize: () => void }) {
    const t = useT();
    const word = useRotatingWord(true);
    return (
        <ModalShell eyebrow={t("gwEyebrow")} title={patientLabel} icon={<QrCode size={19} strokeWidth={2.2} />} onClose={onMinimize} preventDismiss>
            <div className="flex flex-col items-center gap-[14px] py-[26px]">
                <Loader2 size={26} className="animate-spin text-[#7c5cf0]" />
                <div className="text-center">
                    <div className="text-[13.5px] font-bold text-[#161d29]">{label}</div>
                    <div className="mt-[3px] text-[12px] font-medium text-[#8a91a0]">{t("gwLoadingWordTemplate", { word })}</div>
                </div>
            </div>
        </ModalShell>
    );
}

function ReadyModal({
    session, patientLabel, visitLabel, onMinimize, onCancel, onResume,
}: {
    session: VisitGateway;
    patientLabel: string;
    visitLabel: string;
    onMinimize: () => void;
    onCancel: () => Promise<void>;
    onResume: (opts?: { resetExtensionCount?: boolean }) => Promise<void>;
}) {
    const t = useT();
    const expired = useIsExpired(session);
    const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (expired) { setQrDataUrl(null); return; }
        let cancelled = false;
        import("qrcode")
            .then((QRCode) => QRCode.toDataURL(`${PORTAL_BASE}${session.token}`, { width: 200, margin: 1 }))
            .then((url) => { if (!cancelled) setQrDataUrl(url); })
            .catch(() => { /* silently skip — the modal still shows context/count without it */ });
        return () => { cancelled = true; };
    }, [session.token, expired]);

    const title = visitLabel ? `${patientLabel} · ${visitLabel}` : patientLabel;

    const resumable = canResume(session);
    const doResume = async () => {
        setBusy(true);
        try { await onResume(resumable ? undefined : { resetExtensionCount: true }); }
        finally { setBusy(false); }
    };
    const doCancel = async () => {
        if (!window.confirm(t("gwCancelConfirm"))) return;
        setBusy(true);
        try { await onCancel(); }
        finally { setBusy(false); }
    };

    return (
        <ModalShell
            eyebrow={t("gwEyebrow")}
            title={title}
            icon={<QrCode size={19} strokeWidth={2.2} />}
            onClose={onMinimize}
            preventDismiss
            footer={
                !expired ? (
                    <button
                        type="button"
                        onClick={doCancel}
                        disabled={busy}
                        className="h-9 rounded-[9px] border-[1.5px] border-[#f3d3d1] bg-white px-[14px] text-[12.5px] font-bold text-[#b3372f] transition-colors hover:border-[#eab3af] hover:bg-[#fff8f7] disabled:opacity-60"
                    >
                        {t("gwCancelLink")}
                    </button>
                ) : undefined
            }
        >
            {expired ? (
                <div className="flex flex-col items-center gap-[12px] py-[22px] text-center">
                    <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#fdf2f2] text-[#c9791a]">
                        <RotateCcw size={19} />
                    </div>
                    <div>
                        <div className="text-[14px] font-bold text-[#161d29]">{t("gwExpiredTitle")}</div>
                        <div className="mt-[3px] max-w-[320px] text-[12.5px] font-medium text-[#8a91a0]">
                            {resumable ? t("gwExpiredBody") : t("gwResumeCapped")}
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={doResume}
                        disabled={busy}
                        className="mt-[4px] flex h-10 items-center gap-[7px] rounded-[10px] bg-[#2f6bed] px-5 text-[13.5px] font-bold text-white shadow-[0_3px_12px_rgba(47,107,237,0.4)] transition-[background-color] hover:bg-[#1d51c9] disabled:opacity-60"
                    >
                        {busy ? <Loader2 size={15} className="animate-spin" /> : <RotateCcw size={15} />}
                        {resumable ? t("gwResume") : t("gwStartNew")}
                    </button>
                </div>
            ) : (
                <div className="flex flex-col items-center gap-[14px] py-[8px]">
                    <div className="flex h-[216px] w-[216px] items-center justify-center rounded-[14px] border border-[#eef0f5] bg-white shadow-[0_1px_3px_rgba(20,30,50,0.06)]">
                        {qrDataUrl ? (
                            <img src={qrDataUrl} alt="" width={200} height={200} className="rounded-[8px]" />
                        ) : (
                            <Loader2 size={20} className="animate-spin text-[#a8aeba]" />
                        )}
                    </div>
                    <div className="text-center text-[12.5px] font-medium text-[#5a6472]">{t("gwScanInstruction")}</div>

                    <div className="flex w-full items-center justify-between gap-[10px] rounded-[11px] border border-[#eef0f5] bg-[#fafbfc] px-3 py-[9px]">
                        <div className="flex items-center gap-[8px]">
                            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] bg-[#efeafd] text-[#6d28d9]">
                                <UploadCloud size={13} />
                            </div>
                            <span className="text-[12.5px] font-bold text-[#161d29]">
                                {session.documentsUploadedCount > 0
                                    ? t("gwUploadedCount", { n: session.documentsUploadedCount })
                                    : t("gwUploadedNone")}
                            </span>
                        </div>
                        {session.patientMarkedDone && (
                            <span className="flex shrink-0 items-center gap-[4px] rounded-[7px] bg-[#eafaf0] px-[8px] py-[3px] text-[11px] font-bold text-[#1c8a4d]">
                                <CheckCircle2 size={12} />
                                {t("gwPatientDone")}
                            </span>
                        )}
                    </div>
                </div>
            )}
        </ModalShell>
    );
}
