import { useEffect, useRef } from "react";
import { ChevronRight } from "lucide-react";
import { NAV_DESTINATIONS, CONSULT_ACTION, startsGroup, type SidebarPage } from "./SidebarNav";
import { ConstellationWash } from "./ConstellationWash";
import type { Doctor } from "../../types";
import { useOverlayFocus } from "../../hooks/useOverlayFocus";

// ---------------------------------------------------------------------------
// THE EXPANDED PANEL — the rail, with the labels showing.
//
// Rewritten 2026-09-11. What this used to be: a 272px dark-navy drawer with
// its own nebula wash, its own logo that flew in from the topbar on a
// measured JS morph, and a near-opaque scrim over the whole app. Anmol:
// "sidebar is looking so much dull... so much bulky, the whole page have a
// light theme and the sidebar has a dark theme." It was a well-built panel
// belonging to a different product than the one it opened over.
//
// Three things changed, and only the third is cosmetic:
//
// 1. **It is no longer the way to navigate.** `NavRail` is. This panel exists
//    to put NAMES on the rail's icons — for a doctor still learning the app,
//    or checking where they are. Nothing is reachable only from here, which
//    is why closing it is as cheap as clicking anywhere.
//
// 2. **It opens under the header, not over it.** The logo that opens it stays
//    exactly where it is, lit, in the dark header above — so the panel reads
//    as dropping out of the logo rather than replacing the screen. That
//    retired the whole morph apparatus (measuring two rects, computing a
//    transform delta, animating a logo between them): there is no second
//    logo to fly, because there is no second logo.
//
// 3. It is light, and it carries the constellation instead of the nebula.
//
// ── The alignment contract ────────────────────────────────────────────────
// This panel covers the rail exactly, and its icon badges sit at the same
// size and the same distance from the left edge as the rail's. That is the
// entire trick: the badges do not move, the labels slide out beside them,
// and it reads as one surface widening rather than a drawer arriving. The
// shared numbers live in sidebar.css as `--rail-w`/`--rail-pad`/`--badge`;
// change them in one place or the panel will jump off the rail when it opens.
// ---------------------------------------------------------------------------

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
}: SidebarProps) {
    const panelRef = useRef<HTMLElement>(null);

    // Escape closes, like every other overlay in the app.
    useEffect(() => {
        if (!isOpen) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [isOpen, onClose]);

    // Takes focus while open, hands it back to whatever opened it (the header
    // logo) on close — see useOverlayFocus.ts. Without this a doctor who
    // opened it from the keyboard would land with the keyboard still pointed
    // at the workspace behind it.
    useOverlayFocus(panelRef, isOpen);

    const doctorInitials = doctor.name
        ? doctor.name.split(" ").filter(Boolean).map((p) => p[0]).join("").slice(0, 2).toUpperCase()
        : "DR";

    const go = (page: SidebarPage) => {
        onNavigate(page);
        onClose();
    };

    return (
        <>
            {/* Click anywhere = close. Deliberately a light scrim with a small
                blur, not the near-black wash the dark drawer used: this panel
                is an aid, not a mode, and blacking out the doctor's own
                workspace to show them seven labels was most of why the old one
                felt heavy. */}
            <div
                className={`nav-scrim${isOpen ? " is-open" : ""}`}
                onClick={onClose}
                aria-hidden="true"
            />

            <aside
                ref={panelRef}
                tabIndex={-1}
                className={`nav-panel cx-kbd-surface${isOpen ? " is-open" : ""}`}
                role="dialog"
                aria-modal="true"
                aria-label="Navigation"
                data-nav-keep
            >
                <button
                    type="button"
                    className="panel-item is-action"
                    onClick={() => { onConsult(); onClose(); }}
                >
                    <span className="panel-badge"><CONSULT_ACTION.icon size={18} strokeWidth={2} /></span>
                    <span className="panel-label">{CONSULT_ACTION.label}</span>
                </button>

                <div className="panel-divider" />

                {NAV_DESTINATIONS.map((d, i) => {
                    const Icon = d.icon;
                    return (
                        <div key={d.page} className="panel-slot">
                            {startsGroup(d, NAV_DESTINATIONS[i - 1]) && <div className="panel-divider" />}
                            <button
                                type="button"
                                className={`panel-item tone-${d.tone}${d.utility ? " is-utility" : ""}${activePage === d.page ? " is-active" : ""}`}
                                onClick={() => go(d.page)}
                                aria-current={activePage === d.page ? "page" : undefined}
                            >
                                <span className="panel-badge"><Icon size={d.utility ? 16 : 17} strokeWidth={2} /></span>
                                <span className="panel-label">{d.label}</span>
                            </button>
                        </div>
                    );
                })}

                {/* The same quiet zone, with the same constellation in the
                    same place — the panel is ~190px wider, so the mark simply
                    stays left-aligned where the rail drew it. A doctor opening
                    this sees the stars sit still while the labels arrive,
                    which is the "one surface widening" idea stated once more
                    at the bottom of the panel. */}
                <div className="rail-quiet" aria-hidden="true">
                    <ConstellationWash />
                </div>

                <div className="panel-foot">
                    {/* The doctor's real photo when there is one, and a way IN
                        to their own profile rather than a static readout. Two
                        initials in a coloured square is what an account has
                        before it has a face; once `avatar_url` is set, showing
                        it instead is both more recognisable and free (a public
                        URL the browser caches — see lib/db/profileCache.ts for
                        why the ROW is cached but the bytes deliberately are
                        not). */}
                    <button
                        type="button"
                        className="panel-doctor"
                        onClick={() => { onOpenProfile(); onClose(); }}
                        aria-label={`${doctor.name} — open your profile`}
                    >
                        <span className="panel-doctor-avatar">
                            {avatarUrl
                                ? <img src={avatarUrl} alt="" />
                                : doctorInitials}
                        </span>
                        <span className="panel-doctor-info">
                            <span className="panel-doctor-name">{doctor.name}</span>
                            <span className="panel-doctor-spec">{doctor.specialty || "General"}</span>
                        </span>
                        <ChevronRight size={15} className="panel-doctor-chevron" />
                    </button>
                </div>
            </aside>
        </>
    );
}
