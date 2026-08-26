// ---------------------------------------------------------------------------
// BLANK-STATE ART.
//
// One drawing per empty panel, drawn rather than described.
//
// A blank panel that shows something still reads as a designed surface. One
// that prints only a sentence of grey reads as an unfinished screen, and on a
// consult that has just opened, EVERY panel is blank at once, so the whole
// workspace was reading as unfinished. That is the complaint this file exists
// to answer.
//
// Rules these follow, so they read as one family rather than five clip-art
// choices:
//
//  * Inline SVG, never an asset. They inherit the page's colour tokens, cost
//    no request, and scale without a second file.
//  * ONE line weight (1.5-1.7px) and one corner radius across all of them.
//  * The palette is the standing colour rule, used at its lightest: rose for
//    reported, teal for examined, violet for history and assessment, blue for
//    the action. Never a new hue, and never a hue that means something else.
//  * Small, 44-62px. The drawing is a mark that the panel is alive and waiting,
//    not an illustration competing with the card beside it.
//  * Subject is always THE THING THAT WILL FILL THIS PANEL, at rest. An empty
//    pill sheet, an empty tray, an unmarked chart. Never a magnifying glass,
//    never a sad face, never a shrug.
// ---------------------------------------------------------------------------

/** The empty ranked-medicine panel: a blister sheet, not yet dispensed. */
export function BlankMedicineArt() {
    return (
        <svg width="56" height="46" viewBox="0 0 56 46" fill="none" aria-hidden="true">
            <rect x="12" y="9" width="32" height="28" rx="5"
                fill="#fbfdfc" stroke="#cfe4dc" strokeWidth="1.6" />
            <circle cx="21" cy="19" r="3.6" fill="#e6f5ee" stroke="#bde0d0" strokeWidth="1.3" />
            <circle cx="32" cy="19" r="3.6" fill="#e6f5ee" stroke="#bde0d0" strokeWidth="1.3" />
            <circle cx="21" cy="28" r="3.6" fill="#f2f7f5" stroke="#d5e7e0" strokeWidth="1.3" />
            <circle cx="32" cy="28" r="3.6" fill="#f2f7f5" stroke="#d5e7e0" strokeWidth="1.3" />
            <path d="M48 6l.75 1.75L50.5 8.5l-1.75.75L48 11l-.75-1.75L45.5 8.5l1.75-.75z"
                fill="#a7ddcb" />
        </svg>
    );
}

/** The empty investigations panel: a specimen tube, unfilled. */
export function BlankTestArt() {
    return (
        <svg width="52" height="46" viewBox="0 0 52 46" fill="none" aria-hidden="true">
            <path d="M20 8h12v20a6 6 0 0 1-12 0z"
                fill="#fbfcff" stroke="#cdd9ef" strokeWidth="1.6" strokeLinejoin="round" />
            <path d="M18 8h16" stroke="#b9c8e6" strokeWidth="1.8" strokeLinecap="round" />
            {/* the level it has not been filled to */}
            <path d="M20.6 24h10.8" stroke="#dbe4f5" strokeWidth="1.5" strokeLinecap="round" />
            <path d="M40 14l.7 1.6 1.6.7-1.6.7-.7 1.6-.7-1.6-1.6-.7 1.6-.7z" fill="#b9d1f7" />
            <path d="M11 27l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4L9 29.6l1.4-.6z" fill="#d7e3f8" />
        </svg>
    );
}

/** The empty ranked-conditions list: an unranked card, rows waiting for a
 *  number. Violet, matching Assessment's own tile colour — distinct from
 *  `BlankSelectedArt` below, which is the SEPARATE confirmed-diagnosis tray
 *  further down the same card, not this one. Never had art before
 *  (2026-08-25 handoff) — this is the missing half. */
export function BlankConditionArt() {
    return (
        <svg width="52" height="46" viewBox="0 0 52 46" fill="none" aria-hidden="true">
            <rect x="10" y="8" width="32" height="30" rx="5"
                fill="#fbfaff" stroke="#ddd4f7" strokeWidth="1.6" />
            <circle cx="18" cy="17" r="3.4" fill="#f2edfd" stroke="#c4b5fd" strokeWidth="1.3" />
            <path d="M25 17h11" stroke="#e3dbf9" strokeWidth="1.6" strokeLinecap="round" />
            <circle cx="18" cy="27" r="3.4" fill="#f2edfd" stroke="#ded5f8" strokeWidth="1.3" />
            <path d="M25 27h8" stroke="#e9e2fa" strokeWidth="1.6" strokeLinecap="round" />
            <path d="M46 6l.8 1.9 1.9.8-1.9.8L46 11.4l-.8-1.9-1.9-.8 1.9-.8z" fill="#c4b5fd" />
        </svg>
    );
}

/** The empty confirmed-diagnosis column: a tray waiting to receive. */
export function BlankSelectedArt() {
    return (
        <svg width="52" height="44" viewBox="0 0 52 44" fill="none" aria-hidden="true">
            <path d="M12 20v10a3 3 0 0 0 3 3h22a3 3 0 0 0 3-3V20h-8.5l-2.2 3.4h-6.6L20.5 20z"
                fill="#fbfaff" stroke="#d7cbf5" strokeWidth="1.6" strokeLinejoin="round" />
            <path d="M17 20l3.5-9h11l3.5 9" stroke="#ddd4f7" strokeWidth="1.5" strokeLinejoin="round" />
            <path d="M44 9l.8 1.9 1.9.8-1.9.8-.8 1.9-.8-1.9-1.9-.8 1.9-.8z" fill="#c4b5fd" />
            <path d="M8 13l.6 1.4 1.4.6-1.4.6L8 17.6l-.6-1.4L6 15.6l1.4-.6z" fill="#e0d8fb" />
        </svg>
    );
}

/** The empty consultation plan: a prescription pad, nothing written yet.
 *  Blue, matching the rail's own accent — was a bare lucide `ClipboardList`
 *  dropped straight into the markup, the one place in this file's family
 *  that wasn't inline SVG drawn to the same rules as the rest (Anmol,
 *  2026-08-25's design-DNA ask: "use the existing SVG/icon system; no
 *  random decorative icons"). */
export function BlankPlanArt() {
    return (
        <svg width="46" height="46" viewBox="0 0 46 46" fill="none" aria-hidden="true">
            <rect x="11" y="6" width="24" height="34" rx="4"
                fill="#fbfcff" stroke="#c9dbf7" strokeWidth="1.6" />
            <path d="M17 4.5h12a2 2 0 0 1 2 2V8H15V6.5a2 2 0 0 1 2-2z"
                fill="#eaf1fd" stroke="#c9dbf7" strokeWidth="1.4" />
            <path d="M16.5 18h13M16.5 24h13M16.5 30h8" stroke="#dbe4f5"
                strokeWidth="1.6" strokeLinecap="round" />
            <path d="M38 30l.75 1.75L40.5 32.5l-1.75.75L38 35l-.75-1.75L35.5 32.5l1.75-.75z"
                fill="#b9d1f7" />
        </svg>
    );
}

/** The empty clinic-default-brands list (Practice page): a badge with no
 *  ribbon pinned to it yet — the shape a declared default takes once the
 *  clinic sets one, at rest before anything has been declared. Blue, the
 *  same family as `BlankTestArt` — a clinic brand default is a declared
 *  ACTION (see the seven-colour rule), not a reading. */
export function BlankBrandArt() {
    return (
        <svg width="50" height="46" viewBox="0 0 50 46" fill="none" aria-hidden="true">
            <circle cx="24" cy="18" r="11" fill="#fbfcff" stroke="#cdd9ef" strokeWidth="1.6" />
            <path d="M20.5 18l2.4 2.4 5-5" stroke="#dbe4f5" strokeWidth="1.6"
                strokeLinecap="round" strokeLinejoin="round" />
            <path d="M19 27l-3 8 8-3.4 8 3.4-3-8" stroke="#cdd9ef" strokeWidth="1.5"
                strokeLinecap="round" strokeLinejoin="round" />
            <path d="M42 8l.7 1.6 1.6.7-1.6.7-.7 1.6-.7-1.6-1.6-.7 1.6-.7z" fill="#b9d1f7" />
        </svg>
    );
}

/** The empty doctor's-terms list (Practice page): a tag with nothing
 *  written on it. Violet, matching every OTHER "your own notes, not the
 *  catalogue" surface in Cortex (the free-text fallback rows, §4). */
export function BlankTermArt() {
    return (
        <svg width="52" height="44" viewBox="0 0 52 44" fill="none" aria-hidden="true">
            <path d="M14 12h16l10 10-13 13-13-13z"
                fill="#fbfaff" stroke="#ddd4f7" strokeWidth="1.6" strokeLinejoin="round" />
            <circle cx="19" cy="17" r="2.2" fill="#f2edfd" stroke="#c4b5fd" strokeWidth="1.3" />
            <path d="M44 9l.8 1.9 1.9.8-1.9.8L44 14.4l-.8-1.9-1.9-.8 1.9-.8z" fill="#c4b5fd" />
        </svg>
    );
}

/** The empty attachments strip: a sheet with nothing clipped to it. */
export function BlankAttachmentArt() {
    return (
        <svg width="48" height="42" viewBox="0 0 48 42" fill="none" aria-hidden="true">
            <rect x="13" y="7" width="22" height="28" rx="3.5"
                fill="#fbfcfe" stroke="#d9e0ec" strokeWidth="1.6" />
            <path d="M19 16h10M19 22h10M19 28h6" stroke="#dde4ef"
                strokeWidth="1.6" strokeLinecap="round" />
            <path d="M31 4.5v7a3 3 0 0 1-6 0V5a1.9 1.9 0 0 1 3.8 0v6"
                stroke="#b9c8e6" strokeWidth="1.6" strokeLinecap="round" fill="none" />
        </svg>
    );
}
