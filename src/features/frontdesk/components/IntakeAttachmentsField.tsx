import { FileText, Image as ImageIcon, X } from "lucide-react";
import { ATTACHMENT_TYPES, ATTACHMENT_TYPE_LABEL, type AttachmentType } from "@/lib/attachments/types";
import { useT } from "../i18n/i18n";
import { AttachmentDropzone, inferAttachmentType } from "./AttachmentDropzone";

// Staged, not uploaded. A visit_attachments row needs a real visit_id, and
// none exists until CreateVisitModal's Save actually creates the visit — so
// this field only collects File + AttachmentType pairs locally; the actual
// upload (uploadAttachment() from lib/db/attachments.ts — the exact same
// entry point Consult's AttachmentsCard and VisitAttachmentsModal call, same
// compression, same edge functions, same B2 bucket) happens once the new
// visit_id comes back from onCreate, right before the modal closes.

export type StagedAttachment = { localId: string; file: File; attachmentType: AttachmentType };

function formatBytes(n: number): string {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

type Props = {
    files: StagedAttachment[];
    onChange: (next: StagedAttachment[]) => void;
};

export function IntakeAttachmentsField({ files, onChange }: Props) {
    const t = useT();

    const addFiles = (picked: File[]) => {
        const staged = picked.map((file) => ({
            localId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
            file,
            attachmentType: inferAttachmentType(file),
        }));
        onChange([...files, ...staged]);
    };

    const remove = (localId: string) => onChange(files.filter((f) => f.localId !== localId));

    // The type is auto-inferred from the file (see AttachmentDropzone), but
    // reception can correct it here before Save — it drives which
    // compression profile the upload gets, so this is the one piece of "what
    // am I uploading" control that's worth keeping visible rather than
    // silently guessed.
    const setType = (localId: string, attachmentType: AttachmentType) =>
        onChange(files.map((f) => (f.localId === localId ? { ...f, attachmentType } : f)));

    return (
        <div>
            {files.length > 0 && (
                <div className="mb-[8px] flex flex-col gap-[6px]">
                    {files.map((f) => (
                        <div key={f.localId} className="flex items-center gap-[10px] rounded-[10px] border border-[#eef0f5] bg-[#fafbfc] px-3 py-[8px]">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-[#efeafd] text-[#6d28d9]">
                                {f.file.type.startsWith("image/") ? <ImageIcon size={15} /> : <FileText size={15} />}
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="truncate text-[12.5px] font-semibold text-[#161d29]">{f.file.name}</div>
                                <div className="mt-[1px] truncate text-[11px] text-[#8a91a0]">{formatBytes(f.file.size)}</div>
                            </div>
                            {/* Compact, unlayered so it isn't eaten by the §13
                                Cortex legacy `select` rule the way a Tailwind
                                utility select would be — same reasoning as
                                fd-field, just a plain inline style here since
                                this one row-scoped control doesn't need a
                                shared class. */}
                            <select
                                aria-label={t("attachTypeLabel")}
                                value={f.attachmentType}
                                onChange={(e) => setType(f.localId, e.target.value as AttachmentType)}
                                style={{
                                    height: 28, borderRadius: 7, border: "1.5px solid #e4e7ee",
                                    background: "#fff", padding: "0 6px", fontSize: 11.5, fontWeight: 600,
                                    color: "#5a6472", outline: "none",
                                }}
                                className="shrink-0"
                            >
                                {ATTACHMENT_TYPES.map((ty) => (
                                    <option key={ty} value={ty}>{ATTACHMENT_TYPE_LABEL[ty]}</option>
                                ))}
                            </select>
                            <button
                                type="button"
                                onClick={() => remove(f.localId)}
                                aria-label={t("attachRemove")}
                                title={t("attachRemove")}
                                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] text-[#a8aeba] transition-colors hover:bg-[rgba(210,59,52,0.08)] hover:text-[#d23b34]"
                            >
                                <X size={14} />
                            </button>
                        </div>
                    ))}
                    <div className="text-[11px] text-[#a8aeba]">{t("attachStagedHint")}</div>
                </div>
            )}

            <AttachmentDropzone onFiles={addFiles} />
        </div>
    );
}
