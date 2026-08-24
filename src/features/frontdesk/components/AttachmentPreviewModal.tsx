import { useEffect, useState } from "react";
import { FileText, Paperclip } from "lucide-react";
import { getViewUrl } from "@/lib/db/attachments";
import { ATTACHMENT_TYPE_LABEL, type Attachment } from "@/lib/attachments/types";
import { useT } from "../i18n/i18n";
import { ModalShell } from "./ModalShell";

// Opening an attachment used to be `window.open(presignedB2Url)` — a new
// browser tab that reads as leaving AREN entirely (the URL is Backblaze's,
// not ours). This renders the same presigned URL inline instead, inside our
// own ModalShell chrome, so viewing a file never leaves the app's branding.
//
// Skeleton is sized to the file's REAL dimensions, not a generic spinner —
// visit_attachments.width/height are captured for free at compress.ts's
// resize step and carried through on the row, so the placeholder is already
// the right shape before a single byte of the actual image has arrived.

type Props = {
    attachment: Attachment;
    onClose: () => void;
};

export function AttachmentPreviewModal({ attachment, onClose }: Props) {
    const t = useT();
    const [url, setUrl] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [mediaLoaded, setMediaLoaded] = useState(false);

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

    // Known dimensions (images) size the skeleton exactly; a PDF has no
    // stored dimensions but a document page shape is a close-enough guess
    // for the brief moment before the iframe reports loaded.
    const aspect = isImage && attachment.width && attachment.height
        ? attachment.width / attachment.height
        : isPdf ? 0.77 : 4 / 3;
    const showSkeleton = !error && !mediaLoaded && (isImage || isPdf);

    return (
        <ModalShell eyebrow={t("attachEyebrow")} title={label} icon={<Paperclip size={19} strokeWidth={2.2} />} onClose={onClose} maxWidth={740}>
            <div className="flex min-h-[30vh] items-center justify-center overflow-hidden rounded-[12px] border border-[#eef0f5] bg-[#f7f8fb]">
                {error ? (
                    <div className="px-6 py-10 text-center text-[13px] font-medium text-[#d23b34]">{error}</div>
                ) : (
                    <div
                        className="relative w-full"
                        style={{
                            aspectRatio: showSkeleton || isImage || isPdf ? aspect : undefined,
                            maxHeight: "68vh",
                            maxWidth: aspect >= 1 ? "100%" : `calc(68vh * ${aspect})`,
                            margin: "0 auto",
                        }}
                    >
                        {showSkeleton && (
                            <div className="absolute inset-0 animate-pulse rounded-[10px] bg-[linear-gradient(90deg,#eef0f4_25%,#e4e7ee_37%,#eef0f4_63%)]" />
                        )}
                        {url && isImage && (
                            <img
                                src={url}
                                alt={label}
                                onLoad={() => setMediaLoaded(true)}
                                className="h-full w-full object-contain transition-opacity duration-200"
                                style={{ opacity: mediaLoaded ? 1 : 0 }}
                            />
                        )}
                        {url && isPdf && (
                            <iframe
                                src={url}
                                title={label}
                                onLoad={() => setMediaLoaded(true)}
                                className="h-full w-full border-0 transition-opacity duration-200"
                                style={{ opacity: mediaLoaded ? 1 : 0 }}
                            />
                        )}
                        {url && !isImage && !isPdf && (
                            <div className="flex h-full w-full flex-col items-center justify-center gap-[10px] px-6 py-10 text-center">
                                <FileText size={28} className="text-[#a8aeba]" />
                                <a href={url} target="_blank" rel="noopener noreferrer" className="text-[13px] font-semibold text-[#2f6bed] underline underline-offset-2">
                                    {t("attachPreview")}
                                </a>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </ModalShell>
    );
}
