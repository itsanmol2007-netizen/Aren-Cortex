// ---------------------------------------------------------------------------
// The WebAuthn convenience unlock — Windows Hello / Touch ID / Android's
// biometric prompt, the same one Chrome already shows for a saved password.
// Layered ON TOP OF the PIN, never instead of it: nothing here can be set up
// without a PIN already existing, and the PIN keeps working regardless of
// whether this is registered, available, or supported on this device at all.
//
// The mechanism, concretely: the WebAuthn "large blob" extension lets a
// platform authenticator store and later return an arbitrary blob tied to a
// credential, gated by its own biometric/PIN ceremony — no server round trip
// needed, because the point is not to authenticate to AREN a second time,
// it's to ask THIS DEVICE'S OWN sensor to gate reading a secret that is
// already sitting locally. This app stores the DEK itself as that blob:
// register once, and every later `get()` that passes the platform's
// biometric check hands the DEK straight back.
//
// `largeBlob` support is real but inconsistent across browsers/platforms —
// this is written to fail closed and invisible where it isn't supported,
// never to half-work. `isWebAuthnUnlockAvailable` is the single source of
// truth for whether to even show the option; nothing else guesses.
// ---------------------------------------------------------------------------

import { localDB } from "../offline/db";
import { importDek } from "./crypto";
import { setActiveDek } from "./deviceKey";

const credentialMetaKey = (userId: string) => `webauthn.credentialId.${userId}`;

function toBase64Url(bytes: ArrayBuffer): string {
    let binary = "";
    const view = new Uint8Array(bytes);
    for (let i = 0; i < view.length; i++) binary += String.fromCharCode(view[i]);
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(b64url: string): Uint8Array {
    const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(b64url.length / 4) * 4, "=");
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
}

async function platformAuthenticatorPresent(): Promise<boolean> {
    if (typeof window === "undefined" || !window.PublicKeyCredential) return false;
    try {
        return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    } catch {
        return false;
    }
}

/** Whether the fast-unlock button should even be offered: the platform has
 *  a biometric/PIN authenticator AND this doctor has already registered one
 *  on this exact device (registration itself is what confirms `largeBlob`
 *  is actually supported here — see `registerWebAuthnUnlock`). */
export async function isWebAuthnUnlockAvailable(userId: string): Promise<boolean> {
    if (!(await platformAuthenticatorPresent())) return false;
    const row = await localDB.meta.get(credentialMetaKey(userId));
    return !!row?.value;
}

/** Registers a fresh platform credential for this doctor and immediately
 *  writes the DEK into its large blob. Two ceremonies (one biometric prompt
 *  each) — `create()` establishes the credential and asks for large-blob
 *  SUPPORT, `get()` right after is the only step the spec allows an actual
 *  WRITE from. Call this once, from Settings' App Lock card, right after a
 *  PIN is set up or confirmed (so the DEK is already sitting in memory).
 *  Returns false (not a throw) for "this device can't do this" — a doctor
 *  on unsupported hardware should see the option simply not appear, not an
 *  error dialog. */
export async function registerWebAuthnUnlock(userId: string, dekRawBytes: ArrayBuffer): Promise<boolean> {
    if (!(await platformAuthenticatorPresent())) return false;
    if (typeof window === "undefined" || !window.PublicKeyCredential) return false;

    try {
        const challenge = crypto.getRandomValues(new Uint8Array(32));
        const created = (await navigator.credentials.create({
            publicKey: {
                challenge,
                rp: { name: "AREN Cortex" },
                user: {
                    id: new TextEncoder().encode(userId),
                    name: userId,
                    displayName: "AREN Cortex device unlock",
                },
                pubKeyCredParams: [
                    { type: "public-key", alg: -7 }, // ES256
                    { type: "public-key", alg: -257 }, // RS256, older Windows Hello
                ],
                authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required" },
                extensions: { largeBlob: { support: "required" } } as AuthenticationExtensionsClientInputs,
                timeout: 60_000,
            },
        })) as PublicKeyCredential | null;
        if (!created) return false;

        const supportsLargeBlob = (
            created.getClientExtensionResults() as { largeBlob?: { supported?: boolean } }
        ).largeBlob?.supported;
        if (!supportsLargeBlob) return false;

        // The write itself needs a `get()` ceremony, immediately after —
        // the user sees two prompts back-to-back, which is the spec's own
        // shape for this, not a bug in how this is called.
        const written = (await navigator.credentials.get({
            publicKey: {
                challenge: crypto.getRandomValues(new Uint8Array(32)),
                allowCredentials: [{ id: created.rawId, type: "public-key" }],
                userVerification: "required",
                extensions: { largeBlob: { write: dekRawBytes } } as AuthenticationExtensionsClientInputs,
                timeout: 60_000,
            },
        })) as PublicKeyCredential | null;
        const wrote = (written?.getClientExtensionResults() as { largeBlob?: { written?: boolean } } | undefined)
            ?.largeBlob?.written;
        if (!wrote) return false;

        await localDB.meta.put({ key: credentialMetaKey(userId), value: toBase64Url(created.rawId) });
        return true;
    } catch {
        return false;
    }
}

/** The unlock itself: one biometric prompt, and on success the DEK comes
 *  straight back out of the credential's large blob — no PIN typed, no
 *  network call. Returns false for any failure (wrong finger, cancelled,
 *  hardware error) so the caller falls back to the PIN pad without
 *  needing to distinguish why. */
export async function unlockWithWebAuthn(userId: string): Promise<boolean> {
    const row = await localDB.meta.get(credentialMetaKey(userId));
    const credentialId = row?.value as string | undefined;
    if (!credentialId) return false;

    try {
        const assertion = (await navigator.credentials.get({
            publicKey: {
                challenge: crypto.getRandomValues(new Uint8Array(32)),
                allowCredentials: [{ id: fromBase64Url(credentialId).buffer as ArrayBuffer, type: "public-key" }],
                userVerification: "required",
                extensions: { largeBlob: { read: true } } as AuthenticationExtensionsClientInputs,
                timeout: 60_000,
            },
        })) as PublicKeyCredential | null;
        if (!assertion) return false;

        const blob = (assertion.getClientExtensionResults() as { largeBlob?: { blob?: ArrayBuffer } }).largeBlob
            ?.blob;
        if (!blob) return false;

        const dek = await importDek(toBase64Std(blob));
        setActiveDek(userId, dek);
        return true;
    } catch {
        return false;
    }
}

// `importDek` (crypto.ts) takes standard base64, not base64url — this file's
// own encoding is url-safe (credential ids can end up in places standard
// base64's `+`/`/` would be awkward), so the two are kept explicitly
// distinct rather than assuming a caller remembers which is which.
function toBase64Std(bytes: ArrayBuffer): string {
    let binary = "";
    const view = new Uint8Array(bytes);
    for (let i = 0; i < view.length; i++) binary += String.fromCharCode(view[i]);
    return btoa(binary);
}
