// ---------------------------------------------------------------------------
// Low-level Web Crypto primitives for the PIN lock. Nothing here knows about
// PINs, doctors, or IndexedDB — it only knows AES-GCM and PBKDF2. Keeping this
// file dumb makes the actual key-handling policy (deviceKey.ts) the only
// place that can get the interesting decisions wrong.
//
// Algorithm choices, and why:
//   - AES-256-GCM for the Device Encryption Key (DEK) itself, and for every
//     row it encrypts — authenticated encryption, so a tampered ciphertext
//     fails to decrypt rather than silently returning garbage.
//   - PBKDF2-SHA256, 250,000 iterations, to turn a 4-digit PIN (13.3 bits of
//     entropy — worth naming plainly, not oversold) into a wrapping key. This
//     does not make a 4-digit PIN strong against a fast offline attacker with
//     the wrapped blob in hand; it raises the cost of trying each of the
//     10,000 possible PINs from "instant" to "a deliberate few hundred
//     milliseconds," which is the same trade every phone lock screen makes.
//     The PIN is a convenience gate on a device already trusted enough to run
//     the app, not the system's only defense — see deviceKey.ts's own note.
//   - AES-KW (RFC 3394 key wrap) to wrap the DEK itself, since it's a KEY
//     being protected, not a document — matches what the Web Crypto spec's
//     wrapKey/unwrapKey pair is actually for.
// ---------------------------------------------------------------------------

const PBKDF2_ITERATIONS = 250_000;

export type WrappedKey = {
    /** base64 */ wrapped: string;
    /** base64, 16 random bytes — public, not secret; only makes the PBKDF2
     *  derivation unique per device even if two doctors share a PIN. */
    salt: string;
};

export type Ciphertext = {
    /** base64 */ iv: string;
    /** base64 */ data: string;
};

function toBase64(bytes: ArrayBuffer | ArrayBufferView): string {
    let binary = "";
    const view = bytes instanceof Uint8Array ? bytes : new Uint8Array("buffer" in bytes ? bytes.buffer : bytes);
    for (let i = 0; i < view.length; i++) binary += String.fromCharCode(view[i]);
    return btoa(binary);
}

function fromBase64(b64: string): ArrayBuffer {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
}

export function randomBytes(n: number): Uint8Array {
    return crypto.getRandomValues(new Uint8Array(n));
}

/** A fresh 256-bit AES-GCM key — the Device Encryption Key itself.
 *  `extractable: true` is required: a key that could never be exported could
 *  never be wrapped, and the whole point of this key is that it survives in
 *  wrapped form under two different locks (see deviceKey.ts). */
export async function generateDEK(): Promise<CryptoKey> {
    return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
}

/** Re-derives the same wrapping key from the same (PIN, salt) pair every
 *  time — deliberately not randomized, since unwrapping later requires
 *  reproducing exactly this key from just the PIN typed in. */
async function deriveWrappingKey(pin: string, saltB64: string): Promise<CryptoKey> {
    const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, [
        "deriveKey",
    ]);
    return crypto.subtle.deriveKey(
        { name: "PBKDF2", salt: fromBase64(saltB64), iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
        material,
        { name: "AES-KW", length: 256 },
        false,
        ["wrapKey", "unwrapKey"]
    );
}

/** Wraps the DEK under a key derived from this PIN, with a fresh random
 *  salt. Call this once at PIN setup and again on every PIN change — never
 *  reuse a salt across a changed PIN, or the old wrapped blob and the new
 *  one would double as an oracle for each other. */
export async function wrapDekWithPin(dek: CryptoKey, pin: string): Promise<WrappedKey> {
    const salt = randomBytes(16);
    const saltB64 = toBase64(salt);
    const wrappingKey = await deriveWrappingKey(pin, saltB64);
    const wrapped = await crypto.subtle.wrapKey("raw", dek, wrappingKey, "AES-KW");
    return { wrapped: toBase64(wrapped), salt: saltB64 };
}

/** The inverse of `wrapDekWithPin`. Throws (via `subtle.unwrapKey`
 *  rejecting) on a wrong PIN — AES-KW's own integrity check catches it,
 *  there is no separate "verify the PIN" step to get out of sync with the
 *  real unwrap. */
export async function unwrapDekWithPin(wrapped: WrappedKey, pin: string): Promise<CryptoKey> {
    const wrappingKey = await deriveWrappingKey(pin, wrapped.salt);
    return crypto.subtle.unwrapKey(
        "raw",
        fromBase64(wrapped.wrapped),
        wrappingKey,
        "AES-KW",
        { name: "AES-GCM", length: 256 },
        true,
        ["encrypt", "decrypt"]
    );
}

/** Exports the DEK to raw bytes, base64-encoded — the ONLY reason this
 *  exists is to hand the DEK to the escrow edge function over the
 *  authenticated HTTPS channel at PIN setup/change time (see
 *  deviceKey.ts's `syncEscrow`), and to accept it back from that same
 *  function during "forgot PIN" recovery. Never persisted client-side in
 *  this form — the wrapped forms above are what touch storage. */
/** Raw key bytes, for the one in-memory hand-off that needs them as bytes
 *  rather than base64 — the WebAuthn large-blob write (see
 *  `lib/security/webauthn.ts`), which the browser's own API expects as a
 *  `BufferSource`, not a string. */
export async function exportDekBytes(dek: CryptoKey): Promise<ArrayBuffer> {
    return crypto.subtle.exportKey("raw", dek);
}

export async function exportDek(dek: CryptoKey): Promise<string> {
    return toBase64(await exportDekBytes(dek));
}

export async function importDek(raw: string): Promise<CryptoKey> {
    return crypto.subtle.importKey("raw", fromBase64(raw), { name: "AES-GCM", length: 256 }, true, [
        "encrypt",
        "decrypt",
    ]);
}

/** Encrypts a JS value with the DEK. A fresh random IV every call — GCM's
 *  one hard rule is never reusing an (key, IV) pair, so the IV travels
 *  alongside the ciphertext rather than being derived from anything
 *  reused. */
export async function encryptJSON(dek: CryptoKey, value: unknown): Promise<Ciphertext> {
    const iv = randomBytes(12);
    const plaintext = new TextEncoder().encode(JSON.stringify(value));
    const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource }, dek, plaintext);
    return { iv: toBase64(iv), data: toBase64(data) };
}

export async function decryptJSON<T = unknown>(dek: CryptoKey, ct: Ciphertext): Promise<T> {
    const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64(ct.iv) }, dek, fromBase64(ct.data));
    return JSON.parse(new TextDecoder().decode(plaintext)) as T;
}
