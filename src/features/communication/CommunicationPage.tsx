// ---------------------------------------------------------------------------
// COMMUNICATION — a real sidebar destination (SidebarNav.tsx's own header
// explains why it earned one: "the messaging workflow around clinical
// care") with nothing behind it yet. Still a `ComingSoonPage`-shaped stub
// until 2026-08-24 — Anmol: give it its own illustration and say plainly
// what will actually be here, instead of the generic "under construction"
// copy every unbuilt page shared.
//
// `lib/whatsapp.ts` already has a real, working `buildWhatsAppLink()` used
// by the Patient Record page's "Send via WhatsApp" prescription action
// (aren-cortex-context.md §7) — a `wa.me` deep link, not an inbox. This page
// is that inbox: every conversation in one place, not a link that opens a
// separate app. The two are unrelated today; `buildWhatsAppLink` is exactly
// the kind of call this page's real inbox would eventually replace.
// ---------------------------------------------------------------------------

import type { RefObject } from "react";
import { WorkspaceHeader } from "../../components/WorkspaceHeader";
import { CommunicationArt } from "../../components/PlaceholderArt";
import "./communication.css";

interface Props {
    logoRef: RefObject<HTMLDivElement>;
    onOpenSidebar: () => void;
}

const COMING: string[] = [
    "Every WhatsApp conversation with a patient, in one inbox",
    "Automated follow-up reminders after a visit",
    "Reusable message templates for common updates",
];

export function CommunicationPage({ logoRef, onOpenSidebar }: Props) {
    return (
        <div className="comm-page">
            <WorkspaceHeader
                logoRef={logoRef}
                onOpenSidebar={onOpenSidebar}
                title="Communication"
                subtitle="WhatsApp conversations, patient messages & follow-ups"
            />
            <div className="comm-body">
                <div className="comm-hero">
                    <CommunicationArt />
                    <h2 className="comm-hero-title">Your WhatsApp, inside Cortex</h2>
                    <p className="comm-hero-sub">
                        Every conversation, reminder and message setting for your patients
                        will live here — one inbox, instead of switching to a separate app.
                    </p>
                    <span className="comm-badge">Coming soon</span>
                </div>

                <ul className="comm-list">
                    {COMING.map((line) => (
                        <li key={line}>{line}</li>
                    ))}
                </ul>
            </div>
        </div>
    );
}
