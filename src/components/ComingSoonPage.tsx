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
        <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
            <WorkspaceHeader
                logoRef={logoRef}
                onOpenSidebar={onOpenSidebar}
                title={title}
                subtitle={subtitle}
            />
            <div className="coming-soon-body">
                <div className="coming-soon-badge">Coming soon</div>
                <p className="coming-soon-sub">
                    {title} workflow is currently under construction.
                </p>
            </div>
        </div>
    );
}