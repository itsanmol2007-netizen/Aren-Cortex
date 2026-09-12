// ---------------------------------------------------------------------------
// The Device Encryption Key's lifecycle: generate it once, wrap it under a
// PIN, hold it in memory only while unlocked, and never let it touch disk in
// unwrapped form.
//
// Scoped PER DOCTOR, not per device — "one doctor's data should generally
// not be seen by another doctor" (Anmol) applies just as much to a shared
// office machine as to the local cache itself. Every stored key is keyed by
// `doctorId`, and only one doctor's DEK is ever held in memory at a time —
// this app is single-session-per-tab, so that is never a real constraint,
// only a safety rail against a bug ever mixing two doctors' keys.
//
// What a PIN actually buys here: NOT resistance against someone who has
// pulled the wrapped blob off disk and has unlimited time — a 4-digit PIN
// is 10,000 guesses, and PBKDF2 at 250k iterations only slows that down, it
// does not stop it. What it buys is a real gate on the one scenario this
// exists for: someone who has physical access to an unattended, signed-in
// browser tab and no other way in. That is the same threat model as a phone
// lock screen, and this is sized to match it, not oversold as more.
// ---------------------------------------------------------------------------

import { localDB } from "../offline/db";
import {
    generateDEK, wrapDekWithPin, unwrapDekWithPin, exportDek, importDek, type WrappedKey,
} from "./crypto";
import { escrowStore, escrowRetrieve } from "./escrow";

const metaKey = (doctorId: string) => `pin.wrappedDek.${doctorId}`;
const escrowSyncKey = (doctorId: string) => `pin.escrowSyncedAt.${doctorId}`;

// The one DEK held in memory at any moment — cleared on lock, on sign-out,
// and never written anywhere durable. A page reload always starts with this
// empty, which is the correct default: "locked" is the resting state, same
// as a phone that was rebooted.
let active: { doctorId: string; dek: CryptoKey } | null = null;

type Listener = (unlocked: boolean) => void;
const listeners = new Set<Listener>();
function notify() {
    for (const l of listeners) l(active !== null);
}

/** Subscribe to lock/unlock transitions. Returns an unsubscribe function —
 *  the same shape as every other listener API in this codebase
 *  (`watchThisDeviceRevocation`, `onAuthStateChange`). */
export function onLockStateChange(cb: Listener): () => void {
    listeners.add(cb);
    return () => listeners.delete(cb);
}

export function isUnlockedFor(doctorId: string): boolean {
    return active?.doctorId === doctorId;
}

/** The live key, for callers that already know they're unlocked (the local
 *  mirror's encrypt/decrypt helpers — see offline/db.ts). Returns `null`
 *  rather than throwing: every caller already has to handle "not unlocked
 *  yet" as a real state, not an exceptional one. */
export function getActiveDek(doctorId: string): CryptoKey | null {
    return active?.doctorId === doctorId ? active.dek : null;
}

/** Adopts an already-obtained DEK directly, bypassing the PIN unwrap —
 *  the WebAuthn convenience path's own way in (`webauthn.ts`'s
 *  `unlockWithWebAuthn`, which gets the DEK back out of a large-blob read
 *  rather than an AES-KW unwrap). Not exported for general use: every
 *  other caller should go through `unlockWithPin` or
 *  `recoverPinFromEscrow`, which is what keeps "how did this device get
 *  unlocked" auditable to exactly two real paths plus this one explicit
 *  exception. */
export function setActiveDek(doctorId: string, dek: CryptoKey): void {
    active = { doctorId, dek };
    notify();
}

export function lockNow(): void {
    if (!active) return;
    active = null;
    notify();
}

export async function hasPinConfigured(doctorId: string): Promise<boolean> {
    const row = await localDB.meta.get(metaKey(doctorId));
    return !!row?.value;
}

/** First-time setup: mints a brand new DEK, wraps it under this PIN, and
 *  best-effort escrows a copy server-side so a later forgotten PIN has
 *  something to recover from. The escrow call failing does NOT fail setup —
 *  the PIN still works for this device today — but it does mean recovery
 *  isn't backed up yet, which the caller should surface (see the Settings
 *  card this backs), not swallow silently. */
export async function setupPin(doctorId: string, pin: string): Promise<{ escrowed: boolean }> {
    const dek = await generateDEK();
    const wrapped = await wrapDekWithPin(dek, pin);
    await localDB.meta.put({ key: metaKey(doctorId), value: wrapped });
    active = { doctorId, dek };
    notify();

    try {
        await escrowStore(await exportDek(dek));
        await localDB.meta.put({ key: escrowSyncKey(doctorId), value: Date.now() });
        return { escrowed: true };
    } catch {
        return { escrowed: false };
    }
}

/** Attempts to unlock with a typed PIN. `false` on a wrong PIN (AES-KW's
 *  own integrity check fails the unwrap) — never throws for that ordinary
 *  case, only for something genuinely unexpected (storage unavailable). */
export async function unlockWithPin(doctorId: string, pin: string): Promise<boolean> {
    const row = await localDB.meta.get(metaKey(doctorId));
    if (!row?.value) return false;
    try {
        const dek = await unwrapDekWithPin(row.value as WrappedKey, pin);
        active = { doctorId, dek };
        notify();
        return true;
    } catch {
        return false;
    }
}

/** Changing a known PIN (Settings, not the forgot-PIN recovery flow below).
 *  Re-verifies the old PIN by actually unwrapping with it — never trusts a
 *  caller's own "yes this was correct" without redoing the crypto. */
export async function changePin(doctorId: string, oldPin: string, newPin: string): Promise<boolean> {
    const row = await localDB.meta.get(metaKey(doctorId));
    if (!row?.value) return false;
    let dek: CryptoKey;
    try {
        dek = await unwrapDekWithPin(row.value as WrappedKey, oldPin);
    } catch {
        return false;
    }
    const wrapped = await wrapDekWithPin(dek, newPin);
    await localDB.meta.put({ key: metaKey(doctorId), value: wrapped });
    active = { doctorId, dek };
    notify();
    try {
        await escrowStore(await exportDek(dek));
        await localDB.meta.put({ key: escrowSyncKey(doctorId), value: Date.now() });
    } catch {
        /* refresh is best-effort; the PIN change itself already succeeded */
    }
    return true;
}

/** The forgotten-PIN path: called only after a fresh password
 *  re-authentication (the caller — the "Forgot PIN" flow — is what
 *  guarantees that; this function does not itself check anything about
 *  session freshness beyond having a live session at all, since
 *  `escrowRetrieve`'s edge function is where that's actually enforced).
 *  Retrieves the escrowed DEK, sets a NEW PIN over it, and never touches
 *  the local mirror's already-cached rows — same DEK, so they decrypt
 *  exactly as before. */
export async function recoverPinFromEscrow(doctorId: string, newPin: string): Promise<void> {
    const rawDek = await escrowRetrieve();
    const dek = await importDek(rawDek);
    const wrapped = await wrapDekWithPin(dek, newPin);
    await localDB.meta.put({ key: metaKey(doctorId), value: wrapped });
    active = { doctorId, dek };
    notify();
}

/** True once this device has ever successfully escrowed a copy for this
 *  doctor — the Settings card and the "Forgot PIN" screen both use this to
 *  say plainly whether recovery is actually available, rather than letting
 *  a doctor discover a missing safety net only at the moment they need it. */
export async function hasEscrowBackup(doctorId: string): Promise<boolean> {
    const row = await localDB.meta.get(escrowSyncKey(doctorId));
    return !!row?.value;
}
