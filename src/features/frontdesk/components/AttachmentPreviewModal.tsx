import { useEffect, useState } from "react";
import { FileText, Loader2, Paperclip } from "lucide-react";
import { getViewUrl } from "@/lib/db/attachments";
import { ATTACHMENT_TYPE_LABEL, type Attachment } from "@/lib/attachments/types";
import { useT } from "../i18n/i18n";
import { ModalShell } from "./ModalShell";

// Opening an attachment used to be `window.open(presignedB2Url)` — a new
// browser tab that reads as leaving AREN entirely (the URL is Backblaze's,
// not ours). This renders the same presigned URL inline instead, inside our
// own ModalShell chrome, so viewing a file never leaves the app's branding.

type Props = {
    attachment: Attachment;
    onClose: () => void;
};

export function AttachmentPreviewModal({ attachment, onClose }: Props) {
    const t = useT();
    const [url, setUrl] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        getViewUrl(attachment.storagePath)
            .then((u) => { if (!cancelled) setUrl(u); })
            .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : t("attachViewFailed")); });
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [attachment.storagePath]);

    const isImage = attachment.mimeType?.startsWith("image/");
    const isPdf = attachment.mimeType === "application/pdf";
    const label = attachment.attachmentType ? ATTACHMENT_TYPE_LABEL[attachment.attachmentType] : "Attachment";

    return (
        <ModalShell eyebrow={t("attachEyebrow")} title={label} icon={<Paperclip size={19} strokeWidth={2.2} />} onClose={onClose} maxWidth={740}>
            <div className="flex min-h-[52vh] items-center justify-center overflow-hidden rounded-[12px] border border-[#eef0f5] bg-[#f7f8fb]">
                {error ? (
                    <div className="px-6 py-10 text-center text-[13px] font-medium text-[#d23b34]">{error}</div>
                ) : !url ? (
                    <Loader2 size={20} className="animate-spin text-[#a8aeba]" />
                ) : isImage ? (
                    <img src={url} alt={label} className="max-h-[68vh] w-full object-contain" />
                ) : isPdf ? (
                    <iframe src={url} title={label} className="h-[68vh] w-full border-0" />
                ) : (
                    <div className="flex flex-col items-center gap-[10px] px-6 py-10 text-center">
                        <FileText size={28} className="text-[#a8aeba]" />
                        <div className="text-[13px] text-[#5a6472]">
                            <a href={url} target="_blank" rel="noopener noreferrer" className="font-semibold text-[#2f6bed] underline underline-offset-2">
                                {t("attachPreview")}
                            </a>
                        </div>
                    </div>
                )}
            </div>
        </ModalShell>
    );
}
