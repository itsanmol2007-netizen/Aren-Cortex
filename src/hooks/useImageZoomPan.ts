import React, { useState, useRef, useEffect } from "react";

export function useImageZoomPan(dependency: any) {
    const [scale, setScale] = useState(1);
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);

    const containerRef = useRef<HTMLDivElement>(null);
    const imgRef = useRef<HTMLImageElement>(null);

    // Keep refs of current state to use inside event listeners without re-binding
    const stateRef = useRef({ scale, position, isDragging });
    useEffect(() => {
        stateRef.current = { scale, position, isDragging };
    }, [scale, position, isDragging]);

    useEffect(() => {
        setScale(1);
        setPosition({ x: 0, y: 0 });
        setIsDragging(false);
    }, [dependency]);

    const clampPosition = (newScale: number, newX: number, newY: number, containerEl: HTMLElement, imgEl: HTMLImageElement) => {
        if (newScale <= 1) return { x: 0, y: 0 };
        
        const container = containerEl.getBoundingClientRect();
        const naturalWidth = imgEl.naturalWidth;
        const naturalHeight = imgEl.naturalHeight;
        
        if (!naturalWidth || !naturalHeight) return { x: newX, y: newY };
        
        const fitRatio = Math.min(container.width / naturalWidth, container.height / naturalHeight);
        const renderedWidth = naturalWidth * fitRatio;
        const renderedHeight = naturalHeight * fitRatio;
        
        const scaledWidth = renderedWidth * newScale;
        const scaledHeight = renderedHeight * newScale;
        
        const maxX = Math.max(0, (scaledWidth - container.width) / 2);
        const maxY = Math.max(0, (scaledHeight - container.height) / 2);
        
        return {
            x: Math.max(-maxX, Math.min(maxX, newX)),
            y: Math.max(-maxY, Math.min(maxY, newY))
        };
    };

    const dragRef = useRef({ isDragging: false, startX: 0, startY: 0, initialPosX: 0, initialPosY: 0, lastTouchDist: 0 });

    useEffect(() => {
        const containerEl = containerRef.current;
        const imgEl = imgRef.current;
        if (!containerEl || !imgEl) return;

        const handleWheel = (e: WheelEvent) => {
            e.preventDefault();
            const { scale, position } = stateRef.current;
            const container = containerEl.getBoundingClientRect();
            
            const pointerX = e.clientX - (container.left + container.width / 2);
            const pointerY = e.clientY - (container.top + container.height / 2);
            
            const multiplier = Math.exp(e.deltaY * -0.005);
            let newScale = scale * multiplier;
            if (newScale < 1) newScale = 1;
            if (newScale > 5) newScale = 5;
            
            if (newScale === scale) return;
            
            const ratio = newScale / scale;
            const newX = pointerX - (pointerX - position.x) * ratio;
            const newY = pointerY - (pointerY - position.y) * ratio;
            
            const clamped = clampPosition(newScale, newX, newY, containerEl, imgEl);
            setScale(newScale);
            setPosition(clamped);
        };

        const handlePointerDown = (e: MouseEvent | TouchEvent) => {
            if (stateRef.current.scale <= 1) return;
            const clientX = 'touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
            const clientY = 'touches' in e ? e.touches[0].clientY : (e as MouseEvent).clientY;
            
            dragRef.current = {
                ...dragRef.current,
                isDragging: true,
                startX: clientX,
                startY: clientY,
                initialPosX: stateRef.current.position.x,
                initialPosY: stateRef.current.position.y
            };
            setIsDragging(true);
        };

        const handlePointerMove = (e: MouseEvent | TouchEvent) => {
            if ('touches' in e && e.touches.length === 2) {
                e.preventDefault(); // Stop page pinch zoom
                const dist = Math.hypot(
                    e.touches[0].clientX - e.touches[1].clientX,
                    e.touches[0].clientY - e.touches[1].clientY
                );
                
                if (dragRef.current.lastTouchDist > 0) {
                    const { scale, position } = stateRef.current;
                    const zoomDelta = dist / dragRef.current.lastTouchDist;
                    
                    const centerX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
                    const centerY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
                    
                    const container = containerEl.getBoundingClientRect();
                    const pointerX = centerX - (container.left + container.width / 2);
                    const pointerY = centerY - (container.top + container.height / 2);
                    
                    let newScale = scale * zoomDelta;
                    if (newScale < 1) newScale = 1;
                    if (newScale > 5) newScale = 5;
                    
                    if (newScale !== scale) {
                        const ratio = newScale / scale;
                        const newX = pointerX - (pointerX - position.x) * ratio;
                        const newY = pointerY - (pointerY - position.y) * ratio;
                        
                        const clamped = clampPosition(newScale, newX, newY, containerEl, imgEl);
                        setScale(newScale);
                        setPosition(clamped);
                    }
                }
                dragRef.current.lastTouchDist = dist;
                return;
            }

            if (!dragRef.current.isDragging) return;
            e.preventDefault(); // Stop scroll while panning
            const clientX = 'touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
            const clientY = 'touches' in e ? e.touches[0].clientY : (e as MouseEvent).clientY;
            
            const dx = clientX - dragRef.current.startX;
            const dy = clientY - dragRef.current.startY;
            
            const newX = dragRef.current.initialPosX + dx;
            const newY = dragRef.current.initialPosY + dy;
            
            const clamped = clampPosition(stateRef.current.scale, newX, newY, containerEl, imgEl);
            setPosition(clamped);
        };

        const handlePointerUp = () => {
            dragRef.current.isDragging = false;
            dragRef.current.lastTouchDist = 0;
            setIsDragging(false);
        };

        const handleTouchStart = (e: TouchEvent) => {
            if (e.touches.length === 1) {
                handlePointerDown(e);
            } else if (e.touches.length === 2) {
                dragRef.current.isDragging = false;
                setIsDragging(false);
                dragRef.current.lastTouchDist = Math.hypot(
                    e.touches[0].clientX - e.touches[1].clientX,
                    e.touches[0].clientY - e.touches[1].clientY
                );
            }
        };

        // Attach listeners directly to avoid React's passive event issues
        containerEl.addEventListener("wheel", handleWheel, { passive: false });
        containerEl.addEventListener("mousedown", handlePointerDown);
        window.addEventListener("mousemove", handlePointerMove, { passive: false });
        window.addEventListener("mouseup", handlePointerUp);
        
        containerEl.addEventListener("touchstart", handleTouchStart, { passive: false });
        containerEl.addEventListener("touchmove", handlePointerMove, { passive: false });
        containerEl.addEventListener("touchend", handlePointerUp);
        containerEl.addEventListener("touchcancel", handlePointerUp);

        return () => {
            containerEl.removeEventListener("wheel", handleWheel);
            containerEl.removeEventListener("mousedown", handlePointerDown);
            window.removeEventListener("mousemove", handlePointerMove);
            window.removeEventListener("mouseup", handlePointerUp);
            
            containerEl.removeEventListener("touchstart", handleTouchStart);
            containerEl.removeEventListener("touchmove", handlePointerMove);
            containerEl.removeEventListener("touchend", handlePointerUp);
            containerEl.removeEventListener("touchcancel", handlePointerUp);
        };
    }, []);

    const zoomIn = () => {
        setScale(prev => {
            let newScale = prev + 0.5;
            if (newScale > 5) newScale = 5;
            return newScale;
        });
        setTimeout(() => {
            const containerEl = containerRef.current;
            const imgEl = imgRef.current;
            if (containerEl && imgEl) {
                setPosition(prev => clampPosition(stateRef.current.scale, prev.x, prev.y, containerEl, imgEl));
            }
        }, 0);
    };

    const zoomOut = () => {
        setScale(prev => {
            let newScale = prev - 0.5;
            if (newScale < 1) newScale = 1;
            return newScale;
        });
        setTimeout(() => {
            const containerEl = containerRef.current;
            const imgEl = imgRef.current;
            if (containerEl && imgEl) {
                setPosition(prev => clampPosition(stateRef.current.scale, prev.x, prev.y, containerEl, imgEl));
            }
        }, 0);
    };

    const resetZoom = () => {
        setScale(1);
        setPosition({ x: 0, y: 0 });
    };

    const handleDoubleClick = (e: React.MouseEvent | React.TouchEvent) => {
        const containerEl = containerRef.current;
        const imgEl = imgRef.current;
        if (!containerEl || !imgEl) return;

        if (stateRef.current.scale > 1) {
            resetZoom();
        } else {
            const container = containerEl.getBoundingClientRect();
            let clientX, clientY;
            if ('touches' in e) {
                clientX = e.touches[0].clientX;
                clientY = e.touches[0].clientY;
            } else {
                clientX = (e as React.MouseEvent).clientX;
                clientY = (e as React.MouseEvent).clientY;
            }
            
            const pointerX = clientX - (container.left + container.width / 2);
            const pointerY = clientY - (container.top + container.height / 2);
            
            const newScale = 2.5;
            const ratio = newScale / 1;
            const newX = pointerX - (pointerX - 0) * ratio;
            const newY = pointerY - (pointerY - 0) * ratio;
            
            const clamped = clampPosition(newScale, newX, newY, containerEl, imgEl);
            setScale(newScale);
            setPosition(clamped);
        }
    };

    return {
        scale,
        position,
        isDragging,
        containerRef,
        imgRef,
        zoomIn,
        zoomOut,
        resetZoom,
        handleDoubleClick
    };
}
