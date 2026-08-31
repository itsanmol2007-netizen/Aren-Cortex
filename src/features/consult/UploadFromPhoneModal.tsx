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
    // Bumped by the error state's own "regenerate" action to re-run the
    // effect below without duplicating `ensureActiveGatewaySession`'s call.
    const [retryToken, setRetryToken] = useState(0);

    useEffect(() => {
        let cancelled = false;
        setPhase({ kind: "loading" });
        ensureActiveGatewaySession({ visitId, patientId, hospitalId })
            .then((session) => { if (!cancelled) setPhase({ kind: "ready", session }); })
            .catch((err) => {
                if (!cancelled) setPhase({ kind: "error", message: err instanceof Error ? err.message : "Could not start this upload link" });
            });
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visitId, retryToken]);

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

    // ONE shell for every phase, with only the BODY swapping inside it.
    //
    // Each phase used to return its own `<ChartSurface>`, which meant the
    // element type at this position changed on every phase change — React
    // unmounted the shell and mounted a fresh one, so the modal's DOM node
    // was recreated the instant the link finished preparing. That silently
    // re-ran `useOverlayFocus` (stealing focus a second time, mid-open) and,
    // since 2026-08-31, would have replayed `.cs-chartmodal-panel`'s entry
    // animation, making a routine loading→ready transition look like the
    // whole modal had closed and reopened. The shell is stable now; the
    // "fixed footprint for every phase" promise at the top of this file is
    // also enforced in one place instead of three copies of the same props.
    //
    // `preventDismiss` still varies: a live or preparing QR session must
    // never be dropped by a stray click outside, but an error state has
    // nothing to lose and should be dismissible like any other overlay.
    return (
        <ChartSurface
            title="Upload from phone"
            eyebrow="Attachments"
            icon={<QrCode size={15} />}
            expanded
            onClose={onClose}
            preventDismiss={phase.kind !== "error"}
            maxWidth={QR_MODAL_WIDTH}
        >
            {phase.kind === "loading" && (
                <div className="flex flex-col items-center justify-center gap-[14px]" style={{ minHeight: BODY_MIN_HEIGHT }}>
                    <Loader2 size={26} className="animate-spin text-[#7c5cf0]" />
                    <span className="text-[12.5px] font-medium text-[#8a91a0]">Preparing upload link…</span>
                </div>
            )}

            {/* No active code to show — a plain error sentence used to sit
                alone in this box, which read as a different, broken shell
                next to the real (expired) state. A mock QR under the same
                blur, with the same click-to-retry affordance, keeps every
                "nothing live right now" state in this modal looking like
                ONE component with different things to say, not several. */}
            {phase.kind === "error" && (
                <div className="flex flex-col items-center gap-[14px]" style={{ minHeight: BODY_MIN_HEIGHT }}>
                    <button
                        type="button"
                        onClick={() => setRetryToken((t) => t + 1)}
                        aria-label="Retry generating the QR code"
                        className="relative flex h-[216px] w-[216px] cursor-pointer items-center justify-center rounded-[14px] border border-[#eef0f5] bg-white shadow-[0_1px_3px_rgba(20,30,50,0.06)]"
                    >
                        <div className="grid grid-cols-6 grid-rows-6 gap-[3px] opacity-35 blur-[3px] grayscale">
                            {Array.from({ length: 36 }).map((_, i) => (
                                <span key={i} className={`h-[18px] w-[18px] rounded-[2px] ${(i * 7 + Math.floor(i / 6)) % 3 === 0 ? "bg-[#161d29]" : "bg-transparent"}`} />
                            ))}
                        </div>
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-[5px] rounded-[14px] bg-white/70">
                            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#fdf2f2] text-[#c9791a] shadow-[0_2px_8px_rgba(201,121,26,0.18)]">
                                <RotateCcw size={16} />
                            </div>
                            <span className="rounded-[6px] bg-white px-[8px] py-[2px] text-[10.5px] font-extrabold uppercase tracking-[0.06em] text-[#b3372f] shadow-[0_1px_4px_rgba(20,30,50,0.10)]">
                                Unavailable
                            </span>
                        </div>
                    </button>
                    <div className="max-w-[260px] text-center text-[12.5px] font-medium text-[#8a91a0]">
                        {phase.message} — tap the QR code to try again.
                    </div>
                </div>
            )}

            {phase.kind === "ready" && (
                <ReadyBody
                    session={phase.session}
                    onClose={onClose}
                    onSessionChange={(session) => setPhase({ kind: "ready", session })}
                />
            )}
        </ChartSurface>
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
    // The browser's own `confirm()` popup read as an unofficial, out-of-app
    // interruption on a screen otherwise entirely Aren's own chrome — this is
    // the same fixed-footprint body's own confirmation step instead, styled
    // like everything around it.
    const [confirmingCancel, setConfirmingCancel] = useState(false);

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
        if (busy) return;
        setBusy(true);
        try { onSessionChange(await resumeGatewaySession(session, resumable ? undefined : { resetExtensionCount: true })); }
        finally { setBusy(false); }
    };
    const doCancel = async () => {
        setBusy(true);
        try { await cancelGatewaySession(session.id); onClose(); }
        finally { setBusy(false); }
    };

    /** The box is an action only while there is genuinely something to
     *  reload — see the render below for why this must not become a
     *  `disabled` button instead. */
    const canReload = expired && resumable && !busy;

    /** The QR image plus its expiry overlay, rendered identically whether the
     *  box around it is a button or a plain div. */
    const qrBox = (
        <>
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
                        {busy ? <Loader2 size={16} className="animate-spin" /> : <RotateCcw size={16} />}
                    </div>
                    <span className="rounded-[6px] bg-white px-[8px] py-[2px] text-[10.5px] font-extrabold uppercase tracking-[0.06em] text-[#b3372f] shadow-[0_1px_4px_rgba(20,30,50,0.10)]">
                        Expired
                    </span>
                </div>
            )}
        </>
    );

    return (
        <>
            {/* One fixed-size body for every state, same reasoning (and same
                numbers) as Front Desk's GatewayQrModal.tsx: the QR box is the
                SAME 216x216 box whether live or expired — expiry overlays a
                blur + message on top rather than replacing it with a
                differently-shaped block, so nothing here ever reflows. The
                cancel confirmation reuses this exact body too, so the modal's
                own width/height never move for it either.

                The `ChartSurface` shell itself lives in the parent now (see
                its "ONE shell for every phase" note) — this renders only the
                body that goes inside it. */}
            <div className="flex flex-col items-center gap-[14px]" style={{ minHeight: BODY_MIN_HEIGHT }}>
                {confirmingCancel ? (
                    <div className="flex w-full flex-1 flex-col items-center justify-center gap-[16px] text-center">
                        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#fdf2f2] text-[#b3372f]">
                            <QrCode size={20} />
                        </div>
                        <div>
                            <p className="text-[13.5px] font-bold text-[#161d29]">Cancel this upload link?</p>
                            <p className="mt-[4px] max-w-[240px] text-[12px] font-medium text-[#8a91a0]">
                                The patient's QR code will stop working immediately.
                            </p>
                        </div>
                        <div className="flex items-center gap-[8px]">
                            <button
                                type="button"
                                onClick={() => setConfirmingCancel(false)}
                                disabled={busy}
                                className="h-9 rounded-[9px] border-[1.5px] border-[#e4e7ef] bg-white px-[16px] text-[12.5px] font-bold text-[#3a4356] transition-colors hover:bg-[#f7f9fc] disabled:opacity-60"
                            >
                                Keep it
                            </button>
                            <button
                                type="button"
                                onClick={doCancel}
                                disabled={busy}
                                className="flex h-9 items-center gap-[6px] rounded-[9px] bg-[#c9382f] px-[16px] text-[12.5px] font-bold text-white transition-colors hover:bg-[#a92e26] disabled:opacity-60"
                            >
                                {busy && <Loader2 size={13} className="animate-spin" />}
                                Cancel link
                            </button>
                        </div>
                    </div>
                ) : (
                    <>
                        {/* The whole box IS the reload action once expired — no
                            separate button underneath restating it. A mock QR
                            (blurred) shows even before a real one has ever
                            loaded, so "no active code" reads the same as
                            "expired", not as a differently-shaped blank.

                            A <button> ONLY when it is really an action. The
                            first cut always rendered one and marked it
                            `disabled` whenever it wasn't reloadable — which is
                            most of the time, because a LIVE code isn't
                            expired — and `base.css` fades every disabled
                            button to `opacity: 0.48`. So a perfectly good QR
                            code rendered at half strength and read as
                            cancelled: "it's looking washed up... like that QR
                            code has been deactivated, but it's not
                            deactivated" (2026-08-31). Same cascade trap as
                            the `label`/`svg` ones already documented in
                            cortex-gotchas.md: an unlayered bare-element rule
                            in base.css beats everything Tailwind puts on the
                            element. */}
                        {canReload ? (
                            <button
                                type="button"
                                onClick={doResume}
                                aria-label="Reload the QR code"
                                className="relative flex h-[216px] w-[216px] cursor-pointer items-center justify-center rounded-[14px] border border-[#eef0f5] bg-white shadow-[0_1px_3px_rgba(20,30,50,0.06)] transition-colors hover:border-[#d9d3ee]"
                            >
                                {qrBox}
                            </button>
                        ) : (
                            <div className="relative flex h-[216px] w-[216px] items-center justify-center rounded-[14px] border border-[#eef0f5] bg-white shadow-[0_1px_3px_rgba(20,30,50,0.06)]">
                                {qrBox}
                            </div>
                        )}

                        {expired ? (
                            <>
                                <div className="max-w-[260px] text-center text-[12.5px] font-medium text-[#8a91a0]">
                                    {resumable
                                        ? "Tap the QR code to generate a fresh one for the same visit."
                                        : "This link has already been resumed twice — start a new one."}
                                </div>
                                {/* Only the non-resumable path keeps an explicit
                                    button — a resumable reload lives on the QR
                                    box itself now, see above. */}
                                {!resumable && (
                                    <button
                                        type="button"
                                        onClick={doResume}
                                        disabled={busy}
                                        className="flex h-10 items-center gap-[7px] rounded-[10px] bg-[#2f6bed] px-5 text-[13.5px] font-bold text-white shadow-[0_3px_12px_rgba(47,107,237,0.4)] transition-[background-color] hover:bg-[#1d51c9] disabled:opacity-60"
                                    >
                                        {busy ? <Loader2 size={15} className="animate-spin" /> : <RotateCcw size={15} />}
                                        Start a new session
                                    </button>
                                )}
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
                                    onClick={() => setConfirmingCancel(true)}
                                    disabled={busy}
                                    className="h-9 rounded-[9px] border-[1.5px] border-[#f3d3d1] bg-white px-[14px] text-[12.5px] font-bold text-[#b3372f] transition-colors hover:border-[#eab3af] hover:bg-[#fff8f7] disabled:opacity-60"
                                >
                                    Cancel this link
                                </button>
                            </>
                        )}
                    </>
                )}
            </div>
        </>
    );
}
