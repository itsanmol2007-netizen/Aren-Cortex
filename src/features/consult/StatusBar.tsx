// ---------------------------------------------------------------------------
// STATUS BAR — priority 3, and it looks like it.
//
// Engine state, model version, specialty, cache state. The philosophy doc puts
// all of this in the lowest tier: supporting metadata, present so the doctor can
// trust the screen, never competing with it. It is deliberately the only thing
// on the page smaller and quieter than the body text.
// ---------------------------------------------------------------------------

import { Cloud, CloudOff, Keyboard } from "lucide-react";

interface Props {
    /** ruleset loaded and ranking */
    active: boolean;
    /** ruleset version string from the loaded ruleset */
    modelVersion: string | null;
    specialty: string;
    /** personalisation degraded — ranking still works, habits do not */
    degraded: boolean;
    /** signed-in account has no `doctors` row — running on the shared fallback identity */
    unidentified: boolean;
    online: boolean;
    /** opens the keyboard map — see the comment on the button */
    onOpenShortcuts: () => void;
}

export function StatusBar({
    active, modelVersion, specialty, degraded, unidentified, online, onOpenShortcuts,
}: Props) {
    return (
        <footer className="cs-status">
            <span className="cs-status-item">
                <b>Synapse</b>
                <span className={`cs-status-dot${active ? "" : " is-off"}`} />
                {active ? "Active" : "Loading"}
            </span>

            {modelVersion && (
                <span className="cs-status-item">
                    Model: <b>Synapse {modelVersion}</b>
                </span>
            )}

            <span className="cs-status-item">
                Specialty: <b>{specialty}</b>
            </span>

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
            <button
                type="button"
                className="cs-status-item cs-status-keys"
                onClick={onOpenShortcuts}
                aria-label="Keyboard shortcuts"
                title="Keyboard shortcuts"
            >
                <Keyboard size={13} />
                Shortcuts
                <kbd>?</kbd>
            </button>
        </footer>
    );
}
