import type { ReactNode, RefObject } from "react";
import arenLogo from "../assets/aren-logo.png";
import { useWorkspaceMode } from "../hooks/useWorkspaceMode";
import type { ModeBrand } from "../lib/workspace/mode";
import "../styles/workspace-header.css";

interface Props {
    logoRef: RefObject<HTMLDivElement>;
    onOpenSidebar: () => void;
    title: string;
    subtitle: string;
    rightSlot?: ReactNode;
    /**
     * Centred between the page identity and `rightSlot`. Added 2026-08-31 for
     * Settings' master search, which the reference design puts IN the dark
     * header rather than in the page body — extending the shared header
     * rather than forking a second one, so every page keeps the same logo,
     * nebula, divider and type treatment. Omitted everywhere else, which
     * leaves the header's layout exactly as it was.
     */
    centerSlot?: ReactNode;
    /**
     * Overrides the product word in the logo pill.
     *
     * Every clinical page leaves this alone and gets "Cortex"/"Consult" read
     * from the clinic row. The admin suite passes ADMIN_BRAND, because the
     * workspace someone is standing in is not always the workspace their
     * clinic is served — an admin at a Consult clinic is in Parallax, and a
     * header that said "AREN Consult" over a staff roster would be naming the
     * wrong product. Still one header component, not two.
     */
    brand?: ModeBrand;
}

export function WorkspaceHeader({ logoRef, onOpenSidebar, title, subtitle, rightSlot, centerSlot, brand: brandOverride }: Props) {
    /**
     * "Cortex" or "Consult", read rather than passed.
     *
     * Twelve pages render this header, and every one of them would otherwise
     * have to thread the same prop down to say the same word. The mode is a
     * fact about the signed-in clinic (`lib/workspace/mode.ts`), the header is
     * always inside <AuthProvider>, so it reads the fact itself — the same
     * move `useClinicalIdentity` already makes for "which doctor".
     */
    const { brand: derivedBrand } = useWorkspaceMode();
    const brand = brandOverride ?? derivedBrand;

    return (
        <header className="ws-header">
            {/* Nebula asset — inline img, bypasses Vite CSS asset resolution entirely */}
            <img
                src="/aren-nebula.svg"
                aria-hidden="true"
                className="ws-nebula-asset"
                alt=""
            />

            <div className={`ws-header-inner${centerSlot ? " has-center" : ""}`}>

                {/* Logo pill — sidebar trigger */}
                <div
                    ref={logoRef}
                    className="ws-logo-pill"
                    role="button"
                    tabIndex={0}
                    aria-label="Open navigation"
                    onClick={onOpenSidebar}
                    onKeyDown={(e) => e.key === "Enter" && onOpenSidebar()}
                >
                    <img src={arenLogo} alt="AREN" className="ws-logo-img" />
                    <div className="ws-logo-text">
                        <span className="ws-logo-name">AREN</span>
                        <span className="ws-logo-sub">{brand.product}</span>
                    </div>
                </div>

                <div className="ws-header-divider" />

                {/* Workspace identity */}
                <div className="ws-header-identity">
                    <span className="ws-header-title">{title}</span>
                    <span className="ws-header-subtitle">{subtitle}</span>
                </div>

                {centerSlot && (
                    <div className="ws-header-center">
                        {centerSlot}
                    </div>
                )}

                {/* Right slot */}
                {rightSlot && (
                    <div className="ws-header-right">
                        {rightSlot}
                    </div>
                )}

            </div>
        </header>
    );
}