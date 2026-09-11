import type { ReactNode, RefObject } from "react";
import arenLogo from "../assets/aren-logo.png";
import { useClinicShape } from "../hooks/useClinicShape";
import type { Brand } from "../lib/workspace/clinicShape";
import "../styles/workspace-header.css";

interface Props {
    /**
     * Renders the brand pill on the left of the header, and clicking it calls
     * `onOpenSidebar`.
     *
     * OPTIONAL since 2026-09-11, and the doctor's workspace no longer passes
     * either one: its logo lives in the nav rail's head now, permanently, and
     * a second pill three inches to the right would be the "two logos"
     * problem this rebuild existed to remove. AREN Parallax still passes
     * them — its rail is a different thing (in-flow, expands by width) and
     * its header logo is genuinely the only way to toggle it. One header
     * component, two arrangements, rather than two header components.
     */
    logoRef?: RefObject<HTMLDivElement>;
    onOpenSidebar?: () => void;
    title?: string;
    subtitle?: string;
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
     * clinic is served — an admin doctor is in Parallax while their clinic runs
     * Cortex, and a header that said "AREN Cortex" over a staff roster would
     * be naming the wrong product. Still one header component, not two.
     */
    brand?: Brand;
    /**
     * Replaces the default title/subtitle block.
     *
     * The consult screen's identity is an avatar, a status label, a patient
     * name and a line of demographics — not two strings — so it hands the
     * whole cluster in rather than trying to squeeze itself into `title` and
     * `subtitle`. The CHROME stays shared (this file); the CONTENT stays the
     * page's own. That split is the entire reason the consult was able to
     * stop carrying a second header.
     */
    identitySlot?: ReactNode;
    /**
     * Taller, for a header that has to hold more than a page name.
     *
     * Only the consult uses it. It is not a different header — same ink, same
     * nebula, same type, same lockup beside it — it just has more room, and
     * it ARRIVES at that room: the height is a CSS variable on `.app-shell`
     * and both this element and the nav rail's head transition to it, so
     * moving between the consult and any other page reads as the band easing
     * open rather than two different headers swapping.
     */
    tall?: boolean;
}

export function WorkspaceHeader({ logoRef, onOpenSidebar, title, subtitle, rightSlot, centerSlot, brand: brandOverride, identitySlot, tall }: Props) {
    /**
     * "Cortex" or "Consult", read rather than passed.
     *
     * Twelve pages render this header, and every one of them would otherwise
     * have to thread the same prop down to say the same word. The mode is a
     * fact about the signed-in clinic (`lib/workspace/clinicShape.ts`), the header is
     * always inside <AuthProvider>, so it reads the fact itself — the same
     * move `useClinicalIdentity` already makes for "which doctor".
     */
    const { brand: derivedBrand } = useClinicShape();
    const brand = brandOverride ?? derivedBrand;

    return (
        <header className={`ws-header${tall ? " is-tall" : ""}`}>
            {/* Nebula asset — inline img, bypasses Vite CSS asset resolution entirely */}
            <img
                src="/aren-nebula.svg"
                aria-hidden="true"
                className="ws-nebula-asset"
                alt=""
            />

            <div className={`ws-header-inner${centerSlot ? " has-center" : ""}`}>

                {onOpenSidebar ? (
                    /* Parallax's arrangement: the whole pill, logo included,
                       because its rail has no head of its own to hold one. */
                    <>
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
                    </>
                ) : (
                    /* Cortex's arrangement: nothing here at all. The whole
                       lockup — mark AND wordmark — is drawn by the nav rail
                       (`.rail-brand`), which sits above every overlay in the
                       app, so the branding is visible at all times instead of
                       disappearing under the next scrim. This header simply
                       leaves room for it (`.app-shell .ws-header-inner`'s
                       padding-left in workspace-header.css). */
                    null
                )}

                {/* Workspace identity */}
                {identitySlot ?? (
                    <div className="ws-header-identity">
                        <span className="ws-header-title">{title}</span>
                        <span className="ws-header-subtitle">{subtitle}</span>
                    </div>
                )}

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