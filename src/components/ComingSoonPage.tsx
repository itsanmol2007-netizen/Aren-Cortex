import type { RefObject } from "react";
import { WorkspaceHeader } from "./WorkspaceHeader";

interface ComingSoonPageProps {
    logoRef: RefObject<HTMLDivElement>;
    onOpenSidebar: () => void;
    title: string;
    subtitle: string;
}

export function ComingSoonPage({
    logoRef,
    onOpenSidebar,
    title,
    subtitle,
}: ComingSoonPageProps) {
    return (
        // Not `height: "100%"` — `.app-shell` (App.tsx), this component's
        // parent, has no height of its own, so a percentage height here
        // silently computed to `auto` and this collapsed to fit its own
        // short content instead of filling the screen. Same bug, same fix,
        // as every other feature page (see support.css's note) — fixed
        // here too even though nothing routes to this component today
        // (Communication/Clinic/Support all got real pages 2026-08-24),
        // since it stays as the fallback for the next sidebar destination.
        <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
            <WorkspaceHeader
                logoRef={logoRef}
                onOpenSidebar={onOpenSidebar}
                title={title}
                subtitle={subtitle}
            />
            {/* Was `coming-soon-body` — sidebar.css only ever defined
                `.coming-soon-page` (flex:1, centers its content), so this
                never actually matched anything and rendered unstyled. */}
            <div className="coming-soon-page">
                <div className="coming-soon-badge">Coming soon</div>
                <p className="coming-soon-sub">
                    {title} workflow is currently under construction.
                </p>
            </div>
        </div>
    );
}