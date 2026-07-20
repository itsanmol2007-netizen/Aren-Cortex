import { useEffect, useRef, useState } from "react";
import type { StringKey } from "../i18n/strings";
import { useOnline } from "./useOnline";

// A small operational history kept ON THIS COMPUTER (localStorage), never the
// database — a clinic has no use for a server-side audit of "printer blipped at
// 2:41pm". It records the real moments that matter operationally (session
// start, went offline, came back) so the Clinic Status timeline shows what
// ACTUALLY happened instead of decorative placeholder events. Capped to the
// most recent entries; clearing the browser loses history, never anything else.

export type EventTone = "ok" | "warn";
export type LoggedEvent = { id: string; key: StringKey; tone: EventTone; at: number };

const KEY = "aren.eventlog.v1";
const CAP = 60;
const CHANGE = "aren:eventlog"; // same-tab change signal (storage event is cross-tab only)

function read(): LoggedEvent[] {
    try {
        const raw = localStorage.getItem(KEY);
        return raw ? (JSON.parse(raw) as LoggedEvent[]) : [];
    } catch {
        return [];
    }
}

function write(list: LoggedEvent[]): void {
    try {
        localStorage.setItem(KEY, JSON.stringify(list.slice(0, CAP)));
        window.dispatchEvent(new Event(CHANGE));
    } catch {
        /* storage unavailable — logging is best-effort */
    }
}

// Record an operational event. Rapid repeats of the same event (flapping
// connectivity) are collapsed so the timeline never floods.
export function logEvent(key: StringKey, tone: EventTone): void {
    const list = read();
    if (list[0] && list[0].key === key && Date.now() - list[0].at < 4000) return;
    write([{ id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, key, tone, at: Date.now() }, ...list]);
}

export function readEvents(): LoggedEvent[] {
    return read();
}

// Live view of the log — re-renders when an event is added (this tab or another).
export function useEventLog(): LoggedEvent[] {
    const [events, setEvents] = useState<LoggedEvent[]>(() => read());
    useEffect(() => {
        const sync = () => setEvents(read());
        window.addEventListener(CHANGE, sync);
        window.addEventListener("storage", sync);
        return () => {
            window.removeEventListener(CHANGE, sync);
            window.removeEventListener("storage", sync);
        };
    }, []);
    return events;
}

// Mounted once (in WorkspaceShell): writes the real connectivity history. Logs
// a session-start on first load of the browser session, then an entry each time
// connectivity flips. This is the single writer of connectivity events.
export function useConnectivityLog(): void {
    const online = useOnline();
    const prev = useRef<boolean | null>(null);

    useEffect(() => {
        try {
            if (!sessionStorage.getItem("aren.session.logged")) {
                logEvent("evtSessionStart", "ok");
                sessionStorage.setItem("aren.session.logged", "1");
            }
        } catch {
            /* sessionStorage unavailable — skip the session marker */
        }
    }, []);

    useEffect(() => {
        if (prev.current === null) {
            prev.current = online;
            return;
        }
        if (online !== prev.current) {
            logEvent(online ? "evtBackOnline" : "evtWentOffline", online ? "ok" : "warn");
            prev.current = online;
        }
    }, [online]);
}
