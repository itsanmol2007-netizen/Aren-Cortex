// ---------------------------------------------------------------------------
// A small, explicit list of actions that stay online-only rather than being
// queued — a deliberate scope decision, not an oversight. Adding a brand-new
// medicine to the catalogue creates a real database id that a same-session
// prescription would need to reference; queuing both writes independently
// (this app's write queue treats every queued write as independent of every
// other, by design — see writeQueue.ts) would mean either inventing a fake
// id up front and reconciling it later, or resolving the later write by
// name instead of id. Both are real, buildable designs — deliberately not
// built, because a doctor adding a genuinely new medicine mid-consult is
// rare, and getting a medicine-id linkage wrong is not a risk worth taking
// for a rare case. Anmol's own call: "restrict medicine addition... from
// practice page while offline, we just need to build core features
// survivable, not a full offline HMS." Offline consult-SAVING (the common,
// high-value case) is the one that's actually built — see
// lib/db/intelligence.ts's "consult.saveConsult" write handler.
// ---------------------------------------------------------------------------

export class RequiresConnectionError extends Error {
    constructor(action: string) {
        super(`${action} needs an internet connection — try again once you're back online.`);
        this.name = "RequiresConnectionError";
    }
}

/** Throws if this device is offline right now. Call at the top of any
 *  action deliberately kept online-only (see this file's header) — never
 *  for a read, and never for a write that already has an offline queue. */
export function requireOnlineFor(action: string): void {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
        throw new RequiresConnectionError(action);
    }
}
