// ---------------------------------------------------------------------------
// STATUS BAR — priority 3, and now usually not there at all.
//
// Cut down twice. 2026-09-11 removed the build/debug facts (engine active,
// model version, specialty) that a doctor never asked to see. 2026-09-13
// removed the last two RESIDENT items — the "Data cached locally" pill and
// the keyboard-shortcuts button — because between them they were holding a
// bordered, padded strip open across the bottom of every consult to say
// nothing that changes: "you're wasting vertical bottom space to just show
// these two shits... let that bottom vertical space reserved now be used
// for actual consultation workspace" (Anmol).
//
// The shortcuts affordance did not die, it MOVED — to the Consultation Plan
// header's top-right, which is on screen just as permanently and already
// has a row of controls for exactly this kind of thing. See PlanCard.
//
// What is left only renders when it has something to say: `degraded` and
// `unidentified` are real state that changes what to trust on screen. On a
// normal consult this component returns null and costs zero pixels.
// ---------------------------------------------------------------------------

interface Props {
    /** personalisation degraded — ranking still works, habits do not */
    degraded: boolean;
    /** signed-in account has no `doctors` row — running on the shared fallback identity */
    unidentified: boolean;
}

export function StatusBar({ degraded, unidentified }: Props) {
    // Nothing to say, no bar at all — not an empty bar still paying for its
    // border, padding and line-height. Anmol, 2026-09-13: "you're wasting
    // vertical bottom space to just show these two shits... let that bottom
    // vertical space reserved now be used for actual consultation
    // workspace." On a normal consult both flags are false, so this strip
    // now costs the workspace exactly zero pixels, and reappears only when
    // there is a real warning to carry.
    if (!degraded && !unidentified) return null;

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

        </footer>
    );
}
