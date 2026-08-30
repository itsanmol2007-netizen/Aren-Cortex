// ---------------------------------------------------------------------------
// Cortex's copy of Front Desk's `AttachmentPreviewModal.tsx` — opening an
// attachment used to be `window.open(presignedUrl)`, a new tab whose address
// bar reads as leaving Aren entirely. This renders the same presigned URL
// inline instead, inside `ChartSurface` (Cortex's own modal shell), so
// viewing a file never leaves the consult screen.
//
// Skeleton is sized to the file's REAL dimensions, not a generic spinner —
// `visit_attachments.width`/`height` are captured for free at compress.ts's
// resize step and carried through on the row, so the placeholder is already
// the right shape before a single byte of the actual image has arrived.
// ---------------------------------------------------------------------------

import { useEffect, useState } from "react";
import { FileText, Paperclip } from "lucide-react";
import { getViewUrl } from "../../lib/db/attachments";
import { ATTACHMENT_TYPE_LABEL, type Attachment } from "../../lib/attachments/types";
import { ChartSurface } from "./ChartSurface";

type Props = {
    attachment: Attachment;
    onClose: () => void;
};

export function AttachmentPreviewModal({ attachment, onClose }: Props) {
    const [url, setUrl] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [mediaLoaded, setMediaLoaded] = useState(false);

    useEffect(() => {
        let cancelled = false;
        getViewUrl(attachment.storagePath)
            .then((u) => { if (!cancelled) setUrl(u); })
            .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "Could not open this attachment"); });
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
        <ChartSurface title={label} eyebrow="Attachment" icon={<Paperclip size={15} />} expanded onClose={onClose}>
            <div className="cs-attach-preview">
                {error ? (
                    <p className="cs-attach-error">{error}</p>
                ) : (
                    <div
                        className="cs-attach-preview-frame"
                        style={{
                            aspectRatio: showSkeleton || isImage || isPdf ? aspect : undefined,
                            maxWidth: aspect >= 1 ? "100%" : `calc(60vh * ${aspect})`,
                        }}
                    >
                        {showSkeleton && <div className="cs-attach-preview-skel" />}
                        {url && isImage && (
                            <img
                                src={url}
                                alt={label}
                                onLoad={() => setMediaLoaded(true)}
                                className="cs-attach-preview-img"
                                style={{ opacity: mediaLoaded ? 1 : 0 }}
                            />
                        )}
                        {url && isPdf && (
                            <iframe
                                src={url}
                                title={label}
                                onLoad={() => setMediaLoaded(true)}
                                className="cs-attach-preview-pdf"
                                style={{ opacity: mediaLoaded ? 1 : 0 }}
                            />
                        )}
                        {url && !isImage && !isPdf && (
                            <div className="cs-attach-preview-other">
                                <FileText size={26} />
                                <a href={url} target="_blank" rel="noopener noreferrer">Open file</a>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </ChartSurface>
    );
}
