// ---------------------------------------------------------------------------
// SUPPORT TICKET STATUS — one label, one colour, one place. Same reasoning
// as `features/patients/visitStatus.ts`: a category the ticket list AND the
// thread header would otherwise each re-derive independently, and the two
// go out of sync the first time one of them is edited and the other isn't.
//
// `support_requests.status` is Master Control's column (see
// `docs/admin-panel/SUPPORT-REQUESTS.md` — "status is yours, not the
// doctor's"). This file only TRANSLATES it for a doctor to read; nothing in
// Cortex writes it.
// ---------------------------------------------------------------------------

import type { SupportTicketStatus } from "../../lib/db/support";

export interface StatusTone {
    /** What a doctor sees — never the raw column value. */
    label: string;
    color: string;
    /** Tinted background for a pill built from `color` at low opacity. */
    soft: string;
    /** The one status a doctor should feel is asking something of THEM. */
    pulses: boolean;
}

const AMBER = "#c9791a";
const VIOLET = "#7c5cf0";
const BLUE = "#1268e8";
const GREEN = "#1c8a4d";
const SLATE = "#8a91a0";

export const SUPPORT_STATUS: Record<SupportTicketStatus, StatusTone> = {
    open: { label: "Under review", color: AMBER, soft: "rgba(201,121,26,0.10)", pulses: false },
    in_progress: { label: "Investigating", color: VIOLET, soft: "rgba(124,92,240,0.10)", pulses: false },
    // The one status that means "we're waiting on you" — a pulsing dot is
    // reserved for this alone, the same restraint `tb-active-dot` uses
    // elsewhere: a pulse that means something only works if it doesn't also
    // mean four other things.
    waiting_on_doctor: { label: "Action needed from you", color: BLUE, soft: "rgba(18,104,232,0.10)", pulses: true },
    resolved: { label: "Resolved", color: GREEN, soft: "rgba(28,138,77,0.10)", pulses: false },
    closed: { label: "Closed", color: SLATE, soft: "rgba(138,145,160,0.10)", pulses: false },
};

/** True once nothing further is expected from either side. */
export function isTicketDone(status: SupportTicketStatus): boolean {
    return status === "resolved" || status === "closed";
}

export function isTicketActive(status: SupportTicketStatus): boolean {
    return !isTicketDone(status);
}
