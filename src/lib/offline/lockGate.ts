// ---------------------------------------------------------------------------
// The 72-hour lock itself. A B2B licensing friction, not a security feature —
// see the founder discussion this codifies: the point is to make running
// this software indefinitely with zero connection to AREN's own server a
// deliberate, structural inconvenience, not to withstand a determined
// reverse-engineer. A JS-only mechanism never can; this one is honest about
// that and still meaningfully harder to casually patch out than a single
// `if (locked) return` would be, because it is checked independently at
// three unrelated seams rather than from one place the UI happens to call:
//
//   1. `guardNewPatientCreation` — the write-queue enqueue path
//      (writeQueue.ts), before a create-kind write is even accepted locally.
//   2. `guardSynapseRanking` — `useConsultIntelligence`'s own engine-run
//      memo, a completely different module with no import relationship to
//      the queue.
//   3. `guardWhatsAppSend` — `messaging.ts`'s single `invokeSend` seam.
//
// Reading already-cached data is NEVER gated here — that is the entire point
// of the local mirror existing. Nothing in this file ever deletes, hides, or
// refuses to render data already on the device.
//
// A stronger version — the one actually worth building next — replaces
// `getLockLevel()` with a server-issued, asymmetrically-signed, time-boxed
// token: the public key ships in the build, the private key never leaves
// AREN's server, and the client can verify the token with
// `crypto.subtle.verify()` but never mint or extend one itself. That closes
// the gap this file is honest about (a device's own clock and storage are,
// in the end, its own to falsify) without pretending this pass already did.
// ---------------------------------------------------------------------------

import { getLockLevel } from "./connectivityClock";

export class OfflineLockError extends Error {
    constructor(action: string) {
        super(
            `${action} is paused — this device hasn't reached the AREN server in over 72 hours. ` +
                "Reconnect to the internet to continue; everything already saved here is still fully readable."
        );
        this.name = "OfflineLockError";
    }
}

export function isHardLocked(): boolean {
    return getLockLevel() === "hard72";
}

/** Registering a brand new patient (or a new visit for one) while the device
 *  has not reached the server in 72+ hours. Called from the write queue's
 *  `enqueueWrite`, before anything is even queued locally. */
export function guardNewPatientCreation(): void {
    if (isHardLocked()) throw new OfflineLockError("Creating a new patient");
}

/** Synapse's ranking. Called from `useConsultIntelligence`, independently of
 *  the write-queue guard above — a doctor mid-consult on cached data for an
 *  EXISTING patient still hits this the moment they'd get a fresh ranking. */
export function guardSynapseRanking(): void {
    if (isHardLocked()) throw new OfflineLockError("Synapse ranking");
}

/** A new outbound WhatsApp send (prescription or follow-up). Called from
 *  `messaging.ts`'s `invokeSend`, the one seam every send already goes
 *  through. */
export function guardWhatsAppSend(): void {
    if (isHardLocked()) throw new OfflineLockError("Sending WhatsApp messages");
}
