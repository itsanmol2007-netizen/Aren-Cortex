// ---------------------------------------------------------------------------
// DISMISS ON OUTSIDE CLICK / ESCAPE.
//
// Every small menu on this screen (the Attach type list, "Add Measurement",
// the sort filters) was open-until-you-pick-something: clicking the page
// behind them did nothing, so the only ways out were choosing an option you
// did not want or clicking the trigger again. On a workspace with several of
// these, that is a menu left hanging over the card below it.
//
// One hook rather than four copies of the same effect, because the failure
// mode when these drift apart is that one menu closes on outside click and the
// next one does not, and the doctor cannot tell which is which.
//
// Two details that matter:
//
//  * `mousedown`, not `click`. A menu that closes on mouseup can lose the
//    click to the element underneath it as the DOM changes between press and
//    release.
//  * NOT in the capture phase. Capture would fire before the trigger's own
//    handler, so pressing the trigger to close a menu would close it here and
//    the trigger would immediately reopen it. Guarding the trigger explicitly
//    is what `ignore` is for.
// ---------------------------------------------------------------------------

import { useEffect, type RefObject } from "react";

export function useDismiss(
    open: boolean,
    onClose: () => void,
    /** the menu itself, plus anything else that must not count as "outside" */
    refs: RefObject<HTMLElement | null>[]
) {
    useEffect(() => {
        if (!open) return;

        const inside = (t: Node | null) =>
            !!t && refs.some((r) => r.current && r.current.contains(t));

        const onDown = (e: MouseEvent) => {
            if (!inside(e.target as Node)) onClose();
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") { e.stopPropagation(); onClose(); }
        };

        document.addEventListener("mousedown", onDown);
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("mousedown", onDown);
            document.removeEventListener("keydown", onKey);
        };
        // `refs` is a fresh array each render by construction; its CONTENTS are
        // stable refs, so keying on `open` and the callback is correct and
        // keying on the array identity would re-bind on every render.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, onClose]);
}
