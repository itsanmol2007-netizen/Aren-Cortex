// ---------------------------------------------------------------------------
// Captures the browser's native `beforeinstallprompt` event so Settings can
// offer an explicit "Install app" control, instead of leaving install
// entirely to whatever the browser's own UI happens to do with it — an
// omnibox icon a doctor never notices, or nothing at all once the event
// fires and nobody was listening for it.
//
// Module-level, not a hook: `beforeinstallprompt` fires once, early, for a
// given page load, and Chrome never replays it. Capturing it here at import
// time (this module is imported from main.tsx, see initPWA) means it is
// never missed regardless of whether Settings has ever been opened yet —
// `useInstallPrompt` (hooks/useInstallPrompt.ts) just subscribes to whatever
// this module already holds.
//
// iOS/iPadOS Safari never fires this event at all — Apple has no
// programmatic install prompt, only the user-driven "Add to Home Screen"
// share-sheet action. `isIOSSafari` lets the Settings card show real
// instructions there instead of a button that would silently do nothing.
// ---------------------------------------------------------------------------

export type InstallOutcome = "accepted" | "dismissed" | "unavailable";

/**
 * Call once, early — from main.tsx, alongside `initPWA`/`initConnectivityClock`
 * — so this module is imported (and its listeners below registered) before
 * `beforeinstallprompt` has any chance to fire, not only once a doctor
 * happens to open Settings. The listeners themselves are module-level side
 * effects (they run the moment this file is first evaluated); this function
 * exists only to make that early import an explicit, visible call site,
 * matching every other `init*()` in main.tsx rather than a bare import for
 * its side effect.
 */
export function initInstallPrompt(): void {
    // Intentionally empty — importing this module IS the initialization.
}

interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let installed = isStandalone();
const listeners = new Set<() => void>();

function notify(): void {
    for (const l of listeners) l();
}

/** Already running as an installed app, on any platform that can tell us —
 *  the same two checks `features/support/supportTopics.ts` already reads
 *  for its device-diagnostics string, kept in sync deliberately. */
function isStandalone(): boolean {
    if (typeof window === "undefined") return false;
    if (window.matchMedia?.("(display-mode: standalone)").matches) return true;
    if ((navigator as { standalone?: boolean }).standalone) return true;
    return false;
}

if (typeof window !== "undefined") {
    window.addEventListener("beforeinstallprompt", (e) => {
        // Without this, Chrome shows its OWN mini-infobar immediately and
        // this module never gets to offer the doctor a deliberate moment —
        // "not now, I'm mid-consult" becomes the browser's decision, not theirs.
        e.preventDefault();
        deferredPrompt = e as BeforeInstallPromptEvent;
        notify();
    });
    // Fires whether install happened through THIS module's button or the
    // browser's own affordance (an omnibox icon) — either way, stop
    // offering to install something that's already installed.
    window.addEventListener("appinstalled", () => {
        deferredPrompt = null;
        installed = true;
        notify();
    });
}

/**
 * iOS/iPadOS Safari specifically — NOT "any WebKit", and not Chrome-on-iOS
 * (`CriOS`) or Firefox-on-iOS (`FxIOS`), which are Safari's WebKit under the
 * hood but cannot add to the home screen at all, so pointing them at the
 * Share-sheet instructions would be worse than saying nothing.
 */
export function isIOSSafari(): boolean {
    if (typeof navigator === "undefined") return false;
    const ua = navigator.userAgent;
    const isIOSDevice = /iphone|ipad|ipod/i.test(ua);
    // iPadOS 13+ reports its UA as a Mac; touch points is what actually
    // distinguishes it from a real Mac running Safari.
    const isIPadOS = navigator.platform === "MacIntel" && (navigator.maxTouchPoints ?? 0) > 1;
    const isSafari = /safari/i.test(ua) && !/crios|fxios|edgios/i.test(ua);
    return (isIOSDevice || isIPadOS) && isSafari;
}

export interface InstallPromptState {
    /** a real, capturable install prompt is available right now */
    installable: boolean;
    /** already running as an installed app — nothing to offer */
    installed: boolean;
    /** no programmatic prompt exists here — show manual instructions instead */
    isIOSSafari: boolean;
}

export function getInstallPromptState(): InstallPromptState {
    return { installable: !!deferredPrompt, installed, isIOSSafari: isIOSSafari() };
}

export function subscribeInstallPrompt(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

/**
 * Fires the captured native prompt. Must be called from a real user gesture
 * (a click handler) — like `<video>.play()` or clipboard access, calling it
 * any other way is silently ignored by the browser.
 */
export async function promptInstall(): Promise<InstallOutcome> {
    if (!deferredPrompt) return "unavailable";
    const toPrompt = deferredPrompt;
    // Chrome only ever honours ONE call to `.prompt()` per captured event —
    // clear it immediately so a doctor double-clicking the button cannot
    // fire a second, silently-ignored prompt.
    deferredPrompt = null;
    notify();
    await toPrompt.prompt();
    const choice = await toPrompt.userChoice;
    if (choice.outcome === "accepted") {
        installed = true;
        notify();
    }
    return choice.outcome;
}
