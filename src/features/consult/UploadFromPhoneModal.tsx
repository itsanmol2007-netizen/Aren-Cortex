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
            <ChartSurface title="Upload from phone" eyebrow="Attachments" icon={<QrCode size={15} />} expanded onClose={onClose} preventDismiss>
                <div className="cs-phoneup-loading">
                    <Loader2 size={22} className="cs-spin" />
                    <span>Preparing upload link…</span>
                </div>
            </ChartSurface>
        );
    }

    if (phase.kind === "error") {
        return (
            <ChartSurface title="Upload from phone" eyebrow="Attachments" icon={<QrCode size={15} />} expanded onClose={onClose}>
                <p className="cs-attach-error">{phase.message}</p>
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

    useEffect(() => {
        if (expired) { setQrDataUrl(null); return; }
        let cancelled = false;
        import("qrcode")
            .then((QRCode) => QRCode.toDataURL(`${PORTAL_BASE}${session.token}`, { width: 200, margin: 1 }))
            .then((url) => { if (!cancelled) setQrDataUrl(url); })
            .catch(() => { /* silently skip — the modal still shows status without it */ });
        return () => { cancelled = true; };
    }, [session.token, expired]);

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
        <ChartSurface title="Upload from phone" eyebrow="Attachments" icon={<QrCode size={15} />} expanded onClose={onClose} preventDismiss>
            {expired ? (
                <div className="cs-phoneup-expired">
                    <div className="cs-phoneup-expired-icon"><RotateCcw size={18} /></div>
                    <div className="cs-phoneup-expired-title">This upload link expired</div>
                    <div className="cs-phoneup-expired-body">
                        {resumable ? "Resume it to generate a fresh QR code for the same visit." : "This link has already been resumed twice — start a new one."}
                    </div>
                    <button type="button" className="cs-phoneup-resume-btn" onClick={doResume} disabled={busy}>
                        {busy ? <Loader2 size={14} className="cs-spin" /> : <RotateCcw size={14} />}
                        {resumable ? "Resume" : "Start a new session"}
                    </button>
                </div>
            ) : (
                <div className="cs-phoneup-body">
                    <div className="cs-phoneup-qr">
                        {qrDataUrl ? <img src={qrDataUrl} alt="" width={200} height={200} /> : <Loader2 size={18} className="cs-spin" />}
                    </div>
                    <div className="cs-phoneup-caption">Ask the patient to scan this with their phone camera</div>

                    <div className="cs-phoneup-status">
                        <div className="cs-phoneup-status-left">
                            <span className="cs-phoneup-status-icon"><UploadCloud size={13} /></span>
                            <span className="cs-phoneup-status-count">
                                {session.documentsUploadedCount > 0 ? `${session.documentsUploadedCount} uploaded` : "No documents yet"}
                            </span>
                        </div>
                        {session.patientMarkedDone && (
                            <span className="cs-phoneup-done-badge"><CheckCircle2 size={12} /> Patient marked done</span>
                        )}
                    </div>

                    <button type="button" className="cs-phoneup-cancel-btn" onClick={doCancel} disabled={busy}>
                        Cancel this link
                    </button>
                </div>
            )}
        </ChartSurface>
    );
}
