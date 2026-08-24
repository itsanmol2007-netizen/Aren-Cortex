// ---------------------------------------------------------------------------
// FULL-PAGE PLACEHOLDER ART — the hero mark on a destination that is real
// (it's in the sidebar, it has a name and a job) but not built yet.
//
// A different job than `features/consult/BlankArt.tsx`'s tiny 44-62px glyphs,
// which sit in the corner of a card that has other content around it. These
// sit alone in the middle of an otherwise-empty page, so they carry more of
// the screen and are drawn bigger (72-104px) — but the same house rules
// still apply: inline SVG (inherits nothing external, costs no request,
// scales clean), one line weight, one corner-radius family, and the subject
// is always THE THING ITSELF at rest — a conversation, a building, a person
// to call — never a generic "under construction" icon.
//
// Communication is the one deliberate exception to "never a new hue": it
// illustrates a specific real integration (WhatsApp), and WhatsApp's own
// green is the fastest way to say that without a caption. Clinic and Support
// stay inside the app's own blue/indigo family, same reasoning the sidebar
// badges now follow (SidebarNav.tsx).
// ---------------------------------------------------------------------------

/** Communication — two conversations, mid-exchange, nothing invented about
 *  what they'll contain. Green because this specific page is about WhatsApp,
 *  not a generic inbox — an original chat-bubble drawing, not the WhatsApp
 *  glyph itself. */
export function CommunicationArt() {
    return (
        <svg width="96" height="88" viewBox="0 0 96 88" fill="none" aria-hidden="true">
            {/* back bubble — the other side of the conversation */}
            <path
                d="M20 14h40a10 10 0 0 1 10 10v16a10 10 0 0 1-10 10H46l-9 8v-8h-17a10 10 0 0 1-10-10V24a10 10 0 0 1 10-10z"
                fill="#eafcf1" stroke="#bfe8cf" strokeWidth="1.6" strokeLinejoin="round"
            />
            {/* front bubble — carries the "sent" mark, so it reads as live */}
            <path
                d="M34 30h38a10 10 0 0 1 10 10v14a10 10 0 0 1-10 10H60l-8 9v-9H34a10 10 0 0 1-10-10V40a10 10 0 0 1 10-10z"
                fill="#dff7e8" stroke="#8fd4ab" strokeWidth="1.7" strokeLinejoin="round"
            />
            <path d="M42 44h30M42 51h22M42 58h16" stroke="#5fbb82" strokeWidth="1.8" strokeLinecap="round" />
            {/* the double-tick — a read receipt, the one detail that says
                "this is a real message thread", not a chat icon in general */}
            <g transform="translate(66 22)">
                <circle cx="9" cy="9" r="9" fill="#25d366" />
                <path d="M4.5 9.2l2.6 2.6 5-5.6" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            </g>
            <path d="M86 12l1 2.3 2.3 1-2.3 1L86 18.6l-1-2.3-2.3-1 2.3-1z" fill="#a7e0bb" />
            <path d="M10 60l.8 1.9 1.9.8-1.9.8-.8 1.9-.8-1.9L8 62.7l1.9-.8z" fill="#bfe8cf" />
        </svg>
    );
}

/** Clinic — the building itself: a front elevation, a door, a cross over it
 *  the way an Indian clinic's signage actually reads. Indigo, the same
 *  family the sidebar's Clinic badge now carries. */
export function ClinicArt() {
    return (
        <svg width="92" height="88" viewBox="0 0 92 88" fill="none" aria-hidden="true">
            <path d="M46 10l32 18v4H14v-4z" fill="#ece9fe" stroke="#c7bffa" strokeWidth="1.6" strokeLinejoin="round" />
            <rect x="17" y="32" width="58" height="42" rx="3" fill="#f6f4fe" stroke="#c7bffa" strokeWidth="1.6" />
            <rect x="24" y="40" width="9" height="9" rx="1.5" fill="#e2ddfb" stroke="#b3a8f5" strokeWidth="1.3" />
            <rect x="59" y="40" width="9" height="9" rx="1.5" fill="#e2ddfb" stroke="#b3a8f5" strokeWidth="1.3" />
            <rect x="24" y="55" width="9" height="9" rx="1.5" fill="#e2ddfb" stroke="#b3a8f5" strokeWidth="1.3" />
            <rect x="59" y="55" width="9" height="9" rx="1.5" fill="#e2ddfb" stroke="#b3a8f5" strokeWidth="1.3" />
            <rect x="40" y="52" width="12" height="22" rx="1.5" fill="#ffffff" stroke="#b3a8f5" strokeWidth="1.6" />
            <circle cx="49" cy="63" r="1.3" fill="#8b7cf6" />
            {/* the cross on the awning — the one detail that says "clinic",
                not "office building" */}
            <g stroke="#7c3aed" strokeWidth="2" strokeLinecap="round">
                <path d="M46 16v10" />
                <path d="M41 21h10" />
            </g>
            <path d="M84 30l.9 2 2 .9-2 .9-.9 2-.9-2-2-.9 2-.9z" fill="#c7bffa" />
            <path d="M9 50l.7 1.6 1.6.7-1.6.7-.7 1.6-.7-1.6L7 52.3l1.6-.7z" fill="#ddd4f7" />
        </svg>
    );
}

/** Support — a person to call, drawn as a headset. The one detail that
 *  makes it a support page rather than a phone icon in general is the small
 *  "live" dot, the same signal `.tb-active-dot` uses in the topbar. */
export function SupportArt() {
    return (
        <svg width="76" height="72" viewBox="0 0 76 72" fill="none" aria-hidden="true">
            <path d="M20 34a18 18 0 0 1 36 0v14" stroke="#bcd6fb" strokeWidth="2" strokeLinecap="round" fill="none" />
            <rect x="12" y="30" width="12" height="18" rx="5" fill="#eaf2fe" stroke="#93c5fd" strokeWidth="1.7" />
            <rect x="52" y="30" width="12" height="18" rx="5" fill="#eaf2fe" stroke="#93c5fd" strokeWidth="1.7" />
            <path d="M52 46v3a7 7 0 0 1-7 7h-6" stroke="#93c5fd" strokeWidth="1.8" strokeLinecap="round" fill="none" />
            <circle cx="35" cy="56" r="4.5" fill="#fbfdff" stroke="#93c5fd" strokeWidth="1.7" />
            <circle cx="63" cy="34" r="3.4" fill="#22c55e" stroke="#fbfdff" strokeWidth="1.6" />
            <path d="M8 16l.8 1.9 1.9.8-1.9.8L8 21.4l-.8-1.9L5.3 18.7l1.9-.8z" fill="#bcd6fb" />
        </svg>
    );
}
