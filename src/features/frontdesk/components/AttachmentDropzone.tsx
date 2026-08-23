import { useRef, useState } from "react";
import { UploadCloud } from "lucide-react";
import { ACCEPTED_MIME_ACCEPT, ACCEPTED_MIME_TYPES, type AttachmentType } from "@/lib/attachments/types";
import { useT } from "../i18n/i18n";

// Front Desk's one attachment entry point — drop a file or click to browse,
// matching the reference intake screenshot (2026-08-23) exactly. Reception
// isn't making the clinical xray/scan/lab-report distinction Consult's
// AttachmentsCard asks a doctor to pick FIRST (that distinction drives the
// compression profile — compress.ts still needs some type, so one is
// inferred here from the file's mime type). Good enough for what reception
// is actually doing at intake; a doctor can retag it later if it matters.
export function inferAttachmentType(file: File): AttachmentType {
    return file.type === "application/pdf" ? "lab_report" : "photo";
}

type Props = {
    onFiles: (files: File[]) => void;
    disabled?: boolean;
};

export function AttachmentDropzone({ onFiles, disabled }: Props) {
    const t = useT();
    const [dragging, setDragging] = useState(false);
    const [rejected, setRejected] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    const accept = (files: File[]) => {
        if (!files.length) return;
        const ok = files.filter((f) => (ACCEPTED_MIME_TYPES as readonly string[]).includes(f.type));
        setRejected(ok.length < files.length);
        if (ok.length) onFiles(ok);
    };

    return (
        <div>
            <input
                ref={inputRef}
                type="file"
                accept={ACCEPTED_MIME_ACCEPT}
                multiple
                className="hidden"
                onChange={(e) => {
                    accept(Array.from(e.target.files ?? []));
                    if (inputRef.current) inputRef.current.value = "";
                }}
            />
            <div
                role="button"
                tabIndex={disabled ? -1 : 0}
                aria-disabled={disabled || undefined}
                onClick={() => !disabled && inputRef.current?.click()}
                onKeyDown={(e) => {
                    if (disabled) return;
                    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); inputRef.current?.click(); }
                }}
                onDragOver={(e) => { if (disabled) return; e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                    e.preventDefault();
                    setDragging(false);
                    if (disabled) return;
                    accept(Array.from(e.dataTransfer.files));
                }}
                className={`flex flex-col items-center gap-[7px] rounded-[12px] border-[1.5px] border-dashed px-4 py-5 text-center transition-colors ${
                    disabled
                        ? "cursor-default border-[#e9e7f4] bg-[#f8f8fb] opacity-60"
                        : dragging
                            ? "cursor-pointer border-[#7c5cf0] bg-[rgba(124,92,240,0.07)]"
                            : "cursor-pointer border-[#d9d3ee] bg-[#faf9ff] hover:border-[#c9bdf5] hover:bg-[#f8f7fd]"
                }`}
            >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[linear-gradient(155deg,#a855f7,#f472b6)] text-white shadow-[0_3px_10px_rgba(168,85,247,0.3)]">
                    <UploadCloud size={17} />
                </span>
                <div className="text-[12.5px] font-medium text-[#5a6472]">{t("attachDropLine")}</div>
                <div className="text-[11px] text-[#a8aeba]">{t("attachDropCaption")}</div>
            </div>
            {rejected && <p className="mt-[6px] text-[12px] font-medium text-[#d23b34]">{t("attachUnsupportedType")}</p>}
        </div>
    );
}
