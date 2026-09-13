// ---------------------------------------------------------------------------
// A small, persistent pill saying "you're offline" — never a strip across
// the top.
//
// The first version WAS a full-width strip pinned to `top: 0`, above every
// header on every page. Anmol, 2026-09-13: "that offline card indicator...
// its covering the top things... place it more intelligently that its
// visible in all pages, and doesn't block anything important visually."
//
// Bottom-right, not top: it's the one corner nothing else in this app
// claims. The consult's own bottom status bar now collapses to nothing on
// an ordinary day (StatusBar.tsx, 2026-09-13), the nav rail's avatar sits
// bottom-LEFT, and Sonner's toasts already live at `bottom-right` (see
// main.tsx) — a small pill in the same neighbourhood as an existing,
// already-accepted UI citizen reads as belonging there, not as a new
// intrusion. It sits a little higher than a toast would land, so the two
// can coexist without a transient toast ever landing on top of a
// persistent fact.
// ---------------------------------------------------------------------------

import { CloudOff } from "lucide-react";
import { useConnectivityStatus } from "../lib/offline/useConnectivityStatus";

export function OfflineBanner() {
    const { isOnline, pendingWrites } = useConnectivityStatus();
    if (isOnline) return null;

    return (
        <div className="aren-offline-banner" role="status">
            <style>{BANNER_CSS}</style>
            <CloudOff size={13} strokeWidth={2.2} />
            <span>Offline — showing saved data</span>
            {pendingWrites > 0 && (
                <span className="aren-offline-pending">
                    {pendingWrites} {pendingWrites === 1 ? "change" : "changes"} waiting
                </span>
            )}
        </div>
    );
}

const BANNER_CSS = `
.aren-offline-banner {
    position: fixed;
    right: 18px;
    bottom: 76px;
    z-index: 9500;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 13px;
    border-radius: 999px;
    background: linear-gradient(180deg, #2a2036 0%, #1d1730 100%);
    color: rgba(255, 255, 255, 0.92);
    font-family: Inter, ui-sans-serif, system-ui, sans-serif;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.01em;
    box-shadow: 0 6px 20px rgba(12, 10, 30, 0.30);
    pointer-events: none;
}
.aren-offline-banner svg { flex: none; color: #e9b8ff; }
.aren-offline-pending {
    padding: 2px 8px;
    border-radius: 999px;
    background: rgba(233, 184, 255, 0.16);
    color: #f0d9ff;
    font-size: 11px;
    font-weight: 700;
}

@media (max-width: 640px) {
    .aren-offline-banner { right: 12px; bottom: 12px; }
}
`;
