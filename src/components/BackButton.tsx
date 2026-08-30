// ---------------------------------------------------------------------------
// BACK BUTTON — the one "return to my parent page" control in Cortex.
//
// Reversed 2026-08-30. This used to be a light bordered pill in the page's
// own body, top-left, below the dark `WorkspaceHeader` — a deliberate
// unification made earlier (Anmol: "keep every back button at one place...
// this back button is looking more better than top dark header") after the
// Prescription Editor had it top-right, inside the dark header, and Patient
// Record had it top-left, in the light body.
//
// Anmol, later, looking at Patient Record specifically: "back to all patient
// button is on the top left side below the dark header. It's a very terrible
// place for it... it should be on the top right side" — i.e. into the dark
// header after all. Rather than let the two pages drift apart again, this
// reverses the EARLIER decision everywhere it applies: every back button
// renders as a dark-glass pill (`.ws-back-btn`, workspace-header.css — same
// family as `.ws-stat-pill`) inside `WorkspaceHeader`'s `rightSlot`, top-
// right, never in the page's own light body. Pass it as that page's
// `rightSlot` (or the first element of one, if the page also has stat pills
// there).
//
// Scope: the doctor-facing Cortex app (`src/features/*`, excluding
// `frontdesk/`) — see the earlier version of this file for why Front Desk,
// a separate suite with its own navigation language, was never part of this.
// ---------------------------------------------------------------------------

import { ArrowLeft } from "lucide-react";

export function BackButton({ label, onClick }: { label: string; onClick: () => void }) {
    return (
        <button type="button" onClick={onClick} className="ws-back-btn">
            <ArrowLeft size={13} />
            <span>{label}</span>
        </button>
    );
}
