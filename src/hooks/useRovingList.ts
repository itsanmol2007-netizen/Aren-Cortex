// ---------------------------------------------------------------------------
// A CURSOR THAT WALKS A LIST, without the list knowing.
//
// Every ranked panel in the consult has the same shape — a search field above,
// rows below, one primary verb per row — so they all want the same three keys:
// ↑ ↓ to move and Enter to take. The obvious implementation is a `cursor`
// index in each card's state, and it is the wrong one here for a specific
// reason:
//
//   **These lists re-rank underneath the cursor.** The engine is a pure
//   function over the chart and it re-runs in the SAME FRAME a chip lands, so
//   the row at index 3 a moment ago is a different medicine now. An index in
//   React state is a claim about a list that has already changed; every card
//   holding one would need its own effect to reconcile, and that reconciliation
//   is exactly where an off-by-one puts the cursor on the wrong drug.
//
// So the cursor lives in the DOM, as a `data-cx-cursor` attribute, and is READ
// back from the DOM on every keystroke. There is no second copy to keep in
// step: if the row the cursor was on no longer exists, it is simply not found
// and the walk restarts from the top, which is also the honest behaviour.
//
// The second benefit is that a card adopts this in three lines and passes no
// new props to its rows. `RecommendationsCard`, `ConditionsCard`,
// `SuggestionsCard` and `PlanCard` all render different row components; what
// they share is a container and a CSS class, and that is all this needs. It
// also means the ranked list and the SEARCH RESULTS are walked by the same
// cursor without either knowing about the other — they render into the same
// container, so they are one list as far as this hook is concerned, which is
// what a doctor pressing ↓ already assumes.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useRef } from "react";

/** The attribute that IS the cursor. Styled in consult.css. */
const CURSOR_ATTR = "data-cx-cursor";

export interface RovingListOptions {
    /** the element the rows live inside */
    containerRef: React.RefObject<HTMLElement | null>;
    /** CSS selector matching one row, relative to the container */
    rowSelector: string;
    /**
     * CSS selector for the row's primary verb, searched INSIDE the row.
     *
     * A row whose action is missing — already taken, or withheld behind an
     * unacknowledged hard guard — is still walkable and simply does nothing on
     * Enter. That is deliberate: skipping those rows would make ↓ jump over a
     * red warning, which is the one thing guards exist to prevent.
     */
    actionSelector: string;
    /** false unmounts the cursor entirely — used while a card is disabled */
    enabled?: boolean;
}

export interface RovingList {
    /** every row currently on screen, in visual order */
    rows: () => HTMLElement[];
    current: () => HTMLElement | null;
    /** move the cursor; wraps at both ends, and starts at the top from nothing */
    move: (dir: 1 | -1) => void;
    /** press the current row's primary verb */
    activate: () => boolean;
    /** click the row body itself — for rows that expand rather than act */
    clickRow: () => HTMLElement | null;
    clear: () => void;
}

export function useRovingList({
    containerRef, rowSelector, actionSelector, enabled = true,
}: RovingListOptions): RovingList {
    // Only so the cleanup below can reach the container after it has been
    // detached from the ref by an unmount.
    const lastContainer = useRef<HTMLElement | null>(null);

    const rows = useCallback((): HTMLElement[] => {
        const root = containerRef.current;
        if (!root || !enabled) return [];
        lastContainer.current = root;
        return Array.from(root.querySelectorAll<HTMLElement>(rowSelector));
    }, [containerRef, rowSelector, enabled]);

    const current = useCallback((): HTMLElement | null => {
        const root = containerRef.current;
        if (!root || !enabled) return null;
        return root.querySelector<HTMLElement>(`[${CURSOR_ATTR}]`);
    }, [containerRef, enabled]);

    const clear = useCallback(() => {
        const root = containerRef.current ?? lastContainer.current;
        root?.querySelectorAll<HTMLElement>(`[${CURSOR_ATTR}]`)
            .forEach((el) => el.removeAttribute(CURSOR_ATTR));
    }, [containerRef]);

    const put = useCallback((row: HTMLElement | null) => {
        clear();
        if (!row) return;
        row.setAttribute(CURSOR_ATTR, "on");
        // `nearest` rather than `center`: the panels scroll inside the page
        // and centring every step makes the whole list crawl past the doctor
        // when they only moved down one row.
        row.scrollIntoView({ block: "nearest" });
    }, [clear]);

    const move = useCallback((dir: 1 | -1) => {
        const list = rows();
        if (list.length === 0) return;
        const at = current();
        const i = at ? list.indexOf(at) : -1;
        // From nothing, ↓ lands on the first row and ↑ on the last — the two
        // things a doctor means by "start at the top" and "start at the end".
        const next = i === -1
            ? (dir === 1 ? 0 : list.length - 1)
            : (i + dir + list.length) % list.length;
        put(list[next]);
    }, [rows, current, put]);

    const activate = useCallback((): boolean => {
        const row = current();
        if (!row) return false;
        const action = row.matches(actionSelector)
            ? row
            : row.querySelector<HTMLElement>(actionSelector);
        if (!action) return false;
        action.click();
        return true;
    }, [current, actionSelector]);

    const clickRow = useCallback((): HTMLElement | null => {
        const row = current();
        if (!row) return null;
        row.click();
        return row;
    }, [current]);

    // A cursor left behind on an unmounting panel would be styled onto
    // whatever React reuses the node for.
    useEffect(() => clear, [clear]);

    // Turning the card off takes the cursor with it, so re-enabling starts
    // clean rather than resuming on a row from a previous patient.
    useEffect(() => { if (!enabled) clear(); }, [enabled, clear]);

    return { rows, current, move, activate, clickRow, clear };
}
