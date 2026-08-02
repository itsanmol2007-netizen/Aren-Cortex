// ---------------------------------------------------------------------------
// Pinned medicines — the doctor's own shortcut.
//
// The heart on a recommendation row is a toggle the doctor sets. A pinned
// composition is lifted to the top of the recommendations every time it is
// ranked again, in every future consultation.
//
// Two properties keep this honest:
//
//  * It reorders what is SHOWN; it never touches a score. The rank bar beside a
//    pinned row still draws the engine's real reading, so a pin cannot disguise
//    weak evidence — it only saves the doctor a scroll.
//  * It is scoped to one doctor. A pin is a personal shortcut, not a clinic
//    policy; the clinic-wide equivalent already exists and is a different,
//    declared thing (`clinic_brand_default`).
//
// Persisted to `doctor_pinned_intent (doctor_id, intent_id)`, so it follows
// the doctor between machines. This hook is the single read/write point;
// `loadPinnedIntents` / `setPinnedIntent` in `lib/db/synapse.ts` are its only
// DB access. On a fallback (non-real) identity there is no `doctors` row to
// key a pin on, so pins are in-memory only for that session — same as before.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useState } from "react";
import { loadPinnedIntents, setPinnedIntent } from "../../lib/db/synapse";

export interface PinnedMedicines {
    /** intent ids this doctor has pinned */
    pinned: Set<number>;
    isPinned: (intentId: number) => boolean;
    toggle: (intentId: number) => void;
}

export function usePinnedMedicines(doctorId: string | null, hospitalId: string | null): PinnedMedicines {
    const [pinned, setPinned] = useState<Set<number>>(new Set());

    useEffect(() => {
        if (!doctorId) {
            setPinned(new Set());
            return;
        }
        let cancelled = false;
        loadPinnedIntents(doctorId)
            .then((ids) => {
                if (!cancelled) setPinned(ids);
            })
            .catch(() => {
                // A failed load must cost the doctor their shortcuts this
                // session, never their consultation.
            });
        return () => {
            cancelled = true;
        };
    }, [doctorId]);

    const toggle = useCallback((intentId: number) => {
        setPinned((curr) => {
            const nowPinned = !curr.has(intentId);
            const next = new Set(curr);
            if (nowPinned) next.add(intentId);
            else next.delete(intentId);

            if (doctorId && hospitalId) {
                setPinnedIntent({ doctorId, hospitalId, intentId, pinned: nowPinned }).catch(() => {
                    // Non-fatal: the pin still applies for this session.
                });
            }
            return next;
        });
    }, [doctorId, hospitalId]);

    const isPinned = useCallback((intentId: number) => pinned.has(intentId), [pinned]);

    return { pinned, isPinned, toggle };
}
