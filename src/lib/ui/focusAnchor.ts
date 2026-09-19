// ---------------------------------------------------------------------------
// DEEP-LINKING AN ELEMENT ACROSS A REAL ROUTE NAVIGATION — "take me to that
// card on a different page, and show me which one it is."
//
// Same job, same shape as `features/settings/settingsFocus.ts`, and
// deliberately a SEPARATE small module rather than a rename/move of that
// working one: this one needs to survive a real React Router navigation
// (Practice, mounted under `/app/cortex`, sending someone to `/app/admin` —
// two different routes in the same router, not an `activePage` swap inside
// one page's own sidebar), while `settingsFocus.ts` is wired specifically to
// that `activePage` re-run. A module-scoped "pending anchor" variable does
// not care which mechanism caused the next page to mount, so the same idea
// works for both — but touching the already-shipped Settings deep-link to
// generalise it is a bigger risk than a second small file.
//
// Usage: call `requestFocus(anchorId)` immediately before navigating, then
// call `useFocusOnMount()` once, near the top of the page that owns that
// anchor's id. It polls for the element (the page's own data may still be
// loading), scrolls it into view, and adds a flash class for a couple of
// seconds.
// ---------------------------------------------------------------------------

import { useEffect } from "react";

/** How long the highlight stays on the target — matches `.cx-focus-flash`'s
 *  own animation length plus a hair of margin (see admin.css). */
const FLASH_MS = 2700;

/** ~1s of animation frames — a target that hasn't rendered by then is
 *  either behind a slow fetch or isn't on this page at all. */
const MAX_FRAMES = 60;

const FLASH_CLASS = "cx-focus-flash";

let pendingAnchor: string | null = null;

/** Ask for the element with this DOM id to be scrolled to and highlighted
 *  once it exists on whatever page mounts next. Call immediately BEFORE
 *  navigating to that page. */
export function requestFocus(anchorId: string): void {
    pendingAnchor = anchorId;
}

/** Runs the pending request, if any, once on mount. Call this once, near
 *  the top of any page that might be the destination of a `requestFocus`
 *  call — cheap when nothing is pending (a single ref check, no polling). */
export function useFocusOnMount(): void {
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
            flashed?.classList.remove(FLASH_CLASS);
        };
    }, []);
}
