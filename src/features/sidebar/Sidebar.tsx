import { useEffect, useLayoutEffect, useRef } from "react";
import { ChevronRight, X } from "lucide-react";
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
    /** `doctors.avatar_url` — a public URL (lib/db/clinic.ts's `getPublicUrl`),
     *  so it can be rendered directly and cached by the browser. Falls back to
     *  initials when the doctor has not uploaded a photo. */
    avatarUrl?: string | null;
    /** Opens the doctor's own profile — the footer pill is the way in. */
    onOpenProfile: () => void;
    logoRef: React.RefObject<HTMLDivElement>;
};

export function Sidebar({
    isOpen,
    onClose,
    activePage,
    onNavigate,
    onConsult,
    doctor,
    avatarUrl,
    onOpenProfile,
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
                {/* Same COLORS as the workspace header's nebula asset
                    (aren-nebula.svg's own gradient stops — #9333ea/#a855f7/
                    #c084fc/#6d28d9/#4f46e5 blooms on a #040812→#060a18 base),
                    not the literal file: that asset is a 1400×64 wide bar
                    built for a short header strip, and forcing it into a
                    272px-wide, 100vh-tall panel (by cropping or rotating)
                    either zoomed into a meaningless sliver or needed fragile
                    transform math for a worse result than just building the
                    same palette at the panel's own proportions. This is a
                    genuine "same visual language" match — same hues, same
                    soft-bloom-on-dark-navy technique — replacing the old
                    hand-drawn constellation (dots + connecting lines), which
                    was a different, more literally "space/sci-fi" motif in
                    the same color family and the more likely reason the
                    panel read as a different design system next to the
                    header it opens from. */}
                <div className="sidebar-nebula-wash" aria-hidden="true" />

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

                {/* Doctor footer — the doctor's real photo when there is one,
                    and a way IN to their own profile rather than a static
                    readout. Two initials in a coloured square is what an
                    account has before it has a face; once `avatar_url` is
                    set, showing it instead is both more recognisable and
                    free (a public URL the browser caches — see
                    lib/db/profileCache.ts for why the ROW is cached but the
                    bytes deliberately are not). */}
                <div className="sidebar-footer">
                    <button
                        type="button"
                        className="sidebar-doctor-pill"
                        onClick={() => { onOpenProfile(); onClose(); }}
                        aria-label={`${doctor.name} — open your profile`}
                    >
                        <div className="sidebar-doctor-avatar">
                            {avatarUrl
                                ? <img src={avatarUrl} alt="" className="sidebar-doctor-photo" />
                                : doctorInitials}
                        </div>
                        <div className="sidebar-doctor-info">
                            <span className="sidebar-doctor-name">{doctor.name}</span>
                            <span className="sidebar-doctor-spec">{doctor.specialty || "General"}</span>
                        </div>
                        <ChevronRight size={15} className="sidebar-doctor-chevron" />
                    </button>
                </div>
            </aside>
        </>
    );
}