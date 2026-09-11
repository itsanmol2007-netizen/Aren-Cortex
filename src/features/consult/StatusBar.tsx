// ---------------------------------------------------------------------------
// STATUS BAR — priority 3, and it looks like it.
//
// Cut down 2026-09-11 — Anmol: "Signups Active, Model Signups, MVP1,
// Specialty, General OPD... these are simply useless things here... I want
// [to keep] this 'Data Cache Locally' [indicator]... that will just unlock
// slightly more vertical space." The engine-active line, the model version,
// and the specialty label were all internal build/debug facts a doctor never
// asked to see and could do nothing with — the philosophy doc's "lowest
// tier" was still one tier too high for them. What's left is what a doctor
// can actually act on: `degraded`/`unidentified` (real state that changes
// what to trust on screen), the cache/online indicator, and the keyboard
// shortcuts affordance (kept, but text-less now — the icon + `?` hint is
// the whole point per this component's own note below).
// ---------------------------------------------------------------------------

import { Cloud, CloudOff, Keyboard } from "lucide-react";

interface Props {
    /** personalisation degraded — ranking still works, habits do not */
    degraded: boolean;
    /** signed-in account has no `doctors` row — running on the shared fallback identity */
    unidentified: boolean;
    online: boolean;
    /** opens the keyboard map — see the comment on the button */
    onOpenShortcuts: () => void;
}

export function StatusBar({
    degraded, unidentified, online, onOpenShortcuts,
}: Props) {
    return (
        <footer className="cs-status">
            {/* Said out loud rather than hidden: a doctor whose personalisation
                failed still gets the global evidence-based ranking, which is
                exactly what every doctor gets on their first day. They should
                know which one they are looking at. */}
            {degraded && (
                <span className="cs-status-item">
                    <b>Personalisation unavailable</b> — global ranking in use
                </span>
            )}

            {/* Distinct from `degraded`: this account has no `doctors` row at all,
                so nothing it does here can be attributed to a doctor. Ranking still
                works — global evidence is identical for everyone — but nothing this
                consult does teaches this account's model, and the decision log skips
                it outright. Silence here would leave a signed-in doctor wondering why
                their habits never seem to stick. */}
            {unidentified && (
                <span className="cs-status-item">
                    <b>No doctor profile</b> — this consult won't be personalised or logged
                </span>
            )}

            <span className="cs-status-item is-right">
                {online ? <Cloud size={13} /> : <CloudOff size={13} />}
                {online ? "Data cached locally" : "Offline — working from cache"}
            </span>

            {/* ── The way in to the keyboard map ──────────────────────────────
                "?" has opened this since the sheet was built and nothing on
                screen ever said so, which makes it a shortcut for people who
                already know it — the exact opposite of what a help affordance
                is for.

                It lives in the status bar rather than the sidebar because the
                sidebar is two clicks away behind an overlay, and this is
                needed WHILE working. The status bar is priority-3 metadata by
                the philosophy doc, and a permanently available help control is
                precisely that: present so the doctor can trust the screen,
                never competing with it. The chord is printed on the button, so
                the button teaches its own replacement and a doctor only needs
                it once. */}
            {/* Text-less now (was icon + "Shortcuts" + `?`) — the icon and the
                chord it opens with are the whole affordance; the label was
                the one line here that was pure repetition of `title`/
                `aria-label`, not new information. */}
            <button
                type="button"
                className="cs-status-item cs-status-keys"
                onClick={onOpenShortcuts}
                aria-label="Keyboard shortcuts"
                title="Keyboard shortcuts"
            >
                <Keyboard size={13} />
                <kbd>?</kbd>
            </button>
        </footer>
    );
}
