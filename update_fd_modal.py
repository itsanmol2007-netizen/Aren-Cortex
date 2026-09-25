import re

with open('src/features/frontdesk/components/AttachmentPreviewModal.tsx', 'r', encoding='utf-8') as f:
    c = f.read()

# Imports
if 'useImageZoomPan' not in c:
    c = c.replace('import { FileText, Paperclip } from "lucide-react";', 'import { FileText, Paperclip, ZoomIn, ZoomOut, Maximize } from "lucide-react";\nimport { useImageZoomPan } from "@/hooks/useImageZoomPan";')

# Hook call
hook_call = """
    const isImage = attachment.mimeType?.startsWith("image/");
    const isPdf = attachment.mimeType === "application/pdf";
    const label = attachment.attachmentType ? ATTACHMENT_TYPE_LABEL[attachment.attachmentType] : "Attachment";

    const zoomPan = useImageZoomPan(attachment.storagePath);
"""
c = c.replace('    const isImage = attachment.mimeType?.startsWith("image/");\n    const isPdf = attachment.mimeType === "application/pdf";\n    const label = attachment.attachmentType ? ATTACHMENT_TYPE_LABEL[attachment.attachmentType] : "Attachment";', hook_call)

# Container ref and styling
container_start = '<div className="flex min-h-[30vh] items-center justify-center overflow-hidden rounded-[12px] border border-[#eef0f5] bg-[#f7f8fb]">'
container_replace = '<div ref={isImage ? zoomPan.containerRef : undefined} onDoubleClick={isImage ? zoomPan.handleDoubleClick : undefined} className={`relative flex min-h-[30vh] items-center justify-center overflow-hidden rounded-[12px] border border-[#eef0f5] bg-[#f7f8fb] ${isImage && zoomPan.scale > 1 ? (zoomPan.isDragging ? "cursor-grabbing" : "cursor-grab") : ""}`}>'
c = c.replace(container_start, container_replace)

# Img ref and styling
img_start = '                                className="h-full w-full object-contain transition-opacity duration-200"\n                                style={{ opacity: mediaLoaded ? 1 : 0 }}'
img_replace = '                                ref={zoomPan.imgRef}\n                                className="h-full w-full object-contain"\n                                style={{ opacity: mediaLoaded ? 1 : 0, transform: `translate(${zoomPan.position.x}px, ${zoomPan.position.y}px) scale(${zoomPan.scale})`, transition: zoomPan.isDragging ? "none" : "transform 0.15s ease-out, opacity 0.2s" }}'
c = c.replace(img_start, img_replace)

# Buttons overlay
buttons = """
                        {url && isImage && (
                            <div className="absolute bottom-4 right-4 z-10 flex items-center gap-[6px] rounded-[8px] border border-[#eef0f5] bg-white/90 p-[4px] shadow-sm backdrop-blur-sm">
                                {zoomPan.scale > 1 && (
                                    <button type="button" onClick={zoomPan.resetZoom} title={t("attachZoomReset")} className="flex h-8 w-8 items-center justify-center rounded-[6px] text-[#5a6472] hover:bg-[#f2f4f8] hover:text-[#161d29]">
                                        <Maximize size={16} />
                                    </button>
                                )}
                                <button type="button" onClick={zoomPan.zoomOut} title={t("attachZoomOut")} className="flex h-8 w-8 items-center justify-center rounded-[6px] text-[#5a6472] hover:bg-[#f2f4f8] hover:text-[#161d29]">
                                    <ZoomOut size={18} />
                                </button>
                                <button type="button" onClick={zoomPan.zoomIn} title={t("attachZoomIn")} className="flex h-8 w-8 items-center justify-center rounded-[6px] text-[#5a6472] hover:bg-[#f2f4f8] hover:text-[#161d29]">
                                    <ZoomIn size={18} />
                                </button>
                            </div>
                        )}
                        {showSkeleton && (
"""
c = c.replace('                        {showSkeleton && (', buttons)

with open('src/features/frontdesk/components/AttachmentPreviewModal.tsx', 'w', encoding='utf-8') as f:
    f.write(c)
