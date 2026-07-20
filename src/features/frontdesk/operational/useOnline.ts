import { useEffect, useState } from "react";

// The single source of "is this machine online?" for the reception workspace.
// Reads navigator.onLine synchronously (correct immediately on mount, even
// before any network call) and tracks the browser's online/offline events.
// This is the real signal the Clinic Status Health Registry and the operational
// banner both react to — no polling, no URL parameters.
export function useOnline(): boolean {
    const [online, setOnline] = useState<boolean>(() =>
        typeof navigator === "undefined" ? true : navigator.onLine
    );

    useEffect(() => {
        const goOnline = () => setOnline(true);
        const goOffline = () => setOnline(false);
        window.addEventListener("online", goOnline);
        window.addEventListener("offline", goOffline);
        // Reconcile once in case the state changed between render and effect.
        setOnline(navigator.onLine);
        return () => {
            window.removeEventListener("online", goOnline);
            window.removeEventListener("offline", goOffline);
        };
    }, []);

    return online;
}
