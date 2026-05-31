import type { ReactNode, RefObject } from "react";
import arenLogo from "../assets/aren-logo.png";
import "../styles/workspace-header.css";

interface Props {
    logoRef: RefObject<HTMLDivElement>;
    onOpenSidebar: () => void;
    title: string;
    subtitle: string;
    rightSlot?: ReactNode;
}

export function WorkspaceHeader({ logoRef, onOpenSidebar, title, subtitle, rightSlot }: Props) {
    return (
        <header className="ws-header">
            {/* Nebula asset — inline img, bypasses Vite CSS asset resolution entirely */}
            <img
                src="/aren-nebula.svg"
                aria-hidden="true"
                className="ws-nebula-asset"
                alt=""
            />

            <div className="ws-header-inner">

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
                        <span className="ws-logo-sub">Cortex</span>
                    </div>
                </div>

                <div className="ws-header-divider" />

                {/* Workspace identity */}
                <div className="ws-header-identity">
                    <span className="ws-header-title">{title}</span>
                    <span className="ws-header-subtitle">{subtitle}</span>
                </div>

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