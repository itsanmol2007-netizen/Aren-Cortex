import { QrCode } from "lucide-react";
import { useT } from "../../i18n/i18n";

// The second "upload attachment" option, next to AttachmentDropzone's
// "upload from this computer" — same solid-tile shape and weight, so the
// two read as one deliberate choice rather than one primary action with an
// afterthought bolted on. Purely presentational: both call sites
// (IntakeAttachmentsField / VisitAttachmentsModal) own what happens on
// click, since one has to create a visit first and the other doesn't — see
// CreateVisitModal's and VisitAttachmentsModal's own "Upload from phone"
// handlers.
export function UploadFromPhoneButton({
    onClick, disabled, sessionHint,
}: {
    onClick: () => void;
    disabled?: boolean;
    /** e.g. "An upload link is already active for this visit" — shown as the
     *  tile's own caption line (mirrors AttachmentDropzone's caption) when
     *  GatewaySessionsProvider already has a live session for this visit, so
     *  clicking again is understood as "reopen", not "start a second one". */
    sessionHint?: string;
}) {
    const t = useT();
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            // h-full so the grid stretches it to exactly match the dropzone
            // tile beside it; solid border (not dashed) with real contrast —
            // a dashed edge on a click-to-act button read as a disabled /
            // drop-only zone.
            className={`flex h-full w-full items-center gap-[10px] rounded-[11px] border-[1.5px] px-3 py-[10px] text-left transition-colors ${
                disabled
                    ? "cursor-default border-[#d5cef0] bg-[#f4f2fb] opacity-60"
                    : "cursor-pointer border-[#b3a4ec] bg-[#f5f2ff] hover:border-[#7c5cf0] hover:bg-[#efe9ff]"
            }`}
        >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-[linear-gradient(155deg,#7c5cf0,#2f6bed)] text-white shadow-[0_3px_10px_rgba(124,92,240,0.35)]">
                <QrCode size={15} />
            </span>
            <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] font-semibold text-[#3b4453]">{t("uploadFromPhone")}</span>
                {sessionHint && (
                    <span className="mt-[2px] block text-[11px] font-semibold leading-[1.3] text-[#6d4fd8]">{sessionHint}</span>
                )}
            </span>
        </button>
    );
}
