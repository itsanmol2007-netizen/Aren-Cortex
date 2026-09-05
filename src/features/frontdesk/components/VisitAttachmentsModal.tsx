import { useEffect, useState } from "react";
import { FileText, Image as ImageIcon, Loader2, Paperclip, Trash2 } from "lucide-react";
import { deleteAttachment, listAttachments, uploadAttachment } from "@/lib/db/attachments";
import { ATTACHMENT_TYPE_LABEL, type Attachment } from "@/lib/attachments/types";
import type { TodayVisit } from "../types/frontdesk";
import { useT } from "../i18n/i18n";
import { padToken } from "../utils";
import { ModalShell } from "./ModalShell";
import { AttachmentDropzone, inferAttachmentType } from "./AttachmentDropzone";
import { AttachmentPreviewModal } from "./AttachmentPreviewModal";
import { UploadFromPhoneButton } from "./gateway/UploadFromPhoneButton";
import { useGatewaySessions } from "./gateway/GatewaySessionsProvider";

// Visit-level attachments, reached from a queue row's ⋮ menu. Shows what's
// already on this visit and lets reception add more — the exact same
// pipeline Consult's AttachmentsCard uses end to end (lib/db/attachments.ts:
// listAttachments / uploadAttachment / getViewUrl / deleteAttachment — same
// compression, same attachment-upload-url / -view-url / -delete edge
// functions, same B2 bucket, same visit_attachments table). This modal is
// only new chrome around that existing pipeline, not a second copy of it.
//
// Unlike IntakeAttachmentsField (patient intake, no visit yet — files are
// staged and uploaded after Save), the visit already exists here, so every
// drop uploads immediately.

type Props = {
    visit: TodayVisit;
    onClose: () => void;
};

function formatBytes(n: number | null): string {
    if (n == null) return "";
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function VisitAttachmentsModal({ visit, onClose }: Props) {
    const t = useT();
    const gateway = useGatewaySessions();
    const activeSession = gateway.sessionForVisit(visit.visit_id);
    const [items, setItems] = useState<Attachment[]>([]);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState<string | null>(null); // status text while uploading
    const [previewing, setPreviewing] = useState<Attachment | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        listAttachments(visit.visit_id)
            .then((rows) => { if (!cancelled) setItems(rows); })
            .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [visit.visit_id]);

    const uploadFiles = async (picked: File[]) => {
        setError(null);
        for (const file of picked) {
            try {
                const attachment = await uploadAttachment(
                    { visitId: visit.visit_id, file, attachmentType: inferAttachmentType(file) },
                    (p) => setBusy(p.stage === "compressing" ? t("attachCompressing") : p.stage === "uploading" ? t("attachUploading") : t("attachSaving"))
                );
                setItems((curr) => [attachment, ...curr]);
            } catch (err) {
                setError(err instanceof Error ? err.message : t("attachUploadFailed"));
            }
        }
        setBusy(null);
    };

    const onDelete = async (att: Attachment) => {
        setError(null);
        // Optimistic — reception deleting a mis-attached file wants it gone
        // immediately, not after a round trip.
        setItems((curr) => curr.filter((i) => i.id !== att.id));
        try {
            await deleteAttachment(att.storagePath);
        } catch (err) {
            setError(err instanceof Error ? err.message : t("attachDeleteFailed"));
            setItems((curr) => [att, ...curr]);
        }
    };

    return (
        <ModalShell
            eyebrow={t("attachEyebrow")}
            title={visit.patient_name}
            icon={<Paperclip size={19} strokeWidth={2.2} />}
            onClose={onClose}
            // Narrower than the 580px Bhor default — this modal's whole
            // content is two upload tiles and a short file list, and 580px
            // read as unnecessarily stretched for that. 460 keeps the tiles
            // and file rows comfortable without the wide gutters either side.
            maxWidth={460}
        >
            <div className="mb-3 flex items-center justify-between">
                <span className="text-[10.5px] font-extrabold uppercase tracking-[0.08em] text-[#837bb2]">
                    {items.length > 0 ? t("attachCount", { n: items.length }) : t("secAttachments")}
                </span>
                {busy && (
                    <span className="flex items-center gap-[6px] text-[12px] font-semibold text-[#7c5cf0]">
                        <Loader2 size={13} className="animate-spin" />
                        {busy}
                    </span>
                )}
            </div>

            <div className="grid grid-cols-2 gap-[8px]">
                <AttachmentDropzone onFiles={uploadFiles} disabled={!!busy} />
                <UploadFromPhoneButton
                    onClick={() =>
                        gateway.openForVisit({
                            visitId: visit.visit_id,
                            patientId: visit.patient_id,
                            patientLabel: visit.patient_name,
                            visitLabel: `#${padToken(visit.token_number)}`,
                        })
                    }
                    sessionHint={activeSession ? t("gwSessionActiveHint") : undefined}
                />
            </div>

            {loading ? (
                <div className="py-8 text-center">
                    <Loader2 size={18} className="mx-auto animate-spin text-[#a8aeba]" />
                </div>
            ) : items.length > 0 ? (
                <div className="mt-3 flex flex-col gap-[8px]">
                    {items.map((att) => (
                        // The row itself is the "open" affordance — clicking
                        // anywhere on it (the thumbnail, the name, the empty
                        // space) previews it, the way a file normally opens.
                        // A separate view-only icon used to be the one thing
                        // that worked, which read as broken everywhere else
                        // on the row. Delete stays a deliberate, separate
                        // target — an accidental click there is destructive.
                        <div
                            key={att.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => setPreviewing(att)}
                            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setPreviewing(att); } }}
                            className="flex cursor-pointer items-center gap-3 rounded-[10px] border border-[#eef0f5] bg-[#fafbfc] px-3 py-[10px] transition-colors hover:border-[#e2d9fb] hover:bg-[#faf8ff]"
                        >
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px] bg-[#efeafd] text-[#6d28d9]">
                                {att.mimeType?.startsWith("image/") ? <ImageIcon size={16} /> : <FileText size={16} />}
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="truncate text-[13px] font-semibold text-[#161d29]">
                                    {att.attachmentType ? ATTACHMENT_TYPE_LABEL[att.attachmentType] : "Attachment"}
                                </div>
                                <div className="mt-[1px] text-[11.5px] text-[#68707e]">{formatBytes(att.sizeBytes)}</div>
                            </div>
                            <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); onDelete(att); }}
                                aria-label={t("attachRemove")}
                                title={t("attachRemove")}
                                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] text-[#a8aeba] transition-colors hover:bg-[rgba(210,59,52,0.08)] hover:text-[#d23b34]"
                            >
                                <Trash2 size={15} />
                            </button>
                        </div>
                    ))}
                </div>
            ) : null}

            {error && <p className="mt-3 text-[12px] font-medium text-[#d23b34]">{error}</p>}

            {previewing && (
                <AttachmentPreviewModal attachment={previewing} onClose={() => setPreviewing(null)} />
            )}
        </ModalShell>
    );
}
