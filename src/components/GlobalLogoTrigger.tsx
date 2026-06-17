import { useEffect, useRef, useState } from "react";
import logo from "../assets/aren-logo.png";

type Props = {
    logoRef: React.RefObject<HTMLDivElement>;
    onOpenSidebar: () => void;
    sidebarOpen: boolean;
    active: boolean;
};

export function GlobalLogoTrigger({ logoRef, onOpenSidebar, sidebarOpen, active }: Props) {
    const [rect, setRect] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
    const pausedRef = useRef(false);

    useEffect(() => {
        const measure = () => {
            if (pausedRef.current) return;
            const el = logoRef.current;
            if (!el) {
                setRect(null);
                return;
            }
            const r = el.getBoundingClientRect();
            setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
        };

        measure();
        window.addEventListener("resize", measure);
        window.addEventListener("scroll", measure, true);
        const interval = window.setInterval(measure, 400);

        return () => {
            window.removeEventListener("resize", measure);
            window.removeEventListener("scroll", measure, true);
            window.clearInterval(interval);
        };
    }, [logoRef]);

    useEffect(() => {
        if (sidebarOpen) {
            pausedRef.current = true;
            return;
        }
        const timeout = window.setTimeout(() => {
            pausedRef.current = false;
        }, 320);
        return () => window.clearTimeout(timeout);
    }, [sidebarOpen]);

    if (!rect || sidebarOpen || !active) return null;

    return (
        <>
            <button
                type="button"
                onClick={onOpenSidebar}
                aria-label="Open navigation menu"
                title="Open menu"
                style={{
                    position: "fixed",
                    top: rect.top,
                    left: rect.left,
                    width: rect.width,
                    height: rect.height,
                    zIndex: 9998,
                    display: "grid",
                    placeItems: "center",
                    background: "linear-gradient(135deg, #a855f7 0%, #6366f1 100%)",
                    border: "none",
                    borderRadius: 9,
                    boxShadow: "0 2px 10px rgba(168, 85, 247, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.15)",
                    padding: 0,
                    margin: 0,
                    cursor: "pointer",
                    overflow: "hidden",
                    pointerEvents: "auto",
                    transition: "none",
                }}
            >
                <img src={logo} alt="AREN" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
            </button>

            <div
                aria-hidden="true"
                style={{
                    position: "fixed",
                    top: rect.top + rect.height / 2,
                    left: rect.left + rect.width + 10,
                    transform: "translateY(-50%)",
                    zIndex: 9998,
                    pointerEvents: "none",
                    transition: "none",
                }}
            >
                <strong style={{ display: "block", fontSize: 15, fontWeight: 750, color: "#e2e8f0", letterSpacing: "-0.2px" }}>
                    AREN <span style={{ color: "#60a5fa" }}>Cortex</span>
                </strong>
                <small style={{ display: "block", fontSize: 10, fontWeight: 600, color: "#f0ccf7", marginTop: 1 }}>
                    Phase 1 workflow
                </small>
            </div>
        </>
    );
}