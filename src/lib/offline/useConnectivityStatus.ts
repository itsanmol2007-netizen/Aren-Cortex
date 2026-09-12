// React-facing view of the connectivity clock + write queue, for the small
// persistent status indicator (Settings page) — never an intrusive banner,
// just enough for a doctor or receptionist to glance at and know whether
// anything is waiting to sync.

import { useEffect, useState } from "react";
import { getLockLevel, getOfflineDurationMs, type LockLevel } from "./connectivityClock";
import { pendingWriteCount } from "./writeQueue";

export interface ConnectivityStatus {
    isOnline: boolean;
    lockLevel: LockLevel;
    offlineDurationMs: number;
    pendingWrites: number;
}

function readOnline(): boolean {
    return typeof navigator === "undefined" ? true : navigator.onLine;
}

export function useConnectivityStatus(): ConnectivityStatus {
    const [status, setStatus] = useState<ConnectivityStatus>(() => ({
        isOnline: readOnline(),
        lockLevel: getLockLevel(),
        offlineDurationMs: getOfflineDurationMs(),
        pendingWrites: 0,
    }));

    useEffect(() => {
        let cancelled = false;

        const refresh = async () => {
            const pendingWrites = await pendingWriteCount().catch(() => 0);
            if (cancelled) return;
            setStatus({
                isOnline: readOnline(),
                lockLevel: getLockLevel(),
                offlineDurationMs: getOfflineDurationMs(),
                pendingWrites,
            });
        };

        void refresh();
        const interval = window.setInterval(refresh, 15000);
        window.addEventListener("online", refresh);
        window.addEventListener("offline", refresh);
        return () => {
            cancelled = true;
            window.clearInterval(interval);
            window.removeEventListener("online", refresh);
            window.removeEventListener("offline", refresh);
        };
    }, []);

    return status;
}
