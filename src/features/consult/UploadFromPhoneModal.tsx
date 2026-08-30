// ---------------------------------------------------------------------------
// UPLOAD FROM PHONE — Cortex's copy of Front Desk's visit-gateway QR feature
// (`features/frontdesk/components/gateway/GatewayQrModal.tsx`). Same DB layer
// (`lib/db/gateways.ts` is provider-agnostic — nothing Front Desk-specific in
// it), same token/QR semantics, same "closeable only by the explicit X"
// rule. What's deliberately NOT ported:
//
//   - The clinic-wide badge + popover (`GatewaySessionsBadge`). That exists
//     so reception can track many concurrent sessions across a whole queue;
//     a consult is one doctor looking at one visit, so there is nothing to
//     roll up — reopening "Upload from phone" from the Attach menu is
//     already the one place this session lives.
//   - The pre-save "creating_visit" phase. Front Desk can open this before a
//     visit exists; Cortex only ever gets here mid-consult, so `visitId` is
//     always real by the time this mounts (AttachmentsCard already disables
//     the whole Attach control until a visit exists).
//   - `useT()`/i18n and `ModalShell` — Cortex has neither. This renders on
//     `ChartSurface` instead (the odontogram/body-map shell), which already
//     carries the same pink→violet stripe and X-only-close chrome once
//     `preventDismiss` is passed.
// ---------------------------------------------------------------------------

import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, QrCode, RotateCcw, UploadCloud } from "lucide-react";
import {
    canResume,
    cancelGatewaySession,
    ensureActiveGatewaySession,
    fetchGatewayForVisit,
    isEffectivelyExpired,
    resumeGatewaySession,
    subscribeGatewaySessions,
    type VisitGateway,
} from "../../lib/db/gateways";
import { ChartSurface } from "./ChartSurface";

// Same portal URL Front Desk's QR encodes — this app never renders what's
// behind it either; arenode.com owns the upload interface itself.
const PORTAL_BASE = "https://arenode.com/portal/gateway/";

// Fixed footprint for every phase — same reasoning and same numbers as Front
// Desk's GatewayQrModal.tsx (its own copy of this note): "give the QR-code
// modal a consistent fixed width and fixed height, regardless of whether a
// QR code is currently available... should not resize depending on its
// state." `QR_MODAL_WIDTH` goes to `ChartSurface`'s `maxWidth`.
const QR_MODAL_WIDTH = 320;
const BODY_MIN_HEIGHT = 340;

interface Props {
    visitId: string;
    patientId: string;
    hospitalId: string;
    onClose: () => void;
}

type Phase =
    | { kind: "loading" }
    | { kind: "error"; message: string }
    | { kind: "ready"; session: VisitGateway };

/** Re-checks "has this session's clock run out" on a short tick while the
 *  modal is open — mirrors Front Desk's `useIsExpired`. Realtime only fires
 *  on a DB write, never on time merely passing. */
function useIsExpired(session: VisitGateway): boolean {
    const [, setTick] = useState(0);
    useEffect(() => {
        const id = setInterval(() => setTick((t) => t + 1), 5000);
        return () => clearInterval(id);
    }, []);
    return session.status !== "active" || isEffectivelyExpired(session);
}

export function UploadFromPhoneModal({ visitId, patientId, hospitalId, onClose }: Props) {
    const [phase, setPhase] = useState<Phase>({ kind: "loading" });

    useEffect(() => {
        let cancelled = false;
        ensureActiveGatewaySession({ visitId, patientId, hospitalId })
            .then((session) => { if (!cancelled) setPhase({ kind: "ready", session }); })
            .catch((err) => {
                if (!cancelled) setPhase({ kind: "error", message: err instanceof Error ? err.message : "Could not start this upload link" });
            });
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visitId]);

    // Live upload count / status while the modal is open — same mechanism as
    // Front Desk's badge (any change on this hospital's gateways refetches),
    // just scoped down to refetching this one visit's row.
    useEffect(() => {
        if (phase.kind !== "ready") return;
        return subscribeGatewaySessions(hospitalId, () => {
            fetchGatewayForVisit(visitId)
                .then((g) => { if (g) setPhase({ kind: "ready", session: g }); })
                .catch(() => { /* next tick/poll recovers */ });
        });
    }, [phase.kind, hospitalId, visitId]);

    if (phase.kind === "loading") {
        return (
            <ChartSurface title="Upload from phone" eyebrow="Attachments" icon={<QrCode size={15} />} expanded onClose={onClose} preventDismiss maxWidth={QR_MODAL_WIDTH}>
                <div className="flex flex-col items-center justify-center gap-[14px]" style={{ minHeight: BODY_MIN_HEIGHT }}>
                    <Loader2 size={26} className="animate-spin text-[#7c5cf0]" />
                    <span className="text-[12.5px] font-medium text-[#8a91a0]">Preparing upload link…</span>
                </div>
            </ChartSurface>
        );
    }

    if (phase.kind === "error") {
        return (
            <ChartSurface title="Upload from phone" eyebrow="Attachments" icon={<QrCode size={15} />} expanded onClose={onClose} maxWidth={QR_MODAL_WIDTH}>
                <div className="flex flex-col items-center justify-center text-center" style={{ minHeight: BODY_MIN_HEIGHT }}>
                    <p className="text-[13px] font-medium text-[#d23b34]">{phase.message}</p>
                </div>
            </ChartSurface>
        );
    }

    return (
        <ReadyBody
            session={phase.session}
            onClose={onClose}
            onSessionChange={(session) => setPhase({ kind: "ready", session })}
        />
    );
}

function ReadyBody({
    session, onClose, onSessionChange,
}: {
    session: VisitGateway;
    onClose: () => void;
    onSessionChange: (session: VisitGateway) => void;
}) {
    const expired = useIsExpired(session);
    const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    // Kept once expired rather than nulled out — the expired box below shows
    // this SAME image, blurred and dimmed, instead of swapping to a
    // differently-shaped block. Only regenerates on a real new token (i.e. a
    // resume), never on the mere passage of time into "expired" — same as
    // Front Desk's GatewayQrModal.tsx, which this mirrors.
    useEffect(() => {
        let cancelled = false;
        import("qrcode")
            .then((QRCode) => QRCode.toDataURL(`${PORTAL_BASE}${session.token}`, { width: 200, margin: 1 }))
            .then((url) => { if (!cancelled) setQrDataUrl(url); })
            .catch(() => { /* silently skip — the modal still shows status without it */ });
        return () => { cancelled = true; };
    }, [session.token]);

    const resumable = canResume(session);
    const doResume = async () => {
        setBusy(true);
        try { onSessionChange(await resumeGatewaySession(session, resumable ? undefined : { resetExtensionCount: true })); }
        finally { setBusy(false); }
    };
    const doCancel = async () => {
        if (!window.confirm("Cancel this upload link? The patient's QR code will stop working.")) return;
        setBusy(true);
        try { await cancelGatewaySession(session.id); onClose(); }
        finally { setBusy(false); }
    };

    return (
        <ChartSurface title="Upload from phone" eyebrow="Attachments" icon={<QrCode size={15} />} expanded onClose={onClose} preventDismiss maxWidth={QR_MODAL_WIDTH}>
            {/* One fixed-size body for every state, same reasoning (and same
                numbers) as Front Desk's GatewayQrModal.tsx: the QR box is the
                SAME 216x216 box whether live or expired — expiry overlays a
                blur + message on top rather than replacing it with a
                differently-shaped block, so nothing here ever reflows. */}
            <div className="flex flex-col items-center gap-[14px]" style={{ minHeight: BODY_MIN_HEIGHT }}>
                <div className="relative flex h-[216px] w-[216px] items-center justify-center rounded-[14px] border border-[#eef0f5] bg-white shadow-[0_1px_3px_rgba(20,30,50,0.06)]">
                    {qrDataUrl ? (
                        <img
                            src={qrDataUrl}
                            alt=""
                            width={200}
                            height={200}
                            className={`rounded-[8px] transition-[filter,opacity] duration-200 ${expired ? "opacity-35 blur-[3px] grayscale" : ""}`}
                        />
                    ) : (
                        <Loader2 size={20} className="animate-spin text-[#a8aeba]" />
                    )}
                    {expired && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-[5px] rounded-[14px] bg-white/60">
                            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#fdf2f2] text-[#c9791a] shadow-[0_2px_8px_rgba(201,121,26,0.18)]">
                                <RotateCcw size={16} />
                            </div>
                            <span className="rounded-[6px] bg-white px-[8px] py-[2px] text-[10.5px] font-extrabold uppercase tracking-[0.06em] text-[#b3372f] shadow-[0_1px_4px_rgba(20,30,50,0.10)]">
                                Expired
                            </span>
                        </div>
                    )}
                </div>

                {expired ? (
                    <>
                        <div className="max-w-[260px] text-center text-[12.5px] font-medium text-[#8a91a0]">
                            {resumable
                                ? "Resume it to generate a fresh QR code for the same visit."
                                : "This link has already been resumed twice — start a new one."}
                        </div>
                        <button
                            type="button"
                            onClick={doResume}
                            disabled={busy}
                            className="flex h-10 items-center gap-[7px] rounded-[10px] bg-[#2f6bed] px-5 text-[13.5px] font-bold text-white shadow-[0_3px_12px_rgba(47,107,237,0.4)] transition-[background-color] hover:bg-[#1d51c9] disabled:opacity-60"
                        >
                            {busy ? <Loader2 size={15} className="animate-spin" /> : <RotateCcw size={15} />}
                            {resumable ? "Resume" : "Start a new session"}
                        </button>
                    </>
                ) : (
                    <>
                        <div className="text-center text-[12.5px] font-medium text-[#5a6472]">
                            Ask the patient to scan this with their phone camera
                        </div>

                        <div className="flex w-full items-center justify-between gap-[10px] rounded-[11px] border border-[#eef0f5] bg-[#fafbfc] px-3 py-[9px]">
                            <div className="flex items-center gap-[8px]">
                                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] bg-[#efeafd] text-[#6d28d9]">
                                    <UploadCloud size={13} />
                                </div>
                                <span className="text-[12.5px] font-bold text-[#161d29]">
                                    {session.documentsUploadedCount > 0 ? `${session.documentsUploadedCount} uploaded` : "No documents yet"}
                                </span>
                            </div>
                            {session.patientMarkedDone && (
                                <span className="flex shrink-0 items-center gap-[4px] rounded-[7px] bg-[#eafaf0] px-[8px] py-[3px] text-[11px] font-bold text-[#1c8a4d]">
                                    <CheckCircle2 size={12} />
                                    Patient marked done
                                </span>
                            )}
                        </div>

                        <button
                            type="button"
                            onClick={doCancel}
                            disabled={busy}
                            className="h-9 rounded-[9px] border-[1.5px] border-[#f3d3d1] bg-white px-[14px] text-[12.5px] font-bold text-[#b3372f] transition-colors hover:border-[#eab3af] hover:bg-[#fff8f7] disabled:opacity-60"
                        >
                            Cancel this link
                        </button>
                    </>
                )}
            </div>
        </ChartSurface>
    );
}
