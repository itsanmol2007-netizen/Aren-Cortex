import { useEffect } from "react";
import { updateDoctorLastSeen } from "../lib/db";

// Presence heartbeat for the doctor's workspace: while Cortex is open, write
// `last_seen` once immediately (on login/mount) and then every ~30 seconds, so
// reception's Doctors card shows the doctor as genuinely Online. Best-effort —
// an offline or RLS-blocked beat is swallowed and the next one recovers — and
// the interval is torn down on unmount/logout so nothing leaks.
export function useDoctorHeartbeat(doctorId: string | null): void {
    useEffect(() => {
        if (!doctorId) return;
        let cancelled = false;
        const beat = () => {
            updateDoctorLastSeen(doctorId).catch(() => {
                /* offline / RLS — the next beat recovers presence */
            });
        };
        beat(); // immediate, so presence lights up the moment the doctor lands
        const id = setInterval(() => {
            if (!cancelled) beat();
        }, 30_000);
        return () => {
            cancelled = true;
            clearInterval(id);
        };
    }, [doctorId]);
}
