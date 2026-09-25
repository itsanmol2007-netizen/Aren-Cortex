import re

# Append CSS
with open('src/styles/consult.css', 'a', encoding='utf-8') as f:
    f.write('''
.cs-attach-zoom-controls {
    position: absolute;
    bottom: 16px;
    right: 16px;
    z-index: 10;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.9);
    border: 1px solid var(--cs-line);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
    backdrop-filter: blur(4px);
}

.cs-attach-zoom-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: 6px;
    color: var(--cs-faint);
    background: transparent;
    border: none;
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
}

.cs-attach-zoom-btn:hover {
    background: var(--cs-page);
    color: var(--cs-ink);
}
''')

# Update Modal
with open('src/features/consult/AttachmentPreviewModal.tsx', 'r', encoding='utf-8') as f:
    c = f.read()

# Imports
if 'useImageZoomPan' not in c:
    c = c.replace('import { FileText, Paperclip } from "lucide-react";', 'import { FileText, Paperclip, ZoomIn, ZoomOut, Maximize } from "lucide-react";\nimport { useImageZoomPan } from "../../hooks/useImageZoomPan";')

# Hook call
hook_call = """
    const isImage = attachment.mimeType?.startsWith("image/");
    const isPdf = attachment.mimeType === "application/pdf";
    const label = attachment.attachmentType ? ATTACHMENT_TYPE_LABEL[attachment.attachmentType] : "Attachment";

    const zoomPan = useImageZoomPan(attachment.storagePath);
"""
c = c.replace('    const isImage = attachment.mimeType?.startsWith("image/");\n    const isPdf = attachment.mimeType === "application/pdf";\n    const label = attachment.attachmentType ? ATTACHMENT_TYPE_LABEL[attachment.attachmentType] : "Attachment";', hook_call)


# Replace `.cs-attach-preview` container
c = c.replace('<div className="cs-attach-preview">', '<div className="cs-attach-preview" ref={isImage ? zoomPan.containerRef : undefined} onDoubleClick={isImage ? zoomPan.handleDoubleClick : undefined} style={{ cursor: isImage && zoomPan.scale > 1 ? (zoomPan.isDragging ? "grabbing" : "grab") : "default" }}>')

# Update img
img_start = '                                className="cs-attach-preview-img"\n                                style={{ opacity: mediaLoaded ? 1 : 0 }}'
img_replace = '                                className="cs-attach-preview-img"\n                                ref={zoomPan.imgRef}\n                                style={{ opacity: mediaLoaded ? 1 : 0, transform: `translate(${zoomPan.position.x}px, ${zoomPan.position.y}px) scale(${zoomPan.scale})`, transition: zoomPan.isDragging ? "none" : "transform 0.15s ease-out, opacity 0.2s" }}'
c = c.replace(img_start, img_replace)

# Add buttons
buttons = """
                        {url && isImage && (
                            <div className="cs-attach-zoom-controls">
                                {zoomPan.scale > 1 && (
                                    <button type="button" onClick={zoomPan.resetZoom} title="Reset zoom" className="cs-attach-zoom-btn">
                                        <Maximize size={16} />
                                    </button>
                                )}
                                <button type="button" onClick={zoomPan.zoomOut} title="Zoom out" className="cs-attach-zoom-btn">
                                    <ZoomOut size={18} />
                                </button>
                                <button type="button" onClick={zoomPan.zoomIn} title="Zoom in" className="cs-attach-zoom-btn">
                                    <ZoomIn size={18} />
                                </button>
                            </div>
                        )}
                        {showSkeleton && <div className="cs-attach-preview-skel" />}
"""
c = c.replace('                        {showSkeleton && <div className="cs-attach-preview-skel" />}', buttons)

with open('src/features/consult/AttachmentPreviewModal.tsx', 'w', encoding='utf-8') as f:
    f.write(c)
