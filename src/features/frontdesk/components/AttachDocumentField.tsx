// ---------------------------------------------------------------------------
// ATTACH DOCUMENT — one button, and a choice only after it is pressed.
//
// Replaces the large drag-and-drop panel that sat on the intake form beside a
// second "Upload from phone" card. Two big boxes, permanently on screen, for
// something most registrations never use — Anmol, 2026-09-05: "Just '+ Attach
// document'. Clicking it offers Computer / Phone upload. No large upload area."
//
// Drag-and-drop is not lost, it is just no longer a 90px advertisement: the
// whole row still accepts a drop, and says so once a file is dragged over it.
//
// Staged files render as compact rows underneath. The heavy lifting (type
// inference, the phone gateway) is unchanged — this is a smaller door onto the
// same pipeline.
// ---------------------------------------------------------------------------

import { useEffect, useRef, useState } from "react";
import { FileText, Image as ImageIcon, Paperclip, Plus, Smartphone, X } from "lucide-react";
import type { StagedAttachment } from "./IntakeAttachmentsField";
// The type inference lives with the dropzone that first needed it; this is a
// smaller door onto the same pipeline, not a second one.
import { inferAttachmentType } from "./AttachmentDropzone";

const ACCEPT = "image/jpeg,image/png,image/webp,application/pdf";
const MAX_BYTES = 8 * 1024 * 1024;

function prettySize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AttachDocumentField({
    files, onChange, onUploadFromPhone,
}: {
    files: StagedAttachment[];
    onChange: (next: StagedAttachment[]) => void;
    onUploadFromPhone: () => void;
}) {
    const [menuOpen, setMenuOpen] = useState(false);
    const [dragOver, setDragOver] = useState(false);
    const [tooBig, setTooBig] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const wrapRef = useRef<HTMLDivElement>(null);

    // The menu is a transient mode: any click elsewhere dismisses it, so it
    // can never be left hanging over the form the receptionist is filling.
    useEffect(() => {
        if (!menuOpen) return;
        const onDown = (e: MouseEvent) => {
            if (!wrapRef.current?.contains(e.target as Node)) setMenuOpen(false);
        };
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMenuOpen(false); };
        document.addEventListener("mousedown", onDown);
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("mousedown", onDown);
            document.removeEventListener("keydown", onKey);
        };
    }, [menuOpen]);

    const add = (picked: File[]) => {
        const ok: File[] = [];
        for (const f of picked) {
            // Refused here rather than at upload time: an 11MB X-ray that
            // fails after the visit is created is a toast nobody connects to
            // the file they chose two screens ago.
            if (f.size > MAX_BYTES) { setTooBig(f.name); continue; }
            ok.push(f);
        }
        if (!ok.length) return;
        setTooBig(null);
        onChange([
            ...files,
            ...ok.map((file) => ({
                localId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
                file,
                attachmentType: inferAttachmentType(file),
            })),
        ]);
    };

    return (
        <div
            ref={wrapRef}
            className="relative"
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                add(Array.from(e.dataTransfer.files ?? []));
            }}
        >
            <div className="flex flex-wrap items-center gap-[10px]">
                <button
                    type="button"
                    onClick={() => setMenuOpen((v) => !v)}
                    aria-expanded={menuOpen}
                    className={
                        "inline-flex h-[38px] cursor-pointer items-center gap-[7px] rounded-[10px] border-[1.5px] px-[14px] text-[13px] font-bold transition-colors " +
                        (dragOver
                            ? "border-[#5b4fe9] bg-[#eeecfe] text-[#4338ca]"
                            : "border-[#ddd9f0] bg-[#f5f3ff] text-[#5b4fe9] hover:border-[#5b4fe9] hover:bg-[#eeecfe]")
                    }
                >
                    <Plus size={15} strokeWidth={2.6} />
                    Attach document
                </button>
                <span className="inline-flex items-center gap-[6px] text-[11.5px] text-[#8a91a0]">
                    <Paperclip size={12} />
                    {dragOver ? "Drop it here" : "JPG, PNG, PDF · up to 8MB"}
                </span>
            </div>

            {menuOpen && (
                <div
                    role="menu"
                    className="absolute left-0 top-[44px] z-30 w-[232px] overflow-hidden rounded-[12px] border border-[#e4e2f0] bg-white p-[5px] shadow-[0_14px_36px_rgba(13,18,38,0.16)]"
                >
                    <button
                        type="button"
                        role="menuitem"
                        onClick={() => { setMenuOpen(false); inputRef.current?.click(); }}
                        className="flex w-full cursor-pointer items-center gap-[10px] rounded-[9px] border-0 bg-transparent px-[10px] py-[9px] text-left transition-colors hover:bg-[#f5f3ff]"
                    >
                        <span className="flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-[8px] bg-[#eeecfe] text-[#5b4fe9]">
                            <FileText size={14} />
                        </span>
                        <span className="text-[13px] font-semibold text-[#161d29]">From this computer</span>
                    </button>
                    <button
                        type="button"
                        role="menuitem"
                        onClick={() => { setMenuOpen(false); onUploadFromPhone(); }}
                        className="flex w-full cursor-pointer items-center gap-[10px] rounded-[9px] border-0 bg-transparent px-[10px] py-[9px] text-left transition-colors hover:bg-[#f5f3ff]"
                    >
                        <span className="flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-[8px] bg-[#eeecfe] text-[#5b4fe9]">
                            <Smartphone size={14} />
                        </span>
                        <span className="min-w-0">
                            <span className="block text-[13px] font-semibold text-[#161d29]">From a phone</span>
                            <span className="block text-[11px] text-[#8a91a0]">Scan a QR to upload</span>
                        </span>
                    </button>
                </div>
            )}

            <input
                ref={inputRef}
                type="file"
                multiple
                accept={ACCEPT}
                className="hidden"
                onChange={(e) => {
                    add(Array.from(e.target.files ?? []));
                    e.target.value = ""; // lets the same file be re-picked later
                }}
            />

            {tooBig && (
                <p className="m-0 mt-[7px] text-[11.5px] font-semibold text-[#d23b34]">
                    “{tooBig}” is larger than 8MB and was not attached.
                </p>
            )}

            {files.length > 0 && (
                <div className="mt-[9px] flex flex-col gap-[6px]">
                    {files.map((f) => (
                        <div key={f.localId} className="flex items-center gap-[9px] rounded-[10px] border border-[#eceaf6] bg-[#fafaff] px-[10px] py-[7px]">
                            <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[7px] bg-[#eeecfe] text-[#5b4fe9]">
                                {f.file.type.startsWith("image/") ? <ImageIcon size={13} /> : <FileText size={13} />}
                            </span>
                            <span className="min-w-0 flex-1">
                                <span className="block truncate text-[12.5px] font-semibold text-[#161d29]">{f.file.name}</span>
                                <span className="block text-[11px] text-[#8a91a0]">{prettySize(f.file.size)}</span>
                            </span>
                            <button
                                type="button"
                                aria-label={`Remove ${f.file.name}`}
                                onClick={() => onChange(files.filter((x) => x.localId !== f.localId))}
                                className="flex h-[26px] w-[26px] shrink-0 cursor-pointer items-center justify-center rounded-[7px] text-[#a8aeba] transition-colors hover:bg-[#fdecec] hover:text-[#d23b34]"
                            >
                                <X size={13} />
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
