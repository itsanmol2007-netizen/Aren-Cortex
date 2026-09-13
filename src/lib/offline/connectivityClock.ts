// ---------------------------------------------------------------------------
// The one clock the 72-hour lock is built on: "when did we last actually hear
// back from our own server", not `navigator.onLine` (which only means the OS
// thinks a network interface is up — a doctor on a captive hotel Wi-Fi with
// no real route to Supabase reads as "online" forever).
//
// `markConfirmedOnline()` is called ONLY from places that just completed a
// real authenticated round trip to Supabase — today that's AuthProvider's
// identity re-verify and the write queue's own successful flush (see
// writeQueue.ts). Nothing here ever trusts a browser event by itself.
//
// Stored in TWO independent places (IndexedDB and localStorage), written
// together, read as their MINIMUM — the more conservative, closer-to-locked
// value wins. That is deliberate: someone trying to buy extra offline time
// only needs to falsify one store if we took the maximum; taking the minimum
// means both have to be tampered with together to move the clock forward.
// This is NOT cryptographic and does not claim to be — see lockGate.ts's own
// note on what a stronger version would need (a server-signed, asymmetrically
// verified token). For a B2B licensing friction, not a security boundary
// against a determined attacker, this is the right amount of effort.
// ---------------------------------------------------------------------------

import { toast } from "sonner";
import { localDB } from "./db";

const LS_KEY = "aren.lastConfirmedOnlineAt.v1";
const META_KEY = "lastConfirmedOnlineAt";
const WARNED_META_KEY = "connectivityWarnLevel";

export const WARN_24H_MS = 24 * 60 * 60 * 1000;
export const HARD_72H_MS = 72 * 60 * 60 * 1000;

export type LockLevel = "ok" | "warn24" | "hard72";

function readLocalStorage(): number | null {
    try {
        const raw = localStorage.getItem(LS_KEY);
        if (!raw) return null;
        const n = Number(raw);
        return Number.isFinite(n) ? n : null;
    } catch {
        return null;
    }
}

function writeLocalStorage(ms: number): void {
    try {
        localStorage.setItem(LS_KEY, String(ms));
    } catch {
        /* storage unavailable — the Dexie copy still holds */
    }
}

async function readDexie(): Promise<number | null> {
    try {
        const row = await localDB.meta.get(META_KEY);
        const v = row?.value;
        return typeof v === "number" && Number.isFinite(v) ? v : null;
    } catch {
        return null;
    }
}

async function writeDexie(ms: number): Promise<void> {
    try {
        await localDB.meta.put({ key: META_KEY, value: ms });
    } catch {
        /* IndexedDB unavailable — localStorage copy still holds */
    }
}

/** In-memory cache so synchronous callers (render paths, guards) don't have
 *  to await IndexedDB on every check. Hydrated once at boot by
 *  `initConnectivityClock`, and kept current by every write after that. */
let cachedMs: number | null = null;

/** Best-effort synchronous read for render-time checks. Falls back to "now"
 *  (i.e. not locked) only until the async hydration in `initConnectivityClock`
 *  completes — a cold tab must never flash a false lock before it has even
 *  had a chance to read its own stored clock. */
export function getLastConfirmedOnlineAtSync(): number {
    if (cachedMs != null) return cachedMs;
    const ls = readLocalStorage();
    return ls ?? Date.now();
}

export async function getLastConfirmedOnlineAt(): Promise<number> {
    const [dexieMs, lsMs] = await Promise.all([readDexie(), Promise.resolve(readLocalStorage())]);
    const candidates = [dexieMs, lsMs].filter((v): v is number => v != null);
    if (candidates.length === 0) return Date.now();
    return Math.min(...candidates);
}

/** Call this, and only this, right after a write that PROVES the server
 *  actually answered — never from a browser `online` event alone. */
export function markConfirmedOnline(): void {
    const now = Date.now();
    cachedMs = now;
    writeLocalStorage(now);
    void writeDexie(now);
    void localDB.meta.put({ key: WARNED_META_KEY, value: "ok" }).catch(() => {});
}

export function getOfflineDurationMs(): number {
    return Math.max(0, Date.now() - getLastConfirmedOnlineAtSync());
}

export function getLockLevel(): LockLevel {
    const offlineMs = getOfflineDurationMs();
    if (offlineMs >= HARD_72H_MS) return "hard72";
    if (offlineMs >= WARN_24H_MS) return "warn24";
    return "ok";
}

function formatOffline(ms: number): string {
    const hours = Math.floor(ms / (60 * 60 * 1000));
    if (hours < 1) return "a few minutes";
    if (hours === 1) return "1 hour";
    return `${hours} hours`;
}

let watcherStarted = false;

/** Boots the clock: hydrates the in-memory cache, wires the quiet
 *  offline/online toasts, and starts the periodic check that fires the 24h
 *  and 72h warnings once each per crossing (deduped via `meta` so a reload
 *  mid-lockout doesn't re-announce it every time). Call once, at app start. */
export function initConnectivityClock(): void {
    if (watcherStarted) return;
    watcherStarted = true;

    void (async () => {
        cachedMs = await getLastConfirmedOnlineAt();
    })();

    if (typeof window === "undefined") return;

    // The "you just went offline" toast used to live here too, and it is
    // what was landing on top of OfflineBanner.tsx's own persistent pill —
    // both are bottom-right (Sonner's own corner, `main.tsx`), and both
    // appeared at the exact same instant a device drops offline. The
    // persistent pill already says the same fact for as long as it stays
    // true, which a transient toast cannot, so it is the one that stays;
    // this one-time announcement was the redundant half of the collision,
    // not the fix for it. "Back online" is kept — it is a genuinely
    // separate, celebratory moment (the offline pill has already
    // vanished by the time this fires, so there is nothing left to
    // collide with).
    window.addEventListener("online", () => {
        toast.success("Back online.", { id: "connectivity-online" });
    });

    const tick = async () => {
        const level = getLockLevel();
        let lastWarned: string | null = null;
        try {
            const row = await localDB.meta.get(WARNED_META_KEY);
            lastWarned = (row?.value as string | undefined) ?? null;
        } catch {
            /* treat as unknown, worst case re-toasts once */
        }
        if (level === lastWarned) return;

        if (level === "warn24") {
            toast.warning(
                `This device hasn't reached the AREN server in over ${formatOffline(getOfflineDurationMs())}. ` +
                    "Reconnect soon — new patient registration, Synapse ranking and WhatsApp sends pause at 72 hours offline.",
                { id: "connectivity-warn24", duration: 10000 }
            );
        } else if (level === "hard72") {
            toast.error(
                "72 hours without reaching the server. New patients, Synapse ranking and WhatsApp sends are paused until this device reconnects — everything already saved here is still fully readable.",
                { id: "connectivity-hard72", duration: 15000 }
            );
        }
        try {
            await localDB.meta.put({ key: WARNED_META_KEY, value: level });
        } catch {
            /* best-effort dedupe only */
        }
    };

    void tick();
    window.setInterval(tick, 60 * 1000);
}
