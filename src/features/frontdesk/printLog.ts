import { useEffect, useState } from "react";

// ── Print log ──────────────────────────────────────────────────────────────
// The prescriptions table carries no print-tracking columns (confirmed against
// the live schema), and the brief forbids a parallel printing database — so
// "has this been printed, how many copies, when" lives client-side, keyed by
// prescription id. It is operational bookkeeping for one reception machine,
// not clinical data: losing it costs nothing but a badge. If a printed_at
// column ever lands in the DB, this module is the only thing to replace.

export type PrintLogEntry = { count: number; last: string };
export type PrintLog = Record<string, PrintLogEntry>;

const STORAGE_KEY = "aren.printrx.log";
const CHANGE_EVENT = "aren:printlog";

export function readPrintLog(): PrintLog {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" ? (parsed as PrintLog) : {};
    } catch {
        return {};
    }
}

export function recordPrint(prescriptionId: string): void {
    const log = readPrintLog();
    const prev = log[prescriptionId];
    log[prescriptionId] = {
        count: (prev?.count ?? 0) + 1,
        last: new Date().toISOString(),
    };
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(log));
    } catch {
        /* storage full/unavailable — the badge just won't update */
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
}

// Live view of the log: updates when this tab records a print and when
// another tab does (storage event).
export function usePrintLog(): PrintLog {
    const [log, setLog] = useState<PrintLog>(() => readPrintLog());

    useEffect(() => {
        const sync = () => setLog(readPrintLog());
        window.addEventListener(CHANGE_EVENT, sync);
        window.addEventListener("storage", sync);
        return () => {
            window.removeEventListener(CHANGE_EVENT, sync);
            window.removeEventListener("storage", sync);
        };
    }, []);

    return log;
}
