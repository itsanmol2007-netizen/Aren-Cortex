import arenLogo from "../../assets/aren-logo.png";
import { useClinicShape } from "../../hooks/useClinicShape";
import { NAV_DESTINATIONS, CONSULT_ACTION, startsGroup, type SidebarPage } from "./SidebarNav";
import { ConstellationWash } from "./ConstellationWash";

// ---------------------------------------------------------------------------
// THE NAV RAIL — always there, one click per destination.
//
// Built 2026-09-11, replacing the "click the logo, wait for a drawer, then
// click the page" navigation that had been the only way around the doctor's
// workspace. Anmol: "when you have to switch pages, you literally have to
// first click on that logo and then you have to click on the pages from the
// sidebar." Two clicks and an animation to do the most ordinary thing in the
// app. This is the fix: every destination is permanently on screen, one
// click away, exactly like the front desk's own rail
// (`features/frontdesk/components/NavRail.tsx`, the reference for this).
//
// ── Why it is fixed, and why it sits above everything ─────────────────────
// `position: fixed` at the viewport's left edge, starting under the header.
// Two consequences, both wanted:
//
//   1. It cannot be pushed around by whatever page is mounted. Every page in
//      this app owns its own layout; a rail in normal flow would have to be
//      threaded through all of them.
//   2. It outranks the modals (see `--rail-z` in sidebar.css). That is what
//      finally retired `GlobalLogoTrigger` — an invisible button that polled
//      `getBoundingClientRect()` every 400ms to sit on top of wherever the
//      real logo was, for one reason: so navigation stayed reachable while a
//      full-screen overlay (a locked queue sheet, the patient modal) covered
//      the screen. A rail that is always visible and always on top is the
//      honest version of that promise — no phantom, no polling, and it shows
//      the doctor where they are instead of hiding it.
//
// ── The alignment contract with the expanded panel ────────────────────────
// The panel (`Sidebar.tsx`) is not a different surface; it is this rail with
// labels. That illusion is pure geometry and it is load-bearing: the icon
// badges in both are the same size and the same distance from the viewport's
// left edge (`--rail-pad`), so opening the panel slides labels out beside
// icons that never move. Change a badge size or the rail's padding and you
// must change it in sidebar.css for both, or the panel will visibly jump off
// the rail when it opens.
// ---------------------------------------------------------------------------

type Props = {
    activePage: SidebarPage | null;
    onNavigate: (page: SidebarPage) => void;
    onConsult: () => void;
    /** The panel is open — the rail hides under it, so skip its hover affordances. */
    expanded: boolean;
    doctorName: string;
    avatarUrl?: string | null;
    onOpenProfile: () => void;
    /** The logo click — opens the labelled panel. */
    onOpenPanel: () => void;
};

export function NavRail({
    activePage,
    onNavigate,
    onConsult,
    expanded,
    doctorName,
    avatarUrl,
    onOpenProfile,
    onOpenPanel,
}: Props) {
    /* Read, not passed. The product name is a fact about the signed-in clinic
       and this component is always inside <AuthProvider> — the same move
       `WorkspaceHeader` already makes rather than threading a prop down for a
       word that never varies within a session. */
    const { brand } = useClinicShape();

    const initials = doctorName
        ? doctorName.split(" ").filter(Boolean).map((p) => p[0]).join("").slice(0, 2).toUpperCase()
        : "DR";

    return (
        <nav
            className={`nav-rail${expanded ? " is-under-panel" : ""}`}
            aria-label="Main navigation"
            data-nav-keep
        >
            {/* ── The brand lockup ──────────────────────────────────────
                Mark AND wordmark, drawn here rather than in either header.

                It is here for one reason: this is the only surface in the app
                that outranks every overlay. In the header, the wordmark went
                dark under the first modal scrim that opened over it, and the
                whole block vanished when the nav panel's own scrim covered
                the top strip — "opening the sidebar hides the logo on the top
                itself" (Anmol, 2026-09-11). Branding that disappears whenever
                a doctor does anything is not visible, it is intermittent.

                So it belongs to neither: not a header element, not a sidebar
                element, but the corner both of them meet in. The element is
                60px wide in the layout (the rail's own width) and paints
                `--brand-w` wide, overhanging into the header's left margin,
                which the headers leave clear for it. */}
            <div className="rail-head">
                <button
                    type="button"
                    className="rail-brand"
                    onClick={onOpenPanel}
                    aria-label="Open navigation"
                    aria-expanded={expanded}
                    title="Menu"
                >
                    <span className="rail-brand-mark">
                        <img src={arenLogo} alt="" />
                    </span>
                    <span className="rail-brand-text">
                        <span className="rail-brand-name">AREN</span>
                        <span className="rail-brand-product">{brand.product}</span>
                    </span>
                </button>
            </div>

            {/* The consult — the one thing a doctor opens this app to do, and
                the only filled treatment in the rail. */}
            <button
                type="button"
                className="rail-item is-action"
                onClick={onConsult}
                data-label={CONSULT_ACTION.label}
                aria-label={CONSULT_ACTION.label}
            >
                <span className="rail-badge">
                    <CONSULT_ACTION.icon size={18} strokeWidth={2} />
                </span>
            </button>

            <div className="rail-divider" />

            <div className="rail-group">
                {NAV_DESTINATIONS.map((d, i) => {
                    const Icon = d.icon;
                    return (
                        <div key={d.page} className="rail-slot">
                            {startsGroup(d, NAV_DESTINATIONS[i - 1]) && <div className="rail-divider" />}
                            <button
                                type="button"
                                className={`rail-item tone-${d.tone}${d.utility ? " is-utility" : ""}${activePage === d.page ? " is-active" : ""}`}
                                onClick={() => onNavigate(d.page)}
                                data-label={d.label}
                                aria-label={d.label}
                                aria-current={activePage === d.page ? "page" : undefined}
                            >
                                <span className="rail-badge">
                                    <Icon size={d.utility ? 16 : 17} strokeWidth={2} />
                                </span>
                            </button>
                        </div>
                    );
                })}
            </div>

            {/* The only thing pinned to the bottom. Whatever height is left
                over sits ABOVE it as quiet rail, which is ordinary; the same
                gap opened up INSIDE the list (the shape this replaced, where
                Help & Support was pinned down here too) read as a list that
                had failed to finish loading. */}
            {/* The quiet zone — see ConstellationWash's own note for why the
                leftover height is where the constellation belongs. */}
            <div className="rail-quiet" aria-hidden="true">
                <ConstellationWash />
            </div>

            {/* Takes a share of the modal scrim so the rail sits in the same
                air as the screen it is floating over — see `.nav-rail-veil`.
                Last child, above everything, and click-through. */}
            <div className="nav-rail-veil" aria-hidden="true" />

            <div className="rail-foot">
                <button
                    type="button"
                    className="rail-item is-avatar"
                    onClick={onOpenProfile}
                    data-label={doctorName}
                    aria-label={`${doctorName} — open your profile`}
                >
                    <span className="rail-avatar">
                        {avatarUrl ? <img src={avatarUrl} alt="" /> : initials}
                    </span>
                </button>
            </div>

        </nav>
    );
}
