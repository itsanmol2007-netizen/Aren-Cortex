import { useRef, useState } from "react";
import { Bell, Check } from "lucide-react";
import { toast } from "sonner";
import type { DoctorRequest } from "../types/frontdesk";
import { useT } from "../i18n/i18n";

// No doctor_requests table exists yet (per architecture doc, this is a
// "future communication bridge" — nothing to persist to). Session-only
// simulate/acknowledge, mirroring the HTML prototype's mock behaviour.
const POOL = [
    { doctor: "Dr Amit Sharma", text: "Send next patient" },
    { doctor: "Dr Amit Sharma", text: "Need previous file" },
    { doctor: "Dr Amit Sharma", text: "Need wheelchair" },
];

// One gentle two-note chime on request arrival (§9 — the only sound in the
// product). Built with Web Audio so there is no asset to load; silently no-ops
// where AudioContext is unavailable.
function playChime() {
    try {
        const Ctx = window.AudioContext ?? (window as any).webkitAudioContext;
        if (!Ctx) return;
        const ctx = new Ctx();
        const notes = [660, 880];
        notes.forEach((freq, i) => {
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

export function DoctorRequestsCard() {
    const t = useT();
    const [requests, setRequests] = useState<DoctorRequest[]>([]);
    const prefersReducedMotion = useRef(
        typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    );

    const simulate = () => {
        const pick = POOL[Math.floor(Math.random() * POOL.length)];
        setRequests((r) => [{ id: `${Date.now()}`, doctor_name: pick.doctor, text: pick.text, created_at: Date.now() }, ...r]);
        if (!prefersReducedMotion.current) playChime();
    };

    const ack = (id: string) => {
        setRequests((r) => r.filter((x) => x.id !== id));
        toast(t("toastAck"));
    };

    const active = requests.length > 0;

    return (
        <div
            className={`relative shrink-0 overflow-hidden rounded-[13px] border bg-white p-4 pt-[18px] shadow-[0_1px_2px_rgba(20,30,50,0.05)] ${active ? "border-[#e4e7ee] border-l-2 border-l-[#c9791a] bg-[rgba(224,145,32,0.03)]" : "border-[#e4e7ee]"
                }`}
        >
            <div className="absolute inset-x-0 top-0 h-px bg-white/60" />
            <h3 className="m-0 mb-3 flex items-center gap-[7px] text-[14px] font-bold text-[#161d29]">
                <Bell size={15} className="text-[#7c5cf0]" />
                {t("requestsTitle")}
            </h3>

            {!active && (
                <div className="flex flex-col items-center py-2 pb-4 text-center">
                    <div className="mb-[9px] flex h-11 w-11 items-center justify-center rounded-full bg-[#f4f1fe] text-[#9d8df1]">
                        <Bell size={19} />
                    </div>
                    <p className="m-0 text-[13px] font-semibold text-[#374151]">{t("noRequests")}</p>
                    <p className="m-0 mt-[2px] text-[11.5px] text-[#a8aeba]">{t("requestsSub")}</p>
                </div>
            )}

            {requests.map((r) => (
                <div
                    key={r.id}
                    className="aren-rise aren-pulse mb-2 flex items-center gap-[11px] rounded-[9px] border border-[#fbeed9] bg-[rgba(224,145,32,0.06)] p-[11px_12px]"
                >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#fbeed9] text-[#c9791a]">
                        <Bell size={16} />
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="text-[11px] font-semibold text-[#8a91a0]">{r.doctor_name}</div>
                        <div className="mt-[1px] text-[13px] font-semibold text-[#161d29]">{r.text}</div>
                    </div>
                    <button
                        onClick={() => ack(r.id)}
                        aria-label={t("toastAck")}
                        className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg border border-[#e4e7ee] bg-white text-[#1c8a4d] transition-colors hover:bg-[#e4f5eb] focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_rgba(99,102,241,0.28)]"
                    >
                        <Check size={15} />
                    </button>
                </div>
            ))}

            <button
                onClick={simulate}
                className="mt-1 w-full rounded-[7px] border border-dashed border-[#d5dae4] bg-transparent p-2 text-[11px] font-semibold text-[#a8aeba] transition-colors hover:bg-[#f5f6f9] hover:text-[#5a6472]"
            >
                {t("simulate")}
            </button>
        </div>
    );
}
