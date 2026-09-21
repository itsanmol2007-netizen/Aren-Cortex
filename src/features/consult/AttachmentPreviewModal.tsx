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

import { useEffect, useRef, useState } from "react";
import { FileText, Paperclip, Maximize2, Minimize2, X, ZoomIn, ZoomOut } from "lucide-react";
import { getViewUrl } from "../../lib/db/attachments";
import { ATTACHMENT_TYPE_LABEL, type Attachment } from "../../lib/attachments/types";
import { ChartSurface } from "./ChartSurface";

type Props = {
    attachment: Attachment;
    onClose: () => void;
};

interface ZoomState {
    scale: number;
    panX: number;
    panY: number;
}

export function AttachmentPreviewModal({ attachment, onClose }: Props) {
    const [url, setUrl] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [mediaLoaded, setMediaLoaded] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [zoom, setZoom] = useState<ZoomState>({ scale: 1, panX: 0, panY: 0 });
    const [isTransitioning, setIsTransitioning] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
    const imgRef = useRef<HTMLImageElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    // The fullscreen overlay is a physically separate element from the
    // inline preview frame above (a different size, a different position in
    // the viewport) — zoomAtPoint/clampPan need to measure whichever one is
    // actually on screen, not always the inline frame. See activeRefs().
    const fullscreenContainerRef = useRef<HTMLDivElement>(null);
    const fullscreenImgRef = useRef<HTMLImageElement>(null);
    const lastTapRef = useRef<number>(0);
    const lastTouchDistanceRef = useRef<number>(0);

    useEffect(() => {
        let cancelled = false;
        getViewUrl(attachment.storagePath)
            .then((u) => { if (!cancelled) setUrl(u); })
            .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "Could not open this attachment"); });
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [attachment.storagePath]);

    // Reset zoom/pan/fullscreen when attachment changes
    useEffect(() => {
        setZoom({ scale: 1, panX: 0, panY: 0 });
        setIsFullscreen(false);
        setMediaLoaded(false);
    }, [attachment.storagePath]);

    // Escape in fullscreen closes fullscreen, not the modal
    useEffect(() => {
        if (!isFullscreen) return;
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                e.stopPropagation();
                setIsFullscreen(false);
                setZoom({ scale: 1, panX: 0, panY: 0 });
            } else if (e.key === "+" || e.key === "=") {
                e.preventDefault();
                zoomRelative(0.1);
            } else if (e.key === "-" || e.key === "_") {
                e.preventDefault();
                zoomRelative(-0.1);
            } else if (e.key === "0") {
                e.preventDefault();
                resetZoom();
            } else if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
                e.preventDefault();
                const step = 20;
                const offset = e.key === "ArrowLeft" ? step : e.key === "ArrowRight" ? -step : e.key === "ArrowUp" ? step : -step;
                if (["ArrowLeft", "ArrowRight"].includes(e.key)) {
                    setZoom(z => ({ ...z, panX: z.panX + offset }));
                } else {
                    setZoom(z => ({ ...z, panY: z.panY + offset }));
                }
            }
        };
        window.addEventListener("keydown", onKeyDown, true);
        return () => window.removeEventListener("keydown", onKeyDown, true);
    }, [isFullscreen]);

    const resetZoom = () => {
        setIsTransitioning(true);
        setZoom({ scale: 1, panX: 0, panY: 0 });
        setTimeout(() => setIsTransitioning(false), 150);
    };

    const zoomRelative = (delta: number) => {
        setZoom(z => {
            const newScale = Math.max(1, Math.min(4, z.scale + delta));
            return { ...z, scale: newScale };
        });
    };

    // Which pair of refs is actually visible right now — the fullscreen
    // overlay and the inline preview are two different DOM elements at two
    // different sizes, not the same box resized.
    const activeContainerEl = () => (isFullscreen ? fullscreenContainerRef.current : containerRef.current);
    const activeImgEl = () => (isFullscreen ? fullscreenImgRef.current : imgRef.current);

    const zoomAtPoint = (centerX: number, centerY: number, factor: number) => {
        const container = activeContainerEl();
        if (!container) return;
        const rect = container.getBoundingClientRect();
        const relX = centerX - rect.left;
        const relY = centerY - rect.top;

        setZoom(z => {
            const newScale = Math.max(1, Math.min(4, z.scale * factor));
            const scaleDiff = newScale - z.scale;
            const newPanX = z.panX - (relX * scaleDiff) / newScale;
            const newPanY = z.panY - (relY * scaleDiff) / newScale;
            return clampPan({ scale: newScale, panX: newPanX, panY: newPanY });
        });
    };

    const getTouchDistance = (touch1: React.Touch, touch2: React.Touch): number => {
        const dx = touch1.clientX - touch2.clientX;
        const dy = touch1.clientY - touch2.clientY;
        return Math.sqrt(dx * dx + dy * dy);
    };

    const getTouchMidpoint = (touch1: React.Touch, touch2: React.Touch): { x: number; y: number } => ({
        x: (touch1.clientX + touch2.clientX) / 2,
        y: (touch1.clientY + touch2.clientY) / 2,
    });

    const clampPan = (state: ZoomState): ZoomState => {
        const img = activeImgEl();
        const container = activeContainerEl();
        if (!img || !container) return state;
        const containerRect = container.getBoundingClientRect();
        const containerWidth = containerRect.width;
        const containerHeight = containerRect.height;
        const imgWidth = img.naturalWidth || img.width;
        const imgHeight = img.naturalHeight || img.height;
        const scaledWidth = imgWidth * state.scale;
        const scaledHeight = imgHeight * state.scale;

        const maxPanX = Math.max(0, (scaledWidth - containerWidth) / 2 / state.scale);
        const maxPanY = Math.max(0, (scaledHeight - containerHeight) / 2 / state.scale);

        return {
            ...state,
            panX: Math.max(-maxPanX, Math.min(maxPanX, state.panX)),
            panY: Math.max(-maxPanY, Math.min(maxPanY, state.panY)),
        };
    };

    const handleImageWheel = (e: React.WheelEvent<HTMLDivElement>) => {
        if (!isFullscreen) return;
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        zoomAtPoint(e.clientX, e.clientY, 1 + delta);
    };

    const handleImageTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
        if (e.touches.length === 2) {
            lastTouchDistanceRef.current = getTouchDistance(e.touches[0], e.touches[1]);
        } else if (e.touches.length === 1) {
            const now = Date.now();
            const isDoubleClick = now - lastTapRef.current < 300;
            lastTapRef.current = now;
            if (isDoubleClick) {
                const midpoint = { x: e.touches[0].clientX, y: e.touches[0].clientY };
                if (zoom.scale > 1.2) {
                    resetZoom();
                } else {
                    setZoom(z => {
                        const newScale = 2.5;
                        const rect = containerRef.current?.getBoundingClientRect();
                        if (!rect) return z;
                        const relX = midpoint.x - rect.left;
                        const relY = midpoint.y - rect.top;
                        const scaleDiff = newScale - z.scale;
                        return clampPan({
                            scale: newScale,
                            panX: z.panX - (relX * scaleDiff) / newScale,
                            panY: z.panY - (relY * scaleDiff) / newScale,
                        });
                    });
                }
            } else {
                setDragStart({ x: e.touches[0].clientX - zoom.panX, y: e.touches[0].clientY - zoom.panY });
            }
        }
    };

    const handleImageTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
        if (e.touches.length === 2) {
            const distance = getTouchDistance(e.touches[0], e.touches[1]);
            const factor = distance / lastTouchDistanceRef.current;
            const midpoint = getTouchMidpoint(e.touches[0], e.touches[1]);
            zoomAtPoint(midpoint.x, midpoint.y, factor);
            lastTouchDistanceRef.current = distance;
        } else if (e.touches.length === 1 && dragStart && zoom.scale > 1) {
            setZoom(z => clampPan({
                ...z,
                panX: e.touches[0].clientX - dragStart.x,
                panY: e.touches[0].clientY - dragStart.y,
            }));
        }
    };

    const handleImageTouchEnd = () => {
        setDragStart(null);
    };

    const handleImageMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
        if (zoom.scale <= 1) return;
        setIsDragging(true);
        setDragStart({ x: e.clientX - zoom.panX, y: e.clientY - zoom.panY });
    };

    const handleImageMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!isDragging || !dragStart) return;
        setZoom(z => clampPan({
            ...z,
            panX: e.clientX - dragStart.x,
            panY: e.clientY - dragStart.y,
        }));
    };

    const handleImageMouseUp = () => {
        setIsDragging(false);
        setDragStart(null);
    };

    const handleImageDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (zoom.scale > 1.2) {
            resetZoom();
        } else {
            zoomAtPoint(e.clientX, e.clientY, 2.5);
        }
    };

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
        <>
            <ChartSurface title={label} eyebrow="Attachment" icon={<Paperclip size={15} />} expanded onClose={onClose} maxWidth={640} preventDismiss={isFullscreen}>
                <div className="cs-attach-preview">
                    {error ? (
                        <p className="cs-attach-error">{error}</p>
                    ) : (
                        <div
                            className="cs-attach-preview-frame"
                            ref={containerRef}
                            style={{
                                aspectRatio: showSkeleton || isImage || isPdf ? aspect : undefined,
                                maxWidth: aspect >= 1 ? "100%" : `calc(60vh * ${aspect})`,
                                position: "relative",
                                cursor: isFullscreen && zoom.scale > 1 ? (isDragging ? "grabbing" : "grab") : "auto",
                            }}
                            onWheel={handleImageWheel}
                            onMouseMove={handleImageMouseMove}
                            onMouseUp={handleImageMouseUp}
                            onMouseLeave={handleImageMouseUp}
                        >
                            {showSkeleton && <div className="cs-attach-preview-skel" />}
                            {url && isImage && (
                                <div style={{ position: "relative", width: "100%", height: "100%" }}>
                                    <img
                                        ref={imgRef}
                                        src={url}
                                        alt={label}
                                        onLoad={() => setMediaLoaded(true)}
                                        className="cs-attach-preview-img"
                                        style={{
                                            opacity: mediaLoaded ? 1 : 0,
                                            transform: `scale(${zoom.scale}) translate(${zoom.panX}px, ${zoom.panY}px)`,
                                            transition: isTransitioning && !isDragging ? "transform 0.15s ease" : "none",
                                        }}
                                        onMouseDown={handleImageMouseDown}
                                        onDoubleClick={handleImageDoubleClick}
                                        onTouchStart={handleImageTouchStart}
                                        onTouchMove={handleImageTouchMove}
                                        onTouchEnd={handleImageTouchEnd}
                                    />
                                    {mediaLoaded && (
                                        <button
                                            type="button"
                                            className="cs-attach-preview-fullscreen-btn"
                                            onClick={() => {
                                                setIsFullscreen(!isFullscreen);
                                                if (isFullscreen) {
                                                    resetZoom();
                                                }
                                            }}
                                            aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
                                            title={isFullscreen ? "Exit fullscreen" : "View fullscreen"}
                                        >
                                            {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
                                        </button>
                                    )}
                                </div>
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

            {isFullscreen && url && isImage && (
                <div
                    className="cs-attach-fullscreen-overlay"
                    onClick={() => {
                        setIsFullscreen(false);
                        setZoom({ scale: 1, panX: 0, panY: 0 });
                    }}
                >
                    <div
                        className="cs-attach-fullscreen-container"
                        ref={fullscreenContainerRef}
                        onClick={(e) => e.stopPropagation()}
                        onWheel={handleImageWheel}
                        onMouseMove={handleImageMouseMove}
                        onMouseUp={handleImageMouseUp}
                        onMouseLeave={handleImageMouseUp}
                    >
                        <img
                            ref={fullscreenImgRef}
                            src={url}
                            alt={label}
                            className="cs-attach-fullscreen-img"
                            style={{
                                transform: `scale(${zoom.scale}) translate(${zoom.panX}px, ${zoom.panY}px)`,
                                transition: isTransitioning && !isDragging ? "transform 0.15s ease" : "none",
                                cursor: zoom.scale > 1 ? (isDragging ? "grabbing" : "grab") : "auto",
                            }}
                            onMouseDown={handleImageMouseDown}
                            onDoubleClick={handleImageDoubleClick}
                            onTouchStart={handleImageTouchStart}
                            onTouchMove={handleImageTouchMove}
                            onTouchEnd={handleImageTouchEnd}
                        />
                        <button
                            type="button"
                            className="cs-attach-fullscreen-close"
                            onClick={() => {
                                setIsFullscreen(false);
                                setZoom({ scale: 1, panX: 0, panY: 0 });
                            }}
                            aria-label="Close fullscreen"
                        >
                            <X size={20} />
                        </button>
                        <button
                            type="button"
                            className="cs-attach-fullscreen-zoom-in"
                            onClick={() => zoomRelative(0.25)}
                            aria-label="Zoom in"
                        >
                            <ZoomIn size={18} />
                        </button>
                        <button
                            type="button"
                            className="cs-attach-fullscreen-zoom-out"
                            onClick={() => zoomRelative(-0.25)}
                            aria-label="Zoom out"
                        >
                            <ZoomOut size={18} />
                        </button>
                    </div>
                </div>
            )}
        </>
    );
}
