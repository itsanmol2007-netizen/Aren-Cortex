import type { ReactNode } from "react";

type ComingSoonPageProps = {
    icon: ReactNode;
    title: string;
    description?: string;
};

export function ComingSoonPage({
    icon,
    title,
    description = "This section is being built. Check back in a future session.",
}: ComingSoonPageProps) {
    return (
        <div className="coming-soon-page">
            <div className="coming-soon-icon">{icon}</div>
            <h2 className="coming-soon-title">{title}</h2>
            <p className="coming-soon-sub">{description}</p>
            <span className="coming-soon-badge">Coming soon</span>
        </div>
    );
}