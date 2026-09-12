// ---------------------------------------------------------------------------
// The idle clock behind the PIN lock's auto-lock. 10 minutes of no GENUINE
// interaction — the same reasoning as `connectivityClock.ts`'s "a real
// server round trip, not a browser flag": here, "real interaction" is an
// actual pointer/keyboard/touch/wheel event, never anything the app itself
// generates (a background sync tick, a Synapse re-rank, a toast appearing).
// A doctor reading a report or mid-conversation with a patient for a few
// minutes must never get locked out mid-thought — see the design note this
// codifies for why 10 minutes and not the much shorter defaults a phone
// lock screen uses.
//
// The clock is wall time (`lastActivityAt`), not a foreground `setTimeout`
// — it keeps counting while the tab is backgrounded, so switching away for
// 12 minutes and back still locks, which a timer that only runs while
// visible would miss entirely.
// ---------------------------------------------------------------------------

import { lockNow, onLockStateChange } from "./deviceKey";

export const DEFAULT_IDLE_LOCK_MS = 10 * 60 * 1000;

let lastActivityAt = Date.now();
let started = false;

function markActivity() {
    lastActivityAt = Date.now();
}

/** Starts the global idle watch. Call once, at app boot — like
 *  `initConnectivityClock`/`initWriteQueue`, this is a module-level
 *  singleton, not something a component owns or could accidentally start
 *  twice. */
export function initIdleLock(timeoutMs: number = DEFAULT_IDLE_LOCK_MS): void {
    if (started) return;
    started = true;
    if (typeof window === "undefined") return;

    const opts = { passive: true, capture: true } as const;
    window.addEventListener("pointerdown", markActivity, opts);
    window.addEventListener("keydown", markActivity, opts);
    window.addEventListener("touchstart", markActivity, opts);
    window.addEventListener("wheel", markActivity, opts);

    // A fresh unlock resets the clock to "now" — otherwise a PIN typed
    // after already sitting idle for 9 minutes would lock again 60 seconds
    // later, which reads as the lock screen not having worked at all.
    onLockStateChange((unlocked) => {
        if (unlocked) markActivity();
    });

    window.setInterval(() => {
        if (Date.now() - lastActivityAt >= timeoutMs) lockNow();
    }, 15_000);
}
