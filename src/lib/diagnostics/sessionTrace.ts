// ---------------------------------------------------------------------------
// WHAT HAPPENED BEFORE THE DOCTOR ASKED FOR HELP.
//
// Two ring buffers and nothing else. They exist so a support request can
// answer the two questions every "something isn't working" report raises and
// almost never contains: **where were you** and **did anything actually
// break**. A doctor should not have to know either; the browser already does.
//
// ── The rules this file obeys ─────────────────────────────────────────────
//
// 1. **In memory only.** Never localStorage, never a network call of its own.
//    It is read exactly once, when a doctor presses Send on Help & Support,
//    and dies with the tab otherwise.
//
// 2. **Never patient data.** It records page NAMES and error MESSAGES. It
//    does not record what was on the page, what was typed, or who the patient
//    was. An error string could in principle carry an id a developer put in a
//    message; that is why every entry is truncated hard and why nothing here
//    is ever stored or sent anywhere but AREN's own support mailbox, with the
//    doctor pressing the button.
//
// 3. **It cannot break the app.** Every handler is wrapped, the buffers are
//    fixed size, and a failure to record is a failure to record.
// ---------------------------------------------------------------------------

const MAX_ERRORS = 6;
const MAX_TRAIL = 8;
/** Long enough to identify a fault, short enough not to smuggle a payload. */
const MAX_MESSAGE = 180;

type CapturedError = { at: number; what: string; where?: string };

const errors: CapturedError[] = [];
const trail: { at: number; page: string }[] = [];
let installed = false;

function clip(s: unknown): string {
    const t = String(s ?? "").replace(/\s+/g, " ").trim();
    return t.length > MAX_MESSAGE ? `${t.slice(0, MAX_MESSAGE)}…` : t;
}

function push(e: CapturedError) {
    // The same error firing in a render loop would otherwise fill the buffer
    // with one line and push out the interesting ones.
    const last = errors[errors.length - 1];
    if (last && last.what === e.what) return;
    errors.push(e);
    if (errors.length > MAX_ERRORS) errors.shift();
}

/**
 * Start listening. Called once from `main.tsx`, before React mounts, so a
 * crash during the first render is caught too.
 */
export function installSessionTrace(): void {
    if (installed || typeof window === "undefined") return;
    installed = true;

    window.addEventListener("error", (ev) => {
        try {
            // Failed <img>/<script> loads also arrive here, as ErrorEvents with
            // no `.error`. Those are worth keeping — a blocked CDN or a missing
            // asset is a real support case — but they are labelled so nobody
            // hunts for a stack that never existed.
            const target = ev.target as HTMLElement | null;
            if (target && target !== (window as unknown as HTMLElement) && "tagName" in target) {
                push({ at: Date.now(), what: `failed to load <${target.tagName.toLowerCase()}>`, where: clip((target as HTMLImageElement).src) });
                return;
            }
            push({ at: Date.now(), what: clip(ev.message), where: ev.filename ? `${clip(ev.filename)}:${ev.lineno}` : undefined });
        } catch { /* recording must never be the thing that breaks */ }
    }, true);

    window.addEventListener("unhandledrejection", (ev) => {
        try {
            const r = ev.reason;
            push({ at: Date.now(), what: `unhandled rejection: ${clip(r instanceof Error ? r.message : r)}` });
        } catch { /* as above */ }
    });
}

/** Record which page the doctor moved to. Called from App.tsx on nav. */
export function notePage(page: string): void {
    const last = trail[trail.length - 1];
    if (last && last.page === page) return;
    trail.push({ at: Date.now(), page });
    if (trail.length > MAX_TRAIL) trail.shift();
}

function ago(at: number): string {
    const s = Math.round((Date.now() - at) / 1000);
    if (s < 60) return `${s}s ago`;
    const m = Math.round(s / 60);
    return m < 60 ? `${m}m ago` : `${Math.round(m / 60)}h ago`;
}

/** "practice → clinic → support" — the route in, newest last. */
export function pageTrail(): string {
    return trail.map((t) => t.page).join(" → ");
}

/** The page before this one. The single most useful line in a fault report. */
export function previousPage(): string | null {
    return trail.length >= 2 ? trail[trail.length - 2].page : null;
}

/** "TypeError: x is not a function (4m ago)" — newest first, or null. */
export function recentErrors(): string | null {
    if (!errors.length) return null;
    return [...errors]
        .reverse()
        .map((e) => `${e.what}${e.where ? ` [${e.where}]` : ""} (${ago(e.at)})`)
        .join(" · ");
}

// ── Service worker: are they running the code we think they are? ──────────
//
// AREN registers with `registerType: "prompt"` (vite.config.ts) so a new build
// never reloads a tab mid-consult. The consequence is that a doctor can sit on
// a stale bundle indefinitely and has no way to know — and neither does
// support, unless it is asked. `src/pwa.ts` reports both facts here.

let swRegistration: ServiceWorkerRegistration | null = null;
let updateWaiting = false;

export function noteServiceWorker(reg: ServiceWorkerRegistration): void {
    swRegistration = reg;
}

export function noteUpdateWaiting(): void {
    updateWaiting = true;
}

/** One line for the support mail. */
export function appVersionState(): string {
    try {
        if (typeof navigator === "undefined" || !navigator.serviceWorker) return "no service worker";
        if (updateWaiting || swRegistration?.waiting) return "UPDATE WAITING — still running old code";
        if (!navigator.serviceWorker.controller) return "not yet controlled (first load)";
        return "up to date";
    } catch {
        return "unknown";
    }
}

/** For tests and the "send another" reset — not used in normal operation. */
export function __resetSessionTrace(): void {
    errors.length = 0;
    trail.length = 0;
    updateWaiting = false;
    swRegistration = null;
}
