import { QrCode } from "lucide-react";
import { useT } from "../../i18n/i18n";

// The second "upload attachment" option, next to AttachmentDropzone's
// "upload from this computer" — same dashed-tile shape and weight, so the
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
    /** e.g. "An upload link is already active for this visit" — shown when
     *  GatewaySessionsProvider already has a live session for this visit, so
     *  clicking again is understood as "reopen", not "start a second one". */
    sessionHint?: string;
}) {
    const t = useT();
    return (
        <div className="flex h-full flex-col">
            <button
                type="button"
                onClick={onClick}
                disabled={disabled}
                className={`flex w-full flex-1 flex-col items-center justify-center gap-[5px] rounded-[11px] border-[1.5px] border-dashed px-4 py-[11px] text-center transition-colors ${
                    disabled
                        ? "cursor-default border-[#e9e7f4] bg-[#f8f8fb] opacity-60"
                        : "cursor-pointer border-[#d9d3ee] bg-[#faf9ff] hover:border-[#c9bdf5] hover:bg-[#f8f7fd]"
                }`}
            >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-[linear-gradient(155deg,#7c5cf0,#2f6bed)] text-white shadow-[0_3px_10px_rgba(124,92,240,0.3)]">
                    <QrCode size={15} />
                </span>
                <span className="text-[12.5px] font-medium text-[#5a6472]">{t("uploadFromPhone")}</span>
            </button>
            {sessionHint && (
                <p className="mt-[6px] text-center text-[11px] font-semibold text-[#7c5cf0]">{sessionHint}</p>
            )}
        </div>
    );
}
