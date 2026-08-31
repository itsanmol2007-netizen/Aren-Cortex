// ---------------------------------------------------------------------------
// DEEP-LINKING A SINGLE SETTING — "take me to that switch, and show me which
// one it is."
//
// Settings in Cortex are deliberately NOT all on the Settings page. Clinic
// hours belong on Clinic next to the clinic's identity; preferred labs belong
// on Practice next to the medicines they sit beside. That is the right
// structure to USE and a bad structure to SEARCH — a doctor who remembers
// "there's a thing that decides which measurements the consult opens with"
// has no way to find it except by touring five pages.
//
// So the Settings page's search indexes every one of them
// (`settingsRegistry.ts`) and navigation lands on TWO things, not one: the
// page that owns the setting, and the setting itself, flashed for a couple of
// seconds so the eye lands on it — Anmol, 2026-08-31: "you will be redirected
// to that page, and not just that page, exactly that setting, a slight bit of
// highlight around that setting for some second."
//
// ── Why a module variable rather than a context
//
// The target page is not mounted yet when the request is made — that is the
// whole point, the request survives a navigation. A React context would need
// a provider above both the sender and a receiver that does not exist yet,
// and a state update would be lost in the unmount. One module-scoped pending
// anchor, consumed by whoever mounts next, is both smaller and the only shape
// that actually survives the gap.
//
// The retry loop exists for the same reason: `App`'s page swap and the target
// page's own first paint are not the same frame, and a card whose data is
// still loading may not exist for several more. It polls on animation frames
// for a bounded window and then gives up rather than flashing something that
// arrived a minute later, out of context.
// ---------------------------------------------------------------------------

import { useEffect } from "react";

/** How long the highlight stays on the target. Long enough to find it with
 *  your eye after a page transition, short enough not to become decoration. */
const FLASH_MS = 2400;

/** ~1s of animation frames. A card that has not rendered by then is either
 *  behind a slow fetch or does not exist on this page at all; either way,
 *  flashing it later would land after the doctor has moved on. */
const MAX_FRAMES = 60;

/** The class that draws the ring — see settings.css. */
const FLASH_CLASS = "cx-setting-flash";

let pendingAnchor: string | null = null;

/** Ask for `anchor` to be scrolled to and highlighted once it exists. Call
 *  this immediately BEFORE navigating to the page that owns it. */
export function requestSettingFocus(anchor: string): void {
    pendingAnchor = anchor;
}

/**
 * Runs the pending request, if any, whenever the active page changes.
 * Mounted once, at the app shell — every page gets this for free and no page
 * needs to know the mechanism exists.
 */
export function useSettingFocusRunner(activePage: string | null): void {
    useEffect(() => {
        if (!pendingAnchor) return;
        const anchor = pendingAnchor;

        let frames = 0;
        let raf = 0;
        let timer: ReturnType<typeof setTimeout> | undefined;
        let flashed: HTMLElement | null = null;

        const tick = () => {
            const el = document.getElementById(anchor);
            if (el) {
                pendingAnchor = null;
                flashed = el;
                el.scrollIntoView({ behavior: "smooth", block: "center" });
                el.classList.add(FLASH_CLASS);
                timer = setTimeout(() => el.classList.remove(FLASH_CLASS), FLASH_MS);
                return;
            }
            if (++frames > MAX_FRAMES) {
                pendingAnchor = null;
                return;
            }
            raf = requestAnimationFrame(tick);
        };

        raf = requestAnimationFrame(tick);

        return () => {
            cancelAnimationFrame(raf);
            if (timer) clearTimeout(timer);
            // Navigating away mid-flash must not leave the ring stuck on an
            // element that is about to be reused by another render.
            flashed?.classList.remove(FLASH_CLASS);
        };
    }, [activePage]);
}
