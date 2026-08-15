// ---------------------------------------------------------------------------
// AN OVERLAY TAKES FOCUS WHEN IT OPENS, AND GIVES IT BACK WHEN IT CLOSES.
//
// Found the hard way, 2026-08-15: `MedicineAddSheet` is opened by Enter on a
// ranked row and nothing moved focus, so focus stayed in the medicine search
// field — now sitting behind the scrim. Every bare-key binding inside the
// sheet (the 1-4 dose slots, 0 for SOS) was silently dropped, because the
// keystroke belonged to a text input and the keymap correctly refuses a
// non-`whileTyping` binding whenever that's true. Enter still worked, which is
// exactly what made it invisible: the common path was fine and only the
// shortcuts were dead.
//
// The rule this leaves behind: **an overlay that can be driven by the
// keyboard MUST hold focus while it is open.** Not as a case-by-case fix —
// every overlay in this app needs the identical three steps (remember what had
// focus, take it, give it back), so this hook is the one place that logic
// lives. `MedicineAddSheet` and `ReviewModal` had it inline before this; both
// now call this instead.
//
// ── Why the whole surface is visibly focused, not silently ─────────────────
// A doctor looking at the screen has to be able to answer "if I press a key
// right now, where does it go?" without guessing. So the container this hook
// focuses is never given `outline: none` — see `.cx-kbd-surface` in the
// stylesheets. Suppressing the ring on the ground that "it's a landing pad,
// not a control" was the mistake; the landing pad is precisely the thing that
// needs to be visible.
// ---------------------------------------------------------------------------

import { useEffect, useRef } from "react";

/**
 * @param ref     the element to focus. `tabIndex={-1}` on it if it is not
 *                naturally focusable (a container div/section) — programmatic
 *                focus only, never a Tab stop of its own.
 * @param active  when this is `true`, the ref is focused and the previously
 *                focused element is remembered. When it goes back to `false`
 *                — or the component unmounts while it was `true` — focus
 *                returns to what it was before. Defaults to `true`, which is
 *                right for anything that only ever MOUNTS while open
 *                (`BrandSheet`, `ContributionSheet`, `ActiveConsultGuard`,
 *                `BrowseSheet`). Pass the real flag for anything that stays
 *                mounted and toggles visibility instead (`MedicineAddSheet`'s
 *                `open` prop, `Sidebar`'s `isOpen`).
 */
export function useOverlayFocus(
    ref: React.RefObject<HTMLElement | null>,
    active = true,
): void {
    const returnTo = useRef<HTMLElement | null>(null);

    useEffect(() => {
        if (!active) return;
        returnTo.current = document.activeElement as HTMLElement | null;
        // Next frame: for a component that only mounts while open, the ref's
        // node has only just been attached; for `AnimatePresence`-driven ones
        // it needs a tick to exist in the accessibility tree at all.
        //
        // `preventScroll: true` — found 2026-08-15 while chasing "the why
        // popup opens and then nothing responds": several of these overlays
        // (`BrandSheet`, and the popover this hook no longer manages) close
        // THEMSELVES on any page scroll, because a scroll usually means the
        // row they are anchored to has moved. A plain `.focus()` call is
        // allowed to scroll its target into view as a side effect, and a
        // `position: fixed` popover that is already fully on screen is
        // exactly the case where that side-effect scroll is pure noise — but
        // it still fires a `scroll` event, which those overlays' own
        // listeners would read as "the anchor moved" and close on the spot.
        // `preventScroll` stops the browser from ever taking that step, so
        // taking focus can no longer trigger an overlay closing itself.
        const frame = window.requestAnimationFrame(() => ref.current?.focus({ preventScroll: true }));
        return () => {
            window.cancelAnimationFrame(frame);
            const back = returnTo.current;
            returnTo.current = null;
            // Guard the node still being in the document: a patient switch, or
            // the sidebar navigating away, can unmount the opener itself while
            // this overlay was open.
            if (back?.isConnected) back.focus({ preventScroll: true });
        };
    }, [active, ref]);
}
