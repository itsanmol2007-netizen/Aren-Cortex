// ---------------------------------------------------------------------------
// One line, across the top, whenever this device is offline.
//
// Anmol, 2026-09-13: "when the connection is actually offline, a simple
// banner on top... don't show blank pages when internet goes, just show the
// last value if internet connection is not present."
//
// The second half of that is the job of each read (the durable caches in
// `lib/offline/durableCache.ts` and the `lib/db/*` functions that fall back
// to them). This is the first half: the one place that says, plainly and
// once, why a number on screen might be older than it looks — so no
// individual card has to hedge in its own words, and nothing has to be
// hidden or blanked just because it can't be re-checked right now.
//
// Deliberately a strip, not a modal or a toast: it must never take a click
// to dismiss mid-consult, and it must never be the thing a doctor has to
// get past to reach the queue. It also reports queued writes, because "3
// waiting to sync" is the one piece of offline state that is genuinely
// actionable — it tells you not to close the tab yet.
// ---------------------------------------------------------------------------

import { CloudOff } from "lucide-react";
import { useConnectivityStatus } from "../lib/offline/useConnectivityStatus";

export function OfflineBanner() {
    const { isOnline, pendingWrites } = useConnectivityStatus();
    if (isOnline) return null;

    return (
        <div className="aren-offline-banner" role="status">
            <style>{BANNER_CSS}</style>
            <CloudOff size={14} strokeWidth={2.2} />
            <span>
                You&rsquo;re offline — showing the last information this device saved.
            </span>
            {pendingWrites > 0 && (
                <span className="aren-offline-pending">
                    {pendingWrites} {pendingWrites === 1 ? "change" : "changes"} waiting to sync
                </span>
            )}
        </div>
    );
}

const BANNER_CSS = `
.aren-offline-banner {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    /* Above the nav rail (--rail-z: 10000) so it is never tucked behind the
       one surface that outranks the modals, but below Sonner's toasts,
       which are messages about something that already happened. */
    z-index: 10001;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 7px 16px;
    background: linear-gradient(180deg, #2a2036 0%, #1d1730 100%);
    color: rgba(255, 255, 255, 0.92);
    font-family: Inter, ui-sans-serif, system-ui, sans-serif;
    font-size: 12.5px;
    font-weight: 600;
    letter-spacing: 0.01em;
    box-shadow: 0 2px 14px rgba(12, 10, 30, 0.28);
    pointer-events: none;
}
.aren-offline-banner svg { flex: none; color: #e9b8ff; }
.aren-offline-pending {
    padding: 2px 9px;
    border-radius: 999px;
    background: rgba(233, 184, 255, 0.16);
    color: #f0d9ff;
    font-size: 11.5px;
    font-weight: 700;
}
`;
