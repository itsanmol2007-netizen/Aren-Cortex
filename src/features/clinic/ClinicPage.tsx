// ---------------------------------------------------------------------------
// CLINIC — "configure the clinic itself (staff/hours/operations)"
// (SidebarNav.tsx). A real destination, no schema behind it yet — genuinely
// more complex than Practice was (new data models: staff, hours,
// multi-location), which is why it stayed a stub while Practice got built
// the same day it was documented as blocked (aren-cortex-context.md §7).
// Given its own illustration 2026-08-24, same treatment as Communication.
// ---------------------------------------------------------------------------

import type { RefObject } from "react";
import { WorkspaceHeader } from "../../components/WorkspaceHeader";
import { ClinicArt } from "../../components/PlaceholderArt";
import "./clinic.css";

interface Props {
    logoRef: RefObject<HTMLDivElement>;
    onOpenSidebar: () => void;
}

const COMING: string[] = [
    "Clinic profile, branding & registration details",
    "Staff, roles & permissions",
    "Working hours, holidays & multiple locations",
];

export function ClinicPage({ logoRef, onOpenSidebar }: Props) {
    return (
        <div className="clinic-page">
            <WorkspaceHeader
                logoRef={logoRef}
                onOpenSidebar={onOpenSidebar}
                title="Clinic"
                subtitle="Clinic profile, staff, working hours & operations"
            />
            <div className="clinic-body">
                <div className="clinic-hero">
                    <ClinicArt />
                    <h2 className="clinic-hero-title">Run your clinic from here</h2>
                    <p className="clinic-hero-sub">
                        Your clinic's profile, staff and operating hours will all be
                        managed from this page — one place instead of a phone call to us.
                    </p>
                    <span className="clinic-badge">Coming soon</span>
                </div>

                <ul className="clinic-list">
                    {COMING.map((line) => (
                        <li key={line}>{line}</li>
                    ))}
                </ul>
            </div>
        </div>
    );
}
