import { useEffect, useLayoutEffect, useRef } from "react";
import { X } from "lucide-react";
import logo from "../../assets/aren-logo.png";
import { SidebarNav, type SidebarPage } from "./SidebarNav";
import type { Doctor } from "../../types";
import { useOverlayFocus } from "../../hooks/useOverlayFocus";

type SidebarProps = {
    isOpen: boolean;
    onClose: () => void;
    activePage: SidebarPage | null;
    onNavigate: (page: SidebarPage) => void;
    onConsult: () => void;
    doctor: Doctor;
    logoRef: React.RefObject<HTMLDivElement>;
};

export function Sidebar({
    isOpen,
    onClose,
    activePage,
    onNavigate,
    onConsult,
    doctor,
    logoRef,
}: SidebarProps) {
    const panelRef = useRef<HTMLElement>(null);
    const sidebarLogoRef = useRef<HTMLDivElement>(null);

    // Escape to close
    useEffect(() => {
        if (!isOpen) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [isOpen, onClose]);

    // Takes focus on the panel while open, hands it back to whatever opened
    // it (the logo, or the launch trigger) on close — see useOverlayFocus.ts.
    // This drawer previously had Escape but never took focus at all, so a
    // doctor who opened it another way than clicking would land with the
    // keyboard still pointed at the workspace behind it.
    useOverlayFocus(panelRef, isOpen);

    // JS morph: when sidebar opens, measure topbar logo rect,
    // compute the transform delta from sidebar logo position to topbar logo,
    // set it as CSS vars, add class to trigger the animation.
    useLayoutEffect(() => {
        if (!panelRef.current || !sidebarLogoRef.current || !logoRef.current) return;

        if (isOpen) {
            // Measure the topbar logo (where the morph starts)
            const srcRect = logoRef.current.getBoundingClientRect();
            // Measure the sidebar logo (where it will land)
            const dstRect = sidebarLogoRef.current.getBoundingClientRect();

            // Delta: how far the sidebar logo needs to travel FROM topbar logo
            const dx = srcRect.left + srcRect.width / 2 - (dstRect.left + dstRect.width / 2);
            const dy = srcRect.top + srcRect.height / 2 - (dstRect.top + dstRect.height / 2);
            // Scale: topbar logo pill is ~32px, sidebar is ~36px
            const scaleFrom = srcRect.width / dstRect.width;

            panelRef.current.style.setProperty("--morph-dx", `${dx}px`);
            panelRef.current.style.setProperty("--morph-dy", `${dy}px`);
            panelRef.current.style.setProperty("--morph-scale", `${scaleFrom}`);

            // Trigger morph by adding class on next frame (so CSS vars are set first)
            requestAnimationFrame(() => {
                sidebarLogoRef.current?.classList.add("is-morphing");
            });
        } else {
            // Remove morph class when closing so it resets cleanly
            sidebarLogoRef.current?.classList.remove("is-morphing");
        }
    }, [isOpen, logoRef]);

    const doctorInitials = doctor.name
        ? doctor.name.split(" ").filter(Boolean).map((p) => p[0]).join("").slice(0, 2).toUpperCase()
        : "DR";

    const handleNavItemClick = (page: SidebarPage) => {
        onNavigate(page);
        onClose();
    };

    const handleConsultClick = () => {
        onConsult();
        onClose();
    };

    return (
        <>
            {/* Backdrop */}
            <div
                className={`sidebar-backdrop${isOpen ? " is-open" : ""}`}
                onClick={onClose}
                aria-hidden="true"
            />

            <aside
                ref={panelRef}
                tabIndex={-1}
                className={`sidebar-panel cx-kbd-surface${isOpen ? " is-open" : ""}`}
                role="dialog"
                aria-modal="true"
                aria-label="Navigation menu"
            >
                {/* Atmospheric SVG */}
                <svg
                    className="sidebar-atmo"
                    viewBox="0 0 272 900"
                    xmlns="http://www.w3.org/2000/svg"
                    preserveAspectRatio="none"
                    aria-hidden="true"
                >
                    <defs>
                        <radialGradient id="sb-bloom-top" cx="30%" cy="8%" r="55%">
                            <stop offset="0%" stopColor="#a855f7" stopOpacity="0.28" />
                            <stop offset="100%" stopColor="#a855f7" stopOpacity="0" />
                        </radialGradient>
                        <radialGradient id="sb-bloom-mid" cx="75%" cy="45%" r="40%">
                            <stop offset="0%" stopColor="#6366f1" stopOpacity="0.18" />
                            <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
                        </radialGradient>
                        <radialGradient id="sb-bloom-bot" cx="20%" cy="88%" r="45%">
                            <stop offset="0%" stopColor="#1268e8" stopOpacity="0.16" />
                            <stop offset="100%" stopColor="#1268e8" stopOpacity="0" />
                        </radialGradient>
                        <linearGradient id="sb-arc-1" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="#a855f7" stopOpacity="0" />
                            <stop offset="50%" stopColor="#a855f7" stopOpacity="0.35" />
                            <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
                        </linearGradient>
                        <linearGradient id="sb-arc-2" x1="100%" y1="0%" x2="0%" y2="100%">
                            <stop offset="0%" stopColor="#6366f1" stopOpacity="0" />
                            <stop offset="50%" stopColor="#1268e8" stopOpacity="0.28" />
                            <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
                        </linearGradient>
                    </defs>

                    <ellipse cx="70" cy="70" rx="130" ry="110" fill="url(#sb-bloom-top)" />
                    <ellipse cx="210" cy="400" rx="120" ry="160" fill="url(#sb-bloom-mid)" />
                    <ellipse cx="55" cy="800" rx="140" ry="120" fill="url(#sb-bloom-bot)" />

                    <path d="M-10,120 C60,90 140,160 200,110 C240,80 270,130 290,100" fill="none" stroke="url(#sb-arc-1)" strokeWidth="1.2" />
                    <path d="M-10,140 C50,115 120,175 190,130 C230,105 265,148 290,120" fill="none" stroke="url(#sb-arc-1)" strokeWidth="0.8" />
                    <path d="M-10,480 C70,450 150,510 220,470 C255,450 272,480 290,460" fill="none" stroke="url(#sb-arc-2)" strokeWidth="1.0" />

                    {/* Constellation dots */}
                    <circle cx="52" cy="42" r="1.8" fill="rgba(168,85,247,0.75)" />
                    <circle cx="88" cy="28" r="1.4" fill="rgba(168,85,247,0.55)" />
                    <circle cx="120" cy="55" r="1.6" fill="rgba(99,102,241,0.65)" />
                    <circle cx="74" cy="72" r="1.2" fill="rgba(244,114,182,0.55)" />
                    <circle cx="148" cy="38" r="1.5" fill="rgba(99,102,241,0.60)" />
                    <circle cx="105" cy="88" r="1.3" fill="rgba(168,85,247,0.50)" />

                    <line x1="52" y1="42" x2="88" y2="28" stroke="rgba(168,85,247,0.28)" strokeWidth="0.9" />
                    <line x1="88" y1="28" x2="120" y2="55" stroke="rgba(99,102,241,0.24)" strokeWidth="0.9" />
                    <line x1="120" y1="55" x2="148" y2="38" stroke="rgba(99,102,241,0.20)" strokeWidth="0.8" />
                    <line x1="74" y1="72" x2="105" y2="88" stroke="rgba(168,85,247,0.22)" strokeWidth="0.8" />
                    <line x1="120" y1="55" x2="74" y2="72" stroke="rgba(168,85,247,0.18)" strokeWidth="0.7" />

                    <rect x="0" y="63" width="272" height="1" fill="rgba(168,85,247,0.18)" />
                </svg>

                {/* Header */}
                <div className="sidebar-header">
                    {/* This is the logo that morphs in from the topbar logo */}
                    <div ref={sidebarLogoRef} className="sidebar-logo-pill">
                        <img src={logo} alt="AREN Logo" />
                    </div>
                    <div className="sidebar-brand-text">
                        <strong>AREN <span>Cortex</span></strong>
                        <small>Phase 1 workflow</small>
                    </div>
                    <button
                        type="button"
                        className="sidebar-close-btn"
                        onClick={onClose}
                        aria-label="Close navigation"
                    >
                        <X size={13} />
                    </button>
                </div>

                {/* Nav */}
                <div className="sidebar-nav-body">
                    <SidebarNav
                        activePage={activePage}
                        onNavigate={handleNavItemClick}
                        onConsult={handleConsultClick}
                    />
                </div>

                {/* Doctor footer */}
                <div className="sidebar-footer">
                    <div className="sidebar-doctor-pill">
                        <div className="sidebar-doctor-avatar">{doctorInitials}</div>
                        <div className="sidebar-doctor-info">
                            <span className="sidebar-doctor-name">{doctor.name}</span>
                            <span className="sidebar-doctor-spec">{doctor.specialty || "General"}</span>
                        </div>
                    </div>
                </div>
            </aside>
        </>
    );
}