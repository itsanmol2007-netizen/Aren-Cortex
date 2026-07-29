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
// ── WHERE THIS SHOULD LIVE (flagged, not invented) ────────────────────────
// There is no table for it. `hospital_medicine_preference` is clinic-scoped and
// brand-level, which is a different claim. Rather than invent a schema, pins
// persist to localStorage under the doctor's id — which does deliver "pinned
// whenever it comes up again" on the machine they work at, and loses nothing
// but portability. A `doctor_pinned_intent (doctor_id, intent_id)` table would
// make it follow them between machines; this hook is the single read/write
// point, so that swap is contained here.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useState } from "react";

const KEY = (doctorId: string) => `aren.cortex.pinned.${doctorId}`;

function read(doctorId: string): Set<number> {
    try {
        const raw = window.localStorage.getItem(KEY(doctorId));
        if (!raw) return new Set();
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? new Set(parsed.filter((n) => typeof n === "number")) : new Set();
    } catch {
        // A corrupt or unavailable store must cost the doctor their shortcuts,
        // never their consultation.
        return new Set();
    }
}

export interface PinnedMedicines {
    /** intent ids this doctor has pinned */
    pinned: Set<number>;
    isPinned: (intentId: number) => boolean;
    toggle: (intentId: number) => void;
}

export function usePinnedMedicines(doctorId: string | null): PinnedMedicines {
    const [pinned, setPinned] = useState<Set<number>>(new Set());

    useEffect(() => {
        setPinned(doctorId ? read(doctorId) : new Set());
    }, [doctorId]);

    const toggle = useCallback((intentId: number) => {
        setPinned((curr) => {
            const next = new Set(curr);
            if (next.has(intentId)) next.delete(intentId);
            else next.add(intentId);
            if (doctorId) {
                try {
                    window.localStorage.setItem(KEY(doctorId), JSON.stringify([...next]));
                } catch {
                    // Non-fatal: the pin still applies for this session.
                }
            }
            return next;
        });
    }, [doctorId]);

    const isPinned = useCallback((intentId: number) => pinned.has(intentId), [pinned]);

    return { pinned, isPinned, toggle };
}
