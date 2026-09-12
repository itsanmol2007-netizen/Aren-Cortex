// ---------------------------------------------------------------------------
// The durable write queue. Generalizes the pattern already proven in
// `useVisitActions.ts`'s `createNewVisit` (optimistic UI update, background
// attempt, one-shot `online` listener on failure) into something that
// survives a reload — the one real gap in that pattern today: a receptionist
// who registers a patient offline and then closes the tab (or the tab
// crashes, or the OS reclaims it) loses the pending write entirely, because
// it only ever lived in a JS closure.
//
// The fix is a level of indirection: a durable row in IndexedDB (`kind` +
// a plain-JSON `payload`) plus a small in-memory REGISTRY mapping `kind` to
// the actual handler function. A handler can't be serialized, so it's
// re-registered every time the module that owns it loads — normal module
// side effects, not something a caller has to remember to do per write.
//
// Call `enqueueWrite` at the exact point `createNewVisit` used to fire its
// background `attempt()`. It queues durably, then tries immediately; on
// failure while offline it simply waits — `flushQueue` re-drives every
// pending row the moment connectivity returns (an `online` listener here,
// same as before, but now replaying from durable storage instead of a
// closure, so a reload in between changes nothing).
// ---------------------------------------------------------------------------

import { localDB, type WriteQueueRow } from "./db";
import { markConfirmedOnline } from "./connectivityClock";
import { guardNewPatientCreation } from "./lockGate";

type WriteHandler = (payload: unknown) => Promise<void>;

const handlers = new Map<string, WriteHandler>();

/** Register the function that replays a queued write of this `kind`. Call at
 *  module load (top level, not inside a component) — e.g. once from
 *  `useVisitActions.ts` for `"frontdesk.createVisit"`. Registering the same
 *  kind twice is fine (a hot reload re-registering) and just replaces it. */
export function registerWriteHandler(kind: string, handler: WriteHandler): void {
    handlers.set(kind, handler);
}

export interface EnqueueOpts {
    hospitalId: string;
    doctorId?: string | null;
    /** Set true for a write that creates a new patient/visit — gated by the
     *  72-hour lock. Reads and updates to already-existing records are not. */
    isNewPatientCreation?: boolean;
}

/** Queue a write durably, then attempt it right away. Returns the local
 *  queue row id (never sent anywhere — purely so a caller could look the row
 *  up again, e.g. to show "still pending" in a UI). Throws `OfflineLockError`
 *  synchronously, before anything is written to the queue, if this is a
 *  new-patient-creation write and the device has been unreachable 72+ hours —
 *  callers should catch that the same way they catch any other validation
 *  failure and surface it, not swallow it as a generic network error. */
export async function enqueueWrite(
    kind: string,
    payload: unknown,
    opts: EnqueueOpts
): Promise<number> {
    if (opts.isNewPatientCreation) guardNewPatientCreation();

    const row: WriteQueueRow = {
        kind,
        payload,
        hospitalId: opts.hospitalId,
        doctorId: opts.doctorId ?? null,
        createdAt: Date.now(),
        attempts: 0,
        lastError: null,
        lastAttemptAt: null,
        status: "pending",
    };
    const id = await localDB.writeQueue.add(row);
    // Fire-and-forget: the caller already has its own optimistic UI update in
    // place (see useVisitActions.ts) and does not wait on this.
    void flushQueue();
    // Dexie types the key as `number | undefined` because `WriteQueueRow.id`
    // is optional (unset until the auto-increment assigns one) — a
    // successful `add()` always resolves with the real assigned key.
    return id as number;
}

let flushing = false;

/** Replays every pending row, in the order it was queued. Safe to call as
 *  often as you like (app boot, the `online` event, a periodic safety-net
 *  timer) — re-entrant calls collapse into the one already running. A row
 *  that fails is left in place (with its error recorded) and the loop moves
 *  on to the next one; queued writes are independent of each other, exactly
 *  like `createNewVisit`'s own bundled patient+visit+observations attempt
 *  was already independent of any other visit being registered. */
export async function flushQueue(): Promise<void> {
    if (flushing) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) return;
    flushing = true;
    try {
        const pending = await localDB.writeQueue
            .where("status")
            .anyOf(["pending", "failed"])
            .sortBy("createdAt");

        for (const row of pending) {
            if (row.id == null) continue;
            const handler = handlers.get(row.kind);
            if (!handler) {
                // A kind with no registered handler means the module that owns
                // it hasn't loaded yet this session (e.g. flushed from a boot
                // effect before the front desk feature has mounted) — leave it
                // for the next flush rather than losing it.
                continue;
            }
            await localDB.writeQueue.update(row.id, { status: "sending" });
            try {
                await handler(row.payload);
                await localDB.writeQueue.delete(row.id);
                markConfirmedOnline();
            } catch (err) {
                const offlineNow = typeof navigator !== "undefined" && !navigator.onLine;
                await localDB.writeQueue.update(row.id, {
                    status: offlineNow ? "pending" : "failed",
                    attempts: row.attempts + 1,
                    lastError: err instanceof Error ? err.message : String(err),
                    lastAttemptAt: Date.now(),
                });
                if (offlineNow) {
                    // Connectivity dropped mid-flush — stop here, the `online`
                    // listener below will pick the rest up.
                    break;
                }
                // A real (non-network) rejection on one row must not block the
                // rest of the queue — keep going.
            }
        }
    } finally {
        flushing = false;
    }
}

export async function pendingWriteCount(): Promise<number> {
    return localDB.writeQueue.where("status").anyOf(["pending", "failed", "sending"]).count();
}

let listenersWired = false;

/** Wires the reconnect-driven flush and a periodic safety net. Call once, at
 *  app start, alongside `initConnectivityClock`. */
export function initWriteQueue(): void {
    if (listenersWired) return;
    listenersWired = true;
    if (typeof window === "undefined") return;
    window.addEventListener("online", () => void flushQueue());
    void flushQueue();
    // Safety net: `online`/`offline` events are not perfectly reliable on
    // every platform, and a row can also fail for reasons unrelated to
    // connectivity (a transient 500) — retry periodically regardless.
    window.setInterval(() => void flushQueue(), 2 * 60 * 1000);
}
