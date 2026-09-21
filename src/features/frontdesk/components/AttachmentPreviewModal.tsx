import { useEffect, useRef, useState } from "react";
import { FileText, Paperclip, Maximize2, Minimize2, X, ZoomIn, ZoomOut } from "lucide-react";
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

interface ZoomState {
    scale: number;
    panX: number;
    panY: number;
}

export function AttachmentPreviewModal({ attachment, onClose }: Props) {
    const t = useT();
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
    // inline preview frame above (different size, different position) —
    // zoomAtPoint/clampPan need to measure whichever one is actually on
    // screen, not always the inline frame. See activeContainerEl/activeImgEl.
    const fullscreenContainerRef = useRef<HTMLDivElement>(null);
    const fullscreenImgRef = useRef<HTMLImageElement>(null);
    const lastTapRef = useRef<number>(0);
    const lastTouchDistanceRef = useRef<number>(0);

    useEffect(() => {
        let cancelled = false;
        getViewUrl(attachment.storagePath)
            .then((u) => { if (!cancelled) setUrl(u); })
            .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : t("attachViewFailed")); });
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
            <ModalShell eyebrow={t("attachEyebrow")} title={label} icon={<Paperclip size={19} strokeWidth={2.2} />} onClose={onClose} maxWidth={740} preventDismiss={isFullscreen}>
                <div className="flex min-h-[30vh] items-center justify-center overflow-hidden rounded-[12px] border border-[#eef0f5] bg-[#f7f8fb]">
                    {error ? (
                        <div className="px-6 py-10 text-center text-[13px] font-medium text-[#d23b34]">{error}</div>
                    ) : (
                        <div
                            className="relative w-full"
                            ref={containerRef}
                            style={{
                                aspectRatio: showSkeleton || isImage || isPdf ? aspect : undefined,
                                maxHeight: "68vh",
                                maxWidth: aspect >= 1 ? "100%" : `calc(68vh * ${aspect})`,
                                margin: "0 auto",
                                cursor: isFullscreen && zoom.scale > 1 ? (isDragging ? "grabbing" : "grab") : "auto",
                            }}
                            onWheel={handleImageWheel}
                            onMouseMove={handleImageMouseMove}
                            onMouseUp={handleImageMouseUp}
                            onMouseLeave={handleImageMouseUp}
                        >
                            {showSkeleton && (
                                <div className="absolute inset-0 animate-pulse rounded-[10px] bg-[linear-gradient(90deg,#eef0f4_25%,#e4e7ee_37%,#eef0f4_63%)]" />
                            )}
                            {url && isImage && (
                                <div style={{ position: "relative", width: "100%", height: "100%" }}>
                                    <img
                                        ref={imgRef}
                                        src={url}
                                        alt={label}
                                        onLoad={() => setMediaLoaded(true)}
                                        className="h-full w-full object-contain transition-opacity duration-200"
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
                                            className="absolute right-2 top-2 z-10 flex h-9 w-9 items-center justify-center rounded-lg bg-white/90 text-[#161d29] transition-colors hover:bg-white"
                                            onClick={() => {
                                                setIsFullscreen(!isFullscreen);
                                                if (isFullscreen) {
                                                    resetZoom();
                                                }
                                            }}
                                            aria-label={isFullscreen ? t("attachExitFullscreen") : t("attachEnterFullscreen")}
                                            title={isFullscreen ? t("attachExitFullscreen") : t("attachEnterFullscreen")}
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

            {isFullscreen && url && isImage && (
                <div
                    className="fixed inset-0 z-[10000] flex items-center justify-center"
                    style={{
                        background: "radial-gradient(1100px 520px at 50% 118%, rgba(244,114,182,0.10), transparent 62%), radial-gradient(900px 480px at 50% -14%, rgba(124,92,240,0.10), transparent 60%), rgba(15,18,32,0.92)",
                    }}
                    onClick={() => {
                        setIsFullscreen(false);
                        setZoom({ scale: 1, panX: 0, panY: 0 });
                    }}
                >
                    <div
                        className="relative h-full w-full flex items-center justify-center overflow-hidden"
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
                            className="max-h-full max-w-full object-contain select-none"
                            style={{
                                transform: `scale(${zoom.scale}) translate(${zoom.panX}px, ${zoom.panY}px)`,
                                transition: isTransitioning && !isDragging ? "transform 0.15s ease" : "none",
                                cursor: zoom.scale > 1 ? (isDragging ? "grabbing" : "grab") : "auto",
                            } as React.CSSProperties}
                            onMouseDown={handleImageMouseDown}
                            onDoubleClick={handleImageDoubleClick}
                            onTouchStart={handleImageTouchStart}
                            onTouchMove={handleImageTouchMove}
                            onTouchEnd={handleImageTouchEnd}
                        />
                        <button
                            type="button"
                            className="fixed right-5 top-5 z-[10001] flex h-11 w-11 items-center justify-center rounded-[10px] bg-white/15 text-white transition-colors hover:bg-white/25"
                            onClick={() => {
                                setIsFullscreen(false);
                                setZoom({ scale: 1, panX: 0, panY: 0 });
                            }}
                            aria-label={t("attachCloseFullscreen")}
                        >
                            <X size={20} />
                        </button>
                        <button
                            type="button"
                            className="fixed bottom-5 right-[70px] z-[10001] flex h-11 w-11 items-center justify-center rounded-[10px] bg-white/15 text-white transition-colors hover:bg-white/25"
                            onClick={() => zoomRelative(0.25)}
                            aria-label={t("attachZoomIn")}
                        >
                            <ZoomIn size={18} />
                        </button>
                        <button
                            type="button"
                            className="fixed bottom-5 right-5 z-[10001] flex h-11 w-11 items-center justify-center rounded-[10px] bg-white/15 text-white transition-colors hover:bg-white/25"
                            onClick={() => zoomRelative(-0.25)}
                            aria-label={t("attachZoomOut")}
                        >
                            <ZoomOut size={18} />
                        </button>
                    </div>
                </div>
            )}
        </>
    );
}
