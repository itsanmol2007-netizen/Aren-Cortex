// ---------------------------------------------------------------------------
// HELP & SUPPORT — the one sidebar utility that is NOT "coming soon".
//
// Everything else that was a `ComingSoonPage` stub is a real feature with no
// data model behind it yet. Support is different: there is no in-app chat or
// ticket system to build before this page is useful — a doctor who needs
// help can already be reached by email or phone, and this page's only job
// is to say so plainly rather than hide it behind generic "under
// construction" copy. `mailto:`/`tel:` links, not a form: fewer places for
// this page itself to fail regardless of whether wa.me/Backblaze/anything
// else is having a bad day.
// ---------------------------------------------------------------------------

import type { RefObject } from "react";
import { Mail, Phone, BookOpen } from "lucide-react";
import { WorkspaceHeader } from "../../components/WorkspaceHeader";
import { SupportArt } from "../../components/PlaceholderArt";
import "./support.css";

interface Props {
    logoRef: RefObject<HTMLDivElement>;
    onOpenSidebar: () => void;
}

const SUPPORT_EMAIL = "care@arenode.com";
const SUPPORT_PHONE_DISPLAY = "+91 95599 51905";
const SUPPORT_PHONE_TEL = "+919559951905";

export function SupportPage({ logoRef, onOpenSidebar }: Props) {
    return (
        <div className="supp-page">
            <WorkspaceHeader
                logoRef={logoRef}
                onOpenSidebar={onOpenSidebar}
                title="Help & Support"
                subtitle="We're here when you need us"
            />
            <div className="supp-body">
                <div className="supp-hero">
                    <SupportArt />
                    <h2 className="supp-hero-title">Talk to a real person</h2>
                    <p className="supp-hero-sub">
                        In-app chat isn't built yet — reach the Aren Cortex team
                        directly and we'll get back to you.
                    </p>
                </div>

                <div className="supp-cards">
                    <a className="supp-card" href={`mailto:${SUPPORT_EMAIL}`}>
                        <span className="supp-card-icon"><Mail size={17} /></span>
                        <span className="supp-card-text">
                            <span className="supp-card-label">Email</span>
                            <span className="supp-card-value">{SUPPORT_EMAIL}</span>
                        </span>
                    </a>
                    <a className="supp-card" href={`tel:${SUPPORT_PHONE_TEL}`}>
                        <span className="supp-card-icon"><Phone size={17} /></span>
                        <span className="supp-card-text">
                            <span className="supp-card-label">Phone</span>
                            <span className="supp-card-value">{SUPPORT_PHONE_DISPLAY}</span>
                        </span>
                    </a>
                </div>

                <div className="supp-docs">
                    <BookOpen size={13} aria-hidden="true" />
                    <span>Full documentation is coming soon — email or call us in the meantime.</span>
                </div>
            </div>
        </div>
    );
}
