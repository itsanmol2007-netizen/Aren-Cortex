import { useEffect, useRef, useState } from "react";
import { FileText, X, ZoomIn, ZoomOut } from "lucide-react";
import { getViewUrl } from "@/lib/db/attachments";
import { ATTACHMENT_TYPE_LABEL, type Attachment } from "@/lib/attachments/types";
import { useT } from "../i18n/i18n";

// Opening an attachment used to be `window.open(presignedB2Url)` — a new
// browser tab that reads as leaving AREN entirely (the URL is Backblaze's,
// not ours). This renders the same presigned URL inline instead, as a
// full-viewport overlay of its own, so viewing a file never leaves the
// app's branding.
//
// ── One stage, not two (2026-09-21b)
//
// This used to open inside ModalShell with its own "view fullscreen"
// button as a second step. Anmol: "remove this intermediate half screen
// view, less clicks — clicking on any attachment should directly open it
// in full screen." There is now exactly one view: full viewport, straight
// away. ModalShell is not used here at all any more — Escape/backdrop-
// click/× are handled directly on this overlay instead.
//
// ── Zoom is anchored to the image's own current position, never the cursor
//
// The first version centered zoom on wherever the mouse/pinch happened to
// be, which drifted the image toward a corner on repeated scrolling — the
// transform was `scale(s) translate(x,y)`, which scales the pan offset
// itself on every zoom step, compounding error each time. Anmol: "always
// zoom it from center, like scale it from center, and then by left click
// of mouse you can drag it around." Fixed two ways: the transform order is
// `translate(x,y) scale(s)` (pan happens in screen pixels, outside the
// scale, so it is never itself scaled), and every zoom control just
// changes `scale` — nothing here ever reads a cursor or touch position to
// decide where to center a zoom. Panning is the separate, explicit
// left-click/touch drag it was asked to be.
//
// ── The skeleton doesn't flash on a fast load
//
// `showSkeleton` only flips on after a short delay (`SKELETON_DELAY_MS`)
// if the media is STILL not loaded by then — a normal load never has time
// to trigger it.

type Props = {
    attachment: Attachment;
    onClose: () => void;
};

interface ZoomState {
    scale: number;
    panX: number;
    panY: number;
}

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const DOUBLE_CLICK_SCALE = 2.5;
const SKELETON_DELAY_MS = 300;
const FIT: ZoomState = { scale: MIN_SCALE, panX: 0, panY: 0 };

export function AttachmentPreviewModal({ attachment, onClose }: Props) {
    const t = useT();
    const [url, setUrl] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [mediaLoaded, setMediaLoaded] = useState(false);
    const [showSkeleton, setShowSkeleton] = useState(false);
    const [zoom, setZoom] = useState<ZoomState>(FIT);
    const [isTransitioning, setIsTransitioning] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
    const imgRef = useRef<HTMLImageElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const lastTapRef = useRef<number>(0);
    const lastTouchDistanceRef = useRef<number>(0);

    useEffect(() => {
        let cancelled = false;
        setUrl(null);
        setError(null);
        getViewUrl(attachment.storagePath)
            .then((u) => { if (!cancelled) setUrl(u); })
            .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : t("attachViewFailed")); });
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [attachment.storagePath]);

    useEffect(() => {
        setZoom(FIT);
        setMediaLoaded(false);
    }, [attachment.storagePath]);

    useEffect(() => {
        if (mediaLoaded || error) { setShowSkeleton(false); return; }
        const tmr = window.setTimeout(() => setShowSkeleton(true), SKELETON_DELAY_MS);
        return () => window.clearTimeout(tmr);
    }, [mediaLoaded, error, attachment.storagePath]);

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                onClose();
            } else if (e.key === "+" || e.key === "=") {
                e.preventDefault();
                zoomBy(0.4);
            } else if (e.key === "-" || e.key === "_") {
                e.preventDefault();
                zoomBy(-0.4);
            } else if (e.key === "0") {
                e.preventDefault();
                resetZoom();
            } else if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
                e.preventDefault();
                const step = 30;
                setZoom((z) => {
                    if (z.scale <= MIN_SCALE) return z;
                    if (e.key === "ArrowLeft") return clampPan({ ...z, panX: z.panX + step });
                    if (e.key === "ArrowRight") return clampPan({ ...z, panX: z.panX - step });
                    if (e.key === "ArrowUp") return clampPan({ ...z, panY: z.panY + step });
                    return clampPan({ ...z, panY: z.panY - step });
                });
            }
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [onClose]);

    const resetZoom = () => {
        setIsTransitioning(true);
        setZoom(FIT);
        window.setTimeout(() => setIsTransitioning(false), 150);
    };

    /** The one zoom primitive everything else calls — see header note on
     *  why this only ever changes `scale`, never a cursor-derived pan. */
    const zoomBy = (delta: number) => {
        setZoom((z) => clampPan({ ...z, scale: Math.max(MIN_SCALE, Math.min(MAX_SCALE, z.scale + delta)) }));
    };

    const zoomByFactor = (factor: number) => {
        setZoom((z) => clampPan({ ...z, scale: Math.max(MIN_SCALE, Math.min(MAX_SCALE, z.scale * factor)) }));
    };

    const toggleZoom = () => {
        if (zoom.scale > MIN_SCALE + 0.1) resetZoom();
        else setZoom(clampPan({ scale: DOUBLE_CLICK_SCALE, panX: 0, panY: 0 }));
    };

    const getTouchDistance = (touch1: React.Touch, touch2: React.Touch): number => {
        const dx = touch1.clientX - touch2.clientX;
        const dy = touch1.clientY - touch2.clientY;
        return Math.sqrt(dx * dx + dy * dy);
    };

    /** Bounds panning to what the current zoom level can actually show —
     *  see the Cortex copy's identical function for the full reasoning on
     *  why this derives fit-size from natural dimensions rather than
     *  reading the already-transformed element's own bounding rect. */
    const clampPan = (state: ZoomState): ZoomState => {
        const img = imgRef.current;
        const container = containerRef.current;
        if (!img || !container) return state;
        const naturalW = img.naturalWidth || img.width;
        const naturalH = img.naturalHeight || img.height;
        if (!naturalW || !naturalH) return state;

        const containerRect = container.getBoundingClientRect();
        const containerAspect = containerRect.width / containerRect.height;
        const imgAspect = naturalW / naturalH;

        const fitWidth = imgAspect > containerAspect ? containerRect.width : containerRect.height * imgAspect;
        const fitHeight = imgAspect > containerAspect ? containerRect.width / imgAspect : containerRect.height;

        const scaledWidth = fitWidth * state.scale;
        const scaledHeight = fitHeight * state.scale;

        const maxPanX = Math.max(0, (scaledWidth - containerRect.width) / 2);
        const maxPanY = Math.max(0, (scaledHeight - containerRect.height) / 2);

        return {
            ...state,
            panX: Math.max(-maxPanX, Math.min(maxPanX, state.panX)),
            panY: Math.max(-maxPanY, Math.min(maxPanY, state.panY)),
        };
    };

    const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
        e.preventDefault();
        zoomBy(e.deltaY > 0 ? -0.25 : 0.25);
    };

    const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
        if (e.touches.length === 2) {
            lastTouchDistanceRef.current = getTouchDistance(e.touches[0], e.touches[1]);
        } else if (e.touches.length === 1) {
            const now = Date.now();
            const isDoubleTap = now - lastTapRef.current < 300;
            lastTapRef.current = now;
            if (isDoubleTap) {
                toggleZoom();
            } else {
                setDragStart({ x: e.touches[0].clientX - zoom.panX, y: e.touches[0].clientY - zoom.panY });
            }
        }
    };

    const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
        if (e.touches.length === 2) {
            const distance = getTouchDistance(e.touches[0], e.touches[1]);
            if (lastTouchDistanceRef.current > 0) {
                zoomByFactor(distance / lastTouchDistanceRef.current);
            }
            lastTouchDistanceRef.current = distance;
        } else if (e.touches.length === 1 && dragStart && zoom.scale > MIN_SCALE) {
            setZoom((z) => clampPan({
                ...z,
                panX: e.touches[0].clientX - dragStart.x,
                panY: e.touches[0].clientY - dragStart.y,
            }));
        }
    };

    const handleTouchEnd = () => {
        setDragStart(null);
        lastTouchDistanceRef.current = 0;
    };

    const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
        if (zoom.scale <= MIN_SCALE) return;
        setIsDragging(true);
        setDragStart({ x: e.clientX - zoom.panX, y: e.clientY - zoom.panY });
    };

    const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!isDragging || !dragStart) return;
        setZoom((z) => clampPan({ ...z, panX: e.clientX - dragStart.x, panY: e.clientY - dragStart.y }));
    };

    const handleMouseUp = () => {
        setIsDragging(false);
        setDragStart(null);
    };

    const isImage = attachment.mimeType?.startsWith("image/");
    const isPdf = attachment.mimeType === "application/pdf";
    const label = attachment.attachmentType ? ATTACHMENT_TYPE_LABEL[attachment.attachmentType] : "Attachment";

    return (
        <div
            className="fixed inset-0 z-[10000] flex flex-col"
            style={{
                background: "radial-gradient(1100px 520px at 50% 118%, rgba(244,114,182,0.10), transparent 62%), radial-gradient(900px 480px at 50% -14%, rgba(124,92,240,0.10), transparent 60%), rgba(15,18,32,0.94)",
            }}
            onClick={onClose}
            role="dialog"
            aria-modal="true"
            aria-label={label}
        >
            <div className="flex-none px-6 pt-[18px] pr-[72px]" onClick={(e) => e.stopPropagation()}>
                <span className="inline-block rounded-full bg-white/10 px-3 py-[5px] text-[12.5px] font-bold text-white/85">
                    {label}
                </span>
            </div>

            <button
                type="button"
                className="fixed right-5 top-5 z-[10001] flex h-11 w-11 items-center justify-center rounded-[10px] bg-white/15 text-white transition-colors hover:bg-white/25"
                onClick={(e) => { e.stopPropagation(); onClose(); }}
                aria-label={t("attachCloseFullscreen")}
                title={t("attachCloseFullscreen")}
            >
                <X size={20} />
            </button>

            {error ? (
                <p className="m-auto text-[13.5px] font-semibold text-[#ff9d8f]" onClick={(e) => e.stopPropagation()}>{error}</p>
            ) : (
                <div
                    className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden px-6 pb-6 pt-3"
                    ref={containerRef}
                    onClick={(e) => e.stopPropagation()}
                    onWheel={isImage ? handleWheel : undefined}
                    onMouseMove={isImage ? handleMouseMove : undefined}
                    onMouseUp={isImage ? handleMouseUp : undefined}
                    onMouseLeave={isImage ? handleMouseUp : undefined}
                >
                    {showSkeleton && (isImage || isPdf) && (
                        <div className="absolute inset-6 overflow-hidden rounded-xl bg-white/5">
                            <div
                                className="absolute inset-0 animate-[attach-fullscreen-shimmer_2.2s_ease-in-out_infinite]"
                                style={{
                                    background: "linear-gradient(100deg, transparent 30%, rgba(255,255,255,0.09) 50%, transparent 70%)",
                                    backgroundSize: "250% 100%",
                                }}
                            />
                        </div>
                    )}
                    {url && isImage && (
                        <img
                            ref={imgRef}
                            src={url}
                            alt={label}
                            onLoad={() => setMediaLoaded(true)}
                            className="max-h-full max-w-full select-none object-contain"
                            style={{
                                opacity: mediaLoaded ? 1 : 0,
                                transform: `translate(${zoom.panX}px, ${zoom.panY}px) scale(${zoom.scale})`,
                                transition: isTransitioning && !isDragging ? "transform 0.15s ease, opacity 0.2s ease" : "opacity 0.2s ease",
                                cursor: zoom.scale > MIN_SCALE ? (isDragging ? "grabbing" : "grab") : "auto",
                            } as React.CSSProperties}
                            onMouseDown={handleMouseDown}
                            onDoubleClick={toggleZoom}
                            onTouchStart={handleTouchStart}
                            onTouchMove={handleTouchMove}
                            onTouchEnd={handleTouchEnd}
                        />
                    )}
                    {url && isPdf && (
                        <iframe
                            src={url}
                            title={label}
                            onLoad={() => setMediaLoaded(true)}
                            className="h-full w-full rounded-[10px] border-0 bg-white transition-opacity duration-200"
                            style={{ opacity: mediaLoaded ? 1 : 0 }}
                        />
                    )}
                    {url && !isImage && !isPdf && (
                        <div className="flex flex-col items-center gap-3 text-center text-white/70">
                            <FileText size={32} />
                            <a href={url} target="_blank" rel="noopener noreferrer" className="text-[13.5px] font-bold text-[#9cc2ff] underline underline-offset-2">
                                {t("attachPreview")}
                            </a>
                        </div>
                    )}
                </div>
            )}

            {isImage && url && (
                <div className="fixed bottom-5 right-5 z-[10001] flex gap-2" onClick={(e) => e.stopPropagation()}>
                    <button
                        type="button"
                        className="flex h-11 w-11 items-center justify-center rounded-[10px] bg-white/15 text-white transition-colors hover:bg-white/25"
                        onClick={() => zoomBy(0.4)}
                        aria-label={t("attachZoomIn")}
                        title={t("attachZoomIn")}
                    >
                        <ZoomIn size={18} />
                    </button>
                    <button
                        type="button"
                        className="flex h-11 w-11 items-center justify-center rounded-[10px] bg-white/15 text-white transition-colors hover:bg-white/25"
                        onClick={() => zoomBy(-0.4)}
                        aria-label={t("attachZoomOut")}
                        title={t("attachZoomOut")}
                    >
                        <ZoomOut size={18} />
                    </button>
                </div>
            )}
        </div>
    );
}
