import { useCallback, useEffect, useRef, useState } from "react";
import { fetchDoctorRequests, acknowledgeDoctorRequest, subscribeDoctorRequests } from "@/lib/db";
import type { DoctorRequest } from "../types/frontdesk";
import { useOnline } from "../operational/useOnline";

// Live doctor requests from the real `doctor_requests` table. Polls every 25s
// while online (mirroring the queue cadence). If the table doesn't exist yet in
// this environment, the very first response says so and polling stops for the
// session — no error spam, and it lights up automatically once the table is
// created. A gentle chime marks genuinely new arrivals (never the first load).

// One two-note chime (§9 — the only sound in the product). Web Audio, no asset;
// silently no-ops where AudioContext is unavailable or a gesture hasn't happened.
function playChime() {
    try {
        const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctx) return;
        const ctx = new Ctx();
        [660, 880].forEach((freq, i) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = "sine";
            osc.frequency.value = freq;
            const start = ctx.currentTime + i * 0.14;
            gain.gain.setValueAtTime(0, start);
            gain.gain.linearRampToValueAtTime(0.06, start + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.22);
            osc.connect(gain).connect(ctx.destination);
            osc.start(start);
            osc.stop(start + 0.24);
        });
        setTimeout(() => ctx.close(), 700);
    } catch {
        /* audio blocked (e.g. no user gesture yet) — silently skip */
    }
}

export function useDoctorRequests(hospitalId: string | null): {
    requests: DoctorRequest[];
    acknowledge: (id: string) => Promise<void>;
} {
    const online = useOnline();
    const [requests, setRequests] = useState<DoctorRequest[]>([]);
    const unavailable = useRef(false); // table missing — stop trying this session
    const loadedOnce = useRef(false);
    const knownIds = useRef<Set<string>>(new Set());
    const reducedMotion = useRef(
        typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    );

    useEffect(() => {
        if (unavailable.current || !online || !hospitalId) return;
        let cancelled = false;

        const load = async () => {
            const { rows, unavailable: missing } = await fetchDoctorRequests(hospitalId);
            if (cancelled) return;
            if (missing) {
                unavailable.current = true;
                return;
            }
            const mapped: DoctorRequest[] = rows.map((r) => ({
                id: r.id,
                doctor_name: r.doctor_name ?? "Doctor",
                text: r.message ?? "",
                created_at: r.created_at ? Date.parse(r.created_at) : Date.now(),
            }));
            const hasNew = mapped.some((m) => !knownIds.current.has(m.id));
            if (loadedOnce.current && hasNew && !reducedMotion.current) playChime();
            knownIds.current = new Set(mapped.map((m) => m.id));
            loadedOnce.current = true;
            setRequests(mapped);
        };

        void load();
        // Realtime: refresh the instant a request is inserted/updated/deleted
        // for this hospital. Polling stays on as a safety net (missed events,
        // dropped socket). Both call the same loader.
        const unsubscribe = subscribeDoctorRequests(hospitalId, () => {
            void load();
        });
        const id = setInterval(load, 25_000);
        return () => {
            cancelled = true;
            clearInterval(id);
            unsubscribe();
        };
    }, [hospitalId, online]);

    const acknowledge = useCallback(async (id: string) => {
        // Optimistic: drop it immediately; the DB update is best-effort.
        setRequests((r) => r.filter((x) => x.id !== id));
        knownIds.current.delete(id);
        try {
            await acknowledgeDoctorRequest(id);
        } catch {
            /* non-fatal — the row simply re-appears on the next poll if it failed */
        }
    }, []);

    return { requests, acknowledge };
}
