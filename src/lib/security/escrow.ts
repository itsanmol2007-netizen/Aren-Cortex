// ---------------------------------------------------------------------------
// The client side of key escrow — the other half of "forgetting the PIN
// never means wiping the local cache" (Anmol's own design, formalized).
//
// The DEK is wrapped two independent ways (see deviceKey.ts): once locally
// under the PIN, and once here, under a key only the `device-key-escrow`
// edge function holds. This module is the seam between them — it never sees
// the server's wrapping key, only ever a plain HTTPS call authenticated by
// the doctor's own Supabase session, exactly like `messaging.ts`'s
// `invokeSend`.
//
// `store` runs at PIN setup and every PIN change — a refresh, not a rotation
// of the escrow itself; the server-side wrap is free to reuse its own key
// across calls since it never leaves the server. `retrieve` runs only from
// the "Forgot PIN" flow, and only after a fresh, live re-authentication —
// there is no path to it from an already-unlocked session, because an
// already-unlocked session already has the DEK in memory and has no reason
// to ask the server for it again.
// ---------------------------------------------------------------------------

import { supabase } from "../supabase";
import { thisDeviceKey } from "../db/devices";

type EscrowResponse<T> = { ok: true } & T | { ok: false; message?: string };

async function invoke<T>(action: "store" | "retrieve", body: Record<string, unknown>): Promise<T> {
    const { data, error } = await supabase.functions.invoke("device-key-escrow", {
        body: { action, deviceKey: thisDeviceKey(), ...body },
    });
    if (error) {
        let message = "Could not reach the recovery service. Try again in a moment.";
        try {
            const b = await (error as { context?: Response }).context?.json?.();
            if (b && typeof b.message === "string") message = b.message;
        } catch {
            /* keep the generic message */
        }
        throw new Error(message);
    }
    const res = data as EscrowResponse<T>;
    if (!res || res.ok !== true) {
        throw new Error((res as { message?: string })?.message || "Recovery request was refused.");
    }
    return res as T;
}

/** Sends the DEK, over this authenticated session, for the edge function to
 *  wrap under its own server-only key and persist against (this account,
 *  this device). Best-effort from the caller's point of view — see
 *  deviceKey.ts's own note on why a failure here degrades to "no recovery
 *  possible from this device yet" rather than blocking PIN setup. */
export async function escrowStore(dek: string): Promise<void> {
    await invoke<Record<string, never>>("store", { dek });
}

/** Retrieves and unwraps the escrowed DEK for THIS device. Only ever called
 *  right after a fresh password re-authentication — the edge function
 *  re-checks that independently (the request carries the doctor's current
 *  session token) and additionally refuses a device this account has
 *  revoked, even if the token is otherwise valid. */
export async function escrowRetrieve(): Promise<string> {
    const res = await invoke<{ dek: string }>("retrieve", {});
    return res.dek;
}
