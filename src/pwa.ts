// ---------------------------------------------------------------------------
// Service-worker registration + the "new version" prompt.
//
// vite.config.ts registers the plugin with `registerType: "prompt"`, so a new
// build installs its worker in the background and then WAITS. This file is
// what decides when it goes live: a toast the doctor taps between patients,
// never a reload that lands mid-consult and loses the unsaved plan.
//
// Called once from main.tsx. Safe to call when there is no SW support (older
// embedded webviews) — `registerSW` no-ops.
// ---------------------------------------------------------------------------

import { registerSW } from "virtual:pwa-register";
import { toast } from "sonner";
import { noteServiceWorker, noteUpdateWaiting } from "./lib/diagnostics/sessionTrace";

export function initPWA(): void {
    const updateSW = registerSW({
        onNeedRefresh() {
            // Also recorded for diagnostics: a doctor who never taps Reload is
            // running old code, which explains a whole class of "it's still
            // broken" without anyone having to ask. See sessionTrace.ts.
            noteUpdateWaiting();
            toast("A new version of Cortex is ready", {
                description: "Reload when you're between patients to pick it up.",
                duration: Infinity,
                action: {
                    label: "Reload",
                    onClick: () => void updateSW(true),
                },
            });
        },
        onOfflineReady() {
            // No popup — the doctor does not need to be told caching finished.
            console.info("[pwa] offline shell ready");
        },
        onRegisteredSW(url, registration) {
            // Re-check for a new build hourly while a tab stays open for a long
            // clinic day, so a shipped fix doesn't wait for a manual reload.
            if (!registration) return;
            noteServiceWorker(registration);
            setInterval(() => void registration.update(), 60 * 60 * 1000);
        },
    });
}
